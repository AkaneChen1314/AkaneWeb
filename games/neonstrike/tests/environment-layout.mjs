import assert from 'node:assert/strict';
import { createHarness, THREE } from './test-harness.mjs';

// Inspect the shipped map rather than rebuilding a parallel list of placements.
const harness=createHarness();
harness.run('createArena();scene.updateMatrixWorld(true);');
const scene=harness.run('scene'),worldRoots=Array.from(harness.run('worldMeshes'));
const meshes=[];scene.traverse(object=>{if(object.isMesh)meshes.push(object);});
const close=(actual,expected,label,tolerance=.001)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} != ${expected}`);
const cases=[];const test=(name,run)=>cases.push({name,run});

function boundsOf(mesh){
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
}
function descendsFrom(object,ancestor){for(let node=object;node;node=node.parent)if(node===ancestor)return true;return false;}
function touches(a,b,tolerance=.045){return a.clone().expandByScalar(tolerance).intersectsBox(b);}
function overlapArea(a,b){return Math.max(0,Math.min(a.max.x,b.max.x)-Math.max(a.min.x,b.min.x))*Math.max(0,Math.min(a.max.z,b.max.z)-Math.max(a.min.z,b.min.z));}
const physicalMeshes=new Set();
for(const root of worldRoots){
  if(root.isMesh)physicalMeshes.add(root);
  else root.traverse(object=>{if(object.isMesh)physicalMeshes.add(object);});
}

test('every elevated freight container rests on aligned lower containers',()=>{
  const containers=meshes.filter(mesh=>mesh.userData.container===true);
  assert.ok(containers.length>=9,'the complete harbor should retain its freight yards');
  assert.ok(containers.some(mesh=>boundsOf(mesh).min.y>2),'stacked freight silhouettes are retained');
  for(const container of containers){
    const bounds=boundsOf(container),bottom=bounds.min.y;
    assert.ok(bottom>=-.025,'freight bodies cannot sink beneath the ground');
    if(bottom<=.025)continue;
    const supports=containers.filter(other=>other!==container&&Math.abs(boundsOf(other).max.y-bottom)<.025);
    assert.ok(supports.length,`floating container at ${container.position.toArray()}`);
    // Sample corners as well as the middle: a tiny overlapping corner is not a stack.
    for(const u of [.01,.5,.99])for(const v of [.01,.5,.99]){
      const point=new THREE.Vector3(
        THREE.MathUtils.lerp(container.geometry.boundingBox.min.x,container.geometry.boundingBox.max.x,u),
        container.geometry.boundingBox.min.y,
        THREE.MathUtils.lerp(container.geometry.boundingBox.min.z,container.geometry.boundingBox.max.z,v)
      ).applyMatrix4(container.matrixWorld);
      assert.ok(supports.some(support=>{
        const local=point.clone().applyMatrix4(support.matrixWorld.clone().invert()),box=support.geometry.boundingBox;
        return local.x>=box.min.x-.025&&local.x<=box.max.x+.025&&local.z>=box.min.z-.025&&local.z<=box.max.z+.025;
      }),`unsupported freight footprint at ${point.toArray()}`);
    }
  }
});

test('zone signs have connected visible mounting hardware, with no isolated floating support pieces',()=>{
  const signs=[];scene.traverse(object=>{if(object.userData.zoneSign)signs.push(object);});
  assert.equal(signs.length,9,'each tactical district retains its own sign');
  for(const sign of signs){
    const mount=sign.getObjectByName('sign-mount');assert.ok(mount,`${sign.name} has no mount`);
    const support=[];mount.traverse(object=>{if(object.isMesh&&object.userData.signSupport)support.push(object);});
    assert.ok(support.length,`${sign.name} has no physical support geometry`);
    const frame=sign.children.find(object=>object.isMesh&&object.geometry?.type==='BoxGeometry'&&!object.userData.signSupport);
    assert.ok(frame,`${sign.name} has no solid sign frame`);
    const reached=new Set(),connectedBounds=[boundsOf(frame)];
    for(let pass=0;pass<support.length;pass++)for(const part of support){
      if(reached.has(part))continue;
      const bounds=boundsOf(part);
      if(connectedBounds.some(existing=>touches(existing,bounds))){reached.add(part);connectedBounds.push(bounds);}
    }
    assert.equal(reached.size,support.length,`${sign.name} has a disconnected bracket or post`);
  }
});

test('sign mounts contact the ground or their actual supporting structure',()=>{
  const signs=[];scene.traverse(object=>{if(object.userData.zoneSign)signs.push(object);});
  const mountKinds=new Set();
  for(const sign of signs){
    const mount=sign.getObjectByName('sign-mount');assert.ok(mount);
    const kind=mount.userData.mountType??sign.userData.mountType;
    const anchorY=mount.userData.anchorY??sign.userData.anchorY;
    assert.ok(['posts','wall','suspended','roof'].includes(kind),`${sign.name} lacks a defined mounting method`);
    assert.ok(Number.isFinite(anchorY),`${sign.name} lacks an anchor height`);mountKinds.add(kind);
    const support=[];mount.traverse(object=>{if(object.isMesh&&object.userData.signSupport)support.push(boundsOf(object));});
    // Wall brackets anchor sideways; their attachment is checked against real
    // wall geometry below rather than an unrelated horizontal height plane.
    if(kind!=='wall')assert.ok(support.some(box=>anchorY>=box.min.y-.05&&anchorY<=box.max.y+.05),`${sign.name} stops short of its anchor`);
    if(kind==='posts'){
      assert.ok(support.some(box=>Math.abs(box.min.y)<.05),`${sign.name} posts do not reach ground level`);
    }else{
      const anchors=[...physicalMeshes].filter(mesh=>!descendsFrom(mesh,sign)&&mesh.geometry?.type!=='PlaneGeometry').map(boundsOf);
      assert.ok(support.some(box=>anchors.some(anchor=>touches(box,anchor))),`${sign.name} has mounting hardware but no structure behind it`);
    }
  }
  assert.ok(mountKinds.size>=2,'wall and freestanding signs should use appropriate mounting styles');
});

test('maintenance fans are backed by the service wall instead of hanging beyond its end',()=>{
  const fans=[];scene.traverse(object=>{if(object.name==='service-fan')fans.push(object);});
  assert.equal(fans.length,2);
  for(const fan of fans){
    const origin=fan.getWorldPosition(new THREE.Vector3());
    const walls=[...physicalMeshes].filter(mesh=>{
      if(descendsFrom(mesh,fan))return false;
      const bounds=boundsOf(mesh),size=bounds.getSize(new THREE.Vector3());
      return size.y>=4&&size.z>=10;
    });
    const ray=new THREE.Raycaster(origin,new THREE.Vector3(-1,0,0),.01,.4);
    const hit=ray.intersectObjects(walls,false)[0];
    assert.ok(hit,`fan at ${origin.toArray()} has no wall within mounting distance`);
    const backing=boundsOf(hit.object);
    assert.ok(origin.z-.72>backing.min.z&&origin.z+.72<backing.max.z,'the complete fan fits on the wall');
  }
});

test('dry-dock deck plates sit on the hull and retain substantial supported area',()=>{
  const plates=meshes.filter(mesh=>{
    const p=mesh.geometry?.parameters;
    return mesh.geometry?.type==='BoxGeometry'&&p.width===5.2&&p.height===.16&&p.depth===2.8;
  });
  assert.equal(plates.length,3);
  for(const plate of plates){
    const box=boundsOf(plate),area=(box.max.x-box.min.x)*(box.max.z-box.min.z);
    const supports=[...physicalMeshes].filter(mesh=>mesh!==plate).map(boundsOf).filter(other=>Math.abs(other.max.y-box.min.y)<.025);
    assert.ok(supports.some(other=>overlapArea(box,other)>area*.7),`deck plate at ${plate.position.toArray()} is unsupported`);
  }
});

test('western breaker wall caps touch their walls instead of levitating above them',()=>{
  const walls=meshes.filter(mesh=>{
    const p=mesh.geometry?.parameters;
    return mesh.geometry?.type==='BoxGeometry'&&mesh.position.x<-50&&p.depth===.6&&p.width>=6&&p.height>=2;
  });
  assert.equal(walls.length,5);
  for(const wall of walls){
    const caps=meshes.filter(mesh=>mesh!==wall&&Math.abs(mesh.position.x-wall.position.x)<.01&&Math.abs(mesh.position.z-wall.position.z)<.01&&mesh.geometry?.parameters?.height===.12);
    assert.ok(caps.length,`wall at ${wall.position.toArray()} has no attached cap`);
    assert.ok(caps.some(cap=>touches(boundsOf(cap),boundsOf(wall),.025)),`wall cap at ${wall.position.toArray()} floats above its support`);
  }
});

test('navigation markings remain flat on the ground and do not become floating signs',()=>{
  const markings=meshes.filter(mesh=>mesh.name==='harbor-wayfinding');
  assert.ok(markings.length,'the map needs readable ground wayfinding');
  for(const marking of markings){
    const box=boundsOf(marking);close(box.min.y,.034,'ground marking lower height');close(box.max.y,.034,'ground marking upper height');
    const normal=new THREE.Vector3(0,0,1).transformDirection(marking.matrixWorld);
    assert.ok(normal.y>.999,'ground markings must face upward');
  }
});

test('supply cases rest on grounded pads and stay anchored as their indicators animate',()=>{
  harness.run('createPickups();scene.updateMatrixWorld(true);');
  const pickups=Array.from(harness.run('pickups'));
  assert.equal(pickups.length,16);
  const initial=pickups.map(item=>({y:item.root.position.y,rotation:item.model.rotation.clone()}));
  for(const item of pickups){
    const pad=item.root.children.find(object=>object.isMesh&&object.geometry?.type==='CylinderGeometry');
    assert.ok(pad,`${item.type} lacks a supply pad`);
    close(boundsOf(pad).min.y,0,`${item.type} pad touches the ground`);
    const modelBounds=new THREE.Box3().setFromObject(item.model);
    close(modelBounds.min.y,boundsOf(pad).max.y,`${item.type} case rests on the pad`);
  }
  harness.run('updatePickups(.5,2000);updatePickups(.5,3500);scene.updateMatrixWorld(true);');
  pickups.forEach((item,index)=>{
    close(item.root.position.y,initial[index].y,`${item.type} cannot bob above the floor`);
    close(item.model.rotation.y,initial[index].rotation.y,`${item.type} remains placed on its pad`);
  });
});

let passed=0;
for(const item of cases){try{item.run();passed++;console.log(`PASS ${item.name}`);}catch(error){console.error(`FAIL ${item.name}`);throw error;}}
console.log(`\n${passed}/${cases.length} environment layout checks passed.`);

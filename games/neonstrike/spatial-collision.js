// Shared narrow-phase tests. Box3 bounds remain the cheap broad phase used by the map.
export function orientCollider(box,x,y,z,sx,sy,sz,rotation=0){
  box.shape={kind:'box',x,y,z,hx:sx/2,hy:sy/2,hz:sz/2,cos:Math.cos(rotation),sin:Math.sin(rotation)};
  return box;
}

export function roundCollider(box,x,z,radius){
  box.shape={kind:'cylinder',x,z,radius};return box;
}

export function bodyOverlapsCollider(box,x,z,radius,feet=-Infinity,head=Infinity){
  if(box.max.y<=feet||box.min.y>=head||x+radius<=box.min.x||x-radius>=box.max.x||z+radius<=box.min.z||z-radius>=box.max.z)return false;
  const s=box.shape;
  if(s?.kind==='cylinder')return Math.hypot(x-s.x,z-s.z)<s.radius+radius;
  let px=x,pz=z,minX=box.min.x,maxX=box.max.x,minZ=box.min.z,maxZ=box.max.z;
  if(s?.kind==='box'){
    const dx=x-s.x,dz=z-s.z;px=dx*s.cos-dz*s.sin;pz=dx*s.sin+dz*s.cos;
    minX=-s.hx;maxX=s.hx;minZ=-s.hz;maxZ=s.hz;
  }
  const dx=px-Math.max(minX,Math.min(maxX,px)),dz=pz-Math.max(minZ,Math.min(maxZ,pz));
  return dx*dx+dz*dz<radius*radius;
}

function slabSweep(position,delta,min,max,radius){
  let enter=0,exit=1,normal=null,inside=true,escape=null,depth=Infinity;
  for(const axis of ['x','y','z']){
    const lo=min[axis]-radius,hi=max[axis]+radius,p=position[axis],d=delta[axis];
    if(p<=lo+1e-8||p>=hi-1e-8)inside=false;
    for(const [distance,sign] of [[p-lo,-1],[hi-p,1]])if(distance<depth){depth=distance;escape={x:0,y:0,z:0};escape[axis]=sign;}
    if(Math.abs(d)<1e-10){if(p<lo||p>hi)return null;continue;}
    let near=(lo-p)/d,far=(hi-p)/d;const sign=d>0?-1:1;
    if(near>far)[near,far]=[far,near];
    if(near>=enter){enter=near;normal={x:0,y:0,z:0};normal[axis]=sign;}
    exit=Math.min(exit,far);if(enter>exit)return null;
  }
  if(inside)return {time:0,normal:escape,penetration:depth+.0003};
  if(enter<0||enter>1||exit<0||!normal)return null;
  if(delta.x*normal.x+delta.y*normal.y+delta.z*normal.z>=-1e-10)return null;
  return {time:enter,normal};
}

function cylinderSweep(position,delta,box,radius){
  const s=box.shape,dx=position.x-s.x,dz=position.z-s.z,r=s.radius+radius;
  const lo=box.min.y-radius,hi=box.max.y+radius,radial=Math.hypot(dx,dz);
  if(radial<r-1e-8&&position.y>lo+1e-8&&position.y<hi-1e-8){
    const side=r-radial,bottom=position.y-lo,top=hi-position.y;
    if(side<bottom&&side<top)return {time:0,normal:{x:radial?dx/radial:1,y:0,z:radial?dz/radial:0},penetration:side+.0003};
    return {time:0,normal:{x:0,y:bottom<top?-1:1,z:0},penetration:Math.min(bottom,top)+.0003};
  }
  let enter=0,exit=1,normal=null;
  const a=delta.x**2+delta.z**2,b=2*(dx*delta.x+dz*delta.z),c=dx*dx+dz*dz-r*r;
  if(a<1e-12){if(c>0)return null;}
  else{
    const disc=b*b-4*a*c;if(disc<0)return null;
    const near=(-b-Math.sqrt(disc))/(2*a),far=(-b+Math.sqrt(disc))/(2*a);
    if(near>=enter){enter=near;const x=dx+delta.x*near,z=dz+delta.z*near;normal={x:x/r,y:0,z:z/r};}
    exit=Math.min(exit,far);
  }
  if(Math.abs(delta.y)<1e-10){if(position.y<lo||position.y>hi)return null;}
  else{
    let near=(lo-position.y)/delta.y,far=(hi-position.y)/delta.y;
    if(near>far)[near,far]=[far,near];
    if(near>=enter){enter=near;normal={x:0,y:delta.y>0?-1:1,z:0};}exit=Math.min(exit,far);
  }
  if(enter>exit||enter<0||enter>1||exit<0||!normal)return null;
  if(delta.x*normal.x+delta.y*normal.y+delta.z*normal.z>=-1e-10)return null;
  return {time:enter,normal};
}

export function sweepSphereCollider(position,delta,box,radius=0){
  for(const axis of ['x','y','z'])if(Math.max(position[axis],position[axis]+delta[axis])<box.min[axis]-radius||Math.min(position[axis],position[axis]+delta[axis])>box.max[axis]+radius)return null;
  const s=box.shape;let hit;
  if(s?.kind==='cylinder')hit=cylinderSweep(position,delta,box,radius);
  else if(s?.kind==='box'){
    const x=position.x-s.x,z=position.z-s.z;
    hit=slabSweep({x:x*s.cos-z*s.sin,y:position.y-s.y,z:x*s.sin+z*s.cos},
      {x:delta.x*s.cos-delta.z*s.sin,y:delta.y,z:delta.x*s.sin+delta.z*s.cos},
      {x:-s.hx,y:-s.hy,z:-s.hz},{x:s.hx,y:s.hy,z:s.hz},radius);
    if(hit){const n=hit.normal;hit.normal={x:n.x*s.cos+n.z*s.sin,y:n.y,z:-n.x*s.sin+n.z*s.cos};}
  }else hit=slabSweep(position,delta,box.min,box.max,radius);
  return hit?{...hit,box}:null;
}

export function sphereSupportedBy(box,position,radius){
  return bodyOverlapsCollider(box,position.x,position.z,radius)&&Math.abs(position.y-box.max.y-radius)<.005;
}

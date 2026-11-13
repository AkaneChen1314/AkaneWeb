/*
 * 檔案導讀：地圖細節區塊（v8 DISTRICTS）：在原本空曠的區域加入可進入的倉庫、貨櫃堆場、
 * 龍門吊、沙包陣地、水泥護欄、車輛、路燈光暈與地面標線。
 *
 * 效能重點：同材質的靜態零件會合併成一個 Mesh（少量繪製呼叫）；可擋子彈的牆與純裝飾分開，
 * 裝飾不參與射線測試；重複小物件（沙包、護欄、油桶）使用 InstancedMesh。
 * 碰撞仍逐塊登記到 collisionBoxes，玩家、敵人導航與子彈使用同一份資料。
 * 直接匯入 Three.js 並只用「THREE.名稱」存取，打包時才能去除用不到的部分。
 */
import * as THREE from "./vendor/three.module.min.js";
import { bodyOverlapsCollider } from "./spatial-collision.js";

// Box mapping in world units keeps texture density equal on long merged walls.
function applyWorldUV(geometry, tile) {
  const pos = geometry.attributes.position,
    normal = geometry.attributes.normal,
    uv = geometry.attributes.uv;
  if (!uv) return;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(normal.getX(i)),
      ny = Math.abs(normal.getY(i)),
      nz = Math.abs(normal.getZ(i));
    const x = pos.getX(i),
      y = pos.getY(i),
      z = pos.getZ(i);
    if (ny >= nx && ny >= nz) uv.setXY(i, x / tile, z / tile);
    else if (nx >= nz) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, y / tile);
  }
}

function mergeGeometries(items, tile) {
  let vertices = 0,
    indices = 0;
  const prepared = items.map(({ geometry, transform }) => {
    const clone = geometry.clone();
    clone.applyMatrix4(transform);
    if (tile) applyWorldUV(clone, tile);
    const count = clone.attributes.position.count;
    const index = clone.index
      ? clone.index.array
      : Array.from({ length: count }, (_, i) => i);
    vertices += count;
    indices += index.length;
    return { clone, index };
  });
  const pos = new Float32Array(vertices * 3),
    nor = new Float32Array(vertices * 3),
    uvs = new Float32Array(vertices * 2),
    idx = vertices > 65535 ? new Uint32Array(indices) : new Uint16Array(indices);
  let v = 0,
    k = 0;
  for (const { clone, index } of prepared) {
    const p = clone.attributes.position,
      n = clone.attributes.normal,
      t = clone.attributes.uv;
    pos.set(p.array, v * 3);
    nor.set(n.array, v * 3);
    if (t) uvs.set(t.array, v * 2);
    for (let i = 0; i < index.length; i++) idx[k++] = index[i] + v;
    v += p.count;
    clone.dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  merged.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeBoundingSphere();
  merged.computeBoundingBox();
  return merged;
}

function materialKey(material) {
  return [
    material.type,
    material.color?.getHex(),
    material.emissive?.getHex(),
    material.emissiveIntensity,
    material.roughness,
    material.metalness,
    material.map?.uuid,
    material.bumpMap?.uuid,
    material.bumpScale,
    material.side,
    material.opacity,
    material.toneMapped,
    material.vertexColors,
    material.flatShading,
    material.depthWrite,
    material.depthTest,
    material.polygonOffset,
    material.fog,
  ].join(",");
}

/**
 * 靜態合批：地圖建好後，把同材質、同一 37 公尺區塊內的獨立小物件合併成一個 Mesh，
 * 大幅減少每幀（含陰影）的繪製呼叫。只處理場景最上層、沒有名稱、子物件或特殊資料的
 * 不透明 Mesh；會擋子彈的物件合併後仍加入 worldMeshes。回傳合併前後的數量。
 */
export function batchStaticMeshes({ scene, objects, worldMeshes, tile = 37 }) {
  const solid = new Set(worldMeshes),
    buckets = new Map(),
    center = new THREE.Vector3();
  for (const mesh of objects) {
    if (
      !mesh.isMesh ||
      mesh.isInstancedMesh ||
      mesh.isSkinnedMesh ||
      mesh.parent !== scene ||
      mesh.children.length ||
      mesh.name ||
      !mesh.visible ||
      Object.keys(mesh.userData).length ||
      mesh.layers.mask !== 1
    )
      continue;
    const material = mesh.material,
      geometry = mesh.geometry;
    if (
      !material ||
      Array.isArray(material) ||
      material.transparent ||
      material.blending !== THREE.NormalBlending ||
      !(material.isMeshStandardMaterial || material.isMeshBasicMaterial) ||
      !geometry.attributes.position ||
      !geometry.attributes.normal ||
      !geometry.attributes.uv ||
      geometry.attributes.position.isInterleavedBufferAttribute
    )
      continue;
    mesh.updateMatrixWorld(true);
    if (!geometry.boundingSphere) geometry.computeBoundingSphere();
    center.copy(geometry.boundingSphere.center).applyMatrix4(mesh.matrixWorld);
    const cell = `${Math.floor((center.x + 80) / tile)}:${Math.floor((center.z + 80) / tile)}`,
      key = `${materialKey(material)}|${mesh.castShadow}|${mesh.receiveShadow}|${solid.has(mesh)}|${cell}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(mesh);
  }
  let before = 0,
    after = 0;
  const removed = new Set();
  for (const meshes of buckets.values()) {
    if (meshes.length < 2) continue;
    const merged = new THREE.Mesh(
      mergeGeometries(
        meshes.map((mesh) => ({
          geometry: mesh.geometry,
          transform: mesh.matrixWorld,
        })),
      ),
      meshes[0].material,
    );
    merged.name = "static-batch";
    merged.castShadow = meshes[0].castShadow;
    merged.receiveShadow = meshes[0].receiveShadow;
    merged.matrixAutoUpdate = false;
    merged.updateMatrix();
    scene.add(merged);
    if (solid.has(meshes[0])) worldMeshes.push(merged);
    for (const mesh of meshes) {
      scene.remove(mesh);
      removed.add(mesh);
    }
    before += meshes.length;
    after++;
  }
  if (removed.size) {
    for (let i = worldMeshes.length - 1; i >= 0; i--)
      if (removed.has(worldMeshes[i])) worldMeshes.splice(i, 1);
    // Free GPU buffers that nothing on screen uses any more.
    const live = new Set();
    scene.traverse((object) => {
      if (object.geometry) live.add(object.geometry);
      for (const material of Array.isArray(object.material)
        ? object.material
        : [object.material])
        if (material) live.add(material);
    });
    for (const mesh of removed) {
      if (!live.has(mesh.geometry)) mesh.geometry.dispose();
      if (!live.has(mesh.material)) mesh.material.dispose();
    }
  }
  return { before, after };
}

/**
 * 極小零件（螺栓、補給模型細節等）的陰影在 2048 陰影貼圖上幾乎看不見，
 * 卻讓每次陰影更新多出上百個繪製呼叫，因此關閉它們的投影。
 */
export function trimTinyShadowCasters(objects, minRadius = 0.25) {
  const sphere = new THREE.Sphere();
  let trimmed = 0;
  for (const root of objects)
    root.traverse((object) => {
      if (!object.isMesh || !object.castShadow) return;
      const geometry = object.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      object.updateWorldMatrix(true, false);
      sphere.copy(geometry.boundingSphere).applyMatrix4(object.matrixWorld);
      // Instanced parts are sized by one instance, not by the whole batch.
      if (sphere.radius < minRadius) {
        object.castShadow = false;
        trimmed++;
      }
    });
  return trimmed;
}

export function createDistrictBuilder(ctx) {
  const materials = new Map();
  const batches = [];
  // Every visible part, so finish() can seal the ones nothing stops you in.
  const parts = [];
  const record = (part) => {
    parts.push(part);
    ctx.debugParts?.push(part);
  };
  const instanced = new Map();
  const paints = [];
  const lights = [];
  const pools = [];
  const matrix = new THREE.Matrix4(),
    quaternion = new THREE.Quaternion(),
    unitScale = new THREE.Vector3(1, 1, 1),
    position = new THREE.Vector3(),
    euler = new THREE.Euler();

  function standard(key, color, roughness = 0.72, metalness = 0.1, extra = {}) {
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra }),
      );
    return materials.get(key);
  }
  function glow(key, color, opacity = 1) {
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshBasicMaterial({
          color,
          transparent: opacity < 1,
          opacity,
          toneMapped: false,
        }),
      );
    return materials.get(key);
  }

  /** A named group of static parts merged per material when finished. */
  class Batch {
    constructor(name) {
      this.name = name;
      this.buckets = new Map();
      batches.push(this);
    }
    push(geometry, material, transform, solid, shadow) {
      const key = `${material.uuid}|${solid ? "s" : "d"}|${shadow ? "c" : "n"}`;
      if (!this.buckets.has(key))
        this.buckets.set(key, { material, solid, shadow, items: [] });
      this.buckets
        .get(key)
        .items.push({ geometry, transform: transform.clone() });
    }
    /** Axis box rotated about Y. collide=false → decor (no collider, no ray tests). */
    box(x, y, z, sx, sy, sz, material, options = {}) {
      const rot = options.rot || 0,
        collide = options.collide !== false;
      quaternion.setFromEuler(euler.set(0, rot, 0));
      matrix.compose(position.set(x, y, z), quaternion, unitScale);
      this.push(
        new THREE.BoxGeometry(sx, sy, sz),
        material,
        matrix,
        options.solid ?? collide,
        options.shadow !== false,
      );
      if (collide) ctx.registerCollisionBox(x, y, z, sx, sy, sz, rot);
      record({
        shape: "box",
        batch: this.name,
        x,
        y,
        z,
        sx,
        sy,
        sz,
        rot,
        collide,
        visibleSolid: !material.transparent && material.visible !== false,
      });
    }
    /** Vertical cylinder; collide adds a round collider. axis "x"/"z" lays it down (decor). */
    cylinder(x, y, z, radius, height, material, options = {}) {
      const segments = options.segments ?? 12,
        axis = options.axis || "y",
        collide = options.collide !== false && axis === "y";
      euler.set(
        axis === "z" ? Math.PI / 2 : 0,
        options.rot || 0,
        axis === "x" ? Math.PI / 2 : 0,
        "YXZ",
      );
      quaternion.setFromEuler(euler);
      euler.order = "XYZ";
      matrix.compose(position.set(x, y, z), quaternion, unitScale);
      this.push(
        new THREE.CylinderGeometry(
          options.top ?? radius,
          radius,
          height,
          segments,
          1,
          options.open === true,
          options.thetaStart ?? 0,
          options.thetaLength ?? Math.PI * 2,
        ),
        material,
        matrix,
        options.solid ?? (collide || options.solid === true),
        options.shadow !== false,
      );
      record({
        shape: "cylinder",
        batch: this.name,
        axis,
        x,
        y,
        z,
        radius: Math.max(radius, options.top ?? radius),
        height,
        rot: options.rot || 0,
        collide: collide || options.collideAlong === true,
        visibleSolid: !material.transparent && options.open !== true,
      });
      // Lying pipes and rollers get an oriented box along their axis.
      if (options.collideAlong && axis !== "y") {
        const rot = (options.rot || 0) + (axis === "z" ? Math.PI / 2 : 0);
        ctx.registerCollisionBox(x, y, z, height, radius * 2, radius * 2, rot);
      }
      if (collide) {
        const r = options.colliderRadius ?? radius;
        ctx.collisionBoxes.push(
          ctx.roundCollider(
            new THREE.Box3(
              new THREE.Vector3(x - r, y - height / 2, z - r),
              new THREE.Vector3(x + r, y + height / 2, z + r),
            ),
            x,
            z,
            r,
          ),
        );
      }
    }
    /** Arbitrary decor geometry with a full transform. */
    shape(geometry, material, transform, options = {}) {
      this.push(
        geometry,
        material,
        transform,
        options.solid === true,
        options.shadow !== false,
      );
    }
  }

  function instance(key, geometryFactory, material, options = {}) {
    if (!instanced.has(key))
      instanced.set(key, {
        geometry: geometryFactory(),
        material,
        transforms: [],
        colors: [],
        solid: options.solid === true,
        shadow: options.shadow !== false,
      });
    return instanced.get(key);
  }
  function addInstance(key, transform, color) {
    const entry = instanced.get(key);
    entry.transforms.push(transform.clone());
    entry.colors.push(color ?? null);
  }

  /** Local frame helper: rotate (lx, lz) about Y by rot, then offset. */
  function frame(ox, oz, rot = 0) {
    const cos = Math.cos(rot),
      sin = Math.sin(rot);
    return {
      rot,
      x: (lx, lz) => ox + lx * cos + lz * sin,
      z: (lx, lz) => oz - lx * sin + lz * cos,
    };
  }

  function collider(x, y, z, sx, sy, sz, rot = 0) {
    ctx.registerCollisionBox(x, y, z, sx, sy, sz, rot);
  }
  function roundCollider(x, z, radius, y0, y1) {
    ctx.collisionBoxes.push(
      ctx.roundCollider(
        new THREE.Box3(
          new THREE.Vector3(x - radius, y0, z - radius),
          new THREE.Vector3(x + radius, y1, z + radius),
        ),
        x,
        z,
        radius,
      ),
    );
  }
  /**
   * Climbable ladder. (climbX, climbZ) is where the climber's body hangs,
   * (nx, nz) points away from the structure, and (exitX, exitZ) is where the
   * player steps off at height `top`.
   */
  function ladder(spec) {
    ctx.ladders?.push({ bottom: 0, ...spec });
  }
  function light(x, y, z, color, intensity, distance) {
    lights.push({ x, y, z, color, intensity, distance });
  }
  function pool(x, z, radius, color, strength = 1) {
    pools.push({ x, z, radius, color, strength });
  }
  function paint(draw) {
    paints.push(draw);
  }

  // 自動補碰撞：看得到、會擋子彈的零件，若內部沒有任何碰撞就補上同形狀的碰撞，
  // 避免「看得到卻穿得過」。細桿、梯級、肋條、玻璃等細小裝飾不處理。
  function samplePoints(part) {
    const points = [];
    if (part.shape === "box") {
      const c = Math.cos(part.rot),
        s = Math.sin(part.rot);
      for (const u of [-0.3, 0, 0.3])
        for (const v of [-0.3, 0, 0.3])
          for (const w of [-0.3, 0, 0.3]) {
            const lx = u * part.sx,
              lz = w * part.sz;
            points.push([part.x + lx * c + lz * s, part.y + v * part.sy, part.z - lx * s + lz * c]);
          }
    } else if (part.axis === "y") {
      for (const v of [-0.3, 0, 0.3]) {
        points.push([part.x, part.y + v * part.height, part.z]);
        for (const a of [0, 1.57, 3.14, 4.71])
          points.push([part.x + Math.cos(a) * part.radius * 0.5, part.y + v * part.height, part.z + Math.sin(a) * part.radius * 0.5]);
      }
    } else {
      const rot = part.rot + (part.axis === "z" ? Math.PI / 2 : 0),
        c = Math.cos(rot),
        s = Math.sin(rot);
      for (const u of [-0.4, -0.2, 0, 0.2, 0.4])
        points.push([part.x + u * part.height * c, part.y, part.z - u * part.height * s]);
    }
    return points;
  }
  function sealUncoveredParts() {
    const cell = 4,
      grid = new Map(),
      key = (i, j) => i * 4096 + j;
    for (const box of ctx.collisionBoxes)
      for (let i = Math.floor(box.min.x / cell); i <= Math.floor(box.max.x / cell); i++)
        for (let j = Math.floor(box.min.z / cell); j <= Math.floor(box.max.z / cell); j++) {
          const k = key(i, j);
          if (!grid.has(k)) grid.set(k, []);
          grid.get(k).push(box);
        }
    const covered = (x, y, z) =>
      (grid.get(key(Math.floor(x / cell), Math.floor(z / cell))) || []).some((box) =>
        bodyOverlapsCollider(box, x, z, 0.03, y - 0.03, y + 0.03),
      );
    let sealed = 0;
    for (const part of parts) {
      if (part.collide || !part.visibleSolid) continue;
      if (part.shape === "box") {
        const dims = [part.sx, part.sy, part.sz].sort((a, b) => b - a);
        if (dims[2] < 0.05 || dims[1] < 0.2) continue;
      } else if (part.radius < 0.1) continue;
      let open = 0,
        count = 0;
      for (const [x, y, z] of samplePoints(part)) {
        if (Math.max(Math.abs(x), Math.abs(z)) > 73) continue;
        count++;
        if (!covered(x, y, z)) open++;
      }
      if (!count || open < Math.max(2, count * 0.3)) continue;
      if (part.shape === "box")
        ctx.registerCollisionBox(part.x, part.y, part.z, part.sx, part.sy, part.sz, part.rot);
      else if (part.axis === "y") roundCollider(part.x, part.z, part.radius, part.y - part.height / 2, part.y + part.height / 2);
      else
        ctx.registerCollisionBox(part.x, part.y, part.z, part.height, part.radius * 2, part.radius * 2, part.rot + (part.axis === "z" ? Math.PI / 2 : 0));
      sealed++;
    }
    return sealed;
  }

  function finish(options = {}) {
    sealUncoveredParts();
    for (const batch of batches)
      for (const bucket of batch.buckets.values()) {
        const tile = bucket.material.userData.worldTile;
        const geometry = mergeGeometries(bucket.items, tile);
        bucket.items.forEach((item) => item.geometry.dispose());
        const mesh = new THREE.Mesh(geometry, bucket.material);
        mesh.name = `district-${batch.name}${bucket.solid ? "" : "-detail"}`;
        mesh.castShadow = bucket.shadow;
        mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        mesh.updateMatrix();
        ctx.scene.add(mesh);
        if (bucket.solid) ctx.worldMeshes.push(mesh);
      }
    for (const [key, entry] of instanced) {
      if (!entry.transforms.length) continue;
      const mesh = new THREE.InstancedMesh(
        entry.geometry,
        entry.material,
        entry.transforms.length,
      );
      mesh.name = `district-instanced-${key}`;
      entry.transforms.forEach((transform, index) => {
        mesh.setMatrixAt(index, transform);
        if (entry.colors[index] !== null)
          mesh.setColorAt(index, new THREE.Color(entry.colors[index]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = entry.shadow;
      mesh.receiveShadow = true;
      ctx.scene.add(mesh);
      if (entry.solid) ctx.worldMeshes.push(mesh);
    }
    for (const item of lights) {
      const point = new THREE.PointLight(
        item.color,
        item.intensity,
        item.distance,
        2,
      );
      point.position.set(item.x, item.y, item.z);
      point.name = "district-light";
      ctx.scene.add(point);
    }
    if (pools.length) createLightPools();
    if (paints.length) createPaintOverlay(options.paintResolution || 2048);
  }

  // Additive ground glow under lamps: the look of many lights at the cost of one draw call.
  function createLightPools() {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 128;
    const g = canvas.getContext("2d"),
      gradient = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(255,255,255,0.85)");
    gradient.addColorStop(0.35, "rgba(255,255,255,0.38)");
    gradient.addColorStop(0.7, "rgba(255,255,255,0.1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gradient;
    g.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      toneMapped: false,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geometry, material, pools.length);
    mesh.name = "district-light-pools";
    const color = new THREE.Color();
    pools.forEach((item, index) => {
      matrix.compose(
        position.set(item.x, 0.04, item.z),
        quaternion.identity(),
        new THREE.Vector3(item.radius, 1, item.radius),
      );
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(
        index,
        color.setHex(item.color).multiplyScalar(0.32 * item.strength),
      );
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.renderOrder = 2;
    ctx.scene.add(mesh);
  }

  function createPaintOverlay(resolution) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = resolution;
    const g = canvas.getContext("2d"),
      scale = resolution / 150,
      px = (x) => (x + 75) * scale,
      pz = (z) => (z + 75) * scale;
    g.clearRect(0, 0, resolution, resolution);
    g.lineCap = "butt";
    for (const draw of paints) {
      g.save();
      draw(g, px, pz, scale);
      g.restore();
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 150),
      new THREE.MeshStandardMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        roughness: 0.82,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      }),
    );
    plane.name = "district-ground-paint";
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = 0.028;
    plane.receiveShadow = true;
    plane.renderOrder = 1;
    ctx.scene.add(plane);
  }

  return {
    standard,
    glow,
    Batch,
    instance,
    addInstance,
    frame,
    collider,
    roundCollider,
    ladder,
    light,
    pool,
    paint,
    finish,
    matrix,
    quaternion,
    position,
    euler,
  };
}

/* ------------------------------------------------------------------------ */
/* Prefabs                                                                    */
/* ------------------------------------------------------------------------ */

/**
 * Wall run along local X from (x1) to (x2) at local z, with door openings.
 * openings: [{ at, width, height }] measured along the run from its centre.
 */
export function wallRun(b, f, x1, x2, z, thickness, height, material, openings = []) {
  const sorted = openings
    .map((o) => ({ from: o.at - o.width / 2, to: o.at + o.width / 2, h: o.height }))
    .sort((a, c) => a.from - c.from);
  let cursor = x1;
  const piece = (from, to, y0, y1) => {
    const length = to - from;
    if (length < 0.05 || y1 - y0 < 0.05) return;
    const lx = (from + to) / 2;
    b.box(
      f.x(lx, z),
      (y0 + y1) / 2,
      f.z(lx, z),
      length,
      y1 - y0,
      thickness,
      material,
      { rot: f.rot },
    );
  };
  for (const o of sorted) {
    piece(cursor, o.from, 0, height);
    piece(o.from, o.to, o.h, height);
    cursor = o.to;
  }
  piece(cursor, x2, 0, height);
}

/** Same as wallRun but the run follows local Z at local x. */
export function wallRunZ(b, f, z1, z2, x, thickness, height, material, openings = []) {
  // Pieces sit on the line local x = const and extend along local Z.
  const sorted = openings
    .map((o) => ({ from: o.at - o.width / 2, to: o.at + o.width / 2, h: o.height }))
    .sort((a, c) => a.from - c.from);
  let cursor = z1;
  const piece = (from, to, y0, y1) => {
    const length = to - from;
    if (length < 0.05 || y1 - y0 < 0.05) return;
    const lz = (from + to) / 2;
    b.box(
      f.x(x, lz),
      (y0 + y1) / 2,
      f.z(x, lz),
      thickness,
      y1 - y0,
      length,
      material,
      { rot: f.rot },
    );
  };
  for (const o of sorted) {
    piece(cursor, o.from, 0, height);
    piece(o.from, o.to, o.h, height);
    cursor = o.to;
  }
  piece(cursor, z2, 0, height);
}

/**
 * Enterable building with door openings, roof, cladding ribs, high windows,
 * wall lamps over the doors and an interior callback in local coordinates.
 */
export function warehouse(kit, options) {
  const {
    x,
    z,
    w,
    d,
    h = 4.8,
    rot = 0,
    doors = [],
    palette = {},
    name = "warehouse",
  } = options;
  const b = new kit.Batch(name),
    detail = new kit.Batch(`${name}-detail`),
    f = kit.frame(x, z, rot),
    t = 0.4;
  const wall = palette.wall,
    trim = palette.trim,
    roof = palette.roof,
    rib = palette.rib || trim;
  const openings = { n: [], s: [], e: [], w: [] };
  for (const door of doors)
    openings[door.side].push({
      at: door.at,
      width: door.width,
      height: door.height ?? 3,
    });
  // North/south walls span the full width; east/west fit between them.
  wallRun(b, f, -w / 2, w / 2, -d / 2 + t / 2, t, h, wall, openings.n);
  wallRun(b, f, -w / 2, w / 2, d / 2 - t / 2, t, h, wall, openings.s);
  wallRunZ(b, f, -d / 2 + t, d / 2 - t, -w / 2 + t / 2, t, h, wall, openings.w);
  wallRunZ(b, f, -d / 2 + t, d / 2 - t, w / 2 - t / 2, t, h, wall, openings.e);
  // Roof slab (overhead: blocks shots and grenades, never the walking grid).
  b.box(f.x(0, 0), h + 0.14, f.z(0, 0), w + 0.5, 0.28, d + 0.5, roof, {
    rot,
  });
  // Parapet and base plinth trims.
  for (const lz of [-d / 2 - 0.03, d / 2 + 0.03])
    detail.box(f.x(0, lz), h + 0.42, f.z(0, lz), w + 0.06, 0.3, 0.12, trim, {
      rot,
      collide: false,
    });
  for (const lx of [-w / 2 - 0.03, w / 2 + 0.03])
    detail.box(f.x(lx, 0), h + 0.42, f.z(lx, 0), 0.12, 0.3, d + 0.06, trim, {
      rot,
      collide: false,
    });
  // Corrugated ribs on all outside faces, skipped across door openings.
  const ribGap = 0.62,
    blocked = (side, at) =>
      openings[side].some(
        (o) => at > o.at - o.width / 2 - 0.15 && at < o.at + o.width / 2 + 0.15,
      );
  for (let lx = -w / 2 + 0.4; lx <= w / 2 - 0.4; lx += ribGap) {
    if (!blocked("n", lx))
      detail.box(f.x(lx, -d / 2 - 0.03), h / 2 + 0.25, f.z(lx, -d / 2 - 0.03), 0.07, h - 0.9, 0.06, rib, { rot, collide: false, shadow: false });
    if (!blocked("s", lx))
      detail.box(f.x(lx, d / 2 + 0.03), h / 2 + 0.25, f.z(lx, d / 2 + 0.03), 0.07, h - 0.9, 0.06, rib, { rot, collide: false, shadow: false });
  }
  for (let lz = -d / 2 + 0.4; lz <= d / 2 - 0.4; lz += ribGap) {
    if (!blocked("w", lz))
      detail.box(f.x(-w / 2 - 0.03, lz), h / 2 + 0.25, f.z(-w / 2 - 0.03, lz), 0.06, h - 0.9, 0.07, rib, { rot, collide: false, shadow: false });
    if (!blocked("e", lz))
      detail.box(f.x(w / 2 + 0.03, lz), h / 2 + 0.25, f.z(w / 2 + 0.03, lz), 0.06, h - 0.9, 0.07, rib, { rot, collide: false, shadow: false });
  }
  // Base plinth band on every face, interrupted at each doorway so nothing
  // dark spans the threshold.
  const plinth = (side, from, to) => {
    const spans = openings[side]
      .map((o) => [o.at - o.width / 2, o.at + o.width / 2])
      .sort((a, c) => a[0] - c[0]);
    let cursor = from;
    const piece = (a, c) => {
      if (c - a < 0.05) return;
      const mid = (a + c) / 2;
      if (side === "n" || side === "s") {
        const lz = side === "n" ? -d / 2 - 0.05 : d / 2 + 0.05;
        detail.box(f.x(mid, lz), 0.3, f.z(mid, lz), c - a, 0.6, 0.08, trim, { rot, shadow: false });
      } else {
        const lx = side === "w" ? -w / 2 - 0.05 : w / 2 + 0.05;
        detail.box(f.x(lx, mid), 0.3, f.z(lx, mid), 0.08, 0.6, c - a, trim, { rot, shadow: false });
      }
    };
    for (const [a, c] of spans) {
      piece(cursor, a);
      cursor = c;
    }
    piece(cursor, to);
  };
  plinth("n", -w / 2 - 0.09, w / 2 + 0.09);
  plinth("s", -w / 2 - 0.09, w / 2 + 0.09);
  plinth("w", -d / 2 - 0.01, d / 2 + 0.01);
  plinth("e", -d / 2 - 0.01, d / 2 + 0.01);
  // Lit clerestory windows on the long faces.
  const windowMat = kit.glow(`window-${palette.window ?? 0x9fe4ff}`, palette.window ?? 0x9fe4ff, 0.85);
  for (let lx = -w / 2 + 2; lx <= w / 2 - 2; lx += 3.2)
    for (const lz of [-d / 2 - 0.07, d / 2 + 0.07])
      detail.box(f.x(lx, lz), h - 0.95, f.z(lx, lz), 1.9, 0.42, 0.04, windowMat, { rot, collide: false, shadow: false });
  // Door dressing: hazard jambs, half-raised shutters, a lamp and a light pool.
  const hazard = kit.standard("hazard-yellow", 0xd8b52a, 0.55, 0.2),
    lampMat = kit.glow("lamp-warm", 0xffe2a8);
  for (const door of doors) {
    const height = door.height ?? 3;
    const sideOffset = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] }[door.side];
    const along = door.side === "n" || door.side === "s";
    const center = along
      ? [door.at, (sideOffset[1] * d) / 2]
      : [(sideOffset[0] * w) / 2, door.at];
    const out = 0.24;
    for (const s of [-1, 1]) {
      const jx = along ? center[0] + s * (door.width / 2 + 0.08) : center[0] + sideOffset[0] * out;
      const jz = along ? center[1] + sideOffset[1] * out : center[1] + s * (door.width / 2 + 0.08);
      detail.box(f.x(jx, jz), height / 2, f.z(jx, jz), along ? 0.16 : 0.12, height, along ? 0.12 : 0.16, hazard, { rot, collide: false });
    }
    if (door.shutter !== false && door.width >= 3) {
      // Rolled shutter box above the opening; the curtain stops above head height.
      const sx = center[0] + sideOffset[0] * 0.05,
        sz = center[1] + sideOffset[1] * 0.05;
      b.box(f.x(sx, sz), height - 0.25, f.z(sx, sz), along ? door.width : t + 0.1, 0.5, along ? t + 0.1 : door.width, kit.standard("shutter", 0x52616a, 0.5, 0.55), { rot });
    }
    const lx = center[0] + sideOffset[0] * 0.35,
      lz = center[1] + sideOffset[1] * 0.35;
    detail.box(f.x(lx, lz), height + 0.55, f.z(lx, lz), along ? 0.9 : 0.18, 0.14, along ? 0.18 : 0.9, lampMat, { rot, collide: false, shadow: false });
    const px = center[0] + sideOffset[0] * 2.2,
      pz = center[1] + sideOffset[1] * 2.2;
    kit.pool(f.x(px, pz), f.z(px, pz), 3.2, 0xffd59a, 0.9);
  }
  // Interior floor tint and ceiling light panels.
  detail.box(f.x(0, 0), 0.012, f.z(0, 0), w - 0.82, 0.02, d - 0.82, palette.floor || kit.standard("warehouse-floor", 0x4d5658, 0.85, 0.05), { rot, collide: false, shadow: false });
  const panel = kit.glow(`ceiling-${palette.ceiling ?? 0xe6f6ff}`, palette.ceiling ?? 0xe6f6ff);
  for (let lx = -w / 2 + 3; lx <= w / 2 - 3; lx += 5)
    for (const lz of d > 10 ? [-d / 4, d / 4] : [0]) {
      detail.box(f.x(lx, lz), h - 0.05, f.z(lx, lz), 2.4, 0.06, 0.32, panel, { rot, collide: false, shadow: false });
      kit.pool(f.x(lx, lz), f.z(lx, lz), 2.6, palette.ceiling ?? 0xe6f6ff, 0.55);
    }
  kit.light(f.x(0, 0), h - 0.6, f.z(0, 0), palette.ceiling ?? 0xe6f6ff, 7, Math.max(w, d) * 0.95);
  if (options.interior) options.interior(b, detail, f);
  return { b, detail, f };
}

/** Pallet rack with shelves and cargo; one collider for the whole bay. */
export function rack(kit, b, detail, f, lx, lz, length, depth = 1.1, height = 3.2, rot = 0) {
  const steel = kit.standard("rack-blue", 0x2c5a86, 0.5, 0.5),
    beam = kit.standard("rack-orange", 0xd2702c, 0.55, 0.35),
    cargo = [
      kit.standard("cargo-a", 0x8a6d47, 0.85, 0.05),
      kit.standard("cargo-b", 0x5d6e74, 0.75, 0.1),
      kit.standard("cargo-c", 0x3f5e4b, 0.8, 0.05),
    ];
  const sub = kit.frame(f.x(lx, lz), f.z(lx, lz), f.rot + rot);
  // Cargo on the third shelf can stand taller than a low rack frame.
  const colliderHeight = Math.max(height, 3.25);
  kit.collider(sub.x(0, 0), colliderHeight / 2, sub.z(0, 0), length, colliderHeight, depth, sub.rot);
  const bays = Math.max(1, Math.round(length / 2.7));
  for (let i = 0; i <= bays; i++) {
    const px = -length / 2 + (i * length) / bays;
    for (const s of [-1, 1])
      detail.box(sub.x(px, (s * depth) / 2), height / 2, sub.z(px, (s * depth) / 2), 0.09, height, 0.09, steel, { rot: sub.rot, collide: false, solid: true });
  }
  const levels = [0.15, 1.2, 2.25, height - 0.05];
  levels.forEach((y, level) => {
    for (const s of [-1, 1])
      detail.box(sub.x(0, (s * depth) / 2), y, sub.z(0, (s * depth) / 2), length, 0.1, 0.07, beam, { rot: sub.rot, collide: false, solid: true });
    if (level === levels.length - 1) return;
    detail.box(sub.x(0, 0), y + 0.04, sub.z(0, 0), length - 0.1, 0.03, depth, steel, { rot: sub.rot, collide: false, solid: true, shadow: false });
    for (let i = 0; i < bays; i++) {
      const cx = -length / 2 + ((i + 0.5) * length) / bays;
      const fill = (i * 7 + level * 3) % 5;
      if (fill === 4) continue;
      const sx = 1.1 + (fill % 2) * 0.35,
        sy = 0.55 + ((i + level) % 3) * 0.17;
      detail.box(sub.x(cx, 0), y + 0.06 + sy / 2, sub.z(cx, 0), sx, sy, depth * 0.82, cargo[(i + level) % 3], { rot: sub.rot, collide: false, solid: true });
    }
  });
}

/** Wooden pallet stack with a shrink-wrapped load. */
export function palletStack(kit, b, x, z, rot = 0, layers = 2, wrapped = true, baseY = 0) {
  const wood = kit.standard("pallet-wood", 0x7b5a3a, 0.9, 0.02),
    wrap = kit.standard("pallet-wrap", 0x9aaab0, 0.35, 0.05, { transparent: true, opacity: 0.88 });
  const f = kit.frame(x, z, rot);
  // baseY lets a stack stand on a raised floor (e.g. the loading dock).
  let y = baseY;
  for (let layer = 0; layer < layers; layer++) {
    for (const lz of [-0.45, 0, 0.45])
      b.box(f.x(0, lz), y + 0.05, f.z(0, lz), 1.2, 0.1, 0.12, wood, { rot, collide: false, solid: true });
    b.box(f.x(0, 0), y + 0.13, f.z(0, 0), 1.2, 0.04, 1.0, wood, { rot, collide: false, solid: true });
    y += 0.15;
    if (wrapped) {
      b.box(f.x(0, 0), y + 0.4, f.z(0, 0), 1.1, 0.8, 0.95, wrap, { rot, collide: false, solid: true });
      y += 0.8;
    }
  }
  kit.collider(f.x(0, 0), (baseY + y) / 2, f.z(0, 0), 1.2, y - baseY, 1.0, rot);
}

/** Box truck or semi cab + trailer, parked; colliders on cab and cargo body. */
export function truck(kit, b, x, z, rot, color = 0x9c3b31, trailer = false) {
  const f = kit.frame(x, z, rot),
    body = kit.standard(`truck-${color}`, color, 0.5, 0.35),
    dark = kit.standard("truck-dark", 0x15191b, 0.6, 0.3),
    glass = kit.standard("truck-glass", 0x223a44, 0.12, 0.8),
    steel = kit.standard("truck-steel", 0x707a7d, 0.4, 0.7),
    box = kit.standard("truck-box", trailer ? 0xc9cbc4 : 0xd5d6cf, 0.6, 0.15),
    head = kit.glow("headlight", 0xfff3c4),
    tail = kit.glow("taillight", 0xff3344);
  const cargoLength = trailer ? 11 : 6.2,
    cabZ = -(cargoLength / 2 + 1.35);
  // Cab.
  b.box(f.x(0, cabZ), 1.55, f.z(0, cabZ), 2.4, 2.1, 2.2, body, { rot });
  b.box(f.x(0, cabZ - 1.12), 1.95, f.z(0, cabZ - 1.12), 2.1, 0.9, 0.06, glass, { rot, collide: false });
  b.box(f.x(0, cabZ - 1.1), 0.75, f.z(0, cabZ - 1.1), 2.42, 0.5, 0.12, dark, { rot, collide: false });
  for (const s of [-0.85, 0.85])
    b.box(f.x(s, cabZ - 1.17), 0.95, f.z(s, cabZ - 1.17), 0.36, 0.18, 0.04, head, { rot, collide: false, shadow: false });
  // Cargo body / trailer.
  b.box(f.x(0, 0.3), 1.95, f.z(0, 0.3), 2.5, 2.8, cargoLength, box, { rot });
  const chassisStart = cabZ - 0.8,
    chassisEnd = 0.3 + cargoLength / 2 - 0.05,
    chassisMid = (chassisStart + chassisEnd) / 2;
  b.box(f.x(0, chassisMid), 0.42, f.z(0, chassisMid), 1.6, 0.3, chassisEnd - chassisStart, dark, { rot, collide: false });
  for (const s of [-1, 1]) {
    b.box(f.x(s * 1.27, 0.3), 2.75, f.z(s * 1.27, 0.3), 0.03, 0.5, cargoLength - 0.4, kit.standard(`truck-stripe-${color}`, color, 0.5, 0.3), { rot, collide: false, shadow: false });
    b.box(f.x(s * 0.95, cargoLength / 2 + 0.33), 0.9, f.z(s * 0.95, cargoLength / 2 + 0.33), 0.3, 0.14, 0.04, tail, { rot, collide: false, shadow: false });
  }
  const axles = trailer
    ? [cabZ + 0.2, cabZ + 1.8, cargoLength / 2 - 1.2, cargoLength / 2 - 2.6]
    : [cabZ + 0.3, cargoLength / 2 - 1.3];
  for (const az of axles)
    for (const s of [-1.08, 1.08])
      b.cylinder(f.x(s, az), 0.5, f.z(s, az), 0.5, 0.38, dark, { axis: "x", rot, segments: 14, collide: false });
  for (const s of [-1.3, 1.3])
    b.box(f.x(s, cabZ - 0.4), 2.1, f.z(s, cabZ - 0.4), 0.06, 0.32, 0.22, steel, { rot, collide: false, shadow: false });
}

/** Low sandbag wall (≈1.05 m) built from instanced bags; one collider per run. */
export function sandbags(kit, x, z, length, rot = 0, courses = 4) {
  kit.instance(
    "sandbag",
    () => {
      const geometry = new THREE.SphereGeometry(0.5, 9, 6);
      geometry.scale(0.62, 0.24, 0.36);
      return geometry;
    },
    kit.standard("sandbag", 0x8b7c58, 0.95, 0.02),
    { solid: true },
  );
  const f = kit.frame(x, z, rot),
    count = Math.max(2, Math.round(length / 0.58));
  for (let course = 0; course < courses; course++) {
    const shift = course % 2 ? 0.29 : 0;
    for (let i = 0; i < count - (course % 2); i++) {
      const lx = -length / 2 + 0.29 + i * (length / count) + shift;
      for (const lz of course < courses - 1 ? [-0.19, 0.19] : [0]) {
        kit.euler.set((Math.random() - 0.5) * 0.08, rot + (Math.random() - 0.5) * 0.16, 0);
        kit.quaternion.setFromEuler(kit.euler);
        kit.matrix.compose(
          kit.position.set(f.x(lx, lz), 0.12 + course * 0.235, f.z(lx, lz)),
          kit.quaternion,
          new THREE.Vector3(1, 1, 1),
        );
        kit.addInstance("sandbag", kit.matrix, (i + course) % 3 ? 0x8b7c58 : 0x7a6c4c);
      }
    }
  }
  const height = 0.24 + (courses - 1) * 0.235;
  kit.collider(x, height / 2, z, length + 0.1, height, 0.72, rot);
  return { x, z, length, rot, height };
}

/** Concrete jersey barriers in a row. */
export function jerseyRow(kit, b, x, z, count, rot = 0, gap = 0.08, colorful = false) {
  kit.instance(
    "jersey",
    () => {
      const shape = new THREE.Shape();
      shape.moveTo(-0.32, 0);
      shape.lineTo(0.32, 0);
      shape.lineTo(0.3, 0.12);
      shape.lineTo(0.13, 0.32);
      shape.lineTo(0.1, 0.82);
      shape.lineTo(-0.1, 0.82);
      shape.lineTo(-0.13, 0.32);
      shape.lineTo(-0.3, 0.12);
      shape.closePath();
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: 2.9, bevelEnabled: false });
      geometry.translate(0, 0, -1.45);
      geometry.rotateY(Math.PI / 2);
      return geometry;
    },
    kit.standard("jersey", 0xffffff, 0.86, 0.02),
    { solid: true },
  );
  const f = kit.frame(x, z, rot),
    span = 2.9 + gap;
  for (let i = 0; i < count; i++) {
    const lx = (i - (count - 1) / 2) * span;
    kit.quaternion.setFromEuler(kit.euler.set(0, rot, 0));
    kit.matrix.compose(kit.position.set(f.x(lx, 0), 0, f.z(lx, 0)), kit.quaternion, new THREE.Vector3(1, 1, 1));
    kit.addInstance("jersey", kit.matrix, colorful && i % 2 ? 0xc7473c : 0xb7b9b1);
  }
  kit.collider(x, 0.41, z, count * span - gap, 0.82, 0.62, rot);
}

/** Street lamp: pole, arm, glowing head, light cone and ground pool. */
export function lamp(kit, b, x, z, rot = 0, color = 0xffd9a0, height = 6.2) {
  const pole = kit.standard("lamp-pole", 0x2b3438, 0.55, 0.6),
    headMat = kit.glow(`lamp-head-${color}`, color);
  const f = kit.frame(x, z, rot);
  b.cylinder(x, height / 2, z, 0.09, height, pole, { segments: 8 });
  b.box(f.x(0.75, 0), height - 0.065, f.z(0.75, 0), 1.6, 0.1, 0.11, pole, { rot, collide: false, solid: true });
  b.box(f.x(1.45, 0), height - 0.16, f.z(1.45, 0), 0.62, 0.12, 0.3, headMat, { rot, collide: false, shadow: false });
  b.box(f.x(0, 0), 0.1, f.z(0, 0), 0.42, 0.2, 0.42, pole, { rot, collide: false, solid: true });
  kit.pool(f.x(1.45, 0), f.z(1.45, 0), 4.2, color, 1);
  kit.instance(
    "lamp-cone",
    () => {
      const geometry = new THREE.ConeGeometry(2.4, height - 0.2, 14, 1, true);
      geometry.translate(0, -(height - 0.2) / 2, 0);
      return geometry;
    },
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.035,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    }),
    { shadow: false },
  );
  kit.matrix.compose(
    kit.position.set(f.x(1.45, 0), height - 0.2, f.z(1.45, 0)),
    kit.quaternion.identity(),
    new THREE.Vector3(1, 1, 1),
  );
  kit.addInstance("lamp-cone", kit.matrix, color);
}

/** Cluster of plain (non-explosive) steel drums. */
export function drums(kit, b, x, z, layout, color = 0x2f5f86) {
  const body = kit.standard(`drum-${color}`, color, 0.45, 0.5),
    rim = kit.standard("drum-rim", 0x1c2326, 0.4, 0.7);
  for (const [dx, dz] of layout) {
    b.cylinder(x + dx, 0.45, z + dz, 0.3, 0.9, body, { segments: 14 });
    for (const y of [0.18, 0.72])
      b.cylinder(x + dx, y, z + dz, 0.31, 0.05, rim, { segments: 14, collide: false, solid: true, shadow: false });
  }
}

/** Raised guard tower; only the legs block movement. */
export function watchtower(kit, b, x, z, rot = 0, accent = 0xff4b5c) {
  const steel = kit.standard("tower-steel", 0x2a3539, 0.55, 0.6),
    deck = kit.standard("tower-deck", 0x3b4549, 0.7, 0.4),
    roof = kit.standard("tower-roof", 0x1c2427, 0.6, 0.4),
    beacon = kit.glow(`beacon-${accent}`, accent);
  const f = kit.frame(x, z, rot),
    top = 4.4;
  for (const [lx, lz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]])
    b.box(f.x(lx, lz), top / 2, f.z(lx, lz), 0.22, top, 0.22, steel, { rot });
  // Braces run above head height so walking under the deck is never blocked
  // by (or through) a bar.
  for (const y of [2.15, 3.45])
    for (const [lx, lz, sx, sz] of [[0, -1.3, 2.6, 0.08], [0, 1.3, 2.6, 0.08], [-1.3, 0, 0.08, 2.6], [1.3, 0, 0.08, 2.6]])
      b.box(f.x(lx, lz), y, f.z(lx, lz), sx, 0.08, sz, steel, { rot, collide: false, solid: true });
  b.box(f.x(0, 0), top + 0.1, f.z(0, 0), 3.4, 0.2, 3.4, deck, { rot });
  // Solid railings keep players on the deck; the ladder side has a gap.
  for (const [lx, lz, sx, sz] of [
    [0, -1.65, 3.4, 0.08],
    [-1.05, 1.65, 1.3, 0.08],
    [1.05, 1.65, 1.3, 0.08],
    [-1.65, 0, 0.08, 3.4],
    [1.65, 0, 0.08, 3.4],
  ])
    b.box(f.x(lx, lz), top + 0.75, f.z(lx, lz), sx, 1.1, sz, steel, { rot });
  for (const [lx, lz] of [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]])
    b.box(f.x(lx, lz), top + 1.3, f.z(lx, lz), 0.12, 2.2, 0.12, steel, { rot });
  b.box(f.x(0, 0), top + 2.45, f.z(0, 0), 3.8, 0.18, 3.8, roof, { rot, collide: false, solid: true });
  b.box(f.x(0, 0), top + 2.75, f.z(0, 0), 0.22, 0.22, 0.22, beacon, { rot, collide: false, shadow: false });
  // Ladder.
  for (const s of [-0.25, 0.25])
    b.box(f.x(s, 1.42), top / 2, f.z(s, 1.42), 0.05, top, 0.05, steel, { rot, collide: false, solid: true });
  for (let y = 0.35; y < top; y += 0.38)
    b.box(f.x(0, 1.42), y, f.z(0, 1.42), 0.5, 0.04, 0.04, steel, { rot, collide: false, solid: true, shadow: false });
  // Hand rails above the deck so the ladder visibly continues to the top.
  for (const s of [-0.25, 0.25])
    b.box(f.x(s, 1.42), top + 0.6, f.z(s, 1.42), 0.05, 0.8, 0.05, steel, { rot, collide: false, solid: true, shadow: false });
  kit.ladder({
    climbX: f.x(0, 1.86),
    climbZ: f.z(0, 1.86),
    nx: Math.sin(rot),
    nz: Math.cos(rot),
    top: top + 0.2,
    exitX: f.x(0, 0.8),
    exitZ: f.z(0, 0.8),
  });
  kit.light(f.x(0, 0), top + 2.1, f.z(0, 0), 0xffe0a8, 4, 14);
  kit.pool(x, z, 5, 0xffd8a0, 0.8);
}

/** Large rail-mounted gantry crane spanning a yard; legs are the only colliders. */
export function gantryCrane(kit, b, x1, x2, z1, z2, height = 15) {
  const yellow = kit.standard("crane-yellow", 0xc99a2e, 0.55, 0.45),
    dark = kit.standard("crane-dark", 0x1d2427, 0.6, 0.5),
    beacon = kit.glow("crane-beacon", 0xff3344),
    cable = kit.standard("crane-cable", 0x0f1214, 0.5, 0.6);
  const midX = (x1 + x2) / 2,
    span = x2 - x1;
  for (const lz of [z1, z2]) {
    for (const lx of [x1, x2]) {
      b.box(lx, height / 2, lz, 0.9, height, 0.9, yellow);
      b.box(lx, 0.25, lz, 1.6, 0.5, 2.4, dark);
      b.cylinder(lx, 0.2, lz - 0.7, 0.28, 0.4, dark, { axis: "x", collide: false });
      b.cylinder(lx, 0.2, lz + 0.7, 0.28, 0.4, dark, { axis: "x", collide: false });
    }
    // Sill beam at the top and a portal brace at 9 m (both overhead).
    b.box(midX, height + 0.6, lz, span + 2, 1.2, 1.1, yellow);
    b.box(midX, 9, lz, span - 0.9, 0.5, 0.5, yellow, { collide: false, solid: true });
  }
  // Main girders running between the two portals.
  const midZ = (z1 + z2) / 2,
    length = Math.abs(z2 - z1);
  for (const lx of [x1 + span * 0.3, x2 - span * 0.3])
    b.box(lx, height + 1.5, midZ, 0.9, 1.4, length + 1.04, yellow);
  // Trolley, operator cab, hoist cables and spreader.
  const tx = midX,
    tz = midZ - length * 0.12;
  b.box(tx, height + 2.5, tz, span * 0.5, 0.9, 3, dark, { collide: false, solid: true });
  b.box(tx + span * 0.18, height - 0.4, tz + 1.2, 2.2, 1.8, 2, kit.standard("crane-cab", 0x2f454c, 0.3, 0.6), { collide: false, solid: true });
  b.box(tx + span * 0.18, height - 0.3, tz + 2.21, 1.9, 1, 0.04, kit.glow("crane-window", 0x9fe4ff, 0.8), { collide: false, shadow: false });
  // The spreader never hangs lower than 4.2 m, so small cranes keep it overhead.
  const hookY = Math.max(height - 7.1, 4.2),
    cableTop = height - 0.4;
  for (const s of [-1.2, 1.2])
    b.box(tx + s, (cableTop + hookY) / 2, tz, 0.05, cableTop - hookY, 0.05, cable, { collide: false, shadow: false });
  b.box(tx, hookY, tz, 3.4, 0.35, 1.2, yellow);
  for (const lx of [x1, x2])
    for (const lz of [z1, z2])
      b.box(lx, height + 1.35, lz, 0.25, 0.25, 0.25, beacon, { collide: false, shadow: false });
}

/** Vertical storage tank with ring bands, ladder and pipe stub. */
export function storageTank(kit, b, x, z, radius, height, color = 0x7d8a8f) {
  const body = kit.standard(`tank-${color}`, color, 0.45, 0.55),
    band = kit.standard("tank-band", 0x343d41, 0.5, 0.6),
    rail = kit.standard("tank-rail", 0xc99a2e, 0.5, 0.4);
  b.cylinder(x, height / 2, z, radius, height, body, { segments: 28 });
  for (let y = 1.2; y < height; y += 2.2)
    b.cylinder(x, y, z, radius + 0.04, 0.14, band, { segments: 28, collide: false, solid: true, shadow: false });
  // Cap sits 12 mm above the shell top: exactly flush surfaces z-fight (flicker),
  // and 12 mm is too little for feet to visibly sink in.
  b.cylinder(x, height - 0.028, z, radius + 0.02, 0.08, band, { segments: 28, collide: false, solid: true, shadow: false });
  b.box(x - radius * 0.35, height + 0.3, z, 0.6, 0.6, 0.6, band);
  for (let y = 0.5; y < height; y += 0.42)
    b.box(x + radius + 0.12, y, z, 0.05, 0.04, 0.55, rail, { collide: false, solid: true, shadow: false });
  for (const s of [-0.27, 0.27])
    b.box(x + radius + 0.12, height / 2, z + s, 0.05, height, 0.05, rail, { collide: false, solid: true, shadow: false });
  // A low painted lip marks the roof edge without blocking: players may step
  // or jump off any side (there is no fall damage).
  b.cylinder(x, height + 0.06, z, radius + 0.05, 0.12, rail, {
    segments: 28,
    open: true,
    collide: false,
    solid: false,
    shadow: false,
  });
  kit.ladder({
    climbX: x + radius + 0.56,
    climbZ: z,
    nx: 1,
    nz: 0,
    top: height,
    exitX: x + radius - 0.8,
    exitZ: z,
  });
}

/** Diesel generator skid. */
export function generator(kit, b, x, z, rot = 0, color = 0x3a6b4f) {
  const f = kit.frame(x, z, rot),
    body = kit.standard(`gen-${color}`, color, 0.6, 0.35),
    dark = kit.standard("gen-dark", 0x15191b, 0.6, 0.4),
    led = kit.glow("gen-led", 0x58ff8a);
  b.box(f.x(0, 0), 0.12, f.z(0, 0), 3, 0.24, 1.5, dark, { rot, collide: false, solid: true });
  b.box(f.x(0, 0), 0.95, f.z(0, 0), 2.8, 1.45, 1.3, body, { rot });
  for (let i = -1.1; i <= 1.11; i += 0.22)
    b.box(f.x(i, 0.66), 1.05, f.z(i, 0.66), 0.08, 0.9, 0.03, dark, { rot, collide: false, shadow: false });
  b.cylinder(f.x(-1, 0), 2.1, f.z(-1, 0), 0.11, 0.9, dark, { collide: false, solid: true });
  b.box(f.x(1.1, 0.66), 1.45, f.z(1.1, 0.66), 0.14, 0.06, 0.03, led, { rot, collide: false, shadow: false });
}

/**
 * Two-level scaffold with planks. Posts, decks and the long-side guard rails
 * collide, so the frame can't be walked through at any height. The short ends
 * stay open: that is where players jump on and off the decks, and the space
 * under the first deck stays walkable.
 */
export function scaffold(kit, b, x, z, w, d, levels = 2, rot = 0) {
  const f = kit.frame(x, z, rot),
    pipe = kit.standard("scaffold-pipe", 0x8c9599, 0.45, 0.7),
    plank = kit.standard("scaffold-plank", 0x8a6a40, 0.9, 0.02),
    net = kit.standard("scaffold-net", 0x1f6a55, 0.9, 0, { transparent: true, opacity: 0.55, side: THREE.DoubleSide });
  const top = levels * 2;
  for (const lx of [-w / 2, 0, w / 2])
    for (const lz of [-d / 2, d / 2])
      b.box(f.x(lx, lz), top / 2 + 0.5, f.z(lx, lz), 0.07, top + 1, 0.07, pipe, { rot });
  for (let level = 1; level <= levels; level++) {
    const y = level * 2;
    b.box(f.x(0, 0), y, f.z(0, 0), w, 0.06, d, plank, { rot });
    for (const lz of [-d / 2, d / 2])
      b.box(f.x(0, lz), y + 1, f.z(0, lz), w, 0.05, 0.05, pipe, { rot, shadow: false });
  }
  b.box(f.x(0, d / 2 + 0.05), top / 2 + 1, f.z(0, d / 2 + 0.05), w, top - 0.2, 0.02, net, { rot, collide: false, solid: false, shadow: false });
  kit.collider(f.x(0, d / 2 + 0.05), top / 2 + 1, f.z(0, d / 2 + 0.05), w, top - 0.2, 0.08, rot);
}

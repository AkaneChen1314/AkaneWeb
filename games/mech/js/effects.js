'use strict';
// ============================================================
//  特效：粒子、光束、衝擊波、動態光源、畫面震動、浮動文字
// ============================================================
// PSys：粒子系統。預先配置固定數量（max）的粒子，用完就從頭覆蓋最舊的，不會一直配置記憶體。
// additive = true 是會發光的粒子（火花、火焰）；false 是不發光的煙霧。
class PSys {
  // 每顆粒子的資料都放在一整條數字陣列裡（速度比一顆一個物件快很多）
  constructor(max, additive) {
    this.max = max;
    // i：下一顆要使用的粒子編號
    this.i = 0;
    // pos 位置、col 顏色(含透明度)、size 目前大小、vel 速度、life 剩餘壽命、maxLife 總壽命
    // s0 / s1 = 出生與消失時的大小、a0 = 起始透明度、grav = 重力、drag = 空氣阻力
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 4);
    this.size = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max);
    this.s1 = new Float32Array(max);
    this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const g = this.geo = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 600 } },
      // 頂點著色器：算出每顆粒子在畫面上的位置，並依距離決定大小（越遠越小，最大 900 像素）
      vertexShader: [
        'attribute float aSize;',
        'attribute vec4 aColor;',
        'varying vec4 vColor;',
        'uniform float uScale;',
        'void main(){',
        '  vColor = aColor;',
        '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
        '  gl_Position = projectionMatrix * mv;',
        '  gl_PointSize = min(aSize * uScale / max(-mv.z, 0.1), 900.0);',
        '}',
      ].join('\n'),
      // 片段著色器：把每顆粒子畫成中間亮、邊緣淡出的圓點
      // 發光粒子用「加亮」方式疊上去；煙霧粒子則用一般的半透明
      fragmentShader: additive
      ? [
        'varying vec4 vColor;',
        'void main(){',
        '  vec2 d = gl_PointCoord - 0.5;',
        '  float a = smoothstep(1.0, 0.0, dot(d, d) * 4.0);',
        '  gl_FragColor = vec4(vColor.rgb * vColor.a * a * a, 1.0);',
        '}',
      ].join('\n')
      : [
        'varying vec4 vColor;',
        'void main(){',
        '  vec2 d = gl_PointCoord - 0.5;',
        '  float a = smoothstep(1.0, 0.1, dot(d, d) * 4.0);',
        '  gl_FragColor = vec4(vColor.rgb, vColor.a * a);',
        '}',
      ].join('\n'),
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    // 把所有粒子做成一個「點雲」物件，一次畫完
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }
  // 發射一顆粒子：位置 (x,y,z)、速度 (vx,vy,vz)、壽命 life 秒、大小從 s0 變到 s1、顏色 r g b、透明度 a
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, g, b, a, grav = 0, drag = 0) {
    const i = this.i;
    this.i = (i + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.s0[i] = s0;
    this.s1[i] = s1;
    this.a0[i] = a;
    this.col[i * 4] = r;
    this.col[i * 4 + 1] = g;
    this.col[i * 4 + 2] = b;
    this.col[i * 4 + 3] = a;
    this.grav[i] = grav;
    this.drag[i] = drag;
    this.size[i] = s0;
  }
  // 每一格更新所有還活著的粒子：移動、受重力與阻力影響、改變大小與透明度
  update(dt) {
    const { pos, vel, life, maxLife, size, col, s0, s1, a0, grav, drag, max } = this;
    for (let i = 0; i < max; i++) {
      if (life[i] <= 0) continue;
      life[i] -= dt;
      if (life[i] <= 0) {
        size[i] = 0;
        col[i * 4 + 3] = 0;
        continue;
      }
      // k：這顆粒子的生命進度，0 = 剛出生，1 = 快消失
      const k = 1 - life[i] / maxLife[i], i3 = i * 3;
      if (drag[i]) {
        const f = Math.max(0, 1 - drag[i] * dt);
        vel[i3] *= f;
        vel[i3 + 1] *= f;
        vel[i3 + 2] *= f;
      }
      vel[i3 + 1] -= grav[i] * dt;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      // 掉到地面的粒子會彈起來一點（火花落地的效果）
      if (pos[i3 + 1] < 0.05 && grav[i] > 0) {
        pos[i3 + 1] = 0.05;
        vel[i3 + 1] *= -0.35;
        vel[i3] *= 0.6;
        vel[i3 + 2] *= 0.6;
      }
      size[i] = s0[i] + (s1[i] - s0[i]) * k;
      col[i * 4 + 3] = a0[i] * (1 - k * k);
    }
    // 告訴顯示卡這些資料變了，要重新上傳
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aColor.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
  }
  // 清空所有粒子（離開戰鬥時用）
  clear() {
    this.life.fill(0);
    this.size.fill(0);
  }
}

// FX：所有特效的總管。beam / ring / sphere / light 都是先做好一批放著（物件池），要用時挑一個閒置的出來
const FX = {
  // add = 發光粒子、smoke = 煙霧粒子、beams 光束、rings 衝擊波圓環、spheres 爆炸球
  // lights 動態光源、texts 浮動的傷害數字、shakeAmt 畫面震動強度、ash 飄浮的灰燼
  add: null, smoke: null, beams: [], rings: [], spheres: [], lights: [], texts: [], shakeAmt: 0, scene: null, ash: null,

  // 建立粒子系統與所有物件池，並加進場景（只需要呼叫一次）
  init(scene) {
    this.scene = scene;
    this.add = new PSys(5000, true);
    this.smoke = new PSys(1800, false);
    scene.add(this.smoke.points, this.add.points);
    // 光束：150 根細長圓柱
    const bg = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    bg.rotateX(PI / 2);
    for (let i = 0; i < 150; i++) {
      const m = new THREE.Mesh(bg,
          new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
              toneMapped: false }));
      m.visible = false;
      m.frustumCulled = false;
      m.userData = { life: 0, max: 1, w: 1 };
      scene.add(m);
      this.beams.push(m);
    }
    // 衝擊波：44 個平躺在地上的圓環
    const rg = new THREE.RingGeometry(0.82, 1, 48);
    rg.rotateX(-PI / 2);
    for (let i = 0; i < 44; i++) {
      const m = new THREE.Mesh(rg,
          new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
              side: THREE.DoubleSide, toneMapped: false }));
      m.visible = false;
      m.userData = { life: 0 };
      scene.add(m);
      this.rings.push(m);
    }
    // 爆炸球：10 顆半透明的球
    const sg = new THREE.SphereGeometry(1, 24, 16);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(sg,
          new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
              toneMapped: false }));
      m.visible = false;
      m.userData = { life: 0 };
      scene.add(m);
      this.spheres.push(m);
    }
    // 動態光源：5 盞點光源（爆炸、開火時短暫照亮周圍）
    for (let i = 0; i < 5; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 60, 1.6);
      l.userData = { life: 0, max: 1, base: 0 };
      scene.add(l);
      this.lights.push(l);
    }
    // 飄浮的灰燼
    const n = 500, ap = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) ap[i] = rand(-70, 70);
    const ag = new THREE.BufferGeometry();
    ag.setAttribute('position', new THREE.BufferAttribute(ap, 3));
    this.ash = new THREE.Points(ag,
        new THREE.PointsMaterial({ color: 0xcdb89a, size: 0.22, transparent: true, opacity: 0.55,
            depthWrite: false, fog: true }));
    this.ash.frustumCulled = false;
    scene.add(this.ash);
  },

  // 把所有特效清掉並收回物件池（每場戰鬥開始 / 結束時呼叫）
  reset() {
    this.add.clear();
    this.smoke.clear();
    this.texts.length = 0;
    this.shakeAmt = 0;
    for (const b of this.beams) {
      b.visible = false;
      b.userData.life = 0;
    }
    for (const b of this.rings) {
      b.visible = false;
      b.userData.life = 0;
    }
    for (const b of this.spheres) {
      b.visible = false;
      b.userData.life = 0;
    }
    for (const l of this.lights) {
      l.intensity = 0;
      l.userData.life = 0;
    }
  },

  // ---- 基本元件 ----
  // 從 A 點到 B 點畫一道光束。w = 粗細、life = 顯示多久、bright = 亮度
  beam(ax, ay, az, bx, by, bz, color, w = 0.3, life = 0.12, bright = 2.5) {
    // 找一根閒置的光束；全部都在用就放棄這一次
    let m = null;
    for (const b of this.beams) if (b.userData.life <= 0) {
      m = b;
      break;
    }
    if (!m) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return;
    // 把圓柱放在兩點中間、轉向 B 點、再拉長到兩點的距離
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.lookAt(bx, by, bz);
    m.scale.set(w, w, len);
    m.material.color.copy(C(color)).multiplyScalar(bright);
    m.material.opacity = 1;
    m.userData.life = m.userData.max = life;
    m.userData.w = w;
    m.visible = true;
  },
  // 鋸齒狀閃電
  bolt(ax, ay, az, bx, by, bz, color, w = 0.25, life = 0.18) {
    // 每 7 公尺一個轉折點，每個轉折點隨機偏移一點，連起來就像閃電
    const n = Math.max(2, Math.ceil(Math.hypot(bx - ax, by - ay, bz - az) / 7));
    let px = ax, py = ay, pz = az;
    for (let i = 1; i <= n; i++) {
      const t = i / n, j = i === n ? 0 : 1.6;
      const qx = lerp(ax, bx, t) + rand(-j, j), qy = lerp(ay, by, t) + rand(-j, j), qz = lerp(az, bz, t) + rand(-j, j);
      this.beam(px, py, pz, qx, qy, qz, color, w, life, 3);
      px = qx;
      py = qy;
      pz = qz;
    }
  },
  // 擴散的衝擊波圓環：半徑在 life 秒內從 r0 變到 r1
  ring(x, y, z, color, r0, r1, life, bright = 2) {
    for (const m of this.rings) if (m.userData.life <= 0) {
      m.position.set(x, y, z);
      m.scale.setScalar(r0);
      m.material.color.copy(C(color)).multiplyScalar(bright);
      m.material.opacity = 1;
      m.userData = { life, max: life, r0, r1 };
      m.visible = true;
      return;
    }
  },
  // 膨脹的光球：半徑在 life 秒內從 r0 變到 r1
  sphere(x, y, z, color, r0, r1, life, bright = 1.5) {
    for (const m of this.spheres) if (m.userData.life <= 0) {
      m.position.set(x, y, z);
      m.scale.setScalar(r0);
      m.material.color.copy(C(color)).multiplyScalar(bright);
      m.material.opacity = 0.8;
      m.userData = { life, max: life, r0, r1 };
      m.visible = true;
      return;
    }
  },
  // 短暫的動態光源：intensity 亮度、dist 照射距離、life 秒後熄滅
  light(x, y, z, color, intensity, dist, life) {
    // 優先用閒置的燈；都在用就搶走最快要熄滅的那一盞
    let best = this.lights[0];
    for (const l of this.lights) {
      if (l.userData.life <= 0) {
        best = l;
        break;
      }
      if (l.userData.life < best.userData.life) best = l;
    }
    best.position.set(x, y, z);
    best.color.set(color);
    best.intensity = intensity;
    best.distance = dist;
    best.userData.life = best.userData.max = life;
    best.userData.base = intensity;
  },
  // 畫面震動（數值只會取較大的，上限 2.2）
  shake(a) {
    this.shakeAmt = Math.min(2.2, Math.max(this.shakeAmt, a));
  },
  // 浮動文字（傷害數字）；實際的字是 ui.js 畫在覆蓋層畫布上的
  text(x, y, z, str, color = '#ffffff', size = 15) {
    if (this.texts.length < 60) this.texts.push({ x: x + rand(-1, 1), y, z: z + rand(-1, 1), str, color, size,
        life: 0.9, max: 0.9 });
  },

  // ---- 組合特效 ----
  // 往四面八方噴出 n 顆會落地反彈的火花
  sparks(x, y, z, n, color, speed = 14, life = 0.5, size = 0.35) {
    const c = C(color);
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), u = rand(-1, 1), s = Math.sqrt(1 - u * u), v = speed * rand(0.3, 1);
      this.add.emit(x, y, z, Math.cos(a) * s * v, u * v + speed * 0.3, Math.sin(a) * s * v, life * rand(0.5, 1), size,
          0.05, c.r, c.g, c.b, 2.2, 26, 0.5);
    }
  },
  // 一團煙霧 / 塵土。shade = 灰階深淺、up = 往上飄的速度、spread = 擴散範圍
  puff(x, y, z, n, size, life, shade = 0.3, up = 2, spread = 3, alpha = 0.5) {
    for (let i = 0; i < n; i++) {
      const g = shade * rand(0.7, 1.2);
      this.smoke.emit(x + rand(-spread, spread) * 0.3, y + rand(-0.5, 0.5), z + rand(-spread, spread) * 0.3,
          rand(-spread, spread), rand(0, up), rand(-spread, spread), life * rand(0.6, 1.1), size * 0.5,
          size * rand(1.2, 2), g, g * 0.96, g * 0.9, alpha, -0.6, 1.2);
    }
  },
  // 槍口火光：往射擊方向噴的火星 + 一團亮光 + 瞬間照亮周圍
  muzzle(x, y, z, dx, dy, dz, color, size = 1) {
    const c = C(color);
    for (let i = 0; i < 4; i++) {
      const v = rand(8, 26);
      this.add.emit(x, y, z, dx * v + rand(-3, 3), dy * v + rand(-3, 3), dz * v + rand(-3, 3), rand(0.04, 0.1),
          1.5 * size, 0.3, c.r, c.g, c.b, 2.5);
    }
    this.add.emit(x, y, z, 0, 0, 0, 0.06, 3 * size, 1, 1, 0.9, 0.7, 2.2);
    this.light(x, y, z, color, 2.2 * size, 30, 0.07);
  },
  // 子彈命中敵人
  hit(x, y, z, color) {
    this.sparks(x, y, z, 5, color, 12, 0.35, 0.3);
    this.add.emit(x, y, z, 0, 0, 0, 0.08, 1.8, 0.4, 1, 0.9, 0.7, 1.6);
  },
  // 子彈打到地面或牆壁
  dustHit(x, y, z) {
    this.puff(x, y, z, 2, 1.6, 0.7, 0.42, 2, 2.5, 0.4);
    this.sparks(x, y, z, 3, 0xffc070, 9, 0.3, 0.22);
  },
  // 爆炸：火球 + 中心閃光 + 火花 + 濃煙 + 地面衝擊波 + 光源，r = 半徑
  explosion(x, y, z, r, color = 0xff8a30) {
    const c = C(color), n = Math.min(46, Math.floor(10 + r * 3));
    for (let i = 0; i < n; i++) {
      const a = rand(TAU), u = rand(-0.4, 1), s = Math.sqrt(1 - u * u), v = r * rand(0.6, 2.4);
      this.add.emit(x, y, z, Math.cos(a) * s * v, u * v, Math.sin(a) * s * v, rand(0.25, 0.6), r * rand(0.35, 0.7),
          r * 0.12, c.r, c.g * rand(0.6, 1), c.b * 0.6, 1.5, 0, 2.2);
    }
    this.add.emit(x, y, z, 0, 0, 0, 0.14, r * 1.6, r * 0.5, 1, 0.95, 0.8, 2.5);
    this.sparks(x, y, z, Math.min(30, 6 + r * 2), 0xffd080, r * 3.2, 0.9, 0.3);
    this.puff(x, y + r * 0.2, z, Math.min(14, 4 + r), r * 0.9, 1.8 + r * 0.06, 0.16, r * 0.7, r * 0.8, 0.6);
    this.ring(x, Math.max(0.2, y - r * 0.3), z, color, r * 0.2, r * 1.35, 0.35);
    this.light(x, y + 1, z, color, 3 + r * 0.35, 30 + r * 6, 0.3);
  },
  // 推進器噴出的火焰（一顆）
  thruster(x, y, z, vx, vy, vz, color, size = 1) {
    const c = C(color);
    this.add.emit(x, y, z, vx + rand(-2, 2), vy + rand(-2, 2), vz + rand(-2, 2), rand(0.12, 0.25), 1.2 * size,
        0.1, c.r, c.g, c.b, 1.6);
  },
  // 火焰噴射器的火團（會越飄越大並往上升）
  flame(x, y, z, vx, vy, vz, size = 1) {
    this.add.emit(x, y, z, vx, vy, vz, rand(0.3, 0.55), 0.8 * size, 3.4 * size, 1, rand(0.35, 0.6), 0.1, 1.1, -5, 1.6);
  },
  // 地圖上持續燃燒的火堆：火舌 + 偶爾冒出黑煙
  fireColumn(x, y, z, s) {
    this.add.emit(x + rand(-s, s) * 0.6, y, z + rand(-s, s) * 0.6, rand(-0.6, 0.6), rand(2.5, 5), rand(-0.6, 0.6),
        rand(0.5, 1.0), 1.8 * s, 0.3 * s, 1, rand(0.3, 0.55), 0.08, 1.0);
    if (Math.random() < 0.35) {
      const g = rand(0.06, 0.14);
      this.smoke.emit(x, y + 2 * s, z, rand(-1, 1) + 1.2, rand(3, 5), rand(-1, 1), rand(3, 5), 2 * s, 7 * s, g,
          g, g, 0.45, 0, 0.2);
    }
  },
  // 敵人或小兵空降時的光柱
  spawnBeam(x, z, color) {
    this.beam(x, 0, z, x, 120, z, color, 1.6, 0.6, 2);
    this.ring(x, 0.3, z, color, 0.5, 7, 0.6);
    this.sparks(x, 1, z, 10, color, 14, 0.6, 0.4);
  },

  // 每一格更新所有特效。h = 畫面高度（像素），用來換算粒子在畫面上的大小
  update(dt, camera, h) {
    this.add.mat.uniforms.uScale.value = this.smoke.mat.uniforms.uScale.value = h / (2 * Math.tan(camera.fov * PI / 360));
    this.add.update(dt);
    this.smoke.update(dt);
    // 光束：越來越細、越來越淡
    for (const m of this.beams) {
      const u = m.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      if (u.life <= 0) {
        m.visible = false;
        continue;
      }
      const k = u.life / u.max;
      m.material.opacity = k;
      m.scale.x = m.scale.y = u.w * (0.3 + 0.7 * k);
    }
    // 圓環：先快後慢地擴大並淡出
    for (const m of this.rings) {
      const u = m.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      if (u.life <= 0) {
        m.visible = false;
        continue;
      }
      const k = 1 - u.life / u.max;
      m.scale.setScalar(lerp(u.r0, u.r1, 1 - (1 - k) * (1 - k)));
      m.material.opacity = 1 - k;
    }
    // 光球：同上
    for (const m of this.spheres) {
      const u = m.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      if (u.life <= 0) {
        m.visible = false;
        continue;
      }
      const k = 1 - u.life / u.max;
      m.scale.setScalar(lerp(u.r0, u.r1, 1 - (1 - k) * (1 - k)));
      m.material.opacity = 0.8 * (1 - k);
    }
    // 光源：逐漸變暗
    for (const l of this.lights) {
      const u = l.userData;
      if (u.life <= 0) continue;
      u.life -= dt;
      l.intensity = u.life <= 0 ? 0 : u.base * (u.life / u.max);
    }
    // 傷害數字：往上飄，時間到就移除
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      t.y += dt * 4;
      if (t.life <= 0) this.texts.splice(i, 1);
    }
    this.shakeAmt = Math.max(0, this.shakeAmt - dt * 3.2);
    // 灰燼跟著鏡頭
    const p = this.ash.geometry.attributes.position.array, cx = camera.position.x, cy = camera.position.y,
        cz = camera.position.z;
    // 灰燼緩緩飄動；飄出鏡頭周圍的範圍就從另一側繞回來，看起來到處都有
    for (let i = 0; i < p.length; i += 3) {
      p[i] += dt * 1.6;
      p[i + 1] -= dt * 0.7;
      p[i + 2] += dt * 0.5;
      if (p[i] - cx > 70) p[i] -= 140;
      else if (p[i] - cx < -70) p[i] += 140;
      if (p[i + 1] - cy > 40) p[i + 1] -= 80;
      else if (p[i + 1] - cy < -40) p[i + 1] += 80;
      if (p[i + 2] - cz > 70) p[i + 2] -= 140;
      else if (p[i + 2] - cz < -70) p[i + 2] += 140;
    }
    this.ash.geometry.attributes.position.needsUpdate = true;
  },
};

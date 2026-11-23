/* 檔案導讀：讓靜態的角色圖「動起來」。
   每張圖切成小格子網格，依關節（rig-data.js）決定每一格跟著哪幾根骨頭，
   再用 WebGL 依姿勢把網格彎曲後畫出來；腳用兩段 IK 固定在地面上。
   姿勢要怎麼擺在 animation.js，這裡只負責「給一組姿勢參數，畫出一張圖」。

   姿勢參數（單位：角色圖的像素與角度，沒寫就是預設值）：
     x y        整個人的位移（y 往上為正）     rot 整個人繞骨盆旋轉
     sx sy      壓扁拉長（以地面為基準）
     px py      骨盆的位移（腳會留在原地）     prot 骨盆旋轉
     to hd      上半身、頭的旋轉（正 = 往前傾）
     au al ax   前手的大臂、前臂旋轉與長度倍率（出拳的縮放感）
     bx by br   後腳的位移與旋轉（by 往上為正） bk 腳掌跟著小腿轉的程度
     fx fy fr   前腳的位移與旋轉               fk 同上
     st         出拳圖的站姿：1 = 原圖的大步，0 = 和待機一樣的站距
     tl ss      馬尾、腰帶的擺動 */
(() => {
  const game = globalThis.Midnight;
  const CELL = 7; // 網格大小（圖片像素）
  const SMOOTH = 6; // 骨頭交界處的柔化次數
  const ALPHA = 46; // 這個透明度以下視為背景（原圖外圍有一圈很淡的光暈）
  const RAD = Math.PI / 180;

  // 骨頭的順序就是著色器裡的編號
  const BONES = [
    "pelvis",
    "torso",
    "head",
    "armU",
    "armL",
    "thighB",
    "shinB",
    "footB",
    "thighF",
    "shinF",
    "footF",
    "tail",
    "tail2",
    "sash",
  ];
  const INDEX = Object.fromEntries(BONES.map((name, i) => [name, i]));
  // 重疊時誰畫在上面（數字大的在上）
  const LAYER = {
    tail: 0,
    tail2: 0,
    thighB: 1,
    shinB: 1,
    footB: 1,
    pelvis: 2,
    thighF: 3,
    shinF: 3,
    footF: 3,
    sash: 4,
    torso: 5,
    head: 6,
    armU: 7,
    armL: 7,
  };

  // 每根骨頭由幾條線段組成：[骨頭, 起點, 終點, 粗細]。
  // 圖上的每一點，屬於「距離 ÷ 粗細」最小的那一根。
  const SEGMENTS = [
    ["pelvis", "pel", "pel", 30],
    ["torso", "waist", "neck", 52],
    ["torso", "shB", "elB", 30],
    ["torso", "elB", "haB", 26],
    ["torso", "shB", "shF", 30],
    ["head", "neckUp", "crown", 34],
    ["armU", "shF", "elF", 24],
    ["armL", "elF", "haF", 24],
    ["thighB", "hipB", "knB", 34],
    ["shinB", "knB", "anB", 30],
    ["footB", "anB", "toB", 30],
    ["thighF", "hipF", "knF", 34],
    ["shinF", "knF", "anF", 30],
    ["footF", "anF", "toF", 30],
  ];

  function segmentDistance(px, py, [ax, ay], [bx, by]) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    let t = len ? ((px - ax) * dx + (py - ay) * dy) / len : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - ax - dx * t, py - ay - dy * t);
  }

  function segmentsFor(joints, fat) {
    const { neck, crown } = joints;
    // 頭從脖子稍微往上算起，領口才會留在身體上
    const points = {
      ...joints,
      neckUp: [
        neck[0] + (crown[0] - neck[0]) * 0.3,
        neck[1] + (crown[1] - neck[1]) * 0.3,
      ],
    };
    const list = SEGMENTS.map(([bone, a, b, r]) => [
      INDEX[bone],
      points[a],
      points[b],
      r * (bone === "head" ? 1 : fat),
    ]);
    if (joints.tail) {
      const [root, mid, tip] = joints.tail;
      list.push([INDEX.tail, root, mid, 24], [INDEX.tail2, mid, tip, 26]);
    }
    if (joints.sash) {
      const [root, tip, tip2] = joints.sash;
      const lift = [(root[0] + tip2[0]) / 2 + 8, root[1]];
      list.push([INDEX.sash, root, tip, 13], [INDEX.sash, lift, tip2, 11]);
    }
    return list;
  }

  /* 建立一張圖的網格：頂點位置、貼圖座標、骨頭權重、畫的順序。
     frame 是 [sx, sy, sw, sh, anchor]，pixels 是整張圖集的像素。 */
  function buildMesh(frame, joints, fat, pixels, atlasW, atlasH) {
    const [sx, sy, sw, sh, anchor] = frame;
    const cols = Math.ceil(sw / CELL);
    const rows = Math.ceil(sh / CELL);
    const solid = (x, y) =>
      x >= 0 &&
      y >= 0 &&
      x < sw &&
      y < sh &&
      pixels[((sy + y) * atlasW + sx + x) * 4 + 3] > ALPHA;
    const filled = (cx, cy) => {
      for (let y = -1; y <= CELL; y += 1)
        for (let x = -1; x <= CELL; x += 1)
          if (solid(cx * CELL + x, cy * CELL + y)) return true;
      return false;
    };
    const cells = [];
    const ids = new Map(); // 格點 → 頂點編號
    const points = [];
    const links = [];
    const vertex = (gx, gy) => {
      const key = gy * (cols + 1) + gx;
      let id = ids.get(key);
      if (id === undefined) {
        id = points.length;
        ids.set(key, id);
        points.push([Math.min(sw, gx * CELL), Math.min(sh, gy * CELL)]);
        links.push(new Set());
      }
      return id;
    };
    for (let cy = 0; cy < rows; cy += 1)
      for (let cx = 0; cx < cols; cx += 1) {
        if (!filled(cx, cy)) continue;
        const a = vertex(cx, cy);
        const b = vertex(cx + 1, cy);
        const c = vertex(cx, cy + 1);
        const d = vertex(cx + 1, cy + 1);
        for (const [p, q] of [
          [a, b],
          [c, d],
          [a, c],
          [b, d],
        ]) {
          links[p].add(q);
          links[q].add(p);
        }
        cells.push([a, b, c, d]);
      }

    // 先決定每個頂點屬於哪根骨頭，再沿著網格把交界柔化
    const segments = segmentsFor(joints, fat);
    const count = BONES.length;
    let weights = points.map(([x, y]) => {
      let best = 0;
      let bestCost = Infinity;
      for (const [bone, p, q, r] of segments) {
        const cost = segmentDistance(x, y, p, q) / r;
        if (cost < bestCost) {
          bestCost = cost;
          best = bone;
        }
      }
      const row = new Float32Array(count);
      row[best] = 1;
      return row;
    });
    for (let step = 0; step < SMOOTH; step += 1) {
      weights = weights.map((row, i) => {
        const next = new Float32Array(count);
        const around = links[i];
        for (let b = 0; b < count; b += 1) {
          let sum = 0;
          for (const j of around) sum += weights[j][b];
          next[b] = row[b] * 0.4 + (sum / around.size) * 0.6;
        }
        return next;
      });
    }

    const data = new Float32Array(points.length * 12);
    points.forEach(([x, y], i) => {
      const order = [...weights[i].keys()]
        .sort((p, q) => weights[i][q] - weights[i][p])
        .slice(0, 4);
      const total = order.reduce((sum, b) => sum + weights[i][b], 0);
      data.set(
        [
          x - anchor,
          y - sh,
          (sx + x) / atlasW,
          (sy + y) / atlasH,
          ...order,
          ...order.map((b) => weights[i][b] / total),
        ],
        i * 12,
      );
    });
    const layerOf = ([a, b, c, d]) => {
      let best = 0;
      let bestWeight = -1;
      for (let k = 0; k < count; k += 1) {
        const w = weights[a][k] + weights[b][k] + weights[c][k] + weights[d][k];
        if (w > bestWeight) {
          bestWeight = w;
          best = k;
        }
      }
      return LAYER[BONES[best]];
    };
    const index = new Uint16Array(cells.length * 6);
    cells
      .map((cell) => [layerOf(cell), cell])
      .sort((p, q) => p[0] - q[0])
      .forEach(([, [a, b, c, d]], i) => index.set([a, b, c, b, d, c], i * 6));
    return { data, index };
  }

  /* ---------- 2D 仿射矩陣：[a, b, c, d, e, f]，x' = ax + cy + e ---------- */
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const apply = (m, [x, y]) => [
    m[0] * x + m[2] * y + m[4],
    m[1] * x + m[3] * y + m[5],
  ];
  // 把 from 這一點轉 angle 弧度後，放到 to
  const place = (from, to, angle) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    return [
      c,
      s,
      -s,
      c,
      to[0] - c * from[0] + s * from[1],
      to[1] - s * from[0] - c * from[1],
    ];
  };
  const turn = (pivot, degrees) => place(pivot, pivot, degrees * RAD);
  // 沿著某個方向拉長（以 pivot 為中心）
  const stretch = (pivot, dir, amount) => {
    const len = Math.hypot(dir[0], dir[1]) || 1;
    const x = dir[0] / len;
    const y = dir[1] / len;
    const k = amount - 1;
    const m = [1 + k * x * x, k * x * y, k * x * y, 1 + k * y * y, 0, 0];
    m[4] = pivot[0] - (m[0] * pivot[0] + m[2] * pivot[1]);
    m[5] = pivot[1] - (m[1] * pivot[0] + m[3] * pivot[1]);
    return m;
  };
  const sub = (p, q) => [p[0] - q[0], p[1] - q[1]];

  // 兩段 IK：大腿根到 hip、腳踝到 target，膝蓋彎的方向和原圖一樣
  function solveLeg(rest, hip, target) {
    const thigh = sub(rest.knee, rest.hip);
    const shin = sub(rest.ankle, rest.knee);
    const whole = sub(rest.ankle, rest.hip);
    const l1 = Math.hypot(...thigh);
    const l2 = Math.hypot(...shin);
    const to = sub(target, hip);
    const want = Math.hypot(...to) || 1;
    // 搆不到的話腿會稍微拉長一點點，避免腳被拖離地面
    const grow = Math.max(1, Math.min(1.1, want / (l1 + l2)));
    const a = l1 * grow;
    const b = l2 * grow;
    const d = Math.max(Math.abs(a - b) + 1, Math.min(a + b - 0.01, want));
    const bend = Math.acos(
      Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d))),
    );
    const side = thigh[0] * whole[1] - thigh[1] * whole[0] > 0 ? -1 : 1;
    const base = Math.atan2(to[1], to[0]);
    const thighAngle = base + side * bend;
    const knee = [
      hip[0] + Math.cos(thighAngle) * a,
      hip[1] + Math.sin(thighAngle) * a,
    ];
    const ankle = [
      hip[0] + Math.cos(base) * d,
      hip[1] + Math.sin(base) * d,
    ];
    const shinAngle = Math.atan2(ankle[1] - knee[1], ankle[0] - knee[0]);
    const thighTurn = thighAngle - Math.atan2(thigh[1], thigh[0]);
    const shinTurn = shinAngle - Math.atan2(shin[1], shin[0]);
    let upper = place(rest.hip, hip, thighTurn);
    let lower = place(rest.knee, knee, shinTurn);
    if (grow > 1) {
      upper = mul(upper, stretch(rest.hip, thigh, grow));
      lower = mul(lower, stretch(rest.knee, shin, grow));
    }
    return { upper, lower, ankle, shinTurn };
  }

  // 一張圖的關節（換算成以腳底中央為原點），以及「姿勢參數 → 每根骨頭的矩陣」
  class Skeleton {
    constructor(frame, joints) {
      const [, , , sh, anchor] = frame;
      const local = ([x, y]) => [x - anchor, y - sh];
      this.joints = {};
      for (const [name, value] of Object.entries(joints))
        this.joints[name] = Array.isArray(value[0])
          ? value.map(local)
          : local(value);
    }

    // idle：待機圖的骨架，st < 1 時用來把站距拉回待機的樣子
    solve(p, idle) {
      const j = this.joints;
      const loose = 1 - p.st;
      const shift = (name) => {
        const from = j[name];
        const to = idle.joints[name];
        return [(to[0] - from[0]) * loose, (to[1] - from[1]) * loose];
      };
      const pel = shift("pel");
      const hipMove = [1, 0, 0, 1, p.px + pel[0], p.py + pel[1]];
      const pelvis = mul(hipMove, turn(j.pel, p.prot));
      const torso = mul(pelvis, turn(j.waist, p.to));
      const head = mul(torso, turn(j.neck, p.hd));
      let armU = mul(torso, turn(j.shF, p.au));
      if (p.ax !== 1)
        armU = mul(armU, stretch(j.shF, sub(j.haF, j.shF), p.ax));
      const armL = mul(armU, turn(j.elF, p.al));

      const leg = (s, dx, dy, rot, follow) => {
        const rest = { hip: j["hip" + s], knee: j["kn" + s], ankle: j["an" + s] };
        const slide = shift("an" + s);
        const target = [
          rest.ankle[0] + slide[0] + dx,
          rest.ankle[1] + slide[1] - dy,
        ];
        const solved = solveLeg(rest, apply(pelvis, rest.hip), target);
        const angle = rot * RAD + solved.shinTurn * follow;
        return { ...solved, foot: place(rest.ankle, solved.ankle, angle) };
      };
      const back = leg("B", p.bx, p.by, p.br, p.bk);
      const front = leg("F", p.fx, p.fy, p.fr, p.fk);

      const tail = j.tail ? mul(head, turn(j.tail[0], p.tl)) : head;
      const tail2 = j.tail ? mul(tail, turn(j.tail[1], p.tl * 0.8)) : head;
      const sash = j.sash ? mul(pelvis, turn(j.sash[0], p.ss)) : pelvis;

      // 整個人：繞骨盆旋轉、壓扁拉長、位移
      const spin = turn(apply(pelvis, j.pel), p.rot);
      const body = mul([p.sx, 0, 0, p.sy, p.x, -p.y], spin);
      return [
        pelvis,
        torso,
        head,
        armU,
        armL,
        back.upper,
        back.lower,
        back.foot,
        front.upper,
        front.lower,
        front.foot,
        tail,
        tail2,
        sash,
      ].map((m) => mul(body, m));
    }
  }

  const VERTEX = `#version 300 es
in vec2 aPos; in vec2 aUv; in vec4 aBone; in vec4 aWeight;
uniform vec3 uBones[${BONES.length * 2}];
uniform vec4 uView;
out vec2 vUv; out float vHeight;
void main() {
  vec3 p = vec3(aPos, 1.0);
  vec2 q = vec2(0.0);
  for (int i = 0; i < 4; i++) {
    int b = int(aBone[i] + 0.5) * 2;
    q += aWeight[i] * vec2(dot(uBones[b], p), dot(uBones[b + 1], p));
  }
  vUv = aUv;
  vHeight = -q.y;
  gl_Position = vec4(q * uView.xy + uView.zw, 0.0, 1.0);
}`;

  /* 上色：把原圖外圍的淡光暈去掉、邊緣補上場景的環境光（左邊是暖色的路燈，
     右邊是冷色的霓虹），腳邊稍微壓暗，讓角色融進雨夜的場景。 */
  const FRAGMENT = `#version 300 es
precision highp float;
in vec2 vUv; in float vHeight;
uniform sampler2D uTex;
uniform vec4 uFlash;
uniform vec3 uRimA; uniform vec3 uRimB;
uniform float uPixel; uniform float uFace;
out vec4 color;
float cover(vec2 uv) {
  return smoothstep(0.22, 0.72, texture(uTex, uv, -0.6).a);
}
void main() {
  vec4 t = texture(uTex, vUv, -0.6);
  float a = smoothstep(0.22, 0.72, t.a);
  if (a < 0.004) discard;
  vec3 c = t.rgb / max(t.a, 0.2);
  vec2 dx = dFdx(vUv) * uPixel * uFace;
  vec2 dy = dFdy(vUv) * uPixel;
  // 畫布的 y 往下：dFdy 為正是往上
  float left = clamp(a - cover(vUv - dx * 3.2 + dy * 1.1), 0.0, 1.0);
  float right = clamp(a - cover(vUv + dx * 3.2 + dy * 1.1), 0.0, 1.0);
  float top = clamp(a - cover(vUv + dy * 2.6), 0.0, 1.0);
  float body = 0.8 + 0.2 * smoothstep(0.0, 190.0, vHeight);
  c *= mix(vec3(0.86, 0.9, 1.04), vec3(1.04, 1.02, 1.0), body);
  c *= body;
  c += uRimA * left * (0.6 + 0.4 * top) + uRimB * right * (0.6 + 0.4 * top);
  c += vec3(0.34, 0.4, 0.56) * top * 0.35;
  c = mix(c, uFlash.rgb, uFlash.a);
  color = vec4(clamp(c, 0.0, 1.0) * a, a);
}`;

  function compile(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  // 沒有特別指定時的環境光：暖色路燈與冷色霓虹
  const WARM = [0.85, 0.54, 0.29];
  const COOL = [0.31, 0.62, 0.85];

  /* 骨架渲染器：一張離屏的 WebGL 畫布，畫完由呼叫端貼到 2D 畫布上。
     logical 是畫布的尺寸（場地像素）與腳底中央的位置。 */
  class SpriteRig {
    constructor(atlas, logical, res) {
      this.logical = logical;
      this.res = res;
      this.canvas = document.createElement("canvas");
      this.canvas.width = Math.round(logical.width * res);
      this.canvas.height = Math.round(logical.height * res);
      const gl = this.canvas.getContext("webgl2", {
        alpha: true,
        antialias: false,
        depth: false,
        premultipliedAlpha: true,
        preserveDrawingBuffer: true,
      });
      if (!gl) throw new Error("WebGL2 unavailable");
      this.gl = gl;
      this.lost = false;
      this.canvas.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        this.lost = true;
      });
      this.canvas.addEventListener("webglcontextrestored", () => {
        this.setup(atlas);
        this.lost = false;
      });
      this.setup(atlas);
    }

    setup(atlas) {
      const { gl } = this;
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      const at = (name) => gl.getUniformLocation(program, name);
      this.uniforms = {
        bones: at("uBones"),
        view: at("uView"),
        flash: at("uFlash"),
        rimA: at("uRimA"),
        rimB: at("uRimB"),
        pixel: at("uPixel"),
        face: at("uFace"),
      };
      gl.uniform1i(at("uTex"), 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.clearColor(0, 0, 0, 0);

      const { width, height } = atlas;
      const source = document.createElement("canvas");
      source.width = width;
      source.height = height;
      const ctx = source.getContext("2d", { willReadFrequently: true });
      ctx.drawImage(atlas, 0, 0);
      const { data } = ctx.getImageData(0, 0, width, height);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      gl.generateMipmap(gl.TEXTURE_2D);
      const set = (key, value) => gl.texParameteri(gl.TEXTURE_2D, key, value);
      set(gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      set(gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      set(gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      set(gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      this.fighters = new Map();
      for (const profile of game.FIGHTERS) {
        const rig = game.RIG[profile.id];
        const scale = profile.size / profile.frames.idle[3];
        const sprites = {};
        for (const [name, frame] of Object.entries(profile.frames)) {
          const joints = rig[name];
          const mesh = buildMesh(frame, joints, rig.fat, data, width, height);
          sprites[name] = {
            skeleton: new Skeleton(frame, joints),
            ...this.upload(program, mesh),
          };
        }
        this.fighters.set(profile.id, { scale, sprites });
      }
      this.flat = new Float32Array(BONES.length * 6);
    }

    upload(program, { data, index }) {
      const { gl } = this;
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      let offset = 0;
      for (const [name, size] of [
        ["aPos", 2],
        ["aUv", 2],
        ["aBone", 4],
        ["aWeight", 4],
      ]) {
        const location = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, size, gl.FLOAT, false, 48, offset);
        offset += size * 4;
      }
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, index, gl.STATIC_DRAW);
      return { vao, count: index.length };
    }

    // 角色圖的一像素等於幾個場地像素
    scaleOf(id) {
      return this.fighters.get(id).scale;
    }

    // 某個關節在這個姿勢下的位置（場地像素，以腳底中央為原點、y 往上為正）
    point(id, sprite, pose, bone, joint) {
      const { scale, sprites } = this.fighters.get(id);
      const { skeleton } = sprites[sprite];
      const bones = skeleton.solve(pose, sprites.idle.skeleton);
      const [x, y] = apply(bones[INDEX[bone]], skeleton.joints[joint]);
      return [x * scale, -y * scale];
    }

    /* 畫一個角色，回傳畫布。look：
         flash 受擊閃光 [r, g, b, 強度]　face 面向（決定環境光打在哪一邊）
         warm cool 左右兩側的環境光 [r, g, b] */
    render(id, sprite, pose, look) {
      const { gl, uniforms, logical, res } = this;
      const { scale, sprites } = this.fighters.get(id);
      const { skeleton, vao, count } = sprites[sprite];
      const bones = skeleton.solve(pose, sprites.idle.skeleton);
      bones.forEach(([a, b, c, d, e, f], i) =>
        this.flat.set([a, c, e, b, d, f], i * 6),
      );
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform3fv(uniforms.bones, this.flat);
      gl.uniform4f(
        uniforms.view,
        (2 * scale) / logical.width,
        (-2 * scale) / logical.height,
        (2 * logical.x) / logical.width - 1,
        1 - (2 * logical.y) / logical.height,
      );
      gl.uniform4fv(uniforms.flash, look.flash ?? [0, 0, 0, 0]);
      gl.uniform3fv(uniforms.rimA, look.warm ?? WARM);
      gl.uniform3fv(uniforms.rimB, look.cool ?? COOL);
      gl.uniform1f(uniforms.pixel, res);
      gl.uniform1f(uniforms.face, look.face < 0 ? -1 : 1);
      gl.bindVertexArray(vao);
      gl.drawElements(gl.TRIANGLES, count, gl.UNSIGNED_SHORT, 0);
      return this.canvas;
    }
  }

  SpriteRig.REST = {
    x: 0,
    y: 0,
    rot: 0,
    sx: 1,
    sy: 1,
    px: 0,
    py: 0,
    prot: 0,
    to: 0,
    hd: 0,
    au: 0,
    al: 0,
    ax: 1,
    bx: 0,
    by: 0,
    br: 0,
    bk: 0,
    fx: 0,
    fy: 0,
    fr: 0,
    fk: 0,
    st: 1,
    tl: 0,
    ss: 0,
  };
  game.SpriteRig = SpriteRig;
})();

/* 檔案導讀：3D 與相容繪圖；角色及場景由程式建立，不需要外部模型。 */
/* Original procedural meshes and an instanced WebGL renderer. No network assets. */
(function () {
  "use strict";
  const TAU = Math.PI * 2,
    colors = new Map();
  // [dark shell / legs, glow accent] per bug kind; the main body colour comes from the engine.
  const BUG_PALETTE = {
    chaser: ["#5a2430", "#ffd6a0"],
    serpent: ["#6a2a44", "#ffd0a0"],
    ranged: ["#4a2a5e", "#ffe6ff"],
    swarm: ["#2a1d0a", "#ff6f59"],
    splitter: ["#3f7f2f", "#eaffd0"],
    mini: ["#4f8f3c", "#eaffd0"],
    charger: ["#5a2f1e", "#fff3a8"],
    bomber: ["#2a0f12", "#ffe084"],
    shield: ["#2a3e5e", "#e5f2ff"],
    healer: ["#2f5a45", "#7dffb0"],
    sniper: ["#3b2457", "#ff3b6b"],
  };
  function color(hex) {
    if (!colors.has(hex)) {
      const n = parseInt(hex.replace("#", ""), 16);
      colors.set(hex, [
        ((n >> 16) & 255) / 255,
        ((n >> 8) & 255) / 255,
        (n & 255) / 255,
      ]);
    }
    return colors.get(hex);
  }
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let c = 0; c < 4; c++)
      for (let r = 0; r < 4; r++)
        for (let k = 0; k < 4; k++)
          out[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
    return out;
  }
  function normalize(v) {
    const n = Math.hypot(...v) || 1;
    return v.map((x) => x / n);
  }
  function cross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }
  function lookAt(eye, target) {
    const z = normalize(eye.map((v, i) => v - target[i])),
      x = normalize(cross([0, 1, 0], z)),
      y = cross(z, x),
      dot = (v) => -v.reduce((sum, n, i) => sum + n * eye[i], 0);
    return new Float32Array([
      x[0],
      y[0],
      z[0],
      0,
      x[1],
      y[1],
      z[1],
      0,
      x[2],
      y[2],
      z[2],
      0,
      dot(x),
      dot(y),
      dot(z),
      1,
    ]);
  }
  function ortho(w, h) {
    return new Float32Array([
      2 / w,
      0,
      0,
      0,
      0,
      2 / h,
      0,
      0,
      0,
      0,
      -2 / 200,
      0,
      0,
      0,
      -1,
      1,
    ]);
  }
  function makeMeshes() {
    const meshes = {};
    const sphere = [],
      sn = [],
      si = [],
      rings = 10,
      sides = 16;
    for (let j = 0; j <= rings; j++) {
      const p = (Math.PI * j) / rings;
      for (let i = 0; i <= sides; i++) {
        const a = (TAU * i) / sides,
          v = [
            Math.sin(p) * Math.cos(a),
            Math.cos(p),
            Math.sin(p) * Math.sin(a),
          ];
        sphere.push(...v);
        sn.push(...v);
      }
    }
    for (let j = 0; j < rings; j++)
      for (let i = 0; i < sides; i++) {
        const a = j * (sides + 1) + i,
          b = a + sides + 1;
        si.push(a, b, a + 1, a + 1, b, b + 1);
      }
    meshes.sphere = { vertices: sphere, normals: sn, indices: si };
    const flat = (triangles) => {
      const v = [],
        n = [],
        indices = [];
      for (const t of triangles) {
        const ab = t[1].map((p, i) => p - t[0][i]),
          ac = t[2].map((p, i) => p - t[0][i]),
          normal = normalize(cross(ab, ac));
        for (const point of t) {
          indices.push(indices.length);
          v.push(...point);
          n.push(...normal);
        }
      }
      return { vertices: v, normals: n, indices };
    };
    const t = [],
      top = [0, 1, 0],
      bot = [0, -1, 0],
      rim = [
        [1, 0, 0],
        [0, 0, 1],
        [-1, 0, 0],
        [0, 0, -1],
      ];
    for (let i = 0; i < 4; i++) {
      t.push([top, rim[(i + 1) % 4], rim[i]], [bot, rim[i], rim[(i + 1) % 4]]);
    }
    meshes.gem = flat(t);
    const box = [],
      faces = [
        [
          [-1, -1, 1],
          [1, -1, 1],
          [1, 1, 1],
          [-1, 1, 1],
        ],
        [
          [1, -1, -1],
          [-1, -1, -1],
          [-1, 1, -1],
          [1, 1, -1],
        ],
        [
          [1, -1, 1],
          [1, -1, -1],
          [1, 1, -1],
          [1, 1, 1],
        ],
        [
          [-1, -1, -1],
          [-1, -1, 1],
          [-1, 1, 1],
          [-1, 1, -1],
        ],
        [
          [-1, 1, 1],
          [1, 1, 1],
          [1, 1, -1],
          [-1, 1, -1],
        ],
        [
          [-1, -1, -1],
          [1, -1, -1],
          [1, -1, 1],
          [-1, -1, 1],
        ],
      ];
    for (const f of faces) box.push([f[0], f[1], f[2]], [f[0], f[2], f[3]]);
    meshes.box = flat(box);
    const cone = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU,
        b = ((i + 1) / 8) * TAU,
        p = [Math.cos(a), 0, Math.sin(a)],
        q = [Math.cos(b), 0, Math.sin(b)];
      cone.push([[0, 1, 0], q, p], [[0, 0, 0], p, q]);
    }
    meshes.cone = flat(cone);
    const tv = [],
      tn = [],
      ti = [],
      segments = 64,
      tube = 6;
    for (let i = 0; i <= segments; i++)
      for (let j = 0; j <= tube; j++) {
        const a = (TAU * i) / segments,
          b = (TAU * j) / tube,
          r = 1 + 0.025 * Math.cos(b);
        tv.push(r * Math.cos(a), 0.025 * Math.sin(b), r * Math.sin(a));
        tn.push(
          Math.cos(b) * Math.cos(a),
          Math.sin(b),
          Math.cos(b) * Math.sin(a),
        );
      }
    for (let i = 0; i < segments; i++)
      for (let j = 0; j < tube; j++) {
        const a = i * (tube + 1) + j,
          b = a + tube + 1;
        ti.push(a, b, a + 1, a + 1, b, b + 1);
      }
    meshes.ring = { vertices: tv, normals: tn, indices: ti };
    return meshes;
  }
  const VERTEX = `
    precision highp float;
    attribute vec3 aPosition; attribute vec3 aNormal;
    attribute vec3 aOffset; attribute vec3 aScale; attribute vec3 aColor; attribute vec2 aMaterial;
    uniform mat4 uVP; uniform vec3 uEye;
    varying vec3 vNormal; varying vec3 vColor; varying vec3 vView; varying float vEmission; varying float vHeight;
    void main(){float c=cos(aMaterial.x),s=sin(aMaterial.x);vec3 p=aPosition*aScale;
      p=vec3(c*p.x-s*p.z,p.y,s*p.x+c*p.z)+aOffset;
      vec3 n=aNormal/max(abs(aScale),vec3(0.001));vNormal=normalize(vec3(c*n.x-s*n.z,n.y,s*n.x+c*n.z));
      vColor=aColor;vView=uEye-p;vEmission=aMaterial.y;vHeight=p.y;gl_Position=uVP*vec4(p,1.0);}`;
  const FRAGMENT = `
    precision mediump float;
    varying vec3 vNormal;varying vec3 vColor;varying vec3 vView;varying float vEmission;varying float vHeight;
    void main(){vec3 N=normalize(vNormal),V=normalize(vView),L=normalize(vec3(-0.6,1.0,0.5));
      float diffuse=max(dot(N,L),0.0);float rim=pow(1.0-max(dot(N,V),0.0),3.0);
      float spec=pow(max(dot(N,normalize(L+V)),0.0),48.0);
      vec3 col=vColor*(0.38+diffuse*0.65)+vec3(0.63,0.89,0.84)*spec*0.44+vColor*rim*0.35;
      col=mix(col,vColor*1.18,clamp(vEmission,0.0,1.0));gl_FragColor=vec4(col,1.0);}`;
  class Renderer {
    constructor(canvas, options = {}) {
      this.canvas = canvas;
      this.quality = options.quality || "high";
      this.preview = !!options.preview;
      this.width = 1;
      this.height = 1;
      this.gl = canvas.getContext("webgl", {
        alpha: this.preview,
        antialias: true,
        powerPreference: "high-performance",
        preserveDrawingBuffer: false,
      });
      this.batches = {};
      this.meshes = {};
      this.fallback = !this.gl;
      this.vp = new Float32Array(16);
      this.eye = [0, 45, 25];
      if (!this.gl) {
        this.ctx = canvas.getContext("2d");
        if (!this.ctx) throw new Error("無法建立遊戲畫布");
        this.fallbackItems = [];
        return;
      }
      const gl = this.gl;
      const compile = (type, source) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, source);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const vs = compile(gl.VERTEX_SHADER, VERTEX),
        fs = compile(gl.FRAGMENT_SHADER, FRAGMENT),
        p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(p));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      this.program = p;
      this.loc = {};
      for (const name of [
        "aPosition",
        "aNormal",
        "aOffset",
        "aScale",
        "aColor",
        "aMaterial",
      ])
        this.loc[name] = gl.getAttribLocation(p, name);
      this.uVP = gl.getUniformLocation(p, "uVP");
      this.uEye = gl.getUniformLocation(p, "uEye");
      this.instancing = gl.getExtension("ANGLE_instanced_arrays");
      for (const [key, mesh] of Object.entries(makeMeshes())) {
        const interleaved = [];
        for (let i = 0; i < mesh.vertices.length; i += 3)
          interleaved.push(
            ...mesh.vertices.slice(i, i + 3),
            ...mesh.normals.slice(i, i + 3),
          );
        const vbo = gl.createBuffer(),
          ibo = gl.createBuffer(),
          instances = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
        gl.bufferData(
          gl.ARRAY_BUFFER,
          new Float32Array(interleaved),
          gl.STATIC_DRAW,
        );
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
        gl.bufferData(
          gl.ELEMENT_ARRAY_BUFFER,
          new Uint16Array(mesh.indices),
          gl.STATIC_DRAW,
        );
        this.meshes[key] = {
          vbo,
          ibo,
          instances,
          count: mesh.indices.length,
          data: new Float32Array(16384),
          used: 0,
        };
      }
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this.lost = true;
        canvas.dispatchEvent(new CustomEvent("renderlost", { bubbles: true }));
      });
      canvas.addEventListener("webglcontextrestored", () => {
        location.reload();
      });
    }
    resize() {
      const ratio = Math.min(
          window.devicePixelRatio || 1,
          this.quality === "low" ? 1 : 1.75,
        ),
        w = this.canvas.clientWidth,
        h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.width = w;
      this.height = h;
      const pw = Math.round(w * ratio),
        ph = Math.round(h * ratio);
      if (this.canvas.width !== pw || this.canvas.height !== ph) {
        this.canvas.width = pw;
        this.canvas.height = ph;
      }
    }
    begin(eye, target, viewHeight, background = "#0b171c") {
      this.resize();
      this.eye = eye;
      this.vp = multiply(
        ortho((viewHeight * this.width) / this.height, viewHeight),
        lookAt(eye, target),
      );
      if (this.fallback) {
        this.fallbackItems.length = 0;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        if (!this.preview) {
          this.ctx.fillStyle = background;
          this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
        return;
      }
      if (this.lost) return;
      const gl = this.gl,
        bg = this.preview ? [0, 0, 0] : color(background);
      gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      gl.clearColor(...bg, this.preview ? 0 : 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(this.program);
      gl.uniformMatrix4fv(this.uVP, false, this.vp);
      gl.uniform3fv(this.uEye, eye);
      for (const m of Object.values(this.meshes)) m.used = 0;
    }
    draw(mesh, pos, scale, hex, yaw = 0, emission = 0) {
      if (this.fallback) {
        this.fallbackItems.push({ mesh, pos, scale, hex, yaw, emission });
        return;
      }
      const m = this.meshes[mesh];
      if (m.used + 11 >= m.data.length) {
        const larger = new Float32Array(m.data.length * 2);
        larger.set(m.data);
        m.data = larger;
      }
      // Write fields directly: thousands of draws per frame, so avoid building temporary arrays.
      const d = m.data,
        i = m.used,
        rgb = color(hex);
      d[i] = pos[0];
      d[i + 1] = pos[1];
      d[i + 2] = pos[2];
      d[i + 3] = scale[0];
      d[i + 4] = scale[1];
      d[i + 5] = scale[2];
      d[i + 6] = rgb[0];
      d[i + 7] = rgb[1];
      d[i + 8] = rgb[2];
      d[i + 9] = yaw;
      d[i + 10] = emission;
      m.used += 11;
    }
    end() {
      if (this.fallback) return this.endFallback();
      if (this.lost) return;
      const gl = this.gl,
        l = this.loc,
        ins = this.instancing;
      for (const m of Object.values(this.meshes)) {
        if (!m.used) continue;
        gl.bindBuffer(gl.ARRAY_BUFFER, m.vbo);
        gl.enableVertexAttribArray(l.aPosition);
        gl.vertexAttribPointer(l.aPosition, 3, gl.FLOAT, false, 24, 0);
        gl.enableVertexAttribArray(l.aNormal);
        gl.vertexAttribPointer(l.aNormal, 3, gl.FLOAT, false, 24, 12);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ibo);
        if (ins) {
          gl.bindBuffer(gl.ARRAY_BUFFER, m.instances);
          gl.bufferData(
            gl.ARRAY_BUFFER,
            m.data.subarray(0, m.used),
            gl.DYNAMIC_DRAW,
          );
          for (const [key, size, offset] of [
            ["aOffset", 3, 0],
            ["aScale", 3, 12],
            ["aColor", 3, 24],
            ["aMaterial", 2, 36],
          ]) {
            gl.enableVertexAttribArray(l[key]);
            gl.vertexAttribPointer(l[key], size, gl.FLOAT, false, 44, offset);
            ins.vertexAttribDivisorANGLE(l[key], 1);
          }
          ins.drawElementsInstancedANGLE(
            gl.TRIANGLES,
            m.count,
            gl.UNSIGNED_SHORT,
            0,
            m.used / 11,
          );
          for (const key of ["aOffset", "aScale", "aColor", "aMaterial"]) {
            ins.vertexAttribDivisorANGLE(l[key], 0);
            gl.disableVertexAttribArray(l[key]);
          }
        } else {
          for (const key of ["aOffset", "aScale", "aColor", "aMaterial"])
            gl.disableVertexAttribArray(l[key]);
          for (let i = 0; i < m.used; i += 11) {
            gl.vertexAttrib3fv(l.aOffset, m.data.subarray(i, i + 3));
            gl.vertexAttrib3fv(l.aScale, m.data.subarray(i + 3, i + 6));
            gl.vertexAttrib3fv(l.aColor, m.data.subarray(i + 6, i + 9));
            gl.vertexAttrib2fv(l.aMaterial, m.data.subarray(i + 9, i + 11));
            gl.drawElements(gl.TRIANGLES, m.count, gl.UNSIGNED_SHORT, 0);
          }
        }
      }
    }
    project(x, y, z) {
      const m = this.vp;
      return {
        x: (m[0] * x + m[4] * y + m[8] * z + m[12] + 1) * 0.5 * this.width,
        y: (1 - (m[1] * x + m[5] * y + m[9] * z + m[13])) * 0.5 * this.height,
        depth: m[2] * x + m[6] * y + m[10] * z + m[14],
      };
    }
    endFallback() {
      const ctx = this.ctx,
        ratio = this.canvas.width / this.width;
      ctx.save();
      ctx.scale(ratio, ratio);
      const items = this.fallbackItems
        .map((item) => ({ ...item, p: this.project(...item.pos) }))
        .sort((a, b) => b.p.depth - a.p.depth);
      for (const o of items) {
        const { x, y } = o.p,
          edge = this.project(o.pos[0] + o.scale[0], o.pos[1], o.pos[2]),
          size = Math.max(1, Math.hypot(edge.x - x, edge.y - y)),
          sy = Math.max(1, size * ((o.scale[1] / o.scale[0]) * 0.7 + 0.3));
        ctx.fillStyle = o.hex;
        if (o.mesh === "ring") {
          ctx.strokeStyle = o.hex;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.ellipse(x, y, size, size * 0.6, 0, 0, TAU);
          ctx.stroke();
        } else if (o.mesh === "gem" || o.mesh === "cone") {
          ctx.beginPath();
          ctx.moveTo(x, y - sy);
          ctx.lineTo(x + size, y);
          ctx.lineTo(x, y + sy);
          ctx.lineTo(x - size, y);
          ctx.closePath();
          ctx.fill();
        } else if (o.mesh === "box") {
          const corners = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([sx, sz]) =>
            this.project(
              o.pos[0] + sx * o.scale[0],
              o.pos[1] + o.scale[1],
              o.pos[2] + sz * o.scale[2],
            ),
          );
          ctx.beginPath();
          corners.forEach((p, i) =>
            i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
          );
          ctx.closePath();
          ctx.fill();
        } else {
          const grad = ctx.createRadialGradient(
            x - size * 0.3,
            y - sy * 0.4,
            0,
            x,
            y,
            size * 1.2,
          );
          grad.addColorStop(0, o.hex);
          grad.addColorStop(1, "#122329");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.ellipse(x, y, size, sy, 0, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
    snake(points, char, angle, time, options = {}) {
      const scale = options.scale || 1,
        base = options.y || 0.6;
      const model = char.id,
        flashing = options.flash,
        active = options.active;
      for (let i = points.length - 1; i >= 0; i--) {
        const p = points[i],
          y = (p.y ?? base) + Math.sin(time * 3 - i * 0.3) * 0.04,
          radius =
            scale *
            (i === 0
              ? 0.69
              : 0.48 * (1 - Math.pow(i / points.length, 3) * 0.65));
        const yaw =
          i === 0
            ? angle
            : Math.atan2(points[i - 1].z - p.z, points[i - 1].x - p.x);
        const bodyColor = flashing
          ? "#f9e6e2"
          : i % 5 === 3
            ? char.dark
            : char.color;
        this.draw(
          "sphere",
          [p.x, 0.035, p.z],
          [radius * 1.14, 0.018, radius * 0.88],
          "#0b191d",
        );
        this.draw(
          "sphere",
          [p.x, y, p.z],
          [radius * (i === 0 ? 1.23 : 1.03), radius * 0.85, radius],
          bodyColor,
          yaw,
        );
        if (i > 0 && i % 2 === 0) {
          if (model === "ember")
            this.draw(
              "cone",
              [p.x, y + radius * 0.65, p.z],
              [radius * 0.55, radius * 1.3, radius * 0.45],
              char.accent,
              yaw,
              0.15,
            );
          else if (model === "glacier")
            this.draw(
              "gem",
              [p.x, y + radius * 0.8, p.z],
              [radius * 0.38, radius * 0.75, radius * 0.38],
              char.accent,
              yaw,
              0.3,
            );
          else if (model === "nova")
            this.draw(
              "box",
              [p.x, y + radius * 0.72, p.z],
              [radius * 0.48, radius * 0.13, radius * 0.7],
              char.accent,
              yaw,
              0.1,
            );
          else
            this.draw(
              "sphere",
              [p.x, y + radius * 0.74, p.z],
              [radius * 0.42, radius * 0.16, radius * 0.48],
              char.accent,
              yaw,
              0.12,
            );
        }
      }
      const h = points[0],
        y = (h.y ?? base) + Math.sin(time * 3) * 0.04,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const at = (x, dy, z) => [
        h.x + (x * c - z * s) * scale,
        y + dy * scale,
        h.z + (x * s + z * c) * scale,
      ];
      for (const side of [-1, 1]) {
        this.draw(
          "sphere",
          at(0.25, 0.4, side * 0.43),
          [0.25 * scale, 0.29 * scale, 0.21 * scale],
          "#e9fff4",
          angle,
        );
        this.draw(
          "sphere",
          at(0.39, 0.43, side * 0.49),
          [0.13 * scale, 0.18 * scale, 0.1 * scale],
          "#102a30",
          angle,
          0.25,
        );
        this.draw(
          "sphere",
          at(0.44, 0.51, side * 0.51),
          [0.043 * scale, 0.057 * scale, 0.035 * scale],
          "#ffffff",
          angle,
          1,
        );
        if (model === "verdant")
          this.draw(
            "cone",
            at(-0.22, 0.42, side * 0.35),
            [0.17 * scale, 0.63 * scale, 0.22 * scale],
            char.accent,
            angle + side * 0.35,
          );
        else if (model === "ember")
          this.draw(
            "cone",
            at(-0.28, 0.45, side * 0.4),
            [0.16 * scale, 0.8 * scale, 0.18 * scale],
            char.accent,
            angle,
          );
        else if (model === "glacier")
          this.draw(
            "gem",
            at(-0.28, 0.6, side * 0.3),
            [0.18 * scale, 0.6 * scale, 0.19 * scale],
            char.accent,
            angle,
            0.2,
          );
        else
          this.draw(
            "box",
            at(-0.22, 0.52, side * 0.46),
            [0.25 * scale, 0.13 * scale, 0.17 * scale],
            char.accent,
            angle,
          );
      }
      this.draw(
        "sphere",
        at(0.78, 0.05, 0),
        [0.05 * scale, 0.075 * scale, 0.23 * scale],
        char.dark,
        angle,
      );
      if (active && model === "nova") {
        this.draw(
          "ring",
          [h.x, 0.8, h.z],
          [1.3, 1.3, 1.3],
          char.accent,
          time,
          1,
        );
        this.draw("ring", [h.x, 1.5, h.z], [1, 1, 1], char.accent, -time, 1);
      }
    }
    previewScene(char, time, rotation = 0) {
      const angle = 0.25 + rotation,
        eye = [Math.sin(angle) * 17, 12, Math.cos(angle) * 17];
      this.begin(eye, [0, 0.3, 0], this.width / this.height < 1.3 ? 11.4 : 8.8);
      this.draw("sphere", [0, -0.25, 0], [5.2, 0.35, 4.1], "#10282b");
      this.draw("ring", [0, -0.05, 0], [4.75, 0.8, 3.8], char.dark, 0, 0.3);
      this.draw("ring", [0, -0.02, 0], [4.6, 0.8, 3.65], char.color, 0, 0.8);
      for (let i = 0; i < 32; i++) {
        const a = (i * TAU) / 32;
        this.draw(
          "box",
          [Math.cos(a) * 4.8, 0, Math.sin(a) * 3.85],
          [0.08, 0.025, 0.025],
          i % 4 === 0 ? char.accent : char.dark,
          -a,
          0.4,
        );
      }
      const pts = [];
      for (let i = 0; i < 37; i++) {
        const a = 1.1 + i * 0.175,
          r = 3.2 - i * 0.045;
        pts.push({
          x: Math.cos(a) * r,
          z: Math.sin(a) * r * 0.8,
          y: 0.67 + Math.max(0, 1 - i / 9) * 1.2,
        });
      }
      const headAngle = Math.atan2(pts[0].z - pts[1].z, pts[0].x - pts[1].x);
      this.snake(pts, char, headAngle, time, { scale: 1.12 });
      for (let i = 0; i < 11; i++) {
        const a = i * 2.4 + time * 0.06;
        const radius = 3.9 + (i % 3) * 0.4;
        this.draw(
          "gem",
          [
            Math.cos(a) * radius,
            0.7 + Math.sin(time + i) * 0.2 + (i % 3) * 0.5,
            Math.sin(a) * radius * 0.7,
          ],
          [0.09, 0.16, 0.09],
          i % 3 === 0 ? char.accent : char.color,
          time + i,
          0.85,
        );
      }
      this.end();
    }
    // ---------- Bugs: shared parts ----------
    // Leg pairs that step in a walking rhythm: a thigh reaching out from the hip, then a shin down to the ground.
    bugLegs(x, z, a, hip, pairs, span, width, len, color, t, rate, walk) {
      const c = Math.cos(a),
        s = Math.sin(a);
      for (let k = 0; k < pairs; k++)
        for (const side of [-1, 1]) {
          const f = (k - (pairs - 1) / 2) * span,
            bx = x + c * f - s * side * width,
            bz = z + s * f + c * side * width;
          const ph = t * rate + k * 2.1 + (side > 0 ? 0 : Math.PI),
            yaw =
              a +
              side *
                (Math.PI / 2 -
                  (k - (pairs - 1) / 2) * 0.5 +
                  Math.sin(ph) * 0.38 * walk);
          const knee = hip + 0.05 + Math.max(0, Math.sin(ph)) * 0.07 * walk,
            fx = bx + Math.cos(yaw) * len,
            fz = bz + Math.sin(yaw) * len;
          this.draw(
            "box",
            [(bx + fx) / 2, knee, (bz + fz) / 2],
            [len / 2, 0.026, 0.026],
            color,
            yaw,
          );
          this.draw(
            "box",
            [fx, knee / 2, fz],
            [0.026, knee / 2, 0.026],
            color,
            yaw,
          );
        }
    }
    bugEyes(at, f, sd, y, r, color, glow) {
      for (const side of [-1, 1]) {
        this.draw("sphere", at(f, side * sd, y), [r, r, r], color, 0, glow);
        this.draw(
          "sphere",
          at(f + r * 0.55, side * sd * 1.05, y + r * 0.3),
          [r * 0.32, r * 0.32, r * 0.32],
          "#ffffff",
          0,
          1,
        );
      }
    }
    bugAntennae(x, z, a, f, sd, y, len, color, tip, t) {
      const c = Math.cos(a),
        s = Math.sin(a);
      for (const side of [-1, 1]) {
        const ya = a + side * (0.45 + Math.sin(t * 3 + side + x) * 0.12),
          bx = x + c * f - s * side * sd,
          bz = z + s * f + c * side * sd;
        this.draw(
          "box",
          [
            bx + (Math.cos(ya) * len) / 2,
            y + 0.1,
            bz + (Math.sin(ya) * len) / 2,
          ],
          [len / 2, 0.013, 0.013],
          color,
          ya,
        );
        this.draw(
          "sphere",
          [bx + Math.cos(ya) * len, y + 0.12, bz + Math.sin(ya) * len],
          [0.035, 0.035, 0.035],
          tip,
          0,
          1,
        );
      }
    }
    // 追獵蟲: a centipede whose legs ripple down every body segment.
    centipede(e, hex, dark, glow, t, s, walk) {
      const pts = e.body,
        n = pts.length;
      for (let i = n - 1; i >= 0; i--) {
        const p = pts[i],
          prev = pts[Math.max(0, i - 1)],
          yaw =
            i === 0
              ? e.angle
              : Math.atan2(prev.z - p.z, prev.x - p.x) || e.angle;
        const r = s * (i === 0 ? 0.42 : 0.36 - i * 0.013),
          y = 0.36 * s + Math.sin(t * 6 - i * 0.7) * 0.03 * walk,
          c = Math.cos(yaw),
          sn = Math.sin(yaw);
        this.draw("sphere", [p.x, 0.03, p.z], [r * 1.2, 0.02, r], "#0b181d");
        this.draw(
          "sphere",
          [p.x, y, p.z],
          [r * 1.05, r * 0.72, r],
          i % 2 ? hex : dark,
          yaw,
          0.12,
        );
        if (i === 0) continue;
        this.draw(
          "box",
          [p.x, y + r * 0.66, p.z],
          [r * 0.2, 0.02, r * 0.85],
          i % 2 ? dark : glow,
          yaw,
          0.35,
        );
        for (const side of [-1, 1]) {
          const ph = t * 14 - i * 0.9 + (side > 0 ? 0 : Math.PI),
            ly = yaw + side * (Math.PI / 2 + Math.sin(ph) * 0.35 * walk),
            len = r * 1.7;
          const bx = p.x - sn * side * r * 0.8,
            bz = p.z + c * side * r * 0.8,
            fx = bx + Math.cos(ly) * len,
            fz = bz + Math.sin(ly) * len,
            kn = y * 0.8 + Math.max(0, Math.sin(ph)) * 0.06 * walk;
          this.draw(
            "box",
            [(bx + fx) / 2, kn, (bz + fz) / 2],
            [len / 2, 0.022, 0.022],
            dark,
            ly,
          );
          this.draw("box", [fx, kn / 2, fz], [0.022, kn / 2, 0.022], dark, ly);
        }
      }
      const h = pts[0],
        a = e.angle,
        c = Math.cos(a),
        sn = Math.sin(a),
        at = (f, sd, y) => [h.x + c * f - sn * sd, y, h.z + sn * f + c * sd];
      for (const side of [-1, 1])
        this.draw(
          "gem",
          at(0.44 * s, side * 0.15 * s, 0.34 * s),
          [0.22 * s, 0.04, 0.05],
          "#ffd0a0",
          a - side * (0.55 + Math.sin(t * 8) * 0.25 * walk),
          0.4,
        );
      this.bugEyes(at, 0.28 * s, 0.17 * s, 0.5 * s, 0.07 * s, "#ffe9a8", 1);
      this.bugAntennae(
        h.x,
        h.z,
        a,
        0.32 * s,
        0.12 * s,
        0.46 * s,
        0.5 * s,
        dark,
        glow,
        t,
      );
      const tail = pts[n - 1],
        before = pts[n - 2] || tail,
        ta = Math.atan2(tail.z - before.z, tail.x - before.x);
      for (const side of [-1, 1])
        this.draw(
          "gem",
          [
            tail.x + Math.cos(ta + side * 0.35) * 0.3 * s,
            0.3 * s,
            tail.z + Math.sin(ta + side * 0.35) * 0.3 * s,
          ],
          [0.22 * s, 0.03, 0.04],
          dark,
          ta + side * 0.35,
        );
    }
    // Small monsters: each kind is a distinct, animated bug that can be recognised at a glance.
    enemyModel(e, g, t, still) {
      const frozen = g.frozen > 0,
        hex = frozen
          ? "#91e2f5"
          : e.flash > 0
            ? "#fff2d6"
            : e.color || "#ed777d",
        pal = BUG_PALETTE[e.kind] || ["#3a1c24", "#ffffff"],
        dark = frozen ? "#4d8fa3" : pal[0],
        glow = pal[1];
      const grow = e.age < 0.8 ? 0.4 + (Math.max(0, e.age) / 0.8) * 0.6 : 1,
        s = (e.elite ? 1.25 : 1) * grow,
        squash = e.flash > 0 ? 0.86 : 1;
      const a =
        (e.windup > 0 || e.charge > 0) && Number.isFinite(e.chargeAngle)
          ? e.chargeAngle
          : e.aim > 0 && Number.isFinite(e.aimAngle)
            ? e.aimAngle
            : e.angle;
      const c = Math.cos(a),
        sn = Math.sin(a),
        at = (f, sd, y) => [e.x + c * f - sn * sd, y, e.z + sn * f + c * sd];
      const walk = frozen || e.stunned > 0 ? 0 : still,
        breathe = Math.sin(t * 3 + (e.seed || 0)) * 0.025 * still;
      if (e.age < 0.8)
        this.draw(
          "ring",
          [e.x, 0.08, e.z],
          [e.r * 2, 0.5, e.r * 2],
          "#f09683",
          0,
          1,
        );
      if (e.serpent) this.centipede(e, hex, dark, glow, t, s, walk);
      else {
        this.draw(
          "sphere",
          [e.x, 0.03, e.z],
          [e.r * 1.3 * grow, 0.02, e.r * 1.05 * grow],
          "#0b181d",
        );
        switch (e.kind) {
          case "swarm": {
            const y = 0.95 * s + Math.sin(t * 9 + e.seed) * 0.16 * still,
              flap =
                0.4 +
                Math.abs(Math.sin(t * 34 + e.seed)) * 0.6 * walk +
                (1 - walk) * 0.6;
            this.draw(
              "sphere",
              at(0.2 * s, 0, y),
              [0.11 * s, 0.1 * s, 0.11 * s],
              dark,
              a,
            );
            this.bugEyes(
              at,
              0.26 * s,
              0.06 * s,
              y + 0.02,
              0.045 * s,
              "#ff3b3b",
              0.9,
            );
            this.draw(
              "sphere",
              at(0.02 * s, 0, y),
              [0.13 * s, 0.12 * s, 0.12 * s],
              hex,
              a,
              0.2,
            );
            for (const [f, r, col] of [
              [-0.18, 0.12, hex],
              [-0.31, 0.11, dark],
              [-0.42, 0.085, hex],
            ])
              this.draw(
                "sphere",
                at(f * s, 0, y - 0.02),
                [r * 1.15 * s, r * s * squash, r * s],
                col,
                a,
                0.25,
              );
            this.draw(
              "gem",
              at(-0.55 * s, 0, y - 0.03),
              [0.09 * s, 0.025, 0.025],
              "#fff3c0",
              a,
              0.8,
            );
            for (const side of [-1, 1])
              for (const k of [0, 1])
                this.draw(
                  "gem",
                  at(
                    (0.02 - k * 0.1) * s,
                    side * (0.2 + k * 0.04) * s,
                    y + 0.1,
                  ),
                  [(0.22 - k * 0.06) * s, 0.008, 0.07 * s * flap],
                  "#e9fbff",
                  a + side * (1.25 + k * 0.35),
                  0.6,
                );
            for (let k = 0; k < 3; k++)
              this.draw(
                "box",
                at((0.06 - k * 0.06) * s, 0, y - 0.14),
                [0.012, 0.08, 0.14 * s],
                dark,
                a,
              );
            break;
          }
          case "splitter":
          case "mini": {
            const R = e.r * grow,
              sq = 1 + Math.sin(t * 5 + e.seed) * 0.1 * still,
              y = R * 0.78;
            this.draw(
              "sphere",
              [e.x, y, e.z],
              [R * 1.05 * sq, ((R * 0.8) / sq) * squash, R * 1.05 * sq],
              hex,
              0,
              0.35,
            );
            this.draw(
              "ring",
              [e.x, y, e.z],
              [R * 1.07 * sq, 1.5, R * 1.07 * sq],
              glow,
              t * 0.5,
              0.5,
            );
            for (const side of e.kind === "splitter" ? [-1, 1] : [0])
              this.draw(
                "sphere",
                at(-0.05, side * R * 0.32, y + R * 0.05),
                [R * 0.3, R * 0.3, R * 0.3],
                dark,
                0,
                0.7,
              );
            if (e.kind === "splitter")
              this.draw(
                "box",
                [e.x, y + R * 0.62, e.z],
                [R * 0.8, 0.015, 0.02],
                dark,
                a,
              );
            for (let k = 0; k < 10; k++) {
              const ca = (k * TAU) / 10 + Math.sin(t * 6 + k) * 0.1 * still;
              this.draw(
                "box",
                [
                  e.x + Math.cos(ca) * R * 1.12,
                  y * 0.6,
                  e.z + Math.sin(ca) * R * 1.12,
                ],
                [0.07 * R + 0.02, 0.02, 0.02],
                glow,
                ca,
                0.4,
              );
            }
            this.bugEyes(
              at,
              R * 0.82,
              R * 0.3,
              y + R * 0.15,
              0.08 * R + 0.03,
              "#102a20",
              0,
            );
            if (e.kind === "splitter")
              for (const side of [-1, 1])
                this.draw(
                  "sphere",
                  at(-0.15 * R, side * R * 0.5, y + R * 0.7),
                  [R * 0.22, R * 0.22, R * 0.22],
                  "#c4f59e",
                  0,
                  0.5,
                );
            break;
          }
          case "charger": {
            const winding = e.windup > 0,
              rush = e.charge > 0,
              hot = winding || rush,
              shake = winding ? Math.sin(t * 60) * 0.05 * still : 0,
              y = 0.5 * s,
              at2 = (f, sd, yy) => at(f + shake, sd, yy);
            this.bugLegs(
              e.x,
              e.z,
              a,
              0.3 * s,
              3,
              0.3 * s,
              0.3 * s,
              0.46 * s,
              dark,
              t,
              rush ? 30 : winding ? 0 : 13,
              walk,
            );
            this.draw(
              "sphere",
              at2(-0.22 * s, 0, y),
              [0.62 * s, 0.4 * s * squash, 0.48 * s],
              hex,
              a,
              rush ? 0.5 : 0.12,
            );
            this.draw(
              "box",
              at2(-0.22 * s, 0, y + 0.38 * s),
              [0.56 * s, 0.018, 0.022],
              dark,
              a,
            );
            for (const side of [-1, 1])
              this.draw(
                "sphere",
                at2(-0.3 * s, side * 0.22 * s, y + 0.18 * s),
                [0.32 * s, 0.14 * s, 0.1 * s],
                "#ffb070",
                a,
                0.2,
              );
            this.draw(
              "sphere",
              at2(0.3 * s, 0, y + 0.06),
              [0.3 * s, 0.3 * s, 0.38 * s],
              dark,
              a,
            );
            this.draw(
              "gem",
              at2(0.38 * s, 0, y + 0.36 * s),
              [0.2 * s, 0.06, 0.06],
              dark,
              a,
            );
            this.draw(
              "sphere",
              at2(0.58 * s, 0, y - 0.04),
              [0.17 * s, 0.15 * s, 0.22 * s],
              hex,
              a,
            );
            this.draw(
              "gem",
              at2(0.88 * s, 0, y + 0.08),
              [0.36 * s, 0.09 * s, 0.09 * s],
              hot ? "#fff3a8" : "#ffd0a0",
              a,
              hot ? 1 : 0.3,
            );
            this.draw(
              "gem",
              at2(1.14 * s, 0, y + 0.26 * s),
              [0.06 * s, 0.2 * s, 0.06 * s],
              hot ? "#fff3a8" : "#ffd0a0",
              a,
              hot ? 1 : 0.3,
            );
            this.bugEyes(
              at2,
              0.66 * s,
              0.12 * s,
              y,
              0.055 * s,
              hot ? "#ff3b3b" : "#2a1208",
              hot ? 1 : 0,
            );
            if (winding)
              for (let k = 0; k < 3; k++) {
                const ph = (t * 3 + k * 0.33) % 1;
                this.draw(
                  "sphere",
                  at(-0.6 * s - ph * 0.5, (k - 1) * 0.3 * s, 0.1 + ph * 0.4),
                  [0.1 + ph * 0.12, 0.08 + ph * 0.1, 0.1 + ph * 0.12],
                  "#a08060",
                );
              }
            break;
          }
          case "bomber": {
            const lit =
                e.fuse > 0 &&
                Math.floor(t * (e.fuse < 0.4 ? 22 : 10)) % 2 === 0,
              swell =
                e.fuse > 0
                  ? 1 + (1 - e.fuse / (e.fuseMax || 1)) * 0.4
                  : 1 + breathe * 2,
              y = 0.55 * s;
            this.bugLegs(
              e.x,
              e.z,
              a,
              0.26 * s,
              3,
              0.2 * s,
              0.22 * s,
              0.3 * s,
              dark,
              t,
              e.fuse > 0 ? 0 : 18,
              walk,
            );
            this.draw(
              "sphere",
              at(-0.12 * s, 0, y),
              [0.5 * swell * s, 0.46 * swell * s * squash, 0.48 * swell * s],
              lit ? "#ffffff" : "#5a1f24",
              a,
              lit ? 1 : 0.1,
            );
            for (const k of [-0.3, -0.08, 0.14])
              this.draw(
                "box",
                at((k - 0.12) * s * swell, 0, y),
                [0.03, 0.44 * swell * s, 0.47 * swell * s],
                hex,
                a,
                lit ? 1 : 0.8,
              );
            this.draw(
              "sphere",
              at(0.4 * s, 0, y - 0.1),
              [0.17 * s, 0.14 * s, 0.18 * s],
              dark,
              a,
            );
            this.bugEyes(at, 0.5 * s, 0.09 * s, y - 0.06, 0.05 * s, glow, 1);
            this.draw(
              "box",
              at(-0.18 * s, 0, y + 0.55 * swell * s),
              [0.025, 0.12, 0.025],
              "#b49a7a",
            );
            this.draw(
              "gem",
              at(-0.18 * s, 0, y + 0.72 * swell * s),
              [0.08, 0.11, 0.08],
              Math.floor(t * 14) % 2 ? "#ffe084" : "#ff8a3d",
              t * 8,
              1,
            );
            break;
          }
          case "shield": {
            const y = 0.42 * s + breathe,
              broken = e.shieldBreak > 0;
            this.bugLegs(
              e.x,
              e.z,
              a,
              0.22 * s,
              4,
              0.2 * s,
              0.32 * s,
              0.32 * s,
              dark,
              t,
              12,
              walk,
            );
            for (let k = 0; k < 5; k++)
              this.draw(
                "sphere",
                at((0.32 - k * 0.2) * s, 0, y),
                [
                  0.16 * s,
                  (0.34 - Math.abs(k - 1.5) * 0.04) * s * squash,
                  0.48 * s,
                ],
                k % 2 ? hex : "#5c86c4",
                a,
                0.1,
              );
            this.draw(
              "box",
              at(-0.08 * s, 0, y + 0.36 * s),
              [0.5 * s, 0.018, 0.02],
              dark,
              a,
            );
            this.draw(
              "sphere",
              at(0.5 * s, 0, y - 0.08),
              [0.13 * s, 0.11 * s, 0.2 * s],
              dark,
              a,
            );
            this.bugEyes(at, 0.58 * s, 0.1 * s, y - 0.04, 0.05 * s, glow, 0.9);
            this.bugAntennae(
              e.x,
              e.z,
              a,
              0.6 * s,
              0.1 * s,
              y - 0.02,
              0.3 * s,
              dark,
              glow,
              t,
            );
            if (!broken) {
              this.draw(
                "box",
                at(0.82 * s, 0, 0.62 * s),
                [0.07, 0.5 * s, 0.58 * s],
                "#cfe3ff",
                a,
                0.55,
              );
              for (const yy of [1.1, 0.14])
                this.draw(
                  "box",
                  at(0.85 * s, 0, yy * s),
                  [0.08, 0.04, 0.6 * s],
                  "#9fb8de",
                  a,
                  0.4,
                );
              this.draw(
                "gem",
                at(0.88 * s, 0, 0.62 * s),
                [0.04, 0.2 * s, 0.2 * s],
                "#7fb4ff",
                a,
                1,
              );
            } else
              for (const side of [-1, 1])
                this.draw(
                  "box",
                  at(0.62 * s, side * 0.55 * s, 0.2),
                  [0.07, 0.16, 0.28],
                  "#6b84a8",
                  a + side * 0.7,
                );
            break;
          }
          case "healer": {
            const y = s + Math.sin(t * 2.2 + e.seed) * 0.12 * still,
              flap = Math.sin(t * 5 + e.seed) * 0.35 * walk,
              charge = e.special < 0.4 ? 1 - Math.max(0, e.special) / 0.4 : 0;
            for (const side of [-1, 1])
              for (const k of [0, 1]) {
                const wa =
                    a + Math.PI + side * (1.2 + k * 0.5 + flap * (k ? 0.6 : 1)),
                  reach = (0.42 - k * 0.12) * s;
                this.draw(
                  "gem",
                  [
                    e.x + Math.cos(wa) * reach,
                    y + 0.1 - k * 0.08,
                    e.z + Math.sin(wa) * reach,
                  ],
                  [(0.5 - k * 0.18) * s, 0.012, (0.3 - k * 0.1) * s],
                  k ? "#8fe0b0" : hex,
                  wa,
                  0.45,
                );
                if (!k)
                  this.draw(
                    "sphere",
                    [
                      e.x + Math.cos(wa) * 0.58 * s,
                      y + 0.12,
                      e.z + Math.sin(wa) * 0.58 * s,
                    ],
                    [0.08 * s, 0.012, 0.08 * s],
                    glow,
                    0,
                    1,
                  );
              }
            this.draw(
              "sphere",
              at(-0.22 * s, 0, y - 0.05),
              [0.3 * s, 0.18 * s, 0.17 * s],
              "#d9f7e4",
              a,
            );
            this.draw(
              "sphere",
              at(0, 0, y),
              [0.2 * s, 0.22 * s * squash, 0.2 * s],
              "#f2fff6",
              a,
              0.3,
            );
            this.draw(
              "sphere",
              at(0.2 * s, 0, y + 0.04),
              [0.13 * s, 0.13 * s, 0.13 * s],
              "#ffffff",
              a,
              0.2,
            );
            this.bugEyes(
              at,
              0.27 * s,
              0.09 * s,
              y + 0.06,
              0.06 * s,
              "#123a28",
              0.2,
            );
            for (const side of [-1, 1])
              this.draw(
                "gem",
                at(0.36 * s, side * 0.14 * s, y + 0.22),
                [0.16 * s, 0.02, 0.06 * s],
                "#d8ffe6",
                a + side * 0.6,
                0.4,
              );
            this.draw(
              "ring",
              [e.x, y + 0.55 * s, e.z],
              [0.32 * s, 0.6, 0.32 * s],
              glow,
              t,
              1,
            );
            this.draw(
              "box",
              [e.x, y + 0.85 * s, e.z],
              [0.16 * s, 0.045, 0.05],
              glow,
              t * 2,
              1,
            );
            this.draw(
              "box",
              [e.x, y + 0.85 * s, e.z],
              [0.05, 0.045, 0.16 * s],
              glow,
              t * 2,
              1,
            );
            if (charge > 0)
              this.draw(
                "ring",
                [e.x, 0.08, e.z],
                [6 * charge, 0.5, 6 * charge],
                glow,
                0,
                1,
              );
            break;
          }
          case "sniper": {
            const aiming = e.aim > 0,
              locked = aiming && e.aim <= 0.3,
              y = 0.55 * s;
            this.bugLegs(
              e.x,
              e.z,
              a,
              0.32 * s,
              2,
              0.4 * s,
              0.16 * s,
              0.55 * s,
              dark,
              t,
              9,
              walk,
            );
            this.draw(
              "gem",
              at(-0.38 * s, 0, y),
              [0.38 * s, 0.16 * s * squash, 0.17 * s],
              hex,
              a,
              0.1,
            );
            this.draw(
              "gem",
              at(-0.32 * s, 0, y + 0.14 * s),
              [0.36 * s, 0.02, 0.15 * s],
              "#8a5fc4",
              a,
              0.2,
            );
            this.draw(
              "box",
              at(0.02 * s, 0, y + 0.32 * s),
              [0.07 * s, 0.34 * s, 0.07 * s],
              dark,
              a,
            );
            this.draw(
              "gem",
              at(0.1 * s, 0, y + 0.72 * s),
              [0.16 * s, 0.12 * s, 0.2 * s],
              hex,
              a,
              0.1,
            );
            for (const side of [-1, 1]) {
              this.draw(
                "sphere",
                at(0.14 * s, side * 0.14 * s, y + 0.76 * s),
                [0.08 * s, 0.08 * s, 0.08 * s],
                aiming ? glow : "#c58bff",
                0,
                aiming ? 1 : 0.35,
              );
              this.draw(
                "box",
                at(0.2 * s, side * 0.1 * s, y + 0.45 * s),
                [0.2 * s, 0.03, 0.03],
                dark,
                a,
              );
              this.draw(
                "box",
                at(0.36 * s, side * 0.1 * s, y + 0.36 * s),
                [0.03, 0.1 * s, 0.03],
                dark,
                a,
              );
            }
            this.draw(
              "box",
              at(0.55 * s, 0, y + 0.68 * s),
              [0.38 * s, 0.035, 0.035],
              locked ? "#ffffff" : "#d9c2ff",
              a,
              aiming ? 1 : 0.2,
            );
            break;
          }
          case "ranged": {
            const y = 0.5 * s + breathe,
              recoil = Math.max(0, Math.min(1, (e.shot - 2.35) / 0.45));
            this.bugLegs(
              e.x,
              e.z,
              a,
              0.3 * s,
              2,
              0.36 * s,
              0.3 * s,
              0.44 * s,
              dark,
              t,
              11,
              walk,
            );
            this.draw(
              "sphere",
              at(-0.08 * s, 0, y),
              [0.5 * s, 0.4 * s * squash, 0.48 * s],
              hex,
              a,
              0.12,
            );
            for (const k of [-0.25, 0.05])
              this.draw(
                "box",
                at(k * s, 0, y + 0.38 * s),
                [0.04, 0.02, 0.42 * s],
                dark,
                a,
              );
            this.draw(
              "box",
              at((-0.05 - recoil * 0.12) * s, 0, y + 0.45 * s),
              [0.36 * s, 0.1 * s, 0.1 * s],
              dark,
              a,
            );
            this.draw(
              "sphere",
              at((0.3 - recoil * 0.12) * s, 0, y + 0.45 * s),
              [0.11 * s, 0.11 * s, 0.11 * s],
              recoil > 0 ? "#ffffff" : glow,
              0,
              0.6 + recoil * 0.4,
            );
            this.draw(
              "sphere",
              at(0.48 * s, 0, y - 0.04),
              [0.17 * s, 0.15 * s, 0.2 * s],
              dark,
              a,
            );
            this.bugEyes(at, 0.58 * s, 0.1 * s, y, 0.06 * s, glow, 1);
            break;
          }
          default: {
            // 斥候蟲 (and training targets): a quick scout beetle with a glowing spot on its back.
            const y = 0.48 * s + breathe;
            this.bugLegs(
              e.x,
              e.z,
              a,
              0.3 * s,
              3,
              0.26 * s,
              0.26 * s,
              0.42 * s,
              dark,
              t,
              16,
              e.dummy ? 0 : walk,
            );
            this.draw(
              "sphere",
              at(-0.12 * s, 0, y),
              [0.52 * s, 0.36 * s * squash, 0.46 * s],
              hex,
              a,
              0.12,
            );
            this.draw(
              "box",
              at(-0.12 * s, 0, y + 0.34 * s),
              [0.48 * s, 0.018, 0.02],
              dark,
              a,
            );
            this.draw(
              "sphere",
              at(-0.3 * s, 0, y + 0.22 * s),
              [0.14 * s, 0.08 * s, 0.12 * s],
              glow,
              0,
              1,
            );
            this.draw(
              "sphere",
              at(0.34 * s, 0, y - 0.02),
              [0.22 * s, 0.19 * s, 0.28 * s],
              dark,
              a,
            );
            this.draw(
              "sphere",
              at(0.55 * s, 0, y - 0.06),
              [0.16 * s, 0.14 * s, 0.18 * s],
              hex,
              a,
              0.1,
            );
            this.bugEyes(
              at,
              0.64 * s,
              0.1 * s,
              y - 0.02,
              0.065 * s,
              "#1a0a0e",
              0.1,
            );
            this.bugAntennae(
              e.x,
              e.z,
              a,
              0.66 * s,
              0.1 * s,
              y + 0.02,
              0.32 * s,
              dark,
              glow,
              t,
            );
          }
        }
      }
      if (e.elite) {
        this.draw(
          "ring",
          [e.x, 0.07, e.z],
          [e.r * 1.9, 0.6, e.r * 1.9],
          "#ffd27a",
          0,
          1,
        );
        this.draw(
          "gem",
          [
            e.x,
            (e.kind === "healer" || e.kind === "sniper" ? 2.4 : 1.6) +
              Math.sin(t * 3) * 0.1,
            e.z,
          ],
          [0.16, 0.24, 0.16],
          "#ffd27a",
          t * 2,
          1,
        );
      }
      if (e.stunned > 0)
        for (let i = 0; i < 3; i++) {
          const sa = t * 5 + i * 2.1;
          this.draw(
            "gem",
            [e.x + Math.cos(sa) * 0.5, 1.45, e.z + Math.sin(sa) * 0.5],
            [0.09, 0.12, 0.09],
            "#fff3a8",
            sa,
            1,
          );
        }
    }
    // Bosses: layered models that change with each phase.
    bossModel(e, g, t, still) {
      const p = e.phase || 1,
        roar = e.roar > 0,
        pulse = roar ? 1 + Math.sin(t * 30) * 0.07 * still : 1,
        flash = e.flash > 0,
        frozen = g.frozen > 0;
      const tint = (hex) => (frozen ? "#91e2f5" : flash ? "#fff2d6" : hex);
      const a =
          (e.windup > 0 || e.charge > 0) && Number.isFinite(e.chargeAngle)
            ? e.chargeAngle
            : e.angle,
        c = Math.cos(a),
        sn = Math.sin(a);
      const at = (f, sd, y) => [
        e.x + c * f - sn * sd,
        y,
        e.z + sn * f + c * sd,
      ];
      this.draw("sphere", [e.x, 0.04, e.z], [3.2, 0.025, 2.7], "#10171d");
      this.draw(
        "ring",
        [e.x, 0.08, e.z],
        [3.4, 0.6, 3.4],
        p >= 3 ? "#ff6579" : e.color,
        0,
        1,
      );
      for (let i = 0; i < 3; i++) {
        const pa = t * 0.5 + (i * TAU) / 3;
        this.draw(
          "gem",
          [e.x + Math.cos(pa) * 3.4, 0.25, e.z + Math.sin(pa) * 3.4],
          [0.16, 0.22, 0.16],
          i < p ? "#ffffff" : "#3a4048",
          pa,
          i < p ? 1 : 0,
        );
      }
      if (e.variant === 0) {
        const lava = p === 1 ? "#ff7a2e" : p === 2 ? "#ff9a3d" : "#ffd27a",
          glow = 0.6 + p * 0.14,
          rock = tint("#352a25"),
          rock2 = tint("#463830");
        for (const side of [-1, 1]) {
          this.draw(
            "box",
            at(-0.1, side * 0.85, 0.7),
            [0.55, 0.7, 0.55],
            "#2b221e",
            a,
          );
          this.draw(
            "box",
            at(0.3, side * 1.75, 1.75),
            [0.42, 0.85, 0.42],
            rock2,
            a,
          );
          this.draw(
            "gem",
            at(0, side * 1.55, 2.95),
            [0.8 * pulse, 0.9 * pulse, 0.8 * pulse],
            rock,
            a + side * 0.4,
          );
          this.draw(
            "box",
            at(0.5, side * 1.8, 0.95),
            [0.32, 0.16, 0.32],
            lava,
            a,
            glow,
          );
          this.draw(
            "box",
            at(0.31, side * 1.75, 1.75),
            [0.44, 0.07, 0.44],
            lava,
            a,
            glow,
          );
        }
        this.draw(
          "box",
          at(0, 0, 2.1),
          [1.5 * pulse, 1.15 * pulse, 1.25 * pulse],
          rock,
          a,
        );
        for (const [dy, w, rot] of [
          [0.15, 0.1, 0],
          [-0.35, 0.08, 0.25],
          [0.5, 0.08, -0.3],
        ])
          this.draw(
            "box",
            at(0.02, 0, 2.1 + dy),
            [1.53 * pulse, w, 1.28 * pulse],
            lava,
            a + rot,
            glow,
          );
        this.draw(
          "box",
          at(0.02, 0, 2.15),
          [1.53 * pulse, 0.95, 0.1],
          lava,
          a + 0.3,
          glow,
        );
        this.draw(
          "gem",
          at(1.25, 0, 2.2),
          [0.42 + p * 0.08, 0.55 + p * 0.1, 0.42 + p * 0.08],
          lava,
          t,
          1,
        );
        this.draw("box", at(0.2, 0, 3.55), [0.58, 0.44, 0.58], rock2, a);
        for (const side of [-1, 1])
          this.draw(
            "gem",
            at(0.78, side * 0.22, 3.62),
            [0.17, 0.12, 0.17],
            "#fff0b0",
            a,
            1,
          );
        const rocks = 4 + p * 2;
        for (let i = 0; i < rocks; i++) {
          const ra = t * 0.8 + (i * TAU) / rocks;
          this.draw(
            "gem",
            [
              e.x + Math.cos(ra) * 3.3,
              1.2 + Math.sin(t * 2 + i) * 0.4 * still,
              e.z + Math.sin(ra) * 3.3,
            ],
            [0.32, 0.4, 0.3],
            i % 2 ? "#3d312a" : lava,
            ra,
            i % 2 ? 0 : 0.7,
          );
        }
        if (p >= 2)
          for (let i = 0; i < 5; i++) {
            const da = i * 1.3 + e.x,
              drip = (t * 0.8 + i * 0.21) % 1;
            this.draw(
              "sphere",
              [
                e.x + Math.cos(da) * 1.3,
                2.4 * (1 - drip),
                e.z + Math.sin(da) * 1.1,
              ],
              [0.12, 0.16, 0.12],
              lava,
              0,
              1,
            );
          }
        if (p >= 3)
          for (let i = 0; i < 6; i++) {
            const ca = (i * TAU) / 6 + t;
            this.draw(
              "cone",
              [
                e.x + Math.cos(ca) * 0.45 + c * 0.2,
                3.8,
                e.z + Math.sin(ca) * 0.45 + sn * 0.2,
              ],
              [0.12, 0.6, 0.12],
              "#ffb36b",
              ca,
              1,
            );
          }
      } else if (e.variant === 1) {
        this.draw(
          "sphere",
          at(-1.5, 0, 1.4),
          [1.7 * pulse, 1.15 * pulse, 1.3 * pulse],
          tint("#5a2d6b"),
          a,
          0.1,
        );
        for (let k = 0; k < 3; k++)
          this.draw(
            "box",
            at(-2.1 + k * 0.55, 0, 1.45),
            [
              0.07,
              1.08 - Math.abs(k - 1) * 0.15,
              1.24 - Math.abs(k - 1) * 0.15,
            ],
            "#e6a6ff",
            a,
            0.7,
          );
        this.draw("sphere", at(0, 0, 1.9), [1.05, 0.95, 1.05], tint("#8d4fa8"));
        this.draw(
          "sphere",
          at(1.1, 0, 2.3),
          [0.7, 0.6, 0.65],
          tint("#a65fc4"),
          a,
        );
        for (const side of [-1, 1]) {
          this.draw(
            "gem",
            at(1.62, side * 0.32, 2.45),
            [0.16, 0.12, 0.16],
            "#ffe084",
            a,
            1,
          );
          this.draw(
            "gem",
            at(1.78, side * 0.25, 2.0),
            [0.32, 0.07, 0.07],
            "#f2c4ff",
            a + side * 0.45,
            0.6,
          );
        }
        for (let i = 0; i < 5; i++) {
          const ca = (i - 2) * 0.38;
          this.draw(
            "gem",
            at(
              1.0 + Math.cos(ca) * 0.1,
              Math.sin(ca) * 0.55,
              3.05 + (i === 2 ? 0.2 : 0),
            ),
            [0.12, 0.36, 0.12],
            "#f2c4ff",
            a,
            1,
          );
        }
        for (const side of [-1, 1])
          for (let k = 0; k < 2; k++) {
            const flap = Math.sin(t * 14 + k + side) * 0.35 * still;
            this.draw(
              "gem",
              at(-0.3 - k * 0.6, side * (1.25 + k * 0.2), 2.75 + flap * 0.5),
              [1.15 - k * 0.25, 0.03, 0.45],
              "#f3d9ff",
              a + side * (0.9 + k * 0.35 + flap * 0.3),
              0.6,
            );
          }
        for (const side of [-1, 1])
          for (let k = 0; k < 3; k++)
            this.draw(
              "box",
              at(0.4 - k * 0.45, side * 1.05, 0.55),
              [0.06, 0.55, 0.06],
              "#3d1f4a",
              a,
            );
        const eggs = 3 + p;
        for (let i = 0; i < eggs; i++) {
          const ea = -t * 0.9 + (i * TAU) / eggs;
          this.draw(
            "sphere",
            [
              e.x + Math.cos(ea) * 3.1,
              1 + Math.sin(t * 3 + i) * 0.25 * still,
              e.z + Math.sin(ea) * 3.1,
            ],
            [0.28, 0.36, 0.28],
            "#e6a6ff",
            0,
            0.8,
          );
        }
        if (e.guard > 0)
          for (let k = 0; k < 3; k++)
            this.draw(
              "ring",
              [e.x, 1 + k * 1.1, e.z],
              [3 - k * 0.4, 2, 3 - k * 0.4],
              k % 2 ? "#9be8ff" : "#ffd0ff",
              t * (k % 2 ? -2 : 2),
              1,
            );
      } else {
        const charging = e.windup > 0 || e.charge > 0,
          stunned = e.stunned > 0,
          y = stunned ? 1.3 : 2.4 + Math.sin(t) * 0.2 * still;
        this.draw(
          "gem",
          [e.x, y, e.z],
          [1.25 * pulse, 2 * pulse, 1.25 * pulse],
          charging ? "#ffffff" : tint("#83d6ed"),
          t * 0.6,
          charging ? 1 : 0.5,
        );
        this.draw("gem", [e.x, y, e.z], [0.6, 1, 0.6], "#ffffff", -t, 1);
        const rings = 2 + p;
        for (let i = 0; i < rings; i++) {
          const r = 2.2 - i * 0.22 - (charging ? 0.5 : 0);
          this.draw(
            "ring",
            [e.x, (stunned ? 0.4 : 1.2) + i * 0.75, e.z],
            [r, 1.5, r],
            i % 2 ? "#83d6ed" : "#e5fcff",
            t * (i % 2 ? 1 : -1),
            1,
          );
        }
        const shards = 6 + p * 2;
        for (let j = 0; j < shards; j++) {
          const sa = t * (stunned ? 0.4 : 2.5) + (j * TAU) / shards;
          this.draw(
            "gem",
            [
              e.x + Math.cos(sa) * 2.8,
              stunned ? 0.35 : y + Math.sin(t * 3 + j) * 0.5 * still,
              e.z + Math.sin(sa) * 2.8,
            ],
            [0.17, 0.6, 0.17],
            j % 3 ? "#a9ecff" : "#ffffff",
            sa,
            0.9,
          );
        }
        if (p >= 3 && !stunned) {
          const f = Math.floor(t * 12);
          for (let k = 0; k < 4; k++) {
            const la = (f * 1.7 + k * 1.57) % TAU;
            this.draw(
              "box",
              [
                e.x + Math.cos(la) * 1.6,
                y + Math.sin(f + k) * 0.6,
                e.z + Math.sin(la) * 1.6,
              ],
              [1.1, 0.03, 0.03],
              "#ffffff",
              la,
              1,
            );
          }
        }
        if (charging)
          for (let k = 1; k <= 3; k++)
            this.draw(
              "gem",
              [e.x - Math.cos(a) * k * 0.9, y, e.z - Math.sin(a) * k * 0.9],
              [1.1 - k * 0.2, 1.7 - k * 0.3, 1.1 - k * 0.2],
              "#bfefff",
              t,
              0.6,
            );
      }
      if (e.stunned > 0)
        for (let i = 0; i < 4; i++) {
          const sa = t * 4 + (i * TAU) / 4;
          this.draw(
            "gem",
            [e.x + Math.cos(sa) * 1.1, 4.4, e.z + Math.sin(sa) * 1.1],
            [0.16, 0.22, 0.16],
            "#fff3a8",
            sa,
            1,
          );
        }
    }
    // Power-ups: a pedestal and loot beam (visible from afar) plus an object you can name at a glance.
    powerModel(f, def, t, still) {
      const rainbow = ["#ff8fb1", "#ffd27a", "#9df5a8", "#8fd3ff", "#c7a6ff"],
        col = f.type === "rainbow" ? rainbow[Math.floor(t * 6) % 5] : def.color;
      const y = 1.05 + Math.sin(t * 2.4 + f.phase) * 0.15 * still,
        spin = t * 1.6 + f.phase,
        c = Math.cos(spin),
        s = Math.sin(spin),
        at = (fw, sd, yy) => [f.x + c * fw - s * sd, yy, f.z + s * fw + c * sd];
      this.draw("sphere", [f.x, 0.01, f.z], [0.8, 0.02, 0.8], "#0d1a20");
      this.draw("sphere", [f.x, 0.04, f.z], [0.5, 0.05, 0.5], "#1c2a33");
      const pulse = 0.62 + Math.sin(t * 4 + f.phase) * 0.08 * still;
      this.draw("ring", [f.x, 0.07, f.z], [pulse, 0.5, pulse], col, 0, 1);
      this.draw("ring", [f.x, 0.07, f.z], [0.46, 0.4, 0.46], "#ffffff", 0, 0.6);
      this.draw("box", [f.x, 2.4, f.z], [0.025, 2.3, 0.025], col, 0, 1);
      switch (f.type) {
        case "speed": {
          const tilt = Math.sin(t * 3 + f.phase) * 0.06 * still;
          this.draw(
            "box",
            at(0, 0, y),
            [0.42, 0.022, 0.022],
            "#f5fffd",
            spin,
            0.6,
          );
          for (let k = 0; k < 6; k++) {
            const fw = -0.3 + k * 0.11,
              len = 0.2 - Math.abs(k - 2.5) * 0.025;
            for (const side of [-1, 1])
              this.draw(
                "gem",
                at(fw, side * len * 0.9, y + tilt * side),
                [0.06, 0.012, len],
                k % 2 ? col : "#bffaf0",
                spin + side * 0.35,
                0.7,
              );
          }
          this.draw(
            "gem",
            at(0.44, 0, y),
            [0.06, 0.02, 0.03],
            "#ffffff",
            spin,
            1,
          );
          for (let k = 0; k < 3; k++) {
            const a = t * 4 * still + k * 2.1;
            this.draw(
              "box",
              [
                f.x + Math.cos(a) * 0.55,
                y - 0.2 + k * 0.15,
                f.z + Math.sin(a) * 0.55,
              ],
              [0.12, 0.01, 0.015],
              "#d9fff8",
              a + Math.PI / 2,
              1,
            );
          }
          break;
        }
        case "magnet": {
          for (const side of [-1, 1]) {
            const arm = side > 0 ? "#e04f6f" : col;
            this.draw(
              "box",
              at(0, side * 0.15, y + 0.06),
              [0.07, 0.2, 0.07],
              arm,
              spin,
              0.3,
            );
            this.draw(
              "box",
              at(0, side * 0.15, y + 0.3),
              [0.075, 0.05, 0.075],
              "#e8eef5",
              spin,
              0.5,
            );
            this.draw(
              "sphere",
              at(0, side * 0.13, y - 0.13),
              [0.075, 0.075, 0.075],
              arm,
            );
          }
          this.draw(
            "box",
            at(0, 0, y - 0.16),
            [0.07, 0.06, 0.2],
            col,
            spin,
            0.3,
          );
          this.draw(
            "box",
            at(0, 0, y + 0.36 + (Math.floor(t * 12) % 2) * 0.03 * still),
            [0.02, 0.01, 0.13],
            "#ffffff",
            spin,
            1,
          );
          for (let k = 0; k < 4; k++) {
            const a = t * 3 * still + (k * Math.PI) / 2;
            this.draw(
              "sphere",
              [
                f.x + Math.cos(a) * 0.45,
                y + Math.sin(a * 2) * 0.15,
                f.z + Math.sin(a) * 0.45,
              ],
              [0.04, 0.04, 0.04],
              "#e3d8ff",
              0,
              1,
            );
          }
          break;
        }
        case "fury": {
          for (const [fw, dy, r] of [
            [0.18, 0.14, 0.11],
            [0.08, 0.05, 0.12],
            [-0.04, -0.02, 0.11],
            [-0.15, -0.06, 0.09],
            [-0.24, -0.07, 0.065],
            [-0.31, -0.04, 0.045],
          ])
            this.draw(
              "sphere",
              at(fw, 0, y + dy),
              [r * 1.2, r, r],
              col,
              spin,
              0.35,
            );
          this.draw(
            "sphere",
            at(0.24, 0, y + 0.2),
            [0.06, 0.06, 0.08],
            "#4f9a3c",
            spin,
          );
          this.draw(
            "box",
            at(0.27, 0, y + 0.29),
            [0.025, 0.08, 0.025],
            "#7bd88f",
            spin,
          );
          for (let k = 0; k < 3; k++) {
            const ph = ((t * 2.5 + k / 3) % 1) * still + (1 - still) * 0.3,
              a = k * 2.1;
            this.draw(
              "cone",
              [
                f.x + Math.cos(a) * 0.15,
                y + 0.25 + ph * 0.35,
                f.z + Math.sin(a) * 0.15,
              ],
              [
                0.06 * (1 - ph) + 0.02,
                0.14 * (1 - ph) + 0.04,
                0.06 * (1 - ph) + 0.02,
              ],
              ph < 0.5 ? "#ffb347" : "#ff6f59",
              0,
              1,
            );
          }
          break;
        }
        case "shield": {
          this.draw(
            "box",
            at(0, 0, y + 0.04),
            [0.04, 0.2, 0.24],
            col,
            spin,
            0.4,
          );
          this.draw(
            "gem",
            at(0, 0, y - 0.2),
            [0.04, 0.14, 0.2],
            col,
            spin,
            0.4,
          );
          this.draw(
            "box",
            at(0.03, 0, y + 0.25),
            [0.05, 0.03, 0.26],
            "#e8f6ff",
            spin,
            0.7,
          );
          this.draw(
            "box",
            at(0.045, 0, y),
            [0.02, 0.16, 0.04],
            "#ffffff",
            spin,
            1,
          );
          this.draw(
            "box",
            at(0.045, 0, y + 0.06),
            [0.02, 0.04, 0.14],
            "#ffffff",
            spin,
            1,
          );
          for (let k = 0; k < 2; k++)
            this.draw(
              "ring",
              [f.x, y - 0.1 + k * 0.3, f.z],
              [0.48, 2, 0.48],
              k ? "#ffffff" : col,
              (k ? -1 : 1) * t * 2,
              1,
            );
          break;
        }
        case "bomb": {
          this.draw(
            "sphere",
            [f.x, y, f.z],
            [0.3, 0.29, 0.3],
            "#3a2a2a",
            spin,
            0.05,
          );
          for (const [dy, r] of [
            [0, 0.305],
            [0.13, 0.27],
            [-0.13, 0.27],
          ])
            this.draw("ring", [f.x, y + dy, f.z], [r, 1.2, r], "#ff8a3d", 0, 1);
          this.draw(
            "box",
            [f.x, y + 0.33, f.z],
            [0.035, 0.07, 0.035],
            "#b49a7a",
          );
          this.draw(
            "box",
            at(0.06, 0, y + 0.41),
            [0.07, 0.025, 0.025],
            "#b49a7a",
            spin,
          );
          const sp = Math.floor(t * 14) % 2;
          this.draw(
            "gem",
            at(0.13, 0, y + 0.43),
            [0.07 + sp * 0.02, 0.09 + sp * 0.03, 0.07 + sp * 0.02],
            sp ? "#ffe084" : col,
            t * 9,
            1,
          );
          this.draw(
            "cone",
            at(-0.08, 0.06, y + 0.3),
            [0.07, 0.12, 0.04],
            "#7bd88f",
            spin - 0.6,
          );
          break;
        }
        default: {
          this.draw("gem", [f.x, y, f.z], [0.26, 0.4, 0.26], col, spin, 1);
          this.draw(
            "gem",
            [f.x, y, f.z],
            [0.14, 0.25, 0.14],
            "#ffffff",
            -spin * 1.5,
            1,
          );
          rainbow.forEach((cc, k) => {
            const a = t * 2 * still + (k * TAU) / 5;
            this.draw(
              "sphere",
              [
                f.x + Math.cos(a) * 0.5,
                y + Math.sin(t * 3 + k) * 0.12,
                f.z + Math.sin(a) * 0.5,
              ],
              [0.06, 0.06, 0.06],
              cc,
              0,
              1,
            );
          });
        }
      }
    }
    gameScene(g, camera, reducedMotion, zoom = 1) {
      const w = Serpent.WORLDS[g.world],
        FOODS = Serpent.FOODS,
        h = g.snake[0],
        t = g.time,
        still = reducedMotion ? 0 : 1;
      const viewHeight = (this.canvas.clientWidth < 650 ? 36 : 43) * zoom;
      this.viewHeight = viewHeight;
      this.begin(
        [camera.x, 48, camera.z + 30],
        [camera.x, 0, camera.z],
        viewHeight,
        w.background,
      );
      const bound = g.bound,
        halfW = ((viewHeight * this.width) / this.height) * 0.55,
        halfH = viewHeight * 0.7;
      const visible = (p, margin = 5) =>
        Math.abs(p.x - camera.x) < halfW + margin &&
        Math.abs(p.z - camera.z) < halfH + margin;
      this.draw("box", [0, -0.28, 0], [bound + 1, 0.25, bound + 1], w.floor);
      for (const p of g.patches)
        if (visible(p, p.r))
          this.draw(
            "sphere",
            [p.x, -0.02, p.z],
            [p.r, 0.012, p.r * 0.8],
            w.patches[p.tint],
            p.rotation,
          );
      // Grid lines are clipped to the visible window instead of spanning the whole (large) map.
      const gx0 = Math.max(-bound, Math.ceil((camera.x - halfW - 6) / 3) * 3),
        gx1 = Math.min(bound, camera.x + halfW + 6),
        gz0 = Math.max(-bound, Math.ceil((camera.z - halfH - 6) / 3) * 3),
        gz1 = Math.min(bound, camera.z + halfH + 6);
      const zLo = Math.max(-bound, camera.z - halfH - 6),
        zHi = Math.min(bound, camera.z + halfH + 6),
        xLo = Math.max(-bound, camera.x - halfW - 6),
        xHi = Math.min(bound, camera.x + halfW + 6);
      if (zHi > zLo)
        for (let i = gx0; i <= gx1; i += 3)
          this.draw(
            "box",
            [i, -0.015, (zLo + zHi) / 2],
            [0.015, 0.01, (zHi - zLo) / 2],
            w.grid,
            0,
            0.25,
          );
      if (xHi > xLo)
        for (let i = gz0; i <= gz1; i += 3)
          this.draw(
            "box",
            [(xLo + xHi) / 2, -0.015, i],
            [(xHi - xLo) / 2, 0.01, 0.015],
            w.grid,
            0,
            0.25,
          );
      for (const x of [-bound, bound]) {
        this.draw("box", [x, 0.3, 0], [0.12, 0.3, bound], w.rock);
        this.draw("box", [x, 0.63, 0], [0.07, 0.025, bound], w.crystal, 0, 0.8);
      }
      for (const z of [-bound, bound]) {
        this.draw("box", [0, 0.3, z], [bound, 0.3, 0.12], w.rock);
        this.draw("box", [0, 0.63, z], [bound, 0.025, 0.07], w.crystal, 0, 0.8);
      }
      // Terrain zones: healing springs plus the world-specific slow / slippery / sinking ground.
      for (const z of g.zones) {
        if (!visible(z, z.r)) continue;
        if (z.type === "spring") {
          const fill = z.charge / z.max,
            water = fill > 0.2 ? "#3fc9a3" : "#2a6f60",
            stones = 14;
          this.draw(
            "sphere",
            [z.x, -0.005, z.z],
            [z.r + 0.35, 0.02, z.r + 0.35],
            "#1a2a26",
          );
          for (let k = 0; k < stones; k++) {
            const a = (k * TAU) / stones;
            this.draw(
              "box",
              [z.x + Math.cos(a) * z.r, 0.16, z.z + Math.sin(a) * z.r],
              [0.42, 0.16 + (k % 2) * 0.03, 0.2],
              k % 2 ? "#6f8f86" : "#5b7a72",
              a + Math.PI / 2,
            );
          }
          this.draw(
            "ring",
            [z.x, 0.34, z.z],
            [z.r + 0.02, 0.7, z.r + 0.02],
            "#7ef0c8",
            0,
            0.9,
          );
          this.draw(
            "sphere",
            [z.x, 0.02, z.z],
            [z.r * 0.95, 0.03, z.r * 0.95],
            "#123a33",
          );
          this.draw(
            "sphere",
            [z.x, 0.06, z.z],
            [z.r * (0.3 + fill * 0.62), 0.03, z.r * (0.3 + fill * 0.62)],
            water,
            0,
            0.7,
          );
          for (let k = 0; k < 2; k++) {
            const rr =
              z.r *
              0.9 *
              (((t * 0.45 + k * 0.5) % 1) * still + (1 - still) * 0.6);
            this.draw("ring", [z.x, 0.09, z.z], [rr, 0.5, rr], "#bfffe9", 0, 1);
          }
          this.draw("cone", [z.x, 0, z.z], [0.45, 0.95, 0.45], "#6f8f86");
          this.draw("sphere", [z.x, 0.95, z.z], [0.6, 0.12, 0.6], "#7fa59b");
          this.draw(
            "sphere",
            [z.x, 1.0, z.z],
            [0.48, 0.05, 0.48],
            water,
            0,
            0.8,
          );
          this.draw(
            "box",
            [z.x, 1.15 + fill * 0.25, z.z],
            [0.06, 0.1 + fill * 0.25, 0.06],
            "#bfffe9",
            0,
            1,
          );
          for (let k = 0; k < 6; k++) {
            const ph = ((t * 1.1 + k / 6) % 1) * still + (1 - still) * 0.5,
              ang = (k * TAU) / 6,
              r = 0.2 + ph * 1.2;
            this.draw(
              "sphere",
              [
                z.x + Math.cos(ang) * r,
                1.3 + fill * 0.4 + ph * 0.5 - ph * ph * 1.5,
                z.z + Math.sin(ang) * r,
              ],
              [0.06 * (0.4 + fill), 0.07 * (0.4 + fill), 0.06 * (0.4 + fill)],
              "#bfffe9",
              0,
              1,
            );
          }
          const cy = 2.35 + Math.sin(t * 2) * 0.12 * still;
          this.draw("box", [z.x, cy, z.z], [0.24, 0.07, 0.07], "#7ef0c8", t, 1);
          this.draw("box", [z.x, cy, z.z], [0.07, 0.07, 0.24], "#7ef0c8", t, 1);
        } else {
          const zw = w.zone;
          this.draw(
            "sphere",
            [z.x, -0.005, z.z],
            [z.r, 0.02, z.r * 0.92],
            zw.color,
          );
          this.draw(
            "ring",
            [z.x, 0.04, z.z],
            [z.r, 0.6, z.r * 0.92],
            zw.accent,
            0,
            0.55,
          );
          if (g.world === 0)
            for (let k = 0; k < 6; k++) {
              const a = k * 2.1 + z.z,
                r = z.r * (0.25 + (k % 3) * 0.22),
                pop = ((t * 0.7 + k * 0.37) % 1) * still;
              this.draw(
                "sphere",
                [z.x + Math.cos(a) * r, 0.02, z.z + Math.sin(a) * r],
                [0.15 + pop * 0.25, 0.05 + pop * 0.1, 0.15 + pop * 0.25],
                "#4d5e2c",
              );
              if (k % 2 === 0)
                this.draw(
                  "cone",
                  [
                    z.x + Math.cos(a) * z.r * 0.95,
                    0,
                    z.z + Math.sin(a) * z.r * 0.9,
                  ],
                  [0.08, 0.9, 0.08],
                  "#6f8a3c",
                  a,
                );
            }
          else if (g.world === 1) {
            this.draw(
              "sphere",
              [z.x - z.r * 0.25, 0.012, z.z - z.r * 0.2],
              [z.r * 0.45, 0.01, z.r * 0.12],
              "#bfe9f7",
              0.6,
              0.7,
            );
            for (let k = 0; k < 5; k++) {
              const a = k * 1.25 + z.x;
              this.draw(
                "gem",
                [
                  z.x + Math.cos(a) * z.r * 0.9,
                  0.15,
                  z.z + Math.sin(a) * z.r * 0.85,
                ],
                [0.25, 0.35, 0.18],
                "#d8f6ff",
                a,
                0.4,
              );
            }
          } else
            for (let k = 0; k < 14; k++) {
              const f = (k / 14 + t * 0.12 * still) % 1,
                a = k * 0.9 + f * 4,
                r = z.r * (1 - f) * 0.95;
              this.draw(
                "box",
                [z.x + Math.cos(a) * r, 0.02, z.z + Math.sin(a) * r],
                [0.28, 0.02, 0.05],
                "#d39a5b",
                a + Math.PI / 2,
                0.3,
              );
            }
        }
      }
      // Boost pads: a framed metal plate whose chevrons light up in sequence.
      for (const p of g.pads) {
        if (!visible(p, 2)) continue;
        const c = Math.cos(p.angle),
          s = Math.sin(p.angle),
          hot = p.cooldown > 0,
          at = (f, sd, y) => [p.x + c * f - s * sd, y, p.z + s * f + c * sd];
        this.draw("sphere", [p.x, -0.005, p.z], [1.6, 0.03, 1.6], "#1d2a18");
        this.draw(
          "box",
          at(0, 0, 0.03),
          [1.12, 0.04, 0.78],
          "#33402a",
          p.angle,
        );
        for (const side of [-1, 1]) {
          this.draw(
            "box",
            at(0, side * 0.8, 0.07),
            [1.18, 0.06, 0.06],
            "#8a9a5a",
            p.angle,
          );
          this.draw(
            "box",
            at(side * 1.15, 0, 0.07),
            [0.06, 0.06, 0.82],
            "#8a9a5a",
            p.angle,
          );
        }
        for (const f of [-1, 1])
          for (const sd of [-1, 1])
            this.draw(
              "sphere",
              at(f * 1.05, sd * 0.7, 0.1),
              [0.06, 0.04, 0.06],
              hot ? "#f4ffc0" : "#d9f77b",
              0,
              hot ? 1 : 0.5,
            );
        this.draw(
          "ring",
          [p.x, 0.04, p.z],
          [1.5, 0.5, 1.5],
          "#d9f77b",
          0,
          hot ? 1 : 0.45,
        );
        for (let k = 0; k < 3; k++) {
          const lit =
              hot ||
              (((t * 2.5 - k / 3) % 1) + 1) % 1 <
                0.45 * still + (1 - still) * 0.45,
            d = (k - 1) * 0.5,
            cx = p.x + c * d,
            cz = p.z + s * d;
          for (const side of [-1, 1]) {
            const a = p.angle + Math.PI + side * 0.75;
            this.draw(
              "box",
              [cx + Math.cos(a) * 0.28, 0.09, cz + Math.sin(a) * 0.28],
              [0.3, 0.03, 0.065],
              lit ? "#e8ff9a" : "#55642a",
              a,
              lit ? 1 : 0.2,
            );
          }
        }
        if (hot)
          this.draw(
            "box",
            at(0, 0, 0.5),
            [1.0, 0.45, 0.02],
            "#e8ff9a",
            p.angle,
            1,
          );
      }
      // Paired portals share a colour so you can tell which exits connect.
      for (const p of g.portals) {
        if (!visible(p, 3)) continue;
        const hue = p.pair ? "#7fd1ff" : "#c49bff",
          deep = p.pair ? "#163049" : "#24173a";
        this.draw("sphere", [p.x, -0.005, p.z], [2.05, 0.04, 2.05], "#2a2638");
        this.draw("sphere", [p.x, 0.01, p.z], [1.75, 0.03, 1.75], deep);
        this.draw(
          "sphere",
          [p.x, 0.03, p.z],
          [1.3, 0.02, 1.3],
          hue,
          t * 2,
          0.7,
        );
        for (let k = 0; k < 4; k++) {
          const a = (k * TAU) / 4 + 0.4;
          this.draw(
            "box",
            [p.x + Math.cos(a) * 1.85, 0.75, p.z + Math.sin(a) * 1.85],
            [0.18, 0.75, 0.18],
            "#3b3550",
            a,
          );
          this.draw(
            "gem",
            [
              p.x + Math.cos(a) * 1.85,
              1.68 + Math.sin(t * 3 + k) * 0.06 * still,
              p.z + Math.sin(a) * 1.85,
            ],
            [0.14, 0.22, 0.14],
            hue,
            t + k,
            1,
          );
        }
        for (let k = 0; k < 12; k++) {
          const ph = ((t * 0.6 + k / 12) % 1) * still + (1 - still) * (k / 12),
            ang = k * 2.4 + t * 2 * still,
            r = 1.3 * (1 - ph);
          this.draw(
            "gem",
            [p.x + Math.cos(ang) * r, 0.12 + ph * 0.9, p.z + Math.sin(ang) * r],
            [0.07, 0.11, 0.07],
            k % 3 ? hue : "#ffffff",
            ang,
            1,
          );
        }
        for (let k = 0; k < 2; k++) {
          const r = 1.2 - 0.15 * Math.sin(t * 3 * still + k * 1.4);
          this.draw("ring", [p.x, 0.4 + k * 0.7, p.z], [r, 1.6, r], hue, 0, 1);
        }
        this.draw("box", [p.x, 1.3, p.z], [0.07, 1.3, 0.07], hue, 0, 1);
        this.draw(
          "gem",
          [p.x, 2.75 + Math.sin(t * 2.4) * 0.15 * still, p.z],
          [0.28, 0.42, 0.28],
          "#ffffff",
          t * 3,
          1,
        );
      }
      for (const d of g.decorations) {
        if (!visible(d)) continue;
        const sz = d.size,
          ph = d.phase;
        if (g.world === 0) {
          if (d.type === 0) {
            this.draw(
              "cone",
              [d.x, 0.03, d.z],
              [sz * 0.3, sz, sz * 0.3],
              w.rock,
              ph,
            );
            this.draw(
              "sphere",
              [d.x, sz, d.z],
              [sz * 0.45, 0.15, sz * 0.45],
              w.crystal,
              0,
              0.25,
            );
          } else if (d.type === 1) {
            this.draw(
              "box",
              [d.x, sz * 0.25, d.z],
              [0.05, sz * 0.25, 0.05],
              "#c9d8c0",
            );
            this.draw(
              "sphere",
              [d.x, sz * 0.5, d.z],
              [sz * 0.4, sz * 0.16, sz * 0.4],
              ph > 3 ? "#f2a8ff" : "#8ff7d6",
              0,
              0.9,
            );
          } else if (d.type === 2)
            for (let k = 0; k < 3; k++)
              this.draw(
                "cone",
                [d.x + (k - 1) * 0.14, 0, d.z + (k % 2) * 0.1],
                [0.06, sz * 0.7, 0.06],
                "#3f7a52",
                ph + k,
              );
          else if (d.type === 3) {
            this.draw(
              "box",
              [d.x, sz * 0.2, d.z],
              [0.025, sz * 0.2, 0.025],
              "#4c8a5c",
            );
            this.draw(
              "sphere",
              [d.x, sz * 0.42, d.z],
              [0.12, 0.1, 0.12],
              ["#ffd27a", "#ff9fc0", "#c7b7ff"][Math.floor(ph) % 3],
              0,
              0.8,
            );
          } else
            this.draw(
              "gem",
              [d.x, 0.05, d.z],
              [sz * 0.4, sz * 0.18, sz * 0.3],
              "#2d4a3f",
              ph,
            );
        } else if (g.world === 1) {
          if (d.type === 0)
            this.draw(
              "gem",
              [d.x, sz * 0.2, d.z],
              [sz * 0.35, sz * 0.6, sz * 0.35],
              w.rock,
              ph,
            );
          else if (d.type === 1)
            this.draw(
              "sphere",
              [d.x, -0.08, d.z],
              [sz * 1.3, sz * 0.22, sz * 1.05],
              "#6f93a6",
              ph,
            );
          else if (d.type === 2)
            this.draw(
              "gem",
              [d.x, sz * 0.35, d.z],
              [sz * 0.18, sz * 0.4, sz * 0.18],
              "#a9ecff",
              ph,
              0.9,
            );
          else if (d.type === 3)
            for (let k = 0; k < 3; k++)
              this.draw(
                "cone",
                [d.x + (k - 1) * 0.18, 0, d.z],
                [0.09, sz * 0.6, 0.09],
                "#8fb8c9",
                ph,
              );
          else
            for (let k = 0; k < 3; k++)
              this.draw(
                "gem",
                [
                  d.x + Math.cos(ph + k * 2) * 0.3,
                  0.1,
                  d.z + Math.sin(ph + k * 2) * 0.3,
                ],
                [0.12, 0.3, 0.12],
                "#d8f6ff",
                ph + k,
                0.4,
              );
        } else {
          if (d.type === 0)
            this.draw(
              "box",
              [d.x, 0.14, d.z],
              [sz * 0.4, 0.16, sz * 0.3],
              w.rock,
              ph,
            );
          else if (d.type === 1)
            this.draw(
              "sphere",
              [d.x, -0.08, d.z],
              [sz * 1.6, sz * 0.3, sz * 0.8],
              "#4a3626",
              ph,
            );
          else if (d.type === 2) {
            this.draw(
              "box",
              [d.x, sz * 0.45, d.z],
              [0.12, sz * 0.45, 0.12],
              "#5f7a45",
            );
            this.draw(
              "box",
              [d.x + 0.2, sz * 0.55, d.z],
              [0.08, sz * 0.18, 0.08],
              "#5f7a45",
            );
          } else if (d.type === 3)
            this.draw(
              "box",
              [d.x, sz * 0.6, d.z],
              [0.16, sz * 0.6, 0.16],
              "#8a6446",
              ph,
            );
          else
            this.draw(
              "gem",
              [d.x, 0.2, d.z],
              [sz * 0.25, sz * 0.3, sz * 0.25],
              "#f3ba69",
              ph,
              0.7,
            );
        }
      }
      for (const o of g.obstacles) {
        if (!visible(o, o.landmark ? 10 : 5)) continue;
        this.draw(
          "sphere",
          [o.x, 0.01, o.z],
          [o.r * 1.25, 0.02, o.r],
          "#0c181e",
        );
        if (o.landmark) {
          if (g.world === 0) {
            this.draw(
              "cone",
              [o.x, 0, o.z],
              [o.r * 0.55, o.height * 0.75, o.r * 0.55],
              "#4a3a30",
              o.rotation,
            );
            for (let k = 0; k < 4; k++) {
              const a = o.rotation + k * 1.7;
              this.draw(
                "sphere",
                [
                  o.x + Math.cos(a) * o.r * 0.45,
                  o.height * (0.62 + k * 0.09),
                  o.z + Math.sin(a) * o.r * 0.45,
                ],
                [o.r * (1.15 - k * 0.15), o.r * 0.55, o.r * (1.05 - k * 0.15)],
                k % 2 ? "#2f6b4f" : "#3a7d5c",
                a,
              );
            }
            for (let k = 0; k < 6; k++) {
              const a = k * 1.05 + t * 0.2 * still;
              this.draw(
                "gem",
                [
                  o.x + Math.cos(a) * o.r * 1.1,
                  o.height * 0.7 + Math.sin(t + k) * 0.3 * still,
                  o.z + Math.sin(a) * o.r * 1.1,
                ],
                [0.13, 0.2, 0.13],
                "#a6ffcf",
                a,
                1,
              );
            }
          } else if (g.world === 1) {
            this.draw(
              "gem",
              [o.x, o.height * 0.5, o.z],
              [o.r * 0.75, o.height * 0.85, o.r * 0.75],
              "#5f93ad",
              o.rotation,
              0.1,
            );
            for (let k = 0; k < 4; k++) {
              const a = o.rotation + (k * TAU) / 4;
              this.draw(
                "gem",
                [
                  o.x + Math.cos(a) * o.r * 0.8,
                  o.height * 0.22,
                  o.z + Math.sin(a) * o.r * 0.8,
                ],
                [o.r * 0.3, o.height * 0.35, o.r * 0.3],
                "#a1e1ef",
                a,
                0.3,
              );
            }
            this.draw(
              "gem",
              [o.x, o.height * 1.42 + Math.sin(t * 1.5) * 0.25 * still, o.z],
              [0.4, 0.7, 0.4],
              "#e5fcff",
              t,
              1,
            );
          } else {
            this.draw(
              "box",
              [o.x, o.height * 0.5, o.z],
              [o.r * 0.42, o.height * 0.5, o.r * 0.42],
              "#8a6446",
              o.rotation,
            );
            this.draw(
              "box",
              [o.x, o.height * 0.55, o.z],
              [o.r * 0.44, 0.07, o.r * 0.44],
              "#f3ba69",
              o.rotation,
              0.9,
            );
            this.draw(
              "box",
              [o.x, o.height * 0.25, o.z],
              [o.r * 0.44, 0.07, o.r * 0.44],
              "#f3ba69",
              o.rotation,
              0.9,
            );
            this.draw(
              "gem",
              [o.x, o.height + 1 + Math.sin(t * 1.8) * 0.25 * still, o.z],
              [0.45, 0.7, 0.45],
              "#ffd27a",
              t,
              1,
            );
          }
          this.draw(
            "ring",
            [o.x, 0.06, o.z],
            [o.r * 1.35, 0.5, o.r * 1.35],
            w.crystal,
            0,
            0.8,
          );
        } else if (o.pillar) {
          this.draw(
            "box",
            [o.x, o.height * 0.5, o.z],
            [o.r * 0.7, o.height * 0.5, o.r * 0.7],
            w.rock,
            o.rotation,
          );
          this.draw(
            "box",
            [o.x, o.height * 0.75, o.z],
            [o.r * 0.72, 0.05, o.r * 0.72],
            w.crystal,
            o.rotation,
            0.9,
          );
          this.draw(
            "gem",
            [o.x, o.height + 0.7, o.z],
            [0.3, 0.45, 0.3],
            w.crystal,
            t,
            1,
          );
        } else if (g.world === 1) {
          this.draw(
            "gem",
            [o.x, o.height * 0.45, o.z],
            [o.r * 0.8, o.height, o.r * 0.8],
            w.rock,
            o.rotation,
          );
          this.draw(
            "gem",
            [o.x + o.r * 0.5, o.height * 0.25, o.z + 0.4],
            [o.r * 0.45, o.height * 0.7, o.r * 0.4],
            w.crystal,
            o.rotation,
            0.1,
          );
        } else if (g.world === 2) {
          this.draw(
            "box",
            [o.x, o.height * 0.5, o.z],
            [o.r * 0.65, o.height * 0.5, o.r * 0.65],
            w.rock,
            o.rotation,
          );
          this.draw(
            "box",
            [o.x, o.height * 0.8, o.z],
            [o.r * 0.67, 0.045, o.r * 0.67],
            w.crystal,
            o.rotation,
            0.7,
          );
        } else {
          this.draw(
            "gem",
            [o.x, o.height * 0.35, o.z],
            [o.r, o.height * 0.65, o.r * 0.85],
            w.rock,
            o.rotation,
          );
          this.draw(
            "cone",
            [o.x, o.height * 0.7, o.z],
            [o.r * 0.55, o.height * 0.7, o.r * 0.55],
            "#56836b",
            o.rotation,
          );
          this.draw(
            "gem",
            [o.x, o.height * 1.2, o.z],
            [0.12, 0.3, 0.12],
            w.crystal,
            t,
            0.8,
          );
        }
      }
      for (const c of g.caches) {
        if (c.dead || !visible(c, 2)) continue;
        const flash = c.flash > 0,
          dmg = 1 - Math.max(0, c.hp) / c.maxHp,
          shake = flash ? Math.sin(t * 70) * 0.05 : 0,
          yaw = c.phase,
          cc = Math.cos(yaw),
          cs = Math.sin(yaw);
        const at = (f, sd, y) => [
          c.x + cc * (f + shake) - cs * sd,
          y,
          c.z + cs * (f + shake) + cc * sd,
        ];
        const wood = flash ? "#ffffff" : "#7a4a26",
          wood2 = flash ? "#ffffff" : "#8f5a2e",
          gold = flash ? "#ffffff" : "#f2c14e",
          open =
            0.05 +
            dmg * 0.22 +
            Math.max(0, Math.sin(t * 2 + c.phase)) * 0.03 * still;
        this.draw("sphere", [c.x, 0.01, c.z], [1.15, 0.02, 0.85], "#20160c");
        this.draw(
          "ring",
          [c.x, 0.05, c.z],
          [1.2, 0.5, 1.2],
          "#ffd27a",
          0,
          0.4 + 0.5 * Math.sin(t * 3 + c.phase) * still,
        );
        this.draw("box", at(0, 0, 0.33), [0.72, 0.3, 0.48], wood, yaw);
        for (const y of [0.2, 0.44])
          this.draw("box", at(0, 0, y), [0.73, 0.012, 0.49], "#5a3418", yaw);
        for (const f of [-0.46, 0.46])
          this.draw("box", at(f, 0, 0.34), [0.07, 0.32, 0.5], gold, yaw, 0.35);
        for (const f of [-0.66, 0.66])
          for (const sd of [-0.42, 0.42])
            this.draw(
              "box",
              at(f, sd, 0.06),
              [0.08, 0.06, 0.08],
              gold,
              yaw,
              0.3,
            );
        this.draw(
          "box",
          at(0, 0, 0.62 + open / 2),
          [0.68, open / 2 + 0.01, 0.44],
          "#ffe9a0",
          yaw,
          1,
        );
        this.draw("box", at(0, 0, 0.67 + open), [0.74, 0.07, 0.5], wood2, yaw);
        this.draw(
          "sphere",
          at(0, 0, 0.72 + open),
          [0.74, 0.2, 0.5],
          wood2,
          yaw,
        );
        for (const f of [-0.46, 0.46])
          this.draw(
            "box",
            at(f, 0, 0.8 + open),
            [0.07, 0.14, 0.51],
            gold,
            yaw,
            0.35,
          );
        this.draw("box", at(0, 0.5, 0.52), [0.1, 0.12, 0.03], gold, yaw, 0.6);
        this.draw("sphere", at(0, 0.53, 0.5), [0.03, 0.05, 0.02], "#2a1608");
        if (dmg > 0)
          for (let k = 0; k < 3; k++)
            this.draw(
              "gem",
              at(-0.3 + k * 0.3, 0, 0.7 + open),
              [0.07, 0.09, 0.07],
              k === 1 ? "#bff4ff" : "#ffe9a0",
              t * 2 + k,
              1,
            );
        const sa = t * 2 + c.phase;
        this.draw(
          "gem",
          [
            c.x + Math.cos(sa) * 0.95,
            1.25 + Math.sin(t * 3) * 0.1 * still,
            c.z + Math.sin(sa) * 0.95,
          ],
          [0.07, 0.12, 0.07],
          "#fff3c0",
          sa,
          1,
        );
      }
      for (const f of g.food) {
        if (!visible(f, 1)) continue;
        const def = FOODS[f.type] || FOODS.energy;
        if (def.power) {
          if (!(f.life < 5 && Math.floor(t * 8) % 2 === 0))
            this.powerModel(f, def, t, still);
          continue;
        }
        const y = 0.38 + Math.sin(t * 2 + f.phase) * 0.1 * still;
        if (f.type === "heal") {
          this.draw("box", [f.x, y, f.z], [0.31, 0.1, 0.1], def.color, 0, 0.8);
          this.draw("box", [f.x, y, f.z], [0.1, 0.1, 0.31], def.color, 0, 0.8);
        } else if (f.type === "crystal") {
          this.draw(
            "gem",
            [f.x, y, f.z],
            [0.27, 0.4, 0.27],
            def.color,
            t + f.phase,
            0.8,
          );
          this.draw(
            "ring",
            [f.x, 0.03, f.z],
            [0.45, 0.4, 0.45],
            "#625d39",
            0,
            0.6,
          );
        } else if (f.type === "fruit") {
          this.draw(
            "sphere",
            [f.x, y + 0.05, f.z],
            [0.27, 0.25, 0.27],
            def.color,
            0,
            0.7,
          );
          this.draw(
            "cone",
            [f.x + 0.06, y + 0.25, f.z],
            [0.08, 0.2, 0.05],
            "#7bd88f",
            f.phase,
            0.3,
          );
        } else
          this.draw(
            "sphere",
            [f.x, y, f.z],
            [0.16, 0.16, 0.16],
            w.crystal,
            0,
            0.8,
          );
      }
      for (const e of g.enemies) {
        if (!visible(e, e.boss ? 8 : 5)) continue;
        if (e.boss) this.bossModel(e, g, t, still);
        else this.enemyModel(e, g, t, still);
      }
      for (const p of g.projectiles) {
        const col = p.color || "#ffad85",
          r = (p.r || 0.25) * 0.95;
        if (p.kind === "snipe") {
          const a = Math.atan2(p.vz, p.vx);
          this.draw("gem", [p.x, 0.6, p.z], [0.7, 0.12, 0.12], col, a, 1);
          this.draw(
            "gem",
            [p.x - p.vx * 0.03, 0.6, p.z - p.vz * 0.03],
            [0.5, 0.08, 0.08],
            "#ffffff",
            a,
            1,
          );
        } else if (p.kind === "orb") {
          this.draw("sphere", [p.x, 0.8, p.z], [r, r, r], col, 0, 1);
          this.draw(
            "ring",
            [p.x, 0.8, p.z],
            [r * 1.6, 2, r * 1.6],
            "#ffffff",
            t * 6,
            1,
          );
        } else {
          this.draw("sphere", [p.x, 0.6, p.z], [r, r, r], col, 0, 1);
          this.draw(
            "sphere",
            [p.x - p.vx * 0.03, 0.6, p.z - p.vz * 0.03],
            [r * 0.62, r * 0.62, r * 0.62],
            "#ffffff",
            0,
            1,
          );
        }
      }
      this.snake(g.snake, g.character, g.angle, t, {
        flash:
          g.invulnerable > 0 && !reducedMotion && Math.floor(t * 10) % 2 === 0,
        active: g.activeSkill > 0,
      });
      this.draw(
        "ring",
        [h.x, 0.07, h.z],
        [0.8, 0.4, 0.8],
        g.health / g.maxHealth < 0.3 ? "#ff7a81" : g.character.color,
        0,
        0.6,
      );
      if (g.powers.fury > 0) {
        this.draw(
          "ring",
          [h.x, 0.5, h.z],
          [1.15, 1, 1.15],
          "#ff6f59",
          t * 4,
          1,
        );
        this.draw(
          "ring",
          [h.x, 0.9, h.z],
          [
            0.9 + Math.sin(t * 12) * 0.08 * still,
            1,
            0.9 + Math.sin(t * 12) * 0.08 * still,
          ],
          "#ffb347",
          -t * 4,
          1,
        );
      }
      if (g.powers.shield > 0) {
        this.draw(
          "ring",
          [h.x, 0.35, h.z],
          [1.25, 2, 1.25],
          "#8fd3ff",
          t * 2,
          1,
        );
        this.draw(
          "ring",
          [h.x, 1.1, h.z],
          [1.05, 2, 1.05],
          "#d6f0ff",
          -t * 2,
          1,
        );
        this.draw("ring", [h.x, 1.6, h.z], [0.6, 2, 0.6], "#8fd3ff", t, 1);
      }
      if (
        g.powers.magnet > 0 ||
        (g.activeSkill > 0 && g.characterIndex === 0)
      ) {
        const r =
          g.magnet +
          (g.powers.magnet > 0 ? 9 : 0) +
          (g.activeSkill > 0 && g.characterIndex === 0 ? 11 : 0);
        this.draw(
          "ring",
          [h.x, 0.06, h.z],
          [r, 0.5, r],
          g.powers.magnet > 0 ? "#6d58a8" : "#41785d",
          0,
          0.5,
        );
      }
      for (const o of g.orbits()) {
        this.draw(
          "gem",
          [o.x, 0.9, o.z],
          [0.24, 0.38, 0.24],
          g.character.accent,
          t * 5,
          1,
        );
        this.draw(
          "ring",
          [o.x, 0.12, o.z],
          [0.35, 0.3, 0.35],
          g.character.dark,
          0,
          0.5,
        );
      }
      for (const r of g.rings) {
        const radius = Math.max(0.1, (r.radius * r.age) / r.life);
        this.draw(
          "ring",
          [r.x, 0.15, r.z],
          [radius, 1, radius],
          r.color,
          0,
          0.8,
        );
        if (r.radius > 4)
          this.draw(
            "ring",
            [r.x, 0.2, r.z],
            [radius * 0.8, 1, radius * 0.8],
            "#ffffff",
            0,
            1,
          );
      }
      if (this.quality !== "low" && !reducedMotion) {
        for (const p of g.particles) {
          const size = p.size * Math.min(1, p.life * 3);
          this.draw(
            "gem",
            [p.x, p.y, p.z],
            [size, size, size],
            p.color,
            p.life,
            0.8,
          );
        }
        // Ambient motes (spores / snow / embers) drift in a window around the camera.
        const span = 60,
          mote = ["#b8ffd9", "#e8fbff", "#ffcf8f"][g.world];
        for (let i = 0; i < 46; i++) {
          const sx = (i * 37.3) % span,
            sz = (i * 61.7) % span,
            drift = t * (0.4 + (i % 5) * 0.15);
          const x =
              camera.x +
              ((((sx + drift - camera.x) % span) + span) % span) -
              span / 2,
            z =
              camera.z +
              ((((sz + (g.world === 1 ? drift * 1.4 : drift * 0.3) - camera.z) %
                span) +
                span) %
                span) -
              span / 2;
          const y =
            g.world === 2
              ? 0.4 + ((t * 0.5 + i * 0.13) % 1) * 4
              : 1 + Math.sin(t + i) * 0.8 + (i % 4);
          this.draw("gem", [x, y, z], [0.05, 0.07, 0.05], mote, t + i, 1);
        }
      }
      this.end();
    }
  }
  window.SerpentRenderer = Renderer;
})();

/*
 * ============================================================
 *  01-utils.js ── 共用小工具
 * ------------------------------------------------------------
 *  數學、亂數、角度、網頁元素、存檔等到處都會用到的函式。
 *  全部掛在 Util 物件底下，例如 Util.clamp(x, 0, 1)。
 * ============================================================
 */

const Util = {
  /* ---------- 數學 ---------- */

  // 把 v 限制在 [min, max] 之間
  clamp(v, min, max) {
    return v < min ? min : v > max ? max : v;
  },

  // 線性內插：t = 0 得到 a，t = 1 得到 b
  lerp(a, b, t) {
    return a + (b - a) * t;
  },

  // 與幀率無關的平滑逼近：rate 越大追得越快
  damp(current, target, rate, dt) {
    return current + (target - current) * (1 - Math.exp(-rate * dt));
  },

  // 平面距離（忽略高度）
  dist2D(ax, az, bx, bz) {
    return Math.hypot(ax - bx, az - bz);
  },

  // 立體距離
  dist3D(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
  },

  // 0→1 的平滑曲線（頭尾緩和）
  smooth(t) {
    t = Util.clamp(t, 0, 1);
    return t * t * (3 - 2 * t);
  },

  /* ---------- 亂數 ---------- */

  rand(min = 0, max = 1) {
    return min + Math.random() * (max - min);
  },

  randInt(min, max) {
    return Math.floor(min + Math.random() * (max - min + 1));
  },

  // 從陣列隨機挑一個
  pick(list) {
    return list[Math.floor(Math.random() * list.length)];
  },

  // 洗牌（回傳新陣列）
  shuffle(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  },

  // 有固定種子的亂數產生器（同樣的種子會得到同樣的地圖細節）
  seeded(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  },

  /* ---------- 角度 ----------
   *  本遊戲的方向約定（和 Three.js 攝影機相同）：
   *    yaw = 0 時面向 -Z；前方向量 = (-sin(yaw), 0, -cos(yaw))
   *    pitch 為正表示往上看
   */

  // 把角度整理到 -π ~ π
  wrapAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  },

  // 從 from 轉到 to 的最短角度差
  angleDiff(from, to) {
    return Util.wrapAngle(to - from);
  },

  // 以每次最多 maxStep 的幅度把角度轉向目標
  turnToward(from, to, maxStep) {
    const d = Util.angleDiff(from, to);
    if (Math.abs(d) <= maxStep) return to;
    return from + Math.sign(d) * maxStep;
  },

  // 從 (dx, dz) 的位移算出面向它所需的 yaw
  yawTo(dx, dz) {
    return Math.atan2(-dx, -dz);
  },

  // 由 yaw / pitch 算出瞄準方向（寫入 out 並回傳）
  aimDir(yaw, pitch, out) {
    const cp = Math.cos(pitch);
    return out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  },

  /* ---------- 網頁元素 ---------- */

  // 取得單一元素，例如 Util.$("#hud")
  $(selector, root = document) {
    return root.querySelector(selector);
  },

  // 取得多個元素（回傳陣列）
  $$(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  },

  // 建立元素：Util.el("div", "class-name", "內容 HTML")
  el(tag, className = "", html = "") {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (html) node.innerHTML = html;
    return node;
  },

  // 秒數 → "分:秒"
  formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  },

  // 十六進位顏色數字 → CSS 字串（0xff8800 → "#ff8800"）
  cssColor(hex) {
    return "#" + hex.toString(16).padStart(6, "0");
  },

  /* ---------- 存檔（瀏覽器 localStorage） ---------- */

  load(key, fallback) {
    try {
      const raw = localStorage.getItem("neonstrike2." + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback; // 無痕模式等情況讀不到就用預設值
    }
  },

  save(key, value) {
    try {
      localStorage.setItem("neonstrike2." + key, JSON.stringify(value));
    } catch (e) {
      /* 存不了就算了，不影響遊戲 */
    }
  },
};

/* 常用的暫存向量：避免每一幀都 new 新物件造成卡頓。
 * 只在「同一個函式內馬上用完」的情況使用，不要跨函式保存。 */
const TMP = {
  v1: new THREE.Vector3(),
  v2: new THREE.Vector3(),
  v3: new THREE.Vector3(),
  v4: new THREE.Vector3(),
  q1: new THREE.Quaternion(),
  m1: new THREE.Matrix4(),
  c1: new THREE.Color(),
};

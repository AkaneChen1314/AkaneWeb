/*
 * ============================================================
 *  14-hud.js ── 戰鬥中的畫面資訊（HUD）
 * ------------------------------------------------------------
 *  HUD 全部用網頁元素（HTML + CSS）疊在 3D 畫面上，
 *  外觀寫在 css/style.css，這裡只負責「把數值填進去」。
 *
 *  畫面配置：
 *    左上  小地圖              上中  比分／計時／據點／首領血條
 *    右上  擊殺訊息            中央  準星、命中標記、受擊方向、大字提示
 *    左下  生命與護甲          下中  技能與手榴彈
 *    右下  武器與彈藥
 *  另外還有跟著 3D 世界位置移動的「名牌、血條、傷害數字、據點標記」。
 *
 *  為了效能，文字只有在數值改變時才會更新（見 _set）。
 * ============================================================
 */

const HUD = {
  el: {}, // 常用元素的快取
  cache: {}, // 上一次填入的內容
  tags: new Map(), // 角色 → 名牌元素
  numbers: [], // 傷害數字（固定數量，循環使用）
  dirs: [], // 受擊方向指示
  feed: [], // 擊殺訊息
  spread: 0, // 準星目前的擴張量
  hitT: 0, // 命中標記剩餘時間
  announceT: 0,
  toastT: 0,
  warnT: 0,
  spotT: 0,
  boardT: 0,

  /* ---------- 初始化：抓取元素、建立可重複使用的元素 ---------- */
  init() {
    const ids = ["hud", "scope", "crosshair", "hitmarker", "dmg-dirs", "world-tags", "top-bar", "timer", "objective", "points",
      "boss-bar", "boss-name", "boss-fill", "boss-ticks", "boss-warning", "minimap", "killfeed", "announce", "toast",
      "hp-fill", "hp-text", "armor-fill", "armor-text", "op-name", "weapon-slots", "ammo-mag", "ammo-reserve", "weapon-name",
      "reload-hint", "skill", "skill-name", "skill-cd", "skill-icon", "nade", "nade-count", "nade-icon",
      "med", "med-count", "med-icon", "ammo-fill", "kill-icon", "reload-ring", "compass", "race", "death-screen", "death-by",
      "death-respawn", "scoreboard",
      "team-left", "team-right", "low-hp"];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mapCtx = this.el.minimap.getContext("2d");

    // 傷害數字：預先建立 24 個
    for (let i = 0; i < 24; i++) {
      const node = Util.el("div", "dmg-num");
      this.el["world-tags"].appendChild(node);
      this.numbers.push({ node, life: 0, x: 0, y: 0, z: 0 });
    }
    // 受擊方向：預先建立 6 個
    for (let i = 0; i < 6; i++) {
      const node = Util.el("div", "dmg-dir");
      this.el["dmg-dirs"].appendChild(node);
      this.dirs.push({ node, life: 0, x: 0, z: 0 });
    }
    this.numCursor = 0;
  },

  show(on) {
    this.el.hud.classList.toggle("hidden", !on);
  },

  // 只有內容改變時才寫入元素（頻繁改寫網頁元素會拖慢畫面）
  _set(key, value, prop = "textContent") {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    const target = this.el[key];
    if (prop === "width") target.style.width = value;
    else target[prop] = value;
  },

  // 這個角色在 HUD 上該用什麼顏色（我方青、敵方紅）
  colorOf(actor) {
    if (actor.isPlayer) return "#7dffb0";
    return actor.team === Game.player.team ? "#35d6ff" : "#ff4a5e";
  },

  /* ---------- 每場開始時重設 ---------- */
  reset() {
    this.cache = {};
    for (const [, node] of this.tags) node.remove();
    this.tags.clear();
    if (this.pickupTags) for (const [, node] of this.pickupTags) node.remove();
    this.pickupTags = new Map();
    for (const n of this.numbers) {
      n.life = 0;
      n.node.style.display = "none";
    }
    for (const d of this.dirs) {
      d.life = 0;
      d.node.style.opacity = 0;
    }
    this.el.killfeed.innerHTML = "";
    this.feed = [];
    this.el.announce.className = "";
    this.el.toast.classList.remove("show");
    this.el["boss-warning"].classList.remove("show");
    this.announceT = this.toastT = this.warnT = this.hitT = 0;
    this.pointTags = null;
    this.el["death-screen"].classList.remove("show");
    this.el.scoreboard.classList.remove("show");
    this.el.points.innerHTML = "";
    this.pointNodes = null;
    this.el.race.innerHTML = "";
    this.raceNodes = null;

    const p = Game.player;
    this._set("op-name", p.operator.name + " // " + p.operator.role);
    this._set("skill-name", p.operator.skill.name);
    // 圖示：技能依幹員而不同，手榴彈與醫療包固定
    this.el["skill-icon"].innerHTML = HUD.ICONS[p.operator.skill.id] || HUD.ICONS.heal;
    this.el["nade-icon"].innerHTML = HUD.ICONS.grenade;
    this.el["med-icon"].innerHTML = HUD.ICONS.medkit;
    this.el.hud.style.setProperty("--accent", Util.cssColor(p.operator.look.accent));

    // 武器欄：每一格有槍的剪影圖、按鍵編號、名稱與彈藥
    this.el["weapon-slots"].innerHTML = "";
    this.slotNodes = p.weapons.map((ws, i) => {
      const icon = WeaponModels.icons[ws.def.id];
      const node = Util.el("div", "slot",
        `<div class="slot-top"><b>${i + 1}</b><span>${ws.def.short}</span></div>` +
        (icon ? `<img src="${icon}" alt="">` : "") +
        `<em class="slot-ammo"></em>`);
      this.el["weapon-slots"].appendChild(node);
      return node;
    });
    this.slotAmmo = [];
    this._buildMinimapImage();
  },

  /* ============================================================
   *  事件：由戰鬥系統呼叫
   * ============================================================ */

  // 開始換槍時讓目標那一格閃一下
  slotFlash(index) {
    const node = this.slotNodes && this.slotNodes[index];
    if (!node) return;
    node.classList.remove("flash");
    void node.offsetWidth; // 重新觸發動畫
    node.classList.add("flash");
  },

  // 開槍時準星擴張
  crosshairKick(amount) {
    this.spread = Math.min(1, this.spread + amount * 0.5);
  },

  // 命中標記（擊殺是紅色、爆頭較大）
  hitMarker(kill, head) {
    this.hitT = kill ? 0.4 : 0.18;
    const node = this.el.hitmarker;
    node.className = "show" + (kill ? " kill" : "") + (head ? " head" : "");
    if (kill) { // 擊殺：準星上方跳出骷髏（爆頭是金色）
      const k = this.el["kill-icon"];
      k.className = head ? "head" : "";
      void k.offsetWidth;
      k.classList.add("show");
    }
  },

  // 傷害數字：出現在命中位置並往上飄
  damageNumber(x, y, z, amount, head) {
    const n = this.numbers[this.numCursor];
    this.numCursor = (this.numCursor + 1) % this.numbers.length;
    n.x = x + Util.rand(-0.2, 0.2);
    n.y = y;
    n.z = z + Util.rand(-0.2, 0.2);
    n.life = 0.8;
    n.node.textContent = Math.round(amount);
    n.node.className = "dmg-num" + (head ? " head" : "");
    n.node.style.display = "block";
  },

  // 受擊方向：紅色弧線指向攻擊來源
  damageFrom(x, z) {
    let slot = this.dirs.find((d) => d.life <= 0) || this.dirs[0];
    slot.x = x;
    slot.z = z;
    slot.life = 1.3;
  },

  // 畫面中央的大字提示。small = true 時較小、不搶畫面
  announce(title, sub, colorHex = 0xffffff, small = false) {
    const node = this.el.announce;
    node.innerHTML = `<div class="title">${title}</div><div class="sub">${sub || ""}</div>`;
    node.style.setProperty("--c", Util.cssColor(colorHex));
    node.className = "show" + (small ? " small" : "");
    // 重新觸發進場動畫
    void node.offsetWidth;
    node.classList.add("play");
    this.announceT = small ? 1.4 : 2.4;
    if (!small) Sound.play("announce", { vol: 0.5 });
  },

  // 底部的小提示
  toast(text) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add("show");
    this.toastT = 2;
  },

  // 首領出招警告
  bossWarning(text) {
    this.el["boss-warning"].textContent = "⚠ " + text;
    this.el["boss-warning"].classList.add("show");
    this.warnT = 2.4;
    Sound.play("warning", { vol: 0.5 });
  },

  // 擊殺訊息（右上角）
  killFeed(killer, victim, weapon, head, weaponId) {
    const row = Util.el("div", "feed-row" + ((killer && killer.isPlayer) || victim.isPlayer ? " mine" : ""));
    const k = killer ? `<span style="color:${this.colorOf(killer)}">${killer.name}</span>` : "";
    // 有槍的剪影圖就顯示圖示，沒有（手榴彈、近戰、首領招式）就顯示文字
    const icon = WeaponModels.icons[weaponId];
    const what = icon ? `<img src="${icon}" alt="${weapon}">` : weapon;
    const hs = head ? `<b class="hs" title="爆頭">◎</b>` : "";
    row.innerHTML = `${k}<em>${what}${hs}</em><span style="color:${this.colorOf(victim)}">${victim.name}</span>`;
    this.el.killfeed.prepend(row);
    this.feed.unshift({ node: row, life: 5.5 });
    while (this.feed.length > 5) this.feed.pop().node.remove();
  },

  // 玩家陣亡時顯示是誰用什麼擊殺的
  deathInfo(name, weapon) {
    this.el["death-by"].innerHTML = `被 <b>${name}</b> 以 <b>${weapon}</b> 擊殺`;
  },

  /* ============================================================
   *  每幀更新
   * ============================================================ */
  update(dt) {
    const p = Game.player;
    if (!p) return;
    const ws = p.weapon;
    const def = ws.def;

    /* ---- 生命與護甲 ---- */
    this._set("hp-text", String(Math.ceil(p.hp)));
    this._set("hp-fill", Math.round((p.hp / p.maxHp) * 100) + "%", "width");
    this._set("armor-text", String(Math.ceil(p.armor)));
    this._set("armor-fill", Math.round((p.armor / Math.max(1, p.maxArmor, 50)) * 100) + "%", "width");
    // 護盾恢復中：護盾條會流動發光
    this.el["armor-fill"].parentNode.parentNode.classList.toggle("regen", !!p.armorRegen);
    this.el["low-hp"].classList.toggle("show", p.alive && p.hp < p.maxHp * 0.35);
    // 復活無敵中：畫面四周一圈淡藍色的護罩光（首領被擊破後的無敵不顯示）
    this.el.hud.classList.toggle("spawn-shield", p.alive && p.invuln > 0 && p.invuln < 10);

    /* ---- 武器與彈藥 ---- */
    this._set("ammo-mag", String(ws.ammo));
    this._set("ammo-reserve", ws.reserve === Infinity ? "∞" : String(ws.reserve));
    // 彈匣剩餘量的細條；換彈時顯示換彈進度
    const fill = ws.reloading ? 1 - ws.reloadLeft / ws.reloadTotal : ws.ammo / ws.magSize;
    this._set("ammo-fill", (fill * 100).toFixed(1) + "%", "width");
    this.el["ammo-fill"].classList.toggle("reload", ws.reloading);
    this._set("weapon-name", def.name + " · " + def.cls);
    const lowAmmo = ws.ammo <= Math.ceil(ws.magSize * 0.25);
    this.el["ammo-mag"].classList.toggle("low", lowAmmo);
    let hint = "";
    if (ws.reloading) hint = "換彈中…";
    else if (ws.ammo === 0 && ws.reserve <= 0) hint = "彈藥用盡 — 切換武器或尋找彈藥箱";
    else if (lowAmmo && ws.reserve > 0) hint = "按 R 換彈";
    this._set("reload-hint", hint);
    if (this.cache.slot !== p.weaponIndex) {
      this.cache.slot = p.weaponIndex;
      this.slotNodes.forEach((n, i) => n.classList.toggle("active", i === p.weaponIndex));
    }
    // 每一格下方的彈藥數（只有數字變了才更新）
    for (let i = 0; i < p.weapons.length; i++) {
      const w = p.weapons[i];
      const text = w.ammo + " / " + (w.reserve === Infinity ? "∞" : w.reserve);
      if (this.slotAmmo[i] !== text) {
        this.slotAmmo[i] = text;
        this.slotNodes[i].lastChild.textContent = text;
        this.slotNodes[i].classList.toggle("dry", w.ammo === 0 && w.reserve <= 0);
      }
    }

    /* ---- 技能與手榴彈 ---- */
    const skill = p.operator.skill;
    const cdRatio = p.skillCd / (skill.cooldown * p.mods.cooldown);
    this.el.skill.style.setProperty("--cd", (cdRatio * 360).toFixed(0) + "deg");
    this.el.skill.classList.toggle("ready", p.skillCd <= 0);
    this.el.skill.classList.toggle("active", p.skillActive > 0 || p.healLeft > 0 || p.boostT > 0);
    this._set("skill-cd", p.skillCd > 0 ? String(Math.ceil(p.skillCd)) : "");
    this._set("nade-count", String(p.grenades));
    this.el.nade.classList.toggle("empty", p.grenades <= 0);
    this._set("med-count", String(p.medkits));
    this.el.med.classList.toggle("empty", p.medkits <= 0);
    this.el.med.classList.toggle("active", p.medkitT > 0 || p.medHealLeft > 0);
    // 醫療包使用中：用冷卻遮罩顯示進度
    this.el.med.style.setProperty("--cd", (Math.max(0, p.medkitT) * 360).toFixed(0) + "deg");

    /* ---- 準星 ---- */
    this.spread = Util.damp(this.spread, 0, 7, dt);
    const moving = Math.hypot(p.vel.x, p.vel.z) / CONFIG.MOVE.sprint;
    const gap = 5 + (def.spreadHip * 3 + this.spread * 26 + moving * 12 + (p.onGround ? 0 : 14)) * (1 - p.ads * 0.8);
    const cross = this.el.crosshair;
    cross.style.setProperty("--gap", gap.toFixed(1) + "px");
    cross.style.opacity = !p.alive || p.ads > 0.6 || p.sprinting ? 0 : 1;
    this.el.scope.classList.toggle("show", !!def.scope && p.ads > 0.9 && p.alive);

    if (this.hitT > 0) {
      this.hitT -= dt;
      if (this.hitT <= 0) this.el.hitmarker.className = "";
    }

    /* ---- 提示類的倒數 ---- */
    if (this.announceT > 0 && (this.announceT -= dt) <= 0) this.el.announce.className = "";
    if (this.toastT > 0 && (this.toastT -= dt) <= 0) this.el.toast.classList.remove("show");
    if (this.warnT > 0 && (this.warnT -= dt) <= 0) this.el["boss-warning"].classList.remove("show");
    for (let i = this.feed.length - 1; i >= 0; i--) {
      const f = this.feed[i];
      f.life -= dt;
      if (f.life < 0.6) f.node.style.opacity = Math.max(0, f.life / 0.6);
      if (f.life <= 0) {
        f.node.remove();
        this.feed.splice(i, 1);
      }
    }

    /* ---- 陣亡畫面 ---- */
    const dead = !p.alive && Game.state !== "ended";
    this.el["death-screen"].classList.toggle("show", dead);
    if (dead) this._set("death-respawn", p.respawnT > 0 ? "重新部署：" + Math.ceil(p.respawnT) + " 秒" : "");

    this._updateTop();
    this._updateBoss();
    this._updateDirs(dt, p);
    this._updateWorld(dt, p);
    this._drawMinimap(p);
    this._drawCompass(p);

    /* ---- 換彈圓環：繞著準星，換彈時一圈圈填滿 ---- */
    const rr = this.el["reload-ring"];
    rr.classList.toggle("show", ws.reloading && p.alive);
    if (ws.reloading) rr.style.setProperty("--p", (1 - ws.reloadLeft / ws.reloadTotal).toFixed(3));

    /* ---- 計分板（按住 Tab）---- */
    const showBoard = Input.down("Tab");
    this.el.scoreboard.classList.toggle("show", showBoard);
    if (showBoard) {
      this.boardT -= dt;
      if (this.boardT <= 0) {
        this.boardT = 0.4;
        this._buildScoreboard();
      }
    } else this.boardT = 0;
  },

  /* ---- 上方：比分、計時、任務、據點 ---- */
  _updateTop() {
    const s = Game.mode.status();
    const side = (key, data) => {
      const html = data ? `<span class="name">${data.name}</span><span class="score">${data.score}</span>` +
        (data.max ? `<div class="bar"><i style="width:${Math.min(100, (data.score / data.max) * 100)}%"></i></div>` : "") : "";
      this._set(key, html, "innerHTML");
    };
    side("team-left", s.left);
    side("team-right", s.right);
    this._set("timer", s.timer === null || s.timer === undefined ? "∞" : Util.formatTime(s.timer));
    this._set("objective", s.text || "");
    if (s.race) this._updateRace(s.race);

    // 據點爭奪：A / B / C 三個圖示，底色代表擁有者，光環代表佔領進度
    if (s.points) {
      if (!this.pointNodes) {
        this.pointNodes = s.points.map((pt) => {
          const node = Util.el("div", "point", `<span>${pt.name}</span>`);
          this.el.points.appendChild(node);
          return node;
        });
      }
      s.points.forEach((pt, i) => {
        const node = this.pointNodes[i];
        // 底色：擁有者（我方青、敵方紅、中立灰），整顆填滿
        // 外圈：正在佔領的進度，顏色是「正在佔領的那一隊」
        const cls = "point"
          + (pt.owner === 0 ? " ours" : pt.owner === 1 ? " theirs" : "")
          + (pt.contested ? " contested" : "")
          + (pt.cap > 0 ? " capturing" : "");
        if (node.className !== cls) node.className = cls;
        node.style.setProperty("--p", (pt.cap * 360).toFixed(0) + "deg");
        node.style.setProperty("--pc", pt.capTeam === 1 ? "#ff4a5e" : "#35d6ff");
      });
    }
  },

  /* ---- 首領血條 ---- */
  _updateBoss() {
    const boss = Game.boss;
    const show = !!boss && boss.alive;
    this.el["boss-bar"].classList.toggle("show", show);
    if (!show) {
      this.cache.bossId = null;
      return;
    }
    if (this.cache.bossId !== boss.id) {
      // 新首領登場：寫入名稱並畫出階段刻度
      this.cache.bossId = boss.id;
      this.el["boss-name"].innerHTML = `<b>${boss.def.name}</b> ${boss.def.cn} — ${boss.def.title}`;
      this.el["boss-ticks"].innerHTML = boss.def.phases.map((t) => `<i style="left:${t * 100}%"></i>`).join("");
      this.el["boss-bar"].style.setProperty("--boss", Util.cssColor(boss.def.color));
    }
    this._set("boss-fill", ((boss.hp / boss.maxHp) * 100).toFixed(1) + "%", "width");
    this.el["boss-bar"].classList.toggle("stunned", boss.stunT > 0);
  },

  /* ---- 受擊方向 ---- */
  _updateDirs(dt, p) {
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    for (const d of this.dirs) {
      if (d.life <= 0) continue;
      d.life -= dt;
      const dx = d.x - p.pos.x, dz = d.z - p.pos.z;
      const fwd = -dx * sin - dz * cos; // 來源在我前方多遠
      const right = dx * cos - dz * sin; // 來源在我右方多遠
      d.node.style.transform = `rotate(${Math.atan2(right, fwd)}rad)`;
      d.node.style.opacity = Math.max(0, Math.min(1, d.life * 1.5));
    }
  },

  /* ============================================================
   *  跟著 3D 位置移動的元素
   * ============================================================ */

  // 把世界座標投影到螢幕；在鏡頭後面回傳 null
  _project(x, y, z) {
    const v = TMP.v1.set(x, y, z).project(Scene3D.camera);
    if (v.z > 1 || v.z < -1) return null;
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  },

  _updateWorld(dt, p) {
    // 每 0.2 秒檢查一次玩家看得到哪些敵人（小地圖與名牌用）
    this.spotT -= dt;
    if (this.spotT <= 0) {
      this.spotT = 0.2;
      const ey = p.eyeY();
      for (const a of Combat.actors) {
        if (a === p || !a.alive || a.team === p.team) continue;
        a.spotted = World.los(p.pos.x, ey, p.pos.z, a.pos.x, a.pos.y + a.hit.base + a.hit.h * 0.7, a.pos.z);
      }
      // 清掉已經不存在的角色的名牌
      for (const [actor, node] of this.tags) {
        if (!Combat.actors.includes(actor)) {
          node.remove();
          this.tags.delete(actor);
        }
      }
    }

    /* ---- 名牌與血條 ---- */
    for (const a of Combat.actors) {
      if (a === p || a.isBoss) continue;
      const ally = a.team === p.team;
      const dist = Util.dist3D(a.pos, p.pos);
      // 隊友：一直顯示名字。敵人：剛被我打到、或被掃描標記時才顯示血條
      const recentlyHit = Game.time - (a.lastHitByPlayer ?? -9) < 2.5;
      const want = a.alive && (ally ? dist < 50 : (recentlyHit && a.spotted) || a.marked > 0);
      let node = this.tags.get(a);
      if (!want) {
        if (node) node.style.display = "none";
        continue;
      }

      const s = this._project(a.pos.x, a.pos.y + a.hit.base + a.hit.h + 0.55 * a.scale, a.pos.z);
      if (!s) {
        if (node) node.style.display = "none";
        continue;
      }
      if (!node) {
        node = Util.el("div", "tag " + (ally ? "ally" : "enemy"), `<span>${a.name}</span><div class="bar"><i></i></div>`);
        this.el["world-tags"].appendChild(node);
        this.tags.set(a, node);
      }
      node.style.display = "block";
      node.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -100%)`;
      node.classList.toggle("marked", a.marked > 0);
      node.lastChild.firstChild.style.width = Math.max(0, (a.hp / a.maxHp) * 100) + "%";
      node.style.opacity = ally ? Util.clamp(1.3 - dist / 45, 0.35, 0.9) : 1;
    }

    /* ---- 補給的重生倒數：被撿走的補給上方顯示還要幾秒才會再出現 ---- */
    this.pickupTags = this.pickupTags || new Map();
    for (const pk of Combat.pickups) {
      let node = this.pickupTags.get(pk);
      const near = !pk.active && Util.dist2D(pk.x, pk.z, p.pos.x, p.pos.z) < 40;
      const s = near ? this._project(pk.x, pk.y + 1.3, pk.z) : null;
      if (!s) {
        if (node) node.style.display = "none";
        continue;
      }
      if (!node || !node.isConnected) {
        node = Util.el("div", "pickup-tag " + pk.type);
        this.el["world-tags"].appendChild(node);
        this.pickupTags.set(pk, node);
      }
      const icon = { health: "✚", armor: "⛨", ammo: "▤", grenade: "●" }[pk.type];
      const text = icon + " " + Math.ceil(pk.timer);
      if (node.textContent !== text) node.textContent = text;
      node.style.display = "block";
      node.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -50%)`;
      // 倒數的進度條（用背景漸層畫）
      node.style.setProperty("--t", ((1 - pk.timer / (pk.maxTimer || 26)) * 100).toFixed(0) + "%");
    }

    /* ---- 傷害數字 ---- */
    for (const n of this.numbers) {
      if (n.life <= 0) continue;
      n.life -= dt;
      n.y += dt * 1.3;
      const s = n.life > 0 ? this._project(n.x, n.y, n.z) : null;
      if (!s) {
        n.node.style.display = "none";
        n.life = 0;
        continue;
      }
      n.node.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -50%) scale(${(0.8 + n.life * 0.5).toFixed(2)})`;
      n.node.style.opacity = Math.min(1, n.life * 2.5);
    }

    /* ---- 據點的世界標記 ---- */
    const status = Game.mode.status();
    if (status.points) {
      if (!this.pointTags) this.pointTags = [];
      status.points.forEach((pt, i) => {
        let node = this.pointTags[i];
        if (!node || !node.isConnected) {
          node = Util.el("div", "point-tag");
          this.el["world-tags"].appendChild(node);
          this.pointTags[i] = node;
        }
        const s = this._project(pt.x, pt.y + 3.2, pt.z);
        if (!s) {
          node.style.display = "none";
          return;
        }
        node.style.display = "block";
        node.style.transform = `translate(${s.x.toFixed(0)}px, ${s.y.toFixed(0)}px) translate(-50%, -50%)`;
        node.textContent = pt.name + " " + Math.round(Util.dist2D(pt.x, pt.z, p.pos.x, p.pos.z)) + "m";
        node.className = "point-tag" + (pt.owner === 0 ? " ours" : pt.owner === 1 ? " theirs" : "");
      });
    } else if (this.pointTags) {
      for (const node of this.pointTags) node.remove();
      this.pointTags = null;
    }
  },

  /* ============================================================
   *  小地圖
   * ============================================================ */

  // 每場開始時把地圖的障礙物畫成一張底圖，之後每幀只要旋轉貼上即可
  _buildMinimapImage() {
    const S = 3; // 每公尺幾個像素
    this.mapScale = S;
    const half = World.half;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = half * 2 * S;
    const c = canvas.getContext("2d");
    c.fillStyle = "rgba(20,28,40,0.9)";
    c.fillRect(0, 0, canvas.width, canvas.height);
    // 依高度由低到高畫，高的物件顏色較亮
    const boxes = World.boxes.filter((b) => b.maxY > 0.9 && b.minY < 2.5 && !(b.tag && b.tag.barrel)).sort((a, b) => a.maxY - b.maxY);
    for (const b of boxes) {
      const lum = Math.min(1, 0.35 + b.maxY / 9);
      c.fillStyle = `rgba(${Math.round(90 * lum)},${Math.round(140 * lum)},${Math.round(190 * lum)},1)`;
      c.fillRect((b.minX + half) * S, (b.minZ + half) * S, (b.maxX - b.minX) * S, (b.maxZ - b.minZ) * S);
    }
    c.strokeStyle = "rgba(120,200,255,0.5)";
    c.lineWidth = 2;
    c.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
    this.mapImage = canvas;
  },

  _drawMinimap(p) {
    const c = this.mapCtx;
    const size = this.el.minimap.width;
    const R = size / 2;
    const S = this.mapScale;
    const half = World.half;
    c.clearRect(0, 0, size, size);

    c.save();
    c.beginPath();
    c.arc(R, R, R - 2, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = "rgba(8,12,20,0.75)";
    c.fillRect(0, 0, size, size);

    // 旋轉整張地圖，讓玩家面向的方向永遠朝上
    c.translate(R, R);
    c.rotate(p.yaw);
    c.translate(-p.pos.x * S, -p.pos.z * S);
    c.drawImage(this.mapImage, -half * S, -half * S);

    const dot = (x, z, r, color) => {
      c.fillStyle = color;
      c.beginPath();
      c.arc(x * S, z * S, r, 0, Math.PI * 2);
      c.fill();
    };

    // 補給（小方塊）
    for (const pk of Combat.pickups) {
      if (!pk.active) continue;
      c.fillStyle = { health: "#ff6a8a", armor: "#5ab8ff", ammo: "#ffd24a", grenade: "#ff9a3a" }[pk.type];
      c.fillRect(pk.x * S - 2.5, pk.z * S - 2.5, 5, 5);
    }
    // 據點（圓圈）
    const st = Game.mode.status();
    if (st.points) {
      for (const pt of st.points) {
        c.strokeStyle = pt.owner === 0 ? "#35d6ff" : pt.owner === 1 ? "#ff4a5e" : "#e0e0e0";
        c.lineWidth = 2;
        c.beginPath();
        c.arc(pt.x * S, pt.z * S, pt.r * S, 0, Math.PI * 2);
        c.stroke();
      }
    }
    // 角色：隊友一直顯示；敵人只有「看得到、剛開槍、被標記」時才出現
    for (const a of Combat.actors) {
      if (a === p || !a.alive) continue;
      const ally = a.team === p.team;
      const shown = ally || a.spotted || a.marked > 0 || Game.time - a.lastShotTime < 2.5 || a.isBoss;
      if (!shown) continue;
      if (a.isBoss) {
        dot(a.pos.x, a.pos.z, 8, "#ff9a3a");
        dot(a.pos.x, a.pos.z, 4, "#fff");
      } else {
        dot(a.pos.x, a.pos.z, 4.5, "#000");
        dot(a.pos.x, a.pos.z, 3.2, ally ? "#35d6ff" : "#ff4a5e");
      }
    }
    c.restore();

    // 中央的玩家箭頭（永遠朝上）與外框
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(R, R - 8);
    c.lineTo(R + 5.5, R + 6);
    c.lineTo(R, R + 3);
    c.lineTo(R - 5.5, R + 6);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(140,220,255,0.8)";
    c.lineWidth = 2;
    c.beginPath();
    c.arc(R, R, R - 2, 0, Math.PI * 2);
    c.stroke();
    // 北方標記：跟著地圖旋轉
    c.fillStyle = "#9fd8ff";
    c.font = "bold 12px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("N", R + Math.sin(-p.yaw) * (R - 12) * -1, R - Math.cos(-p.yaw) * (R - 12));
  },

  /* ============================================================
   *  個人亂鬥的名次賽道
   * ------------------------------------------------------------
   *  一條從 0 到獲勝擊殺數的橫線，每個人是線上的一個點：
   *    你      → 大一點、發光的綠色標記，上面寫「你 9」
   *    第一名  → 點的上方有皇冠（如果第一名是你，皇冠就在你頭上）
   *    其他人  → 只有小小的彩色點，畫面才不會亂
   *  擊殺數一樣的人會稍微錯開，不會整個疊在一起。
   * ============================================================ */
  _updateRace(race) {
    const box = this.el.race;
    if (!this.raceNodes) {
      box.innerHTML = `<div class="race-track"><i class="race-lead"></i></div>` +
        `<span class="race-end">${race.limit} 殺勝利</span>`;
      this.raceTrack = box.firstChild;
      this.raceLead = this.raceTrack.firstChild;
      this.raceNodes = new Map();
    }
    // 每個人的點只建立一次，之後只更新位置
    const sameKills = {};
    for (const e of race.list) {
      let node = this.raceNodes.get(e.id);
      if (!node) {
        node = Util.el("div", "race-dot" + (e.me ? " me" : ""), e.me ? `<b>你 <span>0</span></b>` : "");
        node.style.setProperty("--c", e.color);
        this.raceTrack.appendChild(node);
        this.raceNodes.set(e.id, node);
      }
      // 同樣擊殺數的人左右錯開 5 像素
      const n = (sameKills[e.kills] = (sameKills[e.kills] || 0) + 1) - 1;
      const pct = Math.min(100, (e.kills / race.limit) * 100);
      const shift = e.me ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 5;
      const key = pct + "|" + shift + "|" + e.place;
      if (node.dataset.key !== key) {
        node.dataset.key = key;
        node.style.left = `calc(${pct}% + ${shift}px)`;
        node.classList.toggle("leader", e.place === 1);
        if (e.me) node.querySelector("span").textContent = e.kills;
      }
    }
    // 第一名已經跑到哪裡：賽道上淡淡的一段
    const top = race.list[0];
    this.raceLead.style.width = Math.min(100, (top.kills / race.limit) * 100) + "%";
  },

  /* ============================================================
   *  頂部羅盤：目前面向的方位、刻度，以及據點與首領的方向
   * ------------------------------------------------------------
   *  方位約定：-Z 是北（N, 0°），+X 是東（E, 90°）。
   *  每 1 度對應 3.6 像素，羅盤只畫左右各約 60 度的範圍。
   * ============================================================ */
  _drawCompass(p) {
    const c = this.el.compass.getContext("2d");
    const W = this.el.compass.width, H = this.el.compass.height;
    const PX = 3.6;
    const heading = ((((-p.yaw * 180) / Math.PI) % 360) + 360) % 360;
    // 某個方位在羅盤上的 x 位置（超出範圍回傳 null）
    const xOf = (deg) => {
      let d = ((deg - heading + 540) % 360) - 180;
      const x = W / 2 + d * PX;
      return x < 8 || x > W - 8 ? null : x;
    };
    c.clearRect(0, 0, W, H);
    // 底色：兩端淡出的半透明長條
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, "rgba(6,10,18,0)");
    g.addColorStop(0.15, "rgba(6,10,18,0.6)");
    g.addColorStop(0.85, "rgba(6,10,18,0.6)");
    g.addColorStop(1, "rgba(6,10,18,0)");
    c.fillStyle = g;
    c.fillRect(0, 4, W, H - 8);
    c.textAlign = "center";
    c.textBaseline = "middle";
    // 刻度與文字
    for (let deg = 0; deg < 360; deg += 15) {
      const x = xOf(deg);
      if (x === null) continue;
      const fade = 1 - Math.abs(x - W / 2) / (W / 2);
      const main = deg % 90 === 0;
      c.globalAlpha = 0.35 + fade * 0.65;
      c.fillStyle = main ? "#ffffff" : "#8fa3b8";
      if (deg % 45 === 0) {
        c.font = main ? "bold 15px Bahnschrift, sans-serif" : "11px Bahnschrift, sans-serif";
        c.fillText({ 0: "N", 90: "E", 180: "S", 270: "W" }[deg] ?? String(deg), x, H / 2);
      } else {
        c.fillRect(x - 0.5, H / 2 - 4, 1, 8);
      }
    }
    c.globalAlpha = 1;
    // 目標：據點（字母）與首領（橘色菱形），在羅盤上標出方向
    const mark = (tx, tz, color, label) => {
      const bearing = (Math.atan2(tx - p.pos.x, -(tz - p.pos.z)) * 180) / Math.PI;
      const x = xOf(bearing);
      if (x === null) return;
      c.fillStyle = color;
      c.beginPath();
      c.moveTo(x, H - 3);
      c.lineTo(x - 5, H - 9);
      c.lineTo(x + 5, H - 9);
      c.fill();
      if (label) {
        c.font = "bold 11px Bahnschrift, sans-serif";
        c.fillText(label, x, 7);
      }
    };
    const st = Game.mode.status();
    if (st.points) for (const pt of st.points) mark(pt.x, pt.z, pt.owner === 0 ? "#35d6ff" : pt.owner === 1 ? "#ff4a5e" : "#e8f1fa", pt.name);
    if (Game.boss && Game.boss.alive) mark(Game.boss.pos.x, Game.boss.pos.z, "#ff9a3a", "◆");
    // 中央：目前方位的數字與指針
    c.fillStyle = "#ffffff";
    c.beginPath();
    c.moveTo(W / 2, H - 1);
    c.lineTo(W / 2 - 4, H - 6);
    c.lineTo(W / 2 + 4, H - 6);
    c.fill();
  },

  /* ============================================================
   *  計分板
   * ============================================================ */
  /* ============================================================
   *  戰績表：遊戲中按住 Tab 的計分板與結算畫面共用
   * ------------------------------------------------------------
   *  actors  要列出的角色（會依得分排序）
   *  opt.full   顯示完整欄位（結算畫面）；否則只顯示精簡欄位（遊戲中）
   *  opt.mvp    MVP 的角色（名字旁邊加金色 MVP 標籤）
   *  opt.ffa    個人亂鬥：每個人用自己的顏色
   * ============================================================ */
  statsTable(actors, opt = {}) {
    const rows = actors.slice().sort((a, b) => b.stats.score - a.stats.score || b.stats.kills - a.stats.kills);
    const topDamage = Math.max(1, ...rows.map((a) => a.stats.damage)); // 傷害長條以全表最高者為 100%
    const color = (a) => a.isPlayer ? "#7dffb0" : opt.ffa
      ? Util.cssColor(CONFIG.TEAM_COLORS[a.team % CONFIG.TEAM_COLORS.length]) : this.colorOf(a);
    const line = (a, i) => {
      const s = a.stats;
      const kd = (s.deaths ? s.kills / s.deaths : s.kills).toFixed(1);
      const acc = s.shots ? Math.round((s.hits / s.shots) * 100) + "%" : "-";
      const op = a.operator ? `<small>${a.operator.cn}</small>` : "";
      const badge = (a === opt.mvp ? `<em class="mvp">MVP</em>` : "") + (a.isPlayer ? `<em class="you">你</em>` : "");
      const dmg = Math.round(s.damage);
      const name = `<td class="who"><div><i style="background:${color(a)}"></i><span><b style="color:${color(a)}">${a.name}</b>${op}</span>${badge}</div></td>`;
      if (!opt.full) {
        return `<tr class="${a.isPlayer ? "me" : ""}${a.alive ? "" : " dead"}">${name}
          <td>${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${dmg}</td><td>${s.score}</td></tr>`;
      }
      return `<tr class="${a.isPlayer ? "me" : ""}">
        <td class="rank">${i + 1}</td>${name}
        <td class="big">${s.kills}</td><td>${s.deaths}</td><td>${s.assists}</td><td>${kd}</td>
        <td class="dmg"><span>${dmg}</span><u style="width:${(dmg / topDamage) * 100}%"></u></td>
        <td>${s.headshots}</td><td>${acc}</td><td>${s.bestStreak}</td><td class="big">${s.score}</td></tr>`;
    };
    const head = opt.full
      ? `<tr><th>#</th><th>幹員</th><th>擊殺</th><th>死亡</th><th>助攻</th><th>K/D</th><th>傷害</th><th>爆頭</th><th>命中率</th><th>最高連殺</th><th>得分</th></tr>`
      : `<tr><th>名稱</th><th>擊殺</th><th>死亡</th><th>助攻</th><th>傷害</th><th>得分</th></tr>`;
    return `<table class="stats-table${opt.full ? " full" : ""}">${head}${rows.map(line).join("")}</table>`;
  },

  _buildScoreboard() {
    const p = Game.player;
    const rows = Combat.actors.filter((a) => !a.isBoss && (a.isPlayer || !a.removeOnDeath));
    let html = `<h2>${Game.mode.def.name} <small>${Game.mapDef.name} · ${Game.difficulty.name}</small></h2>`;
    if (Game.mode.ffa || rows.length <= 1) {
      html += this.statsTable(rows, { ffa: Game.mode.ffa });
    } else {
      // 團隊模式：我方與敵方各一張表
      const ours = rows.filter((a) => a.team === p.team), theirs = rows.filter((a) => a.team !== p.team);
      html += `<div class="cols"><div><h3 class="ours">我方</h3>${this.statsTable(ours)}</div>` +
        `<div><h3 class="theirs">敵方</h3>${this.statsTable(theirs)}</div></div>`;
    }
    this.el.scoreboard.innerHTML = html;
  },
};

/* ============================================================
 *  HUD 圖示（SVG 向量圖，顏色跟著 CSS 的 currentColor 走）
 *  每個圖示都畫在 48 × 48 的格子裡。
 * ============================================================ */
HUD.ICONS = {
  // 手榴彈：圓形彈體、握片與拉環
  grenade: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="22" cy="30" rx="11" ry="12.5"/>
    <path d="M14 26h16M14 34h16" opacity=".55"/>
    <rect x="17" y="13" width="10" height="6" rx="1.5"/>
    <path d="M27 15.5h6l3 9"/>
    <circle cx="33" cy="10" r="4"/>
  </svg>`,

  // 醫療包：急救箱與十字
  medkit: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M18 13v-3h12v3"/>
    <rect x="6" y="13" width="36" height="26" rx="4"/>
    <path d="M24 19v14M17 26h14" stroke-width="4.2"/>
  </svg>`,

  // 戰地急救：心形加上十字
  heal: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round">
    <path d="M24 41S7 30 7 18a8.5 8.5 0 0 1 17-2 8.5 8.5 0 0 1 17 2c0 12-17 23-17 23z"/>
    <path d="M24 20v11M18.5 25.5h11" stroke-width="3.4"/>
  </svg>`,

  // 相位衝刺：箭頭與速度線
  dash: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round">
    <path d="M22 12l12 12-12 12"/>
    <path d="M32 12l12 12-12 12" opacity=".5"/>
    <path d="M4 18h12M2 24h18M4 30h12"/>
  </svg>`,

  // 脈衝掃描：雷達圓與掃描扇形
  scan: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <circle cx="24" cy="24" r="18"/>
    <circle cx="24" cy="24" r="10.5" opacity=".55"/>
    <path d="M24 24L37 11"/>
    <path d="M24 6a18 18 0 0 1 13 5L24 24z" fill="currentColor" opacity=".35" stroke="none"/>
    <circle cx="31" cy="30" r="2.6" fill="currentColor" stroke="none"/>
    <circle cx="15" cy="17" r="2" fill="currentColor" stroke="none"/>
  </svg>`,

  // 力場護盾：盾牌與能量紋
  shield: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linejoin="round">
    <path d="M24 5l16 6v11c0 10-7 17.5-16 21C15 39.5 8 32 8 22V11z"/>
    <path d="M24 12l9 3.4v7c0 6-4 10.5-9 12.8z" fill="currentColor" opacity=".35" stroke="none"/>
    <path d="M17 24l5 5 9-10" stroke-width="3" stroke-linecap="round"/>
  </svg>`,

  // 軌道打擊：瞄準圈與從天而降的光束
  strike: `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
    <path d="M24 2v20" stroke-width="5" opacity=".8"/>
    <ellipse cx="24" cy="36" rx="17" ry="7"/>
    <ellipse cx="24" cy="36" rx="8" ry="3.2" opacity=".6"/>
    <path d="M24 26v4M24 42v4M5 36h4M39 36h4"/>
  </svg>`,
};

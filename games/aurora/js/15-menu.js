/*
 * ============================================================
 *  15-menu.js ── 選單
 * ------------------------------------------------------------
 *  所有「不是戰鬥中」的畫面都在這裡：
 *    main     主選單            setup    作戰準備（幹員／地圖／模式／難度）
 *    help     操作說明          settings 設定
 *    pause    暫停              perk     生存模式的三選一強化
 *    result   結算
 *
 *  選單是半透明的，後面會看到即時的 3D 場景（展示目前選的地圖與幹員），
 *  攝影機的運鏡寫在 updateShowcase()。
 * ============================================================
 */

const Menu = {
  screen: "main", // 目前顯示的畫面
  tab: "op", // 作戰準備裡目前的分頁
  returnTo: "main", // 從設定／說明按返回時要回到哪裡
  // 玩家的選擇（會存到瀏覽器，下次開啟還在）
  pick: { operator: "vanta", map: "neo", mode: "tdm", difficulty: "normal", boss: "titan" },
  showRig: null, // 選單裡展示的幹員模型
  camAngle: 0,
  root: null,

  /* ---------- 初始化 ---------- */
  init() {
    this.root = document.getElementById("menu");
    Object.assign(this.pick, Util.load("pick", {}));
    // 以前存的地圖如果已經不存在（舊版地圖），改成第一張地圖
    if (!Maps.list.some((m) => m.id === this.pick.map)) this.pick.map = Maps.list[0].id;

    // 所有帶 data-go 的按鈕：切換到指定畫面
    this.root.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-go]");
      if (btn) this.go(btn.dataset.go);
    });
    // 滑過與點擊的音效（第一次點擊時順便啟動音效系統）
    this.root.addEventListener("mouseover", (e) => {
      const hit = e.target.closest("button, .card");
      if (hit && hit !== this._hover) {
        this._hover = hit;
        Sound.play("uiHover");
      }
    });
    this.root.addEventListener("click", (e) => {
      Sound.init();
      if (e.target.closest("button, .card")) Sound.play("uiClick");
    });

    // 作戰準備的分頁按鈕
    for (const btn of Util.$$("#setup-tabs button")) btn.addEventListener("click", () => this.setTab(btn.dataset.tab));
    // 右下角的主按鈕：前三步是「下一步」，最後一步（難度）才是「部署」
    Util.$("#deploy").addEventListener("click", () => this.nextStep());

    // 暫停與結算的按鈕
    Util.$("#btn-resume").addEventListener("click", () => Game.resume());
    Util.$("#btn-restart").addEventListener("click", () => this.deploy());
    Util.$("#btn-quit").addEventListener("click", () => Game.quit());
    Util.$("#btn-again").addEventListener("click", () => this.deploy());
    Util.$("#btn-result-menu").addEventListener("click", () => Game.quit());
    // 結算畫面的分頁（點按鈕，或按 Tab 鍵在兩頁之間切換）
    for (const b of Util.$$("#result-tabs button")) b.addEventListener("click", () => this.resultTab(b.dataset.rt));
    window.addEventListener("keydown", (e) => {
      if (e.code !== "Tab" || Game.state !== "ended" || !this.result || Util.$("#screen-result").offsetParent === null) return;
      e.preventDefault();
      this.resultTab(this.resultTabNow === "all" ? "me" : "all");
    });
    Util.$("#btn-back-settings").addEventListener("click", () => this.go(this.returnTo));
    Util.$("#btn-back-help").addEventListener("click", () => this.go(this.returnTo));

    this._buildSettings();
    this._buildHelp();
    this.renderSetup();
    this.showMain();
  },

  /* ============================================================
   *  地圖預覽圖：用遊戲引擎實際拍下每張地圖的畫面
   * ------------------------------------------------------------
   *  第一次開啟時把四張地圖各載入一次、從斜上方拍一張照片，
   *  存到瀏覽器裡（localStorage），之後開遊戲就直接使用，不用重拍。
   *  改了地圖之後把下面的 KEY 版本號加 1，就會重新拍。
   * ============================================================ */
  previews: {},

  // 每拍完一張就讓瀏覽器喘口氣，避免一次拍四張讓畫面（和外面的網站）卡住
  async buildPreviews() {
    const KEY = "previews.v9";
    const saved = Util.load(KEY, null);
    if (saved && Maps.list.every((m) => saved[m.id])) {
      this.previews = saved;
      return;
    }
    this.capturing = true; // 拍照期間就算遊戲館暫停了，也照常繪製
    const cam = Scene3D.camera;
    const screen = Scene3D.renderer.domElement;
    const out = document.createElement("canvas");
    out.width = 640;
    out.height = 300;
    const ctx = out.getContext("2d");
    const prevFov = cam.fov;

    for (const m of Maps.list) {
      if (m !== Maps.list[0]) await new Promise((resolve) => setTimeout(resolve, 0));
      Game.loadMap(m.id);
      const s = m.shot; // 每張地圖自己設定的拍攝位置
      cam.position.set(...s.pos);
      cam.lookAt(...s.look);
      cam.fov = s.fov || 50;
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      Scene3D.render(0.016, false); // 第一次繪製會順便編譯著色器
      Scene3D.render(0.016, false);
      // 從畫面中央裁出 640 × 300 的比例
      const cw = screen.width, ch = screen.height;
      let sw = cw, sh = (cw * 300) / 640;
      if (sh > ch) {
        sh = ch;
        sw = (ch * 640) / 300;
      }
      ctx.drawImage(screen, (cw - sw) / 2, (ch - sh) / 2, sw, sh, 0, 0, 640, 300);
      this.previews[m.id] = out.toDataURL("image/jpeg", 0.85);
    }
    cam.fov = prevFov;
    cam.updateProjectionMatrix();
    this.capturing = false;
    Util.save(KEY, this.previews);
  },

  // 地圖預覽的 CSS 背景（還沒拍好時用原本的漸層色塊代替）
  previewStyle(id) {
    const url = this.previews[id];
    return url ? `style="background-image:url('${url}')"` : "";
  },

  /* ---------- 切換畫面 ---------- */
  go(name) {
    // 進入設定或說明時，記住是從哪裡來的
    if ((name === "settings" || name === "help") && this.screen !== "settings" && this.screen !== "help")
      this.returnTo = this.screen;
    // 從其他畫面（主選單、結算）進入作戰準備時，一律從第 1 步「幹員」開始
    if (name === "setup" && this.screen !== "setup") this.tab = "op";
    this.screen = name;
    this.root.classList.remove("hidden");
    for (const sec of Util.$$(".screen", this.root)) sec.classList.toggle("show", sec.id === "screen-" + name);
    this.root.dataset.screen = name;
    if (name === "setup") this.renderSetup();
  },

  hide() {
    this.root.classList.add("hidden");
  },

  showMain() {
    this.go("main");
    Game.loadMap(this.pick.map);
    this.refreshShowcase();
  },

  showPause(on) {
    if (on) this.go("pause");
    else this.hide();
  },

  /* ============================================================
   *  作戰準備
   * ============================================================ */
  setTab(tab) {
    this.tab = tab;
    this.renderSetup();
  },

  // 作戰準備的四個步驟（順序）
  STEPS: [
    { tab: "op", name: "幹員" },
    { tab: "map", name: "地圖" },
    { tab: "mode", name: "模式" },
    { tab: "diff", name: "難度" },
  ],

  // 主按鈕：還沒到最後一步就前往下一步，到了「難度」才部署
  nextStep() {
    const i = this.STEPS.findIndex((st) => st.tab === this.tab);
    if (i < this.STEPS.length - 1) this.setTab(this.STEPS[i + 1].tab);
    else this.deploy();
  },

  // 依目前的步驟更新主按鈕的文字
  updateStepButton() {
    const i = this.STEPS.findIndex((st) => st.tab === this.tab);
    const btn = Util.$("#deploy");
    const last = i === this.STEPS.length - 1;
    btn.classList.toggle("next", !last);
    btn.innerHTML = last
      ? `<b>部署</b><small>開始對戰 ▶</small>`
      : `<b>下一步</b><small>${String(i + 2).padStart(2, "0")} ${this.STEPS[i + 1].name} ▶</small>`;
  },

  // 選擇改變時：存檔、重畫、更新 3D 展示
  choose(key, value) {
    this.pick[key] = value;
    Util.save("pick", this.pick);
    this.renderSetup();
    if (key === "map") {
      // 換地圖需要一點時間建造，先讓畫面更新再開始
      Util.$("#map-loading").classList.add("show");
      setTimeout(() => {
        Game.loadMap(value);
        this.refreshShowcase();
        Util.$("#map-loading").classList.remove("show");
      }, 30);
    } else if (key === "operator") {
      this.refreshShowcase();
    }
  },

  renderSetup() {
    this.updateStepButton();
    for (const btn of Util.$$("#setup-tabs button")) btn.classList.toggle("active", btn.dataset.tab === this.tab);
    const list = Util.$("#setup-list");
    const detail = Util.$("#setup-detail");
    list.innerHTML = "";
    const p = this.pick;

    // 產生一張可點選的卡片
    const card = (active, html, onClick, cls = "") => {
      const node = Util.el("div", "card " + cls + (active ? " active" : ""), html);
      node.addEventListener("click", onClick);
      list.appendChild(node);
      return node;
    };

    if (this.tab === "op") {
      for (const op of OPERATORS) {
        const node = card(
          op.id === p.operator,
          `<div class="card-title">${op.name}<small>${op.cn}</small></div><div class="card-sub">${op.role}</div>`,
          () => this.choose("operator", op.id)
        );
        node.style.setProperty("--c", Util.cssColor(op.look.accent));
      }
      const op = OPERATORS.find((o) => o.id === p.operator);
      const bars = Object.entries(op.stats).map(([k, v]) => `<div class="stat"><span>${k}</span><div class="bar"><i style="width:${v * 10}%"></i></div></div>`).join("");
      // 武器清單：編號、槍的剪影圖、名稱與類型
      const guns = op.weapons.map((id, i) => {
        const icon = WeaponModels.icons[id] ? `<img src="${WeaponModels.icons[id]}" alt="">` : "";
        return `<li><b>${i + 1}</b>${icon}<span>${WEAPONS[id].name}</span><em>${WEAPONS[id].cls}</em></li>`;
      }).join("");
      detail.style.setProperty("--c", Util.cssColor(op.look.accent));
      detail.innerHTML = `
        <div class="d-kicker">${op.role}</div>
        <h2>${op.name} <small>${op.cn}</small></h2>
        <p>${op.desc}</p>
        <div class="d-row"><span>生命 <b>${op.hp}</b></span><span>護甲 <b>${op.armor}</b></span><span>手榴彈 <b>${op.grenades}</b></span></div>
        <div class="stats">${bars}</div>
        <h4>武器配置</h4><ul class="guns">${guns}</ul>
        <h4>技能 <kbd>Q</kbd> — ${op.skill.name}</h4>
        <p class="skill-desc">${op.skill.desc}<br><small>冷卻時間 ${op.skill.cooldown} 秒</small></p>`;
    } else if (this.tab === "map") {
      for (const m of Maps.list) {
        card(
          m.id === p.map,
          `<div class="thumb thumb-${m.id}" ${this.previewStyle(m.id)}></div>` +
            `<div class="card-title">${m.name}<small>${m.en}</small></div><div class="card-sub">${m.tag}</div>`,
          () => this.choose("map", m.id),
          "map-card"
        );
      }
      const m = Maps.get(p.map);
      detail.style.setProperty("--c", Util.cssColor(m.pal.accent1));
      detail.innerHTML = `
        <div class="d-preview" ${this.previewStyle(m.id)}></div>
        <div class="d-kicker">${m.en}</div>
        <h2>${m.name}</h2>
        <p>${m.desc}</p>
        <div class="d-row"><span>場地 <b>${m.half * 2} × ${m.half * 2} 公尺</b></span><span>天氣 <b>${{ rain: "夜雨", dust: "沙塵", snow: "降雪", motes: "無重力塵埃", ash: "灰燼與流星", bubbles: "深海氣泡" }[m.weather]}</b></span></div>
        <h4>戰場特色</h4><p>${m.tag}</p>
        <p class="hint">背景就是這張地圖的即時畫面。</p>`;
    } else if (this.tab === "mode") {
      for (const m of MODES) {
        card(
          m.id === p.mode,
          `<div class="card-icon">${m.icon}</div><div class="card-title">${m.name}<small>${m.en}</small></div>`,
          () => this.choose("mode", m.id),
          "mode-card"
        );
      }
      const m = MODES.find((x) => x.id === p.mode);
      let extra = "";
      if (m.id === "boss") {
        // 首領討伐：再選一個首領
        extra = `<h4>選擇首領</h4><div class="boss-pick">` + Object.values(BOSSES).map((b) =>
          `<div class="card boss-card${b.id === p.boss ? " active" : ""}" data-boss="${b.id}" style="--c:${Util.cssColor(b.color)}">
             <div class="card-title">${b.name}<small>${b.cn}</small></div><div class="card-sub">${b.title}</div></div>`).join("") + `</div>
          <p>${BOSSES[p.boss].desc}</p>`;
      }
      const rule = m.scoreLimit
        ? `<div class="d-row"><span>勝利條件 <b>${m.scoreLimit} 分</b></span><span>時間 <b>${Util.formatTime(m.timeLimit)}</b></span></div>`
        : "";
      detail.style.setProperty("--c", "#35d6ff");
      // 這個模式的難度規則
      const notes = m.notes ? `<h4>模式規則</h4><ul class="notes">${m.notes.map((n) => `<li>${n}</li>`).join("")}</ul>` : "";
      detail.innerHTML = `<div class="d-kicker">${m.en}</div><h2>${m.name}</h2><p>${m.desc}</p>${rule}${notes}${extra}`;
      for (const node of Util.$$("[data-boss]", detail))
        node.addEventListener("click", () => this.choose("boss", node.dataset.boss));
    } else {
      for (const d of DIFFICULTIES) {
        const node = card(
          d.id === p.difficulty,
          `<div class="card-title">${d.name}</div><div class="card-sub">${d.desc}</div>`,
          () => this.choose("difficulty", d.id)
        );
        node.style.setProperty("--c", d.color);
      }
      const d = DIFFICULTIES.find((x) => x.id === p.difficulty);
      detail.style.setProperty("--c", d.color);
      detail.innerHTML = `
        <div class="d-kicker">DIFFICULTY</div><h2>${d.name}</h2><p>${d.desc}</p>
        <div class="stats">
          <div class="stat"><span>敵人準度</span><div class="bar"><i style="width:${Math.round(100 - d.botSpread * 35)}%"></i></div></div>
          <div class="stat"><span>敵人反應</span><div class="bar"><i style="width:${Math.round(100 - d.reaction * 110)}%"></i></div></div>
          <div class="stat"><span>敵人傷害</span><div class="bar"><i style="width:${Math.round(d.botDamage * 90)}%"></i></div></div>
          <div class="stat"><span>敵人生命</span><div class="bar"><i style="width:${Math.round(d.enemyHp * 70)}%"></i></div></div>
        </div>
        <div class="d-row"><span>首領戰可復活 <b>${d.lives} 次</b></span></div>`;
    }

    // 底部摘要：一眼看到目前的全部選擇
    const op = OPERATORS.find((o) => o.id === p.operator);
    const mode = MODES.find((x) => x.id === p.mode);
    Util.$("#setup-summary").innerHTML =
      `<span><i>幹員</i>${op.name}</span><span><i>地圖</i>${Maps.get(p.map).name}</span>` +
      `<span><i>模式</i>${mode.name}${mode.id === "boss" ? "・" + BOSSES[p.boss].name : ""}</span>` +
      `<span><i>難度</i>${DIFFICULTIES.find((x) => x.id === p.difficulty).name}</span>`;
  },

  // 部署：顯示載入畫面，下一個瞬間開始對戰
  deploy() {
    Sound.init();
    this.hide();
    const loading = document.getElementById("loading");
    loading.classList.remove("hidden");
    Util.$("#loading-text").textContent = "部署中…";
    this.removeShowcase();
    Scene3D.showLight.intensity = 0;
    setTimeout(() => {
      try {
        Game.start({ ...this.pick });
      } catch (err) {
        Main.fail(err);
        return;
      }
      loading.classList.add("hidden");
    }, 60);
  },

  /* ============================================================
   *  3D 展示：選單背後的幹員與運鏡
   * ============================================================ */
  removeShowcase() {
    if (!this.showRig) return;
    Scene3D.scene.remove(this.showRig.root);
    this.showRig.mat.dispose();
    this.showRig = null;
  },

  refreshShowcase() {
    this.removeShowcase();
    const op = OPERATORS.find((o) => o.id === this.pick.operator);
    const def = Maps.current;
    const spot = Nav.snap(def.playerSpawn.x, def.playerSpawn.z - 6);
    this.showRig = CharModels.create(op.look);
    CharModels.setWeapon(this.showRig, op.weapons[0], op.look.accent);
    this.showRig.root.position.set(spot.x, spot.y, spot.z);
    this.showRig.root.rotation.y = Math.PI; // 面向 +Z（攝影機會在那一側）
    Scene3D.scene.add(this.showRig.root);
    this.showSpot = spot;
  },

  // 每幀更新選單背景的攝影機
  updateShowcase(dt) {
    const cam = Scene3D.camera;
    const def = Maps.current;
    if (!def) return;
    this.camAngle += dt * 0.07;
    if (this.showRig) this.showRig.animate(dt, { speed: 0, pitch: Math.sin(Scene3D.time * 0.8) * 0.05, crouch: 0 });

    let pos, look, fov = 50;
    const s = this.showSpot || { x: 0, y: 0, z: 0 };
    const closeUp = this.screen === "setup" && this.tab === "op";

    if (closeUp) {
      // 幹員特寫：攝影機在角色正前方左右微幅擺動；視線偏左，讓角色出現在畫面右半邊
      const sway = Math.sin(Scene3D.time * 0.35) * 0.35;
      pos = new THREE.Vector3(s.x + Math.sin(sway - 0.25) * 3.3, s.y + 1.35, s.z + Math.cos(sway - 0.25) * 3.3);
      look = new THREE.Vector3(s.x - 1.15, s.y + 1.05, s.z);
      fov = 42;
      // 補光：從攝影機左上方打亮角色
      Scene3D.showLight.position.set(s.x - 1.2, s.y + 2.6, s.z + 2.6);
    } else if (this.screen === "setup" && this.tab === "map") {
      // 地圖鳥瞰：在高空繞著地圖中心轉
      const r = def.half * 1.05;
      pos = new THREE.Vector3(Math.sin(this.camAngle * 2) * r, def.half * 0.62, Math.cos(this.camAngle * 2) * r);
      look = new THREE.Vector3(0, 0, 0);
      fov = 55;
    } else {
      // 其他畫面：低空緩慢環繞
      const r = def.half * 0.72;
      pos = new THREE.Vector3(
        Math.sin(this.camAngle) * r,
        9 + Math.sin(this.camAngle * 1.7) * 2,
        Math.cos(this.camAngle) * r
      );
      look = new THREE.Vector3(0, 2.5, 0);
      fov = 58;
    }
    Scene3D.showLight.intensity = Util.damp(Scene3D.showLight.intensity, closeUp ? 34 : 0, 4, dt);
    // 平滑地移動到新的機位（切換分頁時會有運鏡效果）
    const k = 1 - Math.exp(-dt * 3);
    if (!this._camPos) {
      this._camPos = pos.clone();
      this._camLook = look.clone();
    }
    this._camPos.lerp(pos, k);
    this._camLook.lerp(look, k);
    cam.position.copy(this._camPos);
    cam.lookAt(this._camLook);
    cam.fov = Util.damp(cam.fov, fov, 3, dt);
    cam.updateProjectionMatrix();
    Sound.listener.x = cam.position.x;
    Sound.listener.z = cam.position.z;
  },

  /* ============================================================
   *  生存模式：三選一強化
   * ============================================================ */
  showPerks(wave, perks, onPick) {
    this.go("perk");
    Util.$("#perk-title").textContent = "第 " + wave + " 波完成";
    const box = Util.$("#perk-list");
    box.innerHTML = "";
    perks.forEach((perk, i) => {
      const node = Util.el(
        "div",
        "card perk-card",
        `<div class="perk-icon">${perk.icon}</div><div class="card-title">${perk.name}</div><div class="card-sub">${perk.desc}</div><kbd>${i + 1}</kbd>`
      );
      node.addEventListener("click", () => {
        this.hide();
        this._perkKeys = null;
        onPick(perk);
      });
      box.appendChild(node);
    });
    // 也可以直接按 1 / 2 / 3 選擇
    this._perkKeys = (index) => {
      if (box.children[index]) box.children[index].click();
    };
  },

  /* ============================================================
   *  結算
   * ============================================================ */
  showResult(data) {
    Input.unlock();
    HUD.show(false);
    this.go("result");
    const sec = Util.$("#screen-result");
    sec.classList.toggle("win", data.win);
    Util.$("#result-title").textContent = data.title;
    Util.$("#result-sub").textContent = data.sub + (data.extra ? " · " + data.extra : "");
    Util.$("#result-grade").textContent = data.grade;
    Util.$("#result-meta").innerHTML = data.meta.map((m) => `<span>${m}</span>`).join("");
    this.result = data;
    // 團隊與個人亂鬥預設看「全員戰績」；生存與首領只有你一個人，預設看「我的戰績」
    this.resultTab(data.kind === "solo" ? "me" : "all");
  },

  /* 切換結算畫面的分頁：all 全員戰績／me 我的戰績 */
  resultTab(tab) {
    const data = this.result;
    if (!data) return;
    this.resultTabNow = tab;
    for (const b of Util.$$("#result-tabs button")) b.classList.toggle("on", b.dataset.rt === tab);
    Util.$("#result-tabs [data-rt=all]").textContent = data.kind === "solo" ? "戰鬥明細" : "全員戰績";
    Util.$("#result-body").innerHTML = tab === "me" ? this._resultMine(data) : this._resultAll(data);
  },

  /* ---- 全員戰績：本場焦點＋所有人的詳細數據 ---- */
  _resultAll(data) {
    const p = Game.player;
    if (data.kind === "solo") return this._resultSolo(data);
    const all = data.actors;
    const best = (key) => all.reduce((m, a) => (a.stats[key] > m.stats[key] ? a : m), all[0]);
    const mvp = best("score");
    const ffa = data.kind === "ffa";
    const nameColor = (a) => a.isPlayer ? "#7dffb0" : ffa
      ? Util.cssColor(CONFIG.TEAM_COLORS[a.team % CONFIG.TEAM_COLORS.length]) : HUD.colorOf(a);

    // 本場焦點：五個獎項，你拿到的會亮起來
    const awards = [
      ["MVP", "最高得分", mvp, mvp.stats.score + " 分"],
      ["擊殺王", "最多擊殺", best("kills"), best("kills").stats.kills + " 殺"],
      ["火力輸出", "最高傷害", best("damage"), Math.round(best("damage").stats.damage) + " 傷害"],
      ["神射手", "最多爆頭", best("headshots"), best("headshots").stats.headshots + " 爆頭"],
      ["殺戮機器", "最長連殺", best("bestStreak"), best("bestStreak").stats.bestStreak + " 連殺"],
    ];
    let html = `<div class="awards">` + awards.map(([t, sub, a, v]) => `
      <div class="award${a.isPlayer ? " mine" : ""}">
        <small>${sub}</small><h4>${t}</h4>
        <b style="color:${nameColor(a)}">${a.name}${a.isPlayer ? "（你）" : ""}</b><span>${v}</span>
      </div>`).join("") + `</div>`;

    if (ffa) {
      html += `<h3 class="board-title">最終排名</h3>` + HUD.statsTable(all, { full: true, mvp, ffa: true });
    } else {
      const sc = data.scores || [0, 0];
      const ours = all.filter((a) => a.team === p.team), theirs = all.filter((a) => a.team !== p.team);
      const tag = (mine) => mine === (sc[0] > sc[1]) && sc[0] !== sc[1] ? "勝利" : sc[0] === sc[1] ? "平手" : "落敗";
      html += `<h3 class="board-title ours">我方 <b>${sc[0]}</b><small>${tag(true)}</small></h3>` +
        HUD.statsTable(ours, { full: true, mvp }) +
        `<h3 class="board-title theirs">敵方 <b>${sc[1]}</b><small>${tag(false)}</small></h3>` +
        HUD.statsTable(theirs, { full: true, mvp });
    }
    return html;
  },

  /* ---- 生存／首領：戰鬥明細（擊殺了哪些敵人、首領戰的輸出） ---- */
  _resultSolo(data) {
    const s = Game.player.stats;
    let html = "";
    const boss = Game.boss;
    if (Game.mode instanceof BossRaid && boss) {
      const left = Math.max(0, Math.ceil((boss.hp / boss.maxHp) * 100));
      html += `<div class="boss-report" style="--c:${Util.cssColor(boss.def.color)}">
        <div><small>首領</small><b>${boss.def.name}</b><span>${boss.def.cn} — ${boss.def.title}</span></div>
        <div><small>對首領造成傷害</small><b>${Math.round(s.bossDamage)}</b></div>
        <div><small>首領剩餘生命</small><b>${left}%</b><i><u style="width:${left}%"></u></i></div>
        <div><small>剩餘復活次數</small><b>${Game.mode.lives}</b></div>
      </div>`;
    }
    html += `<div class="detail-cols">` + this._killList("擊殺的敵人", s.killsBy) + this._killList("各武器擊殺", s.weaponKills) + `</div>`;
    return html;
  },

  // 一張「名稱 + 長條 + 數字」的清單（依數量排序）
  _killList(title, obj) {
    const list = Object.entries(obj).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...list.map((e) => e[1]));
    const rows = list.length
      ? list.map(([k, v]) => `<li><span>${k}</span><i><u style="width:${(v / max) * 100}%"></u></i><b>${v}</b></li>`).join("")
      : `<li class="empty">沒有擊殺</li>`;
    return `<div class="kill-list"><h3 class="board-title">${title}</h3><ul>${rows}</ul></div>`;
  },

  /* ---- 我的戰績：個人的詳細數據 ---- */
  _resultMine(data) {
    const p = Game.player, s = p.stats;
    const kd = (s.deaths ? s.kills / s.deaths : s.kills).toFixed(2);
    // 爆頭率：命中的子彈裡有幾成打在頭上
    const hsRate = s.hits ? Math.min(100, Math.round((s.headshots / s.hits) * 100)) + "%" : "-";
    const cells = [
      ...data.stats.slice(0, 2), ["助攻", s.assists], ["K/D", kd], ...data.stats.slice(2, 4), ["爆頭率", hsRate],
      ...data.stats.slice(4, 7), // 時間已經寫在上方的標籤裡，這裡不重複
    ];
    let html = `<div class="my-op"><i style="background:${Util.cssColor(p.operator.look.accent)}"></i>` +
      `<b>${p.operator.name}</b><span>${p.operator.cn} · ${p.operator.role}</span></div>`;
    html += `<div class="my-stats">` + cells.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("") + `</div>`;
    html += `<div class="detail-cols">` + this._killList("各武器擊殺", s.weaponKills) +
      (data.kind === "solo" ? this._killList("擊殺的敵人", s.killsBy) : this._killList("擊殺的對象", s.killsBy)) + `</div>`;
    return html;
  },

  /* ============================================================
   *  設定
   * ============================================================ */
  _buildSettings() {
    // 每個滑桿：讀取目前值、拖動時立即套用並存檔
    const slider = (id, value, onChange, format) => {
      const input = Util.$("#" + id);
      const label = Util.$("#" + id + "-val");
      input.value = value;
      label.textContent = format(value);
      input.addEventListener("input", () => {
        const v = parseFloat(input.value);
        label.textContent = format(v);
        onChange(v);
      });
    };

    slider(
      "set-sens",
      Input.sensitivity,
      (v) => { Input.sensitivity = v; Util.save("sens", v); },
      (v) => v.toFixed(2) + "×"
    );
    slider(
      "set-fov",
      Util.load("fov", 78),
      (v) => { Util.save("fov", v); if (Game.player) Game.player.baseFov = v; },
      (v) => v + "°"
    );
    const vol = Util.load("volume", Sound.volume);
    Object.assign(Sound.volume, vol);
    slider(
      "set-vol",
      Sound.volume.master,
      (v) => { Sound.volume.master = v; Sound.applyVolume(); Util.save("volume", Sound.volume); },
      (v) => Math.round(v * 100) + "%"
    );
    slider(
      "set-music",
      Sound.volume.music,
      (v) => { Sound.volume.music = v; Sound.applyVolume(); Util.save("volume", Sound.volume); },
      (v) => Math.round(v * 100) + "%"
    );

    // 畫質：三個按鈕
    const box = Util.$("#set-quality");
    for (const [key, q] of Object.entries(Scene3D.QUALITY)) {
      const btn = Util.el("button", key === Scene3D.quality ? "active" : "", q.label);
      btn.addEventListener("click", () => {
        Scene3D.setQuality(key);
        for (const b of box.children) b.classList.toggle("active", b === btn);
      });
      box.appendChild(btn);
    }
  },

  /* ============================================================
   *  操作說明
   * ============================================================ */
  _buildHelp() {
    const keys = [
      ["W A S D", "移動"], ["滑鼠", "瞄準"], ["左鍵", "射擊"], ["右鍵", "開鏡瞄準"],
      ["Shift", "衝刺"], ["Space", "跳躍"], ["C", "蹲下／站起（按一下切換）"], ["R", "換彈"],
      ["1 2 3 / 滾輪", "切換武器"], ["G（按住）", "預覽手榴彈落點，放開投擲；左鍵取消"],
      ["V / F", "近戰攻擊"], ["Q", "幹員技能"], ["H / 4", "使用隨身醫療包"], ["Tab（按住）", "計分板"], ["Esc", "暫停"],
    ];
    Util.$("#help-keys").innerHTML = keys.map(([k, d]) => `<div><kbd>${k}</kbd><span>${d}</span></div>`).join("");
    const tips = [
      ["戰鬥", "開鏡與蹲下會大幅提高命中率；連續射擊準星會擴散，短點放最有效率。爆頭傷害更高。"],
      ["補給", "身上最多帶 3 個醫療包，按 H 隨時使用。地圖上的紅色醫療箱會補充醫療包，藍色護甲、黃色彈藥、橘色手榴彈走過去自動撿取，一段時間後重生。"],
      ["爆炸桶", "紅色油桶被打爆會造成大範圍傷害，敵人躲在旁邊時是好機會，自己也別站太近。"],
      ["敵人", "敵人會走位、找掩體、包抄與丟手榴彈。狙擊手開槍前會射出紅色雷射，看到請立刻移動。"],
      ["首領", "每一招出手前都有預警：紅圈代表落點、黃圈代表震波（跳躍閃避）、紅線代表衝撞路徑。首領衝撞撞到牆會暈眩，是輸出的最佳時機。"],
      ["生存", "每撐過一波可以選一個永久強化，並補充部分彈藥。每 5 波會出現首領。"],
    ];
    Util.$("#help-tips").innerHTML = tips.map(([k, d]) => `<div><b>${k}</b><p>${d}</p></div>`).join("");
  },
};

"use strict";
// ============================================================
//  介面：機庫選裝、模式選擇、戰鬥 HUD、小地圖、結算
// ============================================================
// LOADOUT：玩家目前在機庫選好的配置（會自動存在瀏覽器裡，下次開啟還在）
//   mode = 模式　opts = 各模式選的目標數　vol = 音量　chassis = 機體　paint = 塗裝
//   pri / sec = 主、副武器　skills = 三個技能（Q / E / F）　minions = 兩種小兵（1 / 2）
//   diff = 難度 0~2　quality = 畫質 0~2
//   skills 與 minions 裡的 null 代表那一格還沒選
const LOADOUT = {
  mode: "campaign",
  opts: { campaign: 20, endless: 0, boss: 5 },
  vol: { music: 0.3, sfx: 0.8 },
  chassis: "vanguard",
  paint: "azure",
  pri: "autocannon",
  sec: "missile",
  skills: ["dash", "shield", "barrage"],
  minions: ["trooper", "drone"],
  diff: 1,
  quality: 1,
};
// 讀取上次儲存的配置。每一項都會檢查是否還有效（例如改版後某個武器被移除），無效的就維持預設值
(function loadSaved() {
  try {
    const s = JSON.parse(localStorage.getItem("mech_loadout") || "null");
    if (!s) return;
    if (byId(MODES, s.mode)) LOADOUT.mode = s.mode;
    if (s.opts)
      for (const m of MODES)
        if (m.opts.includes(s.opts[m.id])) LOADOUT.opts[m.id] = s.opts[m.id];
    if (byId(CHASSIS, s.chassis)) LOADOUT.chassis = s.chassis;
    if (byId(PAINTS, s.paint)) LOADOUT.paint = s.paint;
    if (byId(PRIMARIES, s.pri)) LOADOUT.pri = s.pri;
    if (byId(SECONDARIES, s.sec)) LOADOUT.sec = s.sec;
    // 多選欄位：每一格不是有效的代號就是 null（還沒選），而且不能重複
    const okList = (a, list, n) => {
      if (!Array.isArray(a) || a.length !== n) return false;
      const ids = a.filter((i) => i !== null);
      return (
        ids.every((i) => byId(list, i)) && new Set(ids).size === ids.length
      );
    };
    if (okList(s.skills, SKILLS, 3)) LOADOUT.skills = s.skills;
    if (okList(s.minions, MINIONS, 2)) LOADOUT.minions = s.minions;
    if (s.diff >= 0 && s.diff <= 2) LOADOUT.diff = s.diff;
    if (s.quality >= 0 && s.quality <= 2) LOADOUT.quality = s.quality;
    if (s.vol && s.vol.music >= 0 && s.vol.music <= 1)
      LOADOUT.vol.music = s.vol.music;
    if (s.vol && s.vol.sfx >= 0 && s.vol.sfx <= 1) LOADOUT.vol.sfx = s.vol.sfx;
  } catch (e) {
    /* 忽略壞掉的存檔 */
  }
})();

// 機庫上方的七個分頁（同時也是七個步驟）
//   list = 這一頁要列出的資料表　multi = 可以選幾個（沒有這欄就是單選）　keys = 多選時每一格對應的按鍵
const TABS = [
  {
    id: "mode",
    name: "模式",
    icon: "🎯",
    list: MODES,
    hint: "選擇作戰模式與目標波數",
  },
  {
    id: "chassis",
    name: "機體",
    icon: "🤖",
    list: CHASSIS,
    hint: "五種骨架與外型完全不同的機體",
  },
  {
    id: "paint",
    name: "塗裝",
    icon: "🎨",
    list: PAINTS,
    hint: "機體配色（小兵也會套用）",
  },
  {
    id: "pri",
    name: "主武器",
    icon: "🔫",
    list: PRIMARIES,
    hint: "右手 ─ 滑鼠左鍵射擊，R 換彈",
  },
  {
    id: "sec",
    name: "副武器",
    icon: "🚀",
    list: SECONDARIES,
    hint: "左手 ─ 滑鼠右鍵使用（冷卻制）",
  },
  {
    id: "skills",
    name: "技能",
    icon: "✨",
    list: SKILLS,
    multi: 3,
    keys: ["Q", "E", "F"],
    hint: "選三個；再點一下已選的就會取消",
  },
  {
    id: "minions",
    name: "小兵",
    icon: "👥",
    list: MINIONS,
    multi: 2,
    keys: ["1", "2"],
    hint: "選兩種；再點一下已選的就會取消",
  },
];
// 把顏色數字轉成 CSS 用的 '#rrggbb' 字串
const hex6 = (n) => "#" + n.toString(16).padStart(6, "0");

// UI：所有 2D 介面的總管（機庫的選單、戰鬥中的 HUD、小地圖、覆蓋層、結算畫面）
const UI = {
  // tab = 目前的分頁　ov / ovx = 覆蓋層畫布與它的畫筆　mm = 小地圖的畫筆　bannerT = 橫幅還要顯示幾秒
  // onChange / onQuality = 選項或畫質改變時要呼叫的函式（由 main.js 設定）
  // el = 常用網頁元素的快取　lastHtml = 上次寫進各元素的內容（內容沒變就不重寫，省效能）
  tab: "mode",
  ov: null,
  ovx: null,
  mm: null,
  bannerT: 0,
  onChange: null,
  onQuality: null,
  el: {},
  lastHtml: {},

  // 初始化介面：抓取元素、產生分頁列與設定按鈕、綁定音量滑桿（只呼叫一次）
  init() {
    // 疊在 3D 畫面上的 2D 畫布，畫血條、箭頭與傷害數字。
    this.ov = $("overlay");
    this.ovx = this.ov.getContext("2d");
    this.mm = $("minimap").getContext("2d");
    // 把常用的元素先找好存進 this.el，之後每一格更新時不用再重新搜尋
    for (const id of [
      "b-shield",
      "b-hp",
      "b-en",
      "b-cp",
      "b-ammo",
      "b-sec",
      "t-hp",
      "t-hpmax",
      "t-cp",
      "t-sh",
      "v-name",
      "v-cls",
      "waveinfo",
      "enemyinfo",
      "bossbar",
      "bossname",
      "bosstitle",
      "bosshp",
      "score",
      "modechip",
      "banner",
      "log",
      "hitmark",
      "vignette",
      "crosshair",
      "lockhint",
      "slots",
      "buffs",
      "upg",
      "upg-cards",
      "upg-t",
      "toasts",
    ])
      this.el[id] = $(id);
    // 上方的分頁列
    $("tabs").innerHTML = TABS.map(
      (t, i) =>
        `<div data-t="${t.id}"><small>0${
          i + 1
        }</small><i>${t.icon}</i>${t.name}</div>`,
    ).join("");
    // 切換分頁。
    $("tabs").onclick = (e) => {
      const d = e.target.closest("[data-t]");
      if (d) this.gotoTab(d.dataset.t);
    };
    // 難度按鈕
    $("diff").innerHTML = DIFFS.map(
      (d) => `<div data-d="${d.id}">${d.name}</div>`,
    ).join("");
    // 選擇難度。
    $("diff").onclick = (e) => {
      const d = e.target.dataset.d;
      if (d !== undefined) {
        LOADOUT.diff = +d;
        SND.play("ui");
        this.renderSide();
        this.save();
      }
    };
    // 畫質按鈕
    $("quality").innerHTML = ["低", "中", "高"]
      .map((n, i) => `<div data-q="${i}">${n}</div>`)
      .join("");
    // 選擇畫質。
    $("quality").onclick = (e) => {
      const q = e.target.dataset.q;
      if (q !== undefined) {
        LOADOUT.quality = +q;
        SND.play("ui");
        this.renderSide();
        this.save();
        if (this.onQuality) this.onQuality();
      }
    };
    // 右側「出擊配置」的每一欄都可以點，點了就跳到對應的分頁
    $("slotsum").onclick = (e) => {
      const d = e.target.closest("[data-go]");
      if (d) this.gotoTab(d.dataset.go);
    };
    // 音量滑桿（機庫右上角與暫停選單各一組，兩邊會同步）
    SND.vol.music = LOADOUT.vol.music;
    SND.vol.sfx = LOADOUT.vol.sfx;
    // 音樂與音效的音量；機庫與暫停選單各有一組，要互相同步。
    for (const k of ["music", "sfx"])
      for (const sfx of ["", "2"]) {
        const el = $("vol-" + k + sfx);
        el.value = Math.round(LOADOUT.vol[k] * 100);
        // 拉動音量滑桿：存到設定並立刻套用，旁邊的數字跟著更新。
        el.oninput = () => {
          LOADOUT.vol[k] = el.value / 100;
          SND.setVol(k, LOADOUT.vol[k]);
          $("vol-" + k + (sfx ? "" : "2")).value = el.value;
          this.save();
          if (k === "sfx") SND.play("ui");
        };
      }
    this.renderTab();
    this.renderSide();
  },

  // 把目前的配置存進瀏覽器（localStorage）
  save() {
    try {
      localStorage.setItem("mech_loadout", JSON.stringify(LOADOUT));
    } catch (e) {
      /* 無法儲存就算了 */
    }
  },
  // 切換到指定的分頁
  gotoTab(t) {
    this.tab = t;
    SND.play("ui");
    this.renderTab();
  },
  // 機庫底部按鈕：前六步是「下一步」，走到最後一步（小兵）才變成「出擊」
  stepIndex() {
    return TABS.findIndex((t) => t.id === this.tab);
  },
  isLastStep() {
    return this.stepIndex() === TABS.length - 1;
  },
  // 下一步。
  nextStep() {
    const i = this.stepIndex();
    if (i < TABS.length - 1) this.gotoTab(TABS[i + 1].id);
  },
  // 上一步。
  prevStep() {
    const i = this.stepIndex();
    if (i > 0) this.gotoTab(TABS[i - 1].id);
  },
  // 更新上一步／下一步按鈕；最後一步變成出擊。
  renderStep() {
    const i = this.stepIndex(),
      last = i === TABS.length - 1,
      b = $("launch");
    b.className = last ? "go" : "next";
    b.innerHTML = last
      ? "<span>出　擊</span><small>LAUNCH</small>"
      : `<span>下一步</span><small>${
          TABS[i + 1].icon
        } ${TABS[i + 1].name}　▶</small>`;
    $("prev").style.visibility = i > 0 ? "visible" : "hidden";
    $("stepline").innerHTML =
      TABS.map(
        (t, k) => `<i class="${k < i ? "done" : k === i ? "cur" : ""}"></i>`,
      ).join("") +
      `<span>步驟 ${i + 1} / ${TABS.length}　${TABS[i].name}</span>`;
  },
  // 某個選項是否已被選取：回傳它在第幾格（多選時用來顯示對應按鍵），沒選則回傳 -1
  isOn(tab, id) {
    const v = LOADOUT[tab.id];
    return tab.multi ? v.indexOf(id) : v === id ? 0 : -1;
  },
  // 還沒選滿的多選分頁（技能／小兵）；都選滿了就回傳 undefined
  missing() {
    return TABS.find((t) => t.multi && LOADOUT[t.id].includes(null));
  },
  // 多選分頁上方的「已選欄」：每個按鍵一格，固定位置，點一下就能取消那一格
  renderPicks(tab) {
    const el = $("picks");
    if (!tab.multi) {
      el.style.display = "none";
      return;
    }
    const arr = LOADOUT[tab.id],
      left = arr.filter((i) => i === null).length;
    el.style.display = "";
    el.className = "";
    el.innerHTML =
      arr
        .map((id, i) => {
          const o = id && byId(tab.list, id);
          return o
            ? /* HTML */ `<div
                class="pslot on"
                data-rm="${id}"
                title="點一下取消"
              >
                <kbd>${tab.keys[i]}</kbd><span>${o.icon} ${o.name}</span
                ><u>✕</u>
              </div>`
            : `<div class="pslot"><kbd>${tab.keys[i]}</kbd><span>尚未選擇</span></div>`;
        })
        .join("") +
      `<em id="pickmsg">${left ? "還可以再選 " + left + " 個" : "已選滿　想換的話，先點一下已選的取消"}</em>`;
    // 點已選的項目可以取消。
    el.onclick = (e) => {
      const d = e.target.closest("[data-rm]");
      if (d) this.pick(tab, d.dataset.rm);
    };
  },
  // 讓已選欄閃一下並顯示提示（選滿了還想再選、或沒選滿就想出擊時）
  flashPicks(msg) {
    const el = $("picks");
    if (msg) $("pickmsg").textContent = msg;
    el.className = "";
    void el.offsetWidth; // 強制重排，動畫才會重新播放
    el.className = "warn";
  },
  // 產生卡片上的小型能力條（v = 0 ~ 1）
  mbar(label, v) {
    return `<span>${label}<b><i style="width:${Math.round(clamp(v, 0.03, 1) * 100)}%"></i></b></span>`;
  },

  // 重畫左側的選項清單（目前分頁的所有卡片）
  renderTab() {
    const tab = byId(TABS, this.tab);
    for (const d of $("tabs").children)
      d.classList.toggle("on", d.dataset.t === this.tab);
    $("tabtitle").textContent = tab.name;
    $("tabhint").textContent = tab.hint;
    this.renderPicks(tab);
    const full = tab.multi && !LOADOUT[tab.id].includes(null); // 已選滿：沒選到的卡片會變暗
    // 每一張選項卡。
    $("items").innerHTML = tab.list
      .map((o) => {
        const idx = this.isOn(tab, o.id),
          on = idx >= 0;
        // 已選取的卡片右上角的標籤：多選顯示對應按鍵，單選顯示「已選擇 / 已裝備」
        const tag = on
          ? `<div class="tag">${
              tab.multi
                ? "按鍵 " + tab.keys[idx]
                : tab.id === "mode"
                  ? "已選擇"
                  : "已裝備"
            }</div>`
          : "";
        // 卡片左邊的圖示：塗裝顯示雙色圓形色票，其他顯示表情符號
        const ic =
          tab.id === "paint"
            ? /* HTML */ `<div
                class="ic sw"
                style="background:linear-gradient(135deg,${hex6(
                  o.main,
                )} 50%,${hex6(o.sub)} 50%);box-shadow:0 0 12px ${hex6(o.glow)}"
              ></div>`
            : `<div class="ic">${o.icon}</div>`;
        // sm = 名稱旁的小字；extra = 卡片下方的額外內容（依分頁不同）
        let sm = "",
          extra = "";
        switch (tab.id) {
          case "mode":
            extra = /* HTML */ `<div class="opts">
              ${o.opts
                .map(
                  (v) => /* HTML */ `<div
                      data-opt="${v}"
                      class="${LOADOUT.opts[o.id] === v ? "on" : ""}"
                    >
                      ${o.label(v)}
                    </div>`,
                )
                .join("")}
            </div>`;
            break;
          case "chassis":
            sm = `<small>${o.cls}・${o.tag}</small>`;
            extra = `<div class="pk">◆ ${o.perk}</div><div class="mb">${this.mbar(
              "耐久",
              (o.hp * (1 + o.armor)) / 2300,
            )}${this.mbar("機動", o.speed / 21)}${this.mbar("能量", o.energy / 150)}</div>`;
            break;
          case "pri":
            extra = `<div class="mb">${this.mbar("威力", (o.dmg * (o.pellets || 1) * o.rate) / 300)}${this.mbar(
              "射速",
              Math.sqrt(o.rate / 25),
            )}${this.mbar("射程", o.range / 500)}</div>`;
            break;
          case "sec":
            sm = `<small>冷卻 ${o.cd} 秒</small>`;
            extra = `<div class="mb">${this.mbar("威力", (o.dmg * (o.count || 1)) / 320)}${this.mbar(
              "範圍",
              (o.splash || o.range / 9 || 3) / 14,
            )}${this.mbar("頻率", 1 - o.cd / 8.5)}</div>`;
            break;
          case "skills":
            sm = `<small>冷卻 ${o.cd} 秒・${o.stat}</small>`;
            break;
          case "minions":
            sm = `<small>指揮點數 ${o.cost}・一次 ${o.count} 台</small>`;
            break;
        }
        return /* HTML */ `<div
          class="card${on ? " on" : full ? " dim" : ""}"
          data-id="${o.id}"
        >
          ${tag}${ic}
          <div class="bd">
            <div class="nm">${o.name}${sm}</div>
            <div class="ds">${o.desc}</div>
            ${extra}
          </div>
        </div>`;
      })
      .join("");
    // 點卡片 = 選取；滑鼠移上去 = 在右下角顯示詳細資料
    for (const c of $("items").children) {
      // 點選卡片：記下選了哪一個（有些卡片還能選子選項，例如武器的模式）。
      c.onclick = (e) => {
        const op = e.target.dataset.opt;
        this.pick(tab, c.dataset.id, op !== undefined ? +op : undefined);
      };
      c.onmouseenter = () => this.showDetail(tab, byId(tab.list, c.dataset.id));
    }
    // 預設顯示目前選取的項目。
    const cur = tab.multi
      ? LOADOUT[tab.id].find((i) => i !== null) || tab.list[0].id
      : LOADOUT[tab.id];
    this.showDetail(tab, byId(tab.list, cur));
    this.renderStep();
  },

  // 選取（或取消）一個選項。opt 只有模式分頁會用到（選了哪個波數）
  pick(tab, id, opt) {
    let snd = "select";
    if (tab.multi) {
      // 多選：每個按鍵一格、位置固定。點已選的 → 取消那一格；點沒選的 → 放進第一個空格。
      // 選滿時不會自動擠掉別的，要先自己取消一個，才不會選項跳來跳去。
      const arr = LOADOUT[tab.id],
        i = arr.indexOf(id);
      if (i >= 0) {
        arr[i] = null;
        snd = "ui";
      } else {
        const free = arr.indexOf(null);
        if (free < 0) {
          SND.play("deny", 0.4);
          this.flashPicks("已選滿　請先點一下已選的取消，再選新的");
          return;
        }
        arr[free] = id;
      }
    } else {
      LOADOUT[tab.id] = id;
      if (tab.id === "mode" && opt !== undefined) LOADOUT.opts[id] = opt;
    }
    SND.play(snd);
    this.save();
    this.renderTab();
    if (tab.multi) this.showDetail(tab, byId(tab.list, id));
    this.renderSide();
    if (this.onChange && tab.id !== "mode" && tab.id !== "skills")
      this.onChange();
  },

  // 在右下角的「詳細資料」顯示某個選項的完整數值
  showDetail(tab, o) {
    // 沒有選東西就不顯示；t 是說明表格的內容，pk 是額外的特色說明。
    if (!o) return;
    // row：產生表格的一列（左邊名稱、右邊數值）
    const row = (a, b) => `<tr><td>${a}</td><td>${b}</td></tr>`;
    let t = "",
      pk = "";
    // 每個分頁顯示不同的數值。
    switch (tab.id) {
      case "mode":
        // 依分頁顯示不同的數據：模式顯示勝利條件與波數；機體顯示耐久、速度、能
        // 量；武器顯示傷害、射速與每秒傷害；技能顯示冷卻；小兵顯示消耗與數量。
        t =
          row(
            "勝利條件",
            o.id === "endless"
              ? "無 ─ 挑戰最高波數"
              : o.id === "boss"
                ? LOADOUT.opts.boss
                  ? "擊破 " + LOADOUT.opts.boss + " 隻 Boss"
                  : "無 ─ 挑戰最多 Boss"
                : "肅清 " + LOADOUT.opts.campaign + " 波",
          ) +
          row("Boss", o.id === "boss" ? "每一波" : "每 5 波") +
          row(
            "敵人成長",
            o.id === "campaign"
              ? "緩慢"
              : o.id === "endless"
                ? "持續加速"
                : "大幅",
          ) +
          row("波間強化", "三選一");
        break;
      case "chassis":
        pk = `<div class="pk">◆ ${o.perk}</div>`;
        t =
          row("裝甲耐久", o.hp) +
          row("移動速度", o.speed) +
          row("能量 / 回復", o.energy + " / " + o.eRegen) +
          row("傷害減免", Math.round(o.armor * 100) + "%") +
          row("武器傷害", "×" + o.dmgMul) +
          row("技能冷卻", "×" + o.cdMul) +
          row("推進倍率", "×" + o.boost);
        break;
      case "paint":
        t = row("主色", hex6(o.main)) + row("發光色", hex6(o.glow));
        break;
      case "pri":
        t =
          row("單發傷害", o.dmg + (o.pellets ? " × " + o.pellets : "")) +
          row("射速", o.rate + " 發/秒") +
          row("每秒傷害", Math.round(o.dmg * (o.pellets || 1) * o.rate)) +
          row("彈匣", o.mag) +
          row("換彈", o.reload + " 秒") +
          row("射程", o.range + " m");
        break;
      case "sec":
        t =
          row("傷害", o.dmg + (o.count ? " × " + o.count : "")) +
          row("冷卻", o.cd + " 秒") +
          (o.splash ? row("爆炸半徑", o.splash + " m") : "") +
          (o.range ? row("射程", o.range + " m") : "") +
          (o.chain ? row("連鎖次數", o.chain) : "");
        break;
      case "skills":
        t = row("冷卻", o.cd + " 秒") + row("效果", o.stat);
        break;
      case "minions":
        t =
          row("消耗指揮點數", o.cost) +
          row("每次數量 / 上限", o.count + " / " + o.max) +
          row("耐久", o.hp) +
          (o.dmg ? row("每秒傷害", Math.round(o.dmg * o.rate)) : "") +
          (o.heal ? row("每秒治療", o.heal) : "") +
          (o.boom ? row("爆炸傷害", o.boom) : "");
        break;
    }
    // 名稱、說明與數值表。
    $("detail").innerHTML =
      `<b>${o.icon || "🎨"} ${o.name}</b><br>${o.desc}${pk}<table>${t}</table>`;
  },

  // 取得目前模式的資料與目標文字（例如「20 波」）
  modeText() {
    const m = byId(MODES, LOADOUT.mode);
    return { m, opt: m.label(LOADOUT.opts[m.id]) };
  },
  // 讀取各模式的最佳紀錄
  best() {
    try {
      return JSON.parse(localStorage.getItem("mech_best2") || "{}") || {};
    } catch (e) {
      return {};
    }
  },

  // 重畫右側面板：出擊配置摘要、機體性能條、難度 / 畫質按鈕、底部的模式說明與最佳紀錄
  renderSide() {
    // 右側摘要：目前的整套配置。
    const ch = byId(CHASSIS, LOADOUT.chassis),
      pr = byId(PRIMARIES, LOADOUT.pri),
      se = byId(SECONDARIES, LOADOUT.sec),
      pa = byId(PAINTS, LOADOUT.paint),
      { m, opt } = this.modeText();
    // ls：產生「出擊配置」裡的一欄（go = 點了要跳到哪個分頁、w2 = 佔兩欄寬）
    const ls = (
      go,
      icon,
      label,
      body,
      w2,
    ) => /* HTML */ `<div class="ls${w2 ? " w2" : ""}" data-go="${go}">
        <i>${icon}</i>
        <div><small>${label}</small><b>${body}</b></div>
      </div>`;
    // 配置清單；點一下會跳到那個分頁。
    $("slotsum").innerHTML =
      ls("mode", m.icon, "作戰模式", m.name + "・" + opt, true) +
      ls("chassis", ch.icon, "機體", ch.name + "（" + ch.cls + "）") +
      ls("paint", "🎨", "塗裝", pa.name) +
      ls("pri", pr.icon, "主武器", pr.name) +
      ls("sec", se.icon, "副武器", se.name) +
      ls(
        "skills",
        "✨",
        "技能",
        LOADOUT.skills
          .map(
            (s, i) =>
              "<kbd>" +
              ["Q", "E", "F"][i] +
              "</kbd>" +
              (s ? byId(SKILLS, s).name : "<s>未選</s>"),
          )
          .join("　"),
        true,
      ) +
      ls(
        "minions",
        "👥",
        "小兵",
        LOADOUT.minions
          .map(
            (s, i) =>
              "<kbd>" +
              (i + 1) +
              "</kbd>" +
              (s ? byId(MINIONS, s).name : "<s>未選</s>"),
          )
          .join("　"),
        true,
      );
    // 每秒傷害 = 單發傷害 × 一次幾發 × 每秒幾次 × 機體傷害倍率
    const dps = pr.dmg * (pr.pellets || 1) * pr.rate * ch.dmgMul;
    // stat：產生一條性能條（名稱、長度 0~1、右邊的數字）
    const stat = (n, v, num) =>
      `<div class="stat"><label>${n}</label><div class="bar"><i style="width:${Math.round(
        clamp(v, 0.04, 1) * 100,
      )}%"></i></div><em>${num}</em></div>`;
    // 數值條。
    $("stats").innerHTML =
      stat(
        "耐久",
        (ch.hp * (1 + ch.armor)) / 2300,
        Math.round(ch.hp * (1 + ch.armor)),
      ) +
      stat("機動", ch.speed / 21, ch.speed) +
      stat("火力", dps / 300, Math.round(dps)) +
      stat("能量", ch.energy / 150, ch.energy) +
      stat("技能", (1.3 - ch.cdMul) / 0.6, "×" + ch.cdMul);
    for (const d of $("diff").children)
      d.classList.toggle("on", +d.dataset.d === LOADOUT.diff);
    for (const d of $("quality").children)
      d.classList.toggle("on", +d.dataset.q === LOADOUT.quality);
    $("modeline").innerHTML =
      `${m.icon} <b>${m.name}</b>　${opt}　｜　難度 <b>${DIFFS[LOADOUT.diff].name}</b>`;
    const b = this.best()[LOADOUT.mode];
    // 這個模式的最佳紀錄。
    $("best").textContent = b
      ? `此模式最佳紀錄：${
          LOADOUT.mode === "boss"
            ? "擊破 " + b.wave + " 隻 Boss"
            : "第 " + b.wave + " 波"
        } ／ ${b.score} 分`
      : "此模式尚無作戰紀錄";
  },

  // ---------------- HUD ----------------
  // 戰鬥開始時建立 HUD：技能與小兵的按鍵格、武器名稱、機體名稱，並清空上一場留下的訊息
  buildHud() {
    const P = G.player,
      keys = ["Q", "E", "F"],
      el = this.el;
    let h = "";
    P.skills.forEach((s, i) => {
      h += /* HTML */ `<div class="slot" id="sk${i}">
        <span class="k">${keys[i]}</span>${s.def.icon}
        <div class="cd"></div>
        <span class="t"></span><span class="n">${s.def.name}</span>
      </div>`;
    });
    P.minions.forEach((m, i) => {
      h += /* HTML */ `<div class="slot${i === 0 ? " gap" : ""}" id="mn${i}">
        <span class="k">${i + 1}</span>${m.def.icon}
        <div class="cd"></div>
        <span class="t"></span><span class="n">${m.def.cost} 點</span>
      </div>`;
    });
    el.slots.innerHTML = h;
    // 把每一格的元素記下來，之後更新冷卻時直接用
    this.sk = P.skills.map((s, i) => {
      const e = $("sk" + i);
      return { e, t: e.querySelector(".t") };
    });
    this.mn = P.minions.map((s, i) => {
      const e = $("mn" + i);
      return { e, t: e.querySelector(".t") };
    });
    this.wn = $("w-pri").querySelector(".wn");
    this.wa = $("w-pri").querySelector(".wa");
    this.wb = $("w-sec").querySelector(".wa");
    $("w-sec").querySelector(".wn").textContent = P.sec.def.name;
    el["v-name"].textContent = P.ch.icon + " " + P.ch.name;
    el["v-cls"].textContent = P.ch.cls + "・" + P.ch.tag;
    el.log.innerHTML = "";
    el.toasts.innerHTML = "";
    el.buffs.innerHTML = "";
    this.hideUpgrades();
    this.lastHtml = {};
  },

  // 以下三個小工具都是「內容有變才寫入」：set 改內容、cls 改樣式類別、pct 改長條寬度
  // 因為每一格都會呼叫，如果每次都重寫網頁元素會很慢
  set(key, el, html) {
    if (this.lastHtml[key] !== html) {
      this.lastHtml[key] = html;
      el.innerHTML = html;
    }
  },
  // 內容有改變時才更新樣式類別，避免每格都動到畫面。
  cls(key, el, cls) {
    if (this.lastHtml[key] !== cls) {
      this.lastHtml[key] = cls;
      el.className = cls;
    }
  },
  // 內容有改變時才更新長條的寬度。
  pct(key, el, v) {
    const s = (clamp(v, 0, 1) * 100).toFixed(1) + "%";
    if (this.lastHtml[key] !== s) {
      this.lastHtml[key] = s;
      el.style.width = s;
    }
  },

  // 每一格更新 HUD 上的所有數字與長條
  updateHud(dt) {
    const P = G.player,
      el = this.el,
      m = G.mode;
    if (!P) return;
    // 左下角：裝甲、護盾、能量、指揮點數
    this.pct("hp", el["b-hp"], P.hp / P.maxHp);
    // 血量低時換成警示樣式。
    this.cls(
      "hpc",
      el["b-hp"].parentNode,
      "bar hp" + (P.hp / P.maxHp < 0.3 ? " low" : ""),
    );
    this.pct("sh", el["b-shield"], P.shield / P.shieldMax);
    this.cls(
      "shc",
      el["b-shield"].parentNode,
      "bar sh" + (P.shieldMax > 600 ? " gold" : ""),
    );
    this.pct("en", el["b-en"], P.energy / P.ch.energy);
    this.pct("cp", el["b-cp"], P.cp / 100);
    this.set("thp", el["t-hp"], String(Math.ceil(Math.max(0, P.hp))));
    this.set("thm", el["t-hpmax"], "/ " + P.maxHp);
    this.set("tcp", el["t-cp"], Math.floor(P.cp) + " / 100");
    this.set(
      "tsh",
      el["t-sh"],
      P.shield > 0 ? "🛡 " + Math.ceil(P.shield) : "",
    );
    // 技能與小兵
    // 技能格：--p 是冷卻遮罩的百分比；act = 效果作用中、rdy = 可以使用
    P.skills.forEach((s, i) => {
      const u = this.sk[i],
        max = s.def.cd * P.ch.cdMul * P.mod.cd,
        id = s.def.id;
      const act =
        (id === "shield" && P.shield > 0) ||
        (id === "overdrive" && P.overT > 0) ||
        (id === "repair" && P.repairT > 0) ||
        (id === "dash" && P.dashT > 0);
      const p = Math.round(clamp(s.cd / max, 0, 1) * 100);
      if (this.lastHtml["skp" + i] !== p) {
        this.lastHtml["skp" + i] = p;
        u.e.style.setProperty("--p", p);
      }
      this.set("skt" + i, u.t, s.cd > 0 ? Math.ceil(s.cd) + "" : "");
      this.cls(
        "skc" + i,
        u.e,
        "slot" + (act ? " act" : s.cd <= 0 ? " rdy" : ""),
      );
    });
    // 小兵格：顯示場上數量；點數不夠或已達上限時變暗
    P.minions.forEach((mn, i) => {
      const u = this.mn[i],
        d = mn.def,
        alive = G.allies.reduce(
          (n, a) => n + (a.alive && a.def === d ? 1 : 0),
          0,
        ),
        ok = P.cp >= d.cost && alive < d.max;
      const p = Math.round(clamp(1 - P.cp / d.cost, 0, 1) * 100);
      if (this.lastHtml["mnp" + i] !== p) {
        this.lastHtml["mnp" + i] = p;
        u.e.style.setProperty("--p", p);
      }
      this.set("mnt" + i, u.t, alive ? alive + "/" + d.max : "");
      this.cls(
        "mnc" + i,
        u.e,
        "slot" + (i === 0 ? " gap" : "") + (ok ? " rdy" : " no"),
      );
    });
    // 武器
    const w = P.pri,
      tw = P.temp;
    this.set("wn", this.wn, tw ? tw.def.icon + " " + tw.def.name : w.def.name);
    this.cls("wnc", this.wn, "wn" + (tw ? " tmp" : ""));
    // 有限時武器時顯示剩餘秒數；換彈中顯示進度；平常顯示彈藥數
    if (tw) {
      this.set("wa", this.wa, "∞<small> " + tw.t.toFixed(1) + " 秒</small>");
      this.cls("wac", this.wa, "wa");
      this.pct("am", el["b-ammo"], tw.t / tw.max);
    } else if (w.reload > 0) {
      this.set("wa", this.wa, "換彈中 " + w.reload.toFixed(1));
      this.cls("wac", this.wa, "wa rl");
      this.pct("am", el["b-ammo"], 1 - w.reload / w.def.reload);
    } else {
      this.set("wa", this.wa, w.ammo + "<small> / " + w.def.mag + "</small>");
      this.cls("wac", this.wa, "wa");
      this.pct("am", el["b-ammo"], w.ammo / w.def.mag);
    }
    // 副武器的冷卻
    const scd = P.sec.def.cd * P.mod.sec;
    // 副武器冷卻中：顯示剩餘秒數。
    if (P.sec.cd > 0) {
      this.set("wb", this.wb, P.sec.cd.toFixed(1) + "<small> 秒</small>");
      this.cls("wbc", this.wb, "wa rl");
    } else {
      this.set("wb", this.wb, "就緒");
      this.cls("wbc", this.wb, "wa");
    }
    this.pct("sc", el["b-sec"], 1 - P.sec.cd / scd);
    // 增益列
    let b = "";
    // bf：加一個增益圖示（樣式、圖示、剩餘秒數）
    const bf = (cls, icon, t) => {
      b += `<div class="buff ${cls}"><i>${icon}</i>${Math.ceil(t)}</div>`;
    };
    if (P.buff.dmg > 0) bf("r", "💥", P.buff.dmg);
    if (P.buff.haste > 0) bf("", "⚡", P.buff.haste);
    if (P.overT > 0) bf("", "🔆", P.overT);
    if (P.repairT > 0) bf("g", "🔧", P.repairT);
    if (P.shield > 0 && P.shieldT > 0) bf("b", "🛡️", P.shieldT);
    if (tw) bf("", tw.def.icon, tw.t);
    if (P.ups.length)
      b += `<div class="buff b"><i>⬆</i>強化 ×${P.ups.length}</div>`;
    this.set("buffs", el.buffs, b);
    // 模式、波次
    // 上方中央：模式名稱、分數、目前第幾波、剩餘敵人或倒數
    const md = byId(MODES, m.id),
      bossMode = m.id === "boss";
    // 模式與難度。
    this.set(
      "chip",
      el.modechip,
      md.icon + " <b>" + md.name + "</b>　" + DIFFS[G.diff.id].name,
    );
    this.set("score", el.score, "分數 <b>" + G.score + "</b>　擊墜 " + G.kills);
    // 目前波次。
    this.set(
      "wave",
      el.waveinfo,
      G.wave > 0
        ? bossMode
          ? "BOSS " + G.wave + (m.total ? " / " + m.total : "")
          : "第 " + G.wave + (m.total ? " / " + m.total : "") + " 波"
        : "準備作戰",
    );
    let info = "";
    if (G.waveState === "active")
      info =
        bossMode && G.waveBoss
          ? "擊破 Boss 即可結束這一波"
          : G.hunt
            ? "殘敵正朝你逼近（剩 " + liveCount() + "）"
            : "剩餘敵人 " + (liveCount() + G.spawnQ.length);
    else if (G.waveState === "break")
      info =
        (G.wave === 0 ? "敵軍將在 " : "下一波將在 ") +
        Math.ceil(G.waveT) +
        " 秒後抵達";
    else if (G.waveState === "upgrade") info = "按 Z / X / C 選擇強化";
    this.set("einfo", el.enemyinfo, info);
    if (G.waveState === "upgrade")
      this.set("upgt", el["upg-t"], Math.ceil(G.upgT) + " 秒後自動選擇");
    // Boss 血條（場上沒有 Boss 就隱藏）
    const bs = bossInfo();
    // 首領血條。
    this.cls(
      "bossc",
      el.bossbar,
      bs ? (bs.shield ? "shielded" : "") : "hidden",
    );
    if (bs) {
      this.set(
        "bossn",
        el.bossname,
        (G.bossCycle > 0 ? "強化型 " : "") +
          bs.name +
          (bs.shield ? "　🛡護盾節點運作中" : bs.enraged ? "　🔥狂暴" : ""),
      );
      this.set("bosst", el.bosstitle, bs.title);
      this.pct("bossh", el.bosshp, bs.hp / bs.max);
    }
    // 準星、命中、受傷
    el.hitmark.style.opacity = G.hitMark > 0 ? Math.min(1, G.hitMark * 8) : 0;
    this.cls("xh", el.crosshair, G.aimEnt ? "enemy" : "");
    // 血量低於三成時畫面邊緣會閃紅光；剛受傷時也會紅一下
    const lowHp = P.hp / P.maxHp < 0.3 ? 0.25 + 0.15 * Math.sin(G.time * 6) : 0;
    el.vignette.style.boxShadow = `inset 0 0 220px 60px rgba(255,30,20,${Math.max(G.hurt * 0.7, lowHp).toFixed(2)})`;
    // 畫面中央的橫幅文字，時間到就淡出
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) el.banner.style.opacity = 0;
    }
    this.drawMinimap();
  },

  // 畫小地圖：以玩家為中心、半徑 140 公尺，並且會跟著視角旋轉（上方永遠是前方）
  drawMinimap() {
    // 小地圖以玩家為中心，跟著瞄準方向旋轉。
    const x = this.mm,
      P = G.player,
      S = 220,
      R = 140,
      sc = S / 2 / R,
      th = P.aimYaw - PI;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.clearRect(0, 0, S, S);
    // 把繪圖範圍限制在圓形內，再把座標系移到中心、旋轉、縮放成「地圖座標」
    x.save();
    x.beginPath();
    x.arc(S / 2, S / 2, S / 2, 0, TAU);
    x.clip();
    x.translate(S / 2, S / 2);
    x.rotate(th);
    x.scale(sc, sc);
    // 底圖：world.js 預先畫好的整張地圖（建築與道路）
    if (WORLD.mapCanvas)
      x.drawImage(WORLD.mapCanvas, -(P.x + WORLD.ext), -(P.z + WORLD.ext));
    // dot：畫一個點。超出小地圖範圍的會被拉回邊緣並縮小，表示「在那個方向」
    const dot = (e, col, s, sq) => {
      let dx = e.x - P.x,
        dz = e.z - P.z;
      const d = Math.hypot(dx, dz),
        lim = R - 6;
      if (d > lim) {
        dx *= lim / d;
        dz *= lim / d;
        s *= 0.75;
      }
      x.fillStyle = col;
      if (sq) x.fillRect(dx - s / sc, dz - s / sc, (s * 2) / sc, (s * 2) / sc);
      else {
        x.beginPath();
        x.arc(dx, dz, s / sc, 0, TAU);
        x.fill();
      }
    };
    // 依序畫出：危險區域、油桶、道具、友軍、敵人
    // 危險區域。
    for (const z of G.zones)
      if (z.type === "mortar") {
        x.strokeStyle = "rgba(255,80,40,.9)";
        x.lineWidth = 1.5 / sc;
        x.beginPath();
        x.arc(z.x - P.x, z.z - P.z, z.r, 0, TAU);
        x.stroke();
      } else if (z.x !== undefined) dot(z, "#ffd24a", 4);
    for (const b of G.barrels)
      if (Math.abs(b.x - P.x) < R && Math.abs(b.z - P.z) < R)
        dot(b, "#c06a20", 1.4);
    // 道具與補給。
    for (const k of G.pickups)
      dot(
        k,
        k.supply ? "#ffd24a" : hex6(PICKUPS[k.type].color),
        k.supply ? 4.5 : 2.4,
        k.supply,
      );
    for (const a of G.allies) if (a.alive) dot(a, "#4fd8ff", 2.6);
    // 敵人；首領用不同顏色與大小。
    for (const e of G.enemies)
      if (e.alive)
        dot(
          e,
          e.isPart
            ? "#b03a20"
            : e.def.boss
              ? "#ff2a10"
              : e.def.node
                ? "#40ffd0"
                : e.def.boom
                  ? "#ffb020"
                  : "#ff5a4a",
          e.isPart ? 2.2 : e.def.boss ? 6.5 : e.r > 2 ? 4 : 2.8,
        );
    x.restore();
    // 正中央代表玩家的白色箭頭
    x.fillStyle = "#ffffff";
    x.beginPath();
    // 中央的玩家箭頭。
    x.moveTo(S / 2, S / 2 - 8);
    x.lineTo(S / 2 + 6, S / 2 + 6);
    x.lineTo(S / 2, S / 2 + 3);
    x.lineTo(S / 2 - 6, S / 2 + 6);
    x.closePath();
    x.fill();
  },

  // 覆蓋層：敵人血條、傷害數字、道具圖示、受擊方向
  drawOverlay() {
    const c = this.ov,
      x = this.ovx,
      W = c.width,
      H = c.height,
      cam = G.camera,
      P = G.player;
    x.clearRect(0, 0, W, H);
    if (!P || G.state === "hangar") return;
    // proj：把 3D 世界座標換算成螢幕位置，結果放在 _v2b；不在畫面內就回傳 false
    const proj = (px, py, pz) => {
      _v2b.set(px, py, pz).project(cam);
      return (
        _v2b.z < 1 &&
        _v2b.z > -1 &&
        Math.abs(_v2b.x) < 1.1 &&
        Math.abs(_v2b.y) < 1.1
      );
    };
    const font = '"Microsoft JhengHei",sans-serif';
    // bar：在某個單位頭上畫血條。always = 即使滿血也要畫（被準星指到的敵人）
    const bar = (e, col, always) => {
      if (!e.alive || (!always && e.hp >= e.maxHp && !(e.fuse > 0))) return;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d > 230) return;
      if (!proj(e.x, e.y + e.h + 1.3, e.z)) return;
      const sx = (_v2b.x * 0.5 + 0.5) * W,
        sy = (-_v2b.y * 0.5 + 0.5) * H,
        w = clamp(e.r * 26, 34, 110) * clamp(60 / d, 0.55, 1.3),
        k = clamp(e.hp / e.maxHp, 0, 1);
      x.fillStyle = "rgba(0,0,0,.6)";
      x.fillRect(sx - w / 2 - 1, sy - 1, w + 2, 6);
      x.fillStyle = col;
      x.fillRect(sx - w / 2, sy, w * k, 4);
      // 受到護盾發生機保護的敵人，血條外面多一圈藍框
      if (e.guardT > 0 && !e.def.aura) {
        x.strokeStyle = "#6ab8ff";
        x.lineWidth = 1.5;
        x.strokeRect(sx - w / 2 - 2.5, sy - 2.5, w + 5, 9);
      }
      x.textAlign = "center";
      // 自爆倒數中的敵人顯示閃爍的警告與剩餘秒數
      if (e.fuse > 0) {
        x.font = "bold 20px " + font;
        x.fillStyle = Math.floor(G.time * 10) % 2 ? "#ff3020" : "#ffe040";
        x.fillText(
          "⚠ " + Math.max(0, e.def.boom.fuse - e.fuse).toFixed(1),
          sx,
          sy - 8,
        );
      } else if (always && e.team === 1) {
        x.font = "12px " + font;
        x.fillStyle = "#ffd0c8";
        x.fillText(
          e.def.name +
            (e.stun > 0
              ? "（癱瘓）"
              : e.guardT > 0 && !e.def.aura
                ? "（護盾）"
                : ""),
          sx,
          sy - 6,
        );
      }
    };
    // 所有小怪與友軍的血條（Boss 用畫面上方的大血條，所以這裡跳過）
    for (const e of G.enemies)
      if (!e.def.boss && !e.isPart)
        bar(
          e,
          e.stun > 0
            ? "#8ad8ff"
            : e.def.node
              ? "#40ffd0"
              : e.def.boom
                ? "#ffb020"
                : "#ff5040",
          e === G.aimEnt || !!e.def.node,
        );
    for (const a of G.allies) bar(a, "#5dff8a", false);
    // 畫面外的 Boss／殘敵方向箭頭：不用再到處找剩下的敵人
    const showAll = G.hunt || liveCount() <= 5;
    // 每個需要標示的敵人。
    for (const e of G.enemies) {
      if (!e.alive || e.isPart || !(e.def.boss || e.def.node || showAll))
        continue;
      // 把敵人的位置轉到「鏡頭座標」：z < 0 代表在鏡頭前方
      _v2b.set(e.x, e.y + e.h * 0.5, e.z).applyMatrix4(cam.matrixWorldInverse);
      const front = _v2b.z < 0,
        k = front ? -1 / _v2b.z : 1;
      const nx = (_v2b.x * k) / (Math.tan((cam.fov * PI) / 360) * cam.aspect),
        ny = (_v2b.y * k) / Math.tan((cam.fov * PI) / 360);
      // 已經在畫面內的就不用畫箭頭
      if (front && Math.abs(nx) < 0.92 && Math.abs(ny) < 0.9) continue;
      // 算出箭頭要放在螢幕邊緣的哪個方向
      const a = Math.atan2(front ? ny : -0.2, front ? nx : _v2b.x),
        R = Math.min(W, H) * 0.4,
        sx = W / 2 + Math.cos(a) * R * (W / H > 1.4 ? 1.35 : 1),
        sy = H / 2 - Math.sin(a) * R;
      const col = e.def.boss ? "#ff3a20" : e.def.node ? "#40ffd0" : "#ffb020",
        d = Math.round(Math.hypot(e.x - P.x, e.z - P.z));
      x.save();
      x.translate(sx, sy);
      x.rotate(-a);
      x.fillStyle = col;
      x.globalAlpha = 0.9;
      x.beginPath();
      x.moveTo(16, 0);
      x.lineTo(-8, -10);
      x.lineTo(-3, 0);
      x.lineTo(-8, 10);
      x.closePath();
      x.fill();
      x.restore();
      x.globalAlpha = 1;
      x.font = "11px " + font;
      x.textAlign = "center";
      x.fillStyle = col;
      x.fillText(
        (e.def.boss ? "BOSS " : "") + d + "m",
        sx - Math.cos(a) * 24,
        sy + Math.sin(a) * 24 + 4,
      );
    }
    // 道具圖示
    x.textAlign = "center";
    // 附近的道具名稱與距離。
    for (const k of G.pickups) {
      const d = Math.hypot(k.x - P.x, k.z - P.z);
      if (d > (k.supply ? 400 : 120) || !proj(k.x, k.supply ? 7 : 5, k.z))
        continue;
      const sx = (_v2b.x * 0.5 + 0.5) * W,
        sy = (-_v2b.y * 0.5 + 0.5) * H,
        def = PICKUPS[k.type];
      x.font = (k.supply ? 26 : 20) + "px " + font;
      x.fillStyle = "#fff";
      x.fillText(def.icon, sx, sy);
      x.font = "11px " + font;
      x.fillStyle = hex6(def.color);
      x.fillText(
        (k.supply ? "補給：" : "") + def.name + "　" + Math.round(d) + "m",
        sx,
        sy + 15,
      );
    }
    // 傷害數字
    for (const t of FX.texts) {
      if (!proj(t.x, t.y, t.z)) continue;
      const sx = (_v2b.x * 0.5 + 0.5) * W,
        sy = (-_v2b.y * 0.5 + 0.5) * H;
      x.globalAlpha = clamp((t.life / t.max) * 2, 0, 1);
      x.font = `bold ${t.size}px "Segoe UI",sans-serif`;
      x.strokeStyle = "rgba(0,0,0,.8)";
      x.lineWidth = 3;
      x.strokeText(t.str, sx, sy);
      x.fillStyle = t.color;
      x.fillText(t.str, sx, sy);
    }
    x.globalAlpha = 1;
    // 受擊方向指示（準星周圍的紅色弧線）
    for (const d of G.dmgDirs) {
      const a = angDiff(d.a, P.aimYaw) - PI / 2; // 轉成螢幕角度：正前方朝上
      x.strokeStyle = `rgba(255,60,40,${(d.t * 0.85).toFixed(2)})`;
      x.lineWidth = 7;
      x.lineCap = "round";
      x.beginPath();
      x.arc(W / 2, H / 2, 150, a - 0.22, a + 0.22);
      x.stroke();
    }
  },

  // 畫面中央的大橫幅（例如「第 3 波」）
  banner(title, sub) {
    const b = this.el.banner;
    b.innerHTML = title + (sub ? `<small>${sub}</small>` : "");
    b.style.opacity = 1;
    this.bannerT = 3.2;
  },
  // 左側的戰鬥紀錄（最多 6 行，4 秒後消失）
  log(msg) {
    const l = this.el.log,
      d = document.createElement("div");
    d.textContent = "› " + msg;
    l.appendChild(d);
    while (l.children.length > 6) l.removeChild(l.firstChild);
    setTimeout(() => {
      if (d.parentNode) d.parentNode.removeChild(d);
    }, 4000);
  },
  // 右側的提示卡（撿到道具時），最多 4 張
  toast(icon, title, msg) {
    const l = this.el.toasts,
      d = document.createElement("div");
    d.className = "toast";
    d.innerHTML = `<i>${icon}</i><div><b>${title}</b><span>${msg || ""}</span></div>`;
    l.appendChild(d);
    while (l.children.length > 4) l.removeChild(l.firstChild);
    setTimeout(() => {
      if (d.parentNode) d.parentNode.removeChild(d);
    }, 4200);
  },
  // 顯示三選一的強化卡片
  showUpgrades(list) {
    this.el["upg-cards"].innerHTML = list
      .map(
        (u, i) => /* HTML */ `<div class="uc">
            <kbd>${"ZXC"[i]}</kbd><i>${u.icon}</i><b>${u.name}</b
            ><span>${u.desc}</span>
          </div>`,
      )
      .join("");
    this.el.upg.classList.remove("hidden");
  },
  // 隱藏強化卡片
  hideUpgrades() {
    this.el.upg.classList.add("hidden");
  },

  // 顯示結算畫面，並在破紀錄時儲存最佳成績
  showResult(win) {
    G.state = "result";
    if (document.exitPointerLock) document.exitPointerLock();
    const P = G.player,
      m = G.mode,
      md = byId(MODES, m.id),
      bossMode = m.id === "boss";
    // cleared = 實際打完的波數（失敗時，正在打的那一波不算）
    const cleared = win ? G.wave : Math.max(0, G.wave - 1),
      mins = Math.floor(G.time / 60),
      secs = Math.floor(G.time % 60);
    $("res-mode").textContent =
      md.icon +
      " " +
      md.name +
      (m.total ? "・" + md.label(m.total) : "") +
      "　｜　難度 " +
      DIFFS[G.diff.id].name;
    $("res-title").textContent = win
      ? "任 務 完 成"
      : m.total
        ? "機 體 大 破"
        : "作 戰 結 束";
    $("res-title").style.color = win
      ? "#ffd24a"
      : m.total
        ? "#ff5a4a"
        : "#4fd8ff";
    // cell：結算表格的一格
    const cell = (a, b) => `<div><small>${a}</small><b>${b}</b></div>`;
    $("res-body").innerHTML =
      cell(
        bossMode ? "擊破 Boss" : "肅清波數",
        cleared + (m.total ? " / " + m.total : ""),
      ) +
      cell("擊墜數", G.kills) +
      cell("總分", G.score) +
      cell("作戰時間", mins + ":" + String(secs).padStart(2, "0")) +
      cell("派出小兵", G.deployed) +
      cell("取得強化", P.ups.length);
    $("res-ups").innerHTML = P.ups.length
      ? "本次強化：" +
        P.ups.map((u) => `<i title="${u.name}">${u.icon}</i>`).join("")
      : "";
    try {
      const all = this.best(),
        b = all[m.id];
      if (!b || G.score > b.score) {
        all[m.id] = { wave: cleared, score: G.score };
        localStorage.setItem("mech_best2", JSON.stringify(all));
      }
    } catch (e) {
      /* 無法儲存就算了 */
    }
    $("result").classList.remove("hidden");
    MUSIC.set("hangar");
  },
};

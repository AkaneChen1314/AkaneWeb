/* Player-facing handbook. Numeric rules come from the simulation so the text cannot drift. */
(function () {
  "use strict";
  const S = window.Serpent;
  const topics = [
    ["start", "先學會玩"],
    ["combat", "怎麼攻擊"],
    ["enemies", "敵人與首領"],
    ["damage", "受傷與死亡"],
    ["food", "食物與道具"],
    ["map", "地圖與地形"],
    ["characters", "角色與技能"],
    ["modes", "目標與存檔"],
  ];
  const pair = (title, text) =>
    `<article class="rule-block"><h3>${title}</h3><p>${text}</p></article>`;
  function diagram(kind) {
    if (kind === "coil")
      return `<svg class="collision-diagram" viewBox="0 0 300 110" role="img" aria-label="蛇身繞成一圈，蛇頭碰到自己的身體，圈內的敵人受到纏繞絞殺"><path d="M60 92C20 92 22 22 90 18s110 4 110 40-40 40-78 34" fill="#fff3a822" stroke="#5cad83" stroke-width="15" stroke-linecap="round"/><circle cx="118" cy="90" r="13" fill="#a0f0ba" stroke="#a0f0ba"/><circle cx="114" cy="86" r="2" fill="#102b22"/><circle cx="122" cy="86" r="2" fill="#102b22"/><path d="m112 40 13 15-13 15-13-15Z" fill="#ff7a81" stroke="#ff7a81"/><path d="m150 46 10 11-10 11-10-11Z" fill="#ff7a81" stroke="#ff7a81"/><text x="215" y="58" fill="#fff3a8" stroke="none" font-size="14">絞殺！</text><text x="18" y="106" fill="#b9c8c5" stroke="none" font-size="11">蛇頭碰到自己的身體 → 圈內全部受傷</text></svg>`;
    const dangerous = kind === "head";
    return `<svg class="collision-diagram" viewBox="0 0 300 110" role="img" aria-label="${dangerous ? "敵人的紅色核心接觸你的蛇頭，會扣生命" : "敵人頭部撞到你的蛇身，敵人受反擊，你不受傷"}"><path d="M45 70h90q30 0 30-30" stroke="#5cad83" stroke-width="23"/><circle cx="165" cy="31" r="17" fill="#a0f0ba" stroke="#a0f0ba"/><circle cx="161" cy="25" r="2" fill="#102b22"/><circle cx="172" cy="25" r="2" fill="#102b22"/><path d="${dangerous ? "m203 14 15 17-15 17-15-17Z" : "m92 38 15 17-15 17-15-17Z"}" fill="#ff7a81" stroke="#ff7a81"/><circle cx="${dangerous ? "184" : "96"}" cy="${dangerous ? "31" : "70"}" r="23" stroke="${dangerous ? "#ff7a81" : "#a0f0ba"}" stroke-dasharray="4 4"/><text x="215" y="85" fill="${dangerous ? "#ff9da4" : "#a0f0ba"}" stroke="none" font-size="14">${dangerous ? "會扣血" : "反擊"}</text><text x="18" y="106" fill="#b9c8c5" stroke="none" font-size="11">${dangerous ? "你的蛇頭 × 敵人的頭部／核心" : "你的身體 × 敵人的頭部／核心"}</text></svg>`;
  }
  const C = S.COMBAT;
  function foodCard(id) {
    const f = S.FOODS[id],
      color = f.color || "#91edb5";
    const shape =
      id === "crystal" || id === "rainbow"
        ? "gem"
        : id === "heal"
          ? "cross"
          : id === "shield" || id === "magnet"
            ? "ring"
            : "";
    return `<article><i class="food-dot ${shape}" style="--c:${color}">${id === "heal" ? "＋" : ""}</i><h3>${f.name}${f.power ? '<span class="tag-power">道具</span>' : ""}</h3><p>${f.desc}${f.power ? "" : `　${f.score} 分`}</p></article>`;
  }
  function content(topic) {
    if (topic === "start")
      return `<div class="rule-callout"><strong>三個按鍵就能玩：移動、衝刺、技能。</strong><p>咬擊會自動發動，不用按鍵。生命歸零才死亡；身體被碰到不會被吃掉。牆壁與岩石只會擋路，不會扣血。</p></div><ol class="getting-start"><li><b>移動</b><span>移動滑鼠，蛇頭就朝游標前進；或用 WASD／方向鍵。兩種會自動切換：最後動到哪個就用哪個。手機拖左下搖桿。蛇會一直前進。</span></li><li><b>自動咬擊</b><span>敵人或晶簇寶箱進入蛇頭前方的扇形（附近有目標時會顯示虛線），蛇就會自己咬下去。</span></li><li><b>Space／滑鼠左鍵：衝刺撞擊</b><span>按住加速 1.9 倍。衝刺中撞到敵人造成 ${C.ram} 傷害並把小蟲撞飛，也不怕敵人頭部的接觸傷害。</span></li><li><b>繞圈：纏繞絞殺</b><span>蛇身夠長後繞一圈，讓蛇頭穿過自己的身體。圈內的敵人受重創、食物一次吸光，圈越大越痛。</span></li><li><b>E／滑鼠右鍵：角色技能</b><span>回血、爆破、凍結或護盾，依角色不同；冷卻結束可再用。</span></li><li><b>M：大地圖</b><span>右下小地圖顯示敵人、道具、寶箱、治癒泉與傳送門。點小地圖或按 M 打開大地圖，遊戲會暫停。</span></li></ol><p class="rule-footnote">大廳可以選擇難度：普通、中等、困難，差別請看「敵人與首領」。建議先玩「八步無傷練習」。H 查規則，Esc／P 暫停；閱讀、看大地圖與選進化時世界都會暫停。</p>`;
    if (topic === "combat")
      return `<div class="rule-callout"><strong>咬擊自動、衝刺要按、纏繞靠走位。</strong><p>貼近時讓蛇自己咬；被包圍時按住衝刺撞出去；敵人成群時繞一圈把牠們圈起來。亮色數字是你的攻擊，藍色是蛇身反擊。</p></div><div class="collision-examples"><figure>${diagram("coil")}<figcaption>纏繞絞殺：最有蛇味的大招</figcaption></figure><figure>${diagram("body")}<figcaption>敵人頭撞你的蛇身：敵人受反擊</figcaption></figure></div><div class="rule-columns">${pair("自動咬擊", `前方 120 度、距離 ${C.biteRange}（含敵人體積）的扇形，基礎 ${C.bite} 傷害，每 ${C.biteCooldown} 秒最多一次。有目標才會咬，不耗能量；也能咬破晶簇寶箱。`)}${pair("衝刺撞擊", `按住 Space／Shift／滑鼠左鍵。衝刺中蛇頭碰到敵人的頭或身體，基礎 ${C.ram} 傷害並把小蟲撞退；同一敵人每 ${C.ramCooldown} 秒最多一次。每秒耗 38 能量，放開後每秒恢復 24；耗盡要先放開再按。`)}${pair("纏繞絞殺", `蛇長 ${C.coilMinLength} 節以上時，讓蛇頭碰到自己後段的身體就會收圈。圈內每個敵人受到 ${C.coil} + 圈長 ×${C.coilPerSegment} 的傷害（再乘傷害加成），寶箱直接破裂、圈內食物全部吸收。一次圈住 2 隻以上另有獎勵分數。`)}${pair("蛇身反擊", `敵人頭部撞上頭後第 5 節以後的蛇身，受到 ${C.counter} 傷害，同一敵人每 ${C.counterCooldown} 秒最多一次；你不扣血。`)}${pair("光刃與進化", "繞蛇頭的亮色菱形會自動攻擊（每秒 45）。「銳利獠牙」強化咬擊，「纏繞之鱗」強化絞殺，「能量增幅」強化全部攻擊。")}${pair("被擋下的攻擊", "盾甲蟲的正面護盾、女王之盾會讓傷害數字變成藍色「格擋」。衝撞能破盾；纏繞絞殺不受正面護盾影響。暈眩中的敵人與首領多受 50% 傷害。")}</div><p class="rule-footnote">赤焰初始傷害 ×1.2；「能量增幅」每次 ×1.3；怒焰椒 8 秒內 ×1.8。各種怪物與首領招式請看「敵人與首領」。</p>`;
    if (topic === "enemies") {
      const tierName = (t) =>
        t === 1 ? "普通起" : t === 2 ? "中等起" : "困難限定";
      return `<div class="rule-callout"><strong>難度決定你會遇到哪些怪物、牠們多快、多痛。</strong><p>在大廳的「難度」切換。新的怪物會隨波次登場，第一次出現時畫面上方會提示名字。</p></div><div class="rule-table-wrap"><table class="rule-table"><caption>三種難度的差異（以中等為 ×1）</caption><thead><tr><th>難度</th><th>怪物</th><th>敵人血量</th><th>敵人速度</th><th>你受到的傷害</th><th>預警時間</th><th>得分</th></tr></thead><tbody>${Object.values(
        S.DIFFICULTIES,
      )
        .map(
          (d) =>
            `<tr><td>${d.name}</td><td>${Object.values(S.ENEMIES).filter((e) => e.weight && e.tier <= d.tier).length} 種</td><td>×${d.hp}</td><td>×${d.speed}</td><td>×${d.damage}</td><td>×${d.warn}</td><td>×${d.score}</td></tr>`,
        )
        .join("")}</tbody></table></div><div class="enemy-grid">${Object.values(
        S.ENEMIES,
      )
        .filter((e) => e.weight)
        .map(
          (e) =>
            `<article><h3><i style="--c:${e.color}"></i>${e.name}<span class="tier-tag">${tierName(e.tier)}・第 ${e.wave} 波起</span></h3><p>${e.desc}</p></article>`,
        )
        .join(
          "",
        )}</div><p class="rule-footnote">精英怪有金色光環與皇冠：血量 ×2.2、體型更大，必定掉落果實、常掉道具。中等 6%、困難 18% 機率出現（第 2 波起）。</p><div class="boss-guide">${S.BOSSES.map((b) => `<article style="--c:${b.color}"><h3>${b.name}<small>${b.title}</small></h3><p>${b.tip}</p><ul>${b.moves.map((m) => `<li><b>${S.BOSS_MOVES[m].name}</b>（第 ${S.BOSS_MOVES[m].phase} 階段起）：${S.BOSS_MOVES[m].desc}</li>`).join("")}</ul></article>`).join("")}</div><p class="rule-footnote">首領血量降到 66% 與 33% 時進入下一階段：怒吼 1.3 秒（無敵）並放出一圈能量環，之後攻擊更快更多。困難難度的首領會提早一個階段使出大招，數量也更多；普通難度招式數量較少、預警較長。</p>`;
    }
    if (topic === "damage")
      return `<div class="rule-callout danger"><strong>唯一死亡條件：左上角生命值降到 0。</strong><p>只有蛇頭會受傷，而且只有敵人能傷你：敵人頭部、子彈、紅圈震地。牆壁、岩石、地標都只會擋路，蛇頭會沿著表面滑開。</p></div><div class="collision-examples"><figure>${diagram("head")}<figcaption>沒有衝刺：頭碰敵人核心會扣血</figcaption></figure><figure>${diagram("body")}<figcaption>身體被碰到：不扣血，還會反擊</figcaption></figure></div><div class="rule-table-wrap"><table class="rule-table"><caption>中等難度的基礎傷害（普通 ×0.7、困難 ×1.3）</caption><thead><tr><th>蛇頭碰到…</th><th>生命損失</th></tr></thead><tbody>${Object.values(
        S.DAMAGE,
      )
        .map((d) => `<tr><td>${d.label}</td><td>−${d.amount} HP</td></tr>`)
        .join(
          "",
        )}</tbody></table></div><div class="rule-columns">${pair("衝刺能防什麼？", "衝刺中撞到敵人頭部不扣血、反而傷害牠。子彈與紅圈仍然會傷你。")}${pair("岩石是掩護", "岩石、柱子與地標會擋下敵方子彈。被首領彈幕追著打時，繞到岩石後面。")}${pair("受傷之後", "扣血、連擊歸零、蛇身最多縮短 3 節（至少保留 8 節），接著 1.25 秒受傷保護。畫面與結算會顯示真正的受傷原因。")}${pair("怎麼補血", "生命十字 +20 HP（低血時出現更多）；站在治癒泉每秒 +9 HP；護盾泡能擋一次傷害；生命低於 40% 時，畫面邊緣會指出最近的治癒泉。")}</div>`;
    if (topic === "food")
      return `<p class="rule-intro">食物比舊版少、但更有價值：會成群出現，吃起來更順。道具最多同時 4 個（小型競技場 2 個），出現 45 秒後消失，最後 5 秒會閃爍。</p><div class="food-grid">${["energy", "fruit", "crystal", "heal"].map(foodCard).join("")}</div><div class="food-grid">${S.POWER_IDS.map(foodCard).join("")}</div><div class="rule-columns">${pair("變長和升級不同", "食物提供「成長點數」，每 3 點長 1 節，上限 160 節。經驗條填滿才升級；擊敗敵人與打破寶箱也給經驗。")}${pair("連擊", "只有攻擊打中怪物才會累積（咬擊、衝撞、纏繞、蛇身反擊、技能、爆裂果）；吃東西、打寶箱與光刃自動傷害都不算。3 秒內再打中就延續，每 10 連擊擊敗敵人得分 +10%，最多兩倍；受傷或 3 秒沒打中就中斷。")}${pair("道具在哪裡？", "道具會出現在你附近 12–34 距離內；畫面外的道具會在邊緣用箭頭標示，小地圖上是閃爍的彩色圓點。晶簇寶箱有 40% 機率掉道具。")}${pair("分數與晶體", "得分用於紀錄；局外晶體用於研究所。結算時拿到收集的晶體、每 300 分再 +1，完成挑戰 +20，新成就各 +10。")}</div>`;
    if (topic === "map") {
      const w = S.WORLDS;
      return `<div class="rule-callout"><strong>地圖不再只是空地：每個區域都有可以利用的東西。</strong><p>地圖長寬是舊版的 2 倍（競技場 168 × 168、其他 252 × 252）。右下小地圖顯示你附近約 110 公尺：白色箭頭是你、白框是目前畫面、紅點是敵人，首領在範圍外時邊緣會有紅色箭頭。按 M 或點小地圖看全圖（遊戲暫停）。</p></div><div class="rule-columns">${Object.values(
        S.FEATURES,
      )
        .map((f) => pair(f.name, f.desc))
        .join(
          "",
        )}${pair("八座地標", "大地圖四周各有一座地標（巨木／冰晶尖塔／遠古方碑），共 8 座，方便辨認方位；5 組傳送門是長距離移動的捷徑。")}</div><div class="rule-columns">${w.map((x) => pair(`${x.name}・${x.zone.name}`, `${x.zone.effect}。造景：${x.subtitle}。`)).join("")}</div><p class="rule-footnote">蟲群對戰與首領連戰使用較小的競技場：兩圈共 8 根柱子當掩護，另有 3 座治癒泉、加速板與 2 組傳送門。新手練習是空曠的場地。</p>`;
    }
    if (topic === "characters")
      return `<p class="rule-intro">按 E、滑鼠右鍵或技能按鈕發動；冷卻結束就可再次使用，不消耗晶體。技能可用時按鈕會發光。</p><div class="character-guide">${S.CHARACTERS.map((c, i) => `<article><div class="character-guide-title"><span class="mini-snake" style="--c:${c.color}" aria-hidden="true"></span><div><h3>${c.name} / ${c.role}</h3><small>生命 ${c.health} HP　冷卻 ${c.cooldown} 秒</small></div></div><h4>${c.skill}</h4><p>${c.description}</p><p class="skill-caution">${["立即回復 12 HP；磁力持續 6 秒。吸附技能本身不會攻擊或提供無敵。", "爆破立即造成傷害，接著蛇身附近持續燃燒 6 秒。很適合搭配纏繞：圈住後再燒。", "凍結 5 秒並造成範圍傷害。凍住的敵人仍有接觸傷害，但非常好圈。", "6 秒內不受傷害，蛇頭接觸敵人核心可反擊。結束後立即恢復一般規則。"][i]}</p></article>`).join("")}</div>`;
    return `<div class="rule-columns">${Object.values(S.MODES)
      .map((m) => pair(`${m.name} / ${m.tag}`, m.goal))
      .join(
        "",
      )}${pair("八步無傷練習", "轉彎 → 吃五顆 → 衝刺 → 自動咬中靶 → 衝撞中靶 → 纏繞圈住靶 → 技能 → 進化。練習靶只接受指定攻擊。不會死亡、不發獎勵、不寫紀錄。")}${pair("結算與存檔", "Esc／P 暫停 → 結算本局，提早離開也會保留已得獎勵，但不算挑戰獲勝。只有結算後才保存；重新整理或直接關頁會失去未結算進度。")}</div><p class="rule-footnote">單人離線遊戲，進度保存在目前瀏覽器。四位角色與三個戰場都可自由選擇。</p>`;
  }
  window.SerpentGuide = { topics, content, diagram };
})();

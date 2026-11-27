"use strict";
// ===== 商店：買塔（只有 ★1）＋ 強化工坊（升星／融合）＋ 道具櫃 =====
// 塔的售價；sale 是特價。
function shopPrice(key, sale) {
  return Math.max(
    5,
    Math.round(SHOP_PRICE[key] * (1 - R.mods.shopDisc) * (sale ? 0.7 : 1)),
  );
}
// 道具的售價；依稀有度與波次。
function itemPrice(id) {
  return Math.round(
    [40, 90, 200, 450, 900, 2000][ITEM_BY[id].r] *
      (1 + R.wave * 0.03) *
      (1 - R.mods.shopDisc),
  );
}
// 刷新商店的費用。
function refreshCost() {
  return R.freeRefresh > 0 ? 0 : 10 + 6 * R.shop.rolls;
}
// 重新產生商店的塔與道具；paid 表示由玩家付費刷新。
function refreshShop(paid) {
  if (paid) {
    const c = refreshCost();
    if (R.freeRefresh > 0) R.freeRefresh--;
    else {
      if (R.gold < c) {
        toast("金幣不足", "#ff8a8a");
        AU.play("error");
        return;
      }
      R.gold -= c;
    }
    R.shop.rolls++;
    AU.play("flip");
  }
  const early = R.wave < 5;
  R.shop.offers = [0, 1, 2, 3, 4].map(() => {
    const key = wpick(SHOP_POOL, (k) =>
      early && SHOP_PRICE[k] > 80 ? 0.5 : 1,
    );
    return { key, sold: false, sale: Math.random() < 0.1 };
  });
  R.shop.items = [0, 1, 2].map(() => ({
    id: rollItem(R.wave / 15),
    sold: false,
  }));
}
// up = 買下後立刻和已擁有的 ★1 合成 ★2
function buyOffer(o, up, fx = 300, fy = 400) {
  if (o.sold) return;
  const p = shopPrice(o.key, o.sale),
    uc = up ? Math.round(upgradeCost(1) * (1 - R.mods.shopDisc)) : 0;
  if (up && !ownedGroups().some((q) => q.key === o.key && q.tier === 1)) return;
  if (!up && R.hand.length >= HAND_MAX) {
    toast(
      `備戰區滿了（${HAND_MAX} 格）！先到戰場把塔放到地圖上，或出售`,
      "#ff8a8a",
    );
    AU.play("error");
    return;
  }
  if (R.gold < p + uc) {
    toast(up ? `金幣不足：買＋升星共需要 ${p + uc} 金` : "金幣不足", "#ff8a8a");
    AU.play("error");
    return;
  }
  R.gold -= p;
  o.sold = true;
  addCard(o.key, 1, { fx, fy, force: up });
  AU.play("sell");
  if (up) {
    const g = ownedGroups().find((q) => q.key === o.key && q.tier === 1);
    if (g && g.list.length >= 2) doUpgrade(g);
  }
}
// 可以升星的組合。
function upgradableGroups() {
  return ownedGroups().filter((q) => q.list.length >= 2 && q.tier < MAX_TIER);
}
// 一鍵升星：從低星開始，把所有能升的都升上去（金幣不夠就停）
function upgradeAll() {
  let n = 0,
    guard = 0;
  while (guard++ < 60) {
    const g = upgradableGroups().sort((a, b) => a.tier - b.tier)[0];
    if (!g || R.gold < Math.round(upgradeCost(g.tier) * (1 - R.mods.shopDisc)))
      break;
    doUpgrade(g, true);
    n++;
  }
  if (n) {
    toast(`⚡ 一鍵升星完成：共升級 ${n} 次`, "#7affb0");
    AU.play("tierUp", 3);
    flash(0.2, "#7affb0");
  } else toast("沒有可以升星的塔，或金幣不足", "#ff8a8a");
}
// 購買道具。
function buyShopItem(o) {
  if (o.sold) return;
  const p = itemPrice(o.id);
  if (R.gold < p) {
    toast("金幣不足", "#ff8a8a");
    AU.play("error");
    return;
  }
  R.gold -= p;
  o.sold = true;
  addItem(o.id);
}
// 擁有的塔（備戰區＋地圖），依「種類＋星級」分組
function ownedGroups() {
  const m = new Map();
  // 加入一座塔到對應的組合。
  const add = (key, tier, src, ref) => {
    const k = key + "|" + tier;
    if (!m.has(k)) m.set(k, { key, tier, list: [] });
    m.get(k).list.push({ src, ref });
  };
  R.hand.forEach((c) => add(c.key, c.tier, "hand", c));
  R.towers.forEach((t) => add(t.key, t.tier, "map", t));
  return [...m.values()].sort(
    (a, b) =>
      (b.list.length >= 2) - (a.list.length >= 2) ||
      b.tier - a.tier ||
      towerName(a.key).localeCompare(towerName(b.key)),
  );
}
// 從一組裡取出一座；預設先拿備戰區的。
function takeOne(g, preferHand = true) {
  const list = g.list
    .slice()
    .sort((a, b) =>
      preferHand ? (a.src === "hand" ? -1 : 1) : a.src === "map" ? -1 : 1,
    );
  return list[0];
}
// keepRef：指定要留下來（升星）的那一座，例如目前選取的地圖塔
function doUpgrade(g, quiet, keepRef) {
  if (!g || g.list.length < 2 || g.tier >= MAX_TIER) return;
  const cost = Math.round(upgradeCost(g.tier) * (1 - R.mods.shopDisc));
  if (R.gold < cost) {
    toast("金幣不足", "#ff8a8a");
    AU.play("error");
    return;
  }
  R.gold -= cost;
  const keep =
      (keepRef && g.list.find((e) => e.ref === keepRef)) || takeOne(g, false),
    drop =
      g.list.find((e) => e !== keep && e.src === "hand") ||
      g.list.find((e) => e !== keep);
  removeOwned(drop);
  let nt = g.tier + 1;
  if (R.mods.stone && Math.random() < R.mods.stone && nt < MAX_TIER) {
    nt++;
    toast("💎 賢者之石發動！額外升一星", "#c868ff");
  }
  setOwnedTier(keep, g.key, nt);
  R.stats.merges++;
  AU.play("merge");
  if (quiet || R.phase === "wave")
    toast(`⬆ ${towerName(g.key)} 升到 ★${nt}！`, TIER_COL[nt]);
  else
    R.modals.push({ type: "tierup", key: g.key, from: g.tier, to: nt, t: 0 });
}
// 移除一座擁有的塔。
function removeOwned(e) {
  if (e.src === "hand") {
    R.hand = R.hand.filter((c) => c !== e.ref);
    R.selCard = -1;
  } else removeTower(e.ref);
}
// 直接改變一座塔的種類與星級。
function setOwnedTier(e, key, tier) {
  if (e.src === "hand") {
    e.ref.key = key;
    e.ref.tier = tier;
    e.ref.anim = 0.5;
  } else {
    const t = e.ref;
    t.key = key;
    t.tier = tier;
    t.st = calcStats(key, tier, R.mods);
    t.pop = 1;
    t.beams = [];
    fuseFx(t.x, t.y, key, "merge", tier);
  }
  discover(key);
}
// 出售一座塔。
function sellOwned(g) {
  const e = takeOne(g, true),
    v = cardValue(g.key, g.tier);
  removeOwned(e);
  R.gold += v;
  AU.play("sell");
  toast(`出售 ${towerName(g.key)} ★${g.tier}：+${v} 金`, "#ffcf3a");
}
// 列出目前所有可以融合的組合。
function fusionOptions() {
  const gs = ownedGroups().filter((g) =>
    ["base", "hybrid", "trinity"].includes(towerKind(g.key)),
  );
  const out = [];
  for (let i = 0; i < gs.length; i++)
    for (let j = i + 1; j < gs.length; j++) {
      const a = gs[i],
        b = gs[j];
      const r = fuseResult(
        { key: a.key, tier: a.tier },
        { key: b.key, tier: b.tier },
      );
      if (r && r.type === "fuse") out.push({ a, b, r });
    }
  return out;
}
// 執行融合。
function doFuse(f) {
  const cost = Math.round(fuseCost(f.a.tier) * (1 - R.mods.shopDisc));
  if (R.gold < cost) {
    toast("金幣不足", "#ff8a8a");
    AU.play("error");
    return;
  }
  R.gold -= cost;
  const ea = takeOne(f.a, false),
    eb = takeOne(f.b, false);
  const keep = ea.src === "map" ? ea : eb.src === "map" ? eb : ea,
    drop = keep === ea ? eb : ea;
  removeOwned(drop);
  setOwnedTier(keep, f.r.key, f.r.tier);
  R.stats.fusions++;
  AU.play("fuse");
  if (R.phase === "wave") toast(`⚗ 融合成功：${towerName(f.r.key)}`, "#ff9af0");
  else
    R.modals.push({
      type: "tierup",
      key: f.r.key,
      from: f.r.tier,
      to: f.r.tier,
      fuse: [f.a.key, f.b.key],
      t: 0,
    });
}
// 升星前後的數值比較。
function statPairs(key, tier) {
  const a = calcStats(key, tier, R.mods),
    b = tier < MAX_TIER ? calcStats(key, tier + 1, R.mods) : null;
  const rows = [];
  if (a.mode === "eco") rows.push(["每波產金", a.eco, b && b.eco]);
  else if (a.mode === "support")
    rows.push(
      [
        "加傷",
        Math.round(a.support.dmg * 100) + "%",
        b && Math.round(b.support.dmg * 100) + "%",
      ],
      [
        "加攻速",
        Math.round(a.support.rate * 100) + "%",
        b && Math.round(b.support.rate * 100) + "%",
      ],
    );
  else {
    rows.push(
      ["傷害", fmt(a.dmg), b && fmt(b.dmg)],
      ["攻速", a.rate.toFixed(2), b && b.rate.toFixed(2)],
    );
    if (a.mode === "aura")
      rows.push([
        "緩速",
        Math.round(a.slow * 100) + "%",
        b && Math.round(b.slow * 100) + "%",
      ]);
  }
  if (a.range)
    rows.push(["射程", Math.round(a.range), b && Math.round(b.range)]);
  return rows;
}

// ===== 商店畫面 =====
function drawShop(c, dt) {
  // 商店背景：暖色漸層與淡淡的格紋。
  const t = G.time;
  let g = c.createLinearGradient(0, 70, 0, H);
  g.addColorStop(0, "#3a1e10");
  g.addColorStop(0.6, "#1e0e08");
  g.addColorStop(1, "#0e0604");
  c.fillStyle = g;
  c.fillRect(0, 70, W, H - 70);
  c.save();
  c.globalAlpha = 0.12;
  c.strokeStyle = "#ffcf8a";
  c.lineWidth = 2;
  // 背景的木板紋路。
  for (let y = 140; y < H; y += 120) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(W, y);
    c.stroke();
  }
  c.restore();
  c.save();
  c.globalCompositeOperation = "lighter";
  // 天花板的吊燈。
  for (let k = 0; k < 7; k++) {
    const lx = 140 + k * 280,
      ly = 92 + Math.sin(t * 1.5 + k) * 4;
    glow(c, lx, ly + 20, 90, "#ffae3a", 0.35);
    c.fillStyle = "#ff6a2a";
    rr(c, lx - 12, ly, 24, 34, 10);
    c.fill();
  }
  c.restore();
  // ===== 左：購買 =====
  const LX = 20,
    LY = 84,
    LW = 1040;
  // 左邊的塔之商店：只賣一星塔；已經有同一種的話，買下就能馬上升星。
  rr(c, LX, LY, LW, 896, 20);
  c.fillStyle = "rgba(30,16,8,.82)";
  c.fill();
  c.lineWidth = 3;
  c.strokeStyle = "#c8904a";
  c.stroke();
  goldText(c, "🏪 塔之商店", LX + 30, LY + 38, 34, { align: "left" });
  txt(
    c,
    "只賣 ★1 塔。已經有同一種塔時，可以直接按「買＋升星」變成 ★2！",
    LX + 30,
    LY + 76,
    { size: 16, align: "left", color: "#ffe0b0", weight: 700 },
  );
  // 刷新商品要花的金幣（會越來越貴）。
  const rc = refreshCost();
  // 刷新按鈕。
  button(
    "shopRefresh",
    LX + LW - 230,
    LY + 18,
    200,
    56,
    rc ? `🔄 刷新 ${rc} 金` : "🔄 免費刷新",
    {
      style: "blue",
      size: 19,
      fn: () => refreshShop(true),
      tip: "換一批新的塔（每波結束會自動免費刷新）",
    },
  );
  // groups 是玩家已經有的塔，uc1 是一星升二星的費用（含遺物打折）。
  const groups = ownedGroups(),
    uc1 = Math.round(upgradeCost(1) * (1 - R.mods.shopDisc));
  // 六個塔的商品卡。
  R.shop.offers.forEach((o, i) => {
    // 每一張商品卡：滑過放大，已經擁有的有綠色外框，特價的有紅色標籤。
    const cw = 196,
      chh = 430,
      x = LX + 18 + i * 204,
      y = LY + 104;
    const kind = towerKind(o.key),
      col = ELEM[elemsOf(o.key)[0]].c;
    const own = groups
      .filter((q) => q.key === o.key && q.tier === 1)
      .reduce((a2, q) => a2 + q.list.length, 0);
    const hov = !UI.noHover && hit(x, y, cw, chh) && !o.sold;
    c.save();
    if (hov) {
      c.translate(x + cw / 2, y + chh / 2);
      c.scale(1.02, 1.02);
      c.translate(-(x + cw / 2), -(y + chh / 2));
    }
    rr(c, x, y, cw, chh, 18);
    g = c.createLinearGradient(0, y, 0, y + chh);
    g.addColorStop(0, mixHex(col, "#2a1a10", 0.6));
    g.addColorStop(1, "#140a06");
    c.fillStyle = g;
    c.fill();
    if (own && !o.sold)
      neonRR(c, x, y, cw, chh, 18, {
        col: "#7affb0",
        w: 2.5,
        a: 0.6 + 0.3 * Math.sin(t * 4 + i),
      });
    else {
      c.lineWidth = 3;
      c.strokeStyle = o.sold ? "rgba(255,255,255,.15)" : col;
      c.stroke();
    }
    if (o.sold) c.globalAlpha = 0.35;
    rr(c, x + 10, y + 10, 90, 26, 13);
    c.fillStyle = kind === "class" ? "#5a4a8a" : "#8a3a1a";
    c.fill();
    txt(
      c,
      kind === "class" ? "職業塔" : ELEM[o.key].full + "元素",
      x + 55,
      y + 23,
      { size: 13, weight: 900 },
    );
    if (o.sale && !o.sold) {
      rr(c, x + cw - 72, y + 10, 62, 26, 13);
      c.fillStyle = "#ff2a4a";
      c.fill();
      txt(c, "特價", x + cw - 41, y + 23, { size: 14, weight: 900 });
    }
    c.save();
    c.globalCompositeOperation = "lighter";
    glow(c, x + cw / 2, y + 112, 90, col, 0.35);
    c.restore();
    // 卡片中間的塔圖案、名稱、攻擊方式、說明與主要數值。
    drawTower(c, o.key, 1, x + cw / 2, y + 128, 1.6, t + i, -Math.PI / 4, {
      flat: true,
      noTierScale: true,
    });
    txt(c, towerName(o.key), x + cw / 2, y + 186, {
      size: 22,
      weight: 900,
      color: "#ffffff",
      stroke: "rgba(0,0,0,.6)",
      sw: 4,
    });
    txt(c, MODE_NAME[towerMode(o.key)], x + cw / 2, y + 210, {
      size: 14,
      weight: 700,
      color: "#ffe0b0",
    });
    c.font = font(14, 600);
    wrapLines(c, towerDesc(o.key), cw - 24)
      .slice(0, 3)
      .forEach((l, k) =>
        txt(c, l, x + cw / 2, y + 234 + k * 19, {
          size: 14,
          color: "#f0e0d0",
          weight: 600,
        }),
      );
    statPairs(o.key, 1)
      .slice(0, 2)
      .forEach(([n, v], k) =>
        txt(c, `${n} ${v}`, x + cw / 2, y + 300 + k * 20, {
          size: 14,
          color: "#c8f0ff",
          weight: 800,
        }),
      );
    // 已經擁有幾座。
    if (own) {
      rr(c, x + 18, y + 334, cw - 36, 24, 12);
      c.fillStyle = "rgba(40,160,90,.35)";
      c.fill();
      txt(c, `已擁有 ★1 ×${own}`, x + cw / 2, y + 346, {
        size: 13,
        color: "#7affb0",
        weight: 900,
      });
    }
    c.restore();
    // 價格與購買按鈕：已售出、「只買下來」、「買＋升星」三種。
    const p = shopPrice(o.key, o.sale),
      fx = x + cw / 2,
      fy = y + 150;
    if (o.sold)
      button("buy" + i, x + 14, y + chh - 64, cw - 28, 52, "已售出", {
        style: "dark",
        size: 20,
        disabled: true,
        fn: () => {},
      });
    else if (own) {
      button("buy" + i, x + 10, y + chh - 64, 74, 52, `購買\n${p} 金`, {
        style: R.gold >= p ? "gold" : "dark",
        size: 15,
        fn: () => buyOffer(o, false, fx, fy),
        tip: `只買下來（${p} 金）`,
      });
      button(
        "buyUp" + i,
        x + 90,
        y + chh - 64,
        cw - 100,
        52,
        `買＋升星\n${p + uc1} 金`,
        {
          style: R.gold >= p + uc1 ? "green" : "dark",
          size: 15,
          fn: () => buyOffer(o, true, fx, fy),
          tip: `買下後立刻和你的 ★1 ${towerName(o.key)} 合成 ★2（塔 ${p} ＋ 升星 ${uc1} 金）`,
        },
      );
    } else
      button("buy" + i, x + 14, y + chh - 64, cw - 28, 52, `💰 ${p} 金`, {
        style: R.gold >= p ? "gold" : "dark",
        size: 20,
        fn: () => buyOffer(o, false, fx, fy),
      });
  });
  // 道具櫃
  const IY = LY + 554;
  // 下方的道具櫃：每波更新，也可以在賭場抽到。
  goldText(c, "🧪 道具櫃", LX + 30, IY + 20, 28, { align: "left" });
  txt(c, "每波更新・也可以在賭場免費抽到", LX + 200, IY + 22, {
    size: 14,
    align: "left",
    color: "#ffe0b0",
    weight: 600,
  });
  // 道具櫃。
  R.shop.items.forEach((o, i) => {
    // 每個道具一張卡片：名稱、稀有度、分類、說明與價格。
    const x = LX + 18 + i * 254,
      y = IY + 44,
      w = 244,
      h = 262,
      def = ITEM_BY[o.id];
    rr(c, x, y, w, h, 16);
    c.fillStyle = "rgba(20,10,30,.8)";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = o.sold ? "rgba(255,255,255,.15)" : rarCol(def.r);
    c.stroke();
    c.save();
    if (o.sold) c.globalAlpha = 0.35;
    drawItemIcon(c, def, x + w / 2 - 40, y + 12, 80, 1);
    txt(c, def.n, x + w / 2, y + 106, {
      size: 20,
      weight: 900,
      color: rarCol(def.r),
    });
    txt(c, `${IRAR[def.r].n}・${ICAT[def.cat].n}`, x + w / 2, y + 128, {
      size: 13,
      weight: 700,
      color: "#d0c0e0",
    });
    c.font = font(14, 600);
    wrapLines(c, def.d, w - 24)
      .slice(0, 2)
      .forEach((l, k) =>
        txt(c, l, x + w / 2, y + 152 + k * 19, {
          size: 14,
          color: "#f0e8ff",
          weight: 600,
        }),
      );
    c.restore();
    const p = itemPrice(o.id);
    button(
      "bi" + i,
      x + 14,
      y + h - 58,
      w - 28,
      46,
      o.sold ? "已售出" : `💰 ${p} 金`,
      {
        style: o.sold ? "dark" : R.gold >= p ? "gold" : "dark",
        size: 18,
        disabled: o.sold,
        fn: () => buyShopItem(o),
      },
    );
  });
  // 購買幸運。
  {
    const x = LX + 18 + 3 * 254,
      y = IY + 44,
      w = 244,
      h = 262,
      cost = luckCost();
    rr(c, x, y, w, h, 16);
    c.fillStyle = "rgba(10,30,20,.8)";
    c.fill();
    c.lineWidth = 2.5;
    c.strokeStyle = "#7affb0";
    c.stroke();
    c.font = `60px ${EMOJI_FONT}`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("🍀", x + w / 2, y + 52);
    txt(c, "幸運強化", x + w / 2, y + 106, {
      size: 20,
      weight: 900,
      color: "#7affb0",
    });
    txt(c, `目前幸運 ${Math.round(getLuck())}`, x + w / 2, y + 128, {
      size: 14,
      weight: 700,
      color: "#d0f0e0",
    });
    ["幸運 +3（本局永久）", "提高賭博重來機率與暴擊率"].forEach((l, k) =>
      txt(c, l, x + w / 2, y + 152 + k * 19, {
        size: 14,
        color: "#e8fff0",
        weight: 600,
      }),
    );
    button("buyLuck", x + 14, y + h - 58, w - 28, 46, `💰 ${cost} 金`, {
      style: R.gold >= cost ? "green" : "dark",
      size: 18,
      fn: buyLuck,
    });
  }
  // ===== 右下：備戰區說明 =====
  // 下方的備戰區狀態。
  {
    const bx = 1320,
      by = 986,
      n = R.hand.length;
    rr(c, bx, by, 582, 84, 14);
    c.fillStyle = "rgba(20,10,30,.8)";
    c.fill();
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,210,140,.3)";
    c.stroke();
    txt(c, `📦 備戰區 ${n}/${HAND_MAX}`, bx + 18, by + 22, {
      size: 18,
      align: "left",
      color: n >= HAND_MAX ? "#ff8a8a" : "#ffe080",
      weight: 900,
    });
    txt(
      c,
      `地圖上 ${R.towers.length} 座・${myGroups().length} 種・第 ${(R.handPage || 0) + 1}/${handPages()} 頁`,
      bx + 564,
      by + 22,
      { size: 14, align: "right", color: "#d0c0e0", weight: 700 },
    );
    txt(
      c,
      "下面「我的塔」＝備戰區＋地圖上的全部塔（×2 ×3 是數量）",
      bx + 18,
      by + 48,
      { size: 14, align: "left", color: "#ffffff", weight: 700 },
    );
    txt(c, "左上角 ⬆ 點一下就升星；📍 表示已經放在地圖上", bx + 18, by + 70, {
      size: 14,
      align: "left",
      color: "#7affb0",
      weight: 700,
    });
  }
  // ===== 右：強化工坊 =====
  // 右側的強化工坊。
  const RX = 1078,
    RY = 84,
    RW = 824,
    RH = 896;
  // 右邊的面板：升級與合成。
  rr(c, RX, RY, RW, RH, 20);
  c.fillStyle = "rgba(20,10,30,.86)";
  c.fill();
  neonRR(c, RX, RY, RW, RH, 20, { col: "#ffae3c", w: 2, a: 0.8 });
  goldText(c, "⚒ 強化工坊", RX + 30, RY + 38, 34, {
    align: "left",
    cols: ["#ffffff", "#ffd08a", "#ff8a3a"],
  });
  R.shopTab = R.shopTab || "up";
  button("stUp", RX + RW - 400, RY + 16, 180, 50, "⬆ 升星", {
    style: R.shopTab === "up" ? "gold" : "dark",
    size: 20,
    // 切換到「升級」分頁。
    fn: () => {
      R.shopTab = "up";
      R.shopScroll = 0;
    },
  });
  button("stFuse", RX + RW - 210, RY + 16, 180, 50, "⚗ 融合", {
    style: R.shopTab === "fuse" ? "purple" : "dark",
    size: 20,
    // 切換到「合成」分頁。
    fn: () => {
      R.shopTab = "fuse";
      R.shopScroll = 0;
    },
  });
  txt(
    c,
    R.shopTab === "up"
      ? "兩座「同種類、同星級」的塔 → 合成一座高一星的塔（場上的塔會原地升級）"
      : "兩座不同元素、同星級的元素塔 → 融合成雙元素／三元素塔",
    RX + 30,
    RY + 82,
    { size: 15, align: "left", color: "#ffe0b0", weight: 700 },
  );
  const listY = RY + 104,
    rowH = 120,
    vis = 6;
  c.save();
  c.beginPath();
  c.rect(RX + 8, listY, RW - 16, rowH * vis + 4);
  c.clip();
  // 升星清單。
  if (R.shopTab === "up") {
    const gs = ownedGroups();
    R.shopScroll = clamp(R.shopScroll || 0, 0, Math.max(0, gs.length - vis));
    if (!gs.length)
      txt(c, "還沒有塔。先在左邊買幾座吧！", RX + RW / 2, listY + 100, {
        size: 20,
        color: "rgba(255,255,255,.5)",
        weight: 700,
      });
    gs.slice(R.shopScroll, R.shopScroll + vis).forEach((gq, i) =>
      drawUpRow(c, gq, RX + 16, listY + i * rowH, RW - 32, rowH - 8, i),
    );
    if (gs.length > vis)
      drawScrollHint(
        c,
        RX + RW - 20,
        listY,
        rowH * vis,
        R.shopScroll,
        gs.length - vis,
      );
  } else {
    const fs = fusionOptions();
    R.shopScroll = clamp(R.shopScroll || 0, 0, Math.max(0, fs.length - vis));
    // 融合清單。
    if (!fs.length) {
      txt(c, "目前沒有可以融合的組合", RX + RW / 2, listY + 90, {
        size: 20,
        color: "rgba(255,255,255,.5)",
        weight: 700,
      });
      txt(
        c,
        "例：烈焰塔 ★1 ＋ 寒霜塔 ★1 → 蒸汽爆炎塔 ★1",
        RX + RW / 2,
        listY + 126,
        { size: 16, color: "rgba(255,255,255,.45)", weight: 600 },
      );
    }
    fs.slice(R.shopScroll, R.shopScroll + vis).forEach((f, i) =>
      drawFuseRow(c, f, RX + 16, listY + i * rowH, RW - 32, rowH - 8, i),
    );
    if (fs.length > vis)
      drawScrollHint(
        c,
        RX + RW - 20,
        listY,
        rowH * vis,
        R.shopScroll,
        fs.length - vis,
      );
  }
  c.restore();
  // 上一頁與下一頁。
  button("scrUp", RX + RW - 250, RY + RH - 64, 110, 48, "▲ 上一頁", {
    size: 16,
    fn: () => {
      R.shopScroll = Math.max(0, (R.shopScroll || 0) - 3);
    },
  });
  button("scrDn", RX + RW - 130, RY + RH - 64, 110, 48, "▼ 下一頁", {
    size: 16,
    fn: () => {
      R.shopScroll = (R.shopScroll || 0) + 3;
    },
  });
  const ug = upgradableGroups().length;
  // 一鍵全部升星。
  button(
    "upAll",
    RX + 20,
    RY + RH - 64,
    290,
    48,
    ug ? `⚡ 一鍵全部升星（${ug} 組）` : "⚡ 一鍵全部升星",
    {
      style: ug ? "green" : "dark",
      size: 17,
      disabled: !ug,
      fn: upgradeAll,
      tip: "從低星開始，把所有「有兩座相同」的塔全部升星，金幣不夠時會停下",
    },
  );
  txt(c, "滑鼠滾輪可捲動", RX + 326, RY + RH - 40, {
    size: 14,
    align: "left",
    color: "rgba(255,255,255,.45)",
    weight: 600,
  });
}
// 捲動位置的提示條。
function drawScrollHint(c, x, y, h, pos, max) {
  rr(c, x - 4, y, 8, h, 4);
  c.fillStyle = "rgba(255,255,255,.1)";
  c.fill();
  const bh = Math.max(40, h * 0.3),
    by = y + (h - bh) * (pos / Math.max(1, max));
  rr(c, x - 4, by, 8, bh, 4);
  c.fillStyle = "#ffae3c";
  c.fill();
}
// 升星清單的一列。
function drawUpRow(c, gq, x, y, w, h, i) {
  const t = G.time,
    n = gq.list.length,
    can = n >= 2 && gq.tier < MAX_TIER,
    tc = TIER_COL[gq.tier];
  rr(c, x, y, w, h, 16);
  const g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, can ? "rgba(80,50,20,.85)" : "rgba(40,30,50,.7)");
  g.addColorStop(1, "rgba(20,10,30,.85)");
  c.fillStyle = g;
  c.fill();
  if (can)
    neonRR(c, x, y, w, h, 16, {
      col: "#ffcf3a",
      w: 2,
      a: 0.6 + 0.3 * Math.sin(t * 4 + i),
    });
  else {
    c.lineWidth = 1.5;
    c.strokeStyle = "rgba(255,255,255,.12)";
    c.stroke();
  }
  drawTower(c, gq.key, gq.tier, x + 62, y + 76, 1.05, t + i, -Math.PI / 4, {
    flat: true,
    noTierScale: true,
  });
  txt(c, towerName(gq.key), x + 128, y + 26, {
    size: 21,
    align: "left",
    color: "#ffffff",
    weight: 900,
  });
  txt(c, "★".repeat(gq.tier) + " " + TIER_NAME[gq.tier], x + 128, y + 52, {
    size: 15,
    align: "left",
    color: tc,
    weight: 900,
  });
  const onMap = gq.list.filter((e) => e.src === "map").length,
    inHand = n - onMap;
  txt(c, `場上 ${onMap}・備戰 ${inHand}`, x + 128, y + 72, {
    size: 13,
    align: "left",
    color: "#d0c0e0",
    weight: 700,
  });
  rr(c, x + 128, y + 82, 92, 24, 12);
  c.fillStyle = can ? "#2a8a4a" : "#5a3a3a";
  c.fill();
  txt(
    c,
    gq.tier >= MAX_TIER ? "最高星" : `${Math.min(n, 2)}/2 座`,
    x + 174,
    y + 94,
    { size: 14, weight: 900, color: "#fff" },
  );
  const rows = statPairs(gq.key, gq.tier);
  // 升星前後的數值。
  rows.slice(0, 3).forEach(([nm, a, b], k) => {
    const sx = x + 250 + k * 128;
    txt(c, nm, sx, y + 24, {
      size: 13,
      align: "left",
      color: "#a898c8",
      weight: 700,
    });
    txt(c, "" + a, sx, y + 50, {
      size: 18,
      align: "left",
      color: "#ffffff",
      weight: 900,
    });
    if (b != null) {
      c.font = font(18, 900);
      const aw = c.measureText("" + a).width;
      txt(c, "→ " + b, sx + aw + 6, y + 50, {
        size: 18,
        align: "left",
        color: "#7affb0",
        weight: 900,
      });
    }
  });
  // 下一星會解鎖的技能。
  if (gq.tier < MAX_TIER) {
    c.font = font(13, 700);
    const pl = wrapLines(
      c,
      `★${gq.tier + 1} 解鎖：${TIER_PERK[gq.tier + 1]}`,
      380,
    )[0];
    txt(c, pl, x + 250, y + 84, {
      size: 13,
      align: "left",
      color: TIER_COL[gq.tier + 1],
      weight: 700,
    });
  }
  const cost = Math.round(upgradeCost(gq.tier) * (1 - R.mods.shopDisc));
  // 升星按鈕。
  if (gq.tier < MAX_TIER)
    button(
      "up" + i,
      x + w - 168,
      y + 12,
      156,
      62,
      `升到 ★${gq.tier + 1}\n💰 ${cost} 金`,
      {
        style: can && R.gold >= cost ? "gold" : "dark",
        size: 17,
        disabled: !can,
        fn: () => doUpgrade(gq),
        tip: can
          ? `花 ${cost} 金，把兩座 ★${gq.tier} ${towerName(gq.key)} 合成一座 ★${gq.tier + 1}`
          : `還需要 ${2 - n} 座相同的 ★${gq.tier} ${towerName(gq.key)}`,
      },
    );
  button(
    "sell" + i,
    x + w - 168,
    y + 78,
    156,
    30,
    `出售 +${cardValue(gq.key, gq.tier)}`,
    { style: "red", size: 14, fn: () => sellOwned(gq) },
  );
}
// 融合清單的一列；還沒發現的塔會顯示問號。
function drawFuseRow(c, f, x, y, w, h, i) {
  const t = G.time;
  rr(c, x, y, w, h, 16);
  c.fillStyle = "rgba(40,20,60,.85)";
  c.fill();
  neonRR(c, x, y, w, h, 16, { col: "#c868ff", w: 2, a: 0.6 });
  drawTower(c, f.a.key, f.a.tier, x + 56, y + 74, 0.9, t, -Math.PI / 4, {
    flat: true,
    noTierScale: true,
  });
  txt(c, "＋", x + 112, y + 60, { size: 30, weight: 900, color: "#ffe080" });
  drawTower(c, f.b.key, f.b.tier, x + 168, y + 74, 0.9, t + 1, -Math.PI / 4, {
    flat: true,
    noTierScale: true,
  });
  txt(c, "→", x + 226, y + 60, { size: 34, weight: 900, color: "#ff9af0" });
  c.save();
  c.globalCompositeOperation = "lighter";
  glow(c, x + 292, y + 60, 60, "#ff9af0", 0.35 + 0.15 * Math.sin(t * 4));
  c.restore();
  drawTower(c, f.r.key, f.r.tier, x + 292, y + 74, 1.05, t + 2, -Math.PI / 4, {
    flat: true,
    noTierScale: true,
  });
  const known = !!G.meta.codex.towers[f.r.key];
  txt(c, known ? towerName(f.r.key) : "？？？（新發現）", x + 350, y + 28, {
    size: 21,
    align: "left",
    color: known ? "#ffffff" : "#ff9af0",
    weight: 900,
  });
  txt(
    c,
    `${towerName(f.a.key)} ＋ ${towerName(f.b.key)}・★${f.r.tier}`,
    x + 350,
    y + 56,
    { size: 14, align: "left", color: "#d0c0e0", weight: 700 },
  );
  c.font = font(13, 600);
  txt(
    c,
    wrapLines(
      c,
      known ? towerDesc(f.r.key) : "融合後才會揭曉的神秘塔！",
      260,
    )[0],
    x + 350,
    y + 84,
    { size: 13, align: "left", color: "#c8f0ff", weight: 600 },
  );
  const cost = Math.round(fuseCost(f.a.tier) * (1 - R.mods.shopDisc));
  button("fu" + i, x + w - 168, y + 22, 156, 72, `融合\n💰 ${cost} 金`, {
    style: R.gold >= cost ? "purple" : "dark",
    size: 18,
    fn: () => doFuse(f),
  });
}
// ===== 升星／融合展示 =====
function drawTierUp(c, m) {
  const t = G.time,
    k = Math.min(1, m.t / 0.6);
  dim(c, 0.8);
  godRays(c, W / 2, 430, t, [TIER_COL[m.to], "#ffffff"], 18, 1200, 0.12);
  const fuse = !!m.fuse;
  neonText(
    c,
    fuse ? "⚗ 融合成功！" : `⬆ 升星成功！★${m.from} → ★${m.to}`,
    W / 2,
    130,
    56,
    fuse ? "#ff9af0" : TIER_COL[m.to],
    { core: "#ffffff" },
  );
  // 融合：兩座塔靠近並合成。
  if (fuse) {
    drawTower(c, m.fuse[0], m.from, W / 2 - 420, 430, 2, t, -Math.PI / 4, {
      flat: true,
      noTierScale: true,
    });
    drawTower(c, m.fuse[1], m.from, W / 2 - 260, 430, 2, t + 1, -Math.PI / 4, {
      flat: true,
      noTierScale: true,
    });
    txt(c, "→", W / 2 - 110, 400, { size: 80, color: "#ffe080", weight: 900 });
  } else {
    c.save();
    c.globalAlpha = 0.7;
    drawTower(c, m.key, m.from, W / 2 - 330, 440, 2.2, t, -Math.PI / 4, {
      noTierScale: true,
    });
    c.restore();
    txt(c, "★" + m.from, W / 2 - 330, 560, {
      size: 30,
      color: TIER_COL[m.from],
      weight: 900,
    });
    txt(c, "→", W / 2 - 110, 400, { size: 80, color: "#ffe080", weight: 900 });
  }
  const s = easeOutElastic(k);
  c.save();
  c.translate(W / 2 + 160, 440);
  c.scale(s, s);
  c.globalCompositeOperation = "lighter";
  glow(c, 0, -30, 220, TIER_COL[m.to], 0.5);
  c.globalCompositeOperation = "source-over";
  drawTower(c, m.key, m.to, 0, 0, 3, t, -Math.PI / 4, { noTierScale: true });
  c.restore();
  txt(c, towerName(m.key) + "  " + "★".repeat(m.to), W / 2 + 160, 590, {
    size: 34,
    color: TIER_COL[m.to],
    weight: 900,
    stroke: "rgba(0,0,0,.7)",
    sw: 5,
  });
  const a = calcStats(m.key, Math.max(1, m.from - (fuse ? 0 : 0)), R.mods),
    b = calcStats(m.key, m.to, R.mods);
  const rows = statPairs(m.key, Math.max(1, m.to - 1));
  rr(c, W / 2 - 420, 640, 840, 210, 20);
  c.fillStyle = "rgba(10,4,24,.85)";
  c.fill();
  neonRR(c, W / 2 - 420, 640, 840, 210, 20, { col: TIER_COL[m.to], w: 2 });
  // 升星前後的數值。
  if (!fuse)
    rows.forEach(([nm, x1, x2], i) => {
      const cx = W / 2 - 330 + i * 220;
      txt(c, nm, cx, 680, { size: 18, color: "#a898c8", weight: 800 });
      txt(c, `${x1} → ${x2}`, cx, 716, {
        size: 26,
        color: "#7affb0",
        weight: 900,
      });
    });
  else
    txt(c, towerDesc(m.key), W / 2, 700, {
      size: 20,
      color: "#ffffff",
      weight: 700,
    });
  txt(c, `★${m.to} 技能：${TIER_PERK[m.to]}`, W / 2, 780, {
    size: 20,
    color: TIER_COL[m.to],
    weight: 900,
  });
  if (m.t > 0.5)
    button("tuOk", W / 2 - 150, 880, 300, 72, "太棒了！", {
      style: "gold",
      size: 28,
      fn: closeModal,
    });
  void a;
  void b;
}
// ===== 限定塔獲得展示 =====
function drawRewardModal(c, m) {
  const t = G.time,
    r = SP_RAR[m.key] || 2,
    col = rarCol(r);
  dim(c, 0.82);
  godRays(
    c,
    W / 2,
    440,
    t,
    r >= 5
      ? [rainbow(t * 100), rainbow(t * 100 + 120), rainbow(t * 100 + 240)]
      : [col, "#ffffff"],
    22,
    1300,
    0.14,
  );
  const s = easeOutElastic(Math.min(1, m.t / 0.9));
  neonText(c, "🎉 獲得賭場限定塔！", W / 2, 150, 60, col, { core: "#ffffff" });
  c.save();
  c.translate(W / 2, 470);
  c.scale(s, s);
  c.globalCompositeOperation = "lighter";
  glow(c, 0, -40, 280, col, 0.55);
  c.globalCompositeOperation = "source-over";
  drawTower(c, m.key, 1, 0, 0, 3.6, t, -Math.PI / 4, { noTierScale: true });
  c.restore();
  txt(c, towerName(m.key), W / 2, 650, {
    size: 52,
    color: col,
    weight: 900,
    stroke: "rgba(0,0,0,.7)",
    sw: 7,
  });
  txt(c, `${IRAR[r].n}・賭場限定`, W / 2, 704, {
    size: 24,
    color: "#ffe080",
    weight: 800,
  });
  txt(c, towerDesc(m.key), W / 2, 752, {
    size: 22,
    color: "#ffffff",
    weight: 700,
  });
  txt(c, "已放入備戰區，到戰場把它放到地圖上吧！", W / 2, 800, {
    size: 18,
    color: "rgba(255,255,255,.7)",
    weight: 600,
  });
  if (m.t > 0.6)
    button("rwOk", W / 2 - 150, 860, 300, 72, "收下！", {
      style: "gold",
      size: 30,
      fn: closeModal,
    });
}

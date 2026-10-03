/*
 * 黑川茜遊戲館 1.2
 * 此檔負責：心情推薦、遊戲介紹、開啟遊戲、返回與暫停。
 * 遊戲本體在 games/，藍色版面在 styles.css。
 */
"use strict";

// 在這裡修改首頁遊戲說明，不必修改遊戲邏輯。
const games = {
  abyss: {
    name: "深境冒險",
    category: "回合冒險 / 角色養成 RPG",
    cover: "assets/cover-abyss.webp?v=1.2-art",
    path: "games/abyss/index.html",
    description:
      "從六種職業中選擇你的冒險者，逐層探索深境。戰鬥、收集素材與裝備，迎戰每 50 層出現的大型 Boss，目標是走到第 1000 層。",
    steps: [
      "選擇職業與難度。每個職業有自己的資源、技能與戰鬥風格。",
      "用普攻、技能、戰術與藥水安排回合；擊敗敵人後前往下一層。",
      "在安全時整理裝備、逛商店與強化，讓角色能挑戰更深的樓層。",
    ],
    note: "喜歡刷裝備、成長與長期闖關的人可以先玩這款。\n原遊戲會在同一瀏覽器與網址自動保存；操作中離開時，以最後完整回合為準。",
  },
  arcane: {
    name: "蒼穹決戰：星界牌陣",
    category: "策略卡牌 / 魔法對決",
    cover: "assets/cover-arcane.webp?v=1.2-art",
    path: "games/arcane/index.html",
    description:
      "六位契約者、六名反派。為你的角色搭配支援術式，利用卡牌攻擊、護盾與狀態效果，在行動力與星能的限制下完成討伐。",
    steps: [
      "選擇一名契約者，查看生命、行動力與角色天賦。",
      "自行選滿支援術式，再挑難度、反派與單場或三連戰模式。",
      "觀察敵方下一回合意圖，依卡牌費用安排攻防，累積星能施放終結牌。",
    ],
    note: "喜歡搭配卡牌、思考出招順序與戰鬥特效的人可以選這款。\n本遊戲沒有跨重新整理的對戰存檔。返回遊戲館後再進入可接續本次對戰；重新整理或關閉網頁會重開。",
  },
  trader: {
    name: "百億炒股人生",
    category: "人生模擬 / 黑色幽默",
    cover: "assets/cover-trader.webp?v=1.2-art",
    path: "games/trader/index.html",
    description:
      "你繼承了一百億，但財富不代表能安穩過完人生。體驗 60 天的虛構市場與生活，在買賣、負債、健康與壓力之間做選擇，走向不同結局。",
    steps: [
      "建立角色，跟著新手教學練習買賣；熟悉玩法也可以跳過教學。",
      "看盤、買賣與處理突發事件。每天 24 小時，正常遊戲中每秒推進 5 分鐘。",
      "別只盯著身家：休息、打工、健康與借款都會影響你的結局。",
    ],
    note: "全為虛構的黑色幽默故事，包含賭博、負債、器官交易與死亡情節；不是投資或醫療建議。\n返回遊戲館會暫停時間並嘗試保存。同一瀏覽器與網址可使用原有自動存檔。",
  },
};

const lounge = document.getElementById("lounge");
const player = document.getElementById("player");
const details = document.getElementById("game-details");
const frameContainer = document.getElementById("frames");
const loading = document.getElementById("game-loading");
const playButton = document.getElementById("play-game");
const frames = new Map();
let selectedGame = null;
let activeGame = null;
let homeScroll = 0;
let previousFocus = null;
let selectedZone = "home";

function showDetails(id, trigger) {
  const game = games[id];
  if (!game) return;
  selectedGame = id;
  previousFocus = trigger || previousFocus;
  document.getElementById("details-title").textContent = game.name;
  document.getElementById("details-category").textContent = game.category;
  document.getElementById("details-description").textContent = game.description;
  document.getElementById("details-note").textContent = game.note;
  const steps = document.getElementById("details-steps");
  steps.replaceChildren();
  game.steps.forEach((text) => {
    const step = document.createElement("li");
    step.textContent = text;
    steps.append(step);
  });
  playButton.firstChild.textContent = frames.has(id)
    ? "繼續遊玩 "
    : "開始遊玩 ";
  details.showModal();
}

// iframe 保留在記憶體中，返回首頁不會重載遊戲。
function setPaused(frame, paused) {
  try {
    frame.contentWindow.postMessage(
      {
        type: "akane-portal-state",
        paused,
      },
      location.protocol === "file:" ? "*" : location.origin,
    );
  } catch (_) {
    // 本機檔案模式的瀏覽器可能限制跨框架存取。
  }
}

function openGame(id) {
  const game = games[id];
  if (!game) return;
  details.close();
  if (!activeGame) homeScroll = window.scrollY;
  activeGame = id;
  lounge.hidden = true;
  player.hidden = false;
  document.body.classList.add("playing");
  document.dispatchEvent(new Event("lounge-visibility"));
  document.getElementById("player-title").textContent = game.name;

  frames.forEach((frame, key) => {
    frame.hidden = key !== id;
    setPaused(frame, key !== id);
  });

  let frame = frames.get(id);
  if (!frame) {
    loading.hidden = false;
    frame = document.createElement("iframe");
    frame.title = `${game.name} 1.2`;
    frame.dataset.game = id;
    frame.src = game.path;
    // 同一來源的原遊戲需要 localStorage 與下載功能，因此不加 sandbox。
    frame.addEventListener("load", () => {
      setPaused(frame, activeGame !== id);
      if (activeGame === id) loading.hidden = true;
    });
    frames.set(id, frame);
    frameContainer.append(frame);
  } else {
    loading.hidden = true;
    frame.hidden = false;
    setPaused(frame, false);
  }
  document.getElementById("return-lounge").focus({
    preventScroll: true,
  });
}

function returnToLounge() {
  if (!activeGame) return;
  frames.forEach((frame) => {
    setPaused(frame, true);
    frame.hidden = true;
  });
  activeGame = null;
  player.hidden = true;
  lounge.hidden = false;
  loading.hidden = true;
  document.body.classList.remove("playing");
  document.dispatchEvent(new Event("lounge-visibility"));
  requestAnimationFrame(() => {
    window.scrollTo({
      top: homeScroll,
      behavior: "instant",
    });
    previousFocus?.focus({
      preventScroll: true,
    });
  });
}

// hash 讓瀏覽器的「上一頁」也能回到遊戲館。
function showZone() {
  const hash = location.hash.slice(1);
  const seasonMatch = /^season-([123])$/.exec(hash);
  const characterSections = [
    "akane",
    "profile",
    "archive-compass",
    "gallery",
    "sources",
    "design-room",
    "actor-room",
    "little-facts",
    "traits",
    "story-notes",
    "special-room",
    "chibi-room",
  ];
  const zone =
    characterSections.includes(hash) || seasonMatch
      ? "akane"
      : hash === "games"
        ? "games"
        : hash === "main-content"
          ? selectedZone
          : "home";
  const sectionHashes = [
    ...characterSections.filter((id) => id !== "akane"),
    "blue-hour",
    "season-1",
    "season-2",
    "season-3",
  ];
  const changed = selectedZone !== zone;
  selectedZone = zone;
  document.body.dataset.zoneView = zone;
  document.querySelectorAll("[data-zone]").forEach((panel) => {
    panel.hidden = panel.dataset.zone !== zone;
  });
  document.querySelectorAll("[data-zone-link]").forEach((link) => {
    if (link.dataset.zoneLink === zone)
      link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  document.dispatchEvent(new Event("zone-change"));
  if (changed || sectionHashes.includes(hash)) {
    requestAnimationFrame(() => {
      if (sectionHashes.includes(hash)) {
        if (seasonMatch) {
          document.querySelector('[data-gallery-filter="all"]').click();
          document
            .querySelector(`button[data-season="${seasonMatch[1]}"]`)
            .click();
        }
        if (hash === "story-notes") document.getElementById(hash).open = true;
        const target = document.getElementById(seasonMatch ? "gallery" : hash);
        target?.scrollIntoView({ behavior: "instant" });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
      }
    });
  }
}

function syncRoute() {
  const match = location.hash.match(/^#play=(abyss|arcane|trader)$/);
  if (match) openGame(match[1]);
  else {
    returnToLounge();
    showZone();
  }
}

document.querySelectorAll("[data-details]").forEach((button) => {
  button.addEventListener("click", () =>
    showDetails(button.dataset.details, button),
  );
});
document
  .getElementById("close-details")
  .addEventListener("click", () => details.close());
details.addEventListener("click", (event) => {
  if (event.target !== details) return;
  const rect = details.getBoundingClientRect();
  if (
    event.clientX < rect.left ||
    event.clientX > rect.right ||
    event.clientY < rect.top ||
    event.clientY > rect.bottom
  )
    details.close();
});
playButton.addEventListener("click", () => {
  if (selectedGame) location.hash = `play=${selectedGame}`;
});
document.getElementById("return-lounge").addEventListener("click", () => {
  history.replaceState(
    null,
    "",
    `${location.pathname}${location.search}#games`,
  );
  returnToLounge();
  showZone();
});
window.addEventListener("hashchange", syncRoute);
window.addEventListener("message", (event) => {
  if (location.protocol !== "file:" && event.origin !== location.origin) return;
  if (event.data?.type !== "akane-return") return;
  if (
    ![...frames.values()].some((frame) => frame.contentWindow === event.source)
  )
    return;
  document.getElementById("return-lounge").click();
});
window.addEventListener("pagehide", () =>
  frames.forEach((frame) => setPaused(frame, true)),
);

// 只推薦與標示卡片，不直接啟動遊戲；仍先顯示玩法介紹。
const moodMessages = {
  abyss: "推薦《深境冒險》：從第一層出發，把每次戰鬥都變成成長。",
  arcane: "推薦《星界牌陣》：觀察敵方意圖，組合屬於你的致勝戰術。",
  trader: "推薦《百億炒股人生》：試著做不同選擇，看看人生會走向哪裡。",
};
document.querySelectorAll("[data-mood]").forEach((button) => {
  button.addEventListener("click", () => {
    const id = button.dataset.mood;
    document.querySelectorAll("[data-mood]").forEach((choice) => {
      choice.setAttribute("aria-pressed", String(choice === button));
    });
    document.querySelectorAll(".game-card").forEach((card) => {
      card.classList.toggle(
        "recommended",
        card.classList.contains(`${id}-card`),
      );
    });
    document.getElementById("mood-result").textContent = moodMessages[id];
  });
});
document.getElementById("surprise-game").addEventListener("click", (event) => {
  const ids = Object.keys(games);
  showDetails(ids[Math.floor(Math.random() * ids.length)], event.currentTarget);
});
syncRoute();

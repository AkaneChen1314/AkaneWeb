/*
 * 檔案導讀：閱讀順序：先看 games 設定，再看 showDetails／openGame／returnToLounge，最後看事件綁定。
 * 遊戲卡片的名稱、介紹與操作說明集中在 games；主介面樣式主要看 ui-refresh.css 和 world.css。
 */
/*
 * 黑川茜遊戲館 1.2
 * 此檔負責：心情推薦、遊戲介紹、開啟遊戲、返回與暫停。
 * 遊戲本體在 games/，藍色版面在 styles.css。
 */
"use strict";

// 這裡修改遊戲介紹視窗的內容；遊戲卡片上的文案位於 index.html。
const games = {
  aurora: {
    name: "NEON STRIKE II：極光戰線",
    category: "3D 第一人稱射擊 / 團隊對戰",
    version: "鍵鼠・觸控",
    path: "games/aurora/index.html?v=20261120-r14-newgames",
    cover: "assets/cover-aurora.webp",
    description:
      "霓光突擊的續作。選擇五名幹員之一，帶著各自的武器與技能，在新東京、末日之城、軌道環站與海底研究站四張地圖，挑戰團隊死鬥、據點爭奪、個人亂鬥、生存波次或首領討伐。",
    steps: [
      "在選單依序選擇幹員、地圖、模式與難度，再按部署。第一次建議先玩團隊死鬥、新兵難度。",
      "電腦：WASD 移動、滑鼠瞄準、左鍵射擊、右鍵開鏡；Shift 衝刺、空白鍵跳躍、C 蹲下、R 換彈、1 2 3 或滾輪換槍、Q 技能、H 醫療包、V 近戰，按住 G 預覽手榴彈、放開投擲；按住 Tab 看計分板，Esc 暫停。",
      "手機請橫放：左半邊拖曳移動（推到底衝刺）、右半邊滑動轉視角；右側按鈕射擊、開鏡、跳、蹲、換彈、換槍，下方中間是技能、手榴彈（按住瞄準）與醫療包，左上角暫停。護盾 4 秒沒受傷會自動恢復，醫療包與補給站能幫你撐過交火。",
    ],
    note: "需要支援 WebGL 的瀏覽器；電腦鍵鼠操作最完整，手機建議橫向遊玩。\n返回遊戲館會暫停對戰並靜音，再次進入後按「繼續」。設定與地圖預覽保存在同一瀏覽器；重新整理會結束當局。本遊戲為獨立自製作品。",
  },
  mech: {
    name: "鋼鐵廢墟：機甲戰線",
    category: "第三人稱機甲射擊 / 波次生存",
    version: "鍵鼠・觸控",
    path: "games/mech/index.html?v=20261120-r14-newgames",
    cover: "assets/cover-mech.webp",
    description:
      "在機庫組出你的機甲：五台機體、八種塗裝、主副武器、八種技能與五種小兵自由搭配。闖過一波波敵潮，每波三選一強化，迎戰十隻各有招式的巨型 Boss。",
    steps: [
      "在機庫依步驟選擇模式（戰役、無盡、Boss 連戰）、機體、塗裝、主副武器、三個技能與兩種小兵，最後按「出擊」。拖曳畫面可旋轉機體。",
      "電腦：WASD 移動、滑鼠瞄準；左鍵主武器、右鍵副武器；Shift 推進、空白鍵噴射跳躍；Q E F 技能、1 2 派出小兵、R 換彈，Esc 暫停。",
      "手機請橫放：左半邊拖曳移動（推到底推進）、右半邊滑動轉視角；右側按鈕主武器、副武器、噴射與換彈，直接點下方的技能格與小兵格，左上角暫停。每波結束點選一張強化卡；Boss 出招前有紅色預警。",
    ],
    note: "需要支援 WebGL 的瀏覽器；第一次開啟會從網路載入 3D 引擎。電腦鍵鼠操作最完整，手機建議橫向遊玩。\n返回遊戲館會暫停戰鬥並靜音，再次進入後按「繼續戰鬥」。機庫配置與最佳紀錄保存在同一瀏覽器。背景音樂為 OpenGameArt 的 CC0 曲目。",
  },
  fortune: {
    name: "運氣戰鬥：FORTUNE SIEGE",
    category: "塔防 × 賭場 / Roguelike",
    version: "滑鼠・觸控",
    path: "games/fortune/index.html?v=20261120-r14-newgames",
    cover: "assets/cover-fortune.webp",
    description:
      "賭場、商店與戰場三個區域輪流切換。用金幣在七種賭場小遊戲贏取道具與限定塔，到商店升星與融合元素，再布陣守住 30 波敵人與首領，之後還能挑戰無盡模式。",
    steps: [
      "選擇地圖開始一局。上方分頁（或 Q／W／E）切換賭場、商店與戰場。",
      "在商店買塔；兩座相同的塔可以升星，不同元素可以融合。點選備戰區的塔再點戰場空地，或直接拖曳上去。",
      "按「開始」或空白鍵開打，1／2／3 調整戰鬥速度。敵人掉落的道具袋用滑鼠（或手指）掃過就能撿。",
    ],
    note: "賭場使用遊戲內的虛構金幣，各遊戲旁都公開機率表，不涉及真實金錢。畫面為 16:9 固定比例，手機請橫放。\n返回遊戲館會暫停並靜音；天賦、圖鑑與最佳紀錄保存在同一瀏覽器，重新整理會結束當局。",
  },
  midnight: {
    name: "午夜擂台：MIDNIGHT CIRCUIT",
    category: "即時格鬥 / 單人與本機雙人",
    version: "鍵盤・觸控",
    path: "games/midnight/index.html?v=20261113-r14-games",
    cover: "assets/cover-midnight-art.webp",
    description:
      "四名原創鬥士，在雨夜天台展開對決。選擇單人對電腦、本機雙人、練習或街機挑戰，用連擊、防禦與大招拿下兩回合。",
    steps: [
      "選擇鬥士、對戰模式與難度，再按「開戰」。第一次可以先試練習模式。",
      "鍵盤使用遊戲內「操作說明」的對應按鍵；手機使用戰場下方的移動與招式按鈕，也支援相容手把。",
      "觀察距離與能量，組合輕重攻擊、兩種技能、防禦與閃避；能量蓄滿後使出大招。",
    ],
    note: "返回遊戲館會暫停並靜音；再次進入後按「繼續對戰」。同次開啟網頁保留對戰，重新整理會重開。本機雙人需共用同一台裝置，沒有線上連線。",
  },
  serpent: {
    name: "霓境蛇行：NEON SERPENT",
    category: "生存貪吃蛇 / 隨機進化",
    version: "鍵鼠・觸控",
    path: "games/serpent/index.html?v=20261113-r14-games",
    cover: "assets/cover-serpent-art.webp",
    description:
      "化身四種蛇靈，在三座戰場收集食物、成長與進化。從無傷練習、悠遊秘境到蟲群對戰與首領連戰，選擇自己的冒險節奏。",
    steps: [
      "在大廳選擇蛇靈、模式、難度與世界；第一次建議先玩「八步無傷練習」。",
      "電腦用滑鼠或 WASD／方向鍵轉向，Space／Shift 衝刺、E 使用技能；手機使用左下搖桿及右側衝刺、技能鍵。",
      "靠近敵人自動咬擊，衝刺撞擊或繞圈纏繞；收集食物並選擇進化。隨時按暫停或查看規則。",
    ],
    note: "返回遊戲館會暫停並靜音，重進後手動繼續。研究、晶體與紀錄儲存在同一瀏覽器及網站；本機檔案的舊存檔不會自動搬到網站。重新整理會結束當局，保留已儲存的長期進度。",
  },
  neonstrike: {
    name: "NEON STRIKE：霓光突擊",
    category: "3D 第一人稱射擊 / 戰術任務",
    version: "鍵鼠・觸控",
    path: "games/neonstrike/index.html?v=20261030-r13-touch",
    description:
      "進入暗夜港區與熔火工廠，選擇三名幹員、裝備與難度，挑戰全面肅清、波次攻堅、限時獵殺與首領討伐。利用掩體、補給與技能突破防線。",
    steps: [
      "在作戰準備中依序選擇幹員裝備、地圖、任務與難度，再確認部署。",
      "電腦使用鍵盤與滑鼠：WASD 移動、Shift 衝刺、空白鍵跳躍、左鍵射擊、右鍵瞄準、R 換彈、Q 技能；按住 G 預覽、放開投擲手榴彈。",
      "手機使用左搖桿移動、右側滑動轉向，按住射擊鍵可連射並拖曳瞄準；瞄準／衝刺為點按切換，另有跳躍、換彈與技能。手榴彈按住預覽、放開投擲，也能取消。用暫停選單返回，重進後按「繼續任務」。電腦按 Esc 暫停，或使用右鍵拖曳視角。",
    ],
    note: "需要支援 WebGL 的瀏覽器，可用電腦鍵盤滑鼠或手機觸控。手機直向、橫向與電腦版網站皆提供觸控操作；橫向視野較寬。\n同一次開啟網頁期間保留戰局；重新整理或關閉網頁會重開。返回遊戲館會暫停戰鬥、聲音與 3D 繪製。本遊戲為獨立自製作品。",
  },
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
  starbreak: {
    name: "星夜突圍：STARBREAK",
    category: "即時射擊 / 星艦生存",
    cover: "games/starbreak/assets/starbreak.webp",
    path: "games/starbreak/index.html?v=1.2-r11-touch",
    description:
      "駕駛星艦穿越異星敵潮，武器會自動攻擊。靠走位、衝刺與過載突破包圍，搭配武器進化、研究與模組，迎戰擁有獨立本體血量及防護罩的星域 Boss。",
    steps: [
      "選擇星艦、起始武器與航行方案，再依喜好調整波數、難度與 Boss 規則。",
      "電腦用 WASD 或方向鍵移動、空白鍵衝刺、Q 過載；手機左手拖曳、右手使用技能。手機開啟電腦版網站時，改用戰場下方的加大操作區。",
      "收集晶體並選擇強化，搭配武器進化、遺物與商城補給；避開 Boss 的紅色攻擊預警。",
    ],
    note: "喜歡即時閃避、武器搭配與華麗星艦戰鬥的人可以選這款。\n返回遊戲館會暫停並嘗試保存；再次進入後按「繼續航行」接續。本遊戲為獨立自製作品，與黑川茜無關。",
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

// 只顯示遊戲介紹；玩家按下介紹視窗中的開始按鈕後才會啟動遊戲。
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
// 透過訊息通知 iframe 暫停或繼續，避免返回遊戲館後戰鬥與聲音仍在背景運作。
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

// 同一款遊戲的 iframe 會重用，讓玩家可以返回遊戲館後再接續原局。
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
  document.getElementById("player-version").textContent =
    game.version || "v1.2";
  document.querySelector(".player-hint").textContent =
    id === "neonstrike"
      ? "按暫停或 Esc 可返回遊戲館"
      : id === "aurora" || id === "mech"
        ? "按 Esc 放開滑鼠，就能返回遊戲館"
        : "休息一下，隨時回來";

  frames.forEach((frame, key) => {
    frame.hidden = key !== id;
    setPaused(frame, key !== id);
  });

  let frame = frames.get(id);
  if (!frame) {
    loading.hidden = false;
    frame = document.createElement("iframe");
    frame.title = game.name;
    frame.allow = "fullscreen";
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
  // 在畫面重繪前就回到原本的捲動位置，不會先閃出頁首再跳回去。
  window.scrollTo({
    top: homeScroll,
    behavior: "instant",
  });
  document.dispatchEvent(new Event("lounge-visibility"));
  requestAnimationFrame(() => {
    // 背景影片等內容可能在這一幀改變高度，再對齊一次。
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
// 由網址 # 後的片段選擇專區；保留段落 id 才能讓書籤和瀏覽器上一頁正常運作。
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
    "portrait-room",
    "actor-room",
    "little-facts",
    "traits",
    "story-notes",
    "special-room",
    "outfit-room",
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
  const match = /^#play=([a-z]+)$/.exec(location.hash);
  if (match && Object.hasOwn(games, match[1])) openGame(match[1]);
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

// 切換分頁或從瀏覽器的上一頁回來時，同步外層與遊戲的休息狀態。
function syncGameVisibility() {
  frames.forEach((frame, id) => {
    setPaused(frame, document.hidden || activeGame !== id);
  });
}
document.addEventListener("visibilitychange", syncGameVisibility);
window.addEventListener("pageshow", syncGameVisibility);

// ---------------- 遊戲館互動 ----------------
// 心情篩選：卡片的 data-genre 可以有多個分類（以空白分隔）；只篩選，不直接啟動遊戲。
const moodMessages = {
  all: "十款遊戲都在這裡；選一種心情篩選，或交給命運隨機挑一款。",
  action:
    "想爽快開火：從第一人稱槍戰、機甲火力、星艦突圍到天台格鬥，挑一款熱血一下。",
  brain: "想動動腦：組牌、塔防布陣或人生抉擇，慢慢想出你的最佳解。",
  grow: "想慢慢變強：刷裝備、進化與研究，每一局都比上一局更強。",
  chill: "想輕鬆玩：節奏自由、隨時可停，適合休息時來一局。",
};
const hallCards = [...document.querySelectorAll(".hall-card")];
const hallEmpty = document.querySelector(".hall-empty");

// 卡片一樣大、一排三張（窄螢幕兩張）；最後一排不滿時標上 tail-*，由 games-hall.css 把它們排到中間。
function centerLastRow(visibleCards) {
  hallCards.forEach((card) => card.classList.remove("tail3-one", "tail3-two", "tail2-one"));
  const count = visibleCards.length;
  if (count % 3 === 1) visibleCards[count - 1].classList.add("tail3-one");
  if (count % 3 === 2) visibleCards[count - 2].classList.add("tail3-two");
  if (count % 2 === 1) visibleCards[count - 1].classList.add("tail2-one");
}

function applyHallFilter(filter) {
  const visibleCards = [];
  hallCards.forEach((card) => {
    const genres = (card.dataset.genre || "").split(/\s+/);
    const visible = filter === "all" || genres.includes(filter);
    card.hidden = !visible;
    if (visible) visibleCards.push(card);
  });
  centerLastRow(visibleCards);
  const shown = visibleCards.length;
  if (hallEmpty) hallEmpty.hidden = shown > 0;
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.filter === filter));
  });
  document.getElementById("mood-result").textContent =
    moodMessages[filter] || moodMessages.all;
}

// 各分類的數量由卡片計算，新增或移除遊戲時不必手動改按鈕上的數字。
document.querySelectorAll("[data-count]").forEach((badge) => {
  const key = badge.dataset.count;
  badge.textContent = String(
    hallCards.filter(
      (card) =>
        key === "all" || (card.dataset.genre || "").split(/\s+/).includes(key),
    ).length,
  );
});
document.querySelectorAll("[data-filter]").forEach((button) => {
  button.addEventListener("click", () => applyHallFilter(button.dataset.filter));
});
centerLastRow(hallCards);

// 同一次開啟網頁期間已載入的遊戲，在卡片上標示「遊玩中」。
function markRunningGames() {
  hallCards.forEach((card) => {
    const badge = card.querySelector(".hall-running");
    if (badge) badge.hidden = !frames.has(card.dataset.game);
  });
}
document.addEventListener("lounge-visibility", markRunningGames);

document.getElementById("surprise-game").addEventListener("click", (event) => {
  const ids = Object.keys(games);
  showDetails(ids[Math.floor(Math.random() * ids.length)], event.currentTarget);
});
syncRoute();

/* Pure game simulation. All securities and prices are fictional. No network calls. */
(function (root) {
  "use strict";
  const codec =
    root.pako ||
    (typeof require === "function" ? require("./vendor/pako.js") : null);
  const INITIAL = 10000000000;
  const ASSETS = [
    {
      id: "sky",
      name: "天頂晶圓",
      code: "SKY",
      sector: "半導體",
      kind: "stock",
      icon: "晶",
      price: 1280,
      vol: 0.035,
      note: "<b>「AI 概念股，現在不上車就晚了。」</b> 群組裡的人都這麼說，但沒人提過訂單取消會怎樣。",
    },
    {
      id: "moon",
      name: "月球電動車",
      code: "MOON",
      sector: "電動車",
      kind: "stock",
      icon: "月",
      price: 486,
      vol: 0.055,
      note: "<b>創辦人說要把車開上月球。</b> 目前還沒出貨，但簡報已經做得很漂亮。",
    },
    {
      id: "bank",
      name: "穩穩金融",
      code: "SAFE",
      sector: "金融控股",
      kind: "stock",
      icon: "穩",
      price: 68.5,
      vol: 0.025,
      note: "<b>名字裡有「穩」，不代表本金有保障。</b> 這家虛構銀行把風險藏在你看不到的資產裡。",
    },
    {
      id: "bio",
      name: "長生生技",
      code: "LIFE",
      sector: "生技醫療",
      kind: "stock",
      icon: "生",
      price: 325,
      vol: 0.075,
      note: "<b>據說下週就有重大突破。</b> 臨床試驗失敗時，股價不會等你反應。",
    },
    {
      id: "coin",
      name: "宇宙幣",
      code: "COSM",
      sector: "加密貨幣",
      kind: "risk",
      icon: "₿",
      price: 96800,
      vol: 0.11,
      note: "<b>24 小時交易，24 小時都能焦慮。</b> 在這個虛構市場，平台斷線與流動性消失會一起來。",
    },
    {
      id: "future",
      name: "末日指數期貨",
      code: "DOOM",
      sector: "指數期貨",
      kind: "risk",
      icon: "期",
      price: 22680,
      vol: 0.06,
      note: "<b>想用很少的錢，控制很大的部位？</b> 本遊戲把期貨簡化成保證金交易；百倍槓桿下，1% 就足以讓本金歸零。",
    },
    {
      id: "nft",
      name: "尊爵猿頭像",
      code: "APE",
      sector: "虛擬收藏",
      kind: "risk",
      icon: "猿",
      price: 5400,
      vol: 0.14,
      note: "<b>限量、尊爵、社群認同。</b> 最後一個接手的人，可能就是你。這裡的頭像也只是虛構交易商品。",
    },
    {
      id: "bond",
      name: "保本高息債",
      code: "YIELD",
      sector: "高收益債",
      kind: "risk",
      icon: "債",
      price: 100,
      vol: 0.018,
      note: "<b>「保本」是這個虛構商品的名字。</b> 發行人違約時，漂亮的宣傳不會替你付錢。",
    },
  ];
  ASSETS.push(
    {
      id: "robot",
      name: "機械管家聯盟",
      code: "BOT",
      sector: "機器人",
      kind: "stock",
      price: 268,
      vol: 0.055,
      emoji: "🤖",
      note: "<b>虛構機器人。</b> 每家都要一台機器人，問題是沒人願意付尾款。",
    },
    {
      id: "cloud",
      name: "雲端泡泡",
      code: "CLOUD",
      sector: "雲端科技",
      kind: "stock",
      price: 410,
      vol: 0.045,
      emoji: "☁️",
      note: "<b>虛構雲端科技。</b> 訂閱收入漂亮，伺服器帳單更漂亮。",
    },
    {
      id: "ship",
      name: "大航海運",
      code: "SHIP",
      sector: "航運",
      kind: "stock",
      price: 112,
      vol: 0.06,
      emoji: "🚢",
      note: "<b>虛構航運。</b> 運價上天之後，船也可能載著你的本金一起沉。",
    },
    {
      id: "food",
      name: "吃飽食品",
      code: "FOOD",
      sector: "民生消費",
      kind: "stock",
      price: 56,
      vol: 0.028,
      emoji: "🍜",
      note: "<b>虛構民生消費。</b> 每個人都要吃飯，公司卻不一定能賺錢。",
    },
    {
      id: "solar",
      name: "不落日能源",
      code: "SUN",
      sector: "綠能",
      kind: "stock",
      price: 185,
      vol: 0.062,
      emoji: "☀️",
      note: "<b>虛構綠能。</b> 補助還沒下來，老闆先把跑車牽走了。",
    },
    {
      id: "estate",
      name: "雲上房產",
      code: "HOME",
      sector: "房地產",
      kind: "stock",
      price: 88,
      vol: 0.045,
      emoji: "🏙️",
      note: "<b>虛構房地產。</b> 房子蓋在簡報裡，貸款卻是真的在遊戲裡扣。",
    },
    {
      id: "game",
      name: "課金宇宙",
      code: "GAME",
      sector: "遊戲娛樂",
      kind: "stock",
      price: 302,
      vol: 0.08,
      emoji: "🎮",
      note: "<b>虛構遊戲娛樂。</b> 玩家抽不到角色，你抽不到財富自由。",
    },
    {
      id: "cafe",
      name: "咖啡王朝",
      code: "CAFE",
      sector: "餐飲連鎖",
      kind: "stock",
      price: 140,
      vol: 0.035,
      emoji: "☕",
      note: "<b>虛構餐飲連鎖。</b> 開一千家店很容易，關一千家也很快。",
    },
    {
      id: "gold",
      name: "末日黃金",
      code: "GOLD",
      sector: "黃金契約",
      kind: "risk",
      price: 2350,
      vol: 0.045,
      emoji: "🥇",
      note: "<b>虛構黃金契約。</b> 避險的名字，擋不住虛構平台的清算。",
    },
    {
      id: "oil",
      name: "黑金原油",
      code: "OIL",
      sector: "能源期貨",
      kind: "risk",
      price: 79,
      vol: 0.085,
      emoji: "🛢️",
      note: "<b>虛構能源期貨。</b> 劇情庫存爆滿，價格先把你的心態抽乾。",
    },
    {
      id: "forex",
      name: "閃電外匯",
      code: "FX",
      sector: "外匯合約",
      kind: "risk",
      price: 32,
      vol: 0.05,
      emoji: "💱",
      note: "<b>虛構外匯合約。</b> 看起來只差幾分錢，放大後就差一整個人生。",
    },
    {
      id: "meme",
      name: "狗皇迷因幣",
      code: "DOG",
      sector: "迷因幣",
      kind: "risk",
      price: 0.36,
      vol: 0.19,
      emoji: "🐕",
      note: "<b>虛構迷因幣。</b> 群組說要登月，最後只剩月光族。",
    },
    {
      id: "weather",
      name: "暴雨天氣券",
      code: "RAIN",
      sector: "天氣賭約",
      kind: "risk",
      price: 50,
      vol: 0.12,
      emoji: "🌧️",
      note: "<b>虛構天氣賭約。</b> 你猜的是暴雨，來的是帳戶的暴風雨。",
    },
    {
      id: "carbon",
      name: "碳權黑洞",
      code: "CO2",
      sector: "碳權合約",
      kind: "risk",
      price: 96,
      vol: 0.075,
      emoji: "🌿",
      note: "<b>虛構碳權合約。</b> 綠色概念，紅色損益。",
    },
    {
      id: "space",
      name: "火星地契",
      code: "MARS",
      sector: "太空地產",
      kind: "risk",
      price: 888,
      vol: 0.17,
      emoji: "🛸",
      note: "<b>虛構太空地產。</b> 你買的地目前唯一的居民，是你的幻想。",
    },
    {
      id: "ai",
      name: "AI 預言合約",
      code: "ORCL",
      sector: "演算法合約",
      kind: "risk",
      price: 666,
      vol: 0.13,
      emoji: "🔮",
      note: "<b>虛構演算法合約。</b> 模型說勝率很高，並沒有說是哪一邊的勝率。",
    },
  );
  const ACHIEVEMENTS = [
    { id: "first", name: "第一次買進", description: "把第一筆錢放進股票。" },
    { id: "leverage", name: "百倍勇氣", description: "使用 100 倍槓桿。" },
    {
      id: "allin",
      name: "梭哈人生",
      description: "單筆投入超過可用現金的 90%。",
    },
    { id: "liquidated", name: "一鍵歸零", description: "第一次被強制平倉。" },
    { id: "loan", name: "未來的錢", description: "為了翻本而借款。" },
    { id: "half", name: "腰斬紀念", description: "身家跌破 50 億。" },
    { id: "option", name: "時間的敵人", description: "買入一份三日選擇權。" },
    { id: "mystery", name: "相信朋友", description: "買一次神秘未上市股。" },
    { id: "negative", name: "負翁人生", description: "淨值跌到零以下。" },
    { id: "end", name: "離開牌桌", description: "完成破產結局。" },
  ];
  const EVENTS = {
    4: {
      title: "內線群組向你招手",
      tag: "FOMO / 害怕錯過",
      body: "匿名老師展示了一張漂亮的獲利截圖：「只有最後 20 個名額。」截圖是真的，還是剛用軟體做的？",
      choices: [
        {
          label: "買 VIP 消息",
          detail: "支付 0.5 億，得到一條未經證實的提示。",
          action: "vip",
        },
        {
          label: "不付錢，繼續觀察",
          detail: "守住這筆費用，市場仍會往下走。",
          action: "ignore",
        },
      ],
    },
    8: {
      title: "帳面獲利不是落袋",
      tag: "PAPER PROFITS / 紙上富貴",
      body: "剛開香檳，公司突然宣布財報需要「重新確認」。平台保證明天恢復正常。",
      choices: [
        {
          label: "相信平台",
          detail: "繼續持有，承擔隔日風險。",
          action: "ignore",
        },
        {
          label: "先收回一半部位",
          detail: "依目前報價平倉一半，扣除平倉費。",
          action: "halfclose",
        },
      ],
    },
    12: {
      title: "有人保證能救你的帳戶",
      tag: "RECOVERY SCAM / 翻本陷阱",
      body: "「你的方法沒問題，只是本金太少。」一個自稱救援專家的人，提議收費代操。",
      choices: [
        {
          label: "付 1 億讓專家處理",
          detail: "這裡的專家會收走費用，然後失聯。",
          action: "rescue",
        },
        {
          label: "拒絕，自己面對損失",
          detail: "拒絕付費，但無法讓已經虧掉的錢回來。",
          action: "ignore",
        },
      ],
    },
    18: {
      title: "全球交易系統故障",
      tag: "SYSTEM FAILURE / 流動性風險",
      body: "你想按賣出，系統卻只顯示「請稍候」。恢復交易後的價格，已經和你原本看到的不一樣。",
      choices: [
        {
          label: "接受 15% 滑價，全部出場",
          detail: "所有部位以折價結算，再扣平倉費。",
          action: "slipclose",
        },
        {
          label: "等待修復，繼續持有",
          detail: "保留部位，下一交易日繼續承擔風險。",
          action: "ignore",
        },
      ],
    },
    24: {
      title: "豪宅與跑車也有帳單",
      tag: "LIFESTYLE CREEP / 固定開銷",
      body: "管理費、車貸、保險、稅款一起來了。你還記得，這些曾經只是帳戶裡的一點零頭。",
      choices: [
        {
          label: "付 2 億，繼續維持排場",
          detail: "立刻扣款；現金不足的部分變成債務。",
          action: "luxury",
        },
        {
          label: "變賣收藏、搬小一點",
          detail: "回收 0.2 億，後續生活費降低 35%。",
          action: "downsize",
        },
      ],
    },
    28: {
      title: "託管銀行宣布資金減記",
      tag: "COUNTERPARTY / 對手方違約",
      body: "虛構銀行用你的存款填補窟窿。即使你一直沒有下單，也躲不過這場刻意安排的劇情。",
      choices: [
        {
          label: "接受 65% 現金損失",
          detail: "保留 35% 現金，繼續交易。",
          action: "haircut",
        },
        {
          label: "花 0.5 億提告",
          detail: "仍減記 65%，訴訟無法在遊戲內收回款項。",
          action: "lawsuit",
        },
      ],
    },
    34: {
      title: "欠款通知，不是行情通知",
      tag: "DEBT SPIRAL / 債務循環",
      body: "翻本的每一天，利息都在工作。債主不在乎你下一筆是不是一定賺。",
      choices: [
        {
          label: "用現金償還 30% 債務",
          detail: "最多使用現金的一半，減少之後利息。",
          action: "repay",
        },
        {
          label: "先不還，留錢繼續拚",
          detail: "本金與每日 2% 劇情利息繼續累積。",
          action: "ignore",
        },
      ],
    },
    41: {
      title: "交易所被查封",
      tag: "EXCHANGE COLLAPSE / 平台倒閉",
      body: "「資產都很安全」的公告發出後，客服也下線了。帳戶現金將再損失 90%。",
      choices: [
        {
          label: "接受剩餘款項",
          detail: "現金只剩 10%；所有持倉被折價清算。",
          action: "exchange",
        },
        {
          label: "再付 0.1 億給資產追回師",
          detail: "多付一筆費用，追回結果仍相同。",
          action: "recover",
        },
      ],
    },
    48: {
      title: "朋友傳來了工作機會",
      tag: "REAL LIFE / 離開螢幕",
      body: "他沒有問你剩多少錢，只問你今天有沒有吃飯。不是每一份價值，都要在報價上找到。",
      choices: [
        {
          label: "接受工作，拿回生活節奏",
          detail: "拿到 0.05 億預支薪資；生活費降至原來 15%。",
          action: "work",
        },
        {
          label: "再盯一次盤",
          detail: "沒有收入，也沒有改善生活費。",
          action: "ignore",
        },
      ],
    },
    55: {
      title: "最後一個「必勝」機會",
      tag: "LAST BET / 最後誘惑",
      body: "「最後一把，真的。」這句話你已經對自己說過很多次。這場遊戲的終點從來不是財富自由。",
      choices: [
        {
          label: "先把 0.01 億還給債主",
          detail: "減少一點債務，面對已經發生的事。",
          action: "smallrepay",
        },
        {
          label: "留著本金，繼續交易",
          detail: "交易仍開放，但第 60 日會進入終局清算。",
          action: "ignore",
        },
      ],
    },
  };
  const LOAN_TYPES = {
    bank: {
      name: "銀行借款",
      rate: 0.02,
      fee: 0.03,
      days: 10,
      cap: 20e8,
      stress: 1,
      color: "blue",
    },
    online: {
      name: "秒速網貸",
      rate: 0.04,
      fee: 0.08,
      days: 5,
      cap: 8e8,
      stress: 3,
      color: "purple",
    },
    shark: {
      name: "地下高利貸",
      rate: 0.1,
      fee: 0.15,
      days: 3,
      cap: 30e8,
      stress: 6,
      color: "red",
    },
  };
  const ORGANS = [
    {
      id: "kidney_left",
      name: "左腎",
      icon: "🫘",
      price: 2.5e8,
      damage: 19,
      cap: 81,
      note: "腎臟共有兩顆。失去左腎：健康上限 81；雙腎都失去，上限降到 22。",
    },
    {
      id: "kidney_right",
      name: "右腎",
      icon: "🫘",
      price: 2.5e8,
      damage: 19,
      cap: 81,
      note: "右腎獨立記錄。雙腎都失去後，每日額外耗損健康 3。",
    },
    {
      id: "cornea_left",
      name: "左眼角膜",
      icon: "👁️",
      price: 1.5e8,
      damage: 12,
      cap: 88,
      note: "行情畫面開始模糊；失去兩側時模糊與暗角更強。按鈕與文字提示仍可讀。",
    },
    {
      id: "cornea_right",
      name: "右眼角膜",
      icon: "👁️",
      price: 1.5e8,
      damage: 12,
      cap: 88,
      note: "與左側分開記錄。視野輔助可暫時看清行情，不會恢復身體部件。",
    },
    {
      id: "liver",
      name: "肝臟碎片",
      icon: "🧩",
      price: 4e8,
      damage: 25,
      cap: 60,
      note: "健康上限降到 60；每日額外耗損健康 1.2。",
    },
    {
      id: "lung",
      name: "左肺",
      icon: "🫁",
      price: 3e8,
      damage: 22,
      cap: 65,
      note: "健康上限降到 65；每次打工多耗損健康 2，休息恢復變少。",
    },
    {
      id: "marrow",
      name: "骨髓部件",
      icon: "🦴",
      price: 2e8,
      damage: 16,
      cap: 76,
      note: "健康上限降到 76；休息恢復變少。",
    },
    {
      id: "skin",
      name: "皮膚部件",
      icon: "🩹",
      price: 0.8e8,
      damage: 10,
      cap: 90,
      note: "健康上限降到 90；每日額外耗損健康 0.5。",
    },
    {
      id: "lung_right",
      name: "右肺",
      icon: "🫁",
      price: 3e8,
      damage: 22,
      cap: 65,
      note: "左右肺各自記錄。雙肺都失去會直接走到死亡結局。",
    },
    {
      id: "liver_whole",
      name: "剩餘肝臟",
      icon: "🧩",
      price: 5e8,
      damage: 45,
      cap: 20,
      note: "失去全部肝臟會直接觸發死亡；不能再重複賣肝臟碎片。",
    },
    {
      id: "spleen",
      name: "脾臟部件",
      icon: "🔴",
      price: 1.8e8,
      damage: 14,
      cap: 74,
      note: "永久健康上限 74，休息恢復量減少。",
    },
    {
      id: "pancreas",
      name: "胰臟部件",
      icon: "🟠",
      price: 2.2e8,
      damage: 18,
      cap: 62,
      note: "永久健康上限 62，每日額外耗損健康 1。",
    },
    {
      id: "stomach",
      name: "胃部部件",
      icon: "🥣",
      price: 1.6e8,
      damage: 15,
      cap: 68,
      note: "永久健康上限 68，每次打工多耗損健康 1。",
    },
    {
      id: "core",
      name: "生存核心",
      icon: "💔",
      price: 8e8,
      damage: 120,
      cap: 0,
      note: "最後的荒誕抵押。簽下去會直接觸發死亡結局。",
    },
  ];
  ORGANS.push(
    {
      id: "gallbladder",
      name: "膽囊部件",
      icon: "🟢",
      price: 1.1e8,
      damage: 12,
      cap: 80,
      note: "虛構交換：永久健康上限 80，健康立即 −12。",
    },
    {
      id: "intestine",
      name: "腸道部件",
      icon: "〰️",
      price: 1.4e8,
      damage: 16,
      cap: 66,
      note: "虛構交換：永久健康上限 66，健康立即 −16。",
    },
    {
      id: "thyroid",
      name: "甲狀腺部件",
      icon: "🦋",
      price: 0.9e8,
      damage: 13,
      cap: 77,
      note: "虛構交換：永久健康上限 77，健康立即 −13。",
    },
    {
      id: "bone",
      name: "骨骼部件",
      icon: "🦴",
      price: 1.2e8,
      damage: 15,
      cap: 72,
      note: "虛構交換：永久健康上限 72，健康立即 −15。",
    },
  );
  const JOBS = [
    {
      id: "cashier",
      name: "便利商店收銀",
      icon: "🏪",
      pay: 3000000,
      damage: 1,
      rounds: 5,
      description: "看帳單與客人付款，選出正確找零。",
    },
    {
      id: "warehouse",
      name: "午夜包裹分揀",
      icon: "📦",
      pay: 4200000,
      damage: 2,
      rounds: 7,
      description: "讀包裹目的地，把它送到相同名稱的出口。",
    },
    {
      id: "cafe",
      name: "咖啡店出單",
      icon: "☕",
      pay: 3600000,
      damage: 1.5,
      rounds: 6,
      description: "照客人訂單，依序選杯型、飲品、溫度。",
    },
  ];
  EVENTS[10] = {
    title: "翻本寶箱來了",
    tag: "翻本誘惑",
    body: "直播主拍著胸口：「一半的人中獎，不玩就是你膽小。」這是遊戲裡的虛構賭箱，花 0.5 億，可能拿回 0.8 億，也可能完全沒有。",
    choices: [
      {
        label: "開一箱試運氣",
        detail: "50% 拿回 0.8 億，50% 全部損失。",
        action: "box",
      },
      { label: "把直播關掉", detail: "不花錢，壓力 −5。", action: "calm" },
    ],
  };
  EVENTS[16] = {
    title: "失眠到凌晨四點",
    tag: "健康警訊",
    body: "你睜眼看手機，閉眼也看見那條紅線。帳戶可以加碼，睡眠不能。",
    choices: [
      {
        label: "請一天假，把覺睡回來",
        detail: "健康 +18、壓力 −22，支付 0.02 億；行情仍在走。",
        action: "sleep",
      },
      {
        label: "灌咖啡，再看一晚",
        detail: "健康 −12、壓力 +15。這不是翻本捷徑。",
        action: "overwork",
      },
    ],
  };
  EVENTS[22] = {
    title: "房門外有一張催款單",
    tag: "生活崩壞",
    body: "群組還在談財富自由，你已經連門鈴都不敢開。債務和生活都沒有暫停鍵。",
    choices: [
      {
        label: "找朋友聊聊、縮減開銷",
        detail: "壓力 −12，後續生活費再降低 20%。",
        action: "friend",
      },
      { label: "假裝沒看見", detail: "壓力 +14、健康 −6。", action: "deny" },
    ],
  };
  EVENTS[38] = {
    title: "身體比帳戶先出警告",
    tag: "最後防線",
    body: "你把所有提醒都當成雜訊。但這一次，跳出來的不是股票價格，是身體狀態。",
    choices: [
      {
        label: "花 0.1 億休養",
        detail: "健康 +22、壓力 −25，不會恢復已失去的部件。",
        action: "recoverhealth",
      },
      {
        label: "等翻本再說",
        detail: "健康 −18、壓力 +20。",
        action: "overworkhard",
      },
    ],
  };
  ACHIEVEMENTS.push(
    { id: "health", name: "身體也有帳戶", description: "健康跌破 40。" },
    { id: "online", name: "三秒入帳", description: "使用一次網貸。" },
    { id: "shark", name: "借條比命長", description: "簽下一筆地下高利貸。" },
    { id: "organ", name: "不只輸掉錢", description: "失去一個虛構身體部件。" },
    { id: "glitch", name: "404：財富找不到", description: "遇到假斷線反轉。" },
    { id: "rest", name: "今天不盯盤", description: "休息一天。" },
    { id: "death", name: "最後一個通知", description: "走到死亡結局。" },
  );
  function random(s) {
    let t = (s.rng += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    s.rng = s.rng >>> 0;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function log(s, text, type = "info") {
    s.logs.unshift({ day: s.day, text, type });
  }
  function news(s, text, tag = "今日消息") {
    s.news.unshift({ day: s.day, text, tag });
    s.news = s.news.slice(0, 20);
  }
  function unlock(s, id) {
    if (!s.achievements.includes(id)) s.achievements.push(id);
  }
  function create(seed = Date.now() >>> 0, practice = false) {
    const s = {
      version: 5,
      playerName: "百億新手",
      named: false,
      fictionId:
        "SIM-" + (seed >>> 0).toString(16).padStart(8, "0").toUpperCase(),
      reputation: 100,
      social: [],
      lastSupportDay: 0,
      collectionCount: 0,
      seizedCount: 0,
      contracts: [],
      gamble: null,
      lastGamble: null,
      gambleStats: { rounds: 0, net: 0 },
      casinoDay: 0,
      casinoToday: 0,
      minute: 0,
      equityTape: [{ day: 1, minute: 0, price: INITIAL }],
      job: null,
      jobsDone: 0,
      workIncome: 0,
      rng: seed,
      day: 1,
      cash: INITIAL,
      debt: 0,
      positions: [],
      markets: {},
      logs: [],
      news: [],
      history: [INITIAL],
      daily: 0,
      fees: 0,
      liquidations: 0,
      trades: 0,
      peak: INITIAL,
      achievements: [],
      ended: false,
      pending: null,
      nextId: 1,
      expenseFactor: 1,
      mysteryCount: 0,
      lastMysteryDay: 0,
      totalLiving: 0,
      totalInterest: 0,
      health: 100,
      healthCap: 100,
      stress: 8,
      organs: [],
      organRecords: [],
      loans: [],
      nextLoanId: 1,
      lastWorkDay: 0,
      nextGlitchDay: 6,
      glitches: 0,
      practice,
      endType: null,
    };
    for (const a of ASSETS) {
      let p = a.price * 0.79,
        bars = [];
      for (let i = 0; i < 32; i++) {
        const o = p;
        p = Math.max(0.01, o * (1 + 0.009 + (random(s) - 0.5) * a.vol * 0.8));
        bars.push({
          open: o,
          close: p,
          high: Math.max(o, p) * (1 + random(s) * 0.015),
          low: Math.min(o, p) * (1 - random(s) * 0.015),
          volume: 0.3 + random(s) * 0.7,
          day: i - 31,
        });
      }
      const ratio = a.price / p;
      for (const b of bars)
        for (const k of ["open", "close", "high", "low"]) b[k] *= ratio;
      bars.push({
        day: 1,
        open: a.price,
        close: a.price,
        high: a.price,
        low: a.price,
        volume: 0,
      });
      s.markets[a.id] = {
        price: a.price,
        change: 0,
        bars,
        series: [{ day: 1, minute: 0, price: a.price }],
      };
    }
    news(s, "你繼承了 100 億。群組裡所有人都說：這次一定會賺。", "開場");
    log(
      s,
      practice
        ? "練習帳戶：正式百億資金完全不受影響。"
        : "百億已到帳。你的人生，現在開盤。",
    );
    return s;
  }
  function value(s, p, price = s.markets[p.asset].price) {
    return Math.max(
      0,
      p.margin * (1 + p.leverage * p.sign * (price / p.entry - 1)) - p.funding,
    );
  }
  function equity(s) {
    return s.cash + positionTotal(s) - s.debt;
  }
  function positionTotal(s) {
    return s.positions.reduce((n, p) => n + value(s, p), 0);
  }
  function spend(s, amount) {
    if (amount <= s.cash) s.cash -= amount;
    else {
      s.debt += amount - s.cash;
      s.cash = 0;
    }
    if (s.cash < 0.001) s.cash = 0;
  }
  function health(s, amount, stress = 0) {
    s.health = Math.max(0, Math.min(s.healthCap, s.health + amount));
    s.stress = Math.max(0, Math.min(100, s.stress + stress));
    if (s.health < 40) unlock(s, "health");
  }
  function update(s) {
    const e = equity(s);
    s.peak = Math.max(s.peak, e);
    if (e < INITIAL * 0.5) unlock(s, "half");
    if (e < 0) unlock(s, "negative");
  }
  function track(s, before) {
    update(s);
    s.daily += equity(s) - before;
    s.history[s.history.length - 1] = equity(s);
    record(s.equityTape, s, equity(s));
  }
  function record(list, s, price) {
    const last = list[list.length - 1];
    if (last && last.day === s.day && last.minute === s.minute)
      last.price = price;
    else list.push({ day: s.day, minute: s.minute, price });
  }
  function orderFee(amount, leverage, product) {
    return amount * leverage * (product === "spot" ? 0.0015 : 0.0008);
  }
  function ready(s) {
    return !s.ended && !s.pending && !s.job && !s.gamble;
  }
  function open(
    s,
    { asset, amount, leverage = 1, product = "spot", direction = "long" },
  ) {
    if (!ready(s)) return { ok: false, message: "請先處理跳出的劇情。" };
    const a = ASSETS.find((x) => x.id === asset);
    if (
      !a ||
      !["spot", "margin", "option"].includes(product) ||
      !["long", "short"].includes(direction) ||
      !Number.isFinite(amount) ||
      amount < 10000 ||
      ![1, 2, 5, 10, 25, 50, 100].includes(leverage)
    )
      return { ok: false, message: "請輸入至少 0.0001 億的有效金額。" };
    if (product === "spot") {
      leverage = 1;
      if (direction === "short")
        return {
          ok: false,
          message: "普通買股只能猜會漲；猜跌請切換放大模式。",
        };
    }
    const before = equity(s),
      fee = orderFee(amount, leverage, product);
    if (amount + fee > s.cash + 0.00001)
      return { ok: false, message: "錢不夠：投入金額還要加一點平台費。" };
    if (s.positions.length >= 24)
      return { ok: false, message: "你已經買了 24 筆，先賣掉一些吧。" };
    if (amount >= s.cash * 0.9) unlock(s, "allin");
    s.cash = Math.max(0, s.cash - amount - fee);
    s.fees += fee;
    s.trades++;
    s.positions.push({
      id: s.nextId++,
      asset,
      margin: amount,
      leverage,
      product,
      sign: direction === "long" ? 1 : -1,
      entry: s.markets[asset].price,
      funding: 0,
      day: s.day,
      expiry: product === "option" ? s.day + 3 : null,
    });
    unlock(s, "first");
    if (leverage === 100) unlock(s, "leverage");
    if (product === "option") unlock(s, "option");
    log(
      s,
      `買了${a.name}：猜${direction === "long" ? "漲" : "跌"}，${leverage} 倍，投入 ${(amount / 1e8).toFixed(3)} 億。`,
      "trade",
    );
    track(s, before);
    return { ok: true, message: "買好了！盤中價格持續變動，你隨時可以賣掉。" };
  }
  function close(s, id, multiplier = 1, internal = false) {
    if (!internal && !ready(s))
      return { ok: false, message: "先處理劇情，再拿回錢。" };
    const index = s.positions.findIndex((x) => x.id === id);
    if (index < 0) return { ok: false, message: "這筆已經不在了。" };
    const before = equity(s),
      p = s.positions[index],
      v = value(s, p) * multiplier,
      fee = Math.min(
        v,
        p.margin * p.leverage * (p.product === "spot" ? 0.0015 : 0.0008),
      );
    s.cash += v - fee;
    s.fees += fee;
    s.positions.splice(index, 1);
    log(
      s,
      `${ASSETS.find((x) => x.id === p.asset).name} 已賣掉，拿回 ${((v - fee) / 1e8).toFixed(3)} 億。`,
      "trade",
    );
    if (!internal) track(s, before);
    return { ok: true, message: "已賣掉，剩下的錢回到口袋。" };
  }
  function closeAll(s, multiplier = 1, internal = false) {
    if (!internal && !ready(s)) return { ok: false, message: "請先處理劇情。" };
    const before = equity(s),
      ids = s.positions.map((p) => p.id);
    for (const id of ids) close(s, id, multiplier, true);
    if (!internal) track(s, before);
    return {
      ok: true,
      message: ids.length ? "全部賣掉了。" : "還沒有買任何東西。",
    };
  }
  function loanLimit(s, type = "bank") {
    if (s.loans.length >= 16) return 0;
    const t = LOAN_TYPES[type];
    if (!t) return 0;
    const owed = s.loans
      .filter((l) => l.type === type)
      .reduce((n, l) => n + l.balance, 0);
    return Math.max(
      0,
      Math.min(
        t.cap - owed,
        Math.max(0, equity(s)) *
          (type === "bank" ? 0.3 : type === "online" ? 0.4 : 0.6) +
          (type === "shark" ? 5e8 : 5e7),
      ),
    );
  }
  // 初始借款表單與實際入帳共用同一套檢查，不會提前修改遊戲狀態。
  function validateBorrow(s, amount, type = "bank", internal = false) {
    if (!internal && !ready(s)) return { ok: false, message: "請先處理劇情。" };
    if (!LOAN_TYPES[type]) return { ok: false, message: "請選擇借款類型。" };
    if (s.loans.length >= 16)
      return { ok: false, message: "最多同時 16 張借條，先還一張。" };
    if (!Number.isFinite(amount) || amount < 10000)
      return { ok: false, message: "請輸入有效金額，至少 0.0001 億（1 萬）。" };
    const limit = loanLimit(s, type);
    if (amount > limit + 0.01)
      return { ok: false, limit, message: "超過目前借款上限，請調低金額。" };
    return { ok: true, limit };
  }
  function borrow(
    s,
    amount,
    type = "bank",
    internal = false,
    agreement = null,
  ) {
    const validation = validateBorrow(s, amount, type, internal);
    if (!validation.ok) return validation;
    const t = LOAN_TYPES[type];
    if (
      !internal &&
      type !== "bank" &&
      (!agreement ||
        agreement.id !== s.fictionId ||
        agreement.signedName !== s.playerName ||
        agreement.contacts !== true)
    )
      return { ok: false, message: "先完成虛構證件與合約簽署。" };
    const before = equity(s),
      fee = amount * t.fee;
    s.cash += amount - fee;
    s.debt += amount;
    s.fees += fee;
    s.loans.push({
      id: s.nextLoanId++,
      type,
      balance: amount,
      due: s.day + t.days,
      extensions: 0,
      stage: 0,
      rate: t.rate,
      seized: 0,
    });
    if (type !== "bank")
      s.contracts.push({
        loanId: s.nextLoanId - 1,
        type,
        day: s.day,
        fictionId: s.fictionId,
        signedName: s.playerName,
      });
    health(s, 0, type === "shark" ? 12 : type === "online" ? 6 : 2);
    unlock(s, "loan");
    if (type !== "bank") unlock(s, type);
    log(
      s,
      `${t.name}借入 ${(amount / 1e8).toFixed(2)} 億，先扣 ${t.fee * 100}% 費用，${t.days} 日後催收。`,
      "danger",
    );
    if (!internal) track(s, before);
    return { ok: true, message: "現金變多了，欠款也變多了。記住到期日。" };
  }
  function interest(s) {
    const loanTotal = s.loans.reduce((n, l) => n + l.balance, 0);
    return (
      Math.max(0, s.debt - loanTotal) * 0.02 +
      s.loans.reduce((n, l) => n + l.balance * loanRate(l), 0)
    );
  }
  function repay(s, amount, id = null) {
    if (!Number.isFinite(amount) || amount <= 0) return 0;
    let target = id ? s.loans.find((l) => l.id === id) : null;
    if (id && !target) return 0;
    const paid = Math.min(
      s.cash,
      s.debt,
      target ? target.balance : Infinity,
      amount,
    );
    s.cash -= paid;
    s.debt -= paid;
    let left = paid;
    for (const l of target
      ? [target]
      : [...s.loans].sort((a, b) => a.due - b.due)) {
      const part = Math.min(l.balance, left);
      l.balance -= part;
      left -= part;
      if (left <= 0) break;
    }
    s.loans = s.loans.filter((l) => l.balance > 0.001);
    log(s, `還回 ${(paid / 1e8).toFixed(3)} 億債務。`);
    return paid;
  }
  function payDebt(s, amount) {
    if (!ready(s)) return { ok: false, message: "先處理催收畫面。" };
    const before = equity(s),
      paid = repay(s, amount);
    track(s, before);
    return {
      ok: paid > 0,
      message:
        paid > 0 ? "還款成功，後續利息變少了。" : "沒有欠款，或沒有足夠現金。",
    };
  }
  function sellOrgan(s, id, internal = false, forced = false) {
    if (s.ended || (!internal && (s.pending || s.job || s.gamble)))
      return { ok: false, message: "請先處理目前劇情。" };
    const o = ORGANS.find((x) => x.id === id);
    if (!o || !organAvailable(s, o))
      return { ok: false, message: "這個身體部件已經失去了。" };
    const before = equity(s);
    s.organs.push(id);
    s.organRecords.push({
      id,
      day: s.day,
      minute: s.minute,
      cause: forced ? "seized" : "sold",
      cash: forced ? 0 : o.price,
      damage: o.damage,
      healthBefore: s.health,
      cap: Math.min(s.healthCap, o.cap),
    });
    if (!forced) s.cash += o.price;
    s.healthCap = Math.min(s.healthCap, o.cap);
    if (s.organs.includes("kidney_left") && s.organs.includes("kidney_right"))
      s.healthCap = Math.min(s.healthCap, 22);
    health(s, -o.damage, 22);
    if (
      id === "liver_whole" ||
      (s.organs.includes("lung") && s.organs.includes("lung_right"))
    )
      health(s, -120, 0);
    s.organRecords.at(-1).healthAfter = s.health;
    s.organRecords.at(-1).cap = s.healthCap;
    unlock(s, "organ");
    log(
      s,
      forced
        ? `虛構催收侵害：${o.name}被拿走，沒有現金入帳，健康上限 ${s.healthCap}。`
        : `簽下虛構黑市合約：失去${o.name}，換取 ${(o.price / 1e8).toFixed(1)} 億，健康上限 ${s.healthCap}。`,
      "danger",
    );
    if (!internal) {
      track(s, before);
      checkEnd(s);
    }
    return {
      ok: true,
      message: `拿到錢，失去${o.name}。這筆代價無法休息恢復。`,
      ended: s.ended,
    };
  }
  function mystery(s) {
    if (!ready(s)) return { ok: false, message: "先處理劇情。" };
    if (s.cash < 1e8)
      return { ok: false, message: "神秘股票要 1 億；現在不夠。" };
    if (s.lastMysteryDay === s.day)
      return { ok: false, message: "今天抽過了，明天再來。" };
    const before = equity(s);
    s.cash -= 1e8;
    s.mysteryCount++;
    s.lastMysteryDay = s.day;
    unlock(s, "mystery");
    const win = s.day < 10 && random(s) < 0.35,
      payout = win ? 1.8e8 : s.day < 25 ? 1e8 * (0.05 + random(s) * 0.2) : 0;
    s.cash += payout;
    s.trades++;
    log(
      s,
      win
        ? "朋友的神秘股票這次真的賺了 0.8 億。"
        : "朋友說的十倍沒來；拿回 " + (payout / 1e8).toFixed(3) + " 億。",
      "mystery",
    );
    track(s, before);
    checkEnd(s);
    return {
      ok: true,
      message: win
        ? "抽到 0.8 億獲利！你開始相信朋友了。"
        : "上市延期。這次你又成了接盤的人。",
    };
  }
  function shuffle(s, list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random(s) * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }
  function jobTask(s, id) {
    if (id === "cashier") {
      const cost = (2 + Math.floor(random(s) * 17)) * 5,
        paid = 100;
      const answer = paid - cost,
        values = [answer, answer + 5, answer + 10, Math.max(0, answer - 5)];
      return {
        prompt: `商品 ${cost} 元，客人給 ${paid} 元。要找多少？`,
        answer: String(answer),
        options: shuffle(s, [...new Set(values)]).map((v) => ({
          id: String(v),
          label: v + " 元",
        })),
      };
    }
    if (id === "warehouse") {
      const labels = ["北區出口", "南區出口", "東區出口", "西區出口"],
        answer = Math.floor(random(s) * 4);
      return {
        prompt: "包裹標籤：" + labels[answer],
        answer: String(answer),
        options: labels.map((label, i) => ({ id: String(i), label })),
      };
    }
    const cups = ["小杯", "中杯", "大杯"],
      drinks = ["拿鐵", "美式", "奶茶"],
      temps = ["熱飲", "冰飲"],
      order = [
        cups[Math.floor(random(s) * 3)],
        drinks[Math.floor(random(s) * 3)],
        temps[Math.floor(random(s) * 2)],
      ];
    return {
      prompt: order.join(" / "),
      sequence: order,
      step: 0,
      answer: order[0],
      options: cups.map((label) => ({ id: label, label })),
    };
  }
  function work(s, id = "cashier") {
    if (!ready(s)) return { ok: false, message: "先完成目前的任務或劇情。" };
    if (s.lastWorkDay === s.day)
      return { ok: false, message: "今天的工已經打完了。" };
    const job = JOBS.find((j) => j.id === id);
    if (!job) return { ok: false, message: "沒有這份工作。" };
    s.job = { id, day: s.day, done: 0, mistakes: 0, task: jobTask(s, id) };
    return { ok: true, message: "開始工作，完成全部任務才領薪水。" };
  }
  function jobInput(s, input) {
    const j = s.job;
    if (!j || s.ended) return { ok: false, message: "目前沒有工作任務。" };
    if (!j.task.options.some((o) => o.id === String(input)))
      return { ok: false, message: "請選擇畫面上的答案。" };
    if (String(input) !== j.task.answer) {
      j.mistakes++;
      return {
        ok: false,
        message: "選錯了，看看提示再試。每次失誤會扣 5% 薪水，最多扣 40%。",
      };
    }
    if (j.id === "cafe" && j.task.step < 2) {
      j.task.step++;
      j.task.answer = j.task.sequence[j.task.step];
      const labels =
        j.task.step === 1 ? ["拿鐵", "美式", "奶茶"] : ["熱飲", "冰飲"];
      j.task.options = labels.map((label) => ({ id: label, label }));
      return { ok: true, message: "這一步好了，繼續照訂單出餐。" };
    }
    const job = JOBS.find((x) => x.id === j.id);
    j.done++;
    if (j.done < job.rounds) {
      j.task = jobTask(s, j.id);
      return { ok: true, message: "這筆完成，下一位！" };
    }
    const before = equity(s),
      pay = Math.round(
        job.pay *
          (1 - Math.min(0.4, j.mistakes * 0.05)) *
          (s.reputation < 35 ? 0.85 : 1),
      ),
      damage =
        job.damage +
        (s.organs.some((x) => x.startsWith("lung")) ? 2 : 0) +
        (s.organs.includes("stomach") ? 1 : 0);
    s.cash += pay;
    s.lastWorkDay = s.day;
    s.jobsDone++;
    s.workIncome += pay;
    health(s, -damage, -8);
    s.job = null;
    unlock(s, "worker");
    log(
      s,
      `完成${job.name} ${job.rounds} 筆任務，失誤 ${j.mistakes} 次，實領 ${(pay / 1e4).toFixed(0)} 萬。`,
    );
    track(s, before);
    checkEnd(s);
    return {
      ok: true,
      completed: true,
      pay,
      message: "今日工作完成！實領 " + (pay / 1e4).toFixed(0) + " 萬遊戲薪水。",
    };
  }
  function quitWork(s) {
    if (!s.job) return { ok: false, message: "沒有工作。" };
    s.job = null;
    return { ok: true, message: "離開工作，未完成不領薪水。今天可重新接班。" };
  }
  function tick(s, internal = false) {
    if ((!internal && !ready(s)) || s.ended || s.practice)
      return { ok: false, message: "目前沒有盤中行情。" };
    const before = equity(s);
    s.minute = Math.min(1440, s.minute + 5);
    for (const a of ASSETS) {
      const m = s.markets[a.id],
        b = m.bars[m.bars.length - 1],
        phase =
          s.day < 9
            ? 0.0005
            : s.day < 18
              ? -0.0006
              : s.day < 32
                ? -0.002
                : -0.004;
      const move = phase * (54 / 288) + (random(s) - 0.5) * a.vol * 0.117;
      m.price = Math.max(0.00001, m.price * (1 + move));
      b.close = m.price;
      b.low = Math.min(b.low, m.price);
      b.high = Math.max(b.high, m.price);
      b.volume += 0.01;
      m.change = (m.price / b.open - 1) * 100;
      record(m.series, s, m.price);
    }
    const wiped = settlePositions(s, true, true);
    if (wiped) health(s, -1, 8);
    track(s, before);
    if (s.minute === 1440 && !internal) {
      const r = rollover(s);
      return {
        ...r,
        delta: equity(s) - before,
        wiped: wiped + (r.wiped || 0),
        rolled: true,
      };
    }
    if (!internal) {
      checkEnd(s);
      const gain = s.positions.reduce(
        (n, p) => n + Math.max(0, value(s, p) - p.margin),
        0,
      );
      if (
        !s.pending &&
        !s.ended &&
        s.day >= s.nextGlitchDay &&
        s.minute >= 585 &&
        gain > 1e6 &&
        random(s) < 0.07
      )
        s.pending = { type: "glitch", shownProfit: gain };
    }
    return { ok: true, wiped, delta: equity(s) - before };
  }
  ACHIEVEMENTS.push({
    id: "worker",
    name: "真正做完才算",
    description: "完成一次互動打工。",
  });
  function finish(s, type, reason) {
    s.ended = true;
    s.pending = null;
    s.job = null;
    s.gamble = null;
    s.endType = type;
    s.endReason = reason;
    closeAll(s, 0, true);
    s.cash = 0;
    unlock(s, "end");
    if (type === "death") {
      s.health = 0;
      unlock(s, "death");
    }
    news(
      s,
      type === "death"
        ? "最後跳出的通知，已經沒有人按下確認。"
        : "你終於把手機放下。歸零的是帳戶，不是人的價值。",
      "終章",
    );
    log(s, reason, "danger");
    update(s);
    s.history[s.history.length - 1] = equity(s);
    record(s.equityTape, s, equity(s));
  }
  function checkEnd(s) {
    if (s.ended || s.practice) return s.ended;
    if (s.health <= 0) {
      finish(
        s,
        "death",
        "身體健康耗盡，壓力與透支一起觸發猝死結局。這是虛構遊戲數值，不是醫學判斷。",
      );
      return true;
    }
    if (!s.pending && s.cash + positionTotal(s) < 10000) {
      const due = s.loans.find((l) => l.due <= s.day);
      if (due) {
        beginCollection(s, due);
        return false;
      }
      s.pending = { type: "survival" };
      news(s, "連明天的生活費都沒有了。你還想拿什麼去翻本？", "資金見底");
    }
    return false;
  }
  function settlePositions(s, alreadyFunded = false, intraday = false) {
    let wiped = 0;
    for (const p of [...s.positions]) {
      const m = s.markets[p.asset],
        bar = m.bars[m.bars.length - 1],
        a = ASSETS.find((x) => x.id === p.asset);
      if (p.product !== "spot") {
        const funding = alreadyFunded ? 0 : p.margin * p.leverage * 0.0005;
        p.funding += funding;
        s.fees += funding;
        const worst = intraday ? m.price : p.sign === 1 ? bar.low : bar.high;
        if (value(s, p, worst) <= p.margin * 0.025) {
          s.positions = s.positions.filter((x) => x.id !== p.id);
          s.liquidations++;
          wiped++;
          unlock(s, "liquidated");
          log(
            s,
            `${a.name} ${p.leverage} 倍爆倉：這筆投入的錢全部歸零。`,
            "danger",
          );
          continue;
        }
        if (!intraday && p.product === "option" && s.day >= p.expiry) {
          const result = Math.max(
            0,
            p.margin * p.leverage * p.sign * (m.price / p.entry - 1) -
              p.funding,
          );
          s.cash += result;
          s.positions = s.positions.filter((x) => x.id !== p.id);
          log(
            s,
            `${a.name} 三日賭局到期，收回 ${(result / 1e8).toFixed(3)} 億。`,
            "danger",
          );
          continue;
        }
      }
      if (
        !intraday &&
        s.day >= 20 &&
        s.day % 10 === 0 &&
        p.product === "spot"
      ) {
        s.positions = s.positions.filter((x) => x.id !== p.id);
        const residue = value(s, p) * 0.04;
        s.cash += residue;
        log(
          s,
          `${a.name} 公司違約，只退回 ${(residue / 1e8).toFixed(3)} 億。`,
          "danger",
        );
      }
    }
    return wiped;
  }
  // Manual advance resolves the remainder of this day; normal ticks use the same midnight settlement.
  function nextDay(s, { rest = false } = {}) {
    if (!ready(s)) return { ok: false, message: "先完成目前事件或任務。" };
    while (!s.practice && s.minute < 1440) tick(s, true);
    return rollover(s, rest);
  }
  function rollover(s, rest = false) {
    if (s.health <= 0 && !s.practice) {
      finish(s, "death", "午夜前健康耗盡。身體先停止，交易也走到終點。");
      return { ok: true, ended: true, wiped: 0 };
    }
    if (!ready(s))
      return {
        ok: false,
        message: s.pending
          ? "先做完這個選擇，時間才會繼續。"
          : "這段人生已結束。",
      };
    if (s.day === 60 && !s.practice) {
      s.minute = 1440;
      s.debt += 1.2e8;
      finish(
        s,
        "beggar",
        "第 60 日 24:00 平台倒閉，剩餘資產失去返還。百億人生，停在街頭乞丐的終點。",
      );
      return { ok: true, ended: true, wiped: 0 };
    }
    const before = equity(s);
    s.day++;
    s.minute = 0;
    for (const a of ASSETS) {
      const m = s.markets[a.id],
        o = m.price;
      let movement = s.practice
        ? 0.1
        : (s.day < 9
            ? 0.008
            : s.day < 18
              ? -0.022
              : s.day < 32
                ? -0.065
                : -0.13) +
          (random(s) - 0.5) * a.vol * 1.8;
      if (!s.practice && s.day % 7 === 0) movement += 0.07 + random(s) * 0.1;
      if (!s.practice && [14, 23, 36, 44, 53].includes(s.day))
        movement -= 0.2 + random(s) * 0.2;
      movement = Math.max(-0.72, Math.min(0.32, movement));
      m.price = Math.max(0.00001, o * (1 + movement));
      m.change = (m.price / o - 1) * 100;
      m.bars.push({
        day: s.day,
        open: o,
        close: m.price,
        high: Math.max(o, m.price),
        low: Math.min(o, m.price),
        volume: 0.3 + random(s) * 0.7,
      });
      record(m.series, s, m.price);
    }
    let wiped = settlePositions(s);
    if (!s.practice) {
      const living =
          Math.min(2e9, 8e6 * Math.pow(1.13, s.day - 1)) * s.expenseFactor,
        fee = interest(s);
      spend(s, living + fee);
      s.totalLiving += living;
      s.totalInterest += fee;
      log(
        s,
        `生活費 ${(living / 1e8).toFixed(3)} 億${fee > 0 ? `，借款利息 ${(fee / 1e8).toFixed(3)} 億` : ""}。`,
      );
      const loss = Math.max(0, before - equity(s)) / INITIAL,
        pressure =
          Math.min(18, loss * 190) +
          s.loans.reduce((n, l) => n + LOAN_TYPES[l.type].stress, 0) * 0.5 +
          (wiped ? 8 : 0);
      health(
        s,
        -(
          0.55 +
          s.stress * 0.016 +
          (s.day > 35 ? 0.6 : 0) +
          (s.organs.includes("kidney_left") && s.organs.includes("kidney_right")
            ? 3
            : 0) +
          (s.organs.includes("liver") ? 1.2 : 0) +
          (s.organs.includes("skin") ? 0.5 : 0) +
          (s.organs.includes("pancreas") ? 1 : 0)
        ),
        pressure + (equity(s) > before ? -5 : 1),
      );
      if (rest) {
        const recovery =
          s.organs.some((x) => x.startsWith("lung")) ||
          s.organs.includes("marrow") ||
          s.organs.includes("spleen")
            ? 9
            : 14;
        health(s, recovery, -25);
        spend(s, 5000000);
        unlock(s, "rest");
        log(s, `休息一天：健康 +${recovery}、壓力 −25；市場沒有跟著放假。`);
      }
      news(
        s,
        wiped
          ? `${wiped} 筆錢被清算光。你現在知道「倍數」放大的不只獲利。`
          : s.day % 7 === 0
            ? "突然反彈。群組又開始叫你「最後加碼一次」。"
            : s.day < 12
              ? "群組曬出獲利截圖，你覺得自己也能做到。"
              : "錢越少，越想追回來。生活費和利息卻沒有停。",
        wiped ? "全部歸零" : "盤後",
      );
    }
    update(s);
    s.daily = equity(s) - before;
    s.history.push(equity(s));
    if (!s.practice) {
      if (s.health <= 0)
        finish(
          s,
          "death",
          "健康歸零。長期透支與壓力觸發猝死結局；這是刻意誇張的遊戲判定。",
        );
      else {
        checkEnd(s);
        if (!s.pending) {
          const due = [...s.loans]
            .sort((a, b) => a.due - b.due)
            .find((l) => l.due <= s.day);
          if (due) beginCollection(s, due);
          else if (EVENTS[s.day]) s.pending = { type: "event", day: s.day };
          else if (
            s.positions.length &&
            s.day >= s.nextGlitchDay &&
            (s.daily > 0 ||
              s.day % 7 === 0 ||
              (s.organs.some((id) => id.startsWith("cornea")) &&
                random(s) < 0.25))
          ) {
            s.pending = {
              type: "glitch",
              shownProfit: Math.max(
                0,
                s.daily,
                s.positions.reduce(
                  (n, p) => n + Math.max(0, value(s, p) - p.margin),
                  0,
                ),
              ),
            };
          }
        }
      }
    }
    s.daily = equity(s) - before;
    s.history[s.history.length - 1] = equity(s);
    record(s.equityTape, s, equity(s));
    return {
      ok: true,
      message: `第 ${s.day} 天過去了。`,
      wiped,
      event: !!s.pending,
      ended: s.ended,
      daily: s.daily,
    };
  }
  function resolveGlitch(s) {
    if (!s.pending || s.pending.type !== "glitch")
      return { ok: false, message: "沒有待恢復的斷線。" };
    const before = equity(s);
    s.pending = null;
    s.glitches++;
    s.nextGlitchDay = s.day + 7;
    unlock(s, "glitch");
    for (const a of ASSETS) {
      const m = s.markets[a.id],
        b = m.bars[m.bars.length - 1];
      const net = s.positions
        .filter((p) => p.asset === a.id)
        .reduce((n, p) => n + p.margin * p.leverage * p.sign, 0);
      m.price = Math.max(0.00001, m.price * (net < 0 ? 1.65 : 0.52));
      b.close = m.price;
      b.low = Math.min(b.low, m.price * 0.95);
      b.high = Math.max(b.high, m.price * 1.05);
      m.change = (m.price / b.open - 1) * 100;
      m.series.push({
        day: s.day,
        minute: s.minute,
        price: m.price,
        kind: "故障恢復",
      });
    }
    const wiped = settlePositions(s, true);
    health(s, -4, 22);
    news(
      s,
      "404 消失了，獲利也消失了。假斷線期間，虛構行情已經狠狠反轉。",
      "心態爆炸",
    );
    log(
      s,
      "遊戲內假斷線：重新連線後，價格朝持倉不利的方向大幅變動。",
      "danger",
    );
    track(s, before);
    checkEnd(s);
    return {
      ok: true,
      message: "連回來了。可是錢回不來了。",
      wiped,
      ended: s.ended,
    };
  }
  function choose(s, index) {
    if (!Number.isInteger(index) || index < 0 || !s.pending)
      return { ok: false, message: "沒有這個選項。" };
    const pending = s.pending,
      before = equity(s);
    if (pending.type === "glitch")
      return { ok: false, message: "請按重新連線。" };
    if (pending.type === "survival") {
      if (index > 2) return { ok: false, message: "沒有這個選項。" };
      if (index === 0) {
        s.pending = null;
        finish(
          s,
          "beggar",
          "你停止翻本，接受街頭乞丐結局。你的帳戶歸零了，生活仍可以重新開始。",
        );
      }
      if (index === 1) {
        const limit = loanLimit(s, "shark");
        if (limit < 10000)
          return { ok: false, message: "連高利貸也不願意再借。請選另一條路。" };
        s.pending = null;
        borrow(s, Math.min(5e8, limit), "shark", true);
      }
      if (index === 2) {
        const o = ORGANS.find(
          (x) =>
            x.id !== "core" && x.id !== "liver_whole" && organAvailable(s, x),
        );
        if (!o) return { ok: false, message: "沒有可交易的剩餘部件。" };
        s.pending = null;
        sellOrgan(s, o.id, true);
      }
    } else if (pending.type === "debt") {
      const l = s.loans.find((x) => x.id === pending.loanId);
      if (!l) return { ok: false, message: "這張借條已還清。" };
      if (index > 4) return { ok: false, message: "沒有這個選項。" };
      if ((pending.turn || 0) < 3)
        return { ok: false, message: "先回覆催收對話，再決定如何處理。" };
      if (index === 0) {
        if (s.cash + 1e-5 < l.balance)
          return { ok: false, message: "現金不夠全額還款。" };
        s.pending = null;
        repay(s, l.balance, l.id);
        health(s, 0, -12);
      }
      if (index === 1) {
        s.pending = null;
        const extra = l.balance * 0.2;
        l.balance += extra;
        s.debt += extra;
        l.due = s.day + 3;
        l.extensions++;
        health(s, -4, 12);
        collectorConsequence(s, l);
        log(s, "延期三日，這張欠款再加 20%。", "danger");
      }
      if (index === 2) {
        const o = ORGANS.find(
          (x) =>
            x.id !== "core" && x.id !== "liver_whole" && organAvailable(s, x),
        );
        if (!o) return { ok: false, message: "沒有可交易的部件。" };
        s.pending = null;
        sellOrgan(s, o.id, true);
        repay(s, Math.min(s.cash, l.balance), l.id);
        if (l.balance > 0.001) l.due = s.day + 2;
      }
      if (index === 3) {
        s.pending = null;
        const extra = l.balance * 0.3;
        l.balance += extra;
        s.debt += extra;
        l.due = s.day + 2;
        health(s, -8, 20);
        collectorConsequence(s, l);
        log(s, "掛斷來電：欠款 +30%，兩日後繼續催收。", "danger");
      }
      if (index === 4) {
        s.pending = null;
        spend(s, 5e6);
        l.due = s.day + 3;
        health(s, 5, -18);
        s.reputation = Math.min(100, s.reputation + 8);
        post(
          s,
          "小夏",
          `${s.playerName}，我陪你把訊息留下來。你不用一個人承受。`,
        );
        log(s, "選擇虛構求助支線：本輪免受催收侵害，延期三日，欠款仍需處理。");
      }
    } else if (pending.type === "event") {
      const ev = EVENTS[pending.day],
        choice = ev && ev.choices[index];
      if (!choice) return { ok: false, message: "沒有這個選項。" };
      s.pending = null;
      log(s, `${ev.title}：${choice.label}。`, "event");
      switch (choice.action) {
        case "vip":
          spend(s, 5e7);
          news(s, "你花錢得到的消息：「有機會漲，也可能跌。」", "廢話");
          break;
        case "halfclose":
          for (const p of [...s.positions]) {
            const half = value(s, p) / 2,
              fee = Math.min(
                half,
                (p.margin *
                  p.leverage *
                  (p.product === "spot" ? 0.0015 : 0.0008)) /
                  2,
              );
            s.cash += half - fee;
            s.fees += fee;
            p.margin /= 2;
            p.funding /= 2;
          }
          break;
        case "rescue":
          spend(s, 1e8);
          news(s, "代操老師已經把你封鎖。", "失聯");
          break;
        case "slipclose":
          closeAll(s, 0.85, true);
          break;
        case "luxury":
          spend(s, 2e8);
          break;
        case "downsize":
          s.cash += 2e7;
          s.expenseFactor *= 0.65;
          health(s, 0, -8);
          break;
        case "haircut":
          s.cash *= 0.35;
          break;
        case "lawsuit":
          s.cash *= 0.35;
          spend(s, 5e7);
          break;
        case "repay":
          repay(s, Math.min(s.debt * 0.3, s.cash * 0.5));
          break;
        case "exchange":
          s.cash *= 0.1;
          closeAll(s, 0.1, true);
          break;
        case "recover":
          s.cash *= 0.1;
          closeAll(s, 0.1, true);
          spend(s, 1e7);
          break;
        case "work":
          s.cash += 5e6;
          s.expenseFactor *= 0.15;
          health(s, 8, -15);
          break;
        case "smallrepay":
          repay(s, 1e6);
          break;
        case "box":
          spend(s, 5e7);
          if (random(s) < 0.5) {
            s.cash += 8e7;
            log(s, "賭箱開出 0.8 億，這次賺了。");
          } else log(s, "箱子裡只有一張「謝謝參與」。", "danger");
          break;
        case "calm":
          health(s, 0, -5);
          break;
        case "sleep":
          spend(s, 2e6);
          health(s, 18, -22);
          break;
        case "overwork":
          health(s, -12, 15);
          break;
        case "friend":
          s.expenseFactor *= 0.8;
          health(s, 0, -12);
          break;
        case "deny":
          health(s, -6, 14);
          break;
        case "recoverhealth":
          spend(s, 1e7);
          health(s, 22, -25);
          break;
        case "overworkhard":
          health(s, -18, 20);
          break;
      }
    } else return { ok: false, message: "未知劇情。" };
    track(s, before);
    checkEnd(s);
    return {
      ok: true,
      message: "這個選擇，已經寫進你的人生。",
      ended: s.ended,
    };
  }
  function setName(s, name) {
    if (typeof name !== "string")
      return { ok: false, message: "請填角色名字。" };
    name = name.trim().replace(/[\u0000-\u001f\u007f]/g, "");
    if (!name || Array.from(name).length > 16)
      return { ok: false, message: "角色名請用 1 至 16 個字。" };
    if (s.named) return { ok: false, message: "這局已經有名字。" };
    s.playerName = name;
    s.named = true;
    log(s, `${name}，你的百億人生開盤了。`);
    return { ok: true };
  }
  function loanRate(l) {
    return l.rate ?? LOAN_TYPES[l.type].rate;
  }
  function organAvailable(s, o) {
    return (
      !s.organs.includes(o.id) &&
      !(o.id === "liver" && s.organs.includes("liver_whole"))
    );
  }
  function organFatal(s, o) {
    return (
      o.id === "core" ||
      o.id === "liver_whole" ||
      (o.id === "lung_right" && s.organs.includes("lung")) ||
      (o.id === "lung" && s.organs.includes("lung_right")) ||
      s.health <= o.damage
    );
  }
  function post(s, who, text) {
    s.social.unshift({ day: s.day, who, text });
    s.social = s.social.slice(0, 40);
  }
  function support(s) {
    if (!ready(s)) return { ok: false, message: "先完成目前的事情。" };
    if (s.lastSupportDay === s.day)
      return { ok: false, message: "今天已經聊過了。" };
    s.lastSupportDay = s.day;
    s.reputation = Math.min(100, s.reputation + 6);
    health(s, 0, -10);
    post(
      s,
      "阿城",
      `${s.playerName}，我看到那些傳言了。不管帳戶剩多少，你還是我朋友。`,
    );
    return { ok: true, message: "和朋友聊過了：名譽 +6、壓力 −10。" };
  }
  function beginCollection(s, l) {
    l.stage = Math.min(4, (l.stage || 0) + 1);
    s.collectionCount++;
    s.pending = { type: "debt", loanId: l.id, turn: 0, transcript: [] };
  }
  function collectionScene(s) {
    const l = s.pending && s.loans.find((x) => x.id === s.pending.loanId);
    if (!l) return null;
    const n = s.playerName,
      stage = l.stage || 1;
    const lines =
      l.type === "online"
        ? stage === 1
          ? [
              `${n}，我是小額客服。今天到期的款項呢？`,
              "申請時那張遊戲證件，與虛構聯絡人條款，你都簽過。",
              "這次先提醒。下次不是只有你看到這張帳單。",
            ]
          : stage === 2
            ? [
                `${n}，你說過會還。我們不想再聽「明天」。`,
                "資料與不實欠款貼文的發送預覽已經出現在遊戲朋友圈。",
                "朋友、店長，都可能看到那些謠言。你打算怎麼回覆？",
              ]
            : [
                `${n}，來電你可以不接，帳單不會消失。`,
                "未接訊息一直增加，朋友開始問你出了什麼事。",
                "我們又加了費用。你要處理欠款，還是找人一起面對？",
              ]
        : l.type === "shark"
          ? stage === 1
            ? [
                `${n}，三天到了。門外那張紅色借條看見了嗎？`,
                "門鈴響了又響。你手上的電話，比房間還冷。",
                "今天先記住你的承諾。再拖，代價就不只有錢。",
              ]
            : stage === 2
              ? [
                  `${n}，昨天的承諾去哪了？`,
                  "腳步聲停在門外。你握著手機，手卻一直發抖。",
                  "未還款的這一輪會造成劇情健康損傷。現在選擇你的退路。",
                ]
              : [
                  `${n}，這張借條現在比你還完整。`,
                  "他指著遊戲身體清單。沒有血腥畫面，只有一張待執行抵債通知。",
                  "如果再次拖延，部件會被低價抵債；利率繼續升。你也可以求助。",
                ]
          : [
              `${n}，銀行通知：這張借款今天到期。`,
              "請核對本金、當前利率與可用現金。",
              "請選擇還款、延期，或尋求遊戲內協商。",
            ];
    return {
      loan: l,
      who:
        l.type === "online"
          ? "秒速客服 · 阿零"
          : l.type === "shark"
            ? "紅門催收員"
            : "銀行帳務通知",
      icon: l.type === "online" ? "📱" : l.type === "shark" ? "🚪" : "🏦",
      lines,
    };
  }
  function collectorReply(s, key) {
    const scene = collectionScene(s);
    if (
      !scene ||
      !["answer", "promise", "question"].includes(key) ||
      (s.pending.turn || 0) >= 3
    )
      return { ok: false, message: "沒有這段可回覆的對話。" };
    const p = s.pending,
      i = p.turn || 0;
    p.transcript = p.transcript || [];
    p.transcript.push(
      { who: "collector", text: scene.lines[i] },
      {
        who: "player",
        text:
          key === "answer"
            ? "我在聽，先讓我看清這張帳單。"
            : key === "promise"
              ? "我知道到期了，先讓我想辦法。"
              : "如果我現在還不完，會發生什麼？",
      },
    );
    p.turn = i + 1;
    log(s, `${scene.who}對話 ${p.turn}/3：${s.playerName}已回覆。`, "event");
    return { ok: true, done: p.turn >= 3 };
  }
  function collectionPenalty(s, l) {
    if (l.type === "bank") return "未付本輪：延期費用照算。";
    if (l.type === "online")
      return l.stage >= 2
        ? "未付本輪：虛構朋友圈抹黑，名譽 −28、壓力 +18，日息再 +2 個百分點。"
        : "未付本輪：威脅訊息，壓力 +10。";
    return l.stage >= 3
      ? "未付本輪：一個部件被強行低價抵債，日息再 +3 個百分點。"
      : l.stage === 2
        ? "未付本輪：暴力劇情，健康 −20、壓力 +20，日息再 +3 個百分點。"
        : "未付本輪：堵門威脅，健康 −3、壓力 +10。";
  }
  function collectorConsequence(s, l) {
    if (l.type === "online") {
      if (l.stage >= 2) {
        s.reputation = Math.max(0, s.reputation - 28);
        health(s, -3, 18);
        post(
          s,
          "不明群發帳號",
          `【不實抹黑・遊戲演出】${s.playerName}失聯不還錢。虛構證件 ${s.fictionId} 已貼出。`,
        );
        post(
          s,
          "林店長",
          `${s.playerName}，我收到奇怪的訊息了。先別獨自承受，請跟可信任的人聊聊。`,
        );
        l.rate = Math.min(0.2, loanRate(l) + 0.02);
        unlock(s, "exposed");
      } else health(s, 0, 10);
    }
    if (l.type === "shark") {
      if (l.stage >= 3) {
        const o = ORGANS.find(
          (x) =>
            x.id !== "core" && x.id !== "liver_whole" && organAvailable(s, x),
        );
        if (o) {
          sellOrgan(s, o.id, true, true);
          const credit = Math.min(l.balance, o.price * 0.35);
          l.balance -= credit;
          s.organRecords.at(-1).credit = credit;
          s.debt = Math.max(0, s.debt - credit);
          l.seized = (l.seized || 0) + 1;
          s.seizedCount++;
          s.loans = s.loans.filter((x) => x.balance > 0.001);
          log(
            s,
            `虛構強行抵債：${o.name}被拿走，只抵 ${(credit / 1e8).toFixed(3)} 億，沒有現金入帳。`,
            "danger",
          );
          post(
            s,
            "催收通知",
            `${s.playerName}，抵債收據已生成。剩餘欠款沒有消失。`,
          );
          unlock(s, "seized");
        } else health(s, -30, 20);
      } else if (l.stage === 2) {
        health(s, -20, 20);
        log(s, "暴力催收劇情：健康驟降 20。無血腥畫面。", "danger");
      } else health(s, -3, 10);
      if (l.stage >= 2) l.rate = Math.min(0.3, loanRate(l) + 0.03);
    }
  }
  const CASINO = [
    {
      id: "dice",
      name: "深夜骰盅",
      icon: "🎲",
      description:
        "猜小（3–10）或大（11–18），親手搖骰。中獎總返還 1.9 倍；劇情莊家偏向自己。",
    },
    {
      id: "cards",
      name: "最後一張 21 點",
      icon: "🃏",
      description:
        "選擇要牌或停牌，超過 21 全輸。莊家平手也贏；勝局總返還 1.8 倍，後期可能作弊。",
    },
    {
      id: "mines",
      name: "翻本地雷九宮格",
      icon: "💣",
      description:
        "翻開安全格增加返還倍數，隨時收手。踩雷整筆歸零；晚期地雷會變多。",
    },
  ];
  function card(s) {
    const rank = 1 + Math.floor(random(s) * 13);
    return {
      rank,
      label:
        rank === 1
          ? "A"
          : rank === 11
            ? "J"
            : rank === 12
              ? "Q"
              : rank === 13
                ? "K"
                : String(rank),
    };
  }
  function handScore(cards) {
    let v = cards.reduce((n, c) => n + Math.min(10, c.rank), 0);
    if (cards.some((c) => c.rank === 1) && v + 10 <= 21) v += 10;
    return v;
  }
  function startGamble(s, id, stake) {
    if (!ready(s)) return { ok: false, message: "先完成目前的事件。" };
    if (
      !CASINO.some((x) => x.id === id) ||
      !Number.isFinite(stake) ||
      stake < 10000 ||
      stake > s.cash ||
      !Number.isFinite(s.cash + stake * 3.1)
    )
      return { ok: false, message: "下注至少 1 萬，不能超過口袋現金。" };
    if (s.casinoDay !== s.day) {
      s.casinoDay = s.day;
      s.casinoToday = 0;
    }
    if (s.casinoToday >= 12)
      return { ok: false, message: "今天已玩 12 局，這家暗莊暫時關門。" };
    const before = equity(s);
    s.cash -= stake;
    s.casinoToday++;
    s.gamble = {
      id,
      stake,
      day: s.day,
      guess: null,
      dice: [],
      player: [],
      dealer: [],
      revealed: [],
      bombs: [],
    };
    if (id === "cards") {
      s.gamble.player = [card(s), card(s)];
      s.gamble.dealer = [card(s), card(s)];
    }
    if (id === "mines")
      s.gamble.bombs = shuffle(s, [0, 1, 2, 3, 4, 5, 6, 7, 8]).slice(
        0,
        s.day < 20 ? 3 : s.day < 40 ? 4 : 5,
      );
    s.lastGamble = null;
    track(s, before);
    unlock(s, "casino");
    return { ok: true, message: "本金已下注，完成或放棄才能離開本局。" };
  }
  function settleGamble(s, payout, reason) {
    const g = s.gamble,
      before = equity(s);
    s.cash += payout;
    s.gambleStats.rounds++;
    s.gambleStats.net += payout - g.stake;
    s.lastGamble = { ...g, payout, net: payout - g.stake, reason };
    s.gamble = null;
    health(s, 0, payout > g.stake ? -4 : 8);
    log(
      s,
      `賭場：${CASINO.find((x) => x.id === g.id).name}，投入 ${(g.stake / 1e8).toFixed(3)} 億，返還 ${(payout / 1e8).toFixed(3)} 億。${reason}`,
      payout > g.stake ? "trade" : "danger",
    );
    track(s, before);
    checkEnd(s);
    return {
      ok: true,
      completed: true,
      payout,
      net: payout - g.stake,
      message: reason,
    };
  }
  function gambleAction(s, key, index) {
    const g = s.gamble;
    if (!g || s.ended) return { ok: false, message: "目前沒有賭局。" };
    if (key === "forfeit")
      return settleGamble(s, 0, "放棄本局，本金留在賭桌。");
    if (g.id === "dice") {
      if (["big", "small"].includes(key)) {
        g.guess = key;
        return { ok: true };
      }
      if (key !== "roll" || !g.guess)
        return { ok: false, message: "先選大小，再搖骰。" };
      const win = random(s) < (s.day < 15 ? 0.43 : s.day < 35 ? 0.28 : 0.12);
      let sum;
      do {
        g.dice = [
          1 + Math.floor(random(s) * 6),
          1 + Math.floor(random(s) * 6),
          1 + Math.floor(random(s) * 6),
        ];
        sum = g.dice.reduce((a, b) => a + b, 0);
      } while ((g.guess === "big" ? sum >= 11 : sum <= 10) !== win);
      return settleGamble(
        s,
        win ? g.stake * 1.9 : 0,
        `三顆骰子共 ${sum} 點。${win ? "這次猜中了。" : "莊家收走本金。"}`,
      );
    }
    if (g.id === "cards") {
      if (!["hit", "stand"].includes(key))
        return { ok: false, message: "請選要牌或停牌。" };
      if (key === "hit") {
        g.player.push(card(s));
        if (handScore(g.player) > 21)
          return settleGamble(s, 0, "你超過 21 點，爆牌了。");
        return { ok: true };
      }
      if (s.day >= 25 && random(s) < 0.75)
        g.dealer = [
          { rank: 1, label: "A" },
          { rank: 13, label: "K" },
        ];
      else
        while (handScore(g.dealer) < 17 && g.dealer.length < 10)
          g.dealer.push(card(s));
      const p = handScore(g.player),
        d = handScore(g.dealer),
        win = d > 21 || p > d;
      return settleGamble(
        s,
        win ? g.stake * 1.8 : 0,
        `你 ${p} 點，莊家 ${d} 點。${win ? "這局勝出。" : "莊家勝出（同點也是莊家贏）。"}`,
      );
    }
    if (g.id === "mines") {
      if (key === "cashout") {
        if (!g.revealed.length)
          return { ok: false, message: "至少翻開一格，或選擇放棄本局。" };
        return settleGamble(
          s,
          g.stake * mineMultiplier(g.revealed.length),
          "你按下收手，拿回剩下的遊戲款。",
        );
      }
      if (
        key !== "reveal" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index > 8 ||
        g.revealed.includes(index)
      )
        return { ok: false, message: "選一個還沒翻開的格子。" };
      g.revealed.push(index);
      if (g.bombs.includes(index))
        return settleGamble(s, 0, "踩到地雷。那個「再翻一格」，吃掉整筆本金。");
      if (g.revealed.length === 9 - g.bombs.length)
        return settleGamble(
          s,
          g.stake * mineMultiplier(g.revealed.length),
          "所有安全格已翻開，自動收手。",
        );
      return { ok: true };
    }
    return { ok: false, message: "未知玩法。" };
  }
  function mineMultiplier(n) {
    return [1, 1.15, 1.35, 1.6, 2, 2.5, 3.1][Math.min(6, n)];
  }
  ACHIEVEMENTS.push(
    { id: "casino", name: "換一張桌子輸", description: "進入一個互動賭局。" },
    {
      id: "exposed",
      name: "帳單外的代價",
      description: "遇到虛構朋友圈抹黑。",
    },
    {
      id: "seized",
      name: "不是你簽的合約",
      description: "遇到強行部件抵債劇情。",
    },
  );
  function validate(s) {
    if (
      !s ||
      s.version !== 5 ||
      !Number.isInteger(s.day) ||
      s.day < 1 ||
      s.day > 60 ||
      !s.markets ||
      !Array.isArray(s.positions) ||
      s.positions.length > 24 ||
      !Array.isArray(s.history) ||
      !Array.isArray(s.logs) ||
      !Array.isArray(s.news) ||
      !Array.isArray(s.achievements) ||
      !Array.isArray(s.loans) ||
      !Array.isArray(s.organs) ||
      !Array.isArray(s.organRecords)
    )
      return false;
    const finite = [
      "rng",
      "cash",
      "debt",
      "daily",
      "fees",
      "liquidations",
      "trades",
      "peak",
      "nextId",
      "expenseFactor",
      "mysteryCount",
      "lastMysteryDay",
      "totalLiving",
      "totalInterest",
      "health",
      "healthCap",
      "stress",
      "nextLoanId",
      "lastWorkDay",
      "nextGlitchDay",
      "glitches",
      "minute",
      "jobsDone",
      "workIncome",
      "reputation",
      "collectionCount",
      "seizedCount",
      "lastSupportDay",
      "casinoDay",
      "casinoToday",
    ];
    if (
      !finite.every((k) => Number.isFinite(s[k])) ||
      s.cash < 0 ||
      s.debt < 0 ||
      s.health < 0 ||
      s.health > s.healthCap ||
      s.healthCap > 100 ||
      s.stress < 0 ||
      s.stress > 100
    )
      return false;
    if (
      typeof s.playerName !== "string" ||
      Array.from(s.playerName).length < 1 ||
      Array.from(s.playerName).length > 16 ||
      typeof s.fictionId !== "string" ||
      !s.fictionId.startsWith("SIM-") ||
      !Array.isArray(s.social) ||
      !s.social.every(
        (x) => typeof x.who === "string" && typeof x.text === "string",
      ) ||
      !Array.isArray(s.contracts) ||
      s.reputation < 0 ||
      s.reputation > 100 ||
      !s.gambleStats ||
      !Number.isFinite(s.gambleStats.rounds) ||
      !Number.isFinite(s.gambleStats.net)
    )
      return false;
    if (s.gamble) {
      const g = s.gamble;
      if (
        s.pending ||
        s.job ||
        s.ended ||
        !CASINO.some((x) => x.id === g.id) ||
        !Number.isFinite(g.stake) ||
        g.stake < 10000 ||
        g.day !== s.day ||
        !Array.isArray(g.revealed) ||
        !Array.isArray(g.bombs) ||
        !Array.isArray(g.player) ||
        !Array.isArray(g.dealer) ||
        (g.id === "mines" &&
          (g.bombs.length < 3 ||
            g.bombs.length > 5 ||
            new Set(g.bombs).size !== g.bombs.length ||
            ![...g.bombs, ...g.revealed].every(
              (n) => Number.isInteger(n) && n >= 0 && n <= 8,
            ))) ||
        ![...g.player, ...g.dealer].every(
          (c) => Number.isInteger(c.rank) && c.rank >= 1 && c.rank <= 13,
        )
      )
        return false;
    }
    if (
      !Number.isInteger(s.minute) ||
      s.minute < 0 ||
      s.minute > 1440 ||
      !validTape(s.equityTape)
    )
      return false;
    if (s.job) {
      const j = JOBS.find((x) => x.id === s.job.id);
      if (
        s.pending ||
        s.ended ||
        !j ||
        s.job.day !== s.day ||
        !Number.isInteger(s.job.done) ||
        s.job.done < 0 ||
        s.job.done >= j.rounds ||
        !Number.isInteger(s.job.mistakes) ||
        s.job.mistakes < 0 ||
        !s.job.task ||
        !Array.isArray(s.job.task.options) ||
        !s.job.task.options.every(
          (o) => typeof o.id === "string" && typeof o.label === "string",
        ) ||
        !s.job.task.options.some((o) => o.id === s.job.task.answer) ||
        (j.id === "cafe" &&
          (!Array.isArray(s.job.task.sequence) ||
            s.job.task.sequence.length !== 3 ||
            !Number.isInteger(s.job.task.step) ||
            s.job.task.step < 0 ||
            s.job.task.step > 2 ||
            s.job.task.answer !== s.job.task.sequence[s.job.task.step]))
      )
        return false;
    }
    if (s.pending) {
      if (!["event", "debt", "glitch", "survival"].includes(s.pending.type))
        return false;
      if (s.pending.type === "event" && !EVENTS[s.pending.day]) return false;
      if (
        s.pending.type === "debt" &&
        (!s.loans.some((l) => l.id === s.pending.loanId) ||
          !Number.isInteger(s.pending.turn) ||
          s.pending.turn < 0 ||
          s.pending.turn > 3 ||
          !Array.isArray(s.pending.transcript))
      )
        return false;
    }
    for (const a of ASSETS) {
      const m = s.markets[a.id];
      if (
        !m ||
        !Number.isFinite(m.price) ||
        m.price <= 0 ||
        !Number.isFinite(m.change) ||
        !validTape(m.series) ||
        !Array.isArray(m.bars) ||
        m.bars.length < 2 ||
        !m.bars.every((b) =>
          ["open", "close", "high", "low", "volume"].every((k) =>
            Number.isFinite(b[k]),
          ),
        )
      )
        return false;
    }
    return (
      s.positions.every(
        (p) =>
          ASSETS.some((a) => a.id === p.asset) &&
          ["spot", "margin", "option"].includes(p.product) &&
          [1, 2, 5, 10, 25, 50, 100].includes(p.leverage) &&
          [1, -1].includes(p.sign) &&
          ["margin", "entry", "funding", "day", "id"].every((k) =>
            Number.isFinite(p[k]),
          ) &&
          p.margin > 0 &&
          p.entry > 0,
      ) &&
      s.history.every(Number.isFinite) &&
      s.loans.every(
        (l) =>
          LOAN_TYPES[l.type] &&
          Number.isFinite(l.balance) &&
          l.balance > 0 &&
          Number.isInteger(l.due) &&
          Number.isInteger(l.id) &&
          Number.isInteger(l.stage) &&
          l.stage >= 0 &&
          l.stage <= 4 &&
          Number.isFinite(loanRate(l)) &&
          loanRate(l) >= 0 &&
          loanRate(l) <= 0.3,
      ) &&
      s.loans.reduce((n, l) => n + l.balance, 0) <= s.debt + 0.01 &&
      s.organs.every((id) => ORGANS.some((o) => o.id === id)) &&
      new Set(s.organs).size === s.organs.length &&
      s.logs.every((l) => typeof l.text === "string") &&
      s.news.every((n) => typeof n.text === "string")
    );
  }
  function validTape(t) {
    return (
      Array.isArray(t) &&
      t.length > 0 &&
      t.length <= 18000 &&
      t.every(
        (p) =>
          Number.isInteger(p.day) &&
          p.day >= 1 &&
          p.day <= 60 &&
          Number.isInteger(p.minute) &&
          p.minute >= 0 &&
          p.minute <= 1440 &&
          Number.isFinite(p.price),
      )
    );
  }
  function migrate(old) {
    if (!old || ![2, 3, 4].includes(old.version)) return old;
    if (old.version === 4) {
      const s = JSON.parse(JSON.stringify(old));
      s.version = 5;
      s.organRecords = s.organs.map((id) => ({
        id,
        cause: "legacy",
        day: null,
        minute: null,
        cash: null,
      }));
      s.archiveNotice =
        "舊版行情完整保留；升級後全天 24 小時，每秒 5 分鐘。舊版未記錄的時段不補造。";
      return s;
    }
    const s = JSON.parse(JSON.stringify(old)),
      fresh = create(s.rng);
    if (s.version === 2) {
      s.minute = 540;
      s.job = null;
      s.jobsDone = 0;
      s.workIncome = 0;
      s.organs = s.organs.map((id) =>
        id === "kidney" ? "kidney_left" : id === "eye" ? "cornea_left" : id,
      );
      s.equityTape = s.history.map((price, i) => ({
        day: i + 1,
        minute: 540,
        price,
      }));
      for (const m of Object.values(s.markets)) {
        const n = m.bars.length;
        m.bars.forEach((b, i) => (b.day = s.day - n + i + 1));
        m.series = m.bars
          .filter((b) => b.day >= 1)
          .map((b) => ({ day: b.day, minute: 540, price: b.close }));
        if (!m.series.length)
          m.series = [{ day: s.day, minute: 540, price: m.price }];
      }
      s.archiveNotice = "2.0 舊檔沒有盤中資料；保留當時仍存在的日線。";
    }
    for (const key of [
      "playerName",
      "named",
      "fictionId",
      "reputation",
      "social",
      "lastSupportDay",
      "collectionCount",
      "seizedCount",
      "contracts",
      "gamble",
      "lastGamble",
      "gambleStats",
      "casinoDay",
      "casinoToday",
    ])
      s[key] = fresh[key];
    for (const a of ASSETS)
      if (!s.markets[a.id]) {
        s.markets[a.id] = fresh.markets[a.id];
        s.markets[a.id].bars.at(-1).day = s.day;
        s.markets[a.id].series = [
          { day: s.day, minute: s.minute, price: a.price },
        ];
      }
    for (const l of s.loans) {
      l.stage = Math.min(4, l.extensions || 0);
      l.rate = LOAN_TYPES[l.type].rate;
      l.seized = 0;
    }
    if (s.pending?.type === "debt") {
      s.pending.turn = 0;
      s.pending.transcript = [];
    }
    s.version = 5;
    s.organRecords = s.organs.map((id) => ({
      id,
      cause: "legacy",
      day: null,
      minute: null,
      cash: null,
    }));
    s.archiveNotice =
      (s.archiveNotice || "") +
      " 新增商品從升級當天開始記錄，沒有補造先前行情。";
    return s;
  }
  // Archives use compressed per-day Float32 snapshots. Trading still uses full precision.
  // Cached closed days avoid recompressing the entire 60-day archive every second.
  // Fifteen bits per safe Unicode character halve localStorage's UTF-16 overhead.
  function encodeBytes(bytes) {
    let buffer = 0,
      bits = 0,
      out = "";
    for (const byte of bytes) {
      buffer = (buffer << 8) | byte;
      bits += 8;
      while (bits >= 15) {
        bits -= 15;
        out += String.fromCharCode(0x3400 + ((buffer >>> bits) & 32767));
      }
      buffer &= (1 << bits) - 1;
    }
    const padding = bits ? 15 - bits : 0;
    if (bits) out += String.fromCharCode(0x3400 + (buffer << padding));
    return String.fromCharCode(0x3400 + padding) + out;
  }
  function decodeBytes(text) {
    const padding = text.charCodeAt(0) - 0x3400,
      bitCount = (text.length - 1) * 15 - padding;
    if (padding < 0 || padding > 14 || bitCount < 0 || bitCount % 8)
      throw Error("無效壓縮編碼");
    const bytes = new Uint8Array(bitCount / 8);
    let buffer = 0,
      bits = 0,
      index = 0;
    for (let i = 1; i < text.length; i++) {
      const value = text.charCodeAt(i) - 0x3400;
      if (value < 0 || value > 32767) throw Error("無效壓縮字元");
      buffer = (buffer << 15) | value;
      bits += 15;
      while (bits >= 8) {
        bits -= 8;
        if (index < bytes.length) bytes[index++] = (buffer >>> bits) & 255;
      }
      buffer &= (1 << bits) - 1;
    }
    return bytes;
  }
  const tapeCache = new WeakMap();
  function encodeTape(tape) {
    const groups = new Map();
    for (const p of tape) {
      if (!groups.has(p.day)) groups.set(p.day, []);
      groups.get(p.day).push(p);
    }
    let cache = tapeCache.get(tape);
    if (!cache) {
      cache = new Map();
      tapeCache.set(tape, cache);
    }
    return {
      format: "day-f32-xor15-zlib",
      days: [...groups].map(([day, points]) => {
        const last = points.at(-1),
          signature =
            points.length +
            ":" +
            last.minute +
            ":" +
            last.price +
            ":" +
            (last.kind || "");
        const prior = cache.get(day);
        if (prior?.signature === signature) return prior.chunk;
        const bytes = new Uint8Array(points.length * 6),
          view = new DataView(bytes.buffer),
          kinds = [];
        const scalar = new DataView(new ArrayBuffer(4)),
          n = points.length;
        let previous = 0;
        points.forEach((p, i) => {
          scalar.setFloat32(0, p.price, true);
          const bits = scalar.getUint32(0, true),
            delta = (bits ^ previous) >>> 0;
          // Byte planes expose the slowly changing exponent to compression.
          for (let plane = 0; plane < 4; plane++)
            bytes[plane * n + i] = (delta >>> (plane * 8)) & 255;
          view.setUint16(n * 4 + i * 2, p.minute, true);
          previous = bits;
          if (p.kind) kinds.push([i, p.kind]);
        });
        const zipped = codec.deflate(bytes),
          data = encodeBytes(zipped),
          chunk = [day, data, kinds];
        cache.set(day, { signature, chunk });
        return chunk;
      }),
    };
  }
  function decodeTape(tape) {
    if (Array.isArray(tape))
      return tape.map((p) =>
        Array.isArray(p)
          ? {
              day: p[0],
              minute: p[1],
              price: p[2],
              ...(p[3] ? { kind: p[3] } : {}),
            }
          : p,
      );
    if (
      tape?.format !== "day-f32-xor15-zlib" ||
      !Array.isArray(tape.days) ||
      tape.days.length > 60
    )
      throw Error("無效行情紀錄");
    return tape.days.flatMap(([day, data, kinds]) => {
      const zipped = decodeBytes(data),
        bytes = codec.inflate(zipped);
      if (bytes.length % 6 || bytes.length > 18000) throw Error("無效行情區塊");
      const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        ),
        labels = new Map(kinds),
        points = [];
      const scalar = new DataView(new ArrayBuffer(4)),
        n = bytes.length / 6;
      let previous = 0;
      for (let i = 0; i < n; i++) {
        let delta = 0;
        for (let plane = 0; plane < 4; plane++)
          delta |= bytes[plane * n + i] << (plane * 8);
        previous = (delta ^ previous) >>> 0;
        scalar.setUint32(0, previous, true);
        points.push({
          day,
          minute: view.getUint16(n * 4 + i * 2, true),
          price: scalar.getFloat32(0, true),
          ...(labels.has(i) ? { kind: labels.get(i) } : {}),
        });
      }
      return points;
    });
  }
  function pack(s) {
    return {
      ...s,
      equityTape: encodeTape(s.equityTape),
      markets: Object.fromEntries(
        Object.entries(s.markets).map(([id, m]) => [
          id,
          { ...m, series: encodeTape(m.series) },
        ]),
      ),
    };
  }
  function unpack(s) {
    if (!s || ![4, 5].includes(s.version)) return s;
    s.equityTape = decodeTape(s.equityTape);
    for (const m of Object.values(s.markets)) m.series = decodeTape(m.series);
    return s;
  }
  root.BillionEngine = {
    GAME_VERSION: "1.2",
    INITIAL,
    ASSETS,
    ACHIEVEMENTS,
    EVENTS,
    LOAN_TYPES,
    ORGANS,
    JOBS,
    CASINO,
    create,
    setName,
    loanRate,
    organAvailable,
    organFatal,
    support,
    collectionScene,
    collectorReply,
    collectionPenalty,
    startGamble,
    gambleAction,
    handScore,
    mineMultiplier,
    pack,
    unpack,
    value,
    equity,
    positionTotal,
    open,
    close,
    closeAll,
    borrow,
    validateBorrow,
    loanLimit,
    interest,
    repay,
    payDebt,
    mystery,
    nextDay,
    choose,
    resolveGlitch,
    sellOrgan,
    work,
    jobInput,
    quitWork,
    tick,
    migrate,
    validate,
    orderFee,
  };
})(typeof window !== "undefined" ? window : globalThis);

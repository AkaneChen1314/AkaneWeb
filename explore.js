/*
 * r6 小茜遊樂室與段落書籤。
 * 素材各有自己的展示位置；圖片放大仍由既有的視窗管理。
 * 修改造型看 looks，修改問答看 questions，配色看 explore.css。
 */
"use strict";

(() => {
  const room = document.getElementById("chibi-room");
  const looks = [
    {
      key: "uniform",
      title: "襯衫小茜",
      caption: "官方角色插畫 · 白襯衫與格紋裙",
      alt: "官方Q版黑川茜：長藍髮、白襯衫與格紋裙",
      note: "小小的身影，也有很認真的眼神。點點小茜，或選一款喜歡的造型。",
      source: "https://ichigoproduction.com/Season3/news/index00310000.html",
    },
    {
      key: "daily",
      title: "日常小茜",
      caption: "官方角色插畫 · 輕鬆的日常造型",
      alt: "官方Q版黑川茜：藍色長髮與日常外套",
      note: "換上日常造型的小茜，帶著一點俏皮的神情。今天，也留一點時間給好心情。",
      source: "https://ichigoproduction.com/Season3/news/index00310000.html",
    },
  ];
  let lookIndex = looks.findIndex((look) => look.key === "uniform");
  function chooseLook(index) {
    lookIndex = index;
    const look = looks[index];
    const photo = document.getElementById("chibi-image");
    photo.src = `assets/akane/chibi-${look.key}.webp`;
    photo.alt = look.alt;
    document.getElementById("chibi-change").setAttribute(
      "aria-label", `目前：${look.title}。切換下一款Q版黑川茜造型`,
    );
    document.getElementById("chibi-note").textContent = look.note;
    document.getElementById("chibi-art-caption").textContent = look.caption;
    document.getElementById("chibi-source").href = look.source;
    room.dataset.chibiLook = look.key;
    document.querySelectorAll("button[data-chibi-look]").forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.chibiLook === look.key),
      );
    });
  }
  document
    .getElementById("chibi-change")
    .addEventListener("click", () =>
      chooseLook((lookIndex + 1) % looks.length),
    );
  document.querySelectorAll("button[data-chibi-look]").forEach((button) => {
    button.addEventListener("click", () =>
      chooseLook(
        looks.findIndex((look) => look.key === button.dataset.chibiLook),
      ),
    );
  });
  document.querySelectorAll("[data-chibi-light]").forEach((button) => {
    if (button.tagName !== "BUTTON") return;
    button.addEventListener("click", () => {
      room.dataset.chibiLight = button.dataset.chibiLight;
      document
        .querySelectorAll("button[data-chibi-light]")
        .forEach((choice) =>
          choice.setAttribute("aria-pressed", String(choice === button)),
        );
    });
  });
  document.querySelectorAll("[data-chibi-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      document
        .querySelectorAll("[data-chibi-mode]")
        .forEach((choice) =>
          choice.setAttribute("aria-pressed", String(choice === button)),
        );
      document.querySelectorAll("[data-chibi-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.chibiPanel !== button.dataset.chibiMode;
      });
      room.dispatchEvent(new CustomEvent("chibi-mode-change", { detail: button.dataset.chibiMode }));
    });
  });

  // 記錄的是星星數量，沒有帳號，也不會改動遊戲存檔。
  let starCount = 0;
  try {
    starCount = Math.min(
      99999,
      Math.max(
        0,
        parseInt(localStorage.getItem("akane-little-stars-v1"), 10) || 0,
      ),
    );
  } catch (_) {
    /* 無法儲存時仍可在本次使用。 */
  }
  const starNotes = [
    "一顆星，送給今天認真生活的你，也送給喜歡的茜。",
    "不用急著發光，慢慢走，也是在前進。",
    "今天的小小努力，也值得被溫柔地收藏。",
    "留一點喜歡給她，也留一點休息給自己。",
    "星光收到啦。願你今天有一件值得微笑的小事。",
  ];
  document.getElementById("chibi-star-count").textContent = starCount;
  function littleSparkles() {
    const postcard = room.querySelector(".chibi-postcard");
    postcard
      .querySelectorAll(".chibi-spark")
      .forEach((spark) => spark.remove());
    if (
      matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document
        .getElementById("ambient-motion-toggle")
        .getAttribute("aria-pressed") === "false"
    )
      return;
    [14, 31, 48, 65].forEach((position, index) => {
      const spark = document.createElement("span");
      spark.className = "chibi-spark";
      spark.textContent = index % 2 ? "♡" : "✧";
      spark.setAttribute("aria-hidden", "true");
      spark.style.setProperty("--spark-x", `${position}%`);
      postcard.append(spark);
      setTimeout(() => spark.remove(), 1200);
    });
  }
  document.getElementById("chibi-star").addEventListener("click", () => {
    document.getElementById("chibi-star-note").textContent =
      starNotes[starCount % starNotes.length];
    starCount = Math.min(99999, starCount + 1);
    document.getElementById("chibi-star-count").textContent = starCount;
    try {
      localStorage.setItem("akane-little-stars-v1", String(starCount));
    } catch (_) {
      /* 不影響操作。 */
    }
    littleSparkles();
  });

  // 六顆星的位置與順序都可改。沒有計時，也不必拖曳，手機可直接點。
  const starPositions = [
    [14, 32],
    [43, 15],
    [82, 29],
    [75, 72],
    [43, 86],
    [19, 69],
  ];
  const starPaths = [
    [0, 1, 2, 3, 4, 5],
    [1, 4, 0, 3, 2, 5],
    [5, 1, 3, 0, 2, 4],
  ];
  const starButtons = [
    ...document.querySelectorAll("[data-constellation-star]"),
  ];
  const status = document.getElementById("constellation-status");
  const board = document.getElementById("constellation-board");
  const lines = document.getElementById("constellation-lines");
  let pathIndex = 0;
  let connected = 0;
  function paintConstellation() {
    const sequence = starPaths[pathIndex];
    starButtons.forEach((button, index) => {
      button.style.left = `${starPositions[index][0]}%`;
      button.style.top = `${starPositions[index][1]}%`;
      const done = sequence.slice(0, connected).includes(index);
      const next = sequence[connected] === index;
      button.classList.toggle("star-connected", done);
      button.classList.toggle("star-next", next);
      button.setAttribute("aria-pressed", String(done));
      button.setAttribute(
        "aria-label",
        `${["左上", "上方", "右上", "右下", "下方", "左下"][index]}星光${done ? "，已點亮" : next ? "，下一顆請點這裡" : ""}`,
      );
    });
    lines.replaceChildren();
    for (let i = 1; i < connected; i++) {
      const from = starPositions[sequence[i - 1]];
      const to = starPositions[sequence[i]];
      const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line",
      );
      ["x1", "y1", "x2", "y2"].forEach((key, index) =>
        line.setAttribute(key, String([...from, ...to][index])),
      );
      lines.append(line);
    }
    board.classList.toggle("constellation-complete", connected === 6);
  }
  starButtons.forEach((button, index) => {
    button.addEventListener("click", () => {
      if (connected === 6) {
        status.textContent = "這束光已完成，按「換一片星空」再玩一次。";
        return;
      }
      if (starPaths[pathIndex][connected] !== index) {
        status.textContent = "跟著最亮的那顆星就好，不用急。";
        return;
      }
      connected++;
      paintConstellation();
      status.textContent =
        connected === 6
          ? "完成了！你為小茜連起了一整束星光。"
          : `已點亮 ${connected} / 6 顆，下一顆也在等你。`;
      if (connected === 6) littleSparkles();
    });
  });
  document
    .getElementById("constellation-reset")
    .addEventListener("click", () => {
      pathIndex = (pathIndex + 1) % starPaths.length;
      connected = 0;
      paintConstellation();
      status.textContent = "換了一片星空，從最亮的那顆開始。";
    });
  paintConstellation();

  // 角色小問答只用已查證的官方基本資料。選錯也會看到答案與來源。
  const questions = [
    {
      prompt: "茜所屬的劇團叫什麼？",
      options: ["Lalalai（ララライ）", "B小町", "苺製作"],
      answer: 0,
      explanation: "茜是劇團 Lalalai 所屬的演員。",
      source: "https://ichigoproduction.com/Season1/chara/akane.html",
    },
    {
      prompt: "黑川茜的日本聲優是誰？",
      options: ["潘めぐみ", "石見舞菜香", "高橋李依"],
      answer: 1,
      explanation: "黑川茜由石見舞菜香配音。",
      source: "https://ichigoproduction.com/Season2/chara/akane.html",
    },
    {
      prompt: "在《東京 Blade》舞台劇中，茜飾演誰？",
      options: ["劍（ツルギ）", "刀鬼", "鞘姬（鞘姫）"],
      answer: 2,
      explanation: "茜在《東京 Blade》中飾演鞘姬。",
      source: "https://ichigoproduction.com/Season2/chara/akane.html",
    },
    {
      prompt: "官方 TALENT 頁記載茜的身高是？",
      options: ["163 cm", "158 cm", "170 cm"],
      answer: 0,
      explanation: "官方 TALENT 頁記載身高為 163 cm。",
      source: "https://ichigoproduction.com/talent/kurokawa.html",
    },
    {
      prompt: "第三季官方角色介紹中，茜視誰為演員上的競爭對手？",
      options: ["MEM啾", "有馬佳奈", "露比"],
      answer: 1,
      explanation: "官方介紹提到茜將有馬佳奈視為演員上的競爭對手。",
      source: "https://ichigoproduction.com/Season3/chara/akane.html",
    },
  ];
  let questionIndex = 0;
  let score = 0;
  let answered = false;
  function renderQuestion() {
    const question = questions[questionIndex];
    answered = false;
    document.getElementById("chibi-quiz-progress").textContent =
      `小茜小問答 · ${questionIndex + 1} / ${questions.length}`;
    document.getElementById("chibi-quiz-question").textContent =
      question.prompt;
    document.getElementById("chibi-quiz-feedback").textContent =
      "選一個答案，看看你認識茜多少。";
    document.getElementById("chibi-quiz-source").href = question.source;
    const next = document.getElementById("chibi-quiz-next");
    next.hidden = true;
    next.textContent =
      questionIndex === questions.length - 1 ? "再玩一輪 ↻" : "下一題 →";
    const answers = document.getElementById("chibi-quiz-answers");
    answers.replaceChildren();
    question.options.forEach((option, index) => {
      const button = document.createElement("button");
      button.textContent = option;
      button.addEventListener("click", () => {
        if (answered) return;
        answered = true;
        const correct = index === question.answer;
        if (correct) score++;
        [...answers.children].forEach((choice, i) => {
          choice.disabled = true;
          choice.classList.toggle("answer-correct", i === question.answer);
        });
        button.classList.toggle("answer-missed", !correct);
        document.getElementById("chibi-quiz-feedback").textContent =
          `${correct ? "答對了 ✦" : "這次再認識她一點 ♡"} ${question.explanation}${questionIndex === questions.length - 1 ? ` 這一輪答對 ${score} / ${questions.length} 題。` : ""}`;
        next.hidden = false;
      });
      answers.append(button);
    });
  }
  document.getElementById("chibi-quiz-next").addEventListener("click", () => {
    questionIndex++;
    if (questionIndex === questions.length) {
      questionIndex = 0;
      score = 0;
    }
    renderQuestion();
    document
      .getElementById("chibi-quiz-answers")
      .firstElementChild.focus({ preventScroll: true });
  });
  renderQuestion();

  // 四對圖案可用鍵盤或觸控翻牌；離開玩法時收回未配對的牌。
  const memoryBoard = document.getElementById("chibi-memory-board");
  const memoryStatus = document.getElementById("chibi-memory-status");
  const memorySymbols = ["✦", "☾", "♡", "☁"];
  const memoryNames = ["星星", "月亮", "愛心", "雲朵"];
  let memoryDeck = [];
  let memoryOpen = [];
  let memoryPairs = 0;
  let memoryMoves = 0;
  let memoryTimer = null;
  function paintMemoryCard(index) {
    const card = memoryDeck[index];
    const visible = card.matched || memoryOpen.includes(index);
    const button = memoryBoard.children[index];
    button.textContent = visible ? memorySymbols[card.value] : "◇";
    button.dataset.revealed = String(visible);
    button.dataset.matched = String(card.matched);
    button.setAttribute("aria-label", `第${index + 1}張，${visible ? memoryNames[card.value] : "尚未翻開"}${card.matched ? "，已配對" : ""}`);
    button.setAttribute("aria-disabled", String(card.matched));
  }
  function closeUnmatchedCards() {
    clearTimeout(memoryTimer);
    memoryTimer = null;
    const previous = memoryOpen;
    memoryOpen = [];
    previous.forEach(paintMemoryCard);
  }
  function resetMemory() {
    closeUnmatchedCards();
    memoryPairs = 0;
    memoryMoves = 0;
    memoryDeck = [...memorySymbols, ...memorySymbols].map((_, i) => ({ value: i % 4, matched: false }));
    for (let i = memoryDeck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [memoryDeck[i], memoryDeck[j]] = [memoryDeck[j], memoryDeck[i]];
    }
    memoryBoard.replaceChildren();
    memoryDeck.forEach((card, index) => {
      const button = document.createElement("button");
      button.className = "soft-button memory-card";
      button.addEventListener("click", () => {
        if (memoryTimer !== null || card.matched || memoryOpen.includes(index)) return;
        memoryOpen.push(index);
        paintMemoryCard(index);
        if (memoryOpen.length !== 2) return;
        memoryMoves++;
        const [first, second] = memoryOpen;
        const match = memoryDeck[first].value === memoryDeck[second].value;
        if (match) {
          memoryDeck[first].matched = memoryDeck[second].matched = true;
          memoryOpen = [];
          memoryPairs++;
          paintMemoryCard(first);
          paintMemoryCard(second);
          if (memoryPairs === 4) littleSparkles();
        } else {
          memoryTimer = setTimeout(closeUnmatchedCards, 800);
        }
        memoryStatus.textContent = memoryPairs === 4
          ? `四組都找到了！用了 ${memoryMoves} 次，記住了這片小小星空。`
          : `找到 ${memoryPairs} / 4 組 · 翻牌 ${memoryMoves} 次${match ? "，配對成功！" : "，再記住這兩張。"}`;
      });
      memoryBoard.append(button);
      paintMemoryCard(index);
    });
    memoryStatus.textContent = "找到 0 / 4 組 · 翻牌 0 次";
  }
  document.getElementById("chibi-memory-reset").addEventListener("click", resetMemory);
  room.addEventListener("chibi-mode-change", (event) => {
    if (event.detail !== "memory") closeUnmatchedCards();
  });
  document.addEventListener("zone-change", closeUnmatchedCards);
  document.addEventListener("lounge-visibility", closeUnmatchedCards);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) closeUnmatchedCards();
  });
  resetMemory();

  // 本館原創短句，依心情輪流抽取，避免連續看到同一句。
  const fortunes = {
    rest: ["把步調放輕一點，喜歡的事物會等你。", "今天先照顧好自己，也是一件值得收藏的事。", "留一小段空白給呼吸，再慢慢走向下一頁。"],
    courage: ["小小的一步，也能讓明天的風景不一樣。", "認真喜歡一件事的你，已經有自己的光。", "還沒做到的部分，留給下一次更勇敢的嘗試。"],
    focus: ["先完成眼前的一小格，故事就往前了一點。", "把目光放回此刻，一次做好一件事。", "不必一次看見終點，先讓今天的努力清楚一點。"],
  };
  const fortuneIndexes = { rest: 0, courage: 0, focus: 0 };
  let fortuneMood = "rest";
  document.querySelectorAll("[data-chibi-mood]").forEach((button) => {
    button.addEventListener("click", () => {
      fortuneMood = button.dataset.chibiMood;
      document.querySelectorAll("[data-chibi-mood]").forEach((choice) => choice.setAttribute("aria-pressed", String(choice === button)));
      document.getElementById("chibi-fortune-note").textContent = "心情選好了，抽一張送給現在的自己。";
    });
  });
  document.getElementById("chibi-fortune-draw").addEventListener("click", () => {
    const options = fortunes[fortuneMood];
    document.getElementById("chibi-fortune-note").textContent = options[fortuneIndexes[fortuneMood] % options.length];
    fortuneIndexes[fortuneMood]++;
    littleSparkles();
  });

  // 本館配色練習，不宣稱是官方角色色票。滑桿原生支援方向鍵。
  const colorTargets = [
    { name: "深海藍", rgb: [46, 91, 145] },
    { name: "髮梢青", rgb: [110, 200, 194] },
    { name: "暮光紫", rgb: [143, 126, 190] },
    { name: "櫻光粉", rgb: [219, 153, 183] },
  ];
  const colorSliders = [...document.querySelectorAll("[data-color-channel]")];
  let colorIndex = 0;
  const colorStatus = document.getElementById("chibi-color-status");
  function paintMixedColor() {
    const values = colorSliders.map((slider) => Number(slider.value));
    document.getElementById("chibi-color-mix").style.backgroundColor = `rgb(${values.join(",")})`;
    ["r", "g", "b"].forEach((channel, i) => { document.getElementById(`chibi-output-${channel}`).value = values[i]; });
    colorStatus.textContent = "調好了嗎？按「看看相似度」確認。";
  }
  function newColorTarget() {
    const target = colorTargets[colorIndex];
    document.getElementById("chibi-color-target").style.backgroundColor = `rgb(${target.rgb.join(",")})`;
    document.getElementById("chibi-color-name").textContent = target.name;
    document.getElementById("chibi-color-target").setAttribute("aria-label", `目標顏色：${target.name}`);
    colorSliders.forEach((slider) => { slider.value = 128; });
    document.getElementById("chibi-color-tip").hidden = true;
    paintMixedColor();
  }
  colorSliders.forEach((slider) => slider.addEventListener("input", paintMixedColor));
  document.getElementById("chibi-color-check").addEventListener("click", () => {
    const target = colorTargets[colorIndex];
    const distance = Math.hypot(...colorSliders.map((slider, i) => Number(slider.value) - target.rgb[i]));
    const similarity = Math.round(100 * (1 - distance / Math.hypot(255, 255, 255)));
    colorStatus.textContent = `相似度 ${similarity}%${similarity >= 94 ? "，配得很接近了！這一抹茜色送給你。" : "，再輕輕調整一點試試。"}`;
    if (similarity >= 94) littleSparkles();
  });
  document.getElementById("chibi-color-hint").addEventListener("click", () => {
    const tip = document.getElementById("chibi-color-tip");
    const [r, g, b] = colorTargets[colorIndex].rgb;
    tip.textContent = `調色提示：紅 R ${r}、綠 G ${g}、藍 B ${b}。也可以用方向鍵微調。`;
    tip.hidden = false;
  });
  document.getElementById("chibi-color-next").addEventListener("click", () => {
    colorIndex = (colorIndex + 1) % colorTargets.length;
    newColorTarget();
  });
  newColorTarget();

  // 閱讀超過基本介紹後才出現低調書籤，進遊戲或放大圖片時收起。
  const bookmark = document.getElementById("archive-bookmark");
  const sections = [
    ["profile", "人物檔案"],
    ["archive-compass", "閱讀路線"],
    ["design-room", "造型資料"],
    ["actor-room", "表情觀察"],
    ["little-facts", "小小知識"],
    ["portrait-room", "肖像收藏"],
    ["traits", "演員筆記"],
    ["story-notes", "成長脈絡"],
    ["gallery", "三季圖庫"],
    ["special-room", "特別收藏"],
    ["outfit-room", "造型收藏"],
    ["chibi-room", "小茜互動"],
    ["sources", "資料來源"],
  ];
  function updateBookmark() {
    const show =
      document.body.dataset.zoneView === "akane" &&
      scrollY > 500 &&
      document.getElementById("player").hidden &&
      !document.querySelector("dialog[open]");
    bookmark.hidden = !show;
    if (!show) bookmark.open = false;
    let current = sections[0];
    for (const section of sections) {
      if (
        document.getElementById(section[0]).getBoundingClientRect().top <= 230
      )
        current = section;
    }
    document.getElementById("bookmark-current").textContent = current[1];
  }
  let scrollQueued = false;
  window.addEventListener(
    "scroll",
    () => {
      if (scrollQueued) return;
      scrollQueued = true;
      requestAnimationFrame(() => {
        scrollQueued = false;
        updateBookmark();
      });
    },
    { passive: true },
  );
  document.addEventListener("zone-change", () =>
    requestAnimationFrame(updateBookmark),
  );
  document.addEventListener("lounge-visibility", updateBookmark);
  const dialogObserver = new MutationObserver(updateBookmark);
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialogObserver.observe(dialog, {
      attributes: true,
      attributeFilter: ["open"],
    }),
  );
  bookmark.querySelectorAll("a").forEach((link) =>
    link.addEventListener("click", () => {
      bookmark.open = false;
    }),
  );
  bookmark.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      bookmark.open = false;
      bookmark.querySelector("summary").focus();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (bookmark.open && !bookmark.contains(event.target))
      bookmark.open = false;
  });
  updateBookmark();
})();

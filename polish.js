/*
 * 收藏館 1.2 最後整理：無聲循環、資料頁放大與觀賞筆記。
 * 圖片不重繪；柔邊與色彩融合由 polish.css 負責。
 * 動態只在可見區域播放，切到遊戲、背景分頁或放大視窗時暫停。
 */
"use strict";

(() => {
  const clips = [...document.querySelectorAll("[data-loop-video]")];
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const motionButton = document.getElementById("motion-toggle");
  const motionStatus = document.getElementById("motion-status");
  const visibility = new Map(clips.map((video) => [video, false]));
  const MOTION_KEY = "akane-motion-enabled-v1";
  let motionEnabled = !reducedMotion.matches;
  let userChoseMotion = false;
  try {
    const saved = localStorage.getItem(MOTION_KEY);
    if (saved === "true" || saved === "false") {
      motionEnabled = saved === "true";
      userChoseMotion = true;
    }
  } catch (_) {
    // 無法儲存時，這次開啟仍可切換動態。
  }

  function loadClip(video) {
    if (video.dataset.loaded === "true") return;
    video.dataset.loaded = "true";
    video.muted = true;
    video.defaultMuted = true;
    video.preload = "metadata";
    // MP4 與 WebM 都封裝在網站裡，瀏覽器會選擇支援的格式。
    for (const [file, type] of [
      [video.dataset.mp4, "video/mp4"],
      [video.dataset.webm, "video/webm"],
    ]) {
      const source = document.createElement("source");
      source.src = file;
      source.type = type;
      video.append(source);
    }
    video.load();
  }

  function canPlayHere(video) {
    const panel = video.closest("[data-zone]");
    const correctZone = panel
      ? !panel.hidden
      : video.dataset.videoZone === document.body.dataset.zoneView;
    return (
      motionEnabled &&
      correctZone &&
      visibility.get(video) &&
      !document.hidden &&
      !document.body.classList.contains("playing") &&
      !document.querySelector("dialog[open]")
    );
  }

  function showRetry(video, blocked) {
    const button = video
      .closest(".loop-card")
      ?.querySelector("[data-play-clip]");
    if (button) button.hidden = !blocked;
  }

  function updateClip(video) {
    if (!canPlayHere(video)) {
      video.pause();
      video.dataset.playback = "paused";
      return;
    }
    loadClip(video);
    if (!video.paused) return;
    video.dataset.playback = "loading";
    const attempt = video.play();
    if (attempt)
      attempt.catch((error) => {
        // 切專區時，尚未完成的播放請求會被取消，這是正常狀態。
        if (error.name === "AbortError" || !canPlayHere(video)) return;
        video.dataset.playback = "blocked";
        showRetry(video, true);
      });
  }

  function updateMotion() {
    clips.forEach(updateClip);
    motionButton.setAttribute("aria-pressed", String(motionEnabled));
    motionButton.firstChild.textContent = motionEnabled
      ? "暫停動態 "
      : "播放動態 ";
    motionButton.querySelector("span").textContent = motionEnabled ? "Ⅱ" : "▷";
    motionStatus.textContent = motionEnabled
      ? "無聲循環 · 慢慢欣賞"
      : "動態已暫停 · 靜靜欣賞畫面";
  }

  function chooseMotion(enabled) {
    motionEnabled = enabled;
    userChoseMotion = true;
    try {
      localStorage.setItem(MOTION_KEY, String(enabled));
    } catch (_) {
      // 不影響本次操作。
    }
    updateMotion();
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        visibility.set(target, isIntersecting);
        updateClip(target);
      });
    },
    { threshold: 0.08 },
  );

  clips.forEach((video) => {
    // 靜態預覽同時作為底圖，手機暫停影片的繪圖層時也不會空白。
    video.style.backgroundImage = `url("${video.getAttribute("poster")}")`;
    video.muted = true;
    video.addEventListener("playing", () => {
      video.dataset.playback = "playing";
      showRetry(video, false);
    });
    video.addEventListener("error", () => {
      video.dataset.playback = "unavailable";
      showRetry(video, true);
      // 無法解碼時，封裝的靜態預覽仍保留，版面不會空白。
    });
    observer.observe(video);
  });
  motionButton.addEventListener("click", () => chooseMotion(!motionEnabled));
  document.querySelectorAll("[data-play-clip]").forEach((button) => {
    button.addEventListener("click", () => {
      chooseMotion(true);
      updateClip(button.closest(".loop-card").querySelector("video"));
    });
  });
  document.addEventListener("visibilitychange", updateMotion);
  document.addEventListener("lounge-visibility", updateMotion);
  document.addEventListener("zone-change", updateMotion);
  reducedMotion.addEventListener("change", () => {
    if (!userChoseMotion) motionEnabled = !reducedMotion.matches;
    updateMotion();
  });
  const dialogObserver = new MutationObserver(updateMotion);
  document.querySelectorAll("dialog").forEach((dialog) =>
    dialogObserver.observe(dialog, {
      attributes: true,
      attributeFilter: ["open"],
    }),
  );
  updateMotion();

  // 設定頁：保留完整內容，原始尺寸可在視窗內左右查看。
  const reference = document.getElementById("reference-viewer");
  const referenceImage = document.getElementById("reference-image");
  const sizeButton = document.getElementById("reference-size");
  const openReference = document.getElementById("open-reference");
  openReference.addEventListener("click", () => {
    referenceImage.classList.remove("original-size");
    sizeButton.setAttribute("aria-pressed", "false");
    sizeButton.textContent = "看原始尺寸 ↗";
    reference.showModal();
    document.querySelector(".reference-scroll").scrollTo(0, 0);
  });
  document
    .getElementById("close-reference")
    .addEventListener("click", () => reference.close());
  sizeButton.addEventListener("click", () => {
    const original = referenceImage.classList.toggle("original-size");
    sizeButton.setAttribute("aria-pressed", String(original));
    sizeButton.textContent = original ? "縮回畫面 ↙" : "看原始尺寸 ↗";
  });
  reference.addEventListener("close", () =>
    openReference.focus({ preventScroll: true }),
  );
  reference.addEventListener("click", (event) => {
    if (event.target !== reference) return;
    const bounds = reference.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      reference.close();
  });

  // 這些是本館的圖片觀賞筆記，不是角色台詞或官方逐字翻譯。
  const designNotes = {
    expression: {
      number: "01 / EXPRESSION",
      title: "同一張臉，藏著很多情緒。",
      description:
        "這份資料把驚訝、微笑、低落與側臉放在一起。可以先看眉毛的角度，再看眼睛與嘴角，感受小小變化如何讓人物的情緒變得不同。",
    },
    costume: {
      number: "02 / COSTUME",
      title: "從輪廓裡，看見造型的性格。",
      description:
        "紫色連身裙、較輕透的袖子、星形飾物與裙襬的層次，組成這份資料中的造型。正面、側面與背面一起看，更容易理解服裝和髮型的整體輪廓。",
    },
    color: {
      number: "03 / COLOR",
      title: "她的藍，不只有一種藍。",
      description:
        "深藍與藍紫是髮色的主調，較亮的髮尾和冷色高光讓髮絲更輕盈。資料裡也有偏暖的紅色光影：同一個角色，在不同光線下能帶出不同的情緒。",
    },
  };
  document.querySelectorAll("[data-design-note]").forEach((button) => {
    button.addEventListener("click", () => {
      const note = designNotes[button.dataset.designNote];
      document
        .querySelectorAll("[data-design-note]")
        .forEach((choice) =>
          choice.setAttribute("aria-pressed", String(choice === button)),
        );
      document.getElementById("design-note-number").textContent = note.number;
      document.getElementById("design-note-title").textContent = note.title;
      document.getElementById("design-note-description").textContent =
        note.description;
      document.querySelector(".design-room").dataset.detail =
        button.dataset.designNote;
    });
  });

  const viewingNotes = [
    [
      "今天，先看她的眼神。",
      "同樣是微笑，目光停留的位置不同，感覺也會跟著改變。試著在三季圖庫裡找一張讓你停下來的畫面。",
    ],
    [
      "今天，跟著光線走。",
      "暖色讓日常多一點溫度，冷色讓夜晚多一點安靜。看看同樣的藍髮，如何在不同光影裡變化。",
    ],
    [
      "今天，留意舞台上的她。",
      "換上鞘姬的造型，髮色、衣裝和表情都有不同。第二季的舞台圖片，很適合慢慢對照。",
    ],
    [
      "今天，收藏一個小小的表情。",
      "不必選最華麗的一幕。微笑、回望或驚訝的反應，都能成為你想再看一次的畫面。",
    ],
    [
      "今天，把三季連成一段旅程。",
      "從第一季的節目，到第二季的舞台，再走進第三季的日常與演出。按話數往下看，收藏不同時期的茜。",
    ],
  ];
  let viewingIndex = 0;
  document.getElementById("next-viewing-note").addEventListener("click", () => {
    viewingIndex = (viewingIndex + 1) % viewingNotes.length;
    document.getElementById("viewing-title").textContent =
      viewingNotes[viewingIndex][0];
    document.getElementById("viewing-description").textContent =
      viewingNotes[viewingIndex][1];
    document.querySelector(".curator-note").dataset.note = viewingIndex;
  });
})();

/*
 * 黑川茜專區：圖庫篩選、收藏、放大檢視與舞台光效開關。
 * 分季、集數與圖片內容在 gallery-data.js；圖片放在 assets/akane/。
 */
"use strict";

(() => {
  // 資料與互動分開。null 話數的立繪排在各季劇照之後。
  const galleryItems = window.AkaneGalleryItems.slice().sort(
    (a, b) =>
      a.season - b.season ||
      (a.episode ?? Infinity) - (b.episode ?? Infinity) ||
      a.order - b.order,
  );
  const seasonNames = { 1: "第一季", 2: "第二季", 3: "第三季" };
  const seasonInfo = {
    1: {
      range: "1–11",
      title: "在節目中被看見",
      description: "從初次相遇到眼中的星光，按官方播出話數收藏茜的片段。",
    },
    2: {
      range: "12–24",
      title: "讓舞台留下她的光",
      description: "排練、兒時的憧憬與鞘姬演出，沿著第二季的鏡頭慢慢前進。",
    },
    3: {
      range: "25–35",
      title: "鏡頭前後的溫度",
      description: "第三季的日常、演出與細微心緒，留下長髮漸層藍的不同瞬間。",
    },
  };
  function episodeLabel(item) {
    if (item.type === "visual")
      return `${seasonNames[item.season]} · 官方立繪／不指定話數`;
    const offset = { 1: 0, 2: 11, 3: 24 }[item.season];
    return `${seasonNames[item.season]}第 ${item.episode - offset} 話${item.season === 1 ? "" : `／總第 ${item.episode} 話`}`;
  }
  const FAVORITE_KEY = "akane-archive-favorites-v1";
  let favorites = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(FAVORITE_KEY) || "[]");
    if (Array.isArray(saved))
      favorites = new Set(
        saved.filter((id) => galleryItems.some((item) => item.id === id)),
      );
  } catch (_) {
    /* 瀏覽器不允許儲存時，仍可使用本次收藏。 */
  }
  let currentFilter = "all";
  let currentSeason = 1;
  let currentEpisode = "all";
  let currentImage = 0;
  let viewerSequence = galleryItems;
  let lastImageTrigger = null;
  const gallery = document.getElementById("akane-gallery");
  const viewer = document.getElementById("image-viewer");
  const status = document.getElementById("gallery-status");

  // 固定的文字與網址來自本檔，沒有把外部輸入放入 HTML。
  galleryItems.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = `gallery-card gallery-${item.type}`;
    card.dataset.imageId = item.id;
    card.dataset.season = item.season;
    card.dataset.episode = item.episode ?? "visual";
    card.innerHTML = `
      <button
        class="gallery-image-button"
        data-open-image="${item.id}"
        aria-label="放大：${item.title}"
      >
        <span class="gallery-number">${String(index + 1).padStart(2, "0")}</span>
        <img
          src="assets/akane/${item.id}.webp"
          alt="${item.title}，黑川茜官方${item.type === "visual" ? "立繪" : "劇照"}"
          width="${item.width}"
          height="${item.height}"
          loading="lazy"
        />
        <span class="image-zoom" aria-hidden="true">↗</span>
      </button>
      <div class="gallery-card-content">
        <p class="gallery-label">${episodeLabel(item)}</p>
        <h3>${item.title}</h3>
        <p>${item.description}</p>
        <div class="gallery-card-footer">
          <a href="${item.source}" target="_blank" rel="noopener noreferrer">
            官方原頁 ↗
          </a>
          <button
            data-favorite="${item.id}"
            aria-label="收藏：${item.title}"
            aria-pressed="false"
          >
            <span aria-hidden="true">♡</span>
          </button>
        </div>
      </div>
    `;
    document.getElementById(`${item.type}-gallery`).append(card);
  });

  function filteredImages() {
    return galleryItems.filter(
      (item) =>
        item.season === currentSeason &&
        (currentEpisode === "all" || item.episode === Number(currentEpisode)) &&
        (currentFilter === "all" ||
          item.type === currentFilter ||
          (currentFilter === "saved" && favorites.has(item.id))),
    );
  }

  function chooseSeason(season) {
    currentSeason = Number(season);
    currentEpisode = "all";
    const info = seasonInfo[currentSeason];
    document
      .querySelectorAll("button[data-season]")
      .forEach((button) =>
        button.setAttribute(
          "aria-pressed",
          String(Number(button.dataset.season) === currentSeason),
        ),
      );
    document.getElementById("season-range").textContent =
      `SEASON 0${currentSeason} / 全季總第 ${info.range} 話`;
    document.getElementById("season-title").textContent =
      `${seasonNames[currentSeason]} · ${info.title}`;
    document.getElementById("season-description").textContent =
      info.description;
    const select = document.getElementById("episode-select");
    select.replaceChildren(new Option("這一季的所有圖片", "all"));
    const episodes = [
      ...new Set(
        galleryItems
          .filter(
            (item) => item.season === currentSeason && item.episode !== null,
          )
          .map((item) => item.episode),
      ),
    ];
    episodes.forEach((episode) =>
      select.add(
        new Option(
          episodeLabel({ season: currentSeason, episode, type: "still" }),
          String(episode),
        ),
      ),
    );
    updateGallery();
  }
  function updateGallery(message = "") {
    const shown = filteredImages();
    gallery.querySelectorAll(".gallery-card").forEach((card) => {
      card.hidden = !shown.some((item) => item.id === card.dataset.imageId);
    });
    gallery.querySelectorAll("[data-favorite]").forEach((button) => {
      const saved = favorites.has(button.dataset.favorite);
      button.setAttribute("aria-pressed", String(saved));
      button.querySelector("span").textContent = saved ? "♥" : "♡";
    });
    document.getElementById("favorite-count").textContent = favorites.size;
    document.getElementById("season-total").textContent = galleryItems.filter(
      (item) => item.season === currentSeason,
    ).length;
    document.getElementById("season-favorite-count").textContent =
      galleryItems.filter(
        (item) => item.season === currentSeason && favorites.has(item.id),
      ).length;
    document.getElementById("still-section").hidden = !shown.some(
      (item) => item.type === "still",
    );
    document.getElementById("visual-section").hidden = !shown.some(
      (item) => item.type === "visual",
    );
    status.textContent =
      message ||
      (shown.length
        ? `${seasonNames[currentSeason]} · 顯示 ${shown.length} 張${currentEpisode === "all" ? "，依話數排序" : `，總第 ${currentEpisode} 話`}。`
        : currentFilter === "saved"
          ? "這一季還沒有收藏符合條件的圖片。按愛心留下喜歡的瞬間，或切換到其他季查看。"
          : "這個篩選條件沒有圖片。試試其他話數，或切回「本季全部」。");
  }

  function toggleFavorite(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    let message = favorites.has(id) ? "已加入收藏。" : "已移出收藏。";
    try {
      localStorage.setItem(FAVORITE_KEY, JSON.stringify([...favorites]));
    } catch (_) {
      message += "此瀏覽器目前無法儲存，收藏只保留在這次開啟期間。";
    }
    updateGallery(message);
    updateViewerFavorite();
  }

  function updateViewerFavorite() {
    const item = viewerSequence[currentImage];
    if (!item) return;
    const button = document.getElementById("viewer-favorite");
    const saved = favorites.has(item.id);
    button.setAttribute("aria-pressed", String(saved));
    button.textContent = saved ? "♥ 已收藏" : "♡ 收藏這張";
  }

  function showViewerImage() {
    const item = viewerSequence[currentImage];
    document.getElementById("viewer-art").style.backgroundImage =
      `url("assets/akane/${item.id}.webp")`;
    document.getElementById("viewer-art").setAttribute("role", "img");
    document
      .getElementById("viewer-art")
      .setAttribute("aria-label", item.title);
    document.getElementById("viewer-title").textContent = item.title;
    document.getElementById("viewer-description").textContent =
      item.description;
    document.getElementById("viewer-type").textContent = episodeLabel(item);
    document.getElementById("viewer-source").href = item.source;
    document.getElementById("viewer-counter").textContent =
      `${currentImage + 1} / ${viewerSequence.length}`;
    updateViewerFavorite();
  }

  function stepViewer(direction) {
    currentImage =
      (currentImage + direction + viewerSequence.length) %
      viewerSequence.length;
    showViewerImage();
  }

  gallery.addEventListener("click", (event) => {
    const favorite = event.target.closest("[data-favorite]");
    if (favorite) return toggleFavorite(favorite.dataset.favorite);
    const trigger = event.target.closest("[data-open-image]");
    if (!trigger) return;
    lastImageTrigger = trigger;
    viewerSequence = filteredImages();
    currentImage = viewerSequence.findIndex(
      (item) => item.id === trigger.dataset.openImage,
    );
    showViewerImage();
    viewer.showModal();
  });
  document.querySelectorAll("[data-gallery-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      currentFilter = button.dataset.galleryFilter;
      document
        .querySelectorAll("[data-gallery-filter]")
        .forEach((choice) =>
          choice.setAttribute("aria-pressed", String(choice === button)),
        );
      updateGallery();
    });
  });
  document
    .getElementById("previous-image")
    .addEventListener("click", () => stepViewer(-1));
  document
    .getElementById("next-image")
    .addEventListener("click", () => stepViewer(1));
  document
    .getElementById("viewer-favorite")
    .addEventListener("click", () =>
      toggleFavorite(viewerSequence[currentImage].id),
    );
  document
    .getElementById("close-viewer")
    .addEventListener("click", () => viewer.close());
  viewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      stepViewer(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      stepViewer(1);
    }
  });
  viewer.addEventListener("click", (event) => {
    if (event.target !== viewer) return;
    const bounds = viewer.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      viewer.close();
  });
  viewer.addEventListener("close", () => {
    if (lastImageTrigger?.isConnected && !lastImageTrigger.closest("[hidden]"))
      lastImageTrigger.focus({ preventScroll: true });
  });
  document.getElementById("stage-toggle").addEventListener("click", (event) => {
    const enabled = document.body.classList.toggle("stage-on");
    event.currentTarget.setAttribute("aria-pressed", String(enabled));
    document.dispatchEvent(new Event("stage-effect-change"));
  });
  document
    .querySelectorAll("button[data-season]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        chooseSeason(button.dataset.season),
      ),
    );
  document.querySelectorAll("[data-jump-season]").forEach((link) =>
    link.addEventListener("click", () => {
      currentFilter = "all";
      document
        .querySelectorAll("[data-gallery-filter]")
        .forEach((button) =>
          button.setAttribute(
            "aria-pressed",
            String(button.dataset.galleryFilter === "all"),
          ),
        );
      chooseSeason(link.dataset.jumpSeason);
    }),
  );
  document
    .getElementById("episode-select")
    .addEventListener("change", (event) => {
      currentEpisode = event.target.value;
      updateGallery();
    });
  chooseSeason(1);
})();

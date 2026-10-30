/* 表情觀察室的資料與互動。動畫播放統一交由 polish.js 管理。 */
"use strict";

(() => {
  const notes = {
    wink: {
      image: "s2-ep16-1",
      alt: "第16話黑川茜眨眼並比出手勢",
      season: 2,
      episode: 16,
      label: "01 / A LITTLE WINK",
      title: "認真之外，也有一點俏皮。",
      description:
        "眨一下眼睛、比一個小手勢，平常認真的茜，也有輕快的表情。可以留意同一張臉如何隨眉毛、嘴角與目光，展現不同的感覺。",
    },
    smile: {
      image: "s2-ep13-4",
      alt: "第13話黑川茜露出微笑的近景",
      season: 2,
      episode: 13,
      label: "02 / AN EVERYDAY SMILE",
      title: "一點小小的開心，也想收藏。",
      description:
        "嘴角的微笑和青綠的眼睛，讓近景多了一點輕鬆。日常的茜也很值得收藏：不需要舞台服裝，小小的表情就能讓人記住她。",
    },
    stage: {
      image: "performance",
      alt: "第18話黑川茜以淺色長髮的鞘姬造型演出",
      season: 2,
      episode: 18,
      label: "03 / INTO THE SPOTLIGHT",
      title: "換上造型，走進另一個角色。",
      description:
        "《東京 Blade》中的鞘姬，是茜作為演員的一種面貌。可以對照她的私服劇照，看看服裝、目光與身體姿態，如何把觀眾帶進角色的世界。",
    },
  };
  let selectedNote = notes.wink;
  const image = document.getElementById("actor-room-image");

  document.querySelectorAll("[data-actor-note]").forEach((button) => {
    button.addEventListener("click", () => {
      const note = notes[button.dataset.actorNote];
      selectedNote = note;
      image.src = `assets/akane/${note.image}.webp`;
      image.alt = note.alt;
      document.getElementById("actor-room-caption").textContent =
        `${note.season === 2 ? "第二季" : "第三季"} · 總第${note.episode}話 / ${note.label.split(" / ")[1]}`;
      document.getElementById("actor-room-label").textContent = note.label;
      document.getElementById("actor-room-subtitle").textContent = note.title;
      document.getElementById("actor-room-description").textContent =
        note.description;
      document.getElementById("actor-room-source").href =
        `https://ichigoproduction.com/Season${note.season}/story/${note.episode}.html`;
      document.querySelectorAll("[data-actor-note]").forEach((choice) => {
        choice.setAttribute("aria-pressed", String(choice === button));
      });
    });
  });

  // 使用既有季數與話數選單，收藏、放大檢視和排序都沿用原本互動。
  document
    .getElementById("actor-room-gallery")
    .addEventListener("click", () => {
      document.querySelector(`[data-season="${selectedNote.season}"]`).click();
      document.querySelector('[data-gallery-filter="all"]').click();
      location.hash = "gallery";
      document
        .getElementById("gallery")
        .scrollIntoView({ behavior: "instant" });
    });

  // 橫幅與直幅各自循環，來源和編號永遠跟隨目前圖片。
  const specialArts = [
    {
      key: "newyear",
      image: "newyear-2025",
      title: "新年和服的茜",
      date: "2025.01 / NEW YEAR",
      source: "https://ichigoproduction.com/Season2/news/index01340000.html",
    },
    {
      key: "halloween",
      image: "halloween-2025",
      title: "星光魔女的茜",
      date: "2025.10 / HALLOWEEN",
      source: "https://ichigoproduction.com/Season3/news/index00510000.html",
    },
    {
      key: "christmas",
      image: "christmas-2023",
      title: "冬日燈光裡的茜",
      date: "2023.12 / CHRISTMAS",
      source: "https://ichigoproduction.com/Season1/news/index00950000.html",
    },
    {
      key: "sakura-kimono",
      image: "sakura-kimono",
      title: "春櫻和服的茜",
      date: "SAKURA / KIMONO ILLUSTRATION",
      source: "https://wall.alphacoders.com/big.php?i=1408487",
      sourceLabel: "圖片出處 ↗",
    },
  ];
  const specialViewer = document.getElementById("special-viewer");
  const portraitArts = [
    {
      key: "puzzle-casual", image: "puzzle-casual", label: "日常星光",
      title: "讓日常，也有一點星光。", date: "PUZZLE STAR / CASUAL PORTRAIT",
      description: "輕攏長髮的瞬間，像把喧鬧留在畫面之外。棕色與米白襯著她的藍，簡單的日常，也讓人想多停留一下。",
      outfit: "棕色針織 × 淺色洋裝", detail: "輕揚髮梢與青綠色眼眸",
      alt: "黑川茜穿棕色上衣與淺色洋裝，輕攏藍色長髮的官方私服肖像",
      width: 720, height: 1040, source: "https://oshinoko-puzzle.com/",
    },
    {
      key: "raindrops", image: "portrait-raindrops", label: "雨後花語",
      title: "雨滴停下，留住一抹清新。", date: "PUZZLE STAR / RAINY DROPS",
      description: "繡球花與雨光之間，藍綠色的裙襬接住清透的光。看看髮飾、緞帶與指尖的雨滴，收藏一個安靜又鮮明的茜。",
      outfit: "藍綠洋裝 × 花朵髮飾", detail: "繡球花、雨滴與透亮的綠意",
      alt: "黑川茜穿藍綠洋裝，在雨後的繡球花旁伸手接住雨滴的官方插畫",
      width: 899, height: 1221, source: "https://group.kadokawa.co.jp/information/promotional_topics/article-15016.html",
    },
    {
      key: "anniversary", image: "portrait-anniversary", label: "糖彩慶典",
      title: "把今天，裝飾成喜歡的顏色。", date: "PUZZLE STAR / HALF ANNIVERSARY",
      description: "彩帶、星星與甜點包圍著笑容，紫色禮服也多了糖果般的細節。從日常換到慶典，仍是那個讓人想停下目光的茜。",
      outfit: "紫色禮服 × 糖果色配件", detail: "星形髮夾與手中的慶典甜點",
      alt: "黑川茜穿紫色慶典禮服，手捧半周年甜點，背景有彩帶與星星的官方插畫",
      width: 899, height: 1221, source: "https://group.kadokawa.co.jp/information/promotional_topics/article-15579.html",
    },
  ];
  let portraitIndex = 0;
  const portraitRoom = document.getElementById("portrait-room");
  function setPortraitImage(photo, art) {
    photo.src = `assets/akane/${art.image}.webp`;
    photo.alt = art.alt;
    photo.width = art.width;
    photo.height = art.height;
  }
  function choosePortrait(index) {
    portraitIndex = (index + portraitArts.length) % portraitArts.length;
    const art = portraitArts[portraitIndex];
    portraitRoom.dataset.portrait = art.key;
    setPortraitImage(document.getElementById("portrait-image"), art);
    portraitRoom.querySelector(".portrait-art").setAttribute("aria-label", `放大：${art.label}，黑川茜完整肖像`);
    document.getElementById("portrait-room-title").textContent = art.title;
    document.getElementById("portrait-description").textContent = art.description;
    document.getElementById("portrait-outfit").textContent = art.outfit;
    document.getElementById("portrait-detail").textContent = art.detail;
    document.getElementById("portrait-source").href = art.source;
    document.getElementById("portrait-counter").textContent = `${portraitIndex + 1} / ${portraitArts.length} · ${art.label}`;
    document.querySelectorAll("[data-portrait-choice]").forEach((button, i) => {
      button.setAttribute("aria-pressed", String(i === portraitIndex));
    });
  }
  document.querySelectorAll("[data-portrait-choice]").forEach((button, i) => {
    button.addEventListener("click", () => choosePortrait(i));
  });
  portraitRoom.querySelector(".portrait-choices").addEventListener("keydown", (event) => {
    if (!event.target.matches("[data-portrait-choice]")) return;
    const current = [...document.querySelectorAll("[data-portrait-choice]")].indexOf(event.target);
    let next;
    if (event.key === "ArrowLeft") next = current - 1;
    else if (event.key === "ArrowRight") next = current + 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = portraitArts.length - 1;
    else return;
    event.preventDefault();
    choosePortrait(next);
    document.querySelectorAll("[data-portrait-choice]")[portraitIndex].focus({ preventScroll: true });
  });
  document.getElementById("portrait-previous").addEventListener("click", () => choosePortrait(portraitIndex - 1));
  document.getElementById("portrait-next").addEventListener("click", () => choosePortrait(portraitIndex + 1));
  choosePortrait(0);
  let portraitMode = false;
  let specialIndex = 0;
  let specialTrigger = null;
  function showSpecial() {
    const art = portraitMode ? portraitArts[portraitIndex] : specialArts[specialIndex];
    specialViewer.dataset.art = art.key;
    const photo = document.getElementById("special-viewer-image");
    photo.src = `assets/akane/${art.image}.webp`;
    photo.alt = `黑川茜圖片：${art.title}`;
    document.getElementById("special-viewer-title").textContent = art.title;
    document.getElementById("special-viewer-date").textContent = art.date;
    document.getElementById("special-viewer-counter").textContent =
      portraitMode ? `肖像 ${portraitIndex + 1} / ${portraitArts.length}` : `${specialIndex + 1} / ${specialArts.length}`;
    document.getElementById("special-viewer-source").href = art.source;
    document.getElementById("special-viewer-source").textContent = art.sourceLabel || "官方原頁 ↗";
  }
  function moveSpecial(direction) {
    if (portraitMode) choosePortrait(portraitIndex + direction);
    else specialIndex = (specialIndex + direction + specialArts.length) % specialArts.length;
    showSpecial();
  }
  document.querySelectorAll("[data-special-art]").forEach((button) => {
    button.addEventListener("click", () => {
      portraitMode = false;
      specialIndex = specialArts.findIndex(
        (art) => art.key === button.dataset.specialArt,
      );
      specialTrigger = button;
      showSpecial();
      specialViewer.showModal();
    });
  });
  document.querySelectorAll("[data-portrait-open]").forEach((button) => {
    button.addEventListener("click", () => {
      portraitMode = true;
      specialTrigger = button;
      showSpecial();
      specialViewer.showModal();
    });
  });
  specialViewer
    .querySelector(".dialog-close")
    .addEventListener("click", () => specialViewer.close());
  document
    .getElementById("special-previous")
    .addEventListener("click", () => moveSpecial(-1));
  document
    .getElementById("special-next")
    .addEventListener("click", () => moveSpecial(1));
  specialViewer.addEventListener("keydown", (event) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveSpecial(event.key === "ArrowLeft" ? -1 : 1);
    }
  });
  specialViewer.addEventListener("close", () =>
    specialTrigger?.focus({ preventScroll: true }),
  );
})();

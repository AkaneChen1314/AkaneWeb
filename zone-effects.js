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

  // 節慶插畫獨立收藏，不混入動畫話數時間線。
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
  ];
  const specialViewer = document.getElementById("special-viewer");
  let specialIndex = 0;
  let specialTrigger = null;
  function showSpecial() {
    const art = specialArts[specialIndex];
    const photo = document.getElementById("special-viewer-image");
    photo.src = `assets/akane/${art.image}.webp`;
    photo.alt = `官方黑川茜插畫：${art.title}`;
    document.getElementById("special-viewer-title").textContent = art.title;
    document.getElementById("special-viewer-date").textContent = art.date;
    document.getElementById("special-viewer-counter").textContent =
      `${specialIndex + 1} / ${specialArts.length}`;
    document.getElementById("special-viewer-source").href = art.source;
  }
  function moveSpecial(direction) {
    specialIndex =
      (specialIndex + direction + specialArts.length) % specialArts.length;
    showSpecial();
  }
  document.querySelectorAll("[data-special-art]").forEach((button) => {
    button.addEventListener("click", () => {
      specialIndex = specialArts.findIndex(
        (art) => art.key === button.dataset.specialArt,
      );
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

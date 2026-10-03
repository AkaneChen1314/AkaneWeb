/* Blue World r10：輕量光色切換，沒有帳號，也不影響遊戲存檔。 */
"use strict";
(() => {
  const choices = [...document.querySelectorAll("[data-world-tone]")];
  const note = document.getElementById("world-tone-note");
  const messages = {
    ocean: "讓星光慢慢流過，留一點時間給喜歡。",
    twilight: "舞台燈暗下來，故事還在暮光裡繼續。",
    petal: "一點櫻色，一點溫柔，今天也有新的光。",
  };
  const key = "blue-world-tone-v1";
  function select(tone) {
    if (!messages[tone]) tone = "ocean";
    document.body.dataset.worldTone = tone;
    choices.forEach((button) => {
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.worldTone === tone),
      );
    });
    note.textContent = messages[tone];
    try {
      localStorage.setItem(key, tone);
    } catch (_) {}
  }
  let saved = "ocean";
  try {
    saved = localStorage.getItem(key) || saved;
  } catch (_) {}
  select(saved);
  choices.forEach((button) =>
    button.addEventListener("click", () => select(button.dataset.worldTone)),
  );
})();

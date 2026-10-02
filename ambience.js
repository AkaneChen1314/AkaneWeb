/*
 * 首頁星光與滑鼠光暈。
 * 手機與「減少動態效果」只畫靜態星空；進入遊戲或切換分頁即暫停。
 * 可調整 STAR_COUNT 改變星星數量，請避免大量粒子拖慢遊戲。
 */
"use strict";

(() => {
  const STAR_COUNT = 64;
  const canvas = document.getElementById("star-field");
  const context = canvas.getContext("2d");
  if (!context) return;
  const scene = document.querySelector(".ambient-scene");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let stars = [];
  let animationFrame = 0;
  let pointerFrame = 0;
  let pointer = null;
  let hoveredCard = null;

  function resizeStars() {
    width = innerWidth;
    height = innerHeight;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    stars = Array.from({ length: width < 680 ? 32 : STAR_COUNT }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: 0.5 + Math.random() * 1.1,
      phase: Math.random() * Math.PI * 2,
    }));
    updateAnimation();
  }

  function drawStars(time = 0) {
    context.clearRect(0, 0, width, height);
    stars.forEach((star) => {
      const brightness =
        0.3 + (Math.sin(time * 0.00055 + star.phase) + 1) * 0.18;
      context.fillStyle = `rgba(157, 210, 255, ${brightness})`;
      context.beginPath();
      context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
      context.fill();
      if (pointer && Math.hypot(star.x - pointer.x, star.y - pointer.y) < 125) {
        context.strokeStyle = "rgba(120, 197, 255, 0.13)";
        context.beginPath();
        context.moveTo(star.x, star.y);
        context.lineTo(pointer.x, pointer.y);
        context.stroke();
      }
    });
  }

  function animate(time) {
    drawStars(time);
    animationFrame = requestAnimationFrame(animate);
  }

  // 同時只維持一條動畫；手機、遊戲中與背景分頁都不執行循環。
  function updateAnimation() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    const visible =
      !document.hidden && !document.body.classList.contains("playing");
    const shouldAnimate =
      visible && finePointer.matches && !reducedMotion.matches;
    canvas.dataset.animated = String(shouldAnimate);
    drawStars();
    if (shouldAnimate) animationFrame = requestAnimationFrame(animate);
  }

  document.addEventListener(
    "pointermove",
    (event) => {
      if (
        !finePointer.matches ||
        reducedMotion.matches ||
        document.body.classList.contains("playing")
      )
        return;
      pointer = { x: event.clientX, y: event.clientY };
      hoveredCard = event.target.closest(".game-card");
      if (pointerFrame) return;
      pointerFrame = requestAnimationFrame(() => {
        pointerFrame = 0;
        if (!pointer) return;
        scene.style.setProperty("--pointer-x", `${pointer.x}px`);
        scene.style.setProperty("--pointer-y", `${pointer.y}px`);
        document.body.classList.add("pointer-active");
        if (hoveredCard) {
          const bounds = hoveredCard.getBoundingClientRect();
          hoveredCard.style.setProperty(
            "--card-x",
            `${pointer.x - bounds.left}px`,
          );
          hoveredCard.style.setProperty(
            "--card-y",
            `${pointer.y - bounds.top}px`,
          );
        }
      });
    },
    { passive: true },
  );

  document.documentElement.addEventListener("pointerleave", () => {
    pointer = null;
    document.body.classList.remove("pointer-active");
  });
  document.addEventListener("visibilitychange", updateAnimation);
  document.addEventListener("lounge-visibility", updateAnimation);
  finePointer.addEventListener("change", updateAnimation);
  reducedMotion.addEventListener("change", updateAnimation);
  window.addEventListener("resize", resizeStars, { passive: true });
  resizeStars();
})();

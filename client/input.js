// Controls: WASD / arrows + Space or Shift to dash on desktop; a floating thumb-stick (left side
// of the screen) and a SLIDE button on phones. read() returns screen-space axes and the dash flag.

export function createInput() {
  const keys = new Set();
  addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT") return;
    keys.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Shift")) tapDash();
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  });
  addEventListener("keyup", (e) => keys.delete(e.code));
  addEventListener("blur", () => keys.clear());

  // A tap only lasts a moment; keep dash "held" briefly so it is never lost between frames.
  let dashUntil = 0;
  const tapDash = () => (dashUntil = performance.now() + 150);

  const base = Object.assign(document.createElement("div"), { className: "joy" });
  const knob = Object.assign(document.createElement("div"), { className: "joy-knob" });
  base.append(knob);
  const dashBtn = Object.assign(document.createElement("button"), { className: "dash-btn", textContent: "SLIDE" });
  const pad = Object.assign(document.createElement("div"), { className: "touch", hidden: true });
  pad.append(base, dashBtn);
  document.body.append(pad);

  let stick = null; // { id, ox, oy, x, y }
  const RADIUS = 56;
  pad.addEventListener("pointerdown", (e) => {
    if (e.target === dashBtn) return;
    if (stick) return;
    stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 };
    base.style.left = `${e.clientX}px`;
    base.style.top = `${e.clientY}px`;
    base.classList.add("on");
    knob.style.transform = "translate(-50%, -50%)";
  });
  pad.addEventListener("pointermove", (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    let dx = e.clientX - stick.ox;
    let dy = e.clientY - stick.oy;
    const d = Math.hypot(dx, dy);
    if (d > RADIUS) (dx *= RADIUS / d), (dy *= RADIUS / d);
    stick.x = dx / RADIUS;
    stick.y = -dy / RADIUS;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  });
  const end = (e) => {
    if (!stick || e.pointerId !== stick.id) return;
    stick = null;
    base.classList.remove("on");
  };
  pad.addEventListener("pointerup", end);
  pad.addEventListener("pointercancel", end);
  dashBtn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    tapDash();
  });

  const touchDevice = matchMedia("(pointer: coarse)").matches;
  const any = (...codes) => codes.some((c) => keys.has(c));

  return {
    /** Show the touch controls (phones only) while a match is on. */
    show(on) {
      pad.hidden = !(on && touchDevice);
    },
    read() {
      let sx = (any("KeyD", "ArrowRight") ? 1 : 0) - (any("KeyA", "ArrowLeft") ? 1 : 0);
      let sy = (any("KeyW", "ArrowUp") ? 1 : 0) - (any("KeyS", "ArrowDown") ? 1 : 0);
      if (stick) (sx = stick.x), (sy = stick.y);
      const len = Math.hypot(sx, sy);
      if (len > 1) (sx /= len), (sy /= len);
      return { sx, sy, dash: performance.now() < dashUntil };
    },
  };
}

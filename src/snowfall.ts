/**
 * Gentle snowfall drawn on a fixed background canvas.
 * Under `prefers-reduced-motion: reduce` the flakes rest: one still frame, no animation loop.
 */

interface Flake {
  x: number;
  y: number;
  radius: number;
  speed: number;
  drift: number;
  phase: number;
  alpha: number;
}

const FLAKES_PER_MEGAPIXEL = 90;
const MAX_FLAKES = 160;

export function startSnowfall(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let width = 0;
  let height = 0;
  let flakes: Flake[] = [];
  let frame = 0;
  let last = 0;

  const makeFlake = (randomY: boolean): Flake => {
    const radius = 0.8 + Math.random() * 2.2;
    return {
      x: Math.random() * width,
      y: randomY ? Math.random() * height : -radius * 2,
      radius,
      // larger flakes are "closer": they fall faster and shine brighter
      speed: 12 + radius * 10,
      drift: 6 + Math.random() * 14,
      phase: Math.random() * Math.PI * 2,
      alpha: 0.35 + (radius / 3) * 0.5,
    };
  };

  const resize = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const target = Math.min(MAX_FLAKES, Math.round(((width * height) / 1_000_000) * FLAKES_PER_MEGAPIXEL));
    while (flakes.length < target) flakes.push(makeFlake(true));
    flakes.length = target;
    for (const flake of flakes) {
      if (flake.x > width) flake.x = Math.random() * width;
      if (flake.y > height) flake.y = Math.random() * height;
    }
  };

  const draw = (time: number) => {
    ctx.clearRect(0, 0, width, height);
    for (const flake of flakes) {
      const sway = Math.sin(time / 1000 + flake.phase) * flake.drift * 0.3;
      ctx.beginPath();
      ctx.arc(flake.x + sway, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(238, 242, 251, ${flake.alpha})`;
      ctx.fill();
    }
  };

  const step = (time: number) => {
    // clamp the delta so a background tab does not make every flake jump at once
    const dt = Math.min((time - last) / 1000, 0.05);
    last = time;
    for (const flake of flakes) {
      flake.y += flake.speed * dt;
      if (flake.y - flake.radius > height) Object.assign(flake, makeFlake(false));
    }
    draw(time);
    frame = requestAnimationFrame(step);
  };

  const start = () => {
    cancelAnimationFrame(frame);
    if (motionQuery.matches) {
      draw(0);
      return;
    }
    last = performance.now();
    frame = requestAnimationFrame(step);
  };

  const onResize = () => {
    resize();
    if (motionQuery.matches) draw(0);
  };

  resize();
  start();
  window.addEventListener("resize", onResize);
  motionQuery.addEventListener("change", start);

  return () => {
    cancelAnimationFrame(frame);
    window.removeEventListener("resize", onResize);
    motionQuery.removeEventListener("change", start);
  };
}

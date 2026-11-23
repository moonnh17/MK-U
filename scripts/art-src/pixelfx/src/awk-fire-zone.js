// MKU 백온파 각성 「불길의 행군」 불길 장판: 위에서 본 바닥 불길 한 판. 루프, 가운데 정렬.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening fire zone",
  desc: "Looping top-down patch of floor fire: dark scorched ring, flickering flame tongues, rising embers.",
  tags: ["zone", "fire", "topdown", "loop", "mku", "awakening"],
  size: [48, 48],
  origin: [24, 24],
  duration: 0.5,
  loop: true,
  fps: 18,
  bg: "dark",
  options: { palette: ["#1a0804", "#4a1608", "#9a3010", "#ff6a2a", "#ffa040", "#ffd870", "#fff4c8"], tongues: 14 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), ph = (t / meta.duration) % 1, n = o.tongues;
  p.disc(0, 0, 21, C[0], 0.5);
  p.disc(0, 0, 18, C[1], 0.6);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + i * 0.9, r = 6 + ((i * 37) % 11), f = 0.5 + 0.5 * Math.sin(ph * TAU + i * 1.7);
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.9, h = 3 + f * 4;
    p.disc(x, y, 2.6 + f, C[2], 0.55);
    p.disc(x, y - h * 0.3, 2 + f * 0.8, C[3], 0.8);
    p.disc(x, y - h * 0.6, 1.2 + f * 0.6, C[4], 0.9);
    p.px(x, y - h, C[5]);
  }
  p.glow(0, 0, 22, C[3], 0.25 + 0.08 * Math.sin(ph * TAU));
  for (let i = 0; i < 5; i++) {
    const k = (ph + i / 5) % 1, a = i * 2.4;
    p.dot(Math.cos(a) * 12 * (0.4 + k * 0.6), Math.sin(a) * 10 - k * 14, C[6 - Math.round(k * 2)], 1 - k);
  }
}

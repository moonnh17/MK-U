// MKU 백온파 각성 「쇄빙」 파열: 얼음 창이 부서지며 파편이 사방으로. 한 번 재생.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening ice shatter",
  desc: "One-shot top-down ice shatter: white flash, ring of pointed shards flying out, frost mist fading.",
  tags: ["impact", "ice", "topdown", "one-shot", "mku", "awakening"],
  size: [72, 72],
  origin: [36, 36],
  duration: 0.45,
  loop: false,
  fps: 18,
  bg: "dark",
  options: { palette: ["#0a1830", "#1e4a7a", "#3a86c0", "#5ad0f0", "#9ae6ff", "#d8f6ff", "#ffffff"], shards: 12 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), u = clamp(t / meta.duration, 0, 1), n = o.shards;
  if (u < 0.3) p.glow(0, 0, 22, C[5], 0.6 * (1 - u / 0.3));
  if (u < 0.18) p.disc(0, 0, 8 * (1 - u / 0.18) + 2, C[6], 1);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (i % 2) * 0.12, sp = 26 + (i % 3) * 8, d = sp * (1 - Math.pow(1 - u, 2));
    const x = Math.cos(a) * d, y = Math.sin(a) * d * 0.9, fade = 1 - u * u;
    for (let k = 0; k < 4; k++) p.dot(x - Math.cos(a) * k * 1.2, y - Math.sin(a) * k * 1.1, C[5 - Math.min(k, 3)], fade * (1 - k * 0.2));
    p.px(x, y, C[6]);
  }
  p.circle(0, 0, 4 + u * 28, C[3], 0.5 * (1 - u));
  for (let i = 0; i < 8; i++) {
    const a = i * 0.8 + 0.3, r = 6 + u * 18;
    p.dot(Math.cos(a) * r, Math.sin(a) * r * 0.9 - u * 4, C[4], 0.35 * (1 - u));
  }
}

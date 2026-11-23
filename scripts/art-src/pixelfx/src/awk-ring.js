// MKU 각성 공용 충격 고리: 퍼져 나가는 파장. palette 를 바꿔 냉기 파장(절대영도)·황금 환급(원소 일주)에 쓴다. 한 번 재생.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening ring",
  desc: "One-shot expanding shock ring with trailing dots and a soft inner glow. Recolor by palette.",
  tags: ["ring", "wave", "topdown", "one-shot", "mku", "awakening"],
  size: [112, 112],
  origin: [56, 56],
  duration: 0.5,
  loop: false,
  fps: 18,
  bg: "dark",
  options: { palette: ["#0a1830", "#1e4a7a", "#3a86c0", "#5ad0f0", "#9ae6ff", "#d8f6ff", "#ffffff"], maxR: 50, dots: 28 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), u = clamp(t / meta.duration, 0, 1), e = 1 - Math.pow(1 - u, 3), R = 4 + e * o.maxR, n = o.dots;
  p.glow(0, 0, R * 0.8, C[3], 0.3 * (1 - u));
  for (let k = 0; k < 3; k++) {
    const r = Math.max(1, R - k * 3.2), a = (1 - u) * (1 - k * 0.3);
    for (let i = 0; i < n; i++) {
      const g = (i / n) * TAU + k * 0.2;
      (k === 0 ? p.disc : p.dot).call(p, Math.cos(g) * r, Math.sin(g) * r * 0.92, ...(k === 0 ? [1, C[5 - k * 2], a] : [C[5 - k * 2], a]));
    }
  }
  for (let i = 0; i < 6; i++) {
    const g = i * 1.05 + 0.2;
    p.px(Math.cos(g) * (R + 2), Math.sin(g) * (R + 2) * 0.92, C[6]);
  }
}

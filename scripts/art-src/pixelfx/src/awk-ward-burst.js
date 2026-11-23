// MKU 백온파 각성 「삼원소 수호」 보호막 파열: 보호막이 깨지며 세 원소가 한꺼번에 터짐. 한 번 재생.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening ward burst",
  desc: "One-shot top-down burst: three element-colored plumes fly out in three directions with a white core flash.",
  tags: ["impact", "element", "topdown", "one-shot", "mku", "awakening"],
  size: [96, 96],
  origin: [48, 48],
  duration: 0.5,
  loop: false,
  fps: 18,
  bg: "dark",
  options: { colors: ["#ff7a1e", "#5ad0f0", "#ffd83a"], white: "#fffbe8" },
};

export function draw(p, t, o) {
  const u = clamp(t / meta.duration, 0, 1), e = 1 - Math.pow(1 - u, 2), W = hex(o.white);
  if (u < 0.35) p.glow(0, 0, 26, W, 0.7 * (1 - u / 0.35));
  if (u < 0.2) p.disc(0, 0, 8 * (1 - u / 0.2) + 2, W, 1);
  for (let c = 0; c < 3; c++) {
    const col = hex(o.colors[c]), a0 = (c / 3) * TAU + 0.5;
    for (let i = 0; i < 9; i++) {
      const spread = (i - 4) * 0.16, a = a0 + spread, d = e * (34 - Math.abs(i - 4) * 2.5);
      p.disc(Math.cos(a) * d, Math.sin(a) * d * 0.9, 1.5, col, (1 - u) * 0.9);
      p.dot(Math.cos(a) * d * 0.7, Math.sin(a) * d * 0.63, col, (1 - u) * 0.6);
    }
    p.glow(Math.cos(a0) * e * 26, Math.sin(a0) * e * 23, 12, col, 0.35 * (1 - u));
  }
  p.circle(0, 0, 3 + e * 38, W, 0.35 * (1 - u));
}

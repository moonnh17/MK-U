// MKU 백온파 각성 「백열 연쇄」 불씨: 작은 불씨 투사체(오른쪽으로 날아감). 회색이 아니라 화염색 고정. 루프.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening ember",
  desc: "Looping small golden ember flying right: bright core, short flickering tail, two orbiting sparks.",
  tags: ["projectile", "fire", "ember", "topdown", "loop", "mku", "awakening"],
  size: [24, 16],
  origin: [14, 8],
  duration: 0.3,
  loop: true,
  fps: 18,
  bg: "dark",
  options: { palette: ["#2a0c06", "#6e2008", "#b8460e", "#ff7a1e", "#ffb04a", "#ffe08a", "#fffbe8"] },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), ph = (t / meta.duration) % 1;
  for (let x = 0; x > -9; x -= 0.5) {
    const u = -x / 9, y = Math.sin(x * 0.9 + ph * TAU) * (0.6 + u * 1.4);
    p.dot(x - 1.5, y, C[5 - Math.round(u * 3)], (1 - u) * 0.9);
  }
  p.disc(0, 0, 4, C[2], 0.35);
  p.disc(0, 0, 2.6, C[4], 0.95);
  p.disc(-0.4, -0.4, 1.4, C[6], 1);
  p.glow(0, 0, 9, C[3], 0.4 + 0.1 * Math.sin(ph * TAU * 2));
  for (let i = 0; i < 2; i++) {
    const g = ph * TAU + i * Math.PI;
    p.px(Math.cos(g) * 4.5, Math.sin(g) * 3, C[6]);
  }
}

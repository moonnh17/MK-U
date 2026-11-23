// MKU 백온파 각성 「삼원소 수호」 반격 구슬 투사체: 작은 원소 구슬이 날아감. palette 로 화염·냉기·번개를 칠한다. 루프.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening ward orb",
  desc: "Looping small elemental orb flying right with a short wavy tail. Recolor by palette for fire, ice, lightning.",
  tags: ["projectile", "orb", "element", "topdown", "loop", "mku", "awakening"],
  size: [24, 16],
  origin: [14, 8],
  duration: 0.3,
  loop: true,
  fps: 18,
  bg: "dark",
  options: { palette: ["#2a0c06", "#6e2008", "#b8460e", "#ff7a1e", "#ffb04a", "#ffe08a", "#fffbe8"], zig: 0 },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), ph = (t / meta.duration) % 1;
  for (let x = 0; x > -9; x -= 0.5) {
    const u = -x / 9, y = Math.sin(x * 1.1 + ph * TAU) * (0.5 + u * 1.2) + (o.zig ? Math.sin(x * 3) * u * 2.5 : 0);
    p.dot(x - 2, y, C[5 - Math.round(u * 3)], (1 - u) * 0.85);
  }
  p.disc(0, 0, 3.8, C[2], 0.4);
  p.circle(0, 0, 2.6, C[4]);
  p.disc(-0.3, -0.3, 1.8, C[5], 1);
  p.px(-1, -1, C[6]);
  p.glow(0, 0, 8, C[4], 0.4 + 0.1 * Math.sin(ph * TAU * 2));
}

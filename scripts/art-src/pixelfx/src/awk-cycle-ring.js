// MKU 백온파 각성 「원소 일주」 일주 링: 세 원소 점이 발밑을 도는 고리. 한 번 재생(일주 달성 순간).
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU awakening cycle ring",
  desc: "One-shot rotating ring of fire, ice and lightning dots that spins up, flashes white, then fades.",
  tags: ["ring", "element", "topdown", "one-shot", "mku", "awakening"],
  size: [64, 48],
  origin: [32, 24],
  duration: 0.6,
  loop: false,
  fps: 18,
  bg: "dark",
  options: { colors: ["#ff7a1e", "#5ad0f0", "#ffd83a"], white: "#fffbe8" },
};

export function draw(p, t, o) {
  const u = clamp(t / meta.duration, 0, 1), spin = u * TAU * 1.5 + u * u * TAU, R = 24 - u * 6, W = hex(o.white);
  for (let c = 0; c < 3; c++) {
    const col = hex(o.colors[c]);
    for (let k = 0; k < 8; k++) {
      const g = spin + (c / 3) * TAU - k * 0.11, a = (1 - k / 8) * (1 - Math.max(0, u - 0.7) / 0.3);
      p.dot(Math.cos(g) * R, Math.sin(g) * R * 0.6, col, a);
    }
    p.disc(Math.cos(spin + (c / 3) * TAU) * R, Math.sin(spin + (c / 3) * TAU) * R * 0.6, 2, col, 1 - Math.max(0, u - 0.8) * 5);
  }
  if (u > 0.55 && u < 0.85) p.glow(0, 0, 26, W, 0.5 * (1 - Math.abs(u - 0.7) / 0.15));
}

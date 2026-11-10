// MKU flamethrower gout, seen from above, flying right: a hot head and a licking tail that trails back, looping.
// The game scales it up and fades it as it flies, so one gout reads as a spreading jet.
import { fit, clamp, tileNoise, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU weapon flame",
  desc: "Looping top-down flame gout flying right: white-yellow head, orange body, red licking tail and a few embers.",
  tags: ["fire", "flame", "flamethrower", "projectile", "topdown", "loop", "mku"],
  size: [40, 24],
  origin: [26, 12],
  duration: 0.4,
  loop: true,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#2a0a08", "#6e1a0c", "#b8360e", "#e86a1a", "#ffb03a", "#ffe38a", "#fffbe0"],
    seed: 2,
  },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), ph = (t / meta.duration) % 1;
  // the gout: a teardrop, round at the head (x = 0), pulled out into a tail to the left, its edge licked by noise
  p.shade(-26, -12, 14, 12, (x, y, out) => {
    const u = clamp((-x + 8) / 34), half = 8 * Math.pow(1 - u, 0.7) * (u < 0.24 ? Math.sqrt(Math.max(0, 1 - ((0.24 - u) / 0.24) ** 2)) : 1);
    const n = tileNoise(x * 0.25 + ph * 8, y * 0.3, 8, 0, o.seed) * 0.5, edge = half * (1 + n * 0.8) - (u > 0.5 ? (u - 0.5) * 6 * (n + 0.5) : 0);
    const d = Math.abs(y + Math.sin(ph * TAU + x * 0.3) * u * 2);
    if (d > edge || edge < 0.4) return;
    const q = d / edge, heat = 1 - u * 0.9 - q * 0.55 + n * 0.3;
    out.c = C[clamp(Math.round(heat * 6.4), 0, 6)];
    out.a = u > 0.75 ? clamp((1 - u) / 0.25) : 1;
  });
  p.glow(0, 0, 14, C[4], 0.5);
  // embers flicked back off the tail
  for (let i = 0; i < 4; i++) {
    const k = (ph + i / 4) % 1, x = -6 - k * 18, y = Math.sin(i * 2.3 + k * 5) * (3 + k * 5);
    p.dot(x, y, C[5 - Math.round(k * 3)], 1 - k);
  }
}

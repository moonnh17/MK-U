// MKU staff orb in flight, seen from above, flying right. Grey so the game can tint it.
// tier 1..4: a glowing orb with a wispy tail; higher tiers add a spinning rune ring and trailing motes.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU weapon orb",
  desc: "Looping top-down magic orb flying right: soft glowing ball, wispy tail, spinning ring and motes on higher tiers.",
  tags: ["projectile", "orb", "magic", "topdown", "loop", "mku"],
  size: [36, 24],
  origin: [24, 12],
  duration: 0.4,
  loop: true,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 3,
  },
};

export function draw(p, t, o) {
  const tier = clamp(Math.round(o.tier), 1, 4), C = fit(o.palette, 7), ph = (t / meta.duration) % 1, R = 2.5 + tier * 0.6;
  // wispy tail: three sine strands that thin out behind
  for (let s = 0; s < 3; s++)
    for (let x = 0; x > -14 - tier * 2; x -= 0.5) {
      const u = -x / (14 + tier * 2), y = Math.sin(x * 0.5 + ph * TAU + s * 2.1) * (1 + u * 3);
      p.dot(x - R * 0.5, y, C[5 - Math.round(u * 3)], (1 - u) * 0.8);
    }
  p.disc(0, 0, R + 2, C[3], 0.35);
  p.circle(0, 0, R, C[4]);
  p.circle(-0.6, -0.6, R - 1.2, C[5]);
  p.px(-1, -1, C[6]);
  p.glow(0, 0, R * 4, C[4], 0.45 + 0.1 * Math.sin(ph * TAU * 2));
  // rune ring (tier 3+): an ellipse of dots spinning round the orb, dark notches on tier 4
  if (tier >= 3)
    for (let i = 0; i < 12; i++) {
      const g = (i / 12) * TAU + ph * TAU, x = Math.cos(g) * (R + 3.5), y = Math.sin(g) * (R + 3.5) * 0.55;
      p.px(x, y, tier === 4 && i % 3 === 0 ? hex("#050307") : Math.sin(g) > 0 ? C[6] : C[3]);
    }
  // motes falling away behind (tier 2+)
  for (let i = 0; i < tier * 2; i++) {
    const k = (ph + i / (tier * 2)) % 1;
    p.dot(-R - k * 16, Math.sin(i * 2.7) * (2 + k * 5), C[6 - Math.round(k * 3)], 1 - k);
  }
}

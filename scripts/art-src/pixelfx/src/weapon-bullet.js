// MKU gun bullet in flight, seen from above, flying right (head at the origin). Grey so the game can tint it.
// tier 1..4: a hot slug with a short tail, then longer glowing tracers, then a crackling energy bolt with motes.
import { fit, clamp, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU weapon bullet",
  desc: "Looping top-down tracer round flying right; higher tiers get longer glowing tails, a flicker at the head and a crackling energy bolt.",
  tags: ["projectile", "bullet", "tracer", "topdown", "loop", "mku"],
  size: [36, 16],
  origin: [28, 8],
  duration: 0.24,
  loop: true,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 1,
  },
};

const TIERS = {
  1: { r: 1.5, tail: 9, w: 1, glow: 6 },
  2: { r: 2, tail: 14, w: 1.5, glow: 8 },
  3: { r: 2.5, tail: 20, w: 2, glow: 10 },
  4: { r: 3, tail: 26, w: 2.5, glow: 12 },
};

export function draw(p, t, o) {
  const tier = clamp(Math.round(o.tier), 1, 4), T = TIERS[tier], C = fit(o.palette, 7), ph = (t / meta.duration) % 1;
  // tail: tapering streak behind the head, cooling down the ramp
  p.shade(-T.tail - 1, -T.w - 3, 1, T.w + 3, (x, y, out) => {
    const u = clamp(-x / T.tail);
    if (u >= 1) return;
    const wob = tier >= 4 ? Math.sin(x * 0.9 + ph * TAU * 2) * u * 1.4 : 0;
    const w = T.w * (1 - u * 0.8), d = Math.abs(y - wob);
    if (d > w + 0.2) return;
    out.c = C[clamp(Math.round(6 - u * 4 - d), 1, 6)];
    out.a = u < 0.55 ? 1 : clamp((1 - u) * 2.4);
  });
  p.glowLine(-T.tail * 0.7, 0, 0, 0, T.glow * 0.6, C[4], 0.22);
  // head
  if (tier >= 4) p.circle(0, 0, T.r + 1, hex("#050307"));
  p.circle(0, 0, T.r, C[5]);
  p.circle(-0.4, -0.4, Math.max(0.6, T.r - 1), C[6]);
  p.glow(0, 0, T.glow, C[5], 0.45 + 0.15 * Math.sin(ph * TAU));
  // tier 3+: a flicker cross at the head
  if (tier >= 3) {
    const k = 0.5 + 0.5 * Math.sin(ph * TAU * 2), a = 2 + k * (tier === 4 ? 3 : 2);
    p.line(-a, 0, a, 0, C[6], 0.6 * k);
    p.line(0, -a, 0, a, C[6], 0.6 * k);
  }
  // tier 4: two motes spinning round the head
  if (tier >= 4)
    for (const s of [0, Math.PI]) {
      const g = ph * TAU * 2 + s;
      p.px(Math.cos(g) * 4 - 1, Math.sin(g) * 4, Math.sin(g) > 0 ? C[6] : C[3]);
    }
}

// MKU weapon thrust (spear), seen from above, facing right: origin at the hand, the lance streaks out along +x.
// tier 1..4 adds a spiral at the tip, a pressure cone, rings along the line and a dark wake.
import { Particles, P, Rng, fit, sparkle, clamp, smooth, ease, hex } from "../../core/index.js";

export const meta = {
  name: "MKU weapon thrust",
  desc: "Top-down lance thrust for a game weapon, grey so the game can tint it; higher tiers get a spiral, a cone, rings and a dark wake.",
  tags: ["melee", "thrust", "spear", "topdown", "one-shot", "mku"],
  size: [144, 48],
  origin: [8, 24],
  duration: 0.5,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 1,
    seed: 5,
  },
};

const TIERS = {
  1: { L: 112, W: 3, sparks: 4, spiral: false, cone: false, rings: 0, dark: false },
  2: { L: 118, W: 4, sparks: 8, spiral: true, cone: false, rings: 0, dark: false },
  3: { L: 124, W: 5, sparks: 12, spiral: true, cone: true, rings: 2, dark: false },
  4: { L: 128, W: 6, sparks: 16, spiral: true, cone: true, rings: 3, dark: true },
};
const OUT = 0.07;

export function create(o) {
  const T = TIERS[clamp(Math.round(o.tier), 1, 4)], C = fit(o.palette, 7), Rg = new Rng(o.seed);
  const ps = new Particles({ rng: Rg, ground: () => 999, sparks: [C[6], C[5], C[4], C[3]] });
  const dark = hex("#050307");
  let t = 0, fired = false;
  return {
    update(dt) {
      t += dt;
      if (!fired && t >= OUT) {
        fired = true;
        for (let i = 0; i < T.sparks; i++) {
          const a = Rg.range(-0.6, 0.6), sp = Rg.range(70, 160);
          ps.spawn(P.SPARK, T.L, 0, Math.cos(a) * sp, Math.sin(a) * sp, Rg.range(0.08, 0.2));
        }
        for (let i = 0; i < T.sparks; i++) {
          const x = Rg.range(10, T.L), s = Rg.pick([-1, 1]);
          ps.spawn(P.MOTE, x, s * T.W * 0.6, Rg.range(10, 40), s * Rg.range(15, 45), Rg.range(0.15, 0.35), C[Rg.int(3, 5)], 0.6);
        }
      }
      ps.update(dt);
    },
    draw(p) {
      const head = T.L * ease.outExpo(clamp(t / OUT)), tail = T.L * smooth(OUT + 0.04, OUT + 0.3, t);
      const age = clamp(t / 0.4);
      if (head - tail > 1) {
        // the lance streak: a taper from a hairline at the back to full width just behind the point, white rim
        p.shade(tail - 1, -T.W - 2, head + 3, T.W + 2, (x, y, out) => {
          const v = (x - tail) / (head - tail);
          if (v < 0 || v > 1.02) return;
          const w = T.W * Math.pow(Math.min(1, v / 0.85), 1.4) * (v > 0.92 ? (1.02 - v) / 0.1 : 1);
          const q = Math.abs(y) / Math.max(0.4, w);
          if (q > 1) return;
          const ci = clamp(Math.round(q * 4 + age * 3 - v * 1.5 + 0.5), 0, 6);
          out.c = C[6 - ci];
          out.a = Math.min(1, v / 0.3);
        });
        p.glowLine(tail, 0, head, 0, 4 + T.W, C[4], 0.25 * (1 - age));
        if (T.dark) for (const s of [-1, 1]) p.line(tail + (head - tail) * 0.2, s * (T.W + 1.5), head - 4, s * (T.W * 0.6 + 1), dark, 0.8 * (1 - age));
      }
      // pressure cone at the point
      if (T.cone && t > OUT * 0.6 && t < 0.3) {
        const k = clamp((t - OUT * 0.6) / 0.22), r = 6 + k * 16;
        for (let a = -1.1; a <= 1.1; a += 0.05) p.dot(T.L - 6 + Math.cos(a) * r, Math.sin(a) * r * 1.1, C[5 - Math.round(k * 3)], 0.9 * (1 - k));
      }
      // a spiral of air wound round the tip
      if (T.spiral && t > 0.02 && t < 0.32) {
        const k = clamp(t / 0.32);
        for (let i = 0; i < 40; i++) {
          const u = i / 40, x = head - 26 * u, ph = u * 14 - t * 40, r = (T.W + 2) * (1 - u * 0.5);
          p.dot(x, Math.sin(ph) * r, C[5 - (Math.cos(ph) < 0 ? 2 : 0)], (1 - u) * (1 - k));
        }
      }
      // rings snap out along the line
      for (let i = 0; i < T.rings; i++) {
        const t0 = OUT + i * 0.035, k = clamp((t - t0) / 0.2);
        if (k <= 0 || k >= 1) continue;
        const x = T.L * (0.35 + 0.25 * i), r = 3 + k * (8 + T.W);
        for (let a = 0; a < Math.PI * 2; a += 0.6 / r) p.dot(x + Math.cos(a) * r * 0.35, Math.sin(a) * r, C[5 - Math.round(k * 2)], 1 - k);
      }
      const g = t - OUT * 0.7;
      if (g > 0 && g < 0.18) sparkle(p, T.L, 0, (5 + T.W) * (1 - g / 0.18), C[6], C[4], 0.6);
      if (t > 0.02 && t < 0.2) p.glow(T.L, 0, 14 + T.W * 2, C[5], 0.4 * (1 - t / 0.2));
      ps.draw(p);
    },
  };
}

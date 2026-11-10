// MKU weapon slash, seen from above, facing right. tier 1..4 adds width, echoes, sparks, a dark rim and lingering embers.
// The crescent recipe comes through melee/_lib (adapted from Sprite Fusion's open-source slash,
// https://www.spritefusion.com/pixel-art-vfx/slash), MIT License, Copyright (c) 2026 Hugo Duprez.
import { Particles, Bits, P, B, Rng, fit, sparkle, clamp, ease, hex } from "../../core/index.js";
import { swing, slash, slashEnd, shavings, trace } from "../melee/_lib.js";

export const meta = {
  name: "MKU weapon slash",
  desc: "Top-down crescent swing for a game weapon, grey so the game can tint it; higher tiers get echoes, sparks, a dark rim and embers.",
  tags: ["melee", "slash", "topdown", "one-shot", "mku"],
  size: [112, 112],
  origin: [56, 56],
  duration: 0.6,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 1,
    seed: 3,
  },
};

const TIERS = {
  1: { R: 30, W: 6, sparks: 4, shave: 0, echo: false, ghost: false, dark: false, embers: 0 },
  2: { R: 32, W: 8, sparks: 8, shave: 8, echo: true, ghost: false, dark: false, embers: 0 },
  3: { R: 34, W: 11, sparks: 14, shave: 16, echo: true, ghost: true, dark: false, embers: 6 },
  4: { R: 36, W: 13, sparks: 18, shave: 22, echo: true, ghost: true, dark: true, embers: 14, cross: true },
};

export function create(o) {
  const T = TIERS[clamp(Math.round(o.tier), 1, 4)], C = fit(o.palette, 7), Rg = new Rng(o.seed);
  const ps = new Particles({ rng: Rg, ground: () => 999, sparks: [C[6], C[5], C[4], C[3]] });
  const bits = new Bits({ ground: () => 999 });
  const span = 2.6, R = T.R;
  // the arc's middle sits on the origin: centre pushed back so the crescent bulges forward (right)
  const base = swing({ cx: -R * 0.62, cy: 0, R, sy: 0.92, a0: -span / 2, dir: 1, span });
  const A = { ...base, W: T.W, t0: 0, sweep: 0.06, hold: 0.05, trail: 0.22, ramp: C, hot: T.dark ? 0.4 : 0.15 };
  const E = { ...base, R: R * 0.78, W: T.W * 0.45, t0: 0.02, sweep: 0.06, hold: 0.03, trail: 0.18, ramp: C.slice(0, 6) };
  const G = { ...base, R: R + 4, W: 3, t0: 0.045, sweep: 0.07, hold: 0.02, trail: 0.2, ramp: C.slice(1, 6) };
  // tier 4: a second, thinner cut comes back the other way a beat later
  const X = { ...swing({ cx: R * 0.5, cy: 0, R: R * 0.82, sy: 0.92, a0: Math.PI + span * 0.42, dir: -1, span: span * 0.84 }), W: T.W * 0.55, t0: 0.09, sweep: 0.05, hold: 0.03, trail: 0.2, ramp: C, hot: 0.3 };
  const tip = slashEnd(A);
  const dark = hex("#050307");
  let t = 0, landed = false;
  return {
    update(dt) {
      t += dt;
      if (!landed && t >= A.sweep) {
        landed = true;
        for (let i = 0; i < T.sparks; i++) {
          const a = Math.atan2(tip.dy, tip.dx) + Rg.range(-0.7, 0.7), sp = Rg.range(60, 170);
          ps.spawn(P.SPARK, tip.x, tip.y, Math.cos(a) * sp, Math.sin(a) * sp, Rg.range(0.08, 0.22));
        }
        if (T.shave) shavings(ps, Rg, A, T.shave, [C[4], C[5], C[6]]);
        for (let i = 0; i < T.embers; i++) {
          const u = Rg.range(0.2, 1) * span, a = A.a0 + u, x = A.cx + Math.cos(a) * R, y = Math.sin(a) * R * A.sy;
          ps.spawn(P.EMBER, x, y, Rg.range(-12, 18), Rg.range(-30, -10), Rg.range(0.25, 0.45), C[Rg.int(4, 6)], 1, Rg.range(0, 0.08));
        }
        if (T.embers >= 6)
          for (let i = 0; i < T.embers / 2; i++) ps.spawn(P.STAR, Rg.range(-R * 0.4, R * 0.5), Rg.range(-R * 0.8, R * 0.8), 0, Rg.range(-8, 0), Rg.range(0.2, 0.4), C[6], 1, Rg.range(0.02, 0.15));
        if (T.dark)
          for (let i = 0; i < 7; i++) {
            const u = Rg.range(0.25, 1) * span, a = A.a0 + u, x = A.cx + Math.cos(a) * (R + 2), y = Math.sin(a) * (R + 2) * A.sy;
            const sp = Rg.range(40, 90);
            bits.add({ kind: B.SHARD, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, a: Rg.range(0, 6), va: Rg.range(-20, 20), s: Rg.range(1.5, 2.6), c: dark, g: 0, drag: 3, life: Rg.range(0.25, 0.4) });
          }
      }
      ps.update(dt);
      bits.update(dt);
    },
    draw(p) {
      if (T.ghost) slash(p, G, t);
      if (T.echo) slash(p, E, t);
      slash(p, A, t);
      if (T.cross) slash(p, X, t);
      // a black hairline just outside the edge: the cut in the dark
      if (T.dark) {
        const k = 1 - clamp((t - 0.08) / 0.3);
        if (k > 0) trace(p, { ...A, R: R + 1.5 }, R + 1.5, span * 0.08, span * ease.outExpo(clamp(t / A.sweep)), dark, (u) => k * (0.4 + 0.6 * u / span));
      }
      const g = t - A.sweep * 0.6, life = T.echo ? 0.2 : 0.14;
      if (g > 0 && g < life) sparkle(p, tip.x, tip.y, (4 + T.W * 0.5) * ease.outBack(Math.min(1, g / 0.04)) * (1 - g / life), C[6], C[4], 0.5);
      if (t > 0.02 && t < 0.25) p.glow(A.cx + R * 0.9, 0, 20 + T.W * 2, C[4], 0.35 * (1 - t / 0.25));
      bits.draw(p);
      ps.draw(p);
    },
  };
}

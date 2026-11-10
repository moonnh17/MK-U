// MKU enemy death, seen from above: a crimson flash, dark ichor splashed out in clots that stain the floor,
// black shards, and a violet soul wisp that tears loose and rises away.
import { Particles, Bits, Lights, P, B, Rng, fit, sparkle, clamp, ease, hex, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU dark death",
  desc: "Dark-fantasy death burst: crimson flash, ichor clots that stain and fade, black shards, a violet soul wisp rising.",
  tags: ["death", "blood", "soul", "shadow", "topdown", "one-shot", "mku"],
  size: [96, 104],
  origin: [48, 64],
  duration: 1.0,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#0d0508", "#2a0912", "#5a0f20", "#8e1a2e", "#c8343e", "#f07a6a", "#ffe0d0"],
    soul: ["#1a0b2e", "#3e1d6e", "#6a3ab0", "#9a6ae0", "#d0b8ff", "#ffffff"],
    seed: 11,
  },
};

export function create(o) {
  const C = fit(o.palette, 7), S = fit(o.soul, 6), Rg = new Rng(o.seed);
  const ps = new Particles({ rng: Rg, ground: () => 999, sparks: [C[6], C[5], C[4], C[3]] });
  const bits = new Bits({ ground: () => 999 }), lights = new Lights();
  const dark = hex("#050206");
  // ichor clots: fly out, land as stains, shrink away
  const clots = Array.from({ length: 11 }, () => {
    const a = Rg.range(0, TAU), d = Rg.range(10, 26);
    return { x: Math.cos(a) * d, y: Math.sin(a) * d * 0.8, r: Rg.range(1.6, 3.4), fly: Rg.range(0.06, 0.12), c: Rg.pick([C[1], C[2], C[2], C[3]]) };
  });
  // the soul: a short column of wisps that rises and frays
  const wisps = Array.from({ length: 9 }, (_, i) => ({ dx: Rg.range(-3, 3), ph: Rg.range(0, TAU), d: i * 0.02, r: Rg.range(2.2, 3.6) }));
  let t = 0, burst = false;
  return {
    update(dt) {
      t += dt;
      if (!burst) {
        burst = true;
        lights.add(0, 0, 34, C[4], 0.7, 0.35);
        for (let i = 0; i < 8; i++) {
          const a = Rg.range(0, TAU), sp = Rg.range(60, 120);
          bits.add({ kind: B.SHARD, x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.8, a: Rg.range(0, 6), va: Rg.range(-15, 15), s: Rg.range(1.6, 2.6), c: dark, g: 0, drag: 4, life: Rg.range(0.3, 0.5) });
        }
        for (let i = 0; i < 10; i++) {
          const a = Rg.range(0, TAU), sp = Rg.range(60, 150);
          ps.spawn(P.SPARK, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp * 0.8, Rg.range(0.1, 0.22));
        }
        for (let i = 0; i < 10; i++) ps.spawn(P.EMBER, Rg.range(-6, 6), Rg.range(-12, 0), Rg.range(-8, 8), Rg.range(-40, -18), Rg.range(0.4, 0.8), S[Rg.int(3, 4)], 1, Rg.range(0.1, 0.35));
      }
      ps.update(dt);
      bits.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // stains first, under everything
      for (const c of clots) {
        const k = clamp(t / c.fly), fade = 1 - clamp((t - 0.45) / 0.5);
        if (fade <= 0) continue;
        const x = c.x * ease.outQuart(k), y = c.y * ease.outQuart(k);
        const r = c.r * (k < 1 ? 0.7 : 1 + 0.25 * ease.outQuart(clamp((t - c.fly) / 0.15))) * (0.5 + 0.5 * fade);
        p.circle(x, y, r, c.c);
        p.px(x - r * 0.4, y - r * 0.4, C[3]);
        if (k < 1) p.line(x * 0.5, y * 0.5, x, y, C[3], 0.7);
      }
      // hero flash
      if (t < 0.1) {
        const k = t / 0.1;
        p.disc(0, -2, 10 * (1 - k * 0.4), C[6], 1 - k);
        sparkle(p, 0, -2, 14 * (1 - k), C[6], C[4], 0.7);
      }
      // a crimson ring snaps out
      if (t > 0.02 && t < 0.3) {
        const k = clamp((t - 0.02) / 0.28), r = 6 + 22 * ease.outQuart(k);
        for (let a = 0; a < TAU; a += 0.6 / r) p.dot(Math.cos(a) * r, Math.sin(a) * r * 0.8, C[5 - Math.round(k * 3)], 1 - k);
      }
      // the soul wisp rises from the body and frays
      for (const w of wisps) {
        const u = clamp((t - 0.12 - w.d) / 0.75);
        if (u <= 0 || u >= 1) continue;
        const y = -6 - 46 * ease.outQuad(u), x = w.dx + Math.sin(w.ph + u * 9) * 3 * u, r = w.r * (1 - u * 0.6);
        p.disc(x, y, r + 1.5, S[2], 0.35 * (1 - u));
        p.disc(x, y, r, S[3], 0.55 * (1 - u));
        p.disc(x - 0.5, y - 0.8, r * 0.5, S[4], 0.8 * (1 - u));
        p.glow(x, y, 8, S[3], 0.18 * (1 - u));
      }
      if (t < 0.4) p.glow(0, 0, 26, C[4], 0.35 * (1 - t / 0.4));
      bits.draw(p);
      ps.draw(p);
      lights.draw(p);
    },
  };
}

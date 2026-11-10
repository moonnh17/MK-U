// MKU weapon smash (hammer, club), seen from above: the head lands on the origin. Grey so the game can tint it.
// tier 1..4 adds rings, cracks that glow, sparks, debris and a dark eruption.
import { Particles, Bits, Lights, P, B, Rng, fit, sparkle, clamp, ease, hex, TAU } from "../../core/index.js";
import { dustRing } from "../impacts/_lib.js";

export const meta = {
  name: "MKU weapon smash",
  desc: "Top-down hammer impact for a game weapon: white slam, shockwave ring, cracks, debris and dust; higher tiers add rings, glowing cracks, sparks and a dark eruption.",
  tags: ["melee", "smash", "hammer", "impact", "topdown", "one-shot", "mku"],
  size: [128, 128],
  origin: [64, 64],
  duration: 0.8,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 1,
    seed: 7,
  },
};

const TIERS = {
  1: { R: 30, rings: 1, cracks: 5, glowCracks: false, chunks: 5, sparks: 0, dark: 0 },
  2: { R: 36, rings: 1, cracks: 7, glowCracks: false, chunks: 8, sparks: 8, dark: 0 },
  3: { R: 42, rings: 2, cracks: 9, glowCracks: true, chunks: 12, sparks: 14, dark: 0 },
  4: { R: 48, rings: 3, cracks: 11, glowCracks: true, chunks: 16, sparks: 20, dark: 9 },
};
const SY = 0.82;

export function create(o) {
  const T = TIERS[clamp(Math.round(o.tier), 1, 4)], C = fit(o.palette, 7), Rg = new Rng(o.seed);
  const ps = new Particles({ rng: Rg, ground: () => 999, sparks: [C[6], C[5], C[4], C[3]] });
  const bits = new Bits({ ground: () => 999 }), lights = new Lights();
  const dark = hex("#050307");
  // cracks: jagged polylines out from the dent
  const cracks = Array.from({ length: T.cracks }, (_, i) => {
    let a = (i / T.cracks) * TAU + Rg.range(-0.25, 0.25), x = 0, y = 0;
    const pts = [[0, 0]], len = T.R * Rg.range(0.45, 0.8), n = 5;
    for (let k = 1; k <= n; k++) {
      a += Rg.range(-0.45, 0.45);
      x += (Math.cos(a) * len) / n;
      y += (Math.sin(a) * len * SY) / n;
      pts.push([x, y]);
    }
    return pts;
  });
  // dark eruption: black spikes punched up round the dent
  const spikes = Array.from({ length: T.dark }, (_, i) => ({ a: (i / Math.max(1, T.dark)) * TAU + Rg.range(-0.2, 0.2), r: T.R * Rg.range(0.3, 0.55), h: Rg.range(7, 12), d: Rg.range(0, 0.06) }));
  let t = 0, hit = false;
  return {
    update(dt) {
      t += dt;
      if (!hit) {
        hit = true;
        lights.add(0, 0, T.R * 1.4, C[5], 0.8, 0.35);
        for (let i = 0; i < T.chunks; i++) {
          const a = Rg.range(0, TAU), sp = Rg.range(50, 120) * (T.R / 36);
          bits.add({ kind: B.CHUNK, x: Math.cos(a) * 4, y: Math.sin(a) * 3, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * SY, a: Rg.range(0, 6), va: Rg.range(-12, 12), s: Rg.range(1.8, 3.2), c: C[Rg.int(3, 5)], g: 0, drag: 3, life: Rg.range(0.4, 0.7) });
        }
        for (let i = 0; i < T.sparks; i++) {
          const a = Rg.range(0, TAU), sp = Rg.range(80, 190);
          ps.spawn(P.SPARK, Math.cos(a) * 5, Math.sin(a) * 4, Math.cos(a) * sp, Math.sin(a) * sp * SY, Rg.range(0.18, 0.35));
        }
        for (let i = 0; i < 6 + T.rings * 3; i++) {
          const a = Rg.range(0, TAU), d = T.R * Rg.range(0.5, 0.8);
          ps.spawn(P.DUST, Math.cos(a) * d * 0.4, Math.sin(a) * d * 0.4 * SY, Math.cos(a) * 30, Math.sin(a) * 24 - 6, Rg.range(0.35, 0.6), C[3], Rg.range(1.2, 2), Rg.range(0, 0.05));
        }
        if (T.dark) for (let i = 0; i < 10; i++) ps.spawn(P.EMBER, Rg.range(-T.R * 0.5, T.R * 0.5), Rg.range(-T.R * 0.4, T.R * 0.4), Rg.range(-10, 10), Rg.range(-30, -12), Rg.range(0.3, 0.6), C[Rg.int(4, 6)], 1, Rg.range(0.05, 0.2));
      }
      ps.update(dt);
      bits.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // hero frame: a white disc that collapses fast
      if (t < 0.09) {
        const k = t / 0.09;
        p.disc(0, 0, T.R * 0.35 * (1 - k * 0.5), C[6], 1 - k);
        sparkle(p, 0, 0, T.R * 0.5 * (1 - k), C[6], C[4], 0.7);
      }
      // cracks: dark lines that open, a bright seam inside on high tiers, fading out
      const ck = clamp(t / 0.08), fade = 1 - clamp((t - 0.35) / 0.4);
      for (const pts of cracks) {
        const n = Math.max(1, Math.round((pts.length - 1) * ck));
        for (let i = 0; i < n; i++) {
          const [x0, y0] = pts[i], [x1, y1] = pts[i + 1];
          p.line(x0, y0, x1, y1, dark, 0.85 * fade);
          if (T.glowCracks) {
            p.line(x0, y0 - 0.5, x1, y1 - 0.5, C[5], 0.9 * fade * (1 - i / pts.length));
            p.glowLine(x0, y0, x1, y1, 3, C[4], 0.2 * fade);
          }
        }
      }
      // shockwave rings on the floor
      for (let i = 0; i < T.rings; i++) {
        const k = clamp((t - i * 0.06) / 0.35);
        if (k <= 0 || k >= 1) continue;
        const r = T.R * (0.25 + ease.outQuart(k) * (0.75 + i * 0.12));
        for (let a = 0; a < TAU; a += 0.7 / r) {
          const x = Math.cos(a) * r, y = Math.sin(a) * r * SY;
          p.dot(x, y, C[6 - Math.round(k * 3) - (Math.sin(a) < 0 ? 1 : 0)], 1 - k);
          if (i === 0 && k < 0.5) p.dot(x * 0.96, y * 0.96, C[4], (1 - k * 2) * 0.8);
        }
        p.glowRing?.(0, 0, r, C[4], 0.15 * (1 - k));
      }
      dustRing(p, 0, 0, T.R * (0.35 + 0.5 * ease.outQuart(clamp(t / 0.5))), 3 + T.R * 0.06, 0.45 * (1 - clamp((t - 0.1) / 0.6)), C[3], { sy: SY, ph: o.seed, brk: clamp((t - 0.2) / 0.5) });
      // dark eruption: black spikes jab up and sink
      for (const s of spikes) {
        const k = clamp((t - s.d) / 0.4);
        if (k <= 0 || k >= 1) continue;
        const h = s.h * Math.sin(Math.PI * Math.min(1, k * 1.6)) * (1 - k * 0.3), x = Math.cos(s.a) * s.r, y = Math.sin(s.a) * s.r * SY;
        const ox = Math.cos(s.a) * h * 0.6, oy = -h;
        p.tri(x - 2.5, y, x + 2.5, y, x + ox, y + oy, dark);
        p.line(x - 2.5, y, x + ox, y + oy, C[5], 0.9);
        p.glow(x + ox, y + oy, 5, C[5], 0.3 * (1 - k));
      }
      if (t < 0.3) p.glow(0, 0, T.R, C[5], 0.4 * (1 - t / 0.3));
      bits.draw(p);
      ps.draw(p);
      lights.draw(p);
    },
  };
}

// MKU muzzle flash, seen from above, firing right from the origin. Grey so the game can tint it.
// tier 1..4: a small star, then side jets, sparks, a pressure ring and a dark smoke puff.
import { Particles, P, Rng, fit, sparkle, clamp, ease, hex } from "../../core/index.js";

export const meta = {
  name: "MKU weapon muzzle",
  desc: "Top-down muzzle flash firing right: white star and cone; higher tiers add side jets, sparks, a ring and smoke.",
  tags: ["muzzle", "gun", "flash", "topdown", "one-shot", "mku"],
  size: [48, 36],
  origin: [6, 18],
  duration: 0.22,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 1,
    seed: 6,
  },
};

export function create(o) {
  const tier = clamp(Math.round(o.tier), 1, 4), C = fit(o.palette, 7), Rg = new Rng(o.seed);
  const ps = new Particles({ rng: Rg, ground: () => 999, sparks: [C[6], C[5], C[4], C[3]] });
  const L = 8 + tier * 5;
  let t = 0, fired = false;
  return {
    update(dt) {
      t += dt;
      if (!fired) {
        fired = true;
        for (let i = 0; i < (tier - 1) * 4; i++) {
          const a = Rg.range(-0.5, 0.5), sp = Rg.range(90, 200);
          ps.spawn(P.SPARK, 3, 0, Math.cos(a) * sp, Math.sin(a) * sp, Rg.range(0.05, 0.14));
        }
        if (tier >= 4) for (let i = 0; i < 3; i++) ps.spawn(P.VAPOUR, Rg.range(4, 10), Rg.range(-3, 3), Rg.range(15, 40), Rg.range(-12, 12), Rg.range(0.15, 0.22), hex("#2a2a30"), 1.2);
      }
      ps.update(dt);
    },
    draw(p) {
      const k = clamp(t / 0.12);
      if (k < 1) {
        const len = L * (1 - ease.inQuad(k)), w = (2 + tier * 0.8) * (1 - k);
        // the cone: a white-hot diamond pointing down the barrel
        p.shade(0, -w - 1, len + 1, w + 1, (x, y, out) => {
          const u = x / Math.max(1, len), half = w * (u < 0.3 ? u / 0.3 : 1 - (u - 0.3) / 0.7);
          if (Math.abs(y) > half) return;
          out.c = C[clamp(Math.round(6 - u * 3 - Math.abs(y) / Math.max(0.5, half) * 1.5), 2, 6)];
        });
        sparkle(p, 2, 0, (3 + tier * 1.5) * (1 - k), C[6], C[4], 0.6);
        // side jets
        if (tier >= 2) for (const s of [-1, 1]) p.line(3, 0, 3 + len * 0.35, s * len * 0.35, C[5], 1 - k);
        p.glow(4, 0, 6 + tier * 3, C[5], 0.6 * (1 - k));
      }
      // tier 3+: a pressure ring at the barrel
      if (tier >= 3 && t < 0.18) {
        const u = clamp(t / 0.18), r = 2 + u * (5 + tier);
        for (let a = 0; a < Math.PI * 2; a += 0.5 / r) p.dot(6 + Math.cos(a) * r * 0.45, Math.sin(a) * r, C[5], 1 - u);
      }
      ps.draw(p);
    },
  };
}

// MKU ultimate "First Law of Thermodynamics" blast, seen from above: the heat first pulls in to the core,
// then everything it took comes back out at once - white flash, a fireball, two shock rings, embers and smoke.
import { Particles, Lights, P, PF, Rng, fit, sparkle, clamp, ease, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU first-law blast",
  desc: "Top-down energy explosion: streaks rush in, white flash, fireball blooms, two shock rings, embers fly and smoke rises.",
  tags: ["explosion", "fire", "energy", "topdown", "one-shot", "mku"],
  size: [176, 176],
  origin: [88, 88],
  duration: 1.2,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#2a0c06", "#6e2008", "#b8460e", "#ff7a1e", "#ffb04a", "#ffe08a", "#fffbe8"],
    seed: 13,
  },
};

const IN = 0.12;

export function create(o) {
  const C = fit(o.palette, 7), Rg = new Rng(o.seed);
  const ps = new Particles({ rng: Rg, sparks: [C[6], C[5], C[4], C[3]] }), lights = new Lights();
  // the inrush: streaks start out on a ring and race to the centre
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * TAU + Rg.range(-0.1, 0.1), d = Rg.range(46, 64);
    ps.spawn(P.STREAK, Math.cos(a) * d, Math.sin(a) * d * 0.85, -Math.cos(a) * d / IN, (-Math.sin(a) * d * 0.85) / IN, IN * 0.95, C[5]);
  }
  let t = 0, boom = false;
  return {
    update(dt) {
      t += dt;
      if (!boom && t >= IN) {
        boom = true;
        lights.add(0, 0, 90, C[5], 1, 0.5);
        for (let i = 0; i < 26; i++) {
          const a = Rg.range(0, TAU), sp = Rg.range(40, 110);
          ps.spawn(P.FIRE, Math.cos(a) * 4, Math.sin(a) * 4, Math.cos(a) * sp, Math.sin(a) * sp * 0.85, Rg.range(0.3, 0.6), 0, Rg.range(1.6, 2.8), 0, PF.SMOKES);
        }
        for (let i = 0; i < 24; i++) {
          const a = Rg.range(0, TAU), sp = Rg.range(160, 300);
          ps.spawn(P.SPARK, 0, 0, Math.cos(a) * sp, Math.sin(a) * sp * 0.85, Rg.range(0.15, 0.4));
        }
        for (let i = 0; i < 14; i++) ps.spawn(P.EMBER, Rg.range(-24, 24), Rg.range(-20, 20), Rg.range(-15, 15), Rg.range(-40, -15), Rg.range(0.5, 0.9), C[Rg.int(4, 6)], 1, Rg.range(0.1, 0.4));
      }
      ps.update(dt);
      lights.update(dt);
    },
    draw(p) {
      // charge: the core swells while the streaks rush in
      if (t < IN) {
        const k = t / IN;
        p.disc(0, 0, 3 + k * 5, C[5], 0.9);
        p.glow(0, 0, 14 + k * 20, C[4], 0.3 + k * 0.4);
      }
      const u = t - IN;
      if (u >= 0) {
        // hero flash
        if (u < 0.08) {
          p.disc(0, 0, 26 * (1 - u / 0.16), C[6], 1 - u / 0.08);
          sparkle(p, 0, 0, 40 * (1 - u / 0.08), C[6], C[4], 0.8);
        }
        // fireball: hot centre cooling outward, shrinking and breaking up
        const fk = clamp(u / 0.6);
        if (fk < 1) {
          const R = 12 + 30 * ease.outQuart(clamp(u / 0.18));
          p.shade(-R - 3, -R - 3, R + 3, R + 3, (x, y, out) => {
            const d = Math.hypot(x, y / 0.85), g = Math.atan2(y, x), edge = R * (1 + 0.12 * Math.sin(g * 7 + u * 20)) * (1 - fk * 0.35);
            if (d > edge) return;
            const q = d / edge, heat = 1 - q * 0.7 - fk * 0.9;
            out.c = C[clamp(Math.round(heat * 6.5), 0, 6)];
            out.a = fk < 0.6 ? 1 : 1 - (fk - 0.6) / 0.4;
          });
        }
        // two shock rings, the second a beat behind
        for (const [d0, span, w] of [[0, 0.35, 1], [0.08, 0.45, 0]]) {
          const k = clamp((u - d0) / span);
          if (k <= 0 || k >= 1) continue;
          const r = 14 + 64 * ease.outQuart(k);
          for (let a = 0; a < TAU; a += 0.6 / r) {
            const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.85;
            p.dot(x, y, C[6 - Math.round(k * 3)], 1 - k);
            if (w) p.dot(x * 0.97, y * 0.97, C[4], (1 - k) * 0.7);
          }
          p.glowRing?.(0, 0, r, C[4], 0.12 * (1 - k));
        }
        if (u < 0.5) p.glow(0, 0, 60, C[4], 0.45 * (1 - u / 0.5));
      }
      ps.draw(p);
      lights.draw(p);
    },
  };
}

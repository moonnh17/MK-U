// MKU weapon laser, seen from above, firing right from the origin. The game stretches it along the beam, so the
// body is the same all the way along; grey so the game can tint it. tier 3 or 4 (4 adds a helix and a dark sheath).
import { Rng, fit, sparkle, clamp, ease, hex, TAU, noise } from "../../core/index.js";

export const meta = {
  name: "MKU weapon beam",
  desc: "Top-down laser shot for a game weapon: snaps on white, crackles, thins and fades; tier 4 adds a helix and a dark sheath.",
  tags: ["beam", "laser", "topdown", "one-shot", "mku"],
  size: [160, 32],
  origin: [0, 16],
  duration: 0.36,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#18181c", "#34343c", "#5a5a66", "#8a8a98", "#b8b8c4", "#e2e2ea", "#ffffff"],
    tier: 3,
    seed: 4,
  },
};

const L = 158;

export function draw(p, t, o) {
  const C = fit(o.palette, 7), tier = clamp(Math.round(o.tier), 3, 4), R = new Rng(o.seed);
  const on = ease.outExpo(clamp(t / 0.04)), off = clamp((t - 0.08) / 0.26), W = (tier === 4 ? 7 : 5) * (1 - off * 0.8) * on;
  if (W < 0.3) return;
  const dark = hex("#050307");
  // body: white core, tinted shell, crackling edge
  p.shade(0, -W - 4, L, W + 4, (x, y, out) => {
    const edge = W + noise(x * 0.35 + t * 40, o.seed) * 1.1, d = Math.abs(y);
    if (tier === 4 && d > edge && d < edge + 1.5) {
      out.c = dark;
      out.a = 0.8 * (1 - off);
      return;
    }
    if (d > edge) return;
    const q = d / Math.max(0.5, edge), ci = clamp(Math.round(q * 3.2 + off * 3), 0, 6);
    out.c = C[6 - ci];
    out.a = 1 - off * 0.4;
  });
  p.glowLine(0, 0, L, 0, W * 2 + 6, C[4], 0.35 * (1 - off));
  // tier 4: two strands wound round the beam
  if (tier === 4)
    for (const s of [0, Math.PI])
      for (let x = 0; x < L; x += 1) {
        const ph = x * 0.22 - t * 50 + s, y = Math.sin(ph) * (W + 2.5);
        if (Math.cos(ph) > -0.2) p.dot(x, y, C[5], 0.9 * (1 - off));
      }
  // motes flicking off the sides
  for (let i = 0; i < (tier === 4 ? 16 : 9); i++) {
    const x = R.range(4, L - 4), s = R.pick([-1, 1]), d = R.range(0, 0.1), u = clamp((t - d) / 0.22);
    if (u <= 0 || u >= 1) continue;
    p.dot(x + u * R.range(-4, 6), s * (W + 1 + u * R.range(4, 9)), C[R.int(4, 6)], 1 - u);
  }
  // muzzle flare
  if (t < 0.16) sparkle(p, 2, 0, (6 + tier * 2) * (1 - t / 0.16), C[6], C[4], 0.6);
  p.glow(0, 0, 10 + tier * 2, C[5], 0.4 * (1 - off));
  void TAU;
}

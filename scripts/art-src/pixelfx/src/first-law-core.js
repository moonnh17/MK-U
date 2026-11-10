// MKU ultimate "First Law of Thermodynamics": the thrown core of magi energy, seen from above, flying right.
// A white-hot core in an orange corona, three sparks circling it (energy going round, never lost), embers shed behind.
import { fit, TAU } from "../../core/index.js";

export const meta = {
  name: "MKU first-law core",
  desc: "Looping top-down energy core flying right: white-hot centre, flickering orange corona, three circling sparks and a trail of embers.",
  tags: ["projectile", "orb", "fire", "energy", "topdown", "loop", "mku"],
  size: [44, 30],
  origin: [28, 15],
  duration: 0.5,
  loop: true,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#2a0c06", "#6e2008", "#b8460e", "#ff7a1e", "#ffb04a", "#ffe08a", "#fffbe8"],
  },
};

export function draw(p, t, o) {
  const C = fit(o.palette, 7), ph = (t / meta.duration) % 1;
  // embers shed behind
  for (let i = 0; i < 8; i++) {
    const k = (ph * 2 + i / 8) % 1, y = Math.sin(i * 2.4 + k * 4) * (2 + k * 6);
    p.dot(-5 - k * 22, y, C[6 - Math.round(k * 4)], 1 - k);
  }
  // corona: lumpy disc that breathes
  const r = 6.5 + Math.sin(ph * TAU * 2) * 0.6;
  p.shade(-r - 2, -r - 2, r + 2, r + 2, (x, y, out) => {
    const d = Math.hypot(x, y), g = Math.atan2(y, x), edge = r + Math.sin(g * 5 + ph * TAU * 2) * 0.9 + Math.sin(g * 3 - ph * TAU) * 0.6;
    if (d > edge) return;
    const q = d / edge;
    out.c = C[q < 0.35 ? 6 : q < 0.55 ? 5 : q < 0.75 ? 4 : q < 0.9 ? 3 : 2];
  });
  p.glow(0, 0, 18, C[4], 0.55);
  // three sparks circling on a tilted orbit, the near ones bright
  for (let i = 0; i < 3; i++) {
    const g = ph * TAU + (i / 3) * TAU, x = Math.cos(g) * 10, y = Math.sin(g) * 5;
    const near = Math.sin(g) > 0;
    if (!near) p.px(x, y, C[3]);
    else {
      p.px(x, y, C[6]);
      p.px(x - Math.sin(g) * 1.2, y + Math.cos(g) * 0.6, C[5]);
      p.glow(x, y, 4, C[5], 0.4);
    }
  }
}

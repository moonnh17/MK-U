// MKU mage chain lightning segment, seen from above, from the origin to the right edge. The game stretches it between
// two targets. A jagged white-hot channel with a yellow sheath re-forks every couple of frames, then thins and fades.
import { Rng, fit, clamp, ease } from "../../core/index.js";

export const meta = {
  name: "MKU mage bolt",
  desc: "Top-down chain lightning segment: snaps on white, the jagged channel re-forks while it crackles, thins and fades.",
  tags: ["lightning", "bolt", "chain", "topdown", "one-shot", "mku"],
  size: [160, 44],
  origin: [0, 22],
  duration: 0.33,
  loop: false,
  fps: 18,
  bg: "dark",
  options: {
    palette: ["#24160a", "#5e3a0c", "#a8680f", "#e8a218", "#ffd83a", "#fff08a", "#ffffff"],
    seed: 7,
  },
};

const L = 159;

/** jagged channel from x=0 to x=L that returns to y=0 at both ends */
function channel(R, amp) {
  const pts = [[0, 0]];
  let x = 0;
  while (x < L) {
    x = Math.min(L, x + R.range(7, 14));
    const edge = Math.min(x, L - x) / 12;
    pts.push([x, x >= L ? 0 : R.range(-amp, amp) * clamp(edge)]);
  }
  return pts;
}

function stroke(p, pts, c, a) {
  for (let i = 1; i < pts.length; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
    for (let k = 0; k <= n; k++) p.dot(x0 + ((x1 - x0) * k) / n, Math.round(y0 + ((y1 - y0) * k) / n), c, a);
  }
}

export function draw(p, t, o) {
  const C = fit(o.palette, 7);
  const on = ease.outExpo(clamp((t + 0.02) / 0.03)), off = clamp((t - 0.1) / 0.23);
  if (on * (1 - off) <= 0.02) return;
  // a new fork every two frames
  const flick = Math.floor(t * 9);
  const R = new Rng(o.seed * 31 + flick);
  const main = channel(R, 9);
  const a = 1 - off;
  // sheath: the channel shifted a pixel up and down
  for (const dy of [-1, 1]) stroke(p, main.map(([x, y]) => [x, y + dy]), C[off > 0.5 ? 3 : 4], a * 0.9);
  stroke(p, main, C[off > 0.6 ? 5 : 6], a);
  // side forks off a few joints
  for (let i = 1; i < main.length - 1; i++) {
    if (R.next() > 0.35) continue;
    const [x, y] = main[i], s = y >= 0 ? 1 : -1, len = R.range(5, 11);
    stroke(p, [[x, y], [x + R.range(2, 6), y + s * len * 0.5], [x + R.range(4, 9), y + s * len]], C[4], a * 0.8);
  }
  for (let i = 0; i < main.length; i += 2) p.glow(main[i][0], main[i][1], 7, C[4], 0.25 * a);
}

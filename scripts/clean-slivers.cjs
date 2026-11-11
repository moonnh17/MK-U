// 적 스프라이트 시트에서 이웃 프레임 조각을 지운다.
// 원본 줄 그림을 칸으로 자를 때 옆 자세의 끝자락(망토·수정 등)이 칸 가장자리에 딸려 들어와,
// 움직일 때 앞에 다른 그림이 있는 것처럼 잘려 보였다(집정관·헥타르 수석 연구원·마기카이저).
// 프레임마다 가장 큰 덩어리(몸)는 두고, 칸 왼쪽·오른쪽 가장자리에 닿은 작은 덩어리만 지운다.
// 떠 있는 장식(구슬·후광 등)은 가장자리에 닿지 않으니 그대로 남는다.
//   node scripts/clean-slivers.cjs          지울 조각 목록만
//   node scripts/clean-slivers.cjs --write  실제로 지운다 (art:build 뒤에 다시 돌린다)
const fs = require('fs');
const path = require('path');
const k = require('./pngkit.cjs');

const REPO = path.resolve(__dirname, '..');
const art = JSON.parse(fs.readFileSync(path.join(REPO, 'src/data/art.json'), 'utf8'));
const write = process.argv.includes('--write');
/**
 * 조각이 딸려 들어온 시트만. 다른 적은 칸 가장자리에 닿은 장식이 진짜 그림이라(왕실 마법사 카드 등) 넣지 않는다.
 * 헥타르 수석 연구원 이동은 자른 칸이 아예 어긋나(3칸에 4걸음) 따로 다시 잘랐다(docs/DECISIONS.md).
 */
const KEYS = new Set(['enemy_archon', 'enemy_magi_kaiser', 'enemy_hectar_chief_phase2', 'enemy_ancient_one']);
/** 몸 덩어리보다 이만큼 작아야 조각으로 본다 */
const MAX_RATIO = 0.35;

let total = 0;
for (const [key, s] of Object.entries(art.sprites)) {
  if (!KEYS.has(key) || (s.frames ?? 1) < 2) continue;
  const file = path.join(REPO, 'public/assets', s.file);
  const img = k.read(file);
  const cols = Math.floor(img.w / s.frameWidth);
  const fw = s.frameWidth, fh = s.frameHeight;
  const hits = [];
  for (let f = 0; f < s.frames; f++) {
    const ox = (f % cols) * fw, oy = Math.floor(f / cols) * fh;
    const frame = k.crop(img, ox, oy, fw, fh);
    const parts = k.components(frame, 0);
    if (parts.length < 2) continue;
    const body = parts.reduce((a, b) => (b.area > a.area ? b : a));
    for (const c of parts) {
      if (c === body || c.area > body.area * MAX_RATIO) continue;
      if (c.x0 !== 0 && c.x1 !== fw - 1) continue;
      hits.push(`${f}(${c.area}px)`);
      for (const p of c.pts) {
        const x = p % fw, y = (p - x) / fw;
        img.px.fill(0, ((oy + y) * img.w + ox + x) * 4, ((oy + y) * img.w + ox + x) * 4 + 4);
      }
    }
  }
  if (hits.length === 0) continue;
  total += hits.length;
  console.log(`${key}: ${hits.join(' ')}`);
  if (write) k.write(file, img);
}
console.log(`${total}개 조각${write ? ' 지움' : ' (지우려면 --write)'}`);

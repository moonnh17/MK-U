/**
 * 도감 위협 등급(1~6문) 문양: 등급마다 색과 도형이 다른 작은 SVG 인장.
 * 1문(가장 강함)일수록 꼭짓점이 많고 화려하다. 미분류는 금 간 원에 물음표.
 * 'N문'(정식 등급)은 바깥에 인장 테(고리 + 네 방위 뿔 + 사이 구슬)가 둘러지고, 'N문급'은 테 없이 본 문양만.
 */
import type { MunGradeArt } from '../types/data';

const f = (v: number): string => v.toFixed(1);

/** 정다각형(inner 없음) 또는 별(inner = 안쪽 반지름 비율)의 꼭짓점 */
export function munPoints(n: number, r: number, inner?: number, rot = -Math.PI / 2): string {
  const pts: string[] = [];
  const steps = inner ? n * 2 : n;
  for (let i = 0; i < steps; i++) {
    const a = rot + (i * Math.PI * 2) / steps;
    const rr = inner && i % 2 ? r * inner : r;
    pts.push(`${f(50 + Math.cos(a) * rr)},${f(50 + Math.sin(a) * rr)}`);
  }
  return pts.join(' ');
}

const SHAPES: Record<Exclude<MunGradeArt['shape'], 'circle' | 'broken'>, [number, number?]> = {
  star8: [8, 0.62],
  star6: [6, 0.6],
  pentagon: [5],
  diamond: [4],
  triangle: [3],
};

/** 'N문' 인장 테: 고리 + 네 방위 뿔 + 사이 구슬 (문양 뒤에 깐다) */
function sealFrame(art: MunGradeArt): string {
  let g = `<circle cx="50" cy="50" r="55" fill="none" stroke="${art.rim}" stroke-width="3"/><circle cx="50" cy="50" r="51" fill="none" stroke="${art.color}" stroke-width="1.5" stroke-opacity="0.8"/>`;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 - Math.PI / 2;
    const tip = (r: number, da = 0) => `${f(50 + Math.cos(a + da) * r)},${f(50 + Math.sin(a + da) * r)}`;
    g += `<polygon points="${tip(64)} ${tip(52, 0.13)} ${tip(52, -0.13)}" fill="${art.color}" stroke="${art.rim}" stroke-width="1.5"/>`;
    const b = a + Math.PI / 4;
    g += `<circle cx="${f(50 + Math.cos(b) * 55)}" cy="${f(50 + Math.sin(b) * 55)}" r="3.4" fill="${art.color}" stroke="${art.rim}" stroke-width="1.2"/>`;
  }
  return g;
}

/** grade: '1'~'6' 또는 'unknown'. sealed: 정식 'N문'이면 인장 테를 두른다 ('N문급'·unknown·미분류는 없음) */
export function munEmblemSvg(grade: string, art: MunGradeArt, size: number, sealed = false): string {
  const id = `mun-g${grade}`;
  const defs =
    `<defs><radialGradient id="${id}" cx="40%" cy="35%" r="70%">` +
    `<stop offset="0" stop-color="#ffffff" stop-opacity="0.75"/><stop offset="0.35" stop-color="${art.color}"/><stop offset="1" stop-color="${art.rim}"/>` +
    `</radialGradient></defs>`;
  const fill = `fill="url(#${id})" stroke="${art.rim}" stroke-width="5" stroke-linejoin="round"`;
  let body: string;
  if (art.shape === 'circle') body = `<circle cx="50" cy="50" r="40" ${fill}/><circle cx="50" cy="50" r="31" fill="none" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2"/>`;
  else if (art.shape === 'broken')
    body = `<circle cx="50" cy="50" r="40" ${fill} stroke-dasharray="46 10 30 14"/><path d="M50 10 L44 30 L54 38 L47 52" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="3"/>`;
  else {
    const [n, inner] = SHAPES[art.shape];
    const r = art.shape === 'triangle' ? 50 : 46;
    const rot = art.shape === 'star8' ? -Math.PI / 2 + Math.PI / 8 : -Math.PI / 2;
    body = `<polygon points="${munPoints(n, r, inner, rot)}" ${fill}/>`;
    // 안쪽 장식선: 같은 도형을 작게
    body += `<polygon points="${munPoints(n, r * 0.62, inner, rot)}" fill="none" stroke="#ffffff" stroke-opacity="0.5" stroke-width="2"/>`;
    // 1문: 뒤에 금빛 겹별
    if (grade === '1') body = `<polygon points="${munPoints(8, 50, 0.8, -Math.PI / 2)}" fill="${art.rim}" opacity="0.9"/>` + body;
  }
  const label = grade === 'unknown' ? '?' : grade;
  const ty = art.shape === 'triangle' ? 66 : 63;
  const text = `<text x="50" y="${ty}" text-anchor="middle" font-family="serif" font-weight="bold" font-size="${art.shape === 'triangle' ? 30 : 36}" fill="#fff" stroke="${art.rim}" stroke-width="3" paint-order="stroke">${label}</text>`;
  // 테가 들어갈 자리는 둘 다 비워 둬서 N문과 N문급의 본 문양 크기가 같다
  return `<svg class="mun-emblem" viewBox="-16 -16 132 132" width="${size}" height="${size}" aria-hidden="true">${defs}${sealed ? sealFrame(art) : ''}${body}${text}</svg>`;
}

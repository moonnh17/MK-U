/**
 * 획득 확률 (순수 함수): 도감의 확률 보기용. 실제 뽑기(rollGrade·pickItem·rollWeapon)와 같은 규칙으로 계산한다.
 * - 등급: 가중치 비율 × (1 − 신화 확률), 신화는 고정 확률
 * - 아이템: 그 등급의 일반 풀에서 고르게 (런 시작 기준, 아무것도 얻지 않았을 때)
 * - 무기: 그 등급의 드롭 무기에서 고르게 (유니크가 없으면 대체 등급, 그다음 한 등급씩 아래로)
 * 얻을 때마다 옮겨 가는 확률 이전(transferPerPickup)은 런마다 달라 여기서는 빼고 따로 안내한다.
 */
import type { GameData } from '../data/index';
import { GRADE_IDS, type GradeId, type WeaponDef } from '../types/data';
import { effectiveWeights } from './items';

export type GradeRates = Record<GradeId, number>;

export function gradeRates(weights: Partial<Record<GradeId, number>>, mythicChance: number): GradeRates {
  const sum = GRADE_IDS.reduce((s, g) => s + Math.max(0, weights[g] ?? 0), 0);
  const out = Object.fromEntries(GRADE_IDS.map((g) => [g, sum > 0 ? (Math.max(0, weights[g] ?? 0) / sum) * (1 - mythicChance) : 0])) as GradeRates;
  out.mythic += mythicChance;
  return out;
}

/** 확률 보기의 출처 한 줄 (ko.json 키 + 등급 확률) */
export interface DropSource {
  key: string;
  vars?: Record<string, string | number>;
  rates: GradeRates;
}

/** 아이템 출처: 보물 상자·아이템 카드는 챕터마다 일반이 줄어든다 */
export function itemSources(d: GameData): DropSource[] {
  const m = d.loot.mythicChance;
  const chapters = Array.from({ length: d.mapgen.chapters }, (_, i) => i + 1);
  return [
    ...chapters.map((n) => ({ key: 'drop.src.treasure', vars: { n }, rates: gradeRates(effectiveWeights(d.items.treasureWeights, n, d.items.chapterCommonShift, {}), m) })),
    { key: 'drop.src.raid', rates: gradeRates(d.items.raidWeights, m) },
  ];
}

/** 무기 출처 */
export function weaponSources(d: GameData): DropSource[] {
  const m = d.loot.mythicChance;
  return [
    { key: 'drop.src.start', rates: gradeRates(d.loot.startChest, m) },
    ...Object.entries(d.loot.weaponChest).map(([stage, w]) => ({ key: 'drop.src.bossChest', vars: { stage }, rates: gradeRates(w, m) })),
    { key: 'drop.src.combat', vars: { pct: d.loot.combatDrop.chance * 100 }, rates: gradeRates(d.loot.combatDrop.weights, m) },
    { key: 'drop.src.merchant', vars: { n: d.loot.merchant.count }, rates: gradeRates(d.loot.merchant.weights, m) },
  ];
}

/** 일반 풀 아이템 하나가 한 번 뽑을 때 나올 확률 (그 등급 확률 ÷ 그 등급 아이템 수) */
export function itemChance(d: GameData, itemId: string, rates: GradeRates): number {
  const def = d.items.items.find((x) => x.id === itemId);
  if (!def || def.pool !== 'normal') return 0;
  const n = d.items.items.filter((x) => x.pool === 'normal' && x.grade === def.grade).length;
  return rates[def.grade] / n;
}

/** 굴린 등급이 실제로 어느 무기 목록이 되는지 (rollWeapon과 같은 대체 규칙) */
function weaponPool(d: GameData, grade: GradeId): WeaponDef[] {
  const ws = d.weapons.weapons;
  if (grade === 'mythic') {
    const mythic = ws.filter((w) => w.grade === 'mythic');
    if (mythic.length > 0) return mythic;
    grade = 'legendary';
  }
  const droppable = (g: GradeId) => ws.filter((w) => w.droppable && w.grade === g);
  if (grade === 'unique' && droppable('unique').length === 0) grade = d.loot.uniqueWeaponFallback;
  while (droppable(grade).length === 0 && GRADE_IDS.indexOf(grade) > 0) grade = GRADE_IDS[GRADE_IDS.indexOf(grade) - 1]!;
  return droppable(grade);
}

/** 무기 하나가 한 번 뽑을 때 나올 확률 */
export function weaponChance(d: GameData, weaponId: string, rates: GradeRates): number {
  let p = 0;
  for (const g of GRADE_IDS) {
    const pool = weaponPool(d, g);
    if (pool.some((w) => w.id === weaponId)) p += rates[g] / pool.length;
  }
  return p;
}

/** 퍼센트 표기: 작은 값도 0으로 보이지 않게 유효 숫자를 남긴다 */
export function pct(p: number): string {
  const v = p * 100;
  if (v === 0) return '0%';
  const digits = v >= 10 ? 1 : v >= 1 ? 2 : v >= 0.01 ? 3 : 4;
  return `${Number(v.toFixed(digits))}%`;
}

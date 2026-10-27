/**
 * 엘리트 (순수 함수). 한 개체에 하나만, 보스에게는 붙지 않는다.
 * 웨이브의 일반 적 중 일부를 엘리트로 바꾼다. 수는 스테이지별 규칙(데이터).
 */
import type { Rng } from '../core/rng';
import type { EliteDef, ElitesData, EnemyRank } from '../types/data';

/** 엘리트가 붙을 수 있는 등급 (보스·정예 제외) */
export function canBeElite(rank: EnemyRank): boolean {
  return rank === 'normal';
}

/** 이 스테이지 전투 칸 웨이브 하나의 엘리트 수 */
export function eliteCount(rng: Rng, chapter: number, stage: number, data: ElitesData): number {
  const range = data.countByStage[String(stage)];
  if (!range) return 0;
  return rng.int(range[0], range[1]) + (chapter - 1) * data.perChapterBonus;
}

/** 웨이브(적 id 목록)마다 엘리트 id를 붙인다. 붙지 않으면 null */
export function assignElites(
  rng: Rng,
  wave: readonly string[],
  count: number,
  rankOf: (enemyId: string) => EnemyRank,
  data: ElitesData,
): (string | null)[] {
  const out: (string | null)[] = wave.map(() => null);
  const eligible = rng.shuffle(wave.map((id, i) => ({ id, i })).filter((e) => canBeElite(rankOf(e.id))));
  for (const e of eligible.slice(0, Math.max(0, count))) {
    out[e.i] = rng.weighted(data.elites.map((x) => ({ item: x.id, weight: x.weight })));
  }
  return out;
}

/** 엘리트가 붙은 적의 배율 (엘리트가 없으면 전부 1) */
export interface EliteMods {
  scale: number;
  hpMul: number;
  moveSpeedMul: number;
  attackSpeedMul: number;
  damageTakenMul: number;
}

export function eliteMods(elite: EliteDef | null, data: ElitesData): EliteMods {
  if (!elite) return { scale: 1, hpMul: 1, moveSpeedMul: 1, attackSpeedMul: 1, damageTakenMul: 1 };
  return {
    scale: data.common.scale,
    hpMul: data.common.hpMul,
    moveSpeedMul: elite.moveSpeedMul ?? 1,
    attackSpeedMul: elite.attackSpeedMul ?? 1,
    damageTakenMul: elite.damageTakenMul ?? 1,
  };
}

/** 엘리트는 등급 판정(공간격·궁극기 게이지·조준 가중치)에서 '엘리트'다 */
export function effectiveRank(rank: EnemyRank, elite: EliteDef | null): EnemyRank {
  return elite && rank === 'normal' ? 'elite' : rank;
}

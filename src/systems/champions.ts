/**
 * 정예(집행자·집정관) 등장과 집정관 흡수 단계 (순수 함수).
 * 3장 전투 칸 일부 웨이브에 1마리(방마다 상한), 대규모 습격은 한 웨이브에 하나 또는 둘. 보스방에는 나오지 않는다.
 */
import type { Rng } from '../core/rng';
import type { ArchonAbsorbDef, ChampionRules, EnemiesData } from '../types/data';

/** 이 챕터·스테이지 전투 칸에 정예가 나오는지 */
export function championStage(chapter: number, stage: number, rules: ChampionRules): boolean {
  return (rules.stages[String(chapter)] ?? []).includes(stage);
}

/** 전투 칸 웨이브마다 섞일 정예 id (없으면 null). 웨이브마다 waveChance, 방 하나에 maxPerRoom까지 */
export function championWaves(rng: Rng, chapter: number, stage: number, waveCount: number, rules: ChampionRules): (string | null)[] {
  const out: (string | null)[] = Array.from({ length: waveCount }, () => null);
  if (!championStage(chapter, stage, rules)) return out;
  let placed = 0;
  for (let i = 0; i < waveCount && placed < rules.maxPerRoom; i++) {
    if (!rng.chance(rules.waveChance)) continue;
    out[i] = rng.pick(rules.ids);
    placed++;
  }
  return out;
}

/** 대규모 습격: 정예가 나오는 챕터면 한 웨이브에 하나, raidBothChance로 둘 다 */
export function raidChampions(rng: Rng, chapter: number, waveCount: number, rules: ChampionRules): string[][] {
  const out: string[][] = Array.from({ length: waveCount }, () => []);
  if (!rules.stages[String(chapter)] || waveCount === 0) return out;
  const i = rng.int(0, waveCount - 1);
  out[i] = rng.chance(rules.raidBothChance) ? [...rules.ids] : [rng.pick(rules.ids)];
  return out;
}

/** 누적 흡수량 → 단계 (0 = 흡수 전, 최대 stages.length) */
export function archonStage(absorbed: number, def: ArchonAbsorbDef): number {
  let s = 0;
  for (const st of def.stages) if (absorbed >= st.absorb) s++;
  return s;
}

/** 단계의 배율 (0단계는 전부 1, 후광 없음) */
export function archonMods(stage: number, def: ArchonAbsorbDef): { hpMul: number; damageMul: number; haloRadius: number } {
  const st = stage > 0 ? def.stages[Math.min(stage, def.stages.length) - 1] : undefined;
  return st ? { hpMul: st.hpMul, damageMul: st.damageMul, haloRadius: st.haloRadius } : { hpMul: 1, damageMul: 1, haloRadius: 0 };
}

/** 최대 체력 배율이 바뀔 때 남은 체력 비율을 유지한다 */
/** 챕터·스테이지가 뒤로 갈수록 커지는 일반 적·정예 체력 배율 */
export function enemyHpScale(chapter: number, stage: number, table: EnemiesData['hpScale']): number {
  const r = table[String(chapter)];
  return r ? r.base + r.perStage * (stage - 1) : 1;
}

export function rescaleHp(hp: number, maxHp: number, newMaxHp: number): number {
  return maxHp > 0 ? (hp / maxHp) * newMaxHp : newMaxHp;
}

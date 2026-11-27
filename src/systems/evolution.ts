/**
 * 오버플로우 적 진화 (순수 함수): 카드 뽑기·등급·중첩·후보 제외, 진화 수치 계산, 적용 대상, 유니크 변형.
 * 진화는 스테이지 클리어 때 고르고 다음 스테이지에서 생성되는 적부터 적용한다.
 */
import type { Rng } from '../core/rng';
import { scaledCount } from './roomState';
import type { EnemyRank, EvolutionData, EvolutionDef, EvolutionEffects, EvolutionRewardDef } from '../types/data';

export type EvoGrade = 'common' | 'rare' | 'legendary' | 'unique';
const GRADES: readonly EvoGrade[] = ['common', 'rare', 'legendary', 'unique'];

export interface EvolutionState {
  /** 진화 id → 중첩 */
  stacks: Record<string, number>;
  /** 고른 유니크 진화 id */
  uniques: string[];
  /** 과부하 누적 카드 중첩 (상한 없음) */
  overloadStacks: number;
}

export function newEvolutionState(): EvolutionState {
  return { stacks: {}, uniques: [], overloadStacks: 0 };
}

/** 진화 카드 한 장: 적 진화 + 같은 등급 보상 */
export interface EvolutionCard {
  kind: 'evolution';
  /** 공용·보스 진화 id, 유니크 id, 또는 과부하 누적 id */
  evoId: string;
  grade: EvoGrade;
  rewardId: string;
}

export function findEvolution(E: EvolutionData, id: string): EvolutionDef | undefined {
  return E.evolutions.find((e) => e.id === id);
}

export function findReward(E: EvolutionData, id: string): EvolutionRewardDef | undefined {
  for (const g of GRADES) {
    const r = E.rewards[g].find((x) => x.id === id);
    if (r) return r;
  }
  return undefined;
}

/** 이 등급에서 지금 고를 수 있는 진화 id (최대 중첩·이미 고른 유니크·이번에 나온 것 제외) */
export function candidates(st: EvolutionState, grade: EvoGrade, E: EvolutionData, taken: ReadonlySet<string>): string[] {
  if (grade === 'unique') return E.uniques.map((u) => u.id).filter((id) => !st.uniques.includes(id) && !taken.has(id));
  return E.evolutions.filter((e) => e.grade === grade && (st.stacks[e.id] ?? 0) < E.maxStacks && !taken.has(e.id)).map((e) => e.id);
}

function rollGrade(rng: Rng, E: EvolutionData, allowed: readonly EvoGrade[]): EvoGrade {
  return rng.weighted(allowed.map((g) => ({ item: g, weight: E.gradeWeights[g] })));
}

/**
 * 카드 cardCount장. 카드마다 등급을 따로 굴린다(신화 없음).
 * 유니크가 다 떨어지면 레어·전설로, 그 등급 후보가 없으면 다른 등급으로, 공용·보스 진화가 모두 최대면 과부하 누적 카드.
 */
export function rollEvolutionCards(rng: Rng, st: EvolutionState, E: EvolutionData): EvolutionCard[] {
  const cards: EvolutionCard[] = [];
  const taken = new Set<string>();
  const usedRewards = new Set<string>();
  for (let i = 0; i < E.cardCount; i++) {
    let grade = rollGrade(rng, E, GRADES);
    if (grade === 'unique' && candidates(st, 'unique', E, taken).length === 0) grade = rollGrade(rng, E, ['rare', 'legendary']);
    let pool = candidates(st, grade, E, taken);
    if (pool.length === 0) {
      const others = GRADES.filter((g) => g !== 'unique' && candidates(st, g, E, taken).length > 0);
      if (others.length > 0) {
        grade = rollGrade(rng, E, others);
        pool = candidates(st, grade, E, taken);
      }
    }
    const evoId = pool.length > 0 ? rng.pick(pool) : E.overloadCard.id;
    if (pool.length === 0 && grade === 'unique') grade = 'legendary';
    taken.add(evoId);
    // 보상: 같은 등급 목록에서 (과부하 카드끼리는 보상이 겹치지 않게)
    const rewards = E.rewards[grade].filter((r) => !usedRewards.has(r.id));
    const reward = rng.pick(rewards.length > 0 ? rewards : E.rewards[grade]);
    usedRewards.add(reward.id);
    cards.push({ kind: 'evolution', evoId, grade, rewardId: reward.id });
  }
  return cards;
}

/** 카드를 고른 뒤의 진화 상태 (새 객체) */
export function pickEvolution(st: EvolutionState, card: EvolutionCard, E: EvolutionData): EvolutionState {
  if (card.evoId === E.overloadCard.id) return { ...st, overloadStacks: st.overloadStacks + 1 };
  if (E.uniques.some((u) => u.id === card.evoId)) return st.uniques.includes(card.evoId) ? st : { ...st, uniques: [...st.uniques, card.evoId] };
  const n = Math.min(E.maxStacks, (st.stacks[card.evoId] ?? 0) + 1);
  return { ...st, stacks: { ...st.stacks, [card.evoId]: n } };
}

/** 진화 적용 대상: 일반 적·엘리트·정예·보스가 부른 졸개 = common, 보스·히든보스 = boss. 토마끼·개들개는 공용 제외 */
export function evolutionTargetOf(def: { id: string; rank: EnemyRank }, E: EvolutionData): 'common' | 'boss' | 'none' {
  if (def.rank === 'boss' || def.rank === 'hiddenBoss') return 'boss';
  if (E.commonExempt.includes(def.id)) return 'none';
  return 'common';
}

export interface EvolvedStats {
  hpMul: number;
  moveMul: number;
  damageMul: number;
  attackSpeedMul: number;
  /** 방 적 수 배율 */
  countMul: number;
  defense: number;
  knockbackRes: number;
  /** 초당 최대 체력 비율 */
  regenPerSec: number;
  explode: { radius: number; warnSec: number; color: string; damage: number } | null;
  split: { chance: number; count: number; hpMul: number; scale: number } | null;
  predator: { mul: number; radius: number; sec: number; color: string } | null;
  /** 0이면 없음 */
  immortalHp: number;
  overload: { mul: number; cycleSec: number; activeSec: number; color: string } | null;
  adapt: { perHit: number; max: number } | null;
}

export const NO_EVOLUTION: EvolvedStats = {
  hpMul: 1,
  moveMul: 1,
  damageMul: 1,
  attackSpeedMul: 1,
  countMul: 1,
  defense: 0,
  knockbackRes: 0,
  regenPerSec: 0,
  explode: null,
  split: null,
  predator: null,
  immortalHp: 0,
  overload: null,
  adapt: null,
};

const MUL_KEYS = ['hpMul', 'moveMul', 'damageMul', 'attackSpeedMul', 'countMul'] as const;

/** 대상(common·boss)의 진화 수치. 공용 진화는 변이 융합만큼 중첩을 늘려 계산 */
export function evolvedStats(st: EvolutionState, target: 'common' | 'boss' | 'none', E: EvolutionData): EvolvedStats {
  if (target === 'none') return NO_EVOLUTION;
  const s: EvolvedStats = { ...NO_EVOLUTION };
  let regen = 0;
  const fusion = E.evolutions.filter((e) => e.target === 'common' && e.effects.fusion).reduce((sum, e) => sum + (st.stacks[e.id] ?? 0) * (e.effects.fusion ?? 0), 0);
  const add = (fx: EvolutionEffects, n: number, def?: EvolutionDef) => {
    if (n <= 0) return;
    for (const k of MUL_KEYS) if (fx[k]) s[k] *= Math.pow(1 + fx[k]!, n);
    s.defense += (fx.defense ?? 0) * n;
    s.knockbackRes += (fx.knockbackRes ?? 0) * n;
    regen += (fx.regenPct ?? 0) * n;
    if (fx.explodeDamage && def?.explode) s.explode = { ...def.explode, damage: fx.explodeDamage * n };
    if (fx.splitChance && def?.split) s.split = { ...def.split, chance: Math.min(E.caps.splitChance, fx.splitChance * n) };
    if (fx.predatorMul && def?.predator) s.predator = { ...def.predator, mul: fx.predatorMul * n };
    if (fx.immortalHp) s.immortalHp = fx.immortalHp * n;
    if (fx.overloadMul && def?.overload) s.overload = { ...def.overload, mul: fx.overloadMul * n };
    if (fx.adaptPerHit) s.adapt = { perHit: fx.adaptPerHit * n, max: (fx.adaptMax ?? 0) * n };
  };
  for (const e of E.evolutions) {
    if (e.target !== target) continue;
    const n = st.stacks[e.id] ?? 0;
    const boosted = target === 'common' && !e.effects.fusion ? n * (1 + E.fusionPerStack * fusion) : n;
    add(e.effects, boosted, e);
  }
  if (target === 'common') add(E.overloadCard.effects, st.overloadStacks);
  s.defense = Math.min(E.caps.defense, s.defense);
  s.knockbackRes = Math.min(E.caps.knockbackRes, s.knockbackRes);
  s.regenPerSec = Math.min(E.caps.regenPerSec, regen / E.regenEverySec);
  return s;
}

/** 방어력 → 받는 피해 배율 (최종 피해 × 100 / (100 + 방어)) */
export function defenseMul(defense: number, cap: number): number {
  return 100 / (100 + Math.max(0, Math.min(cap, defense)));
}

/** 이번 웨이브에 더할 유니크 변형 적 (고른 유니크마다 확률로 한 마리, 맵·장과 상관없이) */
export function uniqueSpawns(rng: Rng, st: EvolutionState, E: EvolutionData): string[] {
  return E.uniques.filter((u) => st.uniques.includes(u.id) && rng.chance(E.uniqueSpawnChance)).map((u) => u.enemy);
}

/** 죽을 때 폭발: 유니크 대폭발이 있으면 그것만 (폭발성 조직과 겹치지 않게) */
export function deathBlastKind(hasUniqueBlast: boolean, stats: EvolvedStats, converted: boolean): 'unique' | 'evolution' | null {
  if (converted) return null;
  if (hasUniqueBlast) return 'unique';
  return stats.explode ? 'evolution' : null;
}

/** 분열하는가: 분열체는 다시 나뉘지 않고, 동시 개수 상한 */
export function shouldSplit(rng: Rng, stats: EvolvedStats, isSplitChild: boolean, alive: number, cap: number): boolean {
  if (!stats.split || isSplitChild) return false;
  if (alive + stats.split.count > cap) return false;
  return rng.chance(stats.split.chance);
}

/** 극한 적응: 피격 한 번 뒤 쌓인 방어 */
export function adaptStep(cur: number, stats: EvolvedStats): number {
  return stats.adapt ? Math.min(stats.adapt.max, cur + stats.adapt.perHit) : cur;
}

/** 과부하: 주기 안에서 지금 켜졌는가 (주기 끝 activeSec 동안) */
export function overloadActive(t: number, o: NonNullable<EvolvedStats['overload']>): boolean {
  const phase = t % o.cycleSec;
  return phase >= o.cycleSec - o.activeSec;
}

/** 진화가 붙은 웨이브: 군체 증식 배율로 늘리고 유니크 변형을 더하되, 합쳐서 cap을 넘지 않는다 (모바일 부하).
 * 원래 웨이브 수는 늘 지키고, 유니크는 있으면 하나는 남긴다 */
export function evolvedWave<T>(rng: Rng, wave: readonly T[], countMul: number, uniques: readonly T[], cap: number): T[] {
  const n = countMul === 1 ? wave.length : scaledCount(rng, wave.length, countMul);
  const out = Array.from({ length: n }, (_, i) => wave[i % wave.length]!);
  const room = Math.max(wave.length, cap);
  const u = uniques.slice(0, Math.max(Math.min(uniques.length, 1), room - Math.min(out.length, room)));
  return [...out.slice(0, Math.max(wave.length, room - u.length)), ...u];
}

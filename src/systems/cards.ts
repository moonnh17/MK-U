/**
 * 카드 보상 (순수 함수): 스케줄, 카드 풀, 뽑기, 적용, 전직 판정용 계열 집계.
 */
import type { Rng } from '../core/rng';
import { STAT_IDS, type CardOfferKind, type CardsData, type MapgenData, type SchoolId, type SkillsData, type StatId, type StatsData } from '../types/data';
import type { Stats } from './damage';
import type { StageRef } from './run';
import {
  acquireSkill,
  awakenSkill,
  awakeningReady,
  findSkill,
  levelUpSkill,
  type SkillLoadout,
} from './skills';
import { addStat } from './stats';

export type SkillCardKind = 'skillNew' | 'skillLevelUp' | 'awakening';

export type Card =
  | { kind: SkillCardKind; skillId: string }
  | { kind: 'stat'; stat: StatId; amount: number; grade: string };

// ---------- 스케줄 ----------

export function runStartOffers(cards: CardsData): CardOfferKind[] {
  return [cards.runStart];
}

export function isBossStage(stage: StageRef, mapgen: MapgenData): boolean {
  return mapgen.bossStages.includes(stage.stage);
}

/** 런 전체 스테이지 번호 (1-1 = 1, 2-1 = 6) */
export function globalStageIndex(stage: StageRef, mapgen: MapgenData): number {
  return (stage.chapter - 1) * mapgen.stagesPerChapter + stage.stage;
}

/**
 * 스테이지를 끝낼 때의 카드.
 * bossRoom: 보스방을 깬 직후 보스방에서 / afterStage: 다음 스테이지 시작방에서(마지막이면 클리어 화면 전에)
 */
export function stageEndOffers(
  stage: StageRef,
  mapgen: MapgenData,
  cards: CardsData,
): { bossRoom: CardOfferKind[]; afterStage: CardOfferKind } {
  const cycle = cards.afterStageCycle;
  const afterStage = cycle[(globalStageIndex(stage, mapgen) - 1) % cycle.length]!;
  return { bossRoom: isBossStage(stage, mapgen) ? [cards.bossBonus] : [], afterStage };
}

// ---------- 카드 풀 ----------

/**
 * 스킬 카드 3장.
 * 1) 각성 조건을 채운 스킬은 반드시 넣는다(오래 가진 순, 최대 maxAwakeningCards).
 * 2) 남은 칸은 미보유 액티브·보유 스킬 레벨업·패시브 습득/레벨업 중 가중치로 중복 없이 뽑는다.
 * 3) 그래도 모자라면 스탯 카드로 채운다.
 * available: 카드로 내도 되는 스킬(발동 로직이 등록된 스킬)
 */
export function drawSkillCards(
  rng: Rng,
  lo: SkillLoadout,
  stats: Stats,
  skills: SkillsData,
  cards: CardsData,
  available: (id: string) => boolean,
): Card[] {
  const out: Card[] = awakeningReady(lo, skills, stats)
    .filter(available)
    .slice(0, cards.maxAwakeningCards)
    .map((skillId) => ({ kind: 'awakening', skillId }));
  const taken = new Set(out.map((c) => (c as { skillId: string }).skillId));

  const w = cards.skillWeights;
  const pool: { item: Card; weight: number }[] = [];
  for (const def of skills.skills) {
    if (!available(def.id) || taken.has(def.id)) continue;
    const owned = lo.owned[def.id];
    const passive = def.kind === 'passive';
    if (!owned) pool.push({ item: { kind: 'skillNew', skillId: def.id }, weight: passive ? w.passiveNew : w.new });
    else if (owned.level < skills.maxLevel) {
      pool.push({ item: { kind: 'skillLevelUp', skillId: def.id }, weight: passive ? w.passiveLevelUp : w.levelUp });
    }
  }
  while (out.length < cards.cardCount) {
    const left = pool.filter((p) => p.weight > 0);
    if (left.length === 0) break;
    const pick = rng.weighted(left);
    out.push(pick);
    pool.splice(pool.findIndex((p) => p.item === pick), 1);
  }
  if (out.length < cards.cardCount) out.push(...drawStatCards(rng, cards.cardCount - out.length, cards));
  return out;
}

/** 스탯 카드: 서로 다른 스탯, 등급은 카드마다 가중치로 */
export function drawStatCards(rng: Rng, count: number, cards: CardsData): Card[] {
  const stats = rng.shuffle([...STAT_IDS]).slice(0, count);
  return stats.map((stat) => {
    const g = rng.weighted(cards.statGrades.map((x) => ({ item: x, weight: x.weight })));
    return { kind: 'stat', stat, amount: g.amount, grade: g.id };
  });
}

// ---------- 적용 ----------

export interface CardHolder {
  loadout: SkillLoadout;
  stats: Stats;
  hp: number;
  maxHp: number;
  /** 전직 판정용: 고른 스킬 카드의 계열 횟수 */
  schoolPicks: Record<SchoolId, number>;
  /** 마지막으로 고른 스킬 카드의 계열 (전직 동점 처리) */
  lastPickSchool?: SchoolId | null;
  /** 스탯 카드로 올린 양 (LSD-R) */
  statInvest?: Record<StatId, number>;
}

export interface CardContext {
  skills: SkillsData;
  stats: StatsData;
  baseMaxHp: number;
}

/** 카드를 적용한다. stored: 새 액티브·패시브가 칸이 없어 보관됨 */
export function applyCard<T extends CardHolder>(h: T, card: Card, c: CardContext): { holder: T; stored: boolean } {
  if (card.kind === 'stat') {
    const holder = addStat(h, card.stat, card.amount, c.baseMaxHp, c.stats);
    if (h.statInvest) holder.statInvest = { ...h.statInvest, [card.stat]: h.statInvest[card.stat] + card.amount };
    return { holder, stored: false };
  }

  const def = findSkill(c.skills, card.skillId);
  let loadout: SkillLoadout;
  let stored = false;
  if (card.kind === 'skillNew') {
    const r = acquireSkill(h.loadout, def);
    loadout = r.loadout;
    stored = !r.equipped;
  } else if (card.kind === 'skillLevelUp') {
    loadout = levelUpSkill(h.loadout, def.id, c.skills.maxLevel);
  } else {
    loadout = awakenSkill(h.loadout, def.id);
  }
  // 신규·레벨업·각성 모두 계열 1회
  const schoolPicks = { ...h.schoolPicks, [def.school]: h.schoolPicks[def.school] + 1 };
  return { holder: { ...h, loadout, schoolPicks, lastPickSchool: def.school }, stored };
}

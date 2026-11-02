/**
 * 카드 보상 (순수 함수): 스케줄, 카드 풀, 뽑기, 적용, 전직 판정용 계열 집계.
 */
import type { Rng } from '../core/rng';
import type { CardOfferKind, CardsData, MapgenData, SchoolId, SkillsData } from '../types/data';
import type { StageRef } from './run';
import {
  acquireSkill,
  findSkill,
  levelUpSkill,
  type SkillLoadout,
} from './skills';

export type SkillCardKind = 'skillNew' | 'skillLevelUp';

export type Card = { kind: SkillCardKind; skillId: string };

/** 아이템 선택 카드. 스킬 카드와 같은 창에 뜨지만 고르면 아이템을 얻는다 */
export type ItemChoiceCard = { kind: 'item'; itemId: string };
/** 학파 선택 카드(전직 동점) */
export type SchoolChoiceCard = { kind: 'school'; school: SchoolId };
export type AnyCard = Card | ItemChoiceCard | SchoolChoiceCard;

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
 * 스킬 카드 3장: 미보유 액티브·보유 스킬 레벨업·패시브 습득/레벨업 중 가중치로 중복 없이 뽑는다.
 * 뽑을 스킬이 모자라면 그만큼 적게 나온다.
 * available: 카드로 내도 되는 스킬(발동 로직이 등록된 스킬)
 */
export function drawSkillCards(
  rng: Rng,
  lo: SkillLoadout,
  skills: SkillsData,
  cards: CardsData,
  available: (id: string) => boolean,
): Card[] {
  const out: Card[] = [];
  const w = cards.skillWeights;
  const pool: { item: Card; weight: number }[] = [];
  for (const def of skills.skills) {
    if (!available(def.id)) continue;
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
  return out;
}

/** 진열해 둔 카드가 아직 의미가 있는지 (그사이 보스 카드로 같은 스킬을 올렸으면 아니다) */
export function cardStillValid(card: Card, lo: SkillLoadout, skills: SkillsData): boolean {
  const owned = lo.owned[card.skillId];
  if (card.kind === 'skillNew') return !owned;
  return !!owned && owned.level < skills.maxLevel;
}

// ---------- 적용 ----------

export interface CardHolder {
  loadout: SkillLoadout;
  /** 전직 판정용: 고른 스킬 카드의 계열 횟수 */
  schoolPicks: Record<SchoolId, number>;
  /** 마지막으로 고른 스킬 카드의 계열 (전직 동점 처리) */
  lastPickSchool?: SchoolId | null;
}

export interface CardContext {
  skills: SkillsData;
}

/** 카드를 적용한다. stored: 새 액티브·패시브가 칸이 없어 보관됨 */
export function applyCard<T extends CardHolder>(h: T, card: Card, c: CardContext): { holder: T; stored: boolean } {
  const def = findSkill(c.skills, card.skillId);
  let loadout: SkillLoadout;
  let stored = false;
  if (card.kind === 'skillNew') {
    const r = acquireSkill(h.loadout, def);
    loadout = r.loadout;
    stored = !r.equipped;
  } else {
    loadout = levelUpSkill(h.loadout, def.id, c.skills.maxLevel);
  }
  // 신규·레벨업 모두 계열 1회
  const schoolPicks = { ...h.schoolPicks, [def.school]: h.schoolPicks[def.school] + 1 };
  return { holder: { ...h, loadout, schoolPicks, lastPickSchool: def.school }, stored };
}

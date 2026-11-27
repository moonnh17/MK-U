/**
 * 오버플로우 모드 (순수 함수): 무한 스테이지 진행, 4장부터 랜덤 장, 보스 칸, 장 배율.
 * 1~3장은 본편과 같은 고정 순서이고, 4장부터 장마다 테마(장 풀)를 시드로 뽑는다.
 */
import { Rng } from '../core/rng';
import type { GameData } from '../data/index';
import type { OverflowData } from '../types/data';
import type { StageRef, StageTheme } from './run';
import { newEvolutionState, type EvolutionState } from './evolution';

type Data = Pick<GameData, 'overflow' | 'bosses' | 'enemies' | 'mapgen'>;

/** 스테이지를 넘어가도 유지되는 오버플로우 런 상태 */
export interface OverflowState {
  /** 이미 나온 '한 번만' 보스 */
  onceBosses: string[];
  /** 직전 보스 칸 (풀 추첨에서 연속 금지) */
  lastBoss: string | null;
  /** 적 진화 (스테이지 클리어 때 고른 것, 다음 스테이지부터 적용) */
  evolution: EvolutionState;
  /** 진화 카드 보상: 다음 스테이지 시작방에 떨어뜨릴 상자 */
  pendingDrops: PendingDrop[];
  /** 이 런에서 맞힌 공격의 태그 수 (마기카이저 학습) */
  tagUse?: Partial<Record<string, number>>;
  /** 고른 진화 카드 기록 (화면 오른쪽 위 목록): 진화 id·보상 id */
  picks?: { evo: string; reward: string }[];
}

export type PendingDrop = { kind: 'weapon'; tier: string } | { kind: 'item'; weights: Partial<Record<string, number>> };

export function newOverflowState(): OverflowState {
  return { onceBosses: [], lastBoss: null, evolution: newEvolutionState(), pendingDrops: [] };
}

export function firstOverflowStage(): StageRef {
  return { chapter: 1, stage: 1 };
}

/** 표 조회 장 (타일·음악·엘리트·조우·상자 표): 테마가 있으면 그 기준 장 */
export function contentChapter(s: StageRef): number {
  return s.theme?.chapter ?? s.chapter;
}

/** 히든보스 장 배율 표를 볼 장: 4장부터는 3장 값 (성장은 overflowGrowth로 따로) */
export function hiddenTableChapter(s: StageRef, d: Pick<GameData, 'overflow'>): number {
  return Math.min(s.chapter, d.overflow.fixedChapters);
}

/** 웨이브를 가져올 장들 */
export function waveChaptersOf(s: StageRef): readonly number[] {
  return s.theme?.waveChapters ?? [s.chapter];
}

/**
 * 스테이지 하나의 맵(테마): 1~3장 맵 중 하나를 가중치로, 직전 스테이지 맵은 뺀다.
 * 가중치 0인 테마(아직 만들지 않은 전용 맵 자리)는 나오지 않는다
 */
export function pickTheme(seed: number, chapter: number, stage: number, prevId: string | null, data: OverflowData): StageTheme {
  const live = data.themes.filter((t) => t.weight > 0);
  const pool = live.filter((t) => t.id !== prevId);
  const t = Rng.derive(seed, `ovf-theme-${chapter}-${stage}`).weighted((pool.length > 0 ? pool : live).map((x) => ({ item: x, weight: x.weight })));
  return { id: t.id, chapter: t.chapter, waveChapters: [...t.waveChapters], ...(t.tint ? { tint: t.tint } : {}) };
}

/** 본편 장·스테이지의 보스 */
function storyBoss(chapter: number, stage: number, d: Data): string | undefined {
  return d.bosses.bosses.find((b) => b.chapter === chapter && b.stage === stage)?.id;
}

/**
 * 4장부터 보스 스테이지의 보스 칸. 고정 칸(데이터 순서대로 첫 일치) → 없으면 풀에서 직전 보스를 빼고 추첨.
 * '@theme' = 뽑힌 장(기준 장)의 본편 보스.
 */
export function bossForStage(seed: number, chapter: number, stage: number, theme: StageTheme, state: OverflowState, d: Data): string {
  const O = d.overflow;
  for (const f of O.fixedBosses) {
    if (f.stage !== stage) continue;
    if (f.chapter !== undefined ? f.chapter !== chapter : !f.everyChapters || chapter % f.everyChapters !== 0) continue;
    if (f.once && state.onceBosses.includes(f.boss)) continue;
    const id = f.boss === '@theme' ? storyBoss(theme.chapter, stage, d) : f.boss;
    if (id) return id;
  }
  const pool = O.bossPools[String(stage)] ?? [];
  const choices = pool.length > 1 ? pool.filter((b) => b !== state.lastBoss) : pool;
  return Rng.derive(seed, `ovf-boss-${chapter}-${stage}`).pick(choices);
}

/** 다음 스테이지 (끝 없음). 상태는 새 객체로 */
export function advanceOverflow(seed: number, cur: StageRef, state: OverflowState, d: Data): { next: StageRef; state: OverflowState } {
  const per = d.mapgen.stagesPerChapter;
  const chapter = cur.stage < per ? cur.chapter : cur.chapter + 1;
  const stage = cur.stage < per ? cur.stage + 1 : 1;
  if (chapter <= d.overflow.fixedChapters) return { next: { chapter, stage }, state };
  const theme = pickTheme(seed, chapter, stage, cur.theme?.id ?? null, d.overflow);
  const next: StageRef = { chapter, stage, theme };
  if (!d.mapgen.bossStages.includes(stage)) return { next, state };
  const boss = bossForStage(seed, chapter, stage, theme, state, d);
  const once = d.overflow.fixedBosses.some((f) => f.once && f.boss === boss);
  return { next: { ...next, boss }, state: { ...state, onceBosses: once ? [...state.onceBosses, boss] : state.onceBosses, lastBoss: boss } };
}

/** 아직 전투가 없는 보스는 임시 보스로 */
export function resolveBossId(id: string, d: Pick<GameData, 'overflow'>): string {
  return d.overflow.placeholderBosses[id] ?? id;
}

/** 이 스테이지 보스방에 스폰할 적 id */
export function stageBossId(s: StageRef, d: Data): string | undefined {
  return s.boss ? resolveBossId(s.boss, d) : storyBoss(s.chapter, s.stage, d);
}

function growth(chapter: number, O: OverflowData): { hp: number; damage: number } {
  const g = Math.max(0, chapter - O.fixedChapters);
  return { hp: 1 + O.scale.growthPerChapter.hp * g, damage: 1 + O.scale.growthPerChapter.damage * g };
}

/** 4장부터 일반 적·정예 배율: 자기 장 → 3장 수준 × 장 성장 */
export function overflowEnemyScale(chapter: number, enemyChapter: number, d: Pick<GameData, 'overflow'>): { hp: number; damage: number } {
  const O = d.overflow;
  if (chapter <= O.fixedChapters) return { hp: 1, damage: 1 };
  const tier = O.scale.tierToChapter3[String(enemyChapter)] ?? { hp: 1, damage: 1 };
  const g = growth(chapter, O);
  return { hp: tier.hp * g.hp, damage: tier.damage * g.damage };
}

/** 4장부터 성장만 (히든보스: 장 배율은 3장 값을 쓴다) */
export function overflowGrowth(chapter: number, d: Pick<GameData, 'overflow'>): { hp: number; damage: number } {
  return growth(chapter, d.overflow);
}

/** 4장부터 보스: 같은 스테이지 칸의 3장 보스 체력·피해 단계에 맞춘 뒤 장 성장 */
export function overflowBossScale(chapter: number, bossId: string, stage: number, d: Data): { hp: number; damage: number } {
  const O = d.overflow;
  if (chapter <= O.fixedChapters) return { hp: 1, damage: 1 };
  const ref = storyBoss(O.fixedChapters, stage, d);
  const hp = (id: string | undefined) => d.enemies.enemies.find((e) => e.id === id)?.maxHp ?? 0;
  const own = hp(bossId);
  const tier = O.scale.bossDamageTier;
  const g = growth(chapter, O);
  return {
    hp: (own > 0 && ref ? hp(ref) / own : 1) * g.hp * (O.scale.bossHpBonus?.[bossId] ?? 1),
    damage: (ref && tier[ref] && tier[bossId] ? tier[ref] / tier[bossId] : 1) * g.damage,
  };
}

/** 1-1부터 따라가 chapter-stage의 스테이지와 상태 (디버그 이동: 같은 시드면 정상 진행과 같다) */
export function overflowStageAt(seed: number, chapter: number, stage: number, d: Data): { stage: StageRef; state: OverflowState } {
  let s = firstOverflowStage();
  let state = newOverflowState();
  while (s.chapter < chapter || (s.chapter === chapter && s.stage < stage)) {
    const r = advanceOverflow(seed, s, state, d);
    s = r.next;
    state = r.state;
  }
  return { stage: s, state };
}

/** 스테이지 끝 카드 순서: 기존 보상(스킬/아이템 교차) 뒤에 오버플로우면 적 진화 카드 (대체가 아니라 추가) */
export function stageEndOfferKinds<K extends string>(afterStage: K, overflow: boolean): (K | 'evolution')[] {
  return overflow ? [afterStage, 'evolution'] : [afterStage];
}

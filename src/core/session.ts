import type { GameData } from '../data/index';
import { startingStats, type Stats } from '../systems/damage';
import type { StageMap } from '../systems/mapgen';
import type { StageRef } from '../systems/run';
import { emptyLoadout, type Cooldowns, type SkillLoadout } from '../systems/skills';
import { initialSlots, plainWeapon, type WeaponSlots } from '../systems/weapons';
import type { ItemState } from '../items/runtime';
import type { ConversionLog } from '../systems/advancement';
import { STAT_IDS, type EncounterKindId, type GradeId, type JobId, type SchoolId, type StatId } from '../types/data';

/** 스테이지를 넘어가도 유지되는 플레이어 상태 */
export interface PlayerState {
  hp: number;
  maxHp: number;
  /** 보호막: 체력보다 먼저 깎인다(지금은 환원주의자 각성이 채움) */
  shield: number;
  shieldMax: number;
  energy: number;
  energyMax: number;
  coins: number;
  stats: Stats;
  weapons: WeaponSlots;
  loadout: SkillLoadout;
  /** 스킬 id → 남은 쿨타임(초) */
  cooldowns: Cooldowns;
  ultimate: { id: string; gauge: number; awakened: boolean };
  /** 전직 판정용: 고른 스킬 카드의 계열 횟수 (전직은 M3) */
  schoolPicks: Record<SchoolId, number>;
  /** 마지막으로 고른 스킬 카드의 계열 (전직 동점 처리) */
  lastPickSchool: SchoolId | null;
  job: JobId;
  /** 전직한 학파. 전직 전 null */
  advancement: SchoolId | null;
  /** 전직 스킬 변환 기록 (인벤토리 스킬 탭) */
  advancementLog: ConversionLog | null;
  /** 가진 아이템 */
  items: string[];
  /** 이번 런에 얻은 적 있는 아이템 (같은 아이템은 한 번만, 합성 재료 포함) */
  itemsObtained: string[];
  /** 아이템별 상태 (재사용 대기·누적·타이머) */
  itemState: Record<string, ItemState>;
  /** 확률 이전으로 옮겨진 등급 가중치 */
  lootShift: Partial<Record<GradeId, number>>;
  /** 스탯 카드로 올린 양 (LSD-R '가장 많이 투자한 스탯') */
  statInvest: Record<StatId, number>;
  /** 이번 런에 나온 히든보스 (다시 나오지 않는다) */
  hiddenBossesMet: string[];
}

export type RunOutcome = { type: 'dead' } | { type: 'chapterClear'; chapter: number };

/** HUD·터치 버튼이 그리는 스킬 칸 하나 */
export interface SkillSlotView {
  skillId: string | null;
  /** 짧은 이름 */
  label: string;
  level: number;
  awakened: boolean;
  /** 남은 쿨타임(초). 궁극기는 0 */
  cooldownLeft: number;
  cooldownTotal: number;
  /** 0~1. 궁극기 게이지(액티브는 쓰지 않음) */
  gauge: number;
  /** 지금 누르면 발동하는지 (근접: 사거리 안 적, 궁극기: 게이지) */
  usable: boolean;
  color: string;
}

/** HUD '현재 버프' 한 칸 */
export interface BuffView {
  id: string;
  label: string;
  color: string;
  leftSec: number;
  totalSec: number;
}

/** 현재 런 상태. RunScene이 쓰고 UIScene(HUD·미니맵)이 읽는다. */
export interface RunSession {
  stage: StageRef;
  map: StageMap;
  visited: Set<number>;
  currentRoomId: number | null;
  player: PlayerState;
  enemiesAlive: number;
  outcome: RunOutcome | null;
  /** 마지막으로 에너지 부족으로 못 쏜 시각(ms, HUD 표시용) */
  energyEmptyAt: number;
  /** 액티브 4칸 + 궁극기 + 패시브 (RunScene이 매 프레임 채운다) */
  skillView: SkillSlotView[];
  /** 유형이 정해진 조우 칸 (방 id → 유형, 미니맵 아이콘) */
  encounters: Map<number, EncounterKindId>;
  /** HUD '현재 버프' (RunScene이 매 프레임 채운다) */
  buffs: BuffView[];
}

export function newPlayerState(data: GameData): PlayerState {
  const job = data.jobs.jobs.find((j) => j.id === data.jobs.startJob)!;
  const stats = startingStats(data.stats.startValue);
  for (const [k, v] of Object.entries(job.statBonus)) stats[k as keyof typeof stats] += v ?? 0;
  return {
    hp: data.player.maxHp,
    maxHp: data.player.maxHp,
    shield: 0,
    shieldMax: data.player.shieldMax,
    energy: data.player.energy.start,
    energyMax: data.player.energy.max,
    coins: 0,
    stats,
    weapons: initialSlots(plainWeapon(data.weapons.weapons.find((w) => w.id === job.startWeapon)!)),
    loadout: emptyLoadout(data.skills.activeSlots),
    cooldowns: {},
    ultimate: { id: job.startUltimate, gauge: 0, awakened: false },
    schoolPicks: { hectar: 0, acro: 0 },
    lastPickSchool: null,
    job: job.id,
    advancement: null,
    advancementLog: null,
    items: [],
    itemsObtained: [],
    itemState: {},
    lootShift: {},
    hiddenBossesMet: [],
    statInvest: Object.fromEntries(STAT_IDS.map((s) => [s, 0])) as Record<StatId, number>,
  };
}

/** 디버그 토글 (스테이지를 넘어가도 유지) */
export interface DebugFlags {
  revealMap: boolean;
  invincible: boolean;
}

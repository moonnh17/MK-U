import { sanityMaxFor } from '../systems/sanity';
import type { GameData } from '../data/index';
import type { StageMap } from '../systems/mapgen';
import type { StageRef } from '../systems/run';
import { emptyLoadout, type Cooldowns, type SkillLoadout } from '../systems/skills';
import type { WeaponSlots } from '../systems/weapons';
import type { ItemState } from '../items/runtime';
import type { ConversionLog } from '../systems/advancement';
import { newRunRecord, type CrystalResult, type RunRecord } from '../systems/runRecord';
import { upgradeBonus, type UpgradeLevels } from '../systems/upgrades';
import type { EncounterKindId, GradeId, JobId, SchoolId } from '../types/data';

/** 스테이지를 넘어가도 유지되는 플레이어 상태 */
export interface PlayerState {
  hp: number;
  maxHp: number;
  /** 보호막: 체력보다 먼저 깎인다(지금은 환원주의자 각성이 채움) */
  /** 정신력. 0이 되면 패닉 */
  sanity: number;
  sanityMax: number;
  panic: boolean;
  energy: number;
  energyMax: number;
  coins: number;
  /** 아직 1개가 되지 않은 마기 입자 (화면에 보이지 않는다) */
  coinCarry: number;
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
  /** 이번 런에 나온 히든보스 (다시 나오지 않는다) */
  hiddenBossesMet: string[];
  /** 이번 런에 띄운 제미니 미니 대사 (이벤트·대사 키, 같은 런에 반복하지 않는다) */
  geminiSaid: string[];
  /** 결산용 런 기록 (스테이지를 넘어가도 유지) */
  record: RunRecord;
  /** 영구 강화로 더한 기본 체력·보호막 최대치 (스탯은 시작 스탯에 이미 들어 있다) */
  meta: { maxHp: number; sanity: number };
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
  /** 아이콘 그림 키 (그림이 있으면 짧은 이름 대신) */
  iconKey: string | null;
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
  /** 회피 칸: 이름(전직하면 바뀜)과 재사용 대기 */
  dodgeView: { nameKey: string; left: number; total: number };
  /** 유형이 정해진 조우 칸 (방 id → 유형, 미니맵 아이콘) */
  encounters: Map<number, EncounterKindId>;
  /** HUD '현재 버프' (RunScene이 매 프레임 채운다) */
  buffs: BuffView[];
  /** 실제로 쓰는 스탯 (무기·아이템 보정 포함, 인벤토리 표시용. RunScene이 매 프레임 채운다) */
  /** 런이 끝났을 때의 결산 (결정은 이미 저장에 더해져 있다) */
  settlement: Settlement | null;
  /** 지금 싸우는 보스 (보스 체력바, RunScene이 매 프레임 채운다) */
  boss: BossView | null;
}

/** 보스 체력바 한 줄 */
export interface BossView {
  name: string;
  hp: number;
  maxHp: number;
  /** 강화 단계가 열리는 체력 비율 (눈금) */
  markers: number[];
  color: string;
}

export interface Settlement {
  runClear: boolean;
  crystals: CrystalResult;
  /** 더한 뒤 보유 결정 */
  balance: number;
  /** 지금까지 얻은 과거의 기억 조각 수 */
  shardsOwned: number;
}

/**
 * jobId: 실험장에서 고른 직업 (없으면 데이터의 시작 직업)
 * upgrades: 그 직업의 영구 강화 레벨 (실험체의 기억)
 */
export function newPlayerState(data: GameData, jobId: string = data.jobs.startJob, upgrades?: UpgradeLevels): PlayerState {
  const job = data.jobs.jobs.find((j) => j.id === jobId) ?? data.jobs.jobs.find((j) => j.id === data.jobs.startJob)!;
  const bonus = upgradeBonus(upgrades, data.meta.upgrades);
  return {
    hp: data.player.maxHp + bonus.maxHp,
    maxHp: data.player.maxHp + bonus.maxHp,
    sanity: sanityMaxFor(bonus.sanity, data.player.sanity),
    sanityMax: sanityMaxFor(bonus.sanity, data.player.sanity),
    panic: false,
    meta: { maxHp: bonus.maxHp, sanity: bonus.sanity },
    energy: data.player.energy.start,
    energyMax: data.player.energy.max,
    coins: 0,
    coinCarry: 0,
    // 빈손으로 시작해 시작방의 무기 상자를 연다
    weapons: { slots: [null, null], active: 0 },
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
    geminiSaid: [],
    record: newRunRecord(),
  };
}

/** 디버그 토글 (스테이지를 넘어가도 유지) */
export interface DebugFlags {
  revealMap: boolean;
  invincible: boolean;
}

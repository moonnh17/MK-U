import type { GameData } from '../data/index';
import { startingStats, type Stats } from '../systems/damage';
import type { StageMap } from '../systems/mapgen';
import type { StageRef } from '../systems/run';
import { emptyLoadout, type Cooldowns, type SkillLoadout } from '../systems/skills';
import { initialSlots, type WeaponSlots } from '../systems/weapons';
import type { SchoolId } from '../types/data';

/** 스테이지를 넘어가도 유지되는 플레이어 상태 */
export interface PlayerState {
  hp: number;
  maxHp: number;
  energy: number;
  energyMax: number;
  coins: number;
  stats: Stats;
  weapons: WeaponSlots;
  loadout: SkillLoadout;
  /** 스킬 id → 남은 쿨타임(초) */
  cooldowns: Cooldowns;
  ultimate: { id: string; gauge: number };
  /** 전직 판정용: 고른 스킬 카드의 계열 횟수 (전직은 M3) */
  schoolPicks: Record<SchoolId, number>;
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
}

export function newPlayerState(data: GameData): PlayerState {
  return {
    hp: data.player.maxHp,
    maxHp: data.player.maxHp,
    energy: data.player.energy.start,
    energyMax: data.player.energy.max,
    coins: 0,
    stats: startingStats(data.stats.startValue),
    weapons: initialSlots(data.weapons.startWeapon),
    loadout: emptyLoadout(data.skills.activeSlots),
    cooldowns: {},
    ultimate: { id: data.ultimates.startUltimate, gauge: 0 },
    schoolPicks: { hectar: 0, acro: 0 },
  };
}

/** 디버그 토글 (스테이지를 넘어가도 유지) */
export interface DebugFlags {
  revealMap: boolean;
  invincible: boolean;
}

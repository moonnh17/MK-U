import type { GameData } from '../data/index';
import { startingStats, type Stats } from '../systems/damage';
import type { StageMap } from '../systems/mapgen';
import type { StageRef } from '../systems/run';
import { initialSlots, type WeaponSlots } from '../systems/weapons';

/** 스테이지를 넘어가도 유지되는 플레이어 상태 */
export interface PlayerState {
  hp: number;
  maxHp: number;
  energy: number;
  energyMax: number;
  coins: number;
  stats: Stats;
  weapons: WeaponSlots;
}

export type RunOutcome = { type: 'dead' } | { type: 'chapterClear'; chapter: number };

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
  };
}

/** 디버그 토글 (스테이지를 넘어가도 유지) */
export interface DebugFlags {
  revealMap: boolean;
  invincible: boolean;
}

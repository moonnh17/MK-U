/**
 * 배경 음악 선택과 음량 (순수 함수).
 * 실험장은 lab, 런은 run, 보스와 마주한 동안은 챕터별 보스 곡.
 */
import type { MusicData } from '../types/data';

/** facingBoss: 보스·히든보스와 마주함 / hiddenBoss: 그중 히든보스 / inCombat: 일반 전투 칸에서 싸우는 중 */
export type MusicPlace = { place: 'lab' } | { place: 'run'; chapter: number; facingBoss: boolean; hiddenBoss?: boolean; inCombat?: boolean };

/** 틀어야 할 곡 id: 히든보스 > 챕터 보스 > 챕터 전투 > 런 */
export function pickTrack(m: MusicData, at: MusicPlace): string {
  if (at.place === 'lab') return m.labTrack;
  if (at.facingBoss && at.hiddenBoss) return m.hiddenBossTrack;
  if (at.facingBoss) return m.bossTracks[String(at.chapter)] ?? m.runTrack;
  if (at.inCombat) return m.combatTracks[String(at.chapter)] ?? m.runTrack;
  return m.runTrack;
}

/** 실제 음량: 곡 기준 × 설정값. 소리를 끄면 0 */
export function musicGain(base: number, slider: number, muted: boolean): number {
  if (muted) return 0;
  return Math.min(1, Math.max(0, base * slider));
}

/** 설정 슬라이더 값 정리 (저장값이 깨져 있어도 0~1) */
export function clampVolume(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

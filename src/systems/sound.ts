/**
 * 효과음 (순수 함수): 소리 이름 목록, 겹침 제한, 음 높이 흔들림, 무기별 소리.
 * 소리 모양(파형·높낮이·길이)은 data/sounds.json, 실제 합성은 audio/sfx.ts(Web Audio).
 */
import type { Rng } from '../core/rng';
import type { SoundsData, WeaponDef } from '../types/data';

/** 게임이 내는 효과음 이름 (sounds.json의 키와 같아야 한다) */
export const SFX_IDS = [
  'shotPistol',
  'shotRifle',
  'shotSmg',
  'shotShotgun',
  'shotSniper',
  'shotLob',
  'shotBow',
  'shotStaff',
  'shotLaser',
  'shotBeamHeavy',
  'shotDisc',
  'shotNeedle',
  'swingLight',
  'swingMid',
  'swingHeavy',
  'hitLight',
  'hitMid',
  'hitHeavy',
  'hitBullet',
  'crit',
  'kill',
  'killBig',
  'explosionSmall',
  'explosionMid',
  'explosionLarge',
  'electric',
  'playerHurt',
  'coin',
  'energy',
  'itemGet',
  'skill',
  'ultimate',
  'spaceRupture',
  'bossSlam',
  'warning',
  'bossPhase',
  'doorLock',
  'doorOpen',
  'roomClear',
  'cardPick',
  'uiClick',
  'awaken',
  'warp',
  'warpArrive',
  'dash',
  'blink',
  'panic',
  'vend',
  'heal',
  'itemFanfare',
  'combatStart',
  'advCharge',
  'advBurst',
] as const;

/** 크기·위력에 따라 소리가 바뀌는 묶음 (sounds.json tiers): 휘두르기·타격은 피해, 폭발은 반지름 */
export const SFX_GROUPS = ['swing', 'hit', 'explosion'] as const;
export type SfxGroup = (typeof SFX_GROUPS)[number];

export type SfxId = (typeof SFX_IDS)[number];

/**
 * 겹침 제한: 같은 소리는 gapSec 안에 다시 나지 않고, 동시에 maxVoices개까지만.
 * now·durSec 단위는 초 (오디오 시계).
 */
export class SoundGate {
  private last = new Map<string, number>();
  private voices = new Map<string, number[]>();

  constructor(private readonly data: SoundsData) {}

  /** 지금 낼 수 있으면 기록하고 true */
  tryPlay(id: string, now: number, durSec: number): boolean {
    const def = this.data.sounds[id];
    if (!def) return false;
    const gap = def.gapSec ?? this.data.defaultGapSec;
    const max = def.maxVoices ?? this.data.defaultMaxVoices;
    const last = this.last.get(id);
    if (last !== undefined && now - last < gap) return false;
    const live = (this.voices.get(id) ?? []).filter((end) => end > now);
    if (live.length >= max) {
      this.voices.set(id, live);
      return false;
    }
    live.push(now + durSec);
    this.voices.set(id, live);
    this.last.set(id, now);
    return true;
  }
}

/** 소리 하나의 길이: 파일 소리는 적힌 길이, 합성은 가장 늦게 끝나는 층 */
export function soundLength(def: SoundsData['sounds'][string]): number {
  if (def.files) return def.durSec ?? 0.3;
  return Math.max(...(def.layers ?? []).map((l) => (l.delaySec ?? 0) + l.durSec));
}

/** 묶음 이름이면 크기(반지름·피해)에 맞는 단계의 소리, 아니면 그대로. 크기를 모르면 가운데 단계 */
export function resolveSfx(data: SoundsData, id: string, size?: number): string {
  const tiers = data.tiers[id];
  if (!tiers) return id;
  if (size === undefined) return tiers[Math.floor((tiers.length - 1) / 2)]!.id;
  return (tiers.find((t) => t.upTo === undefined || size <= t.upTo) ?? tiers[tiers.length - 1]!).id;
}

/** 매번 똑같이 들리지 않게 음 높이를 ±jitter 비율로 흔든다 */
export function pitchFactor(rng: Rng, jitter: number): number {
  return 1 + rng.range(-jitter, jitter);
}

/** 무기 공격 소리: 데이터에 적힌 것, 없으면 분류·탄 모양에 따라 */
export function weaponSfx(w: Pick<WeaponDef, 'category' | 'pattern'> & { sfx?: string }): SfxId | SfxGroup {
  if (w.sfx && (SFX_IDS as readonly string[]).includes(w.sfx)) return w.sfx as SfxId;
  if (w.category === 'blade') return 'swing';
  if (w.category === 'bow') return 'shotBow';
  if (w.category === 'staff' || w.pattern.kind === 'homing') return 'shotStaff';
  if (w.pattern.kind === 'lob') return 'shotLob';
  return 'shotPistol';
}

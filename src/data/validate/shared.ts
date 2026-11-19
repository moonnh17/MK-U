import type { EnemyAttackDef, IntRange, SpriteRef } from '../../types/data';
import type { GameData } from '../index';

export type Errors = string[];

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

export function checkPositive(errors: Errors, where: string, v: unknown, allowZero = false): void {
  if (!isNum(v) || (allowZero ? v < 0 : v <= 0)) {
    errors.push(`${where}: ${allowZero ? '0 이상' : '양수'}여야 함 (값: ${String(v)})`);
  }
}

export function checkRange(errors: Errors, where: string, r: IntRange | undefined, min = 0): void {
  if (!Array.isArray(r) || r.length !== 2 || !Number.isInteger(r[0]) || !Number.isInteger(r[1])) {
    errors.push(`${where}: [min, max] 정수 범위여야 함`);
    return;
  }
  if (r[0] < min || r[0] > r[1]) errors.push(`${where}: 범위가 잘못됨 [${r[0]}, ${r[1]}]`);
}

export function checkSprite(errors: Errors, where: string, s: SpriteRef): void {
  if (typeof s.spriteKey !== 'string' || s.spriteKey === '') errors.push(`${where}: spriteKey 없음`);
  if (!HEX_COLOR.test(s.color)) errors.push(`${where}: color는 #RRGGBB (값: ${s.color})`);
  checkPositive(errors, `${where}.size`, s.size);
}

export function checkUnique(errors: Errors, where: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${where}: id 중복 '${id}'`);
    seen.add(id);
  }
}

/** 구역 검사들이 함께 쓰는 값 */
export interface V {
  d: GameData;
  errors: Errors;
  /** ko.json에 있어야 하는 키를 모은다 (마지막에 한꺼번에 확인) */
  needText: (where: string, key: string) => void;
  tagIds: ReadonlySet<string>;
  gradeIds: ReadonlySet<string>;
  weaponIds: readonly string[];
  enemyIds: readonly string[];
}

export function checkWeights(v: V, where: string, w: Record<string, number | undefined>): void {
  const { errors, gradeIds } = v;
  let sum = 0;
  for (const [k, v] of Object.entries(w)) {
    if (!gradeIds.has(k)) errors.push(`${where}: 알 수 없는 등급 '${k}'`);
    checkPositive(errors, `${where}.${k}`, v, true);
    sum += v ?? 0;
  }
  if (sum <= 0) errors.push(`${where}: 가중치 합이 0`);
}

export function checkAttacks(v: V, where: string, attacks: readonly EnemyAttackDef[] | undefined): void {
  const { errors } = v;
  checkUnique(errors, `${where}.attacks`, (attacks ?? []).map((a) => a.id));
  for (const a of attacks ?? []) {
    const w = `${where}.attacks.${a.id}`;
    if (!['lunge', 'slam', 'burst', 'puddle', 'fan', 'rope', 'snipe', 'spikes', 'roots'].includes(a.kind)) errors.push(`${w}: kind는 lunge · slam · burst · puddle · fan · rope · snipe · spikes · roots`);
    for (const k of ['triggerRange', 'windupSec', 'actSec', 'damage'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
    for (const k of ['recoverSec', 'cooldownSec'] as const) checkPositive(errors, `${w}.${k}`, a[k], true);
    if (a.kind === 'lunge') checkPositive(errors, `${w}.speed`, a.speed);
    if (a.chain) {
      checkRange(errors, `${w}.chain`, a.chain);
      checkPositive(errors, `${w}.chainWindupSec`, a.chainWindupSec);
    }
    if (a.kind === 'fan') for (const k of ['shots', 'spreadDeg', 'speed', 'range'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
    if (a.kind === 'rope') {
      for (const k of ['speed', 'range', 'pullSpeed', 'radius', 'arcDeg', 'axeDamage'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
      checkPositive(errors, `${w}.axeDelaySec`, a.axeDelaySec, true);
    }
    if (a.kind === 'snipe') {
      for (const k of ['lockSec', 'width', 'range'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
      if ((a.lockSec ?? 0) >= a.windupSec) errors.push(`${w}: lockSec는 windupSec보다 짧아야 함`);
    }
    if (a.kind === 'slam') {
      checkPositive(errors, `${w}.radius`, a.radius);
      checkPositive(errors, `${w}.reach`, a.reach, true);
    }
    if (a.kind === 'burst') {
      for (const k of ['shots', 'speed', 'range'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
      checkPositive(errors, `${w}.shotGapSec`, a.shotGapSec, true);
      if ((a.shots ?? 1) > 1 && (a.shotGapSec ?? 0) * ((a.shots ?? 1) - 1) > a.actSec) errors.push(`${w}: 마지막 발이 actSec 안에 나가야 함`);
    }
    if (a.kind === 'puddle') for (const k of ['radius', 'liveSec', 'tickSec'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
    if (a.kind === 'spikes') {
      for (const k of ['strikes', 'warnSec', 'radius'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
      checkPositive(errors, `${w}.strikeGapSec`, a.strikeGapSec, true);
    }
    if (a.kind === 'roots') {
      for (const k of ['strikes', 'warnSec', 'range', 'width'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
      checkPositive(errors, `${w}.strikeGapSec`, a.strikeGapSec, true);
    }
    for (const k of ['shot', 'warnArt', 'hitArt', 'fx'] as const) if (a[k]) checkSprite(errors, `${w}.${k}`, a[k]!);
  }
}

export function checkTags(v: V, where: string, tags: readonly string[]): void {
  const { errors, tagIds } = v;
  for (const t of tags) if (!tagIds.has(t)) errors.push(`${where}: 알 수 없는 태그 '${t}'`);
}

export function checkSources(v: V, where: string, sources: Record<string, readonly string[]>): void {
  for (const [k, tags] of Object.entries(sources)) checkTags(v, `${where}.sources.${k}`, tags);
}

/**
 * 무기·에너지·자동 조준 (순수 함수). Phaser에 의존하지 않는다.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import type { GradeId, WeaponDef, WeaponOptionDef } from '../types/data';

// ---------- 무기 하나 (등급·옵션이 붙은 실물) ----------

export interface WeaponOption {
  id: WeaponOptionDef['id'];
  value: number;
}

export interface WeaponItem {
  defId: string;
  grade: GradeId;
  options: WeaponOption[];
}

/** 옵션 없는 기본 무기 (시작 무기·테스트 무기) */
export function plainWeapon(def: Pick<WeaponDef, 'id' | 'grade'>): WeaponItem {
  return { defId: def.id, grade: def.grade, options: [] };
}

export interface WeaponStats {
  /** 태그 보정 전 기준 피해 (등급 배율 적용) */
  damage: number;
  fireIntervalSec: number;
  energyCost: number;
  projectileSpeed: number;
  critChance: number;
}

/** 등급 배율·옵션을 반영한 실제 수치 (energyMul: 등급 에너지 배율) */
export function weaponStats(def: WeaponDef, item: WeaponItem, gradeMul: number, energyMul = 1): WeaponStats {
  const opt = (id: WeaponOption['id']) => item.options.filter((o) => o.id === id).reduce((s, o) => s + o.value, 0);
  return {
    damage: def.baseDamage * gradeMul,
    fireIntervalSec: def.fireIntervalSec / (1 + opt('attackSpeed')),
    energyCost: Math.max(0, def.energyCost * energyMul - opt('energyCost')),
    projectileSpeed: def.projectileSpeed * (1 + opt('projectileSpeed')),
    critChance: Math.min(1, (def.critChance ?? 0) + opt('crit')),
  };
}

/** 차징할수록 치명타 확률이 max까지 오른다 (활) */
export function chargedCrit(base: number, ratio: number, max: number | undefined): number {
  if (max === undefined) return base;
  return base + (Math.max(base, max) - base) * Math.max(0, Math.min(1, ratio));
}

/** 쏠수록 빨라지는 무기의 발사 속도 배율 (MG70) */
export function spinUpMul(shots: number, spin: { perShot: number; maxMul: number }): number {
  return Math.min(spin.maxMul, 1 + Math.max(0, shots - 1) * spin.perShot);
}

/** 치명: 확률로 피해 × 배율 */
export function rollCrit(rng: Rng, damage: number, chance: number, multiplier: number): { damage: number; crit: boolean } {
  if (chance <= 0 || !rng.chance(chance)) return { damage, crit: false };
  return { damage: damage * multiplier, crit: true };
}

// ---------- 무기 2슬롯 ----------

/** T는 슬롯에 든 무기 (게임에서는 WeaponItem) */
export interface WeaponSlots<T = WeaponItem> {
  /** 슬롯 2개. 빈 슬롯은 null */
  slots: [T | null, T | null];
  /** 들고 있는 슬롯 */
  active: 0 | 1;
}

export function initialSlots<T>(startWeapon: T): WeaponSlots<T> {
  return { slots: [startWeapon, null], active: 0 };
}

export function activeWeapon<T>(s: WeaponSlots<T>): T | null {
  return s.slots[s.active];
}

export function otherWeapon<T>(s: WeaponSlots<T>): T | null {
  return s.slots[s.active === 0 ? 1 : 0];
}

/** E: 다른 슬롯이 비어 있으면 그대로 */
export function swapWeapon<T>(s: WeaponSlots<T>): WeaponSlots<T> {
  const other = s.active === 0 ? 1 : 0;
  if (s.slots[other] === null) return s;
  return { slots: [...s.slots], active: other };
}

/**
 * F: 바닥 무기 줍기.
 * 빈 슬롯이 있으면 거기에 넣고 그 무기를 든다(버리는 무기 없음).
 * 슬롯이 다 찼으면 들고 있던 무기와 교환하고, 버린 무기는 바닥에 남는다.
 */
export function pickUpWeapon<T>(s: WeaponSlots<T>, floorWeapon: T): { slots: WeaponSlots<T>; dropped: T | null } {
  const empty = s.slots.indexOf(null);
  if (empty !== -1) {
    const slots: [T | null, T | null] = [...s.slots];
    slots[empty] = floorWeapon;
    return { slots: { slots, active: empty as 0 | 1 }, dropped: null };
  }
  const slots: [T | null, T | null] = [...s.slots];
  const dropped = slots[s.active]!;
  slots[s.active] = floorWeapon;
  return { slots: { slots, active: s.active }, dropped };
}

/**
 * 무기 버리기 (인벤토리): 그 슬롯을 비운다. 들고 있던 무기를 버렸으면 다른 슬롯 무기를 든다.
 * 둘 다 비면 맨손(주먹 공격)이다.
 */
export function dropWeaponAt<T>(s: WeaponSlots<T>, slot: 0 | 1): { slots: WeaponSlots<T>; dropped: T | null } {
  const dropped = s.slots[slot];
  if (dropped === null) return { slots: s, dropped: null };
  const slots: [T | null, T | null] = [...s.slots];
  slots[slot] = null;
  const other = slot === 0 ? 1 : 0;
  const active = slot === s.active && slots[other] !== null ? other : s.active;
  return { slots: { slots, active }, dropped };
}

/** 맨손인가 (두 슬롯 모두 비었다) */
export function emptyHanded<T>(s: WeaponSlots<T>): boolean {
  return s.slots[0] === null && s.slots[1] === null;
}

// ---------- 에너지 ----------

export function canFire(energy: number, weapon: Pick<WeaponDef, 'energyCost'>): boolean {
  return energy >= weapon.energyCost;
}

/** 발사 시 에너지 차감. 부족하면 null (발사 불가) */
export function spendEnergy(energy: number, weapon: Pick<WeaponDef, 'energyCost'>): number | null {
  return canFire(energy, weapon) ? energy - weapon.energyCost : null;
}

export function gainEnergy(energy: number, amount: number, max: number): number {
  return Math.min(max, energy + amount);
}

// ---------- 자동 조준 ----------

export interface AimTarget {
  x: number;
  y: number;
}

/** 가장 가까운 대상을 노린다. 없으면 마지막 조준 방향. 반환값은 단위 벡터. */
export function autoAim(origin: Vec2, targets: readonly AimTarget[], lastDir: Vec2): { dir: Vec2; target: AimTarget | null } {
  let best: AimTarget | null = null;
  let bestD = Infinity;
  for (const t of targets) {
    const d = (t.x - origin.x) ** 2 + (t.y - origin.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = t;
    }
  }
  if (!best || bestD === 0) return { dir: normalize(lastDir), target: best };
  return { dir: normalize({ x: best.x - origin.x, y: best.y - origin.y }), target: best };
}

export function normalize(v: Vec2): Vec2 {
  const len = Math.hypot(v.x, v.y);
  return len > 0 ? { x: v.x / len, y: v.y / len } : { x: 1, y: 0 };
}

// ---------- 공격 패턴 ----------

export interface ShotSpec {
  /** 라디안 */
  angle: number;
  speed: number;
  range: number;
}

/** 총: 이번 발사에서 나갈 탄들. 산탄은 부채꼴로 고르게 펼친다. */
export function gunShots(weapon: WeaponDef, aimAngle: number, rng: Rng, extraPellets = 0): ShotSpec[] {
  const p = weapon.pattern;
  if (p.kind === 'single') {
    const jitter = p.jitterDeg ? rng.range(-p.jitterDeg / 2, p.jitterDeg / 2) * (Math.PI / 180) : 0;
    return [{ angle: aimAngle + jitter, speed: weapon.projectileSpeed, range: weapon.range }];
  }
  if (p.kind === 'spread') {
    const n = rng.int(p.pellets[0], p.pellets[1]) + extraPellets;
    const spread = (p.spreadDeg * Math.PI) / 180;
    if (n === 1) return [{ angle: aimAngle, speed: weapon.projectileSpeed, range: weapon.range }];
    return Array.from({ length: n }, (_, i) => ({
      angle: aimAngle - spread / 2 + (spread * i) / (n - 1),
      speed: weapon.projectileSpeed,
      range: weapon.range,
    }));
  }
  return [];
}

/** 점(반지름 r의 원)이 베기 부채꼴 안에 들어오는지 */
export function inArc(
  origin: Vec2,
  aimAngle: number,
  arcDeg: number,
  radius: number,
  point: Vec2,
  pointRadius = 0,
): boolean {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const dist = Math.hypot(dx, dy);
  if (dist > radius + pointRadius) return false;
  if (dist <= pointRadius) return true;
  let diff = Math.atan2(dy, dx) - aimAngle;
  diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  return Math.abs(diff) <= (arcDeg * Math.PI) / 360;
}

export interface CuttableProjectile {
  x: number;
  y: number;
  /** 일반 투사체만 칼로 지울 수 있다 */
  cuttable: boolean;
}

/** 칼 베기로 지워지는 적 투사체 인덱스 */
export function projectilesCut(
  weapon: WeaponDef,
  origin: Vec2,
  aimAngle: number,
  projectiles: readonly CuttableProjectile[],
): number[] {
  if (!weapon.cutsProjectiles || weapon.pattern.kind !== 'arc') return [];
  const { arcDeg, radius } = weapon.pattern;
  const out: number[] = [];
  projectiles.forEach((p, i) => {
    if (p.cuttable && inArc(origin, aimAngle, arcDeg, radius, p)) out.push(i);
  });
  return out;
}

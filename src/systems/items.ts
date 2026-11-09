/**
 * 아이템 (순수 함수): 그룹 배율, 효과 합산, 등급 가중치(챕터·확률 이전), 아이템 뽑기, 회복 우선순위, 세트 합성.
 * - 실제 값 = 기준값 × 그룹 배율. 같은 종류의 +%는 모두 더한 뒤 한 번 곱한다.
 * - 같은 아이템은 한 런에 한 번만(합성으로 사라진 재료도 다시 나오지 않음).
 */
import type { Rng } from '../core/rng';
import type { GradeId, GroupMultipliersData, ItemDef, ItemEffect, ItemsData, SchoolId } from '../types/data';
import { rollGrade } from './loot';

export interface ItemContext {
  /** 전직한 학파 (전직 전 null) */
  school: SchoolId | null;
  /** 직업·전직 id (직업 변형) */
  job: string;
}

/** 그룹 배율을 곱한 효과 (value → group, damage → procDamage, radius → area, everySec·cooldownSec → cooldown) */
export function scaleEffect(e: ItemEffect, groups: GroupMultipliersData): ItemEffect {
  const g = groups.itemGroups;
  const out = { ...e } as Record<string, unknown>;
  if ('group' in e) out.value = e.value * g[e.group];
  // 함성·패닉 각성의 damage는 피해 %라 발동 피해 배율을 받지 않는다
  if ('damage' in e && e.kind !== 'tempRoar' && e.kind !== 'roomRoar' && e.kind !== 'panicAwaken') out.damage = (e.damage as number) * g.procDamage;
  if ('radius' in e) out.radius = (e.radius as number) * g.area;
  if ('everySec' in e) out.everySec = (e.everySec as number) * g.cooldown;
  if ('cooldownSec' in e) out.cooldownSec = (e.cooldownSec as number) * g.cooldown;
  return out as ItemEffect;
}

/** 지금 켜져 있는 효과 (직업 변형 포함, 학파 조건 반영, 배율 적용) */
export function activeEffects(def: ItemDef, ctx: ItemContext, groups: GroupMultipliersData): ItemEffect[] {
  const all = [...def.effects, ...(def.variants ?? []).filter((v) => v.job === ctx.job || v.job === ctx.school).flatMap((v) => v.effects)];
  return all
    .filter((e) => {
      if ((e.kind === 'skillDamage' || e.kind === 'revive') && e.school) return ctx.school === e.school;
      if (e.kind === 'greatSuccess') return ctx.school === e.school;
      if ((e.kind === 'autoCast' || e.kind === 'tempRoar') && e.notSchool) return ctx.school !== e.notSchool;
      return true;
    })
    .map((e) => scaleEffect(e, groups));
}

export interface ItemTotals {
  maxHp: number;
  maxSanity: number;
  moveSpeed: number;
  skillCooldown: number;
  pellets: number;
  damage: { all: number; melee: number; ranged: number; boss: number; physical: number; magic: number; tech: number };
  enemyTaken: number;
  damageTaken: number;
  coinGain: number;
  maxEnergy: number;
  energyGain: number;
  /** 차징 시간 감소 비율 */
  chargeTime: number;
  /** 피해 흡혈 비율 */
  lifesteal: number;
  /** 무기 레이저가 벽에서 튕기는 횟수 */
  laserBounce: number;
  area: number;
  buffDuration: number;
  skillDamage: Record<string, number>;
}

/**
 * 아이템 선택 카드: 서로 다른 아이템 count장. 장마다 등급 가중치(+확률 이전)로 뽑고,
 * 신화는 가중치 밖에서 고정 확률로 따로 판정한다. 이미 가진 아이템은 나오지 않는다.
 */
export function itemChoices(
  rng: Rng,
  weights: Partial<Record<GradeId, number>>,
  mythicChance: number,
  data: ItemsData,
  obtained: ReadonlySet<string>,
  count: number,
): string[] {
  const taken = new Set(obtained);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = rollItem(rng, weights, mythicChance, data, taken);
    if (!id) break;
    out.push(id);
    taken.add(id);
  }
  return out;
}

/** 늘 켜져 있는 효과의 합 (발동형·조건부 회복은 런타임) */
export function itemTotals(
  ids: readonly string[],
  data: ItemsData,
  ctx: ItemContext,
  groups: GroupMultipliersData,
): ItemTotals {
  const t: ItemTotals = {
    maxHp: 0,
    maxSanity: 0,
    moveSpeed: 0,
    skillCooldown: 0,
    pellets: 0,
    damage: { all: 0, melee: 0, ranged: 0, boss: 0, physical: 0, magic: 0, tech: 0 },
    enemyTaken: 0,
    damageTaken: 0,
    coinGain: 0,
    maxEnergy: 0,
    energyGain: 0,
    chargeTime: 0,
    lifesteal: 0,
    laserBounce: 0,
    area: 0,
    buffDuration: 0,
    skillDamage: {},
  };
  for (const id of ids) {
    const def = data.items.find((x) => x.id === id);
    if (!def) continue;
    for (const e of activeEffects(def, ctx, groups)) {
      switch (e.kind) {
        case 'maxSanity':
          t.maxSanity += e.value;
          break;
        case 'moveSpeed':
          t.moveSpeed += e.value;
          break;
        case 'skillCooldown':
          t.skillCooldown += e.value;
          break;
        case 'pellets':
          t.pellets += e.value;
          break;
        case 'maxHp':
          t.maxHp += e.value;
          break;
        case 'damage':
          t.damage[e.scope] += e.value;
          break;
        case 'enemyTaken':
          t.enemyTaken += e.value;
          break;
        case 'damageTaken':
          t.damageTaken += e.value;
          break;
        case 'coinGain':
          t.coinGain += e.value;
          break;
        case 'maxEnergy':
          t.maxEnergy += e.value;
          break;
        case 'energyGain':
          t.energyGain += e.value;
          break;
        case 'chargeTime':
          t.chargeTime += e.value;
          break;
        case 'lifesteal':
          t.lifesteal += e.value;
          break;
        case 'laserBounce':
          t.laserBounce += e.bounces;
          break;
        case 'area':
          t.area += e.value;
          break;
        case 'buffDuration':
          t.buffDuration += e.value;
          break;
        case 'skillDamage':
          t.skillDamage[e.skillId] = (t.skillDamage[e.skillId] ?? 0) + e.value;
          break;
        default:
          break;
      }
    }
  }
  return t;
}

/**
 * 아이템 피해 배율 (같은 종류는 더한 뒤 한 번 곱한다). 근접·원거리 증가는 무기 보너스와 함께 RangeBonus로 따로 곱한다.
 * extraAll: 런타임 피해 증가(카이사르 누적·임시 함성·스튜 이후 등)
 */
export function itemDamageMultiplier(t: ItemTotals, extraAll: number, isBoss: boolean, skillId: string | null): number {
  return (
    (1 + t.damage.all + extraAll) * (isBoss ? 1 + t.damage.boss : 1) * (1 + t.enemyTaken) * (skillId ? 1 + (t.skillDamage[skillId] ?? 0) : 1)
  );
}

// ---------- 획득 ----------

const NEXT_GRADE: Partial<Record<GradeId, GradeId>> = { common: 'rare', rare: 'legendary', legendary: 'unique' };

/** 확률 이전: 얻은 등급의 가중치 일부를 바로 위 등급으로 (유니크·신화는 영향 없음) */
export function transferWeight(shift: Partial<Record<GradeId, number>>, grade: GradeId, amount: number): Partial<Record<GradeId, number>> {
  const next = NEXT_GRADE[grade];
  if (!next) return shift;
  return { ...shift, [grade]: (shift[grade] ?? 0) - amount, [next]: (shift[next] ?? 0) + amount };
}

/** 챕터 번호별 가중치 표에서 이 챕터 것 (없으면 가장 가까운 아래 챕터) */
export function chapterWeights<T>(table: Record<string, T>, chapter: number): T {
  for (let c = chapter; c >= 1; c--) if (table[String(c)]) return table[String(c)]!;
  return Object.values(table)[0]!;
}

/** 실제 가중치: 기본 + 확률 이전. 0 아래로는 내려가지 않는다 */
export function effectiveWeights(base: Partial<Record<GradeId, number>>, shift: Partial<Record<GradeId, number>>): Partial<Record<GradeId, number>> {
  const w: Partial<Record<GradeId, number>> = { ...base };
  for (const [g, v] of Object.entries(shift)) {
    if (w[g as GradeId] === undefined) continue;
    w[g as GradeId] = Math.max(0, (w[g as GradeId] ?? 0) + (v ?? 0));
  }
  return w;
}

const GRADE_ORDER: GradeId[] = ['common', 'rare', 'legendary', 'unique', 'mythic'];

/**
 * 등급에 맞는 아이템 하나 (상자·첨탑에 나오는 normal 풀, 이미 얻은 것 제외).
 * 그 등급에 남은 게 없으면 가까운 등급(아래 먼저)에서. 아무것도 없으면 null.
 */
export function pickItem(rng: Rng, grade: GradeId, data: ItemsData, obtained: ReadonlySet<string>): string | null {
  const free = (g: GradeId) => data.items.filter((x) => x.pool === 'normal' && x.grade === g && !obtained.has(x.id));
  const i = GRADE_ORDER.indexOf(grade);
  const order = [grade, ...GRADE_ORDER.slice(0, i).reverse(), ...GRADE_ORDER.slice(i + 1).filter((g) => g !== 'mythic')];
  for (const g of order) {
    const list = free(g);
    if (list.length > 0) return rng.pick(list).id;
  }
  return null;
}

/** 상자에서 아이템 하나: 가중치로 등급 → 고정 확률 신화 → 그 등급 아이템 */
export function rollItem(rng: Rng, weights: Partial<Record<GradeId, number>>, mythicChance: number, data: ItemsData, obtained: ReadonlySet<string>): string | null {
  return pickItem(rng, rollGrade(rng, weights, mythicChance), data, obtained);
}

export interface HealCandidate {
  itemId: string;
  threshold: number;
  healTo: number;
  priority: number;
  ready: boolean;
}

/** 회복 아이템을 지금 쓸 수 있는지: 재사용 대기가 있으면 대기로, 없으면 런당 횟수(uses, 기본 1)로 */
export function healReady(e: { cooldownSec: number; uses?: number }, cd: number, usedCount: number): boolean {
  return e.cooldownSec > 0 ? cd <= 0 : usedCount < (e.uses ?? 1);
}

/** 회복 우선순위: 조건을 채운 것 중 우선순위가 가장 높은(숫자가 작은) 하나만 */
export function pickHeal(cands: readonly HealCandidate[], hpRatio: number): HealCandidate | null {
  return [...cands].filter((c) => c.ready && hpRatio <= c.threshold).sort((a, b) => a.priority - b.priority)[0] ?? null;
}

/** 재료가 다 모인 세트 (결과를 아직 얻지 않았으면) */
export function readySet(owned: ReadonlySet<string>, obtained: ReadonlySet<string>, sets: ItemsData['sets']): ItemsData['sets'][number] | null {
  return sets.find((s) => !obtained.has(s.result) && s.materials.every((m) => owned.has(m))) ?? null;
}

/** 무기 슬롯에 재료 무기가 있고 재료 아이템을 가졌으면 그 세트와 슬롯 */
export function readyWeaponSet(slots: readonly ({ defId: string } | null)[], items: readonly string[], sets: ItemsData['weaponSets']): { set: ItemsData['weaponSets'][number]; slot: number } | null {
  for (const set of sets) {
    if (!items.includes(set.item)) continue;
    const slot = slots.findIndex((w) => w?.defId === set.weapon);
    if (slot !== -1) return { set, slot };
  }
  return null;
}

type Eff<K extends ItemEffect['kind']> = Extract<ItemEffect, { kind: K }>;

/** 함성(바바리안 데스 휘슬): 직업 변형의 함성 효과 증가를 곱한 값. 없으면 null */
export function roarValues(effects: readonly ItemEffect[]): Eff<'roomRoar'> | null {
  const base = effects.find((e): e is Eff<'roomRoar'> => e.kind === 'roomRoar');
  if (!base) return null;
  const k = 1 + effects.reduce((s, e) => s + (e.kind === 'roarBoost' ? e.value : 0), 0);
  return { ...base, damage: base.damage * k, moveSpeed: base.moveSpeed * k };
}

/** 순간 회피(특무 인장): 직업 변형 재사용이 더 짧으면 그것. 없으면 null */
export function dodgeValues(effects: readonly ItemEffect[]): Eff<'dodgeBlink'> | null {
  const base = effects.find((e): e is Eff<'dodgeBlink'> => e.kind === 'dodgeBlink');
  if (!base) return null;
  const cds = effects.filter((e): e is Eff<'dodgeCooldown'> => e.kind === 'dodgeCooldown').map((e) => e.cooldownSec);
  return { ...base, cooldownSec: Math.min(base.cooldownSec, ...cds) };
}

/** 방패 투척(오리온의 방패): 직업 변형 튕김 증가를 더한 값. 없으면 null */
export function shieldValues(effects: readonly ItemEffect[]): Eff<'shieldThrow'> | null {
  const base = effects.find((e): e is Eff<'shieldThrow'> => e.kind === 'shieldThrow');
  if (!base) return null;
  return { ...base, bounces: base.bounces + effects.reduce((s, e) => s + (e.kind === 'shieldBounces' ? e.value : 0), 0) };
}

/** 아이템 조합기: 이 등급 2개를 넣으면 나오는 등급 (신화는 만들 수 없어 유니크·신화는 null) */
export function combineGrade(grade: GradeId): GradeId | null {
  return grade === 'common' ? 'rare' : grade === 'rare' ? 'legendary' : grade === 'legendary' ? 'unique' : null;
}

/** 조합 결과 후보: 그 등급의 일반 풀 아이템 중 아직 얻지 않은 것 */
export function combineCandidates(grade: GradeId, data: ItemsData, obtained: ReadonlySet<string>): string[] {
  return data.items.filter((x) => x.pool === 'normal' && x.grade === grade && !obtained.has(x.id)).map((x) => x.id);
}

/** 조합기에 넣을 수 있는 가진 아이템: 위 등급이 있고 결과 후보가 남았으며, 같은 등급이 2개 이상 */
export function combinableItems(owned: readonly string[], data: ItemsData, obtained: ReadonlySet<string>): string[] {
  const gradeOf = (id: string) => data.items.find((x) => x.id === id)?.grade;
  const ok = owned.filter((id) => {
    const g = gradeOf(id);
    const to = g ? combineGrade(g) : null;
    return !!to && combineCandidates(to, data, obtained).length > 0;
  });
  return ok.filter((id) => ok.filter((o) => gradeOf(o) === gradeOf(id)).length >= 2);
}

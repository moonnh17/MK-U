/**
 * 마기법사 (순수 함수): 개전 각인, 칸 순서 전직 판정, 원소·지팡이 피해 배율.
 * - 각인: 액티브 1번 칸 스킬의 각인만 적용, 수치는 스킬 레벨, 전직 학파 스킬이면 계열 공명 배율.
 * - 전직: 1번 → 2번 → 3번 칸에서 처음 나오는 전직 학파 스킬. 없으면 null(직접 선택).
 */
import { ELEMENT_IDS, type ElementId, type ImprintEffect, type JobDef, type SchoolId, type SkillDef, type SkillsData } from '../types/data';
import { findSkill, type SkillLoadout } from './skills';

export interface ActiveImprint {
  skillId: string;
  effect: ImprintEffect;
  /** 레벨·공명 반영한 수치 + 고정값 */
  values: Record<string, number>;
  resonance: boolean;
  /** 스킬이 각성해 각인이 확장됐다 */
  awakened: boolean;
}

export function activeImprint(
  lo: SkillLoadout,
  data: SkillsData,
  job: Pick<JobDef, 'imprint'>,
  school: SchoolId | null,
): ActiveImprint | null {
  const rule = job.imprint;
  const id = rule ? lo.active[rule.slot] : null;
  const owned = id ? lo.owned[id] : undefined;
  if (!rule || !id || !owned) return null;
  const def = findSkill(data, id);
  const im = def.imprint;
  if (!im) return null;
  const resonance = school !== null && def.school === school;
  const lv = im.levels[Math.min(im.levels.length, Math.max(1, owned.level)) - 1]!;
  const mul = resonance ? 1 + rule.resonance : 1;
  const values: Record<string, number> = { ...im.fixed };
  for (const [k, v] of Object.entries(lv)) values[k] = v * mul;
  const awakened = !!owned.awakened && !!im.awakened;
  if (awakened) Object.assign(values, im.awakened!.values);
  return { skillId: id, effect: im.effect, values, resonance, awakened };
}

/** 칸 순서(1→2→3)에서 처음 나오는 전직 학파 스킬의 학파. 없으면 null */
export function judgeBySlots(active: readonly (string | null)[], data: SkillsData, order: readonly SchoolId[]): SchoolId | null {
  for (const id of active) {
    const school = id ? findSkill(data, id).school : null;
    if (school && order.includes(school)) return school;
  }
  return null;
}

/** 작열: 화염 원소 직접 피해 배율 (화상 틱은 이 경로를 지나지 않는다). 각성(불길의 행군): 불길 장판 위면 작열 수치 ×zoneMul */
export function elementDamageMul(element: ElementId | undefined, im: ActiveImprint | null, onFireZone = false): number {
  if (element !== 'fire' || im?.effect !== 'fireDamage') return 1;
  const k = im.awakened && onFireZone ? (im.values.zoneMul ?? 1) : 1;
  return 1 + (im.values.fireDamage ?? 0) * k;
}

/** 원소 일주 순서: 화염 → 냉기 → 번개 → (화염) */
const CYCLE_ORDER: readonly ElementId[] = ['fire', 'ice', 'lightning'];

/**
 * 원소 일주(원소 순환 각성): 원소 스킬을 쓸 때마다 진행. 직전 원소의 다음 차례면 이어 가고, 아니면 이 원소부터 다시.
 * 세 원소를 이어 돌면 한 바퀴(complete)이고 진행은 비운다.
 */
export function cycleStep(progress: readonly ElementId[], element: ElementId): { progress: ElementId[]; complete: boolean } {
  const last = progress[progress.length - 1];
  const next = last ? CYCLE_ORDER[(CYCLE_ORDER.indexOf(last) + 1) % CYCLE_ORDER.length] : undefined;
  const p = last && element === next ? [...progress, element] : [element];
  return p.length >= CYCLE_ORDER.length ? { progress: [], complete: true } : { progress: p, complete: false };
}

/** 지팡이 공명: 지팡이 계열 무기 피해 배율 */
export function staffDamageMul(category: string, im: ActiveImprint | null): number {
  return category === 'staff' && im?.effect === 'staffDamage' ? 1 + (im.values.staffDamage ?? 0) : 1;
}

// ---------- 백온파 (원소) ----------

/** 서리 중첩 (중첩, 남은 시간) */
export interface FrostState {
  stacks: number;
  leftSec: number;
}

/** 서리: 냉기 피해 한 번마다 중첩 +1(시간 갱신). need에 닿으면 빙결하고 중첩은 비운다 */
export function frostHit(st: FrostState | null, need: number, stackSec: number): { state: FrostState | null; freeze: boolean } {
  const stacks = (st && st.leftSec > 0 ? st.stacks : 0) + 1;
  if (stacks >= need) return { state: null, freeze: true };
  return { state: { stacks, leftSec: stackSec }, freeze: false };
}

/** 적 이동 감속: 걸린 감속 중 가장 센 것 + 한파, cap을 넘지 않는다 */
export function slowAmount(slows: readonly number[], aura: number, cap: number): number {
  return Math.min(cap, Math.max(0, ...slows) + Math.max(0, aura));
}

/** 대전: 움직인 거리만큼 충전 (0~1) */
export function chargeAfterMove(charge: number, movedPx: number, fullPx: number): number {
  return Math.min(1, charge + Math.max(0, movedPx) / fullPx);
}

/** 이번 시전 강화: 피해 배율(그 스킬 출처의 피해에 windowSec 동안), 더하는 연쇄 수 */
export interface CastBoost {
  mul: number;
  chains: number;
  windowSec: number;
}

/**
 * 시전할 때 정하는 강화. 대전(각인): 충전 비율 × 최대 피해, 가득 찬 만큼 연쇄 +. 응축(각인): 게이지 × 최대 피해.
 * 원소 순환(패시브): 앞서 쓴 원소와 다른 원소의 스킬이면 피해 +. 둘 다 없으면 null.
 */
export function castBoost(
  charge: number,
  im: ActiveImprint | null,
  cycle: { damage: number; windowSec: number } | null,
  element: ElementId | undefined,
  lastElement: ElementId | null,
): CastBoost | null {
  let mul = 1;
  let chains = 0;
  let windowSec = 0;
  if (im?.effect === 'staticCharge' && charge > 0) {
    mul *= 1 + im.values.staticCharge! * charge;
    chains += Math.floor(charge * im.values.chains!);
    windowSec = Math.max(windowSec, im.values.windowSec!);
  }
  // 응축(각인): charge 자리에 응축 게이지를 받는다
  if (im?.effect === 'condense' && charge > 0) {
    mul *= 1 + im.values.condense! * charge;
    windowSec = Math.max(windowSec, im.values.windowSec!);
  }
  if (cycle && element && lastElement && element !== lastElement) {
    mul *= 1 + cycle.damage;
    windowSec = Math.max(windowSec, cycle.windowSec);
  }
  return mul === 1 && chains === 0 ? null : { mul, chains, windowSec };
}

/** 원소 대합주: 이번 런에 세 원소를 모두 썼으면 최대 강화 */
export function concertFull(used: readonly ElementId[]): boolean {
  return ELEMENT_IDS.every((e) => used.includes(e));
}

/** 이번 런에 쓴 원소 목록에 더한다 (처음 쓴 것만) */
export function addElement(used: readonly ElementId[], element: ElementId | undefined): ElementId[] {
  return element && !used.includes(element) ? [...used, element] : [...used];
}

// ---------- 휘강파 (순수 마기) ----------

/** 응축: 시간(스킬을 쓰지 않는 동안)과 순수 전개 피해로 차는 게이지 (0~1) */
export function condenseFill(gauge: number, dt: number, fullSec: number, dealt = 0, perDamage = 0): number {
  return Math.min(1, gauge + (fullSec > 0 ? Math.max(0, dt) / fullSec : 0) + Math.max(0, dealt) * perDamage);
}

/** 각인이 플레이어에게 주는 보정: 과잉 전개(스킬 재사용 대기 빨리, 받는 피해 +), 극단(받는 피해 +) */
export function imprintMods(im: ActiveImprint | null): { cooldownRate?: number; damageTaken?: number } {
  if (im?.effect === 'overdrive') return { cooldownRate: im.values.overdrive!, damageTaken: im.values.damageTaken! };
  if (im?.effect === 'extreme') return { damageTaken: im.values.damageTaken! };
  return {};
}

/** 슬픈 처형: 맞은 뒤 체력 비율이 ratio 이하인 일반·엘리트만 (정예·보스 제외) */
export function executable(rank: string, hp: number, maxHp: number, ratio: number): boolean {
  return (rank === 'normal' || rank === 'elite') && hp > 0 && hp <= maxHp * ratio;
}

/** 집행 의지체가 따라 쓰는 스킬: 마기법사 액티브 중 이동·버프·소환이 아닌 것 */
export function willCopies(def: Pick<SkillDef, 'id' | 'job' | 'kind'>, excluded: readonly string[]): boolean {
  return def.job === 'magiMage' && def.kind === 'active' && !excluded.includes(def.id);
}

// ---------- 순수 전개 ----------

/** 순수 전개가 보는 원소: 백온파 원소, 휘강파 공격 스킬은 순수 마기 */
export type PureElement = ElementId | 'magi';

/** 공격 스킬의 원소 (이동·버프·소환은 null) */
export function attackElement(def: Pick<SkillDef, 'element' | 'school' | 'tags' | 'sources'>): PureElement | null {
  if (def.element) return def.element;
  return def.school === 'hwigang' && def.tags.includes('magic') && !def.sources.summon ? 'magi' : null;
}

/** 장착한 공격 스킬이 모두 같은 원소면 그 원소 (하나도 없으면 null) */
export function unifiedElement(defs: readonly Pick<SkillDef, 'element' | 'school' | 'tags' | 'sources'>[]): PureElement | null {
  const els = new Set(defs.map(attackElement).filter((e): e is PureElement => e !== null));
  return els.size === 1 ? [...els][0]! : null;
}

/**
 * 전리품·조우 (순수 함수): 등급 뽑기, 신화 판정, 무기 생성(등급·옵션), 조우 칸 유형, 상인 진열.
 * 신화는 어떤 가중치 표에도 넣지 않고, 얻을 때마다 고정 확률로 따로 판정한다.
 */
import type { Rng } from '../core/rng';
import type { EncounterKindId, GradeId, GroupMultipliersData, LootData, WeaponDef, WeaponOptionDef } from '../types/data';
import type { Card } from './cards';
import type { WeaponItem, WeaponOption } from './weapons';

/** 가중치 표에서 등급 하나 → 고정 확률로 신화 */
export function rollGrade(rng: Rng, weights: Partial<Record<GradeId, number>>, mythicChance: number): GradeId {
  const pool = Object.entries(weights)
    .filter(([, w]) => (w ?? 0) > 0)
    .map(([g, w]) => ({ item: g as GradeId, weight: w! }));
  const grade = rng.weighted(pool);
  return rng.chance(mythicChance) ? 'mythic' : grade;
}

/** 무작위 옵션: 등급의 옵션 수만큼, 서로 다른 옵션 (분류·에너지 조건에 맞는 것만) */
export function rollOptions(rng: Rng, def: WeaponDef, count: number, options: readonly WeaponOptionDef[]): WeaponOption[] {
  const ok = options.filter((o) => o.categories.includes(def.category) && (!o.needsEnergy || def.energyCost > 0));
  return rng
    .shuffle(ok)
    .slice(0, count)
    .map((o) => ({ id: o.id, value: Math.round(rng.range(o.value[0], o.value[1]) * 100) / 100 }));
}

const GRADE_RANK: GradeId[] = ['common', 'rare', 'legendary', 'unique', 'mythic'];

/**
 * 등급에 맞는 무기 하나.
 * - 신화: 신화 무기(droppable 아님) 중 하나
 * - 유니크: 드롭되는 유니크 무기 중 하나, 없으면 fallback 등급으로
 * - 그 외: 상점·드롭용 무기(droppable) 중 하나 + 등급 옵션
 */
export function rollWeapon(
  rng: Rng,
  grade: GradeId,
  weapons: readonly WeaponDef[],
  options: readonly WeaponOptionDef[],
  groups: GroupMultipliersData,
  uniqueFallback: GradeId,
): WeaponItem {
  if (grade === 'mythic') {
    const mythic = weapons.filter((w) => w.grade === 'mythic');
    if (mythic.length > 0) return { defId: rng.pick(mythic).id, grade: 'mythic', options: [] };
    grade = 'legendary';
  }
  if (grade === 'unique') {
    const unique = weapons.filter((w) => w.droppable && w.grade === 'unique');
    if (unique.length > 0) return { defId: rng.pick(unique).id, grade: 'unique', options: [] };
    grade = uniqueFallback;
  }
  // 무기 자체 등급이 굴린 등급보다 높으면 나오지 않는다
  const rank = (g: GradeId) => GRADE_RANK.indexOf(g);
  const def = rng.pick(weapons.filter((w) => w.droppable && rank(w.grade) <= rank(grade)));
  const count = groups.grades.find((g) => g.id === grade)?.randomOptions ?? 0;
  return { defId: def.id, grade, options: rollOptions(rng, def, count, options) };
}

/** 전투 없는 유형 */
const PEACEFUL: ReadonlySet<EncounterKindId> = new Set(['treasure', 'merchant', 'skillShop', 'statShop']);

/** 이 조우 칸에서 나올 수 있는 유형: 작은 평화로운 방이면 보물·상점, 아니면 전투 유형 */
export function encounterPool(kinds: ReadonlySet<EncounterKindId>, peaceful: boolean): Set<EncounterKindId> {
  return new Set([...kinds].filter((k) => PEACEFUL.has(k) === peaceful));
}

/** 조우 칸 유형. 아직 만들지 않은 유형(implemented에 없는 것)은 빼고 뽑는다 */
export function rollEncounter(rng: Rng, weights: Record<EncounterKindId, number>, implemented: ReadonlySet<EncounterKindId>): EncounterKindId {
  const pool = (Object.entries(weights) as [EncounterKindId, number][])
    .filter(([k, w]) => w > 0 && implemented.has(k))
    .map(([item, weight]) => ({ item, weight }));
  return rng.weighted(pool);
}

export interface StockItem {
  weapon: WeaponItem;
  price: number;
  sold: boolean;
}

/** 상인 진열: 무기만, count개 */
export function merchantStock(
  rng: Rng,
  loot: LootData,
  weapons: readonly WeaponDef[],
  options: readonly WeaponOptionDef[],
  groups: GroupMultipliersData,
): StockItem[] {
  return Array.from({ length: loot.merchant.count }, () => {
    const grade = rollGrade(rng, loot.merchant.weights, loot.mythicChance);
    const weapon = rollWeapon(rng, grade, weapons, options, groups, loot.uniqueWeaponFallback);
    return { weapon, price: loot.merchant.prices[weapon.grade], sold: false };
  });
}

/** 스킬·스탯 상점의 진열품 하나 */
export interface CardStock {
  card: Card;
  price: number;
  sold: boolean;
}

/** 카드 가격. 스킬 상점에 스킬이 모자라면 스탯 카드가 섞이므로 종류로 고른다 */
export function cardPrice(card: Card, loot: LootData): number {
  return card.kind === 'stat' ? loot.statShop.prices[card.grade]! : loot.skillShop.prices[card.kind];
}

export function cardStock(cards: readonly Card[], loot: LootData): CardStock[] {
  return cards.map((card) => ({ card, price: cardPrice(card, loot), sold: false }));
}

/** 살 수 있는지 (코인은 소수로 들고 있어 내림해서 비교) */
export function canBuy(coins: number, item: StockItem): boolean {
  return !item.sold && Math.floor(coins) >= item.price;
}

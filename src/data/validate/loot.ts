/** 데이터 검증: 전리품·조우·아이템 */
import { GRADE_IDS } from '../../types/data';
import { checkPositive, checkRange, checkSprite, checkUnique, checkWeights } from './shared';
import type { V } from './shared';

/** 전리품·조우 */
export function validateLoot(v: V): void {
  const { d, errors, needText, gradeIds } = v;
  const lt = d.loot;
  if (!(lt.mythicChance >= 0 && lt.mythicChance <= 1)) errors.push('loot.mythicChance: 0~1');
  if (!gradeIds.has(lt.uniqueWeaponFallback)) errors.push('loot.uniqueWeaponFallback: 알 수 없는 등급');
  checkWeights(v, 'loot.bossWeaponChest', lt.bossWeaponChest);
  checkWeights(v, 'loot.bossItemChest', lt.bossItemChest);
  if (!(lt.combatDrop.chance >= 0 && lt.combatDrop.chance <= 1)) errors.push('loot.combatDrop.chance: 0~1');
  for (const [id, t] of Object.entries(lt.weaponChestTiers)) checkWeights(v, `loot.weaponChestTiers.${id}`, t.weights);
  for (const [ch, w] of Object.entries(lt.combatChestTiers)) {
    if (Object.values(w).reduce((s, v) => s + (v ?? 0), 0) <= 0) errors.push(`loot.combatChestTiers.${ch}: 가중치 합이 0`);
    for (const id of Object.keys(w)) if (!(id in lt.weaponChestTiers)) errors.push(`loot.combatChestTiers.${ch}: 없는 상자 '${id}'`);
  }
  for (const [ch, p] of Object.entries(lt.raidLegendaryChestChance)) if (!(p >= 0 && p <= 1)) errors.push(`loot.raidLegendaryChestChance.${ch}: 0~1`);
  checkWeights(v, 'loot.startChest', lt.startChest);
  if (!(lt.bossWeaponChance >= 0 && lt.bossWeaponChance <= 1)) errors.push('loot.bossWeaponChance: 0~1');
  checkPositive(errors, 'loot.merchant.count', lt.merchant.count);
  checkWeights(v, 'loot.merchant.weights', lt.merchant.weights);
  for (const g of GRADE_IDS) checkPositive(errors, `loot.merchant.prices.${g}`, lt.merchant.prices[g]);
  checkPositive(errors, 'loot.skillShop.count', lt.skillShop.count);
  for (const [k, v] of Object.entries(lt.skillShop.prices)) checkPositive(errors, `loot.skillShop.prices.${k}`, v);
  for (const k of ['treasure', 'merchant', 'skillShop', 'combiner', 'raid', 'magiSpire', 'hiddenBoss'] as const) {
    checkPositive(errors, `loot.encounter.weights.${k}`, lt.encounter.weights[k], true);
    needText(`loot.encounter.${k}`, `encounter.${k}`);
  }
  for (const [ch, w] of Object.entries(lt.encounter.chapterWeights)) for (const [k, v] of Object.entries(w)) {
    if (!(k in lt.encounter.weights)) errors.push(`loot.encounter.chapterWeights.${ch}: 없는 유형 '${k}'`);
    checkPositive(errors, `loot.encounter.chapterWeights.${ch}.${k}`, v, true);
  }
  checkRange(errors, 'loot.raid.waves', lt.raid.waves, 1);
  checkRange(errors, 'loot.raid.coins', lt.raid.coins);
  checkPositive(errors, 'loot.raid.sizeMul', lt.raid.sizeMul);
  checkPositive(errors, 'loot.raid.elitesPerWave', lt.raid.elitesPerWave, true);
  checkSprite(errors, 'loot.chest.weapon', lt.chest.weapon);
  checkSprite(errors, 'loot.chest.item', lt.chest.item);
  checkPositive(errors, 'loot.chest.openRadius', lt.chest.openRadius);
  checkSprite(errors, 'loot.merchantStand', lt.merchantStand);
  checkPositive(errors, 'loot.standSpacing', lt.standSpacing);
  const sp = lt.spire;
  checkSprite(errors, 'loot.spire.small.sprite', sp.small.sprite);
  checkSprite(errors, 'loot.spire.medium.sprite', sp.medium.sprite);
  if (!(sp.medium.strongChance >= 0 && sp.medium.strongChance <= 1)) errors.push('loot.spire.medium.strongChance: 0~1');
  for (const [name, table] of [['medium', sp.medium.chance], ['large', sp.large.chance]] as const) {
    for (const [c, r] of Object.entries(table)) {
      if (!(r.chance >= 0 && r.chance <= 1)) errors.push(`loot.spire.${name}.chance.${c}: 0~1`);
      if (!(r.fromStage >= 1 && r.fromStage <= d.mapgen.stagesPerChapter)) errors.push(`loot.spire.${name}.chance.${c}.fromStage: 1~${d.mapgen.stagesPerChapter}`);
    }
  }
  checkSprite(errors, 'loot.spire.large.sprite', sp.large.sprite);
  checkPositive(errors, 'loot.spire.large.scale', sp.large.scale);
  for (const k of ['small', 'medium', 'large'] as const) checkPositive(errors, `loot.spire.${k}.picks`, sp[k].picks);
  for (const k of ['radius', 'fallSec', 'fallHeight', 'riseSec', 'spawnGapSec', 'eliteMul'] as const) checkPositive(errors, `loot.spire.${k}`, sp[k]);
  checkPositive(errors, 'loot.spire.minAlive', sp.minAlive, true);
  for (const [k, v] of Object.entries(sp.chargePerKill)) {
    if (!(typeof v === 'number' && v >= 0 && v <= 1)) errors.push(`loot.spire.chargePerKill.${k}: 0~1`);
  }
  if (!((sp.chargePerKill.normal ?? 0) > 0)) errors.push('loot.spire.chargePerKill.normal: 0보다 커야 충전된다');
}

/** 아이템 */
export function validateItems(v: V): void {
  const { d, errors, needText, tagIds, gradeIds } = v;
  const it = d.items;
  for (const k of ['hpFlat', 'damagePct', 'procDamage', 'area', 'cooldown'] as const) checkPositive(errors, `groupMultipliers.itemGroups.${k}`, d.groupMultipliers.itemGroups?.[k]);
  checkUnique(errors, 'items', it.items.map((x) => x.id));
  checkPositive(errors, 'items.transferPerPickup', it.transferPerPickup, true);
  for (const [ch, w] of Object.entries(it.treasureWeights)) checkWeights(v, `items.treasureWeights.${ch}`, w);
  for (const [k, v] of Object.entries(it.raidWeights)) {
    if (!gradeIds.has(k)) errors.push(`items: 알 수 없는 등급 '${k}'`);
    checkPositive(errors, `items.weights.${k}`, v, true);
  }
  if ((it.raidWeights.common ?? 0) > 0) errors.push('items.raidWeights: 레어 이상만');
  const itemIds = new Set(it.items.map((x) => x.id));
  for (const s of it.weaponSets) {
    const res = d.weapons.weapons.find((w) => w.id === s.result);
    if (!d.weapons.weapons.some((w) => w.id === s.weapon)) errors.push(`items.weaponSets: 없는 무기 '${s.weapon}'`);
    if (!itemIds.has(s.item)) errors.push(`items.weaponSets: 없는 아이템 '${s.item}'`);
    if (!res) errors.push(`items.weaponSets: 없는 무기 '${s.result}'`);
    else if (res.droppable) errors.push(`items.weaponSets: 결과 '${s.result}'는 드롭되면 안 됨`);
  }
  for (const s of it.sets) {
    for (const m of [...s.materials, s.result]) if (!itemIds.has(m)) errors.push(`items.sets: 없는 아이템 '${m}'`);
    if (it.items.find((x) => x.id === s.result)?.pool !== 'set') errors.push(`items.sets: '${s.result}'는 pool set이어야 함`);
  }
  for (const x of it.items) {
    const w = `items.${x.id}`;
    checkSprite(errors, w, x);
    needText(w, x.nameKey);
    if (!x.descKey && !x.abilityDescKey) errors.push(`${w}: descKey나 abilityDescKey 중 하나는 있어야 함`);
    if (x.descKey) needText(w, x.descKey);
    if (x.abilityDescKey) needText(w, x.abilityDescKey);
    if (x.abilityNameKey) needText(w, x.abilityNameKey);
    if (!gradeIds.has(x.grade)) errors.push(`${w}: 알 수 없는 등급`);
    if (!['normal', 'boss', 'hiddenBoss', 'set'].includes(x.pool)) errors.push(`${w}: pool 잘못됨`);
    for (const t of x.tags) if (!tagIds.has(t)) errors.push(`${w}: 알 수 없는 태그 '${t}'`);
    if (x.pool === 'boss' && !d.bosses.bosses.some((b) => b.id === x.bossId)) errors.push(`${w}: bossId '${String(x.bossId)}' 보스 없음`);
    if (x.pool === 'hiddenBoss' && !d.bosses.hiddenBosses.some((b) => b.id === x.bossId)) errors.push(`${w}: bossId '${String(x.bossId)}' 히든보스 없음`);
    if (x.effects.length === 0) errors.push(`${w}: 효과 없음`);
    for (const e of [...x.effects, ...(x.variants ?? []).flatMap((v) => v.effects)]) {
      if ((e.kind === 'autoCast' || e.kind === 'skillDamage') && !d.skills.skills.some((s) => s.id === e.skillId)) errors.push(`${w}: 없는 스킬 '${e.skillId}'`);
      if ((e.kind === 'hurtBurst' || e.kind === 'gravityShot' || e.kind === 'coinShots' || e.kind === 'absorbCore') && e.tags.some((t) => !tagIds.has(t))) errors.push(`${w}: 알 수 없는 태그`);
      if (e.kind === 'absorbCore' && e.absorbSec >= e.everySec) errors.push(`${w}: absorbSec는 everySec보다 짧아야 함`);
      for (const [k, v] of Object.entries(e)) if (typeof v === 'number' && !Number.isFinite(v)) errors.push(`${w}.${e.kind}.${k}: 숫자여야 함`);
    }
  }
  if (!it.items.some((x) => x.pool === 'normal' && x.grade === 'mythic')) errors.push('items: 신화 아이템이 없음');
}

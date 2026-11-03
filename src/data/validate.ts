/**
 * 데이터 JSON 검증. 문제마다 사람이 읽을 수 있는 문장을 돌려준다(빈 배열 = 통과).
 * Phaser에 의존하지 않으며 테스트와 개발 모드 부팅에서 함께 쓴다.
 */
import { collectAssets, validateArt } from '../systems/art';
import { BUTTON_ACTIONS } from '../core/actions';
import { GRADE_IDS, SCHOOL_IDS, TAG_IDS } from '../types/data';
import type { EnemyAttackDef, IntRange, SpriteRef } from '../types/data';
import type { GameData } from './index';

type Errors = string[];

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function checkPositive(errors: Errors, where: string, v: unknown, allowZero = false): void {
  if (!isNum(v) || (allowZero ? v < 0 : v <= 0)) {
    errors.push(`${where}: ${allowZero ? '0 이상' : '양수'}여야 함 (값: ${String(v)})`);
  }
}

function checkRange(errors: Errors, where: string, r: IntRange | undefined, min = 0): void {
  if (!Array.isArray(r) || r.length !== 2 || !Number.isInteger(r[0]) || !Number.isInteger(r[1])) {
    errors.push(`${where}: [min, max] 정수 범위여야 함`);
    return;
  }
  if (r[0] < min || r[0] > r[1]) errors.push(`${where}: 범위가 잘못됨 [${r[0]}, ${r[1]}]`);
}

function checkSprite(errors: Errors, where: string, s: SpriteRef): void {
  if (typeof s.spriteKey !== 'string' || s.spriteKey === '') errors.push(`${where}: spriteKey 없음`);
  if (!HEX_COLOR.test(s.color)) errors.push(`${where}: color는 #RRGGBB (값: ${s.color})`);
  checkPositive(errors, `${where}.size`, s.size);
}

function checkUnique(errors: Errors, where: string, ids: string[]): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${where}: id 중복 '${id}'`);
    seen.add(id);
  }
}

export function validateGameData(d: GameData): Errors {
  const errors: Errors = [];
  const tagIds = new Set<string>(TAG_IDS);
  const textKeys: { where: string; key: string }[] = [];
  const needText = (where: string, key: string) => textKeys.push({ where, key });

  // --- 태그 ---
  for (const t of d.tags.tags) {
    const w = `tags.${t.id}`;
    if (!tagIds.has(t.id)) errors.push(`${w}: 알 수 없는 태그`);
    if (!['attribute', 'range', 'none'].includes(t.damageGroup)) errors.push(`${w}: damageGroup 잘못됨`);
    if (!HEX_COLOR.test(t.badgeColor)) errors.push(`${w}: badgeColor는 #RRGGBB`);
    needText(w, t.nameKey);
    needText(w, t.descKey);
    const r = t.rule;
    switch (r.kind) {
      case 'chance':
        for (const [k, cap] of Object.entries(r.caps)) {
          if (!isNum(cap) || cap <= 0 || cap > 1) errors.push(`${w}.caps.${k}: 0~1 사이여야 함`);
        }
        break;
      case 'space':
        checkPositive(errors, `${w}.eliteMaxHpRatio`, r.eliteMaxHpRatio);
        checkPositive(errors, `${w}.championMaxHpRatio`, r.championMaxHpRatio);
        checkPositive(errors, `${w}.bossDamageMultiplier`, r.bossDamageMultiplier);
        break;
      case 'bleed':
        checkPositive(errors, `${w}.durationSec`, r.durationSec);
        checkPositive(errors, `${w}.tickIntervalSec`, r.tickIntervalSec);
        checkPositive(errors, `${w}.maxStacks`, r.maxStacks);
        break;
      case 'none':
        break;
      default:
        errors.push(`${w}: 알 수 없는 rule.kind`);
    }
  }

  // --- 등급 (그룹 배율) ---
  const gradeIds = new Set<string>(GRADE_IDS);
  checkUnique(errors, 'groupMultipliers', d.groupMultipliers.grades.map((g) => g.id));
  for (const id of GRADE_IDS) {
    if (!d.groupMultipliers.grades.some((g) => g.id === id)) errors.push(`groupMultipliers: '${id}' 없음`);
  }
  for (const g of d.groupMultipliers.grades) {
    const w = `groupMultipliers.${g.id}`;
    if (!gradeIds.has(g.id)) errors.push(`${w}: 알 수 없는 등급`);
    checkPositive(errors, `${w}.damageMultiplier`, g.damageMultiplier);
    checkPositive(errors, `${w}.randomOptions`, g.randomOptions, true);
    checkPositive(errors, `${w}.energyMultiplier`, g.energyMultiplier);
    if (!HEX_COLOR.test(g.color)) errors.push(`${w}: color는 #RRGGBB`);
    needText(w, g.nameKey);
  }

  // --- 무기 ---
  const weaponIds = d.weapons.weapons.map((x) => x.id);
  checkUnique(errors, 'weapons', weaponIds);
  const fist = d.weapons.weapons.find((x) => x.id === d.weapons.fistWeapon);
  if (!fist) errors.push(`weapons.fistWeapon: '${d.weapons.fistWeapon}' 무기 없음`);
  else if (fist.droppable || fist.category !== 'blade' || fist.energyCost !== 0) errors.push('weapons.fistWeapon: 에너지 없는 칼, droppable false');
  checkSprite(errors, 'weapons.projectile', d.weapons.projectile);
  for (const k of ['slash', 'slam', 'slashBig', 'slamBig', 'buffAura'] as const) checkSprite(errors, `weapons.meleeFx.${k}`, d.weapons.meleeFx[k]);
  const classIds = new Set(d.weapons.classes.map((c) => c.id));
  for (const wpn of d.weapons.weapons) {
    const w = `weapons.${wpn.id}`;
    if (!wpn.classes?.length) errors.push(`${w}.classes: 분류가 하나 이상 필요`);
    for (const c of wpn.classes ?? []) if (!classIds.has(c)) errors.push(`${w}.classes: 없는 분류 '${c}'`);
    if (wpn.pattern.kind === 'spread' && !wpn.classes?.includes('spread')) errors.push(`${w}: 부채꼴 사격은 산탄 분류`);
    if (wpn.charge && !wpn.tags.includes('charging')) errors.push(`${w}: 차징 무기는 차징 태그`);
    checkSprite(errors, w, wpn);
    needText(w, wpn.nameKey);
    if (!gradeIds.has(wpn.grade)) errors.push(`${w}: 알 수 없는 등급 '${wpn.grade}'`);
    for (const t of wpn.tags) if (!tagIds.has(t)) errors.push(`${w}: 알 수 없는 태그 '${t}'`);
    // 기획서: 총 = 기술·원거리, 칼 = 물리·근접. 이름 있는 유니크·신화 무기는 자기 태그(환디 물리·원거리 등), 원거리/근접만 맞춘다
    // 지팡이 = 마기·원거리 (지금은 이름 있는 지팡이만)
    const named = wpn.grade === 'unique' || wpn.grade === 'mythic';
    const required =
      wpn.category === 'gun'
        ? named ? ['ranged'] : ['tech', 'ranged']
        : wpn.category === 'bow'
          ? ['ranged']
        : wpn.category === 'blade'
          ? named ? ['melee'] : ['physical', 'melee']
          : wpn.category === 'staff'
            ? named ? ['ranged'] : ['magic', 'ranged']
            : null;
    if (!required) errors.push(`${w}: category는 gun · blade · staff · bow`);
    else for (const t of required) if (!wpn.tags.includes(t as never)) errors.push(`${w}: ${wpn.category}는 '${t}' 태그 필요`);
    checkPositive(errors, `${w}.baseDamage`, wpn.baseDamage);
    checkPositive(errors, `${w}.fireIntervalSec`, wpn.fireIntervalSec);
    checkPositive(errors, `${w}.energyCost`, wpn.energyCost, true);
    checkPositive(errors, `${w}.range`, wpn.range);
    if (wpn.category !== 'blade') checkPositive(errors, `${w}.projectileSpeed`, wpn.projectileSpeed);
    const sig = wpn.signature;
    if (sig) {
      checkPositive(errors, `${w}.signature.every`, sig.every);
      if (sig.kind === 'bigSmash' && wpn.pattern.kind !== 'smash' && wpn.pattern.kind !== 'arc') errors.push(`${w}: bigSmash는 근접 무기만`);
      if (sig.kind === 'laser' && wpn.category === 'blade') errors.push(`${w}: laser는 탄을 쏘는 무기만`);
    }
    if (wpn.category === 'blade' && wpn.energyCost !== 0) errors.push(`${w}: 칼은 에너지를 소모하지 않음`);
    if (wpn.category === 'blade' && !HEX_COLOR.test(wpn.fxColor ?? '')) errors.push(`${w}.fxColor: 근접 이펙트 색 #RRGGBB`);
    if (wpn.ricochet) {
      checkPositive(errors, `${w}.ricochet.bounces`, wpn.ricochet.bounces);
      checkPositive(errors, `${w}.ricochet.range`, wpn.ricochet.range);
    }
    if (wpn.bleed && !wpn.tags.includes('bleed')) errors.push(`${w}: 출혈 무기는 bleed 태그 필요`);
    if (wpn.selfBuff) {
      checkPositive(errors, `${w}.selfBuff.sec`, wpn.selfBuff.sec);
      checkPositive(errors, `${w}.selfBuff.damage`, wpn.selfBuff.damage);
    }
    const p = wpn.pattern;
    if (p.kind === 'spread') {
      checkRange(errors, `${w}.pattern.pellets`, p.pellets, 1);
      checkPositive(errors, `${w}.pattern.spreadDeg`, p.spreadDeg);
    } else if (p.kind === 'arc') {
      checkPositive(errors, `${w}.pattern.arcDeg`, p.arcDeg);
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
    } else if (p.kind === 'lob') {
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
    } else if (p.kind === 'line') {
      checkPositive(errors, `${w}.pattern.length`, p.length);
      checkPositive(errors, `${w}.pattern.width`, p.width);
    } else if (p.kind === 'smash') {
      checkPositive(errors, `${w}.pattern.reach`, p.reach, true);
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
    } else if (p.kind === 'gust') {
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
      if (wpn.category !== 'blade') errors.push(`${w}: gust는 칼 패턴`);
    } else if (p.kind === 'homing') {
      checkPositive(errors, `${w}.pattern.turnRate`, p.turnRate);
    } else if (p.kind === 'meteor') {
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
      if (wpn.category !== 'staff') errors.push(`${w}: meteor는 지팡이 패턴`);
    } else if (p.kind !== 'single') {
      errors.push(`${w}: 알 수 없는 pattern.kind`);
    }
    if (p.kind === 'single' && wpn.category === 'blade') errors.push(`${w}: single은 쏘는 무기 패턴`);
    if ((p.kind === 'lob' || p.kind === 'spread') && wpn.category !== 'gun') errors.push(`${w}: ${p.kind}는 총 패턴`);
    if (wpn.category === 'bow' && !wpn.charge) errors.push(`${w}: 활은 차징 무기`);
    if (wpn.shot) checkSprite(errors, `${w}.shot`, wpn.shot);
    if (wpn.fireFlash) checkSprite(errors, `${w}.fireFlash`, wpn.fireFlash);
    if (wpn.lobBlast) checkSprite(errors, `${w}.lobBlast`, wpn.lobBlast);
    if (wpn.boomerang) {
      checkSprite(errors, `${w}.boomerang.shot`, wpn.boomerang.shot);
      if (wpn.boomerang.charges < 1) errors.push(`${w}.boomerang.charges: 1 이상`);
    }
    if (wpn.needle) {
      checkSprite(errors, `${w}.needle.shot`, wpn.needle.shot);
      if (wpn.needle.max < 2) errors.push(`${w}.needle.max: 2 이상 (선이 생기려면)`);
      if (!wpn.abilityNameKey) errors.push(`${w}: 회수에는 abilityNameKey가 필요`);
    }
    if (wpn.energyRange && !(wpn.energyRange[0] > 0 && wpn.energyRange[0] <= wpn.energyRange[1])) errors.push(`${w}.energyRange: 0 < 최소 ≤ 최대`);
    if (wpn.selfDestruct && !(wpn.selfDestruct.chance > 0 && wpn.selfDestruct.chance < 1)) errors.push(`${w}.selfDestruct.chance: 0~1`);
    if (wpn.debt && !wpn.abilityNameKey) errors.push(`${w}: 징수에는 abilityNameKey가 필요`);
    if (wpn.beam) checkSprite(errors, `${w}.beam.gauge`, wpn.beam.gauge);
    if (wpn.spinUp && wpn.spinUp.maxMul < 1) errors.push(`${w}.spinUp.maxMul: 1 이상`);
    if ((p.kind === 'arc' || p.kind === 'line' || p.kind === 'smash') && wpn.category !== 'blade') errors.push(`${w}: ${p.kind}는 칼 패턴`);
    if (p.kind === 'homing' && wpn.category !== 'staff') errors.push(`${w}: homing은 지팡이 패턴`);
    if (wpn.charge) for (const k of ['maxSec', 'damageMul', 'radiusMul'] as const) checkPositive(errors, `${w}.charge.${k}`, wpn.charge[k]);
    if (wpn.knockback) for (const k of ['distance', 'sec'] as const) checkPositive(errors, `${w}.knockback.${k}`, wpn.knockback[k]);
  }

  checkPositive(errors, 'weapons.critMultiplier', d.weapons.critMultiplier);
  checkPositive(errors, 'weapons.swapDelaySec', d.weapons.swapDelaySec, true);
  checkUnique(errors, 'weapons.options', d.weapons.options.map((o) => o.id));
  for (const o of d.weapons.options) {
    needText(`weapons.options.${o.id}`, o.nameKey);
    if (!Array.isArray(o.value) || o.value.length !== 2 || !(o.value[0] > 0) || o.value[0] > o.value[1]) errors.push(`weapons.options.${o.id}: value는 [최소, 최대]`);
  }
  if (!d.weapons.weapons.some((x) => x.droppable)) errors.push('weapons: 상점·드롭 무기가 없음');

  // --- 전리품·조우 ---
  const lt = d.loot;
  if (!(lt.mythicChance >= 0 && lt.mythicChance <= 1)) errors.push('loot.mythicChance: 0~1');
  if (!gradeIds.has(lt.uniqueWeaponFallback)) errors.push('loot.uniqueWeaponFallback: 알 수 없는 등급');
  const checkWeights = (where: string, w: Record<string, number | undefined>) => {
    let sum = 0;
    for (const [k, v] of Object.entries(w)) {
      if (!gradeIds.has(k)) errors.push(`${where}: 알 수 없는 등급 '${k}'`);
      checkPositive(errors, `${where}.${k}`, v, true);
      sum += v ?? 0;
    }
    if (sum <= 0) errors.push(`${where}: 가중치 합이 0`);
  };
  for (const [stage, w] of Object.entries(lt.weaponChest)) {
    if (!d.mapgen.bossStages.includes(Number(stage))) errors.push(`loot.weaponChest.${stage}: 보스 스테이지가 아님`);
    checkWeights(`loot.weaponChest.${stage}`, w);
  }
  for (const s of d.mapgen.bossStages) if (!lt.weaponChest[String(s)]) errors.push(`loot.weaponChest: ${s} 스테이지 가중치 없음`);
  if (!(lt.combatDrop.chance >= 0 && lt.combatDrop.chance <= 1)) errors.push('loot.combatDrop.chance: 0~1');
  for (const [ch, w] of Object.entries(lt.combatDrop.weights)) checkWeights(`loot.combatDrop.weights.${ch}`, w);
  checkWeights('loot.startChest', lt.startChest);
  if (!(lt.bossWeaponChance >= 0 && lt.bossWeaponChance <= 1)) errors.push('loot.bossWeaponChance: 0~1');
  checkPositive(errors, 'loot.merchant.count', lt.merchant.count);
  checkWeights('loot.merchant.weights', lt.merchant.weights);
  for (const g of GRADE_IDS) checkPositive(errors, `loot.merchant.prices.${g}`, lt.merchant.prices[g]);
  checkPositive(errors, 'loot.skillShop.count', lt.skillShop.count);
  for (const [k, v] of Object.entries(lt.skillShop.prices)) checkPositive(errors, `loot.skillShop.prices.${k}`, v);
  for (const k of ['treasure', 'merchant', 'skillShop', 'raid', 'magiSpire', 'hiddenBoss'] as const) {
    checkPositive(errors, `loot.encounter.weights.${k}`, lt.encounter.weights[k], true);
    needText(`loot.encounter.${k}`, `encounter.${k}`);
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
  // --- 아이템 ---
  const it = d.items;
  for (const k of ['hpFlat', 'damagePct', 'procDamage', 'area', 'cooldown'] as const) checkPositive(errors, `groupMultipliers.itemGroups.${k}`, d.groupMultipliers.itemGroups?.[k]);
  checkUnique(errors, 'items', it.items.map((x) => x.id));
  checkPositive(errors, 'items.transferPerPickup', it.transferPerPickup, true);
  for (const [ch, w] of Object.entries(it.treasureWeights)) checkWeights(`items.treasureWeights.${ch}`, w);
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

  // --- 적 ---
  const enemyIds = d.enemies.enemies.map((e) => e.id);
  checkUnique(errors, 'enemies', enemyIds);
  for (const e of d.enemies.enemies) {
    const w = `enemies.${e.id}`;
    checkSprite(errors, w, e);
    needText(w, e.nameKey);
    if (!Number.isInteger(e.chapter) || e.chapter < 1 || e.chapter > d.mapgen.chapters) errors.push(`${w}: chapter 범위 밖`);
    if (!['normal', 'elite', 'champion', 'boss', 'hiddenBoss'].includes(e.rank)) errors.push(`${w}: rank 잘못됨`);
    if (!['chase', 'idle', 'boss'].includes(e.ai)) errors.push(`${w}: 알 수 없는 ai '${e.ai}'`);
    if (e.ai === 'boss' && ![...d.bosses.bosses, ...d.bosses.hiddenBosses].some((b) => b.id === e.id)) errors.push(`${w}: 보스 ai인데 bosses.json에 패턴이 없음`);
    checkPositive(errors, `${w}.maxHp`, e.maxHp);
    checkPositive(errors, `${w}.moveSpeed`, e.moveSpeed, true);
    checkPositive(errors, `${w}.contactDamage`, e.contactDamage, true);
    checkPositive(errors, `${w}.contactIntervalSec`, e.contactIntervalSec);
    checkRange(errors, `${w}.energyOrbs`, e.energyOrbs);
    checkRange(errors, `${w}.coins`, e.coins);
  }

  const checkAttacks = (where: string, attacks: readonly EnemyAttackDef[] | undefined) => {
    checkUnique(errors, `${where}.attacks`, (attacks ?? []).map((a) => a.id));
    for (const a of attacks ?? []) {
      const w = `${where}.attacks.${a.id}`;
      if (!['lunge', 'slam', 'burst', 'puddle', 'fan', 'rope', 'snipe'].includes(a.kind)) errors.push(`${w}: kind는 lunge · slam · burst · puddle · fan · rope · snipe`);
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
    }
  };
  for (const e of d.enemies.enemies) {
    checkAttacks(`enemies.${e.id}`, e.attacks);
    if (e.trail) for (const k of ['everyPx', 'radius', 'liveSec', 'damage', 'tickSec'] as const) checkPositive(errors, `enemies.${e.id}.trail.${k}`, e.trail[k]);
    if (e.keepDistance !== undefined) checkPositive(errors, `enemies.${e.id}.keepDistance`, e.keepDistance);
    if (e.absorb) {
      const w = `enemies.${e.id}.absorb`;
      if (e.absorb.stages.length === 0) errors.push(`${w}.stages: 비어 있음`);
      e.absorb.stages.forEach((st, i) => {
        for (const k of ['absorb', 'hpMul', 'damageMul', 'haloRadius'] as const) checkPositive(errors, `${w}.stages[${i}].${k}`, st[k]);
        if (i > 0 && st.absorb <= e.absorb!.stages[i - 1]!.absorb) errors.push(`${w}.stages[${i}].absorb: 앞 단계보다 커야 함`);
      });
      if (!HEX_COLOR.test(e.absorb.haloColor)) errors.push(`${w}.haloColor: #RRGGBB`);
    }
  }
  // 정예
  const ch = d.waves.champions;
  for (const id of ch.ids) if (d.enemies.enemies.find((x) => x.id === id)?.rank !== 'champion') errors.push(`waves.champions.ids: '${id}'는 rank champion인 적이어야 함`);
  for (const [c, stages] of Object.entries(ch.stages)) {
    for (const s of stages) if (!Number.isInteger(s) || s < 1 || s > d.mapgen.stagesPerChapter) errors.push(`waves.champions.stages.${c}: 스테이지 범위 밖 (${s})`);
  }
  for (const k of ['waveChance', 'raidBothChance', 'weaponChestChance'] as const) if (!(ch[k] >= 0 && ch[k] <= 1)) errors.push(`waves.champions.${k}: 0~1`);
  if (!(Number.isInteger(ch.maxPerRoom) && ch.maxPerRoom >= 1)) errors.push('waves.champions.maxPerRoom: 1 이상 정수');
  for (const [c, room] of Object.entries(d.ui.chapterRooms)) for (const [k, col] of Object.entries(room)) if (!HEX_COLOR.test(col)) errors.push(`ui.chapterRooms.${c}.${k}: #RRGGBB`);
  if (!d.enemies.enemies.some((x) => x.id === d.loot.spire.troopers.enemy)) errors.push('loot.spire.troopers.enemy: 없는 적');
  checkSprite(errors, 'enemies.projectile', d.enemies.projectile);

  // --- 보스 ---
  checkPositive(errors, 'bosses.bannerSec', d.bosses.bannerSec, true);
  checkUnique(errors, 'bosses', [...d.bosses.bosses, ...d.bosses.hiddenBosses].map((b) => b.id));
  for (const b of d.bosses.bosses) {
    if (b.stage < 1 || b.stage > d.mapgen.stagesPerChapter || !d.mapgen.bossStages.includes(b.stage)) errors.push(`bosses.${b.id}: 보스 스테이지가 아님 (${b.stage})`);
  }
  for (const [k, v] of Object.entries(d.bosses.hiddenChapterMul)) checkPositive(errors, `bosses.hiddenChapterMul.${k}`, v);
  if (d.bosses.hiddenChapterMul['1'] === undefined) errors.push('bosses.hiddenChapterMul: 챕터 1 배율 필요');
  for (const h of d.bosses.hiddenBosses) {
    const w = `bosses.hiddenBosses.${h.id}`;
    const wpn = d.weapons.weapons.find((x) => x.id === h.weaponId);
    if (!wpn) errors.push(`${w}: 없는 무기 '${h.weaponId}'`);
    else if (wpn.droppable) errors.push(`${w}: 전용 무기 '${h.weaponId}'는 droppable false여야 함`);
    const it = d.items.items.find((x) => x.id === h.itemId);
    if (!it || it.pool !== 'hiddenBoss' || it.bossId !== h.id) errors.push(`${w}: 전용 아이템 '${h.itemId}'는 pool hiddenBoss·bossId ${h.id}여야 함`);
  }
  for (const b of [...d.bosses.bosses, ...d.bosses.hiddenBosses]) {
    const hidden = d.bosses.hiddenBosses.includes(b as never);
    const w = `bosses.${b.id}`;
    const e = d.enemies.enemies.find((x) => x.id === b.id);
    const rank = hidden ? 'hiddenBoss' : 'boss';
    if (!e) errors.push(`${w}: 같은 id의 적이 없음`);
    else if (e.ai !== 'boss' || e.rank !== rank) errors.push(`${w}: 적 '${b.id}'는 ai boss·rank ${rank}여야 함`);
    // 0이면 체력 강화 단계가 없다 (시간 단계 보스)
    if (!(b.enrageAt >= 0 && b.enrageAt < 1)) errors.push(`${w}.enrageAt: 0~1 사이`);
    if (b.enrageAt === 0 && b.patterns.some((p) => p.phase === 2)) errors.push(`${w}: enrageAt 0이면 강화 단계 패턴을 둘 수 없음`);
    const unlocks = b.unlocks ?? [];
    unlocks.forEach((t, i) => {
      if (!(t > 0 && t < 1)) errors.push(`${w}.unlocks[${i}]: 0~1 체력 비율`);
      if (i > 0 && t >= unlocks[i - 1]!) errors.push(`${w}.unlocks: 내림차순이어야 함`);
      needText(w, `boss.unlock.${b.id}.${i + 1}`);
    });
    if (b.darkness) {
      checkPositive(errors, `${w}.darkness.lightRadius`, b.darkness.lightRadius);
      if (!(b.darkness.alpha > 0 && b.darkness.alpha <= 1)) errors.push(`${w}.darkness.alpha: 0~1`);
      if (!HEX_COLOR.test(b.darkness.color)) errors.push(`${w}.darkness.color: #RRGGBB`);
    }
    if (b.enrageAt > 0) needText(w, `boss.enraged.${b.id}`);
    for (const id of [...(b.companions?.enemies ?? []), ...(b.companions?.enemiesEnraged ?? [])]) if (!d.enemies.enemies.some((x) => x.id === id)) errors.push(`${w}.companions: 없는 적 '${id}'`);
    if (b.patterns.some((p) => p.inherit) && !b.inherit) errors.push(`${w}: 계승 패턴에는 inherit 주기가 필요`);
    for (const k of ['gapSec', 'enrageSec', 'firstDelaySec', 'keepDistance'] as const) checkPositive(errors, `${w}.${k}`, b[k], true);
    checkPositive(errors, `${w}.enraged.moveSpeedMul`, b.enraged.moveSpeedMul);
    checkPositive(errors, `${w}.enraged.scale`, b.enraged.scale);
    if (!HEX_COLOR.test(b.enraged.auraColor)) errors.push(`${w}.enraged.auraColor: #RRGGBB`);
    checkUnique(errors, `${w}.patterns`, b.patterns.map((p) => p.id));
    if (!b.patterns.some((p) => p.phase === 1)) errors.push(`${w}: 처음부터 쓰는 패턴이 없음`);
    for (const p of b.patterns) {
      const pw = `${w}.patterns.${p.id}`;
      checkPositive(errors, `${pw}.weight`, p.weight);
      checkPositive(errors, `${pw}.cooldownSec`, p.cooldownSec, true);
      checkPositive(errors, `${pw}.durationSec`, p.durationSec);
      if (p.phase !== 1 && p.phase !== 2) errors.push(`${pw}.phase: 1 또는 2`);
      if (p.unlock !== undefined && !(Number.isInteger(p.unlock) && p.unlock >= 0 && p.unlock <= unlocks.length)) errors.push(`${pw}.unlock: 0~${unlocks.length} 정수`);
      for (const [k, v] of Object.entries(p.values)) if (!isNum(v)) errors.push(`${pw}.values.${k}: 숫자여야 함`);
      if (p.summon && !d.enemies.enemies.some((x) => x.id === p.summon)) errors.push(`${pw}.summon: 없는 적 '${p.summon}'`);
      needText(pw, `boss.pattern.${p.id}`);
    }
  }
  // --- 엘리트 ---
  const el = d.elites;
  checkPositive(errors, 'elites.common.scale', el.common.scale);
  checkPositive(errors, 'elites.common.hpMul', el.common.hpMul);
  checkRange(errors, 'elites.common.bonusEnergyOrbs', el.common.bonusEnergyOrbs);
  checkRange(errors, 'elites.common.bonusCoins', el.common.bonusCoins);
  checkPositive(errors, 'elites.perChapterBonus', el.perChapterBonus, true);
  for (let s = 1; s <= d.mapgen.stagesPerChapter; s++) checkRange(errors, `elites.countByStage.${s}`, el.countByStage[String(s)]);
  checkUnique(errors, 'elites', el.elites.map((x) => x.id));
  if (el.elites.length !== 3) errors.push(`elites: 3종이어야 함 (현재 ${el.elites.length})`);
  for (const x of el.elites) {
    const w = `elites.${x.id}`;
    needText(w, x.nameKey);
    needText(w, x.iconKey);
    if (!HEX_COLOR.test(x.color)) errors.push(`${w}: color는 #RRGGBB`);
    checkPositive(errors, `${w}.weight`, x.weight);
    for (const k of ['moveSpeedMul', 'attackSpeedMul', 'damageTakenMul'] as const) if (x[k] !== undefined) checkPositive(errors, `${w}.${k}`, x[k]);
    if (!['outline', 'afterimage', 'blink'].includes(x.look)) errors.push(`${w}: look 잘못됨`);
    checkAttacks(w, x.extraAttacks);
    if (x.deathBlast) for (const k of ['delaySec', 'radius', 'damage'] as const) checkPositive(errors, `${w}.deathBlast.${k}`, x.deathBlast[k]);
  }
  for (const k of ['count', 'distance', 'speed', 'damage'] as const) {
    checkPositive(errors, `enemies.debugBarrage.${k}`, d.enemies.debugBarrage?.[k]);
  }

  // --- 맵 생성 ---
  const m = d.mapgen;
  checkPositive(errors, 'mapgen.chapters', m.chapters);
  checkPositive(errors, 'mapgen.stagesPerChapter', m.stagesPerChapter);
  for (const s of m.bossStages) {
    if (!Number.isInteger(s) || s < 1 || s > m.stagesPerChapter) errors.push(`mapgen.bossStages: ${s} 범위 밖`);
  }
  checkRange(errors, 'mapgen.combatWaves', m.combatWaves, 1);
  for (const [kind, rule] of Object.entries(m.stageRules)) {
    const w = `mapgen.stageRules.${kind}`;
    checkRange(errors, `${w}.combatRooms`, rule.combatRooms);
    const total = 1 + rule.combatRooms[1] + rule.encounterRooms + 1 + rule.bossRooms + rule.exitRooms;
    if (total > m.grid.width * m.grid.height) errors.push(`${w}: 방 수(${total})가 격자보다 많음`);
    const lastCount = rule.lastRoom === 'bossRoom' ? rule.bossRooms : rule.lastRoom === 'exitRoom' ? rule.exitRooms : 0;
    if (lastCount !== 1) errors.push(`${w}: lastRoom '${rule.lastRoom}'은 정확히 1개여야 함`);
  }
  const roomW = m.roomTiles.width * m.tileSize;
  const roomH = m.roomTiles.height * m.tileSize;
  if (roomW > d.ui.baseWidth || roomH > d.ui.baseHeight) {
    errors.push(`mapgen.roomTiles: 방(${roomW}×${roomH})이 화면(${d.ui.baseWidth}×${d.ui.baseHeight})보다 큼`);
  }
  if (m.corridor.widthTiles >= m.roomTiles.height) errors.push('mapgen.corridor.widthTiles: 방 높이보다 작아야 함');
  if (!enemyIds.includes(m.bossPlaceholderEnemy)) errors.push(`mapgen.bossPlaceholderEnemy: '${m.bossPlaceholderEnemy}' 적 없음`);
  for (const id of m.testWeapons) if (!weaponIds.includes(id)) errors.push(`mapgen.testWeapons: '${id}' 무기 없음`);
  checkSprite(errors, 'mapgen.props.exitPortal', m.props.exitPortal);
  checkSprite(errors, 'mapgen.props.encounterCore', m.props.encounterCore);
  if (!HEX_COLOR.test(m.door.color) || !HEX_COLOR.test(m.door.openColor)) errors.push('mapgen.door: 색은 #RRGGBB');
  checkPositive(errors, 'mapgen.lockInsetPx', m.lockInsetPx, true);

  // --- 픽업 ---
  const pk = d.pickups;
  checkSprite(errors, 'pickups.energyOrb', pk.energyOrb);
  checkSprite(errors, 'pickups.coin', pk.coin);
  checkPositive(errors, 'pickups.coin.value', pk.coin.value);
  if (!(pk.coin.dropRate > 0 && pk.coin.dropRate <= 1)) errors.push('pickups.coin.dropRate: 0 초과 1 이하');
  for (const k of ['magnetRadius', 'magnetSpeed', 'collectRadius', 'interactRadius'] as const) {
    checkPositive(errors, `pickups.${k}`, pk[k]);
  }
  checkPositive(errors, 'pickups.scatterRadius', pk.scatterRadius, true);

  // --- 웨이브 ---
  checkPositive(errors, 'waves.waveDelaySec', d.waves.waveDelaySec, true);
  checkPositive(errors, 'waves.countMul', d.waves.countMul);
  checkPositive(errors, 'waves.spawnWarnSec', d.waves.spawnWarnSec, true);
  checkPositive(errors, 'waves.spawnMinPlayerDistance', d.waves.spawnMinPlayerDistance, true);
  checkUnique(errors, 'waves', d.waves.waves.map((x) => x.id));
  for (const wave of d.waves.waves) {
    const w = `waves.${wave.id}`;
    checkPositive(errors, `${w}.weight`, wave.weight);
    if (wave.spawns.length === 0) errors.push(`${w}: spawns 비어 있음`);
    for (const s of wave.spawns) {
      if (!enemyIds.includes(s.enemy)) errors.push(`${w}: 알 수 없는 적 '${s.enemy}'`);
      checkRange(errors, `${w}.${s.enemy}.count`, s.count, 1);
    }
  }
  if (!d.waves.waves.some((x) => x.chapter === 1)) errors.push('waves: 챕터1 웨이브가 없음');

  // --- 플레이어 ---
  const pl = d.player;
  checkSprite(errors, 'player', pl);
  checkPositive(errors, 'player.maxHp', pl.maxHp);
  checkPositive(errors, 'player.moveSpeed', pl.moveSpeed);
  checkPositive(errors, 'player.hurtInvulnSec', pl.hurtInvulnSec, true);
  checkPositive(errors, 'player.blinkIntervalSec', pl.blinkIntervalSec);
  checkPositive(errors, 'player.weaponOffset', pl.weaponOffset, true);
  checkPositive(errors, 'player.sanity.base', pl.sanity.base);
  checkPositive(errors, 'player.energy.max', pl.energy.max);
  checkPositive(errors, 'player.energy.orbValue', pl.energy.orbValue);
  if (!isNum(pl.energy.start) || pl.energy.start < 0 || pl.energy.start > pl.energy.max) {
    errors.push('player.energy.start: 0~max 사이여야 함');
  }

  // --- 스킬 ---
  const checkTags = (where: string, tags: readonly string[]) => {
    for (const t of tags) if (!tagIds.has(t)) errors.push(`${where}: 알 수 없는 태그 '${t}'`);
  };
  const checkSources = (where: string, sources: Record<string, readonly string[]>) => {
    for (const [k, tags] of Object.entries(sources)) checkTags(`${where}.sources.${k}`, tags);
  };
  checkPositive(errors, 'skills.activeSlots', d.skills.activeSlots);
  checkPositive(errors, 'skills.maxLevel', d.skills.maxLevel);
  for (const rank of ['normal', 'elite', 'champion', 'boss', 'hiddenBoss'] as const) {
    checkPositive(errors, `skills.targetWeights.${rank}`, d.skills.targetWeights?.[rank]);
  }
  checkUnique(errors, 'skills', d.skills.skills.map((s) => s.id));
  for (const s of d.skills.skills) {
    const w = `skills.${s.id}`;
    if (!(SCHOOL_IDS as readonly string[]).includes(s.school)) errors.push(`${w}: 계열 태그(school) 없음 또는 잘못됨`);
    if (s.kind !== 'active' && s.kind !== 'passive') errors.push(`${w}: kind는 active 또는 passive`);
    if (!HEX_COLOR.test(s.color)) errors.push(`${w}: color는 #RRGGBB`);
    needText(w, s.nameKey);
    needText(w, s.shortKey);
    needText(w, s.descKey);
    checkTags(w, s.tags);
    checkSources(w, s.sources);
    if (s.levels.length !== d.skills.maxLevel) {
      errors.push(`${w}: 레벨은 Lv1~${d.skills.maxLevel}, ${d.skills.maxLevel}개여야 함 (현재 ${s.levels.length})`);
    }
    s.levels.forEach((lv, i) => {
      if (s.kind === 'active') checkPositive(errors, `${w}.levels[${i}].cooldownSec`, lv.cooldownSec);
      for (const [k, v] of Object.entries(lv.values)) if (!isNum(v)) errors.push(`${w}.levels[${i}].${k}: 숫자여야 함`);
    });
    const a = s.awakening;
    if (!a) {
      errors.push(`${w}: awakening 없음`);
    } else {
      if (!d.items.items.some((x) => x.id === a.requiredItem)) errors.push(`${w}.awakening: 없는 요구 아이템 '${String(a.requiredItem)}'`);
      if (s.kind === 'active') checkPositive(errors, `${w}.awakening.cooldownSec`, a.cooldownSec);
      checkTags(`${w}.awakening`, a.tags);
      needText(`${w}.awakening`, a.nameKey);
      needText(`${w}.awakening`, a.descKey);
    }
    // 근접 스킬은 사거리 안 적 판정에 range 값이 필요하다
    if (s.tags.includes('melee')) {
      s.levels.forEach((lv, i) => {
        if (Object.keys(lv.values).length > 0 && !isNum(lv.values.range)) errors.push(`${w}.levels[${i}]: 근접 스킬은 range 필요`);
      });
    }
    for (const [k, sp] of Object.entries(s.sprites)) checkSprite(errors, `${w}.sprites.${k}`, sp);
  }

  // --- 궁극기 ---
  const u = d.ultimates;
  checkUnique(errors, 'ultimates', u.ultimates.map((x) => x.id));
  for (const rank of ['normal', 'elite', 'champion', 'boss', 'hiddenBoss'] as const) {
    checkPositive(errors, `ultimates.gaugePerKill.${rank}`, u.gaugePerKill[rank], true);
  }
  for (const x of u.ultimates) {
    const w = `ultimates.${x.id}`;
    needText(w, x.nameKey);
    needText(w, x.shortKey);
    needText(w, x.descKey);
    checkTags(w, x.tags);
    checkSources(w, x.sources);
    checkPositive(errors, `${w}.gaugeMax`, x.gaugeMax);
    if (x.gauge?.kind === 'energy') {
      checkPositive(errors, `${w}.gauge.perEnergy`, x.gauge.perEnergy);
    } else if (x.gauge?.kind === 'damage') {
      checkPositive(errors, `${w}.gauge.perDamage`, x.gauge.perDamage);
      for (const id of x.gauge.skills) if (!d.skills.skills.some((s) => s.id === id)) errors.push(`${w}.gauge.skills: 없는 스킬 '${id}'`);
    } else if (x.gauge?.kind !== 'kill') {
      errors.push(`${w}.gauge: kind는 kill·energy·damage`);
    }
    if (x.school !== undefined && !(SCHOOL_IDS as readonly string[]).includes(x.school)) errors.push(`${w}.school: 잘못됨`);
    if (x.awakening) {
      needText(`${w}.awakening`, x.awakening.nameKey);
      needText(`${w}.awakening`, x.awakening.shortKey);
      needText(`${w}.awakening`, x.awakening.descKey);
      checkTags(`${w}.awakening`, x.awakening.tags);
    }
    for (const [k, sp] of Object.entries(x.sprites)) checkSprite(errors, `${w}.sprites.${k}`, sp);
  }

  // --- 직업 ---
  const jb = d.jobs;
  checkUnique(errors, 'jobs', jb.jobs.map((x) => x.id));
  const startJob = jb.jobs.find((x) => x.id === jb.startJob);
  if (!startJob) errors.push(`jobs.startJob: '${jb.startJob}' 없음`);
  else if (!startJob.enabled) errors.push('jobs.startJob: 잠긴 직업');
  checkPositive(errors, 'jobs.advanceAfterChapter', jb.advanceAfterChapter);
  for (const x of jb.jobs) {
    const w = `jobs.${x.id}`;
    needText(w, x.nameKey);
    if (!u.ultimates.some((y) => y.id === x.startUltimate)) errors.push(`${w}.startUltimate: '${x.startUltimate}' 없음`);
    if (x.advancements.length !== 2) errors.push(`${w}: 전직 분기는 2개`);
    for (const a of x.advancements) {
      needText(`${w}.advancements.${a.id}`, a.nameKey);
      if (!HEX_COLOR.test(a.color)) errors.push(`${w}.advancements.${a.id}: color는 #RRGGBB`);
      if (!x.enabled) continue;
      const ult = u.ultimates.find((y) => y.id === a.ultimate);
      if (!ult) errors.push(`${w}.advancements.${a.id}: 학파 궁극기 '${String(a.ultimate)}' 없음`);
      else if (ult.school !== a.id) errors.push(`${w}.advancements.${a.id}: 궁극기 '${ult.id}'의 학파가 다름`);
      const ps = d.skills.skills.find((s) => s.id === a.passive);
      if (!ps || ps.kind !== 'passive' || ps.school !== a.id) errors.push(`${w}.advancements.${a.id}: 패시브 '${String(a.passive)}'가 이 학파 패시브가 아님`);
    }
  }

  // --- 카드 ---
  const c = d.cards;
  checkPositive(errors, 'cards.cardCount', c.cardCount);
  checkPositive(errors, 'cards.rerollCost', c.rerollCost, true);
  const offerKinds = ['skill', 'item'];
  if (c.afterStageCycle.length === 0) errors.push('cards.afterStageCycle: 비어 있음');
  for (const k of [c.runStart, c.bossBonus, ...c.afterStageCycle]) {
    if (!offerKinds.includes(k)) errors.push(`cards: 알 수 없는 카드 종류 '${k}'`);
  }
  for (const [k, v] of Object.entries(c.skillWeights)) checkPositive(errors, `cards.skillWeights.${k}`, v, true);


  // --- UI ---
  checkPositive(errors, 'ui.baseWidth', d.ui.baseWidth);
  checkPositive(errors, 'ui.baseHeight', d.ui.baseHeight);
  if (!(d.ui.renderScaleMin >= 1 && d.ui.renderScaleMin <= d.ui.renderScaleMax && d.ui.renderScaleMin <= d.ui.renderScaleMaxMobile)) errors.push('ui.renderScale: 1 <= min <= max');
  const mb = d.ui.mobile;
  for (const k of ['edgeMarginDp', 'attackDp', 'skillDp', 'ultimateDp', 'swapDp', 'bagDp', 'pauseDp'] as const) {
    checkPositive(errors, `ui.mobile.${k}`, mb[k]);
  }
  if (mb.skillFanDeg.length !== 4) errors.push('ui.mobile.skillFanDeg: 4개여야 함');
  if (!HEX_COLOR.test(d.ui.corruptionColor)) errors.push('ui.corruptionColor: #RRGGBB');
  const sb = d.ui.hud.skillbar;
  if (sb.levelColors.length !== 3) errors.push('ui.hud.skillbar.levelColors: Lv1~3, 3개여야 함');
  for (const col of [...sb.levelColors, sb.awakenedColor, sb.emptyColor, sb.cooldownColor, sb.ultimateReadyColor]) {
    if (!HEX_COLOR.test(col)) errors.push(`ui.hud.skillbar: 색은 #RRGGBB (값: ${col})`);
  }

  // --- 키 바인딩 ---
  const kb = d.keybindings;
  const keyOwner = new Map<string, string>();
  const claim = (key: string, owner: string) => {
    const prev = keyOwner.get(key);
    if (prev && prev !== owner) errors.push(`keybindings: '${key}'가 ${prev}와 ${owner}에 겹침`);
    keyOwner.set(key, owner);
  };
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    if (!kb.move[dir]?.length) errors.push(`keybindings.move.${dir}: 키 없음`);
    for (const k of kb.move[dir] ?? []) claim(k, `move.${dir}`);
  }
  for (const action of BUTTON_ACTIONS) {
    const keys = kb.buttons[action];
    if (!keys?.length) errors.push(`keybindings.buttons.${action}: 키 없음`);
    for (const k of keys ?? []) claim(k, action);
  }
  for (const [name, codes] of Object.entries(kb.debug)) for (const k of codes) claim(k, `debug.${name}`);

  // --- 결산·영구 진행 ---
  const cr = d.meta.crystals;
  for (const k of ['perStage', 'perElite', 'perSpire', 'perHiddenBoss'] as const) checkPositive(errors, `meta.crystals.${k}`, cr[k], true);
  if (!(cr.clearMultiplier >= 1)) errors.push('meta.crystals.clearMultiplier: 1 이상');
  for (const s of d.mapgen.bossStages) if (cr.bossByStage[String(s)] === undefined) errors.push(`meta.crystals.bossByStage: ${s} 스테이지 보스 결정 없음`);
  checkPositive(errors, 'meta.memory.pastSlots', d.meta.memory.pastSlots);
  if (!(d.meta.memory.bossShardChance >= 0 && d.meta.memory.bossShardChance <= 1)) errors.push('meta.memory.bossShardChance: 0~1');
  for (const k of ['lineStepSec', 'countSec'] as const) checkPositive(errors, `meta.settlement.${k}`, d.meta.settlement[k]);
  for (const k of ['stages', 'midBoss', 'chapterBoss', 'elites', 'spires', 'hiddenBosses'] as const) needText('meta.crystals', `settlement.crystal.${k}`);

  checkUnique(errors, 'meta.upgrades', d.meta.upgrades.map((u) => u.id));
  for (const u of d.meta.upgrades) {
    const w = `meta.upgrades.${u.id}`;
    needText(w, `upgrade.${u.kind}`);
    checkPositive(errors, `${w}.perLevel`, u.perLevel);
    if (u.costs.length === 0) errors.push(`${w}.costs: 비어 있음`);
    u.costs.forEach((c, i) => {
      checkPositive(errors, `${w}.costs[${i}]`, c);
      if (i > 0 && c < u.costs[i - 1]!) errors.push(`${w}.costs: 레벨이 오를수록 비용이 커야 함`);
    });
  }

  // --- 실험장 ---
  const lab = d.lab;
  checkUnique(errors, 'lab.objects', lab.objects.map((o) => o.id));
  for (const kind of ['capsule', 'jobSelect', 'portal', 'codex', 'archive', 'gemini', 'window'] as const) {
    if (lab.objects.filter((o) => o.kind === kind).length !== 1) errors.push(`lab.objects: '${kind}'는 하나여야 함`);
    needText('lab.objects', `lab.object.${kind}`);
  }
  for (const o of lab.objects) {
    if (!HEX_COLOR.test(o.color)) errors.push(`lab.objects.${o.id}.color: #RRGGBB`);
    checkPositive(errors, `lab.objects.${o.id}.w`, o.w);
    checkPositive(errors, `lab.objects.${o.id}.h`, o.h);
  }
  for (const [k, c] of Object.entries(lab.colors)) if (!HEX_COLOR.test(c)) errors.push(`lab.colors.${k}: #RRGGBB`);
  for (const k of ['interactRadius', 'gridStep', 'wall', 'portalPulseSec'] as const) checkPositive(errors, `lab.${k}`, lab[k]);
  for (const k of ['lidSec', 'stepSec', 'stepDistance'] as const) checkPositive(errors, `lab.wake.${k}`, lab.wake[k]);

  // --- 텍스트 --- (제미니 대사는 미공개 설정이면 빈 자리로 둔다)
  for (const [k, v] of Object.entries(d.text)) {
    if (typeof v !== 'string' || (v === '' && !k.startsWith('gemini.story.') && !k.startsWith('gemini.mini.'))) errors.push(`text: '${k}' 값이 비어 있음`);
  }

  // --- 방 크기·장애물 ---
  const mg = d.mapgen;
  checkUnique(errors, 'mapgen.roomSizes', mg.roomSizes.map((s) => s.id));
  for (const s of mg.roomSizes) {
    // 문·복도가 가운데에 오도록 크기는 홀수 너비의 복도와 맞아야 하고, 최소 크기
    if (!(Number.isInteger(s.w) && Number.isInteger(s.h) && s.w >= 12 && s.h >= 9)) errors.push(`mapgen.roomSizes.${s.id}: 12×9 이상 정수`);
  }
  for (const kind of ['startRoom', 'combatRoom', 'encounterRoom', 'bossRoom', 'exitRoom'] as const) {
    const rules = mg.roomSizeRules[kind];
    if (!rules || rules.length === 0) errors.push(`mapgen.roomSizeRules.${kind}: 없음`);
    for (const r of rules ?? []) if (!mg.roomSizes.some((s) => s.id === r.size)) errors.push(`mapgen.roomSizeRules.${kind}: 없는 크기 '${r.size}'`);
  }
  if (!(mg.obstacles.chance >= 0 && mg.obstacles.chance <= 1)) errors.push('mapgen.obstacles.chance: 0~1');
  checkUnique(errors, 'mapgen.obstacles.layouts', mg.obstacles.layouts.map((l) => l.id));
  for (const l of mg.obstacles.layouts) {
    for (const b of l.blocks) if (!(b.x > 0 && b.x < 1 && b.y > 0 && b.y < 1 && b.w >= 1 && b.h >= 1)) errors.push(`mapgen.obstacles.layouts.${l.id}: 블록 자리 0~1, 크기 1 이상`);
  }

  // --- 카메라 ---
  if (!(d.ui.camera.zoom >= 1 && d.ui.camera.zoom <= 4)) errors.push('ui.camera.zoom: 1~4');
  if (!(d.ui.camera.lean >= 0 && d.ui.camera.lean <= 1)) errors.push('ui.camera.lean: 0~1');
  checkPositive(errors, 'ui.camera.playerMarginPx', d.ui.camera.playerMarginPx, true);

  // --- 타격감 ---
  const ju = d.juice;
  for (const [k, c] of [...Object.entries(ju.damageNumbers.colors), ...Object.entries(ju.sparks.colors)]) if (!HEX_COLOR.test(c)) errors.push(`juice 색 ${k}: #RRGGBB`);
  if (!HEX_COLOR.test(ju.playerHurt.color)) errors.push('juice.playerHurt.color: #RRGGBB');
  for (const [k, v] of Object.entries(ju.hitStop)) if (!(v >= 0 && v <= 0.3)) errors.push(`juice.hitStop.${k}: 0~0.3초`);
  for (const [k, v] of Object.entries(ju.shake)) {
    checkPositive(errors, `juice.shake.${k}.ms`, v.ms);
    if (!(v.intensity > 0 && v.intensity < 0.05)) errors.push(`juice.shake.${k}.intensity: 0~0.05`);
  }
  checkRange(errors, 'juice.sparks.count', ju.sparks.count);
  checkRange(errors, 'juice.death.shards', ju.death.shards);
  checkRange(errors, 'juice.death.eliteShards', ju.death.eliteShards);
  for (const [k, ref] of Object.entries(ju.fx)) checkSprite(errors, `juice.fx.${k}`, ref);
  for (const c of [ju.spawn.ringColor, ju.bossIntro.bandColor, ju.bossIntro.nameColor, ju.bossIntro.subColor, ju.bossBar.color, ju.bossBar.trailColor, ju.bossBar.backColor, ju.bossBar.markerColor, ju.roomClear.color]) {
    if (!HEX_COLOR.test(c)) errors.push(`juice 색 ${c}: #RRGGBB`);
  }
  for (const [k, v] of Object.entries(ju.bossIntro)) if (typeof v === 'number') checkPositive(errors, `juice.bossIntro.${k}`, v);
  if (!(ju.bossKill.slowScale > 0 && ju.bossKill.slowScale <= 1)) errors.push('juice.bossKill.slowScale: 0~1');

  // --- 효과음 ---
  const so = d.sounds;
  if (!(so.masterVolume >= 0 && so.masterVolume <= 1)) errors.push('sounds.masterVolume: 0~1');
  for (const [id, def] of Object.entries(so.sounds)) {
    const w = `sounds.${id}`;
    if (def.layers.length === 0) errors.push(`${w}: 층이 없음`);
    def.layers.forEach((l, i) => {
      const lw = `${w}.layers[${i}]`;
      if (!['sine', 'square', 'triangle', 'sawtooth', 'noise'].includes(l.wave)) errors.push(`${lw}.wave: sine·square·triangle·sawtooth·noise`);
      if (l.wave !== 'noise' && !(l.freq && l.freq[0] > 0 && l.freq[1] > 0)) errors.push(`${lw}.freq: 0보다 큰 [시작, 끝]`);
      checkPositive(errors, `${lw}.durSec`, l.durSec);
      if (!(l.volume > 0 && l.volume <= 1)) errors.push(`${lw}.volume: 0~1`);
      if (l.filter && !(['lowpass', 'highpass', 'bandpass'].includes(l.filter.type) && l.filter.freq[0] > 0 && l.filter.freq[1] > 0)) errors.push(`${lw}.filter`);
    });
  }
  for (const wpn of d.weapons.weapons) if (wpn.sfx !== undefined && !so.sounds[wpn.sfx]) errors.push(`weapons.${wpn.id}.sfx: 없는 소리 '${wpn.sfx}'`);

  // --- 도트 아트 ---
  errors.push(...validateArt(d.art, collectAssets(d)));

  // --- 미모사 제미니 대사 ---
  const gm = d.gemini;
  checkPositive(errors, 'gemini.mini.showSec', gm.mini.showSec);
  checkPositive(errors, 'gemini.mini.fadeSec', gm.mini.fadeSec, true);
  if (!HEX_COLOR.test(gm.color)) errors.push('gemini.color: #RRGGBB');
  checkUnique(errors, 'gemini', [...gm.stories, ...gm.minis].map((x) => x.id));
  const events = ['firstRun', 'advancement', 'bossKill', 'championMet', 'chapterEnd', 'hiddenBoss'];
  for (const s of gm.stories) {
    const w = `gemini.stories.${s.id}`;
    if (!events.includes(s.event)) errors.push(`${w}: 알 수 없는 이벤트 '${s.event}'`);
    if (s.lines.length === 0) errors.push(`${w}.lines: 비어 있음`);
    needText(w, s.nameKey);
    for (const k of s.lines) needText(w, k);
  }
  for (const m of gm.minis) {
    const w = `gemini.minis.${m.id}`;
    if (!events.includes(m.event)) errors.push(`${w}: 알 수 없는 이벤트 '${m.event}'`);
    if (!['calm', 'ominous'].includes(m.mood)) errors.push(`${w}.mood: calm · ominous`);
    checkPositive(errors, `${w}.priority`, m.priority);
    if (m.candidates.length === 0 || m.candidates.some((c) => c.length === 0)) errors.push(`${w}.candidates: 빈 후보`);
    needText(w, m.nameKey);
    for (const c of m.candidates) for (const k of c) needText(w, k);
  }

  for (const { where, key } of textKeys) {
    if (!(key in d.text)) errors.push(`${where}: 텍스트 키 '${key}'가 ko.json에 없음`);
  }

  return errors;
}

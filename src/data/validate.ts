/**
 * 데이터 JSON 검증. 문제마다 사람이 읽을 수 있는 문장을 돌려준다(빈 배열 = 통과).
 * Phaser에 의존하지 않으며 테스트와 개발 모드 부팅에서 함께 쓴다.
 */
import { BUTTON_ACTIONS } from '../core/actions';
import { GRADE_IDS, SCHOOL_IDS, STAT_EFFECT_IDS, STAT_IDS, TAG_IDS } from '../types/data';
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
  const statIds = new Set<string>(STAT_IDS);
  const textKeys: { where: string; key: string }[] = [];
  const needText = (where: string, key: string) => textKeys.push({ where, key });

  // --- 스탯 ---
  checkPositive(errors, 'stats.startValue', d.stats.startValue);
  checkUnique(errors, 'stats', d.stats.stats.map((s) => s.id));
  for (const id of STAT_IDS) {
    if (!d.stats.stats.some((s) => s.id === id)) errors.push(`stats: '${id}' 없음`);
  }
  for (const s of d.stats.stats) {
    if (!statIds.has(s.id)) errors.push(`stats: 알 수 없는 스탯 '${s.id}'`);
    for (const t of s.linkedTags) if (!tagIds.has(t)) errors.push(`stats.${s.id}: 알 수 없는 태그 '${t}'`);
    needText(`stats.${s.id}`, s.nameKey);
    needText(`stats.${s.id}`, s.descKey);
  }

  for (const id of STAT_EFFECT_IDS) {
    const r = d.stats.effects?.[id];
    const w = `stats.effects.${id}`;
    if (!r) {
      errors.push(`${w}: 없음`);
      continue;
    }
    if (!statIds.has(r.stat)) errors.push(`${w}: 알 수 없는 스탯 '${r.stat}'`);
    checkPositive(errors, `${w}.pivot`, r.pivot, true);
    checkPositive(errors, `${w}.perPoint`, r.perPoint);
    checkPositive(errors, `${w}.cap`, r.cap);
  }

  // --- 태그 ---
  checkUnique(errors, 'tags', d.tags.tags.map((t) => t.id));
  if (d.tags.tags.length !== TAG_IDS.length) {
    errors.push(`tags: ${TAG_IDS.length}종이어야 함 (현재 ${d.tags.tags.length})`);
  }
  for (const t of d.tags.tags) {
    const w = `tags.${t.id}`;
    if (!tagIds.has(t.id)) errors.push(`${w}: 알 수 없는 태그`);
    if (!['attribute', 'range', 'none'].includes(t.damageGroup)) errors.push(`${w}: damageGroup 잘못됨`);
    if (!HEX_COLOR.test(t.badgeColor)) errors.push(`${w}: badgeColor는 #RRGGBB`);
    needText(w, t.nameKey);
    needText(w, t.descKey);
    const r = t.rule;
    switch (r.kind) {
      case 'linearStat':
        if (!statIds.has(r.stat)) errors.push(`${w}: 알 수 없는 스탯 '${r.stat}'`);
        checkPositive(errors, `${w}.pivot`, r.pivot, true);
        checkPositive(errors, `${w}.perPoint`, r.perPoint);
        checkPositive(errors, `${w}.cap`, r.cap);
        break;
      case 'exponentialChance':
        if (!statIds.has(r.stat)) errors.push(`${w}: 알 수 없는 스탯 '${r.stat}'`);
        checkPositive(errors, `${w}.base`, r.base);
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
    if (t.damageGroup === 'attribute' && r.kind !== 'linearStat') {
      errors.push(`${w}: attribute 그룹은 linearStat 규칙이어야 함`);
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
    if (!HEX_COLOR.test(g.color)) errors.push(`${w}: color는 #RRGGBB`);
    needText(w, g.nameKey);
  }

  // --- 무기 ---
  const weaponIds = d.weapons.weapons.map((x) => x.id);
  checkUnique(errors, 'weapons', weaponIds);
  if (!weaponIds.includes(d.weapons.startWeapon)) {
    errors.push(`weapons.startWeapon: '${d.weapons.startWeapon}' 무기 없음`);
  }
  checkSprite(errors, 'weapons.projectile', d.weapons.projectile);
  for (const wpn of d.weapons.weapons) {
    const w = `weapons.${wpn.id}`;
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
        : wpn.category === 'blade'
          ? named ? ['melee'] : ['physical', 'melee']
          : wpn.category === 'staff'
            ? named ? ['ranged'] : ['magic', 'ranged']
            : null;
    if (!required) errors.push(`${w}: category는 gun · blade · staff`);
    else for (const t of required) if (!wpn.tags.includes(t as never)) errors.push(`${w}: ${wpn.category}는 '${t}' 태그 필요`);
    checkPositive(errors, `${w}.baseDamage`, wpn.baseDamage);
    checkPositive(errors, `${w}.fireIntervalSec`, wpn.fireIntervalSec);
    checkPositive(errors, `${w}.energyCost`, wpn.energyCost, true);
    checkPositive(errors, `${w}.range`, wpn.range);
    if (wpn.category !== 'blade') checkPositive(errors, `${w}.projectileSpeed`, wpn.projectileSpeed);
    const sig = wpn.signature;
    if (sig) {
      checkPositive(errors, `${w}.signature.every`, sig.every);
      if (sig.kind === 'bigSmash' && wpn.pattern.kind !== 'smash') errors.push(`${w}: bigSmash는 내려찍기 무기만`);
      if (sig.kind === 'laser' && wpn.category === 'blade') errors.push(`${w}: laser는 탄을 쏘는 무기만`);
    }
    if (wpn.category === 'blade' && wpn.energyCost !== 0) errors.push(`${w}: 칼은 에너지를 소모하지 않음`);
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
    } else if (p.kind === 'homing') {
      checkPositive(errors, `${w}.pattern.turnRate`, p.turnRate);
    } else if (p.kind !== 'single') {
      errors.push(`${w}: 알 수 없는 pattern.kind`);
    }
    if ((p.kind === 'lob' || p.kind === 'single' || p.kind === 'spread') && wpn.category !== 'gun') errors.push(`${w}: ${p.kind}는 총 패턴`);
    if ((p.kind === 'arc' || p.kind === 'line' || p.kind === 'smash') && wpn.category !== 'blade') errors.push(`${w}: ${p.kind}는 칼 패턴`);
    if (p.kind === 'homing' && wpn.category !== 'staff') errors.push(`${w}: homing은 지팡이 패턴`);
    if (wpn.charge) for (const k of ['maxSec', 'damageMul', 'radiusMul'] as const) checkPositive(errors, `${w}.charge.${k}`, wpn.charge[k]);
    if (wpn.knockback) for (const k of ['distance', 'sec'] as const) checkPositive(errors, `${w}.knockback.${k}`, wpn.knockback[k]);
    for (const [k, v] of Object.entries(wpn.equipBonus?.stats ?? {})) if (!statIds.has(k) || !isNum(v)) errors.push(`${w}.equipBonus.stats.${k}: 잘못됨`);
  }

  checkPositive(errors, 'weapons.critMultiplier', d.weapons.critMultiplier);
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
  checkWeights('loot.combatDrop.weights', lt.combatDrop.weights);
  checkPositive(errors, 'loot.merchant.count', lt.merchant.count);
  checkWeights('loot.merchant.weights', lt.merchant.weights);
  for (const g of GRADE_IDS) checkPositive(errors, `loot.merchant.prices.${g}`, lt.merchant.prices[g]);
  for (const k of ['treasure', 'merchant', 'raid', 'magiSpire', 'hiddenBoss'] as const) {
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
  checkWeights('loot.spire.small.weights', sp.small.weights);
  if ((sp.small.weights.common ?? 0) > 0 || (sp.small.weights.mythic ?? 0) > 0) errors.push('loot.spire.small.weights: 레어·전설·유니크만 (신화는 따로 판정)');
  for (const k of ['radius', 'fallSec', 'fallHeight', 'riseSec', 'spawnGapSec', 'eliteMul', 'cards'] as const) checkPositive(errors, `loot.spire.${k}`, sp[k]);
  checkPositive(errors, 'loot.spire.minAlive', sp.minAlive, true);
  for (const [k, v] of Object.entries(sp.chargePerKill)) {
    if (!(typeof v === 'number' && v >= 0 && v <= 1)) errors.push(`loot.spire.chargePerKill.${k}: 0~1`);
  }
  if (!((sp.chargePerKill.normal ?? 0) > 0)) errors.push('loot.spire.chargePerKill.normal: 0보다 커야 충전된다');
  // --- 아이템 ---
  const it = d.items;
  for (const k of ['statFlat', 'hpFlat', 'damagePct', 'procDamage', 'area', 'cooldown'] as const) checkPositive(errors, `groupMultipliers.itemGroups.${k}`, d.groupMultipliers.itemGroups?.[k]);
  checkUnique(errors, 'items', it.items.map((x) => x.id));
  checkPositive(errors, 'items.transferPerPickup', it.transferPerPickup, true);
  checkPositive(errors, 'items.chapterCommonShift', it.chapterCommonShift, true);
  checkPositive(errors, 'items.pickupCardSec', it.pickupCardSec);
  for (const [k, v] of Object.entries({ ...it.treasureWeights, ...it.raidWeights })) {
    if (!gradeIds.has(k)) errors.push(`items: 알 수 없는 등급 '${k}'`);
    checkPositive(errors, `items.weights.${k}`, v, true);
  }
  if ((it.raidWeights.common ?? 0) > 0) errors.push('items.raidWeights: 레어 이상만');
  const itemIds = new Set(it.items.map((x) => x.id));
  for (const s of it.sets) {
    for (const m of [...s.materials, s.result]) if (!itemIds.has(m)) errors.push(`items.sets: 없는 아이템 '${m}'`);
    if (it.items.find((x) => x.id === s.result)?.pool !== 'set') errors.push(`items.sets: '${s.result}'는 pool set이어야 함`);
  }
  for (const x of it.items) {
    const w = `items.${x.id}`;
    checkSprite(errors, w, x);
    needText(w, x.nameKey);
    needText(w, x.descKey);
    if (!gradeIds.has(x.grade)) errors.push(`${w}: 알 수 없는 등급`);
    if (!['normal', 'boss', 'hiddenBoss', 'set'].includes(x.pool)) errors.push(`${w}: pool 잘못됨`);
    for (const t of x.tags) if (!tagIds.has(t)) errors.push(`${w}: 알 수 없는 태그 '${t}'`);
    if (x.pool === 'boss' && !d.bosses.bosses.some((b) => b.id === x.bossId)) errors.push(`${w}: bossId '${String(x.bossId)}' 보스 없음`);
    if (x.pool === 'hiddenBoss' && !d.bosses.hiddenBosses.some((b) => b.id === x.bossId)) errors.push(`${w}: bossId '${String(x.bossId)}' 히든보스 없음`);
    if (x.effects.length === 0) errors.push(`${w}: 효과 없음`);
    for (const e of [...x.effects, ...(x.variants ?? []).flatMap((v) => v.effects)]) {
      if (e.kind === 'stat' && e.stat !== 'all' && !statIds.has(e.stat)) errors.push(`${w}: 알 수 없는 스탯 '${e.stat}'`);
      if ((e.kind === 'autoCast' || e.kind === 'skillDamage') && !d.skills.skills.some((s) => s.id === e.skillId)) errors.push(`${w}: 없는 스킬 '${e.skillId}'`);
      if ((e.kind === 'hurtBurst' || e.kind === 'gravityShot' || e.kind === 'coinShots') && e.tags.some((t) => !tagIds.has(t))) errors.push(`${w}: 알 수 없는 태그`);
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
      if (a.kind !== 'lunge' && a.kind !== 'slam') errors.push(`${w}: kind는 lunge 또는 slam`);
      for (const k of ['triggerRange', 'windupSec', 'actSec', 'damage'] as const) checkPositive(errors, `${w}.${k}`, a[k]);
      for (const k of ['recoverSec', 'cooldownSec'] as const) checkPositive(errors, `${w}.${k}`, a[k], true);
      if (a.kind === 'lunge') checkPositive(errors, `${w}.speed`, a.speed);
      if (a.kind === 'slam') {
        checkPositive(errors, `${w}.radius`, a.radius);
        checkPositive(errors, `${w}.reach`, a.reach, true);
      }
    }
  };
  for (const e of d.enemies.enemies) checkAttacks(`enemies.${e.id}`, e.attacks);
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
    if (!(b.enrageAt > 0 && b.enrageAt < 1)) errors.push(`${w}.enrageAt: 0~1 사이`);
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
      for (const [k, v] of Object.entries(p.values)) if (!isNum(v)) errors.push(`${pw}.values.${k}: 숫자여야 함`);
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
    const total = 1 + rule.combatRooms[1] + rule.encounterRooms + rule.bossRooms + rule.exitRooms;
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
  for (const k of ['magnetRadius', 'magnetSpeed', 'collectRadius', 'interactRadius'] as const) {
    checkPositive(errors, `pickups.${k}`, pk[k]);
  }
  checkPositive(errors, 'pickups.scatterRadius', pk.scatterRadius, true);

  // --- 웨이브 ---
  checkPositive(errors, 'waves.waveDelaySec', d.waves.waveDelaySec, true);
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
  checkPositive(errors, 'player.shieldMax', pl.shieldMax, true);
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
      if (!statIds.has(a.requiredStat)) errors.push(`${w}.awakening: 요구 스탯 없음 또는 잘못됨 '${String(a.requiredStat)}'`);
      checkPositive(errors, `${w}.awakening.requiredValue`, a.requiredValue);
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
  checkPositive(errors, 'ultimates.awakeningNeed', u.awakeningNeed);
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
    if (x.gauge?.kind === 'damage') {
      checkPositive(errors, `${w}.gauge.perDamage`, x.gauge.perDamage);
      for (const id of x.gauge.skills) if (!d.skills.skills.some((s) => s.id === id)) errors.push(`${w}.gauge.skills: 없는 스킬 '${id}'`);
    } else if (x.gauge?.kind !== 'kill') {
      errors.push(`${w}.gauge: kind는 kill 또는 damage`);
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
  checkPositive(errors, 'jobs.conversionStatAmount', jb.conversionStatAmount);
  for (const x of jb.jobs) {
    const w = `jobs.${x.id}`;
    needText(w, x.nameKey);
    if (!weaponIds.includes(x.startWeapon)) errors.push(`${w}.startWeapon: '${x.startWeapon}' 무기 없음`);
    if (!u.ultimates.some((y) => y.id === x.startUltimate)) errors.push(`${w}.startUltimate: '${x.startUltimate}' 없음`);
    for (const [k, v] of Object.entries(x.statBonus)) {
      if (!statIds.has(k)) errors.push(`${w}.statBonus: 알 수 없는 스탯 '${k}'`);
      if (!isNum(v)) errors.push(`${w}.statBonus.${k}: 숫자여야 함`);
    }
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
  checkPositive(errors, 'cards.maxAwakeningCards', c.maxAwakeningCards, true);
  if (c.maxAwakeningCards > c.cardCount) errors.push('cards.maxAwakeningCards: cardCount보다 클 수 없음');
  const offerKinds = ['skill', 'stat'];
  if (c.afterStageCycle.length === 0) errors.push('cards.afterStageCycle: 비어 있음');
  for (const k of [c.runStart, c.bossBonus, ...c.afterStageCycle]) {
    if (!offerKinds.includes(k)) errors.push(`cards: 알 수 없는 카드 종류 '${k}'`);
  }
  for (const [k, v] of Object.entries(c.skillWeights)) checkPositive(errors, `cards.skillWeights.${k}`, v, true);
  if (c.statGrades.length === 0) errors.push('cards.statGrades: 비어 있음');
  checkUnique(errors, 'cards.statGrades', c.statGrades.map((g) => g.id));
  for (const g of c.statGrades) {
    checkPositive(errors, `cards.statGrades.${g.id}.amount`, g.amount);
    checkPositive(errors, `cards.statGrades.${g.id}.weight`, g.weight);
    if (!HEX_COLOR.test(g.color)) errors.push(`cards.statGrades.${g.id}: color는 #RRGGBB`);
  }
  if (c.cardCount > STAT_IDS.length) errors.push('cards.cardCount: 스탯 수보다 클 수 없음(스탯 카드는 서로 다른 스탯)');

  // --- UI ---
  checkPositive(errors, 'ui.baseWidth', d.ui.baseWidth);
  checkPositive(errors, 'ui.baseHeight', d.ui.baseHeight);
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

  // --- 텍스트 ---
  for (const [k, v] of Object.entries(d.text)) {
    if (typeof v !== 'string' || v === '') errors.push(`text: '${k}' 값이 비어 있음`);
  }
  for (const { where, key } of textKeys) {
    if (!(key in d.text)) errors.push(`${where}: 텍스트 키 '${key}'가 ko.json에 없음`);
  }

  return errors;
}

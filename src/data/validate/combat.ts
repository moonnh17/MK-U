/** 데이터 검증: 태그·등급·무기 */
import { GRADE_IDS } from '../../types/data';
import { HEX_COLOR, isNum, checkPositive, checkRange, checkSprite, checkUnique } from './shared';
import type { V } from './shared';

/** 태그 */
export function validateTags(v: V): void {
  const { d, errors, needText, tagIds } = v;
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
      case 'burn':
        checkPositive(errors, `${w}.tickIntervalSec`, r.tickIntervalSec);
        checkPositive(errors, `${w}.maxStacks`, r.maxStacks);
        checkPositive(errors, `${w}.bossMaxStacks`, r.bossMaxStacks);
        break;
      case 'none':
        break;
      default:
        errors.push(`${w}: 알 수 없는 rule.kind`);
    }
  }
}

/** 등급 (그룹 배율) */
export function validateGrades(v: V): void {
  const { d, errors, needText } = v;
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
}

/** 무기 */
export function validateWeapons(v: V): void {
  const { d, errors, needText, tagIds, gradeIds } = v;
  const weaponIds = d.weapons.weapons.map((x) => x.id);
  checkUnique(errors, 'weapons', weaponIds);
  const fist = d.weapons.weapons.find((x) => x.id === d.weapons.fistWeapon);
  if (!fist) errors.push(`weapons.fistWeapon: '${d.weapons.fistWeapon}' 무기 없음`);
  else if (fist.droppable || fist.category !== 'blade' || fist.energyCost !== 0) errors.push('weapons.fistWeapon: 에너지 없는 칼, droppable false');
  checkSprite(errors, 'weapons.projectile', d.weapons.projectile);
  for (const k of ['slash', 'slam', 'slashBig', 'slamBig', 'buffAura'] as const) checkSprite(errors, `weapons.meleeFx.${k}`, d.weapons.meleeFx[k]);
  for (const k of ['slashTiers', 'thrustTiers', 'smashTiers', 'beamTiers', 'bulletTiers', 'orbTiers', 'muzzleTiers'] as const) {
    const list = d.weapons.meleeFx[k];
    if (list.length !== 4) errors.push(`weapons.meleeFx.${k}: 4단계`);
    list.forEach((r, i) => checkSprite(errors, `weapons.meleeFx.${k}[${i}]`, r));
  }
  if (!(d.weapons.meleeFx.shotTintWhite >= 0 && d.weapons.meleeFx.shotTintWhite <= 1)) errors.push('weapons.meleeFx.shotTintWhite: 0~1');
  for (const g of GRADE_IDS) {
    const t = d.weapons.meleeFx.tiers[g];
    if (!(Number.isInteger(t) && t >= 1 && t <= 4)) errors.push(`weapons.meleeFx.tiers.${g}: 1~4 정수`);
  }
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
    } else if (p.kind === 'nova') {
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
      if (wpn.category !== 'staff') errors.push(`${w}: nova는 지팡이 패턴`);
      if (!wpn.shot) errors.push(`${w}: nova는 파동 그림(shot)이 필요`);
    } else if (p.kind === 'meteor') {
      checkPositive(errors, `${w}.pattern.radius`, p.radius);
      if (wpn.category !== 'staff') errors.push(`${w}: meteor는 지팡이 패턴`);
    } else if (p.kind !== 'single') {
      errors.push(`${w}: 알 수 없는 pattern.kind`);
    }
    if (p.kind === 'single' && wpn.category === 'blade') errors.push(`${w}: single은 쏘는 무기 패턴`);
    if (p.kind === 'spread' && wpn.category !== 'gun') errors.push(`${w}: spread는 총 패턴`);
    if (p.kind === 'lob' && wpn.category !== 'gun' && wpn.category !== 'staff') errors.push(`${w}: lob은 총·지팡이 패턴`);
    if (wpn.category === 'bow' && !wpn.charge) errors.push(`${w}: 활은 차징 무기`);
    if (wpn.shot) checkSprite(errors, `${w}.shot`, wpn.shot);
    if (wpn.fireFlash) checkSprite(errors, `${w}.fireFlash`, wpn.fireFlash);
    if (wpn.lobBlast) checkSprite(errors, `${w}.lobBlast`, wpn.lobBlast);
    if (wpn.qSkill) {
      const q = wpn.qSkill;
      checkPositive(errors, `${w}.qSkill.cooldownSec`, q.cooldownSec);
      needText(`${w}.qSkill`, q.nameKey);
      needText(`${w}.qSkill`, q.descKey);
      if (q.kind === 'gemini') q.cut.forEach((c, i) => checkSprite(errors, `${w}.qSkill.cut.${i}`, c));
      else if (q.kind === 'purifyingFlame') checkSprite(errors, `${w}.qSkill.flame`, q.flame);
      else if (q.kind === 'judgment') {
        checkSprite(errors, `${w}.qSkill.beam`, q.beam);
        checkSprite(errors, `${w}.qSkill.sigil`, q.sigil);
      } else if (q.kind === 'variableControl') checkSprite(errors, `${w}.qSkill.shot`, q.shot);
      else if (q.kind === 'butcher' && !(q.minBleed > 0 && q.maxTargets >= 1 && q.dashSec > 0)) errors.push(`${w}.qSkill: 도축 minBleed·maxTargets·dashSec`);
    }
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
    if (wpn.debt && wpn.category !== 'blade') errors.push(`${w}: 징수는 칼 무기만 (못 내면 맨손으로 친다)`);
    if (wpn.worn && !(wpn.worn.gripX >= 0 && wpn.worn.gripX <= 1)) errors.push(`${w}.worn.gripX: 0~1`);
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
}

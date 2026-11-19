/** 데이터 검증: 플레이어·스킬·궁극기·직업·카드 */
import { ELEMENT_IDS, IMPRINT_EFFECTS, SCHOOL_IDS } from '../../types/data';
import { HEX_COLOR, isNum, checkPositive, checkSprite, checkUnique, checkTags, checkSources } from './shared';
import type { V } from './shared';

/** 플레이어 */
export function validatePlayer(v: V): void {
  const { d, errors } = v;
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
}

/** 스킬 */
export function validateSkills(v: V): void {
  const { d, errors, needText } = v;
  checkPositive(errors, 'skills.activeSlots', d.skills.activeSlots);
  checkPositive(errors, 'skills.maxLevel', d.skills.maxLevel);
  for (const rank of ['normal', 'elite', 'champion', 'boss', 'hiddenBoss'] as const) {
    checkPositive(errors, `skills.targetWeights.${rank}`, d.skills.targetWeights?.[rank]);
  }
  checkUnique(errors, 'skills', d.skills.skills.map((s) => s.id));
  for (const s of d.skills.skills) {
    const w = `skills.${s.id}`;
    if (!(SCHOOL_IDS as readonly string[]).includes(s.school)) errors.push(`${w}: 계열 태그(school) 없음 또는 잘못됨`);
    if (!['active', 'passive', 'mastery'].includes(s.kind)) errors.push(`${w}: kind는 active·passive·mastery`);
    if (!HEX_COLOR.test(s.color)) errors.push(`${w}: color는 #RRGGBB`);
    needText(w, s.nameKey);
    needText(w, s.shortKey);
    needText(w, s.descKey);
    checkTags(v, w, s.tags);
    checkSources(v, w, s.sources);
    if (s.levels.length !== d.skills.maxLevel) {
      errors.push(`${w}: 레벨은 Lv1~${d.skills.maxLevel}, ${d.skills.maxLevel}개여야 함 (현재 ${s.levels.length})`);
    }
    s.levels.forEach((lv, i) => {
      if (s.kind === 'active') checkPositive(errors, `${w}.levels[${i}].cooldownSec`, lv.cooldownSec);
      for (const [k, v] of Object.entries(lv.values)) if (!isNum(v)) errors.push(`${w}.levels[${i}].${k}: 숫자여야 함`);
    });
    const a = s.awakening;
    if (a) {
      if (!d.items.items.some((x) => x.id === a.requiredItem)) errors.push(`${w}.awakening: 없는 요구 아이템 '${String(a.requiredItem)}'`);
      if (s.kind === 'active') checkPositive(errors, `${w}.awakening.cooldownSec`, a.cooldownSec);
      checkTags(v, `${w}.awakening`, a.tags);
      needText(`${w}.awakening`, a.nameKey);
      needText(`${w}.awakening`, a.descKey);
    }
    // 근접 스킬은 사거리 안 적 판정에 range 값이 필요하다
    if (s.tags.includes('melee')) {
      s.levels.forEach((lv, i) => {
        if (Object.keys(lv.values).length > 0 && !isNum(lv.values.range)) errors.push(`${w}.levels[${i}]: 근접 스킬은 range 필요`);
      });
    }
    const im = s.imprint;
    if (im) {
      needText(`${w}.imprint`, im.nameKey);
      needText(`${w}.imprint`, im.descKey);
      if (!(IMPRINT_EFFECTS as readonly string[]).includes(im.effect)) errors.push(`${w}.imprint.effect: '${String(im.effect)}' 잘못됨`);
      if (im.levels.length !== d.skills.maxLevel) errors.push(`${w}.imprint: 레벨은 ${d.skills.maxLevel}개여야 함`);
      im.levels.forEach((lv, i) => {
        if (!isNum(lv[im.effect])) errors.push(`${w}.imprint.levels[${i}].${im.effect}: 숫자 필요`);
      });
    }
    if (s.element !== undefined && !(ELEMENT_IDS as readonly string[]).includes(s.element)) errors.push(`${w}.element: '${String(s.element)}' 잘못됨`);
    for (const [k, sp] of Object.entries(s.sprites)) checkSprite(errors, `${w}.sprites.${k}`, sp);
  }
}

/** 궁극기 */
export function validateUltimates(v: V): void {
  const { d, errors, needText } = v;
  const u = d.ultimates;
  checkUnique(errors, 'ultimates', u.ultimates.map((x) => x.id));
  checkPositive(errors, 'ultimates.cooldownSec', u.cooldownSec);
  for (const x of u.ultimates) {
    const w = `ultimates.${x.id}`;
    needText(w, x.nameKey);
    needText(w, x.shortKey);
    needText(w, x.descKey);
    checkTags(v, w, x.tags);
    checkSources(v, w, x.sources);
    if (x.school !== undefined && !(SCHOOL_IDS as readonly string[]).includes(x.school)) errors.push(`${w}.school: 잘못됨`);
    if (x.awakening) {
      needText(`${w}.awakening`, x.awakening.nameKey);
      needText(`${w}.awakening`, x.awakening.shortKey);
      needText(`${w}.awakening`, x.awakening.descKey);
      checkTags(v, `${w}.awakening`, x.awakening.tags);
    }
    for (const [k, sp] of Object.entries(x.sprites)) checkSprite(errors, `${w}.sprites.${k}`, sp);
  }
}

/** 직업 */
export function validateJobs(v: V): void {
  const { d, errors, needText } = v;
  const jb = d.jobs;
  const u = d.ultimates;
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
    if (!d.weapons.weapons.some((y) => y.id === x.startWeapon)) errors.push(`${w}.startWeapon: '${x.startWeapon}' 없음`);
    for (const ps of x.preSchools) if (!(SCHOOL_IDS as readonly string[]).includes(ps)) errors.push(`${w}.preSchools: '${ps}' 잘못됨`);
    if (x.imprint && (x.imprint.slot < 0 || x.imprint.slot >= d.skills.activeSlots)) errors.push(`${w}.imprint.slot: 칸 번호 범위 밖`);
    for (const m of x.masteryJudge ?? []) {
      if (d.skills.skills.find((s) => s.id === m)?.kind !== 'mastery') errors.push(`${w}.masteryJudge: '${m}'는 숙련이 아님`);
    }
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
}

/** 카드 */
export function validateCards(v: V): void {
  const { d, errors } = v;
  const c = d.cards;
  checkPositive(errors, 'cards.cardCount', c.cardCount);
  checkPositive(errors, 'cards.rerollCost', c.rerollCost, true);
  const offerKinds = ['skill', 'item'];
  if (c.afterStageCycle.length === 0) errors.push('cards.afterStageCycle: 비어 있음');
  for (const k of [c.runStart, c.bossBonus, ...c.afterStageCycle]) {
    if (!offerKinds.includes(k)) errors.push(`cards: 알 수 없는 카드 종류 '${k}'`);
  }
  for (const [k, v] of Object.entries(c.skillWeights)) checkPositive(errors, `cards.skillWeights.${k}`, v, true);
}

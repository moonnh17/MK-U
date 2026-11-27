/** 데이터 검증: 결산·실험장·미모사 제미니 */
import { GEMINI_EVENTS } from '../../types/data';
import { HEX_COLOR, checkPositive, checkUnique } from './shared';
import type { V } from './shared';

/** 결산·영구 진행 */
export function validateSettlement(v: V): void {
  const { d, errors, needText } = v;
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
}

/** 실험장 */
export function validateLab(v: V): void {
  const { d, errors, needText } = v;
  const lab = d.lab;
  checkUnique(errors, 'lab.objects', lab.objects.map((o) => o.id));
  for (const kind of ['capsule', 'jobSelect', 'portal', 'overflowPortal', 'codex', 'archive', 'gemini', 'window'] as const) {
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
}

/** 미모사 제미니 대사 */
export function validateGemini(v: V): void {
  const { d, errors, needText } = v;
  const gm = d.gemini;
  checkPositive(errors, 'gemini.mini.showSec', gm.mini.showSec);
  checkPositive(errors, 'gemini.mini.fadeSec', gm.mini.fadeSec, true);
  checkPositive(errors, 'gemini.mini.perCharSec', gm.mini.perCharSec, true);
  checkPositive(errors, 'gemini.typeCharSec', gm.typeCharSec);
  if (!HEX_COLOR.test(gm.color)) errors.push('gemini.color: #RRGGBB');
  checkUnique(errors, 'gemini', [...gm.stories, ...gm.minis].map((x) => x.id));
  const events: readonly string[] = GEMINI_EVENTS;
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
    if (m.once && !m.record) errors.push(`${w}.once: record가 있어야 한 번만 띄울 수 있음`);
    checkPositive(errors, `${w}.priority`, m.priority);
    if (m.candidates.length === 0 || m.candidates.some((c) => c.length === 0)) errors.push(`${w}.candidates: 빈 후보`);
    needText(w, m.nameKey);
    for (const c of m.candidates) for (const k of c) needText(w, k);
  }
}

/** 오버플로우: 테마 장·웨이브, 보스 풀·고정 칸, 임시 보스, 배율 표 */
export function validateOverflow(v: V): void {
  const { d, errors, needText } = v;
  const O = d.overflow;
  const fixed = O.fixedChapters;
  if (!(fixed >= 1 && fixed <= d.mapgen.chapters)) errors.push('overflow.fixedChapters: 1~본편 장 수');
  checkUnique(errors, 'overflow.themes', O.themes.map((t) => t.id));
  if (O.themes.length < 2) errors.push('overflow.themes: 직전 장 제외가 되려면 2개 이상');
  for (const t of O.themes) {
    if (!(t.chapter >= 1 && t.chapter <= fixed)) errors.push(`overflow.themes.${t.id}.chapter: 1~${fixed}`);
    if (t.waveChapters.length === 0) errors.push(`overflow.themes.${t.id}.waveChapters: 비어 있음`);
    for (const c of t.waveChapters) if (!d.waves.waves.some((w) => w.chapter === c)) errors.push(`overflow.themes.${t.id}: ${c}장 웨이브 없음`);
    checkPositive(errors, `overflow.themes.${t.id}.weight`, t.weight);
    if (t.tint !== undefined && !HEX_COLOR.test(t.tint)) errors.push(`overflow.themes.${t.id}.tint: #RRGGBB`);
  }
  const bossIds = new Set(d.bosses.bosses.map((b) => b.id));
  // 헥타르·아크로 미모사는 bosses.json 대신 overflow.mimosa / overflow.acro로 싸운다
  const known = (id: string) => bossIds.has(id) || O.placeholderBosses[id] !== undefined || id === O.mimosa.enemyId || id === O.acro.enemyId;
  // 아크로 미모사
  const A = O.acro;
  if (!d.enemies.enemies.some((e) => e.id === A.enemyId)) errors.push(`overflow.acro.enemyId: 없는 적 '${A.enemyId}'`);
  for (const p of A.patterns) if (p.phases.length === 0 || p.durationSec <= 0) errors.push(`overflow.acro.patterns.${p.id}: phases·durationSec`);
  for (let ph = 1; ph <= A.phases.length + 1; ph++) if (!A.patterns.some((p) => p.phases.includes(ph))) errors.push(`overflow.acro: ${ph}페이즈 패턴 없음`);
  for (const id of A.summon.excludeBosses) if (!bossIds.has(id)) errors.push(`overflow.acro.summon.excludeBosses: 모르는 보스 '${id}'`);
  for (const c of A.summon.themeChapters) if (!d.bosses.bosses.some((b) => b.chapter === c && !A.summon.excludeBosses.includes(b.id))) errors.push(`overflow.acro.summon.themeChapters: ${c}장에 부를 보스 없음`);
  if (!(A.clash.hops >= 2 && A.clash.endGapSec > 0 && A.clash.endGapSec <= A.clash.startGapSec)) errors.push('overflow.acro.clash: hops 2 이상, 0 < endGapSec ≤ startGapSec');
  for (const [stage, pool] of Object.entries(O.bossPools)) {
    if (!d.mapgen.bossStages.includes(Number(stage))) errors.push(`overflow.bossPools.${stage}: 보스 스테이지가 아님`);
    if (pool.length === 0) errors.push(`overflow.bossPools.${stage}: 비어 있음`);
    for (const id of pool) if (!bossIds.has(id)) errors.push(`overflow.bossPools.${stage}: 모르는 보스 '${id}'`);
  }
  for (const s of d.mapgen.bossStages) if (!O.bossPools[String(s)]) errors.push(`overflow.bossPools: ${s} 스테이지 풀 없음`);
  for (const [i, f] of O.fixedBosses.entries()) {
    if ((f.chapter === undefined) === (f.everyChapters === undefined)) errors.push(`overflow.fixedBosses[${i}]: chapter와 everyChapters 중 하나만`);
    if (!d.mapgen.bossStages.includes(f.stage)) errors.push(`overflow.fixedBosses[${i}].stage: 보스 스테이지가 아님`);
    if (f.boss !== '@theme' && !known(f.boss)) errors.push(`overflow.fixedBosses[${i}]: 모르는 보스 '${f.boss}'`);
  }
  for (const [id, to] of Object.entries(O.placeholderBosses)) if (!bossIds.has(to)) errors.push(`overflow.placeholderBosses.${id}: 모르는 보스 '${to}'`);
  for (const [id, key] of Object.entries(O.bossNameKeys)) {
    if (!known(id)) errors.push(`overflow.bossNameKeys: 모르는 보스 '${id}'`);
    needText(`overflow.bossNameKeys.${id}`, key);
  }
  for (let c = 1; c <= fixed; c++) if (!O.scale.tierToChapter3[String(c)]) errors.push(`overflow.scale.tierToChapter3: ${c}장 없음`);
  for (const id of bossIds) if (id !== d.mapgen.bossPlaceholderEnemy && !(O.scale.bossDamageTier[id]! > 0)) errors.push(`overflow.scale.bossDamageTier: '${id}' 없음`);
  checkPositive(errors, 'overflow.scale.growthPerChapter.hp', O.scale.growthPerChapter.hp, true);
  checkPositive(errors, 'overflow.scale.growthPerChapter.damage', O.scale.growthPerChapter.damage, true);
  if (!(O.themeTintAlpha >= 0 && O.themeTintAlpha <= 1)) errors.push('overflow.themeTintAlpha: 0~1');
  if (!HEX_COLOR.test(O.portalColor)) errors.push('overflow.portalColor: #RRGGBB');
  // 적 진화
  const E = O.evolution;
  const enemyIds = new Set(v.enemyIds);
  checkUnique(errors, 'overflow.evolution', [...E.evolutions.map((e) => e.id), ...E.uniques.map((u) => u.id), E.overloadCard.id]);
  for (const g of ['common', 'rare', 'legendary', 'unique'] as const) {
    checkPositive(errors, `overflow.evolution.gradeWeights.${g}`, E.gradeWeights[g]);
    if (E.rewards[g].length === 0) errors.push(`overflow.evolution.rewards.${g}: 비어 있음`);
  }
  for (const e of [...E.evolutions, ...E.uniques, E.overloadCard]) {
    needText(`overflow.evolution.${e.id}`, `evo.${e.id}.name`);
    needText(`overflow.evolution.${e.id}`, `evo.${e.id}.desc`);
  }
  for (const e of E.evolutions) {
    if (e.effects.explodeDamage && !e.explode) errors.push(`overflow.evolution.${e.id}: explode 정의 없음`);
    if (e.effects.splitChance && !e.split) errors.push(`overflow.evolution.${e.id}: split 정의 없음`);
    if (e.effects.predatorMul && !e.predator) errors.push(`overflow.evolution.${e.id}: predator 정의 없음`);
    if (e.effects.overloadMul && !e.overload) errors.push(`overflow.evolution.${e.id}: overload 정의 없음`);
  }
  for (const u of E.uniques) {
    if (!enemyIds.has(u.enemy)) errors.push(`overflow.evolution.uniques.${u.id}: 모르는 적 '${u.enemy}'`);
    if (!enemyIds.has(u.base)) errors.push(`overflow.evolution.uniques.${u.id}: 모르는 적 '${u.base}'`);
  }
  for (const id of E.commonExempt) if (!enemyIds.has(id)) errors.push(`overflow.evolution.commonExempt: 모르는 적 '${id}'`);
  const rewardIds: string[] = [];
  for (const list of Object.values(E.rewards)) {
    for (const r of list) {
      rewardIds.push(r.id);
      needText(`overflow.evolution.rewards.${r.id}`, `evoReward.${r.id}`);
      if ('weights' in r && (r.weights.mythic ?? 0) > 0) errors.push(`overflow.evolution.rewards.${r.id}: 카드 보상에 신화 없음`);
      if (r.kind === 'weaponChest' && !(r.tier in d.loot.weaponChestTiers)) errors.push(`overflow.evolution.rewards.${r.id}: 모르는 상자 '${r.tier}'`);
    }
  }
  checkUnique(errors, 'overflow.evolution.rewards', rewardIds);
  if (!(E.maxStacks >= 1) || !(E.cardCount >= 1)) errors.push('overflow.evolution: maxStacks·cardCount 1 이상');
  if (!(E.uniqueSpawnChance >= 0 && E.uniqueSpawnChance <= 1)) errors.push('overflow.evolution.uniqueSpawnChance: 0~1');
  for (const [k, n] of Object.entries(E.caps)) checkPositive(errors, `overflow.evolution.caps.${k}`, n);
}

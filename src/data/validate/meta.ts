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

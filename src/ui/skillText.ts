import type { SkillDef } from '../types/data';
/**
 * 스킬·궁극기 설명 문구에 넣을 값: 그대로({key}, 소수 둘째 자리까지)와 백분율({keyPct}, 0.35 → 35).
 * 카드·가방·도감·컷씬이 함께 쓴다.
 */
/** 개전 각인 한 줄: 「작열」 화염 피해 +25% (직접 피해만). level 0이면 Lv1 수치. resonance면 공명 배율 반영. awakened면 각성 확장 한 줄을 붙인다 */
export function imprintText(def: SkillDef, level: number, t: (key: string, vars?: Record<string, string | number>) => string, mul = 1, awakened = false): string | null {
  const im = def.imprint;
  if (!im) return null;
  const lv = im.levels[Math.min(im.levels.length, Math.max(1, level)) - 1]!;
  const values: Record<string, number> = { ...im.fixed };
  for (const [k, v] of Object.entries(lv)) values[k] = v * mul;
  const base = `${t('imprint.label')} 「${t(im.nameKey)}」 ${t(im.descKey, skillTextValues(values))}`;
  if (!awakened || !im.awakened) return base;
  return `${base} · ${t(im.awakened.descKey, skillTextValues({ ...values, ...im.awakened.values }))}`;
}

export function skillTextValues(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = String(Math.round(v * 100) / 100);
    out[`${k}Pct`] = String(Math.round(v * 1000) / 10);
  }
  return out;
}

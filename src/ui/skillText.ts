/**
 * 스킬·궁극기 설명 문구에 넣을 값: 그대로({key}, 소수 둘째 자리까지)와 백분율({keyPct}, 0.35 → 35).
 * 카드·가방·도감·컷씬이 함께 쓴다.
 */
export function skillTextValues(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) {
    out[k] = String(Math.round(v * 100) / 100);
    out[`${k}Pct`] = String(Math.round(v * 1000) / 10);
  }
  return out;
}

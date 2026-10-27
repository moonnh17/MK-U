/**
 * 히든보스 (순수 함수): 누구를 부를지, 조우 판정에 넣을지, 챕터 배율.
 * 한 런에서 이미 나온 히든보스는 다시 나오지 않는다. 셋 다 나왔으면 조우 판정에서 빠진다.
 */
import type { Rng } from '../core/rng';
import type { BossesData, EncounterKindId, HiddenBossDef } from '../types/data';

/** 아직 안 나온 히든보스 중 하나 (없으면 null) */
export function pickHiddenBoss(rng: Rng, defs: readonly HiddenBossDef[], met: readonly string[]): HiddenBossDef | null {
  const left = defs.filter((d) => !met.includes(d.id));
  return left.length > 0 ? rng.pick(left) : null;
}

/** 조우 판정에 쓸 유형: 히든보스가 다 나왔으면 뺀다 */
export function encounterKinds(
  implemented: ReadonlySet<EncounterKindId>,
  defs: readonly HiddenBossDef[],
  met: readonly string[],
): ReadonlySet<EncounterKindId> {
  if (defs.some((d) => !met.includes(d.id))) return implemented;
  const out = new Set(implemented);
  out.delete('hiddenBoss');
  return out;
}

/** 체력·피해 배율 (표에 없는 챕터는 가장 가까운 아래 챕터) */
export function hiddenChapterMul(data: Pick<BossesData, 'hiddenChapterMul'>, chapter: number): number {
  for (let c = chapter; c >= 1; c--) {
    const v = data.hiddenChapterMul[String(c)];
    if (v !== undefined) return v;
  }
  return 1;
}

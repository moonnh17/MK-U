/**
 * 캐릭터 정보창의 스탯 효과 줄 (순수 함수): 스탯 하나가 지금 무엇을 얼마나 올려 주는지.
 * 수치는 stats.json effects와 tags.json의 linearStat 규칙에서 계산한다.
 */
import type { SanityConfig, StatId, StatsData, TagsData } from '../types/data';
import { sanityMaxFor } from './sanity';
import { statEffect } from './stats';
import type { Stats } from './damage';

export interface SheetLine {
  /** ko.json 문구 키 (값은 {v}) */
  key: string;
  value: number;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export function statSheetLines(id: StatId, stats: Stats, sd: StatsData, tags: TagsData, sanity: SanityConfig): SheetLine[] {
  const out: SheetLine[] = [];
  for (const [effect, rule] of Object.entries(sd.effects)) {
    if (rule.stat !== id) continue;
    const v = statEffect(effect as keyof StatsData['effects'], stats, sd);
    out.push({ key: `sheet.effect.${effect}`, value: effect === 'maxHp' ? round1(v) : round1(v * 100) });
  }
  for (const t of tags.tags) {
    if (t.rule.kind !== 'linearStat' || t.rule.stat !== id) continue;
    const v = Math.min(t.rule.cap, Math.max(0, (stats[id] - t.rule.pivot) * t.rule.perPoint));
    out.push({ key: `sheet.tag.${t.id}`, value: round1(v * 100) });
  }
  if (id === 'willpower') out.push({ key: 'sheet.sanityMax', value: round1(sanityMaxFor(stats[id], sanity)) });
  return out;
}

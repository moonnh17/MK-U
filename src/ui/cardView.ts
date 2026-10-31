/** 카드 한 장을 화면에 그릴 문구·배지로 바꾼다 (카드 선택창과 테스트에서 쓴다). */
import type { GameContext } from '../core/context';
import type { PlayerState } from '../core/session';
import type { AnyCard } from '../systems/cards';
import { findSkill, skillValues } from '../systems/skills';
import { skillTags, tagBadges, type TagBadge } from '../systems/tags';
import { itemDescParams } from './itemCard';
import { artKeys } from '../systems/art';

export interface CardView {
  /** 신규 · 액티브 / Lv1 → Lv2 / 각성 / 스탯 */
  kindLabel: string;
  name: string;
  /** 각성 카드: 원래 스킬 이름 */
  subName: string;
  levelText: string;
  desc: string;
  badges: TagBadge[];
  /** 테두리 강조 색 */
  accent: string;
  /** 계열 (스탯 카드는 빈 문자열) */
  school: string;
  /** 아이콘: 아이템은 그림이 없으면 색 사각형, 스킬(artOnly)은 그림이 있을 때만 */
  icon?: { color: string; key: string; artOnly?: boolean };
}

/** 숫자 수치를 설명 문구에 넣을 때 소수점 정리 */
function fmtValues(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) out[k] = String(Math.round(v * 100) / 100);
  return out;
}

export function describeCard(card: AnyCard, player: PlayerState, ctx: GameContext): CardView {
  const t = ctx.t;
  const d = ctx.data;
  if (card.kind === 'school') {
    // 전직 동점: 학파 이름·색, 학파 궁극기, 사라질 반대 학파 스킬 수
    const job = d.jobs.jobs.find((j) => j.id === player.job)!;
    const adv = job.advancements.find((a) => a.id === card.school)!;
    const ult = d.ultimates.ultimates.find((u) => u.id === adv.ultimate);
    const others = new Set(job.advancements.map((a) => a.id).filter((id) => id !== card.school));
    const lose = Object.keys(player.loadout.owned).filter((id) => others.has(findSkill(d.skills, id).school)).length;
    return {
      kindLabel: t('card.school'),
      name: t(adv.nameKey),
      subName: '',
      levelText: t('card.schoolPicks', { n: player.schoolPicks[card.school] }),
      desc: t('card.schoolDesc', { ult: ult ? t(ult.nameKey) : '', n: lose }),
      badges: [],
      accent: adv.color,
      school: '',
      icon: ult ? { color: adv.color, key: artKeys.ultimateIcon(ult.id), artOnly: true } : undefined,
    };
  }
  if (card.kind === 'item') {
    const def = d.items.items.find((x) => x.id === card.itemId)!;
    const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
    return {
      kindLabel: t('card.item'),
      name: t(def.nameKey),
      subName: '',
      levelText: grade ? t(grade.nameKey) : '',
      desc: t(def.descKey, itemDescParams(def, d.groupMultipliers)),
      badges: tagBadges(def.tags, d.tags),
      accent: grade?.color ?? '#ffffff',
      school: '',
      icon: { color: def.color, key: def.spriteKey },
    };
  }
  if (card.kind === 'stat') {
    const grade = d.cards.statGrades.find((g) => g.id === card.grade);
    const now = player.stats[card.stat];
    return {
      kindLabel: t('card.title.stat'),
      name: t('card.statAmount', { stat: t(`stat.${card.stat}`), amount: card.amount }),
      subName: '',
      levelText: t('card.statNow', { value: now, next: now + card.amount }),
      desc: t(`stat.${card.stat}.desc`),
      badges: [],
      accent: grade?.color ?? '#ffffff',
      school: '',
      icon: { color: grade?.color ?? '#ffffff', key: artKeys.statIcon(card.stat), artOnly: true },
    };
  }

  const def = findSkill(d.skills, card.skillId);
  const owned = player.loadout.owned[def.id];
  const sb = d.ui.hud.skillbar;
  const slotKind = t(def.kind === 'passive' ? 'card.passive' : 'card.active');
  const school = t(`school.${def.school}`);
  if (card.kind === 'awakening') {
    const v = skillValues(def, { level: d.skills.maxLevel, awakened: true });
    return {
      kindLabel: `${t('card.awakening')} · ${slotKind}`,
      name: t(def.awakening.nameKey),
      subName: t(def.nameKey),
      levelText: t('inventory.requirement', {
        stat: t(`stat.${def.awakening.requiredStat}`),
        value: player.stats[def.awakening.requiredStat],
        need: def.awakening.requiredValue,
      }),
      desc: t(def.awakening.descKey, fmtValues(v.values)),
      badges: tagBadges(skillTags(def, true), d.tags),
      accent: sb.awakenedColor,
      school,
      icon: { color: def.color, key: artKeys.skillIcon(def.id), artOnly: true },
    };
  }
  const from = owned?.level ?? 0;
  const to = from + 1;
  const v = skillValues(def, { level: to, awakened: false });
  return {
    kindLabel: card.kind === 'skillNew' ? `${t('card.new')} · ${slotKind}` : slotKind,
    name: t(def.nameKey),
    subName: '',
    levelText: card.kind === 'skillNew' ? `Lv${to}` : t('card.levelUp', { from, to }),
    desc: t(def.descKey, fmtValues(v.values)),
    badges: tagBadges(skillTags(def, false), d.tags),
    accent: sb.levelColors[to - 1] ?? '#ffffff',
    school,
    icon: { color: def.color, key: artKeys.skillIcon(def.id), artOnly: true },
  };
}

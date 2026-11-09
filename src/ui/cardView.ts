/** 카드 한 장을 화면에 그릴 문구·배지로 바꾼다 (카드 선택창과 테스트에서 쓴다). */
import type { GameContext } from '../core/context';
import { skillTextValues } from './skillText';
import type { PlayerState } from '../core/session';
import type { AnyCard } from '../systems/cards';
import { findSkill, skillValues } from '../systems/skills';
import { skillTags, tagBadges, type TagBadge } from '../systems/tags';
import { itemDescText } from './itemCard';
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
      levelText: t('card.schoolPicks', { n: player.schoolPicks[card.school] ?? 0 }),
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
      desc: itemDescText(def, d.groupMultipliers, t),
      badges: tagBadges(def.tags, d.tags),
      accent: grade?.color ?? '#ffffff',
      school: '',
      icon: { color: def.color, key: def.spriteKey },
    };
  }
  const def = findSkill(d.skills, card.skillId);
  const owned = player.loadout.owned[def.id];
  const sb = d.ui.hud.skillbar;
  const slotKind = t(`card.${def.kind}`);
  const school = t(`school.${def.school}`);
  const from = owned?.level ?? 0;
  const to = from + 1;
  const v = skillValues(def, { level: to, awakened: false });
  return {
    kindLabel: card.kind === 'skillNew' ? `${t('card.new')} · ${slotKind}` : slotKind,
    name: t(def.nameKey),
    subName: '',
    levelText: card.kind === 'skillNew' ? `Lv${to}` : t('card.levelUp', { from, to }),
    desc: t(def.descKey, skillTextValues(v.values)),
    badges: tagBadges(skillTags(def, false), d.tags),
    accent: sb.levelColors[to - 1] ?? '#ffffff',
    school,
    icon: { color: def.color, key: artKeys.skillIcon(def.id), artOnly: true },
  };
}

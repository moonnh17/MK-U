/**
 * 각성·궁극기 각성·전직 연출의 내용(컷인 종류 + 설명창 페이지)을 만든다.
 * 그리는 것은 cutsceneWindow.ts. 학파 엠블럼·실루엣은 지금 색 도형으로 대신한다.
 */
import { artKeys } from '../systems/art';
import type { GameContext } from '../core/context';
import type { ConversionLog } from '../systems/advancement';
import { findSkill, skillValues } from '../systems/skills';
import type { AdvancementDef, SchoolId, UltimateDef } from '../types/data';

export interface CutIcon {
  label: string;
  color: string;
  /** 아이콘 그림 키 (그림이 있으면 글자 대신) */
  key?: string;
}

export type CutIn =
  | { kind: 'skillAwakening'; icon: CutIcon; flash: string }
  | { kind: 'ultimateAwakening'; from: CutIcon[]; to: CutIcon; flash: string }
  | { kind: 'advancement'; flash: string; emblem: CutIcon; broken: CutIcon[]; gains: (CutIcon & { plus: number })[]; actorFrom: string; actorTo: string };

/** 컷씬 하나: id(현재의 기억 등록) + 컷인 + 설명창 */
export interface Cutscene {
  id: string;
  cut: CutIn;
  pages: CutPage[];
}

export interface CutPage {
  title: string;
  lines: string[];
  accent: string;
}

function fmt(values: Record<string, number>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(values)) out[k] = String(Math.round(v * 100) / 100);
  return out;
}

/** 학파 색 (전직 데이터) */
export function schoolColor(ctx: GameContext, school: SchoolId): string {
  for (const j of ctx.data.jobs.jobs) for (const a of j.advancements) if (a.id === school) return a.color;
  return '#ffffff';
}

export function skillAwakeningCut(ctx: GameContext, skillId: string, stats: Record<string, number>): Cutscene {
  const t = ctx.t;
  const d = ctx.data;
  const def = findSkill(d.skills, skillId);
  const color = schoolColor(ctx, def.school);
  const before = skillValues(def, { level: d.skills.maxLevel, awakened: false });
  const after = skillValues(def, { level: d.skills.maxLevel, awakened: true });
  const a = def.awakening;
  return {
    id: `skill.${skillId}`,
    cut: { kind: 'skillAwakening', icon: { label: t(def.shortKey), color: def.color, key: artKeys.skillIcon(def.id) }, flash: color },
    pages: [
      {
        title: `${t('cut.skillAwakening')} — ${t(def.nameKey)} → ${t(a.nameKey)}`,
        lines: [
          `${t('cut.before')}: ${t(def.descKey, fmt(before.values))}`,
          `${t('cut.after')}: ${t(a.descKey, fmt(after.values))}`,
          t('cut.condition', { stat: t(`stat.${a.requiredStat}`), value: stats[a.requiredStat] ?? 0, need: a.requiredValue }),
        ],
        accent: color,
      },
    ],
  };
}

export function ultimateAwakeningCut(ctx: GameContext, ult: UltimateDef, awakenedSkills: string[], need: number): Cutscene {
  const t = ctx.t;
  const a = ult.awakening!;
  const icons = awakenedSkills.slice(0, need).map((id) => {
    const def = findSkill(ctx.data.skills, id);
    return { label: t(def.shortKey), color: def.color, key: artKeys.skillIcon(def.id) };
  });
  const values = fmt({ ...ult.values, ...a.values });
  return {
    id: `ultimate.${ult.id}`,
    cut: { kind: 'ultimateAwakening', from: icons, to: { label: t(a.shortKey), color: ult.color, key: artKeys.ultimateIcon(ult.id) }, flash: ult.color },
    pages: [
      {
        title: `${t('cut.ultimateAwakening')} — ${t(ult.nameKey)} → ${t(a.nameKey)}`,
        lines: [t(a.descKey, values), t('cut.ultimateCount', { count: Math.min(awakenedSkills.length, need), need })],
        accent: ult.color,
      },
    ],
  };
}

/** 변환 기록 → 문장 (설명창 2장·인벤토리 기록) */
export function conversionLines(log: ConversionLog, ctx: GameContext): string[] {
  const t = ctx.t;
  const name = (id: string) => t(findSkill(ctx.data.skills, id).nameKey);
  const lines = [
    ...log.removed.map((r) => t('cut.conversion.removed', { skill: name(r.skillId), level: r.level })),
    ...log.gains.map((g) => t('cut.conversion.gain', { skill: name(g.skillId), level: g.level })),
    ...log.stats.map((s) => t('cut.conversion.stat', { stat: t(`stat.${s.stat}`), amount: s.amount })),
  ];
  return lines.length > 0 ? lines : [t('cut.conversion.none')];
}

export function advancementCut(
  ctx: GameContext,
  args: {
    jobNameKey: string;
    adv: AdvancementDef;
    picks: Record<SchoolId, number>;
    fromUlt: UltimateDef;
    toUlt: UltimateDef;
    log: ConversionLog;
  },
): Cutscene {
  const t = ctx.t;
  const { adv, log } = args;
  const icon = (id: string) => {
    const def = findSkill(ctx.data.skills, id);
    return { label: t(def.shortKey), color: def.color, key: artKeys.skillIcon(def.id) };
  };
  const plus = new Map<string, number>();
  for (const g of log.gains) plus.set(g.skillId, (plus.get(g.skillId) ?? 0) + 1);
  const advName = t(adv.nameKey);
  return {
    id: `advancement.${args.adv.id}`,
    cut: {
      kind: 'advancement',
      flash: adv.color,
      emblem: { label: advName, color: adv.color },
      broken: log.removed.map((r) => icon(r.skillId)),
      gains: [...plus].map(([id, n]) => ({ ...icon(id), plus: n })),
      actorFrom: ctx.data.player.spriteKey,
      actorTo: artKeys.playerSchool(adv.id),
    },
    pages: [
      {
        title: `${t('cut.advancement')} — ${t('cut.advancement.title', { job: t(args.jobNameKey), adv: advName })}`,
        lines: [
          t('cut.advancement.judge', { hectar: args.picks.hectar, acro: args.picks.acro }),
          t('cut.advancement.ultimate', { from: t(args.fromUlt.nameKey), to: t(args.toUlt.nameKey) }),
        ],
        accent: adv.color,
      },
      { title: t('cut.conversion'), lines: conversionLines(log, ctx), accent: adv.color },
      { title: advName, lines: [t('cut.advancement.only', { adv: advName })], accent: adv.color },
    ],
  };
}

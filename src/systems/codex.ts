/**
 * 도감 (순수 함수): 몬스터·캐릭터·아이템 목록을 묶음으로 나누고, 처음 만난 것을 저장에 기록한다.
 * 만나지 않은 칸은 실루엣과 ???로만 보인다. 캐릭터는 직업이 열려 있으면 처음부터 보인다.
 */
import type { GameData } from '../data/index';
import type { SaveData } from '../core/save';
import type { GradeId } from '../types/data';

export type CodexKind = 'enemies' | 'items' | 'weapons';
export type CodexTab = 'monsters' | 'characters' | 'items' | 'weapons';

export interface CodexEntry {
  kind: 'enemy' | 'job' | 'school' | 'item' | 'weapon';
  id: string;
  /** 저장에서 찾을 기록 (없으면 항상 보인다) */
  record?: CodexKind;
}

export interface CodexSection {
  /** ko.json 묶음 이름 키 */
  titleKey: string;
  entries: CodexEntry[];
  /** 등급별 묶음이면 그 등급 (아이템·무기 탭) */
  grade?: GradeId;
}

/** 처음 만났으면 기록하고 true (저장은 부른 쪽이 한다) */
export function recordCodex(save: SaveData, kind: CodexKind, id: string): boolean {
  if (save.codex[kind].includes(id)) return false;
  save.codex[kind] = [...save.codex[kind], id];
  return true;
}

export function isKnown(save: SaveData, e: CodexEntry): boolean {
  return !e.record || save.codex[e.record].includes(e.id);
}

const GRADES = ['common', 'rare', 'legendary', 'unique', 'mythic'] as const;

export function codexSections(d: GameData, tab: CodexTab): CodexSection[] {
  if (tab === 'monsters') {
    // 소환으로만 나오는 개체(분신)와 보스가 없는 방의 임시 표적은 뺀다
    const bossIds = new Set([...d.bosses.bosses, ...d.bosses.hiddenBosses].map((b) => b.id));
    const normal = (ch: number) =>
      d.enemies.enemies.filter((e) => e.chapter === ch && !bossIds.has(e.id) && !e.summon && e.rank !== 'boss' && e.rank !== 'hiddenBoss').map((e): CodexEntry => ({ kind: 'enemy', id: e.id, record: 'enemies' }));
    const chapters = [...new Set(d.enemies.enemies.map((e) => e.chapter))].sort();
    return [
      ...chapters.map((ch) => ({ titleKey: `codex.section.chapter${ch}`, entries: normal(ch) })),
      { titleKey: 'codex.section.bosses', entries: d.bosses.bosses.map((b): CodexEntry => ({ kind: 'enemy', id: b.id, record: 'enemies' })) },
      { titleKey: 'codex.section.hiddenBosses', entries: d.bosses.hiddenBosses.map((b): CodexEntry => ({ kind: 'enemy', id: b.id, record: 'enemies' })) },
    ].filter((s) => s.entries.length > 0);
  }
  if (tab === 'characters') {
    return [
      { titleKey: 'codex.section.jobs', entries: d.jobs.jobs.map((j): CodexEntry => ({ kind: 'job', id: j.id })) },
      {
        titleKey: 'codex.section.schools',
        entries: d.jobs.jobs.filter((j) => j.enabled).flatMap((j) => j.advancements.map((a): CodexEntry => ({ kind: 'school', id: a.id }))),
      },
    ];
  }
  if (tab === 'weapons') {
    // 상자·상점에서 나오는 무기는 등급별, 보스·히든보스·세트로만 얻는 무기(droppable 아님)는 따로 (아이템과 같은 짜임)
    const weapons = d.weapons.weapons.filter((w) => w.id !== d.weapons.fistWeapon);
    const entry = (w: (typeof weapons)[number]): CodexEntry => ({ kind: 'weapon', id: w.id, record: 'weapons' });
    return [
      ...GRADES.map((g) => ({ titleKey: `codex.section.weapons.${g}`, grade: g, entries: weapons.filter((w) => w.droppable && w.grade === g).map(entry) })),
      { titleKey: 'codex.section.weapons.special', entries: weapons.filter((w) => !w.droppable).map(entry) },
    ].filter((s) => s.entries.length > 0);
  }
  const items = d.items.items;
  return [
    ...GRADES.map((g) => ({ titleKey: `codex.section.items.${g}`, grade: g, entries: items.filter((x) => x.pool === 'normal' && x.grade === g).map((x): CodexEntry => ({ kind: 'item', id: x.id, record: 'items' })) })),
    { titleKey: 'codex.section.items.special', entries: items.filter((x) => x.pool !== 'normal').map((x): CodexEntry => ({ kind: 'item', id: x.id, record: 'items' })) },
  ].filter((s) => s.entries.length > 0);
}

/** 탭의 발견 수 / 전체 (캐릭터는 열린 직업 수) */
export function codexProgress(d: GameData, save: SaveData, tab: CodexTab): { known: number; total: number } {
  const all = codexSections(d, tab).flatMap((s) => s.entries);
  const known = tab === 'characters' ? all.filter((e) => e.kind !== 'job' || d.jobs.jobs.find((j) => j.id === e.id)?.enabled).length : all.filter((e) => isKnown(save, e)).length;
  return { known, total: all.length };
}

export type CodexSort = 'default' | 'number' | 'name' | 'lore';
export const CODEX_SORTS: readonly CodexSort[] = ['default', 'number', 'name', 'lore'];

/** 탭의 세계관 분류 표 (캐릭터 탭은 없음) */
export function codexLore(d: GameData, tab: CodexTab): Record<string, string[]> | null {
  if (tab === 'monsters') return d.enemies.codexLore;
  if (tab === 'items') return d.items.codexLore;
  if (tab === 'weapons') return d.weapons.codexLore;
  return null;
}

/**
 * 정렬된 목록. default: 기본 묶음 그대로 / number: 도감 번호순 한 묶음 / name: 이름순 한 묶음
 * / lore: 세계관 분류 묶음(표 순서, 표에 없는 것은 맨 끝 '분류 없음').
 * no: 칸의 도감 번호, name: 칸의 이름 (부른 쪽이 정한다)
 */
export function sortedCodexSections(d: GameData, tab: CodexTab, sort: CodexSort, no: (e: CodexEntry) => number, name: (e: CodexEntry) => string): CodexSection[] {
  const base = codexSections(d, tab);
  const lore = codexLore(d, tab);
  if (sort === 'default' || !lore) return base;
  const all = base.flatMap((s) => s.entries);
  if (sort === 'number') return [{ titleKey: 'codex.section.all', entries: [...all].sort((a, b) => no(a) - no(b)) }];
  if (sort === 'name') return [{ titleKey: 'codex.section.all', entries: [...all].sort((a, b) => name(a).localeCompare(name(b), 'ko') || no(a) - no(b)) }];
  const byNo = (a: CodexEntry, b: CodexEntry) => no(a) - no(b);
  const placed = new Set<string>();
  const out: CodexSection[] = Object.entries(lore).map(([g, ids]) => {
    const entries = all.filter((e) => ids.includes(e.id)).sort(byNo);
    for (const e of entries) placed.add(e.id);
    return { titleKey: `codex.lore.${tab}.${g}`, entries };
  });
  out.push({ titleKey: 'codex.lore.none', entries: all.filter((e) => !placed.has(e.id)).sort(byNo) });
  return out.filter((s) => s.entries.length > 0);
}

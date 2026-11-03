/**
 * 도감 (순수 함수): 몬스터·캐릭터·아이템 목록을 묶음으로 나누고, 처음 만난 것을 저장에 기록한다.
 * 만나지 않은 칸은 실루엣과 ???로만 보인다. 캐릭터는 직업이 열려 있으면 처음부터 보인다.
 */
import type { GameData } from '../data/index';
import type { SaveData } from '../core/save';

export type CodexKind = 'enemies' | 'items' | 'weapons';
export type CodexTab = 'monsters' | 'characters' | 'items';

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
  const items = d.items.items;
  const weapons = d.weapons.weapons.filter((w) => w.id !== d.weapons.fistWeapon);
  return [
    ...GRADES.map((g) => ({ titleKey: `codex.section.items.${g}`, entries: items.filter((x) => x.pool === 'normal' && x.grade === g).map((x): CodexEntry => ({ kind: 'item', id: x.id, record: 'items' })) })),
    { titleKey: 'codex.section.items.special', entries: items.filter((x) => x.pool !== 'normal').map((x): CodexEntry => ({ kind: 'item', id: x.id, record: 'items' })) },
    ...GRADES.map((g) => ({ titleKey: `codex.section.weapons.${g}`, entries: weapons.filter((w) => w.grade === g).map((w): CodexEntry => ({ kind: 'weapon', id: w.id, record: 'weapons' })) })),
  ].filter((s) => s.entries.length > 0);
}

/** 탭의 발견 수 / 전체 (캐릭터는 열린 직업 수) */
export function codexProgress(d: GameData, save: SaveData, tab: CodexTab): { known: number; total: number } {
  const all = codexSections(d, tab).flatMap((s) => s.entries);
  const known = tab === 'characters' ? all.filter((e) => e.kind !== 'job' || d.jobs.jobs.find((j) => j.id === e.id)?.enabled).length : all.filter((e) => isKnown(save, e)).length;
  return { known, total: all.length };
}

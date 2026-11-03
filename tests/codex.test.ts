import { describe, expect, it } from 'vitest';
import { defaultSave, parseSave } from '../src/core/save';
import { gameData } from '../src/data/index';
import { codexProgress, codexSections, isKnown, recordCodex } from '../src/systems/codex';

const D = gameData;

describe('도감', () => {
  it('몬스터: 챕터별 일반 적 + 보스 + 히든보스, 분신·임시 표적은 빠진다', () => {
    const ids = codexSections(D, 'monsters').flatMap((s) => s.entries.map((e) => e.id));
    expect(ids).not.toContain('royalMageClone');
    expect(ids).not.toContain('trainingDummy');
    for (const b of [...D.bosses.bosses, ...D.bosses.hiddenBosses]) expect(ids).toContain(b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it('모든 몬스터·직업·학파에 도감 설명이 있다', () => {
    for (const e of codexSections(D, 'monsters').flatMap((s) => s.entries)) expect(D.text[`codex.enemy.${e.id}`], e.id).toBeTypeOf('string');
    for (const j of D.jobs.jobs) expect(D.text[`codex.job.${j.id}`], j.id).toBeTypeOf('string');
    for (const e of codexSections(D, 'characters')[1]!.entries) expect(D.text[`codex.school.${e.id}`], e.id).toBeTypeOf('string');
    for (const s of [...codexSections(D, 'monsters'), ...codexSections(D, 'characters'), ...codexSections(D, 'items')]) expect(D.text[s.titleKey], s.titleKey).toBeTypeOf('string');
  });
  it('아이템 탭: 모든 아이템과 맨손을 뺀 모든 무기', () => {
    const entries = codexSections(D, 'items').flatMap((s) => s.entries);
    expect(entries.filter((e) => e.kind === 'item')).toHaveLength(D.items.items.length);
    expect(entries.filter((e) => e.kind === 'weapon')).toHaveLength(D.weapons.weapons.length - 1);
  });
  it('처음 만난 것만 기록하고, 기록한 것만 보인다', () => {
    const s = defaultSave();
    const e = { kind: 'enemy' as const, id: 'akgwi', record: 'enemies' as const };
    expect(isKnown(s, e)).toBe(false);
    expect(recordCodex(s, 'enemies', 'akgwi')).toBe(true);
    expect(recordCodex(s, 'enemies', 'akgwi')).toBe(false);
    expect(isKnown(s, e)).toBe(true);
    expect(codexProgress(D, s, 'monsters').known).toBe(1);
  });
  it('캐릭터는 열린 직업과 그 전직이 처음부터 보인다', () => {
    const p = codexProgress(D, defaultSave(), 'characters');
    expect(p.known).toBe(p.total - D.jobs.jobs.filter((j) => !j.enabled).length);
  });
  it('저장: 도감 기록을 읽고, 이상한 값은 버린다', () => {
    const s = parseSave(JSON.stringify({ version: 1, codex: { enemies: ['akgwi', 3], items: 'x', weapons: ['pistol'] } }));
    expect(s.codex).toEqual({ enemies: ['akgwi'], items: [], weapons: ['pistol'] });
    expect(parseSave(JSON.stringify({ version: 1 })).codex).toEqual({ enemies: [], items: [], weapons: [] });
  });
});

import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { geminiSlots, hasLines, instanceKey, markedSegments, MiniQueue, pickMini, plainLength, saidKeys, storyFor, storyLines, type MiniLine } from '../src/systems/gemini';

const G = gameData.gemini;
const T = gameData.text;

describe('제미니 대사 데이터', () => {
  it('사용자 대사 그대로 (맞춤법만), 미공개 대사는 빈 자리', () => {
    expect(T['gemini.story.firstRun.1']).toBe('아, 됐다. 이제 들리지?');
    expect(T['gemini.story.firstRun.1.speaker']).toBe('??');
    expect(T['gemini.story.ending.12']).toBe('다음에 만나면 재밌는 거 보여 줄게.');
    expect(T['gemini.mini.advancement.3']).toContain('**조합하면 능력을 각성시킬 수 있을 거야.**');
    for (const k of ['gemini.mini.chapterEnd2.1', 'gemini.mini.hiddenBoss.1']) expect(T[k]).toBe('');
  });
  it('스토리 대화: 첫 실행 11줄, 엔딩은 마지막 챕터 결산 뒤 12줄. 보스 처치는 스토리 대화 없음', () => {
    expect(storyFor(G, 'firstRun')?.lines).toHaveLength(11);
    expect(storyFor(G, 'runClear')?.id).toBe('ending');
    expect(storyFor(G, 'runClear')?.lines).toHaveLength(12);
    expect(storyFor(G, 'bossKill', 'eclipse')).toBeUndefined();
    expect(storyFor(G, 'bossKill', 'magiKaiser')).toBeUndefined();
  });
  it('데이터 검증 통과 (제미니 대사만 빈 값 허용)', () => {
    expect(validateGameData(gameData)).toEqual([]);
    expect(validateGameData({ ...gameData, text: { ...T, 'card.title.skill': '' } }).some((e) => e.includes('card.title.skill'))).toBe(true);
  });
  it('화자: <키>.speaker가 있으면 그 이름, 없으면 기본', () => {
    expect(storyLines(['gemini.story.firstRun.1', 'gemini.story.firstRun.2'], T, 'MG').map((l) => l.speaker)).toEqual(['??', 'MG']);
  });
  it('**…** 강조: 구간 나누기와 보이는 글자 수', () => {
    expect(markedSegments('참, **기술 피해**야')).toEqual([
      { text: '참, ', hl: false },
      { text: '기술 피해', hl: true },
      { text: '야', hl: false },
    ]);
    expect(plainLength('참, **기술 피해**야')).toBe(9);
  });
});

describe('미니 대사 고르기', () => {
  const pick = (event: Parameters<typeof pickMini>[1], arg?: string, said = new Set<string>(), seed = 1, remembered = new Set<string>()) =>
    pickMini(G, event, arg, said, new Rng(seed), T, remembered);

  it('시작 직업·전직마다 그 대사', () => {
    expect(pick('runStart', 'magiScholar')?.lines[0]).toBe('gemini.mini.runStartMagiScholar.1');
    expect(pick('runStart', 'warrior')?.lines[0]).toBe('gemini.mini.runStartWarrior.1');
    expect(pick('runStart', 'magiMage')).toBeNull();
    for (const [adv, id] of [['hectar', 'Hectar'], ['acro', 'Acro'], ['barbarian', 'Barbarian'], ['paladin', 'Paladin']] as const) {
      expect(pick('advancement', adv)?.lines).toEqual([`gemini.mini.advancement${id}.1`, 'gemini.mini.advancement.2', 'gemini.mini.advancement.3', 'gemini.mini.advancement.4']);
    }
  });
  it('보스 처치: 정해진 보스는 그 대사, 나머지는 기본 후보, 마기카이저는 없음', () => {
    expect(pick('bossKill', 'fusionAkgwi')?.def.id).toBe('killFusionAkgwi');
    expect(pick('bossKill', 'electricRing')?.def.id).toBe('killElectricRing');
    expect(pick('bossKill', 'magiGolem')?.def.id).toBe('killMagiGolem');
    expect(pick('bossKill', 'eclipse')?.def.id).toBe('killEclipse');
    expect(pick('bossKill', 'hectarChief')?.def.id).toBe('bossKill');
  });
  it('첫 처치·첫 조우 대사는 저장에 남으면 다시 띄우지 않는다 (기본 후보로 넘어가지도 않음)', () => {
    const seen = new Set(['gemini.killFusionAkgwi', 'gemini.metExecutor', 'gemini.metMagiKaiser']);
    expect(pick('bossKill', 'fusionAkgwi', new Set(), 1, seen)).toBeNull();
    expect(pick('championMet', 'executor', new Set(), 1, seen)).toBeNull();
    expect(pick('bossMet', 'magiKaiser', new Set(), 1, seen)).toBeNull();
    expect(pick('bossMet', 'hectarChief', new Set(), 1, seen)?.def.id).toBe('metHectarChief');
    // 시작·전직 대사는 매번
    expect(pick('runStart', 'warrior', new Set(), 1, new Set(['gemini.runStartWarrior']))).not.toBeNull();
  });
  it('조우: 집행자·헥타르 수석 연구원·마기카이저만, 집정관은 대사 없음', () => {
    expect(pick('championMet', 'executor')?.lines).toHaveLength(4);
    expect(pick('championMet', 'archon')).toBeNull();
    expect(pick('bossMet', 'hectarChief')?.lines).toHaveLength(3);
    expect(pick('bossMet', 'magiKaiser')?.lines).toHaveLength(5);
    expect(pick('bossMet', 'fusionAkgwi')).toBeNull();
  });
  it('같은 런에서 같은 이벤트는 한 번', () => {
    const said = new Set<string>();
    const a = pick('bossKill', 'hectarChief', said)!;
    for (const k of saidKeys('bossKill', 'hectarChief', a)) said.add(k);
    expect(pick('bossKill', 'hectarChief', said)).toBeNull();
    expect(pick('championMet', 'executor', new Set([instanceKey('championMet', 'executor')]))).toBeNull();
  });
  it('내용이 빈 대사는 띄우지 않는다 (2장 종료·히든보스 등장)', () => {
    expect(pick('chapterEnd', '2')).toBeNull();
    expect(pick('chapterEnd', '1')).toBeNull();
    expect(pick('hiddenBoss', 'royalMage')).toBeNull();
    expect(hasLines(['a'], { a: '  ' })).toBe(false);
    expect(hasLines(['a', 'b'], { a: 'x', b: 'y' })).toBe(true);
    expect(hasLines([], {})).toBe(false);
  });
});

describe('미니 대사 순서', () => {
  const L = (text: string): MiniLine => ({ text, mood: 'calm' });
  const run = (q: MiniQueue, sec: number) => {
    const out: (string | null)[] = [];
    for (let t = 0; t < sec; t += 0.1) {
      const r = q.update(0.1);
      if (r) out.push(r.line?.text ?? null);
    }
    return out;
  };
  it('한 문장씩 showSec 동안, 사이에 페이드로 비운다', () => {
    const q = new MiniQueue(1, 0.3);
    q.push([L('a'), L('b')], 1);
    expect(run(q, 3)).toEqual(['a', null, 'b', null]);
    expect(q.idle).toBe(true);
  });
  it('겹치면 중요한 것부터, 같으면 먼저 온 것부터. 보이는 대사는 끊지 않는다', () => {
    const q = new MiniQueue(1, 0);
    q.push([L('low1')], 1);
    expect(q.update(0.1)?.line?.text).toBe('low1');
    q.push([L('low2')], 1);
    q.push([L('high')], 3);
    expect(run(q, 4).filter((x) => x !== null)).toEqual(['high', 'low2']);
  });
  it('긴 문장은 글자 수만큼 더 오래', () => {
    const q = new MiniQueue(1, 0, 0.5);
    q.push([L('abcd'), L('e')], 1);
    // 'abcd': 1 + 4×0.5 = 3초
    expect(run(q, 2.95).filter((x) => x !== null)).toEqual(['abcd']);
    expect(run(q, 0.2)).toEqual([null, 'e']);
  });
  it('시간을 흘리지 않으면(창이 열린 동안) 그대로', () => {
    const q = new MiniQueue(1, 0);
    q.push([L('a')], 1);
    q.update(0.1);
    expect(q.update(0)).toBeNull();
  });
});

describe('현재의 기억 — 제미니 칸', () => {
  it('스토리 대화 + 복선(기록) 미니 대사, 내용 있는 것만 준비됨', () => {
    const slots = geminiSlots(G, T);
    expect(slots.map((s) => s.id)).toEqual([
      'gemini.firstRun', 'gemini.ending', 'gemini.killFusionAkgwi', 'gemini.killElectricRing', 'gemini.killMagiGolem', 'gemini.killEclipse',
      'gemini.metExecutor', 'gemini.metHectarChief', 'gemini.metMagiKaiser', 'gemini.chapterEnd2', 'gemini.hiddenBoss',
    ]);
    expect(slots.filter((s) => !s.ready).map((s) => s.id)).toEqual(['gemini.chapterEnd2', 'gemini.hiddenBoss']);
  });
});

describe('제미니 대사 저장 (현재의 기억)', () => {
  it('처음 본 대사만 등록하고, 저장 왕복과 깨진 값 복구', async () => {
    const { defaultSave, parseSave, registerGemini } = await import('../src/core/save');
    const s = defaultSave();
    expect(registerGemini(s, 'gemini.championMet', ['gemini.mini.championMet.1', 'gemini.mini.championMet.2'])).toBe(true);
    expect(registerGemini(s, 'gemini.championMet', ['x'])).toBe(false);
    expect(parseSave(JSON.stringify(s)).gemini).toEqual({ 'gemini.championMet': { lines: ['gemini.mini.championMet.1', 'gemini.mini.championMet.2'], order: 0 } });
    expect(parseSave(JSON.stringify({ ...s, gemini: { a: { lines: [1] }, b: 'x' } })).gemini).toEqual({});
    // 이전 저장(제미니 칸 없음)도 그대로 읽는다
    const { gemini: _g, ...old } = s;
    expect(parseSave(JSON.stringify(old)).gemini).toEqual({});
  });
});

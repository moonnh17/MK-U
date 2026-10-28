import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { geminiSlots, hasLines, instanceKey, MiniQueue, pickMini, saidKeys, storyFor, type MiniLine } from '../src/systems/gemini';

const G = gameData.gemini;
const T = gameData.text;

describe('제미니 대사 데이터', () => {
  it('기획서 예시 대사는 그대로, 미공개 대사는 빈 자리', () => {
    expect(T['gemini.mini.advancementHectar.1']).toBe('헥타르를 골랐네. 안정적인 걸 좋아하나 봐?');
    expect(T['gemini.mini.advancementAcro.1']).toBe('아크로라... 흥미로운 선택이야.');
    expect([T['gemini.mini.bossKill.1'], T['gemini.mini.bossKill.2']]).toEqual(['벌써 끝났어? 생각보다 빠른데.', '좋아. 데이터는 충분히 모이고 있어.']);
    expect([T['gemini.mini.championMet.1'], T['gemini.mini.championMet.2']]).toEqual(['어라, 저 녀석들까지 나타났네.', '저 둘은... 뭐, 직접 상대해 보면 알 거야.']);
    for (const k of ['gemini.story.firstRun.1', 'gemini.story.eclipseKill.1', 'gemini.story.ending.1', 'gemini.mini.chapterEnd2.1', 'gemini.mini.hiddenBoss.1']) expect(T[k]).toBe('');
  });
  it('스토리 대화: 첫 실행·식광 처치·마기카이저 처치', () => {
    expect(storyFor(G, 'firstRun')?.id).toBe('firstRun');
    expect(storyFor(G, 'bossKill', 'eclipse')?.id).toBe('eclipseKill');
    expect(storyFor(G, 'bossKill', 'magiKaiser')?.id).toBe('ending');
    expect(storyFor(G, 'bossKill', 'fusionAkgwi')).toBeUndefined();
  });
  it('데이터 검증 통과 (제미니 대사만 빈 값 허용)', () => {
    expect(validateGameData(gameData)).toEqual([]);
    expect(validateGameData({ ...gameData, text: { ...T, 'card.title.skill': '' } }).some((e) => e.includes('card.title.skill'))).toBe(true);
  });
});

describe('미니 대사 고르기', () => {
  const pick = (event: Parameters<typeof pickMini>[1], arg?: string, said = new Set<string>(), seed = 1) => pickMini(G, event, arg, said, new Rng(seed), T);

  it('전직: 고른 학파의 대사', () => {
    expect(pick('advancement', 'hectar')?.lines).toEqual(['gemini.mini.advancementHectar.1']);
    expect(pick('advancement', 'acro')?.lines).toEqual(['gemini.mini.advancementAcro.1']);
  });
  it('일반 보스 처치: 후보 둘 중 하나, 식광·마기카이저는 스토리 대화라 미니 대사 없음', () => {
    const seen = new Set<string>();
    for (let s = 1; s < 30; s++) seen.add(pick('bossKill', 'magiGolem', new Set(), s)!.lines[0]!);
    expect([...seen].sort()).toEqual(['gemini.mini.bossKill.1', 'gemini.mini.bossKill.2']);
    expect(pick('bossKill', 'eclipse')).toBeNull();
    expect(pick('bossKill', 'magiKaiser')).toBeNull();
  });
  it('같은 보스는 그 런에서 처음 잡을 때만, 같은 대사는 반복하지 않는다', () => {
    const said = new Set<string>();
    const a = pick('bossKill', 'fusionAkgwi', said)!;
    for (const k of saidKeys('bossKill', 'fusionAkgwi', a)) said.add(k);
    expect(pick('bossKill', 'fusionAkgwi', said)).toBeNull();
    const b = pick('bossKill', 'electricRing', said)!;
    expect(b.index).not.toBe(a.index);
    for (const k of saidKeys('bossKill', 'electricRing', b)) said.add(k);
    // 후보를 다 쓰면 더는 띄우지 않는다
    expect(pick('bossKill', 'hectarChief', said)).toBeNull();
  });
  it('집행자·집정관 첫 조우: 두 문장을 차례로, 복선이라 기록', () => {
    const p = pick('championMet')!;
    expect(p.lines).toEqual(['gemini.mini.championMet.1', 'gemini.mini.championMet.2']);
    expect(p.def.record).toBe(true);
    expect(pick('championMet', undefined, new Set([instanceKey('championMet')]))).toBeNull();
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
  it('시간을 흘리지 않으면(창이 열린 동안) 그대로', () => {
    const q = new MiniQueue(1, 0);
    q.push([L('a')], 1);
    q.update(0.1);
    expect(q.update(0)).toBeNull();
  });
});

describe('현재의 기억 — 제미니 칸', () => {
  it('스토리 대화 3개 + 복선 미니 대사 3개, 내용 있는 것만 준비됨', () => {
    const slots = geminiSlots(G, T);
    expect(slots.map((s) => s.id)).toEqual(['gemini.firstRun', 'gemini.eclipseKill', 'gemini.ending', 'gemini.championMet', 'gemini.chapterEnd2', 'gemini.hiddenBoss']);
    expect(slots.filter((s) => s.ready).map((s) => s.id)).toEqual(['gemini.championMet']);
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

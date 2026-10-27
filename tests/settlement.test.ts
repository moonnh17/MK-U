import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { defaultSave, parseSave, registerCutscene, SAVE_KEY, SaveStore, type KeyValueStore } from '../src/core/save';
import { gameData } from '../src/data/index';
import { crystalBreakdown, formatPlayTime, newRunRecord, rollShard, type RunRecord } from '../src/systems/runRecord';
import type { CutIn } from '../src/ui/cutscenePages';

const C = gameData.meta.crystals;
const M = gameData.meta.memory;
const rec = (o: Partial<RunRecord>): RunRecord => ({ ...newRunRecord(), ...o });

describe('마기력 결정 산식 (기획서 표)', () => {
  it('표 값: 스테이지 10 · X-2 30 · X-5 50 · 엘리트 2 · 첨탑 15 · 히든보스 100 · 클리어 ×1.5', () => {
    expect(C).toEqual({ perStage: 10, bossByStage: { '2': 30, '5': 50 }, perElite: 2, perSpire: 15, perHiddenBoss: 100, clearMultiplier: 1.5 });
  });
  it('기획서 예시: 2-3 사망(스테이지 7, 보스 3, 엘리트 20, 첨탑 1) → 235', () => {
    const r = rec({
      stagesCleared: 7,
      bossKills: [
        { id: 'fusionAkgwi', stage: 2 },
        { id: 'electricRing', stage: 5 },
        { id: 'x', stage: 2 },
      ],
      eliteKills: 20,
      spires: 1,
    });
    const b = crystalBreakdown(r, false, C);
    expect(b.lines.map((l) => [l.key, l.count, l.amount])).toEqual([
      ['stages', 7, 70],
      ['midBoss', 2, 60],
      ['chapterBoss', 1, 50],
      ['elites', 20, 40],
      ['spires', 1, 15],
      ['hiddenBosses', 0, 0],
    ]);
    expect(b.total).toBe(235);
    expect(b.bonus).toBe(0);
  });
  it('런 클리어면 합계 × 1.5 (챕터1 임시 클리어는 보너스 없음)', () => {
    const r = rec({ stagesCleared: 15, hiddenBossKills: ['royalMage'] });
    expect(crystalBreakdown(r, true, C)).toMatchObject({ subtotal: 250, bonus: 125, total: 375 });
    expect(crystalBreakdown(r, false, C).total).toBe(250);
  });
  it('아무것도 없으면 0', () => {
    expect(crystalBreakdown(newRunRecord(), false, C).total).toBe(0);
  });
});

describe('과거의 기억 조각', () => {
  it('히든보스는 확정, 칸이 다 차면 없음', () => {
    expect(rollShard(new Rng(1), 'hiddenBoss', 0, M)).toBe(true);
    expect(rollShard(new Rng(1), 'hiddenBoss', M.pastSlots, M)).toBe(false);
  });
  it('보스는 20% 확률', () => {
    let n = 0;
    for (let s = 0; s < 2000; s++) if (rollShard(new Rng(s), 'boss', 0, M)) n++;
    expect(n / 2000).toBeGreaterThan(0.17);
    expect(n / 2000).toBeLessThan(0.23);
  });
  it('칸 10개', () => {
    expect(M.pastSlots).toBe(10);
  });
});

describe('플레이 시간 표시', () => {
  it('분:초', () => {
    expect(formatPlayTime(0)).toBe('0:00');
    expect(formatPlayTime(65.9)).toBe('1:05');
    expect(formatPlayTime(3601)).toBe('60:01');
  });
});

class FakeStore implements KeyValueStore {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('저장', () => {
  const cut: CutIn = { kind: 'skillAwakening', icon: { label: 'A', color: '#fff' }, flash: '#fff' };
  it('없거나 깨졌거나 버전이 다르면 기본값', () => {
    expect(parseSave(null)).toEqual(defaultSave());
    expect(parseSave('{깨짐')).toEqual(defaultSave());
    expect(parseSave(JSON.stringify({ version: 999, crystals: 50 }))).toEqual(defaultSave());
  });
  it('잘못된 값은 버리고 나머지는 살린다', () => {
    const s = parseSave(JSON.stringify({ version: 1, crystals: -5, pastShards: 3, upgrades: { magiScholar: { strength: 2, bad: 'x' } }, firstRunDone: true }));
    expect(s.crystals).toBe(0);
    expect(s.pastShards).toBe(3);
    expect(s.upgrades).toEqual({ magiScholar: { strength: 2, bad: 0 } });
    expect(s.firstRunDone).toBe(true);
  });
  it('쓰고 다시 읽으면 같다', () => {
    const store = new FakeStore();
    const a = new SaveStore(store);
    a.data.crystals = 235;
    registerCutscene(a.data, 'skill.magiTurret', cut, [{ title: 't', lines: [], accent: '#fff' }]);
    a.write();
    expect(store.getItem(SAVE_KEY)).not.toBeNull();
    const b = new SaveStore(store);
    expect(b.data.crystals).toBe(235);
    expect(Object.keys(b.data.cutscenes)).toEqual(['skill.magiTurret']);
  });
  it('컷씬은 처음 볼 때만 등록되고 본 순서를 기억한다', () => {
    const s = defaultSave();
    expect(registerCutscene(s, 'a', cut, [])).toBe(true);
    expect(registerCutscene(s, 'a', cut, [])).toBe(false);
    registerCutscene(s, 'b', cut, []);
    expect([s.cutscenes.a!.order, s.cutscenes.b!.order]).toEqual([0, 1]);
  });
  it('저장소를 못 쓰면 메모리에서만 (오류 없이)', () => {
    const broken: KeyValueStore = {
      getItem: () => {
        throw new Error('막힘');
      },
      setItem: () => {
        throw new Error('막힘');
      },
      removeItem: () => {},
    };
    const s = new SaveStore(broken);
    s.data.crystals = 10;
    expect(() => s.write()).not.toThrow();
    expect(new SaveStore(null).data).toEqual(defaultSave());
  });
  it('초기화', () => {
    const store = new FakeStore();
    const s = new SaveStore(store);
    s.data.crystals = 99;
    s.write();
    s.reset();
    expect(s.data).toEqual(defaultSave());
    expect(store.getItem(SAVE_KEY)).toBeNull();
  });
});

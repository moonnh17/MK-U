import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import {
  allCells,
  cellAt,
  coverRects,
  coverShadows,
  derangement,
  dropCells,
  garble,
  hasSafeCell,
  hasUncovered,
  inRect,
  makeGrid,
  makeScan,
  mimosaPhase,
  observation,
  patchMove,
  patchPush,
  purgeCells,
  satelliteMarks,
  scanDone,
  scanHits,
  shiftCells,
  shuffledSlot,
  tamperBlocksAttacks,
  tamperStage,
} from '../src/systems/mimosa';
import { emptyLoadout } from '../src/systems/skills';

const M = gameData.overflow.mimosa;
const arena = { x: 0, y: 0, w: 576, h: 336 };
const g = makeGrid(arena, M.grid.cellPx);

describe('미모사 데이터', () => {
  it('3페이즈 문턱(약 2/3·1/3), 패턴은 페이즈마다', () => {
    expect(M.phases).toEqual([0.66, 0.33]);
    for (const ph of [1, 2, 3]) expect(M.patterns.filter((p) => p.phases.includes(ph)).length).toBeGreaterThan(2);
  });
  it('광범위 공격은 예고 1초 이상', () => {
    for (const p of M.patterns) if (p.wide) expect(p.warnSec).toBeGreaterThanOrEqual(1);
  });
  it('보스 스폰 id·이름: 임시 보스 대신 진짜 미모사', () => {
    expect(gameData.overflow.placeholderBosses.hectarMimosa).toBeUndefined();
    expect(gameData.enemies.enemies.find((e) => e.id === 'hectarMimosa')?.ai).toBe('boss');
  });
});

describe('광범위 공격마다 안전 구역', () => {
  it('격자 낙하·격자 이동·최종 정리에 안전 칸이 있다', () => {
    for (let s = 0; s < 50; s++) {
      expect(hasSafeCell(g, dropCells(new Rng(s), g, M.grid.dropRatio))).toBe(true);
      expect(hasSafeCell(g, shiftCells(g, s, M.grid.shiftBandCols))).toBe(true);
      const p = purgeCells(new Rng(s), g, M.grid.purgeSafeCells);
      expect(p.safe.length).toBeGreaterThanOrEqual(1);
      expect(hasSafeCell(g, p.danger)).toBe(true);
      expect(p.danger.length + p.safe.length).toBe(allCells(g).length);
    }
  });
  it('격자 스캔: 틈에 서 있으면 맞지 않고, 틈 밖이면 맞는다, 끝까지 쓸고 지나간다', () => {
    for (let s = 0; s < 30; s++) {
      const sc = makeScan(new Rng(s), arena, s % 2 ? 'h' : 'v', M.scan.width, M.scan.speedSlow, M.scan.gaps, M.scan.gapPx);
      expect(sc.gaps.length).toBe(M.scan.gaps);
      const gap = sc.gaps[0]!;
      const mid = (gap[0] + gap[1]) / 2;
      const line = sc.from;
      const inGap = sc.axis === 'h' ? { x: mid, y: line } : { x: line, y: mid };
      expect(scanHits(sc, 0, inGap, 3)).toBe(false);
      const outside = sc.axis === 'h' ? { x: gap[1] + 30 > arena.w ? gap[0] - 30 : gap[1] + 30, y: line } : { x: line, y: gap[1] + 30 > arena.h ? gap[0] - 30 : gap[1] + 30 };
      if (!sc.gaps.some(([a, b]) => (sc.axis === 'h' ? outside.x : outside.y) >= a - 3 && (sc.axis === 'h' ? outside.x : outside.y) <= b + 3)) expect(scanHits(sc, 0, outside, 3)).toBe(true);
      expect(scanDone(sc, 1000)).toBe(true);
    }
  });
  it('위성 포격: 표지 수 상한, 표지 밖 자리가 있다', () => {
    for (let s = 0; s < 30; s++) {
      const m = satelliteMarks(new Rng(s), arena, { x: 100, y: 100 }, 99, M.satellite.maxCount, M.satellite.radius);
      expect(m.length).toBe(M.satellite.maxCount);
      expect(hasUncovered(arena, m, M.satellite.radius)).toBe(true);
    }
  });
  it('전역 레이저: 엄폐물마다 그림자(안전) 칸', () => {
    for (let s = 0; s < 20; s++) {
      const c = coverRects(new Rng(s), arena, M.laser.covers, M.laser.coverW, M.laser.coverH);
      const sh = coverShadows(arena, c);
      expect(sh).toHaveLength(M.laser.covers);
      for (const r of sh) {
        expect(r.h).toBeGreaterThan(0);
        expect(inRect({ x: r.x + r.w / 2, y: r.y + r.h - 2 }, arena)).toBe(true);
      }
    }
  });
  it('격자 칸 찾기', () => {
    expect(cellAt(g, 0, 0)).toEqual({ c: 0, r: 0 });
    expect(cellAt(g, 575, 335)).toEqual({ c: g.cols - 1, r: g.rows - 1 });
  });
});

describe('시스템 변조', () => {
  const T = { quietSec: 1, telegraphSec: 1.5, activeSec: 4, rollbackSec: 1 };
  it('전조 → 발동 → 원복 순서, 앞뒤 1초는 공격을 비운다', () => {
    const seq = [0.5, 1.2, 3, 6.6, 7.6, 9].map((t) => tamperStage(t, T));
    expect(seq).toEqual(['quietBefore', 'telegraph', 'active', 'rollback', 'quietAfter', 'done']);
    expect(tamperBlocksAttacks('quietBefore')).toBe(true);
    expect(tamperBlocksAttacks('telegraph')).toBe(true);
    expect(tamperBlocksAttacks('active')).toBe(false);
    expect(tamperBlocksAttacks('rollback')).toBe(true);
    expect(tamperBlocksAttacks('quietAfter')).toBe(true);
  });
  it('데이터 시간표: 앞뒤 쉼 약 1초, 전조 약 1.5초', () => {
    for (const k of ['patchNote', 'slotShuffle'] as const) {
      expect(M.tamper[k].quietSec).toBeGreaterThanOrEqual(1);
      expect(M.tamper[k].telegraphSec).toBeGreaterThanOrEqual(1.5);
    }
  });
  it('슬롯 셔플: 모든 칸이 옮겨지고, 끝나면 원래 칸 그대로', () => {
    for (let s = 0; s < 50; s++) {
      const p = derangement(new Rng(s), 3);
      expect([...p].sort()).toEqual([0, 1, 2]);
      p.forEach((v, i) => expect(v).not.toBe(i));
      expect([0, 1, 2].map((j) => shuffledSlot(null, j))).toEqual([0, 1, 2]);
    }
  });
  it('슬롯 셔플은 인벤토리(로드아웃)를 바꾸지 않는다', () => {
    const lo = emptyLoadout(3);
    const before = JSON.stringify(lo);
    const perm = derangement(new Rng(1), 3);
    [0, 1, 2].map((j) => lo.active[shuffledSlot(perm, j)]);
    expect(JSON.stringify(lo)).toBe(before);
  });
  it('패치 노트: 이동 반전·넉백 반전, 패치가 없으면 그대로(원복)', () => {
    expect(patchMove({ x: 1, y: -1 }, ['invertX'])).toEqual({ x: -1, y: -1 });
    expect(patchMove({ x: 1, y: -1 }, ['invertXY'])).toEqual({ x: -1, y: 1 });
    expect(patchMove({ x: 1, y: -1 }, [])).toEqual({ x: 1, y: -1 });
    expect(patchPush({ x: 3, y: 0 }, ['gravity'])).toEqual({ x: -3, y: -0 });
    expect(patchPush({ x: 3, y: 0 }, [])).toEqual({ x: 3, y: 0 });
  });
  it('연산 오류: 표시 글자만 바꾼다 (같은 길이)', () => {
    const s = garble(new Rng(3), '헥타르 학파 연구원 미모사', 0.5, M.glitch.glyphs);
    expect([...s]).toHaveLength([...'헥타르 학파 연구원 미모사'].length);
    expect(garble(new Rng(3), 'abc', 0, M.glitch.glyphs)).toBe('abc');
  });
});

describe('페이즈·관측 결과', () => {
  it('체력 2/3·1/3에서 페이즈', () => {
    expect(mimosaPhase(1, M.phases)).toBe(1);
    expect(mimosaPhase(0.6, M.phases)).toBe(2);
    expect(mimosaPhase(0.2, M.phases)).toBe(3);
  });
  it('관측 결과: 고른 체력·공격·속도 계열 진화가 보스에게, 상한 있음', () => {
    const none = observation(null, M.observation);
    expect(none).toMatchObject({ takenMul: 1, damageMul: 1, gapMul: 1 });
    const st = { stacks: { bulk: 3, instinct: 2, haste: 1, regen: 3 }, uniques: [], overloadStacks: 0 };
    const o = observation(st, M.observation);
    expect(o.takenMul).toBeLessThan(1);
    expect(o.damageMul).toBeGreaterThan(1);
    expect(o.gapMul).toBeLessThan(1);
    expect(o.takenMul).toBeGreaterThanOrEqual(1 - M.observation.max.hp);
  });
});

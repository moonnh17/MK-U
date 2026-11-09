import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { distanceToObject, jobChoices, nearestInteractable, portalActive } from '../src/systems/lab';

const L = gameData.lab;
const J = gameData.jobs.jobs;
const obj = (id: string) => L.objects.find((o) => o.id === id)!;

describe('실험장 배치 (기획서 오브젝트 6종 + 캡슐)', () => {
  it('직업 선택 장치·포털·도감 단말·기억조각 보관대·제미니 홀로그램·관측창, 실험체 캡슐', () => {
    expect(L.objects.map((o) => o.kind).sort()).toEqual(['archive', 'capsule', 'codex', 'gemini', 'jobSelect', 'portal', 'window']);
  });
  it('중앙 동선: 캡슐(아래) → 직업 선택 → 포털(위)이 한 줄', () => {
    expect(obj('capsule').x).toBe(obj('jobDevice').x);
    expect(obj('jobDevice').x).toBe(obj('portal').x);
    expect(obj('capsule').y).toBeGreaterThan(obj('jobDevice').y);
    expect(obj('jobDevice').y).toBeGreaterThan(obj('portal').y);
  });
  it('모든 오브젝트와 시작점이 방 안에 있다', () => {
    const r = L.room;
    for (const o of [...L.objects, { ...L.start, w: 0, h: 0 }]) {
      expect(o.x - o.w / 2).toBeGreaterThanOrEqual(r.x);
      expect(o.x + o.w / 2).toBeLessThanOrEqual(r.x + r.w);
      expect(o.y - o.h / 2).toBeGreaterThanOrEqual(r.y);
      expect(o.y + o.h / 2).toBeLessThanOrEqual(r.y + r.h);
    }
  });
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});

describe('조사 대상', () => {
  it('사각형 테두리까지의 거리', () => {
    const o = { x: 0, y: 0, w: 10, h: 10 };
    expect(distanceToObject(o, { x: 3, y: 3 })).toBe(0);
    expect(distanceToObject(o, { x: 8, y: 0 })).toBe(3);
    expect(distanceToObject(o, { x: 8, y: 9 })).toBe(5);
  });
  it('반경 안 가장 가까운 것, 캡슐·관측창은 조사하지 않는다', () => {
    const d = obj('jobDevice');
    expect(nearestInteractable(L.objects, { x: d.x, y: d.y + d.h / 2 + 5 }, L.interactRadius)?.id).toBe('jobDevice');
    const c = obj('capsule');
    expect(nearestInteractable(L.objects, { x: c.x, y: c.y - c.h / 2 - 2 }, 8)).toBeNull();
    expect(nearestInteractable(L.objects, { x: obj('observation').x, y: obj('observation').y + 10 }, 12)).toBeNull();
  });
  it('멀면 없음', () => {
    expect(nearestInteractable(L.objects, L.start, 1)).toBeNull();
  });
});

describe('직업 선택·포털', () => {
  it('3직업이 보이고 마기학자·전사를 고를 수 있다', () => {
    expect(jobChoices(J).map((j) => [j.id, j.enabled])).toEqual([
      ['magiScholar', true],
      ['magiMage', false],
      ['warrior', true],
    ]);
  });
  it('포털은 고를 수 있는 직업을 고른 뒤에만 켜진다', () => {
    expect(portalActive(J, null)).toBe(false);
    expect(portalActive(J, 'magiMage')).toBe(false);
    expect(portalActive(J, 'warrior')).toBe(true);
    expect(portalActive(J, 'magiScholar')).toBe(true);
  });
});

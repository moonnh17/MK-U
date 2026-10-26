import { describe, expect, it } from 'vitest';
import { Rng, hashString } from '../src/core/rng';

const sample = (r: Rng, n = 20) => Array.from({ length: n }, () => r.next());

describe('Rng', () => {
  it('같은 시드는 같은 수열을 만든다', () => {
    expect(sample(new Rng(123))).toEqual(sample(new Rng(123)));
  });

  it('다른 시드는 다른 수열을 만든다', () => {
    expect(sample(new Rng(123))).not.toEqual(sample(new Rng(124)));
  });

  it('next()는 [0, 1) 범위다', () => {
    for (const v of sample(new Rng(7), 5000)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int()는 양끝을 포함하고 범위를 벗어나지 않는다', () => {
    const r = new Rng(1);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(2, 5);
      expect(v).toBeGreaterThanOrEqual(2);
      expect(v).toBeLessThanOrEqual(5);
      seen.add(v);
    }
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('derive()는 부모 상태를 소비하지 않고 라벨별로 재현된다', () => {
    const a = Rng.derive(99, 'stage-1-1');
    const b = Rng.derive(99, 'stage-1-1');
    const c = Rng.derive(99, 'stage-1-2');
    expect(sample(a)).toEqual(sample(b));
    expect(sample(Rng.derive(99, 'stage-1-1'))).not.toEqual(sample(c));
  });

  it('fork()도 같은 시드·같은 호출 순서면 재현된다', () => {
    const run = () => {
      const r = new Rng(5);
      r.next();
      return sample(r.fork('waves'));
    };
    expect(run()).toEqual(run());
  });

  it('shuffle()은 원소를 보존하고 원본을 바꾸지 않는다', () => {
    const src = [1, 2, 3, 4, 5, 6];
    const out = new Rng(3).shuffle(src);
    expect(src).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(src);
  });

  it('weighted()는 가중치 0인 항목을 고르지 않는다', () => {
    const r = new Rng(11);
    for (let i = 0; i < 500; i++) {
      expect(
        r.weighted([
          { item: 'a', weight: 1 },
          { item: 'b', weight: 0 },
        ]),
      ).toBe('a');
    }
  });

  it('hashString은 결정적이다', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});

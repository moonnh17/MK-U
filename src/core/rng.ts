/**
 * 시드 가능한 RNG. 게임의 모든 랜덤은 이 클래스를 거친다.
 * 알고리즘: mulberry32 (32비트 상태, 빠르고 재현 가능).
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) 실수 */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** [min, max] 정수 (양끝 포함) */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** [min, max) 실수 */
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  /** p 확률로 true */
  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: 빈 배열');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** 가중치 선택. weights는 0 이상, 합이 0보다 커야 한다. */
  weighted<T>(items: readonly { item: T; weight: number }[]): T {
    const total = items.reduce((s, e) => s + e.weight, 0);
    if (total <= 0) throw new Error('Rng.weighted: 가중치 합이 0');
    let r = this.next() * total;
    for (const e of items) {
      r -= e.weight;
      if (r < 0) return e.item;
    }
    return items[items.length - 1]!.item;
  }

  /** 새 배열로 섞어서 반환 (Fisher–Yates) */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      [out[i], out[j]] = [out[j] as T, out[i] as T];
    }
    return out;
  }

  /** 라벨로 갈라진 독립 하위 RNG. 같은 시드+라벨이면 항상 같은 흐름이다. */
  fork(label: string): Rng {
    return new Rng(hashString(`${this.state}:${label}`));
  }

  /** 부모 시드와 라벨만으로 하위 RNG를 만든다(부모 상태를 소비하지 않음). */
  static derive(seed: number, label: string): Rng {
    return new Rng(hashString(`${seed >>> 0}:${label}`));
  }
}

/** 문자열 → 32비트 해시 (FNV-1a) */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

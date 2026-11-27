import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { pickKaiserVariant, tallyTags, tagTakenMul } from '../src/systems/kaiserLearning';

const K = gameData.overflow.kaiserLearning;

describe('마기카이저 학습 (오버플로우)', () => {
  it('맞힌 공격의 태그를 센다', () => {
    let use = {};
    use = tallyTags(use, ['ranged', 'physical']);
    use = tallyTags(use, ['ranged']);
    expect(use).toEqual({ ranged: 2, physical: 1 });
  });
  it('적게 썼으면 변형 없음', () => {
    expect(pickKaiserVariant({ ranged: K.minHits - 1 }, K)).toBeNull();
  });
  it('가장 많이 쓴 계열에 맞서는 변형 (마기·기술은 합쳐서 센다)', () => {
    expect(pickKaiserVariant({ ranged: 400, melee: 100 }, K)?.id).toBe('reflect');
    expect(pickKaiserVariant({ ranged: 100, melee: 300 }, K)?.id).toBe('shock');
    expect(pickKaiserVariant({ ranged: 250, magic: 150, tech: 150 }, K)?.id).toBe('absorb');
  });
  it('변형 3종이 있다 (임시)', () => {
    expect(K.variants.map((v) => v.id)).toEqual(['reflect', 'shock', 'absorb']);
  });
  it('태그별 받는 피해: 맞힌 공격의 태그 중 가장 많이 줄어드는 값', () => {
    const v = K.variants.find((x) => x.id === 'absorb')!;
    expect(tagTakenMul(v.takenMul, ['magic', 'ranged'])).toBeCloseTo(v.takenMul.magic!);
    expect(tagTakenMul(v.takenMul, ['physical'])).toBe(1);
    expect(tagTakenMul(null, ['magic'])).toBe(1);
  });
});

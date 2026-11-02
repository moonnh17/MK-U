import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { applyMental, lowSanityBonus, sanityMaxFor, stepSanity } from '../src/systems/sanity';

const c = gameData.player.sanity;
const max = sanityMaxFor(0, c);
const def = (id: string) => gameData.enemies.enemies.find((e) => e.id === id)!;

describe('정신력', () => {
  it('시작 100, 아이템·강화만큼 는다', () => {
    expect(max).toBe(100);
    expect(sanityMaxFor(20, c)).toBe(120);
  });
  it('정신 피해로 줄고 0이 되면 패닉', () => {
    expect(applyMental({ sanity: 50, sanityMax: max, panic: false }, 20)).toEqual({ sanity: 30, panic: false, hpDamage: 0 });
    expect(applyMental({ sanity: 10, sanityMax: max, panic: false }, 20)).toEqual({ sanity: 0, panic: true, hpDamage: 0 });
  });
  it('패닉 중 정신 피해는 체력 피해로 바뀐다', () => {
    expect(applyMental({ sanity: 5, sanityMax: max, panic: true }, 7)).toEqual({ sanity: 5, panic: true, hpDamage: 7 });
  });
  it('시간이 지나면 회복한다 (최대치까지)', () => {
    expect(stepSanity({ sanity: 50, sanityMax: max, panic: false }, 1, false, c).sanity).toBe(50 + c.regenPerSec);
    expect(stepSanity({ sanity: max, sanityMax: max, panic: false }, 1, false, c).sanity).toBe(max);
  });
  it('보스와 마주하면 계속 닳고, 다 닳으면 패닉', () => {
    expect(stepSanity({ sanity: 50, sanityMax: max, panic: false }, 1, true, c).sanity).toBe(50 - c.bossDrainPerSec);
    expect(stepSanity({ sanity: 0.1, sanityMax: max, panic: false }, 1, true, c).panic).toBe(true);
  });
  it('패닉은 회복해서 벗어난다 (보스 앞에서도)', () => {
    let s = { sanity: 0, sanityMax: max, panic: true };
    for (let i = 0; i < 100 && s.panic; i++) s = { ...s, ...stepSanity(s, 1, true, c) };
    expect(s.panic).toBe(false);
    expect(s.sanity).toBeGreaterThanOrEqual(max * c.panic.exitRatio);
  });
});

describe('정신 피해를 주는 적', () => {
  it.each(['ghostShooter', 'hatredShard', 'ancientOne', 'archon'])('%s는 체력 피해와 같은 양', (id) => {
    expect(def(id).mentalRatio).toBe(1);
  });
  it('토마끼·개들개·악귀는 주지 않는다', () => {
    for (const id of ['tomakki', 'gaedeulgae', 'akgwi']) expect(def(id).mentalRatio).toBeUndefined();
  });
  it('어느 기억: 장판에 정신 피해, 돌진 없음', () => {
    const m = def('aMemory');
    expect(m.trail?.mentalDamage).toBeGreaterThan(0);
    expect(m.attacks!.find((a) => a.kind === 'puddle')?.mentalDamage).toBeGreaterThan(0);
    expect(m.attacks!.some((a) => a.kind === 'lunge')).toBe(false);
  });
});

describe('패닉 아이템', () => {
  const kinds = (id: string) => gameData.items.items.find((i) => i.id === id)!.effects.map((e) => e.kind);
  it('기숲 비석의 조각에 각성이 옮겨졌다', () => {
    expect(kinds('gisupStone')).toContain('panicAwaken');
    expect(gameData.items.items.some((i) => i.id === 'panicBrand')).toBe(false);
  });
  it('아트로스 비석 필사본: 방향 유지·시야 방해 감소, 정신력이 낮을수록 피해', () => {
    expect(kinds('atrosCodex')).toEqual(['lowSanityDamage', 'panicCalm']);
    expect(lowSanityBonus(0, 100, 0.4)).toBeCloseTo(0.4);
    expect(lowSanityBonus(50, 100, 0.4)).toBeCloseTo(0.2);
    expect(lowSanityBonus(100, 100, 0.4)).toBe(0);
  });
});

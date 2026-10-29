import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { burst, damageKind, damageNumberStyle, HitStop, lowHpPulse, sparkKind } from '../src/systems/juice';

const J = gameData.juice;

describe('피해 숫자', () => {
  it('종류: 공간격 > 치명 > 지속 피해 > 보통', () => {
    expect(damageKind({ crit: true, space: true })).toBe('space');
    expect(damageKind({ crit: true, dot: true })).toBe('crit');
    expect(damageKind({ dot: true })).toBe('dot');
    expect(damageKind({})).toBe('normal');
  });
  it('치명은 크고 노랗게, 보스는 조금 크게, 1 미만은 소수 한 자리', () => {
    const n = damageNumberStyle('normal', false, J.damageNumbers);
    const c = damageNumberStyle('crit', false, J.damageNumbers);
    const b = damageNumberStyle('normal', true, J.damageNumbers);
    expect(c.size).toBeGreaterThan(n.size);
    expect(c.color).toBe('#ffd23f');
    expect(b.size).toBeGreaterThan(n.size);
    expect([n.text(0.42), n.text(12.6)]).toEqual(['0.4', '13']);
  });
});

describe('불꽃·파편', () => {
  it('불꽃 색 종류: 기술 > 마기 > 물리', () => {
    expect(sparkKind(['physical', 'tech'])).toBe('tech');
    expect(sparkKind(['physical', 'magic'])).toBe('magic');
    expect(sparkKind(['physical', 'melee'])).toBe('physical');
    expect(sparkKind(['ranged'])).toBe('default');
  });
  it('퍼짐: 개수·속도 범위 안, 같은 시드면 같다', () => {
    const v = burst(new Rng(3), [6, 9], [40, 120]);
    expect(v.length).toBeGreaterThanOrEqual(6);
    expect(v.length).toBeLessThanOrEqual(9);
    for (const x of v) {
      const s = Math.hypot(x.vx, x.vy);
      expect(s).toBeGreaterThanOrEqual(40 - 1e-9);
      expect(s).toBeLessThanOrEqual(120 + 1e-9);
    }
    expect(burst(new Rng(3), [6, 9], [40, 120])).toEqual(v);
  });
});

describe('히트스톱', () => {
  it('요청 중 가장 긴 만큼 멈추고, 끝난 뒤 잠깐은 다시 멈추지 않는다', () => {
    const h = new HitStop(0.1);
    h.request(0.04);
    h.request(0.06);
    expect(h.update(0.05)).toBe(true);
    expect(h.update(0.02)).toBe(true);
    expect(h.update(0.01)).toBe(false);
    h.request(0.05);
    expect(h.update(0.01)).toBe(false);
    h.update(0.2);
    h.request(0.05);
    expect(h.update(0.01)).toBe(true);
  });
  it('0초 요청은 무시', () => {
    const h = new HitStop(0.1);
    h.request(0);
    expect(h.update(0.01)).toBe(false);
  });
});

describe('낮은 체력 맥박', () => {
  it('기준 이하에서만 뛰고, 낮을수록 진하다', () => {
    const p = J.playerHurt;
    expect(lowHpPulse(0.3, 0.5, p)).toBe(0);
    const peak = p.pulseSec / 4;
    expect(lowHpPulse(peak, 0.05, p)).toBeGreaterThan(lowHpPulse(peak, 0.25, p));
    expect(lowHpPulse(peak, 0.05, p)).toBeLessThanOrEqual(p.pulseAlpha);
  });
});

describe('타격감 데이터', () => {
  it('검증 통과, 이펙트 그림은 등록돼 있다', () => {
    expect(validateGameData(gameData)).toEqual([]);
    for (const ref of Object.values(J.fx)) expect(gameData.art.sprites[ref.spriteKey], ref.spriteKey).toBeDefined();
  });
});

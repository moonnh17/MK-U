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

describe('보스 등장 컷 시간표', () => {
  it('카메라 이동 → 내려찍기 → 이름 띠 → 복귀 → 끝', async () => {
    const { bossIntroStage, bossIntroTotal } = await import('../src/systems/juice');
    const b = J.bossIntro;
    expect(bossIntroStage(0, b).stage).toBe('pan');
    expect(bossIntroStage(b.panSec + 0.01, b).stage).toBe('drop');
    expect(bossIntroStage(b.panSec + b.dropSec + 0.01, b).stage).toBe('name');
    expect(bossIntroStage(bossIntroTotal(b) - 0.01, b).stage).toBe('return');
    expect(bossIntroStage(bossIntroTotal(b), b)).toEqual({ stage: 'done', progress: 1 });
    expect(bossIntroStage(b.panSec / 2, b).progress).toBeCloseTo(0.5);
  });
});

describe('보스 체력바 잔상', () => {
  it('깎이면 잠깐 버티다 내려오고, 회복하면 바로 맞춘다', async () => {
    const { trailStep } = await import('../src/systems/juice');
    const b = J.bossBar;
    let s = trailStep(1, 0.8, 0, 0.016, b, true);
    expect(s).toEqual({ trail: 1, hold: b.trailDelaySec });
    s = trailStep(s.trail, 0.8, s.hold, b.trailDelaySec, b, false);
    expect(s.trail).toBe(1);
    s = trailStep(s.trail, 0.8, s.hold, 0.1, b, false);
    expect(s.trail).toBeCloseTo(1 - b.trailPerSec * 0.1);
    s = trailStep(s.trail, 0.8, 0, 10, b, false);
    expect(s.trail).toBe(0.8);
    expect(trailStep(0.5, 0.7, 0.3, 0.1, b, false)).toEqual({ trail: 0.7, hold: 0 });
  });
});

describe('보스 처치 슬로모션·적 소환', () => {
  it('처음엔 느리고 점점 원래 배속, 끝나면 1', async () => {
    const { slowMoScale } = await import('../src/systems/juice');
    const k = J.bossKill;
    expect(slowMoScale(0, k)).toBeCloseTo(k.slowScale);
    expect(slowMoScale(k.slowSec / 2, k)).toBeGreaterThan(k.slowScale);
    expect(slowMoScale(k.slowSec / 2, k)).toBeLessThan(1);
    expect(slowMoScale(k.slowSec, k)).toBe(1);
  });
  it('소환: 작고 투명하게 아래에서 시작해 원래 크기·위치로', async () => {
    const { spawnRise } = await import('../src/systems/juice');
    const s = J.spawn;
    const start = spawnRise(0, s);
    expect(start.scale).toBeCloseTo(s.startScale);
    expect([start.alpha, start.offsetY]).toEqual([0, s.risePx]);
    const end = spawnRise(1, s);
    expect(end.scale).toBeCloseTo(1);
    expect([end.alpha, end.offsetY]).toEqual([1, 0]);
    // 끝나기 직전 살짝 커졌다 돌아온다
    expect(spawnRise(0.85, s).scale).toBeGreaterThan(1);
  });
});

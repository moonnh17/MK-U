/**
 * 타격감 (순수 함수): 피해 숫자 모양, 히트스톱, 불꽃 색, 파편 퍼짐, 낮은 체력 맥박.
 * 수치는 data/juice.json. 그리는 일은 entities/juice.ts.
 */
import type { Rng } from '../core/rng';
import type { JuiceData, TagId } from '../types/data';

export type DamageKind = 'normal' | 'crit' | 'space' | 'dot';

/** 피해 숫자 한 개의 모양 */
export function damageNumberStyle(kind: DamageKind, boss: boolean, d: JuiceData['damageNumbers']): { text: (n: number) => string; color: string; size: number } {
  const base = kind === 'crit' ? d.critFontSize : d.fontSize;
  return {
    // 1 미만은 소수 한 자리, 그 이상은 반올림 (출혈 같은 작은 피해도 0으로 보이지 않게)
    text: (n) => (n < 1 ? n.toFixed(1) : String(Math.round(n))),
    color: d.colors[kind],
    size: Math.round(base * (boss ? d.bossFontScale : 1)),
  };
}

/** 피해 숫자 종류: 공간격 > 치명 > 지속 피해 > 보통 */
export function damageKind(opts: { crit?: boolean; space?: boolean; dot?: boolean }): DamageKind {
  return opts.space ? 'space' : opts.crit ? 'crit' : opts.dot ? 'dot' : 'normal';
}

/** 불꽃 종류: 태그 중 기술 > 마기 > 물리 순 (없으면 기본) */
export function sparkKind(tags: readonly TagId[]): 'tech' | 'magic' | 'physical' | 'default' {
  if (tags.includes('tech')) return 'tech';
  if (tags.includes('magic')) return 'magic';
  if (tags.includes('physical')) return 'physical';
  return 'default';
}

/** 파편·불꽃 퍼짐: n개의 속도(방향은 고르게 + 흔들림) */
export function burst(rng: Rng, count: readonly [number, number], speed: readonly [number, number]): { vx: number; vy: number }[] {
  const n = rng.int(count[0], count[1]);
  const base = rng.range(0, Math.PI * 2);
  return Array.from({ length: n }, (_, i) => {
    const a = base + (i * Math.PI * 2) / n + rng.range(-0.4, 0.4);
    const s = rng.range(speed[0], speed[1]);
    return { vx: Math.cos(a) * s, vy: Math.sin(a) * s };
  });
}

/**
 * 히트스톱: 요청한 것 중 가장 긴 시간 동안 멈춘다. 너무 자주 끊기지 않게 끝난 뒤 minGap 동안은 새 요청을 무시한다.
 * update(실제 시간)는 지금 멈춰 있는지 돌려준다.
 */
export class HitStop {
  private left = 0;
  private gap = 0;

  constructor(private readonly minGapSec: number) {}

  request(sec: number): void {
    if (sec <= 0 || this.gap > 0) return;
    this.left = Math.max(this.left, sec);
  }

  update(dt: number): boolean {
    if (this.left > 0) {
      this.left -= dt;
      if (this.left <= 0) this.gap = this.minGapSec;
      return true;
    }
    this.gap = Math.max(0, this.gap - dt);
    return false;
  }

  get active(): boolean {
    return this.left > 0;
  }
}

/** 낮은 체력 맥박: 체력 비율이 기준 이하면 0~maxAlpha로 뛰고(낮을수록 진하게), 아니면 0 */
export function lowHpPulse(time: number, hpRatio: number, p: JuiceData['playerHurt']): number {
  if (hpRatio > p.lowHpRatio || hpRatio <= 0) return 0;
  const depth = 1 - hpRatio / p.lowHpRatio;
  const wave = 0.5 + 0.5 * Math.sin((time / p.pulseSec) * Math.PI * 2);
  return p.pulseAlpha * (0.4 + 0.6 * depth) * wave;
}

export type IntroStage = 'pan' | 'drop' | 'name' | 'return' | 'done';

/** 보스 등장 컷: 지금 어느 단계이고 그 단계의 진행률(0~1)은 얼마인지 */
export function bossIntroStage(t: number, b: JuiceData['bossIntro']): { stage: IntroStage; progress: number } {
  const steps: [IntroStage, number][] = [
    ['pan', b.panSec],
    ['drop', b.dropSec],
    ['name', b.nameSec],
    ['return', b.returnSec],
  ];
  let start = 0;
  for (const [stage, sec] of steps) {
    if (t < start + sec) return { stage, progress: sec > 0 ? (t - start) / sec : 1 };
    start += sec;
  }
  return { stage: 'done', progress: 1 };
}

/** 등장 컷 전체 길이 */
export function bossIntroTotal(b: JuiceData['bossIntro']): number {
  return b.panSec + b.dropSec + b.nameSec + b.returnSec;
}

/**
 * 보스 체력바 잔상: 체력이 깎이면 잔상은 그대로 있다가(hold) delay 뒤 초당 perSec씩 체력까지 내려온다. 회복하면 바로 맞춘다.
 * 반환: 다음 잔상 비율과 남은 대기
 */
export function trailStep(trail: number, hp: number, hold: number, dt: number, b: JuiceData['bossBar'], dropped: boolean): { trail: number; hold: number } {
  if (hp >= trail) return { trail: hp, hold: 0 };
  if (dropped) return { trail, hold: b.trailDelaySec };
  if (hold > 0) return { trail, hold: Math.max(0, hold - dt) };
  return { trail: Math.max(hp, trail - b.trailPerSec * dt), hold: 0 };
}

/** 보스 처치 슬로모션: t초 지점의 배속 (slowScale에서 시작해 slowSec 동안 1로) */
export function slowMoScale(t: number, k: JuiceData['bossKill']): number {
  if (t >= k.slowSec) return 1;
  const p = t / k.slowSec;
  // 처음엔 오래 느리게, 끝에서 빨리 원래대로
  return k.slowScale + (1 - k.slowScale) * p * p;
}

/** 적 소환 연출: 대기 진행률(0~1) → 크기 배율·투명도·위로 솟는 정도(px) */
export function spawnRise(progress: number, s: JuiceData['spawn']): { scale: number; alpha: number; offsetY: number } {
  const p = Math.min(1, Math.max(0, progress));
  // 마지막에 살짝 튀어 오르는 느낌 (back ease)
  const c = 1.7;
  const e = 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2);
  return { scale: s.startScale + (1 - s.startScale) * e, alpha: Math.min(1, p * 1.5), offsetY: s.risePx * (1 - p) };
}

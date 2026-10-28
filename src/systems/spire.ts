/**
 * 마기수집첨탑 (조우 칸, 순수 로직). 씬은 이 상태기계가 내놓는 이벤트대로 첨탑을 움직이고 적을 소환한다.
 *  falling ──착지──▶ charging ──충전 100%──▶ rising ──▶ done
 * 충전: 첨탑 주변 원 안에서 처치한 적만 충전율을 올린다(원 밖 처치는 0).
 * 방해: 충전이 끝날 때까지 남은 적이 적으면 다음 무리가 나온다.
 * 크기(소형·중형)는 spireSize. 진행 규칙은 같고 등급 가중치·모습·강적만 다르다.
 */
import type { Rng } from '../core/rng';
import type { EnemyRank, GradeId, ItemsData, SpireData } from '../types/data';
import { rollItem } from './items';

export type SpirePhase = 'falling' | 'charging' | 'rising' | 'done';

export type SpireEvent = { type: 'landed' } | { type: 'spawn'; index: number } | { type: 'charged' } | { type: 'risen' };

export interface SpireRules {
  fallSec: number;
  riseSec: number;
  /** 처치 1회당 충전율 (적 등급별, 0~1) */
  chargePerKill: Partial<Record<EnemyRank, number>>;
  /** 살아 있는 방해 적이 이 수 이하가 되면 다음 무리 */
  minAlive: number;
  /** 무리 사이 최소 간격(초) */
  spawnGapSec: number;
}

/** 처치 한 번의 충전량: 원 밖이면 0 */
export function chargeGain(rank: EnemyRank, inCircle: boolean, perKill: SpireRules['chargePerKill']): number {
  return inCircle ? (perKill[rank] ?? 0) : 0;
}

/** 원 안 판정: 적의 몸이 원에 걸치면 안 */
export function inSpireCircle(dx: number, dy: number, radius: number, bodyRadius: number): boolean {
  return Math.hypot(dx, dy) <= radius + bodyRadius;
}

export class SpireState {
  phase: SpirePhase = 'falling';
  charge = 0;
  batches = 0;
  private t = 0;
  private gap = 0;

  constructor(private readonly rules: SpireRules) {}

  /** alive: 지금 살아 있는 방해 적 수 */
  update(dt: number, alive: number): SpireEvent[] {
    const r = this.rules;
    if (this.phase === 'falling') {
      this.t += dt;
      if (this.t < r.fallSec) return [];
      this.phase = 'charging';
      this.gap = 0;
      return [{ type: 'landed' }, ...this.update(0, alive)];
    }
    if (this.phase === 'charging') {
      this.gap -= dt;
      if (alive > r.minAlive || this.gap > 0) return [];
      this.gap = r.spawnGapSec;
      return [{ type: 'spawn', index: this.batches++ }];
    }
    if (this.phase === 'rising') {
      this.t += dt;
      if (this.t < r.riseSec) return [];
      this.phase = 'done';
      return [{ type: 'risen' }];
    }
    return [];
  }

  /** 방해 적 처치. 충전이 다 차면 상승을 시작한다 */
  onKill(rank: EnemyRank, inCircle: boolean): SpireEvent[] {
    if (this.phase !== 'charging') return [];
    this.charge = Math.min(1, this.charge + chargeGain(rank, inCircle, this.rules.chargePerKill));
    return this.charge >= 1 ? this.finish() : [];
  }

  /** 디버그: 즉시 충전 완료 */
  forceCharge(): SpireEvent[] {
    if (this.phase === 'done' || this.phase === 'rising') return [];
    this.charge = 1;
    return this.finish();
  }

  private finish(): SpireEvent[] {
    this.phase = 'rising';
    this.t = 0;
    return [{ type: 'charged' }];
  }
}

/** 방해 무리의 엘리트 수: 평소(전투 칸 웨이브) × 배율 */
export function spireEliteCount(normal: number, mul: number): number {
  return Math.round(normal * mul);
}

/**
 * 아이템 선택 카드: 서로 다른 아이템 count장. 장마다 등급 가중치(+확률 이전)로 뽑고,
 * 신화는 가중치 밖에서 고정 확률로 따로 판정한다. 이미 가진 아이템은 나오지 않는다.
 */
export function spireItemChoices(
  rng: Rng,
  weights: Partial<Record<GradeId, number>>,
  mythicChance: number,
  data: ItemsData,
  obtained: ReadonlySet<string>,
  count: number,
): string[] {
  const taken = new Set(obtained);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = rollItem(rng, weights, mythicChance, data, taken);
    if (!id) break;
    out.push(id);
    taken.add(id);
  }
  return out;
}

export type SpireSize = 'small' | 'medium';

/** 첨탑 크기: 중형은 챕터별로 그 스테이지부터 확률 (2장 후반 50%, 3장 100%), 아니면 소형 */
export function spireSize(rng: Rng, chapter: number, stage: number, medium: SpireData['medium']): SpireSize {
  const rule = medium.chance[String(chapter)];
  if (!rule || stage < rule.fromStage) return 'small';
  return rng.chance(rule.chance) ? 'medium' : 'small';
}

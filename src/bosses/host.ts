/**
 * 보스 패턴이 전투 씬에 바라는 것. RunScene이 구현한다.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import type { Hazard, HazardHost, Rect } from '../entities/hazard';

export interface BossHost extends HazardHost {
  readonly rng: Rng;
  t(key: string): string;
  addHazard(h: Hazard): void;
  /** 적 탄. refractable=false면 벡터굴절역장·칼 탄 베기로 지울 수 없다 */
  fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean): void;
  /** 보스가 있는 방 안쪽 */
  arena(): Rect;
}

/** 실행 중인 패턴 하나. 보스를 움직이고 위험 지대를 깐다 */
export interface PatternRun {
  update(dt: number): void;
  destroy(): void;
}

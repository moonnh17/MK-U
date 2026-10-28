/**
 * 보스 패턴이 전투 씬에 바라는 것. RunScene이 구현한다.
 */
import type { Vec2 } from '../core/actions';
import type { Rng } from '../core/rng';
import type { Enemy } from '../entities/enemy';
import type { Hazard, HazardHost, Rect } from '../entities/hazard';

export interface BossHost extends HazardHost {
  readonly rng: Rng;
  t(key: string): string;
  addHazard(h: Hazard): void;
  /** 적 탄. refractable=false면 벡터굴절역장·칼 탄 베기로 지울 수 없다 */
  fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean): void;
  /** 보스가 있는 방 안쪽 */
  arena(): Rect;
  /** 보스가 부르는 적. 방 웨이브 수에 들어가지 않고 보상이 없다. maxHp가 없으면 데이터 값 */
  spawnMinion(enemyId: string, at: Vec2, maxHp?: number): Enemy;
  /** 지금 챕터의 일반 적 id (폐허의 군세) */
  chapterRoster(): string[];
  removeMinion(e: Enemy): void;
  /** 지나갈 수 없는 장애물(지면 파괴 잔해). 문 근처·플레이어 자리면 만들지 않고 null */
  addObstacle(at: Vec2, radius: number, doorClear: number): { destroy(): void } | null;
}

/** 실행 중인 패턴 하나. 보스를 움직이고 위험 지대를 깐다 */
export interface PatternRun {
  update(dt: number): void;
  destroy(): void;
}

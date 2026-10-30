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
  /** 유도 미사일: 플레이어 쪽으로 초당 turnRate(rad)까지 휜다. 일반 탄처럼 굴절·탄 베기 가능 */
  fireEnemyMissile(from: Vec2, angle: number, speed: number, range: number, damage: number, turnRate: number): void;
  /** 이번 프레임 플레이어 이동에 속도를 더한다 (중력 붕괴) */
  pushPlayer(v: Vec2): void;
  /** 보스가 있는 방 안쪽 */
  arena(): Rect;
  /** 보스가 부르는 적. 방 웨이브 수에 들어가지 않고 보상이 없다. maxHp가 없으면 데이터 값 */
  spawnMinion(enemyId: string, at: Vec2, maxHp?: number): Enemy;
  /** 지금 챕터의 일반 적 id (폐허의 군세) */
  chapterRoster(): string[];
  removeMinion(e: Enemy): void;
  /** 보스 강화·단계 개방 연출: 번쩍임·짧은 확대·화면 가운데 큰 이름 */
  bossPhaseFx(text: string, color: string, at: Vec2): void;
  /** 지나갈 수 없는 장애물(지면 파괴 잔해). 문 근처·플레이어 자리면 만들지 않고 null */
  addObstacle(at: Vec2, radius: number, doorClear: number): { destroy(): void } | null;
}

/** 실행 중인 패턴 하나. 보스를 움직이고 위험 지대를 깐다 */
export interface PatternRun {
  update(dt: number): void;
  destroy(): void;
}

/**
 * 스킬 발동 함수가 전투 씬에 바라는 것. RunScene이 구현한다.
 * 스킬은 키·터치를 모르고, 피해는 항상 실제 공격(source)의 태그로 계산한다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { GameContext } from '../core/context';
import type { BuffView } from '../core/session';
import type { Rng } from '../core/rng';
import type { Enemy } from '../entities/enemy';
import type { Stats } from '../systems/damage';
import type { ShieldState } from '../systems/shield';
import type { OwnedSkill } from '../systems/skills';
import type { SkillDef, SpriteRef, TagId, UltimateDef } from '../types/data';

export interface SkillHost {
  readonly scene: Phaser.Scene;
  readonly ctx: GameContext;
  readonly rng: Rng;
  playerPos(): Vec2;
  /** 마지막 조준 방향 (단위 벡터) */
  aimDir(): Vec2;
  /** 살아 있는 적 */
  enemies(): readonly Enemy[];
  stats(): Stats;
  /** 스킬 범위(반지름) 보정: 마기력 */
  area(radius: number): number;
  /** 피해 한 번. base는 태그 보정 전 값, tags는 이 공격(source)의 태그. 이번에 죽였으면 true */
  hit(enemy: Enemy, base: number, tags: readonly TagId[]): boolean;
  /** 출혈을 건다. base는 중첩 1개당 틱 피해(태그 보정 전), tags는 출혈 공격 source의 태그 */
  bleed(enemy: Enemy, base: number, stacks: number, tags: readonly TagId[]): void;
  /** 탄 하나 (벽에 막히고, 사거리를 넘으면 사라진다) */
  fireBullet(from: Vec2, angle: number, speed: number, range: number, base: number, tags: readonly TagId[]): void;
  /** 스테이지가 끝날 때까지 매 프레임 도는 오브젝트(포탑·투사체 등) */
  addObject(o: SkillObject): void;
  removeObject(o: SkillObject): void;
  objects(): readonly SkillObject[];
  /** 충전 시간 (차징 태그: 민첩) */
  chargeTime(baseSec: number, tags: readonly TagId[]): number;
  /** 시간제 버프 지속시간 (버프 태그: 정신력) */
  buffDuration(baseSec: number, tags: readonly TagId[]): number;
  /** 플레이어 보호막(마기역장)을 씌운다. 다시 쓰면 새것으로 바뀐다 */
  setShield(shield: ShieldState, opts: ShieldOpts): void;
  /** 짧은 이펙트를 fxSec 뒤에 지운다 */
  fx(obj: Phaser.GameObjects.GameObject, sec?: number): void;
  /** 색 사각형 텍스처 스프라이트 */
  sprite(x: number, y: number, ref: SpriteRef): Phaser.GameObjects.Image;
}

export type { BuffView };

export interface ShieldOpts {
  /** 막은 뒤 잠깐 무적(초) */
  blockInvulnSec: number;
  color: string;
  /** 플레이어 둘레 표시 반지름(px) */
  fxRadius: number;
}

export interface SkillObject {
  /** 어떤 스킬이 만들었는지 (최대 개수 관리) */
  readonly owner: string;
  readonly createdAt: number;
  /** false를 돌려주면 제거된다 */
  update(dt: number, host: SkillHost): boolean;
  destroy(): void;
  /** HUD에 버프로 보일 상태 (반물질포 충전 등) */
  buff?(host: SkillHost): BuffView | null;
}

export interface SkillCast {
  def: SkillDef;
  owned: OwnedSkill;
  values: Record<string, number>;
}

export interface SkillImpl {
  /** 발동. false면 발동하지 않은 것(쿨타임이 돌지 않음) */
  cast(host: SkillHost, s: SkillCast): boolean;
}

/** 패시브: 장착되면 한 번 불려 상시 오브젝트(드론 등)를 깐다. 해제·레벨 변경 시 그 오브젝트를 치우고 다시 부른다 */
export interface PassiveImpl {
  activate(host: SkillHost, s: SkillCast): void;
}

export interface UltimateImpl {
  cast(host: SkillHost, def: UltimateDef): boolean;
}

/** 가장 가까운 적 (최대 거리 안, 적 몸 반지름 포함) */
export function nearestEnemy(host: SkillHost, from: Vec2, maxDist = Infinity): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of host.enemies()) {
    const d = Math.hypot(e.sprite.x - from.x, e.sprite.y - from.y);
    if (d <= maxDist + e.radius && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** 같은 owner 오브젝트가 keep개 이하가 되도록 오래된 것부터 치운다 */
export function trimOldest(host: SkillHost, owner: string, keep: number): void {
  const mine = host
    .objects()
    .filter((o) => o.owner === owner)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (let i = 0; i < mine.length - keep; i++) host.removeObject(mine[i]!);
}
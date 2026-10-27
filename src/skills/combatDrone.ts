/**
 * 전투 드론 (헥타르 패시브, 기술·원거리). 장착하면 드론이 플레이어 둘레를 상시 공전하며
 * 사거리 안의 가장 가까운 적을 쏜다. 레벨마다 드론 수 증가. 적에게 맞지 않는다.
 * 각성 '군집지성': 드론이 각자 움직이며 목표를 고른다(강적·보스 우선, 같으면 가까운 적).
 * 목표가 없으면 플레이어 곁으로 돌아온다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { skillTags } from '../systems/tags';
import { priorityTarget, ringPoints } from '../systems/targeting';
import { nearestEnemy, type PassiveImpl, type SkillCast, type SkillHost, type SkillObject } from './host';

const ID = 'combatDrone';

class Drone implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Image;
  private pos: Vec2;
  private phase = 0;
  private fireTimer: number;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly index: number,
    private readonly count: number,
  ) {
    this.createdAt = host.scene.time.now;
    this.pos = this.orbitPoint(host);
    this.img = host.sprite(this.pos.x, this.pos.y, s.def.sprites.drone!).setDepth(5);
    // 여러 기가 한꺼번에 쏘지 않게 첫 발을 나눈다
    this.fireTimer = (s.values.fireIntervalSec! * index) / count;
  }

  private orbitPoint(host: SkillHost): Vec2 {
    return ringPoints(host.playerPos(), this.count, this.s.values.orbitRadius!, this.phase)[this.index]!;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.phase += v.orbitSpeed! * dt;
    this.fireTimer -= dt;
    const target = this.s.owned.awakened ? this.swarm(dt, host) : this.orbit(host);
    this.img.setPosition(this.pos.x, this.pos.y);
    if (!target || this.fireTimer > 0) return true;
    const dist = Math.hypot(target.x - this.pos.x, target.y - this.pos.y);
    if (dist > v.range!) return true;
    const angle = Math.atan2(target.y - this.pos.y, target.x - this.pos.x);
    host.fireBullet(this.pos, angle, v.projectileSpeed!, v.range!, v.damage!, skillTags(this.s.def, this.s.owned.awakened, 'droneShot'));
    this.fireTimer = v.fireIntervalSec!;
    return true;
  }

  /** 기본: 플레이어 둘레 공전, 드론 위치에서 가장 가까운 적 */
  private orbit(host: SkillHost): Vec2 | null {
    this.pos = this.orbitPoint(host);
    const e = nearestEnemy(host, this.pos, this.s.values.range!);
    return e ? { x: e.sprite.x, y: e.sprite.y } : null;
  }

  /** 각성: 우선 목표 쪽으로 날아가 standoff 거리에서 맴돈다 */
  private swarm(dt: number, host: SkillHost): Vec2 | null {
    const v = this.s.values;
    const enemies = host.enemies();
    const i = priorityTarget(
      this.pos,
      enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius, rank: e.def.rank })),
      v.searchRange!,
      host.ctx.data.skills.targetWeights,
    );
    const e = enemies[i];
    const target = e ? { x: e.sprite.x, y: e.sprite.y } : null;
    const goal = target ? ringPoints(target, this.count, v.standoff!, this.phase)[this.index]! : this.orbitPoint(host);
    const dx = goal.x - this.pos.x;
    const dy = goal.y - this.pos.y;
    const d = Math.hypot(dx, dy);
    const step = Math.min(d, v.moveSpeed! * dt);
    if (d > 0) this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
    return target;
  }

  destroy(): void {
    this.img.destroy();
  }
}

export const combatDrone: PassiveImpl = {
  activate(host, s) {
    const n = s.values.count!;
    for (let i = 0; i < n; i++) host.addObject(new Drone(host, s, i, n));
  },
};

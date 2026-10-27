/**
 * 반물질포 (헥타르, 기술·원거리·차징).
 * 누르면 충전(민첩으로 빨라짐)한 뒤 가장 가까운 적에게 대형 포탄을 쏜다. 충전 중에도 움직일 수 있다.
 * 각성 '다연장반입자포': 충전 뒤 4포신이 연속 포격하고, 매 발 밀집 지역·강적을 자동 조준한다.
 */
import type Phaser from 'phaser';
import { skillTags } from '../systems/tags';
import { bestClusterTarget } from '../systems/targeting';
import { Explosive } from './explosive';
import { nearestEnemy, type BuffView, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'antimatterCannon';

class Charge implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly orb: Phaser.GameObjects.Image;
  private readonly total: number;
  private t = 0;
  private shotsLeft: number;
  private shotTimer = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
    this.total = host.chargeTime(s.values.chargeSec!, skillTags(s.def, s.owned.awakened));
    this.shotsLeft = s.owned.awakened ? s.values.barrels! : 1;
    this.orb = host.sprite(0, 0, s.def.sprites.charge!).setDepth(6);
    this.follow(host);
  }

  update(dt: number, host: SkillHost): boolean {
    this.follow(host);
    if (this.t < this.total) {
      this.t += dt;
      this.orb.setScale(1 + (2 * Math.min(1, this.t / this.total)));
      return true;
    }
    this.shotTimer -= dt;
    if (this.shotTimer > 0) return true;
    this.fire(host);
    this.shotsLeft--;
    this.shotTimer = this.s.values.barrelIntervalSec ?? 0;
    return this.shotsLeft > 0;
  }

  private follow(host: SkillHost): void {
    const p = host.playerPos();
    const aim = host.aimDir();
    this.orb.setPosition(p.x + aim.x * 8, p.y + aim.y * 8);
  }

  private fire(host: SkillHost): void {
    const v = this.s.values;
    const from = host.playerPos();
    const enemies = host.enemies();
    let target = null;
    if (this.s.owned.awakened) {
      const inRange = enemies.filter((e) => Math.hypot(e.sprite.x - from.x, e.sprite.y - from.y) <= v.range! + e.radius);
      const i = bestClusterTarget(
        inRange.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius, rank: e.def.rank })),
        host.area(v.clusterRadius!),
        host.ctx.data.skills.targetWeights,
      );
      target = inRange[i] ?? null;
    } else {
      target = nearestEnemy(host, from, v.range!);
    }
    const aim = host.aimDir();
    const to = target ? { x: target.sprite.x, y: target.sprite.y } : { x: from.x + aim.x * v.range!, y: from.y + aim.y * v.range! };
    host.addObject(
      new Explosive(host, {
        owner: `${ID}.shell`,
        from,
        to,
        speed: v.projectileSpeed!,
        radius: host.area(v.radius!),
        base: v.damage!,
        tags: skillTags(this.s.def, this.s.owned.awakened, 'blast'),
        sprite: this.s.def.sprites.shell!,
      }),
    );
  }

  buff(host: SkillHost): BuffView | null {
    if (this.t >= this.total) return null;
    return { id: ID, label: host.ctx.t('buff.charging'), color: this.s.def.color, leftSec: this.total - this.t, totalSec: this.total };
  }

  destroy(): void {
    this.orb.destroy();
  }
}

export const antimatterCannon: SkillImpl = {
  cast(host, s) {
    host.addObject(new Charge(host, s));
    return true;
  },
};

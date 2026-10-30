/**
 * 마기 자동포탑 (헥타르, 기술·원거리).
 * 누르면 플레이어 자리에 포탑을 설치한다. 레벨마다 최대 설치 수 증가, 넘치면 가장 오래된 포탑이 사라진다.
 * 다리는 고정이고 머리만 적을 향해 돈다.
 * 각성 '대형권역사수주포': 대형 포탑 1기가 일반 탄환(물리)·레이저(기술)·폭발탄(기술)을 각자 쏜다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { getContext } from '../core/context';
import { hexColor } from '../core/scale';
import { skillTags } from '../systems/tags';
import { Explosive } from './explosive';
import { nearestEnemy, trimOldest, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'magiTurret';

class Turret implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly legs: Phaser.GameObjects.Image;
  private readonly head: Phaser.GameObjects.Image;
  private readonly tilt: number;
  private readonly muzzlePx: number;
  private readonly timers = { shot: 0, bullet: 0, laser: 0, shell: 0 };

  constructor(
    host: SkillHost,
    private readonly pos: Vec2,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
    const ref = s.owned.awakened ? s.def.sprites.bigTurret! : s.def.sprites.turret!;
    const headRef = s.owned.awakened ? s.def.sprites.bigTurretHead! : s.def.sprites.turretHead!;
    const aim = getContext().data.art.sprites[headRef.spriteKey]?.aim;
    this.legs = host.sprite(pos.x, pos.y, ref).setDepth(2);
    this.head = host.sprite(pos.x, pos.y + (aim?.mountY ?? 0), headRef).setDepth(2.1);
    if (aim) this.head.setOrigin(aim.pivotX, aim.pivotY);
    this.tilt = ((aim?.tiltDeg ?? 0) * Math.PI) / 180;
    this.muzzlePx = aim?.muzzlePx ?? 0;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    for (const k of Object.keys(this.timers) as (keyof typeof this.timers)[]) this.timers[k] -= dt;
    const target = nearestEnemy(host, this.pos, v.range!);
    if (!target) return true;
    const angle = Math.atan2(target.sprite.y - this.pos.y, target.sprite.x - this.pos.x);
    // 왼쪽을 볼 때는 뒤집어 머리가 거꾸로 서지 않게. 총구가 그림에서 살짝 위로 기울어 있어 그만큼 돌린다
    const left = Math.cos(angle) < 0;
    this.head.setFlipY(left).setRotation(angle + (left ? -this.tilt : this.tilt));
    const muzzle = { x: this.head.x + Math.cos(angle) * this.muzzlePx, y: this.head.y + Math.sin(angle) * this.muzzlePx };
    const tags = (source: string) => skillTags(this.s.def, this.s.owned.awakened, source);

    if (!this.s.owned.awakened) {
      if (this.timers.shot <= 0) {
        host.fireBullet(muzzle, angle, v.projectileSpeed!, v.range!, v.damage!, tags('shot'));
        this.timers.shot = v.fireIntervalSec!;
      }
      return true;
    }

    if (this.timers.bullet <= 0) {
      host.fireBullet(muzzle, angle, v.projectileSpeed!, v.range!, v.bulletDamage!, tags('bigBullet'));
      this.timers.bullet = v.bulletIntervalSec!;
    }
    if (this.timers.laser <= 0) {
      const g = host.scene.add.graphics().setDepth(6);
      g.lineStyle(2, hexColor(this.s.def.color), 0.9);
      g.lineBetween(muzzle.x, muzzle.y, target.sprite.x, target.sprite.y);
      host.fx(g);
      host.hit(target, v.laserDamage!, tags('laser'));
      this.timers.laser = v.laserIntervalSec!;
    }
    if (this.timers.shell <= 0) {
      host.addObject(
        new Explosive(host, {
          owner: `${ID}.shell`,
          from: muzzle,
          to: { x: target.sprite.x, y: target.sprite.y },
          speed: v.shellSpeed!,
          radius: host.area(v.shellRadius!),
          base: v.shellDamage!,
          tags: tags('shell'),
          sprite: this.s.def.sprites.shell!,
        }),
      );
      this.timers.shell = v.shellIntervalSec!;
    }
    return true;
  }

  destroy(): void {
    this.legs.destroy();
    this.head.destroy();
  }
}

export const magiTurret: SkillImpl = {
  cast(host, s) {
    // 최대 설치 수를 넘으면 오래된 것부터 치운다
    trimOldest(host, ID, s.values.maxCount! - 1);
    host.addObject(new Turret(host, host.playerPos(), s));
    return true;
  },
};

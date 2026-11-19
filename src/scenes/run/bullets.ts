/** 탄 갱신(사거리·유도), 적 탄 발사·피격·흡수. */
import type Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { hexColor } from '../../core/scale';
import { fitArt } from '../../entities/art';
import { nearestEnemy } from '../../skills/host';
import { loopArt } from '../../skills/skillFx';
import { steerToward } from '../../systems/motion';
import type { SpriteRef } from '../../types/data';
import type { RunScene } from '../RunScene';

export class BulletRuntime {
  constructor(private readonly run: RunScene) {}

  updateBullets(dt: number): void {
    for (const b of this.run.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const dist = Math.hypot(b.x - (b.getData('ox') as number), b.y - (b.getData('oy') as number));
      if (dist > (b.getData('range') as number)) {
        b.destroy();
        continue;
      }
      this.run.combat.bulletLook(b, dist, dt);
      // 유도탄(지팡이): 남은 사거리 안 가장 가까운 적 쪽으로 휜다
      const turn = b.getData('homing') as number;
      if (turn > 0) {
        const t = nearestEnemy(this.run.skillRt.hostFor('weapon'), b, (b.getData('range') as number) - dist);
        if (t) {
          const body = b.body as Phaser.Physics.Arcade.Body;
          const v = steerToward(body.velocity, b, t.sprite, turn, dt);
          b.setVelocity(v.x, v.y);
        }
      }
    }
    for (const b of this.run.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const range = b.getData('range') as number | undefined;
      if (range !== undefined && Math.hypot(b.x - (b.getData('ox') as number), b.y - (b.getData('oy') as number)) > range) {
        b.destroy();
        continue;
      }
      const turn = (b.getData('homing') as number | undefined) ?? 0;
      if (turn > 0) {
        const v = steerToward((b.body as Phaser.Physics.Arcade.Body).velocity, b, this.run.player, turn, dt);
        b.setVelocity(v.x, v.y);
        // 휘는 동안에도 머리가 날아가는 쪽을 본다
        b.setRotation(Math.atan2(v.y, v.x));
      }
    }
  }

  /** 식광의 핵: at 둘레의 약한 적 탄(굴절 가능)을 지운다 */
  absorbEnemyBullets(at: Vec2, radius: number): number {
    let n = 0;
    for (const b of [...(this.run.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[])]) {
      if (b.getData('refractable') === false || Math.hypot(b.x - at.x, b.y - at.y) > radius) continue;
      b.destroy();
      n++;
    }
    return n;
  }

  /** 적 탄. refractable=false면 굴절·탄 베기 불가(보스 대형 레이저 등). homing: 플레이어 쪽으로 휘는 속도(rad/s, 유도 미사일) */
  fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean, homing = 0, mental = 0, sprite?: SpriteRef, tint?: string): void {
    const ep = this.run.ctx.data.enemies.projectile;
    const b = this.run.enemyBullets.create(from.x, from.y, sprite?.spriteKey ?? ep.spriteKey) as Phaser.Physics.Arcade.Sprite;
    this.run.enemyBulletLayer.add(b);
    if (tint) b.setTint(hexColor(tint));
    fitArt(this.run.ctx.data, b, ep.size, ep.height ?? ep.size);
    // 보스 전용 탄: 날아가는 쪽을 보고 프레임이 돈다
    if (sprite) {
      b.setRotation(angle);
      loopArt(b, sprite);
    }
    b.setDepth(5);
    b.setData({ damage, mental, refractable, cuttable: refractable, range, ox: from.x, oy: from.y, homing });
    // 굴절 불가 탄은 붉게, 유도 미사일은 크게
    if (!refractable && !sprite) b.setTint(0xff2a2a);
    if (homing > 0 && !sprite) b.setScale(1.5);
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  onEnemyBulletHit(b: Phaser.Physics.Arcade.Image): void {
    if (!b.active) return;
    // 구르는 동안에는 탄이 몸을 지나간다 (헥타르 RAM: 스칠 때 에너지)
    if (this.run.condition.dodge.invuln > 0) {
      if (!b.getData('grazed')) {
        b.setData('grazed', true);
        this.run.itemRt.onDodgeAvoid();
        const graze = this.run.itemRt.first('grazeEnergy');
        if (graze) {
          const p = this.run.session.player;
          p.energy = Math.min(p.energyMax, p.energy + graze.value);
          this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y - 6 }, `+${graze.value}`, this.run.ctx.data.ui.hud.bars.energyColor);
        }
      }
      return;
    }
    const damage = b.getData('damage') as number;
    const mental = b.getData('mental') as number | undefined;
    b.destroy();
    this.run.hurtPlayer(damage, null, mental);
  }
}

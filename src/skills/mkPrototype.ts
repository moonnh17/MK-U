/**
 * MK : 프로토타입 (아크로, 버프). 적이 없어도 쓸 수 있다. 입을 때 변신하고, 시간이 다 되면 해제 동작 뒤 벗는다.
 * 지속시간(버프 태그) 동안 슈트를 입는다: 이동속도 증가, 받는 피해 감소,
 * 사거리 안 가장 가까운 적을 자동 펀치(물리·근접).
 * 각성 'MK : 오버드라이브': 쓸 때 현재 체력 일부를 소모(죽지 않음). 펀치가 주변까지 터지는 폭발 펀치가 되고,
 * 펀치 사거리 밖 적에게는 짧게 돌진한다(돌진에 닿은 적도 피해, 물리·근접).
 */
import type Phaser from 'phaser';
import type { Enemy } from '../entities/enemy';
import { skillTags } from '../systems/tags';
import type { PlayerMods } from '../systems/vitals';
import { animKey } from '../systems/art';
import { levelRef, playFx } from './skillFx';
import type { SpriteRef } from '../types/data';
import { nearestEnemy, trimOldest, type BuffView, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'mkPrototype';
/** 이만큼 빠르면 걷는 그림 */
const MOVING_SPEED = 5;
const FIST_SEC = 0.1;
const POSE_SEC = 0.25;
/** 입을 때 작게 시작해 커진다 */
const MORPH_START_SCALE = 0.7;

class Suit implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly body: Phaser.GameObjects.Sprite;
  /** 변신·펀치 자세가 끝나기 전에는 대기·이동으로 돌아가지 않는다 */
  private poseLeft = 0;
  private shown: SpriteRef | null = null;
  private left: number;
  /** 해제 동작 남은 시간 (이때는 효과가 없다) */
  private releasing = 0;
  private punchTimer = 0;
  private dashTimer = 0;
  private readonly player: Phaser.Physics.Arcade.Sprite;
  private dashing = 0;
  private readonly dashHit = new Set<Enemy>();

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly total: number,
  ) {
    this.player = host.playerSprite();
    this.createdAt = host.scene.time.now;
    this.left = total;
    const pl = host.playerSprite();
    this.body = host.sprite(pl.x, pl.y, this.art('idle')).setDepth(pl.depth);
    pl.setVisible(false);
    if (s.owned.awakened) playFx(host.scene, s.def.sprites.drainA!, pl.x, pl.y, { depth: pl.depth + 1 });
    const morph = this.art('morph');
    this.pose(host, morph, this.animSec(morph));
    playFx(host.scene, s.def.sprites.flash!, pl.x, pl.y, { w: 44, depth: pl.depth + 1 });
    this.body.setScale(MORPH_START_SCALE);
    host.scene.tweens.add({ targets: this.body, scale: 1, duration: this.animSec(morph) * 1000, ease: 'Back.easeOut' });
  }

  /** 그림의 애니메이션 한 바퀴 시간 */
  private animSec(ref: SpriteRef): number {
    const a = this.body.scene.anims.get(animKey(ref.spriteKey, 'play'));
    return a ? a.duration / 1000 : POSE_SEC;
  }

  /** 해제: 각성은 전용 동작, 아니면 변신을 거꾸로 되감는다 */
  private startRelease(host: SkillHost): void {
    const ref = this.s.owned.awakened ? this.s.def.sprites.releaseA! : this.art('morph');
    const key = animKey(ref.spriteKey, 'play');
    this.shown = null;
    if (this.s.owned.awakened) this.body.play(key);
    else this.body.playReverse(key);
    this.releasing = this.animSec(ref);
    const c = host.playerSprite().getCenter();
    playFx(host.scene, this.s.def.sprites.flash!, c.x, c.y, { w: 30, depth: this.body.depth + 1 });
  }

  /** 각성이면 A 그림, 아니면 레벨 그림 */
  private art(name: string): SpriteRef {
    return this.s.owned.awakened ? this.s.def.sprites[`${name}A`]! : levelRef(this.s, name);
  }

  private show(ref: SpriteRef): void {
    if (this.shown === ref) return;
    this.shown = ref;
    const key = animKey(ref.spriteKey, 'play');
    if (this.body.scene.anims.exists(key)) this.body.play(key);
    else {
      this.body.anims.stop();
      this.body.setTexture(ref.spriteKey, 0);
    }
  }

  private pose(_host: SkillHost, ref: SpriteRef, sec: number): void {
    this.shown = null;
    this.show(ref);
    this.poseLeft = sec;
  }

  private place(host: SkillHost): void {
    const pl = host.playerSprite();
    const c = pl.getCenter();
    this.body.setPosition(c.x, c.y).setFlipX(host.aimDir().x < 0).setAlpha(pl.alpha);
  }

  /** 슈트 그림: 플레이어를 따라가고, 자세가 끝나면 대기·이동 */
  private follow(host: SkillHost, dt: number): void {
    const pl = host.playerSprite();
    this.place(host);
    this.poseLeft -= dt;
    if (this.poseLeft > 0) return;
    const moving = Math.hypot(pl.body!.velocity.x, pl.body!.velocity.y) > MOVING_SPEED;
    this.show(this.art(moving ? 'move' : 'idle'));
  }

  playerMods(): Partial<PlayerMods> {
    if (this.releasing > 0) return {};
    return { moveSpeed: this.s.values.moveSpeed!, damageReduction: this.s.values.damageReduction! };
  }

  update(dt: number, host: SkillHost): boolean {
    if (this.releasing > 0) {
      this.place(host);
      this.releasing -= dt;
      return this.releasing > 0;
    }
    this.left -= dt;
    if (this.left <= 0) {
      this.startRelease(host);
      return true;
    }
    const v = this.s.values;
    const p = host.playerPos();
    this.follow(host, dt);
    this.punchTimer -= dt;
    this.dashTimer -= dt;

    if (this.dashing > 0) {
      this.dashing -= dt;
      const tags = skillTags(this.s.def, true, 'dash');
      for (const e of [...host.enemies()]) {
        if (this.dashHit.has(e) || Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) > e.radius + v.fxRadius!) continue;
        this.dashHit.add(e);
        host.hit(e, v.dashDamage!, tags);
      }
      return true;
    }

    const target = nearestEnemy(host, p, host.area(v.range!));
    if (target && this.punchTimer <= 0) {
      this.punch(host, target);
      this.punchTimer = v.punchIntervalSec!;
    } else if (!target && this.s.owned.awakened && this.dashTimer <= 0) {
      const far = nearestEnemy(host, p, v.dashRange!);
      if (far) {
        const dx = far.sprite.x - p.x;
        const dy = far.sprite.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        host.dash({ x: dx / d, y: dy / d }, v.dashSpeed!, v.dashSec!);
        this.dashing = v.dashSec!;
        this.pose(host, this.s.def.sprites.moveA!, v.dashSec!);
        this.dashHit.clear();
        this.dashTimer = v.dashCooldownSec!;
      }
    }
    return true;
  }

  private punch(host: SkillHost, target: Enemy): void {
    const v = this.s.values;
    const tags = skillTags(this.s.def, this.s.owned.awakened, 'punch');
    const c = { x: target.sprite.x, y: target.sprite.y };
    const sp = this.s.def.sprites;
    if (!this.s.owned.awakened) {
      this.pose(host, this.art('punch'), POSE_SEC);
      this.throwFist(host, c);
      playFx(host.scene, sp.flash!, c.x, c.y);
      host.hit(target, v.punchDamage!, tags);
      return;
    }
    // 폭발 펀치: 맞은 적 둘레까지
    const r = host.area(v.blastRadius!);
    this.pose(host, sp.blastPunchA!, POSE_SEC);
    this.throwFist(host, c);
    playFx(host.scene, sp.blast!, c.x, c.y, { w: r * 2.2 });
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= r + e.radius) host.hit(e, v.punchDamage!, tags);
    }
  }

  /** 주먹이 슈트에서 적까지 날아간다 */
  private throwFist(host: SkillHost, to: { x: number; y: number }): void {
    const from = this.body;
    const fist = host.sprite(from.x, from.y, this.s.owned.awakened ? this.s.def.sprites.fist3! : levelRef(this.s, 'fist'));
    fist.setDepth(6).setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    host.scene.tweens.add({ targets: fist, x: to.x, y: to.y, duration: FIST_SEC * 1000, onComplete: () => fist.destroy() });
  }

  buff(host: SkillHost): BuffView | null {
    if (this.releasing > 0) return null;
    const key = this.s.owned.awakened ? 'buff.mkPrototype.overdrive' : 'buff.mkPrototype';
    return { id: ID, label: host.ctx.t(key), color: this.s.def.color, leftSec: this.left, totalSec: this.total };
  }

  destroy(): void {
    this.body.scene.tweens.killTweensOf(this.body);
    this.body.destroy();
    this.player.setVisible(true);
  }
}

export const mkPrototype: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    if (s.owned.awakened) host.payHp(v.hpCost!);
    // 다시 입으면 새 슈트로
    trimOldest(host, ID, 0);
    host.addObject(new Suit(host, s, host.buffDuration(v.durationSec!, skillTags(s.def, s.owned.awakened))));
    return true;
  },
};

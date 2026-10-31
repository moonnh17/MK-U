/**
 * 마기 자동포탑 (헥타르, 기술·원거리).
 * 누르면 플레이어 자리에 포탑을 설치한다. 레벨마다 최대 설치 수 증가, 넘치면 가장 오래된 포탑이 사라진다.
 * 다리는 고정이고 머리만 적을 향해 돈다. 쏠 때마다 포신이 뒤로 밀렸다 돌아온다.
 * 각성 '대형권역사수주포': 대형 포탑 1기가 일반 탄환(물리)·레이저(기술)·폭발탄(기술)을 각자 쏜다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { SpriteRef } from '../types/data';
import { getContext } from '../core/context';
import { skillTags } from '../systems/tags';
import { Explosive } from './explosive';
import { animKey } from '../systems/art';
import { levelRef, loopArt, playFx, poseThen, stretchFx } from './skillFx';
import { nearestEnemy, trimOldest, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'magiTurret';
/** 각성 포탑의 총구 거리·광선 굵기 (그림 기준) */
const BIG_MUZZLE_PX = 16;
const BEAM_PX = 8;

class Turret implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  /** Lv1~3: 다리 고정, 머리만 돈다 */
  private legs: Phaser.GameObjects.Sprite | null = null;
  private head: Phaser.GameObjects.Sprite | null = null;
  /** 각성: 포탑 전체 애니메이션 (원본이 왼쪽을 본다) */
  private big: Phaser.GameObjects.Sprite | null = null;
  private tilt = 0;
  private muzzlePx = 0;
  private readonly timers = { shot: 0, bullet: 0, laser: 0, shell: 0 };
  /** 포신 자리와 반동 (1 = 막 쏨, 0 = 제자리) */
  private restX = 0;
  private restY = 0;
  private angle = 0;
  private recoil = 0;

  constructor(
    host: SkillHost,
    private readonly pos: Vec2,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
    this.restX = pos.x;
    this.restY = pos.y;
    const sp = s.def.sprites;
    if (s.owned.awakened) {
      this.big = host.sprite(pos.x, pos.y, sp.bigIdle!).setDepth(2);
      loopArt(this.big, sp.bigIdle!);
      this.muzzlePx = BIG_MUZZLE_PX;
      return;
    }
    const headRef = levelRef(s, 'turretHead');
    const aim = getContext().data.art.sprites[headRef.spriteKey]?.aim;
    this.legs = host.sprite(pos.x, pos.y, levelRef(s, 'turret')).setDepth(2);
    this.head = host.sprite(pos.x, pos.y + (aim?.mountY ?? 0), headRef).setDepth(2.1);
    if (aim) this.head.setOrigin(aim.pivotX, aim.pivotY);
    this.restY = this.head.y;
    this.tilt = ((aim?.tiltDeg ?? 0) * Math.PI) / 180;
    this.muzzlePx = aim?.muzzlePx ?? 0;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    const sp = this.s.def.sprites;
    for (const k of Object.keys(this.timers) as (keyof typeof this.timers)[]) this.timers[k] -= dt;
    this.stepRecoil(dt, host);
    const target = nearestEnemy(host, this.pos, v.range!);
    if (!target) return true;
    const angle = Math.atan2(target.sprite.y - this.pos.y, target.sprite.x - this.pos.x);
    this.angle = angle;
    const left = Math.cos(angle) < 0;
    // 왼쪽을 볼 때는 뒤집어 머리가 거꾸로 서지 않게. 총구가 그림에서 살짝 위로 기울어 있어 그만큼 돌린다
    this.head?.setFlipY(left).setRotation(angle + (left ? -this.tilt : this.tilt));
    this.big?.setFlipX(!left);
    const muzzle = { x: this.restX + Math.cos(angle) * this.muzzlePx, y: this.restY + Math.sin(angle) * this.muzzlePx };
    const tags = (source: string) => skillTags(this.s.def, this.s.owned.awakened, source);

    if (!this.s.owned.awakened) {
      if (this.timers.shot <= 0) {
        host.fireBullet(muzzle, angle, v.projectileSpeed!, v.range!, v.damage!, tags('shot'));
        this.recoil = 1;
        this.timers.shot = v.fireIntervalSec!;
      }
      return true;
    }

    if (this.timers.bullet <= 0) {
      host.fireBullet(muzzle, angle, v.projectileSpeed!, v.range!, v.bulletDamage!, tags('bigBullet'), sp.bullet);
      this.recoil = 1;
      this.pose(sp.bigRapid!, false);
      this.timers.bullet = v.bulletIntervalSec!;
    }
    if (this.timers.laser <= 0) {
      stretchFx(host.scene, sp.beam!, muzzle, target.sprite, BEAM_PX);
      playFx(host.scene, sp.hit!, target.sprite.x, target.sprite.y);
      this.pose(sp.bigLaser!, true);
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
          sprite: sp.shell!,
          blasts: [sp.blast!],
        }),
      );
      this.recoil = 1;
      this.pose(sp.bigShell!, true);
      this.timers.shell = v.shellIntervalSec!;
    }
    return true;
  }

  /** 쏜 방향 반대로 밀렸다 돌아온다. 머리는 포신 축으로 눌렸다 펴진다 */
  private stepRecoil(dt: number, host: SkillHost): void {
    const r = host.ctx.data.juice.turretRecoil;
    this.recoil = Math.max(0, this.recoil - dt / r.sec);
    const k = this.recoil * this.recoil;
    const px = (this.head ? r.px : r.bigPx) * k;
    const body = this.head ?? this.big!;
    body.setPosition(this.restX - Math.cos(this.angle) * px, this.restY - Math.sin(this.angle) * px);
    this.head?.setScale(1 - r.squash * k, 1);
  }

  /** 각성 포탑 자세: 연사는 다른 자세를 끊지 않고, 레이저·포격은 연사만 끊는다 */
  private pose(ref: SpriteRef, strong: boolean): void {
    const big = this.big!;
    const sp = this.s.def.sprites;
    const key = big.anims.currentAnim?.key;
    const idle = key === undefined || key === animKey(sp.bigIdle!.spriteKey, 'play');
    if (big.anims.isPlaying && !idle && !(strong && key === animKey(sp.bigRapid!.spriteKey, 'play'))) return;
    poseThen(big, ref, sp.bigIdle!);
  }

  destroy(): void {
    this.legs?.destroy();
    this.head?.destroy();
    this.big?.destroy();
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

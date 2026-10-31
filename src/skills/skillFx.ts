/**
 * 스킬 그림: 레벨별 그림 고르기와 애니메이션 이펙트 재생.
 * art.json의 anims.play가 있으면 그 프레임대로, 한 장짜리면 잠깐 보였다가 사라진다.
 */
import type Phaser from 'phaser';
import { animKey } from '../systems/art';
import type { SpriteRef } from '../types/data';
import type { SkillCast } from './host';

/** 레벨별 그림: sprites의 '이름+레벨'. 없으면 이름 그대로 */
export function levelRef(s: Pick<SkillCast, 'def' | 'owned'>, name: string): SpriteRef {
  return s.def.sprites[`${name}${s.owned.level}`] ?? s.def.sprites[name]!;
}

export interface FxOpts {
  /** 화면 폭(없으면 그림 크기). h가 없으면 비율 유지 */
  w?: number;
  h?: number;
  rotation?: number;
  depth?: number;
  originX?: number;
  flipX?: boolean;
  /** 한 장짜리 그림이 사라지는 시간(초) */
  fadeSec?: number;
}

/** 이펙트 한 번. 반복 애니메이션이면 호출한 쪽이 지운다 */
export function playFx(scene: Phaser.Scene, ref: SpriteRef, x: number, y: number, o: FxOpts = {}): Phaser.GameObjects.Sprite {
  const sp = scene.add.sprite(x, y, ref.spriteKey).setDepth(o.depth ?? 6).setRotation(o.rotation ?? 0).setFlipX(o.flipX ?? false);
  if (o.originX !== undefined) sp.setOrigin(o.originX, 0.5);
  if (o.w !== undefined) sp.setDisplaySize(o.w, o.h ?? (o.w * sp.height) / Math.max(1, sp.width));
  const key = animKey(ref.spriteKey, 'play');
  const anim = scene.anims.get(key);
  if (anim) {
    sp.play(key);
    if (anim.repeat === 0) sp.once('animationcomplete', () => sp.destroy());
    return sp;
  }
  scene.tweens.add({ targets: sp, alpha: 0, delay: (o.fadeSec ?? 0.2) / 2, duration: ((o.fadeSec ?? 0.2) * 1000) / 2, onComplete: () => sp.destroy() });
  return sp;
}

/** 두 점 사이에 늘여 그리는 광선·번개 */
export function stretchFx(scene: Phaser.Scene, ref: SpriteRef, a: { x: number; y: number }, b: { x: number; y: number }, thickness: number, fadeSec = 0.16): Phaser.GameObjects.Sprite {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  return playFx(scene, ref, a.x, a.y, { w: len, h: thickness, rotation: Math.atan2(b.y - a.y, b.x - a.x), originX: 0, fadeSec });
}

/** 몸체 스프라이트에 반복 애니메이션을 건다 (없으면 그대로) */
export function loopArt(sp: Phaser.GameObjects.Sprite, ref: SpriteRef): void {
  const key = animKey(ref.spriteKey, 'play');
  if (sp.scene.anims.exists(key)) sp.play(key);
}

/** 한 번 도는 자세 뒤 원래 반복으로 돌아간다 */
export function poseThen(sp: Phaser.GameObjects.Sprite, pose: SpriteRef, back: SpriteRef): void {
  const a = animKey(pose.spriteKey, 'play');
  const b = animKey(back.spriteKey, 'play');
  if (!sp.scene.anims.exists(a)) return;
  sp.play(a);
  if (sp.scene.anims.exists(b)) sp.chain(b);
}

/**
 * 스킬 그림: 레벨별 그림 고르기와 애니메이션 이펙트 재생.
 * art.json의 anims.play가 있으면 그 프레임대로 한 바퀴 돌고 사라지고(반복 그림도 한 바퀴), 한 장짜리면 살짝 퍼지며 사라진다.
 */
import type Phaser from 'phaser';
import { hexColor } from '../core/scale';
import { animKey } from '../systems/art';
import type { JuiceData, SpriteRef } from '../types/data';
import { getContext } from '../core/context';
import { Rng } from '../core/rng';
import type { SkillCast } from './host';

// 꾸밈용 난수(판정에 쓰지 않는다): 시드에서 따로 갈라 쓴다
let fxRng: Rng | null = null;
const rnd = () => (fxRng ??= Rng.derive(getContext().config.seed, 'skill-fx')).next();

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
  /** 사라지며 퍼지는 배율 (없으면 1.25, 늘여 그린 그림은 1) */
  grow?: number;
}

const FX_FADE_SEC = 0.28;
const FX_GROW = 1.25;

/** 이펙트 한 번. 끝나면 스스로 사라진다 */
export function playFx(scene: Phaser.Scene, ref: SpriteRef, x: number, y: number, o: FxOpts = {}): Phaser.GameObjects.Sprite {
  const sp = scene.add.sprite(x, y, ref.spriteKey).setDepth(o.depth ?? 6).setRotation(o.rotation ?? 0).setFlipX(o.flipX ?? false);
  if (o.originX !== undefined) sp.setOrigin(o.originX, 0.5);
  if (o.w !== undefined) sp.setDisplaySize(o.w, o.h ?? (o.w * sp.height) / Math.max(1, sp.width));
  const key = animKey(ref.spriteKey, 'play');
  const anim = scene.anims.get(key);
  if (anim) {
    sp.play({ key, repeat: 0 });
    sp.once('animationcomplete', () => sp.destroy());
    return sp;
  }
  const sec = o.fadeSec ?? FX_FADE_SEC;
  const grow = o.grow ?? (o.h === undefined ? FX_GROW : 1);
  scene.tweens.add({ targets: sp, alpha: 0, scaleX: sp.scaleX * grow, scaleY: sp.scaleY * grow, delay: (sec * 1000) / 3, duration: (sec * 1000 * 2) / 3, ease: 'Quad.easeOut', onComplete: () => sp.destroy() });
  return sp;
}

/** 회색 픽셀 이펙트를 color로 물들이고, 같은 그림을 더해 밝은 심을 겹친다 (glow: 심의 진하기) */
export function tintedFx(scene: Phaser.Scene, ref: SpriteRef, x: number, y: number, color: number, o: FxOpts = {}, glow = 0.35): void {
  for (const core of [false, true]) {
    const sp = playFx(scene, ref, x, y, o);
    if (core) sp.setBlendMode('ADD').setAlpha(glow);
    else sp.setTint(color);
  }
}

/** 두 점 사이에 늘여 그리는 광선·번개. 한 장짜리는 굵기가 줄어들며 사라진다 */
export function stretchFx(scene: Phaser.Scene, ref: SpriteRef, a: { x: number; y: number }, b: { x: number; y: number }, thickness: number, fadeSec = 0.2): Phaser.GameObjects.Sprite {
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const sp = playFx(scene, ref, a.x, a.y, { w: len, h: thickness, rotation: Math.atan2(b.y - a.y, b.x - a.x), originX: 0, fadeSec });
  if (!sp.anims.isPlaying) scene.tweens.add({ targets: sp, scaleY: sp.scaleY * 0.2, duration: fadeSec * 1000, ease: 'Quad.easeIn' });
  return sp;
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
  // 끊긴 자세의 복귀 예약이 쌓이지 않게 비운다
  sp.chain();
  sp.play(a);
  if (sp.scene.anims.exists(b)) sp.chain(b);
}

/** 부채꼴 참격 자국: 실제 판정(반지름·각도)을 그대로 그리고 빠르게 사라진다 */
export function arcSwipe(scene: Phaser.Scene, at: { x: number; y: number }, angle: number, arcDeg: number, r: number, color: string, sec = 0.16): void {
  const half = (arcDeg * Math.PI) / 360;
  const c = hexColor(color);
  const g = scene.add.graphics().setDepth(5).setBlendMode('ADD');
  g.fillStyle(c, 0.18).slice(at.x, at.y, r, angle - half, angle + half, false).fillPath();
  g.lineStyle(3, c, 0.9).beginPath().arc(at.x, at.y, r, angle - half, angle + half).strokePath();
  g.lineStyle(1, 0xffffff, 0.9).beginPath().arc(at.x, at.y, r - 1.5, angle - half * 0.7, angle + half * 0.7).strokePath();
  scene.tweens.add({ targets: g, alpha: 0, duration: sec * 1000, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
}

export type ProjectileLookCfg = JuiceData['projectileLook'];

/**
 * 생성 그림 투사체의 꾸밈: 몸(body) 아래에 ADD로 움직이는 픽셀 빛(glow), 지나간 자리에 몸 잔상.
 * spin이면 구체처럼 돌고 맥박친다. 위치·크기는 매 프레임 place로 맞춘다.
 */
export class ProjectileLook {
  readonly body: Phaser.GameObjects.Sprite;
  private readonly glow?: Phaser.GameObjects.Sprite;
  private trailIn = 0;
  private t = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly ref: SpriteRef,
    private readonly cfg: ProjectileLookCfg,
    private readonly o: { rotation?: number; glow?: SpriteRef; spin?: boolean; trail?: boolean; depth?: number } = {},
  ) {
    const depth = o.depth ?? 5;
    if (o.glow) {
      this.glow = scene.add.sprite(x, y, o.glow.spriteKey).setDepth(depth - 0.1).setBlendMode('ADD').setAlpha(cfg.glowAlpha).setRotation(o.rotation ?? 0);
      loopArt(this.glow, o.glow);
    }
    this.body = scene.add.sprite(x, y, ref.spriteKey).setDepth(depth).setRotation(o.rotation ?? 0);
    loopArt(this.body, ref);
    this.place(x, y);
  }

  /** 자리·크기(배율 scale) 맞추기, dt만큼 잔상·회전 진행 */
  place(x: number, y: number, dt = 0, scale = 1, alpha = 1): void {
    this.t += dt;
    const pulse = this.o.spin ? 1 + Math.sin(this.t * this.cfg.pulseHz * Math.PI * 2) * this.cfg.pulse : 1;
    const w = this.ref.size * scale * pulse;
    this.body.setPosition(x, y).setDisplaySize(w, (w * this.body.height) / Math.max(1, this.body.width)).setAlpha(alpha);
    if (this.o.spin) this.body.rotation += this.cfg.spinPerSec * dt;
    if (this.glow) {
      const gw = this.ref.size * scale * this.cfg.glowScale;
      this.glow.setPosition(x, y).setDisplaySize(gw, (gw * this.glow.height) / Math.max(1, this.glow.width)).setAlpha(this.cfg.glowAlpha * alpha);
    }
    if (this.o.trail === false || dt <= 0) return;
    this.trailIn -= dt;
    if (this.trailIn > 0) return;
    this.trailIn = this.cfg.trailEverySec;
    const ghost = this.scene.add.image(x, y, this.ref.spriteKey).setDepth(this.body.depth - 0.2).setBlendMode('ADD');
    ghost.setRotation(this.body.rotation).setDisplaySize(this.body.displayWidth, this.body.displayHeight).setAlpha(this.cfg.trailAlpha * alpha);
    this.scene.tweens.add({
      targets: ghost, alpha: 0, scaleX: ghost.scaleX * this.cfg.trailShrink, scaleY: ghost.scaleY * this.cfg.trailShrink,
      duration: this.cfg.trailFadeSec * 1000, ease: 'Quad.easeOut', onComplete: () => ghost.destroy(),
    });
  }

  destroy(): void {
    this.body.destroy();
    this.glow?.destroy();
  }
}

/** 터짐·맞힘 불티: color와 흰색 작은 사각형이 사방으로 튀며 사라진다 */
export function sparks(scene: Phaser.Scene, x: number, y: number, color: string, cfg: ProjectileLookCfg, mul = 1): void {
  const c = hexColor(color);
  const n = Math.round(cfg.sparks * mul);
  for (let i = 0; i < n; i++) {
    const a = rnd() * Math.PI * 2;
    const v = cfg.sparkSpeed[0] + rnd() * (cfg.sparkSpeed[1] - cfg.sparkSpeed[0]);
    const r = scene.add.rectangle(x, y, cfg.sparkSize, cfg.sparkSize, i % 3 === 0 ? 0xffffff : c).setDepth(7).setBlendMode('ADD');
    scene.tweens.add({
      targets: r, x: x + Math.cos(a) * v * cfg.sparkLifeSec, y: y + Math.sin(a) * v * cfg.sparkLifeSec, alpha: 0, scale: 0.3,
      duration: cfg.sparkLifeSec * 1000, ease: 'Quad.easeOut', onComplete: () => r.destroy(),
    });
  }
}

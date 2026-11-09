/**
 * 함성 버프 연출: 전장의 함성·아이템 함성이 걸린 동안 몸에서 불씨가 피어오르고 발밑 고리가 맥박친다.
 * 아이템 함성이 새로 걸리는 순간에는 야만용사 전장의 함성 Lv2 그림이 터진다.
 */
import Phaser from 'phaser';
import { Rng } from '../../core/rng';
import { hexColor } from '../../core/scale';
import { playFx } from '../../skills/skillFx';
import { findSkill } from '../../systems/skills';
import type { RunScene } from '../RunScene';

const WAR_CRY = 'warCry';

export class RoarAura {
  private ring: Phaser.GameObjects.Graphics | null = null;
  private next = 0;
  private t = 0;
  private itemWas = false;
  /** 꾸밈 전용 RNG (게임 판정 RNG와 분리) */
  private readonly rng: Rng;

  constructor(private readonly run: RunScene) {
    this.rng = Rng.derive(run.ctx.config.seed, 'roar-fx');
  }

  update(dt: number): void {
    const d = this.run.ctx.data;
    const cfg = d.juice.roarAura;
    const p = this.run.player;
    const item = this.run.itemRt.roaring();
    if (item && !this.itemWas) playFx(this.run, findSkill(d.skills, WAR_CRY).sprites.shout2!, p.x, p.y, { w: cfg.itemShoutWidth, depth: 5 });
    this.itemWas = item;
    if (!item && !this.run.skillRt.skillObjects.some((o) => o.owner === WAR_CRY)) {
      this.ring?.clear();
      return;
    }
    const col = hexColor(cfg.color);
    const feet = p.y + d.player.size / 2;
    this.t += dt;
    const k = 0.5 + 0.5 * Math.sin((this.t / cfg.pulseSec) * Math.PI * 2);
    const r = cfg.ringRadius * (0.9 + 0.15 * k);
    this.ring ??= this.run.add.graphics().setDepth(2.5).setBlendMode(Phaser.BlendModes.ADD);
    this.ring.clear().fillStyle(col, cfg.ringAlpha * 0.35 * (0.6 + 0.4 * k)).fillEllipse(p.x, feet, r * 2, r).lineStyle(1, col, cfg.ringAlpha * (0.6 + 0.4 * k)).strokeEllipse(p.x, feet, r * 2, r);
    this.next -= dt;
    while (this.next <= 0) {
      this.next += cfg.everySec;
      // 불씨: 발밑 둘레에서 솟아올라 흔들리며 사라진다
      const rnd = this.rng;
      const x = p.x + rnd.range(-cfg.spreadPx, cfg.spreadPx);
      const dot = this.run.add.rectangle(x, feet - rnd.range(0, 6), cfg.size, cfg.size, rnd.chance(0.3) ? 0xffe0a0 : col, 1).setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
      this.run.tweens.add({ targets: dot, y: dot.y - cfg.risePx * rnd.range(0.6, 1.2), x: x + rnd.range(-3, 3), alpha: 0, scale: 0.4, duration: cfg.lifeSec * 1000, ease: 'Quad.easeOut', onComplete: () => dot.destroy() });
    }
  }
}

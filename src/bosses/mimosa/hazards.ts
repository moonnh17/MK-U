/** 헥타르 미모사 광범위 공격의 위험 지대: 격자 칸 낙하, 격자 스캔선, 엄폐물 레이저 */
import Phaser from 'phaser';
import { bus } from '../../core/events';
import { shake } from '../../entities/juice';
import type { Hazard, HazardHost, Rect } from '../../entities/hazard';
import { cellRect, inRect, scanDone, scanHits, scanPos, type Cell, type Grid, type ScanLine } from '../../systems/mimosa';

/** 격자 칸 낙하: 예고 동안 칸이 차오르고(안전 칸은 마지막에 밝게) 한 번에 떨어진다 */
export class GridStrike implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;
  private flashLeft = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly grid: Grid,
    private readonly cells: readonly Cell[],
    private readonly warnSec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly safe: readonly Cell[] = [],
    private readonly highlightSec = 0,
  ) {
    this.left = warnSec;
    this.g = scene.add.graphics().setDepth(2);
  }

  update(dt: number, host: HazardHost): boolean {
    if (this.flashLeft > 0) {
      this.flashLeft -= dt;
      this.draw(0.55 * Math.max(0, this.flashLeft / 0.2), 0xffffff);
      return this.flashLeft > 0;
    }
    this.left -= dt;
    const k = 1 - Math.max(0, this.left) / this.warnSec;
    this.draw(0.08 + 0.3 * k, this.color);
    if (this.safe.length > 0) {
      // 안전 칸: 늘 보이고, 마지막 highlightSec은 깜빡이며 밝게
      const bright = this.left <= this.highlightSec;
      for (const c of this.safe) {
        const r = cellRect(this.grid, c);
        this.g.fillStyle(0xffffff, bright ? 0.35 + 0.25 * Math.sin(this.left * 40) : 0.18).fillRect(r.x, r.y, r.w, r.h);
        this.g.lineStyle(2, 0xffffff, 0.95).strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
      }
    }
    if (this.left > 0) return true;
    const p = host.playerPos();
    if (this.cells.some((c) => inRect(p, cellRect(this.grid, c)))) host.hurtPlayer(this.damage);
    bus.emit('sfx', { id: 'explosionMid' });
    shake(host.scene, this.cells.length > 40 ? 'medium' : 'light');
    this.flashLeft = 0.2;
    return true;
  }

  private draw(alpha: number, color: number): void {
    this.g.clear().fillStyle(color, alpha).lineStyle(1, color, Math.min(1, alpha * 2.5));
    for (const c of this.cells) {
      const r = cellRect(this.grid, c);
      this.g.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2).strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 격자 스캔선: 예고 동안 출발 줄이 푸르게 점등, 그 뒤 방 끝까지 쓸고 지나간다. 틈은 비어 있다. 한 번만 맞힌다 */
export class ScanSweep implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  private hit = false;

  constructor(
    scene: Phaser.Scene,
    private readonly arena: Rect,
    private readonly line: ScanLine,
    private readonly warnSec: number,
    private readonly damage: number,
    private readonly color: number,
  ) {
    this.g = scene.add.graphics().setDepth(2.5);
  }

  update(dt: number, host: HazardHost): boolean {
    this.t += dt;
    const m = this.t - this.warnSec;
    const pos = scanPos(this.line, Math.max(0, m));
    const warn = m < 0;
    this.g.clear();
    // 앞으로 지나갈 쪽을 옅게, 줄 자체는 예고 동안 깜빡이고 움직일 땐 진하게
    const a = warn ? 0.35 + 0.3 * Math.sin(this.t * 18) : 0.9;
    this.drawLine(pos, this.line.width, this.color, a);
    if (!warn) this.drawLine(pos + Math.sign(this.line.to - this.line.from) * 14, 4, this.color, 0.25);
    if (warn) return true;
    if (!this.hit && scanHits(this.line, m, host.playerPos(), host.playerRadius)) {
      if (host.hurtPlayer(this.damage)) this.hit = true;
    }
    return !scanDone(this.line, m);
  }

  private drawLine(at: number, w: number, color: number, alpha: number): void {
    const a = this.arena;
    const h = this.line.axis === 'h';
    const start = h ? a.x : a.y;
    const end = h ? a.x + a.w : a.y + a.h;
    // 틈을 뺀 구간들
    const gaps = [...this.line.gaps].sort((x, y) => x[0] - y[0]);
    let s = start;
    this.g.fillStyle(color, alpha);
    for (const [g0, g1] of [...gaps, [end, end] as [number, number]]) {
      if (g0 > s) {
        if (h) this.g.fillRect(s, at - w / 2, g0 - s, w);
        else this.g.fillRect(at - w / 2, s, w, g0 - s);
      }
      s = Math.max(s, g1);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 전역 레이저: 엄폐물이 빛나는 동안 위에서 충전, 엄폐물 그림자 밖은 모두 맞는다. 엄폐물은 한 번에 부서진다 */
export class CoverLaser implements Hazard {
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;
  private fired = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly arena: Rect,
    private readonly covers: readonly Rect[],
    private readonly shadows: readonly Rect[],
    private readonly chargeSec: number,
    private readonly damage: number,
    private readonly color: number,
    private readonly coverColor: number,
  ) {
    this.left = chargeSec;
    this.g = scene.add.graphics().setDepth(2.5);
  }

  update(dt: number, host: HazardHost): boolean {
    const a = this.arena;
    if (this.fired > 0) {
      this.fired -= dt;
      this.g.clear().fillStyle(this.color, 0.6 * Math.max(0, this.fired / 0.35)).fillRect(a.x, a.y, a.w, a.h);
      for (const s of this.shadows) this.g.fillStyle(0x000000, 0.35 * Math.max(0, this.fired / 0.35)).fillRect(s.x, s.y, s.w, s.h);
      return this.fired > 0;
    }
    this.left -= dt;
    const k = 1 - Math.max(0, this.left) / this.chargeSec;
    this.g.clear();
    // 위쪽 충전 띠
    this.g.fillStyle(this.color, 0.2 + 0.6 * k).fillRect(a.x, a.y, a.w, 4 + 10 * k);
    this.g.fillStyle(this.color, 0.06 + 0.12 * k).fillRect(a.x, a.y, a.w, a.h);
    // 엄폐물(하이라이트)과 그 아래 그림자(안전)
    for (const s of this.shadows) this.g.fillStyle(0xffffff, 0.12 + 0.12 * Math.sin(this.left * 12)).fillRect(s.x, s.y, s.w, s.h);
    for (const c of this.covers) {
      this.g.fillStyle(this.coverColor, 1).fillRect(c.x, c.y, c.w, c.h);
      this.g.lineStyle(2, 0xffffff, 0.5 + 0.5 * Math.sin(this.left * 16)).strokeRect(c.x, c.y, c.w, c.h);
    }
    if (this.left > 0) return true;
    const p = host.playerPos();
    if (!this.shadows.some((s) => inRect(p, s, host.playerRadius * 0.5))) host.hurtPlayer(this.damage);
    bus.emit('sfx', { id: 'shotBeamHeavy' });
    shake(host.scene, 'heavy');
    // 엄폐물 파괴
    for (const c of this.covers) {
      for (let i = 0; i < 5; i++) {
        const bit = host.scene.add.rectangle(c.x + c.w / 2, c.y + c.h / 2, 4, 4, this.coverColor).setDepth(3);
        host.scene.tweens.add({ targets: bit, x: bit.x + (i - 2) * 9, y: bit.y + 10 + i * 3, alpha: 0, duration: 450, onComplete: () => bit.destroy() });
      }
    }
    this.fired = 0.35;
    return true;
  }

  destroy(): void {
    this.g.destroy();
  }
}

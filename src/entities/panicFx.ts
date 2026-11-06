/**
 * 패닉 연출: 주변이 어두워지고(Darkness 재사용), 화면이 떨리며, 검은 선들이 시야를 가린다.
 * glyphColor가 있으면(기숲 비석의 조각) 비석에 새겨진 문양이 화면 여기저기에 지직거리며 떴다 사라진다.
 */
import type Phaser from 'phaser';
import type { Rng } from '../core/rng';
import { zigzag } from '../systems/dodge';
import type { SanityConfig } from '../types/data';
import { Darkness } from './darkness';

export class PanicFx {
  private readonly dark: Darkness;
  private readonly lines: Phaser.GameObjects.Graphics;
  private lineIn = 0;
  /** 비석 문양: 지직거리는 동안 남은 시간 */
  private glyphs: { g: Phaser.GameObjects.Graphics; left: number; x: number; y: number }[] = [];
  private glyphIn = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly c: SanityConfig['panic'],
    private readonly rng: Rng,
    private readonly renderScale: number,
    private readonly glyphColor?: string,
  ) {
    this.dark = new Darkness(scene, c.lightRadius, c.darkAlpha, c.darkColor, c.fadeSec);
    this.lines = scene.add.graphics().setDepth(16);
  }

  /** screenX·Y: 플레이어의 화면 고정 좌표 (Darkness와 같다) */
  update(dt: number, screenX: number, screenY: number): void {
    this.dark.update(dt, screenX, screenY);
    const cam = this.scene.cameras.main;
    // Phaser 흔들림은 캔버스 배율이 두 번 곱해지므로 한 번 나눈다 (juice의 shake와 같다)
    if (!cam.shakeEffect.isRunning) cam.shake(this.c.shakeMs, this.c.shakeIntensity / this.renderScale);
    if (this.glyphColor) this.updateGlyphs(dt);
    this.lineIn -= dt;
    if (this.lineIn > 0) return;
    this.lineIn = this.c.lineEverySec;
    const v = cam.worldView;
    const g = this.lines.clear();
    const r = this.rng;
    const point = (edge: number) => {
      const t = r.range(0, 1);
      if (edge === 0) return { x: v.x + v.width * t, y: v.y };
      if (edge === 1) return { x: v.x + v.width * t, y: v.y + v.height };
      if (edge === 2) return { x: v.x, y: v.y + v.height * t };
      return { x: v.x + v.width, y: v.y + v.height * t };
    };
    for (let i = 0; i < this.c.lines; i++) {
      const e = r.int(0, 3);
      const pts = zigzag(point(e), point((e + r.int(1, 3)) % 4), this.c.lineSegments, this.c.lineAmpPx, r);
      g.lineStyle(r.range(this.c.lineWidthPx[0], this.c.lineWidthPx[1]), 0x000000, this.c.lineAlpha).strokePoints(pts);
    }
  }

  /**
   * 비석 문양: 화면 안 아무 데나 새겨진 글자 무늬가 떴다가, 사는 동안 어긋나며 깜빡이고(지직), 짧게 사라진다.
   * 문양마다 붉은·푸른 어긋난 겹(색 번짐)을 함께 그린다
   */
  private updateGlyphs(dt: number): void {
    const r = this.rng;
    for (const s of this.glyphs) {
      s.left -= dt;
      // 지직: 위치가 1~3px 튀고 깜빡인다
      s.g.setPosition(s.x + r.range(-2, 2), s.y + r.range(-1, 1)).setAlpha(r.chance(0.25) ? 0.15 : r.range(0.6, 1));
    }
    for (const s of this.glyphs.filter((x) => x.left <= 0)) s.g.destroy();
    this.glyphs = this.glyphs.filter((x) => x.left > 0);
    this.glyphIn -= dt;
    if (this.glyphIn > 0) return;
    this.glyphIn = r.range(0.06, 0.16);
    const v = this.scene.cameras.main.worldView;
    const x = v.x + r.range(0.08, 0.92) * v.width;
    const y = v.y + r.range(0.1, 0.9) * v.height;
    const size = r.range(7, 14);
    // 세로로 내려 쓴 글자 2~4자 (글자마다 획 3~5개: 가로·세로·대각·짧은 점)
    const strokes: [number, number, number, number][] = [];
    const chars = r.int(2, 4);
    for (let c = 0; c < chars; c++) {
      const cy = c * size * 1.25;
      for (let k = 0; k < r.int(3, 5); k++) {
        const x0 = r.range(-size / 2, size / 2);
        const y0 = cy + r.range(-size / 2, size / 2);
        const [dx, dy] = r.pick([[size * 0.8, 0], [0, size * 0.8], [size * 0.6, size * 0.6], [-size * 0.6, size * 0.6], [size * 0.2, size * 0.2]] as const);
        strokes.push([x0, y0, x0 + dx, y0 + dy]);
      }
    }
    const g = this.scene.add.graphics().setDepth(16.5);
    const col = Number.parseInt(this.glyphColor!.slice(1), 16);
    for (const [ox, c, a, w] of [[-1.5, 0xff3040, 0.55, 2], [1.5, 0x30c8ff, 0.55, 2], [0, col, 0.95, 1.5]] as const) {
      g.lineStyle(w, c, a);
      for (const [x0, y0, x1, y1] of strokes) g.lineBetween(x0 + ox, y0, x1 + ox, y1);
    }
    this.glyphs.push({ g, left: r.range(0.15, 0.45), x, y });
  }

  destroy(): void {
    this.dark.lift();
    this.lines.destroy();
    for (const s of this.glyphs) s.g.destroy();
    this.glyphs = [];
  }
}

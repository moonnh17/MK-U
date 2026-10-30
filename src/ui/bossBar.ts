/**
 * 보스 연출 HUD (UI 씬, 카메라 확대와 상관없이 화면에 고정):
 * 위쪽 가운데 보스 체력바(깎인 만큼 흰 잔상, 강화 지점 눈금) / 화면 가운데 큰 글자(단계 이름·CLEAR) / 등장 컷의 아래쪽 이름 띠.
 */
import type Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { hexColor } from '../core/scale';
import type { BossView } from '../core/session';
import { trailStep } from '../systems/juice';

export class BossBar {
  private readonly root: Phaser.GameObjects.Container;
  private readonly back: Phaser.GameObjects.Rectangle;
  private readonly trail: Phaser.GameObjects.Rectangle;
  private readonly fill: Phaser.GameObjects.Rectangle;
  private readonly name: Phaser.GameObjects.Text;
  private readonly markers: Phaser.GameObjects.Graphics;
  private trailRatio = 1;
  private hold = 0;
  private lastRatio = 1;
  private lastName = '';
  private visible = false;
  /** 등장 컷 이름 띠 */
  private band: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    const b = ctx.data.juice.bossBar;
    const W = scene.scale.gameSize.width;
    const x = (W - b.width) / 2;
    const y = b.y + b.fontSize + 2;
    this.back = scene.add.rectangle(x - 1, y - 1, b.width + 2, b.height + 2, hexColor(b.backColor)).setOrigin(0).setStrokeStyle(1, 0x000000);
    this.trail = scene.add.rectangle(x, y, b.width, b.height, hexColor(b.trailColor)).setOrigin(0);
    this.fill = scene.add.rectangle(x, y, b.width, b.height, hexColor(b.color)).setOrigin(0);
    this.markers = scene.add.graphics();
    this.name = scene.add
      .text(W / 2, b.y, '', { fontFamily: 'sans-serif', fontSize: `${b.fontSize}px`, color: '#ffffff', stroke: '#000000', strokeThickness: 2, resolution: 4 })
      .setOrigin(0.5, 0);
    this.root = scene.add.container(0, 0, [this.back, this.trail, this.fill, this.markers, this.name]).setDepth(30).setVisible(false);
    bus.on('banner', ({ text, color, size, sec }) => this.banner(text, color, size, sec));
    bus.on('bossIntroBand', ({ name, sub }) => this.showBand(name, sub));
  }

  update(boss: BossView | null, dt: number): void {
    const show = boss !== null;
    if (show !== this.visible) {
      this.visible = show;
      this.root.setVisible(show);
      // 미니 대사 말풍선이 체력바와 겹치지 않게
      bus.emit('bossBarShown', { shown: show });
    }
    if (!boss) return;
    const b = this.ctx.data.juice.bossBar;
    const ratio = Math.max(0, Math.min(1, boss.hp / boss.maxHp));
    if (boss.name !== this.lastName) {
      // 새 보스: 잔상·눈금 초기화
      this.lastName = boss.name;
      this.name.setText(boss.name);
      this.trailRatio = ratio;
      this.lastRatio = ratio;
      this.markers.clear().fillStyle(hexColor(b.markerColor), 1);
      for (const m of boss.markers) this.markers.fillRect(this.fill.x + b.width * m, this.fill.y - 1, 1, b.height + 2);
    }
    const r = trailStep(this.trailRatio, ratio, this.hold, dt, b, ratio < this.lastRatio);
    this.trailRatio = r.trail;
    this.hold = r.hold;
    this.lastRatio = ratio;
    this.fill.width = b.width * ratio;
    this.trail.width = b.width * this.trailRatio;
  }

  /** 화면 가운데 큰 글자 (보스 단계 이름·CLEAR): 부풀며 나타났다 사라진다 */
  private banner(text: string, color: string, size: number, sec: number): void {
    const s = this.scene;
    const t = s.add
      .text(s.scale.gameSize.width / 2, s.scale.gameSize.height * 0.38, text, { fontFamily: 'sans-serif', fontSize: `${size}px`, color, stroke: '#000000', strokeThickness: 4, resolution: 4 })
      .setOrigin(0.5)
      .setDepth(31)
      .setScale(1.6)
      .setAlpha(0);
    s.tweens.add({ targets: t, scale: 1, alpha: 1, duration: 160, ease: 'Back.easeOut' });
    s.tweens.add({ targets: t, alpha: 0, delay: sec * 700, duration: sec * 300, onComplete: () => t.destroy() });
  }

  /** 등장 컷 이름 띠: 아래쪽 검은 띠에 보스 이름 + 부제. name이 빈 문자열이면 걷는다 */
  private showBand(name: string, sub: string): void {
    const s = this.scene;
    const bi = this.ctx.data.juice.bossIntro;
    if (!name) {
      const band = this.band;
      this.band = null;
      if (band) s.tweens.add({ targets: band, alpha: 0, duration: 200, onComplete: () => band.destroy() });
      return;
    }
    this.band?.destroy();
    const W = s.scale.gameSize.width;
    const H = s.scale.gameSize.height;
    // 아래쪽 스킬바와 겹치지 않게 화면 높이 60% 즈음
    const h = 44;
    const top = Math.round(H * 0.58);
    const bg = s.add.rectangle(0, top, W, h, hexColor(bi.bandColor), bi.bandAlpha).setOrigin(0);
    const style = { fontFamily: 'sans-serif', stroke: '#000000', strokeThickness: 3, resolution: 4 };
    const subT = s.add.text(W / 2, top + 5, sub, { ...style, fontSize: '9px', color: bi.subColor }).setOrigin(0.5, 0);
    const nameT = s.add.text(W / 2, top + 18, name, { ...style, fontSize: '18px', color: bi.nameColor }).setOrigin(0.5, 0);
    this.band = s.add.container(0, 0, [bg, subT, nameT]).setDepth(31);
    // 이름이 옆에서 미끄러져 들어온다
    nameT.x -= 40;
    nameT.setAlpha(0);
    s.tweens.add({ targets: nameT, x: W / 2, alpha: 1, duration: 260, ease: 'Cubic.easeOut' });
    bg.scaleY = 0;
    s.tweens.add({ targets: bg, scaleY: 1, duration: 160 });
  }
}

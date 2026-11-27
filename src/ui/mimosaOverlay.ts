/**
 * 헥타르 미모사 시스템 변조 화면 연출 (UI 씬): 스캔선·패치 노트 터미널·규칙 아이콘·슬롯 셔플·연산 오류 글리치·관측 결과·균열.
 * 표시만 한다. 점멸 강도·빈도는 상한이 있고 설정의 '화면 효과 약하게'로 더 줄인다.
 */
import Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import type { MimosaUiEvent } from '../bosses/mimosa/controller';
import type { Hud } from './hud';

export class MimosaOverlay {
  private readonly terminal: Phaser.GameObjects.Text;
  private readonly icon: Phaser.GameObjects.Text;
  private readonly observeText: Phaser.GameObjects.Text;
  private readonly g: Phaser.GameObjects.Graphics;
  private lines: string[] = [];
  private scanT = -1;
  private glitch = false;
  private glitchT = 0;
  private crackT = -1;
  private readonly W: number;
  private readonly H: number;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
    private readonly hud: Hud,
  ) {
    const ui = ctx.data.ui;
    this.W = ui.baseWidth;
    this.H = ui.baseHeight;
    const color = ctx.data.overflow.mimosa.color;
    this.g = scene.add.graphics().setDepth(40);
    this.terminal = scene.add
      .text(this.W / 2, 34, '', { fontFamily: 'monospace', fontSize: '7px', color, backgroundColor: '#03121acc', padding: { x: 4, y: 3 } })
      .setOrigin(0.5, 0)
      .setDepth(41)
      .setVisible(false);
    this.icon = scene.add
      .text(this.W - ui.hud.margin, ui.hud.margin + ui.hud.minimap.height + 4, '', { fontFamily: 'sans-serif', fontSize: '7px', color: '#ffffff', backgroundColor: '#1a3a4acc', padding: { x: 3, y: 2 } })
      .setOrigin(1, 0)
      .setDepth(41)
      .setVisible(false);
    this.observeText = scene.add
      .text(this.W / 2, this.H * 0.42, '', { fontFamily: 'monospace', fontSize: '8px', color, align: 'center', stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(41)
      .setAlpha(0);
  }

  private get reduced(): boolean {
    return this.ctx.save.data.reduceFx;
  }

  on(ev: MimosaUiEvent): void {
    const t = this.ctx.t;
    switch (ev.kind) {
      case 'scan':
        this.scanT = 0;
        break;
      case 'patch':
        this.type([t('mimosa.term.connect'), t('mimosa.term.patch', { rule: t(`mimosa.rule.${ev.rule}`) })]);
        this.icon.setText(`⚠ ${t(`mimosa.rule.${ev.rule}`)}`).setVisible(true);
        break;
      case 'rollback':
        this.type([...this.lines, t('mimosa.term.rollback')]);
        this.icon.setVisible(false);
        this.scene.time.delayedCall(1100, () => this.terminal.setVisible(false));
        break;
      case 'shuffleWarn':
        this.hud.flipSkills('warn');
        break;
      case 'shuffle':
        this.hud.flipSkills('flip');
        this.icon.setText(`⚠ ${t('mimosa.rule.shuffle')}`).setVisible(true);
        break;
      case 'shuffleBack':
        this.hud.flipSkills('flip');
        this.icon.setVisible(false);
        bus.emit('toast', { text: t('mimosa.term.restored') });
        break;
      case 'glitch':
        this.glitch = ev.on;
        this.glitchT = 0;
        this.hud.setGlitch(ev.on, this.reduced);
        if (!ev.on) this.g.clear();
        break;
      case 'observe':
        this.scene.tweens.killTweensOf(this.observeText);
        this.observeText.setText(ev.lines.join('\n')).setAlpha(1);
        this.scene.tweens.add({ targets: this.observeText, alpha: 0, delay: 2600, duration: 600 });
        break;
      case 'crack':
        this.crackT = 0;
        break;
      case 'clear':
        this.clear();
        break;
    }
  }

  /** 터미널 줄을 한 줄씩 찍는다 */
  private type(lines: string[]): void {
    this.lines = lines;
    this.terminal.setVisible(true).setText('');
    lines.forEach((_, i) => this.scene.time.delayedCall(i * 220, () => this.terminal.setText(lines.slice(0, i + 1).join('\n'))));
  }

  update(dt: number): void {
    const m = this.ctx.data.overflow.mimosa;
    const color = Phaser.Display.Color.HexStringToColor(m.color).color;
    this.g.clear();
    // 전조: 화면 가장자리를 푸른 스캔선이 훑는다 (약 1.5초)
    if (this.scanT >= 0) {
      this.scanT += dt;
      const k = this.scanT / m.tamper.patchNote.telegraphSec;
      if (k >= 1) this.scanT = -1;
      else {
        const y = k * this.H;
        this.g.fillStyle(color, 0.5).fillRect(0, y, this.W, 2).fillStyle(color, 0.12).fillRect(0, y - 10, this.W, 10);
        this.g.lineStyle(2, color, 0.6 * (1 - k)).strokeRect(1, 1, this.W - 2, this.H - 2);
      }
    }
    // 연산 오류: 가로 글리치 띠 (빈도·밝기 상한, 약하게면 더 줄인다)
    if (this.glitch) {
      this.glitchT += dt;
      const hz = this.reduced ? m.glitch.flickerHzReduced : m.glitch.flickerHz;
      const step = Math.floor(this.glitchT * hz);
      const n = this.reduced ? 1 : m.glitch.lines;
      for (let i = 0; i < n; i++) {
        const h = ((step * 31 + i * 17) % 7) + 2;
        const y = ((step * 97 + i * 53) % 100) / 100 * this.H;
        this.g.fillStyle(i % 2 ? 0xffffff : color, this.reduced ? 0.06 : 0.14).fillRect(0, y, this.W, h);
      }
    }
    // 격파: 시뮬레이션 균열
    if (this.crackT >= 0) {
      this.crackT += dt;
      const k = this.crackT / m.death.sec;
      if (k >= 1) this.crackT = -1;
      else {
        this.g.lineStyle(this.reduced ? 1 : 2, Phaser.Display.Color.HexStringToColor(m.death.color).color, 1 - k);
        for (let i = 0; i < m.death.cracks; i++) {
          const x0 = this.W / 2 + Math.cos(i * 2.3) * 8;
          const y0 = this.H / 2 + Math.sin(i * 2.3) * 8;
          const len = Math.min(1, k * 4) * (this.W * 0.6);
          const a = i * ((Math.PI * 2) / m.death.cracks) + 0.3;
          const mx = x0 + Math.cos(a) * len * 0.5 + Math.sin(i) * 10;
          const my = y0 + Math.sin(a) * len * 0.5 + Math.cos(i) * 10;
          this.g.lineBetween(x0, y0, mx, my).lineBetween(mx, my, x0 + Math.cos(a + 0.15) * len, y0 + Math.sin(a + 0.15) * len);
        }
        if (!this.reduced) this.g.fillStyle(0xffffff, 0.25 * (1 - k)).fillRect(0, 0, this.W, this.H);
      }
    }
  }

  clear(): void {
    this.scanT = -1;
    this.glitch = false;
    this.hud.setGlitch(false, this.reduced);
    this.terminal.setVisible(false);
    this.icon.setVisible(false);
    this.g.clear();
  }
}

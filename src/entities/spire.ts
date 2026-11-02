/**
 * 마기수집첨탑의 모습: 소형은 검고 얇은 비석, 중형은 검은 구조물 + 붉은 기계. 충전 원 + 충전율 호·숫자.
 * 진행 규칙은 systems/spire.ts(SpireState), 소환·카드는 RunScene이 한다.
 */
import { shake } from './juice';
import type Phaser from 'phaser';
import { hexColor } from '../core/scale';
import type { SpireData } from '../types/data';
import { SpireState, type SpireSize } from '../systems/spire';

export class Spire {
  readonly state: SpireState;
  private readonly body: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly bar: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly color: number;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly roomId: number,
    readonly x: number,
    readonly y: number,
    private readonly data: SpireData,
    /** 소형: 검고 얇은 비석 / 중형: 검은 구조물 + 붉은 아크로식 기계 / 대형: 중형을 더 크게 */
    readonly size: SpireSize = 'small',
  ) {
    this.state = new SpireState(data);
    this.color = hexColor(data.ringColor);
    const s = data[size].sprite;
    // 바닥이 착지점에 오도록 아래쪽 기준
    this.body = scene.add.image(x, y - data.fallHeight, s.spriteKey).setOrigin(0.5, 1).setDepth(4).setScale(size === 'large' ? data.large.scale : 1);
    scene.tweens.add({ targets: this.body, y, duration: data.fallSec * 1000, ease: 'Quad.easeIn' });
    this.ring = scene.add.circle(x, y, data.radius).setStrokeStyle(1, this.color, 0.7).setFillStyle(this.color, 0.06).setDepth(1).setVisible(false);
    this.bar = scene.add.graphics().setDepth(5);
    this.label = scene.add
      .text(x, y - (s.height ?? s.size) * (size === 'large' ? data.large.scale : 1) - 10, '', { fontFamily: 'monospace', fontSize: '8px', color: data.ringColor, resolution: 4 })
      .setOrigin(0.5)
      .setDepth(5);
  }

  get radius(): number {
    return this.data.radius;
  }

  /** 착지: 충전 원이 보이고 화면이 흔들린다 */
  land(): void {
    this.ring.setVisible(true);
    shake(this.scene, 'medium');
  }

  /** 충전율 표시 (매 프레임) */
  draw(): void {
    const c = this.state.charge;
    const charging = this.state.phase === 'charging';
    this.label.setText(charging || this.state.phase === 'rising' ? `${Math.floor(c * 100)}%` : '');
    this.bar.clear();
    if (!charging) return;
    this.bar.lineStyle(2, this.color, 1);
    this.bar.beginPath();
    this.bar.arc(this.x, this.y, this.data.radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * c);
    this.bar.strokePath();
  }

  /** 상승: 첨탑이 떠오르고 원이 사라진다 */
  rise(): void {
    this.ring.setVisible(false);
    this.bar.clear();
    this.scene.tweens.add({ targets: this.body, y: this.y - this.data.fallHeight, alpha: 0, duration: this.data.riseSec * 1000, ease: 'Quad.easeIn' });
    this.scene.tweens.add({ targets: this.label, alpha: 0, duration: this.data.riseSec * 1000 });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.body);
    this.scene.tweens.killTweensOf(this.label);
    this.body.destroy();
    this.ring.destroy();
    this.bar.destroy();
    this.label.destroy();
  }
}

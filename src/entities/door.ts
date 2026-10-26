import Phaser from 'phaser';
import type { Rect } from '../systems/worldLayout';

/** 방 문 하나. 잠기면 보이고 막고, 열리면 사라진다. */
export class Door {
  readonly rect: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    r: Rect,
    color: number,
    readonly group: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.rect = scene.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, color).setDepth(1);
    group.add(this.rect);
    this.setLocked(false);
  }

  setLocked(locked: boolean): void {
    this.rect.setVisible(locked);
    const body = this.rect.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = locked;
  }
}

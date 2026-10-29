import Phaser from 'phaser';
import type { Rect } from '../systems/worldLayout';

/** 방 문 하나. 잠기면 보이고 막고, 열리면 사라진다. 문 타일 그림(key)이 있으면 반복해서 깐다. */
export class Door {
  readonly rect: Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite;

  constructor(
    scene: Phaser.Scene,
    r: Rect,
    color: number,
    readonly group: Phaser.Physics.Arcade.StaticGroup,
    key?: string,
  ) {
    const cx = r.x + r.w / 2;
    const cy = r.y + r.h / 2;
    this.rect = (key && scene.textures.exists(key) ? scene.add.tileSprite(cx, cy, r.w, r.h, key) : scene.add.rectangle(cx, cy, r.w, r.h, color)).setDepth(1);
    group.add(this.rect);
    this.setLocked(false);
  }

  setLocked(locked: boolean): void {
    this.rect.setVisible(locked);
    const body = this.rect.body as Phaser.Physics.Arcade.StaticBody;
    body.enable = locked;
  }
}

import Phaser from 'phaser';
import { getContext } from '../core/context';
import { bus } from '../core/events';
import { DISABLED_ACTIONS } from '../core/features';
import { hexColor } from '../core/scale';

/** 전투 씬. M0에서는 빈 방 하나와 이동만 있다. */
export class RunScene extends Phaser.Scene {
  private player!: Phaser.Physics.Arcade.Image;

  constructor() {
    super('Run');
  }

  create(): void {
    const { data } = getContext();
    const { ui, mapgen, player } = data;

    const roomW = mapgen.roomTiles.width * mapgen.tileSize;
    const roomH = mapgen.roomTiles.height * mapgen.tileSize;
    const x0 = (ui.baseWidth - roomW) / 2;
    const y0 = (ui.baseHeight - roomH) / 2;
    const wall = ui.room.wallThickness;

    this.add.rectangle(x0, y0, roomW, roomH, hexColor(ui.room.wallColor)).setOrigin(0);
    this.add
      .rectangle(x0 + wall, y0 + wall, roomW - wall * 2, roomH - wall * 2, hexColor(ui.room.floorColor))
      .setOrigin(0);
    this.physics.world.setBounds(x0 + wall, y0 + wall, roomW - wall * 2, roomH - wall * 2);

    this.player = this.physics.add.image(ui.baseWidth / 2, ui.baseHeight / 2, player.spriteKey);
    this.player.setCollideWorldBounds(true);
  }

  override update(): void {
    const ctx = getContext();
    const frame = ctx.input.poll();
    const speed = ctx.data.player.moveSpeed;
    this.player.setVelocity(frame.move.x * speed, frame.move.y * speed);

    for (const action of frame.pressed) {
      const enabled = !DISABLED_ACTIONS.has(action);
      console.info(ctx.t(enabled ? 'system.command' : 'system.disabledCommand', { action }));
      bus.emit('command', { action, enabled });
    }
  }
}

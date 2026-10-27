import Phaser from 'phaser';
import { getContext } from '../core/context';
import { hexColor } from '../core/scale';
import type { SpriteRef } from '../types/data';

/** 데이터의 spriteKey마다 색 사각형 텍스처를 만든다. 나중에 도트 아트 로드로 바꾼다. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    const { data } = getContext();
    const refs: SpriteRef[] = [
      data.player,
      data.weapons.projectile,
      ...data.weapons.weapons,
      ...data.enemies.enemies,
      data.pickups.energyOrb,
      data.pickups.coin,
      data.mapgen.props.exitPortal,
      data.mapgen.props.encounterCore,
      ...data.skills.skills.flatMap((s) => Object.values(s.sprites)),
      ...data.ultimates.ultimates.flatMap((u) => Object.values(u.sprites)),
    ];
    for (const ref of refs) this.makeRectTexture(ref);

    this.scene.start('Run');
    this.scene.launch('UI');
  }

  private makeRectTexture(ref: SpriteRef): void {
    if (this.textures.exists(ref.spriteKey)) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(hexColor(ref.color), 1);
    g.fillRect(0, 0, ref.size, ref.size);
    g.generateTexture(ref.spriteKey, ref.size, ref.size);
    g.destroy();
  }
}

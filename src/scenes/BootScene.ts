import { applyArtDensity } from '../entities/art';
import Phaser from 'phaser';
import { getContext } from '../core/context';
import { hexColor } from '../core/scale';
import { animKey } from '../systems/art';
import type { ArtAnimId, SpriteRef } from '../types/data';

/**
 * 그림 준비: art.json에 적힌 spriteKey는 public/ 아래 PNG(가로 프레임 스트립)를 불러오고,
 * 적혀 있지 않거나 불러오지 못한 키는 색 사각형 텍스처를 만든다.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    const { art } = getContext().data;
    for (const [key, s] of Object.entries(art.sprites)) {
      this.load.spritesheet(key, `${art.basePath}${s.file}`, { frameWidth: s.frameWidth, frameHeight: s.frameHeight, endFrame: (s.frames ?? 1) - 1 });
    }
  }

  create(): void {
    const ctx = getContext();
    const { data } = ctx;
    // 불러온 그림: 화면 아이콘이 쓸 수 있게 기록하고, 애니메이션(idle·move)을 만든다
    for (const [key, s] of Object.entries(data.art.sprites)) {
      if (!this.textures.exists(key)) continue;
      ctx.artLoaded.add(key);
      // 타일은 반복해서 까는 TileSprite가 실제 픽셀을 읽으므로 그쪽에서 줄인다
      if (!key.startsWith('tile_')) applyArtDensity(this.textures.get(key), s.density ?? 1);
      for (const [id, a] of Object.entries(s.anims ?? {}) as [ArtAnimId, { from: number; to: number; fps: number }][]) {
        this.anims.create({ key: animKey(key, id), frames: this.anims.generateFrameNumbers(key, { start: a.from, end: a.to }), frameRate: a.fps, repeat: -1 });
      }
    }
    const refs: SpriteRef[] = [
      data.player,
      data.weapons.projectile,
      ...data.weapons.weapons,
      ...data.enemies.enemies,
      data.enemies.projectile,
      data.loot.chest.weapon,
      data.loot.chest.item,
      data.loot.merchantStand,
      data.loot.spire.small.sprite,
      data.loot.spire.medium.sprite,
      data.pickups.energyOrb,
      data.pickups.coin,
      data.mapgen.props.exitPortal,
      data.mapgen.props.encounterCore,
      data.mapgen.vending,
      data.mapgen.vending.potion,
      ...data.skills.skills.flatMap((s) => Object.values(s.sprites)),
      ...data.ultimates.ultimates.flatMap((u) => Object.values(u.sprites)),
    ];
    // 파일이 없거나 깨져서 못 불러온 그림은 그 키만 색 사각형으로 남긴다
    for (const [key, s] of Object.entries(data.art.sprites)) {
      if (!this.textures.exists(key)) console.warn(`[그림] '${key}' 불러오기 실패 (${data.art.basePath}${s.file}) — 색 사각형으로 대신함`);
    }
    for (const ref of refs) this.makeRectTexture(ref);
    for (const o of data.lab.objects) this.makeRectTexture({ spriteKey: o.spriteKey, color: o.color, size: o.w, height: o.h });

    // 게임은 실험장에서 시작한다
    this.scene.start('Lab');
    this.scene.launch('UI');
  }

  private makeRectTexture(ref: SpriteRef): void {
    if (this.textures.exists(ref.spriteKey)) return;
    const g = this.make.graphics({}, false);
    g.fillStyle(hexColor(ref.color), 1);
    g.fillRect(0, 0, ref.size, ref.height ?? ref.size);
    g.generateTexture(ref.spriteKey, ref.size, ref.height ?? ref.size);
    g.destroy();
  }
}

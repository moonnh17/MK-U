/**
 * 상자(무기·아이템)와 상인 진열대. F(모바일: 열기·구매)로 상호작용한다.
 * 무엇이 나오는지는 RunScene이 systems/loot.ts로 정한다.
 */
import type Phaser from 'phaser';
import { getContext } from '../core/context';
import type { CardStock, StockItem } from '../systems/loot';
import { fitArt } from './art';
import type { GradeId, SpriteRef } from '../types/data';

export type ChestKind = 'weapon' | 'item';

export class Chest {
  readonly sprite: Phaser.GameObjects.Image;
  opened = false;

  constructor(
    scene: Phaser.Scene,
    readonly kind: ChestKind,
    ref: SpriteRef,
    x: number,
    y: number,
    /** 등급 가중치 (무기 상자: 상자 등급·보스 스테이지별 / 아이템 상자: 보물·습격) */
    readonly weights: Partial<Record<GradeId, number>>,
    /** 정해진 것: 아이템 상자 = 아이템 id(보스 전용), 무기 상자 = 무기 id(히든보스 전용) */
    readonly fixedItem: string | undefined,
    /** 다가가면 머리 위에 띄우는 상자 이름 */
    readonly nameKey: string,
  ) {
    this.sprite = scene.add.image(x, y, ref.spriteKey).setDepth(2);
    fitArt(getContext().data, this.sprite, ref.size, ref.height ?? ref.size);
    scene.tweens.add({ targets: this.sprite, scaleX: 1.08, scaleY: 1.08, duration: 500, yoyo: true, repeat: -1 });
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  /** 열린 모습(반투명)으로 남긴다 */
  open(): void {
    this.opened = true;
    this.sprite.scene.tweens.killTweensOf(this.sprite);
    this.sprite.setScale(1).setAlpha(0.35);
  }

  destroy(): void {
    this.sprite.scene.tweens.killTweensOf(this.sprite);
    this.sprite.destroy();
  }
}

/** 스킬·스탯 상점 진열대 하나: 아이콘 + 이름·가격. 사면 바로 적용된다 */
export class CardStand {
  readonly base: Phaser.GameObjects.Image;
  readonly iconImg: Phaser.GameObjects.Image | null;
  readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, readonly stock: CardStock, standRef: SpriteRef, iconKey: string, iconPx: number, x: number, y: number, text: string, color: string) {
    this.base = scene.add.image(x, y + 4, standRef.spriteKey).setDepth(1);
    this.iconImg = scene.textures.exists(iconKey) ? scene.add.image(x, y - 6, iconKey).setDisplaySize(iconPx, iconPx).setDepth(2) : null;
    this.label = scene.add
      .text(x, y + 12, text, { fontFamily: 'sans-serif', fontSize: '8px', color, stroke: '#000000', strokeThickness: 2, align: 'center' })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  get x(): number {
    return this.base.x;
  }

  get y(): number {
    return this.base.y;
  }

  markSold(text: string): void {
    this.stock.sold = true;
    this.iconImg?.setVisible(false);
    this.label.setText(text).setColor('#888888');
  }
}

/** 상인 진열대 하나: 무기 그림 + 가격. 사면 그 자리에서 바로 손에 든다 */
export class MerchantStand {
  readonly base: Phaser.GameObjects.Image;
  readonly weaponImg: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    readonly stock: StockItem,
    standRef: SpriteRef,
    weaponSpriteKey: string,
    x: number,
    y: number,
    priceText: string,
    gradeColor: string,
  ) {
    this.base = scene.add.image(x, y + 4, standRef.spriteKey).setDepth(1);
    this.weaponImg = scene.add.image(x, y - 2, weaponSpriteKey).setDepth(2);
    this.label = scene.add
      .text(x, y + 12, priceText, { fontFamily: 'sans-serif', fontSize: '8px', color: gradeColor, stroke: '#000000', strokeThickness: 2, align: 'center' })
      .setOrigin(0.5, 0)
      .setDepth(3);
  }

  get x(): number {
    return this.base.x;
  }

  get y(): number {
    return this.base.y;
  }

  markSold(text: string): void {
    this.stock.sold = true;
    this.weaponImg.setVisible(false);
    this.label.setText(text).setColor('#888888');
  }

  destroy(): void {
    this.base.destroy();
    this.weaponImg.destroy();
    this.label.destroy();
  }
}

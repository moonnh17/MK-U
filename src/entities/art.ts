/**
 * 도트 아트를 게임 오브젝트에 맞춘다: 그림 크기와 상관없이 판정은 데이터 크기, 기준점은 art.json(없으면 종류별 기본값).
 * 색 사각형(그림 크기 = 판정 크기)이면 아무것도 바뀌지 않는다.
 */
import type Phaser from 'phaser';
import type { GameData } from '../data/index';
import { anchorOf, collectAssets, fitHitbox, type AssetGroup } from '../systems/art';

let groups: Map<string, AssetGroup> | null = null;

function groupOf(data: GameData, key: string): AssetGroup | undefined {
  groups ??= new Map(collectAssets(data).map((r) => [r.key, r.group]));
  return groups.get(key);
}

/**
 * img의 기준점을 판정 가운데로 맞추고, 물리 판정이 있으면 hitW×hitH(배율 적용 전)로 고정한다.
 * 텍스처를 바꾼 뒤(setTexture)에도 다시 부른다.
 */
export function fitArt(data: GameData, img: Phaser.GameObjects.Image, hitW: number, hitH = hitW): void {
  const key = img.texture.key;
  const fit = fitHitbox(img.frame.realWidth, img.frame.realHeight, hitW, hitH, anchorOf(key, groupOf(data, key), data.art));
  img.setOrigin(fit.originX, fit.originY);
  const body = img.body as Phaser.Physics.Arcade.Body | null;
  if (body && 'setOffset' in body) {
    body.setSize(hitW, hitH, false);
    body.setOffset(fit.offsetX, fit.offsetY);
  }
}

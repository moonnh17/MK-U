/**
 * 도트 아트를 게임 오브젝트에 맞춘다: 그림 크기와 상관없이 판정은 데이터 크기, 기준점은 art.json(없으면 종류별 기본값).
 * 색 사각형(그림 크기 = 판정 크기)이면 아무것도 바뀌지 않는다.
 */
import type Phaser from 'phaser';
import type { GameData } from '../data/index';
import { anchorOf, animKey, collectAssets, facingFlip, fitHitbox, pickAnim, type AssetGroup } from '../systems/art';

let groups: Map<string, AssetGroup> | null = null;

/** UI·실험장처럼 기준 해상도 좌표를 쓰는 씬: 기준 화면이 캔버스에 꽉 차게 */
export function fitBaseCamera(scene: Phaser.Scene, baseW: number, baseH: number, renderScale: number): void {
  scene.cameras.main.setZoom(renderScale).centerOn(baseW / 2, baseH / 2);
}

/**
 * 고밀도 그림: 텍스처의 각 프레임이 게임 크기(픽셀 ÷ density)로 그려지게 한다.
 * 크기만 줄이고 텍스처 좌표는 그대로 두므로 판정·기준점·배율 코드는 게임 크기만 본다. (WebGL 렌더러)
 */
export function applyArtDensity(texture: Phaser.Textures.Texture, density: number): void {
  if (density <= 1) return;
  for (const name of texture.getFrameNames()) {
    const f = texture.get(name);
    const { u0, v0, u1, v1, realWidth, realHeight } = f;
    f.setSize(realWidth / density, realHeight / density);
    f.u0 = u0;
    f.v0 = v0;
    f.u1 = u1;
    f.v1 = v1;
  }
}

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

/** 이만큼 빠르면 움직이는 중 (move 애니메이션) */
const MOVING_SPEED = 5;

/**
 * 매 프레임: 움직이면 move, 멈추면 idle 애니메이션(그림에 있으면), 움직이는 방향으로 좌우 반전.
 * 색 사각형은 애니메이션이 없고 뒤집어도 같아 보인다.
 */
export function animateArt(data: GameData, sprite: Phaser.GameObjects.Sprite): void {
  const body = sprite.body as Phaser.Physics.Arcade.Body | null;
  if (!body) return;
  const key = sprite.texture.key;
  const def = data.art.sprites[key];
  sprite.setFlipX(facingFlip(body.velocity.x, sprite.flipX, def?.facing));
  const anim = pickAnim(def?.anims, body.speed > MOVING_SPEED);
  if (anim && sprite.scene.anims.exists(animKey(key, anim))) sprite.play(animKey(key, anim), true);
}

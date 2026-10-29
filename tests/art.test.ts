import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { anchorOf, assetsMarkdown, collectAssets, fitHitbox, validateArt } from '../src/systems/art';
import type { ArtData } from '../src/types/data';

const refs = collectAssets(gameData);

describe('그림 목록', () => {
  it('데이터의 spriteKey를 모두 한 번씩 모은다', () => {
    const keys = refs.map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const e of gameData.enemies.enemies) expect(keys).toContain(e.spriteKey);
    for (const w of gameData.weapons.weapons) expect(keys).toContain(w.spriteKey);
    for (const it of gameData.items.items) expect(keys).toContain(it.spriteKey);
    for (const o of gameData.lab.objects) expect(keys).toContain(o.spriteKey);
    expect(keys).toContain(gameData.player.spriteKey);
  });
  it('같은 그림을 쓰는 곳은 한 줄로 합치고 수를 센다 (분신 = 왕실특무마기법사)', () => {
    const mage = refs.find((r) => r.key === 'enemy_royal_mage')!;
    expect(mage.group).toBe('boss');
    expect(mage.uses).toBe(2);
  });
  it('권장 크기는 지금 판정 크기', () => {
    const p = refs.find((r) => r.key === gameData.player.spriteKey)!;
    expect([p.w, p.h]).toEqual([gameData.player.size, gameData.player.height ?? gameData.player.size]);
  });
  it('문서 이름 키는 모두 ko.json에 있다', () => {
    for (const r of refs) for (const k of r.labelKeys) if (!k.startsWith('#')) expect(gameData.text[k], k).toBeTypeOf('string');
  });
});

describe('기준점과 판정 자리', () => {
  it('그림이 판정과 같으면 가운데 (지금 색 사각형과 같다)', () => {
    expect(fitHitbox(16, 16, 16, 16, 'feet')).toEqual({ originX: 0.5, originY: 0.5, offsetX: 0, offsetY: 0 });
  });
  it('feet: 판정이 그림 아래쪽에 붙는다', () => {
    // 24×32 그림, 판정 12×12 → 판정 가운데는 위에서 26px
    expect(fitHitbox(24, 32, 12, 12, 'feet')).toEqual({ originX: 0.5, originY: 26 / 32, offsetX: 6, offsetY: 20 });
  });
  it('center: 판정이 그림 가운데', () => {
    expect(fitHitbox(24, 32, 12, 12, 'center')).toEqual({ originX: 0.5, originY: 0.5, offsetX: 6, offsetY: 10 });
  });
  it('그림이 판정보다 작아도 가운데에 맞춘다', () => {
    expect(fitHitbox(8, 8, 12, 12, 'feet')).toEqual({ originX: 0.5, originY: 0.5, offsetX: -2, offsetY: -2 });
  });
  it('기본 기준점: 캐릭터·오브젝트 feet, 탄·무기·스킬 center, art.json 값이 우선', () => {
    const art: ArtData = { basePath: 'assets/', sprites: { enemy_tomakki: { file: 'a.png', frameWidth: 8, frameHeight: 8, anchor: 'center' } } };
    expect(anchorOf('player', 'player', art)).toBe('feet');
    expect(anchorOf('x', 'projectile', art)).toBe('center');
    expect(anchorOf('enemy_tomakki', 'enemy', art)).toBe('center');
  });
});

describe('art.json 검사', () => {
  it('지금 데이터 통과', () => {
    expect(validateArt(gameData.art, refs)).toEqual([]);
  });
  it('없는 키·잘못된 경로·프레임 값을 잡는다', () => {
    const bad: ArtData = {
      basePath: 'assets',
      sprites: {
        nope: { file: 'a.png', frameWidth: 8, frameHeight: 8 },
        player: { file: '../x.png', frameWidth: 0, frameHeight: 8.5, frames: 0 },
        enemy_tomakki: { file: 'tomakki.gif', frameWidth: 8, frameHeight: 8, anchor: 'top' as never },
      },
    };
    const e = validateArt(bad, refs).join('\n');
    for (const s of ['basePath', 'nope: 데이터에 없는', 'player.file', 'player.frameWidth', 'player.frameHeight', 'player.frames', 'enemy_tomakki.file', 'enemy_tomakki.anchor']) expect(e).toContain(s);
  });
});

describe('docs/ASSETS.md', () => {
  it('데이터에서 만든 목록과 같다 (다르면 npm run assets)', async () => {
    await expect(assetsMarkdown(refs, gameData.art, gameData.text)).toMatchFileSnapshot('../docs/ASSETS.md');
  });
});

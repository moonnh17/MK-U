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

describe('화면 아이콘·타일 키', () => {
  it('스킬·궁극기 아이콘, 제미니 아이콘·초상화, 챕터별 바닥·복도·벽 + 문 타일이 목록에 있다', async () => {
    const { artKeys } = await import('../src/systems/art');
    const keys = new Set(refs.map((r) => r.key));
    for (const s of gameData.skills.skills) expect(keys.has(artKeys.skillIcon(s.id))).toBe(true);
    for (const u of gameData.ultimates.ultimates) expect(keys.has(artKeys.ultimateIcon(u.id))).toBe(true);
    expect(keys.has(artKeys.geminiIcon) && keys.has(artKeys.geminiPortrait)).toBe(true);
    for (let c = 1; c <= gameData.mapgen.chapters; c++) for (const p of ['floor', 'corridor', 'wall'] as const) expect(keys.has(artKeys.tile(p, c))).toBe(true);
    expect(keys.has(artKeys.door)).toBe(true);
  });
  it('타일은 한 타일 크기, 지금 챕터 색 (3장 바닥 붉은 검정)', async () => {
    const { artKeys } = await import('../src/systems/art');
    const f3 = refs.find((r) => r.key === artKeys.tile('floor', 3))!;
    expect([f3.w, f3.h, f3.color]).toEqual([gameData.mapgen.tileSize, gameData.mapgen.tileSize, gameData.ui.chapterRooms['3']!.floorColor]);
    expect(refs.find((r) => r.key === artKeys.tile('wall', 1))!.color).toBe(gameData.ui.room.wallColor);
  });
});

describe('애니메이션·좌우 반전', () => {
  it('움직이면 move, 멈추면 idle, 없으면 다른 하나', async () => {
    const { pickAnim, animKey } = await import('../src/systems/art');
    const both = { idle: 1, move: 1 };
    expect([pickAnim(both, true), pickAnim(both, false)]).toEqual(['move', 'idle']);
    expect(pickAnim({ idle: 1 }, true)).toBe('idle');
    expect(pickAnim({ move: 1 }, false)).toBe('move');
    expect(pickAnim(undefined, true)).toBeNull();
    expect(animKey('player_human', 'move')).toBe('player_human.move');
  });
  it('오른쪽을 보는 그림은 왼쪽으로 움직일 때 뒤집고, 거의 멈추면 그대로', async () => {
    const { facingFlip } = await import('../src/systems/art');
    expect(facingFlip(-30, false)).toBe(true);
    expect(facingFlip(30, true)).toBe(false);
    expect(facingFlip(0.5, true)).toBe(true);
    expect(facingFlip(-30, false, 'left')).toBe(false);
    expect(facingFlip(30, false, 'left')).toBe(true);
  });
  it('애니메이션 프레임 범위·fps·방향 검사', () => {
    const bad: ArtData = {
      basePath: 'assets/',
      sprites: {
        player_human: { file: 'p.png', frameWidth: 16, frameHeight: 24, frames: 4, facing: 'up' as never, anims: { idle: { from: 0, to: 1, fps: 4 }, move: { from: 2, to: 4, fps: 0 } } },
      },
    };
    const e = validateArt(bad, refs).join('\n');
    expect(e).toContain('facing');
    expect(e).toContain('anims.move: 0 ≤ from ≤ to < frames(4)');
    expect(e).toContain('anims.move.fps');
    expect(e).not.toContain('anims.idle');
  });
});

/**
 * 도트 아트 목록·기준점 (순수 함수).
 * 데이터의 spriteKey를 모두 모아 그려야 할 그림 목록을 만든다(권장 크기 = 지금 판정 크기).
 * art.json에 적힌 키만 PNG를 불러오고, 나머지는 색 사각형으로 남는다.
 */
import type { GameData } from '../data/index';
import type { ArtAnchor, ArtAnimId, ArtData, SpriteRef } from '../types/data';

export type AssetGroup = 'player' | 'weapon' | 'projectile' | 'enemy' | 'boss' | 'prop' | 'pickup' | 'skill' | 'lab' | 'item' | 'icon' | 'tile' | 'fx';

export const ASSET_GROUPS: readonly AssetGroup[] = ['player', 'weapon', 'projectile', 'enemy', 'boss', 'prop', 'pickup', 'skill', 'lab', 'item', 'icon', 'tile', 'fx'];

/** 화면(DOM·HUD) 아이콘의 권장 크기 */
export const ICON_SIZE = 16;
/** 제미니 스토리 대화 초상화의 권장 크기 */
export const PORTRAIT_SIZE = { w: 48, h: 64 };

/** 그림 키 규칙 (데이터에 spriteKey가 없는 화면 그림) */
export const artKeys = {
  skillIcon: (skillId: string) => `icon_skill_${skillId}`,
  statIcon: (statId: string) => `icon_stat_${statId}`,
  ultimateIcon: (ultimateId: string) => `icon_ult_${ultimateId}`,
  geminiIcon: 'icon_gemini',
  geminiPortrait: 'portrait_gemini',
  /** 챕터별 방 타일: 바닥·복도 바닥·벽 */
  tile: (part: TilePart, chapter: number) => `tile_${part}_c${chapter}`,
  door: 'tile_door',
  /** 방마다 고르는 바닥 변형, 지형지물·바닥 장식 그림 */
  floorVariant: (chapter: number, i: number) => `tile_floor_c${chapter}_v${i}`,
  obstacle: (chapter: number, i: number) => `obstacle_c${chapter}_${i}`,
  decal: (chapter: number, i: number) => `decal_c${chapter}_${i}`,
  /** 전직 후 플레이어 모습 (학파 id) */
  playerSchool: (school: string) => `player_${school}`,
  /** 보스 단계별 모습: 1 = 처음(마기카이저 구속), 2 = 강화·다음 단계 … (없으면 기본 그림 그대로) */
  bossPhase: (spriteKey: string, phase: number) => `${spriteKey}_phase${phase}`,
} as const;

/** 보스의 단계 수: 시간 단계 보스는 열리는 단계 + 1, 체력 강화가 있으면 2, 없으면 1 */
export function bossPhaseCount(b: { enrageAt: number; unlocks?: readonly number[] }): number {
  return b.unlocks?.length ? b.unlocks.length + 1 : b.enrageAt > 0 ? 2 : 1;
}

/** 보스 단계 → 그림 단계: 시간 단계 보스는 열린 단계 + 1, 체력 강화 보스는 강화 단계(1·2) */
export function bossArtPhase(timeStage: number, hpPhase: 1 | 2, hasUnlocks: boolean): number {
  return hasUnlocks ? timeStage + 1 : hpPhase;
}

export type TilePart = 'floor' | 'corridor' | 'wall';
export const TILE_PARTS: readonly TilePart[] = ['floor', 'corridor', 'wall'];

/** 그림 종류별 기본 기준점: 서 있는 것은 발밑, 날아가거나 회전하는 것은 가운데 */
const DEFAULT_ANCHOR: Record<AssetGroup, ArtAnchor> = {
  player: 'feet',
  weapon: 'center',
  projectile: 'center',
  enemy: 'feet',
  boss: 'feet',
  prop: 'feet',
  pickup: 'center',
  skill: 'center',
  lab: 'feet',
  item: 'center',
  icon: 'center',
  tile: 'center',
  fx: 'center',
};

export interface AssetRef {
  key: string;
  group: AssetGroup;
  /** 판정(= 권장 캔버스) 크기 */
  w: number;
  h: number;
  /** 지금 쓰는 색 */
  color: string;
  /** 이름 텍스트 키들 (문서용, 이어 붙인다. '#'로 시작하면 부위 이름 그대로) */
  labelKeys: string[];
  /** 같은 그림을 쓰는 곳 수 */
  uses: number;
}

/**
 * 데이터에 있는 그림 전부 (같은 키는 한 줄, 처음 나온 것 기준).
 * item: 아이템 아이콘 (게임 화면에는 안 그리고 카드·인벤토리에 쓴다)
 */
export function collectAssets(d: GameData): AssetRef[] {
  const out = new Map<string, AssetRef>();
  const add = (group: AssetGroup, ref: SpriteRef, ...labelKeys: string[]) => {
    const prev = out.get(ref.spriteKey);
    if (prev) {
      prev.uses++;
      return;
    }
    out.set(ref.spriteKey, { key: ref.spriteKey, group, w: ref.size, h: ref.height ?? ref.size, color: ref.color, labelKeys, uses: 1 });
  };
  add('player', d.player, 'asset.player');
  for (const j of d.jobs.jobs.filter((x) => x.enabled)) {
    for (const a of j.advancements) add('player', { ...d.player, spriteKey: artKeys.playerSchool(a.id) }, 'asset.player', a.nameKey);
  }
  for (const w of d.weapons.weapons) {
    add('weapon', w, w.nameKey);
    if (w.pattern.kind === 'meteor') add('projectile', w.pattern.sprite, w.nameKey, '#fx');
    if (w.signature?.kind === 'laser' && w.signature.beam) add('projectile', w.signature.beam, w.nameKey, '#fx');
  }
  add('projectile', d.weapons.projectile, 'asset.playerBullet');
  add('projectile', d.enemies.projectile, 'asset.enemyBullet');
  for (const e of d.enemies.enemies) add(e.rank === 'boss' || e.rank === 'hiddenBoss' ? 'boss' : 'enemy', e, e.nameKey);
  // 보스 단계별 모습 (단계가 있는 보스만)
  for (const b of [...d.bosses.bosses, ...d.bosses.hiddenBosses]) {
    const e = d.enemies.enemies.find((x) => x.id === b.id);
    const n = bossPhaseCount(b);
    if (!e || n < 2) continue;
    for (let p = 1; p <= n; p++) add('boss', { ...e, spriteKey: artKeys.bossPhase(e.spriteKey, p) }, e.nameKey, `#${p}단계`);
  }
  add('prop', d.loot.chest.weapon, 'asset.chestWeapon');
  add('prop', d.loot.chest.item, 'asset.chestItem');
  add('prop', d.loot.merchantStand, 'asset.merchantStand');
  add('prop', d.loot.spire.small.sprite, 'asset.spireSmall');
  add('prop', d.loot.spire.medium.sprite, 'asset.spireMedium');
  add('prop', d.mapgen.props.exitPortal, 'asset.exitPortal');
  add('prop', d.mapgen.props.encounterCore, 'asset.encounterCore');
  add('pickup', d.pickups.energyOrb, 'asset.energyOrb');
  add('pickup', d.pickups.coin, 'asset.coin');
  for (const s of d.skills.skills) for (const [part, ref] of Object.entries(s.sprites)) add('skill', ref, s.nameKey, `#${part}`);
  for (const u of d.ultimates.ultimates) for (const [part, ref] of Object.entries(u.sprites)) add('skill', ref, u.nameKey, `#${part}`);
  for (const o of d.lab.objects) add('lab', { spriteKey: o.spriteKey, color: o.color, size: o.w, height: o.h }, `lab.object.${o.kind}`);
  for (const it of d.items.items) add('item', it, it.nameKey);
  // 화면 아이콘: 스킬·궁극기·제미니 (HUD 칸·카드·인벤토리·컷씬)
  for (const s of d.stats.stats) add('icon', { spriteKey: artKeys.statIcon(s.id), color: d.ui.hud.skillbar.emptyColor, size: ICON_SIZE }, s.nameKey);
  for (const s of d.skills.skills) add('icon', { spriteKey: artKeys.skillIcon(s.id), color: s.color, size: ICON_SIZE }, s.nameKey);
  for (const u of d.ultimates.ultimates) add('icon', { spriteKey: artKeys.ultimateIcon(u.id), color: u.color, size: ICON_SIZE }, u.nameKey);
  add('icon', { spriteKey: artKeys.geminiIcon, color: d.gemini.color, size: ICON_SIZE }, 'gemini.name', '#icon');
  add('icon', { spriteKey: artKeys.geminiPortrait, color: d.gemini.color, size: PORTRAIT_SIZE.w, height: PORTRAIT_SIZE.h }, 'gemini.name', '#portrait');
  // 방 타일 (한 타일 크기, 반복해서 깐다)
  const ts = d.mapgen.tileSize;
  for (let c = 1; c <= d.mapgen.chapters; c++) {
    const theme = d.ui.chapterRooms[String(c)] ?? d.ui.room;
    const colors: Record<TilePart, string> = { floor: theme.floorColor, corridor: theme.corridorColor, wall: theme.wallColor };
    for (const part of TILE_PARTS) add('tile', { spriteKey: artKeys.tile(part, c), color: colors[part], size: ts }, `asset.tile.${part}`, `#${c}장`);
  }
  add('tile', { spriteKey: artKeys.door, color: d.mapgen.door.color, size: ts }, 'asset.tile.door');
  const dr = d.mapgen.dressing;
  for (let c = 1; c <= d.mapgen.chapters; c++) {
    const theme = d.ui.chapterRooms[String(c)] ?? d.ui.room;
    for (let i = 0; i < (dr.floorVariants[String(c)] ?? 0); i++) add('tile', { spriteKey: artKeys.floorVariant(c, i), color: theme.floorColor, size: ts }, 'asset.tile.floor', `#${c}장 변형`);
    for (let i = 0; i < dr.obstacleKinds; i++) add('prop', { spriteKey: artKeys.obstacle(c, i), color: dr.obstacleBaseColor, size: ts }, 'asset.obstacle', `#${c}장`);
    for (let i = 0; i < dr.decalKinds; i++) add('prop', { spriteKey: artKeys.decal(c, i), color: dr.decalColor, size: ts }, 'asset.decal', `#${c}장`);
  }
  add('prop', d.mapgen.vending, 'asset.vending');
  add('prop', d.mapgen.roomProps.crate, 'asset.crate');
  add('prop', d.mapgen.roomProps.barrel, 'asset.barrel');
  for (const s of d.mapgen.roomProps.statues) add('prop', s, 'asset.statue', `#${s.kind}`);
  add('pickup', d.mapgen.vending.potion, 'asset.potion');
  // 타격·처치·등장 이펙트
  for (const [id, ref] of Object.entries(d.juice.fx)) add('fx', ref, `asset.fx.${id}`);
  return [...out.values()];
}

/** 애니메이션 키 (Phaser 애니메이션 이름) */
export function animKey(spriteKey: string, anim: ArtAnimId): string {
  return `${spriteKey}.${anim}`;
}

/** 지금 재생할 애니메이션: 움직이면 move, 아니면 idle. 그 애니메이션이 없으면 다른 하나, 둘 다 없으면 null */
export function pickAnim(anims: Partial<Record<ArtAnimId, unknown>> | undefined, moving: boolean): ArtAnimId | null {
  if (!anims) return null;
  const want: ArtAnimId = moving ? 'move' : 'idle';
  if (anims[want]) return want;
  const other: ArtAnimId = moving ? 'idle' : 'move';
  return anims[other] ? other : null;
}

/**
 * 좌우 반전: 그림이 바라보는 방향과 반대로 움직이면 뒤집는다. 거의 안 움직이면(|vx| ≤ dead) 그대로.
 */
export function facingFlip(vx: number, prevFlip: boolean, facing: 'right' | 'left' = 'right', dead = 1): boolean {
  if (Math.abs(vx) <= dead) return prevFlip;
  return facing === 'right' ? vx < 0 : vx > 0;
}

/** 이 키의 기준점: art.json에 적은 값, 없으면 그림 종류별 기본값 */
export function anchorOf(key: string, group: AssetGroup | undefined, art: ArtData): ArtAnchor {
  return art.sprites[key]?.anchor ?? (group ? DEFAULT_ANCHOR[group] : 'center');
}

/**
 * 그림 프레임(fw×fh) 안에서 판정(hw×hh)이 놓일 자리.
 * origin: 게임 오브젝트 좌표(= 판정 가운데)가 프레임의 어디인지(0~1)
 * offset: 물리 판정의 프레임 왼쪽 위 기준 위치(배율 적용 전 px)
 * feet는 판정을 그림 아래쪽에 붙인다. 그림이 판정보다 작거나 같으면 가운데.
 */
export function fitHitbox(
  fw: number,
  fh: number,
  hw: number,
  hh: number,
  anchor: ArtAnchor,
): { originX: number; originY: number; offsetX: number; offsetY: number } {
  const cy = anchor === 'feet' && fh > hh ? fh - hh / 2 : fh / 2;
  return { originX: 0.5, originY: cy / fh, offsetX: fw / 2 - hw / 2, offsetY: cy - hh / 2 };
}

/** art.json 검사: 데이터에 없는 키, 파일 경로, 프레임 값 */
export function validateArt(art: ArtData, refs: readonly AssetRef[]): string[] {
  const errors: string[] = [];
  const keys = new Set(refs.map((r) => r.key));
  if (art.basePath !== '' && !art.basePath.endsWith('/')) errors.push('art.basePath: /로 끝나야 함');
  for (const [key, s] of Object.entries(art.sprites)) {
    const w = `art.sprites.${key}`;
    if (!keys.has(key)) errors.push(`${w}: 데이터에 없는 spriteKey`);
    if (!/^[\w\-./]+\.png$/i.test(s.file) || s.file.includes('..') || s.file.startsWith('/')) errors.push(`${w}.file: basePath 아래 .png 상대 경로`);
    for (const k of ['frameWidth', 'frameHeight'] as const) if (!(Number.isInteger(s[k]) && s[k] > 0)) errors.push(`${w}.${k}: 양의 정수`);
    if (s.frames !== undefined && !(Number.isInteger(s.frames) && s.frames >= 1)) errors.push(`${w}.frames: 1 이상 정수`);
    if (s.anchor !== undefined && s.anchor !== 'center' && s.anchor !== 'feet') errors.push(`${w}.anchor: center · feet`);
    if (s.facing !== undefined && s.facing !== 'right' && s.facing !== 'left') errors.push(`${w}.facing: right · left`);
    const frames = s.frames ?? 1;
    for (const [id, a] of Object.entries(s.anims ?? {})) {
      if (id !== 'idle' && id !== 'move') errors.push(`${w}.anims.${id}: idle · move`);
      if (!a) continue;
      if (!(Number.isInteger(a.from) && Number.isInteger(a.to) && a.from >= 0 && a.from <= a.to && a.to < frames)) errors.push(`${w}.anims.${id}: 0 ≤ from ≤ to < frames(${frames})`);
      if (!(a.fps > 0)) errors.push(`${w}.anims.${id}.fps: 양수`);
    }
  }
  return errors;
}

/** docs/ASSETS.md 내용 (그림 목록 표). text: 이름 키 → 문구 */
export function assetsMarkdown(refs: readonly AssetRef[], art: ArtData, text: Readonly<Record<string, string>>): string {
  const label = (r: AssetRef) => r.labelKeys.map((k) => (k.startsWith('#') ? `(${k.slice(1)})` : (text[k] ?? k))).join(' ');
  const lines: string[] = [
    '# 도트 아트 목록',
    '',
    '`npm run assets`로 데이터에서 다시 만든다. 직접 고치지 말 것.',
    '',
    `- 그림 파일: \`public/${art.basePath}\` 아래 PNG. 키마다 한 장, 프레임은 가로로 이어 붙인다.`,
    '- 등록: `src/data/art.json`의 `sprites`에 `"키": { "file", "frameWidth", "frameHeight", "frames", "anchor" }`. 적지 않은 키는 색 사각형 그대로.',
    '- 크기: 권장 캔버스 = 판정 크기. 더 크게 그려도 판정은 그대로다. 기준점 feet는 판정이 그림 아래쪽에, center는 가운데에 놓인다.',
    '- 애니메이션(플레이어·적): `"anims": { "idle": { "from", "to", "fps" }, "move": { ... } }`(프레임 번호 0부터). 그림은 오른쪽을 보게 그리고(왼쪽이면 `"facing": "left"`), 움직이는 방향에 따라 좌우로 뒤집는다.',
    '- item·icon은 게임 화면이 아니라 카드·인벤토리·HUD 아이콘이다. tile은 한 장을 반복해서 깐다(문은 잠겼을 때만 보인다).',
    '',
    `전체 ${refs.length}개 · 그림 있음 ${refs.filter((r) => art.sprites[r.key]).length}개`,
  ];
  for (const g of ASSET_GROUPS) {
    const list = refs.filter((r) => r.group === g);
    if (list.length === 0) continue;
    lines.push('', `## ${g} (${list.length})`, '', '| 키 | 이름 | 권장 크기 | 기준점 | 지금 색 | 그림 |', '| --- | --- | --- | --- | --- | --- |');
    for (const r of list) {
      const a = art.sprites[r.key];
      const uses = r.uses > 1 ? ` 외 ${r.uses - 1}곳` : '';
      const file = a ? `${a.file} (${a.frames ?? 1}프레임)` : '—';
      lines.push(`| \`${r.key}\` | ${label(r)}${uses} | ${r.w}×${r.h} | ${anchorOf(r.key, r.group, art)} | ${r.color} | ${file} |`);
    }
  }
  return lines.join('\n') + '\n';
}

/** 스테이지 세우기: 방·복도·문·장애물·장식·포털. */
import { artDensity } from '../../systems/art';
import { stampGrid } from '../../systems/roomShapes';
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { Rng } from '../../core/rng';
import { hexColor } from '../../core/scale';
import { Door } from '../../entities/door';
import { fitArt } from '../../entities/art';
import { artKeys, type TilePart } from '../../systems/art';
import { FloorWeapon } from '../../entities/pickup';
import { type RoomNode } from '../../systems/mapgen';
import { RoomState, wavesForRoom } from '../../systems/roomState';
import { plainWeapon } from '../../systems/weapons';
import { contains, corridors, doorRect, interiorRect, roomCenter, roomRect, obstacleRects, wallRects, type Rect } from '../../systems/worldLayout';
import type { RunScene } from '../RunScene';

export class WorldBuilder {
  constructor(private readonly run: RunScene) {}

  buildWorld(): void {
    const d = this.run.ctx.data;
    const { map } = this.run.session;
    // 챕터가 바뀌면 방 색(타일 자리)도 바뀐다
    const theme = d.ui.chapterRooms[String(this.run.session.stage.chapter)] ?? d.ui.room;
    const floor = hexColor(theme.floorColor);
    const wall = hexColor(theme.wallColor);
    const corridorColor = hexColor(theme.corridorColor);
    const doorColor = hexColor(d.mapgen.door.color);

    // 타일 그림이 있으면 반복해서 깔고, 없으면 색
    const chapter = this.run.session.stage.chapter;
    const tile = (part: TilePart) => artKeys.tile(part, chapter);
    for (const c of corridors(map, this.run.m)) {
      this.addRect(c.floor, corridorColor, 0, tile('corridor'));
      for (const w of c.walls) this.run.walls.add(this.addRect(w, wall, 1, tile('wall')));
    }

    for (const node of map.rooms) {
      // 바닥: 방마다 변형 하나 (같은 시드면 같은 방)
      const dress = Rng.derive(this.run.ctx.config.seed, `dress-${map.chapter}-${map.stage}-${node.id}`);
      const floorN = d.mapgen.dressing.floorVariants[String(chapter)] ?? 0;
      this.addRect(roomRect(node, this.run.m), floor, 0, floorN > 0 ? artKeys.floorVariant(chapter, dress.int(0, floorN - 1)) : tile('floor'));
      for (const w of wallRects(node, this.run.m)) this.run.walls.add(this.addRect(w, wall, 1, tile('wall')));
      // 장애물: 벽처럼 이동과 탄(플레이어·적)을 막는다
      const obs = obstacleRects(node, this.run.m, d.mapgen);
      this.run.obstacles.set(node.id, obs);
      this.addDecals(node, chapter, obs, dress);
      for (const o of obs) this.dressObstacle(o, chapter, dress);

      const doors: Door[] = [];
      for (const dir of Object.keys(node.doors) as ('n' | 's' | 'e' | 'w')[]) {
        doors.push(new Door(this.run, doorRect(node, dir, this.run.m), doorColor, this.run.doorGroup, artKeys.door));
      }
      this.run.doorsByRoom.set(node.id, doors);

      const waves = wavesForRoom(
        this.run.ctx.config.seed,
        map.chapter,
        map.stage,
        node.id,
        node.kind,
        d.mapgen.combatWaves,
        d.bosses.bosses.find((b) => b.chapter === map.chapter && b.stage === map.stage)?.id ?? d.mapgen.bossPlaceholderEnemy,
        d.waves,
      );
      this.run.rooms.set(node.id, new RoomState(node.kind, waves, d.waves.waveDelaySec));

      const c = roomCenter(node, this.run.m);
      if (node.kind === 'exitRoom') this.addPortal(node);
      if (node.kind === 'encounterRoom') {
        this.addVending(node, obs, dress);
        const ref = d.mapgen.props.encounterCore;
        const core = this.run.add.image(c.x, c.y, ref.spriteKey).setDepth(2);
        fitArt(d, core, ref.size, ref.height ?? ref.size);
        this.run.cores.push({ sprite: core, roomId: node.id, radius: ref.size / 2 });
      }
      this.run.roomProps.addRoomProps(node, obs);
      this.run.roomProps.addDoorIcons(node);
    }
  }

  /** 바닥 장식: 밟고 지나가는 잔해·패널 (지형지물 자리는 피한다) */
  addDecals(node: RoomNode, chapter: number, obs: readonly Rect[], rng: Rng): void {
    const dr = this.run.ctx.data.mapgen.dressing;
    const inner = interiorRect(node, this.run.m, 8);
    const n = rng.int(dr.decalsPerRoom[0], dr.decalsPerRoom[1]);
    for (let i = 0; i < n; i++) {
      const x = rng.range(inner.x, inner.x + inner.w);
      const y = rng.range(inner.y, inner.y + inner.h);
      const key = artKeys.decal(chapter, rng.int(0, dr.decalKinds - 1));
      if (!this.run.ctx.artLoaded.has(key) || obs.some((o) => contains({ x: o.x - 16, y: o.y - 16, w: o.w + 32, h: o.h + 32 }, x, y))) continue;
      this.run.add.image(x, y, key).setDepth(0.2).setFlipX(rng.chance(0.5));
    }
  }

  /** 지형지물: 판정은 사각형 그대로, 겉모습은 챕터 소품을 빽빽이 찍어 바닥과 확실히 다르게 */
  dressObstacle(o: Rect, chapter: number, rng: Rng): void {
    const dr = this.run.ctx.data.mapgen.dressing;
    this.run.add.rectangle(o.x + o.w / 2 + 2, o.y + o.h / 2 + 5, o.w, o.h, 0x000000, 0.5).setDepth(0.5);
    this.run.walls.add(this.run.add.rectangle(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, hexColor(dr.obstacleBaseColor)).setDepth(1));
    for (const p of stampGrid(o, dr.obstacleStepPx)) {
      const key = artKeys.obstacle(chapter, rng.int(0, dr.obstacleKinds - 1));
      if (!this.run.ctx.artLoaded.has(key)) continue;
      this.run.add.image(p.x, p.y + 4, key).setOrigin(0.5, 0.8).setDepth(1.1 + p.y * 1e-5).setFlipX(rng.chance(0.5));
    }
  }

  /** 물약 자판기: 방 모서리 중 지형지물이 없는 곳 → 벽 가운데 → 아무 모서리. 방 가운데는 상자 자리라 쓰지 않는다 */
  addVending(node: RoomNode, obs: readonly Rect[], rng: Rng): void {
    const v = this.run.ctx.data.mapgen.vending;
    const inner = interiorRect(node, this.run.m, v.cornerInsetPx);
    const corners = [
      { x: inner.x, y: inner.y },
      { x: inner.x + inner.w, y: inner.y },
      { x: inner.x, y: inner.y + inner.h },
      { x: inner.x + inner.w, y: inner.y + inner.h },
    ];
    const edges = [
      { x: inner.x + inner.w / 2, y: inner.y },
      { x: inner.x + inner.w / 2, y: inner.y + inner.h },
      { x: inner.x, y: inner.y + inner.h / 2 },
      { x: inner.x + inner.w, y: inner.y + inner.h / 2 },
    ];
    const free = (ps: { x: number; y: number }[]) => ps.filter((p) => !obs.some((o) => contains({ x: o.x - 24, y: o.y - 24, w: o.w + 48, h: o.h + 48 }, p.x, p.y)));
    const pool = [free(corners), free(edges), corners].find((ps) => ps.length > 0)!;
    const at = rng.pick(pool);
    const sprite = this.run.add.image(at.x, at.y, v.spriteKey).setDepth(2);
    fitArt(this.run.ctx.data, sprite, v.size, v.height ?? v.size);
    this.run.loot.vendings.push({ x: at.x, y: at.y, stock: v.stock, sprite });
  }

  /** 방 바닥·벽: 타일 그림(key)이 있으면 반복해서 깔고, 없으면 색 사각형 */
  addRect(r: Rect, color: number, depth: number, key?: string): Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite {
    if (key && this.run.textures.exists(key)) return this.run.add.tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, key).setTileScale(1 / artDensity(this.run.ctx.data.art, key)).setDepth(depth);
    return this.run.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, color).setDepth(depth);
  }

  addPortal(node: RoomNode): void {
    const ref = this.run.ctx.data.mapgen.props.exitPortal;
    const c = roomCenter(node, this.run.m);
    const sprite = this.run.add.image(c.x, c.y, ref.spriteKey).setDepth(2);
    this.run.tweens.add({ targets: sprite, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
    this.run.tweens.add({ targets: sprite, angle: 360, duration: ref.spinSec * 1000, repeat: -1 });
    this.run.portals.push({ sprite, roomId: node.id, radius: ref.size / 2 });
  }

  placeTestWeapons(): void {
    const node = this.run.session.map.rooms[this.run.session.map.startId]!;
    const inner = interiorRect(node, this.run.m);
    const ids = this.run.ctx.data.mapgen.testWeapons;
    ids.forEach((id, i) => {
      const x = inner.x + (inner.w * (i + 1)) / (ids.length + 1);
      const y = inner.y + (inner.h * 3) / 4;
      const def = this.run.weaponDefOf(id);
      this.run.loot.floorWeapons.push(new FloorWeapon(this.run, plainWeapon(def), def.spriteKey, x, y));
    });
  }

  /** 지면 파괴 잔해: 벽처럼 막는다. 플레이어 자리·문 근처에는 만들지 않는다(갇힘 방지) */
  addObstacle(at: Vec2, radius: number, doorClear: number): { destroy(): void } | null {
    const d = this.run.ctx.data;
    if (Math.hypot(this.run.player.x - at.x, this.run.player.y - at.y) <= radius + d.player.size / 2 + 2) return null;
    const rid = this.run.session.currentRoomId;
    for (const door of rid === null ? [] : (this.run.doorsByRoom.get(rid) ?? [])) {
      if (Math.hypot(door.rect.x - at.x, door.rect.y - at.y) <= doorClear + radius) return null;
    }
    const rect = this.run.add.rectangle(at.x, at.y, radius * 2, radius * 2, hexColor(d.bosses.rubbleColor)).setDepth(1);
    this.run.walls.add(rect);
    return { destroy: () => this.run.walls.remove(rect, true, true) };
  }

  spawnPoint(node: RoomNode, rng: Rng, radius: number): Vec2 {
    const inner = interiorRect(node, this.run.m, radius);
    const minDist = this.run.ctx.data.waves.spawnMinPlayerDistance;
    let best: Vec2 = { x: inner.x, y: inner.y };
    let bestDist = -1;
    const obs = this.run.obstacles.get(node.id) ?? [];
    const blocked = (p: Vec2) => obs.some((o) => p.x > o.x - radius && p.x < o.x + o.w + radius && p.y > o.y - radius && p.y < o.y + o.h + radius);
    for (let i = 0; i < 30; i++) {
      const p = { x: rng.range(inner.x, inner.x + inner.w), y: rng.range(inner.y, inner.y + inner.h) };
      // 장애물 안에는 소환하지 않는다
      if (blocked(p)) continue;
      const dist = Math.hypot(p.x - this.run.player.x, p.y - this.run.player.y);
      if (dist >= minDist) return p;
      if (dist > bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best;
  }
}

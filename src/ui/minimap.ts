import Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { hexColor } from '../core/scale';
import { visibleRooms, type StageMap } from '../systems/mapgen';

/**
 * 미니맵: 방문한 방과 그 이웃만 보인다. 현재 방 강조, 조우 칸 !, 보스방 해골, 출구 표시.
 * 상태가 바뀐 경우에만 다시 그린다.
 */
export class Minimap {
  readonly container: Phaser.GameObjects.Container;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly glyphs: Phaser.GameObjects.Text[] = [];
  private signature = '';

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    const mm = ctx.data.ui.hud.minimap;
    this.container = scene.add.container(0, 0);
    this.container.add(
      scene.add.rectangle(0, 0, mm.width, mm.height, hexColor(mm.backColor)).setOrigin(0).setStrokeStyle(1, hexColor(mm.borderColor)),
    );
    this.g = scene.add.graphics();
    this.container.add(this.g);
  }

  /** encounters: 유형이 정해진 조우 칸 (방 id → 유형). 정해지면 ! 대신 유형 아이콘 */
  render(map: StageMap, visited: ReadonlySet<number>, currentId: number | null, revealAll: boolean, encounters: ReadonlyMap<number, string> = new Map()): void {
    const vis = visibleRooms(map, visited, revealAll);
    const sig = `${map.chapter}-${map.stage}|${[...vis].sort().join(',')}|${[...visited].sort().join(',')}|${currentId}|${[...encounters].join(',')}`;
    if (sig === this.signature) return;
    this.signature = sig;

    const mm = this.ctx.data.ui.hud.minimap;
    const shown = map.rooms.filter((r) => vis.has(r.id));
    const minX = Math.min(...map.rooms.map((r) => r.gx));
    const maxX = Math.max(...map.rooms.map((r) => r.gx));
    const minY = Math.min(...map.rooms.map((r) => r.gy));
    const maxY = Math.max(...map.rooms.map((r) => r.gy));
    const cols = maxX - minX + 1;
    const rows = maxY - minY + 1;
    const pad = 3;
    const pitch = Math.min(mm.maxCell + mm.cellGap, Math.floor((mm.width - pad * 2) / cols), Math.floor((mm.height - pad * 2) / rows));
    const cell = Math.max(2, pitch - mm.cellGap);
    const ox = Math.floor((mm.width - cols * pitch + mm.cellGap) / 2);
    const oy = Math.floor((mm.height - rows * pitch + mm.cellGap) / 2);
    const pos = (gx: number, gy: number) => ({ x: ox + (gx - minX) * pitch, y: oy + (gy - minY) * pitch });

    const g = this.g;
    g.clear();
    // 복도: 둘 다 보이는 방 사이
    g.lineStyle(1, hexColor(mm.corridorColor));
    for (const r of shown) {
      for (const nid of [r.doors.e, r.doors.s]) {
        if (nid === undefined || !vis.has(nid)) continue;
        const n = map.rooms[nid]!;
        const a = pos(r.gx, r.gy);
        const b = pos(n.gx, n.gy);
        g.lineBetween(a.x + cell / 2, a.y + cell / 2, b.x + cell / 2, b.y + cell / 2);
      }
    }
    for (const r of shown) {
      const p = pos(r.gx, r.gy);
      const color = r.id === currentId ? mm.currentColor : visited.has(r.id) ? mm.visitedColor : mm.roomColor;
      g.fillStyle(hexColor(color), 1);
      g.fillRect(p.x, p.y, cell, cell);
    }

    // 아이콘
    for (const t of this.glyphs) t.destroy();
    this.glyphs.length = 0;
    const glyphKey: Partial<Record<string, string>> = {
      encounterRoom: 'minimap.encounter',
      bossRoom: 'minimap.boss',
      exitRoom: 'minimap.exit',
    };
    for (const r of shown) {
      const enc = encounters.get(r.id);
      const key = enc ? `encounter.icon.${enc}` : glyphKey[r.kind];
      if (!key) continue;
      const p = pos(r.gx, r.gy);
      const t = this.scene.add
        .text(p.x + cell / 2, p.y + cell / 2, this.ctx.t(key), {
          fontFamily: 'sans-serif',
          fontSize: `${Math.max(7, cell)}px`,
          color: r.kind === 'bossRoom' ? '#ff6b6b' : r.kind === 'encounterRoom' ? '#ffd23f' : '#5ae0ff',
          fontStyle: 'bold',
          // 현재 방(흰 칸) 위에서도 보이게 외곽선
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5);
      this.glyphs.push(t);
      this.container.add(t);
    }
  }

  /** 다음 스테이지에서 강제로 다시 그리게 한다 */
  invalidate(): void {
    this.signature = '';
  }
}

/**
 * 벼락 (헥타르 학파 궁극기, 기술·원거리·공간격). 조준 방향으로 두 공간 사이를 직선으로 절단한다.
 * 공간격 규칙: 일반 몬스터 즉사, 엘리트·정예는 최대 체력 비율. 보스는 공간격 ×2.4 대신 최대 체력의 일정 비율(벼락 전용).
 * 각성 '케라우노스': 푸른 벼락 강림 → 절단선 → 사선 참격 연속 → 주변 추가 타격 → 공간 균열 붕괴.
 * 보스에게는 절단선(최대 체력 비례)만 들어가고, 나머지 타격은 보스에게 피해가 없다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { lineHits } from '../systems/targeting';
import { nearestEnemy, type SkillHost, type SkillObject, type UltimateCast, type UltimateImpl } from './host';

const ID = 'thunderbolt';

function isBoss(e: Enemy): boolean {
  return e.rank === 'boss' || e.rank === 'hiddenBoss';
}

function line(host: SkillHost, color: number, a: Vec2, b: Vec2, width: number, sec = 0.2): void {
  const g = host.scene.add.graphics().setDepth(6);
  g.lineStyle(width, color, 0.85).lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(Math.max(1, width / 3), 0xffffff, 1).lineBetween(a.x, a.y, b.x, b.y);
  host.fx(g, sec);
}

/** 절단선: from에서 dir로 length. 보스는 최대 체력 비례 */
function cut(host: SkillHost, u: UltimateCast, from: Vec2, dir: Vec2, length: number): void {
  const v = u.values;
  const enemies = [...host.enemies()];
  const hits = lineHits(from, dir, length, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
  line(host, hexColor(u.def.color), from, { x: from.x + dir.x * length, y: from.y + dir.y * length }, v.width!);
  for (const i of hits) {
    const e = enemies[i]!;
    if (isBoss(e)) host.hitTrue(e, e.maxHp * v.bossMaxHpRatio!, false);
    else host.hit(e, v.damage!, u.def.sources.cut!);
  }
}

function area(host: SkillHost, u: UltimateCast, at: Vec2, radius: number, source: string, alpha = 0.4): void {
  host.fx(host.scene.add.circle(at.x, at.y, radius, hexColor(u.def.color), alpha).setDepth(6), 0.2);
  for (const e of [...host.enemies()]) {
    // 케라우노스: 보스에게는 절단선만 들어간다
    if (isBoss(e)) continue;
    if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= radius + e.radius) host.hit(e, u.values.damage!, u.def.sources[source]!);
  }
}

/** 예고선을 잠깐 보여 준 뒤 절단 */
class Telegraph implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly g: Phaser.GameObjects.Graphics;
  private left: number;

  constructor(
    host: SkillHost,
    private readonly u: UltimateCast,
    private readonly from: Vec2,
    private readonly dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.left = u.values.telegraphSec!;
    const len = u.values.length!;
    this.g = host.scene.add.graphics().setDepth(5);
    this.g.lineStyle(1, hexColor(u.def.color), 0.8).lineBetween(from.x, from.y, from.x + dir.x * len, from.y + dir.y * len);
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    if (this.left > 0) return true;
    cut(host, this.u, this.from, this.dir, this.u.values.length!);
    host.scene.cameras.main.flash(80, 120, 180, 255);
    return false;
  }

  destroy(): void {
    this.g.destroy();
  }
}

/** 케라우노스: 시간표대로 연속 타격 */
class Keraunos implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private t = 0;
  private readonly steps: { at: number; fn: () => void; done: boolean }[] = [];

  constructor(
    host: SkillHost,
    private readonly u: UltimateCast,
    target: Vec2,
    dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    const v = u.values;
    const color = hexColor(u.def.color);
    const step = (at: number, fn: () => void) => this.steps.push({ at, fn, done: false });
    // 1) 푸른 벼락 강림
    step(0, () => {
      line(host, color, { x: target.x, y: target.y - 200 }, target, 6, 0.25);
      area(host, u, target, host.area(v.strikeRadius!), 'strike');
    });
    // 2) 절단선 (플레이어 → 목표 방향, 보스는 최대 체력 비례)
    step(0.15, () => cut(host, u, host.playerPos(), dir, v.length!));
    // 3) 사선 참격 연속
    const base = Math.atan2(dir.y, dir.x);
    const angles = [Math.PI / 4, -Math.PI / 4, Math.PI / 2];
    for (let i = 0; i < v.slashCount!; i++) {
      step(0.3 + i * v.slashDelaySec!, () => {
        const a = base + angles[i % angles.length]!;
        const d = { x: Math.cos(a), y: Math.sin(a) };
        const half = v.slashLength! / 2;
        const from = { x: target.x - d.x * half, y: target.y - d.y * half };
        const enemies = [...host.enemies()];
        const hits = lineHits(from, d, v.slashLength!, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
        line(host, color, from, { x: from.x + d.x * v.slashLength!, y: from.y + d.y * v.slashLength! }, v.width! / 2, 0.15);
        for (const k of hits) if (!isBoss(enemies[k]!)) host.hit(enemies[k]!, v.damage!, u.def.sources.slash!);
      });
    }
    const afterSlash = 0.3 + v.slashCount! * v.slashDelaySec!;
    // 4) 주변 추가 타격
    step(afterSlash, () => area(host, u, target, host.area(v.surroundRadius!), 'surround', 0.25));
    // 5) 공간 균열 붕괴
    step(afterSlash + v.collapseDelaySec!, () => {
      area(host, u, target, host.area(v.collapseRadius!), 'collapse', 0.5);
      host.scene.cameras.main.shake(200, 0.006);
    });
  }

  update(dt: number): boolean {
    this.t += dt;
    for (const s of this.steps) {
      if (!s.done && this.t >= s.at) {
        s.done = true;
        s.fn();
      }
    }
    return this.steps.some((s) => !s.done);
  }

  destroy(): void {}
}

export const thunderbolt: UltimateImpl = {
  cast(host, u) {
    const from = host.playerPos();
    const dir = host.aimDir();
    if (!u.awakened) {
      host.addObject(new Telegraph(host, u, from, dir));
      return true;
    }
    const v = u.values;
    const e = nearestEnemy(host, from, v.range!);
    const target = e ? { x: e.sprite.x, y: e.sprite.y } : { x: from.x + dir.x * v.range! * 0.5, y: from.y + dir.y * v.range! * 0.5 };
    const d = Math.hypot(target.x - from.x, target.y - from.y) || 1;
    host.addObject(new Keraunos(host, u, target, e ? { x: (target.x - from.x) / d, y: (target.y - from.y) / d } : dir));
    return true;
  },
};

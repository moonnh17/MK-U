/**
 * 벼락 (헥타르 학파 궁극기, 기술·원거리·공간격). 조준 방향으로 두 공간 사이를 직선으로 절단한다.
 * 공간격 규칙: 일반 몬스터 즉사, 엘리트·정예는 최대 체력 비율. 보스는 공간격 배율 대신 최대 체력의 일정 비율(벼락 전용).
 * 절단 연출: 화면 자체가 절단선에서 갈라져 어긋났다가 닫힌다(spaceCutFx 셰이더). 절단 그림은 균열·잔상 보조로만 옅게.
 * 각성 '케라우노스': 푸른 벼락 강림 → 절단선 → 사선 참격 연속 → 주변 추가 타격 → 공간 균열 붕괴.
 * 보스에게는 절단선(최대 체력 비례)만 들어가고, 나머지 타격은 보스에게 피해가 없다.
 */
import { playFx } from './skillFx';
import { shake } from '../entities/juice';
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { lineHits } from '../systems/targeting';
import { nearestEnemy, type SkillHost, type SkillObject, type UltimateCast, type UltimateImpl } from './host';

const ID = 'thunderbolt';
const CUT_VORTEX_PX = 44;
const CUT_STEP_MS = 70;
/** 판정 폭에 대한 절단 그림 굵기 */
const CUT_THICK = 3;
/** 참격 그림이 원래 기운 각도 (오른쪽 위) */
const SLASH_ART_RAD = -Math.PI / 4;

function isBoss(e: Enemy): boolean {
  return e.rank === 'boss' || e.rank === 'hiddenBoss';
}

function line(host: SkillHost, color: number, a: Vec2, b: Vec2, width: number, sec = 0.2): void {
  const g = host.scene.add.graphics().setDepth(6);
  g.lineStyle(width, color, 0.85).lineBetween(a.x, a.y, b.x, b.y);
  g.lineStyle(Math.max(1, width / 3), 0xffffff, 1).lineBetween(a.x, a.y, b.x, b.y);
  host.fx(g, sec);
}

/**
 * 공간 절단 연출. 셰이더가 되면 화면이 갈라지고, 절단 그림은 닫힐 무렵 옅은 균열로만 남는다 + 푸른 파편.
 * 셰이더가 없으면(캔버스 렌더러) 예전처럼 절단 그림 4단계를 밝게.
 */
function cutFx(host: SkillHost, u: UltimateCast, from: Vec2, dir: Vec2, length: number): void {
  const sp = u.def.sprites;
  const sc = u.def.spaceCut;
  const end = { x: from.x + dir.x * length, y: from.y + dir.y * length };
  const mid = { x: (from.x + end.x) / 2, y: (from.y + end.y) / 2 };
  const angle = Math.atan2(dir.y, dir.x);
  const split = !!sc && !!host.spaceCut?.(sc, from, end, 0);
  if (!split || !sc) {
    playFx(host.scene, sp.cut1!, from.x, from.y, { w: CUT_VORTEX_PX, fadeSec: 0.3 });
    [sp.cut2!, sp.cut3!, sp.cut4!].forEach((ref, i) => {
      host.scene.time.delayedCall(i * CUT_STEP_MS, () => playFx(host.scene, ref, mid.x, mid.y, { w: length, h: u.values.width! * CUT_THICK, rotation: angle, fadeSec: 0.2 }));
    });
    line(host, hexColor(u.def.color), from, end, u.values.width! / 3);
    return;
  }
  host.hitStop?.(sc.hitStopSec);
  // 사선 베기 그림: 기존 절단 그림 3단계를 화면 가운데를 가로지르는 사선 위에 (셰이더의 사선과 같은 선)
  const view = host.scene.cameras.main.worldView;
  const reach = Math.hypot(view.width, view.height);
  const sa = (sc.slashAngleDeg * Math.PI) / 180;
  [sp.cut2!, sp.cut3!, sp.cut4!].forEach((ref, i) => {
    host.scene.time.delayedCall(i * CUT_STEP_MS, () => playFx(host.scene, ref, view.centerX, view.centerY, { w: reach, h: u.values.width! * CUT_THICK * 0.8, rotation: sa, fadeSec: 0.2, depth: 6 }));
  });
  // 잔상: 틈이 거의 닫힐 때 얇은 균열(절단 그림, 옅고 가늘게)이 잠깐 남는다
  host.scene.time.delayedCall(sc.closeSec * 600, () => {
    for (const ref of [sp.cut3!, sp.cut4!]) playFx(host.scene, ref, mid.x, mid.y, { w: length, h: u.values.width! * 1.2, rotation: angle, fadeSec: sc.afterSec, depth: 3 }).setAlpha(0.45);
  });
  // 작은 푸른 파편: 선을 따라 흩어져 양쪽으로 튀었다가 사라진다
  const n = { x: -dir.y, y: dir.x };
  const color = hexColor(u.def.color);
  for (let i = 0; i < sc.shards; i++) {
    const t = host.rng.range(0.08, 0.92) * length;
    const side = i % 2 ? 1 : -1;
    const at = { x: from.x + dir.x * t, y: from.y + dir.y * t };
    const r = host.scene.add.rectangle(at.x, at.y, host.rng.range(1, 2.5), host.rng.range(1, 2.5), i % 3 ? color : 0xdff2ff).setDepth(6);
    const dist = host.rng.range(4, 12) * side;
    host.scene.tweens.add({ targets: r, x: at.x + n.x * dist, y: at.y + n.y * dist, alpha: 0, duration: (sc.closeSec + sc.afterSec) * 1000, ease: 'Quad.easeOut', onComplete: () => r.destroy() });
  }
}

/** 절단선: from에서 dir로 length. 보스는 최대 체력 비례 */
function cut(host: SkillHost, u: UltimateCast, from: Vec2, dir: Vec2, length: number): void {
  const v = u.values;
  const enemies = [...host.enemies()];
  const hits = lineHits(from, dir, length, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
  cutFx(host, u, from, dir, length);
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
  private split = false;

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
    // 예고 동안 선 주변 화면이 조금씩 압축된다
    this.split = !!u.def.spaceCut && !!host.spaceCut?.(u.def.spaceCut, from, { x: from.x + dir.x * len, y: from.y + dir.y * len }, this.left);
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    if (this.left > 0) return true;
    cut(host, this.u, this.from, this.dir, this.u.values.length!);
    // 화면 분할이 안 되는 렌더러만 번쩍임으로 대신한다
    if (!this.split) host.scene.cameras.main.flash(80, 120, 180, 255);
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
        playFx(host.scene, u.def.sprites.slash!, target.x, target.y, { w: v.slashLength!, rotation: a - SLASH_ART_RAD });
        line(host, color, from, { x: from.x + d.x * v.slashLength!, y: from.y + d.y * v.slashLength! }, v.width! / 6, 0.15);
        for (const k of hits) if (!isBoss(enemies[k]!)) host.hit(enemies[k]!, v.damage!, u.def.sources.slash!);
      });
    }
    const afterSlash = 0.3 + v.slashCount! * v.slashDelaySec!;
    // 4) 주변 추가 타격
    step(afterSlash, () => area(host, u, target, host.area(v.surroundRadius!), 'surround', 0.25));
    // 5) 공간 균열 붕괴
    step(afterSlash + v.collapseDelaySec!, () => {
      area(host, u, target, host.area(v.collapseRadius!), 'collapse', 0.5);
      shake(host.scene, 'medium');
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

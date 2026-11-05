/**
 * 벼락 (헥타르 학파 궁극기, 기술·원거리·공간격). 조준 방향으로 두 공간 사이를 직선으로 절단한다.
 * 공간격 규칙: 일반 몬스터 즉사, 엘리트·정예는 최대 체력 비율. 보스는 공간격 배율 대신 최대 체력의 일정 비율(벼락 전용).
 * 절단 연출: 화면 자체가 절단선에서 갈라져 어긋났다가 닫힌다(spaceCutFx 셰이더). 절단 그림은 균열·잔상 보조로만 옅게.
 * 각성 '케라우노스': 하늘에서 벼락이 내리꽂힘 → 그 자리를 지나 화면 전체가 사선으로 갈라짐(선 위 적 절단)
 * → 양쪽이 사선을 따라 반대로 미끄러짐 → 봉합(선 주변 한 번 더 절단). 보스에게는 갈라지는 선(최대 체력 비례)만 들어간다.
 */
import { playFx } from './skillFx';
import { riftTotalSec } from '../systems/spaceCut';
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
/** 하늘 벼락이 시작하는 높이 (화면 위 끝보다 이만큼 위) */
const BOLT_ABOVE_PX = 20;
/** 하늘 벼락 꺾임 하나의 길이·흔들림 */
const BOLT_STEP_PX = 14;
const BOLT_JITTER_PX = 7;

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
 * 공간 절단 연출. 셰이더가 되면 발사한 선에서 화면이 갈라지며 선을 따라 어긋나고, 그 위에 절단 그림 3단계 → 닫힐 무렵 옅은 균열 + 푸른 파편.
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
  // 절단 그림 3단계를 발사한 선 위에 (틈이 보이게 약간 옅게)
  [sp.cut2!, sp.cut3!, sp.cut4!].forEach((ref, i) => {
    host.scene.time.delayedCall(i * CUT_STEP_MS, () => playFx(host.scene, ref, mid.x, mid.y, { w: length, h: u.values.width! * CUT_THICK, rotation: angle, fadeSec: 0.2 }).setAlpha(0.8));
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

/** 하늘에서 target까지 지그재그 벼락 (몇 번 깜빡이며 사라진다) */
function skyBolt(host: SkillHost, u: UltimateCast, target: Vec2, sec: number): void {
  const top = host.scene.cameras.main.worldView.y - BOLT_ABOVE_PX;
  const color = hexColor(u.def.color);
  const draw = (g: Phaser.GameObjects.Graphics) => {
    const n = Math.max(4, Math.ceil((target.y - top) / BOLT_STEP_PX));
    const pts = Array.from({ length: n + 1 }, (_, i) => ({ x: target.x + (i === n ? 0 : host.rng.range(-BOLT_JITTER_PX, BOLT_JITTER_PX)), y: top + ((target.y - top) * i) / n }));
    g.clear().lineStyle(5, color, 0.85).strokePoints(pts).lineStyle(2, 0xffffff, 1).strokePoints(pts);
  };
  const g = host.scene.add.graphics().setDepth(7);
  draw(g);
  // 두 번 다시 그려 번쩍이는 느낌
  host.scene.time.delayedCall((sec * 1000) / 3, () => draw(g));
  host.scene.tweens.add({ targets: g, alpha: 0, delay: (sec * 1000) / 2, duration: (sec * 1000) / 2, onComplete: () => g.destroy() });
}

/** 선 위(폭 width)의 적. 보스는 갈라질 때만(최대 체력 비례), 봉합 땐 보스 제외 */
function lineStrike(host: SkillHost, u: UltimateCast, from: Vec2, dir: Vec2, length: number, width: number, source: string, boss: boolean): void {
  const enemies = [...host.enemies()];
  const hits = lineHits(from, dir, length, width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
  for (const i of hits) {
    const e = enemies[i]!;
    if (isBoss(e)) {
      if (boss) host.hitTrue(e, e.maxHp * u.values.bossMaxHpRatio!, false);
    } else host.hit(e, u.values.damage!, u.def.sources[source]!);
  }
}

/** 케라우노스: 하늘 벼락 → 화면 전체 사선 균열 → 미끄러짐 → 봉합 */
class Keraunos implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private t = 0;
  private readonly steps: { at: number; fn: () => void; done: boolean }[] = [];

  constructor(host: SkillHost, u: UltimateCast, target: Vec2, angle: number) {
    this.createdAt = host.scene.time.now;
    const v = u.values;
    const rift = u.def.rift!;
    const sp = u.def.sprites;
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    const step = (at: number, fn: () => void) => this.steps.push({ at, fn, done: false });
    // 화면 전체를 가로지르는 선 (판정도 화면 끝까지)
    const view = host.scene.cameras.main.worldView;
    const reach = Math.hypot(view.width, view.height);
    const from = { x: target.x - dir.x * reach, y: target.y - dir.y * reach };
    // 1) 하늘에서 벼락
    step(0, () => {
      skyBolt(host, u, target, rift.boltSec);
      playFx(host.scene, sp.cut1!, target.x, target.y, { w: CUT_VORTEX_PX, fadeSec: 0.3 });
      area(host, u, target, host.area(v.strikeRadius!), 'strike');
      shake(host.scene, 'medium');
    });
    // 2) 화면 전체가 사선으로 갈라진다: 선 위 적 절단 + 절단 그림이 사선을 따라
    step(v.riftDelaySec!, () => {
      const split = !!u.def.spaceCut && !!host.spaceRift?.(u.def.spaceCut, rift, target, angle);
      lineStrike(host, u, from, dir, reach * 2, v.width!, 'cut', true);
      [sp.cut2!, sp.cut3!, sp.cut4!].forEach((ref, i) => {
        host.scene.time.delayedCall(i * CUT_STEP_MS, () => playFx(host.scene, ref, target.x, target.y, { w: reach * 2, h: v.width! * CUT_THICK, rotation: angle, fadeSec: 0.25 }).setAlpha(0.8));
      });
      if (!split) line(host, hexColor(u.def.color), from, { x: target.x + dir.x * reach, y: target.y + dir.y * reach }, v.width! / 3);
    });
    // 3) 봉합: 원래 자리로 돌아오는 순간 선 주변이 한 번 더 잘리고, 흰 봉합선·참격 그림이 번쩍인다
    step(v.riftDelaySec! + riftTotalSec(rift), () => {
      lineStrike(host, u, from, dir, reach * 2, v.sealWidth!, 'seal', false);
      line(host, 0xdff2ff, from, { x: target.x + dir.x * reach, y: target.y + dir.y * reach }, 2, 0.18);
      playFx(host.scene, sp.slash!, target.x, target.y, { w: 120, rotation: angle - SLASH_ART_RAD });
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
    // 사선은 조준 쪽으로 기운다 (오른쪽 조준이면 왼쪽 아래 → 오른쪽 위)
    const tilt = (u.def.rift!.angleDeg * Math.PI) / 180;
    host.addObject(new Keraunos(host, u, target, dir.x >= 0 ? -tilt : tilt));
    return true;
  },
};

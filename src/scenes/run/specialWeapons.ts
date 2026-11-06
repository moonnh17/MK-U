/**
 * 특수 무기: 궤도절삭륜(되돌아오는 원반), 아크로제 공간봉합침(박힌 침·절단선·회수), 야시장 복제총(무작위 에너지·폭발),
 * 체납자의 의수(징수), 환국의 잔명(관통 광선·충전·강화 사격). 무기 위 충전 표시도 여기서 그린다.
 * 탄·선은 지금 방 안쪽(장애물 밖)에서만 피해를 주어 벽 너머의 적은 맞지 않는다.
 */
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { hexColor } from '../../core/scale';
import type { Enemy } from '../../entities/enemy';
import { shake } from '../../entities/juice';
import { segmentClear } from '../../systems/pathField';
import { lineHits } from '../../systems/targeting';
import { beamEmpowered, beamStacksAfter, collectDebt, needleLinks, rolledEnergyCost } from '../../systems/weaponMechanics';
import { dropWeaponAt, gainEnergy, type WeaponStats } from '../../systems/weapons';
import { contains, interiorRect } from '../../systems/worldLayout';
import type { TwinStarMode, WeaponDef } from '../../types/data';
import { playFx } from '../../skills/skillFx';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

interface Disc {
  sprite: Phaser.GameObjects.Image;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  traveled: number;
  back: boolean;
  age: number;
  hit: Set<Enemy>;
  def: WeaponDef;
  base: number;
  crit: number;
}

interface Needle {
  sprite: Phaser.GameObjects.Image;
  pos: Vec2;
  dir: Vec2;
  speed: number;
  traveled: number;
  /** 박힌 곳 (null이면 날아가는 중) */
  stuck: boolean;
  enemy: Enemy | null;
  left: number;
  def: WeaponDef;
  base: number;
  crit: number;
}

/** 원반·침이 적에 닿았다고 보는 여유(px) */
const TOUCH_PX = 4;
/** 벽 찾기 보폭(px) */
const RAY_STEP = 3;

export class SpecialWeapons {
  private discs: Disc[] = [];
  /** 놓친 원반: 이 시간이 지나야 충전으로 돌아온다 */
  private discRecharge: { def: WeaponDef; left: number }[] = [];
  private needles: Needle[] = [];
  private needleTickIn = 0;
  private lines: Phaser.GameObjects.Graphics | null = null;
  private pips: Phaser.GameObjects.Graphics | null = null;
  private gauge: Phaser.GameObjects.Sprite | null = null;
  private roomId: number | null = null;
  /** 환국의 잔명 충전 (런 동안 이어진다) */
  beamStacks = 0;
  /** 쌍성 지팡이: 주기 시간, 정렬 남은 시간, 정렬 재사용 대기, 지금 상태, 정렬 중 파티클 간격 */
  private twinT = 0;
  private twinAlignLeft = 0;
  twinCd = 0;
  private twinMode: 'primary' | 'eclipse' | 'align' = 'primary';
  private twinSparkIn = 0;
  private readySparkIn = 0;
  /** 꾸밈 전용 난수 (시드 재현에 끼어들지 않게) */
  private readonly fx: Rng;

  constructor(private readonly run: RunScene) {
    this.fx = Rng.derive(run.ctx.config.seed, 'weapon-fx');
  }

  // ---------- 방·벽 ----------

  /** 지금 방 안쪽이고 장애물 밖인가 */
  private open(at: Vec2): boolean {
    const rid = this.run.session.currentRoomId;
    if (rid === null) return false;
    const node = this.run.session.map.rooms[rid]!;
    return contains(interiorRect(node, this.run.m), at.x, at.y) && segmentClear(at, at, this.run.obstacles.get(rid) ?? []);
  }

  /** a와 b가 같은 방 안에서 막힘없이 이어지는가 */
  private clear(a: Vec2, b: Vec2): boolean {
    const rid = this.run.session.currentRoomId;
    return rid !== null && this.open(a) && this.open(b) && segmentClear(a, b, this.run.obstacles.get(rid) ?? []);
  }

  /** origin에서 dir로 length까지 가다 벽·장애물에 닿는 거리 */
  clipRay(origin: Vec2, dir: Vec2, length: number): number {
    let d = 0;
    while (d + RAY_STEP <= length && this.open({ x: origin.x + dir.x * (d + RAY_STEP), y: origin.y + dir.y * (d + RAY_STEP) })) d += RAY_STEP;
    return d;
  }

  /**
   * 무기 레이저의 길: 벽·장애물에서 끊긴다. 스넬의 법칙이 있으면 닿은 면에서 반사해 남은 길이만큼 이어진다
   * (막힌 축의 방향만 뒤집는다. 모서리면 둘 다)
   */
  laserPath(origin: Vec2, dir: Vec2, length: number): { from: Vec2; dir: Vec2; len: number }[] {
    const out: { from: Vec2; dir: Vec2; len: number }[] = [];
    let from = origin;
    let d = dir;
    let left = length;
    let bounces = this.run.itemRt.sums.laserBounce;
    for (;;) {
      const len = this.clipRay(from, d, left);
      out.push({ from, dir: d, len });
      left -= len;
      if (left < RAY_STEP || bounces <= 0 || len < RAY_STEP) return out;
      bounces--;
      const at = { x: from.x + d.x * len, y: from.y + d.y * len };
      const flipX = !this.open({ x: at.x + d.x * RAY_STEP, y: at.y });
      const flipY = !this.open({ x: at.x, y: at.y + d.y * RAY_STEP });
      d = { x: flipX || !flipY ? -d.x : d.x, y: flipY || !flipX ? -d.y : d.y };
      from = at;
    }
  }

  /** 레이저 길 위의 적에게 피해 (반사돼 같은 적을 다시 지나도 한 번). 맞힌 적 수 */
  laserHits(path: readonly { from: Vec2; dir: Vec2; len: number }[], width: number, damage: (e: Enemy) => void): number {
    const enemies = this.live();
    const pts = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const done = new Set<Enemy>();
    for (const s of path) {
      for (const i of lineHits(s.from, s.dir, s.len, width / 2, pts)) {
        const e = enemies[i]!;
        if (done.has(e)) continue;
        done.add(e);
        damage(e);
      }
    }
    return done.size;
  }

  private live(): Enemy[] {
    return this.run.enemies.filter((e) => !e.dead);
  }

  private hit(e: Enemy, base: number, crit: number, def: WeaponDef): void {
    this.run.combat.hit(e, this.run.combat.critRoll(base, crit, e.sprite), def.tags);
  }

  // ---------- 매 프레임 ----------

  update(dt: number): void {
    const rid = this.run.session.currentRoomId;
    // 방을 옮기면 박힌 침은 사라진다
    if (rid !== this.roomId) {
      this.roomId = rid;
      for (const n of this.needles) n.sprite.destroy();
      this.needles = [];
    }
    this.updateDiscs(dt);
    this.updateNeedles(dt);
    this.updateHeldLook(dt);
    this.updateTwinStar(dt);
  }

  // ---------- 민타카의 쌍성 지팡이 ----------

  /** 들고 있는 쌍성 지팡이의 지금 상태 (그 무기가 아니면 null) */
  twinStarMode(def: WeaponDef): TwinStarMode | null {
    return def.twinStar ? def.twinStar[this.twinMode] : null;
  }

  /** 주성 2초 ↔ 반성 2초. 정렬 중이면 그대로 정렬, 상태가 바뀌면 지팡이 머리에서 짧게 번쩍 */
  private updateTwinStar(dt: number): void {
    this.twinCd = Math.max(0, this.twinCd - dt);
    const ts = this.run.weaponDef().twinStar;
    if (!ts) return;
    let mode: typeof this.twinMode;
    if (this.twinAlignLeft > 0) {
      this.twinAlignLeft -= dt;
      mode = 'align';
      this.alignSparks(dt, ts.align.color);
    } else {
      this.twinT += dt;
      mode = Math.floor(this.twinT / ts.phaseSec) % 2 ? 'eclipse' : 'primary';
    }
    if (mode === this.twinMode) return;
    this.twinMode = mode;
    const head = this.run.combat.muzzle();
    playFx(this.run, ts.align.burst, head.x, head.y, { w: mode === 'eclipse' ? 22 : 30, depth: 7 }).setAlpha(mode === 'eclipse' ? 0.6 : 0.9);
  }

  /** 정렬 중: 지팡이 머리에서 별 조각이 흩날리고 몸 둘레로 빛이 감돈다 */
  private alignSparks(dt: number, color: string): void {
    this.twinSparkIn -= dt;
    if (this.twinSparkIn > 0) return;
    this.twinSparkIn = 0.04;
    const head = this.run.combat.muzzle();
    const p = this.run.player;
    for (const [at, n] of [[head, 2], [{ x: p.x, y: p.y }, 1]] as const) {
      for (let i = 0; i < n; i++) {
        const a = this.fx.range(0, Math.PI * 2);
        const d = this.fx.range(2, 10);
        const dot = this.run.add.rectangle(at.x + Math.cos(a) * d, at.y + Math.sin(a) * d, this.fx.range(1, 2.4), this.fx.range(1, 2.4), this.fx.chance(0.5) ? 0xffffff : hexColor(color)).setDepth(7);
        this.run.tweens.add({ targets: dot, x: dot.x + Math.cos(a) * 12, y: dot.y + Math.sin(a) * 12 - 6, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => dot.destroy() });
      }
    }
  }

  /** 무기 특수공격(성간 연주시차): 궤도를 정렬해 주성과 반성을 겹친다. 재사용 대기 중이면 남은 초를 알린다 */
  alignTwinStar(def: WeaponDef): boolean {
    const ts = def.twinStar;
    if (!ts) return false;
    if (this.twinCd > 0) {
      this.run.toastThrottled(this.run.ctx.t('weapon.twinCooldown', { s: Math.ceil(this.twinCd) }));
      return true;
    }
    this.twinAlignLeft = ts.align.sec;
    this.twinCd = ts.align.cooldownSec;
    this.twinMode = 'align';
    const p = this.run.player;
    const head = this.run.combat.muzzle();
    // 강한 정렬: 머리에서 큰 폭발 두 번 + 몸에서 빛 고리, 별 조각 사방으로, 화면 번쩍·흔들림
    playFx(this.run, ts.align.burst, head.x, head.y, { w: 110, depth: 7 });
    this.run.time.delayedCall(110, () => playFx(this.run, ts.align.burst, p.x, p.y, { w: 150, depth: 6 }).setAlpha(0.7));
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2 + this.fx.range(-0.1, 0.1);
      const dist = this.fx.range(30, 70);
      const dot = this.run.add.rectangle(head.x, head.y, this.fx.range(1.5, 3), this.fx.range(1.5, 3), i % 3 ? hexColor(ts.align.color) : 0xffffff).setDepth(7);
      this.run.tweens.add({ targets: dot, x: head.x + Math.cos(a) * dist, y: head.y + Math.sin(a) * dist, alpha: 0, duration: this.fx.range(380, 620), ease: 'Cubic.easeOut', onComplete: () => dot.destroy() });
    }
    this.run.cameras.main.flash(120, 150, 210, 255);
    shake(this.run, 'medium');
    sfx('awaken');
    return true;
  }

  /** 들고 있는 무기가 바뀌거나 없어질 때 무기 위 표시 정리는 updateHeldLook이 한다 */
  destroy(): void {
    for (const d of this.discs) d.sprite.destroy();
    for (const n of this.needles) n.sprite.destroy();
    this.discs = [];
    this.needles = [];
  }

  // ---------- 궤도절삭륜 ----------

  /** 원반 최대 충전: 산탄 분류라 발사 탄수 + 아이템만큼 늘어난다 (maxExtraCharges까지) */
  discMax(def: WeaponDef): number {
    const b = def.boomerang;
    if (!b) return 0;
    const extra = def.classes.includes('spread') ? Math.min(b.maxExtraCharges, Math.floor(this.run.itemRt.sums.pellets)) : 0;
    return b.charges + extra;
  }

  /** 남은 원반 충전 */
  discCharges(def: WeaponDef): number {
    return this.discMax(def) - this.discs.filter((d) => d.def === def).length - this.discRecharge.filter((r) => r.def === def).length;
  }

  throwDisc(def: WeaponDef, st: WeaponStats, from: Vec2, angle: number): void {
    const b = def.boomerang!;
    const sprite = this.run.add.image(from.x, from.y, b.shot.spriteKey).setDepth(5);
    sprite.setScale(sprite.scaleX * b.scale);
    this.discs.push({ sprite, pos: { ...from }, dir: { x: Math.cos(angle), y: Math.sin(angle) }, speed: st.projectileSpeed, traveled: 0, back: false, age: 0, hit: new Set(), def, base: st.damage, crit: st.critChance });
  }

  private updateDiscs(dt: number): void {
    for (const r of this.discRecharge) r.left -= dt;
    this.discRecharge = this.discRecharge.filter((r) => r.left > 0);
    const p = { x: this.run.player.x, y: this.run.player.y };
    for (const d of [...this.discs]) {
      const b = d.def.boomerang!;
      d.age += dt;
      d.sprite.rotation += b.spinPerSec * dt;
      if (!d.back) {
        const next = { x: d.pos.x + d.dir.x * d.speed * dt, y: d.pos.y + d.dir.y * d.speed * dt };
        d.traveled += d.speed * dt;
        // 벽에 닿거나 끝까지 가면 되돌아온다 (돌아오는 길은 따로 다시 맞힌다)
        if (!this.open(next) || d.traveled >= b.range) {
          d.back = true;
          d.hit = new Set();
        } else d.pos = next;
      } else {
        // 돌아오는 원반은 날아간 길을 그대로 되짚어 느리게 온다. 플레이어가 닿으면 잡아서 바로 충전
        if (Math.hypot(p.x - d.pos.x, p.y - d.pos.y) <= b.catchPx + d.sprite.displayWidth / 2) {
          this.catchDisc(d);
          continue;
        }
        d.traveled -= b.returnSpeed * dt;
        // 못 잡으면 출발점을 지나 조금 더 가다 사라지고, 잠시 뒤에 충전된다
        if (d.traveled <= -b.overshootPx || d.age >= b.maxSec) {
          this.missDisc(d);
          continue;
        }
        d.pos = { x: d.pos.x - d.dir.x * b.returnSpeed * dt, y: d.pos.y - d.dir.y * b.returnSpeed * dt };
      }
      d.sprite.setPosition(d.pos.x, d.pos.y);
      if (this.fx.chance(dt * 20)) this.spark(d.pos, d.def.attackParticles?.color ?? '#5ad9ff');
      // 벽 너머(방 밖·장애물 안)에서는 피해가 없다
      if (!this.open(d.pos)) continue;
      for (const e of this.live()) {
        if (d.hit.has(e) || Math.hypot(e.sprite.x - d.pos.x, e.sprite.y - d.pos.y) > e.radius + TOUCH_PX + d.sprite.displayWidth / 2) continue;
        d.hit.add(e);
        this.hit(e, d.base, d.crit, d.def);
      }
    }
  }

  private catchDisc(d: Disc): void {
    d.sprite.destroy();
    this.discs.splice(this.discs.indexOf(d), 1);
    sfx('energy');
    // 잡았다: 손에서 짧게 번쩍
    const ring = this.run.add.circle(this.run.player.x, this.run.player.y, 6).setStrokeStyle(2, hexColor(d.def.attackParticles?.color ?? '#5ad9ff'), 1).setDepth(6);
    this.run.tweens.add({ targets: ring, scale: 2.2, alpha: 0, duration: 220, onComplete: () => ring.destroy() });
  }

  /** 놓친 원반: 사라지며 흩어지고, 충전은 잠시 뒤에 */
  private missDisc(d: Disc): void {
    for (let i = 0; i < 4; i++) this.spark(d.pos, d.def.attackParticles?.color ?? '#5ad9ff');
    this.run.tweens.add({ targets: d.sprite, alpha: 0, scale: d.sprite.scale * 0.6, duration: 200, onComplete: () => d.sprite.destroy() });
    this.discs.splice(this.discs.indexOf(d), 1);
    this.discRecharge.push({ def: d.def, left: d.def.boomerang!.missRechargeSec });
  }

  // ---------- 아크로제 공간봉합침 ----------

  fireNeedle(def: WeaponDef, st: WeaponStats, from: Vec2, angle: number): void {
    const n = def.needle!;
    const sprite = this.run.add.image(from.x, from.y, n.shot.spriteKey).setDepth(5).setRotation(angle);
    this.needles.push({ sprite, pos: { ...from }, dir: { x: Math.cos(angle), y: Math.sin(angle) }, speed: st.projectileSpeed, traveled: 0, stuck: false, enemy: null, left: n.lifeSec, def, base: st.damage, crit: st.critChance });
    // 최대 개수: 박힌 침이 넘치면 가장 오래된 것부터
    const stuck = this.needles.filter((x) => x.stuck);
    if (stuck.length >= n.max) this.removeNeedle(stuck[0]!);
  }

  private removeNeedle(n: Needle): void {
    n.sprite.destroy();
    this.needles.splice(this.needles.indexOf(n), 1);
  }

  private updateNeedles(dt: number): void {
    for (const n of [...this.needles]) {
      if (n.stuck) {
        n.left -= dt;
        if (n.left <= 0) {
          this.removeNeedle(n);
          continue;
        }
        // 적에 박힌 침은 적을 따라간다 (적이 죽으면 그 자리에 남는다)
        if (n.enemy && !n.enemy.dead) n.pos = { x: n.enemy.sprite.x, y: n.enemy.sprite.y };
        n.sprite.setPosition(n.pos.x, n.pos.y).setAlpha(n.left < 1 ? 0.4 + 0.6 * Math.abs(Math.sin(n.left * 12)) : 1);
        continue;
      }
      const next = { x: n.pos.x + n.dir.x * n.speed * dt, y: n.pos.y + n.dir.y * n.speed * dt };
      n.traveled += n.speed * dt;
      const target = this.live().find((e) => Math.hypot(e.sprite.x - next.x, e.sprite.y - next.y) <= e.radius + TOUCH_PX);
      if (target && this.open(next)) {
        this.hit(target, n.base, n.crit, n.def);
        this.stick(n, next, target);
      } else if (!this.open(next) || n.traveled >= n.def.range) {
        // 벽(또는 사거리 끝)에 박힌다
        this.stick(n, n.pos, null);
      } else {
        n.pos = next;
        n.sprite.setPosition(next.x, next.y);
      }
    }
    this.drawLines(dt);
  }

  private stick(n: Needle, at: Vec2, enemy: Enemy | null): void {
    n.stuck = true;
    n.enemy = enemy;
    n.pos = { ...at };
    n.sprite.setPosition(at.x, at.y);
    this.spark(at, n.def.needle!.color);
  }

  /** 박힌 침을 가까운 순서로 이어 절단선을 그리고, tickSec마다 선에 닿은 적에게 피해 (적 하나에 한 번) */
  private drawLines(dt: number): void {
    this.lines ??= this.run.add.graphics().setDepth(5).setBlendMode(Phaser.BlendModes.ADD);
    this.lines.clear();
    const stuck = this.needles.filter((n) => n.stuck);
    if (stuck.length < 2) return;
    const def = stuck[0]!.def;
    const cfg = def.needle!;
    const col = hexColor(cfg.color);
    const segs = needleLinks(stuck.map((n) => n.pos))
      .map(([a, b]) => [stuck[a]!, stuck[b]!] as const)
      .filter(([a, b]) => this.clear(a.pos, b.pos));
    const flicker = 0.7 + 0.3 * Math.sin(this.run.time.now / 60);
    for (const [a, b] of segs) {
      this.lines.lineStyle(cfg.lineWidth, col, 0.25 * flicker).lineBetween(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
      this.lines.lineStyle(1, 0xffffff, 0.9 * flicker).lineBetween(a.pos.x, a.pos.y, b.pos.x, b.pos.y);
    }
    this.needleTickIn -= dt;
    if (this.needleTickIn > 0) return;
    this.needleTickIn = cfg.tickSec;
    const enemies = this.live();
    const pts = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const done = new Set<Enemy>();
    for (const [a, b] of segs) {
      const len = Math.hypot(b.pos.x - a.pos.x, b.pos.y - a.pos.y);
      if (len < 1) continue;
      for (const i of lineHits(a.pos, { x: (b.pos.x - a.pos.x) / len, y: (b.pos.y - a.pos.y) / len }, len, cfg.lineWidth / 2, pts)) {
        const e = enemies[i]!;
        if (done.has(e)) continue;
        done.add(e);
        this.hit(e, a.base * cfg.lineDamageMul, a.crit, def);
      }
    }
  }

  /** 회수 (Q): 모든 침이 플레이어에게 돌아오며 지나는 길의 적에게 피해. 회수할 침이 없으면 false */
  recallNeedles(def: WeaponDef): boolean {
    if (this.needles.length === 0) return false;
    const cfg = def.needle!;
    const p = { x: this.run.player.x, y: this.run.player.y };
    const enemies = this.live();
    const pts = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    for (const n of this.needles) {
      const len = Math.hypot(p.x - n.pos.x, p.y - n.pos.y);
      if (len >= 1 && this.clear(n.pos, p)) {
        for (const i of lineHits(n.pos, { x: (p.x - n.pos.x) / len, y: (p.y - n.pos.y) / len }, len, cfg.lineWidth / 2, pts)) this.hit(enemies[i]!, n.base * cfg.recallDamageMul, n.crit, n.def);
      }
      const s = n.sprite.setRotation(Math.atan2(p.y - n.pos.y, p.x - n.pos.x));
      this.run.tweens.add({ targets: s, x: p.x, y: p.y, duration: cfg.recallSec * 1000, ease: 'Quad.easeIn', onComplete: () => s.destroy() });
    }
    this.needles = [];
    sfx('dash');
    this.run.floatLabel(p, this.run.ctx.t(def.abilityNameKey!), cfg.color);
    return true;
  }

  // ---------- 야시장 복제총 ----------

  /** 이번 공격의 수치 (에너지 소모를 무작위로) */
  rolledStats(def: WeaponDef, st: WeaponStats): WeaponStats {
    return def.energyRange ? { ...st, energyCost: rolledEnergyCost(this.run.rng, st.energyCost, def.energyRange) } : st;
  }

  /** 공격 1회마다 따로 판정: 터지면 무기가 사라진다. 터졌으면 true */
  rollSelfDestruct(def: WeaponDef): boolean {
    if (!def.selfDestruct || !this.run.rng.chance(def.selfDestruct.chance)) return false;
    const p = this.run.session.player;
    const at = this.run.combat.muzzle();
    sfx('explosionMid');
    shake(this.run, 'heavy');
    this.run.juice.explosionNear(at, 0);
    this.run.juice.colorBurst(at, '#ff7a2a', this.run.ctx.data.juice.skillBurst);
    p.weapons = dropWeaponAt(p.weapons, p.weapons.active).slots;
    this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y - 6 }, this.run.ctx.t(def.abilityNameKey!), '#ff7a2a');
    bus.emit('toast', { text: this.run.ctx.t('weapon.selfDestructed', { name: this.run.ctx.t(def.nameKey) }) });
    return true;
  }

  // ---------- 체납자의 의수 ----------

  /** 스테이지에 들어설 때: 슬롯의 의수마다 마기 입자를 가져간다. 못 내면 그 스테이지 동안 주먹 성능 */
  collectDebts(): void {
    const p = this.run.session.player;
    for (const item of p.weapons.slots) {
      if (!item) continue;
      const def = this.run.weaponDefOf(item.defId);
      if (!def.debt) continue;
      const r = collectDebt(p.coins, def.debt.coins);
      p.coins = r.coins;
      item.unpaid = !r.paid;
      const t = this.run.ctx.t;
      const at = { x: this.run.player.x, y: this.run.player.y };
      if (!r.paid) {
        bus.emit('toast', { text: t('weapon.debtFailed', { n: def.debt.coins }) });
        continue;
      }
      bus.emit('toast', { text: t('weapon.debtPaid', { n: def.debt.coins }) });
      this.run.floatLabel(at, t(def.abilityNameKey!), def.debt.color);
      sfx('coin');
      // 초록 파티클을 뿜으며 무기가 잠깐 커진다
      this.run.juice.colorBurst(at, def.debt.color, this.run.ctx.data.juice.skillBurst);
      for (let i = 0; i < 14; i++) this.spark({ x: at.x + this.fx.range(-8, 8), y: at.y + this.fx.range(-8, 4) }, def.debt.color, 22);
      if (this.run.weaponItem() === item) {
        const s = this.run.weaponSprite;
        this.run.tweens.killTweensOf(s);
        s.setScale(1);
        this.run.tweens.add({ targets: s, scale: 1.35, duration: 160, yoyo: true, ease: 'Quad.easeOut', onComplete: () => s.setScale(1) });
      }
    }
  }

  /** 들고 있는 무기의 이동속도 증가 (징수를 낸 의수) */
  moveBonus(): number {
    const item = this.run.weaponItem();
    const def = this.run.weaponDefOf(item.defId);
    return def.debt && !item.unpaid ? def.debt.moveSpeed : 0;
  }

  // ---------- 환국의 잔명 ----------

  fireBeam(def: WeaponDef, st: WeaponStats, aimAngle: number): void {
    const b = def.beam!;
    const empowered = beamEmpowered(this.beamStacks, b.stacks);
    const origin = this.run.combat.muzzle();
    const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
    const path = this.laserPath(origin, dir, (empowered ? b.empowered.length : b.length) * (1 + this.run.itemRt.sums.area));
    const width = empowered ? b.empowered.width : b.width;
    const hits = this.laserHits(path, width, (e) => this.hit(e, st.damage * (empowered ? b.empowered.damageMul : 1), st.critChance, def));
    // 관통으로 여럿 맞혀도 에너지 회복·충전은 발사 한 번에 한 번
    const p = this.run.session.player;
    if (hits > 0) p.energy = gainEnergy(p.energy, b.energyGain, p.energyMax);
    const before = this.beamStacks;
    this.beamStacks = beamStacksAfter(this.beamStacks, b.stacks, hits > 0);
    for (const s of path) this.beamFx(def, s.from, s.dir, s.len, width, empowered);
    this.glyphs(origin, b.glyphColor, empowered ? 6 : 3);
    // 강화 사격: 레이저 길 전체에 고대 문자가 줄지어 떠오른다
    if (empowered) for (const s of path) this.beamGlyphs(s.from, s.dir, s.len, width, b.glyphColor);
    if (this.beamStacks > before) this.stackFx(def);
    if (empowered) {
      sfx('shotBeamHeavy');
      shake(this.run, 'light');
    }
  }

  private beamFx(def: WeaponDef, o: Vec2, dir: Vec2, len: number, width: number, big: boolean): void {
    const b = def.beam!;
    const g = this.run.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
    const end = { x: o.x + dir.x * len, y: o.y + dir.y * len };
    g.lineStyle(width * 1.8, hexColor(b.color), 0.25).lineBetween(o.x, o.y, end.x, end.y);
    g.lineStyle(width, hexColor(b.color), 0.75).lineBetween(o.x, o.y, end.x, end.y);
    g.lineStyle(Math.max(1, width / 3), 0xffffff, 1).lineBetween(o.x, o.y, end.x, end.y);
    this.run.tweens.add({ targets: g, alpha: 0, duration: big ? 320 : 160, onComplete: () => g.destroy() });
    if (big) for (let i = 0; i < 10; i++) {
      const k = this.fx.range(0, 1);
      this.spark({ x: o.x + dir.x * len * k, y: o.y + dir.y * len * k }, b.glyphColor, 14);
    }
  }

  /** 고대 명령 문자 하나: 짧은 획 몇 개(가로·세로·대각)로 된 글자 */
  private glyph(at: Vec2, color: string): Phaser.GameObjects.Graphics {
    const g = this.run.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(1, hexColor(color), 1);
    const s = 3;
    for (let k = 0; k < 3; k++) {
      const x0 = Math.round(this.fx.range(-s, s));
      const y0 = Math.round(this.fx.range(-s, s));
      // 가로·세로·대각 획만 (글자처럼 보이게)
      const [dx, dy] = this.fx.pick([[s, 0], [0, s], [s, s], [-s, s]] as const);
      g.lineBetween(x0, y0, x0 + dx, y0 + dy);
    }
    return g.setPosition(at.x, at.y);
  }

  /** 고대 명령 문자: 총구 둘레에 떴다 사라진다 */
  private glyphs(at: Vec2, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const g = this.glyph({ x: at.x + this.fx.range(-10, 10), y: at.y + this.fx.range(-12, 2) }, color);
      this.run.tweens.add({ targets: g, y: g.y - 8, alpha: 0, duration: 420 + i * 40, ease: 'Quad.easeOut', onComplete: () => g.destroy() });
    }
  }

  /** 강화 레이저: 길 전체에 일정한 간격으로 고대 문자가 한꺼번에 새겨졌다가, 총구 쪽부터 떠오르며 사라진다 */
  private beamGlyphs(o: Vec2, dir: Vec2, len: number, width: number, color: string): void {
    const gap = 11;
    const nx = -dir.y, ny = dir.x;
    for (let d = 6; d < len; d += gap) {
      const side = this.fx.range(-width * 0.35, width * 0.35);
      const g = this.glyph({ x: o.x + dir.x * d + nx * side, y: o.y + dir.y * d + ny * side }, color);
      // 레이저와 함께 한꺼번에 새겨지고, 총구 쪽부터 차례로 떠오르며 사라진다
      this.run.tweens.add({ targets: g, alpha: 0, y: g.y - 10, delay: 320 + (d / len) * 160, duration: 380, ease: 'Quad.easeIn', onComplete: () => g.destroy() });
    }
  }

  /** 충전이 하나 오를 때: 표시 둘레에 파티클이 확 터진다. 다 차면 효과음 */
  private stackFx(def: WeaponDef): void {
    const b = def.beam!;
    const at = this.gaugePos();
    const n = 6 + this.beamStacks * 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spark(at, b.glyphColor, 10 + this.beamStacks * 2, a);
    }
    if (beamEmpowered(this.beamStacks, b.stacks)) {
      sfx('advCharge');
      this.run.floatLabel(at, this.run.ctx.t('weapon.beamReady'), b.glyphColor);
    }
  }

  private gaugePos(): Vec2 {
    const h = this.run.combat.handPos();
    return { x: h.x, y: h.y - 14 };
  }

  // ---------- 무기 위 표시 ----------

  /** 원반 충전·박힌 침 수는 점으로, 환국의 잔명 충전은 고리 그림으로 무기 위에 작게 */
  private updateHeldLook(dt: number): void {
    const def = this.run.weaponDef();
    this.pips ??= this.run.add.graphics().setDepth(7);
    this.pips.clear();
    const at = this.gaugePos();
    const dots = def.boomerang
      ? { on: this.discCharges(def), all: this.discMax(def), color: def.attackParticles?.color ?? '#5ad9ff' }
      : def.needle
        ? { on: this.needles.filter((n) => n.stuck).length, all: def.needle.max, color: def.needle.color }
        : null;
    if (dots) {
      const gap = 4;
      const x0 = at.x - ((dots.all - 1) * gap) / 2;
      for (let i = 0; i < dots.all; i++) {
        this.pips.fillStyle(0x000000, 0.6).fillCircle(x0 + i * gap, at.y + 4, 1.8);
        if (i < dots.on) this.pips.fillStyle(hexColor(dots.color), 1).fillCircle(x0 + i * gap, at.y + 4, 1.2);
      }
    }
    const b = def.beam;
    if (!b) {
      this.gauge?.setVisible(false);
      return;
    }
    this.gauge ??= this.run.add.sprite(at.x, at.y, b.gauge.spriteKey).setDepth(7);
    const ready = beamEmpowered(this.beamStacks, b.stacks);
    this.gauge.setVisible(true).setPosition(at.x, at.y).setFrame(Math.min(b.stacks, this.beamStacks)).setScale(ready ? 1 + 0.12 * Math.abs(Math.sin(this.run.time.now / 120)) : 1);
    if (!ready) return;
    // 강화 사격 준비: 총구에서 빛이 새어 나온다
    this.readySparkIn -= dt;
    if (this.readySparkIn > 0) return;
    this.readySparkIn = 0.08;
    const m = this.run.combat.muzzle();
    this.spark({ x: m.x + this.fx.range(-2, 2), y: m.y + this.fx.range(-2, 2) }, b.glyphColor, 8);
    if (this.fx.chance(0.3)) this.glyphs(m, b.glyphColor, 1);
  }

  /** 작은 빛 조각 하나 (angle이 없으면 아무 방향) */
  private spark(at: Vec2, color: string, dist = 10, angle?: number): void {
    const a = angle ?? this.fx.range(0, Math.PI * 2);
    const s = this.run.add.rectangle(at.x, at.y, 2, 2, hexColor(color), 1).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    this.run.tweens.add({ targets: s, x: at.x + Math.cos(a) * dist, y: at.y + Math.sin(a) * dist, alpha: 0, duration: 360, ease: 'Quad.easeOut', onComplete: () => s.destroy() });
  }
}

/**
 * 마기법사 스킬. 백온파(원소)·휘강파(순수 마기).
 * - 화염벽: 조준 방향 앞에 조준과 직각인 불길 벽을 세워 앞으로 밀고 나간다(벽에 닿으면 멈춤). 벽 안 적은 tickSec마다 피해, burnEverySec마다 화상.
 * - 순간이동: 조준 방향으로 곧장 옮긴다(벽 앞에서 멈춤, 도착 폭발 없음).
 * - 화염구: 적·벽·사거리에서 폭발(피해 + 화상). 빙창: 꿰뚫으며 둔화. 얼음 보주: 느리게 나아가며 사방으로 파편(둔화).
 * - 뇌격: 가까운 적부터 연쇄. 원소 가호: 원소 스킬 피해 + 보호막. 원소 대합주: 화염·냉기·번개가 차례로 쏟아진다.
 * - 각인 상시 효과·시전 강화(대전·원소 순환)는 scenes/run/mageRuntime. 각성 동작의 오브젝트는 baekonAwaken.ts.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { getContext } from '../core/context';
import { bus } from '../core/events';
import { hexColor } from '../core/scale';
import type { BuffView } from '../core/session';
import type { Enemy } from '../entities/enemy';
import { shake } from '../entities/juice';
import { concertFull } from '../systems/magiMage';
import { chainTargets } from '../systems/targeting';
import type { ElementId, SpriteRef, TagId } from '../types/data';
import { fxScale, impactFx, loopArt, playFx, ProjectileLook, sparks, stretchFx } from './skillFx';
import { addFireZone, CLOUD_OWNER, FireZone, fireWardOrb, LodgedSpear, spawnEmbers, ThunderCloud, wardBurst } from './baekonAwaken';
import { floatText, trimOldest, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateCast, type UltimateImpl } from './host';

// ---------- 화염벽 ----------

class FireWall implements SkillObject {
  readonly owner = 'fireWall';
  readonly createdAt: number;
  private life: number;
  private tick = 0;
  private readonly lastBurn = new Map<Enemy, number>();
  private age = 0;
  private readonly flames: { sp: Phaser.GameObjects.Sprite; t: number }[] = [];
  private readonly len: number;
  private readonly thick: number;
  private stopped = false;
  /** 각성(불길의 행군): 다음 장판까지 */
  private zoneIn = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private at: { x: number; y: number },
    /** 조준 방향 (벽 두께 방향) */
    private readonly dir: { x: number; y: number },
  ) {
    const v = s.values;
    this.createdAt = host.scene.time.now;
    this.life = v.lifeSec!;
    this.len = host.area(v.length!);
    this.thick = v.thickness!;
    // 벽을 따라 불길 그림을 늘어놓는다
    const ref = s.def.sprites.flame!;
    const n = Math.max(2, Math.round(this.len / (ref.size * 0.7)));
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * this.len;
      const sp = host.sprite(at.x - dir.y * t, at.y + dir.x * t, ref).setDepth(4);
      const k = 1.4 * fxScale(host, s.owned.level);
      sp.setDisplaySize(ref.size * k, ref.size * k);
      loopArt(sp, ref);
      this.flames.push({ sp, t });
    }
  }

  /** 적 몸이 벽(회전한 사각형) 안에 걸리는지 */
  private inside(e: Enemy): boolean {
    const rx = e.sprite.x - this.at.x;
    const ry = e.sprite.y - this.at.y;
    const across = rx * this.dir.x + ry * this.dir.y;
    const along = -rx * this.dir.y + ry * this.dir.x;
    return Math.abs(along) <= this.len / 2 + e.radius && Math.abs(across) <= this.thick / 2 + e.radius;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.age += dt;
    this.life -= dt;
    this.tick -= dt;
    // 앞으로 밀고 나간다. 가운데가 벽에 닿으면 그 자리에 선다
    if (!this.stopped) {
      const next = { x: this.at.x + this.dir.x * v.speed! * dt, y: this.at.y + this.dir.y * v.speed! * dt };
      if (host.blocked(next.x, next.y)) this.stopped = true;
      else this.at = next;
    }
    const hitNow = this.tick <= 0;
    if (hitNow) this.tick = v.tickSec!;
    for (const e of host.enemies()) {
      if (!this.inside(e)) continue;
      if (hitNow && host.hit(e, v.damage!, this.s.def.sources.wall!)) continue;
      const last = this.lastBurn.get(e) ?? -Infinity;
      if (!e.dead && this.age - last >= v.burnEverySec!) {
        this.lastBurn.set(e, this.age);
        host.burn(e, v.burnStacks!);
      }
    }
    // 마지막 0.4초는 옅어진다
    const fade = Math.min(1, this.life / 0.4);
    for (const f of this.flames) f.sp.setPosition(this.at.x - this.dir.y * f.t, this.at.y + this.dir.x * f.t).setAlpha(fade);
    if (this.s.owned.awakened) this.march(dt, host);
    return this.life > 0;
  }

  /** 각성: 지나간 자리에 불길 장판을 남기고, 벽에 닿은 적 탄을 태운다 */
  private march(dt: number, host: SkillHost): void {
    const v = this.s.values;
    this.zoneIn -= dt;
    if (this.zoneIn <= 0) {
      this.zoneIn = v.zoneEverySec!;
      const at = { ...this.at };
      addFireZone(host, v.maxZones!, (h) => new FireZone(h, this.s.def.sprites.zone!, at, { sec: v.zoneSec!, tickSec: v.zoneTickSec!, damage: v.zoneDamage!, burnStacks: v.zoneBurnStacks!, tags: this.s.def.sources.wall!, rect: { len: this.len, thick: this.thick, dir: this.dir } }));
    }
    const ref = this.s.def.sprites.flame!;
    for (const f of this.flames) {
      if (host.enemyBulletsAt({ x: f.sp.x, y: f.sp.y }, ref.size * 0.6) > 0) sparks(host.scene, f.sp.x, f.sp.y, this.s.def.color, host.ctx.data.juice.projectileLook, 0.4);
    }
  }

  destroy(): void {
    for (const f of this.flames) f.sp.destroy();
  }
}

export const fireWall: SkillImpl = {
  cast(host, s) {
    const p = host.playerPos();
    const d = host.aimDir();
    const off = s.values.offset!;
    host.addObject(new FireWall(host, s, { x: p.x + d.x * off, y: p.y + d.y * off }, d));
    return true;
  },
};

// ---------- 순간이동 ----------

export const teleport: SkillImpl = {
  cast(host, s) {
    const { from, to } = host.teleport(host.teleportDir(), s.values.distance!, s.values.stepPx!);
    // 임시 연출: 떠난 자리·도착한 자리에 보라 파동 (pixelfx는 D 단계)
    host.burst(from, s.def.color);
    host.burst(to, s.def.color);
    return true;
  },
};

// ---------- 백온파 공용: 곧게 나는 투사체 ----------

interface MissileSpec {
  owner: string;
  from: Vec2;
  angle: number;
  speed: number;
  range: number;
  sprite: SpriteRef;
  /** 몸 아래 ADD 빛 (움직이는 픽셀 이펙트) */
  glow?: SpriteRef;
  /** 그림 배율 (레벨 꾸밈, 판정과 무관) */
  scale?: number;
  /** 더 꿰뚫을 수 있는 적 수 (0이면 첫 적에서 멈춘다) */
  pierce: number;
  onHit(e: Enemy): void;
  /** 멈춘 자리 (적·벽·사거리) */
  onEnd?(at: Vec2): void;
  /** 멈출 때(관통이 다하거나 벽·사거리) 마지막으로 맞힌 적 (맞힌 적이 없으면 부르지 않는다) */
  onLast?(e: Enemy, angle: number): void;
}

/** 조준 방향으로 곧게 날아가 적에 닿으면 onHit, 벽·사거리·관통이 다하면 onEnd */
class Missile implements SkillObject {
  readonly owner: string;
  readonly createdAt: number;
  private readonly look: ProjectileLook;
  private readonly dir: Vec2;
  private at: Vec2;
  private flown = 0;
  private pierce: number;
  private readonly struck = new Set<Enemy>();
  private lastStruck: Enemy | null = null;

  constructor(
    host: SkillHost,
    private readonly spec: MissileSpec,
  ) {
    this.owner = spec.owner;
    this.createdAt = host.scene.time.now;
    this.dir = { x: Math.cos(spec.angle), y: Math.sin(spec.angle) };
    this.at = { ...spec.from };
    this.pierce = spec.pierce;
    this.look = new ProjectileLook(host.scene, this.at.x, this.at.y, spec.sprite, host.ctx.data.juice.projectileLook, { rotation: spec.angle, glow: spec.glow, scale: spec.scale });
  }

  update(dt: number, host: SkillHost): boolean {
    const step = Math.min(this.spec.range - this.flown, this.spec.speed * dt);
    this.at = { x: this.at.x + this.dir.x * step, y: this.at.y + this.dir.y * step };
    this.flown += step;
    this.look.place(this.at.x, this.at.y, dt);
    const hitR = this.spec.sprite.size / 4;
    for (const e of host.enemies()) {
      if (this.struck.has(e) || Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) > e.radius + hitR) continue;
      this.struck.add(e);
      this.spec.onHit(e);
      this.lastStruck = e;
      if (this.pierce-- <= 0) return this.end();
    }
    if (this.flown >= this.spec.range || host.blocked(this.at.x, this.at.y)) return this.end();
    return true;
  }

  private end(): false {
    if (this.lastStruck) this.spec.onLast?.(this.lastStruck, this.spec.angle);
    this.spec.onEnd?.(this.at);
    return false;
  }

  destroy(): void {
    this.look.destroy();
  }
}

/** 조준 각도 */
function aimAngle(host: SkillHost): number {
  const d = host.aimDir();
  return Math.atan2(d.y, d.x);
}

// ---------- 화염구 ----------

export const fireball: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const tags = s.def.sources.blast!;
    const r = host.area(v.radius!);
    host.addObject(
      new Missile(host, {
        owner: 'fireball',
        from: host.playerPos(),
        angle: aimAngle(host),
        speed: v.speed!,
        range: v.range!,
        sprite: s.def.sprites.ball!,
        glow: s.def.sprites.ballGlow,
        scale: fxScale(host, s.owned.level),
        pierce: 0,
        onHit: () => {},
        onEnd: (at) => {
          bus.emit('sfx', { id: 'explosion', size: r });
          host.blastProps(at, r, v.damage!);
          for (const e of [...host.enemies()]) {
            if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
            if (!host.hit(e, v.damage!, tags)) host.burn(e, v.burnStacks!);
          }
          playFx(host.scene, s.def.sprites.blast!, at.x, at.y, { w: r * 2.4 * fxScale(host, s.owned.level) });
          impactFx(host, s.owned.level, at.x, at.y, s.def.color, r * 1.3, 1.5);
          shake(host.scene, 'light');
          // 각성(백열 연쇄): 폭발 뒤 불씨가 근처 적에게 튄다
          if (s.owned.awakened) spawnEmbers(host, s.def, v, at, v.embers!);
        },
      }),
    );
    return true;
  },
};

// ---------- 빙창 ----------

export const iceSpear: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const tags = s.def.sources.spear!;
    const hit = s.def.sprites.hit!;
    host.addObject(
      new Missile(host, {
        owner: 'iceSpear',
        from: host.playerPos(),
        angle: aimAngle(host),
        speed: v.speed!,
        range: v.range!,
        sprite: s.def.sprites.spear!,
        glow: s.def.sprites.spearGlow,
        scale: fxScale(host, s.owned.level),
        pierce: v.pierce!,
        onHit: (e) => {
          playFx(host.scene, hit, e.sprite.x, e.sprite.y, { w: hit.size * fxScale(host, s.owned.level) });
          impactFx(host, s.owned.level, e.sprite.x, e.sprite.y, s.def.color, hit.size);
          if (!host.hit(e, v.damage!, tags)) host.chill(e, v.slow!, v.slowSec!);
        },
        // 각성(쇄빙): 꿰뚫기가 다한 마지막 적에 박힌다
        onLast: (e, angle) => {
          if (s.owned.awakened && !e.dead) host.addObject(new LodgedSpear(host, s.def, v, e, angle));
        },
      }),
    );
    return true;
  },
};

// ---------- 얼음 보주 ----------

/**
 * 얼음 보주 (디아블로 2 서리 보주처럼): 느리게 나아가며 파편을 한 개씩 돌려 가며 흩뿌린다(나선).
 * volleySec마다 shards개 꼴, 한 개마다 spinDeg씩 돈다. 시간이 다 되면 사방으로 novaShards개를 한꺼번에 터뜨린다.
 */
class IceOrb implements SkillObject {
  readonly owner = 'iceOrb';
  readonly createdAt: number;
  private readonly look: ProjectileLook;
  private life: number;
  private emitIn = 0;
  private turn: number;
  private stopped = false;
  /** 각성(절대영도): 냉기 파장·눈보라 */
  private waveIn = 0;
  private stormIn = 0;
  private readonly storm: Phaser.GameObjects.Sprite | null = null;
  /** 이 보주가 쌓은 빙결 중첩 */
  private readonly frost = new Map<Enemy, number>();

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private at: Vec2,
    private readonly dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    this.turn = Math.atan2(dir.y, dir.x);
    if (s.owned.awakened) {
      const ref = s.def.sprites.blizzard!;
      const r = host.area(s.values.blizzardRadius!);
      this.storm = host.sprite(at.x, at.y, ref).setDepth(3).setAlpha(0.75);
      this.storm.setDisplaySize(r * 2.2, r * 2.2);
      loopArt(this.storm, ref);
    }
    this.look = new ProjectileLook(host.scene, at.x, at.y, s.def.sprites.orb!, host.ctx.data.juice.projectileLook, {
      glow: s.def.sprites.orbGlow,
      spin: true,
      scale: fxScale(host, s.owned.level),
    });
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.life -= dt;
    if (!this.stopped) {
      const next = { x: this.at.x + this.dir.x * v.speed! * dt, y: this.at.y + this.dir.y * v.speed! * dt };
      // 벽에 닿으면 그 자리에 멈춰 계속 파편을 뿌린다
      if (host.blocked(next.x, next.y)) this.stopped = true;
      else this.at = next;
    }
    this.look.place(this.at.x, this.at.y, dt, 1, Math.min(1, this.life / 0.3));
    if (this.s.owned.awakened) this.absoluteZero(dt, host);
    const every = v.volleySec! / v.shards!;
    this.emitIn -= dt;
    while (this.emitIn <= 0 && this.life > 0) {
      this.emitIn += every;
      this.turn += (v.spinDeg! * Math.PI) / 180;
      this.shoot(host, this.turn);
    }
    if (this.life > 0) return true;
    // 끝: 사방으로 한꺼번에
    const n = v.novaShards!;
    for (let i = 0; i < n; i++) this.shoot(host, this.turn + (i / n) * Math.PI * 2);
    impactFx(host, this.s.owned.level, this.at.x, this.at.y, this.s.def.color, this.s.def.sprites.orb!.size * 1.6, 1.5);
    return false;
  }

  /** 각성 눈보라: 보주 둘레 (한파 각인 확장이 쓴다) */
  blizzard(host: SkillHost): { x: number; y: number; r: number } | null {
    return this.storm ? { x: this.at.x, y: this.at.y, r: host.area(this.s.values.blizzardRadius!) } : null;
  }

  /** 빙결 중첩 하나 (보스는 둔화만, 빙결에 면역) */
  private addFrost(host: SkillHost, e: Enemy): void {
    const v = this.s.values;
    const n = (this.frost.get(e) ?? 0) + 1;
    if (n >= v.freezeNeed!) {
      this.frost.delete(e);
      host.freeze(e, v.freezeSec!);
    } else this.frost.set(e, n);
  }

  /** 절대영도: 주기적 냉기 파장(피해·둔화·빙결 중첩), 따라다니는 눈보라(둔화 유지·빙결 중첩) */
  private absoluteZero(dt: number, host: SkillHost): void {
    const v = this.s.values;
    const tags = this.s.def.sources.shard!;
    this.storm?.setPosition(this.at.x, this.at.y).setRotation(this.storm.rotation + dt * 1.5).setAlpha(0.75 * Math.min(1, this.life / 0.4));
    const sr = host.area(v.blizzardRadius!);
    this.stormIn -= dt;
    const stormTick = this.stormIn <= 0;
    if (stormTick) this.stormIn = v.blizzardTickSec!;
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) > sr + e.radius) continue;
      host.chill(e, v.blizzardSlow!, 0.4);
      if (stormTick) this.addFrost(host, e);
    }
    this.waveIn -= dt;
    if (this.waveIn > 0) return;
    this.waveIn = v.waveEverySec!;
    const wr = host.area(v.waveRadius!);
    playFx(host.scene, this.s.def.sprites.wave!, this.at.x, this.at.y, { w: wr * 2.2 }).setBlendMode('ADD');
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) > wr + e.radius) continue;
      if (host.hit(e, v.waveDamage!, tags)) continue;
      host.chill(e, v.waveSlow!, v.waveSlowSec!);
      this.addFrost(host, e);
    }
  }

  private shoot(host: SkillHost, angle: number): void {
    const v = this.s.values;
    const tags = this.s.def.sources.shard!;
    host.addObject(
      new Missile(host, {
        owner: 'iceOrb.shard',
        from: this.at,
        angle,
        speed: v.shardSpeed!,
        range: v.shardRange!,
        sprite: this.s.def.sprites.shard!,
        scale: fxScale(host, this.s.owned.level),
        pierce: 0,
        onHit: (e) => {
          if (!host.hit(e, v.damage!, tags)) host.chill(e, v.slow!, v.slowSec!);
        },
      }),
    );
  }

  destroy(): void {
    this.look.destroy();
    this.storm?.destroy();
  }
}

/** 지금 떠 있는 절대영도 눈보라들 (한파 각인 확장) */
export function blizzards(host: SkillHost): { x: number; y: number; r: number }[] {
  return host.objects().flatMap((o) => (o instanceof IceOrb ? [o.blizzard(host)].filter((b): b is { x: number; y: number; r: number } => !!b) : []));
}

export const iceOrb: SkillImpl = {
  cast(host, s) {
    host.addObject(new IceOrb(host, s, host.playerPos(), host.aimDir()));
    return true;
  },
};

// ---------- 뇌격 ----------

export const chainLightning: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const enemies = [...host.enemies()];
    const pts = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const p = host.playerPos();
    const first = chainTargets(p, pts, 1, host.area(v.range!), new Set())[0];
    if (first === undefined) return false;
    const order = [first, ...chainTargets(pts[first]!, pts, v.chains!, host.area(v.chainRange!), new Set([first]))];
    const tags = s.def.sources.bolt!;
    const bolt = s.def.sprites.bolt!;
    const zap = s.def.sprites.zap!;
    let from: Vec2 = p;
    order.forEach((i, n) => {
      const e = enemies[i]!;
      const a = from;
      from = { x: e.sprite.x, y: e.sprite.y };
      host.scene.time.delayedCall(n * v.chainGapSec! * 1000, () => {
        const b = e.dead ? pts[i]! : { x: e.sprite.x, y: e.sprite.y };
        const k = fxScale(host, s.owned.level);
        stretchFx(host.scene, bolt, a, b, bolt.size * k);
        playFx(host.scene, zap, b.x, b.y, { w: zap.size * k });
        impactFx(host, s.owned.level, b.x, b.y, s.def.color, zap.size * 0.8, 0.75);
        if (!e.dead) host.hit(e, v.damage!, tags);
        // 각성(뇌운): 마지막 적 위에 뇌운이 머문다
        if (s.owned.awakened && n === order.length - 1) {
          trimOldest(host, CLOUD_OWNER, v.maxClouds! - 1);
          host.addObject(new ThunderCloud(host, s.def, v, e.dead ? null : e, b, (v.fullCharge ?? 0) > 0));
        }
      });
    });
    return true;
  },
};

// ---------- 원소 가호 ----------

class ElementWard implements SkillObject {
  readonly owner = 'elementWard';
  readonly createdAt: number;
  private left: number;
  private readonly total: number;
  private shieldLeft: number;
  private readonly aura: Phaser.GameObjects.Sprite;
  /** 보호막 방울·남은 양 고리·도는 원소 구슬 */
  private readonly g: Phaser.GameObjects.Graphics;
  private t = 0;
  /** 막았을 때 번쩍임 (1 → 0) */
  private flash = 0;
  private readonly scene: Phaser.Scene;
  private readonly host: SkillHost;
  /** 각성(삼원소 수호): 다음 구슬까지 */
  private orbIn = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
    this.scene = host.scene;
    this.host = host;
    this.total = this.left = host.buffDuration(s.values.durationSec!, s.def.tags);
    this.shieldLeft = s.values.shield!;
    const ref = s.def.sprites.aura!;
    const p = host.playerPos();
    this.aura = host.sprite(p.x, p.y, ref).setDepth(3).setBlendMode('ADD');
    const w = ref.size * 1.5 * fxScale(host, s.owned.level);
    this.aura.setDisplaySize(w, (w * this.aura.height) / Math.max(1, this.aura.width));
    loopArt(this.aura, ref);
    this.g = host.scene.add.graphics().setDepth(6);
    // 펼칠 때 세 원소 빛이 터진다
    for (const c of WARD_COLORS) host.burst(p, c);
    impactFx(host, 3, p.x, p.y, s.def.color, WARD_RADIUS * 1.6, 1.5);
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    this.t += dt;
    this.orbIn = Math.max(0, this.orbIn - dt);
    this.flash = Math.max(0, this.flash - dt * 4);
    const p = host.playerPos();
    const fade = Math.min(1, this.left / 0.4);
    const on = this.shieldLeft > 0;
    // 보호막을 다 쓰면 옅어진다
    this.aura.setPosition(p.x, p.y + 4).setAlpha(fade * (on ? 1 : 0.5));
    const g = this.g.clear();
    const cy = p.y - 6;
    if (on) {
      const r = WARD_RADIUS + Math.sin(this.t * 4) * 0.8;
      const frac = this.shieldLeft / this.s.values.shield!;
      // 방울: 옅은 막 + 테두리, 막을 때 하얗게 번쩍
      g.fillStyle(0xffe6a8, (0.12 + 0.25 * this.flash) * fade).fillCircle(p.x, cy, r);
      g.lineStyle(1.5, this.flash > 0 ? 0xffffff : 0xffd27a, (0.75 + 0.25 * this.flash) * fade).strokeCircle(p.x, cy, r);
      // 남은 보호막 양: 바깥 고리
      g.lineStyle(2, 0xfff2c8, 0.9 * fade).beginPath();
      g.arc(p.x, cy, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false).strokePath();
    }
    // 세 원소 구슬이 돈다
    WARD_COLORS.forEach((c, i) => {
      const a = this.t * 3 + (i * Math.PI * 2) / 3;
      const x = p.x + Math.cos(a) * (WARD_RADIUS + 1);
      const y = cy + Math.sin(a) * (WARD_RADIUS + 1) * 0.5;
      const col = hexColor(c);
      g.fillStyle(col, 0.35 * fade).fillCircle(x, y, 4);
      g.fillStyle(col, fade).fillCircle(x, y, 2);
    });
    return this.left > 0;
  }

  elementDamage(): number {
    return this.s.values.elementDamage!;
  }

  absorb(amount: number): number {
    if (this.shieldLeft <= 0) return amount;
    const took = Math.min(this.shieldLeft, amount);
    this.shieldLeft -= took;
    this.flash = 1;
    // 각성: 막을 때마다 원소 구슬 (짧은 간격), 깨지면 세 원소 폭발
    if (this.s.owned.awakened) {
      const p = this.host.playerPos();
      if (this.orbIn <= 0) {
        this.orbIn = this.s.values.orbGapSec!;
        fireWardOrb(this.host, this.s.def, this.s.values, p);
      }
      if (this.shieldLeft <= 0) wardBurst(this.host, this.s.def, this.s.values, p);
    }
    // 깨지면 조각이 흩어진다
    if (this.shieldLeft <= 0) {
      const at = { x: this.aura.x, y: this.aura.y - 10 };
      sparks(this.scene, at.x, at.y, this.s.def.color, getContext().data.juice.projectileLook, 3);
      shake(this.scene, 'light');
    }
    return amount - took;
  }

  buff(host: SkillHost): BuffView {
    return { id: 'elementWard', label: host.ctx.t('buff.elementWard'), color: this.s.def.color, leftSec: this.left, totalSec: this.total };
  }

  destroy(): void {
    this.aura.destroy();
    this.g.destroy();
  }
}

const WARD_RADIUS = 15;
/** 원소 가호 구슬: 화염·냉기·번개 */
const WARD_COLORS = ['#ff6a2a', '#5ad0f0', '#ffd83a'];

export const elementWard: SkillImpl = {
  cast(host, s) {
    trimOldest(host, 'elementWard', 0);
    host.addObject(new ElementWard(host, s));
    return true;
  },
};

// ---------- 원소 순환 (패시브): 규칙은 scenes/run/mageRuntime의 시전 강화 ----------

export const elementCycle: PassiveImpl = { activate() {} };

// ---------- 원소 대합주 (백온파 궁극기) ----------

const CONCERT: { el: ElementId; sprite: string; damage: string; delay: string }[] = [
  { el: 'fire', sprite: 'fire', damage: 'fireDamage', delay: 'fireDelaySec' },
  { el: 'ice', sprite: 'ice', damage: 'iceDamage', delay: 'iceDelaySec' },
  { el: 'lightning', sprite: 'lightning', damage: 'lightningDamage', delay: 'lightningDelaySec' },
];

export const elementConcert: UltimateImpl = {
  cast(host, u) {
    const v = u.values;
    const tags = u.def.sources.fall!;
    // 장착한 공격 스킬이 한 원소뿐이면 그 원소만 크게 휘몰아친다
    const solo = CONCERT.find((w) => w.el === host.equippedElement());
    if (solo) {
      const r = host.area(v.radius! * v.soloRadiusMul!);
      for (let k = 0; k < v.soloStrikes!; k++) {
        host.scene.time.delayedCall(k * v.soloGapSec! * 1000, () => {
          const at = concertTarget(host, v.spreadPx!);
          const ref = u.def.sprites[solo.sprite]!;
          playFx(host.scene, ref, at.x, at.y, { w: ref.size * v.soloRadiusMul! }).setOrigin(0.5, 1);
          host.scene.time.delayedCall(v[solo.delay]! * 1000, () => concertLand(host, u, solo.el, at, r, v[solo.damage]! * v.soloDamageMul!, tags));
        });
      }
      floatText(host, host.playerPos().x, host.playerPos().y - 18, host.ctx.t(`skillMsg.concertSolo.${solo.el}`), u.def.color);
      shake(host.scene, 'heavy');
      // 각성(삼원 합일): 독주면 그 원소만 모여 폭주
      if (u.awakened) host.scene.time.delayedCall(((v.soloStrikes! - 1) * v.soloGapSec! + v[solo.delay]! + v.unionDelaySec!) * 1000, () => concertUnion(host, u, solo.el));
      return true;
    }
    const full = concertFull(host.elementsUsed());
    const strikes = full ? v.fullStrikes! : v.strikes!;
    const mul = full ? v.fullDamageMul! : 1;
    const r = host.area(v.radius!);
    CONCERT.forEach((w, wi) => {
      for (let k = 0; k < strikes; k++) {
        host.scene.time.delayedCall((wi * v.waveGapSec! + k * v.strikeGapSec!) * 1000, () => {
          const at = concertTarget(host, v.spreadPx!);
          const ref = u.def.sprites[w.sprite]!;
          // 떨어지는 그림은 발밑이 착지점
          playFx(host.scene, ref, at.x, at.y, { w: ref.size }).setOrigin(0.5, 1);
          host.scene.time.delayedCall(v[w.delay]! * 1000, () => concertLand(host, u, w.el, at, r, v[w.damage]! * mul, tags));
        });
      }
    });
    if (full) floatText(host, host.playerPos().x, host.playerPos().y - 18, host.ctx.t('skillMsg.concertFull'), u.def.color);
    // 각성(삼원 합일): 세 원소가 다 쏟아진 뒤 한 점에 모여 합일 폭발
    if (u.awakened) {
      const end = (CONCERT.length - 1) * v.waveGapSec! + (strikes - 1) * v.strikeGapSec! + Math.max(...CONCERT.map((w) => v[w.delay]!));
      host.scene.time.delayedCall((end + v.unionDelaySec!) * 1000, () => concertUnion(host, u, null));
    }
    return true;
  },
};

/**
 * 합일: 적이 가장 많이 모인 자리에 원소가 모여들었다가(수렴) 한꺼번에 터진다. 화상·둔화·감전(추가 번개 피해)을 함께.
 * solo면 그 원소만 모여 피해 ×soloUnionMul로 폭주 (그 원소 효과만)
 */
function concertUnion(host: SkillHost, u: UltimateCast, solo: ElementId | null): void {
  const v = u.values;
  const list = [...host.enemies()];
  const r = host.area(v.unionRadius!);
  // 둘레에 적이 가장 많은 적 자리 (없으면 플레이어 앞)
  let at: Vec2 = { x: host.playerPos().x + host.aimDir().x * 60, y: host.playerPos().y + host.aimDir().y * 60 };
  let best = -1;
  for (const e of list) {
    const n = list.filter((x) => Math.hypot(x.sprite.x - e.sprite.x, x.sprite.y - e.sprite.y) <= r).length;
    if (n > best) {
      best = n;
      at = { x: e.sprite.x, y: e.sprite.y };
    }
  }
  const conv = u.def.sprites.converge!;
  const c = playFx(host.scene, conv, at.x, at.y, { w: conv.size });
  if (solo) c.setTint(hexColor(CONCERT_COLOR[solo]));
  host.scene.time.delayedCall(v.convergeSec! * 1000, () => {
    const ref = u.def.sprites.union!;
    const b = playFx(host.scene, ref, at.x, at.y, { w: Math.max(ref.size, r * 2.4) });
    if (solo) b.setTint(hexColor(CONCERT_COLOR[solo]));
    host.scene.cameras.main.flash(140, 255, 250, 235);
    shake(host.scene, 'heavy');
    const tags = u.def.sources.fall!;
    const mul = solo ? v.soloUnionMul! : 1;
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
      if (host.hit(e, v.unionDamage! * mul, tags)) continue;
      if (!solo || solo === 'fire') host.burn(e, v.burnStacks!);
      if (!solo || solo === 'ice') host.chill(e, v.slow!, v.slowSec!);
      if ((!solo || solo === 'lightning') && !e.dead) host.hit(e, v.shockDamage! * mul, tags);
    }
    if (solo) floatText(host, at.x, at.y - 20, host.ctx.t('skillMsg.unionSolo'), CONCERT_COLOR[solo]);
  });
}

const CONCERT_COLOR: Record<ElementId, string> = { fire: '#ff6a2a', ice: '#5ad0f0', lightning: '#ffd83a' };

/** 떨어질 자리: 살아 있는 적 중 무작위, 없으면 플레이어 둘레 */
function concertTarget(host: SkillHost, spread: number): Vec2 {
  const list = host.enemies();
  if (list.length > 0) {
    const e = host.rng.pick([...list]);
    return { x: e.sprite.x, y: e.sprite.y };
  }
  const p = host.playerPos();
  return { x: p.x + host.rng.range(-spread, spread), y: p.y + host.rng.range(-spread, spread) };
}

function concertLand(host: SkillHost, u: UltimateCast, el: ElementId, at: Vec2, r: number, damage: number, tags: readonly TagId[]): void {
  const v = u.values;
  const s = u.def.sprites;
  if (el === 'fire') playFx(host.scene, s.fireBlast!, at.x, at.y, { w: r * 2.4 });
  if (el === 'ice') playFx(host.scene, s.iceBurst!, at.x, at.y, { w: r * 2.2 });
  shake(host.scene, 'light');
  for (const e of [...host.enemies()]) {
    if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
    if (host.hit(e, damage, tags)) continue;
    if (el === 'fire') host.burn(e, v.burnStacks!);
    if (el === 'ice') host.freeze(e, v.freezeSec!);
  }
}

/**
 * 마기법사 스킬. 백온파(원소)·휘강파(순수 마기).
 * - 화염벽: 조준 방향 앞에 조준과 직각인 불길 벽을 세운다. 벽 안 적은 tickSec마다 피해, burnEverySec마다 화상.
 * - 순간이동: 조준 방향으로 곧장 옮긴다(벽 앞에서 멈춤, 도착 폭발 없음).
 * - 화염구: 적·벽·사거리에서 폭발(피해 + 화상). 빙창: 꿰뚫으며 둔화. 얼음 보주: 느리게 나아가며 사방으로 파편(둔화).
 * - 뇌격: 가까운 적부터 연쇄. 원소 가호: 원소 스킬 피해 + 보호막. 원소 대합주: 화염·냉기·번개가 차례로 쏟아진다.
 * - 각인 상시 효과·시전 강화(대전·원소 순환)는 scenes/run/mageRuntime.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { bus } from '../core/events';
import type { BuffView } from '../core/session';
import type { Enemy } from '../entities/enemy';
import { shake } from '../entities/juice';
import { concertFull } from '../systems/magiMage';
import { chainTargets } from '../systems/targeting';
import type { ElementId, SpriteRef, TagId } from '../types/data';
import { loopArt, playFx, stretchFx } from './skillFx';
import { floatText, trimOldest, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateCast, type UltimateImpl } from './host';

// ---------- 화염벽 ----------

class FireWall implements SkillObject {
  readonly owner = 'fireWall';
  readonly createdAt: number;
  private life: number;
  private tick = 0;
  private readonly lastBurn = new Map<Enemy, number>();
  private age = 0;
  private readonly flames: Phaser.GameObjects.Sprite[] = [];
  private readonly len: number;
  private readonly thick: number;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly at: { x: number; y: number },
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
      sp.setDisplaySize(ref.size * 1.4, ref.size * 1.4);
      loopArt(sp, ref);
      this.flames.push(sp);
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
    for (const f of this.flames) f.setAlpha(fade);
    return this.life > 0;
  }

  destroy(): void {
    for (const f of this.flames) f.destroy();
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
    const { from, to } = host.teleport(host.aimDir(), s.values.distance!, s.values.stepPx!);
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
  /** 더 꿰뚫을 수 있는 적 수 (0이면 첫 적에서 멈춘다) */
  pierce: number;
  onHit(e: Enemy): void;
  /** 멈춘 자리 (적·벽·사거리) */
  onEnd?(at: Vec2): void;
}

/** 조준 방향으로 곧게 날아가 적에 닿으면 onHit, 벽·사거리·관통이 다하면 onEnd */
class Missile implements SkillObject {
  readonly owner: string;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly dir: Vec2;
  private at: Vec2;
  private flown = 0;
  private pierce: number;
  private readonly struck = new Set<Enemy>();

  constructor(
    host: SkillHost,
    private readonly spec: MissileSpec,
  ) {
    this.owner = spec.owner;
    this.createdAt = host.scene.time.now;
    this.dir = { x: Math.cos(spec.angle), y: Math.sin(spec.angle) };
    this.at = { ...spec.from };
    this.pierce = spec.pierce;
    this.img = host.sprite(this.at.x, this.at.y, spec.sprite).setDepth(5).setRotation(spec.angle);
    this.img.setDisplaySize(spec.sprite.size, (spec.sprite.size * this.img.height) / Math.max(1, this.img.width));
    loopArt(this.img, spec.sprite);
  }

  update(dt: number, host: SkillHost): boolean {
    const step = Math.min(this.spec.range - this.flown, this.spec.speed * dt);
    this.at = { x: this.at.x + this.dir.x * step, y: this.at.y + this.dir.y * step };
    this.flown += step;
    this.img.setPosition(this.at.x, this.at.y);
    const hitR = this.spec.sprite.size / 4;
    for (const e of host.enemies()) {
      if (this.struck.has(e) || Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) > e.radius + hitR) continue;
      this.struck.add(e);
      this.spec.onHit(e);
      if (this.pierce-- <= 0) return this.end();
    }
    if (this.flown >= this.spec.range || host.blocked(this.at.x, this.at.y)) return this.end();
    return true;
  }

  private end(): false {
    this.spec.onEnd?.(this.at);
    return false;
  }

  destroy(): void {
    this.img.destroy();
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
        pierce: 0,
        onHit: () => {},
        onEnd: (at) => {
          bus.emit('sfx', { id: 'explosion', size: r });
          host.blastProps(at, r, v.damage!);
          for (const e of [...host.enemies()]) {
            if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
            if (!host.hit(e, v.damage!, tags)) host.burn(e, v.burnStacks!);
          }
          playFx(host.scene, s.def.sprites.blast!, at.x, at.y, { w: r * 2.4 });
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
        pierce: v.pierce!,
        onHit: (e) => {
          playFx(host.scene, hit, e.sprite.x, e.sprite.y, { w: hit.size });
          if (!host.hit(e, v.damage!, tags)) host.chill(e, v.slow!, v.slowSec!);
        },
      }),
    );
    return true;
  },
};

// ---------- 얼음 보주 ----------

class IceOrb implements SkillObject {
  readonly owner = 'iceOrb';
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Sprite;
  private life: number;
  private volleyIn = 0;
  private turn = 0;
  private stopped = false;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private at: Vec2,
    private readonly dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    const ref = s.def.sprites.orb!;
    this.img = host.sprite(at.x, at.y, ref).setDepth(5);
    this.img.setDisplaySize(ref.size, (ref.size * this.img.height) / Math.max(1, this.img.width));
    loopArt(this.img, ref);
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
    this.img.setPosition(this.at.x, this.at.y).setAlpha(Math.min(1, this.life / 0.3));
    this.volleyIn -= dt;
    if (this.volleyIn <= 0 && this.life > 0) {
      this.volleyIn = v.volleySec!;
      this.volley(host);
    }
    return this.life > 0;
  }

  /** 사방으로 파편 (뿌릴 때마다 반 칸씩 돌린다) */
  private volley(host: SkillHost): void {
    const v = this.s.values;
    const n = v.shards!;
    const tags = this.s.def.sources.shard!;
    this.turn += Math.PI / n;
    for (let i = 0; i < n; i++) {
      host.addObject(
        new Missile(host, {
          owner: 'iceOrb.shard',
          from: this.at,
          angle: this.turn + (i / n) * Math.PI * 2,
          speed: v.shardSpeed!,
          range: v.shardRange!,
          sprite: this.s.def.sprites.shard!,
          pierce: 0,
          onHit: (e) => {
            if (!host.hit(e, v.damage!, tags)) host.chill(e, v.slow!, v.slowSec!);
          },
        }),
      );
    }
  }

  destroy(): void {
    this.img.destroy();
  }
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
        stretchFx(host.scene, bolt, a, b, bolt.size);
        playFx(host.scene, zap, b.x, b.y, { w: zap.size });
        if (!e.dead) host.hit(e, v.damage!, tags);
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

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    this.createdAt = host.scene.time.now;
    this.total = this.left = host.buffDuration(s.values.durationSec!, s.def.tags);
    this.shieldLeft = s.values.shield!;
    const ref = s.def.sprites.aura!;
    const p = host.playerPos();
    this.aura = host.sprite(p.x, p.y, ref).setDepth(3);
    this.aura.setDisplaySize(ref.size, (ref.size * this.aura.height) / Math.max(1, this.aura.width));
    loopArt(this.aura, ref);
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    const p = host.playerPos();
    // 보호막을 다 쓰면 옅어진다
    this.aura.setPosition(p.x, p.y).setAlpha(Math.min(1, this.left / 0.4) * (this.shieldLeft > 0 ? 1 : 0.6));
    return this.left > 0;
  }

  elementDamage(): number {
    return this.s.values.elementDamage!;
  }

  absorb(amount: number): number {
    const took = Math.min(this.shieldLeft, amount);
    this.shieldLeft -= took;
    return amount - took;
  }

  buff(host: SkillHost): BuffView {
    return { id: 'elementWard', label: host.ctx.t('buff.elementWard'), color: this.s.def.color, leftSec: this.left, totalSec: this.total };
  }

  destroy(): void {
    this.aura.destroy();
  }
}

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
    const full = concertFull(host.elementsUsed());
    const strikes = full ? v.fullStrikes! : v.strikes!;
    const mul = full ? v.fullDamageMul! : 1;
    const r = host.area(v.radius!);
    const tags = u.def.sources.fall!;
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
    return true;
  },
};

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

/**
 * 마기법사 휘강파 (순수 마기).
 * - 마기탄: 조준 방향으로 빠르게 연사. 마기 분출: 직선 관통 광선(벽에서 끊긴다).
 * - 마기 파동: 앞쪽 부채꼴 피해 + 밀치기. 마기 응축구: 느리게 나아가며 끌어당기다 터진다.
 * - 마기 기둥: 가까운 적 발밑(없으면 앞쪽)에서 공간격 분출. 슬픈 처형: 보라 대광선, 낮은 체력 일반·엘리트 처형.
 * - 각인 상시 효과·응축 게이지·순수 전개는 scenes/run/mageRuntime.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { bus } from '../core/events';
import { executeMark } from '../entities/statusLook';
import { shake } from '../entities/juice';
import { executable, type PureElement } from '../systems/magiMage';
import { lineHits } from '../systems/targeting';
import { inArc } from '../systems/weapons';
import type { Enemy } from '../entities/enemy';
import { fxScale, impactFx, loopArt, playFx, ProjectileLook, sparks, stretchFx } from './skillFx';
import { nearestEnemy, trimOldest, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateImpl } from './host';

const RAY_STEP_PX = 4;

/** p에서 dir로 벽에 닿기 전까지의 길이 (최대 max) */
function rayLength(host: SkillHost, p: Vec2, dir: Vec2, max: number): number {
  for (let d = RAY_STEP_PX; d <= max; d += RAY_STEP_PX) if (host.blocked(p.x + dir.x * d, p.y + dir.y * d)) return d;
  return max;
}

// ---------- 마기탄 ----------

export const magiBolt: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const tags = s.def.sources.bolt!;
    const shot = s.def.sprites.shot!;
    for (let i = 0; i < v.shots!; i++) {
      host.scene.time.delayedCall(i * v.gapSec! * 1000, () => {
        const d = host.aimDir();
        const a = Math.atan2(d.y, d.x) + host.rng.range(-1, 1) * ((v.spreadDeg! * Math.PI) / 180);
        host.fireBullet(host.playerPos(), a, v.speed!, v.range!, v.damage!, tags, shot, { pierce: v.pierce ?? 0, hitSize: shot.size / 2 });
      });
    }
    return true;
  },
};

// ---------- 마기 분출 ----------

export const magiBurst: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const p = host.playerPos();
    const dir = host.aimDir();
    const len = rayLength(host, p, dir, v.length!);
    const enemies = [...host.enemies()];
    const hits = lineHits(p, dir, len, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
    for (const i of hits) host.hit(enemies[i]!, v.damage!, s.def.sources.beam!);
    // 그림의 광선 몸통은 칸 높이의 절반쯤이라 판정 폭의 두 배로 그린다
    stretchFx(host.scene, s.def.sprites.beam!, p, { x: p.x + dir.x * len, y: p.y + dir.y * len }, v.width! * 2 * fxScale(host, s.owned.level), 0.25);
    impactFx(host, s.owned.level, p.x + dir.x * len, p.y + dir.y * len, s.def.color, v.width! * 1.5);
    return true;
  },
};

// ---------- 마기 파동 ----------

export const magiWave: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const p = host.playerPos();
    const d = host.aimDir();
    const a = Math.atan2(d.y, d.x);
    const r = host.area(v.radius!);
    for (const e of [...host.enemies()]) {
      if (!inArc(p, a, v.arcDeg!, r, { x: e.sprite.x, y: e.sprite.y }, e.radius)) continue;
      if (host.hit(e, v.damage!, s.def.sources.wave!)) continue;
      const dx = e.sprite.x - p.x;
      const dy = e.sprite.y - p.y;
      const n = Math.hypot(dx, dy) || 1;
      e.knockback({ x: dx / n, y: dy / n }, v.knockback!, v.knockSec!);
    }
    playFx(host.scene, s.def.sprites.wave!, p.x + d.x * r * 0.35, p.y + d.y * r * 0.35, { w: r * 1.5 * fxScale(host, s.owned.level), rotation: a });
    if (s.owned.level >= host.ctx.data.juice.projectileLook.ringFromLevel) impactFx(host, s.owned.level, p.x + d.x * r * 0.5, p.y + d.y * r * 0.5, s.def.color, r * 0.6);
    return true;
  },
};

// ---------- 마기 응축구 ----------

class Condenser implements SkillObject {
  readonly owner = 'magiCondenser';
  readonly createdAt: number;
  private readonly look: ProjectileLook;
  private life: number;
  private pullIn = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private at: Vec2,
    private readonly dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    this.look = new ProjectileLook(host.scene, at.x, at.y, s.def.sprites.orb!, host.ctx.data.juice.projectileLook, { glow: s.def.sprites.orbGlow, spin: true, trail: false, scale: fxScale(host, s.owned.level) });
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.life -= dt;
    const next = { x: this.at.x + this.dir.x * v.speed! * dt, y: this.at.y + this.dir.y * v.speed! * dt };
    if (!host.blocked(next.x, next.y)) this.at = next;
    // 터질 때가 다가올수록 부푼다
    const grow = 1 + 0.4 * (1 - Math.max(0, this.life) / v.lifeSec!);
    this.look.place(this.at.x, this.at.y, dt, grow);
    this.pullIn -= dt;
    if (this.pullIn <= 0) {
      this.pullIn = v.pullEverySec!;
      const pr = host.area(v.pullRadius!);
      for (const e of host.enemies()) {
        const dx = this.at.x - e.sprite.x;
        const dy = this.at.y - e.sprite.y;
        const d = Math.hypot(dx, dy);
        if (d > pr + e.radius || d < 2) continue;
        e.knockback({ x: dx / d, y: dy / d }, Math.min(v.pullPx!, d), v.pullEverySec!);
      }
    }
    if (this.life > 0) return true;
    this.explode(host);
    return false;
  }

  private explode(host: SkillHost): void {
    const v = this.s.values;
    const r = host.area(v.radius!);
    bus.emit('sfx', { id: 'explosion', size: r });
    host.blastProps(this.at, r, v.damage!);
    for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) <= r + e.radius) host.hit(e, v.damage!, this.s.def.sources.blast!);
    playFx(host.scene, this.s.def.sprites.blast!, this.at.x, this.at.y, { w: r * 2.4 * fxScale(host, this.s.owned.level) });
    impactFx(host, this.s.owned.level, this.at.x, this.at.y, this.s.def.color, r * 1.2, 2);
    shake(host.scene, 'light');
  }

  destroy(): void {
    this.look.destroy();
  }
}

export const magiCondenser: SkillImpl = {
  cast(host, s) {
    host.addObject(new Condenser(host, s, host.playerPos(), host.aimDir()));
    return true;
  },
};

// ---------- 마기 기둥 ----------

/**
 * 기둥 연출: 땅이 갈라지며 빛이 새고(예고) → 거대한 마기 기둥이 솟구친다(늘어나며 튀어나옴, 빛 덧칠, 파편, 흔들림)
 * → 잠깐 버티다 가늘어지며 사라진다. 균열은 조금 더 남는다
 */
function pillarFx(host: SkillHost, s: SkillCast, at: Vec2, r: number, delaySec: number): void {
  const k = fxScale(host, s.owned.level);
  const sc = host.scene;
  const crater = s.def.sprites.crater!;
  const c = host.sprite(at.x, at.y + 2, crater).setDepth(2.5).setAlpha(0.9);
  const cw = r * 3.2 * k;
  c.setDisplaySize(cw * 0.3, (cw * 0.3 * c.height) / Math.max(1, c.width));
  sc.tweens.add({ targets: c, displayWidth: cw, displayHeight: (cw * c.height) / Math.max(1, c.width), duration: delaySec * 1000, ease: 'Quad.easeOut' });
  sc.tweens.add({ targets: c, alpha: 0, delay: (delaySec + 1.2) * 1000, duration: 500, onComplete: () => c.destroy() });
  shake(sc, 'rumble');
  sc.time.delayedCall(delaySec * 1000, () => {
    const ref = s.def.sprites.column!;
    const w = Math.max(30, r * 2.4) * k;
    const h = w * 2.6;
    // 몸통 + 같은 그림을 넓게 겹친 빛
    const glow = host.sprite(at.x, at.y + 3, ref).setOrigin(0.5, 1).setDepth(6).setBlendMode('ADD').setAlpha(0.55);
    const body = host.sprite(at.x, at.y + 3, ref).setOrigin(0.5, 1).setDepth(6);
    body.setDisplaySize(w, 1);
    glow.setDisplaySize(w * 1.6, 1);
    sc.tweens.add({ targets: body, displayHeight: h, duration: 160, ease: 'Back.easeOut' });
    sc.tweens.add({ targets: glow, displayHeight: h * 1.08, duration: 160, ease: 'Back.easeOut' });
    // 버티는 동안 가볍게 일렁이다가 가늘어지며 사라진다
    sc.tweens.add({ targets: glow, alpha: 0.25, duration: 90, yoyo: true, repeat: 2, delay: 160 });
    sc.tweens.add({ targets: [body, glow], displayWidth: 0, alpha: 0, delay: 560, duration: 300, ease: 'Quad.easeIn', onComplete: () => (body.destroy(), glow.destroy()) });
    playFx(sc, s.def.sprites.pillar!, at.x, at.y + r * 0.3, { w: w * 1.2 }).setOrigin(0.5, 1);
    shake(sc, 'medium');
    host.hitStop?.(0.04);
    sparks(sc, at.x, at.y - 4, '#8a8a96', host.ctx.data.juice.projectileLook, 2 * k);
    sparks(sc, at.x, at.y - h * 0.4, s.def.color, host.ctx.data.juice.projectileLook, 2.5 * k);
    host.burst(at, s.def.color);
  });
}

export const magiPillar: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const p = host.playerPos();
    const target = nearestEnemy(host, p, v.range!);
    const d = host.aimDir();
    const at = target ? { x: target.sprite.x, y: target.sprite.y } : { x: p.x + d.x * v.ahead!, y: p.y + d.y * v.ahead! };
    const r = host.area(v.radius!);
    pillarFx(host, s, at, r, v.delaySec!);
    host.scene.time.delayedCall(v.delaySec! * 1000, () => {
      impactFx(host, s.owned.level, at.x, at.y, s.def.color, r * 1.4, 1.5);
      for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= r + e.radius) host.hit(e, v.damage!, s.def.sources.pillar!);
    });
    return true;
  },
};

// ---------- 순수 전개 (패시브): 판정은 scenes/run/mageRuntime, 여기서는 원소 정령 ----------

export const pureUnfolding: PassiveImpl = { activate() {} };

const SPIRIT_OWNER = 'pureUnfolding.spirit';
const SPIRIT_SHOT_PXPS = 230;

/**
 * 원소 정령: 장착한 공격 스킬이 모두 한 원소인 동안 하나가 플레이어 둘레를 떠다닌다(MageRuntime이 부르고 치운다).
 * 그 원소 스킬을 쓸 때마다 사거리 안 가까운 적들에게 shots발 추가 공격(적이 적으면 같은 적에게 여러 발).
 * 화염: 불덩이 → 작은 폭발·화상. 냉기: 얼음창 → 둔화. 번개: 즉시 번개. 순수 마기: 마기 구슬 → 작은 폭발.
 */
export class ElementSpirit implements SkillObject {
  readonly owner = SPIRIT_OWNER;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly scale: number;
  private alive = true;
  private t: number;
  private at: Vec2;

  constructor(
    host: SkillHost,
    private readonly def: SkillCast['def'],
    private v: Record<string, number>,
    readonly el: PureElement,
  ) {
    this.createdAt = host.scene.time.now;
    this.t = host.rng.range(0, Math.PI * 2);
    const p = host.playerPos();
    this.at = { x: p.x, y: p.y - 10 };
    const ref = def.sprites[el]!;
    this.img = host.sprite(this.at.x, this.at.y, ref).setDepth(5);
    this.img.setDisplaySize((ref.height! * this.img.width) / Math.max(1, this.img.height), ref.height!);
    this.scale = this.img.scaleY;
    // 등장: 튀어나오듯 커진다
    this.img.setScale(0);
    host.scene.tweens.add({ targets: this.img, scale: this.scale, duration: 320, ease: 'Back.easeOut' });
    host.burst(this.at, ref.color);
  }

  update(dt: number, host: SkillHost): boolean {
    this.t += dt;
    // 플레이어 둘레를 천천히 돌며 떠다닌다
    const p = host.playerPos();
    const to = { x: p.x + Math.cos(this.t * 0.9) * 18, y: p.y - 14 + Math.sin(this.t * 0.9) * 8 + Math.sin(this.t * 3) * 2 };
    const k = Math.min(1, dt * 5);
    this.at = { x: this.at.x + (to.x - this.at.x) * k, y: this.at.y + (to.y - this.at.y) * k };
    this.img.setPosition(this.at.x, this.at.y);
    return this.alive;
  }

  /** 순수 전개 레벨이 바뀌면 수치만 갈아 끼운다 */
  setValues(v: Record<string, number>): void {
    this.v = v;
  }

  dismiss(): void {
    this.alive = false;
  }

  /** 맞춘 원소 스킬을 썼다: 가까운 적부터 shots발 (0.1초 간격) */
  volley(host: SkillHost): void {
    const list = [...host.enemies()]
      .filter((e) => Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) <= this.v.range! + e.radius)
      .sort((a, b) => Math.hypot(a.sprite.x - this.at.x, a.sprite.y - this.at.y) - Math.hypot(b.sprite.x - this.at.x, b.sprite.y - this.at.y));
    if (list.length === 0) return;
    for (let i = 0; i < this.v.shots!; i++) {
      const target = list[i % list.length]!;
      host.scene.time.delayedCall(i * 100, () => {
        if (!this.alive || target.dead) return;
        this.img.setFlipX(target.sprite.x < this.at.x);
        this.attack(host, target);
      });
    }
  }

  private attack(host: SkillHost, target: Enemy): void {
    const s = this.def.sprites;
    const v = this.v;
    const tags = this.def.sources.spirit!;
    const from = { ...this.at };
    // 공격하며 몸을 부풀린다
    host.scene.tweens.add({ targets: this.img, scale: this.scale * 1.25, duration: 90, yoyo: true });
    if (this.el === 'lightning') {
      const b = { x: target.sprite.x, y: target.sprite.y };
      stretchFx(host.scene, s.lightningShot!, from, b, s.lightningShot!.size);
      playFx(host.scene, s.lightningHit!, b.x, b.y, { w: s.lightningHit!.size });
      host.hit(target, v.spiritDamage!, tags);
      return;
    }
    const shot = s[`${this.el}Shot`]!;
    const hit = s[`${this.el}Hit`]!;
    const to = { x: target.sprite.x, y: target.sprite.y };
    const sp = host.sprite(from.x, from.y, shot).setDepth(6).setRotation(Math.atan2(to.y - from.y, to.x - from.x));
    sp.setDisplaySize(shot.size, (shot.size * sp.height) / Math.max(1, sp.width));
    loopArt(sp, shot);
    const sec = Math.max(0.08, Math.hypot(to.x - from.x, to.y - from.y) / SPIRIT_SHOT_PXPS);
    host.scene.tweens.add({
      targets: sp,
      x: to.x,
      y: to.y,
      duration: sec * 1000,
      onComplete: () => {
        sp.destroy();
        const at = target.dead ? to : { x: target.sprite.x, y: target.sprite.y };
        playFx(host.scene, hit, at.x, at.y, { w: hit.size });
        if (this.el === 'ice') {
          if (!target.dead && !host.hit(target, v.spiritDamage!, tags)) host.chill(target, v.slow!, v.slowSec!);
          return;
        }
        // 화염·순수 마기: 작은 폭발
        const r = host.area(v.radius!);
        for (const e of [...host.enemies()]) {
          if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
          if (!host.hit(e, v.spiritDamage!, tags) && this.el === 'fire') host.burn(e, v.burnStacks!);
        }
      },
    });
  }

  destroy(): void {
    this.img.destroy();
  }
}

/** 원소 정령을 부른다 (이미 있던 정령은 치운다) */
export function summonSpirit(host: SkillHost, def: SkillCast['def'], values: Record<string, number>, el: PureElement): ElementSpirit {
  trimOldest(host, SPIRIT_OWNER, 0);
  const sp = new ElementSpirit(host, def, values, el);
  host.addObject(sp);
  return sp;
}

// ---------- 슬픈 처형 (휘강파 궁극기) ----------

export const sadExecution: UltimateImpl = {
  cast(host, u) {
    const v = u.values;
    const p = host.playerPos();
    const dir = host.aimDir();
    const end = { x: p.x + dir.x * v.length!, y: p.y + dir.y * v.length! };
    host.scene.time.delayedCall(v.chargeSec! * 1000, () => {
      const enemies = [...host.enemies()];
      const hits = lineHits(p, dir, v.length!, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      stretchFx(host.scene, u.def.sprites.beam!, p, end, v.width! * 2, 0.4);
      shake(host.scene, 'heavy');
      for (const i of hits) {
        const e = enemies[i]!;
        if (host.hit(e, v.damage!, u.def.sources.beam!) || e.dead) continue;
        if (!executable(e.rank, e.hp, e.maxHp, v.executeRatio!)) continue;
        executeMark(host.scene, e.sprite.x, e.sprite.y);
        host.hitTrue(e, e.hp / Math.max(0.01, e.takenMul) + 1, false);
      }
    });
    // 모으는 동안 가는 예고선
    stretchFx(host.scene, u.def.sprites.beam!, p, end, v.width! * 0.4, v.chargeSec!);
    return true;
  },
};

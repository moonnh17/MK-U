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
import { cappedGrowth, executable, type PureElement } from '../systems/magiMage';
import { Missile } from './magiMage';
import { addFireZone, FireZone } from './baekonAwaken';
import { lineHits } from '../systems/targeting';
import { inArc } from '../systems/weapons';
import type { Enemy } from '../entities/enemy';
import { fxScale, impactFx, loopArt, playFx, ProjectileLook, sparks, stretchFx } from './skillFx';
import { floatText, nearestEnemy, trimOldest, type PassiveImpl, type UltimateCast, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateImpl } from './host';

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
        // 각성(탄막 전개): 마지막 한 발은 대형 관통탄
        if (s.owned.awakened && i === v.shots! - 1) bigBolt(host, s, a);
        else host.fireBullet(host.playerPos(), a, v.speed!, v.range!, v.damage!, tags, shot, { pierce: v.pierce ?? 0, hitSize: shot.size / 2 });
      });
    }
    return true;
  },
};

/** 대형 관통탄: 맞힐 때마다 작은 폭발. 과잉 전개 각인 확장이면 꿰뚫을 때마다 마기탄 재사용 대기 환급(상한) */
function bigBolt(host: SkillHost, s: SkillCast, angle: number): void {
  const v = s.values;
  const tags = s.def.sources.bolt!;
  const im = host.imprintOf?.('magiBolt');
  let refunded = 0;
  host.addObject(
    new Missile(host, {
      owner: 'magiBolt.big',
      from: host.playerPos(),
      angle,
      speed: v.bigSpeed!,
      range: v.bigRange!,
      sprite: s.def.sprites.big!,
      glow: s.def.sprites.shot,
      scale: 1.1,
      pierce: 99,
      // 날아가는 내내 뒤로 보라·흰 불티가 흩날린다
      onStep: (at) => {
        if (host.rng.chance(0.6)) sparks(host.scene, at.x, at.y, host.rng.chance(0.5) ? '#ffffff' : s.def.color, host.ctx.data.juice.projectileLook, 0.18);
      },
      onHit: (e) => {
        const at = { x: e.sprite.x, y: e.sprite.y };
        host.hit(e, v.bigDamage!, tags);
        const r = host.area(v.bigBlastRadius!);
        for (const x of [...host.enemies()]) if (x !== e && Math.hypot(x.sprite.x - at.x, x.sprite.y - at.y) <= r + x.radius) host.hit(x, v.bigBlastDamage!, tags);
        playFx(host.scene, s.def.sprites.bigBlast!, at.x, at.y, { w: r * 2.2 });
        // 꿰뚫는 자리: 날카로운 X자 섬광 + 고리 + 불티
        const g = host.scene.add.graphics().setDepth(7).setBlendMode('ADD');
        g.lineStyle(2, 0xffffff, 1).lineBetween(at.x - 9, at.y - 9, at.x + 9, at.y + 9).lineBetween(at.x - 9, at.y + 9, at.x + 9, at.y - 9);
        g.lineStyle(4, 0xb266ff, 0.5).lineBetween(at.x - 12, at.y - 12, at.x + 12, at.y + 12).lineBetween(at.x - 12, at.y + 12, at.x + 12, at.y - 12);
        host.scene.tweens.add({ targets: g, alpha: 0, scale: 1.4, duration: 180, onComplete: () => g.destroy() });
        playFx(host.scene, s.def.sprites.spark!, at.x, at.y, { w: s.def.sprites.spark!.size }).setBlendMode('ADD');
        sparks(host.scene, at.x, at.y, s.def.color, host.ctx.data.juice.projectileLook, 1);
        if (im && refunded < im.values.refundCap!) {
          const sec = Math.min(im.values.pierceRefund!, im.values.refundCap! - refunded);
          refunded += sec;
          host.refundCooldown('magiBolt', sec / s.def.awakening!.cooldownSec);
        }
      },
    }),
  );
}

// ---------- 마기 분출 ----------

export const magiBurst: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    if (s.owned.awakened) return gateBurst(host, s);
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

/**
 * 마기의 문(마기 분출 각성): 등 뒤 부채꼴로 마기 포탈이 차례로 열리고, 포탈마다 가까운 적(없으면 조준 방향)으로
 * 얇은 광선을 shotsPerPortal번 쏜다. 관통 전개 각인 확장이면 포탈 + extraPortals
 */
function gateBurst(host: SkillHost, s: SkillCast): boolean {
  const v = s.values;
  const im = host.imprintOf?.('magiBurst');
  const n = v.portals! + (im ? im.values.extraPortals! : 0);
  const aim = host.aimDir();
  const back = Math.atan2(-aim.y, -aim.x);
  const arc = (v.portalArcDeg! * Math.PI) / 180;
  const ref = s.def.sprites.portal!;
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) - 0.5 : 0;
    const a = back + t * arc;
    const appear = (i % 2 ? n - i : i) * 0.04;
    host.scene.time.delayedCall(appear * 1000, () => {
      // 포탈은 플레이어를 따라다닌다 (등 뒤 같은 자리)
      const spot = () => {
        const p = host.playerPos();
        return { x: p.x + Math.cos(a) * v.portalBack!, y: p.y + Math.sin(a) * v.portalBack! * 0.7 - v.portalLift! };
      };
      const at0 = spot();
      const portal = host.sprite(at0.x, at0.y, ref).setDepth(6).setBlendMode('ADD').setScale(0);
      const full = ref.size / Math.max(1, portal.width);
      host.scene.tweens.add({ targets: portal, scale: full, duration: v.portalAppearSec! * 1000, ease: 'Back.easeOut' });
      const follow = () => {
        if (!portal.active) return;
        const at = spot();
        portal.setPosition(at.x, at.y).setRotation(portal.rotation + 0.08);
      };
      host.scene.events.on('update', follow);
      for (let k = 0; k < v.shotsPerPortal!; k++) {
        host.scene.time.delayedCall((v.portalAppearSec! + k * v.shotGapSec! + i * 0.03) * 1000, () => portalShot(host, s, spot()));
      }
      const close = (v.portalAppearSec! + v.shotsPerPortal! * v.shotGapSec! + 0.25) * 1000;
      host.scene.time.delayedCall(close, () => {
        host.scene.tweens.add({ targets: portal, scale: 0, alpha: 0, duration: 180, onComplete: () => {
          host.scene.events.off('update', follow);
          portal.destroy();
        } });
      });
    });
  }
  return true;
}

/** 포탈 하나에서 얇은 광선 한 줄: 가까운 적(없으면 조준 방향) 쪽으로 꿰뚫는다 */
function portalShot(host: SkillHost, s: SkillCast, from: Vec2): void {
  const v = s.values;
  const target = nearestEnemy(host, from, v.beamLength!);
  const aim = host.aimDir();
  const a = target ? Math.atan2(target.sprite.y - from.y, target.sprite.x - from.x) + host.rng.range(-0.04, 0.04) : Math.atan2(aim.y, aim.x) + host.rng.range(-0.12, 0.12);
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const len = rayLength(host, from, dir, v.beamLength!);
  const enemies = [...host.enemies()];
  for (const i of lineHits(from, dir, len, v.beamWidth! / 2 + 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })))) host.hit(enemies[i]!, v.beamDamage!, s.def.sources.beam!);
  const end = { x: from.x + dir.x * len, y: from.y + dir.y * len };
  stretchFx(host.scene, s.def.sprites.beam!, from, end, v.beamWidth! * 2.2, 0.16);
  sparks(host.scene, end.x, end.y, s.def.color, host.ctx.data.juice.projectileLook, 0.35);
}

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
      if (s.owned.awakened) wallSlam(host, s, e, { x: dx / n, y: dy / n });
    }
    // 각성(충격 연쇄): 파동이 닿은 적 탄을 지운다 (보스 레이저·장판은 탄이 아니라 그대로)
    if (s.owned.awakened) host.enemyBulletsAt({ x: p.x + d.x * r * 0.5, y: p.y + d.y * r * 0.5 }, r * 0.6);
    playFx(host.scene, s.def.sprites.wave!, p.x + d.x * r * 0.35, p.y + d.y * r * 0.35, { w: r * 1.5 * fxScale(host, s.owned.level), rotation: a });
    if (s.owned.level >= host.ctx.data.juice.projectileLook.ringFromLevel) impactFx(host, s.owned.level, p.x + d.x * r * 0.5, p.y + d.y * r * 0.5, s.def.color, r * 0.6);
    return true;
  },
};

/** 밀려난 적이 밀리는 끝에서 벽·장애물에 막히면 피해 + 짧은 기절(보스는 피해만) */
function wallSlam(host: SkillHost, s: SkillCast, e: Enemy, dir: Vec2): void {
  const v = s.values;
  host.scene.time.delayedCall(v.knockSec! * 900, () => {
    if (e.dead) return;
    const ahead = { x: e.sprite.x + dir.x * (e.radius + 4), y: e.sprite.y + dir.y * (e.radius + 4) };
    if (!host.blocked(ahead.x, ahead.y)) return;
    playFx(host.scene, s.def.sprites.wallHit!, e.sprite.x, e.sprite.y, { w: e.radius * 4 }).setBlendMode('ADD');
    if (host.hit(e, v.wallDamage!, s.def.sources.wave!)) return;
    if (e.rank === 'boss' || e.rank === 'hiddenBoss') return;
    e.bind(v.stunSec!);
    const st = playFx(host.scene, s.def.sprites.stun!, e.sprite.x, e.sprite.y - e.radius - 4, { w: Math.max(s.def.sprites.stun!.size, e.radius * 2.2) });
    host.scene.time.delayedCall(v.stunSec! * 1000, () => st.destroy());
  });
}

// ---------- 마기 응축구 ----------

class Condenser implements SkillObject {
  readonly owner = 'magiCondenser';
  readonly createdAt: number;
  private look: ProjectileLook;
  private life: number;
  private pullIn = 0;
  /** 각성(붕괴 응축): 서로 도는 두 번째 구체, 둘을 잇는 번개, 끌어당긴 적 */
  private readonly twin: ProjectileLook | null = null;
  private readonly link: Phaser.GameObjects.Graphics | null = null;
  private readonly pulled = new Set<Enemy>();
  private spin = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private at: Vec2,
    private readonly dir: Vec2,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    this.look = new ProjectileLook(host.scene, at.x, at.y, s.def.sprites.orb!, host.ctx.data.juice.projectileLook, { glow: s.def.sprites.orbGlow, spin: true, trail: false, scale: fxScale(host, s.owned.level) });
    if (s.owned.awakened) {
      // 각성(붕괴 응축): 어두운 구체·밝은 구체 둘이 서로 돈다
      this.look.destroy();
      this.look = new ProjectileLook(host.scene, at.x, at.y, s.def.sprites.orbDark!, host.ctx.data.juice.projectileLook, { spin: true, trail: true, scale: fxScale(host, s.owned.level) });
      this.twin = new ProjectileLook(host.scene, at.x, at.y, s.def.sprites.orbBright!, host.ctx.data.juice.projectileLook, { spin: true, trail: true, scale: fxScale(host, s.owned.level) });
      this.link = host.scene.add.graphics().setDepth(5).setBlendMode('ADD');
    }
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.life -= dt;
    const next = { x: this.at.x + this.dir.x * v.speed! * dt, y: this.at.y + this.dir.y * v.speed! * dt };
    if (!host.blocked(next.x, next.y)) this.at = next;
    // 터질 때가 다가올수록 부푼다
    const grow = 1 + 0.4 * (1 - Math.max(0, this.life) / v.lifeSec!);
    if (this.twin) {
      // 둘이 서로 돌다 끝으로 갈수록 붙는다
      this.spin += dt * v.orbitSpin!;
      const rr = v.orbitRadius! * Math.max(0, this.life) / v.lifeSec!;
      const o = { x: Math.cos(this.spin) * rr, y: Math.sin(this.spin) * rr * 0.6 };
      this.look.place(this.at.x + o.x, this.at.y + o.y, dt, grow);
      this.twin.place(this.at.x - o.x, this.at.y - o.y, dt, grow);
      // 둘 사이를 잇는 마기 번개 (가까워질수록 밝게)
      const g = this.link!.clear();
      const k = 1 - rr / Math.max(1, v.orbitRadius!);
      const mid = { x: this.at.x + host.rng.range(-3, 3), y: this.at.y + host.rng.range(-3, 3) };
      g.lineStyle(2 + k * 2, 0xb266ff, 0.4 + 0.5 * k).beginPath().moveTo(this.at.x + o.x, this.at.y + o.y).lineTo(mid.x, mid.y).lineTo(this.at.x - o.x, this.at.y - o.y).strokePath();
      g.lineStyle(1, 0xffffff, 0.6 + 0.4 * k).lineBetween(this.at.x + o.x, this.at.y + o.y, this.at.x - o.x, this.at.y - o.y);
    } else this.look.place(this.at.x, this.at.y, dt, grow);
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
        this.pulled.add(e);
      }
    }
    if (this.life > 0) return true;
    this.explode(host);
    return false;
  }

  private explode(host: SkillHost): void {
    const v = this.s.values;
    // 각성: 끌어당긴 적이 많을수록 범위·피해 + (상한)
    const k = this.twin ? cappedGrowth(this.pulled.size, v.perPulled!, v.pulledCap!) : 1;
    const r = host.area(v.radius!) * k;
    if (this.twin) {
      // 하나로 합쳐지며 안으로 무너졌다가 터진다
      playFx(host.scene, this.s.def.sprites.implosion!, this.at.x, this.at.y, { w: r * 2.8 }).setBlendMode('ADD');
      host.scene.cameras.main.flash(90, 200, 150, 255);
      shake(host.scene, 'heavy');
      host.hitStop?.(0.06);
    }
    bus.emit('sfx', { id: 'explosion', size: r });
    host.blastProps(this.at, r, v.damage!);
    for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) <= r + e.radius) host.hit(e, v.damage! * k, this.s.def.sources.blast!);
    playFx(host.scene, this.s.def.sprites.blast!, this.at.x, this.at.y, { w: r * 2.4 * fxScale(host, this.s.owned.level) });
    impactFx(host, this.s.owned.level, this.at.x, this.at.y, this.s.def.color, r * 1.2, 2);
    shake(host.scene, 'light');
  }

  destroy(): void {
    this.look.destroy();
    this.twin?.destroy();
    this.link?.destroy();
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
      if (s.owned.awakened) chainPillars(host, s, at);
    });
    return true;
  },
};

/** 연쇄 분출: 사방 네 곳에서 차례로 작은 기둥(공간격 그대로) + 자리마다 마기 장판(공간격 없음) */
function chainPillars(host: SkillHost, s: SkillCast, at: Vec2): void {
  const v = s.values;
  const cr = host.area(v.chainRadius!);
  [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy], i) => {
    host.scene.time.delayedCall((i + 1) * v.chainGapSec! * 1000, () => {
      const p = { x: at.x + dx! * v.chainDist!, y: at.y + dy! * v.chainDist! * 0.7 };
      if (host.blocked(p.x, p.y)) return;
      playFx(host.scene, s.def.sprites.pillar!, p.x, p.y + cr * 0.3, { w: cr * 2.4 }).setOrigin(0.5, 1);
      for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) <= cr + e.radius) host.hit(e, v.chainDamage!, s.def.sources.pillar!);
      addFireZone(host, v.maxZones!, (h) => new FireZone(h, s.def.sprites.zone!, p, { sec: v.zoneSec!, tickSec: v.zoneTickSec!, damage: v.zoneDamage!, burnStacks: 0, tags: ['magic', 'ranged'], radius: cr }));
    });
  });
}

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
    // 각성(정령 강림): 상위 정령
    const ref = (v.extraShots ? def.sprites[`${el}2`] : undefined) ?? def.sprites[el]!;
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
    for (let i = 0; i < this.v.shots! + (this.v.extraShots ?? 0); i++) {
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
    const tags = this.def.sources.spirit!;
    const from = { ...this.at };
    // 각성(정령 강림): 치명타면 피해 ×(치명 배율 + 보너스), 원소 효과가 세진다
    const crit = !!this.v.critChance && host.rng.chance(this.v.critChance);
    const v = crit ? { ...this.v, spiritDamage: this.v.spiritDamage! * (host.ctx.data.weapons.critMultiplier + (this.v.critBonus ?? 0)), burnStacks: this.v.burnStacks! + 1, slow: Math.min(0.8, this.v.slow! * 1.5), radius: this.v.radius! * 1.5 } : this.v;
    if (crit) playFx(host.scene, s.crit!, target.sprite.x, target.sprite.y, { w: s.crit!.size }).setBlendMode('ADD');
    // 공격하며 몸을 부풀린다
    host.scene.tweens.add({ targets: this.img, scale: this.scale * 1.25, duration: 90, yoyo: true });
    if (this.el === 'lightning') {
      const b = { x: target.sprite.x, y: target.sprite.y };
      stretchFx(host.scene, s.lightningShot!, from, b, s.lightningShot!.size);
      playFx(host.scene, s.lightningHit!, b.x, b.y, { w: s.lightningHit!.size });
      host.hit(target, v.spiritDamage!, tags);
      // 치명: 번개 연쇄 +1
      if (crit) {
        const next = [...host.enemies()].filter((e) => e !== target).sort((a, c) => Math.hypot(a.sprite.x - b.x, a.sprite.y - b.y) - Math.hypot(c.sprite.x - b.x, c.sprite.y - b.y))[0];
        if (next && Math.hypot(next.sprite.x - b.x, next.sprite.y - b.y) <= v.range! * 0.6) {
          stretchFx(host.scene, s.lightningShot!, b, { x: next.sprite.x, y: next.sprite.y }, s.lightningShot!.size);
          host.hit(next, v.spiritDamage!, tags);
        }
      }
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
    // 각성: 단두대가 떨어져 내리꽂히는 순간 광선이 터진다
    const delay = u.awakened ? v.guillotineSec! : v.chargeSec!;
    if (u.awakened) guillotine(host, u, { x: (p.x + end.x) / 2, y: (p.y + end.y) / 2 }, Math.atan2(dir.y, dir.x), v.length! * 0.6, delay);
    host.scene.time.delayedCall(delay * 1000, () => {
      const enemies = [...host.enemies()];
      const hits = lineHits(p, dir, v.length!, v.width! / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      stretchFx(host.scene, u.def.sprites.beam!, p, end, v.width! * 2, 0.4);
      shake(host.scene, 'heavy');
      const executed: Vec2[] = [];
      const bosses: Enemy[] = [];
      for (const i of hits) {
        const e = enemies[i]!;
        if (e.rank === 'boss' || e.rank === 'hiddenBoss') bosses.push(e);
        if (host.hit(e, v.damage!, u.def.sources.beam!) || e.dead) continue;
        if (!executable(e.rank, e.hp, e.maxHp, v.executeRatio!)) continue;
        executed.push({ x: e.sprite.x, y: e.sprite.y });
        executeMark(host.scene, e.sprite.x, e.sprite.y);
        host.hitTrue(e, e.hp / Math.max(0.01, e.takenMul) + 1, false);
      }
      if (u.awakened) purgeChain(host, u, p, end, executed, bosses);
    });
    // 모으는 동안 가는 예고선
    stretchFx(host.scene, u.def.sprites.beam!, p, end, v.width! * 0.4, delay);
    return true;
  },
};

/**
 * 정화 연쇄(정화 집행 각성): 처형한 수만큼 광선이 굵어지고, 처형 자리마다 마기 폭발이 이어져 근처 체력 낮은 적도 처형(한 번에 최대 chainMax).
 * 보스는 처형되지 않고 처형 수마다 광선 피해 × bossPerKill을 더 받는다(상한 bossCapMul).
 */
function purgeChain(host: SkillHost, u: UltimateCast, from: Vec2, end: Vec2, executed: Vec2[], bosses: Enemy[]): void {
  const v = u.values;
  const queue = [...executed];
  let count = executed.length;
  let step = 0;
  const r = host.area(v.chainRadius!) * (executed.length >= v.tier2At! ? v.tier2RadiusMul! : 1);
  const next = () => {
    const at = queue.shift();
    if (!at || count >= v.chainMax! + executed.length) return finish();
    step++;
    playFx(host.scene, u.def.sprites.chain!, at.x, at.y, { w: r * 2.4 }).setBlendMode('ADD');
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
      if (host.hit(e, v.chainDamage!, u.def.sources.beam!) || e.dead) continue;
      if (!executable(e.rank, e.hp, e.maxHp, v.executeRatio!) || count >= v.chainMax! + executed.length) continue;
      count++;
      queue.push({ x: e.sprite.x, y: e.sprite.y });
      executeMark(host.scene, e.sprite.x, e.sprite.y);
      host.hitTrue(e, e.hp / Math.max(0.01, e.takenMul) + 1, false);
    }
    host.scene.time.delayedCall(90, next);
  };
  const finish = () => {
    if (count <= 0) return;
    // 단계 2: 가장 먼 처형 자리에 두 번째 단두대
    if (count >= v.tier2At!) {
      const far = [...executed].sort((a, b) => Math.hypot(b.x - from.x, b.y - from.y) - Math.hypot(a.x - from.x, a.y - from.y))[0] ?? end;
      guillotine(host, u, far, 0, 40, 0.3);
      host.scene.time.delayedCall(300, () => {
        const rr = host.area(v.chainRadius!) * v.tier2RadiusMul!;
        for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - far.x, e.sprite.y - far.y) <= rr + e.radius) host.hit(e, v.tier2Damage!, u.def.sources.beam!);
        floatText(host, far.x, far.y - 24, host.ctx.t('skillMsg.executeTier2'), u.def.color);
      });
    }
    // 단계 3: 정화 완료 — 둘레 전체 파동
    if (count >= v.tier3At!) {
      host.scene.time.delayedCall(520, () => {
        const c = host.playerPos();
        const rr = host.area(v.tier3Radius!);
        playFx(host.scene, u.def.sprites.wave!, c.x, c.y, { w: rr * 2.2 }).setBlendMode('ADD');
        host.scene.cameras.main.flash(260, 230, 200, 255);
        shake(host.scene, 'heavy');
        for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= rr + e.radius) host.hit(e, v.tier3Damage!, u.def.sources.beam!);
        floatText(host, c.x, c.y - 30, host.ctx.t('skillMsg.executeTier3'), '#ffffff');
      });
    }
    // 처형 수만큼 굵어진 광선이 한 번 더 번쩍인다
    stretchFx(host.scene, u.def.sprites.beam!, from, end, v.width! * 2 + Math.min(v.widthCap!, count * v.widthPerKill!), 0.3);
    const mul = Math.min(v.bossCapMul!, count * v.bossPerKill!);
    for (const b of bosses) if (!b.dead) host.hit(b, v.damage! * mul, u.def.sources.beam!);
    floatText(host, from.x, from.y - 20, host.ctx.t('skillMsg.executeChain', { n: count }), u.def.color);
    shake(host.scene, 'heavy');
    void step;
  };
  next();
}

/**
 * 단두대: 칼날이 위에서 at 위로 떨어져(dropSec) 내리꽂힌다. 칼날은 angle(광선 방향)에 맞춰 눕히고, 떨어지면 번쩍·흔들림·멈칫 후 흩어진다
 */
function guillotine(host: SkillHost, u: UltimateCast, at: Vec2, angle: number, width: number, dropSec: number): void {
  const ref = u.def.sprites.guillotine!;
  // 칼날이 뒤집히지 않게 방향을 −90°~90°로
  let a = angle;
  if (a > Math.PI / 2) a -= Math.PI;
  if (a < -Math.PI / 2) a += Math.PI;
  const blade = host.sprite(at.x, at.y - 150, ref).setDepth(8).setOrigin(0.5, 1).setRotation(a).setAlpha(0.2);
  const w = Math.max(ref.size, width);
  blade.setDisplaySize(w, (w * blade.height) / Math.max(1, blade.width));
  // 떨어질 자리에 그림자 선
  const shadow = host.scene.add.graphics().setDepth(2.6);
  shadow.fillStyle(0x000000, 0.35).fillEllipse(at.x, at.y, w, 8);
  host.scene.tweens.add({ targets: blade, y: at.y + 6, alpha: 1, duration: dropSec * 1000, ease: 'Cubic.easeIn', onComplete: () => {
    shadow.destroy();
    host.scene.cameras.main.flash(120, 255, 255, 255);
    shake(host.scene, 'heavy');
    host.hitStop?.(0.08);
    sparks(host.scene, at.x, at.y, u.def.color, host.ctx.data.juice.projectileLook, 2.5);
    sparks(host.scene, at.x, at.y, '#ffffff', host.ctx.data.juice.projectileLook, 1.5);
    host.scene.tweens.add({ targets: blade, alpha: 0, y: at.y + 14, duration: 420, delay: 160, onComplete: () => blade.destroy() });
  } });
}

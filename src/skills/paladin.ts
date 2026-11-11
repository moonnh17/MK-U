/**
 * 성기사 (전사 전직): 성스러운 방벽·응징의 서약·성역 오라·강타·성검, 패시브 회생의 기도, 궁극기 심판의 강림.
 * 원본의 자동 발동(서약·오라)은 버튼을 누르면 정해진 시간 동안 켜지는 버프로 바꿨다.
 * 각성: 날개방벽·업보청산·신성한 빛·처형·천마 강림·관리자의 응답, 궁극기 사르비스의 기억.
 */
import type Phaser from 'phaser';
import type { Enemy } from '../entities/enemy';
import { executeMark } from '../entities/statusLook';
import { chainTargets, lineHits } from '../systems/targeting';
import { absorbInto, auraReduction } from '../systems/warrior';
import type { PlayerMods } from '../systems/vitals';
import type { SpriteRef } from '../types/data';
import { levelRef, loopArt, playFx, stretchFx } from './skillFx';
import { clearOwner, enemiesWithin, Timed } from './timed';
import { nearestEnemy, type BuffView, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateCast, type UltimateImpl } from './host';

const isBoss = (e: Enemy) => e.rank === 'boss' || e.rank === 'hiddenBoss';

/** 각성 그림 (각성 전이거나 없으면 레벨 그림) */
const artOf = (s: SkillCast, name: string): SpriteRef => (s.owned.awakened ? s.def.sprites[`${name}A`] : undefined) ?? levelRef(s, name);

/** 흩어지며 사라지는 작은 빛 조각 (깃털·불티·빗줄기) */
function mote(host: SkillHost, x: number, y: number, color: number, w: number, h: number, dx: number, dy: number, sec: number): void {
  const r = host.scene.add.rectangle(x, y, w, h, color).setDepth(6);
  host.scene.tweens.add({ targets: r, x: x + dx, y: y + dy, alpha: 0, duration: sec * 1000, onComplete: () => r.destroy() });
}

// ---------- 성스러운 방벽 / 날개방벽 ----------

const BULWARK = 'holyBulwark';

/** 적 사이를 튕기다 돌아오는 방패. 날개방벽은 방금 맞힌 적만 빼고 다시 겨누고, 돌아와 몸 둘레를 한 바퀴 휩쓴다 */
class Shield implements SkillObject {
  readonly owner = BULWARK;
  readonly createdAt: number;
  private readonly sp: Phaser.GameObjects.Sprite;
  private target: Enemy | null;
  private bounces: number;
  private returning = false;
  private age = 0;
  private readonly hitSet = new Set<Enemy>();
  private last: Enemy | null = null;
  /** 휩쓸기 진행 시간(초). 음수면 아직 */
  private sweepT = -1;
  private sweepFrom = 0;
  private readonly sweepHit = new Set<Enemy>();
  private moteIn = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    first: Enemy,
  ) {
    this.createdAt = host.scene.time.now;
    const p = host.playerPos();
    const ref = artOf(s, 'shield');
    const size = s.owned.awakened ? 22 : 16;
    this.sp = host.sprite(p.x, p.y, ref).setDepth(6).setDisplaySize(size, size);
    loopArt(this.sp, ref);
    this.target = first;
    this.bounces = s.values.bounces!;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    const awakened = this.s.owned.awakened;
    this.age += dt;
    if (awakened) this.feathers(dt, host);
    if (this.sweepT >= 0) return this.sweep(dt, host);
    const to = this.returning || !this.target || this.target.dead ? host.playerPos() : { x: this.target.sprite.x, y: this.target.sprite.y };
    if (!this.returning && (!this.target || this.target.dead)) this.returning = true;
    const dx = to.x - this.sp.x;
    const dy = to.y - this.sp.y;
    const d = Math.hypot(dx, dy);
    const step = v.speed! * dt;
    if (d > step) {
      this.sp.setPosition(this.sp.x + (dx / d) * step, this.sp.y + (dy / d) * step);
      return this.age < v.maxSec!;
    }
    this.sp.setPosition(to.x, to.y);
    if (this.returning) {
      if (!awakened) return false;
      // 날개방벽: 손에 잡히기 전 조준 방향에서부터 몸 둘레를 한 바퀴 휩쓴다
      const aim = host.aimDir();
      this.sweepFrom = Math.atan2(aim.y, aim.x);
      this.sweepT = 0;
      return true;
    }
    const e = this.target!;
    host.hit(e, v.damage!, this.s.def.sources.shield!);
    playFx(host.scene, artOf(this.s, 'shield'), e.sprite.x, e.sprite.y, { w: awakened ? 26 : 20 });
    this.hitSet.add(e);
    this.last = e;
    this.bounces--;
    // 날개방벽은 적이 적어도 끝까지 튕긴다 (방금 맞힌 적만 뺀다)
    const list = host.enemies().filter((x) => (awakened ? x !== this.last : !this.hitSet.has(x)));
    const next = this.bounces > 0 ? chainTargets(to, list.map((x) => ({ x: x.sprite.x, y: x.sprite.y, radius: x.radius })), 1, host.area(v.range!), new Set())[0] : undefined;
    this.target = next === undefined ? null : list[next]!;
    if (!this.target) this.returning = true;
    return this.age < v.maxSec!;
  }

  /** 반경 sweepRadius로 한 바퀴 돌며 닿은 적을 한 번씩 벤다 */
  private sweep(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.sweepT += dt;
    const k = Math.min(1, this.sweepT / v.sweepSec!);
    const p = host.playerPos();
    const r = host.area(v.sweepRadius!);
    const a = this.sweepFrom + k * Math.PI * 2;
    this.sp.setPosition(p.x + Math.cos(a) * r, p.y + Math.sin(a) * r);
    for (const e of host.enemies()) {
      if (this.sweepHit.has(e) || Math.hypot(e.sprite.x - this.sp.x, e.sprite.y - this.sp.y) > e.radius + 10) continue;
      this.sweepHit.add(e);
      host.hit(e, v.sweepDamage!, this.s.def.sources.shield!);
    }
    return k < 1;
  }

  /** 지나간 자리에 흰 깃털 조각이 흩날린다 */
  private feathers(dt: number, host: SkillHost): void {
    this.moteIn -= dt;
    if (this.moteIn > 0) return;
    this.moteIn = 0.025;
    const rng = host.rng;
    mote(host, this.sp.x + rng.range(-4, 4), this.sp.y + rng.range(-4, 4), rng.chance(0.3) ? 0xd8e8ff : 0xffffff, rng.chance(0.5) ? 2 : 1, 1, rng.range(-6, 6), rng.range(2, 8), rng.range(0.25, 0.45));
  }

  destroy(): void {
    this.sp.destroy();
  }
}

export const holyBulwark: SkillImpl = {
  cast(host, s) {
    if (host.objects().some((o) => o.owner === BULWARK)) return false;
    const first = nearestEnemy(host, host.playerPos(), host.area(s.values.range!));
    if (!first) return false;
    host.addObject(new Shield(host, s, first));
    return true;
  },
  // 방패가 손에 있는 동안(던지지 않았을 때) 받는 피해 감소
  heldMods(host, s) {
    return host.objects().some((o) => o.owner === BULWARK) ? null : { damageReduction: s.values.guard! };
  },
};

// ---------- 응징의 서약 / 업보청산 ----------

/** 서약 고리가 밝아지는 주기, 불티 간격 */
const OATH_PULSE_HZ = 0.8;
const OATH_EMBER_SEC = 0.09;
const OATH_EMBER = 0xf0d860;

class Oath extends Timed {
  private lastCounter = -Infinity;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    super(s.def.id, host, host.buffDuration(s.values.durationSec!, s.def.tags), { key: 'buff.oathOfRetribution', color: s.def.color });
    this.attach(host, levelRef(s, 'oath'), 18, 0.6);
  }

  /** 서약 중임이 보이게: 고리가 숨 쉬듯 밝아졌다 어두워지고, 몸에서 금빛 불티가 피어오른다 */
  private glowT = 0;
  private emberIn = 0;
  protected override tick(dt: number, host: SkillHost): void {
    this.glowT += dt;
    this.follow?.setAlpha(0.45 + 0.35 * Math.sin(this.glowT * OATH_PULSE_HZ * Math.PI * 2) ** 2);
    this.emberIn -= dt;
    if (this.emberIn > 0) return;
    this.emberIn = OATH_EMBER_SEC;
    const p = host.playerPos();
    const ox = host.rng.range(-8, 8);
    mote(host, p.x + ox, p.y + 6, host.rng.chance(0.3) ? 0xffffff : OATH_EMBER, 1, 2, ox * 0.2, -14, 0.6);
  }

  playerMods(): Partial<PlayerMods> {
    return { damageReduction: this.s.values.damageReduction! };
  }

  onPlayerHurt(host: SkillHost): boolean {
    const v = this.s.values;
    const awakened = this.s.owned.awakened;
    const now = host.scene.time.now / 1000;
    if (now - this.lastCounter < v.counterGapSec!) return true;
    this.lastCounter = now;
    const at = host.playerPos();
    const r = host.area(v.counterRadius!);
    playFx(host.scene, artOf(this.s, 'oath'), at.x, at.y, { w: r * 2.2, depth: 5 });
    for (const e of enemiesWithin(host, at, r)) {
      host.hit(e, v.counterDamage!, this.s.def.sources.counter!);
      // 업보청산: 되갚은 적을 밀쳐낸다
      if (awakened && !e.dead) {
        const dx = e.sprite.x - at.x;
        const dy = e.sprite.y - at.y;
        const d = Math.hypot(dx, dy) || 1;
        e.knockback({ x: dx / d, y: dy / d }, v.knockbackPx!, 0.16);
      }
    }
    if (awakened) host.hitStop?.(0.05);
    return true;
  }
}

export const oathOfRetribution: SkillImpl = {
  cast(host, s) {
    clearOwner(host, s.def.id);
    host.addObject(new Oath(host, s));
    return true;
  },
};

// ---------- 성역 오라 / 신성한 빛 ----------

/** 신성한 빛(각성 오라) 그림에서 바닥 고리 가운데의 높이 (프레임 높이 비율) */
const AURA_A_RING_Y = 0.71;

class Aura extends Timed {
  private next = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly me: SkillHost,
  ) {
    super(s.def.id, host, host.buffDuration(s.values.durationSec!, s.def.tags), { key: 'buff.sanctuaryAura', color: s.def.color });
    if (s.owned.awakened) {
      // 신성한 빛 그림은 비스듬히 본 바닥 고리라 고리 가운데가 그림 가운데보다 아래: 그 자리를 발밑에 맞춘다
      this.attach(host, artOf(s, 'aura'), host.area(s.values.radius!), 0.6, 'floor');
      this.follow?.setOrigin(0.5, AURA_A_RING_Y);
    } else this.attach(host, artOf(s, 'aura'), host.area(s.values.radius!), 0.45);
  }

  protected override tick(dt: number, host: SkillHost): void {
    this.next -= dt;
    if (this.next > 0) return;
    const v = this.s.values;
    this.next += v.intervalSec!;
    for (const e of enemiesWithin(host, host.playerPos(), host.area(v.radius!))) {
      host.hit(e, v.damage!, this.s.def.sources.pulse!);
      // 신성한 빛: 오라 안의 적이 타오른다
      if (this.s.owned.awakened && !e.dead) host.burn(e, v.burnStacks!);
    }
  }

  playerMods(): Partial<PlayerMods> {
    return { damageReduction: auraReduction(this.me.hpRatio(), this.s.values.lowHpReduction!) };
  }
}

export const sanctuaryAura: SkillImpl = {
  cast(host, s) {
    clearOwner(host, s.def.id);
    host.addObject(new Aura(host, s, host));
    return true;
  },
};

// ---------- 강타 / 처형 ----------

/** 처형 참격: 불꽃 초승달이 조준 방향으로 날아간다 */
function executionWave(host: SkillHost, s: SkillCast, origin: { x: number; y: number }, dir: { x: number; y: number }, angle: number): void {
  const v = s.values;
  const sp = playFx(host.scene, s.def.sprites.smiteA!, origin.x, origin.y, { w: v.waveSize!, rotation: angle });
  host.scene.tweens.add({ targets: sp, x: origin.x + dir.x * v.length!, y: origin.y + dir.y * v.length!, duration: 220, ease: 'Quad.easeOut' });
  host.scene.cameras.main.shake(70, 0.004);
}

export const smite: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const awakened = s.owned.awakened;
    const origin = host.playerPos();
    const target = nearestEnemy(host, origin, v.length!);
    const aim = host.aimDir();
    const a = target ? Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x) : Math.atan2(aim.y, aim.x);
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    const enemies = [...host.enemies()];
    const hits = lineHits(origin, dir, v.length!, v.halfWidth!, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
    if (awakened) executionWave(host, s, origin, dir, a);
    else stretchFx(host.scene, levelRef(s, 'smite'), origin, { x: origin.x + dir.x * v.length!, y: origin.y + dir.y * v.length! }, v.halfWidth! * 4, 0.3);
    for (const i of hits) {
      const e = enemies[i]!;
      const killed = host.hit(e, v.damage! * (isBoss(e) ? 1 + v.bossBonus! : 1), s.def.sources.smite!);
      // 처형: 체력이 낮게 남은 일반 적(엘리트·보스 제외)은 바로 쓰러뜨린다
      if (awakened && !killed && !e.dead && e.rank === 'normal' && e.hp <= e.maxHp * v.executePct!) {
        executeMark(host.scene, e.sprite.x, e.sprite.y);
        host.hitTrue(e, e.hp / Math.max(0.01, e.takenMul) + 1, false);
      }
    }
    if (awakened) host.hitStop?.(0.06);
    return true;
  },
};

// ---------- 성검 / 천마 강림 ----------

/** 천마 강림: 가장 가까운 적을 향해 천마가 하늘을 가로지르고, 그 궤적을 따라 성검이 줄지어 떨어진다 */
function pegasusRun(host: SkillHost, s: SkillCast): boolean {
  const v = s.values;
  const origin = host.playerPos();
  const target = nearestEnemy(host, origin, host.area(v.range!));
  if (!target) return false;
  const a = Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x);
  const dir = { x: Math.cos(a), y: Math.sin(a) };
  const r = host.area(v.radius!);
  const n = Math.round(v.count!);
  const gap = v.gapPx!;
  const end = { x: origin.x + dir.x * gap * (n + 1), y: origin.y + dir.y * gap * (n + 1) };
  // 천마 그림은 오른쪽을 본다. 왼쪽으로 달리면 뒤집는다
  const peg = playFx(host.scene, s.def.sprites.pegasusA!, origin.x, origin.y - 12, { w: 60, flipX: dir.x < 0, depth: 7 });
  host.scene.tweens.add({ targets: peg, x: end.x, y: end.y - 12, duration: Math.max(n * v.stepSec!, 0.4) * 1000 });
  for (let i = 1; i <= n; i++) {
    const at = { x: origin.x + dir.x * gap * i, y: origin.y + dir.y * gap * i };
    // 예고 없이 천마가 지나간 자리에 바로 꽂힌다
    host.scene.time.delayedCall(i * v.stepSec! * 1000, () => {
      for (let j = 0; j < 3; j++) mote(host, at.x + host.rng.range(-6, 6), at.y - 6, 0xffffff, 2, 1, host.rng.range(-8, 8), host.rng.range(4, 10), 0.4);
      playFx(host.scene, s.def.sprites.swordA!, at.x, at.y - r * 0.5, { w: r * 1.8 });
      for (const x of enemiesWithin(host, at, r)) host.hit(x, v.damage!, s.def.sources.sword!);
    });
  }
  return true;
}

export const holySwords: SkillImpl = {
  cast(host, s) {
    if (s.owned.awakened) return pegasusRun(host, s);
    const v = s.values;
    const origin = host.playerPos();
    const range = host.area(v.range!);
    const r = host.area(v.radius!);
    const targets = host
      .enemies()
      .map((e) => ({ e, d: Math.hypot(e.sprite.x - origin.x, e.sprite.y - origin.y) }))
      .filter((x) => x.d <= range + x.e.radius)
      .sort((a, b) => a.d - b.d)
      .slice(0, Math.round(v.count!));
    if (targets.length === 0) return false;
    // 예고 없이 바로 떨어진다
    for (const { e } of targets) {
      const at = { x: e.sprite.x, y: e.sprite.y };
      playFx(host.scene, levelRef(s, 'sword'), at.x, at.y - r * 0.6, { w: r * 1.6 });
      for (const x of enemiesWithin(host, at, r)) host.hit(x, v.damage!, s.def.sources.sword!);
    }
    return true;
  },
};

// ---------- 회생의 기도 / 관리자의 응답 (패시브) ----------

class Prayer implements SkillObject {
  readonly createdAt: number;
  readonly owner: string;
  private next: number;
  private count = 0;
  private guardLeft = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    this.owner = s.def.id;
    this.createdAt = host.scene.time.now;
    this.next = s.values.everySec!;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.guardLeft = Math.max(0, this.guardLeft - dt);
    this.next -= dt;
    if (this.next > 0) return true;
    this.next += v.everySec!;
    this.count++;
    host.heal(host.maxHp() * v.healPct! + v.healFlat!, false);
    this.prayFx(host);
    if (this.s.owned.awakened) this.redRain(host);
    if (this.count % 3 === 0) this.guardLeft = host.buffDuration(v.guardSec!, this.s.def.tags);
    return true;
  }

  /** 기도 발동: 머리 위 큰 기도 그림, 발밑에서 퍼지는 금빛 고리 둘, 위로 솟는 빛 기둥 알갱이 */
  private prayFx(host: SkillHost): void {
    const p = host.playerPos();
    const big = this.s.owned.awakened;
    const gold = big ? 0xff8a7a : 0xffe27a;
    playFx(host.scene, artOf(this.s, 'prayer'), p.x, p.y - 12, { w: big ? 68 : 54, depth: 6 });
    for (const [delay, to] of [[0, 30], [120, 44]] as const) {
      const ring = host.scene.add.ellipse(p.x, p.y + 5, 8, 5).setStrokeStyle(2, gold, 0.95).setDepth(2.5);
      host.scene.tweens.add({ targets: ring, displayWidth: to * 2, displayHeight: to * 1.24, alpha: 0, delay, duration: 520, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
    }
    const pool = host.scene.add.ellipse(p.x, p.y + 5, 40, 24, gold, 0.25).setDepth(2.4);
    host.scene.tweens.add({ targets: pool, alpha: 0, duration: 600, onComplete: () => pool.destroy() });
    for (let i = 0; i < 18; i++) mote(host, p.x + host.rng.range(-12, 12), p.y + host.rng.range(-2, 6), host.rng.chance(0.4) ? 0xffffff : gold, 1, 3, host.rng.range(-3, 3), -host.rng.range(22, 40), host.rng.range(0.45, 0.8));
  }

  /** 관리자의 응답: 둘레에 붉은 비가 rainTicks번 내리며 적에게 피해 */
  private redRain(host: SkillHost): void {
    const v = this.s.values;
    for (let i = 0; i < v.rainTicks!; i++) {
      host.scene.time.delayedCall(i * v.rainTickSec! * 1000, () => {
        const p = host.playerPos();
        const r = host.area(v.rainRadius!);
        for (let j = 0; j < 40; j++) {
          const a = host.rng.range(0, Math.PI * 2);
          const d = Math.sqrt(host.rng.next()) * r;
          const x = p.x + Math.cos(a) * d;
          const y = p.y + Math.sin(a) * d * 0.7;
          mote(host, x, y - 46, host.rng.chance(0.3) ? 0xff6a5a : 0xc8141e, 2, 9, 0, 44, 0.24);
          // 땅에 닿으면 붉은 물방울이 튄다
          if (j % 3 === 0) host.scene.time.delayedCall(230, () => mote(host, x, y, 0xff4a4a, 3, 1, host.rng.range(-5, 5), -3, 0.25));
        }
        const pool = host.scene.add.ellipse(p.x, p.y + 4, r * 2, r * 1.3, 0xc8141e, 0.12).setDepth(2.3);
        host.scene.tweens.add({ targets: pool, alpha: 0, duration: v.rainTickSec! * 1000 * 1.5, onComplete: () => pool.destroy() });
        for (const e of enemiesWithin(host, p, r)) host.hit(e, v.rainDamage!, this.s.def.sources.rain!);
      });
    }
  }

  playerMods(): Partial<PlayerMods> {
    return this.guardLeft > 0 ? { damageReduction: this.s.values.guard! } : {};
  }

  buff(host: SkillHost): BuffView {
    const label = host.ctx.t('buff.prayerOfRevival');
    if (this.guardLeft > 0) return { id: this.owner, label, color: this.s.def.color, leftSec: this.guardLeft };
    return { id: this.owner, label, color: this.s.def.color, cdSec: this.next, cdTotalSec: this.s.values.everySec! };
  }

  destroy(): void {}
}

export const prayerOfRevival: PassiveImpl = {
  activate(host, s) {
    host.addObject(new Prayer(host, s));
  },
};

// ---------- 심판의 강림 / 사르비스의 기억 (궁극기) ----------

class JudgmentShield extends Timed {
  private shield: number;

  constructor(host: SkillHost, amount: number, sec: number, color: string, ref: Parameters<Timed['attach']>[1]) {
    super('divineJudgment', host, sec, { key: 'buff.divineJudgment', color });
    this.shield = amount;
    // 피해를 막아 주는 동안 문양을 머리 뒤 후광으로
    this.attach(host, ref, 10, 0.85, 'halo');
  }

  absorb(amount: number): number {
    const r = absorbInto(this.shield, amount);
    this.shield = r.shield;
    if (this.shield <= 0) this.left = 0;
    return r.left;
  }

  override buff(host: SkillHost): BuffView {
    return { ...super.buff(host)!, count: Math.ceil(this.shield) };
  }
}

/** 사르비스의 기억: 보호막 대신 피해 증가·스킬 쿨타임 가속 */
class SarvisBuff extends Timed {
  constructor(
    host: SkillHost,
    sec: number,
    color: string,
    ref: SpriteRef,
    private readonly mods: Partial<PlayerMods>,
  ) {
    super('divineJudgment', host, sec, { key: 'buff.sarvisMemory', color });
    this.attach(host, ref, 16, 0.6);
  }

  playerMods(): Partial<PlayerMods> {
    return this.mods;
  }
}

/** 메두사의 머리가 떨어져 둘레 적을 석화시킨다 (보스는 잠깐 멈춤) */
function medusaFall(host: SkillHost, def: UltimateCast['def'], v: Record<string, number>): boolean {
  host.addObject(new SarvisBuff(host, host.buffDuration(v.buffSec!, def.tags), def.color, def.sprites.buffA!, { damage: v.buffDamage!, cooldownRate: v.buffCooldownRate! }));
  const origin = host.playerPos();
  const target = nearestEnemy(host, origin, 400);
  const at = target ? { x: target.sprite.x, y: target.sprite.y } : origin;
  const r = host.area(v.radius!);
  const head = playFx(host.scene, def.sprites.medusaA!, at.x, at.y - r * 0.9, { w: r * 0.9, depth: 7 });
  host.scene.tweens.add({ targets: head, y: at.y - r * 0.25, duration: v.impactDelaySec! * 1000, ease: 'Quad.easeIn' });
  host.scene.time.delayedCall(v.impactDelaySec! * 1000, () => {
    playFx(host.scene, def.sprites.impactA!, at.x, at.y, { w: r * 2.2 });
    host.hitStop?.(0.1);
    host.scene.cameras.main.flash(120, 200, 200, 190);
    for (const e of enemiesWithin(host, at, r)) {
      host.hit(e, v.damage!, def.sources.judgment!);
      if (!e.dead && isBoss(e)) host.hitTrue(e, e.maxHp * v.bossMaxHpPct!, false);
      if (!e.dead) e.petrify(isBoss(e) ? v.bossPetrifySec! : v.petrifySec!);
    }
  });
  return true;
}

export const divineJudgment: UltimateImpl = {
  cast(host, { def, values: v, awakened }) {
    clearOwner(host, def.id);
    if (awakened) return medusaFall(host, def, v);
    host.addObject(new JudgmentShield(host, host.maxHp() * v.shieldPct!, v.shieldSec!, def.color, def.sprites.shield!));
    const origin = host.playerPos();
    const target = nearestEnemy(host, origin, 400);
    const at = target ? { x: target.sprite.x, y: target.sprite.y } : origin;
    const r = host.area(v.radius!);
    playFx(host.scene, def.sprites.sword!, at.x, at.y - r * 0.5, { w: r, fadeSec: v.impactDelaySec!, grow: 1 });
    host.scene.time.delayedCall(v.impactDelaySec! * 1000, () => {
      playFx(host.scene, def.sprites.impact!, at.x, at.y, { w: r * 2.2 });
      host.hitStop?.(0.08);
      for (const e of enemiesWithin(host, at, r)) {
        host.hit(e, v.damage!, def.sources.judgment!);
        if (isBoss(e) && !e.dead) host.hitTrue(e, e.maxHp * v.bossMaxHpPct!, false);
      }
    });
    return true;
  },
};

/**
 * 성기사 (전사 전직): 성스러운 방벽·응징의 서약·성역 오라·강타·성검, 패시브 회생의 기도, 궁극기 심판의 강림.
 * 원본의 자동 발동(서약·오라)은 버튼을 누르면 정해진 시간 동안 켜지는 버프로 바꿨다.
 */
import type Phaser from 'phaser';
import type { Enemy } from '../entities/enemy';
import { chainTargets, lineHits } from '../systems/targeting';
import { absorbInto, auraReduction } from '../systems/warrior';
import type { PlayerMods } from '../systems/vitals';
import { levelRef, loopArt, playFx, stretchFx } from './skillFx';
import { clearOwner, enemiesWithin, Timed } from './timed';
import { nearestEnemy, type BuffView, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type SkillObject, type UltimateImpl } from './host';

const isBoss = (e: Enemy) => e.rank === 'boss' || e.rank === 'hiddenBoss';

// ---------- 성스러운 방벽 ----------

const BULWARK = 'holyBulwark';

/** 적 사이를 튕기다 돌아오는 방패 */
class Shield implements SkillObject {
  readonly owner = BULWARK;
  readonly createdAt: number;
  private readonly sp: Phaser.GameObjects.Sprite;
  private target: Enemy | null;
  private bounces: number;
  private returning = false;
  private age = 0;
  private readonly hitSet = new Set<Enemy>();

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    first: Enemy,
  ) {
    this.createdAt = host.scene.time.now;
    const p = host.playerPos();
    this.sp = host.sprite(p.x, p.y, levelRef(s, 'shield')).setDepth(6).setDisplaySize(16, 16);
    loopArt(this.sp, levelRef(s, 'shield'));
    this.target = first;
    this.bounces = s.values.bounces!;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.age += dt;
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
    if (this.returning) return false;
    const e = this.target!;
    host.hit(e, v.damage!, this.s.def.sources.shield!);
    playFx(host.scene, levelRef(this.s, 'shield'), e.sprite.x, e.sprite.y, { w: 20 });
    this.hitSet.add(e);
    this.bounces--;
    const list = host.enemies().filter((x) => !this.hitSet.has(x));
    const next = this.bounces > 0 ? chainTargets(to, list.map((x) => ({ x: x.sprite.x, y: x.sprite.y, radius: x.radius })), 1, host.area(v.range!), new Set())[0] : undefined;
    this.target = next === undefined ? null : list[next]!;
    if (!this.target) this.returning = true;
    return this.age < v.maxSec!;
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

// ---------- 응징의 서약 ----------

class Oath extends Timed {
  private lastCounter = -Infinity;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    super(s.def.id, host, host.buffDuration(s.values.durationSec!, s.def.tags), { key: 'buff.oathOfRetribution', color: s.def.color });
    this.attach(host, levelRef(s, 'oath'), 16, 0.5);
  }

  playerMods(): Partial<PlayerMods> {
    return { damageReduction: this.s.values.damageReduction! };
  }

  onPlayerHurt(host: SkillHost): boolean {
    const v = this.s.values;
    const now = host.scene.time.now / 1000;
    if (now - this.lastCounter < v.counterGapSec!) return true;
    this.lastCounter = now;
    const at = host.playerPos();
    const r = host.area(v.counterRadius!);
    playFx(host.scene, levelRef(this.s, 'oath'), at.x, at.y, { w: r * 2.2, depth: 5 });
    for (const e of enemiesWithin(host, at, r)) host.hit(e, v.counterDamage!, this.s.def.sources.counter!);
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

// ---------- 성역 오라 ----------

class Aura extends Timed {
  private next = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly me: SkillHost,
  ) {
    super(s.def.id, host, host.buffDuration(s.values.durationSec!, s.def.tags), { key: 'buff.sanctuaryAura', color: s.def.color });
    this.attach(host, levelRef(s, 'aura'), host.area(s.values.radius!), 0.45);
  }

  protected override tick(dt: number, host: SkillHost): void {
    this.next -= dt;
    if (this.next > 0) return;
    this.next += this.s.values.intervalSec!;
    for (const e of enemiesWithin(host, host.playerPos(), host.area(this.s.values.radius!))) host.hit(e, this.s.values.damage!, this.s.def.sources.pulse!);
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

// ---------- 강타 ----------

export const smite: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const origin = host.playerPos();
    const target = nearestEnemy(host, origin, v.length!);
    const aim = host.aimDir();
    const a = target ? Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x) : Math.atan2(aim.y, aim.x);
    const dir = { x: Math.cos(a), y: Math.sin(a) };
    const enemies = [...host.enemies()];
    const hits = lineHits(origin, dir, v.length!, v.halfWidth!, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
    stretchFx(host.scene, levelRef(s, 'smite'), origin, { x: origin.x + dir.x * v.length!, y: origin.y + dir.y * v.length! }, v.halfWidth! * 4, 0.3);
    for (const i of hits) {
      const e = enemies[i]!;
      host.hit(e, v.damage! * (isBoss(e) ? 1 + v.bossBonus! : 1), s.def.sources.smite!);
    }
    return true;
  },
};

// ---------- 성검 ----------

export const holySwords: SkillImpl = {
  cast(host, s) {
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
    for (const { e } of targets) {
      const at = { x: e.sprite.x, y: e.sprite.y };
      // 떨어질 자리 예고 원
      const warn = host.scene.add.circle(at.x, at.y, r, 0xffe27a, 0.18).setStrokeStyle(1, 0xffe27a, 0.8).setDepth(2.5);
      host.fx(warn, v.fallDelaySec!);
      host.scene.time.delayedCall(v.fallDelaySec! * 1000, () => {
        playFx(host.scene, levelRef(s, 'sword'), at.x, at.y - r * 0.6, { w: r * 1.6 });
        for (const x of enemiesWithin(host, at, r)) host.hit(x, v.damage!, s.def.sources.sword!);
      });
    }
    return true;
  },
};

// ---------- 회생의 기도 (패시브) ----------

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
    const p = host.playerPos();
    playFx(host.scene, levelRef(this.s, 'prayer'), p.x, p.y - 6, { w: 30, depth: 6 });
    if (this.count % 3 === 0) this.guardLeft = host.buffDuration(v.guardSec!, this.s.def.tags);
    return true;
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

// ---------- 심판의 강림 (궁극기) ----------

class JudgmentShield extends Timed {
  private shield: number;

  constructor(host: SkillHost, amount: number, sec: number, color: string, ref: Parameters<Timed['attach']>[1]) {
    super('divineJudgment', host, sec, { key: 'buff.divineJudgment', color });
    this.shield = amount;
    this.attach(host, ref, 14, 0.4);
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

export const divineJudgment: UltimateImpl = {
  cast(host, { def, values: v }) {
    clearOwner(host, def.id);
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

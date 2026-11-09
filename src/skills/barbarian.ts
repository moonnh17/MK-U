/**
 * 야만용사 (전사 전직): 광란의 검격·사슬 투척·대지 파쇄·소용돌이·전장의 함성, 패시브 끓어오르는 심장, 궁극기 광전사의 진노.
 * 원본은 자동 발동이었지만 리부트는 버튼 액티브라 지속형(검격·회전)은 시전 후 정해진 시간 동안 돈다.
 */
import type { Enemy } from '../entities/enemy';
import { lineHits } from '../systems/targeting';
import { inArc } from '../systems/weapons';
import { frenzyInterval, heartFlatDamage, whirlBonus } from '../systems/warrior';
import type { PlayerMods } from '../systems/vitals';
import { levelRef, playFx, stretchFx } from './skillFx';
import { clearOwner, enemiesWithin, Timed } from './timed';
import { nearestEnemy, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type UltimateCast, type UltimateImpl } from './host';

const RAGE = 'berserkerRage';
const raging = (host: SkillHost) => host.objects().some((o) => o.owner === RAGE);

// ---------- 광란의 검격 ----------

class Frenzy extends Timed {
  private next = 0;
  private last: Enemy | null = null;
  private same = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    super(s.def.id, host, s.values.durationSec!, { key: 'buff.frenzySlash', color: s.def.color });
  }

  protected override tick(dt: number, host: SkillHost): void {
    this.next -= dt;
    if (this.next > 0) return;
    const v = this.s.values;
    const range = host.area(v.range!);
    const origin = host.playerPos();
    const target = nearestEnemy(host, origin, range);
    if (!target) {
      this.next = 0.1;
      return;
    }
    this.same = target === this.last ? this.same + 1 : 0;
    this.last = target;
    const angle = Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x);
    const tags = this.s.def.sources.slash!;
    for (const e of [...host.enemies()]) {
      if (!inArc(origin, angle, v.arcDeg!, range, e.sprite, e.radius)) continue;
      host.hit(e, v.damage!, tags);
      if (v.bleedDamage! > 0 && !e.dead) host.bleed(e, v.bleedDamage!, v.bleedStacks!, this.s.def.sources.bleed!);
    }
    playFx(host.scene, levelRef(this.s, 'slash'), origin.x, origin.y, { w: range * 2.2, rotation: angle, flipX: this.same % 2 === 1 });
    this.next = frenzyInterval(v.intervalSec!, this.same, v.hastePerHit!, v.hasteCap!);
  }
}

export const frenzySlash: SkillImpl = {
  cast(host, s) {
    clearOwner(host, s.def.id);
    host.addObject(new Frenzy(host, s));
    return true;
  },
};

// ---------- 사슬 투척 ----------

export const chainThrow: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const origin = host.playerPos();
    const range = host.area(v.range!);
    const target = nearestEnemy(host, origin, range);
    const aim = host.aimDir();
    const base = target ? Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x) : Math.atan2(aim.y, aim.x);
    const n = Math.max(1, Math.round(v.chains!));
    const spread = (v.spreadDeg! * Math.PI) / 180;
    const enemies = [...host.enemies()];
    const pos = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    const hit = new Set<number>();
    for (let i = 0; i < n; i++) {
      const a = n === 1 ? base : base - spread / 2 + (spread * i) / (n - 1);
      const dir = { x: Math.cos(a), y: Math.sin(a) };
      stretchFx(host.scene, levelRef(s, 'chain'), origin, { x: origin.x + dir.x * range, y: origin.y + dir.y * range }, 14, 0.3);
      for (const j of lineHits(origin, dir, range, v.halfWidth!, pos)) hit.add(j);
    }
    for (const j of hit) {
      const e = enemies[j]!;
      host.hit(e, v.damage!, s.def.sources.chain!);
      // 맞은 적을 내 쪽으로 끌어온다 (몸에 붙기 전까지)
      const dx = origin.x - e.sprite.x;
      const dy = origin.y - e.sprite.y;
      const d = Math.hypot(dx, dy);
      if (!e.dead && d > e.radius + 8) e.knockback({ x: dx / d, y: dy / d }, Math.min(v.pullPx!, d - e.radius - 8), v.pullSec!);
    }
    return true;
  },
};

// ---------- 대지 파쇄 ----------

export const earthShatter: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const r = host.area(v.range!);
    const tags = s.def.sources.slam!;
    const blast = (damage: number) => {
      const at = host.playerPos();
      playFx(host.scene, levelRef(s, 'slam'), at.x, at.y, { w: r * 2.2, depth: 3 });
      for (const e of enemiesWithin(host, at, r)) host.hit(e, damage, tags);
      host.hitStop?.(0.03);
    };
    const n = Math.max(1, Math.round(v.blasts!));
    for (let i = 0; i < n; i++) host.scene.time.delayedCall(i * v.blastGapSec! * 1000, () => blast(v.damage!));
    // Lv3: 마지막 파열 뒤 균열이 한 번 더
    if (v.fracture! > 0) host.scene.time.delayedCall(n * v.blastGapSec! * 1000, () => blast(v.damage! * v.fracture!));
    return true;
  },
};

// ---------- 소용돌이 ----------

class Whirl extends Timed {
  private next = 0;
  private readonly tickSec: number;
  private readonly bonus: number;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    rage: { timeMul: number; intervalMul: number } | null,
  ) {
    const v = s.values;
    super(s.def.id, host, v.durationSec! * (rage?.timeMul ?? 1), { key: 'buff.whirlwind', color: s.def.color });
    this.tickSec = (v.durationSec! / v.hits!) * (rage?.intervalMul ?? 1);
    // 가진 다른 공격 스킬 수 (버프·패시브·숙련 제외)
    const others = host.ownedSkills().filter((id) => {
      if (id === s.def.id) return false;
      const d = host.ctx.data.skills.skills.find((x) => x.id === id);
      return d?.kind === 'active' && !d.tags.includes('buff');
    }).length;
    this.bonus = whirlBonus(others, v.perSkill!, v.bonusCap!);
  }

  protected override tick(dt: number, host: SkillHost): void {
    this.next -= dt;
    if (this.next > 0) return;
    this.next += this.tickSec;
    const r = host.area(this.s.values.range!);
    const at = host.playerPos();
    playFx(host.scene, levelRef(this.s, 'whirl'), at.x, at.y, { w: r * 2.2, rotation: host.rng.range(0, Math.PI * 2), depth: 5 });
    for (const e of enemiesWithin(host, at, r)) host.hit(e, this.s.values.damage! * (1 + this.bonus), this.s.def.sources.spin!);
  }

  playerMods(): Partial<PlayerMods> {
    return { moveSpeed: this.s.values.moveSpeed! };
  }
}

export const whirlwind: SkillImpl = {
  cast(host, s) {
    const rage = host.ctx.data.ultimates.ultimates.find((u) => u.id === RAGE)!.values;
    clearOwner(host, s.def.id);
    host.addObject(new Whirl(host, s, raging(host) ? { timeMul: rage.whirlTimeMul!, intervalMul: rage.whirlIntervalMul! } : null));
    return true;
  },
};

// ---------- 전장의 함성 ----------

class Cry extends Timed {
  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly boost: number,
  ) {
    super(s.def.id, host, host.buffDuration(s.values.durationSec!, s.def.tags), { key: 'buff.warCry', color: s.def.color });
  }

  playerMods(): Partial<PlayerMods> {
    return { meleeDamage: this.s.values.meleeDamage! * (1 + this.boost), lifesteal: this.s.values.lifesteal! };
  }
}

export const warCry: SkillImpl = {
  cast(host, s) {
    clearOwner(host, s.def.id);
    const p = host.playerPos();
    playFx(host.scene, levelRef(s, 'shout'), p.x, p.y, { w: 70, depth: 5 });
    host.addObject(new Cry(host, s, host.roarBoost()));
    return true;
  },
};

// ---------- 끓어오르는 심장 (패시브) ----------

class Heart extends Timed {
  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly me: SkillHost,
  ) {
    super(s.def.id, host, Infinity, null);
  }

  playerMods(): Partial<PlayerMods> {
    const v = this.s.values;
    // 최대 체력 증가는 syncMaxHp가 이 값을 다시 읽는다 (피해 가산은 늘어난 최대 체력 기준)
    return { maxHpPct: v.maxHpPct!, flatDamage: v.hpDamage! > 0 ? heartFlatDamage(this.me.maxHp(), v.hpDamage!, v.damageCap!) : 0 };
  }

  override buff(host: SkillHost) {
    return { id: this.owner, label: host.ctx.t(this.s.def.shortKey), color: this.s.def.color };
  }
}

export const boilingHeart: PassiveImpl = {
  activate(host, s) {
    host.addObject(new Heart(host, s, host));
  },
};

// ---------- 광전사의 진노 (궁극기) ----------

class Rage extends Timed {
  constructor(
    host: SkillHost,
    private readonly u: UltimateCast,
  ) {
    super(RAGE, host, u.values.durationSec!, { key: 'buff.berserkerRage', color: u.def.color });
    this.attach(host, u.def.sprites.aura!, 22, 0.6);
  }

  playerMods(): Partial<PlayerMods> {
    return { cooldownRate: this.u.values.cooldownRate! - 1, moveSpeed: this.u.values.moveSpeed! };
  }
}

export const berserkerRage: UltimateImpl = {
  cast(host, u) {
    clearOwner(host, RAGE);
    host.addObject(new Rage(host, u));
    host.burst(host.playerPos(), u.def.color);
    return true;
  },
};

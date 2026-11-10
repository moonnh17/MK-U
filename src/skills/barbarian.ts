/**
 * 야만용사 (전사 전직): 광란의 검격·사슬 투척·대지 파쇄·소용돌이·전장의 함성, 패시브 끓어오르는 심장, 궁극기 광전사의 진노.
 * 원본은 자동 발동이었지만 리부트는 버튼 액티브라 지속형(검격·회전)은 시전 후 정해진 시간 동안 돈다.
 */
import type { Enemy } from '../entities/enemy';
import { lineHits } from '../systems/targeting';
import { inArc } from '../systems/weapons';
import { frenzyInterval, heartFlatDamage, whirlBonus } from '../systems/warrior';
import type { PlayerMods } from '../systems/vitals';
import { arcSwipe, levelRef, playFx, stretchFx } from './skillFx';
import { clearOwner, enemiesWithin, Timed } from './timed';
import { nearestEnemy, type PassiveImpl, type SkillCast, type SkillHost, type SkillImpl, type UltimateCast, type UltimateImpl } from './host';

const RAGE = 'berserkerRage';
const raging = (host: SkillHost) => host.objects().some((o) => o.owner === RAGE);
const isBoss = (e: Enemy) => e.rank === 'boss' || e.rank === 'hiddenBoss';

// ---------- 광란의 검격 ----------

class Frenzy extends Timed {
  private next = 0;
  private last: Enemy | null = null;
  private same = 0;
  private count = 0;

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
    const awakened = this.s.owned.awakened;
    this.count++;
    const cross = awakened && this.count % v.crossEvery! === 0;
    let spreadFrom: Enemy | null = null;
    let hitAny = false;
    for (const e of [...host.enemies()]) {
      if (!inArc(origin, angle, v.arcDeg!, range, e.sprite, e.radius)) continue;
      hitAny = true;
      // 혈풍연참: 이미 출혈 중인 적을 베면 둘레로 출혈이 번진다 (검격당 한 번)
      if (awakened && !spreadFrom && e.bleed) spreadFrom = e;
      host.hit(e, v.damage!, tags);
      if (cross && !e.dead) host.hit(e, v.crossDamage!, this.s.def.sources.cross!);
      if (v.bleedDamage! > 0 && !e.dead) host.bleed(e, v.bleedStacks!);
    }
    if (spreadFrom) {
      const from = spreadFrom;
      const near = enemiesWithin(host, { x: from.sprite.x, y: from.sprite.y }, host.area(v.spreadRadius!)).filter((x) => x !== from && !x.bleed);
      for (const x of near.slice(0, v.spreadCap!)) host.bleed(x, v.bleedStacks!);
    }
    const ref = awakened ? this.s.def.sprites.slashA! : levelRef(this.s, 'slash');
    // 판정 부채꼴을 그대로 긋고, 초승달 그림은 몸 앞 범위 가운데에 크게 (그림 속 초승달이 칸의 일부라 몸 위에 그리면 작아 보인다)
    arcSwipe(host.scene, origin, angle, v.arcDeg!, range, this.s.def.color);
    playFx(host.scene, ref, origin.x + Math.cos(angle) * range * 0.45, origin.y + Math.sin(angle) * range * 0.45, { w: range * 1.7, rotation: angle }).setFlipY(this.count % 2 === 0);
    if (hitAny) host.hitStop?.(0.02);
    // 십자 참격: 엇갈린 두 줄기
    if (cross) for (const d of [-1, 1]) playFx(host.scene, ref, target.sprite.x, target.sprite.y, { w: range * 1.6, rotation: angle + (d * Math.PI) / 4 });
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

/** 철쇄폭진: 사슬을 사방으로 펼쳐 세 번 휘돌린 뒤 거둬들이며 맞은 적을 몸 앞으로 모은다 */
class ChainStorm extends Timed {
  private t = 0;
  private step = 0;
  private readonly caught = new Set<Enemy>();

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
  ) {
    super(s.def.id, host, s.values.retractSec! + 0.3, null);
    this.attach(host, s.def.sprites.chainA!, host.area(s.values.range!), 0.9);
  }

  protected override tick(dt: number, host: SkillHost): void {
    const v = this.s.values;
    this.t += dt;
    const at = host.playerPos();
    const r = host.area(v.range!);
    const times = [v.deploySec!, v.spin1Sec!, v.spin2Sec!, v.spin3Sec!, v.retractSec!];
    while (this.step < times.length && this.t >= times[this.step]!) {
      const i = this.step++;
      if (i === 0) {
        // 전개: 사방으로 n줄
        const enemies = [...host.enemies()];
        const pos = enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
        const hit = new Set<number>();
        const n = Math.max(1, Math.round(v.chains!));
        for (let c = 0; c < n; c++) {
          const a = (c / n) * Math.PI * 2;
          for (const j of lineHits(at, { x: Math.cos(a), y: Math.sin(a) }, r, v.halfWidth!, pos)) hit.add(j);
        }
        for (const j of hit) {
          this.caught.add(enemies[j]!);
          host.hit(enemies[j]!, v.deployDamage!, this.s.def.sources.deploy!);
        }
      } else if (i < 4) {
        // 회전: 반경 안 모두
        for (const e of enemiesWithin(host, at, r)) {
          this.caught.add(e);
          host.hit(e, v.spinDamage!, this.s.def.sources.spin!);
        }
      } else {
        // 회수: 보스가 아닌 적을 몸 앞(최소 간격)까지 끌어온다
        for (const e of this.caught) {
          if (e.dead || isBoss(e)) continue;
          const dx = at.x - e.sprite.x;
          const dy = at.y - e.sprite.y;
          const d = Math.hypot(dx, dy);
          const pull = d - (v.gapPx! + e.radius);
          if (pull > 0) e.knockback({ x: dx / d, y: dy / d }, pull, v.pullSec!);
        }
      }
    }
  }
}

export const chainThrow: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    if (s.owned.awakened) {
      clearOwner(host, s.def.id);
      host.addObject(new ChainStorm(host, s));
      return true;
    }
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
    if (s.owned.awakened) {
      // 네메아의 종말: 세 번의 독립 파열, 점점 넓게. 보스가 아닌 적은 밀려난다
      const steps = [
        [v.blast1Sec!, 1, 1],
        [v.blast2Sec!, v.blast2Mul!, v.blast2Grow!],
        [v.blast3Sec!, v.blast3Mul!, v.blast3Grow!],
      ] as const;
      for (const [sec, mul, grow] of steps) {
        host.scene.time.delayedCall(sec * 1000, () => {
          const at = host.playerPos();
          const rr = r * grow;
          playFx(host.scene, levelRef(s, 'slam'), at.x, at.y, { w: rr * 2.2, depth: 3 });
          host.hitStop?.(0.04);
          for (const e of enemiesWithin(host, at, rr)) {
            host.hit(e, v.damage! * mul, tags);
            const dx = e.sprite.x - at.x;
            const dy = e.sprite.y - at.y;
            const d = Math.hypot(dx, dy) || 1;
            if (!e.dead && !isBoss(e)) e.knockback({ x: dx / d, y: dy / d }, v.knockback!, 0.15);
          }
        });
      }
      return true;
    }
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
    const v = this.s.values;
    const awakened = this.s.owned.awakened;
    const spin = host.rng.range(0, Math.PI * 2);
    playFx(host.scene, awakened ? this.s.def.sprites.whirlA! : levelRef(this.s, 'whirl'), at.x, at.y, { w: r * 2.2, rotation: spin, depth: 5 });
    for (const e of enemiesWithin(host, at, r)) host.hit(e, v.damage! * (1 + this.bonus), this.s.def.sources.spin!);
    if (!awakened) return;
    // 훨윈드: 돌 때마다 가장 가까운 적 쪽으로 관통 초승달 참격 (적이 없으면 도는 방향)
    const target = nearestEnemy(host, at, v.shotRange!);
    const angle = target ? Math.atan2(target.sprite.y - at.y, target.sprite.x - at.x) : spin;
    host.fireBullet(at, angle, v.shotSpeed!, v.shotRange!, v.shotDamage! * (1 + this.bonus), this.s.def.sources.shot!, this.s.def.sprites.shotA, { pierce: v.shotPierce!, hitSize: 14, tint: this.s.def.color });
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
    return { meleeDamage: this.s.values.meleeDamage! * (1 + this.boost), lifesteal: this.s.values.lifesteal!, moveSpeed: this.s.values.moveSpeed ?? 0 };
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

const AUTO_SKILLS = ['whirlwind', 'chainThrow', 'earthShatter'];

class Rage extends Timed {
  constructor(
    host: SkillHost,
    private readonly u: UltimateCast,
  ) {
    super(RAGE, host, u.values.durationSec!, { key: 'buff.berserkerRage', color: u.def.color });
    this.attach(host, u.def.sprites.aura!, 22, 0.6);
  }

  // 라스알게티의 기억: 장착한 무기 스킬이 준비되는 대로 저절로 나간다
  protected override tick(_dt: number, host: SkillHost): void {
    if (!this.u.awakened) return;
    for (const id of AUTO_SKILLS) host.castEquipped?.(id);
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

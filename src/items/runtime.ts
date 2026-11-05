/**
 * 아이템 런타임: 발동형·조건부 효과와 아이템별 상태(재사용 대기·누적·타이머).
 * 상태는 PlayerState.itemState에 두어 스테이지를 넘어가도 유지된다.
 * 늘 켜져 있는 효과(스탯·피해 % 등)의 합은 systems/items.ts itemTotals가 맡는다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { GameContext } from '../core/context';
import { hexColor } from '../core/scale';
import type { BuffView, PlayerState } from '../core/session';
import type { Enemy } from '../entities/enemy';
import type { SkillHost, SkillObject } from '../skills/host';
import { nearestEnemy } from '../skills/host';
import { skillImpl } from '../skills/registry';
import type { Rect } from '../entities/hazard';
import { hpStance } from '../systems/vitals';
import { activeEffects, dodgeValues, healReady, itemTotals, pickHeal, roarValues, shieldValues, type ItemTotals } from '../systems/items';
import { bounceStep } from '../systems/motion';
import { findSkill, skillValues } from '../systems/skills';
import type { ItemEffect, TagId } from '../types/data';

/** 아이템 하나의 상태 */
export interface ItemState {
  /** 재사용 대기(초) */
  cd: number;
  /** 1회용을 썼는지 */
  used: boolean;
  /** 누적 피해 증가 (카이사르) */
  stacks: number;
  kills: number;
  /** 코인 누적 (레굴루스) */
  coinAcc: number;
  /** 주기 발동까지 남은 시간 */
  timer: number;
  /** 임시 함성 남은 시간 */
  roarLeft: number;
  /** 순간 회피 뒤 남은 강화 기본공격 수 (특무 인장) */
  empower: number;
  /** 흡수 중 남은 시간 (식광의 핵) */
  absorbLeft: number;
  /** 회복을 쓴 횟수 (한우촌의 생등심). 예전 저장에는 없다 */
  healCount?: number;
}

export function newItemState(): ItemState {
  return { cd: 0, used: false, stacks: 0, kills: 0, coinAcc: 0, timer: 0, roarLeft: 0, empower: 0, absorbLeft: 0, healCount: 0 };
}

/** 회복을 쓴 횟수 (healCount가 없던 예전 저장은 used로) */
function healCount(s: ItemState): number {
  return s.healCount ?? (s.used ? 1 : 0);
}

export interface ItemHost {
  readonly scene: Phaser.Scene;
  readonly ctx: GameContext;
  player(): PlayerState;
  /** 피해를 준 출처가 'item'인 SkillHost (명중·탄·오브젝트) */
  skill(): SkillHost;
  /** 스킬 id 출처의 SkillHost (자동 발동) */
  skillFor(id: string): SkillHost;
  /** 관통탄 */
  fireBullet(from: Vec2, angle: number, speed: number, range: number, base: number, tags: readonly TagId[], pierce: number): void;
  /** 플레이어 무적(초). translucent면 반투명 */
  setInvuln(sec: number, translucent: boolean): void;
  /** 버프 지속시간 (버프 태그, 정신력·아이템) */
  buffDuration(sec: number): number;
  area(radius: number): number;
  /** 피격 사방 공격 범위 보정 (힘·마기력) */
  toast(text: string): void;
  /** 플레이어가 있는 방 안쪽 (방패 튕김) */
  arena(): Rect;
  /** 플레이어 짧은 순간이동 (특무 인장) */
  blink(distance: number): void;
  /** at 둘레 radius 안의 약한 적 탄(굴절 가능한 탄)을 지운다. 지운 수 */
  absorbEnemyBullets(at: Vec2, radius: number): number;
}

/** 식광의 핵이 플레이어 둘레를 도는 반지름·속도(rad/s) */
const CORE_ORBIT = 12;
const CORE_SPIN = 2.5;

/** 오리온의 방패: 방 벽에 튕기며 닿는 적에게 피해. 튕길 때마다 다시 맞힐 수 있다 */
class ShieldDisc implements SkillObject {
  readonly owner = 'item';
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Arc;
  private pos: Vec2;
  private vel: Vec2;
  private left: number;
  private life: number;
  private hitSet = new Set<Enemy>();

  constructor(
    host: SkillHost,
    from: Vec2,
    angle: number,
    private readonly e: Extract<ItemEffect, { kind: 'shieldThrow' }>,
    private readonly arena: Rect,
    private readonly onEnd: () => void,
    color: number,
  ) {
    this.createdAt = host.scene.time.now;
    this.pos = { ...from };
    this.vel = { x: Math.cos(angle) * e.speed, y: Math.sin(angle) * e.speed };
    this.left = e.bounces;
    // 다 튕기지 못해도 maxSec 뒤에는 사라진다
    this.life = e.maxSec;
    this.img = host.scene.add.circle(from.x, from.y, e.size, color, 0.95).setStrokeStyle(1, 0xffffff, 0.9).setDepth(5);
  }

  update(dt: number, host: SkillHost): boolean {
    this.life -= dt;
    const r = bounceStep(this.pos, this.vel, dt, this.arena, this.e.size);
    this.pos = r.pos;
    this.vel = r.vel;
    if (r.bounces > 0) {
      this.left -= r.bounces;
      this.hitSet = new Set();
    }
    this.img.setPosition(this.pos.x, this.pos.y);
    for (const en of [...host.enemies()]) {
      if (this.hitSet.has(en) || Math.hypot(en.sprite.x - this.pos.x, en.sprite.y - this.pos.y) > this.e.size + en.radius) continue;
      this.hitSet.add(en);
      host.hit(en, this.e.damage, this.e.tags);
    }
    return this.left >= 0 && this.life > 0;
  }

  destroy(): void {
    this.img.destroy();
    this.onEnd();
  }
}

/** 인력탄: 날아가 터지며 둘레 적을 가운데로 끌어당긴다 */
class GravityShot implements SkillObject {
  readonly owner = 'item';
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Arc;
  private x: number;
  private y: number;
  private left: number;
  private readonly dir: Vec2;

  constructor(
    host: SkillHost,
    from: Vec2,
    private readonly to: Vec2,
    private readonly e: Extract<ItemEffect, { kind: 'gravityShot' }>,
    private readonly color: number,
  ) {
    this.createdAt = host.scene.time.now;
    this.x = from.x;
    this.y = from.y;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    this.left = Math.hypot(dx, dy);
    this.dir = this.left > 0 ? { x: dx / this.left, y: dy / this.left } : { x: 0, y: 0 };
    this.img = host.scene.add.circle(this.x, this.y, 4, color, 0.9).setDepth(5);
  }

  update(dt: number, host: SkillHost): boolean {
    const step = Math.min(this.left, 200 * dt);
    this.x += this.dir.x * step;
    this.y += this.dir.y * step;
    this.left -= step;
    this.img.setPosition(this.x, this.y);
    if (this.left > 0) return true;
    const r = host.area(this.e.radius);
    host.fx(host.scene.add.circle(this.x, this.y, r, this.color, 0.3).setDepth(6), 0.3);
    for (const en of [...host.enemies()]) {
      const d = Math.hypot(en.sprite.x - this.x, en.sprite.y - this.y);
      if (d > r + en.radius) continue;
      host.hit(en, this.e.damage, this.e.tags);
      if (!en.dead && d > 1) en.knockback({ x: (this.x - en.sprite.x) / d, y: (this.y - en.sprite.y) / d }, Math.min(this.e.pull, d), 0.2);
    }
    return false;
  }

  destroy(): void {
    this.img.destroy();
  }
}

export class ItemRuntime {
  private totals!: ItemTotals;
  private effects: { id: string; e: ItemEffect }[] = [];
  /** 직업 변형까지 합친 함성·순간 회피·방패 (각각 가진 아이템 하나) */
  private roar: { id: string; e: Extract<ItemEffect, { kind: 'roomRoar' }> } | null = null;
  private dodge: { id: string; e: Extract<ItemEffect, { kind: 'dodgeBlink' }> } | null = null;
  private shield: { id: string; e: Extract<ItemEffect, { kind: 'shieldThrow' }> } | null = null;
  /** 날아가는 방패 수 */
  private shieldsOut = 0;
  /** 식광의 핵: 따라다니는 핵과 흡수 범위 표시 */
  private core: Phaser.GameObjects.Arc | null = null;
  private coreRing: Phaser.GameObjects.Arc | null = null;
  private coreT = 0;
  private key = '';

  constructor(private readonly host: ItemHost) {
    this.refresh();
  }

  private state(id: string): ItemState {
    const p = this.host.player();
    p.itemState[id] ??= newItemState();
    return p.itemState[id]!;
  }

  /** 아이템·학파가 바뀌었으면 다시 계산 */
  refresh(): void {
    const p = this.host.player();
    const key = `${p.items.join(',')}|${p.advancement}`;
    if (key === this.key) return;
    this.key = key;
    const d = this.host.ctx.data;
    const ctx = { school: p.advancement, job: p.job };
    this.totals = itemTotals(p.items, d.items, ctx, d.groupMultipliers);
    this.effects = p.items.flatMap((id) => {
      const def = d.items.items.find((x) => x.id === id);
      return def ? activeEffects(def, ctx, d.groupMultipliers).map((e) => ({ id, e })) : [];
    });
    const pick = <T>(f: (effs: ItemEffect[]) => T | null): { id: string; e: T } | null => {
      for (const id of p.items) {
        const e = f(this.effects.filter((x) => x.id === id).map((x) => x.e));
        if (e) return { id, e };
      }
      return null;
    };
    this.roar = pick(roarValues);
    this.dodge = pick(dodgeValues);
    this.shield = pick(shieldValues);
  }

  get sums(): ItemTotals {
    this.refresh();
    return this.totals;
  }

  /** 패닉 각성 효과 (없으면 null) */
  panicAwaken(): Extract<ItemEffect, { kind: 'panicAwaken' }> | null {
    return this.first('panicAwaken');
  }

  /** 그 종류의 첫 효과 (없으면 null) */
  first<K extends ItemEffect['kind']>(kind: K): Extract<ItemEffect, { kind: K }> | null {
    return this.each(kind)[0]?.e ?? null;
  }

  private each<K extends ItemEffect['kind']>(kind: K): { id: string; e: Extract<ItemEffect, { kind: K }> }[] {
    this.refresh();
    return this.effects.filter((x) => x.e.kind === kind) as { id: string; e: Extract<ItemEffect, { kind: K }> }[];
  }

  /** 런타임 피해 증가: 스튜 이후·카이사르 누적·임시 함성 */
  extraDamageAll(): number {
    let v = 0;
    for (const { id, e } of this.each('lowHpHeal')) if (e.afterDamage && this.state(id).used) v += e.afterDamage;
    for (const { id } of this.each('killStacks')) v += this.state(id).stacks;
    for (const { id, e } of this.each('tempRoar')) if (this.state(id).roarLeft > 0) v += e.damage;
    if (this.roar && this.state(this.roar.id).roarLeft > 0) v += this.roar.e.damage;
    const awaken = this.host.player().panic ? this.panicAwaken() : null;
    if (awaken) v += awaken.damage;
    return v;
  }

  /** 회복을 쓸 때마다 늘어난 최대 에너지 (한우촌의 생등심) */
  healMaxEnergy(): number {
    return this.each('lowHpHeal').reduce((v, { id, e }) => v + (e.maxEnergyPerUse ?? 0) * healCount(this.state(id)), 0);
  }

  moveSpeedBonus(): number {
    let v = this.sums.moveSpeed;
    for (const { id, e } of this.each('tempRoar')) if (this.state(id).roarLeft > 0) v += e.moveSpeed;
    if (this.roar && this.state(this.roar.id).roarLeft > 0) v += this.roar.e.moveSpeed;
    return v;
  }

  /** 궁극기를 썼을 때 (고대병기의 코어: 관통 탄환 전방위) */
  onUltimate(): void {
    const from = this.host.skill().playerPos();
    for (const { e } of this.each('ultimateBurst')) {
      for (let i = 0; i < e.shots; i++) this.host.fireBullet(from, (i * Math.PI * 2) / e.shots, e.speed, e.range, e.damage, e.tags, 99);
    }
  }

  /** 방패가 날아가는 동안 받는 피해 감소 */
  guard(): number {
    this.refresh();
    return this.shield && this.shieldsOut > 0 ? this.shield.e.guard : 0;
  }

  /** 함성(바바리안 데스 휘슬): 전투 칸에 들어갈 때·엘리트를 처치할 때 */
  triggerRoar(): void {
    this.refresh();
    if (!this.roar) return;
    this.state(this.roar.id).roarLeft = this.host.buffDuration(this.roar.e.durationSec);
  }

  /** 순간 회피(특무 인장): 피해를 받기 직전. 재사용이 찼으면 피하고 true */
  tryDodge(): boolean {
    this.refresh();
    if (!this.dodge) return false;
    const s = this.state(this.dodge.id);
    if (s.cd > 0) return false;
    s.cd = this.dodge.e.cooldownSec;
    s.empower = this.dodge.e.attacks;
    this.host.blink(this.dodge.e.distance);
    return true;
  }

  /** 기본공격 1회의 피해 배율 (순간 회피 직후 강화 공격을 하나 쓴다) */
  consumeEmpowered(): number {
    this.refresh();
    if (!this.dodge) return 1;
    const s = this.state(this.dodge.id);
    if (s.empower <= 0) return 1;
    s.empower--;
    return 1 + this.dodge.e.bonus;
  }

  /** 적중 효과: 공간격(신검), 확률 피해 ×1.5(참마검, 지능 보정) */
  hitMods(rng: { chance(p: number): boolean }, luckyChance: (base: number) => number): { space: boolean; mult: number } {
    let space = false;
    let mult = 1;
    for (const { e } of this.each('spaceOnHit')) if (rng.chance(e.chance)) space = true;
    for (const { e } of this.each('luckyHit')) if (rng.chance(luckyChance(e.chance))) mult *= e.mult;
    return { space, mult };
  }

  /** 아크로 대성공 보너스(상한 무시)·대실패 제거 */
  greatSuccess(): { bonus: number; noFailure: boolean } {
    let bonus = 0;
    let noFailure = false;
    for (const { e } of this.each('greatSuccess')) {
      bonus += e.bonus;
      noFailure ||= e.noFailure;
    }
    return { bonus, noFailure };
  }

  /** 원심 가속(투르비용)이 남은 시간 */
  private hasteLeft = 0;

  /** 구르는 동안 적 공격을 피했을 때 (투르비용: 원심 가속) */
  onDodgeAvoid(): void {
    const e = this.first('dodgeHaste');
    if (e) this.hasteLeft = e.durationSec;
  }

  /** 지금 무기 공격 속도 보너스 (원심 가속) */
  attackSpeedBonus(): number {
    const e = this.first('dodgeHaste');
    return e && this.hasteLeft > 0 ? e.value : 0;
  }

  /** 값만 있는 효과의 합 (치명타 확률·치명타 피해·회피 재사용 감소) */
  total(kind: 'critChance' | 'critDamage' | 'dodgeCdReduce'): number {
    return this.each(kind).reduce((s, { e }) => s + e.value, 0);
  }

  update(dt: number): void {
    this.hasteLeft = Math.max(0, this.hasteLeft - dt);
    const p = this.host.player();
    for (const id of p.items) {
      const s = this.state(id);
      s.cd = Math.max(0, s.cd - dt);
      s.roarLeft = Math.max(0, s.roarLeft - dt);
    }
    this.updateCore(dt);
    // 주기 발동
    for (const { id, e } of this.effects) {
      if (e.kind !== 'autoCast' && e.kind !== 'tempRoar' && e.kind !== 'gravityShot' && e.kind !== 'shieldThrow' && e.kind !== 'regen') continue;
      const s = this.state(id);
      s.timer += dt;
      if (s.timer < e.everySec) continue;
      if (e.kind === 'autoCast') {
        if (!this.autoCast(e)) continue;
      } else if (e.kind === 'tempRoar') {
        s.roarLeft = this.host.buffDuration(e.durationSec);
      } else if (e.kind === 'shieldThrow') {
        if (!this.throwShield()) continue;
      } else if (e.kind === 'regen') {
        const pl = this.host.player();
        pl.hp = Math.min(pl.maxHp, pl.hp + e.value);
      } else if (!this.gravityShot(e)) {
        continue;
      }
      s.timer = 0;
    }
  }

  /**
   * 식광의 핵: 플레이어 둘레를 돌다가 everySec마다 absorbSec 동안 둘레의 약한 적 탄을 흡수하고, 끝나면 그 범위에 폭발.
   */
  private updateCore(dt: number): void {
    const entry = this.each('absorbCore')[0];
    if (!entry) {
      this.core?.destroy();
      this.coreRing?.destroy();
      this.core = null;
      this.coreRing = null;
      return;
    }
    const { id, e } = entry;
    const host = this.host.skill();
    const def = this.host.ctx.data.items.items.find((x) => x.id === id)!;
    const color = hexColor(def.color);
    this.coreT += dt;
    const pp = host.playerPos();
    const at = { x: pp.x + Math.cos(this.coreT * CORE_SPIN) * CORE_ORBIT, y: pp.y + Math.sin(this.coreT * CORE_SPIN) * CORE_ORBIT };
    this.core ??= this.host.scene.add.circle(at.x, at.y, 3, color, 1).setStrokeStyle(1, 0x000000, 1).setDepth(5);
    this.core.setPosition(at.x, at.y);
    const s = this.state(id);
    if (s.absorbLeft > 0) {
      s.absorbLeft -= dt;
      this.coreRing ??= this.host.scene.add.circle(at.x, at.y, e.radius).setStrokeStyle(1, color, 0.6).setFillStyle(color, 0.08).setDepth(2);
      this.coreRing.setPosition(at.x, at.y);
      this.host.absorbEnemyBullets(at, e.radius);
      if (s.absorbLeft > 0) return;
      this.coreRing.destroy();
      this.coreRing = null;
      host.fx(this.host.scene.add.circle(at.x, at.y, e.radius, color, 0.35).setDepth(6), 0.3);
      for (const en of [...host.enemies()]) if (Math.hypot(en.sprite.x - at.x, en.sprite.y - at.y) <= e.radius + en.radius) host.hit(en, e.damage, e.tags);
      return;
    }
    s.timer += dt;
    if (s.timer < e.everySec) return;
    s.timer = 0;
    s.absorbLeft = e.absorbSec;
  }

  private autoCast(e: Extract<ItemEffect, { kind: 'autoCast' }>): boolean {
    const impl = skillImpl(e.skillId);
    const host = this.host.skillFor(e.skillId);
    if (!impl || host.enemies().length === 0) return false;
    const def = findSkill(this.host.ctx.data.skills, e.skillId);
    const owned = { level: e.level, awakened: false, order: 0 };
    return impl.cast(host, { def, owned, values: skillValues(def, owned).values });
  }

  private gravityShot(e: Extract<ItemEffect, { kind: 'gravityShot' }>): boolean {
    const host = this.host.skill();
    const from = host.playerPos();
    const target = nearestEnemy(host, from, e.range);
    if (!target) return false;
    host.addObject(new GravityShot(host, from, { x: target.sprite.x, y: target.sprite.y }, e, hexColor('#5ad9ff')));
    return true;
  }

  /** 방패 투척: 가장 가까운 적 쪽 (적이 없으면 던지지 않음). 튕김 횟수는 직업 변형까지 합친 값 */
  private throwShield(): boolean {
    const sh = this.shield;
    if (!sh) return false;
    const host = this.host.skill();
    const from = host.playerPos();
    const target = nearestEnemy(host, from, Infinity);
    if (!target) return false;
    const angle = Math.atan2(target.sprite.y - from.y, target.sprite.x - from.x);
    const def = this.host.ctx.data.items.items.find((x) => x.id === sh.id)!;
    this.shieldsOut++;
    host.addObject(new ShieldDisc(host, from, angle, sh.e, this.host.arena(), () => this.shieldsOut--, hexColor(def.color)));
    return true;
  }

  /** 실제로 피해를 받은 뒤 (taken: 깎인 양). attacker를 모르면 가장 가까운 적 */
  onHurt(taken: number, attacker: Enemy | null): void {
    const host = this.host.skill();
    for (const { id, e } of this.each('killStacks')) this.state(id).stacks *= e.hurtKeep;
    for (const { id, e } of this.each('hurtInvuln')) {
      const s = this.state(id);
      if (s.cd > 0) continue;
      this.host.setInvuln(e.sec, true);
      s.cd = e.cooldownSec;
    }
    for (const { e } of this.each('hurtBurst')) {
      const p = host.playerPos();
      const r = this.host.area(e.radius);
      host.fx(host.scene.add.circle(p.x, p.y, r, 0x3a9ad9, 0.3).setDepth(6), 0.25);
      for (const en of [...host.enemies()]) if (Math.hypot(en.sprite.x - p.x, en.sprite.y - p.y) <= r + en.radius) host.hit(en, e.damage, e.tags);
    }
    for (const { e } of this.each('reflect')) {
      const target = attacker && !attacker.dead ? attacker : nearestEnemy(host, host.playerPos(), 120);
      if (target) host.hitTrue(target, taken * e.ratio, false);
    }
  }

  /** 체력이 낮아졌을 때 회복 (조건을 채운 것 중 우선순위 하나만) */
  tryHeal(): void {
    const p = this.host.player();
    const cands = this.each('lowHpHeal').map(({ id, e }) => {
      const s = this.state(id);
      return { itemId: id, threshold: e.threshold, healTo: e.healTo, priority: e.priority, ready: healReady(e, s.cd, healCount(s)) };
    });
    const pick = pickHeal(cands, p.hp / p.maxHp);
    if (!pick) return;
    const e = this.each('lowHpHeal').find((x) => x.id === pick.itemId)!.e;
    const s = this.state(pick.itemId);
    if (e.cooldownSec > 0) s.cd = e.cooldownSec;
    else s.healCount = healCount(s) + 1;
    // used: 한 번이라도 썼는지 (스튜 이후 피해 증가)
    s.used = true;
    // 'healTo까지' — 추가가 아니라 그 비율까지 채운다
    p.hp = Math.max(p.hp, p.maxHp * pick.healTo);
    this.host.toast(this.host.ctx.t('item.healed', { item: this.host.ctx.t(`item.${pick.itemId}`) }));
  }

  /** 사망: 부활 아이템 하나를 소모해 그 효과를 돌려준다 (아이템마다 따로, 한 번 사망에 하나만). 회복은 부활 연출 뒤 씬이 한다 */
  takeRevive(): { invulnSec: number; look?: 'hectar' | 'holy' } | null {
    for (const { id, e } of this.each('revive')) {
      const s = this.state(id);
      if (s.used) continue;
      s.used = true;
      return e;
    }
    return null;
  }

  onKill(elite: boolean): void {
    if (elite) this.triggerRoar();
    for (const { id, e } of this.each('killStacks')) {
      const s = this.state(id);
      s.kills++;
      if (s.kills % e.perKills === 0) s.stacks = Math.min(e.max, s.stacks + e.value);
    }
  }

  /** 코인을 얻었을 때 (레굴루스: 일정량마다 관통탄, 남은 양 이월) */
  onCoins(amount: number): void {
    const host = this.host.skill();
    for (const { id, e } of this.each('coinShots')) {
      const s = this.state(id);
      s.coinAcc += amount;
      while (s.coinAcc >= e.perCoins) {
        s.coinAcc -= e.perCoins;
        const from = host.playerPos();
        const t = nearestEnemy(host, from, e.range);
        const aim = host.aimDir();
        const base = t ? Math.atan2(t.sprite.y - from.y, t.sprite.x - from.x) : Math.atan2(aim.y, aim.x);
        for (let i = 0; i < e.shots; i++) {
          const a = base + (i - (e.shots - 1) / 2) * 0.12;
          this.host.fireBullet(from, a, 360, e.range, e.damage, e.tags, 99);
        }
      }
    }
  }

  /** HUD '현재 버프': 회복 아이템(이후 피해·쿨타임·남은 횟수), 태세, 유체화, 임시 함성 */
  buffs(): BuffView[] {
    const out: BuffView[] = [];
    const t = (key: string) => this.host.ctx.t(key);
    const color = (id: string) => this.host.ctx.data.items.items.find((x) => x.id === id)?.color ?? '#888888';
    for (const { id, e } of this.each('lowHpHeal')) {
      const s = this.state(id);
      const base = { id: `item.${id}`, label: t(`item.${id}.buff`), color: color(id) };
      if (e.afterDamage) {
        if (s.used) out.push(base);
      } else if (e.cooldownSec > 0) {
        if (s.cd > 0) out.push({ ...base, cdSec: s.cd, cdTotalSec: e.cooldownSec });
      } else if ((e.uses ?? 1) - healCount(s) > 0) {
        out.push({ ...base, count: (e.uses ?? 1) - healCount(s) });
      }
    }
    for (const { id, e } of this.each('hpStance')) {
      const p = this.host.player();
      const up = hpStance(p.hp, p.maxHp, e).damage > 0;
      out.push({ id: `item.${id}`, label: t(up ? `item.${id}.buff.attack` : `item.${id}.buff.defense`), color: color(id) });
    }
    for (const { id, e } of this.each('hurtInvuln')) {
      const s = this.state(id);
      // 발동하면 cd가 cooldownSec에서 줄기 시작하므로 처음 sec초가 무적 시간
      const left = s.cd - (e.cooldownSec - e.sec);
      const base = { id: `item.${id}`, label: t(`item.${id}.buff`), color: color(id) };
      if (left > 0) out.push({ ...base, leftSec: left, totalSec: e.sec });
      else if (s.cd > 0) out.push({ ...base, cdSec: s.cd, cdTotalSec: e.cooldownSec });
    }
    // 순간이동(특무 인장): 강화 공격이 남았으면 ×n, 아니면 쿨타임
    if (this.dodge) {
      const { id, e } = this.dodge;
      const s = this.state(id);
      const base = { id: `item.${id}`, label: t(`item.${id}.buff`), color: color(id) };
      if (s.empower > 0) out.push({ ...base, count: s.empower });
      else if (s.cd > 0) out.push({ ...base, cdSec: s.cd, cdTotalSec: e.cooldownSec });
    }
    // 타비트의 성물(오리온의 방패): 방패가 날아가는 동안 상시, 아니면 다음 투척까지
    if (this.shield) {
      const { id, e } = this.shield;
      const s = this.state(id);
      const base = { id: `item.${id}`, label: t(`item.${id}.buff`), color: color(id) };
      out.push(this.shieldsOut > 0 ? base : { ...base, cdSec: Math.max(0, e.everySec - s.timer), cdTotalSec: e.everySec });
    }
    for (const { id, e } of this.each('tempRoar')) {
      const s = this.state(id);
      if (s.roarLeft > 0) out.push({ id: `item.${id}`, label: this.host.ctx.t('item.roar'), color: '#6a9a3a', leftSec: s.roarLeft, totalSec: this.host.buffDuration(e.durationSec) });
    }
    if (this.roar) {
      const s = this.state(this.roar.id);
      const def = this.host.ctx.data.items.items.find((x) => x.id === this.roar!.id)!;
      if (s.roarLeft > 0) out.push({ id: `item.${this.roar.id}`, label: this.host.ctx.t('item.roar'), color: def.color, leftSec: s.roarLeft, totalSec: this.host.buffDuration(this.roar.e.durationSec) });
    }
    return out;
  }
}

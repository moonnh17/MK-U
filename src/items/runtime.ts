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
import { activeEffects, itemTotals, pickHeal, type ItemTotals } from '../systems/items';
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
}

export function newItemState(): ItemState {
  return { cd: 0, used: false, stacks: 0, kills: 0, coinAcc: 0, timer: 0, roarLeft: 0 };
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
  /** 피격 사방 공격 범위 보정 (힘·마기력) */
  burstArea(radius: number): number;
  toast(text: string): void;
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
  private key = '';

  constructor(private readonly host: ItemHost) {
    this.refresh();
  }

  private state(id: string): ItemState {
    const p = this.host.player();
    p.itemState[id] ??= newItemState();
    return p.itemState[id]!;
  }

  /** 아이템·학파·투자 스탯이 바뀌었으면 다시 계산 */
  refresh(): void {
    const p = this.host.player();
    const key = `${p.items.join(',')}|${p.advancement}|${Object.values(p.statInvest).join(',')}`;
    if (key === this.key) return;
    this.key = key;
    const d = this.host.ctx.data;
    const ctx = { school: p.advancement, job: p.job };
    this.totals = itemTotals(p.items, d.items, ctx, d.groupMultipliers, { startValue: d.stats.startValue, invest: p.statInvest });
    this.effects = p.items.flatMap((id) => {
      const def = d.items.items.find((x) => x.id === id);
      return def ? activeEffects(def, ctx, d.groupMultipliers).map((e) => ({ id, e })) : [];
    });
  }

  get sums(): ItemTotals {
    this.refresh();
    return this.totals;
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
    return v;
  }

  moveSpeedBonus(): number {
    let v = 0;
    for (const { id, e } of this.each('tempRoar')) if (this.state(id).roarLeft > 0) v += e.moveSpeed;
    return v;
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

  update(dt: number): void {
    const p = this.host.player();
    for (const id of p.items) {
      const s = this.state(id);
      s.cd = Math.max(0, s.cd - dt);
      s.roarLeft = Math.max(0, s.roarLeft - dt);
    }
    // 주기 발동
    for (const { id, e } of this.effects) {
      if (e.kind !== 'autoCast' && e.kind !== 'tempRoar' && e.kind !== 'gravityShot') continue;
      const s = this.state(id);
      s.timer += dt;
      if (s.timer < e.everySec) continue;
      if (e.kind === 'autoCast') {
        if (!this.autoCast(e)) continue;
      } else if (e.kind === 'tempRoar') {
        s.roarLeft = this.host.buffDuration(e.durationSec);
      } else if (!this.gravityShot(e)) {
        continue;
      }
      s.timer = 0;
    }
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
      const r = this.host.burstArea(e.radius);
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
      return { itemId: id, threshold: e.threshold, healTo: e.healTo, priority: e.priority, ready: e.cooldownSec > 0 ? s.cd <= 0 : !s.used };
    });
    const pick = pickHeal(cands, p.hp / p.maxHp);
    if (!pick) return;
    const e = this.each('lowHpHeal').find((x) => x.id === pick.itemId)!.e;
    const s = this.state(pick.itemId);
    if (e.cooldownSec > 0) s.cd = e.cooldownSec;
    else s.used = true;
    // 'healTo까지' — 추가가 아니라 그 비율까지 채운다
    p.hp = Math.max(p.hp, p.maxHp * pick.healTo);
    this.host.toast(this.host.ctx.t('item.healed', { item: this.host.ctx.t(`item.${pick.itemId}`) }));
  }

  /** 사망 직전: 부활 아이템 하나 소모 (아이템마다 따로, 한 번 사망에 하나만) */
  tryRevive(): boolean {
    for (const { id, e } of this.each('revive')) {
      const s = this.state(id);
      if (s.used) continue;
      s.used = true;
      const p = this.host.player();
      p.hp = p.maxHp;
      this.host.setInvuln(e.invulnSec, false);
      this.host.toast(this.host.ctx.t('item.revived'));
      return true;
    }
    return false;
  }

  onKill(): void {
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

  /** HUD '현재 버프': 임시 함성 */
  buffs(): BuffView[] {
    const out: BuffView[] = [];
    for (const { id, e } of this.each('tempRoar')) {
      const s = this.state(id);
      if (s.roarLeft > 0) out.push({ id: `item.${id}`, label: this.host.ctx.t('item.roar'), color: '#6a9a3a', leftSec: s.roarLeft, totalSec: this.host.buffDuration(e.durationSec) });
    }
    return out;
  }
}

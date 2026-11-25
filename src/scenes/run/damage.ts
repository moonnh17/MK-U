/** 플레이어 쪽 피해: 탄 명중·도탄, 태그·사거리 보너스를 더한 명중 처리, 피해 적용, 화상 번짐. */
import Phaser from 'phaser';
import { hexColor } from '../../core/scale';
import { Enemy } from '../../entities/enemy';
import { lowSanityBonus } from '../../systems/sanity';
import { damageKind } from '../../systems/juice';
import { calcDamage, spaceDamage } from '../../systems/damage';
import type { RangeBonus, TagBonus } from '../../systems/damage';
import { elementDamageMul, fullBurnSkillMul, staffDamageMul } from '../../systems/magiMage';
import { itemDamageMultiplier } from '../../systems/items';
import { chainTargets } from '../../systems/targeting';
import { corruptedDamage, skillChance } from '../../systems/acro';
import { hpStance } from '../../systems/vitals';
import { findSkill, masteryTotals } from '../../systems/skills';
import { addFireZone, FireZone } from '../../skills/baekonAwaken';
import { rollCrit } from '../../systems/weapons';
import type { BurnRule, SpaceRule, TagId } from '../../types/data';
import { applyBurn } from '../../systems/tags';
import { sfx } from './shared';
import type { RunScene } from '../RunScene';

export class DamageRuntime {
  constructor(private readonly run: RunScene) {}

  onBulletHit(b: Phaser.Physics.Arcade.Image, sprite: Phaser.Physics.Arcade.Image): void {
    const enemy = sprite.getData('enemy') as Enemy | undefined;
    if (!b.active || !enemy || enemy.dead) return;
    // 관통탄: 같은 적은 한 번만
    const hitSet = b.getData('hitSet') as Set<Enemy> | undefined;
    if (hitSet?.has(enemy)) return;
    const tags = b.getData('tags') as TagId[];
    const source = (b.getData('source') as string | null | undefined) ?? null;
    const base = this.run.combat.critRoll(b.getData('base') as number, (b.getData('crit') as number | undefined) ?? 0, enemy.sprite);
    const pierce = (b.getData('pierce') as number | undefined) ?? 0;
    const bounces = (b.getData('bounces') as number | undefined) ?? 0;
    if (bounces > 0) this.ricochet(b, enemy, bounces);
    else if (pierce > 0) {
      b.setData('pierce', pierce - 1);
      hitSet?.add(enemy);
    } else {
      b.destroy();
    }
    this.hit(enemy, base, tags, source);
  }

  /** 튕김: 아직 안 맞힌 가까운 적으로 방향을 바꾼다. 없으면 사라진다 */
  ricochet(b: Phaser.Physics.Arcade.Image, enemy: Enemy, bounces: number): void {
    const hitSet = b.getData('hitSet') as Set<Enemy>;
    hitSet.add(enemy);
    const list = this.run.enemies.filter((e) => !e.dead);
    const exclude = new Set(list.flatMap((e, i) => (hitSet.has(e) ? [i] : [])));
    const at = { x: enemy.sprite.x, y: enemy.sprite.y };
    const next = list[chainTargets(at, list.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })), 1, b.getData('bounceRange') as number, exclude)[0] ?? -1];
    if (!next) {
      b.destroy();
      return;
    }
    const body = b.body as Phaser.Physics.Arcade.Body;
    const a = Math.atan2(next.sprite.y - b.y, next.sprite.x - b.x);
    b.setVelocity(Math.cos(a) * body.speed, Math.sin(a) * body.speed);
    b.setRotation(a);
    b.setData({ bounces: bounces - 1, ox: b.x, oy: b.y });
  }

  /** 플레이어가 불길 장판 위에 서 있는지 (불길의 행군 각인 확장) */
  private onFireZone(): boolean {
    const p = this.run.player;
    return this.run.skillRt.skillObjects.some((o) => o instanceof FireZone && o.contains(p.x, p.y));
  }

  /** 피해 한 번. 태그 보정은 이 공격(source)의 태그로 계산한다 */
  hit(enemy: Enemy, base: number, tags: readonly TagId[], source: string | null = null): boolean {
    if (enemy.dead) return false;
    const d = this.run.ctx.data;
    // 끓어오르는 심장: 공격마다 기본 피해에 체력 비례 값을 더한다
    let dmg = calcDamage({ baseDamage: base + (this.run.skillRt.playerMods().flatDamage ?? 0), tags }, this.tagBonus(), d.tags, this.rangeBonus());
    // 신앙 강화: 성기사 계열(성기사 스킬·궁극기) 피해
    if (source && this.schoolOf(source) === 'paladin') dmg *= 1 + (masteryTotals(this.run.session.player.loadout, d.skills).paladinDamage ?? 0);
    // 개전 각인: 작열(화염 원소 직접 피해), 지팡이 공명(지팡이 무기), 점화(화상 꽉 찬 적에게 스킬 피해)
    const im = this.run.skillRt.imprint();
    if (im) {
      if (source) dmg *= elementDamageMul(d.skills.skills.find((s) => s.id === source)?.element, im, this.onFireZone());
      else dmg *= staffDamageMul(this.run.weaponDef().category, im, this.run.mage.returnedRecently());
      dmg *= fullBurnSkillMul(!!source, this.run.mage.burnFull(enemy), im);
    }
    // 원소 피해 아이템 (불씨나무 열매·고드름·아스트라페·나침반 등)
    const srcElement = this.run.mage.elementOf(source);
    if (srcElement) dmg *= 1 + this.run.itemRt.elementDamage(srcElement);
    // 시전 강화(대전·원소 순환), 원소 가호(원소 스킬 피해)
    dmg *= this.run.mage.boostMul(source);
    if (this.run.mage.elementOf(source)) for (const o of this.run.skillRt.skillObjects) dmg *= 1 + (o.elementDamage?.() ?? 0);
    // 관통 전개(마기 태그)·순수 전개(휘강파), 극단(스킬 치명)
    const srcSchool = source ? this.schoolOf(source) : null;
    dmg *= this.run.mage.damageMul(source, tags);
    const sc = this.run.mage.skillCrit(srcSchool);
    if (sc) {
      const r = rollCrit(this.run.rng, dmg, sc.chance, d.weapons.critMultiplier + this.run.itemRt.total('critDamage') + sc.bonus);
      dmg = r.damage;
      if (r.crit) this.run.combat.pendingCrit = true;
    }
    // 아이템: 피해 %(더한 뒤 한 번), 보스·적이 받는 피해·스킬 피해, 적중 효과(신검 공간격·참마검)
    const boss = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    const hm = this.run.itemRt.hitMods(this.run.rng, (c) => skillChance(c, 'success', ['chance'], d.tags));
    dmg *= itemDamageMultiplier(this.run.itemRt.sums, this.run.itemRt.extraDamageAll(), boss, source) * hm.mult;
    // 무기 고유 피해 (무기 공격만)
    const eb = source === null ? this.run.weaponDef().equipBonus : undefined;
    if (eb?.bossDamage && boss) dmg *= 1 + eb.bossDamage;
    const school = this.run.session.player.advancement;
    if (school && eb?.jobDamage?.[school]) dmg *= 1 + eb.jobDamage[school]!;
    // 어느 전사의 기억 · 아트로스 비석 필사본
    const sp = this.run.session.player;
    if (this.run.combat.buffLeft > 0) dmg *= 1 + this.run.combat.buffDamage;
    dmg *= 1 + (this.run.skillRt.playerMods().damage ?? 0);
    const stance = this.run.itemRt.first('hpStance');
    if (stance) dmg *= 1 + hpStance(sp.hp, sp.maxHp, stance).damage;
    // 선혈기수: 체력이 낮은 적에게 피해 증가
    const lowHp = this.run.itemRt.first('lowHpEnemyDamage');
    if (lowHp && enemy.hp <= enemy.maxHp * lowHp.threshold) dmg *= 1 + lowHp.value;
    const low = this.run.itemRt.first('lowSanityDamage');
    if (low) dmg *= 1 + lowSanityBonus(sp.sanity, sp.sanityMax, low.maxDamage);
    const space = tags.includes('space') || hm.space;
    if (space) dmg = spaceDamage(enemy.rank, enemy.maxHp, dmg, this.run.tagRule<SpaceRule>('space'));
    const crit = this.run.combat.pendingCrit;
    this.run.combat.pendingCrit = false;
    const killed = this.applyDamage(enemy, corruptedDamage(dmg, enemy.corruption), source, { tags, crit, space });
    this.run.mage.onHit(enemy, source, killed, base, tags);
    // 신성한 이코르: 근접 공격이 맞으면 확률로 출혈
    const mb = this.run.itemRt.first('meleeBleed');
    if (mb && !killed && tags.includes('melee') && this.run.rng.chance(mb.chance)) this.run.host.bleed(enemy, mb.stacks);
    // 새벽불길: 근접 공격이 맞으면 확률로 화상
    const mf = this.run.itemRt.first('meleeBurn');
    if (mf && !killed && tags.includes('melee') && this.run.rng.chance(mf.chance)) this.run.host.burn(enemy, mf.stacks);
    return killed;
  }

  /** 계산이 끝난 피해를 넣는다. 환원주의자 등에게 알리고, 죽였으면 true */
  /** fx: 타격(태그·치명·공간격). 없으면 출혈·변질 같은 지속 피해(작은 회색 숫자, 불꽃 없음) */
  applyDamage(enemy: Enemy, dmg: number, source: string | null = null, fx?: { tags: readonly TagId[]; crit: boolean; space: boolean }): boolean {
    if (enemy.dead) return false;
    // 보스 강화 단계 진입 중 무적
    if (enemy.invuln > 0) return false;
    dmg *= enemy.takenMul;
    const dealt = Math.min(Math.max(0, enemy.hp), dmg);
    const killed = enemy.damage(dmg);
    // 타격감: 피해 숫자, 불꽃·찌그러짐, 근접·치명 히트스톱
    const top = { x: enemy.sprite.x, y: enemy.sprite.y - enemy.radius };
    const bossHit = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    this.run.juice.damageNumber(top, dmg, damageKind({ crit: fx?.crit, space: fx?.space, dot: !fx }), bossHit);
    if (fx) {
      // 근접 타격은 피해에 맞는 무게, 쏘는 공격은 탄 맞는 소리
      if (fx.crit) sfx('crit');
      else if (fx.tags.includes('melee')) sfx('hit', dmg);
      else sfx('hitBullet');
      this.run.juice.hitSpark({ x: enemy.sprite.x, y: enemy.sprite.y }, fx.tags);
      enemy.squash();
      const hs = this.run.ctx.data.juice.hitStop;
      if (fx.tags.includes('melee')) this.run.hitStop.request(hs.melee);
      if (fx.crit) this.run.hitStop.request(hs.crit);
    }
    for (const o of [...this.run.skillRt.skillObjects]) o.onDamageDealt?.(this.run.host, dealt, enemy);
    // 아이템 피해 흡혈 (과기전쟁의 일기) + 스킬 흡혈 (전장의 함성)
    const steal = this.run.itemRt.sums.lifesteal + (this.run.skillRt.playerMods().lifesteal ?? 0);
    if (steal > 0 && dealt > 0) this.run.host.heal(dealt * steal, false);
    if (killed) {
      this.run.mage.onKill(enemy);
      // 화산 용광로의 잔불: 화염 공격으로 쓰러뜨린 자리에 잔불 장판
      const kz = this.run.itemRt.first('fireKillZone');
      if (kz && this.run.mage.elementOf(source) === 'fire') {
        const host = this.run.skillRt.hostFor('volcanoFurnaceEmber');
        const zone = findSkill(this.run.ctx.data.skills, 'fireWall').sprites.zone!;
        const at = { x: enemy.sprite.x, y: enemy.sprite.y };
        addFireZone(host, 10, (h) => new FireZone(h, zone, at, { sec: kz.durationSec, tickSec: kz.everySec, damage: kz.damage, burnStacks: 1, tags: ['magic', 'ranged'], radius: kz.radius }));
      }
      this.spreadBurn(enemy);
      this.run.enemyLife.onEnemyKilled(enemy);
    }
    return killed;
  }

  /** 새벽불길(번지는 불): 화상 걸린 적이 죽으면 그 중첩이 가장 가까운 적에게 옮겨붙는다 */
  spreadBurn(dead: Enemy): void {
    const e = this.run.itemRt.first('burnSpread');
    const b = dead.burn;
    if (!e || !b) return;
    let best: Enemy | null = null;
    let bestD = e.radius;
    for (const x of this.run.enemies) {
      if (x.dead || x === dead) continue;
      const d = Math.hypot(x.sprite.x - dead.sprite.x, x.sprite.y - dead.sprite.y) - x.radius;
      if (d <= bestD) {
        best = x;
        bestD = d;
      }
    }
    if (!best) return;
    const rule = this.run.tagRule<BurnRule>('burn');
    best.burn = applyBurn(best.burn, b.damagePerStack, b.stacks, rule, best.rank === 'boss' || best.rank === 'hiddenBoss');
    // 불씨가 날아가 옮겨붙는 줄
    const g = this.run.add.graphics().setDepth(5);
    g.lineStyle(1, hexColor(this.run.ctx.data.juice.status.burn.colors[1]!), 1).lineBetween(dead.sprite.x, dead.sprite.y, best.sprite.x, best.sprite.y);
    this.run.tweens.add({ targets: g, alpha: 0, duration: 250, onComplete: () => g.destroy() });
  }

  /** 태그별 피해 증가: 아이템 + 들고 있는 무기 */
  tagBonus(): TagBonus {
    const it = this.run.itemRt.sums.damage;
    return { physical: it.physical + (this.run.weaponDef().equipBonus?.physicalDamage ?? 0), magic: it.magic, tech: it.tech };
  }

  /** 근접·원거리 피해 증가: 들고 있는 무기 + 아이템 + 무기 숙련 + 전장의 함성 (같은 종류라 더한다) */
  rangeBonus(): RangeBonus {
    const b = this.run.weaponDef().equipBonus;
    const it = this.run.itemRt.sums.damage;
    const mastery = masteryTotals(this.run.session.player.loadout, this.run.ctx.data.skills).meleeDamage ?? 0;
    const skill = this.run.skillRt.playerMods().meleeDamage ?? 0;
    return { melee: (b?.meleeDamage ?? 0) + it.melee + mastery + skill, ranged: (b?.rangedDamage ?? 0) + it.ranged };
  }

  /** 피해를 준 스킬·궁극기의 계열 (무기·아이템이면 null) */
  schoolOf(source: string): string | null {
    const d = this.run.ctx.data;
    return d.skills.skills.find((s) => s.id === source)?.school ?? d.ultimates.ultimates.find((u) => u.id === source)?.school ?? null;
  }
}

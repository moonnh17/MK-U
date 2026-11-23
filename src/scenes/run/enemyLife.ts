/** 적 처치(보상·기록·집정관 흡수)와 제거, 변질·출혈 같은 적 상태의 매 프레임 처리. */
import { loopArt, playFx } from '../../skills/skillFx';
import { sfx } from './shared';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { hexColor } from '../../core/scale';
import { Enemy } from '../../entities/enemy';
import { DelayedBlast } from '../../entities/hazard';
import { Pickup } from '../../entities/pickup';
import { rollCoinDrops } from '../../systems/loot';
import { rollShard } from '../../systems/runRecord';
import { inSpireCircle } from '../../systems/spire';
import { corruptedDamage, tickCorruption } from '../../systems/acro';
import { tickBleed, tickBurn } from '../../systems/tags';
import type { BleedRule, BurnRule } from '../../types/data';
import type { RunScene } from '../RunScene';

export class EnemyLife {
  constructor(private readonly run: RunScene) {}

  onEnemyKilled(e: Enemy): void {
    const d = this.run.ctx.data;
    const roomId = this.run.enemyRoom.get(e);
    const { x, y } = e.sprite;
    const drop = (kind: 'energy' | 'coin', count: number) => {
      const n = kind === 'coin' ? rollCoinDrops(this.run.rng, count, d.pickups.coin.dropRate) : count;
      // 보스가 부른 적은 보상이 없다
      if (e.noReward) return;
      const pop = d.juice.death;
      for (let i = 0; i < n; i++) {
        const a = this.run.rng.range(0, Math.PI * 2);
        const r = this.run.rng.range(0, d.pickups.scatterRadius);
        // 쓰러진 자리에서 사방으로 튀어 나가 내려앉는다
        const pk = new Pickup(this.run, kind, x, y, d.pickups);
        const pr = Math.max(r, pop.orbPopPx[0]) + this.run.rng.range(0, pop.orbPopPx[1] - pop.orbPopPx[0]);
        this.run.tweens.add({ targets: pk.sprite, x: x + Math.cos(a) * pr, y: y + Math.sin(a) * pr, duration: pop.orbPopSec * 1000, ease: 'Back.easeOut' });
        this.run.pickups.push(pk);
      }
    };
    // 처치 연출: 번쩍임·파편, 엘리트·정예·보스는 폭발·흔들림·히트스톱
    const big = e.elites.length > 0 || e.rank === 'champion' || e.rank === 'boss' || e.rank === 'hiddenBoss';
    this.run.juice.death(e.sprite, e.def.color, big);
    sfx(big ? 'killBig' : 'kill');
    if (big) this.run.hitStop.request(e.rank === 'boss' || e.rank === 'hiddenBoss' ? d.juice.hitStop.bossKill : d.juice.hitStop.eliteKill);
    if (this.run.bossControllers.has(e)) this.run.stageFx.startBossKill({ x, y });
    this.recordKill(e);
    // 집정관: 같은 방에서 죽은 적의 에너지를 흡수한다 (그 적의 에너지 구슬은 떨어지지 않음)
    const absorbed = this.archonAbsorb(e, roomId);
    if (!absorbed) drop('energy', this.run.rng.int(e.def.energyOrbs[0], e.def.energyOrbs[1]));
    drop('coin', this.run.rng.int(e.def.coins[0], e.def.coins[1]));
    // 엘리트마다 추가 보상 (2종이 겹친 개체는 두 번)
    for (const _ of e.elites) {
      const c = d.elites.common;
      if (!absorbed) drop('energy', this.run.rng.int(c.bonusEnergyOrbs[0], c.bonusEnergyOrbs[1]));
      drop('coin', this.run.rng.int(c.bonusCoins[0], c.bonusCoins[1]));
    }
    // 정예·엘리트: 낮은 확률로 무기 상자 (보스가 부른 적은 보상 없음)
    if ((e.rank === 'champion' || e.elites.length > 0) && !e.noReward) {
      const { stage } = this.run.session;
      const chestRng = Rng.derive(this.run.ctx.config.seed, `champion-chest-${stage.chapter}-${stage.stage}-${this.run.loot.lootSeq++}`);
      if (chestRng.chance(d.waves.champions.weaponChestChance)) this.run.loot.addCombatChest(x, y, 'champion');
    }
    // 첨탑: 원 안에서 잡으면 충전 (결과는 다음 프레임에 처리)
    const sp = roomId === undefined ? undefined : this.run.encounters.spires.find((x) => x.roomId === roomId);
    if (sp) {
      for (const ev of sp.state.onKill(e.rank, inSpireCircle(x - sp.x, y - sp.y, sp.radius, e.radius))) this.run.encounters.spireEvents.push({ sp, e: ev });
    }
    this.removeEnemy(e);
    if (roomId !== undefined) this.run.rooms.get(roomId)?.enemyKilled();
    for (const o of [...this.run.skillRt.skillObjects]) o.onKill?.(this.run.host, e);
    this.run.itemRt.onKill(e.elite !== null);
    // 폭발 엘리트: 예고 원 후 지연 폭발 (반역 개체가 된 경우는 제외)
    const bl = e.elites.find((x) => x.deathBlast);
    if (bl?.deathBlast && !e.converted) {
      this.run.hazards.push(new DelayedBlast(this.run, { x, y }, bl.deathBlast.radius, bl.deathBlast.delaySec, bl.deathBlast.damage, hexColor(bl.color)));
    }
    // 마기 변질: 변질된 채 죽으면 폭발
    const c = e.corruption;
    if (c) {
      e.corruption = null;
      if (c.fx) {
        playFx(this.run, c.fx.burst, x, y, { w: c.burstRadius * 2.2 });
        if (c.fx.shards) playFx(this.run, c.fx.shards, x, y, { w: c.burstRadius * 2.6 });
      } else this.run.fxAt(this.run.add.circle(x, y, c.burstRadius, hexColor(d.ui.corruptionColor), 0.4).setDepth(6));
      for (const o of [...this.run.enemies]) {
        if (Math.hypot(o.sprite.x - x, o.sprite.y - y) <= c.burstRadius + o.radius) this.run.damage.hit(o, c.burstDamage, c.burstTags);
      }
      const b = c.bullets;
      if (b) for (let k = 0; k < b.count; k++) this.run.combat.fireBullet({ x, y }, (k / b.count) * Math.PI * 2, b.speed, b.range, b.damage, c.burstTags, 'magiCorruption', { pierce: 0, crit: 0, sprite: b.sprite });
    }
  }

  /** 집정관 흡수: 같은 방의 살아 있는 집정관 중 가장 가까운 하나가 죽은 적의 최대 체력만큼. 흡수했으면 true */
  archonAbsorb(dead: Enemy, roomId: number | undefined): boolean {
    if (roomId === undefined) return false;
    const { x, y } = dead.sprite;
    const archons = this.run.enemies.filter((a) => a !== dead && !a.dead && a.def.absorb && this.run.enemyRoom.get(a) === roomId);
    const a = archons.sort((p, q) => Math.hypot(p.sprite.x - x, p.sprite.y - y) - Math.hypot(q.sprite.x - x, q.sprite.y - y))[0];
    if (!a) return false;
    const stage = a.absorb(dead.maxHp);
    const line = this.run.add.line(0, 0, x, y, a.sprite.x, a.sprite.y, hexColor(a.def.absorb!.haloColor), 0.6).setOrigin(0, 0).setDepth(6);
    this.run.fxAt(line);
    if (stage !== null) this.run.floatLabel({ x: a.sprite.x, y: a.sprite.y - a.radius - 6 }, this.run.ctx.t('enemy.archon.stage', { n: stage }), a.def.absorb!.haloColor);
    return true;
  }

  /** 변질 시간, 변질된 적 색·표식 */
  updateCorruption(dt: number): void {
    const color = hexColor(this.run.ctx.data.ui.corruptionColor);
    for (const e of this.run.enemies) {
      if (!e.corruption || e.dead) continue;
      const fx = e.corruption.fx;
      e.corruption = tickCorruption(e.corruption, dt);
      if (!e.corruption) {
        e.sprite.clearTint();
        if (fx?.end) playFx(this.run, fx.end, e.sprite.x, e.sprite.y, { w: e.radius * 3 });
        continue;
      }
      if (!e.sprite.tintFill) e.sprite.setTint(color);
      if (fx && !this.run.corruptMarks.has(e)) {
        const m = this.run.add.sprite(e.sprite.x, e.sprite.y, fx.mark.spriteKey).setDepth(5).setAlpha(0.85);
        m.setDisplaySize(Math.max(e.radius * 2.6, 14), Math.max(e.radius * 2.6, 14));
        loopArt(m, fx.mark);
        this.run.corruptMarks.set(e, m);
      }
    }
    for (const [e, m] of this.run.corruptMarks) {
      if (e.corruption && !e.dead && e.sprite.active) m.setPosition(e.sprite.x, e.sprite.y);
      else {
        m.destroy();
        this.run.corruptMarks.delete(e);
      }
    }
  }

  removeEnemy(e: Enemy): void {
    if (e === this.run.darknessBoss) {
      this.run.darkness?.lift();
      this.run.darkness = null;
      this.run.darknessBoss = null;
    }
    this.run.bossControllers.get(e)?.destroy();
    this.run.bossControllers.delete(e);
    this.run.enemies = this.run.enemies.filter((x) => x !== e);
    this.run.enemyRoom.delete(e);
    e.destroy();
  }

  updateBleeds(dt: number): void {
    const rule = this.run.tagRule<BleedRule>('bleed');
    for (const e of [...this.run.enemies]) {
      if (!e.bleed || e.dead) continue;
      const out = tickBleed(e.bleed, dt, rule);
      e.bleed = out.state;
      if (out.damage > 0) this.run.damage.applyDamage(e, corruptedDamage(out.damage, e.corruption));
    }
    const burnRule = this.run.tagRule<BurnRule>('burn');
    for (const e of [...this.run.enemies]) {
      if (!e.burn || e.dead) continue;
      const out = tickBurn(e.burn, dt, burnRule);
      e.burn = out.state;
      if (out.damage > 0) this.run.damage.applyDamage(e, corruptedDamage(out.damage, e.corruption));
    }
  }

  /** 결산 기록: 처치·엘리트·보스·히든보스, 보스는 과거의 기억 조각 판정 (분신 등 소환된 적은 세지 않는다) */
  recordKill(e: Enemy): void {
    if (e.def.summon || e.noReward) return;
    const r = this.run.session.player.record;
    r.kills++;
    if (e.elite) r.eliteKills++;
    const { stage } = this.run.session;
    let shardKind: 'boss' | 'hiddenBoss' | null = null;
    if (e.rank === 'boss' && this.run.ctx.data.bosses.bosses.some((b) => b.id === e.def.id)) {
      r.bossKills.push({ id: e.def.id, stage: stage.stage });
      this.run.progression.say('bossKill', e.def.id);
      shardKind = 'boss';
    } else if (e.rank === 'hiddenBoss') {
      r.hiddenBossKills.push(e.def.id);
      shardKind = 'hiddenBoss';
    }
    if (!shardKind) return;
    const save = this.run.ctx.save;
    const mem = this.run.ctx.data.meta.memory;
    const rng = Rng.derive(this.run.ctx.config.seed, `shard-${stage.chapter}-${stage.stage}-${e.def.id}`);
    if (!rollShard(rng, shardKind, save.data.pastShards, mem)) return;
    // 과거의 기억: 얻는 즉시 영구 보관
    save.data.pastShards++;
    save.write();
    r.shards++;
    bus.emit('toast', { text: this.run.ctx.t('memory.shardGot', { have: save.data.pastShards, slots: mem.pastSlots }) });
  }
}

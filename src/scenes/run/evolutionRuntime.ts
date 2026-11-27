/**
 * 오버플로우 적 진화 (전투 씬 부품): 소환 때 진화 수치 적용, 웨이브 군체 증식·유니크 변형,
 * 처치 때 폭발·분열·포식, 진화 카드 보상. 수치·규칙은 systems/evolution.ts(순수 함수).
 */
import { bus } from '../../core/events';
import { hexColor } from '../../core/scale';
import { Rng } from '../../core/rng';
import type { Enemy } from '../../entities/enemy';
import { DelayedBlast } from '../../entities/hazard';
import type { Wave } from '../../systems/roomState';
import { deathBlastKind, evolutionTargetOf, evolvedStats, evolvedWave, findReward, pickEvolution, shouldSplit, uniqueSpawns, type EvolutionCard, type EvolvedStats } from '../../systems/evolution';
import { rollItem } from '../../systems/items';
import type { EnemyDef } from '../../types/data';
import type { RunScene } from '../RunScene';

export class EvolutionRuntime {
  /** 지금 예고 중인 진화·유니크 폭발 수 (상한) */
  private blasts = 0;
  private seq = 0;

  constructor(private readonly run: RunScene) {}

  private get E() {
    return this.run.ctx.data.overflow.evolution;
  }

  /** 오버플로우 런이 아니면 null */
  private get state() {
    return this.run.session.player.overflow?.evolution ?? null;
  }

  /** 이 적이 받을 진화 수치 */
  statsFor(def: EnemyDef): EvolvedStats | null {
    const st = this.state;
    if (!st) return null;
    return evolvedStats(st, evolutionTargetOf(def, this.E), this.E);
  }

  /** 소환 직후: 진화를 입힌다. 보스는 피해 배율을 돌려줘 보스 컨트롤러에 곱하게 한다 */
  onSpawn(enemy: Enemy): number {
    const s = this.statsFor(enemy.def);
    if (!s) return 1;
    const boss = enemy.def.ai === 'boss';
    enemy.applyEvolution(s, !boss);
    return boss ? s.damageMul : 1;
  }

  /** 웨이브: 군체 증식(적 수) + 고른 유니크 변형 (맵·장과 상관없이) */
  expandWave(rng: Rng, wave: Wave): Wave {
    const st = this.state;
    if (!st) return wave;
    const mul = evolvedStats(st, 'common', this.E).countMul;
    return evolvedWave(rng, wave, mul, uniqueSpawns(rng, st, this.E), this.E.caps.maxWave);
  }

  update(dt: number): void {
    for (const e of this.run.enemies) e.tickEvolution(dt);
  }

  /** 진화 탄 상한 */
  bulletRoom(n: number): boolean {
    return this.run.enemyBullets.countActive(true) + n <= this.E.caps.evoBullets;
  }

  /** 처치: 대폭발(유니크 우선)·폭발성 조직, 분열, 포식 */
  onKilled(e: Enemy, x: number, y: number, roomId: number | undefined): void {
    if (!this.state) return;
    const caps = this.E.caps;
    const kind = deathBlastKind(!!e.def.deathBlast, e.evo, e.converted);
    if (kind && this.blasts < caps.evoBlasts) {
      const b = kind === 'unique' ? e.def.deathBlast! : e.evo.explode!;
      this.blasts++;
      this.run.hazards.push(new DelayedBlast(this.run, { x, y }, b.radius, b.warnSec, b.damage * e.damageMul, hexColor(b.color)));
      this.run.time.delayedCall((b.warnSec + 0.3) * 1000, () => this.blasts--);
    }
    const rng = Rng.derive(this.run.ctx.config.seed, `evo-split-${this.run.session.stage.chapter}-${this.run.session.stage.stage}-${this.seq++}`);
    const alive = this.run.enemies.filter((o) => o.splitChild && !o.dead).length;
    if (roomId !== undefined && shouldSplit(rng, e.evo, e.splitChild, alive, caps.splitAlive)) {
      const sp = e.evo.split!;
      for (let i = 0; i < sp.count; i++) {
        const child = this.run.roomRt.spawnEnemy(e.def.id, roomId, rng, true);
        child.splitChild = true;
        child.noReward = true;
        child.setMaxHp(child.maxHp * sp.hpMul);
        child.setExtraScale((e.def.artScale ?? 1) * sp.scale);
        child.sprite.setPosition(x + (i === 0 ? -6 : 6), y);
      }
      this.run.rooms.get(roomId)?.addAlive(sp.count);
    }
    // 포식 본능: 같은 방에서 가까운 적이 강해진다
    for (const o of this.run.enemies) {
      if (o === e || o.dead || !o.evo.predator || this.run.enemyRoom.get(o) !== roomId) continue;
      if (Math.hypot(o.sprite.x - x, o.sprite.y - y) <= o.evo.predator.radius) o.feed();
    }
  }

  /** 진화 카드를 골랐다: 진화 저장(다음 스테이지부터) + 보상 */
  pick(card: EvolutionCard, then: () => void): void {
    const p = this.run.session.player;
    if (!p.overflow) return then();
    const E = this.E;
    p.overflow = { ...p.overflow, evolution: pickEvolution(p.overflow.evolution, card, E) };
    const r = findReward(E, card.rewardId);
    const t = this.run.ctx.t;
    const toast = (text: string) => bus.emit('toast', { text });
    if (!r) return then();
    switch (r.kind) {
      case 'coins':
        p.coins += r.amount;
        break;
      case 'heal':
        p.hp = Math.min(p.maxHp, p.hp + p.maxHp * r.amount);
        break;
      case 'crystals':
        p.record.bonusCrystals += r.amount;
        break;
      case 'weaponChest':
        p.overflow.pendingDrops = [...p.overflow.pendingDrops, { kind: 'weapon', tier: r.tier }];
        break;
      case 'itemChest':
        p.overflow.pendingDrops = [...p.overflow.pendingDrops, { kind: 'item', weights: r.weights }];
        break;
      case 'item': {
        // 신화는 카드 보상으로 나오지 않는다 (신화 판정 0)
        const rng = Rng.derive(this.run.ctx.config.seed, `evo-item-${this.run.session.stage.chapter}-${this.run.session.stage.stage}-${this.seq++}`);
        const id = rollItem(rng, r.weights, 0, this.run.ctx.data.items, new Set(p.itemsObtained));
        if (id) this.run.loot.giveItem(id);
        break;
      }
      case 'skillCard':
        this.run.progression.offerQueue.unshift(...Array.from({ length: r.amount }, () => ({ kind: 'skill' as const, boss: false })));
        break;
      case 'skillLevelUp': {
        const max = this.run.ctx.data.skills.maxLevel;
        const ids = Object.entries(p.loadout.owned)
          .filter(([, o]) => o.level < max)
          .map(([id]) => id);
        if (ids.length > 0) {
          const rng = Rng.derive(this.run.ctx.config.seed, `evo-skill-${this.run.session.stage.chapter}-${this.run.session.stage.stage}-${this.seq++}`);
          this.run.progression.grantCard({ kind: 'skillLevelUp', skillId: rng.pick(ids) }, then);
          return;
        }
        // 올릴 스킬이 없으면 코인으로
        p.coins += E.rewards.rare.find((x) => x.kind === 'coins')?.amount ?? 0;
        break;
      }
    }
    toast(t('evo.picked', { name: t(`evo.${card.evoId}.name`) }));
    then();
  }

  /** 스테이지 시작: 진화 카드 보상 상자를 시작방에 놓는다 */
  dropPending(at: { x: number; y: number }): void {
    const ovf = this.run.session.player.overflow;
    if (!ovf || ovf.pendingDrops.length === 0) return;
    const loot = this.run.ctx.data.loot;
    const gap = this.E.dropOffsetPx;
    ovf.pendingDrops.forEach((drop, i) => {
      const x = at.x + (i - (ovf.pendingDrops.length - 1) / 2) * gap;
      const y = at.y - gap;
      if (drop.kind === 'weapon') {
        const tier = loot.weaponChestTiers[drop.tier as keyof typeof loot.weaponChestTiers];
        if (tier) this.run.loot.addChest('weapon', x, y, tier.weights, { ref: tier.sprite, nameKey: tier.nameKey, noMythic: true });
      } else {
        this.run.loot.addChest('item', x, y, drop.weights, { noMythic: true });
      }
    });
    ovf.pendingDrops = [];
  }
}

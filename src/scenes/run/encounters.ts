/** 조우 칸: 유형 결정, 마기수집첨탑, 습격·히든보스 보상. */
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { MerchantStand } from '../../entities/chest';
import { Spire } from '../../entities/spire';
import { Pickup } from '../../entities/pickup';
import { assignElites, eliteCount, pickTwoElites } from '../../systems/elites';
import { IMPLEMENTED_ENCOUNTERS } from '../../systems/encounter';
import { encounterPool, merchantStock, rollCoinDrops, rollEncounter } from '../../systems/loot';
import { encounterKinds, pickHiddenBoss } from '../../systems/hiddenBoss';
import { chapterWeights } from '../../systems/items';
import { spireEliteCount, spireSize, type SpireEvent } from '../../systems/spire';
import { planCombatWaves, RoomState } from '../../systems/roomState';
import { roomCenter } from '../../systems/worldLayout';
import type { EncounterKindId, HiddenBossDef } from '../../types/data';
import type { RunScene } from '../RunScene';

export class Encounters {
  /** 마기수집첨탑 (조우 칸 하나에 하나) */
  spires: Spire[] = [];
  /** 강적이 나올 중형·대형 첨탑 (첫 무리 때 소환) */
  spireStrong = new Set<Spire>();
  /** 처치 중에 생긴 첨탑 이벤트 (다음 updateSpires에서 처리) */
  spireEvents: { sp: Spire; e: SpireEvent }[] = [];
  /** 대규모 습격이 벌어진 조우 칸 */
  raidRooms = new Set<number>();
  /** 히든보스가 나온 조우 칸 → 그 히든보스 */
  hiddenBossRooms = new Map<number, HiddenBossDef>();
  /** 디버그: 다음 히든보스 지정 */
  forcedHiddenBoss: string | null = null;
  /** 디버그: 다음 조우 칸 유형 강제 */
  forcedEncounter: EncounterKindId | null = null;

  constructor(private readonly run: RunScene) {}

  /** 조우 칸 안쪽에 들어선 순간 코어가 열리며 유형이 정해진다 */
  resolveEncounter(roomId: number): void {
    const d = this.run.ctx.data;
    const { map, stage } = this.run.session;
    const node = map.rooms[roomId]!;
    const rng = Rng.derive(this.run.ctx.config.seed, `encounter-${stage.chapter}-${stage.stage}-${roomId}`);
    const met = this.run.session.player.hiddenBossesMet;
    const kind = this.forcedEncounter ?? rollEncounter(rng, d.loot.encounter.weights, encounterPool(encounterKinds(IMPLEMENTED_ENCOUNTERS, d.bosses.hiddenBosses, met), !!node.peaceful));
    this.forcedEncounter = null;
    this.run.session.encounters.set(roomId, kind);
    const c = roomCenter(node, this.run.m);
    for (const core of this.run.cores.filter((x) => x.roomId === roomId)) {
      this.run.tweens.add({ targets: core.sprite, alpha: 0, scale: 1.6, duration: 300, onComplete: () => core.sprite.destroy() });
    }
    this.run.cores = this.run.cores.filter((x) => x.roomId !== roomId);
    bus.emit('toast', { text: this.run.ctx.t(`encounter.${kind}`) });

    if (kind === 'treasure') {
      this.run.loot.addChest('item', c.x, c.y, chapterWeights(d.items.treasureWeights, this.run.session.stage.chapter));
    } else if (kind === 'merchant') {
      const stock = merchantStock(rng, d.loot, d.weapons.weapons, d.weapons.options, d.groupMultipliers);
      stock.forEach((s, i) => {
        const x = c.x + (i - (stock.length - 1) / 2) * d.loot.standSpacing;
        const def = this.run.weaponDefOf(s.weapon.defId);
        const label = `${this.run.loot.weaponName(s.weapon)}\n${this.run.ctx.t('merchant.price', { price: s.price })}`;
        this.run.loot.stands.push(new MerchantStand(this.run, s, d.loot.merchantStand, def.spriteKey, x, c.y, label, this.run.loot.gradeColor(s.weapon.grade)));
      });
    } else if (kind === 'combiner') {
      this.run.loot.addCombiner(c.x, c.y);
    } else if (kind === 'skillShop') {
      this.run.loot.openCardShop(this.run.progression.drawShopCards(rng), c);
    } else if (kind === 'raid') {
      // 전투 칸보다 웨이브·적 수가 많고, 웨이브마다 엘리트 2마리
      const r = d.loot.raid;
      const waves = planCombatWaves(rng, map.chapter, r.waves, d.waves).map((w) => {
        const n = Math.round(w.length * r.sizeMul);
        return Array.from({ length: n }, (_, i) => w[i % w.length]!);
      });
      const state = new RoomState('encounterRoom', waves, d.waves.waveDelaySec);
      this.run.rooms.set(roomId, state);
      this.raidRooms.add(roomId);
      this.run.handleRoomEvents(roomId, state.enter());
    } else if (kind === 'hiddenBoss') {
      // 경고 없이 바로 보스전: 아직 안 나온 히든보스 중 하나 (디버그 지정이면 그것)
      const p = this.run.session.player;
      const forced = d.bosses.hiddenBosses.find((h) => h.id === this.forcedHiddenBoss);
      this.forcedHiddenBoss = null;
      const hb = forced ?? pickHiddenBoss(rng, d.bosses.hiddenBosses, p.hiddenBossesMet) ?? rng.pick(d.bosses.hiddenBosses);
      if (!p.hiddenBossesMet.includes(hb.id)) p.hiddenBossesMet = [...p.hiddenBossesMet, hb.id];
      this.run.progression.say('hiddenBoss', hb.id);
      const state = new RoomState('encounterRoom', [[hb.id]], d.waves.waveDelaySec);
      this.run.rooms.set(roomId, state);
      this.hiddenBossRooms.set(roomId, hb);
      this.run.handleRoomEvents(roomId, state.enter());
    } else if (kind === 'magiSpire') {
      // 첨탑이 방 가운데로 떨어지고 문이 잠긴다
      this.run.setRoomLocked(roomId, true);
      const size = spireSize(rng, stage.chapter, stage.stage, d.loot.spire);
      const spire = new Spire(this.run, roomId, c.x, c.y, d.loot.spire, size);
      // 중형·대형: 75% 확률로 강적 1마리 (첫 무리와 함께)
      if (size !== 'small' && rng.chance(d.loot.spire.medium.strongChance)) this.spireStrong.add(spire);
      this.spires.push(spire);
    }
  }

  updateSpires(dt: number): void {
    for (const { sp, e } of this.spireEvents.splice(0)) this.handleSpireEvents(sp, [e]);
    for (const sp of this.spires) {
      if (sp.state.phase === 'done') continue;
      const alive = this.run.enemies.filter((e) => !e.dead && this.run.enemyRoom.get(e) === sp.roomId).length;
      this.handleSpireEvents(sp, sp.state.update(dt, alive));
      sp.draw();
    }
  }

  handleSpireEvents(sp: Spire, events: SpireEvent[]): void {
    const t = this.run.ctx.t;
    for (const e of events) {
      if (e.type === 'landed') {
        sp.land();
        bus.emit('toast', { text: t('spire.landed') });
      } else if (e.type === 'spawn') {
        this.spawnSpireBatch(sp, e.index);
      } else if (e.type === 'charged') {
        // 상승: 남은 적은 보상 없이 사라진다
        bus.emit('toast', { text: t('spire.charged') });
        for (const en of this.run.enemies.filter((x) => this.run.enemyRoom.get(x) === sp.roomId)) this.run.removeEnemy(en);
        sp.rise();
      } else {
        this.run.setRoomLocked(sp.roomId, false);
        this.run.session.player.record.spires++;
        this.offerSpireItems(sp);
      }
    }
  }

  /** 방해 무리: 현재 챕터 웨이브 하나, 엘리트는 평소의 eliteMul배 (헥타르 전투원은 M6) */
  spawnSpireBatch(sp: Spire, index: number): void {
    const d = this.run.ctx.data;
    const { map } = this.run.session;
    const seed = this.run.ctx.config.seed;
    const label = `spire-${map.chapter}-${map.stage}-${sp.roomId}-${index}`;
    const wave = planCombatWaves(Rng.derive(seed, `${label}-wave`), map.chapter, [1, 1], d.waves)[0]!;
    const normal = eliteCount(Rng.derive(seed, `${label}-elite-count`), map.chapter, map.stage, d.elites);
    const elites = assignElites(
      Rng.derive(seed, `${label}-elite`),
      wave,
      spireEliteCount(normal, d.loot.spire.eliteMul),
      (id) => d.enemies.enemies.find((e) => e.id === id)!.rank,
      d.elites,
    );
    const rng = Rng.derive(seed, label);
    wave.forEach((id, i) => this.run.spawnEnemy(id, sp.roomId, rng, true, elites[i] ?? null));
    if (this.spireStrong.delete(sp)) this.spawnSpireStrong(sp, rng);
    // 원본 첨탑 규칙: 헥타르 전투원이 항상 섞여 나온다
    const tr = d.loot.spire.troopers;
    const n = rng.int(tr.count[0], tr.count[1]);
    for (let i = 0; i < n; i++) this.run.spawnEnemy(tr.enemy, sp.roomId, rng, true);
  }

  /** 중형 첨탑 강적: 정예가 나오는 챕터(3장)는 집행자 또는 집정관, 그 전에는 엘리트 2종이 겹친 지금 챕터 일반 적 */
  spawnSpireStrong(sp: Spire, rng: Rng): void {
    const d = this.run.ctx.data;
    if (d.waves.champions.stages[String(this.run.session.stage.chapter)]) {
      this.run.spawnEnemy(rng.pick(d.waves.champions.ids), sp.roomId, rng, true);
      this.run.progression.say('championMet');
      return;
    }
    const roster = this.run.chapterRoster();
    if (roster.length === 0) return;
    const [a, b] = pickTwoElites(rng, d.elites);
    this.run.spawnEnemy(rng.pick(roster), sp.roomId, rng, true, a, b);
  }

  /** 충전 완료 보상: 크기별 횟수만큼 아이템 카드 3장 중 1장 (보물 상자 가중치) */
  offerSpireItems(sp: Spire): void {
    const n = this.run.ctx.data.loot.spire[sp.size].picks;
    this.run.progression.queueOffers(Array.from({ length: n }, () => ({ kind: 'item' as const, boss: false, spire: true })));
  }

  /** 히든보스 처치: 보스 스킬 카드 1장 → 전용 무기 상자(왼쪽)·전용 아이템 상자(오른쪽) */
  hiddenBossReward(roomId: number): void {
    const hb = this.hiddenBossRooms.get(roomId)!;
    const c = roomCenter(this.run.session.map.rooms[roomId]!, this.run.m);
    this.run.progression.queueOffers([{ kind: this.run.ctx.data.cards.bossBonus, boss: true }], () => {
      this.run.loot.addBossChest(c.x - 40, c.y, {}, hb.weaponId);
      if (!this.run.session.player.itemsObtained.includes(hb.itemId)) this.run.loot.addChest('item', c.x + 40, c.y, {}, { fixedItem: hb.itemId });
    });
  }

  /** 전투 칸을 깼을 때 낮은 확률로 무기 상자 */
  combatRoomDrop(roomId: number): void {
    const d = this.run.ctx.data;
    const { stage } = this.run.session;
    const rng = Rng.derive(this.run.ctx.config.seed, `drop-${stage.chapter}-${stage.stage}-${roomId}`);
    if (!rng.chance(d.loot.combatDrop.chance)) return;
    // 방 가운데는 장애물일 수 있어 플레이어 곁에 떨어뜨린다
    this.run.loot.addCombatChest(this.run.player.x, this.run.player.y + 16, 'drop');
  }

  /** 대규모 습격 보상: 아이템 상자(레어 이상) + 무기 상자(챕터가 오를수록 전설 상자 확률↑) + 코인 다량 */
  raidReward(roomId: number): void {
    const d = this.run.ctx.data;
    const c = roomCenter(this.run.session.map.rooms[roomId]!, this.run.m);
    this.run.loot.addChest('item', c.x - 20, c.y, d.items.raidWeights);
    this.run.loot.addCombatChest(c.x + 20, c.y, 'raid', chapterWeights(d.loot.raidLegendaryChestChance, this.run.session.stage.chapter));
    const n = rollCoinDrops(this.run.rng, this.run.rng.int(d.loot.raid.coins[0], d.loot.raid.coins[1]), d.pickups.coin.dropRate);
    for (let i = 0; i < n; i++) {
      const a = this.run.rng.range(0, Math.PI * 2);
      const r = this.run.rng.range(8, 30);
      this.run.pickups.push(new Pickup(this.run, 'coin', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, d.pickups));
    }
  }
}

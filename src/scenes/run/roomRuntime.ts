/** 방 진행(입장·잠금·클리어), 웨이브·적 소환, 보스 하수인, 적 길찾기. */
import { buildPathField, pathDir, segmentClear } from '../../systems/pathField';
import Phaser from 'phaser';
import { sfx } from './shared';
import type { Vec2 } from '../../core/actions';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { BossController } from '../../bosses/bossController';
import { Enemy } from '../../entities/enemy';
import { Darkness } from '../../entities/darkness';
import { shake } from '../../entities/juice';
import { stageEndOffers } from '../../systems/cards';
import { assignElites, eliteCount } from '../../systems/elites';
import { championWaves, hiddenBossScale, raidChampions } from '../../systems/champions';
import { hiddenChapterMul } from '../../systems/hiddenBoss';
import type { RoomEvent, Wave } from '../../systems/roomState';
import { contains, interiorRect, roomAt, roomCenter } from '../../systems/worldLayout';
import type { Rect } from '../../systems/worldLayout';
import { contentChapter, hiddenTableChapter, overflowBossScale, overflowEnemyScale, overflowGrowth, stageBossId, waveChaptersOf } from '../../systems/overflow';
import { MimosaController } from '../../bosses/mimosa/controller';
import { AcroController } from '../../bosses/mimosa/acroController';
import type { RunScene } from '../RunScene';

export class RoomRuntime {
  constructor(private readonly run: RunScene) {}

  updateRooms(dt: number): void {
    const { map, visited } = this.run.session;
    const rid = roomAt(map, this.run.m, this.run.player.x, this.run.player.y);
    if (rid !== null) {
      this.run.session.currentRoomId = rid;
      visited.add(rid);
      const state = this.run.rooms.get(rid)!;
      const inner = interiorRect(map.rooms[rid]!, this.run.m, this.run.ctx.data.mapgen.lockInsetPx);
      // 아크로 미모사가 칸을 넘나드는 동안은 방에 들어서도 웨이브·조우가 시작되지 않는다
      const frozen = this.run.acro.frozen;
      // 조우 칸: 안쪽에 들어서면 유형이 정해진다
      if (!frozen && map.rooms[rid]!.kind === 'encounterRoom' && !this.run.session.encounters.has(rid) && contains(inner, this.run.player.x, this.run.player.y)) {
        this.run.encounters.resolveEncounter(rid);
      }
      if (!frozen && this.run.rooms.get(rid)!.phase === 'idle' && contains(inner, this.run.player.x, this.run.player.y)) {
        // 보스방: 경고 배너를 띄우고 그동안 보스 소환을 미룬다
        const boss = state.kind === 'bossRoom' ? state.waves[0]?.[0] : undefined;
        const bossDef = boss ? this.run.ctx.data.enemies.enemies.find((e) => e.id === boss) : undefined;
        if (bossDef) this.run.stageFx.showBossWarning(this.run.ctx.t(this.bossNameKey(bossDef.id) ?? bossDef.nameKey));
        this.handleRoomEvents(rid, state.enter(bossDef ? this.run.ctx.data.bosses.bannerSec : 0));
        // 바바리안 데스 휘슬: 전투 칸에 들어갈 때 함성
        if (state.kind === 'combatRoom') this.run.itemRt.triggerRoar();
      }
    }
    for (const [id, state] of this.run.rooms) {
      if (state.phase === 'locked') this.handleRoomEvents(id, state.update(dt));
    }
  }

  handleRoomEvents(roomId: number, events: RoomEvent[]): void {
    for (const e of events) {
      if (e.type === 'lock') {
        this.setRoomLocked(roomId, true);
        // 보스는 등장 연출이 따로 있다
        if (this.run.rooms.get(roomId)?.kind !== 'bossRoom' && !this.run.encounters.hiddenBossRooms.has(roomId)) {
          bus.emit('combatBanner', { kind: 'start' });
          sfx('combatStart');
          shake(this.run, 'light');
        }
      }
      else if (e.type === 'spawn') this.spawnWave(roomId, e.wave, e.index);
      else {
        this.setRoomLocked(roomId, false);
        const node = this.run.session.map.rooms[roomId]!;
        const rc = this.run.ctx.data.juice.roomClear;
        bus.emit('combatBanner', { kind: 'clear' });
        sfx('roomClear');
        this.run.juice.colorBurst({ x: this.run.player.x, y: this.run.player.y }, rc.color, rc);
        const cam = this.run.cameras.main;
        const base = this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale;
        this.run.tweens.add({ targets: cam, zoom: base * rc.zoom, duration: (rc.zoomSec * 1000) / 2, yoyo: true, onComplete: () => cam.setZoom(base) });
        if (node.kind === 'combatRoom') this.run.encounters.combatRoomDrop(roomId);
        if (this.run.encounters.raidRooms.has(roomId)) this.run.encounters.raidReward(roomId);
        if (this.run.encounters.hiddenBossRooms.has(roomId)) this.run.encounters.hiddenBossReward(roomId);
        // 보스 스테이지: 보스방에서 스킬 카드를 1회 더 고른 뒤 포털이 생긴다(보스방이 출구를 겸함)
        if (node.kind === 'bossRoom') {
          this.run.loot.clearDebuffs();
          const end = stageEndOffers(this.run.session.stage, this.run.ctx.data.mapgen, this.run.ctx.data.cards);
          const bossId = this.run.rooms.get(roomId)?.waves[0]?.[0];
          // 식광·마기카이저: 처치 후 일반 스토리 대화 (내용이 비어 있으면 건너뜀)
          // 오버플로우는 본편 스토리 대화(식광·엔딩)를 건너뛴다
          // (아크로 미모사는 전용 대화가 있다)
          const story = this.run.session.player.overflow && bossId !== this.run.ctx.data.overflow.acro.enemyId ? (_e: string, _a: string | undefined, then: () => void) => then() : this.run.progression.playStory.bind(this.run.progression);
          story('bossKill', bossId, () =>
            this.run.progression.queueOffers(
              end.bossRoom.map((kind) => ({ kind, boss: true })),
              () => this.run.progression.afterBossRoom(node),
            ),
          );
        }
      }
    }
  }

  setRoomLocked(roomId: number, locked: boolean): void {
    const doors = this.run.doorsByRoom.get(roomId) ?? [];
    if (doors.length > 0 && doors.some((d) => d.rect.visible !== locked)) sfx(locked ? 'doorLock' : 'doorOpen');
    for (const door of doors) door.setLocked(locked);
  }

  spawnWave(roomId: number, planned: Wave, index: number): void {
    const { map } = this.run.session;
    const rng = Rng.derive(this.run.ctx.config.seed, `spawn-${map.chapter}-${map.stage}-${roomId}-${index}`);
    // 전투 칸 웨이브의 일반 적 일부를 엘리트로 (보스방 제외)
    const node = map.rooms[roomId]!;
    const d = this.run.ctx.data;
    // 오버플로우 진화: 군체 증식·유니크 변형 (전투 칸·습격만)
    const fights = node.kind === 'combatRoom' || this.run.encounters.raidRooms.has(roomId);
    const wave = fights ? this.run.evo.expandWave(Rng.derive(this.run.ctx.config.seed, `evo-wave-${map.chapter}-${map.stage}-${roomId}-${index}`), planned) : planned;
    if (wave.length > planned.length) this.run.rooms.get(roomId)?.addAlive(wave.length - planned.length);
    const elites =
      node.kind === 'combatRoom' || this.run.encounters.raidRooms.has(roomId)
        ? assignElites(
            Rng.derive(this.run.ctx.config.seed, `elite-${map.chapter}-${map.stage}-${roomId}-${index}`),
            wave,
            this.run.encounters.raidRooms.has(roomId)
              ? d.loot.raid.elitesPerWave
              : eliteCount(Rng.derive(this.run.ctx.config.seed, `elite-count-${map.chapter}-${map.stage}-${roomId}-${index}`), contentChapter(this.run.session.stage), map.stage, d.elites),
            (id) => d.enemies.enemies.find((e) => e.id === id)!.rank,
            d.elites,
          )
        : wave.map(() => null);
    wave.forEach((id, i) => this.spawnEnemy(id, roomId, rng, true, elites[i] ?? null));
    // 정예(집행자·집정관): 3장 일부 전투 칸 웨이브에 1마리, 습격은 한 웨이브에 하나 또는 둘 (엘리트 없음)
    const total = this.run.rooms.get(roomId)?.waves.length ?? 0;
    const champLabel = `champion-${map.chapter}-${map.stage}-${roomId}`;
    const champs = this.run.encounters.raidRooms.has(roomId)
      ? (raidChampions(Rng.derive(this.run.ctx.config.seed, champLabel), contentChapter(this.run.session.stage), total, d.waves.champions)[index] ?? [])
      : node.kind === 'combatRoom'
        ? [championWaves(Rng.derive(this.run.ctx.config.seed, champLabel), contentChapter(this.run.session.stage), map.stage, total, d.waves.champions)[index] ?? null].filter((x): x is string => x !== null)
        : [];
    for (const id of champs) this.spawnEnemy(id, roomId, rng, true);
    for (const id of champs) this.run.progression.say('championMet', id);
    this.run.rooms.get(roomId)?.addAlive(champs.length);
  }

  /** extraEliteId: 두 번째 엘리트 (중형 첨탑 강적) */
  spawnEnemy(id: string, roomId: number, rng: Rng, countForRoom: boolean, eliteId: string | null = null, extraEliteId: string | null = null): Enemy {
    const d = this.run.ctx.data;
    const node = this.run.session.map.rooms[roomId]!;
    const def = d.enemies.enemies.find((e) => e.id === id)!;
    const pos = def.ai === 'idle' ? roomCenter(node, this.run.m) : this.run.world.spawnPoint(node, rng, def.size / 2);
    const elite = eliteId ? (d.elites.elites.find((x) => x.id === eliteId) ?? null) : null;
    const extra = extraEliteId ? (d.elites.elites.find((x) => x.id === extraEliteId) ?? null) : null;
    const icon = [elite, extra].filter((x) => x !== null).map((x) => this.run.ctx.t(x!.iconKey)).join('');
    const enemy = new Enemy(this.run, def, pos.x, pos.y, d.waves.spawnWarnSec, elite, d.elites, icon, extra);
    if (!def.summon) this.run.discover('enemies', def.id);
    if (def.artScale) enemy.setExtraScale(def.artScale);
    // 몬스터는 고정 스탯, 히든보스만 장에 따라 (1장 기준 ×1·×2·×3)
    const { stage } = this.run.session;
    if (def.rank === 'hiddenBoss') enemy.scaleHp(hiddenBossScale(hiddenTableChapter(stage, d), d.enemies.hiddenBossScale));
    // 오버플로우 4장부터: 3장 수준 + 장 성장 (보스는 같은 칸 3장 보스 기준, 피해는 보스 컨트롤러로)
    const ovf = this.overflowScale(def.id, def.rank, def.chapter);
    if (ovf.hp !== 1 || ovf.damage !== 1) enemy.applyOverflowScale(ovf.hp, def.ai === 'boss' ? 1 : ovf.damage);
    this.chapterBuff(enemy);
    if (def.id === stageBossId(stage, d) && this.bossNameKey(def.id)) enemy.nameKey = this.bossNameKey(def.id)!;
    // 오버플로우 적 진화 (보스는 보스 진화, 피해는 보스 컨트롤러로)
    const evoDamage = this.run.evo.onSpawn(enemy);
    enemy.jitterFirstAttack(rng);
    this.run.enemyGroup.add(enemy.sprite);
    if (def.ai === 'idle') (enemy.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.run.enemies.push(enemy);
    if (countForRoom) this.run.enemyRoom.set(enemy, roomId);
    if (def.ai === 'boss') {
      // 히든보스: 어느 챕터든 같은 패턴, 체력·피해만 챕터 배율
      const hidden = d.bosses.hiddenBosses.find((b) => b.id === def.id);
      const core = hidden ?? d.bosses.bosses.find((b) => b.id === def.id);
      // 히든보스 장 배율은 체력·피해 둘 다, 오버플로우 장 배율·보스 진화는 피해 몫만 (체력은 앞에서 이미)
      const chapterMul = hidden ? hiddenChapterMul(d.bosses, hiddenTableChapter(stage, d)) : 1;
      const mul = chapterMul * ovf.damage * evoDamage;
      if (hidden) {
        enemy.setMaxHp(enemy.maxHp * chapterMul);
        enemy.damageMul = mul;
      }
      // 헥타르 미모사: 전용 조종기 (등장 연출도 스스로)
      if (def.id === d.overflow.mimosa.enemyId) {
        this.run.bossControllers.set(enemy, new MimosaController(enemy, d.overflow.mimosa, this.currentArena(), this.run.tamper.hooks(), this.run, mul));
      } else if (def.id === d.overflow.acro.enemyId) {
        // 아크로 미모사: 전용 조종기 (정체 공개 대화·등장 연출도 스스로)
        this.run.bossControllers.set(enemy, new AcroController(enemy, d.overflow.acro, interiorRect(this.run.session.map.rooms[roomId]!, this.run.m), this.run.acro.hooks(), this.run, mul));
      } else if (core) {
        this.run.bossControllers.set(enemy, new BossController(enemy, core, mul));
        if (!this.run.stageFx.intro) this.run.stageFx.startBossIntro(enemy);
        // 오버플로우 마기카이저: 이 런의 공격 계열을 학습한 변형 (제안)
        if (def.id === d.overflow.kaiserLearning.bossId) this.run.kaiserLearn.apply(enemy, mul);
      }
      // 식광: 일식 어둠
      const dk = core?.darkness;
      if (dk) {
        this.run.darkness?.destroy();
        this.run.darkness = new Darkness(this.run, dk.lightRadius, dk.alpha, dk.color);
        this.run.darknessBoss = enemy;
      }
    }
    return enemy;
  }

  /** 2~3장 일반 적·정예 보정 (보스·히든보스 제외) */
  private chapterBuff(enemy: Enemy): void {
    if (enemy.rank === 'boss' || enemy.rank === 'hiddenBoss') return;
    const b = this.run.ctx.data.enemies.chapterBuff[String(enemy.def.chapter)];
    if (b) enemy.applyOverflowScale(b.hp, b.damage);
  }

  /** 오버플로우 장 배율 (본편·1~3장은 1) */
  overflowScale(id: string, rank: string, chapter: number): { hp: number; damage: number } {
    const d = this.run.ctx.data;
    const { stage, player } = this.run.session;
    if (!player.overflow) return { hp: 1, damage: 1 };
    if (rank === 'hiddenBoss') return overflowGrowth(stage.chapter, d);
    if (rank === 'boss') return overflowBossScale(stage.chapter, id, stage.stage, d);
    return overflowEnemyScale(stage.chapter, chapter, d);
  }

  /** 오버플로우 보스 칸 이름 (임시 보스가 대신 나와도) */
  bossNameKey(spawnId: string): string | undefined {
    const { stage } = this.run.session;
    if (!stage.boss || spawnId !== stageBossId(stage, this.run.ctx.data)) return undefined;
    return this.run.ctx.data.overflow.bossNameKeys[stage.boss];
  }

  /** 지금 챕터(또는 chapters) 웨이브에 나오는 일반 적 (중복 없이) */
  chapterRoster(chapters?: number[]): string[] {
    const d = this.run.ctx.data;
    const chs = chapters ?? waveChaptersOf(this.run.session.stage);
    const ids = new Set(d.waves.waves.filter((w) => chs.includes(w.chapter)).flatMap((w) => w.spawns.map((s) => s.enemy)));
    return [...ids].filter((id) => d.enemies.enemies.find((e) => e.id === id)?.rank === 'normal');
  }

  /** 플레이어가 있는 방 안쪽 */
  currentArena(): Rect {
    const rid = this.run.session.currentRoomId ?? this.run.session.map.startId;
    return interiorRect(this.run.session.map.rooms[rid]!, this.run.m);
  }

  /** 전술 연계: 같은 방의 같은 적 중 연계 거리 안에 있는 것이 함께 조준한다 */
  linkWindup(src: Enemy, attackId: string): void {
    const a = src.def.attacks?.find((x) => x.id === attackId);
    const r = a?.linkRadius;
    if (!r) return;
    const room = this.run.enemyRoom.get(src);
    for (const e of this.run.enemies) {
      if (e === src || e.def.id !== src.def.id || this.run.enemyRoom.get(e) !== room) continue;
      if (Math.hypot(e.sprite.x - src.sprite.x, e.sprite.y - src.sprite.y) <= r) e.tryLink(attackId, this.run.enemyHost);
    }
  }

  /** 보스가 부르는 적(분신): 방 웨이브 수에 들어가지 않는다 */
  spawnMinion(id: string, at: Vec2, maxHp?: number): Enemy {
    const d = this.run.ctx.data;
    const def = d.enemies.enemies.find((e) => e.id === id)!;
    const enemy = new Enemy(this.run, def, at.x, at.y, 0, null, d.elites);
    if (maxHp !== undefined) enemy.setMaxHp(maxHp);
    enemy.noReward = true;
    // 오버플로우: 보스가 부른 졸개도 장 배율·공용 진화를 받는다
    const ovf = this.overflowScale(def.id, def.rank, def.chapter);
    if (ovf.hp !== 1 || ovf.damage !== 1) enemy.applyOverflowScale(ovf.hp, ovf.damage);
    this.chapterBuff(enemy);
    this.run.evo.onSpawn(enemy);
    this.run.enemyGroup.add(enemy.sprite);
    if (def.ai === 'idle') (enemy.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.run.enemies.push(enemy);
    return enemy;
  }

  /** 아크로 미모사가 부르는 보스 (약화판): 보스 패턴 그대로, 보상·처치 연출·방 웨이브 수 없음 */
  spawnBossMinion(id: string, at: Vec2, hpMul: number, damageMul: number): Enemy {
    const d = this.run.ctx.data;
    const enemy = this.spawnMinion(id, at);
    enemy.setMaxHp(Math.max(1, Math.round(enemy.maxHp * hpMul)));
    const core = d.bosses.bosses.find((b) => b.id === id);
    const ovf = this.overflowScale(id, enemy.rank, enemy.def.chapter);
    if (core) this.run.bossControllers.set(enemy, new BossController(enemy, core, ovf.damage * damageMul));
    return enemy;
  }

  /** 적 길 찾기: 곧장 갈 수 있으면 null, 막혔으면 이 방 격자로 돌아가는 방향 */
  enemyPathDir(from: Vec2, radius: number): Vec2 | null {
    const rid = this.run.session.currentRoomId;
    if (rid === null) return null;
    const obs = this.run.obstacles.get(rid);
    if (!obs || obs.length === 0 || segmentClear(from, this.run.player, obs, radius)) return null;
    let field = this.run.pathFields.get(rid);
    if (!field) {
      const mg = this.run.ctx.data.mapgen;
      field = buildPathField(interiorRect(this.run.session.map.rooms[rid]!, this.run.m), obs, mg.pathCellPx, mg.pathMarginPx);
      this.run.pathFields.set(rid, field);
    }
    return pathDir(field, from, this.run.player);
  }
}

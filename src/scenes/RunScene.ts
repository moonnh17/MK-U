import Phaser from 'phaser';
import type { ActionFrame, ButtonAction, Vec2 } from '../core/actions';
import { makeFallbackSeed } from '../core/config';
import { getContext, type GameContext } from '../core/context';
import { bus } from '../core/events';
import { DISABLED_ACTIONS } from '../core/features';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import { newPlayerState, type BuffView, type PlayerState, type RunSession, type SkillSlotView } from '../core/session';
import { Door } from '../entities/door';
import { Enemy } from '../entities/enemy';
import { FloorWeapon, Pickup } from '../entities/pickup';
import type { ShieldOpts, SkillHost, SkillObject } from '../skills/host';
import { isSkillImplemented, passiveImpl, skillImpl, ultimateImpl } from '../skills/registry';
import { applyCard, drawSkillCards, drawStatCards, runStartOffers, stageEndOffers, type Card } from '../systems/cards';
import { calcDamage, gradeMultiplier, spaceDamage } from '../systems/damage';
import { pendingEncounter } from '../systems/encounter';
import { generateStage, type RoomNode } from '../systems/mapgen';
import { RoomState, wavesForRoom, type RoomEvent, type Wave } from '../systems/roomState';
import { advanceStage, firstStage, type StageRef } from '../systems/run';
import { absorbHit, refracts, tickShield, type ShieldState } from '../systems/shield';
import { applyCorruption, corruptedDamage, skillChance, tickCorruption } from '../systems/acro';
import { combineMods, heal, payHp, takeDamage, type PlayerMods } from '../systems/vitals';
import {
  cooldownLeft,
  equipSkill,
  findSkill,
  gainGauge,
  refundCooldown,
  setSkillLevel,
  skillValues,
  tickCooldowns,
} from '../systems/skills';
import { damageTaken, setStat, statEffect } from '../systems/stats';
import { applyBleed, buffDuration, canAutoCast, chargeTime, skillTags, tickBleed } from '../systems/tags';
import {
  activeWeapon,
  autoAim,
  gainEnergy,
  gunShots,
  inArc,
  normalize,
  pickUpWeapon,
  projectilesCut,
  spendEnergy,
  swapWeapon,
} from '../systems/weapons';
import {
  contains,
  corridors,
  doorRect,
  interiorRect,
  mapBounds,
  metrics,
  roomAt,
  roomCenter,
  roomRect,
  wallRects,
  type Rect,
  type WorldMetrics,
} from '../systems/worldLayout';
import type { BleedRule, CardOfferKind, SkillDef, SpaceRule, TagId, UltimateDef, WeaponDef } from '../types/data';

export interface RunSceneData {
  stage?: StageRef;
  player?: PlayerState;
  /** 이 스테이지 시작방에서 고를 카드 */
  offers?: CardOfferKind[];
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  roomId: number;
  radius: number;
}

interface Offer {
  kind: CardOfferKind;
  boss: boolean;
}

type Modal = 'cards' | 'inventory' | null;

const SKILL_ACTIONS: ButtonAction[] = ['skill1', 'skill2', 'skill3', 'skill4'];

/** 전투 씬: 스테이지 하나(방·복도·적·무기·스킬). 스테이지를 넘기면 다음 스테이지 데이터로 재시작한다. */
export class RunScene extends Phaser.Scene {
  private ctx!: GameContext;
  private session!: RunSession;
  private m!: WorldMetrics;
  private rng!: Rng;
  private host!: SkillHost;

  private player!: Phaser.Physics.Arcade.Image;
  private weaponSprite!: Phaser.GameObjects.Image;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private doorGroup!: Phaser.Physics.Arcade.StaticGroup;
  private enemyGroup!: Phaser.Physics.Arcade.Group;
  private bullets!: Phaser.Physics.Arcade.Group;
  /** 적 투사체 (M3부터 사용, 칼 탄 베기 대상) */
  private enemyBullets!: Phaser.Physics.Arcade.Group;

  private doorsByRoom = new Map<number, Door[]>();
  private rooms = new Map<number, RoomState>();
  private enemies: Enemy[] = [];
  private enemyRoom = new Map<Enemy, number>();
  private pickups: Pickup[] = [];
  private floorWeapons: FloorWeapon[] = [];
  private portals: Prop[] = [];
  private cores: Prop[] = [];
  private skillObjects: SkillObject[] = [];
  /** 마기역장 보호막 */
  private shield: ShieldState | null = null;
  private shieldOpts: ShieldOpts | null = null;
  private shieldFx: Phaser.GameObjects.Arc | null = null;
  /** 지금 깔려 있는 패시브 (id:레벨:각성). 바뀌면 오브젝트를 다시 깐다 */
  private passiveKey = '';
  private passiveId: string | null = null;
  /** MK 돌진 */
  private dashLeft = 0;
  private dashVel: Vec2 = { x: 0, y: 0 };

  private aimDir: Vec2 = { x: 1, y: 0 };
  private fireCooldown = 0;
  private invuln = 0;
  private interactKind: 'weapon' | 'core' | null = null;
  private toastTimes = new Map<string, number>();
  private unsubs: (() => void)[] = [];
  private initData: RunSceneData = {};

  // 카드·인벤토리
  private modal: Modal = null;
  private offerQueue: Offer[] = [];
  private afterOffers: (() => void)[] = [];
  private currentCards: Card[] | null = null;
  private cardSeq = 0;
  /** 포털을 탔다(카드를 고르는 동안 포털을 다시 밟지 않게) */
  private leaving = false;

  constructor() {
    super('Run');
  }

  init(data: RunSceneData): void {
    this.initData = data ?? {};
  }

  create(): void {
    this.ctx = getContext();
    const d = this.ctx.data;
    this.resetFields();

    const stage = this.initData.stage ?? firstStage();
    const seed = this.ctx.config.seed;
    const map = generateStage(seed, stage.chapter, stage.stage, d.mapgen);
    const newRun = !this.initData.player;
    this.session = {
      stage,
      map,
      visited: new Set([map.startId]),
      currentRoomId: map.startId,
      player: this.initData.player ?? newPlayerState(d),
      enemiesAlive: 0,
      outcome: null,
      energyEmptyAt: -Infinity,
      skillView: [],
      buffs: [],
    };
    this.ctx.session = this.session;
    this.rng = Rng.derive(seed, `combat-${stage.chapter}-${stage.stage}`);
    this.m = metrics(d.mapgen);
    this.host = this.makeHost();

    this.walls = this.physics.add.staticGroup();
    this.doorGroup = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    this.buildWorld();

    const start = roomCenter(map.rooms[map.startId]!, this.m);
    this.player = this.physics.add.image(start.x, start.y, d.player.spriteKey).setDepth(4);
    this.weaponSprite = this.add.image(start.x, start.y, this.weaponDef().spriteKey).setDepth(4);
    if (stage.chapter === 1 && stage.stage === 1 && this.ctx.config.testWeapons) this.placeTestWeapons();

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.doorGroup);
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.doorGroup);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    const killBullet = (b: unknown) => (b as Phaser.GameObjects.GameObject).destroy();
    this.physics.add.collider(this.bullets, this.walls, killBullet);
    this.physics.add.collider(this.bullets, this.doorGroup, killBullet);
    this.physics.add.collider(this.enemyBullets, this.walls, killBullet);
    this.physics.add.overlap(this.bullets, this.enemyGroup, (b, e) => this.onBulletHit(b as Phaser.Physics.Arcade.Image, e as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.onEnemyBulletHit(b as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemyGroup, (_p, e) =>
      this.onContact((e as Phaser.GameObjects.GameObject).getData('enemy') as Enemy),
    );

    const b = mapBounds(map, this.m);
    this.physics.world.setBounds(b.x, b.y, b.w, b.h);
    const cam = this.cameras.main;
    cam.centerOn(start.x, start.y);

    this.unsubs.push(
      bus.on('debugClearRoom', () => this.debugClearRoom()),
      bus.on('restartRequested', () => this.restartRun()),
      bus.on('cardPick', ({ index }) => this.pickCard(index)),
      bus.on('inventoryEquip', ({ skillId, target }) => this.equip(skillId, target)),
      bus.on('inventoryOpenRequest', () => this.openInventory()),
      bus.on('inventoryCloseRequest', () => this.closeInventory()),
      bus.on('debugSetSkill', (e) => this.debugSetSkill(e.skillId, e.level, e.awakened)),
      bus.on('debugSetStat', ({ stat, value }) => {
        this.session.player = setStat(this.session.player, stat, value, d.player.maxHp, d.stats);
      }),
      bus.on('debugOpenCards', ({ kind }) => this.queueOffers([{ kind, boss: false }])),
      bus.on('debugFillUltimate', () => {
        this.session.player.ultimate.gauge = this.ultimateDef().gaugeMax;
      }),
      bus.on('debugSpawn', ({ enemyId, count }) => this.debugSpawn(enemyId, count)),
      bus.on('debugBarrage', () => this.debugBarrage()),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      for (const o of this.skillObjects) o.destroy();
      this.skillObjects = [];
    });
    this.setInteractHint(null);
    this.refreshSkillView();

    // 런 시작 스킬 카드 / 앞 스테이지가 넘긴 카드는 시작방에서 고른다
    const offers = newRun ? runStartOffers(d.cards) : (this.initData.offers ?? []);
    this.queueOffers(offers.map((kind) => ({ kind, boss: false })));
  }

  private resetFields(): void {
    this.doorsByRoom = new Map();
    this.rooms = new Map();
    this.enemies = [];
    this.enemyRoom = new Map();
    this.pickups = [];
    this.floorWeapons = [];
    this.portals = [];
    this.cores = [];
    this.skillObjects = [];
    this.shield = null;
    this.shieldOpts = null;
    this.shieldFx = null;
    this.passiveKey = '';
    this.passiveId = null;
    this.dashLeft = 0;
    this.aimDir = { x: 1, y: 0 };
    this.fireCooldown = 0;
    this.invuln = 0;
    this.interactKind = null;
    this.toastTimes = new Map();
    this.modal = null;
    this.offerQueue = [];
    this.afterOffers = [];
    this.currentCards = null;
    this.cardSeq = 0;
    this.leaving = false;
  }

  // ---------- 월드 ----------

  private buildWorld(): void {
    const d = this.ctx.data;
    const { map } = this.session;
    const floor = hexColor(d.ui.room.floorColor);
    const wall = hexColor(d.ui.room.wallColor);
    const corridorColor = hexColor(d.ui.room.corridorColor);
    const doorColor = hexColor(d.mapgen.door.color);

    for (const c of corridors(map, this.m)) {
      this.addRect(c.floor, corridorColor, 0);
      for (const w of c.walls) this.walls.add(this.addRect(w, wall, 1));
    }

    for (const node of map.rooms) {
      this.addRect(roomRect(node, this.m), floor, 0);
      for (const w of wallRects(node, this.m)) this.walls.add(this.addRect(w, wall, 1));

      const doors: Door[] = [];
      for (const dir of Object.keys(node.doors) as ('n' | 's' | 'e' | 'w')[]) {
        doors.push(new Door(this, doorRect(node, dir, this.m), doorColor, this.doorGroup));
      }
      this.doorsByRoom.set(node.id, doors);

      const waves = wavesForRoom(
        this.ctx.config.seed,
        map.chapter,
        map.stage,
        node.id,
        node.kind,
        d.mapgen.combatWaves,
        d.mapgen.bossPlaceholderEnemy,
        d.waves,
      );
      this.rooms.set(node.id, new RoomState(node.kind, waves, d.waves.waveDelaySec));

      const c = roomCenter(node, this.m);
      if (node.kind === 'exitRoom') this.addPortal(node);
      if (node.kind === 'encounterRoom') {
        const ref = d.mapgen.props.encounterCore;
        this.cores.push({ sprite: this.add.image(c.x, c.y, ref.spriteKey).setDepth(2), roomId: node.id, radius: ref.size / 2 });
      }
    }
  }

  private addRect(r: Rect, color: number, depth: number): Phaser.GameObjects.Rectangle {
    return this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, color).setDepth(depth);
  }

  private addPortal(node: RoomNode): void {
    const ref = this.ctx.data.mapgen.props.exitPortal;
    const c = roomCenter(node, this.m);
    const sprite = this.add.image(c.x, c.y, ref.spriteKey).setDepth(2);
    this.tweens.add({ targets: sprite, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
    this.portals.push({ sprite, roomId: node.id, radius: ref.size / 2 });
  }

  private placeTestWeapons(): void {
    const node = this.session.map.rooms[this.session.map.startId]!;
    const inner = interiorRect(node, this.m);
    const ids = this.ctx.data.mapgen.testWeapons;
    ids.forEach((id, i) => {
      const x = inner.x + (inner.w * (i + 1)) / (ids.length + 1);
      const y = inner.y + (inner.h * 3) / 4;
      this.floorWeapons.push(new FloorWeapon(this, id, this.weaponDefOf(id).spriteKey, x, y));
    });
  }

  // ---------- 루프 ----------

  override update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const frame = this.ctx.input.poll();

    for (const action of frame.pressed) {
      const enabled = !DISABLED_ACTIONS.has(action);
      console.info(this.ctx.t(enabled ? 'system.command' : 'system.disabledCommand', { action }));
      bus.emit('command', { action, enabled });
    }

    if (this.session.outcome) {
      if (frame.pressed.has('attack') || frame.pressed.has('interact')) this.restartRun();
      return;
    }
    if (this.modal) {
      this.updateModal(frame);
      this.refreshSkillView();
      return;
    }

    const p = this.session.player;
    const d = this.ctx.data;
    const mods = this.playerMods();
    p.shieldMax = d.player.shieldMax + mods.shieldMax;
    p.shield = Math.min(p.shield, p.shieldMax);
    const speed = d.player.moveSpeed * (1 + statEffect('moveSpeed', p.stats, d.stats)) * (1 + mods.moveSpeed);
    if (this.dashLeft > 0) {
      // MK 돌진: 입력 대신 돌진 방향으로
      this.dashLeft -= dt;
      this.player.setVelocity(this.dashVel.x, this.dashVel.y);
    } else {
      this.player.setVelocity(frame.move.x * speed, frame.move.y * speed);
    }
    const moving = frame.move.x !== 0 || frame.move.y !== 0;

    this.updateRooms(dt);

    for (const e of this.enemies) e.update(dt, this.player);
    this.session.enemiesAlive = this.enemies.length;

    // 조준: 가장 가까운 적. 적이 없으면 마지막 방향(이동 중이면 이동 방향으로 갱신)
    const aim = autoAim(
      this.player,
      this.enemies.map((e) => e.sprite),
      this.aimDir,
    );
    this.aimDir = aim.target ? aim.dir : moving ? normalize(frame.move) : this.aimDir;
    const aimAngle = Math.atan2(this.aimDir.y, this.aimDir.x);

    if (frame.pressed.has('swapWeapon')) {
      p.weapons = swapWeapon(p.weapons);
      this.fireCooldown = 0;
    }
    if (frame.pressed.has('interact')) this.interact();

    this.fireCooldown -= dt;
    if (frame.held.has('attack') && this.fireCooldown <= 0) this.attack(aimAngle);

    // 스킬
    p.cooldowns = tickCooldowns(p.cooldowns, dt);
    SKILL_ACTIONS.forEach((action, i) => {
      if (frame.pressed.has(action)) this.castSlot(i);
    });
    if (frame.pressed.has('ultimate')) this.castUltimate();
    this.syncPassive();
    this.updateShield(dt);
    for (const o of [...this.skillObjects]) if (!o.update(dt, this.host)) this.removeObject(o);
    this.updateBleeds(dt);
    this.updateCorruption(dt);

    this.updateBullets();
    this.updatePickups(dt);
    this.updateInvuln(dt);
    this.updateInteractHint();
    this.checkPortals();

    const off = d.player.weaponOffset;
    this.weaponSprite
      .setTexture(this.weaponDef().spriteKey)
      .setPosition(this.player.x + this.aimDir.x * off, this.player.y + this.aimDir.y * off)
      .setRotation(aimAngle);

    this.updateCamera();
    this.refreshSkillView();
    if (frame.pressed.has('inventory')) this.openInventory();
  }

  private updateRooms(dt: number): void {
    const { map, visited } = this.session;
    const rid = roomAt(map, this.m, this.player.x, this.player.y);
    if (rid !== null) {
      this.session.currentRoomId = rid;
      visited.add(rid);
      const state = this.rooms.get(rid)!;
      const inner = interiorRect(map.rooms[rid]!, this.m, this.ctx.data.mapgen.lockInsetPx);
      if (state.phase === 'idle' && contains(inner, this.player.x, this.player.y)) {
        this.handleRoomEvents(rid, state.enter());
      }
    }
    for (const [id, state] of this.rooms) {
      if (state.phase === 'locked') this.handleRoomEvents(id, state.update(dt));
    }
  }

  private handleRoomEvents(roomId: number, events: RoomEvent[]): void {
    for (const e of events) {
      if (e.type === 'lock') this.setRoomLocked(roomId, true);
      else if (e.type === 'spawn') this.spawnWave(roomId, e.wave, e.index);
      else {
        this.setRoomLocked(roomId, false);
        const node = this.session.map.rooms[roomId]!;
        // 보스 스테이지: 보스방에서 스킬 카드를 1회 더 고른 뒤 포털이 생긴다(보스방이 출구를 겸함)
        if (node.kind === 'bossRoom') {
          const end = stageEndOffers(this.session.stage, this.ctx.data.mapgen, this.ctx.data.cards);
          this.queueOffers(
            end.bossRoom.map((kind) => ({ kind, boss: true })),
            () => this.addPortal(node),
          );
        }
      }
    }
  }

  private setRoomLocked(roomId: number, locked: boolean): void {
    for (const door of this.doorsByRoom.get(roomId) ?? []) door.setLocked(locked);
  }

  private spawnWave(roomId: number, wave: Wave, index: number): void {
    const { map } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `spawn-${map.chapter}-${map.stage}-${roomId}-${index}`);
    for (const id of wave) this.spawnEnemy(id, roomId, rng, true);
  }

  private spawnEnemy(id: string, roomId: number, rng: Rng, countForRoom: boolean): void {
    const d = this.ctx.data;
    const node = this.session.map.rooms[roomId]!;
    const def = d.enemies.enemies.find((e) => e.id === id)!;
    const pos = def.ai === 'idle' ? roomCenter(node, this.m) : this.spawnPoint(node, rng, def.size / 2);
    const enemy = new Enemy(this, def, pos.x, pos.y, d.waves.spawnWarnSec);
    this.enemyGroup.add(enemy.sprite);
    if (def.ai === 'idle') (enemy.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.enemies.push(enemy);
    if (countForRoom) this.enemyRoom.set(enemy, roomId);
  }

  private spawnPoint(node: RoomNode, rng: Rng, radius: number): Vec2 {
    const inner = interiorRect(node, this.m, radius);
    const minDist = this.ctx.data.waves.spawnMinPlayerDistance;
    let best: Vec2 = { x: inner.x, y: inner.y };
    let bestDist = -1;
    for (let i = 0; i < 30; i++) {
      const p = { x: rng.range(inner.x, inner.x + inner.w), y: rng.range(inner.y, inner.y + inner.h) };
      const dist = Math.hypot(p.x - this.player.x, p.y - this.player.y);
      if (dist >= minDist) return p;
      if (dist > bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    return best;
  }

  // ---------- 전투 ----------

  private weaponDefOf(id: string): WeaponDef {
    return this.ctx.data.weapons.weapons.find((w) => w.id === id)!;
  }

  private weaponDef(): WeaponDef {
    return this.weaponDefOf(activeWeapon(this.session.player.weapons)!);
  }

  /** 무기 기준 피해 × 등급(그룹) 배율. 태그 보정은 hit()에서 */
  private weaponBase(w: WeaponDef): number {
    return w.baseDamage * gradeMultiplier(w.grade, this.ctx.data.groupMultipliers);
  }

  /** 피해 한 번. 태그 보정은 이 공격(source)의 태그로 계산한다 */
  private hit(enemy: Enemy, base: number, tags: readonly TagId[]): boolean {
    if (enemy.dead) return false;
    const d = this.ctx.data;
    let dmg = calcDamage({ baseDamage: base, tags }, this.session.player.stats, d.tags);
    if (tags.includes('space')) dmg = spaceDamage(enemy.def.rank, enemy.def.maxHp, dmg, this.tagRule<SpaceRule>('space'));
    return this.applyDamage(enemy, corruptedDamage(dmg, enemy.corruption));
  }

  /** 계산이 끝난 피해를 넣는다. 환원주의자 등에게 알리고, 죽였으면 true */
  private applyDamage(enemy: Enemy, dmg: number): boolean {
    if (enemy.dead) return false;
    const dealt = Math.min(Math.max(0, enemy.hp), dmg);
    const killed = enemy.damage(dmg);
    for (const o of [...this.skillObjects]) o.onDamageDealt?.(this.host, dealt);
    if (killed) this.onEnemyKilled(enemy);
    return killed;
  }

  /** 지금 스킬 오브젝트들이 주는 플레이어 보정 */
  private playerMods(): PlayerMods {
    return combineMods(this.skillObjects.flatMap((o) => (o.playerMods ? [o.playerMods()] : [])));
  }

  private tagRule<T>(id: TagId): T {
    return this.ctx.data.tags.tags.find((t) => t.id === id)!.rule as T;
  }

  private attack(aimAngle: number): void {
    const w = this.weaponDef();
    const p = this.session.player;
    this.fireCooldown = w.fireIntervalSec;

    if (w.category === 'blade') {
      this.slash(w, aimAngle);
      return;
    }

    const left = spendEnergy(p.energy, w);
    if (left === null) {
      this.session.energyEmptyAt = this.time.now;
      this.toastThrottled(this.ctx.t('room.energyEmpty'));
      return;
    }
    p.energy = left;
    for (const shot of gunShots(w, aimAngle, this.rng)) {
      this.fireBullet(this.player, shot.angle, shot.speed, shot.range, this.weaponBase(w), w.tags);
    }
  }

  private fireBullet(from: Vec2, angle: number, speed: number, range: number, base: number, tags: readonly TagId[]): void {
    const proj = this.ctx.data.weapons.projectile;
    const b = this.bullets.create(from.x, from.y, proj.spriteKey) as Phaser.Physics.Arcade.Image;
    b.setDepth(5);
    b.setData({ base, tags, range, ox: from.x, oy: from.y });
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  private slash(w: WeaponDef, aimAngle: number): void {
    if (w.pattern.kind !== 'arc') return;
    const { arcDeg, radius } = w.pattern;
    const origin = { x: this.player.x, y: this.player.y };
    const base = this.weaponBase(w);
    for (const e of [...this.enemies]) {
      if (inArc(origin, aimAngle, arcDeg, radius, e.sprite, e.radius)) this.hit(e, base, w.tags);
    }
    // 탄 베기
    const eb = this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[];
    const cut = projectilesCut(
      w,
      origin,
      aimAngle,
      eb.map((b) => ({ x: b.x, y: b.y, cuttable: b.getData('cuttable') !== false })),
    );
    for (const i of cut) eb[i]?.destroy();

    const half = (arcDeg * Math.PI) / 360;
    const g = this.add.graphics().setDepth(6);
    g.fillStyle(0xffffff, 0.35);
    g.slice(origin.x, origin.y, radius, aimAngle - half, aimAngle + half, false);
    g.fillPath();
    this.time.delayedCall(this.ctx.data.ui.slashFxSec * 1000, () => g.destroy());
  }

  private onBulletHit(b: Phaser.Physics.Arcade.Image, sprite: Phaser.Physics.Arcade.Image): void {
    const enemy = sprite.getData('enemy') as Enemy | undefined;
    if (!b.active || !enemy || enemy.dead) return;
    const base = b.getData('base') as number;
    const tags = b.getData('tags') as TagId[];
    b.destroy();
    this.hit(enemy, base, tags);
  }

  private onEnemyKilled(e: Enemy): void {
    const d = this.ctx.data;
    const roomId = this.enemyRoom.get(e);
    const { x, y } = e.sprite;
    const drop = (kind: 'energy' | 'coin', n: number) => {
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(0, d.pickups.scatterRadius);
        this.pickups.push(new Pickup(this, kind, x + Math.cos(a) * r, y + Math.sin(a) * r, d.pickups));
      }
    };
    drop('energy', this.rng.int(e.def.energyOrbs[0], e.def.energyOrbs[1]));
    drop('coin', this.rng.int(e.def.coins[0], e.def.coins[1]));
    // 궁극기 게이지는 적 처치로 충전
    const ult = this.session.player.ultimate;
    ult.gauge = gainGauge(ult.gauge, this.ultimateDef().gaugeMax, d.ultimates.gaugePerKill[e.def.rank]);
    this.removeEnemy(e);
    if (roomId !== undefined) this.rooms.get(roomId)?.enemyKilled();
    for (const o of [...this.skillObjects]) o.onKill?.(this.host, e);
    // 마기 변질: 변질된 채 죽으면 폭발
    const c = e.corruption;
    if (c) {
      e.corruption = null;
      this.fxAt(this.add.circle(x, y, c.burstRadius, hexColor(d.ui.corruptionColor), 0.4).setDepth(6));
      for (const o of [...this.enemies]) {
        if (Math.hypot(o.sprite.x - x, o.sprite.y - y) <= c.burstRadius + o.radius) this.hit(o, c.burstDamage, c.burstTags);
      }
    }
  }

  /** 변질 시간, 변질된 적 색 */
  private updateCorruption(dt: number): void {
    const color = hexColor(this.ctx.data.ui.corruptionColor);
    for (const e of this.enemies) {
      if (!e.corruption || e.dead) continue;
      e.corruption = tickCorruption(e.corruption, dt);
      if (!e.corruption) e.sprite.clearTint();
      else if (!e.sprite.tintFill) e.sprite.setTint(color);
    }
  }

  private removeEnemy(e: Enemy): void {
    this.enemies = this.enemies.filter((x) => x !== e);
    this.enemyRoom.delete(e);
    e.destroy();
  }

  private updateBleeds(dt: number): void {
    const rule = this.tagRule<BleedRule>('bleed');
    for (const e of [...this.enemies]) {
      if (!e.bleed || e.dead) continue;
      const out = tickBleed(e.bleed, dt, rule);
      e.bleed = out.state;
      if (out.damage > 0) this.applyDamage(e, corruptedDamage(out.damage, e.corruption));
    }
  }

  private onContact(enemy: Enemy | undefined): void {
    if (!enemy || enemy.dead || enemy.warn > 0 || enemy.def.contactDamage <= 0) return;
    const now = this.time.now;
    if (now - enemy.lastContactAt < enemy.def.contactIntervalSec * 1000) return;
    if (this.hurtPlayer(enemy.def.contactDamage)) enemy.lastContactAt = now;
  }

  /** 피해를 받았으면 true */
  private hurtPlayer(amount: number): boolean {
    if (this.invuln > 0 || this.ctx.debugFlags.invincible || this.session.outcome || this.modal) return false;
    // 마기역장: 공격을 막고 잠깐 무적
    const absorbed = absorbHit(this.shield);
    if (absorbed.blocked) {
      this.shield = absorbed.shield;
      this.invuln = this.shieldOpts?.blockInvulnSec ?? 0;
      this.cameras.main.flash(60, 140, 170, 210);
      return true;
    }
    const p = this.session.player;
    const taken = damageTaken(amount, p.stats, this.ctx.data.stats) * (1 - this.playerMods().damageReduction);
    const v = takeDamage(p, taken);
    p.hp = v.hp;
    p.shield = v.shield;
    this.invuln = this.ctx.data.player.hurtInvulnSec;
    this.cameras.main.shake(80, 0.004);
    // 피격에 반응하는 스킬 오브젝트 (반물질포 충전 취소 등)
    for (const o of [...this.skillObjects]) if (o.onPlayerHurt && !o.onPlayerHurt(this.host)) this.removeObject(o);
    if (p.hp <= 0) this.endRun({ type: 'dead' });
    return true;
  }

  private updateInvuln(dt: number): void {
    if (this.invuln <= 0) {
      this.player.setAlpha(1);
      return;
    }
    this.invuln -= dt;
    const blink = this.ctx.data.player.blinkIntervalSec;
    this.player.setAlpha(Math.floor(this.invuln / blink) % 2 === 0 ? 0.3 : 1);
  }

  private updateBullets(): void {
    for (const b of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const dist = Math.hypot(b.x - (b.getData('ox') as number), b.y - (b.getData('oy') as number));
      if (dist > (b.getData('range') as number)) b.destroy();
    }
  }

  private updatePickups(dt: number): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const orb = d.player.energy.orbValue * (1 + statEffect('energyGain', p.stats, d.stats));
    for (const pk of this.pickups) {
      if (!pk.update(dt, this.player, d.pickups)) continue;
      if (pk.kind === 'energy') p.energy = gainEnergy(p.energy, orb, p.energyMax);
      else p.coins += d.pickups.coin.value;
    }
    this.pickups = this.pickups.filter((pk) => !pk.collected);
  }

  // ---------- 스킬 ----------

  private makeHost(): SkillHost {
    const ctx = this.ctx;
    return {
      scene: this,
      ctx,
      rng: this.rng,
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      aimDir: () => this.aimDir,
      enemies: () => this.enemies.filter((e) => !e.dead),
      stats: () => this.session.player.stats,
      area: (r) => this.area(r),
      hit: (e, base, tags) => this.hit(e, base, tags),
      chargeTime: (sec, tags) => chargeTime(sec, tags, this.session.player.stats, ctx.data.tags),
      buffDuration: (sec, tags) => buffDuration(sec, tags, this.session.player.stats, ctx.data.tags),
      setShield: (shield, opts) => {
        this.shield = shield;
        this.shieldOpts = opts;
      },
      chance: (base, capKey, tags) => skillChance(base, capKey, tags, this.session.player.stats, ctx.data.tags),
      corrupt: (e, state) => {
        if (!e.dead) e.corruption = applyCorruption(e.corruption, state);
      },
      defeat: (e) => {
        if (e.dead) return;
        e.corruption = null;
        e.bleed = null;
        this.onEnemyKilled(e);
      },
      heal: (amount, overflow) => {
        const p = this.session.player;
        const v = heal(p, amount, overflow);
        p.hp = v.hp;
        p.shield = v.shield;
      },
      payHp: (ratio) => {
        const p = this.session.player;
        p.hp = payHp(p.hp, ratio).hp;
      },
      dash: (dir, speed, sec) => {
        this.dashVel = { x: dir.x * speed, y: dir.y * speed };
        this.dashLeft = sec;
      },
      refundCooldown: (id, ratio) => {
        const p = this.session.player;
        const owned = p.loadout.owned[id];
        if (!owned) return;
        const total = skillValues(findSkill(ctx.data.skills, id), owned).cooldownSec;
        p.cooldowns = refundCooldown(p.cooldowns, id, total * ratio);
      },
      bleed: (e, base, stacks, tags) => {
        if (e.dead) return;
        const perStack = calcDamage({ baseDamage: base, tags }, this.session.player.stats, ctx.data.tags);
        e.bleed = applyBleed(e.bleed, perStack, stacks, this.tagRule<BleedRule>('bleed'));
      },
      fireBullet: (from, angle, speed, range, base, tags) => this.fireBullet(from, angle, speed, range, base, tags),
      addObject: (o) => this.skillObjects.push(o),
      removeObject: (o) => this.removeObject(o),
      objects: () => this.skillObjects,
      sprite: (x, y, ref) => this.add.image(x, y, ref.spriteKey),
      fx: (obj, sec) => {
        this.time.delayedCall((sec ?? ctx.data.ui.slashFxSec) * 1000, () => obj.destroy());
      },
    };
  }

  private removeObject(o: SkillObject): void {
    this.skillObjects = this.skillObjects.filter((x) => x !== o);
    o.destroy();
  }

  /** 장착 패시브가 바뀌면(장착·해제·레벨·각성) 이전 오브젝트를 치우고 다시 깐다 */
  private syncPassive(): void {
    const p = this.session.player;
    const id = p.loadout.passive;
    const owned = id ? p.loadout.owned[id] : undefined;
    const key = id && owned ? `${id}:${owned.level}:${owned.awakened}` : '';
    if (key === this.passiveKey) return;
    const prev = this.passiveId;
    if (prev) for (const o of this.skillObjects.filter((x) => x.owner.split('.')[0] === prev)) this.removeObject(o);
    this.passiveKey = key;
    this.passiveId = id;
    const impl = id ? passiveImpl(id) : undefined;
    if (!id || !owned || !impl) return;
    const def = findSkill(this.ctx.data.skills, id);
    impl.activate(this.host, { def, owned, values: skillValues(def, owned).values });
  }

  /** 보호막 시간, 플레이어 둘레 표시, 각성(벡터굴절역장) 일반 탄 무효화 */
  private updateShield(dt: number): void {
    if (this.shield) this.shield = tickShield(this.shield, dt);
    const s = this.shield;
    const opts = this.shieldOpts;
    if (!s || !opts) {
      this.shieldFx?.destroy();
      this.shieldFx = null;
      return;
    }
    if (!this.shieldFx) this.shieldFx = this.add.circle(0, 0, opts.fxRadius).setDepth(5);
    const color = hexColor(opts.color);
    this.shieldFx
      .setRadius(opts.fxRadius)
      .setPosition(this.player.x, this.player.y)
      .setStrokeStyle(s.hits > 0 ? 2 : 1, color, 0.9)
      .setFillStyle(color, s.refractRadius > 0 ? 0.15 : 0.08);
    if (s.refractRadius <= 0) return;
    for (const b of [...this.enemyBullets.getChildren()] as Phaser.Physics.Arcade.Image[]) {
      const dist = Math.hypot(b.x - this.player.x, b.y - this.player.y);
      if (!refracts(s, dist, b.getData('refractable') !== false)) continue;
      this.fxAt(this.add.circle(b.x, b.y, 3, color, 0.8).setDepth(6));
      b.destroy();
    }
  }

  private fxAt(obj: Phaser.GameObjects.GameObject): void {
    this.time.delayedCall(this.ctx.data.ui.slashFxSec * 1000, () => obj.destroy());
  }

  private onEnemyBulletHit(b: Phaser.Physics.Arcade.Image): void {
    if (!b.active) return;
    const damage = b.getData('damage') as number;
    b.destroy();
    this.hurtPlayer(damage);
  }

  /** HUD '현재 버프': 보호막 + 스킬 오브젝트가 알리는 상태(충전 등) */
  private buffViews(): BuffView[] {
    const out: BuffView[] = [];
    const s = this.shield;
    if (s && this.shieldOpts) {
      const key = s.refractRadius > 0 ? 'buff.magiField.refract' : 'buff.magiField';
      out.push({ id: 'magiField', label: this.ctx.t(key), color: this.shieldOpts.color, leftSec: s.leftSec, totalSec: s.totalSec });
    }
    for (const o of this.skillObjects) {
      const b = o.buff?.(this.host);
      if (b) out.push(b);
    }
    return out;
  }

  /** 스킬 범위 보정 (마기력) */
  private area(radius: number): number {
    const d = this.ctx.data;
    return radius * (1 + statEffect('skillArea', this.session.player.stats, d.stats));
  }

  private ultimateDef(): UltimateDef {
    const id = this.session.player.ultimate.id;
    return this.ctx.data.ultimates.ultimates.find((u) => u.id === id)!;
  }

  /** 근접 스킬은 사거리 안에 적이 있어야 발동한다 */
  private skillUsable(def: SkillDef, awakened: boolean, values: Record<string, number>): boolean {
    const targets = this.enemies.filter((e) => !e.dead).map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    return canAutoCast(skillTags(def, awakened), this.area(values.range ?? 0), this.player, targets);
  }

  private castSlot(i: number): void {
    const p = this.session.player;
    const id = p.loadout.active[i];
    if (!id || cooldownLeft(p.cooldowns, id) > 0) return;
    const impl = skillImpl(id);
    const owned = p.loadout.owned[id];
    if (!impl || !owned) return;
    const def = findSkill(this.ctx.data.skills, id);
    const sv = skillValues(def, owned);
    if (!this.skillUsable(def, owned.awakened, sv.values)) {
      this.toastThrottled(this.ctx.t('skillMsg.noTarget'));
      return;
    }
    if (impl.cast(this.host, { def, owned, values: sv.values })) p.cooldowns = { ...p.cooldowns, [id]: sv.cooldownSec };
  }

  private castUltimate(): void {
    const ult = this.session.player.ultimate;
    const def = this.ultimateDef();
    const impl = ultimateImpl(def.id);
    if (!impl) return;
    if (ult.gauge < def.gaugeMax) {
      this.toastThrottled(this.ctx.t('skillMsg.ultimateNotReady'));
      return;
    }
    if (impl.cast(this.host, def)) ult.gauge = 0;
  }

  /** HUD·터치 버튼이 그릴 스킬 칸 (액티브 4 + 궁극기 + 패시브) */
  private refreshSkillView(): void {
    const d = this.ctx.data;
    const t = this.ctx.t;
    const p = this.session.player;
    const empty: SkillSlotView = {
      skillId: null,
      label: '',
      level: 0,
      awakened: false,
      cooldownLeft: 0,
      cooldownTotal: 0,
      gauge: 0,
      usable: false,
      color: d.ui.hud.skillbar.emptyColor,
    };
    const slot = (id: string | null, active: boolean): SkillSlotView => {
      const owned = id ? p.loadout.owned[id] : undefined;
      if (!id || !owned) return empty;
      const def = findSkill(d.skills, id);
      const sv = skillValues(def, owned);
      return {
        skillId: id,
        label: t(def.shortKey),
        level: owned.level,
        awakened: owned.awakened,
        cooldownLeft: active ? cooldownLeft(p.cooldowns, id) : 0,
        cooldownTotal: sv.cooldownSec,
        gauge: 0,
        usable: !active || this.skillUsable(def, owned.awakened, sv.values),
        color: def.color,
      };
    };
    const ult = this.ultimateDef();
    this.session.buffs = this.buffViews();
    this.session.skillView = [
      ...p.loadout.active.map((id) => slot(id, true)),
      {
        ...empty,
        skillId: ult.id,
        label: t(ult.shortKey),
        gauge: p.ultimate.gauge / ult.gaugeMax,
        usable: p.ultimate.gauge >= ult.gaugeMax,
        color: ult.color,
      },
      slot(p.loadout.passive, false),
    ];
  }

  // ---------- 카드·인벤토리 ----------

  private setModal(kind: Modal): void {
    if (this.modal === kind) return;
    this.modal = kind;
    if (kind) {
      this.physics.pause();
      this.player.setVelocity(0, 0);
    } else if (!this.session.outcome) {
      this.physics.resume();
    }
    this.time.paused = kind !== null;
    bus.emit('modal', { kind });
  }

  private updateModal(frame: ActionFrame): void {
    if (this.modal === 'cards') {
      // PC: 1/2/3 키로 바로 고른다 (숫자키는 skill1~3 명령으로 들어온다)
      SKILL_ACTIONS.forEach((action, i) => {
        if (frame.pressed.has(action) && this.ctx.uiMode === 'pc') this.pickCard(i);
      });
    } else if (this.modal === 'inventory') {
      if (frame.pressed.has('inventory') || frame.pressed.has('pause')) this.closeInventory();
    }
  }

  /** 카드를 차례로 띄운다. 다 고르면 then을 부른다 */
  private queueOffers(offers: Offer[], then?: () => void): void {
    this.offerQueue.push(...offers);
    if (then) this.afterOffers.push(then);
    if (this.modal === null) this.openNextCards();
  }

  private openNextCards(): void {
    const next = this.offerQueue.shift();
    if (!next) {
      this.currentCards = null;
      if (this.modal === 'cards') this.setModal(null);
      const calls = this.afterOffers;
      this.afterOffers = [];
      for (const f of calls) f();
      return;
    }
    const d = this.ctx.data;
    const p = this.session.player;
    const { stage } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `cards-${stage.chapter}-${stage.stage}-${this.cardSeq++}`);
    const cards =
      next.kind === 'skill'
        ? drawSkillCards(rng, p.loadout, p.stats, d.skills, d.cards, isSkillImplemented)
        : drawStatCards(rng, d.cards.cardCount, d.cards);
    this.currentCards = cards;
    this.setModal('cards');
    bus.emit('cardsShow', { titleKey: next.boss ? 'card.title.boss' : `card.title.${next.kind}`, cards });
  }

  private pickCard(index: number): void {
    const card = this.currentCards?.[index];
    if (!card || this.modal !== 'cards') return;
    const d = this.ctx.data;
    const t = this.ctx.t;
    const r = applyCard(this.session.player, card, { skills: d.skills, stats: d.stats, baseMaxHp: d.player.maxHp });
    this.session.player = r.holder;
    if (card.kind === 'stat') {
      bus.emit('toast', { text: t('skillMsg.statUp', { stat: t(`stat.${card.stat}`), amount: card.amount }) });
    } else {
      const def = findSkill(d.skills, card.skillId);
      const owned = r.holder.loadout.owned[card.skillId]!;
      const skill = t(def.nameKey);
      if (card.kind === 'skillNew') bus.emit('toast', { text: t('skillMsg.acquired', { skill }) });
      else if (card.kind === 'skillLevelUp') bus.emit('toast', { text: t('skillMsg.levelUp', { skill, level: owned.level }) });
      else bus.emit('toast', { text: t('skillMsg.awakened', { skill, awakened: t(def.awakening.nameKey) }) });
      if (r.stored) bus.emit('storedNotice', { skillId: card.skillId });
    }
    this.openNextCards();
  }

  private openInventory(): void {
    if (this.modal || this.session.outcome) return;
    this.setModal('inventory');
  }

  private closeInventory(): void {
    if (this.modal === 'inventory') this.setModal(null);
  }

  private equip(skillId: string, target: number | 'passive'): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const r = equipSkill(p.loadout, skillId, target, d.skills);
    p.loadout = r.loadout;
    // 보관함에서 꺼낸 스킬은 쿨타임이 처음부터 돈다
    for (const id of r.restarted) {
      const sv = skillValues(findSkill(d.skills, id), p.loadout.owned[id]!);
      if (sv.cooldownSec > 0) p.cooldowns = { ...p.cooldowns, [id]: sv.cooldownSec };
    }
    this.refreshSkillView();
    bus.emit('inventoryChanged', {});
  }

  // ---------- 상호작용 ----------

  private nearestFloorWeapon(): FloorWeapon | null {
    const r = this.ctx.data.pickups.interactRadius;
    let best: FloorWeapon | null = null;
    let bestD = r;
    for (const fw of this.floorWeapons) {
      const dist = Math.hypot(fw.x - this.player.x, fw.y - this.player.y);
      if (dist <= bestD) {
        best = fw;
        bestD = dist;
      }
    }
    return best;
  }

  private nearCore(): Prop | null {
    const r = this.ctx.data.pickups.interactRadius;
    return this.cores.find((c) => Math.hypot(c.sprite.x - this.player.x, c.sprite.y - this.player.y) <= r + c.radius) ?? null;
  }

  private interact(): void {
    const fw = this.nearestFloorWeapon();
    if (fw) {
      const p = this.session.player;
      const { slots, dropped } = pickUpWeapon(p.weapons, fw.weaponId);
      p.weapons = slots;
      this.floorWeapons = this.floorWeapons.filter((x) => x !== fw);
      const { x, y } = fw;
      fw.destroy();
      if (dropped) this.floorWeapons.push(new FloorWeapon(this, dropped, this.weaponDefOf(dropped).spriteKey, x, y));
      this.fireCooldown = 0;
      bus.emit('toast', { text: this.ctx.t('room.pickedUp', { weapon: this.ctx.t(this.weaponDef().nameKey) }) });
      return;
    }
    if (this.nearCore()) {
      // 조우 유형 판정은 M4. 지금은 항상 null(준비 중).
      pendingEncounter.resolve(this.rng);
      bus.emit('toast', { text: this.ctx.t('room.encounterPending') });
    }
  }

  private updateInteractHint(): void {
    const kind = this.nearestFloorWeapon() ? 'weapon' : this.nearCore() ? 'core' : null;
    if (kind !== this.interactKind) this.setInteractHint(kind);
  }

  private setInteractHint(kind: 'weapon' | 'core' | null): void {
    this.interactKind = kind;
    bus.emit('interactHint', { kind });
  }

  /** 같은 알림은 toastSec에 한 번만 */
  private toastThrottled(text: string): void {
    const last = this.toastTimes.get(text) ?? -Infinity;
    if (this.time.now - last < this.ctx.data.ui.toastSec * 1000) return;
    this.toastTimes.set(text, this.time.now);
    bus.emit('toast', { text });
  }

  // ---------- 진행 ----------

  private checkPortals(): void {
    if (this.leaving) return;
    const pr = this.ctx.data.player.size / 2;
    for (const portal of this.portals) {
      if (Math.hypot(portal.sprite.x - this.player.x, portal.sprite.y - this.player.y) <= portal.radius + pr) {
        this.nextStage();
        return;
      }
    }
  }

  private nextStage(): void {
    this.leaving = true;
    const d = this.ctx.data;
    const { afterStage } = stageEndOffers(this.session.stage, d.mapgen, d.cards);
    const adv = advanceStage(this.session.stage, d.mapgen);
    if (adv.type === 'stage') {
      const data: RunSceneData = { stage: adv.next, player: this.session.player, offers: [afterStage] };
      this.scene.restart(data);
    } else {
      // 마지막 스테이지: 카드를 고른 뒤 클리어 화면
      this.queueOffers([{ kind: afterStage, boss: false }], () => this.endRun({ type: 'chapterClear', chapter: adv.chapter }));
    }
  }

  private endRun(outcome: NonNullable<RunSession['outcome']>): void {
    this.session.outcome = outcome;
    this.physics.pause();
    this.player.setAlpha(1);
    if (outcome.type === 'dead') this.player.setTint(0x555555);
    this.setInteractHint(null);
    bus.emit('overlay', { open: true });
  }

  private restartRun(): void {
    if (!this.ctx.config.seedFromUrl) this.ctx.config.seed = makeFallbackSeed();
    this.time.paused = false;
    bus.emit('overlay', { open: false });
    if (this.modal) bus.emit('modal', { kind: null });
    this.scene.restart({});
  }

  // ---------- 디버그 ----------

  private debugClearRoom(): void {
    const rid = this.session.currentRoomId;
    if (rid === null) return;
    for (const e of this.enemies.filter((x) => this.enemyRoom.get(x) === rid)) this.removeEnemy(e);
    const state = this.rooms.get(rid);
    if (state) this.handleRoomEvents(rid, state.forceClear());
  }

  private debugSetSkill(id: string, level: number, awakened: boolean): void {
    const d = this.ctx.data;
    const p = this.session.player;
    p.loadout = setSkillLevel(p.loadout, findSkill(d.skills, id), level, awakened);
    // 스킬을 없앴으면 그 스킬이 깔아 둔 오브젝트도 치운다
    if (level <= 0) for (const o of this.skillObjects.filter((x) => x.owner.split('.')[0] === id)) this.removeObject(o);
    this.refreshSkillView();
    bus.emit('inventoryChanged', {});
  }

  private debugSpawn(enemyId: string, count: number): void {
    const rid = this.session.currentRoomId;
    if (rid === null || this.modal) return;
    const rng = Rng.derive(this.ctx.config.seed, `debug-spawn-${this.time.now}`);
    // 방 웨이브와 무관하게 소환(방 클리어 판정에 넣지 않음)
    for (let i = 0; i < count; i++) this.spawnEnemy(enemyId, rid, rng, false);
  }

  /** 플레이어 둘레에서 플레이어를 향해 일반 적 탄을 쏜다 (적 공격은 M3, 역장 확인용) */
  private debugBarrage(): void {
    if (this.modal || this.session.outcome) return;
    const d = this.ctx.data.enemies;
    const cfg = d.debugBarrage;
    for (let i = 0; i < cfg.count; i++) {
      const a = (i * Math.PI * 2) / cfg.count;
      const x = this.player.x + Math.cos(a) * cfg.distance;
      const y = this.player.y + Math.sin(a) * cfg.distance;
      const b = this.enemyBullets.create(x, y, d.projectile.spriteKey) as Phaser.Physics.Arcade.Image;
      b.setDepth(5);
      b.setData({ damage: cfg.damage, refractable: true, cuttable: true });
      b.setVelocity(-Math.cos(a) * cfg.speed, -Math.sin(a) * cfg.speed);
    }
  }

  private updateCamera(): void {
    const cam = this.cameras.main;
    const rid = roomAt(this.session.map, this.m, this.player.x, this.player.y);
    const target = rid !== null ? roomCenter(this.session.map.rooms[rid]!, this.m) : { x: this.player.x, y: this.player.y };
    const lerp = this.ctx.data.ui.cameraLerp;
    cam.scrollX += (target.x - cam.width / 2 - cam.scrollX) * lerp;
    cam.scrollY += (target.y - cam.height / 2 - cam.scrollY) * lerp;
  }
}

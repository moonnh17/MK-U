import { playFx } from '../skills/skillFx';
import { buildPathField, pathDir, segmentClear, type PathField } from '../systems/pathField';
import { IDLE_DODGE } from '../systems/dodge';
import Phaser from 'phaser';
import { RunDebug } from './run/runDebug';
import { WorldBuilder } from './run/worldBuilder';
import { LootInteract } from './run/lootInteract';
import { SkillRuntime } from './run/skillRuntime';
import { Encounters } from './run/encounters';
import { Progression } from './run/progression';
import { WeaponCombat } from './run/weaponCombat';
import { StageFx } from './run/stageFx';
import { PlayerCondition } from './run/playerCondition';
import { RoomProps } from './run/roomProps';
import { SKILL_ACTIONS, sfx, type Modal, type Prop, type RunSceneData } from './run/shared';
import type { Vec2 } from '../core/actions';
import { getContext, type GameContext } from '../core/context';
import { bus } from '../core/events';
import { DISABLED_ACTIONS } from '../core/features';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import { newPlayerState, type RunSession } from '../core/session';
import { BossController } from '../bosses/bossController';
import type { BossHost } from '../bosses/host';
import { Door } from '../entities/door';
import { Enemy, type EnemyHost } from '../entities/enemy';
import { Darkness } from '../entities/darkness';
import { BreakableProp } from '../entities/roomProp';
import { applyMental } from '../systems/sanity';
import { animateArt, fitArt } from '../entities/art';
import { Juice, shake } from '../entities/juice';
import { cameraFocus, viewSize } from '../systems/camera';
import { HitStop, slowMoScale } from '../systems/juice';
import { artKeys } from '../systems/art';
import { ItemRuntime } from '../items/runtime';
import { DelayedBlast, type Hazard } from '../entities/hazard';
import { Pickup } from '../entities/pickup';
import { nearestEnemy, type SkillHost } from '../skills/host';
import { runStartOffers, stageEndOffers } from '../systems/cards';
import { gradeMultiplier, type Stats } from '../systems/damage';
import { assignElites, eliteCount } from '../systems/elites';
import { championWaves, enemyHpScale, raidChampions } from '../systems/champions';
import { rollOptions } from '../systems/loot';
import { generateStage } from '../systems/mapgen';
import { hiddenChapterMul } from '../systems/hiddenBoss';
import { steerToward } from '../systems/motion';
import { crystalBreakdown, rollShard } from '../systems/runRecord';
import { MiniQueue } from '../systems/gemini';
import { inSpireCircle } from '../systems/spire';
import { RoomState, type RoomEvent, type Wave } from '../systems/roomState';
import { advanceStage, playableChapters, firstStage } from '../systems/run';
import { absorbHit } from '../systems/shield';
import { corruptedDamage, tickCorruption } from '../systems/acro';
import { hpStance, takeDamage } from '../systems/vitals';
import { gainGauge, tickCooldowns } from '../systems/skills';
import { maxHpFor, setStat, statEffect } from '../systems/stats';
import { buffDuration, tickBleed } from '../systems/tags';
import { activeWeapon, autoAim, gainEnergy, normalize, plainWeapon, canFire, swapWeapon, weaponStats, type WeaponItem, type WeaponStats } from '../systems/weapons';
import { contains, interiorRect, mapBounds, metrics, roomAt, roomCenter, roomRect, type Rect, type WorldMetrics } from '../systems/worldLayout';
import type { BleedRule, StatId, TagId, WeaponDef } from '../types/data';

/** 전투 씬: 스테이지 하나(방·복도·적·무기·스킬). 스테이지를 넘기면 다음 스테이지 데이터로 재시작한다. */
export type { RunSceneData } from './run/shared';

export class RunScene extends Phaser.Scene {
  roomProps!: RoomProps;
  condition!: PlayerCondition;
  stageFx!: StageFx;
  combat!: WeaponCombat;
  progression!: Progression;
  encounters!: Encounters;
  skillRt!: SkillRuntime;
  loot!: LootInteract;
  world!: WorldBuilder;
  debugTools!: RunDebug;
  ctx!: GameContext;
  /** 사망 연출 중 */
  dying = false;
  session!: RunSession;
  m!: WorldMetrics;
  rng!: Rng;
  host!: SkillHost;

  player!: Phaser.Physics.Arcade.Sprite;
  weaponSprite!: Phaser.GameObjects.Image;
  walls!: Phaser.Physics.Arcade.StaticGroup;
  doorGroup!: Phaser.Physics.Arcade.StaticGroup;
  enemyGroup!: Phaser.Physics.Arcade.Group;
  bullets!: Phaser.Physics.Arcade.Group;
  /** 적 투사체 (M3부터 사용, 칼 탄 베기 대상) */
  enemyBullets!: Phaser.Physics.Arcade.Group;

  doorsByRoom = new Map<number, Door[]>();
  rooms = new Map<number, RoomState>();
  enemies: Enemy[] = [];
  enemyRoom = new Map<Enemy, number>();
  pickups: Pickup[] = [];
  portals: Prop[] = [];
  cores: Prop[] = [];
  /** 타격감 연출·히트스톱 (멈춘 동안은 물리와 적이 멈춘다), 다음 피해가 치명타인지 */
  juice!: Juice;
  hitStop!: HitStop;
  stopping = false;
  /** 방 장애물 (적 소환 자리를 피한다) */
  obstacles = new Map<number, Rect[]>();
  /** 지금 조준 중인 적 (카메라가 그쪽으로 기운다) */
  aimTarget: Vec2 | null = null;
  /** 보스 처치 슬로모션 경과(초), 없으면 null */
  slowT: number | null = null;
  /** 일식 어둠과 그 보스 (식광) */
  darkness: Darkness | null = null;
  darknessBoss: Enemy | null = null;
  /** 적 쪽 위험 지대(폭발 엘리트 지연 폭발 등) */
  hazards: Hazard[] = [];
  enemyHost!: EnemyHost;
  /** 아이템 발동형 효과·상태 */
  itemRt!: ItemRuntime;
  bossHost!: BossHost;
  /** 보스 적 → 패턴 컨트롤러 */
  bossControllers = new Map<Enemy, BossController>();
  /** MK 돌진 */
  dashLeft = 0;
  dashVel: Vec2 = { x: 0, y: 0 };

  aimDir: Vec2 = { x: 1, y: 0 };
  invuln = 0;
  pathFields = new Map<number, PathField>();
  toastTimes = new Map<string, number>();
  unsubs: (() => void)[] = [];
  initData: RunSceneData = {};

  // 카드·인벤토리
  modal: Modal = null;
  /** 포털을 탔다(카드를 고르는 동안 포털을 다시 밟지 않게) */
  leaving = false;

  constructor() {
    super('Run');
  }

  init(data: RunSceneData): void {
    this.initData = data ?? {};
  }

  create(): void {
    this.debugTools = new RunDebug(this);
    this.world = new WorldBuilder(this);
    this.loot = new LootInteract(this);
    this.skillRt = new SkillRuntime(this);
    this.encounters = new Encounters(this);
    this.progression = new Progression(this);
    this.combat = new WeaponCombat(this);
    this.stageFx = new StageFx(this);
    this.condition = new PlayerCondition(this);
    this.roomProps = new RoomProps(this);
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
      player: this.initData.player ?? newPlayerState(d, this.initData.job, this.ctx.save.data.upgrades[this.initData.job ?? d.jobs.startJob]),
      enemiesAlive: 0,
      outcome: null,
      energyEmptyAt: -Infinity,
      skillView: [],
      dodgeView: { nameKey: d.player.dodge.nameKey, left: 0, total: d.player.dodge.cooldownSec },
      buffs: [],
      encounters: new Map(),
      effStats: { ...(this.initData.player?.stats ?? newPlayerState(d).stats) },
      settlement: null,
      boss: null,
    };
    this.ctx.session = this.session;
    this.rng = Rng.derive(seed, `combat-${stage.chapter}-${stage.stage}`);
    this.progression.mini = new MiniQueue(d.gemini.mini.showSec, d.gemini.mini.fadeSec);
    // 연출용 난수는 전투 난수와 따로 (시드 재현에 영향 없게)
    this.juice = new Juice(this, d, Rng.derive(seed, `juice-${stage.chapter}-${stage.stage}`));
    this.hitStop = new HitStop(d.juice.hitStop.minGapSec);
    this.stopping = false;
    this.combat.pendingCrit = false;
    this.stageFx.intro = null;
    this.slowT = null;
    // 슬로모션 중에 스테이지를 넘어가도 배속이 남지 않게
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    this.aimTarget = null;
    this.obstacles = new Map();
    this.progression.storyThen = null;
    bus.emit('geminiMini', { line: null });
    // 챕터를 끝내고 넘어왔다 (2장 종료 미니 대사)
    if (!newRun && stage.stage === 1 && stage.chapter > 1) this.progression.say('chapterEnd', String(stage.chapter - 1));
    this.m = metrics(d.mapgen);
    this.skillRt.hosts = new Map();
    this.host = this.skillRt.hostFor(null);
    this.itemRt = new ItemRuntime({
      scene: this,
      ctx: this.ctx,
      player: () => this.session.player,
      skill: () => this.skillRt.hostFor('item'),
      skillFor: (id) => this.skillRt.hostFor(id),
      fireBullet: (from, angle, speed, range, base, tags, pierce) => this.combat.fireBullet(from, angle, speed, range, base, tags, 'item', { pierce, crit: 0 }),
      setInvuln: (sec) => {
        this.invuln = Math.max(this.invuln, sec);
      },
      buffDuration: (sec) => this.skillRt.hostFor('item').buffDuration(sec, ['buff']),
      burstArea: (r) => this.skillRt.burstArea(r),
      toast: (text) => bus.emit('toast', { text }),
      arena: () => this.currentArena(),
      blink: (distance) => this.blinkPlayer(distance),
      absorbEnemyBullets: (at, radius) => this.absorbEnemyBullets(at, radius),
    });
    this.enemyHost = {
      scene: this,
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      playerRadius: d.player.size / 2,
      hurtPlayer: (amount, attacker, mental) => this.hurtPlayer(amount, attacker ?? null, mental),
      fireEnemyBullet: (from, angle, speed, range, damage, refractable, mental) => this.fireEnemyBullet(from, angle, speed, range, damage, refractable, 0, mental),
      addHazard: (h) => this.hazards.push(h),
      linkWindup: (e, attackId) => this.linkWindup(e, attackId),
      rng: this.rng,
      pullPlayer: (to, speed) => this.pullPlayer(to, speed),
      pathDir: (from, radius) => this.enemyPathDir(from, radius),
    };
    this.bossHost = {
      ...this.enemyHost,
      rng: this.rng,
      t: (key) => this.ctx.t(key),
      addHazard: (h) => this.hazards.push(h),
      fireEnemyBullet: (from, angle, speed, range, damage, refractable) =>
        this.fireEnemyBullet(from, angle, speed, range, damage, refractable),
      fireEnemyMissile: (from, angle, speed, range, damage, turnRate) => this.fireEnemyBullet(from, angle, speed, range, damage, true, turnRate),
      pushPlayer: (v) => {
        const body = this.player.body as Phaser.Physics.Arcade.Body;
        body.velocity.x += v.x;
        body.velocity.y += v.y;
      },
      spawnMinion: (id, at, maxHp) => this.spawnMinion(id, at, maxHp),
      removeMinion: (e) => {
        if (!e.dead) this.removeEnemy(e);
      },
      addObstacle: (at, radius, doorClear) => this.world.addObstacle(at, radius, doorClear),
      chapterRoster: () => this.chapterRoster(),
      arena: () => this.currentArena(),
      bossPhaseFx: (text, color, at) => this.stageFx.bossPhaseFx(text, color, at),
    };

    this.walls = this.physics.add.staticGroup();
    this.doorGroup = this.physics.add.staticGroup();
    this.roomProps.propGroup = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    this.world.buildWorld();
    this.stageFx.showTutorial();

    const start = roomCenter(map.rooms[map.startId]!, this.m);
    this.player = this.physics.add.sprite(start.x, start.y, d.player.spriteKey).setDepth(4);
    fitArt(d, this.player, d.player.size, d.player.height ?? d.player.size);
    this.applyPlayerArt();
    this.weaponSprite = this.add.image(start.x, start.y, this.weaponDef().spriteKey).setDepth(4);
    if (this.initData.warpIn) this.stageFx.warpIn();
    // 카메라: 확대하고 첫 프레임부터 제자리 (다음부터는 부드럽게 따라간다)
    {
      const cam = this.cameras.main;
      cam.setZoom(d.ui.camera.zoom * this.ctx.renderScale);
      const t0 = this.cameraTarget();
      cam.setScroll(t0.x - cam.width / 2, t0.y - cam.height / 2);
    }
    if (stage.chapter === 1 && stage.stage === 1 && this.ctx.config.testWeapons) this.world.placeTestWeapons();

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.doorGroup);
    this.physics.add.collider(this.player, this.roomProps.propGroup);
    this.physics.add.collider(this.enemyGroup, this.roomProps.propGroup);
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.doorGroup);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    const killBullet = (b: unknown) => (b as Phaser.GameObjects.GameObject).destroy();
    this.physics.add.collider(this.bullets, this.walls, killBullet);
    this.physics.add.collider(this.bullets, this.doorGroup, killBullet);
    this.physics.add.collider(this.enemyBullets, this.walls, killBullet);
    // 소품은 엄폐물: 양쪽 탄을 막고, 맞으면 부서진다 (석상은 막기만 한다)
    const propHit = (b: unknown, s: unknown, amount: (bullet: Phaser.GameObjects.GameObject) => number) => {
      const bullet = b as Phaser.GameObjects.GameObject;
      const prop = (s as Phaser.GameObjects.GameObject).getData('prop') as BreakableProp | undefined;
      if (prop) this.roomProps.damageBreakable(prop, amount(bullet));
      bullet.destroy();
    };
    this.physics.add.collider(this.bullets, this.roomProps.propGroup, (b, s) => propHit(b, s, (x) => x.getData('base') as number));
    this.physics.add.collider(this.enemyBullets, this.roomProps.propGroup, (b, s) => propHit(b, s, (x) => x.getData('damage') as number));
    this.physics.add.overlap(this.bullets, this.enemyGroup, (b, e) => this.combat.onBulletHit(b as Phaser.Physics.Arcade.Image, e as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.onEnemyBulletHit(b as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemyGroup, (_p, e) =>
      this.onContact((e as Phaser.GameObjects.GameObject).getData('enemy') as Enemy),
    );

    const b = mapBounds(map, this.m);
    this.physics.world.setBounds(b.x, b.y, b.w, b.h);
    const cam = this.cameras.main;
    cam.centerOn(start.x, start.y);

    this.unsubs.push(
      bus.on('debugClearRoom', () => this.debugTools.debugClearRoom()),
      bus.on('restartRequested', () => this.restartRun()),
      bus.on('cardPick', ({ index }) => this.progression.pickCard(index)),
      bus.on('inventoryEquip', ({ skillId, target }) => this.progression.equip(skillId, target)),
      bus.on('inventoryDropWeapon', ({ slot }) => this.loot.dropFromSlot(slot)),
      bus.on('inventoryOpenRequest', () => this.progression.openInventory()),
      bus.on('inventoryCloseRequest', () => this.progression.closeInventory()),
      bus.on('debugSetSkill', (e) => this.debugTools.debugSetSkill(e.skillId, e.level, e.awakened)),
      bus.on('debugSetStat', ({ stat, value }) => {
        const before = { hp: this.session.player.hp, maxHp: this.session.player.maxHp };
        this.session.player = { ...setStat(this.session.player, stat, value, d.player.maxHp, d.stats), ...before };
        this.syncMaxHp();
      }),
      bus.on('debugOpenCards', ({ kind }) => this.progression.queueOffers([{ kind, boss: false }])),
      bus.on('debugFillUltimate', () => {
        this.session.player.ultimate.gauge = this.skillRt.ultimateDef().gaugeMax;
      }),
      bus.on('debugSpawn', ({ enemyId, count, elite }) => this.debugTools.debugSpawn(enemyId, count, elite ?? null)),
      bus.on('debugBarrage', () => this.debugTools.debugBarrage()),
      bus.on('cutsceneDone', () => this.progression.showNextCut()),
      bus.on('storyDone', () => this.progression.finishStory()),
      bus.on('itemGetDone', () => {
        if (this.modal === 'itemGet') this.setModal(null);
      }),
      bus.on('pauseResume', () => {
        if (this.modal === 'pause') this.setModal(null);
      }),
      bus.on('cardReroll', () => this.progression.rerollCards()),
      bus.on('debugForceEncounter', ({ kind }) => {
        this.encounters.forcedEncounter = kind;
      }),
      bus.on('debugGoStage', ({ chapter, stage }) => {
        if (this.modal || this.session.outcome) return;
        this.scene.restart({ stage: { chapter, stage }, player: this.session.player, offers: [] } satisfies RunSceneData);
      }),
      bus.on('debugHiddenBoss', ({ id }) => {
        this.encounters.forcedEncounter = 'hiddenBoss';
        this.encounters.forcedHiddenBoss = id;
      }),
      bus.on('debugGiveWeapon', ({ defId, grade }) => {
        const d = this.ctx.data;
        const def = this.weaponDefOf(defId);
        const count = d.groupMultipliers.grades.find((g) => g.id === grade)?.randomOptions ?? 0;
        const rng = Rng.derive(this.ctx.config.seed, `debug-weapon-${this.loot.lootSeq++}`);
        const options = rollOptions(rng, def, count, d.weapons.options);
        this.loot.dropWeapon({ defId, grade, options }, this.player.x + 16, this.player.y);
      }),
      bus.on('debugGiveItem', ({ itemId }) => this.loot.giveItem(itemId)),
      bus.on('debugCoins', ({ amount }) => {
        this.session.player.coins += amount;
      }),
      bus.on('debugAdvance', ({ hectar, acro }) => this.debugTools.debugAdvance(hectar, acro)),
      bus.on('debugBossHp', ({ ratio }) => {
        for (const e of this.enemies) if (e.def.rank === 'boss' || e.def.rank === 'hiddenBoss') e.hp = Math.max(1, e.maxHp * ratio);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      for (const o of this.skillRt.skillObjects) o.destroy();
      this.skillRt.skillObjects = [];
      for (const h of this.hazards) h.destroy();
      this.hazards = [];
      for (const b of this.bossControllers.values()) b.destroy();
      this.bossControllers = new Map();
    });
    this.loot.setInteractHint(null);
    this.skillRt.refreshSkillView();

    // 런 시작 스킬 카드 / 앞 스테이지가 넘긴 카드는 시작방에서 고른다
    const offers = newRun ? runStartOffers(d.cards) : (this.initData.offers ?? []);
    this.progression.queueOffers(offers.map((kind) => ({ kind, boss: false })));
  }

  resetFields(): void {
    this.dying = false;
    this.doorsByRoom = new Map();
    this.rooms = new Map();
    this.enemies = [];
    this.enemyRoom = new Map();
    this.pickups = [];
    this.loot.floorWeapons = [];
    this.roomProps.breakables = [];
    this.roomProps.statues = [];
    this.roomProps.doorIcons = [];
    this.portals = [];
    this.loot.vendings = [];
    this.loot.potions = [];
    this.loot.interactPrompt = null;
    this.loot.itemGets = [];
    this.cores = [];
    this.loot.chests = [];
    this.loot.stands = [];
    this.loot.cardStands = [];
    this.encounters.raidRooms = new Set();
    this.encounters.hiddenBossRooms = new Map();
    this.encounters.spires = [];
    this.encounters.spireStrong = new Set();
    this.darkness = null;
    this.darknessBoss = null;
    this.encounters.spireEvents = [];
    this.combat.charging = false;
    this.combat.chargeT = 0;
    this.combat.chargeFx = null;
    this.skillRt.skillObjects = [];
    this.hazards = [];
    this.bossControllers = new Map();
    this.skillRt.shield = null;
    this.skillRt.shieldOpts = null;
    this.skillRt.shieldFx = null;
    this.skillRt.shieldRim = null;
    this.skillRt.passiveKey = '';
    this.skillRt.passiveId = null;
    this.dashLeft = 0;
    this.aimDir = { x: 1, y: 0 };
    this.combat.fireCooldown = 0;
    this.invuln = 0;
    this.condition.dodge = IDLE_DODGE;
    this.stageFx.tutorialTexts = [];
    this.condition.panicFx = null;
    this.condition.panicTinted = false;
    this.condition.dodgeBar = null;
    this.pathFields = new Map();
    this.condition.bossHpSeen = new Map();
    this.loot.interactKind = null;
    this.loot.lootSeq = 0;
    this.toastTimes = new Map();
    this.modal = null;
    this.progression.offerQueue = [];
    this.progression.afterOffers = [];
    this.progression.currentCards = null;
    this.progression.cutQueue = [];
    this.progression.afterCuts = null;
    this.progression.pendingAdvance = null;
    this.progression.cardSeq = 0;
    this.leaving = false;
  }

  // ---------- 월드 ----------

  /** 플레이어 모습: 전직했으면 그 학파 그림(있으면), 아니면 기본 */
  applyPlayerArt(): void {
    const d = this.ctx.data;
    const school = this.session.player.advancement;
    const key = school && this.ctx.artLoaded.has(artKeys.playerSchool(school)) ? artKeys.playerSchool(school) : d.player.spriteKey;
    if (this.player.texture.key === key) return;
    this.player.anims.stop();
    this.player.setTexture(key, 0);
    fitArt(d, this.player, d.player.size, d.player.height ?? d.player.size);
  }

  // ---------- 보스 연출 ----------

  /** 보스 체력바에 띄울 보스 (보스가 부른 적·분신 제외, 등장 컷 동안은 없음) */
  bossView(): RunSession['boss'] {
    if (this.stageFx.intro) return null;
    for (const [e, c] of this.bossControllers) {
      if (e.dead) continue;
      return { name: this.ctx.t(e.def.nameKey), hp: e.hp, maxHp: e.maxHp, markers: c.def.enrageAt > 0 ? [c.def.enrageAt] : [], color: e.def.color };
    }
    return null;
  }

  /** 카메라가 평소 볼 곳: 플레이어(조준 적 쪽으로 기울어), 방 안이면 방 경계 안 */
  cameraTarget(): Vec2 {
    const rules = this.ctx.data.ui.camera;
    const cam = this.cameras.main;
    const rid = roomAt(this.session.map, this.m, this.player.x, this.player.y);
    const room = rid !== null ? roomRect(this.session.map.rooms[rid]!, this.m) : null;
    return cameraFocus({ x: this.player.x, y: this.player.y }, this.aimTarget, viewSize(cam.width, cam.height, rules.zoom * this.ctx.renderScale), rules, room);
  }

  // ---------- 루프 ----------

  override update(_time: number, deltaMs: number): void {
    let dt = Math.min(deltaMs / 1000, 0.05);
    let frame = this.ctx.input.poll();
    this.stageFx.updateMusic();
    // 보스 처치 슬로모션: 물리·트윈·게임 시간을 함께 늦춘다
    if (this.slowT !== null) {
      this.slowT += dt;
      const sc = slowMoScale(this.slowT, this.ctx.data.juice.bossKill);
      this.physics.world.timeScale = 1 / sc;
      this.tweens.timeScale = sc;
      if (sc >= 1) this.slowT = null;
      dt *= sc;
    }
    if (this.stageFx.intro) this.stageFx.updateIntro(dt, frame);
    this.session.boss = this.bossView();

    for (const action of frame.pressed) {
      const enabled = !DISABLED_ACTIONS.has(action);
      console.info(this.ctx.t(enabled ? 'system.command' : 'system.disabledCommand', { action }));
      bus.emit('command', { action, enabled });
    }

    if (this.dying && !this.session.outcome) return;
    if (this.session.outcome) {
      if (frame.pressed.has('attack') || frame.pressed.has('interact')) this.restartRun();
      return;
    }
    if (!this.modal && this.loot.itemGets.length > 0) {
      this.setModal('itemGet');
      bus.emit('itemGot', this.loot.itemGets.shift()!);
    }
    if (this.modal) {
      this.progression.updateModal(frame);
      this.skillRt.refreshSkillView();
      return;
    }
    // 미니 대사: 창이 열린 동안은 표시 시간도 멈춘다
    const ml = this.progression.mini.update(dt);
    if (ml) bus.emit('geminiMini', ml);
    // 히트스톱: 아주 잠깐 물리·적·입력을 멈춘다 (연출 트윈은 계속)
    const stopped = this.hitStop.update(dt);
    if (stopped !== this.stopping) {
      this.stopping = stopped;
      if (stopped) this.physics.pause();
      else if (!this.session.outcome) this.physics.resume();
    }
    this.juice.update(dt, this.session.player.hp / this.session.player.maxHp);
    if (stopped) return;
    this.combat.pendingCrit = false;
    // 일시정지 창
    if (frame.pressed.has('pause')) {
      this.setModal('pause');
      return;
    }
    this.session.player.record.playSec += dt;

    const p = this.session.player;
    const d = this.ctx.data;
    const mods = this.skillRt.playerMods();
    this.syncMaxHp();
    this.condition.updateSanity(dt);
    // 패닉: 방향이 뒤집힌다
    if (p.panic && !this.itemRt.first('panicCalm')) frame = { ...frame, move: { x: -frame.move.x, y: -frame.move.y } };
    this.itemRt.update(dt);
    this.condition.updateDodge(dt, frame);
    const speed = d.player.moveSpeed * (1 + statEffect('moveSpeed', this.effStats(), d.stats)) * (1 + mods.moveSpeed) * (1 + this.itemRt.moveSpeedBonus());
    if (this.dashLeft > 0) {
      // MK 돌진: 입력 대신 돌진 방향으로
      this.dashLeft -= dt;
      this.player.setVelocity(this.dashVel.x, this.dashVel.y);
    } else if (this.condition.dodge.left > 0) {
      this.player.setVelocity(this.condition.dodge.vel.x, this.condition.dodge.vel.y);
    } else {
      this.player.setVelocity(frame.move.x * speed, frame.move.y * speed);
    }
    const moving = frame.move.x !== 0 || frame.move.y !== 0;

    this.updateRooms(dt);
    this.encounters.updateSpires(dt);

    for (const e of this.enemies) {
      // 집정관: 플레이어가 그 방을 나가면 흡수 초기화
      if (e.def.absorb && this.enemyRoom.get(e) !== this.session.currentRoomId) e.resetAbsorb();
      e.update(dt, this.enemyHost);
    }
    for (const b of this.bossControllers.values()) b.update(dt, this.bossHost);
    this.condition.updateBossEnergy();
    for (const h of [...this.hazards]) {
      if (h.update(dt, this.enemyHost)) continue;
      h.destroy();
      this.hazards = this.hazards.filter((x) => x !== h);
    }
    this.session.enemiesAlive = this.enemies.length;

    // 조준: 가장 가까운 적. 적이 없으면 마지막 방향(이동 중이면 이동 방향으로 갱신)
    const aim = autoAim(
      this.player,
      this.enemies.map((e) => e.sprite),
      this.aimDir,
    );
    this.aimDir = aim.target ? aim.dir : moving ? normalize(frame.move) : this.aimDir;
    this.aimTarget = aim.target ? { x: aim.target.x, y: aim.target.y } : null;
    const aimAngle = Math.atan2(this.aimDir.y, this.aimDir.x);

    if (frame.pressed.has('swapWeapon')) {
      p.weapons = swapWeapon(p.weapons);
      this.combat.fireCooldown = 0;
      this.combat.resetCharge();
    }
    if (frame.pressed.has('interact')) this.loot.interact();

    this.combat.updateAttack(dt, frame.held.has('attack'), aimAngle);

    // 스킬
    p.cooldowns = tickCooldowns(p.cooldowns, dt);
    SKILL_ACTIONS.forEach((action, i) => {
      if (frame.pressed.has(action)) this.skillRt.castSlot(i);
    });
    if (frame.pressed.has('ultimate')) this.skillRt.castUltimate();
    this.skillRt.syncPassive();
    this.skillRt.updateShield(dt);
    for (const o of [...this.skillRt.skillObjects]) if (!o.update(dt, this.skillRt.hostFor(o.owner))) this.skillRt.removeObject(o);
    this.updateBleeds(dt);
    this.updateCorruption(dt);

    this.updateBullets(dt);
    this.updatePickups(dt);
    this.condition.updateInvuln(dt);
    this.loot.updatePotions();
    this.loot.updateInteractHint();
    this.roomProps.updateDoorIcons();
    this.stageFx.updateTutorial();

    const weaponKey = this.shownWeaponKey();
    const handAt = this.combat.handPos();
    this.weaponSprite
      .setTexture(weaponKey)
      .setOrigin(d.art.sprites[weaponKey]?.gripX ?? 0.5, 0.5)
      // 왼쪽을 겨눌 때 총이 거꾸로 서지 않게
      .setFlipY(this.aimDir.x < 0)
      .setPosition(handAt.x, handAt.y)
      .setRotation(aimAngle);

    animateArt(d, this.player);
    this.updateCamera();
    const cam = this.cameras.main;
    // 화면 고정 어둠도 확대를 받는다: 지역 좌표 = 화면 가운데 + (플레이어 − 보이는 곳 가운데)
    if (this.darknessBoss && this.bossControllers.get(this.darknessBoss)?.enraged) {
      this.darkness?.lift();
      this.darkness = null;
      this.darknessBoss = null;
    }
    this.darkness?.update(dt, cam.width / 2 + (this.player.x - cam.midPoint.x), cam.height / 2 + (this.player.y - cam.midPoint.y));
    this.skillRt.refreshSkillView();
    if (frame.pressed.has('inventory')) this.progression.openInventory();
  }

  updateRooms(dt: number): void {
    const { map, visited } = this.session;
    const rid = roomAt(map, this.m, this.player.x, this.player.y);
    if (rid !== null) {
      this.session.currentRoomId = rid;
      visited.add(rid);
      const state = this.rooms.get(rid)!;
      const inner = interiorRect(map.rooms[rid]!, this.m, this.ctx.data.mapgen.lockInsetPx);
      // 조우 칸: 안쪽에 들어서면 유형이 정해진다
      if (map.rooms[rid]!.kind === 'encounterRoom' && !this.session.encounters.has(rid) && contains(inner, this.player.x, this.player.y)) {
        this.encounters.resolveEncounter(rid);
      }
      if (this.rooms.get(rid)!.phase === 'idle' && contains(inner, this.player.x, this.player.y)) {
        // 보스방: 경고 배너를 띄우고 그동안 보스 소환을 미룬다
        const boss = state.kind === 'bossRoom' ? state.waves[0]?.[0] : undefined;
        const bossDef = boss ? this.ctx.data.enemies.enemies.find((e) => e.id === boss) : undefined;
        if (bossDef) this.stageFx.showBossWarning(this.ctx.t(bossDef.nameKey));
        this.handleRoomEvents(rid, state.enter(bossDef ? this.ctx.data.bosses.bannerSec : 0));
        // 바바리안 데스 휘슬: 전투 칸에 들어갈 때 함성
        if (state.kind === 'combatRoom') this.itemRt.triggerRoar();
      }
    }
    for (const [id, state] of this.rooms) {
      if (state.phase === 'locked') this.handleRoomEvents(id, state.update(dt));
    }
  }

  handleRoomEvents(roomId: number, events: RoomEvent[]): void {
    for (const e of events) {
      if (e.type === 'lock') {
        this.setRoomLocked(roomId, true);
        // 보스는 등장 연출이 따로 있다
        if (this.rooms.get(roomId)?.kind !== 'bossRoom' && !this.encounters.hiddenBossRooms.has(roomId)) {
          bus.emit('combatBanner', { kind: 'start' });
          sfx('combatStart');
          shake(this, 'light');
        }
      }
      else if (e.type === 'spawn') this.spawnWave(roomId, e.wave, e.index);
      else {
        this.setRoomLocked(roomId, false);
        const node = this.session.map.rooms[roomId]!;
        const rc = this.ctx.data.juice.roomClear;
        bus.emit('combatBanner', { kind: 'clear' });
        sfx('roomClear');
        this.juice.colorBurst({ x: this.player.x, y: this.player.y }, rc.color, rc);
        const cam = this.cameras.main;
        const base = this.ctx.data.ui.camera.zoom * this.ctx.renderScale;
        this.tweens.add({ targets: cam, zoom: base * rc.zoom, duration: (rc.zoomSec * 1000) / 2, yoyo: true, onComplete: () => cam.setZoom(base) });
        if (node.kind === 'combatRoom') this.encounters.combatRoomDrop(roomId);
        if (this.encounters.raidRooms.has(roomId)) this.encounters.raidReward(roomId);
        if (this.encounters.hiddenBossRooms.has(roomId)) this.encounters.hiddenBossReward(roomId);
        // 보스 스테이지: 보스방에서 스킬 카드를 1회 더 고른 뒤 포털이 생긴다(보스방이 출구를 겸함)
        if (node.kind === 'bossRoom') {
          const end = stageEndOffers(this.session.stage, this.ctx.data.mapgen, this.ctx.data.cards);
          const bossId = this.rooms.get(roomId)?.waves[0]?.[0];
          // 식광·마기카이저: 처치 후 일반 스토리 대화 (내용이 비어 있으면 건너뜀)
          this.progression.playStory('bossKill', bossId, () =>
            this.progression.queueOffers(
              end.bossRoom.map((kind) => ({ kind, boss: true })),
              () => this.progression.afterBossRoom(node),
            ),
          );
        }
      }
    }
  }

  setRoomLocked(roomId: number, locked: boolean): void {
    const doors = this.doorsByRoom.get(roomId) ?? [];
    if (doors.length > 0 && doors.some((d) => d.rect.visible !== locked)) sfx(locked ? 'doorLock' : 'doorOpen');
    for (const door of doors) door.setLocked(locked);
  }

  spawnWave(roomId: number, wave: Wave, index: number): void {
    const { map } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `spawn-${map.chapter}-${map.stage}-${roomId}-${index}`);
    // 전투 칸 웨이브의 일반 적 일부를 엘리트로 (보스방 제외)
    const node = map.rooms[roomId]!;
    const d = this.ctx.data;
    const elites =
      node.kind === 'combatRoom' || this.encounters.raidRooms.has(roomId)
        ? assignElites(
            Rng.derive(this.ctx.config.seed, `elite-${map.chapter}-${map.stage}-${roomId}-${index}`),
            wave,
            this.encounters.raidRooms.has(roomId)
              ? d.loot.raid.elitesPerWave
              : eliteCount(Rng.derive(this.ctx.config.seed, `elite-count-${map.chapter}-${map.stage}-${roomId}-${index}`), map.chapter, map.stage, d.elites),
            (id) => d.enemies.enemies.find((e) => e.id === id)!.rank,
            d.elites,
          )
        : wave.map(() => null);
    wave.forEach((id, i) => this.spawnEnemy(id, roomId, rng, true, elites[i] ?? null));
    // 정예(집행자·집정관): 3장 일부 전투 칸 웨이브에 1마리, 습격은 한 웨이브에 하나 또는 둘 (엘리트 없음)
    const total = this.rooms.get(roomId)?.waves.length ?? 0;
    const champLabel = `champion-${map.chapter}-${map.stage}-${roomId}`;
    const champs = this.encounters.raidRooms.has(roomId)
      ? (raidChampions(Rng.derive(this.ctx.config.seed, champLabel), map.chapter, total, d.waves.champions)[index] ?? [])
      : node.kind === 'combatRoom'
        ? [championWaves(Rng.derive(this.ctx.config.seed, champLabel), map.chapter, map.stage, total, d.waves.champions)[index] ?? null].filter((x): x is string => x !== null)
        : [];
    for (const id of champs) this.spawnEnemy(id, roomId, rng, true);
    if (champs.length > 0) this.progression.say('championMet');
    this.rooms.get(roomId)?.addAlive(champs.length);
  }

  /** extraEliteId: 두 번째 엘리트 (중형 첨탑 강적) */
  spawnEnemy(id: string, roomId: number, rng: Rng, countForRoom: boolean, eliteId: string | null = null, extraEliteId: string | null = null): void {
    const d = this.ctx.data;
    const node = this.session.map.rooms[roomId]!;
    const def = d.enemies.enemies.find((e) => e.id === id)!;
    const pos = def.ai === 'idle' ? roomCenter(node, this.m) : this.world.spawnPoint(node, rng, def.size / 2);
    const elite = eliteId ? (d.elites.elites.find((x) => x.id === eliteId) ?? null) : null;
    const extra = extraEliteId ? (d.elites.elites.find((x) => x.id === extraEliteId) ?? null) : null;
    const icon = [elite, extra].filter((x) => x !== null).map((x) => this.ctx.t(x!.iconKey)).join('');
    const enemy = new Enemy(this, def, pos.x, pos.y, d.waves.spawnWarnSec, elite, d.elites, icon, extra);
    if (def.ai !== 'boss' && !def.summon) enemy.scaleHp(enemyHpScale(this.session.stage.chapter, this.session.stage.stage, d.enemies.hpScale));
    enemy.jitterFirstAttack(rng);
    this.enemyGroup.add(enemy.sprite);
    if (def.ai === 'idle') (enemy.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.enemies.push(enemy);
    if (countForRoom) this.enemyRoom.set(enemy, roomId);
    if (def.ai === 'boss') {
      // 히든보스: 어느 챕터든 같은 패턴, 체력·피해만 챕터 배율
      const hidden = d.bosses.hiddenBosses.find((b) => b.id === def.id);
      const core = hidden ?? d.bosses.bosses.find((b) => b.id === def.id);
      const mul = hidden ? hiddenChapterMul(d.bosses, this.session.stage.chapter) : 1;
      if (hidden) {
        enemy.setMaxHp(enemy.maxHp * mul);
        enemy.damageMul = mul;
      }
      if (core) {
        this.bossControllers.set(enemy, new BossController(enemy, core, mul));
        if (!this.stageFx.intro) this.stageFx.startBossIntro(enemy);
      }
      // 식광: 일식 어둠
      const dk = core?.darkness;
      if (dk) {
        this.darkness?.destroy();
        this.darkness = new Darkness(this, dk.lightRadius, dk.alpha, dk.color);
        this.darknessBoss = enemy;
      }
    }
  }

  /** 지금 챕터 웨이브에 나오는 일반 적 (중복 없이) */
  chapterRoster(): string[] {
    const d = this.ctx.data;
    const ids = new Set(d.waves.waves.filter((w) => w.chapter === this.session.stage.chapter).flatMap((w) => w.spawns.map((s) => s.enemy)));
    return [...ids].filter((id) => d.enemies.enemies.find((e) => e.id === id)?.rank === 'normal');
  }

  /** 플레이어가 있는 방 안쪽 */
  currentArena(): Rect {
    const rid = this.session.currentRoomId ?? this.session.map.startId;
    return interiorRect(this.session.map.rooms[rid]!, this.m);
  }

  /** 특무 인장: 방 안, 벽·잔해가 없는 쪽으로 짧게 순간이동 */
  blinkPlayer(distance: number): void {
    const a = this.currentArena();
    const r = this.ctx.data.player.size / 2;
    const base = this.rng.range(0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const ang = base + (i * Math.PI) / 4;
      const x = this.player.x + Math.cos(ang) * distance;
      const y = this.player.y + Math.sin(ang) * distance;
      if (x < a.x + r || x > a.x + a.w - r || y < a.y + r || y > a.y + a.h - r) continue;
      if (this.physics.overlapRect(x - r, y - r, r * 2, r * 2, false, true).length > 0) continue;
      const from = { x: this.player.x, y: this.player.y };
      this.fxAt(this.add.circle(from.x, from.y, r + 3, 0x8a6aff, 0.5).setDepth(6));
      (this.player.body as Phaser.Physics.Arcade.Body).reset(x, y);
      break;
    }
    this.floatLabel({ x: this.player.x, y: this.player.y }, this.ctx.t('item.dodged'), '#b0a0ff');
  }

  /** 전술 연계: 같은 방의 같은 적 중 연계 거리 안에 있는 것이 함께 조준한다 */
  linkWindup(src: Enemy, attackId: string): void {
    const a = src.def.attacks?.find((x) => x.id === attackId);
    const r = a?.linkRadius;
    if (!r) return;
    const room = this.enemyRoom.get(src);
    for (const e of this.enemies) {
      if (e === src || e.def.id !== src.def.id || this.enemyRoom.get(e) !== room) continue;
      if (Math.hypot(e.sprite.x - src.sprite.x, e.sprite.y - src.sprite.y) <= r) e.tryLink(attackId, this.enemyHost);
    }
  }

  /** 보스가 부르는 적(분신): 방 웨이브 수에 들어가지 않는다 */
  spawnMinion(id: string, at: Vec2, maxHp?: number): Enemy {
    const d = this.ctx.data;
    const def = d.enemies.enemies.find((e) => e.id === id)!;
    const enemy = new Enemy(this, def, at.x, at.y, 0, null, d.elites);
    if (maxHp !== undefined) enemy.setMaxHp(maxHp);
    enemy.noReward = true;
    this.enemyGroup.add(enemy.sprite);
    if (def.ai === 'idle') (enemy.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
    this.enemies.push(enemy);
    return enemy;
  }

  // ---------- 전투 ----------

  weaponDefOf(id: string): WeaponDef {
    return this.ctx.data.weapons.weapons.find((w) => w.id === id)!;
  }

  /** 들고 있는 무기 (등급·옵션이 붙은 실물) */
  weaponItem(): WeaponItem {
    // 맨손이면 주먹 (슬롯에 들지 않는다)
    return activeWeapon(this.session.player.weapons) ?? this.fistItem();
  }

  fist: WeaponItem | null = null;
  fistItem(): WeaponItem {
    this.fist ??= plainWeapon(this.weaponDefOf(this.ctx.data.weapons.fistWeapon));
    return this.fist;
  }

  /** 손에 보이는 무기: 에너지가 모자라 쏠 수 없는 총이면 주먹 */
  shownWeaponKey(): string {
    const item = this.weaponItem();
    const def = this.weaponDefOf(item.defId);
    if (def.category === 'blade' || canFire(this.session.player.energy, this.weaponStatsOf(item))) return def.spriteKey;
    return this.weaponDefOf(this.fistItem().defId).spriteKey;
  }

  weaponDef(): WeaponDef {
    return this.weaponDefOf(this.weaponItem().defId);
  }

  /** 등급 배율·옵션을 반영한 무기 수치. 태그 보정은 hit()에서 */
  weaponStatsOf(item: WeaponItem): WeaponStats {
    return weaponStats(this.weaponDefOf(item.defId), item, gradeMultiplier(item.grade, this.ctx.data.groupMultipliers));
  }

  /** 실제로 쓰는 스탯: 기본 스탯 + 들고 있는 무기의 보너스(신궁 환디 힘 +30) */
  /** awaken=false: 패닉 각성 보너스를 뺀 값 (최대 체력·정신력은 각성으로 늘지 않는다) */
  effStats(awaken = true): Stats {
    const out = { ...this.session.player.stats };
    for (const [k, v] of Object.entries(this.weaponDef().equipBonus?.stats ?? {})) out[k as StatId] += v ?? 0;
    // 패닉 각성
    const bonus = awaken && this.session.player.panic ? this.itemRt?.panicAwaken() : null;
    if (bonus) for (const k of Object.keys(out) as StatId[]) out[k] += bonus.allStats;
    // 아이템 스탯 (LSD-R 재편 포함)
    const items = this.itemRt?.sums.stats;
    if (items) for (const k of Object.keys(out) as StatId[]) out[k] += items[k];
    return out;
  }

  tagRule<T>(id: TagId): T {
    return this.ctx.data.tags.tags.find((t) => t.id === id)!.rule as T;
  }

  /** 적 길 찾기: 곧장 갈 수 있으면 null, 막혔으면 이 방 격자로 돌아가는 방향 */
  enemyPathDir(from: Vec2, radius: number): Vec2 | null {
    const rid = this.session.currentRoomId;
    if (rid === null) return null;
    const obs = this.obstacles.get(rid);
    if (!obs || obs.length === 0 || segmentClear(from, this.player, obs, radius)) return null;
    let field = this.pathFields.get(rid);
    if (!field) {
      const mg = this.ctx.data.mapgen;
      field = buildPathField(interiorRect(this.session.map.rooms[rid]!, this.m), obs, mg.pathCellPx, mg.pathMarginPx);
      this.pathFields.set(rid, field);
    }
    return pathDir(field, from, this.player);
  }

  onEnemyKilled(e: Enemy): void {
    const d = this.ctx.data;
    const roomId = this.enemyRoom.get(e);
    const { x, y } = e.sprite;
    const drop = (kind: 'energy' | 'coin', n: number) => {
      // 보스가 부른 적은 보상이 없다
      if (e.noReward) return;
      const pop = d.juice.death;
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(0, d.pickups.scatterRadius);
        // 쓰러진 자리에서 사방으로 튀어 나가 내려앉는다
        const pk = new Pickup(this, kind, x, y, d.pickups);
        const pr = Math.max(r, pop.orbPopPx[0]) + this.rng.range(0, pop.orbPopPx[1] - pop.orbPopPx[0]);
        this.tweens.add({ targets: pk.sprite, x: x + Math.cos(a) * pr, y: y + Math.sin(a) * pr, duration: pop.orbPopSec * 1000, ease: 'Back.easeOut' });
        this.pickups.push(pk);
      }
    };
    // 처치 연출: 번쩍임·파편, 엘리트·정예·보스는 폭발·흔들림·히트스톱
    const big = e.elites.length > 0 || e.rank === 'champion' || e.rank === 'boss' || e.rank === 'hiddenBoss';
    this.juice.death(e.sprite, e.def.color, big);
    sfx(big ? 'explosion' : 'kill');
    if (big) this.hitStop.request(e.rank === 'boss' || e.rank === 'hiddenBoss' ? d.juice.hitStop.bossKill : d.juice.hitStop.eliteKill);
    if (this.bossControllers.has(e)) this.stageFx.startBossKill({ x, y });
    this.recordKill(e);
    // 집정관: 같은 방에서 죽은 적의 에너지를 흡수한다 (그 적의 에너지 구슬은 떨어지지 않음)
    const absorbed = this.archonAbsorb(e, roomId);
    if (!absorbed) drop('energy', this.rng.int(e.def.energyOrbs[0], e.def.energyOrbs[1]));
    drop('coin', this.rng.int(e.def.coins[0], e.def.coins[1]));
    // 엘리트마다 추가 보상 (2종이 겹친 개체는 두 번)
    for (const _ of e.elites) {
      const c = d.elites.common;
      if (!absorbed) drop('energy', this.rng.int(c.bonusEnergyOrbs[0], c.bonusEnergyOrbs[1]));
      drop('coin', this.rng.int(c.bonusCoins[0], c.bonusCoins[1]));
    }
    // 정예: 낮은 확률로 아이템 상자
    if (e.rank === 'champion' && !e.noReward) {
      const { stage } = this.session;
      const chestRng = Rng.derive(this.ctx.config.seed, `champion-chest-${stage.chapter}-${stage.stage}-${this.loot.lootSeq++}`);
      if (chestRng.chance(d.waves.champions.itemChestChance)) this.loot.addChest('item', x, y, d.items.treasureWeights);
    }
    // 궁극기 게이지는 적 처치로 충전
    const ult = this.session.player.ultimate;
    if (this.skillRt.ultimateDef().gauge.kind === 'kill') ult.gauge = gainGauge(ult.gauge, this.skillRt.ultimateDef().gaugeMax, d.ultimates.gaugePerKill[e.rank]);
    // 첨탑: 원 안에서 잡으면 충전 (결과는 다음 프레임에 처리)
    const sp = roomId === undefined ? undefined : this.encounters.spires.find((x) => x.roomId === roomId);
    if (sp) {
      for (const ev of sp.state.onKill(e.rank, inSpireCircle(x - sp.x, y - sp.y, sp.radius, e.radius))) this.encounters.spireEvents.push({ sp, e: ev });
    }
    this.removeEnemy(e);
    if (roomId !== undefined) this.rooms.get(roomId)?.enemyKilled();
    for (const o of [...this.skillRt.skillObjects]) o.onKill?.(this.host, e);
    this.itemRt.onKill(e.elite !== null);
    // 폭발 엘리트: 예고 원 후 지연 폭발 (반역 개체가 된 경우는 제외)
    const bl = e.elites.find((x) => x.deathBlast);
    if (bl?.deathBlast && !e.converted) {
      this.hazards.push(new DelayedBlast(this, { x, y }, bl.deathBlast.radius, bl.deathBlast.delaySec, bl.deathBlast.damage, hexColor(bl.color)));
    }
    // 마기 변질: 변질된 채 죽으면 폭발
    const c = e.corruption;
    if (c) {
      e.corruption = null;
      this.fxAt(this.add.circle(x, y, c.burstRadius, hexColor(d.ui.corruptionColor), 0.4).setDepth(6));
      for (const o of [...this.enemies]) {
        if (Math.hypot(o.sprite.x - x, o.sprite.y - y) <= c.burstRadius + o.radius) this.combat.hit(o, c.burstDamage, c.burstTags);
      }
    }
  }

  /** 집정관 흡수: 같은 방의 살아 있는 집정관 중 가장 가까운 하나가 죽은 적의 최대 체력만큼. 흡수했으면 true */
  archonAbsorb(dead: Enemy, roomId: number | undefined): boolean {
    if (roomId === undefined) return false;
    const { x, y } = dead.sprite;
    const archons = this.enemies.filter((a) => a !== dead && !a.dead && a.def.absorb && this.enemyRoom.get(a) === roomId);
    const a = archons.sort((p, q) => Math.hypot(p.sprite.x - x, p.sprite.y - y) - Math.hypot(q.sprite.x - x, q.sprite.y - y))[0];
    if (!a) return false;
    const stage = a.absorb(dead.maxHp);
    const line = this.add.line(0, 0, x, y, a.sprite.x, a.sprite.y, hexColor(a.def.absorb!.haloColor), 0.6).setOrigin(0, 0).setDepth(6);
    this.fxAt(line);
    if (stage !== null) this.floatLabel({ x: a.sprite.x, y: a.sprite.y - a.radius - 6 }, this.ctx.t('enemy.archon.stage', { n: stage }), a.def.absorb!.haloColor);
    return true;
  }

  /** 변질 시간, 변질된 적 색 */
  updateCorruption(dt: number): void {
    const color = hexColor(this.ctx.data.ui.corruptionColor);
    for (const e of this.enemies) {
      if (!e.corruption || e.dead) continue;
      e.corruption = tickCorruption(e.corruption, dt);
      if (!e.corruption) e.sprite.clearTint();
      else if (!e.sprite.tintFill) e.sprite.setTint(color);
    }
  }

  removeEnemy(e: Enemy): void {
    if (e === this.darknessBoss) {
      this.darkness?.lift();
      this.darkness = null;
      this.darknessBoss = null;
    }
    this.bossControllers.get(e)?.destroy();
    this.bossControllers.delete(e);
    this.enemies = this.enemies.filter((x) => x !== e);
    this.enemyRoom.delete(e);
    e.destroy();
  }

  updateBleeds(dt: number): void {
    const rule = this.tagRule<BleedRule>('bleed');
    for (const e of [...this.enemies]) {
      if (!e.bleed || e.dead) continue;
      const out = tickBleed(e.bleed, dt, rule);
      e.bleed = out.state;
      if (out.damage > 0) this.combat.applyDamage(e, corruptedDamage(out.damage, e.corruption));
    }
  }

  onContact(enemy: Enemy | undefined): void {
    if (!enemy || enemy.dead || enemy.warn > 0 || enemy.def.contactDamage <= 0) return;
    const now = this.time.now;
    if (now - enemy.lastContactAt < enemy.def.contactIntervalSec * 1000) return;
    if (this.hurtPlayer(enemy.def.contactDamage * enemy.damageMul, enemy)) enemy.lastContactAt = now;
  }

  /** 피해를 받았으면 true */
  /** 피해를 받았으면 true. attacker: 때린 적(반사용, 모르면 null) */
  hurtPlayer(amount: number, attacker: Enemy | null = null, mentalRaw?: number): boolean {
    if (this.invuln > 0 || this.condition.dodge.invuln > 0 || this.dying || this.ctx.debugFlags.invincible || this.session.outcome || this.modal) return false;
    // 특무 인장: 피해를 받기 직전 순간이동으로 피한다 (피격 무적과 같은 시간)
    if (this.itemRt.tryDodge()) {
      this.invuln = this.ctx.data.player.hurtInvulnSec;
      return true;
    }
    // 마기역장: 공격을 막고 잠깐 무적
    const absorbed = absorbHit(this.skillRt.shield);
    if (absorbed.blocked) {
      this.skillRt.shield = absorbed.shield;
      this.invuln = this.skillRt.shieldOpts?.blockInvulnSec ?? 0;
      this.cameras.main.flash(60, 140, 170, 210);
      if (this.skillRt.shieldOpts?.look?.block) playFx(this, this.skillRt.shieldOpts.look.block, this.player.x, this.player.y);
      return true;
    }
    const p = this.session.player;
    const stance = this.itemRt.first('hpStance');
    const taken = amount * (1 - this.skillRt.playerMods().damageReduction) * (1 - this.itemRt.sums.damageTaken - this.itemRt.guard()) * (stance ? 1 - hpStance(p.hp, p.maxHp, stance).taken : 1);
    // 정신 피해: 패닉 중이면 체력 피해로 바뀐다
    const mental = (mentalRaw ?? amount * (attacker?.def.mentalRatio ?? 0)) * (1 - statEffect('mentalResist', this.effStats(), this.ctx.data.stats));
    const m = applyMental(p, mental);
    this.condition.setSanity(m);
    const v = takeDamage(p, taken + m.hpDamage);
    p.hp = v.hp;
    this.invuln = this.ctx.data.player.hurtInvulnSec;
    shake(this, 'light');
    this.juice.hurt();
    sfx('playerHurt');
    // 피격에 반응하는 스킬 오브젝트 (반물질포 충전 취소 등)
    for (const o of [...this.skillRt.skillObjects]) if (o.onPlayerHurt && !o.onPlayerHurt(this.host)) this.skillRt.removeObject(o);
    // 아이템: 피격 효과 → 낮은 체력 회복 → 부활
    this.itemRt.onHurt(taken, attacker);
    if (p.hp > 0) this.itemRt.tryHeal();
    else if (this.itemRt.tryRevive()) this.cameras.main.flash(200, 255, 255, 255);
    if (p.hp <= 0) this.beginDeath();
    return true;
  }

  updateBullets(dt: number): void {
    for (const b of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const dist = Math.hypot(b.x - (b.getData('ox') as number), b.y - (b.getData('oy') as number));
      if (dist > (b.getData('range') as number)) {
        b.destroy();
        continue;
      }
      // 유도탄(지팡이): 남은 사거리 안 가장 가까운 적 쪽으로 휜다
      const turn = b.getData('homing') as number;
      if (turn > 0) {
        const t = nearestEnemy(this.skillRt.hostFor('weapon'), b, (b.getData('range') as number) - dist);
        if (t) {
          const body = b.body as Phaser.Physics.Arcade.Body;
          const v = steerToward(body.velocity, b, t.sprite, turn, dt);
          b.setVelocity(v.x, v.y);
        }
      }
    }
    for (const b of this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const range = b.getData('range') as number | undefined;
      if (range !== undefined && Math.hypot(b.x - (b.getData('ox') as number), b.y - (b.getData('oy') as number)) > range) {
        b.destroy();
        continue;
      }
      const turn = (b.getData('homing') as number | undefined) ?? 0;
      if (turn > 0) {
        const v = steerToward((b.body as Phaser.Physics.Arcade.Body).velocity, b, this.player, turn, dt);
        b.setVelocity(v.x, v.y);
      }
    }
  }

  /** 식광의 핵: at 둘레의 약한 적 탄(굴절 가능)을 지운다 */
  absorbEnemyBullets(at: Vec2, radius: number): number {
    let n = 0;
    for (const b of [...(this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[])]) {
      if (b.getData('refractable') === false || Math.hypot(b.x - at.x, b.y - at.y) > radius) continue;
      b.destroy();
      n++;
    }
    return n;
  }

  /** 집행자 밧줄: 플레이어를 to까지 끌어당긴다 (그동안 입력 무시). 걸리는 시간 */
  pullPlayer(to: Vec2, speed: number): number {
    const dx = to.x - this.player.x;
    const dy = to.y - this.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return 0;
    const sec = dist / speed;
    this.dashVel = { x: (dx / dist) * speed, y: (dy / dist) * speed };
    this.dashLeft = sec;
    return sec;
  }

  /** 적 탄. refractable=false면 굴절·탄 베기 불가(보스 대형 레이저 등). homing: 플레이어 쪽으로 휘는 속도(rad/s, 유도 미사일) */
  fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean, homing = 0, mental = 0): void {
    const ep = this.ctx.data.enemies.projectile;
    const b = this.enemyBullets.create(from.x, from.y, ep.spriteKey) as Phaser.Physics.Arcade.Image;
    fitArt(this.ctx.data, b, ep.size, ep.height ?? ep.size);
    b.setDepth(5);
    b.setData({ damage, mental, refractable, cuttable: refractable, range, ox: from.x, oy: from.y, homing });
    // 굴절 불가 탄은 붉게, 유도 미사일은 크게
    if (!refractable) b.setTint(0xff2a2a);
    if (homing > 0) b.setScale(1.5);
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  updatePickups(dt: number): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const orb = d.player.energy.orbValue * (1 + statEffect('energyGain', this.effStats(), d.stats));
    const coin = d.pickups.coin.value * (1 + statEffect('coinGain', this.effStats(), d.stats) + this.itemRt.sums.coinGain);
    for (const pk of this.pickups) {
      if (!pk.update(dt, this.player, d.pickups)) continue;
      sfx(pk.kind === 'energy' ? 'energy' : 'coin');
      if (pk.kind === 'energy') p.energy = gainEnergy(p.energy, orb, p.energyMax);
      else {
        p.coins += coin;
        this.itemRt.onCoins(coin);
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.collected);
  }

  // ---------- 스킬 ----------

  fxAt(obj: Phaser.GameObjects.GameObject): void {
    this.time.delayedCall(this.ctx.data.ui.slashFxSec * 1000, () => obj.destroy());
  }

  onEnemyBulletHit(b: Phaser.Physics.Arcade.Image): void {
    if (!b.active) return;
    // 구르는 동안에는 탄이 몸을 지나간다 (헥타르 RAM: 스칠 때 에너지)
    if (this.condition.dodge.invuln > 0) {
      const graze = this.itemRt.first('grazeEnergy');
      if (graze && !b.getData('grazed')) {
        b.setData('grazed', true);
        const p = this.session.player;
        p.energy = Math.min(p.energyMax, p.energy + graze.value);
        this.floatLabel({ x: this.player.x, y: this.player.y - 6 }, `+${graze.value}`, this.ctx.data.ui.hud.bars.energyColor);
      }
      return;
    }
    const damage = b.getData('damage') as number;
    const mental = b.getData('mental') as number | undefined;
    b.destroy();
    this.hurtPlayer(damage, null, mental);
  }

  /** 최대 체력 = 기본 + 견고(아이템 스탯 포함) + 아이템. 늘면 그만큼 현재 체력도 채운다 */
  syncMaxHp(): void {
    const d = this.ctx.data;
    const p = this.session.player;
    // 기본 체력(+영구 강화) + 견고 + 아이템
    const target = maxHpFor(d.player.maxHp + p.meta.maxHp, this.effStats(false), d.stats) + this.itemRt.sums.maxHp;
    if (target === p.maxHp) return;
    if (target > p.maxHp) p.hp += target - p.maxHp;
    p.maxHp = target;
    p.hp = Math.min(p.hp, p.maxHp);
  }

  // ---------- 카드·인벤토리 ----------

  setModal(kind: Modal): void {
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

  // ---------- 연출 ----------

  // ---------- 미모사 제미니 ----------

  // ---------- 전직 ----------

  // ---------- 상호작용 ----------

  nearest<T extends { x: number; y: number }>(list: readonly T[], radius: number): T | null {
    let best: T | null = null;
    let bestD = radius;
    for (const o of list) {
      const dist = Math.hypot(o.x - this.player.x, o.y - this.player.y);
      if (dist <= bestD) {
        best = o;
        bestD = dist;
      }
    }
    return best;
  }

  /** 결산 기록: 처치·엘리트·보스·히든보스, 보스는 과거의 기억 조각 판정 (분신 등 소환된 적은 세지 않는다) */
  recordKill(e: Enemy): void {
    if (e.def.summon || e.noReward) return;
    const r = this.session.player.record;
    r.kills++;
    if (e.elite) r.eliteKills++;
    const { stage } = this.session;
    let shardKind: 'boss' | 'hiddenBoss' | null = null;
    if (e.rank === 'boss' && this.ctx.data.bosses.bosses.some((b) => b.id === e.def.id)) {
      r.bossKills.push({ id: e.def.id, stage: stage.stage });
      this.progression.say('bossKill', e.def.id);
      shardKind = 'boss';
    } else if (e.rank === 'hiddenBoss') {
      r.hiddenBossKills.push(e.def.id);
      shardKind = 'hiddenBoss';
    }
    if (!shardKind) return;
    const save = this.ctx.save;
    const mem = this.ctx.data.meta.memory;
    const rng = Rng.derive(this.ctx.config.seed, `shard-${stage.chapter}-${stage.stage}-${e.def.id}`);
    if (!rollShard(rng, shardKind, save.data.pastShards, mem)) return;
    // 과거의 기억: 얻는 즉시 영구 보관
    save.data.pastShards++;
    save.write();
    r.shards++;
    bus.emit('toast', { text: this.ctx.t('memory.shardGot', { have: save.data.pastShards, slots: mem.pastSlots }) });
  }

  // ---------- 조우 칸 ----------

  // ---------- 마기수집첨탑 ----------

  /** 머리 위 잠깐 뜨는 글자 */
  floatLabel(at: Vec2, text: string, color: string): void {
    const t = this.add
      .text(at.x, at.y - 12, text, { fontFamily: 'sans-serif', fontSize: '8px', color, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(7);
    this.tweens.add({ targets: t, y: t.y - 8, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  /** 같은 알림은 toastSec에 한 번만 */
  toastThrottled(text: string): void {
    const last = this.toastTimes.get(text) ?? -Infinity;
    if (this.time.now - last < this.ctx.data.ui.toastSec * 1000) return;
    this.toastTimes.set(text, this.time.now);
    bus.emit('toast', { text });
  }

  // ---------- 진행 ----------

  nextStage(): void {
    this.leaving = true;
    const d = this.ctx.data;
    const { afterStage } = stageEndOffers(this.session.stage, d.mapgen, d.cards);
    const adv = advanceStage(this.session.stage, d.mapgen, playableChapters(d.waves, d.mapgen));
    this.session.player.record.stagesCleared++;
    if (adv.type === 'stage' || adv.type === 'chapter') {
      // 포탈에 빨려 들어가 이동 화면에서 스테이지 끝 카드를 고른 뒤 다음 스테이지로
      this.stageFx.warpOut(() =>
        this.progression.queueOffers([{ kind: afterStage, boss: false }], () => {
          const data: RunSceneData = { stage: adv.next, player: this.session.player, offers: [], warpIn: true };
          this.scene.restart(data);
        }),
      );
    } else if (adv.chapter >= d.mapgen.chapters) {
      // 3-5 런 클리어: 더 쓸 곳이 없는 카드는 건너뛰고 바로 결산
      this.endRun({ type: 'chapterClear', chapter: adv.chapter });
    } else {
      // 임시 마지막 챕터: 카드를 고른 뒤 클리어 화면
      this.progression.queueOffers([{ kind: afterStage, boss: false }], () => this.endRun({ type: 'chapterClear', chapter: adv.chapter }));
    }
  }

  /** 사망: 연출을 보여 준 뒤 결산으로 */
  beginDeath(): void {
    if (this.dying) return;
    this.dying = true;
    this.loot.setInteractHint(null);
    bus.emit('weaponTip', { item: null });
    bus.emit('cardTip', { card: null });
    this.physics.pause();
    this.stageFx.playDeath(() => this.endRun({ type: 'dead' }));
  }

  endRun(outcome: NonNullable<RunSession['outcome']>): void {
    this.session.outcome = outcome;
    // 결산: 결정을 계산해 바로 저장에 더한다 (결산 화면을 닫지 않고 꺼도 남게)
    const d = this.ctx.data;
    const save = this.ctx.save;
    const runClear = outcome.type === 'chapterClear' && outcome.chapter >= d.mapgen.chapters;
    const crystals = crystalBreakdown(this.session.player.record, runClear, d.meta.crystals);
    save.data.crystals += crystals.total;
    save.write();
    this.session.settlement = { runClear, crystals, balance: save.data.crystals, shardsOwned: save.data.pastShards };
    this.physics.pause();
    this.player.setAlpha(1);
    this.loot.setInteractHint(null);
    bus.emit('overlay', { open: true });
  }

  /** 결산 확인 → 실험장으로 돌아간다 */
  restartRun(): void {
    this.time.paused = false;
    bus.emit('overlay', { open: false });
    if (this.modal) bus.emit('modal', { kind: null });
    this.ctx.session = null;
    this.scene.start('Lab');
  }

  // ---------- 디버그 ----------

  /** 카메라: 조준 중인 적 쪽으로 기울어 따라가고(없으면 플레이어), 방 바깥은 보이지 않게 */
  updateCamera(): void {
    const cam = this.cameras.main;
    const target = this.cameraTarget();
    const lerp = this.ctx.data.ui.cameraLerp;
    cam.scrollX += (target.x - cam.width / 2 - cam.scrollX) * lerp;
    cam.scrollY += (target.y - cam.height / 2 - cam.scrollY) * lerp;
  }
}

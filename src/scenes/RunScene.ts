import { recordCodex, type CodexKind } from '../systems/codex';
import { type PathField } from '../systems/pathField';
import { IDLE_DODGE } from '../systems/dodge';
import Phaser from 'phaser';
import { RunDebug } from './run/runDebug';
import { buildHosts } from './run/hosts';
import { bindRunEvents } from './run/busBindings';
import { WorldBuilder } from './run/worldBuilder';
import { LootInteract } from './run/lootInteract';
import { SkillRuntime } from './run/skillRuntime';
import { MageRuntime } from './run/mageRuntime';
import { Encounters } from './run/encounters';
import { Progression } from './run/progression';
import { WeaponCombat } from './run/weaponCombat';
import { SpecialWeapons } from './run/specialWeapons';
import { WeaponSkills } from './run/weaponSkills';
import { StageFx } from './run/stageFx';
import { RoarAura } from './run/roarAura';
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
import { animateArt, fitArt } from '../entities/art';
import { Juice } from '../entities/juice';
import { cameraFocus, viewSize } from '../systems/camera';
import { HitStop, slowMoScale } from '../systems/juice';
import { playerArtKey } from '../systems/art';
import { ItemRuntime } from '../items/runtime';
import { type Hazard } from '../entities/hazard';
import { Pickup } from '../entities/pickup';
import type { SkillHost } from '../skills/host';
import { runStartOffers, stageEndOffers } from '../systems/cards';
import { gradeEnergyMultiplier, gradeMultiplier } from '../systems/damage';
import { collectCoins } from '../systems/loot';
import { generateStage } from '../systems/mapgen';
import { MiniQueue } from '../systems/gemini';
import { RoomState } from '../systems/roomState';
import { advanceStage, playableChapters, firstStage } from '../systems/run';
import { masteryTotals, tickCooldowns } from '../systems/skills';
import { activeWeapon, autoAim, gainEnergy, normalize, plainWeapon, canFire, swapWeapon, weaponStats, type WeaponItem, type WeaponStats } from '../systems/weapons';
import { mapBounds, metrics, roomAt, roomCenter, roomRect, type Rect, type WorldMetrics } from '../systems/worldLayout';
import type { TagId, WeaponDef } from '../types/data';
import { BulletRuntime } from './run/bullets';
import { RoomRuntime } from './run/roomRuntime';
import { EnemyLife } from './run/enemyLife';
import { PlayerLife } from './run/playerLife';
import { DamageRuntime } from './run/damage';
import { MeleeAttack } from './run/meleeAttack';

/** 전투 씬: 스테이지 하나(방·복도·적·무기·스킬). 스테이지를 넘기면 다음 스테이지 데이터로 재시작한다. */
export type { RunSceneData } from './run/shared';

export class RunScene extends Phaser.Scene {
  roomProps!: RoomProps;
  condition!: PlayerCondition;
  roarAura!: RoarAura;
  bulletRt!: BulletRuntime;
  roomRt!: RoomRuntime;
  enemyLife!: EnemyLife;
  playerLife!: PlayerLife;
  stageFx!: StageFx;
  combat!: WeaponCombat;
  damage!: DamageRuntime;
  meleeRt!: MeleeAttack;
  special!: SpecialWeapons;
  weaponSkills!: WeaponSkills;
  progression!: Progression;
  encounters!: Encounters;
  skillRt!: SkillRuntime;
  /** 마기법사 각인·시전 강화 */
  mage!: MageRuntime;
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
  /** 변질된 적 위 표식 */
  corruptMarks = new Map<Enemy, Phaser.GameObjects.Sprite>();
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
  /** 탄을 그리는 층 (테두리 빛) */
  playerBulletLayer!: Phaser.GameObjects.Layer;
  enemyBulletLayer!: Phaser.GameObjects.Layer;
  /** 위압: 남은 이동 불가 시간 */
  rootLeft = 0;
  dashVel: Vec2 = { x: 0, y: 0 };

  aimDir: Vec2 = { x: 1, y: 0 };
  /** 순간이동 방향: 마우스 커서 쪽, 마우스가 없으면 회피처럼 이동 방향(서 있으면 조준 방향) */
  moveAimDir: Vec2 = { x: 1, y: 0 };
  invuln = 0;
  pathFields = new Map<number, PathField>();
  toastTimes = new Map<string, number>();
  unsubs: (() => void)[] = [];
  initData: RunSceneData = {};

  // 카드·인벤토리
  modal: Modal = null;
  /** 이번 런의 엔딩 대화를 띄웠다 (결산 → 엔딩 → 실험장) */
  endingPlayed = false;
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
    this.mage = new MageRuntime(this);
    this.encounters = new Encounters(this);
    this.progression = new Progression(this);
    this.combat = new WeaponCombat(this);
    this.damage = new DamageRuntime(this);
    this.meleeRt = new MeleeAttack(this);
    this.stageFx = new StageFx(this);
    this.condition = new PlayerCondition(this);
    this.roomProps = new RoomProps(this);
    this.ctx = getContext();
    const d = this.ctx.data;
    this.special = new SpecialWeapons(this);
    this.weaponSkills = new WeaponSkills(this);
    this.roarAura = new RoarAura(this);
    this.bulletRt = new BulletRuntime(this);
    this.roomRt = new RoomRuntime(this);
    this.enemyLife = new EnemyLife(this);
    this.playerLife = new PlayerLife(this);
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
      settlement: null,
      boss: null,
    };
    this.ctx.session = this.session;
    this.rng = Rng.derive(seed, `combat-${stage.chapter}-${stage.stage}`);
    this.progression.mini = new MiniQueue(d.gemini.mini.showSec, d.gemini.mini.fadeSec, d.gemini.mini.perCharSec);
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
    // 직업을 고르고 실험을 시작했다
    if (newRun) this.progression.say('runStart', this.session.player.job);
    this.m = metrics(d.mapgen);
    this.skillRt.hosts = new Map();
    this.host = this.skillRt.hostFor(null);
    buildHosts(this);

    this.walls = this.physics.add.staticGroup();
    this.doorGroup = this.physics.add.staticGroup();
    this.roomProps.propGroup = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    // 탄 테두리: 층마다 한 번만 빛 테두리를 입힌다 (탄마다 효과를 거는 것보다 가볍다)
    const rim = d.juice.bulletRim;
    this.playerBulletLayer = this.add.layer().setDepth(5);
    this.playerBulletLayer.postFX?.addGlow(hexColor(rim.player), rim.strength, 0, false, 0.1, rim.distance);
    this.enemyBulletLayer = this.add.layer().setDepth(5);
    this.enemyBulletLayer.postFX?.addGlow(hexColor(rim.enemy), rim.strength, 0, false, 0.1, rim.distance);

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
    // 런 시작: 무기 대신 무기 상자
    if (newRun) this.loot.addChest('weapon', start.x, start.y + d.mapgen.startChestOffsetPx, d.loot.startChest);

    this.physics.add.collider(this.player, this.walls);
    this.physics.add.collider(this.player, this.doorGroup);
    this.physics.add.collider(this.player, this.roomProps.propGroup);
    this.physics.add.collider(this.enemyGroup, this.roomProps.propGroup);
    this.physics.add.collider(this.enemyGroup, this.walls);
    this.physics.add.collider(this.enemyGroup, this.doorGroup);
    this.physics.add.collider(this.enemyGroup, this.enemyGroup);
    const killBullet = (b: unknown) => (b as Phaser.GameObjects.GameObject).destroy();
    // 지형 무시 탄(쌍성 지팡이 반성·정렬)은 벽·문을 지나간다
    const solid = (b: unknown) => !(b as Phaser.GameObjects.GameObject).getData('ghost');
    this.physics.add.collider(this.bullets, this.walls, killBullet, solid);
    this.physics.add.collider(this.bullets, this.doorGroup, killBullet, solid);
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
    this.physics.add.overlap(this.bullets, this.enemyGroup, (b, e) => this.damage.onBulletHit(b as Phaser.Physics.Arcade.Image, e as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.bulletRt.onEnemyBulletHit(b as Phaser.Physics.Arcade.Image));
    this.physics.add.overlap(this.player, this.enemyGroup, (_p, e) =>
      this.playerLife.onContact((e as Phaser.GameObjects.GameObject).getData('enemy') as Enemy),
    );

    const b = mapBounds(map, this.m);
    this.physics.world.setBounds(b.x, b.y, b.w, b.h);
    const cam = this.cameras.main;
    cam.centerOn(start.x, start.y);

    this.unsubs.push(...bindRunEvents(this));
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
    this.endingPlayed = false;
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
    this.loot.combiners = [];
    this.loot.potions = [];
    this.loot.interactPrompt = null;
    // 이동 화면에서 고른 아이템(세트 합성 포함)의 획득 카드는 다음 스테이지에서
    this.loot.itemGets = [...(this.initData.itemGets ?? [])];
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
    this.combat.buffLeft = 0;
    this.combat.buffAura = null;
    this.combat.motion = null;
    this.combat.charging = false;
    this.combat.chargeT = 0;
    this.combat.chargeFx = null;
    this.combat.nockArrow = null;
    this.skillRt.skillObjects = [];
    this.hazards = [];
    this.bossControllers = new Map();
    this.corruptMarks.clear();
    this.skillRt.shield = null;
    this.skillRt.shieldOpts = null;
    this.skillRt.shieldFx = null;
    this.skillRt.passiveKey = '';
    this.skillRt.passiveId = null;
    this.dashLeft = 0;
    this.rootLeft = 0;
    this.aimDir = { x: 1, y: 0 };
    this.combat.fireCooldown = 0;
    this.combat.benchCooldown = 0;
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
    const p = this.session.player;
    const key = playerArtKey(this.ctx.artLoaded, d.player.spriteKey, p.job, p.advancement);
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
      return { name: this.ctx.t(e.def.nameKey), hp: e.hp, maxHp: e.maxHp, markers: c.def.enrageAt > 0 ? [c.def.enrageAt] : (c.def.unlocks ?? []), color: e.def.color };
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
      if (frame.pressed.has('attack') || frame.pressed.has('interact')) this.playerLife.restartRun();
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
    this.syncMaxEnergy();
    this.condition.updateSanity(dt);
    // 패닉: 방향이 뒤집힌다
    if (p.panic && !this.itemRt.first('panicCalm')) frame = { ...frame, move: { x: -frame.move.x, y: -frame.move.y } };
    this.itemRt.update(dt);
    this.mage.update(dt);
    // 위압: 이동·회피 불가
    if (this.rootLeft > 0) {
      this.rootLeft -= dt;
      const pressed = new Set(frame.pressed);
      pressed.delete('dodge');
      frame = { ...frame, move: { x: 0, y: 0 }, pressed };
    }
    this.condition.updateDodge(dt, frame);
    const speed = mods.rooted ? 0 : d.player.moveSpeed * (1 + mods.moveSpeed) * (1 + this.itemRt.moveSpeedBonus()) * (1 + this.combat.chargeMoveBonus()) * (1 + this.special.moveBonus());
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

    this.roomRt.updateRooms(dt);
    this.encounters.updateSpires(dt);

    for (const e of this.enemies) {
      // 집정관: 플레이어가 그 방을 나가면 흡수 초기화
      if (e.def.absorb && this.enemyRoom.get(e) !== this.session.currentRoomId) e.resetAbsorb();
      e.update(dt, this.enemyHost);
    }
    // 석화된 보스는 잠깐 패턴이 멈춘다
    // 석화·묶임(변인통제) 중인 보스는 패턴이 멈춘다
    for (const [e, b] of this.bossControllers) if (!e.petrified && !e.bound) b.update(dt, this.bossHost);
    this.condition.updateBossEnergy();
    for (const h of [...this.hazards]) {
      if (h.update(dt, this.enemyHost)) continue;
      h.destroy();
      this.hazards = this.hazards.filter((x) => x !== h);
    }
    this.session.enemiesAlive = this.enemies.length;

    // 조준: 가장 가까운 적. 적이 없으면 마지막 방향(이동 중이면 이동 방향으로 갱신)
    // 변인통제로 보스가 묶였으면 그 보스만 조준한다
    const focus = this.weaponSkills.focusEnemy();
    const aim = autoAim(
      this.player,
      (focus ? [focus] : this.enemies).map((e) => e.sprite),
      this.aimDir,
    );
    this.aimDir = aim.target ? aim.dir : moving ? normalize(frame.move) : this.aimDir;
    this.aimTarget = aim.target ? { x: aim.target.x, y: aim.target.y } : null;
    const cur = frame.pointer ? this.cameras.main.getWorldPoint(frame.pointer.x * this.scale.width, frame.pointer.y * this.scale.height) : null;
    const toCur = cur ? { x: cur.x - this.player.x, y: cur.y - this.player.y } : null;
    this.moveAimDir = toCur && Math.hypot(toCur.x, toCur.y) > 1 ? normalize(toCur) : moving ? normalize(frame.move) : this.aimDir;
    this.itemRt.gaze(aim.target ? (this.enemies.find((e) => e.sprite === aim.target) ?? null) : null, dt);
    const aimAngle = Math.atan2(this.aimDir.y, this.aimDir.x);

    if (frame.pressed.has('swapWeapon')) {
      p.weapons = swapWeapon(p.weapons);
      // 쿨타임은 무기마다 따로: 들던 무기의 남은 쿨타임은 넣어 두고, 꺼낸 무기는 교체 딜레이(와 제 남은 쿨타임) 뒤 바로 쏜다
      const c = this.combat;
      [c.fireCooldown, c.benchCooldown] = [Math.max(c.benchCooldown, this.ctx.data.weapons.swapDelaySec), c.fireCooldown];
      this.combat.resetCharge();
    }
    if (frame.pressed.has('interact')) this.loot.interact();

    this.combat.updateAttack(dt, frame.held.has('attack'), aimAngle);
    // 무기 특수공격 (Q): 지금은 공간봉합침 회수
    if (frame.pressed.has('weaponSpecial')) this.useWeaponSpecial();
    this.special.update(dt);
    this.weaponSkills.update(dt);

    // 스킬
    // 광전사의 진노: 스킬 쿨타임이 더 빨리 돈다 (궁극기 대기는 그대로)
    p.cooldowns = tickCooldowns(p.cooldowns, dt * (1 + (mods.cooldownRate ?? 0)));
    p.ultimate.cooldownLeft = Math.max(0, p.ultimate.cooldownLeft - dt);
    SKILL_ACTIONS.forEach((action, i) => {
      if (frame.pressed.has(action)) this.skillRt.castSlot(i);
    });
    if (frame.pressed.has('ultimate')) this.skillRt.castUltimate();
    this.skillRt.syncPassive();
    this.skillRt.updateShield(dt);
    for (const o of [...this.skillRt.skillObjects]) if (!o.update(dt, this.skillRt.hostFor(o.owner))) this.skillRt.removeObject(o);
    this.enemyLife.updateBleeds(dt);
    this.enemyLife.updateCorruption(dt);

    this.bulletRt.updateBullets(dt);
    this.updatePickups(dt);
    this.condition.updateInvuln(dt);
    this.loot.updatePotions();
    this.loot.updateInteractHint();
    this.roomProps.updateDoorIcons();
    this.stageFx.updateTutorial();
    this.roarAura.update(dt);

    const weaponKey = this.shownWeaponKey();
    // 팔에 차는 무기는 어깨에서 뻗는다
    const worn = this.weaponDef().worn;
    const handAt = worn ? { x: this.player.x + worn.shoulderX, y: this.player.y + worn.shoulderY - this.condition.leapLift } : this.combat.handPos();
    const upright = this.weaponDef().upright === true;
    const pose = this.combat.heldPose(dt);
    // 사복검: 휘두르는 동안 칼날이 마디마디 풀려 채찍처럼 뻗었다가(앞 1/4) 끝에서 다시 칼로 감긴다(뒤 1/5)
    const whip = this.weaponDef().whip;
    const swingT = whip ? this.combat.swingProgress() : null;
    const shownKey = whip && swingT !== null ? whip.sprite.spriteKey : weaponKey;
    this.weaponSprite
      .setTexture(shownKey)
      .setScale(1)
      .setDepth(worn && this.aimDir.y < 0 ? 3.9 : 4)
      .setOrigin(worn ? worn.gripX : (d.art.sprites[shownKey]?.gripX ?? 0.5), 0.5)
      // 왼쪽을 겨눌 때 총이 거꾸로 서지 않게 (깃발은 세워 든 채 좌우만 뒤집는다)
      .setFlipY(!upright && this.aimDir.x < 0)
      .setFlipX(upright && this.aimDir.x < 0)
      .setPosition(handAt.x + this.aimDir.x * pose.push, handAt.y + this.aimDir.y * pose.push)
      .setRotation((upright ? 0 : aimAngle) + (this.aimDir.x < 0 ? -pose.rot : pose.rot));
    if (whip && swingT !== null) {
      const reach = this.weaponDef().pattern.kind === 'arc' ? (this.weaponDef().pattern as { radius: number }).radius : whip.sprite.size;
      const out = Math.min(1, 0.25 + swingT * 3) * (swingT > 0.8 ? 1 - ((swingT - 0.8) / 0.2) * 0.75 : 1);
      this.weaponSprite.setScale((reach * (1 + this.itemRt.sums.area) * out) / Math.max(1, this.weaponSprite.width), 1);
    }
    this.combat.trailHeld(this.weaponSprite, pose.push);

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
    const key = this.special.twinStarMode(def)?.look.spriteKey ?? def.spriteKey;
    if (def.category === 'blade' || canFire(this.session.player.energy, this.weaponStatsOf(item))) return key;
    return this.weaponDefOf(this.fistItem().defId).spriteKey;
  }

  /** 무기 특수공격 버튼: 들고 있는 무기에 특수공격이 없거나 쓸 것이 없으면 짧게 알린다 */
  useWeaponSpecial(): void {
    const def = this.weaponDef();
    if (def.needle && this.special.recallNeedles(def)) return;
    if (def.twinStar && this.special.alignTwinStar(def)) return;
    if (this.weaponSkills.use(def)) return;
    this.toastThrottled(this.ctx.t(def.needle ? 'weapon.noNeedles' : 'weapon.noSpecial'));
  }

  weaponDef(): WeaponDef {
    return this.weaponDefOf(this.weaponItem().defId);
  }

  /** 등급 배율·옵션을 반영한 무기 수치. 태그 보정은 hit()에서 */
  weaponStatsOf(item: WeaponItem): WeaponStats {
    const g = this.ctx.data.groupMultipliers;
    const st = weaponStats(this.weaponDefOf(item.defId), item, gradeMultiplier(item.grade, g), gradeEnergyMultiplier(item.grade, g));
    // 쌍성 지팡이: 지금 상태(주성·반성·정렬)의 연사력·피해·탄속 (초당 에너지는 그대로)
    const ts = this.special.twinStarMode(this.weaponDefOf(item.defId));
    const m = ts ?? { rateMul: 1, damageMul: 1, speedMul: 1 };
    // 아이템: 원심 가속(공격 속도), 치명타 확률
    return {
      ...st,
      damage: st.damage * m.damageMul,
      projectileSpeed: st.projectileSpeed * m.speedMul,
      energyCost: st.energyCost / m.rateMul,
      fireIntervalSec: st.fireIntervalSec / m.rateMul / (1 + this.itemRt.attackSpeedBonus()),
      critChance: Math.min(1, st.critChance + this.itemRt.total('critChance')),
    };
  }

  tagRule<T>(id: TagId): T {
    return this.ctx.data.tags.tags.find((t) => t.id === id)!.rule as T;
  }

  /** 도감: 처음 만난 것을 기록하고 저장한다 */
  discover(kind: CodexKind, id: string): void {
    if (recordCodex(this.ctx.save.data, kind, id)) this.ctx.save.write();
  }

  /** MK 슈트를 벗긴다: 사망·포탈 연출은 플레이어 그림으로 한다 */
  dropSuit(): void {
    for (const o of this.skillRt.skillObjects.filter((x) => x.owner === 'mkPrototype')) this.skillRt.removeObject(o);
  }

  updatePickups(dt: number): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const orb = d.player.energy.orbValue * (1 + this.itemRt.sums.energyGain);
    const coin = d.pickups.coin.value * (1 + this.itemRt.sums.coinGain);
    for (const pk of this.pickups) {
      if (!pk.update(dt, this.player, d.pickups)) continue;
      sfx(pk.kind === 'energy' ? 'energy' : 'coin');
      if (pk.kind === 'energy') p.energy = gainEnergy(p.energy, orb, p.energyMax);
      else {
        const got = collectCoins(p.coinCarry, coin);
        p.coinCarry = got.carry;
        p.coins += got.whole;
        if (got.whole > 0) this.itemRt.onCoins(got.whole);
      }
    }
    this.pickups = this.pickups.filter((pk) => !pk.collected);
  }

  // ---------- 스킬 ----------

  fxAt(obj: Phaser.GameObjects.GameObject): void {
    this.time.delayedCall(this.ctx.data.ui.slashFxSec * 1000, () => obj.destroy());
  }

  /** 최대 체력 = (기본(+영구 강화) + 아이템 + 신체 숙련) × (1 + 숙련·스킬 비율). 늘면 그만큼 현재 체력도 채운다 */
  syncMaxHp(): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const m = masteryTotals(p.loadout, d.skills);
    const pct = (m.maxHpPct ?? 0) + (this.skillRt.playerMods().maxHpPct ?? 0);
    const target = Math.round((d.player.maxHp + p.meta.maxHp + this.itemRt.sums.maxHp + (m.maxHpFlat ?? 0)) * (1 + pct));
    if (target === p.maxHp) return;
    if (target > p.maxHp) p.hp += target - p.maxHp;
    p.maxHp = target;
    p.hp = Math.min(p.hp, p.maxHp);
  }

  /** 최대 에너지 = 기본 + 아이템 + 회복할 때마다 늘어난 양. 늘면 그만큼 현재 에너지도 채운다 */
  syncMaxEnergy(): void {
    const p = this.session.player;
    const target = this.ctx.data.player.energy.max + this.itemRt.sums.maxEnergy + this.itemRt.healMaxEnergy();
    if (target === p.energyMax) return;
    if (target > p.energyMax) p.energy += target - p.energyMax;
    p.energyMax = target;
    p.energy = Math.min(p.energy, p.energyMax);
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
      this.dropSuit();
      this.stageFx.warpOut(() =>
        this.progression.queueOffers([{ kind: afterStage, boss: false }], () => {
          const data: RunSceneData = { stage: adv.next, player: this.session.player, offers: [], warpIn: true, itemGets: this.loot.itemGets };
          this.scene.restart(data);
        }),
      );
    } else if (adv.chapter >= d.mapgen.chapters) {
      // 3-5 런 클리어: 더 쓸 곳이 없는 카드는 건너뛰고 바로 결산
      this.playerLife.endRun({ type: 'chapterClear', chapter: adv.chapter });
    } else {
      // 임시 마지막 챕터: 카드를 고른 뒤 클리어 화면
      this.progression.queueOffers([{ kind: afterStage, boss: false }], () => this.playerLife.endRun({ type: 'chapterClear', chapter: adv.chapter }));
    }
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

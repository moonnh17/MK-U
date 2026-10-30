import { buildPathField, pathDir, segmentClear, type PathField } from '../systems/pathField';
import { bossOrbDrops } from '../systems/bossEnergy';
import { IDLE_DODGE, blinkTarget, dodgeConfig, startDodge, stepDodge, zigzag, type DodgeState } from '../systems/dodge';
import { stampGrid } from '../systems/roomShapes';
import Phaser from 'phaser';
import type { ActionFrame, ButtonAction, Vec2 } from '../core/actions';
import { getContext, type GameContext } from '../core/context';
import { bus } from '../core/events';
import { DISABLED_ACTIONS } from '../core/features';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import { newPlayerState, type BuffView, type PlayerState, type RunSession, type SkillSlotView } from '../core/session';
import { BossController } from '../bosses/bossController';
import type { BossHost } from '../bosses/host';
import { Door } from '../entities/door';
import { Enemy, type EnemyHost } from '../entities/enemy';
import { Chest, MerchantStand, type ChestKind } from '../entities/chest';
import { Spire } from '../entities/spire';
import { Darkness } from '../entities/darkness';
import { animateArt, fitArt } from '../entities/art';
import { Juice, shake } from '../entities/juice';
import { cameraFocus, viewSize } from '../systems/camera';
import { bossIntroStage, bossIntroTotal, damageKind, HitStop, slowMoScale, type IntroStage } from '../systems/juice';
import { weaponSfx, type SfxId } from '../systems/sound';

/** 효과음 하나 (합성은 audio/sfx.ts) */
const sfx = (id: SfxId) => bus.emit('sfx', { id });
import { artKeys, type TilePart } from '../systems/art';
import { ItemRuntime } from '../items/runtime';
import { DelayedBlast, type Hazard } from '../entities/hazard';
import { FloorWeapon, Pickup } from '../entities/pickup';
import { Explosive } from '../skills/explosive';
import { nearestEnemy, type ShieldOpts, type SkillHost, type SkillObject } from '../skills/host';
import { isSkillImplemented, passiveImpl, skillImpl, ultimateImpl } from '../skills/registry';
import { applyCard, drawSkillCards, drawStatCards, runStartOffers, stageEndOffers, type AnyCard } from '../systems/cards';
import { calcDamage, gradeMultiplier, spaceDamage, type RangeBonus, type Stats } from '../systems/damage';
import { convertSkills, gaugeFromDamage, gaugeFromEnergy, gaugeFromGreatSuccess, judgeSchool, skillAllowed, topSchools, ultimateAwakeningReady } from '../systems/advancement';
import { advancementCut, skillAwakeningCut, ultimateAwakeningCut, type Cutscene } from '../ui/cutscenePages';
import { assignElites, eliteCount, pickTwoElites } from '../systems/elites';
import { championWaves, raidChampions } from '../systems/champions';
import { IMPLEMENTED_ENCOUNTERS } from '../systems/encounter';
import { effectiveWeights, itemDamageMultiplier, readySet, rollItem, transferWeight } from '../systems/items';
import { canBuy, merchantStock, rollEncounter, rollGrade, rollOptions, rollWeapon } from '../systems/loot';
import { lineHits, muzzleAngle, muzzlePoint } from '../systems/targeting';
import { generateStage, type RoomNode } from '../systems/mapgen';
import { encounterKinds, hiddenChapterMul, pickHiddenBoss } from '../systems/hiddenBoss';
import { signatureFires, steerToward } from '../systems/motion';
import { crystalBreakdown, rollShard } from '../systems/runRecord';
import { registerCutscene, registerGemini } from '../core/save';
import { hasLines, MiniQueue, pickMini, saidKeys, storyFor } from '../systems/gemini';
import { inSpireCircle, spireEliteCount, spireItemChoices, spireSize, type SpireEvent } from '../systems/spire';
import { planCombatWaves, RoomState, wavesForRoom, type RoomEvent, type Wave } from '../systems/roomState';
import { advanceStage, playableChapters, firstStage, type StageRef } from '../systems/run';
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
import { addStat, damageTaken, maxHpFor, setStat, statEffect } from '../systems/stats';
import { applyBleed, buffDuration, canAutoCast, chargeTime, skillTags, tickBleed } from '../systems/tags';
import {
  activeWeapon,
  dropWeaponAt,
  autoAim,
  gainEnergy,
  gunShots,
  inArc,
  normalize,
  pickUpWeapon,
  plainWeapon,
  projectilesCut,
  rollCrit,
  canFire,
  spendEnergy,
  swapWeapon,
  weaponStats,
  type WeaponItem,
  type WeaponStats,
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
  obstacleRects,
  wallRects,
  type Rect,
  type WorldMetrics,
} from '../systems/worldLayout';
import type { BleedRule, CardOfferKind, DodgeSchoolDef, EncounterKindId, GeminiEventId, GradeId, HiddenBossDef, WeaponSignature, SchoolId, SkillDef, SpaceRule, StatId, TagId, UltimateDef, WeaponDef } from '../types/data';

export interface RunSceneData {
  stage?: StageRef;
  player?: PlayerState;
  /** 이 스테이지 시작방에서 고를 카드 */
  offers?: CardOfferKind[];
  /** 새 런: 실험장에서 고른 직업 */
  job?: string;
  /** 포탈을 타고 왔다 (도착 연출, 이동 화면을 걷는다) */
  warpIn?: boolean;
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  roomId: number;
  radius: number;
}

interface Offer {
  kind: CardOfferKind | 'item' | 'school';
  boss: boolean;
  /** 아이템 선택 카드(첨탑): 미리 뽑아 둔 아이템 */
  items?: string[];
  /** 학파 선택 카드(전직 동점): 동점인 학파 */
  schools?: SchoolId[];
}

type Modal = 'cards' | 'inventory' | 'cutscene' | 'story' | 'intro' | 'pause' | 'portal' | 'itemGet' | null;

/** 조우 칸 물약 자판기 */
interface Vending {
  x: number;
  y: number;
  stock: number;
  sprite: Phaser.GameObjects.Image;
}

const SKILL_ACTIONS: ButtonAction[] = ['skill1', 'skill2', 'skill3', 'skill4'];

/** 전투 씬: 스테이지 하나(방·복도·적·무기·스킬). 스테이지를 넘기면 다음 스테이지 데이터로 재시작한다. */
export class RunScene extends Phaser.Scene {
  private ctx!: GameContext;
  private session!: RunSession;
  private m!: WorldMetrics;
  private rng!: Rng;
  private host!: SkillHost;
  /** 피해를 준 스킬 id별 SkillHost (학파 궁극기 게이지가 출처를 본다) */
  private hosts = new Map<string, SkillHost>();

  private player!: Phaser.Physics.Arcade.Sprite;
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
  private vendings: Vending[] = [];
  private potions: Phaser.GameObjects.Image[] = [];
  /** 포탈·자판기 앞에 뜨는 조작 안내 */
  private interactPrompt: Phaser.GameObjects.Text | null = null;
  /** 아직 보여주지 않은 아이템 획득 창 */
  private itemGets: { itemId: string; set: boolean }[] = [];
  private cores: Prop[] = [];
  private chests: Chest[] = [];
  private stands: MerchantStand[] = [];
  /** 대규모 습격이 벌어진 조우 칸 */
  private raidRooms = new Set<number>();
  /** 히든보스가 나온 조우 칸 → 그 히든보스 */
  private hiddenBossRooms = new Map<number, HiddenBossDef>();
  /** 디버그: 다음 히든보스 지정 */
  private forcedHiddenBoss: string | null = null;
  /** 유니크 고유 효과: 지금 무기로 한 공격 수 */
  private sigItem: WeaponItem | null = null;
  private sigCount = 0;
  /** 학파 선택 카드를 고른 뒤 전직을 마치고 할 일 */
  private pendingAdvance: (() => void) | null = null;
  /** 마기수집첨탑 (조우 칸 하나에 하나) */
  private spires: Spire[] = [];
  /** 타격감 연출·히트스톱 (멈춘 동안은 물리와 적이 멈춘다), 다음 피해가 치명타인지 */
  private juice!: Juice;
  private hitStop!: HitStop;
  private stopping = false;
  private pendingCrit = false;
  /** 보스 등장 컷 (그동안 게임은 멈춘다) */
  private intro: { e: Enemy; t: number; stage: IntroStage } | null = null;
  /** 방 장애물 (적 소환 자리를 피한다) */
  private obstacles = new Map<number, Rect[]>();
  /** 지금 조준 중인 적 (카메라가 그쪽으로 기운다) */
  private aimTarget: Vec2 | null = null;
  /** 보스 처치 슬로모션 경과(초), 없으면 null */
  private slowT: number | null = null;
  /** 일식 어둠과 그 보스 (식광) */
  private darkness: Darkness | null = null;
  private darknessBoss: Enemy | null = null;
  /** 강적이 나올 중형 첨탑 (첫 무리 때 소환) */
  private spireStrong = new Set<Spire>();
  /** 처치 중에 생긴 첨탑 이벤트 (다음 updateSpires에서 처리) */
  private spireEvents: { sp: Spire; e: SpireEvent }[] = [];
  /** 대검 차지 */
  private charging = false;
  private chargeT = 0;
  private chargeFx: Phaser.GameObjects.Graphics | null = null;
  /** 디버그: 다음 조우 칸 유형 강제 */
  private forcedEncounter: EncounterKindId | null = null;
  /** 이번 카드창에서 리롤을 썼는지 */
  private rerolled = false;
  private currentOffer: Offer | null = null;
  private skillObjects: SkillObject[] = [];
  /** 적 쪽 위험 지대(폭발 엘리트 지연 폭발 등) */
  private hazards: Hazard[] = [];
  private enemyHost!: EnemyHost;
  /** 아이템 발동형 효과·상태 */
  private itemRt!: ItemRuntime;
  private bossHost!: BossHost;
  /** 보스 적 → 패턴 컨트롤러 */
  private bossControllers = new Map<Enemy, BossController>();
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
  private dodge: DodgeState = IDLE_DODGE;
  private dodgeGhostIn = 0;
  private dodgeFxRng: Rng | null = null;
  private dodgeBar: Phaser.GameObjects.Graphics | null = null;
  private pathFields = new Map<number, PathField>();
  private bossHpSeen = new Map<Enemy, number>();
  private interactKind: 'weapon' | 'chest' | 'merchant' | 'vending' | 'portal' | null = null;
  /** 상자·드롭 무기 시드 순번 */
  private lootSeq = 0;
  private toastTimes = new Map<string, number>();
  private unsubs: (() => void)[] = [];
  private initData: RunSceneData = {};

  // 카드·인벤토리
  private modal: Modal = null;
  private offerQueue: Offer[] = [];
  private afterOffers: (() => void)[] = [];
  private currentCards: AnyCard[] | null = null;
  /** 컷인 → 설명창 대기열과 다 본 뒤 할 일 */
  /** 미모사 제미니 미니 대사 순서, 스토리 대화가 끝난 뒤 할 일 */
  private mini!: MiniQueue;
  private storyThen: (() => void) | null = null;
  private cutQueue: Cutscene[] = [];
  private afterCuts: (() => void) | null = null;
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
    this.mini = new MiniQueue(d.gemini.mini.showSec, d.gemini.mini.fadeSec);
    // 연출용 난수는 전투 난수와 따로 (시드 재현에 영향 없게)
    this.juice = new Juice(this, d, Rng.derive(seed, `juice-${stage.chapter}-${stage.stage}`));
    this.hitStop = new HitStop(d.juice.hitStop.minGapSec);
    this.stopping = false;
    this.pendingCrit = false;
    this.intro = null;
    this.slowT = null;
    // 슬로모션 중에 스테이지를 넘어가도 배속이 남지 않게
    this.physics.world.timeScale = 1;
    this.tweens.timeScale = 1;
    this.aimTarget = null;
    this.obstacles = new Map();
    this.storyThen = null;
    bus.emit('geminiMini', { line: null });
    // 챕터를 끝내고 넘어왔다 (2장 종료 미니 대사)
    if (!newRun && stage.stage === 1 && stage.chapter > 1) this.say('chapterEnd', String(stage.chapter - 1));
    this.m = metrics(d.mapgen);
    this.hosts = new Map();
    this.host = this.hostFor(null);
    this.itemRt = new ItemRuntime({
      scene: this,
      ctx: this.ctx,
      player: () => this.session.player,
      skill: () => this.hostFor('item'),
      skillFor: (id) => this.hostFor(id),
      fireBullet: (from, angle, speed, range, base, tags, pierce) => this.fireBullet(from, angle, speed, range, base, tags, 'item', { pierce, crit: 0 }),
      setInvuln: (sec) => {
        this.invuln = Math.max(this.invuln, sec);
      },
      buffDuration: (sec) => this.hostFor('item').buffDuration(sec, ['buff']),
      burstArea: (r) => this.burstArea(r),
      toast: (text) => bus.emit('toast', { text }),
      arena: () => this.currentArena(),
      blink: (distance) => this.blinkPlayer(distance),
      absorbEnemyBullets: (at, radius) => this.absorbEnemyBullets(at, radius),
    });
    this.enemyHost = {
      scene: this,
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      playerRadius: d.player.size / 2,
      hurtPlayer: (amount, attacker) => this.hurtPlayer(amount, attacker ?? null),
      fireEnemyBullet: (from, angle, speed, range, damage, refractable) => this.fireEnemyBullet(from, angle, speed, range, damage, refractable),
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
      addObstacle: (at, radius, doorClear) => this.addObstacle(at, radius, doorClear),
      chapterRoster: () => this.chapterRoster(),
      arena: () => this.currentArena(),
      bossPhaseFx: (text, color, at) => this.bossPhaseFx(text, color, at),
    };

    this.walls = this.physics.add.staticGroup();
    this.doorGroup = this.physics.add.staticGroup();
    this.enemyGroup = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();

    this.buildWorld();

    const start = roomCenter(map.rooms[map.startId]!, this.m);
    this.player = this.physics.add.sprite(start.x, start.y, d.player.spriteKey).setDepth(4);
    fitArt(d, this.player, d.player.size, d.player.height ?? d.player.size);
    this.applyPlayerArt();
    this.weaponSprite = this.add.image(start.x, start.y, this.weaponDef().spriteKey).setDepth(4);
    if (this.initData.warpIn) this.warpIn();
    // 카메라: 확대하고 첫 프레임부터 제자리 (다음부터는 부드럽게 따라간다)
    {
      const cam = this.cameras.main;
      cam.setZoom(d.ui.camera.zoom * this.ctx.renderScale);
      const t0 = this.cameraTarget();
      cam.setScroll(t0.x - cam.width / 2, t0.y - cam.height / 2);
    }
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
      bus.on('inventoryDropWeapon', ({ slot }) => this.dropFromSlot(slot)),
      bus.on('inventoryOpenRequest', () => this.openInventory()),
      bus.on('inventoryCloseRequest', () => this.closeInventory()),
      bus.on('debugSetSkill', (e) => this.debugSetSkill(e.skillId, e.level, e.awakened)),
      bus.on('debugSetStat', ({ stat, value }) => {
        const before = { hp: this.session.player.hp, maxHp: this.session.player.maxHp };
        this.session.player = { ...setStat(this.session.player, stat, value, d.player.maxHp, d.stats), ...before };
        this.syncMaxHp();
      }),
      bus.on('debugOpenCards', ({ kind }) => this.queueOffers([{ kind, boss: false }])),
      bus.on('debugFillUltimate', () => {
        this.session.player.ultimate.gauge = this.ultimateDef().gaugeMax;
      }),
      bus.on('debugSpawn', ({ enemyId, count, elite }) => this.debugSpawn(enemyId, count, elite ?? null)),
      bus.on('debugBarrage', () => this.debugBarrage()),
      bus.on('cutsceneDone', () => this.showNextCut()),
      bus.on('storyDone', () => this.finishStory()),
      bus.on('itemGetDone', () => {
        if (this.modal === 'itemGet') this.setModal(null);
      }),
      bus.on('pauseResume', () => {
        if (this.modal === 'pause') this.setModal(null);
      }),
      bus.on('cardReroll', () => this.rerollCards()),
      bus.on('debugForceEncounter', ({ kind }) => {
        this.forcedEncounter = kind;
      }),
      bus.on('debugGoStage', ({ chapter, stage }) => {
        if (this.modal || this.session.outcome) return;
        this.scene.restart({ stage: { chapter, stage }, player: this.session.player, offers: [] } satisfies RunSceneData);
      }),
      bus.on('debugHiddenBoss', ({ id }) => {
        this.forcedEncounter = 'hiddenBoss';
        this.forcedHiddenBoss = id;
      }),
      bus.on('debugGiveWeapon', ({ defId, grade }) => {
        const d = this.ctx.data;
        const def = this.weaponDefOf(defId);
        const count = d.groupMultipliers.grades.find((g) => g.id === grade)?.randomOptions ?? 0;
        const rng = Rng.derive(this.ctx.config.seed, `debug-weapon-${this.lootSeq++}`);
        const options = rollOptions(rng, def, count, d.weapons.options);
        this.dropWeapon({ defId, grade, options }, this.player.x + 16, this.player.y);
      }),
      bus.on('debugGiveItem', ({ itemId }) => this.giveItem(itemId)),
      bus.on('debugCoins', ({ amount }) => {
        this.session.player.coins += amount;
      }),
      bus.on('debugAdvance', ({ hectar, acro }) => this.debugAdvance(hectar, acro)),
      bus.on('debugBossHp', ({ ratio }) => {
        for (const e of this.enemies) if (e.def.rank === 'boss' || e.def.rank === 'hiddenBoss') e.hp = Math.max(1, e.maxHp * ratio);
      }),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      for (const o of this.skillObjects) o.destroy();
      this.skillObjects = [];
      for (const h of this.hazards) h.destroy();
      this.hazards = [];
      for (const b of this.bossControllers.values()) b.destroy();
      this.bossControllers = new Map();
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
    this.vendings = [];
    this.potions = [];
    this.interactPrompt = null;
    this.itemGets = [];
    this.cores = [];
    this.chests = [];
    this.stands = [];
    this.raidRooms = new Set();
    this.hiddenBossRooms = new Map();
    this.spires = [];
    this.spireStrong = new Set();
    this.darkness = null;
    this.darknessBoss = null;
    this.spireEvents = [];
    this.charging = false;
    this.chargeT = 0;
    this.chargeFx = null;
    this.skillObjects = [];
    this.hazards = [];
    this.bossControllers = new Map();
    this.shield = null;
    this.shieldOpts = null;
    this.shieldFx = null;
    this.passiveKey = '';
    this.passiveId = null;
    this.dashLeft = 0;
    this.aimDir = { x: 1, y: 0 };
    this.fireCooldown = 0;
    this.invuln = 0;
    this.dodge = IDLE_DODGE;
    this.dodgeBar = null;
    this.pathFields = new Map();
    this.bossHpSeen = new Map();
    this.interactKind = null;
    this.lootSeq = 0;
    this.toastTimes = new Map();
    this.modal = null;
    this.offerQueue = [];
    this.afterOffers = [];
    this.currentCards = null;
    this.cutQueue = [];
    this.afterCuts = null;
    this.pendingAdvance = null;
    this.cardSeq = 0;
    this.leaving = false;
  }

  // ---------- 월드 ----------

  private buildWorld(): void {
    const d = this.ctx.data;
    const { map } = this.session;
    // 챕터가 바뀌면 방 색(타일 자리)도 바뀐다
    const theme = d.ui.chapterRooms[String(this.session.stage.chapter)] ?? d.ui.room;
    const floor = hexColor(theme.floorColor);
    const wall = hexColor(theme.wallColor);
    const corridorColor = hexColor(theme.corridorColor);
    const doorColor = hexColor(d.mapgen.door.color);

    // 타일 그림이 있으면 반복해서 깔고, 없으면 색
    const chapter = this.session.stage.chapter;
    const tile = (part: TilePart) => artKeys.tile(part, chapter);
    for (const c of corridors(map, this.m)) {
      this.addRect(c.floor, corridorColor, 0, tile('corridor'));
      for (const w of c.walls) this.walls.add(this.addRect(w, wall, 1, tile('wall')));
    }

    for (const node of map.rooms) {
      // 바닥: 방마다 변형 하나 (같은 시드면 같은 방)
      const dress = Rng.derive(this.ctx.config.seed, `dress-${map.chapter}-${map.stage}-${node.id}`);
      const floorN = d.mapgen.dressing.floorVariants[String(chapter)] ?? 0;
      this.addRect(roomRect(node, this.m), floor, 0, floorN > 0 ? artKeys.floorVariant(chapter, dress.int(0, floorN - 1)) : tile('floor'));
      for (const w of wallRects(node, this.m)) this.walls.add(this.addRect(w, wall, 1, tile('wall')));
      // 장애물: 벽처럼 이동과 탄(플레이어·적)을 막는다
      const obs = obstacleRects(node, this.m, d.mapgen);
      this.obstacles.set(node.id, obs);
      this.addDecals(node, chapter, obs, dress);
      for (const o of obs) this.dressObstacle(o, chapter, dress);

      const doors: Door[] = [];
      for (const dir of Object.keys(node.doors) as ('n' | 's' | 'e' | 'w')[]) {
        doors.push(new Door(this, doorRect(node, dir, this.m), doorColor, this.doorGroup, artKeys.door));
      }
      this.doorsByRoom.set(node.id, doors);

      const waves = wavesForRoom(
        this.ctx.config.seed,
        map.chapter,
        map.stage,
        node.id,
        node.kind,
        d.mapgen.combatWaves,
        d.bosses.bosses.find((b) => b.chapter === map.chapter && b.stage === map.stage)?.id ?? d.mapgen.bossPlaceholderEnemy,
        d.waves,
      );
      this.rooms.set(node.id, new RoomState(node.kind, waves, d.waves.waveDelaySec));

      const c = roomCenter(node, this.m);
      if (node.kind === 'exitRoom') this.addPortal(node);
      if (node.kind === 'encounterRoom') {
        this.addVending(node, obs, dress);
        const ref = d.mapgen.props.encounterCore;
        const core = this.add.image(c.x, c.y, ref.spriteKey).setDepth(2);
        fitArt(d, core, ref.size, ref.height ?? ref.size);
        this.cores.push({ sprite: core, roomId: node.id, radius: ref.size / 2 });
      }
    }
  }

  /** 바닥 장식: 밟고 지나가는 잔해·패널 (지형지물 자리는 피한다) */
  private addDecals(node: RoomNode, chapter: number, obs: readonly Rect[], rng: Rng): void {
    const dr = this.ctx.data.mapgen.dressing;
    const inner = interiorRect(node, this.m, 8);
    const n = rng.int(dr.decalsPerRoom[0], dr.decalsPerRoom[1]);
    for (let i = 0; i < n; i++) {
      const x = rng.range(inner.x, inner.x + inner.w);
      const y = rng.range(inner.y, inner.y + inner.h);
      const key = artKeys.decal(chapter, rng.int(0, dr.decalKinds - 1));
      if (!this.ctx.artLoaded.has(key) || obs.some((o) => contains({ x: o.x - 16, y: o.y - 16, w: o.w + 32, h: o.h + 32 }, x, y))) continue;
      this.add.image(x, y, key).setDepth(0.2).setFlipX(rng.chance(0.5));
    }
  }

  /** 지형지물: 판정은 사각형 그대로, 겉모습은 챕터 소품을 빽빽이 찍어 바닥과 확실히 다르게 */
  private dressObstacle(o: Rect, chapter: number, rng: Rng): void {
    const dr = this.ctx.data.mapgen.dressing;
    this.add.rectangle(o.x + o.w / 2 + 2, o.y + o.h / 2 + 5, o.w, o.h, 0x000000, 0.5).setDepth(0.5);
    this.walls.add(this.add.rectangle(o.x + o.w / 2, o.y + o.h / 2, o.w, o.h, hexColor(dr.obstacleBaseColor)).setDepth(1));
    for (const p of stampGrid(o, dr.obstacleStepPx)) {
      const key = artKeys.obstacle(chapter, rng.int(0, dr.obstacleKinds - 1));
      if (!this.ctx.artLoaded.has(key)) continue;
      this.add.image(p.x, p.y + 4, key).setOrigin(0.5, 0.8).setDepth(1.1 + p.y * 1e-5).setFlipX(rng.chance(0.5));
    }
  }

  /** 물약 자판기: 방 모서리 중 지형지물이 없는 곳 */
  private addVending(node: RoomNode, obs: readonly Rect[], rng: Rng): void {
    const v = this.ctx.data.mapgen.vending;
    const inner = interiorRect(node, this.m, v.cornerInsetPx);
    const corners = [
      { x: inner.x, y: inner.y },
      { x: inner.x + inner.w, y: inner.y },
      { x: inner.x, y: inner.y + inner.h },
      { x: inner.x + inner.w, y: inner.y + inner.h },
    ].filter((p) => !obs.some((o) => contains({ x: o.x - 24, y: o.y - 24, w: o.w + 48, h: o.h + 48 }, p.x, p.y)));
    const at = corners.length > 0 ? rng.pick(corners) : roomCenter(node, this.m);
    const sprite = this.add.image(at.x, at.y, v.spriteKey).setDepth(2);
    fitArt(this.ctx.data, sprite, v.size, v.height ?? v.size);
    this.vendings.push({ x: at.x, y: at.y, stock: v.stock, sprite });
  }

  /** 자판기에서 물약을 뽑는다: 코인을 내면 앞으로 물약이 튀어나온다 */
  private buyPotion(m: Vending): void {
    const v = this.ctx.data.mapgen.vending;
    const p = this.session.player;
    if (p.coins < v.price) {
      this.toastThrottled(this.ctx.t('merchant.noCoins'));
      return;
    }
    p.coins -= v.price;
    m.stock--;
    sfx('vend');
    this.tweens.add({ targets: m.sprite, x: m.x + 1.5, duration: 40, yoyo: true, repeat: 3, onComplete: () => m.sprite.setX(m.x) });
    if (m.stock <= 0) m.sprite.setAlpha(0.45);
    const potion = this.add.image(m.x, m.y + 4, v.potion.spriteKey).setDepth(3);
    this.potions.push(potion);
    this.tweens.add({ targets: potion, y: m.y + 26, x: m.x + this.rng.range(-8, 8), duration: 280, ease: 'Bounce.easeOut' });
  }

  /** 물약 줍기: 체력이 닳아 있을 때 닿으면 회복 */
  private updatePotions(): void {
    const v = this.ctx.data.mapgen.vending;
    const p = this.session.player;
    this.potions = this.potions.filter((img) => {
      if (p.hp >= p.maxHp || Math.hypot(img.x - this.player.x, img.y - this.player.y) > v.pickupRadius) return true;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * v.healRatio);
      sfx('heal');
      this.floatLabel({ x: this.player.x, y: this.player.y - 8 }, this.ctx.t('vending.heal', { n: Math.round(p.hp - before) }), '#7dff9a');
      img.destroy();
      return false;
    });
  }

  /** 플레이어 모습: 전직했으면 그 학파 그림(있으면), 아니면 기본 */
  private applyPlayerArt(): void {
    const d = this.ctx.data;
    const school = this.session.player.advancement;
    const key = school && this.ctx.artLoaded.has(artKeys.playerSchool(school)) ? artKeys.playerSchool(school) : d.player.spriteKey;
    if (this.player.texture.key === key) return;
    this.player.anims.stop();
    this.player.setTexture(key, 0);
    fitArt(d, this.player, d.player.size, d.player.height ?? d.player.size);
  }

  /** 방 바닥·벽: 타일 그림(key)이 있으면 반복해서 깔고, 없으면 색 사각형 */
  private addRect(r: Rect, color: number, depth: number, key?: string): Phaser.GameObjects.Rectangle | Phaser.GameObjects.TileSprite {
    if (key && this.textures.exists(key)) return this.add.tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, key).setDepth(depth);
    return this.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, color).setDepth(depth);
  }

  // ---------- 보스 연출 ----------

  /** 보스 체력바에 띄울 보스 (보스가 부른 적·분신 제외, 등장 컷 동안은 없음) */
  private bossView(): RunSession['boss'] {
    if (this.intro) return null;
    for (const [e, c] of this.bossControllers) {
      if (e.dead) continue;
      return { name: this.ctx.t(e.def.nameKey), hp: e.hp, maxHp: e.maxHp, markers: c.def.enrageAt > 0 ? [c.def.enrageAt] : [], color: e.def.color };
    }
    return null;
  }

  /** 카메라가 평소 볼 곳: 플레이어(조준 적 쪽으로 기울어), 방 안이면 방 경계 안 */
  private cameraTarget(): Vec2 {
    const rules = this.ctx.data.ui.camera;
    const cam = this.cameras.main;
    const rid = roomAt(this.session.map, this.m, this.player.x, this.player.y);
    const room = rid !== null ? roomRect(this.session.map.rooms[rid]!, this.m) : null;
    return cameraFocus({ x: this.player.x, y: this.player.y }, this.aimTarget, viewSize(cam.width, cam.height, rules.zoom * this.ctx.renderScale), rules, room);
  }

  /** 보스 등장 컷 시작: 게임을 멈추고 카메라가 보스 쪽으로 다가간다 */
  private startBossIntro(e: Enemy): void {
    const bi = this.ctx.data.juice.bossIntro;
    e.warn = bossIntroTotal(bi) + 0.1;
    e.sprite.setAlpha(0);
    this.intro = { e, t: 0, stage: 'pan' };
    this.setModal('intro');
    const cam = this.cameras.main;
    cam.pan(e.sprite.x, e.sprite.y, bi.panSec * 1000, 'Sine.easeInOut');
    cam.zoomTo(this.ctx.data.ui.camera.zoom * this.ctx.renderScale * bi.zoom, bi.panSec * 1000);
  }

  /** 등장 컷 한 프레임: 단계가 바뀔 때마다 연출. 아무 키·탭이면 건너뛴다 */
  private updateIntro(dt: number, frame: ActionFrame): void {
    const it = this.intro!;
    const d = this.ctx.data;
    const bi = d.juice.bossIntro;
    it.t += dt;
    if (frame.pressed.size > 0 && it.t > 0.2) {
      this.finishIntro();
      return;
    }
    const st = bossIntroStage(it.t, bi).stage;
    if (st === it.stage) return;
    it.stage = st;
    const e = it.e;
    const cam = this.cameras.main;
    if (st === 'drop') {
      // 커다랗게 떠 있다가 내려찍는다
      e.sprite.setAlpha(1).setScale(e.baseScale * 1.8);
      this.tweens.add({
        targets: e.sprite,
        scale: e.baseScale,
        duration: bi.dropSec * 1000,
        ease: 'Quad.easeIn',
        onComplete: () => {
          shake(this, 'heavy');
          sfx('bossSlam');
          this.juice.landing({ x: e.sprite.x, y: e.sprite.y }, e.radius);
        },
      });
    } else if (st === 'name') {
      const { stage } = this.session;
      const hidden = e.rank === 'hiddenBoss';
      const sub = hidden ? this.ctx.t('boss.intro.hidden') : this.ctx.t('boss.intro.stage', { chapter: stage.chapter, stage: stage.stage });
      bus.emit('bossIntroBand', { name: this.ctx.t(e.def.nameKey), sub });
    } else if (st === 'return') {
      bus.emit('bossIntroBand', { name: '', sub: '' });
      const tgt = this.cameraTarget();
      cam.pan(tgt.x, tgt.y, bi.returnSec * 1000, 'Sine.easeInOut');
      cam.zoomTo(this.ctx.data.ui.camera.zoom * this.ctx.renderScale, bi.returnSec * 1000);
    } else if (st === 'done') {
      this.finishIntro();
    }
  }

  /** 등장 컷 끝 (또는 건너뜀): 카메라를 제자리로, 보스를 깨운다 */
  private finishIntro(): void {
    const it = this.intro;
    if (!it) return;
    this.intro = null;
    const cam = this.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.setZoom(this.ctx.data.ui.camera.zoom * this.ctx.renderScale);
    const tgt = this.cameraTarget();
    cam.setScroll(tgt.x - cam.width / 2, tgt.y - cam.height / 2);
    this.tweens.killTweensOf(it.e.sprite);
    it.e.sprite.setAlpha(1).setScale(it.e.baseScale);
    it.e.warn = 0;
    bus.emit('bossIntroBand', { name: '', sub: '' });
    if (this.modal === 'intro') this.setModal(null);
  }

  /**
   * 포탈 타기: 게임을 멈추고 캐릭터가 포탈 가운데로 빨려 들어가며(돌며 작아짐) 카메라가 확대된다.
   * 다 들어가면 이동 화면(빛줄기)을 덮고 잠깐 뒤 then (카드 고르기).
   */
  private warpOut(then: () => void): void {
    const p = this.ctx.data.juice.portal;
    const portal = this.nearest(this.portals.map((x) => ({ x: x.sprite.x, y: x.sprite.y })), Infinity) ?? { x: this.player.x, y: this.player.y };
    this.setModal('portal');
    sfx('warp');
    const cam = this.cameras.main;
    cam.zoomTo(this.ctx.data.ui.camera.zoom * this.ctx.renderScale * p.zoom, p.suckSec * 1000, 'Quad.easeIn');
    cam.pan(portal.x, portal.y, p.suckSec * 1000, 'Sine.easeInOut');
    this.weaponSprite.setVisible(false);
    this.tweens.add({
      targets: this.player,
      x: portal.x,
      y: portal.y,
      scale: 0,
      angle: 540,
      duration: p.suckSec * 1000,
      ease: 'Quad.easeIn',
      onComplete: () => {
        bus.emit('warp', { on: true });
        // 덮인 뒤 잠깐 있다가 카드 (트윈은 모달 중에도 돈다)
        this.tweens.add({
          targets: this.player,
          alpha: 0,
          duration: (p.fadeInSec + p.holdSec) * 1000,
          onComplete: () => {
            if (this.modal === 'portal') this.setModal(null);
            then();
          },
        });
      },
    });
  }

  /** 포탈을 타고 도착: 이동 화면을 걷고 캐릭터가 빛 속에서 커지며 나타난다 */
  private warpIn(): void {
    const p = this.ctx.data.juice.portal;
    bus.emit('warp', { on: false });
    sfx('warpArrive');
    this.player.setScale(0).setAngle(-360);
    this.tweens.add({ targets: this.player, scale: 1, angle: 0, duration: p.arriveSec * 1000, delay: p.fadeOutSec * 500, ease: 'Back.easeOut' });
    const ring = this.add.circle(this.player.x, this.player.y, 6).setStrokeStyle(2, hexColor(p.color), 1).setDepth(5);
    this.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: p.arriveSec * 1000 * 1.4, delay: p.fadeOutSec * 500, onComplete: () => ring.destroy() });
  }

  /** 보스 강화·단계 개방: 번쩍임, 짧은 확대, 화면 가운데 큰 이름 */
  private bossPhaseFx(text: string, color: string, at: Vec2): void {
    const bp = this.ctx.data.juice.bossPhase;
    const c = Phaser.Display.Color.HexStringToColor(color);
    const cam = this.cameras.main;
    cam.flash(bp.flashMs, c.red, c.green, c.blue);
    sfx('bossPhase');
    this.juice.colorBurst(at, color, bp);
    const base = this.ctx.data.ui.camera.zoom * this.ctx.renderScale;
    this.tweens.add({ targets: cam, zoom: base * bp.zoom, duration: (bp.zoomSec * 1000) / 2, yoyo: true, onComplete: () => cam.setZoom(base) });
    bus.emit('banner', { text, color, size: bp.bannerSize, sec: bp.bannerSec });
  }

  /** 보스 처치: 슬로모션 + 흰 번쩍임 + 연쇄 폭발 */
  private startBossKill(at: Vec2): void {
    const k = this.ctx.data.juice.bossKill;
    this.slowT = 0;
    this.cameras.main.flash(k.flashMs, 255, 255, 255);
    for (let i = 0; i < k.explosions; i++) {
      this.time.delayedCall(i * k.stepSec * 1000, () => {
        this.juice.explosionNear(at, k.spreadPx);
        sfx('explosion');
      });
    }
  }

  private addPortal(node: RoomNode): void {
    const ref = this.ctx.data.mapgen.props.exitPortal;
    const c = roomCenter(node, this.m);
    const sprite = this.add.image(c.x, c.y, ref.spriteKey).setDepth(2);
    this.tweens.add({ targets: sprite, alpha: 0.5, duration: 500, yoyo: true, repeat: -1 });
    this.tweens.add({ targets: sprite, angle: 360, duration: ref.spinSec * 1000, repeat: -1 });
    this.portals.push({ sprite, roomId: node.id, radius: ref.size / 2 });
  }

  private placeTestWeapons(): void {
    const node = this.session.map.rooms[this.session.map.startId]!;
    const inner = interiorRect(node, this.m);
    const ids = this.ctx.data.mapgen.testWeapons;
    ids.forEach((id, i) => {
      const x = inner.x + (inner.w * (i + 1)) / (ids.length + 1);
      const y = inner.y + (inner.h * 3) / 4;
      const def = this.weaponDefOf(id);
      this.floorWeapons.push(new FloorWeapon(this, plainWeapon(def), def.spriteKey, x, y));
    });
  }

  // ---------- 루프 ----------

  override update(_time: number, deltaMs: number): void {
    let dt = Math.min(deltaMs / 1000, 0.05);
    const frame = this.ctx.input.poll();
    // 보스 처치 슬로모션: 물리·트윈·게임 시간을 함께 늦춘다
    if (this.slowT !== null) {
      this.slowT += dt;
      const sc = slowMoScale(this.slowT, this.ctx.data.juice.bossKill);
      this.physics.world.timeScale = 1 / sc;
      this.tweens.timeScale = sc;
      if (sc >= 1) this.slowT = null;
      dt *= sc;
    }
    if (this.intro) this.updateIntro(dt, frame);
    this.session.boss = this.bossView();

    for (const action of frame.pressed) {
      const enabled = !DISABLED_ACTIONS.has(action);
      console.info(this.ctx.t(enabled ? 'system.command' : 'system.disabledCommand', { action }));
      bus.emit('command', { action, enabled });
    }

    if (this.session.outcome) {
      if (frame.pressed.has('attack') || frame.pressed.has('interact')) this.restartRun();
      return;
    }
    if (!this.modal && this.itemGets.length > 0) {
      this.setModal('itemGet');
      bus.emit('itemGot', this.itemGets.shift()!);
    }
    if (this.modal) {
      this.updateModal(frame);
      this.refreshSkillView();
      return;
    }
    // 미니 대사: 창이 열린 동안은 표시 시간도 멈춘다
    const ml = this.mini.update(dt);
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
    this.pendingCrit = false;
    // 일시정지 창
    if (frame.pressed.has('pause')) {
      this.setModal('pause');
      return;
    }
    this.session.player.record.playSec += dt;

    const p = this.session.player;
    const d = this.ctx.data;
    const mods = this.playerMods();
    p.shieldMax = d.player.shieldMax + p.meta.shield + mods.shieldMax;
    p.shield = Math.min(p.shield, p.shieldMax);
    this.syncMaxHp();
    this.itemRt.update(dt);
    this.updateDodge(dt, frame);
    const speed = d.player.moveSpeed * (1 + statEffect('moveSpeed', this.effStats(), d.stats)) * (1 + mods.moveSpeed) * (1 + this.itemRt.moveSpeedBonus());
    if (this.dashLeft > 0) {
      // MK 돌진: 입력 대신 돌진 방향으로
      this.dashLeft -= dt;
      this.player.setVelocity(this.dashVel.x, this.dashVel.y);
    } else if (this.dodge.left > 0) {
      this.player.setVelocity(this.dodge.vel.x, this.dodge.vel.y);
    } else {
      this.player.setVelocity(frame.move.x * speed, frame.move.y * speed);
    }
    const moving = frame.move.x !== 0 || frame.move.y !== 0;

    this.updateRooms(dt);
    this.updateSpires(dt);

    for (const e of this.enemies) {
      // 집정관: 플레이어가 그 방을 나가면 흡수 초기화
      if (e.def.absorb && this.enemyRoom.get(e) !== this.session.currentRoomId) e.resetAbsorb();
      e.update(dt, this.enemyHost);
    }
    for (const b of this.bossControllers.values()) b.update(dt, this.bossHost);
    this.updateBossEnergy();
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
      this.fireCooldown = 0;
      this.resetCharge();
    }
    if (frame.pressed.has('interact')) this.interact();

    this.updateAttack(dt, frame.held.has('attack'), aimAngle);

    // 스킬
    p.cooldowns = tickCooldowns(p.cooldowns, dt);
    SKILL_ACTIONS.forEach((action, i) => {
      if (frame.pressed.has(action)) this.castSlot(i);
    });
    if (frame.pressed.has('ultimate')) this.castUltimate();
    this.syncPassive();
    this.updateShield(dt);
    for (const o of [...this.skillObjects]) if (!o.update(dt, this.hostFor(o.owner))) this.removeObject(o);
    this.updateBleeds(dt);
    this.updateCorruption(dt);

    this.updateBullets(dt);
    this.updatePickups(dt);
    this.updateInvuln(dt);
    this.updatePotions();
    this.updateInteractHint();

    const weaponKey = this.shownWeaponKey();
    const handAt = this.handPos();
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
    this.darkness?.update(dt, cam.width / 2 + (this.player.x - cam.midPoint.x), cam.height / 2 + (this.player.y - cam.midPoint.y));
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
      // 조우 칸: 안쪽에 들어서면 유형이 정해진다
      if (map.rooms[rid]!.kind === 'encounterRoom' && !this.session.encounters.has(rid) && contains(inner, this.player.x, this.player.y)) {
        this.resolveEncounter(rid);
      }
      if (this.rooms.get(rid)!.phase === 'idle' && contains(inner, this.player.x, this.player.y)) {
        // 보스방: 경고 배너를 띄우고 그동안 보스 소환을 미룬다
        const boss = state.kind === 'bossRoom' ? state.waves[0]?.[0] : undefined;
        const bossDef = boss ? this.ctx.data.enemies.enemies.find((e) => e.id === boss) : undefined;
        if (bossDef) this.showBossWarning(this.ctx.t(bossDef.nameKey));
        this.handleRoomEvents(rid, state.enter(bossDef ? this.ctx.data.bosses.bannerSec : 0));
        // 바바리안 데스 휘슬: 전투 칸에 들어갈 때 함성
        if (state.kind === 'combatRoom') this.itemRt.triggerRoar();
      }
    }
    for (const [id, state] of this.rooms) {
      if (state.phase === 'locked') this.handleRoomEvents(id, state.update(dt));
    }
  }

  private handleRoomEvents(roomId: number, events: RoomEvent[]): void {
    for (const e of events) {
      if (e.type === 'lock') {
        this.setRoomLocked(roomId, true);
        // 보스는 등장 연출이 따로 있다
        if (this.rooms.get(roomId)?.kind !== 'bossRoom' && !this.hiddenBossRooms.has(roomId)) {
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
        if (node.kind === 'combatRoom') this.combatRoomDrop(roomId);
        if (this.raidRooms.has(roomId)) this.raidReward(roomId);
        if (this.hiddenBossRooms.has(roomId)) this.hiddenBossReward(roomId);
        // 보스 스테이지: 보스방에서 스킬 카드를 1회 더 고른 뒤 포털이 생긴다(보스방이 출구를 겸함)
        if (node.kind === 'bossRoom') {
          const end = stageEndOffers(this.session.stage, this.ctx.data.mapgen, this.ctx.data.cards);
          const bossId = this.rooms.get(roomId)?.waves[0]?.[0];
          // 식광·마기카이저: 처치 후 일반 스토리 대화 (내용이 비어 있으면 건너뜀)
          this.playStory('bossKill', bossId, () =>
            this.queueOffers(
              end.bossRoom.map((kind) => ({ kind, boss: true })),
              () => this.afterBossRoom(node),
            ),
          );
        }
      }
    }
  }

  private setRoomLocked(roomId: number, locked: boolean): void {
    const doors = this.doorsByRoom.get(roomId) ?? [];
    if (doors.length > 0 && doors.some((d) => d.rect.visible !== locked)) sfx(locked ? 'doorLock' : 'doorOpen');
    for (const door of doors) door.setLocked(locked);
  }

  private spawnWave(roomId: number, wave: Wave, index: number): void {
    const { map } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `spawn-${map.chapter}-${map.stage}-${roomId}-${index}`);
    // 전투 칸 웨이브의 일반 적 일부를 엘리트로 (보스방 제외)
    const node = map.rooms[roomId]!;
    const d = this.ctx.data;
    const elites =
      node.kind === 'combatRoom' || this.raidRooms.has(roomId)
        ? assignElites(
            Rng.derive(this.ctx.config.seed, `elite-${map.chapter}-${map.stage}-${roomId}-${index}`),
            wave,
            this.raidRooms.has(roomId)
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
    const champs = this.raidRooms.has(roomId)
      ? (raidChampions(Rng.derive(this.ctx.config.seed, champLabel), map.chapter, total, d.waves.champions)[index] ?? [])
      : node.kind === 'combatRoom'
        ? [championWaves(Rng.derive(this.ctx.config.seed, champLabel), map.chapter, map.stage, total, d.waves.champions)[index] ?? null].filter((x): x is string => x !== null)
        : [];
    for (const id of champs) this.spawnEnemy(id, roomId, rng, true);
    if (champs.length > 0) this.say('championMet');
    this.rooms.get(roomId)?.addAlive(champs.length);
  }

  /** extraEliteId: 두 번째 엘리트 (중형 첨탑 강적) */
  private spawnEnemy(id: string, roomId: number, rng: Rng, countForRoom: boolean, eliteId: string | null = null, extraEliteId: string | null = null): void {
    const d = this.ctx.data;
    const node = this.session.map.rooms[roomId]!;
    const def = d.enemies.enemies.find((e) => e.id === id)!;
    const pos = def.ai === 'idle' ? roomCenter(node, this.m) : this.spawnPoint(node, rng, def.size / 2);
    const elite = eliteId ? (d.elites.elites.find((x) => x.id === eliteId) ?? null) : null;
    const extra = extraEliteId ? (d.elites.elites.find((x) => x.id === extraEliteId) ?? null) : null;
    const icon = [elite, extra].filter((x) => x !== null).map((x) => this.ctx.t(x!.iconKey)).join('');
    const enemy = new Enemy(this, def, pos.x, pos.y, d.waves.spawnWarnSec, elite, d.elites, icon, extra);
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
        if (!this.intro) this.startBossIntro(enemy);
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
  private chapterRoster(): string[] {
    const d = this.ctx.data;
    const ids = new Set(d.waves.waves.filter((w) => w.chapter === this.session.stage.chapter).flatMap((w) => w.spawns.map((s) => s.enemy)));
    return [...ids].filter((id) => d.enemies.enemies.find((e) => e.id === id)?.rank === 'normal');
  }

  /** 플레이어가 있는 방 안쪽 */
  private currentArena(): Rect {
    const rid = this.session.currentRoomId ?? this.session.map.startId;
    return interiorRect(this.session.map.rooms[rid]!, this.m);
  }

  /** 특무 인장: 방 안, 벽·잔해가 없는 쪽으로 짧게 순간이동 */
  private blinkPlayer(distance: number): void {
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
  private linkWindup(src: Enemy, attackId: string): void {
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
  private spawnMinion(id: string, at: Vec2, maxHp?: number): Enemy {
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

  /** 지면 파괴 잔해: 벽처럼 막는다. 플레이어 자리·문 근처에는 만들지 않는다(갇힘 방지) */
  private addObstacle(at: Vec2, radius: number, doorClear: number): { destroy(): void } | null {
    const d = this.ctx.data;
    if (Math.hypot(this.player.x - at.x, this.player.y - at.y) <= radius + d.player.size / 2 + 2) return null;
    const rid = this.session.currentRoomId;
    for (const door of rid === null ? [] : (this.doorsByRoom.get(rid) ?? [])) {
      if (Math.hypot(door.rect.x - at.x, door.rect.y - at.y) <= doorClear + radius) return null;
    }
    const rect = this.add.rectangle(at.x, at.y, radius * 2, radius * 2, hexColor(d.bosses.rubbleColor)).setDepth(1);
    this.walls.add(rect);
    return { destroy: () => this.walls.remove(rect, true, true) };
  }

  private spawnPoint(node: RoomNode, rng: Rng, radius: number): Vec2 {
    const inner = interiorRect(node, this.m, radius);
    const minDist = this.ctx.data.waves.spawnMinPlayerDistance;
    let best: Vec2 = { x: inner.x, y: inner.y };
    let bestDist = -1;
    const obs = this.obstacles.get(node.id) ?? [];
    const blocked = (p: Vec2) => obs.some((o) => p.x > o.x - radius && p.x < o.x + o.w + radius && p.y > o.y - radius && p.y < o.y + o.h + radius);
    for (let i = 0; i < 30; i++) {
      const p = { x: rng.range(inner.x, inner.x + inner.w), y: rng.range(inner.y, inner.y + inner.h) };
      // 장애물 안에는 소환하지 않는다
      if (blocked(p)) continue;
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

  /** 들고 있는 무기 (등급·옵션이 붙은 실물) */
  private weaponItem(): WeaponItem {
    // 맨손이면 주먹 (슬롯에 들지 않는다)
    return activeWeapon(this.session.player.weapons) ?? this.fistItem();
  }

  private fist: WeaponItem | null = null;
  private fistItem(): WeaponItem {
    this.fist ??= plainWeapon(this.weaponDefOf(this.ctx.data.weapons.fistWeapon));
    return this.fist;
  }

  /** 손에 보이는 무기: 에너지가 모자라 쏠 수 없는 총이면 주먹 */
  private shownWeaponKey(): string {
    const item = this.weaponItem();
    const def = this.weaponDefOf(item.defId);
    if (def.category === 'blade' || canFire(this.session.player.energy, this.weaponStatsOf(item))) return def.spriteKey;
    return this.weaponDefOf(this.fistItem().defId).spriteKey;
  }

  private weaponDef(): WeaponDef {
    return this.weaponDefOf(this.weaponItem().defId);
  }

  /** 등급 배율·옵션을 반영한 무기 수치. 태그 보정은 hit()에서 */
  private weaponStatsOf(item: WeaponItem): WeaponStats {
    return weaponStats(this.weaponDefOf(item.defId), item, gradeMultiplier(item.grade, this.ctx.data.groupMultipliers));
  }

  /** 실제로 쓰는 스탯: 기본 스탯 + 들고 있는 무기의 보너스(신궁 환디 힘 +30) */
  private effStats(): Stats {
    const out = { ...this.session.player.stats };
    for (const [k, v] of Object.entries(this.weaponDef().equipBonus?.stats ?? {})) out[k as StatId] += v ?? 0;
    // 아이템 스탯 (LSD-R 재편 포함)
    const items = this.itemRt?.sums.stats;
    if (items) for (const k of Object.keys(out) as StatId[]) out[k] += items[k];
    return out;
  }

  /** 근접·원거리 피해 증가: 들고 있는 무기 + 아이템 (같은 종류라 더한다) */
  private rangeBonus(): RangeBonus {
    const b = this.weaponDef().equipBonus;
    const it = this.itemRt.sums.damage;
    return { melee: (b?.meleeDamage ?? 0) + it.melee, ranged: (b?.rangedDamage ?? 0) + it.ranged };
  }

  /** 피해 한 번. 태그 보정은 이 공격(source)의 태그로 계산한다 */
  private hit(enemy: Enemy, base: number, tags: readonly TagId[], source: string | null = null): boolean {
    if (enemy.dead) return false;
    const d = this.ctx.data;
    const stats = this.effStats();
    let dmg = calcDamage({ baseDamage: base, tags }, stats, d.tags, this.rangeBonus());
    // 아이템: 피해 %(더한 뒤 한 번), 보스·적이 받는 피해·스킬 피해, 적중 효과(신검 공간격·참마검)
    const boss = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    const hm = this.itemRt.hitMods(this.rng, (c) => skillChance(c, 'success', ['chance'], stats, d.tags));
    dmg *= itemDamageMultiplier(this.itemRt.sums, this.itemRt.extraDamageAll(), boss, source) * hm.mult;
    const space = tags.includes('space') || hm.space;
    if (space) dmg = spaceDamage(enemy.rank, enemy.maxHp, dmg, this.tagRule<SpaceRule>('space'));
    const crit = this.pendingCrit;
    this.pendingCrit = false;
    return this.applyDamage(enemy, corruptedDamage(dmg, enemy.corruption), source, { tags, crit, space });
  }

  /** 계산이 끝난 피해를 넣는다. 환원주의자 등에게 알리고, 죽였으면 true */
  /** fx: 타격(태그·치명·공간격). 없으면 출혈·변질 같은 지속 피해(작은 회색 숫자, 불꽃 없음) */
  private applyDamage(enemy: Enemy, dmg: number, source: string | null = null, fx?: { tags: readonly TagId[]; crit: boolean; space: boolean }): boolean {
    if (enemy.dead) return false;
    // 보스 강화 단계 진입 중 무적
    if (enemy.invuln > 0) return false;
    dmg *= enemy.takenMul;
    const dealt = Math.min(Math.max(0, enemy.hp), dmg);
    const killed = enemy.damage(dmg);
    // 타격감: 피해 숫자, 불꽃·찌그러짐, 근접·치명 히트스톱
    const top = { x: enemy.sprite.x, y: enemy.sprite.y - enemy.radius };
    const bossHit = enemy.rank === 'boss' || enemy.rank === 'hiddenBoss';
    this.juice.damageNumber(top, dmg, damageKind({ crit: fx?.crit, space: fx?.space, dot: !fx }), bossHit);
    if (fx) {
      sfx(fx.crit ? 'crit' : 'hit');
      this.juice.hitSpark({ x: enemy.sprite.x, y: enemy.sprite.y }, fx.tags);
      enemy.squash();
      const hs = this.ctx.data.juice.hitStop;
      if (fx.tags.includes('melee')) this.hitStop.request(hs.melee);
      if (fx.crit) this.hitStop.request(hs.crit);
    }
    for (const o of [...this.skillObjects]) o.onDamageDealt?.(this.host, dealt, enemy);
    // 학파 궁극기: 정해진 스킬의 피해로 데이터 축적
    const ult = this.session.player.ultimate;
    const udef = this.ultimateDef();
    const gain = gaugeFromDamage(udef, source, dealt);
    if (gain > 0) ult.gauge = gainGauge(ult.gauge, udef.gaugeMax, gain);
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

  /** Space를 누르고 있으면 연사. 차지 무기(대검)는 누르는 동안 모았다가 놓을 때 휘두른다 */
  private updateAttack(dt: number, held: boolean, aimAngle: number): void {
    this.fireCooldown -= dt;
    const charge = this.weaponDef().charge;
    if (!charge) {
      if (held && this.fireCooldown <= 0) this.attack(aimAngle, 0);
      return;
    }
    if (held) {
      if (this.fireCooldown <= 0) {
        this.charging = true;
        this.chargeT = Math.min(charge.maxSec, this.chargeT + dt);
      }
    } else if (this.charging) {
      this.attack(aimAngle, this.chargeT / charge.maxSec);
      this.resetCharge();
    }
    this.drawCharge(charge.maxSec);
  }

  private resetCharge(): void {
    this.charging = false;
    this.chargeT = 0;
    this.chargeFx?.clear();
  }

  private drawCharge(maxSec: number): void {
    if (!this.chargeFx) this.chargeFx = this.add.graphics().setDepth(6);
    this.chargeFx.clear();
    if (!this.charging) return;
    const k = this.chargeT / maxSec;
    this.chargeFx.lineStyle(2, k >= 1 ? 0xffd23f : 0xffffff, 0.8).beginPath();
    this.chargeFx.arc(this.player.x, this.player.y, 12, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k, false).strokePath();
  }

  /** chargeRatio: 0~1 (차지 무기만) */
  private attack(aimAngle: number, chargeRatio: number): void {
    const item = this.weaponItem();
    const w = this.weaponDefOf(item.defId);
    const st = this.weaponStatsOf(item);
    const p = this.session.player;
    this.fireCooldown = st.fireIntervalSec;
    // 유니크 고유 효과: 들고 있는 무기의 공격을 센다 (바꾸면 처음부터)
    if (this.sigItem !== item) {
      this.sigItem = item;
      this.sigCount = 0;
    }
    const sig = w.signature && signatureFires(++this.sigCount, w.signature.every) ? w.signature : null;

    if (w.category === 'blade') {
      sfx(weaponSfx(w));
      // 특무 인장: 순간 회피 직후 기본공격 피해 증가
      this.melee(w, st, aimAngle, chargeRatio, sig, this.itemRt.consumeEmpowered());
      return;
    }

    const left = spendEnergy(p.energy, st);
    if (left === null) {
      this.session.energyEmptyAt = this.time.now;
      this.toastThrottled(this.ctx.t('room.energyEmpty'));
      // 에너지가 모자라면 총 대신 주먹으로 친다 (잠긴 방에서 공격 수단이 사라지지 않게)
      const fist = this.fistItem();
      const fistStats = this.weaponStatsOf(fist);
      this.fireCooldown = fistStats.fireIntervalSec;
      const fistDef = this.weaponDefOf(fist.defId);
      sfx(weaponSfx(fistDef));
      this.melee(fistDef, fistStats, aimAngle, 0, null, this.itemRt.consumeEmpowered());
      return;
    }
    const udef = this.ultimateDef();
    p.ultimate.gauge = gainGauge(p.ultimate.gauge, udef.gaugeMax, gaugeFromEnergy(udef, p.energy - left));
    p.energy = left;
    sfx(sig?.kind === 'laser' ? 'shotLaser' : weaponSfx(w));
    const emp = this.itemRt.consumeEmpowered();
    if (sig?.kind === 'laser') {
      this.weaponLaser(w, st.damage * sig.damageMul * emp, st.critChance, aimAngle, sig.length, sig.width);
      return;
    }
    const muzzle = this.muzzle();
    const shotAngle = muzzleAngle(muzzle, this.aimTarget, aimAngle, this.ctx.data.player.muzzleMinTargetPx);
    if (w.pattern.kind === 'homing') {
      this.fireBullet(muzzle, shotAngle, st.projectileSpeed, w.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: st.critChance, homing: w.pattern.turnRate });
      return;
    }
    if (w.pattern.kind === 'lob') {
      // 유탄: 사거리 안 가장 가까운 적(없으면 조준 방향) 자리에 떨어져 터진다. 자해 없음
      const host = this.hostFor('weapon');
      const target = nearestEnemy(host, this.player, w.range);
      const to = target ? { x: target.sprite.x, y: target.sprite.y } : { x: this.player.x + this.aimDir.x * w.range, y: this.player.y + this.aimDir.y * w.range };
      host.addObject(
        new Explosive(host, {
          owner: 'weapon',
          from: muzzle,
          to,
          speed: st.projectileSpeed,
          radius: w.pattern.radius * (1 + this.itemRt.sums.area),
          base: st.damage * emp,
          tags: w.tags,
          sprite: this.ctx.data.weapons.projectile,
        }),
      );
      return;
    }
    for (const shot of gunShots(w, shotAngle, this.rng)) {
      this.fireBullet(muzzle, shot.angle, st.projectileSpeed, shot.range, st.damage * emp, w.tags, null, { pierce: w.pierce ?? 0, crit: st.critChance });
    }
  }

  /** 지팡이 고유 효과: 조준 방향 직선 레이저 (관통, 치명 판정) */
  private weaponLaser(w: WeaponDef, base: number, crit: number, aimAngle: number, length: number, width: number): void {
    const origin = { x: this.player.x, y: this.player.y };
    const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
    const len = length * (1 + this.itemRt.sums.area);
    const enemies = [...this.enemies];
    const idx = lineHits(origin, dir, len, width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
    for (const i of idx) {
      const e = enemies[i]!;
      this.hit(e, this.critRoll(base, crit, { x: e.sprite.x, y: e.sprite.y }), w.tags);
    }
    const g = this.add.graphics().setDepth(6);
    g.lineStyle(width, hexColor(w.color), 0.8).lineBetween(origin.x, origin.y, origin.x + dir.x * len, origin.y + dir.y * len);
    this.time.delayedCall(this.ctx.data.ui.slashFxSec * 1000, () => g.destroy());
  }

  private fireBullet(
    from: Vec2,
    angle: number,
    speed: number,
    range: number,
    base: number,
    tags: readonly TagId[],
    source: string | null = null,
    opts: { pierce: number; crit: number; homing?: number; tint?: string } = { pierce: 0, crit: 0 },
  ): void {
    const proj = this.ctx.data.weapons.projectile;
    const b = this.bullets.create(from.x, from.y, proj.spriteKey) as Phaser.Physics.Arcade.Image;
    fitArt(this.ctx.data, b, proj.size, proj.height ?? proj.size);
    b.setDepth(5);
    b.setData({ base, tags, range, ox: from.x, oy: from.y, source, pierce: opts.pierce, crit: opts.crit, homing: opts.homing ?? 0, hitSet: new Set<Enemy>() });
    if (opts.tint) b.setTint(hexColor(opts.tint));
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  /** 무기를 쥔 손 자리 (그림이 뒤집히면 x도 뒤집고, 조준 방향으로 살짝 내민다) */
  private handPos(): Vec2 {
    const { weaponHand: hand, weaponOffset: off } = this.ctx.data.player;
    return { x: this.player.x + (this.player.flipX ? -hand.x : hand.x) + this.aimDir.x * off, y: this.player.y + hand.y + this.aimDir.y * off };
  }

  /** 탄이 나가는 자리: 무기 끝. 끝이 벽·장애물 너머면 몸 가운데 (벽 뒤로 쏘지 않게) */
  private muzzle(): Vec2 {
    const body = { x: this.player.x, y: this.player.y };
    const rid = this.session.currentRoomId;
    if (rid === null) return body;
    const art = this.ctx.data.art.sprites[this.weaponDef().spriteKey];
    const at = muzzlePoint(this.handPos(), this.aimDir, art ? art.frameWidth * (1 - (art.gripX ?? 0.5)) : 0);
    const node = this.session.map.rooms[rid]!;
    const inside = contains(interiorRect(node, this.m), at.x, at.y);
    return inside && segmentClear(body, at, this.obstacles.get(rid) ?? []) ? at : body;
  }

  /** 회피 입력·잔상·재사용 막대 */
  private updateDodge(dt: number, frame: ActionFrame): void {
    const c = this.ctx.data.player.dodge;
    this.dodge = stepDodge(this.dodge, dt);
    if (frame.pressed.has('dodge') && this.dashLeft <= 0) {
      const started = startDodge(this.dodge.cooldown, frame.move, this.aimDir, c);
      if (started) {
        this.dodge = started;
        this.dodgeGhostIn = 0;
        const school = dodgeConfig(c, this.session.player.advancement).school;
        if (school?.kind === 'blink') this.blink(school, started.vel);
        else {
          sfx('dash');
          if (school?.kind === 'shot') this.dodgeShot(school);
        }
      }
    }
    this.session.dodgeView = { nameKey: dodgeConfig(c, this.session.player.advancement).nameKey, left: this.dodge.cooldown, total: c.cooldownSec };
    if (this.dodge.left > 0) {
      this.dodgeGhostIn -= dt;
      if (this.dodgeGhostIn <= 0) {
        this.dodgeGhostIn = c.ghostEverySec;
        const f = this.player.frame;
        const ghost = this.add.image(this.player.x, this.player.y, this.player.texture.key, f.name).setOrigin(this.player.originX, this.player.originY).setFlipX(this.player.flipX).setAlpha(0.45).setDepth(3).setTint(hexColor(c.barColor));
        this.tweens.add({ targets: ghost, alpha: 0, duration: c.durationSec * 1000, onComplete: () => ghost.destroy() });
      }
    }
    this.dodgeBar ??= this.add.graphics().setDepth(6);
    this.dodgeBar.clear();
    if (this.dodge.cooldown > 0) {
      const w = 14;
      const k = 1 - this.dodge.cooldown / c.cooldownSec;
      const x = this.player.x - w / 2;
      const y = this.player.y + 7;
      this.dodgeBar.fillStyle(0x000000, 0.6).fillRect(x, y, w, 2).fillStyle(hexColor(c.barColor), 1).fillRect(x, y, w * k, 2);
    }
  }

  /** 점멸: 벽을 뚫지 않는 데까지 순간이동하고, 지나간 자리에 번개가 지직거린다 */
  private blink(s: Extract<DodgeSchoolDef, { kind: 'blink' }>, dir: Vec2): void {
    const from = { x: this.player.x, y: this.player.y };
    const r = this.ctx.data.player.size / 2;
    const blocked = (x: number, y: number) =>
      this.physics.overlapRect(x - r, y - r, r * 2, r * 2, false, true).some((b) => {
        const go = b.gameObject;
        return this.walls.contains(go) || this.doorGroup.contains(go);
      });
    const to = blinkTarget(from, dir, s.distancePx, s.stepPx, blocked);
    this.player.setPosition(to.x, to.y);
    (this.player.body as Phaser.Physics.Arcade.Body).reset(to.x, to.y);
    this.dodge = { ...this.dodge, left: 0, invuln: s.invulnSec };
    sfx('blink');
    const color = hexColor(s.boltColor);
    const g = this.add.graphics().setDepth(6);
    const rng = (this.dodgeFxRng ??= Rng.derive(this.ctx.config.seed, 'dodge-fx'));
    const draw = () => {
      g.clear();
      const pts = zigzag(from, to, s.boltSegments, s.boltAmpPx, rng);
      g.lineStyle(3, color, 0.35).strokePoints(pts);
      g.lineStyle(1, 0xffffff, 1).strokePoints(pts);
    };
    draw();
    // 번개 모양을 몇 번 바꿔 지직거린다
    this.time.addEvent({ delay: (s.boltSec * 1000) / 4, repeat: 2, callback: draw });
    this.tweens.add({ targets: g, alpha: 0, delay: s.boltSec * 500, duration: s.boltSec * 500, onComplete: () => g.destroy() });
    this.cameras.main.flash(50, 150, 210, 255);
  }

  /** 진격: 구르는 순간 조준 방향으로 부채꼴 탄 */
  private dodgeShot(s: Extract<DodgeSchoolDef, { kind: 'shot' }>): void {
    const from = { x: this.player.x, y: this.player.y };
    const base = muzzleAngle(from, this.aimTarget, Math.atan2(this.aimDir.y, this.aimDir.x), 0);
    const spread = (s.spreadDeg * Math.PI) / 180;
    for (let i = 0; i < s.shots; i++) {
      const a = s.shots === 1 ? base : base - spread / 2 + (spread * i) / (s.shots - 1);
      this.fireBullet(from, a, s.projectileSpeed, s.range, s.damage, s.tags, 'dodge', { pierce: 0, crit: 0, tint: s.tint });
    }
  }

  /** 적 길 찾기: 곧장 갈 수 있으면 null, 막혔으면 이 방 격자로 돌아가는 방향 */
  private enemyPathDir(from: Vec2, radius: number): Vec2 | null {
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

  /** 보스 체력이 일정 비율 줄 때마다 보스와 플레이어 사이에 에너지 구슬 */
  private updateBossEnergy(): void {
    const d = this.ctx.data;
    for (const e of this.bossControllers.keys()) {
      const ratio = e.hp / e.maxHp;
      const n = bossOrbDrops(this.bossHpSeen.get(e) ?? 1, ratio, d.bosses.energyDrops);
      this.bossHpSeen.set(e, ratio);
      if (n <= 0) continue;
      const x = (e.sprite.x + this.player.x) / 2;
      const y = (e.sprite.y + this.player.y) / 2;
      const pop = d.juice.death.orbPopPx;
      for (let i = 0; i < n; i++) {
        const a = this.rng.range(0, Math.PI * 2);
        const r = this.rng.range(pop[0], pop[1]);
        const pk = new Pickup(this, 'energy', e.sprite.x, e.sprite.y, d.pickups);
        this.tweens.add({ targets: pk.sprite, x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, duration: d.juice.death.orbPopSec * 1000, ease: 'Back.easeOut' });
        this.pickups.push(pk);
      }
    }
  }

  /** 무기 치명 판정 */
  private critRoll(base: number, chance: number, at: Vec2): number {
    const r = rollCrit(this.rng, base, chance, this.ctx.data.weapons.critMultiplier);
    // 치명타는 바로 이어지는 피해의 숫자를 크고 노랗게 (at은 예전 '치명' 글자 자리, 지금은 쓰지 않음)
    void at;
    if (r.crit) this.pendingCrit = true;
    return r.damage;
  }

  /**
   * 칼: 베기(arc) · 찌르기(line, 관통) · 내려찍기(smash, 넉백).
   * sig: 이번 공격에 발동한 유니크 고유 효과(네메아의 종말 = 피해·범위 증가, 공간 가르기 = 공간격) / emp: 피해 배율(특무 인장)
   */
  private melee(w: WeaponDef, st: WeaponStats, aimAngle: number, chargeRatio: number, sig: WeaponSignature | null, emp: number): void {
    const origin = { x: this.player.x, y: this.player.y };
    const dir = { x: Math.cos(aimAngle), y: Math.sin(aimAngle) };
    const big = sig?.kind === 'bigSmash' ? sig : null;
    const dmgMul = (w.charge ? 1 + (w.charge.damageMul - 1) * chargeRatio : 1) * (big ? big.damageMul : 1) * emp;
    const radMul = (w.charge ? 1 + (w.charge.radiusMul - 1) * chargeRatio : 1) * (1 + this.itemRt.sums.area) * (big ? big.radiusMul : 1);
    const tags: readonly TagId[] = sig?.kind === 'space' ? [...w.tags, 'space'] : w.tags;
    if (big) {
      shake(this, 'medium');
      this.floatLabel(origin, this.ctx.t('weapon.sig.bigSmash'), w.color);
    }
    const p = w.pattern;
    const enemies = [...this.enemies];
    const g = this.add.graphics().setDepth(6);
    g.fillStyle(0xffffff, 0.35);
    let targets: Enemy[] = [];
    if (p.kind === 'arc') {
      const radius = p.radius * radMul;
      targets = enemies.filter((e) => inArc(origin, aimAngle, p.arcDeg, radius, e.sprite, e.radius));
      const half = (p.arcDeg * Math.PI) / 360;
      g.slice(origin.x, origin.y, radius, aimAngle - half, aimAngle + half, false).fillPath();
    } else if (p.kind === 'line') {
      const len = p.length * radMul;
      const idx = lineHits(origin, dir, len, p.width / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      targets = idx.map((i) => enemies[i]!);
      g.lineStyle(p.width, 0xffffff, 0.45).lineBetween(origin.x, origin.y, origin.x + dir.x * len, origin.y + dir.y * len);
    } else if (p.kind === 'smash') {
      const c = { x: origin.x + dir.x * p.reach, y: origin.y + dir.y * p.reach };
      const r = p.radius * radMul;
      targets = enemies.filter((e) => Math.hypot(e.sprite.x - c.x, e.sprite.y - c.y) <= r + e.radius);
      g.fillCircle(c.x, c.y, r);
    }
    for (const e of targets) {
      const at = { x: e.sprite.x, y: e.sprite.y };
      this.hit(e, this.critRoll(st.damage * dmgMul, st.critChance, at), tags);
      if (w.knockback && !e.dead) {
        const d = Math.hypot(at.x - origin.x, at.y - origin.y) || 1;
        e.knockback({ x: (at.x - origin.x) / d, y: (at.y - origin.y) / d }, w.knockback.distance, w.knockback.sec);
      }
    }
    // 탄 베기 (베기 무기만)
    if (p.kind === 'arc') {
      const eb = this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[];
      const cut = projectilesCut(
        w,
        origin,
        aimAngle,
        eb.map((b) => ({ x: b.x, y: b.y, cuttable: b.getData('cuttable') !== false })),
      );
      for (const i of cut) eb[i]?.destroy();
    }
    this.time.delayedCall(this.ctx.data.ui.slashFxSec * 1000, () => g.destroy());
  }

  private onBulletHit(b: Phaser.Physics.Arcade.Image, sprite: Phaser.Physics.Arcade.Image): void {
    const enemy = sprite.getData('enemy') as Enemy | undefined;
    if (!b.active || !enemy || enemy.dead) return;
    // 관통탄: 같은 적은 한 번만
    const hitSet = b.getData('hitSet') as Set<Enemy> | undefined;
    if (hitSet?.has(enemy)) return;
    const tags = b.getData('tags') as TagId[];
    const source = (b.getData('source') as string | null | undefined) ?? null;
    const base = this.critRoll(b.getData('base') as number, (b.getData('crit') as number | undefined) ?? 0, enemy.sprite);
    const pierce = (b.getData('pierce') as number | undefined) ?? 0;
    if (pierce > 0) {
      b.setData('pierce', pierce - 1);
      hitSet?.add(enemy);
    } else {
      b.destroy();
    }
    this.hit(enemy, base, tags, source);
  }

  private onEnemyKilled(e: Enemy): void {
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
    if (this.bossControllers.has(e)) this.startBossKill({ x, y });
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
      const chestRng = Rng.derive(this.ctx.config.seed, `champion-chest-${stage.chapter}-${stage.stage}-${this.lootSeq++}`);
      if (chestRng.chance(d.waves.champions.itemChestChance)) this.addChest('item', x, y, d.items.treasureWeights);
    }
    // 궁극기 게이지는 적 처치로 충전
    const ult = this.session.player.ultimate;
    if (this.ultimateDef().gauge.kind === 'kill') ult.gauge = gainGauge(ult.gauge, this.ultimateDef().gaugeMax, d.ultimates.gaugePerKill[e.rank]);
    // 첨탑: 원 안에서 잡으면 충전 (결과는 다음 프레임에 처리)
    const sp = roomId === undefined ? undefined : this.spires.find((x) => x.roomId === roomId);
    if (sp) {
      for (const ev of sp.state.onKill(e.rank, inSpireCircle(x - sp.x, y - sp.y, sp.radius, e.radius))) this.spireEvents.push({ sp, e: ev });
    }
    this.removeEnemy(e);
    if (roomId !== undefined) this.rooms.get(roomId)?.enemyKilled();
    for (const o of [...this.skillObjects]) o.onKill?.(this.host, e);
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
        if (Math.hypot(o.sprite.x - x, o.sprite.y - y) <= c.burstRadius + o.radius) this.hit(o, c.burstDamage, c.burstTags);
      }
    }
  }

  /** 집정관 흡수: 같은 방의 살아 있는 집정관 중 가장 가까운 하나가 죽은 적의 최대 체력만큼. 흡수했으면 true */
  private archonAbsorb(dead: Enemy, roomId: number | undefined): boolean {
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
    if (this.hurtPlayer(enemy.def.contactDamage * enemy.damageMul, enemy)) enemy.lastContactAt = now;
  }

  /** 피해를 받았으면 true */
  /** 피해를 받았으면 true. attacker: 때린 적(반사용, 모르면 null) */
  private hurtPlayer(amount: number, attacker: Enemy | null = null): boolean {
    if (this.invuln > 0 || this.dodge.invuln > 0 || this.ctx.debugFlags.invincible || this.session.outcome || this.modal) return false;
    // 특무 인장: 피해를 받기 직전 순간이동으로 피한다 (피격 무적과 같은 시간)
    if (this.itemRt.tryDodge()) {
      this.invuln = this.ctx.data.player.hurtInvulnSec;
      return true;
    }
    // 마기역장: 공격을 막고 잠깐 무적
    const absorbed = absorbHit(this.shield);
    if (absorbed.blocked) {
      this.shield = absorbed.shield;
      this.invuln = this.shieldOpts?.blockInvulnSec ?? 0;
      this.cameras.main.flash(60, 140, 170, 210);
      return true;
    }
    const p = this.session.player;
    const taken = damageTaken(amount, this.effStats(), this.ctx.data.stats) * (1 - this.playerMods().damageReduction) * (1 - this.itemRt.sums.damageTaken - this.itemRt.guard());
    const v = takeDamage(p, taken);
    p.hp = v.hp;
    p.shield = v.shield;
    this.invuln = this.ctx.data.player.hurtInvulnSec;
    shake(this, 'light');
    this.juice.hurt();
    sfx('playerHurt');
    // 피격에 반응하는 스킬 오브젝트 (반물질포 충전 취소 등)
    for (const o of [...this.skillObjects]) if (o.onPlayerHurt && !o.onPlayerHurt(this.host)) this.removeObject(o);
    // 아이템: 피격 효과 → 낮은 체력 회복 → 부활
    this.itemRt.onHurt(taken, attacker);
    if (p.hp > 0) this.itemRt.tryHeal();
    else if (this.itemRt.tryRevive()) this.cameras.main.flash(200, 255, 255, 255);
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

  private updateBullets(dt: number): void {
    for (const b of this.bullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const dist = Math.hypot(b.x - (b.getData('ox') as number), b.y - (b.getData('oy') as number));
      if (dist > (b.getData('range') as number)) {
        b.destroy();
        continue;
      }
      // 유도탄(지팡이): 남은 사거리 안 가장 가까운 적 쪽으로 휜다
      const turn = b.getData('homing') as number;
      if (turn > 0) {
        const t = nearestEnemy(this.hostFor('weapon'), b, (b.getData('range') as number) - dist);
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
  private absorbEnemyBullets(at: Vec2, radius: number): number {
    let n = 0;
    for (const b of [...(this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[])]) {
      if (b.getData('refractable') === false || Math.hypot(b.x - at.x, b.y - at.y) > radius) continue;
      b.destroy();
      n++;
    }
    return n;
  }

  /** 집행자 밧줄: 플레이어를 to까지 끌어당긴다 (그동안 입력 무시). 걸리는 시간 */
  private pullPlayer(to: Vec2, speed: number): number {
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
  private fireEnemyBullet(from: Vec2, angle: number, speed: number, range: number, damage: number, refractable: boolean, homing = 0): void {
    const ep = this.ctx.data.enemies.projectile;
    const b = this.enemyBullets.create(from.x, from.y, ep.spriteKey) as Phaser.Physics.Arcade.Image;
    fitArt(this.ctx.data, b, ep.size, ep.height ?? ep.size);
    b.setDepth(5);
    b.setData({ damage, refractable, cuttable: refractable, range, ox: from.x, oy: from.y, homing });
    // 굴절 불가 탄은 붉게, 유도 미사일은 크게
    if (!refractable) b.setTint(0xff2a2a);
    if (homing > 0) b.setScale(1.5);
    b.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  /** 보스방 경고: 화면 가운데 WARNING + 보스 이름 */
  private showBossWarning(name: string): void {
    sfx('warning');
    const cam = this.cameras.main;
    const sec = this.ctx.data.bosses.bannerSec;
    const style = { fontFamily: 'sans-serif', color: '#ff4a4a', stroke: '#000000', strokeThickness: 3 };
    const head = this.add.text(cam.width / 2, cam.height / 2 - 10, this.ctx.t('boss.warning'), { ...style, fontSize: '20px' });
    const sub = this.add.text(cam.width / 2, cam.height / 2 + 12, name, { ...style, fontSize: '12px', color: '#ffffff' });
    for (const t of [head, sub]) {
      t.setOrigin(0.5).setScrollFactor(0).setDepth(20);
      this.tweens.add({ targets: t, alpha: 0.3, duration: 250, yoyo: true, repeat: Math.max(0, Math.round((sec * 1000) / 500) - 1) });
      this.time.delayedCall(sec * 1000, () => t.destroy());
    }
    shake(this, 'rumble', sec * 1000);
  }

  private updatePickups(dt: number): void {
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

  /** source(스킬 id, 'magiTurret.shell'처럼 하위 오브젝트면 앞부분)를 단 SkillHost */
  private hostFor(owner: string | null): SkillHost {
    const source = owner ? owner.split('.')[0]! : null;
    const key = source ?? '';
    let h = this.hosts.get(key);
    if (!h) {
      h = this.makeHost(source);
      this.hosts.set(key, h);
    }
    return h;
  }

  private makeHost(source: string | null): SkillHost {
    const ctx = this.ctx;
    return {
      scene: this,
      ctx,
      rng: this.rng,
      playerPos: () => ({ x: this.player.x, y: this.player.y }),
      aimDir: () => this.aimDir,
      enemies: () => this.enemies.filter((e) => !e.dead),
      stats: () => this.effStats(),
      area: (r) => this.area(r),
      hit: (e, base, tags) => this.hit(e, base, tags, source),
      hitTrue: (e, amount, space) => {
        if (e.dead) return false;
        const dmg = space ? spaceDamage(e.rank, e.maxHp, amount, this.tagRule<SpaceRule>('space')) : amount;
        return this.applyDamage(e, dmg, source);
      },
      hurtSelf: (amount) => {
        this.hurtPlayer(amount);
      },
      greatSuccess: () => {
        const ult = this.session.player.ultimate;
        const udef = this.ultimateDef();
        ult.gauge = gainGauge(ult.gauge, udef.gaugeMax, gaugeFromGreatSuccess(udef));
      },
      chargeTime: (sec, tags) => chargeTime(sec, tags, this.effStats(), ctx.data.tags),
      buffDuration: (sec, tags) => buffDuration(sec, tags, this.effStats(), ctx.data.tags) * (tags.includes('buff') ? 1 + this.itemRt.sums.buffDuration : 1),
      setShield: (shield, opts) => {
        this.shield = shield;
        this.shieldOpts = opts;
      },
      // 아크룩스(아크로): 대성공 +20%p, 상한 무시
      chance: (base, capKey, tags) =>
        Math.min(1, skillChance(base, capKey, tags, this.effStats(), ctx.data.tags) + (capKey === 'greatSuccess' ? this.itemRt.greatSuccess().bonus : 0)),
      noGreatFailure: () => this.itemRt.greatSuccess().noFailure,
      corrupt: (e, state) => {
        if (!e.dead) e.corruption = applyCorruption(e.corruption, state);
      },
      defeat: (e) => {
        if (e.dead) return;
        e.corruption = null;
        e.bleed = null;
        e.converted = true;
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
        sfx('dash');
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
        const perStack = calcDamage({ baseDamage: base, tags }, this.effStats(), ctx.data.tags, this.rangeBonus());
        e.bleed = applyBleed(e.bleed, perStack, stacks, this.tagRule<BleedRule>('bleed'));
      },
      fireBullet: (from, angle, speed, range, base, tags) => this.fireBullet(from, angle, speed, range, base, tags, source),
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
    impl.activate(this.hostFor(id), { def, owned, values: skillValues(def, owned).values });
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
    // 구르는 동안에는 탄이 몸을 지나간다
    if (!b.active || this.dodge.invuln > 0) return;
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
    out.push(...this.itemRt.buffs());
    return out;
  }

  /** 스킬 범위 보정 (마기력) */
  private area(radius: number): number {
    const d = this.ctx.data;
    return radius * (1 + statEffect('skillArea', this.effStats(), d.stats)) * (1 + this.itemRt.sums.area);
  }

  /** 기환의 팔: 힘·마기력 범위 보정 (마기력 범위 규칙을 힘에도 같은 식으로) */
  private burstArea(radius: number): number {
    const d = this.ctx.data;
    const st = this.effStats();
    const byStr = statEffect('skillArea', { ...st, magiPower: st.strength }, d.stats);
    return radius * (1 + statEffect('skillArea', st, d.stats) + byStr) * (1 + this.itemRt.sums.area);
  }

  /** 최대 체력 = 기본 + 견고(아이템 스탯 포함) + 아이템. 늘면 그만큼 현재 체력도 채운다 */
  private syncMaxHp(): void {
    const d = this.ctx.data;
    const p = this.session.player;
    // 기본 체력(+영구 강화) + 견고 + 아이템
    const target = maxHpFor(d.player.maxHp + p.meta.maxHp, this.effStats(), d.stats) + this.itemRt.sums.maxHp;
    if (target === p.maxHp) return;
    if (target > p.maxHp) p.hp += target - p.maxHp;
    p.maxHp = target;
    p.hp = Math.min(p.hp, p.maxHp);
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
    if (impl.cast(this.hostFor(id), { def, owned, values: sv.values })) {
      p.cooldowns = { ...p.cooldowns, [id]: sv.cooldownSec };
      sfx('skill');
    }
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
    const values = ult.awakened && def.awakening ? { ...def.values, ...def.awakening.values } : { ...def.values };
    if (!impl.cast(this.hostFor(def.id), { def, awakened: ult.awakened, values })) return;
    ult.gauge = 0;
    sfx('ultimate');
    this.itemRt.onUltimate();
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
      iconKey: null,
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
        iconKey: artKeys.skillIcon(id),
      };
    };
    const ult = this.ultimateDef();
    this.session.buffs = this.buffViews();
    this.session.effStats = this.effStats();
    this.session.skillView = [
      ...p.loadout.active.map((id) => slot(id, true)),
      {
        ...empty,
        skillId: ult.id,
        label: t(p.ultimate.awakened && ult.awakening ? ult.awakening.shortKey : ult.shortKey),
        awakened: p.ultimate.awakened,
        gauge: p.ultimate.gauge / ult.gaugeMax,
        usable: p.ultimate.gauge >= ult.gaugeMax,
        color: ult.color,
        iconKey: artKeys.ultimateIcon(ult.id),
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
    } else if (this.modal === 'pause') {
      if (frame.pressed.has('pause')) this.setModal(null);
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
    this.currentOffer = next;
    this.rerolled = false;
    this.showCards();
  }

  /** 지금 카드창(currentOffer)의 카드를 뽑아 띄운다. 리롤도 이걸 다시 부른다 */
  private showCards(): void {
    const next = this.currentOffer!;
    const d = this.ctx.data;
    const p = this.session.player;
    const { stage } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `cards-${stage.chapter}-${stage.stage}-${this.cardSeq++}`);
    if (next.kind === 'school') {
      // 학파 선택 카드(전직 동점): 리롤 없음
      const cards = (next.schools ?? []).map((school) => ({ kind: 'school' as const, school }));
      this.currentCards = cards;
      this.setModal('cards');
      bus.emit('cardsShow', { titleKey: 'card.title.school', cards, reroll: null });
      return;
    }
    if (next.kind === 'item') {
      // 아이템 선택 카드(첨탑): 미리 뽑아 둔 아이템, 리롤 없음
      const cards = (next.items ?? []).map((itemId) => ({ kind: 'item' as const, itemId }));
      this.currentCards = cards;
      this.setModal('cards');
      bus.emit('cardsShow', { titleKey: 'card.title.spire', cards, reroll: null });
      return;
    }
    const cards =
      next.kind === 'skill'
        ? drawSkillCards(rng, p.loadout, p.stats, d.skills, d.cards, (id) => isSkillImplemented(id) && skillAllowed(findSkill(d.skills, id), p.advancement))
        : drawStatCards(rng, d.cards.cardCount, d.cards);
    this.currentCards = cards;
    this.setModal('cards');
    const cost = d.cards.rerollCost;
    bus.emit('cardsShow', {
      titleKey: next.boss ? 'card.title.boss' : `card.title.${next.kind}`,
      cards,
      reroll: { cost, enabled: !this.rerolled && Math.floor(p.coins) >= cost, used: this.rerolled },
    });
  }

  /** 카드창마다 1회, 코인으로 다시 뽑기 */
  private rerollCards(): void {
    const p = this.session.player;
    const cost = this.ctx.data.cards.rerollCost;
    if (this.modal !== 'cards' || this.rerolled || !this.currentOffer || this.currentOffer.kind === 'item' || this.currentOffer.kind === 'school' || Math.floor(p.coins) < cost) return;
    p.coins -= cost;
    this.rerolled = true;
    this.showCards();
  }

  private pickCard(index: number): void {
    const card = this.currentCards?.[index];
    if (!card || this.modal !== 'cards') return;
    sfx('cardPick');
    if (card.kind === 'item') {
      this.giveItem(card.itemId);
      this.openNextCards();
      return;
    }
    if (card.kind === 'school') {
      const then = this.pendingAdvance ?? (() => {});
      this.pendingAdvance = null;
      this.advanceTo(card.school, () => {
        this.openNextCards();
        then();
      });
      return;
    }
    const d = this.ctx.data;
    const t = this.ctx.t;
    const before = { hp: this.session.player.hp, maxHp: this.session.player.maxHp };
    const r = applyCard(this.session.player, card, { skills: d.skills, stats: d.stats, baseMaxHp: d.player.maxHp });
    this.session.player = { ...r.holder, ...before };
    this.syncMaxHp();
    if (card.kind === 'stat') {
      bus.emit('toast', { text: t('skillMsg.statUp', { stat: t(`stat.${card.stat}`), amount: card.amount }) });
    } else {
      const def = findSkill(d.skills, card.skillId);
      const owned = r.holder.loadout.owned[card.skillId]!;
      const skill = t(def.nameKey);
      if (card.kind === 'skillNew') bus.emit('toast', { text: t('skillMsg.acquired', { skill }) });
      else if (card.kind === 'skillLevelUp') bus.emit('toast', { text: t('skillMsg.levelUp', { skill, level: owned.level }) });
      if (r.stored) bus.emit('storedNotice', { skillId: card.skillId });
      if (card.kind === 'awakening') {
        // 각성: 컷인 → 설명창, 궁극기 각성 조건을 채웠으면 이어서
        const cuts = [skillAwakeningCut(this.ctx, card.skillId, r.holder.stats)];
        const u = this.checkUltimateAwakening();
        if (u) cuts.push(u);
        this.playCutscenes(cuts, () => this.openNextCards());
        return;
      }
    }
    this.openNextCards();
  }

  // ---------- 연출 ----------

  /** 컷인 → 설명창을 차례로 보여 주고, 다 넘기면 then */
  private playCutscenes(list: Cutscene[], then: () => void): void {
    if (list.length === 0) {
      then();
      return;
    }
    this.cutQueue = [...list];
    this.afterCuts = then;
    this.showNextCut();
  }

  private showNextCut(): void {
    const next = this.cutQueue.shift();
    if (!next) {
      const f = this.afterCuts;
      this.afterCuts = null;
      if (this.modal === 'cutscene') this.setModal(null);
      f?.();
      return;
    }
    // 현재의 기억: 처음 본 컷씬은 다시보기용으로 저장
    const save = this.ctx.save;
    if (registerCutscene(save.data, next.id, next.cut, next.pages)) {
      this.session.player.record.newCutscenes.push(next.id);
      save.write();
    }
    this.setModal('cutscene');
    sfx('awaken');
    bus.emit('cutsceneShow', next);
  }

  // ---------- 미모사 제미니 ----------

  /** 미니 대사: 이벤트에 맞는 대사를 골라 순서에 넣는다 (같은 런 반복 없음, 빈 대사는 건너뜀). 복선 대사는 현재의 기억에 */
  private say(event: GeminiEventId, arg?: string): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const rng = Rng.derive(this.ctx.config.seed, `gemini-${event}-${arg ?? ''}-${p.geminiSaid.length}`);
    const pick = pickMini(d.gemini, event, arg, new Set(p.geminiSaid), rng, d.text);
    if (!pick) return;
    p.geminiSaid = [...p.geminiSaid, ...saidKeys(event, arg, pick)];
    this.mini.push(
      pick.lines.map((k) => ({ text: this.ctx.t(k), mood: pick.def.mood })),
      pick.def.priority,
    );
    if (pick.def.record && registerGemini(this.ctx.save.data, `gemini.${pick.def.id}`, pick.lines)) this.ctx.save.write();
  }

  /** 일반 스토리 대화: 게임을 멈추고 띄운 뒤 then. 정해진 대화가 없거나 내용이 비어 있으면 바로 then */
  private playStory(event: GeminiEventId, arg: string | undefined, then: () => void): void {
    const d = this.ctx.data;
    const story = storyFor(d.gemini, event, arg);
    if (!story || !hasLines(story.lines, d.text)) {
      then();
      return;
    }
    if (registerGemini(this.ctx.save.data, `gemini.${story.id}`, story.lines)) this.ctx.save.write();
    this.storyThen = then;
    this.setModal('story');
    bus.emit('storyShow', { lines: story.lines.map((k) => this.ctx.t(k)) });
  }

  private finishStory(): void {
    if (this.modal !== 'story') return;
    this.setModal(null);
    const f = this.storyThen;
    this.storyThen = null;
    f?.();
  }

  /** 자기 학파 각성 2개면 궁극기를 자동 각성한다. 이번에 각성했으면 연출을 돌려준다 */
  private checkUltimateAwakening(): Cutscene | null {
    const d = this.ctx.data;
    const p = this.session.player;
    const def = this.ultimateDef();
    if (p.ultimate.awakened || !def.awakening || !def.school || p.advancement !== def.school) return null;
    if (!ultimateAwakeningReady(p.loadout, d.skills, def.school, d.ultimates.awakeningNeed)) return null;
    p.ultimate.awakened = true;
    const ids = Object.entries(p.loadout.owned)
      .filter(([id, o]) => o.awakened && findSkill(d.skills, id).school === def.school)
      .sort((a, b) => a[1].order - b[1].order)
      .map(([id]) => id);
    return ultimateAwakeningCut(this.ctx, def, ids, d.ultimates.awakeningNeed);
  }

  // ---------- 전직 ----------

  /** 보스방 카드 뒤: 챕터1 마지막 보스면 전직, 그다음 포털 */
  private afterBossRoom(node: RoomNode): void {
    const d = this.ctx.data;
    const { stage } = this.session;
    const last = stage.stage === d.mapgen.stagesPerChapter && stage.chapter === d.jobs.advanceAfterChapter;
    // 보스 처치: 무기 상자 확정 (포털 옆)
    const c = roomCenter(node, this.m);
    const weights = d.loot.weaponChest[String(stage.stage)];
    const bossId = d.bosses.bosses.find((b) => b.chapter === stage.chapter && b.stage === stage.stage)?.id;
    const bossItemDef = d.items.items.find((x) => x.pool === 'boss' && x.bossId === bossId && !this.session.player.itemsObtained.includes(x.id));
    const itemRng = Rng.derive(this.ctx.config.seed, `boss-item-${stage.chapter}-${stage.stage}`);
    const bossItem = bossItemDef && (bossItemDef.dropChance === undefined || itemRng.chance(bossItemDef.dropChance)) ? bossItemDef : undefined;
    const reward = () => {
      this.addPortal(node);
      if (weights) this.addChest('weapon', c.x - 40, c.y, weights);
      // 보스 전용 아이템 확정 (무기 상자와 별도)
      if (bossItem) this.addChest('item', c.x + 40, c.y, {}, bossItem.id);
    };
    if (last && this.session.player.advancement === null) this.advance(reward);
    else reward();
  }

  /** 계열 판정. 동점이면 학파 선택 카드(원본 규칙: 플레이어가 직접 고른다) */
  private advance(then: () => void): void {
    const p = this.session.player;
    const job = this.ctx.data.jobs.jobs.find((j) => j.id === p.job)!;
    const order = job.advancements.map((a) => a.id as SchoolId);
    const school = judgeSchool(p.schoolPicks, order);
    if (school) {
      this.advanceTo(school, then);
      return;
    }
    this.pendingAdvance = then;
    this.queueOffers([{ kind: 'school', boss: false, schools: topSchools(p.schoolPicks, order) }]);
  }

  /** 스킬 변환 → 궁극기 교체 → 연출 */
  private advanceTo(school: SchoolId, then: () => void): void {
    const d = this.ctx.data;
    let p = this.session.player;
    const job = d.jobs.jobs.find((j) => j.id === p.job)!;
    const adv = job.advancements.find((a) => a.id === school)!;
    const r = convertSkills(Rng.derive(this.ctx.config.seed, 'advancement'), p.loadout, p.stats, d.skills, school, d.jobs.conversionStatAmount);
    p = { ...p, loadout: r.loadout };
    // 스탯 포인트는 견고(최대 체력)까지 반영되게 하나씩 더한다
    const before = { hp: p.hp, maxHp: p.maxHp };
    for (const s of r.log.stats) p = addStat(p, s.stat, s.amount, d.player.maxHp, d.stats);
    p = { ...p, ...before };
    const removed = new Set(r.log.removed.map((x) => x.skillId));
    p.cooldowns = Object.fromEntries(Object.entries(p.cooldowns).filter(([id]) => !removed.has(id)));
    for (const o of this.skillObjects.filter((x) => removed.has(x.owner.split('.')[0]!))) this.removeObject(o);
    const fromUlt = this.ultimateDef();
    p.ultimate = { id: adv.ultimate!, gauge: 0, awakened: false };
    p.advancement = school;
    p.advancementLog = r.log;
    this.session.player = p;
    this.applyPlayerArt();
    const cuts = [advancementCut(this.ctx, { jobNameKey: job.nameKey, adv, picks: p.schoolPicks, fromUlt, toUlt: this.ultimateDef(), log: r.log })];
    const u = this.checkUltimateAwakening();
    if (u) cuts.push(u);
    this.refreshSkillView();
    bus.emit('inventoryChanged', {});
    this.playCutscenes(cuts, () => {
      this.say('advancement', school);
      then();
    });
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

  private nearest<T extends { x: number; y: number }>(list: readonly T[], radius: number): T | null {
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

  private nearChest(): Chest | null {
    return this.nearest(
      this.chests.filter((c) => !c.opened),
      this.ctx.data.loot.chest.openRadius,
    );
  }

  private nearStand(): MerchantStand | null {
    return this.nearest(
      this.stands.filter((s) => !s.stock.sold),
      this.ctx.data.pickups.interactRadius,
    );
  }

  /** 무기 이름 (일반이 아니면 등급을 앞에) */
  private weaponName(item: WeaponItem): string {
    const t = this.ctx.t;
    const name = t(this.weaponDefOf(item.defId).nameKey);
    return item.grade === 'common' ? name : `${t(`grade.${item.grade}`)} ${name}`;
  }

  private gradeColor(grade: GradeId): string {
    return this.ctx.data.groupMultipliers.grades.find((g) => g.id === grade)?.color ?? '#ffffff';
  }

  /** 바닥에 무기를 놓는다 (상자·드롭·버린 무기) */
  private dropWeapon(item: WeaponItem, x: number, y: number): void {
    const def = this.weaponDefOf(item.defId);
    this.floorWeapons.push(new FloorWeapon(this, item, def.spriteKey, x, y, item.grade === 'common' ? null : this.gradeColor(item.grade)));
  }

  /** 결산 기록: 처치·엘리트·보스·히든보스, 보스는 과거의 기억 조각 판정 (분신 등 소환된 적은 세지 않는다) */
  private recordKill(e: Enemy): void {
    if (e.def.summon || e.noReward) return;
    const r = this.session.player.record;
    r.kills++;
    if (e.elite) r.eliteKills++;
    const { stage } = this.session;
    let shardKind: 'boss' | 'hiddenBoss' | null = null;
    if (e.rank === 'boss' && this.ctx.data.bosses.bosses.some((b) => b.id === e.def.id)) {
      r.bossKills.push({ id: e.def.id, stage: stage.stage });
      this.say('bossKill', e.def.id);
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

  /** 인벤토리에서 무기 버리기: 발밑에 떨어뜨린다 (마지막 무기를 버리면 맨손) */
  private dropFromSlot(slot: 0 | 1): void {
    const p = this.session.player;
    const r = dropWeaponAt(p.weapons, slot);
    if (!r.dropped) return;
    p.weapons = r.slots;
    this.dropWeapon(r.dropped, this.player.x, this.player.y + 10);
    this.fireCooldown = 0;
    this.resetCharge();
    bus.emit('toast', { text: this.ctx.t('inventory.dropped', { weapon: this.weaponName(r.dropped) }) });
    bus.emit('inventoryChanged', {});
  }

  /** 손에 든다. 슬롯이 차 있으면 들고 있던 무기를 그 자리에 버린다 */
  private takeWeapon(item: WeaponItem, x: number, y: number): void {
    const p = this.session.player;
    const { slots, dropped } = pickUpWeapon(p.weapons, item);
    p.weapons = slots;
    if (dropped) this.dropWeapon(dropped, x, y);
    this.fireCooldown = 0;
    this.resetCharge();
  }

  private rollWeaponItem(weights: Partial<Record<GradeId, number>>, label: string): WeaponItem {
    const d = this.ctx.data;
    const rng = Rng.derive(this.ctx.config.seed, `${label}-${this.session.stage.chapter}-${this.session.stage.stage}-${this.lootSeq++}`);
    const grade = rollGrade(rng, weights, d.loot.mythicChance);
    return rollWeapon(rng, grade, d.weapons.weapons, d.weapons.options, d.groupMultipliers, d.loot.uniqueWeaponFallback);
  }

  private interact(): void {
    const t = this.ctx.t;
    const fw = this.nearestFloorWeapon();
    if (fw) {
      this.floorWeapons = this.floorWeapons.filter((x) => x !== fw);
      const { x, y } = fw;
      fw.destroy();
      this.takeWeapon(fw.item, x, y);
      bus.emit('toast', { text: t('room.pickedUp', { weapon: this.weaponName(fw.item) }) });
      return;
    }
    const chest = this.nearChest();
    if (chest) {
      this.openChest(chest);
      return;
    }
    const stand = this.nearStand();
    if (stand) {
      const p = this.session.player;
      if (!canBuy(p.coins, stand.stock)) {
        this.toastThrottled(t('merchant.noCoins'));
        return;
      }
      p.coins -= stand.stock.price;
      stand.markSold(t('merchant.sold'));
      this.takeWeapon(stand.stock.weapon, stand.x, stand.y + 14);
      bus.emit('toast', { text: t('merchant.bought', { weapon: this.weaponName(stand.stock.weapon) }) });
      return;
    }
    const vending = this.nearVending();
    if (vending) {
      this.buyPotion(vending);
      return;
    }
    if (this.nearPortal()) this.nextStage();
  }

  private openChest(chest: Chest): void {
    chest.open();
    if (chest.kind === 'weapon') {
      // 히든보스 전용 무기는 정해진 유니크 (무작위 옵션 없음)
      const item = chest.fixedItem ? plainWeapon(this.weaponDefOf(chest.fixedItem)) : this.rollWeaponItem(chest.weights, 'chest');
      this.dropWeapon(item, chest.x, chest.y + 14);
      return;
    }
    const d = this.ctx.data;
    const p = this.session.player;
    let id = chest.fixedItem;
    if (!id) {
      const { stage } = this.session;
      const rng = Rng.derive(this.ctx.config.seed, `item-${stage.chapter}-${stage.stage}-${this.lootSeq++}`);
      const weights = effectiveWeights(chest.weights, stage.chapter, d.items.chapterCommonShift, p.lootShift);
      id = rollItem(rng, weights, d.loot.mythicChance, d.items, new Set(p.itemsObtained)) ?? undefined;
    }
    if (id) this.giveItem(id);
  }

  /** 아이템 획득: 확률 이전 → 세트 합성 → 획득 카드 */
  private giveItem(id: string): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const def = d.items.items.find((x) => x.id === id);
    if (!def || p.itemsObtained.includes(id)) return;
    p.items = [...p.items, id];
    p.itemsObtained = [...p.itemsObtained, id];
    if (def.pool === 'normal') p.lootShift = transferWeight(p.lootShift, def.grade, d.items.transferPerPickup);
    this.itemGets.push({ itemId: id, set: false });
    // 세트: 재료가 모이면 자동 합성, 재료 효과는 사라지고 다시 나오지 않는다
    const set = readySet(new Set(p.items), new Set(p.itemsObtained), d.items.sets);
    if (set) {
      p.items = [...p.items.filter((x) => !set.materials.includes(x)), set.result];
      p.itemsObtained = [...p.itemsObtained, set.result];
      this.itemGets.push({ itemId: set.result, set: true });
    }
    this.itemRt.refresh();
  }

  private addChest(kind: ChestKind, x: number, y: number, weights: Partial<Record<GradeId, number>>, fixedItem?: string): void {
    const ref = kind === 'weapon' ? this.ctx.data.loot.chest.weapon : this.ctx.data.loot.chest.item;
    this.chests.push(new Chest(this, kind, ref, x, y, weights, fixedItem));
  }

  // ---------- 조우 칸 ----------

  /** 조우 칸 안쪽에 들어선 순간 코어가 열리며 유형이 정해진다 */
  private resolveEncounter(roomId: number): void {
    const d = this.ctx.data;
    const { map, stage } = this.session;
    const node = map.rooms[roomId]!;
    const rng = Rng.derive(this.ctx.config.seed, `encounter-${stage.chapter}-${stage.stage}-${roomId}`);
    const met = this.session.player.hiddenBossesMet;
    const kind = this.forcedEncounter ?? rollEncounter(rng, d.loot.encounter.weights, encounterKinds(IMPLEMENTED_ENCOUNTERS, d.bosses.hiddenBosses, met));
    this.forcedEncounter = null;
    this.session.encounters.set(roomId, kind);
    const c = roomCenter(node, this.m);
    for (const core of this.cores.filter((x) => x.roomId === roomId)) {
      this.tweens.add({ targets: core.sprite, alpha: 0, scale: 1.6, duration: 300, onComplete: () => core.sprite.destroy() });
    }
    this.cores = this.cores.filter((x) => x.roomId !== roomId);
    bus.emit('toast', { text: this.ctx.t(`encounter.${kind}`) });

    if (kind === 'treasure') {
      this.addChest('item', c.x, c.y, d.items.treasureWeights);
    } else if (kind === 'merchant') {
      const stock = merchantStock(rng, d.loot, d.weapons.weapons, d.weapons.options, d.groupMultipliers);
      stock.forEach((s, i) => {
        const x = c.x + (i - (stock.length - 1) / 2) * d.loot.standSpacing;
        const def = this.weaponDefOf(s.weapon.defId);
        const label = `${this.weaponName(s.weapon)}\n${this.ctx.t('merchant.price', { price: s.price })}`;
        this.stands.push(new MerchantStand(this, s, d.loot.merchantStand, def.spriteKey, x, c.y, label, this.gradeColor(s.weapon.grade)));
      });
    } else if (kind === 'raid') {
      // 전투 칸보다 웨이브·적 수가 많고, 웨이브마다 엘리트 2마리
      const r = d.loot.raid;
      const waves = planCombatWaves(rng, map.chapter, r.waves, d.waves).map((w) => {
        const n = Math.round(w.length * r.sizeMul);
        return Array.from({ length: n }, (_, i) => w[i % w.length]!);
      });
      const state = new RoomState('encounterRoom', waves, d.waves.waveDelaySec);
      this.rooms.set(roomId, state);
      this.raidRooms.add(roomId);
      this.handleRoomEvents(roomId, state.enter());
    } else if (kind === 'hiddenBoss') {
      // 경고 없이 바로 보스전: 아직 안 나온 히든보스 중 하나 (디버그 지정이면 그것)
      const p = this.session.player;
      const forced = d.bosses.hiddenBosses.find((h) => h.id === this.forcedHiddenBoss);
      this.forcedHiddenBoss = null;
      const hb = forced ?? pickHiddenBoss(rng, d.bosses.hiddenBosses, p.hiddenBossesMet) ?? rng.pick(d.bosses.hiddenBosses);
      if (!p.hiddenBossesMet.includes(hb.id)) p.hiddenBossesMet = [...p.hiddenBossesMet, hb.id];
      this.say('hiddenBoss', hb.id);
      const state = new RoomState('encounterRoom', [[hb.id]], d.waves.waveDelaySec);
      this.rooms.set(roomId, state);
      this.hiddenBossRooms.set(roomId, hb);
      this.handleRoomEvents(roomId, state.enter());
    } else if (kind === 'magiSpire') {
      // 첨탑이 방 가운데로 떨어지고 문이 잠긴다
      this.setRoomLocked(roomId, true);
      const size = spireSize(rng, stage.chapter, stage.stage, d.loot.spire.medium);
      const spire = new Spire(this, roomId, c.x, c.y, d.loot.spire, size);
      // 중형: 75% 확률로 강적 1마리 (첫 무리와 함께)
      if (size === 'medium' && rng.chance(d.loot.spire.medium.strongChance)) this.spireStrong.add(spire);
      this.spires.push(spire);
    }
  }

  // ---------- 마기수집첨탑 ----------

  private updateSpires(dt: number): void {
    for (const { sp, e } of this.spireEvents.splice(0)) this.handleSpireEvents(sp, [e]);
    for (const sp of this.spires) {
      if (sp.state.phase === 'done') continue;
      const alive = this.enemies.filter((e) => !e.dead && this.enemyRoom.get(e) === sp.roomId).length;
      this.handleSpireEvents(sp, sp.state.update(dt, alive));
      sp.draw();
    }
  }

  private handleSpireEvents(sp: Spire, events: SpireEvent[]): void {
    const t = this.ctx.t;
    for (const e of events) {
      if (e.type === 'landed') {
        sp.land();
        bus.emit('toast', { text: t('spire.landed') });
      } else if (e.type === 'spawn') {
        this.spawnSpireBatch(sp, e.index);
      } else if (e.type === 'charged') {
        // 상승: 남은 적은 보상 없이 사라진다
        bus.emit('toast', { text: t('spire.charged') });
        for (const en of this.enemies.filter((x) => this.enemyRoom.get(x) === sp.roomId)) this.removeEnemy(en);
        sp.rise();
      } else {
        this.setRoomLocked(sp.roomId, false);
        this.session.player.record.spires++;
        this.offerSpireItems(sp);
      }
    }
  }

  /** 방해 무리: 현재 챕터 웨이브 하나, 엘리트는 평소의 eliteMul배 (헥타르 전투원은 M6) */
  private spawnSpireBatch(sp: Spire, index: number): void {
    const d = this.ctx.data;
    const { map } = this.session;
    const seed = this.ctx.config.seed;
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
    wave.forEach((id, i) => this.spawnEnemy(id, sp.roomId, rng, true, elites[i] ?? null));
    if (this.spireStrong.delete(sp)) this.spawnSpireStrong(sp, rng);
    // 원본 첨탑 규칙: 헥타르 전투원이 항상 섞여 나온다
    const tr = d.loot.spire.troopers;
    const n = rng.int(tr.count[0], tr.count[1]);
    for (let i = 0; i < n; i++) this.spawnEnemy(tr.enemy, sp.roomId, rng, true);
  }

  /** 중형 첨탑 강적: 정예가 나오는 챕터(3장)는 집행자 또는 집정관, 그 전에는 엘리트 2종이 겹친 지금 챕터 일반 적 */
  private spawnSpireStrong(sp: Spire, rng: Rng): void {
    const d = this.ctx.data;
    if (d.waves.champions.stages[String(this.session.stage.chapter)]) {
      this.spawnEnemy(rng.pick(d.waves.champions.ids), sp.roomId, rng, true);
      this.say('championMet');
      return;
    }
    const roster = this.chapterRoster();
    if (roster.length === 0) return;
    const [a, b] = pickTwoElites(rng, d.elites);
    this.spawnEnemy(rng.pick(roster), sp.roomId, rng, true, a, b);
  }

  /** 충전 완료 보상: 아이템 카드 3장 중 1장 (확률 이전 반영, 신화는 따로) */
  private offerSpireItems(sp: Spire): void {
    const d = this.ctx.data;
    const p = this.session.player;
    const { stage } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `spire-items-${stage.chapter}-${stage.stage}-${sp.roomId}`);
    const weights = effectiveWeights(d.loot.spire[sp.size].weights, stage.chapter, d.items.chapterCommonShift, p.lootShift);
    const items = spireItemChoices(rng, weights, d.loot.mythicChance, d.items, new Set(p.itemsObtained), d.loot.spire.cards);
    if (items.length > 0) this.queueOffers([{ kind: 'item', boss: false, items }]);
  }

  /** 히든보스 처치: 보스 스킬 카드 1장 → 전용 무기 상자(왼쪽)·전용 아이템 상자(오른쪽) */
  private hiddenBossReward(roomId: number): void {
    const hb = this.hiddenBossRooms.get(roomId)!;
    const c = roomCenter(this.session.map.rooms[roomId]!, this.m);
    this.queueOffers([{ kind: this.ctx.data.cards.bossBonus, boss: true }], () => {
      this.addChest('weapon', c.x - 40, c.y, {}, hb.weaponId);
      if (!this.session.player.itemsObtained.includes(hb.itemId)) this.addChest('item', c.x + 40, c.y, {}, hb.itemId);
    });
  }

  /** 전투 칸을 깼을 때 낮은 확률로 무기 */
  private combatRoomDrop(roomId: number): void {
    const d = this.ctx.data;
    const { stage } = this.session;
    const rng = Rng.derive(this.ctx.config.seed, `drop-${stage.chapter}-${stage.stage}-${roomId}`);
    if (!rng.chance(d.loot.combatDrop.chance)) return;
    // 방 가운데는 장애물일 수 있어 플레이어 발밑에 떨어뜨린다
    this.dropWeapon(this.rollWeaponItem(d.loot.combatDrop.weights, 'drop'), this.player.x, this.player.y);
  }

  /** 대규모 습격 보상: 아이템 상자(레어 이상, M4-B) + 코인 다량 */
  private raidReward(roomId: number): void {
    const d = this.ctx.data;
    const c = roomCenter(this.session.map.rooms[roomId]!, this.m);
    this.addChest('item', c.x, c.y, d.items.raidWeights);
    const n = this.rng.int(d.loot.raid.coins[0], d.loot.raid.coins[1]);
    for (let i = 0; i < n; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const r = this.rng.range(8, 30);
      this.pickups.push(new Pickup(this, 'coin', c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, d.pickups));
    }
  }

  private updateInteractHint(): void {
    const vending = this.nearVending();
    const portal = this.nearPortal();
    const kind = this.nearestFloorWeapon() ? 'weapon' : this.nearChest() ? 'chest' : this.nearStand() ? 'merchant' : vending ? 'vending' : portal ? 'portal' : null;
    if (kind !== this.interactKind) this.setInteractHint(kind);
    // 포탈·자판기: 머리 위에 조작 안내
    const at = kind === 'vending' ? vending : kind === 'portal' ? { x: portal!.sprite.x, y: portal!.sprite.y } : null;
    if (!at) {
      this.interactPrompt?.setVisible(false);
      return;
    }
    const mode = this.ctx.uiMode === 'mobile' ? 'mobile' : 'pc';
    const text = this.ctx.t(`interact.${kind}.${mode}`, { price: this.ctx.data.mapgen.vending.price });
    this.interactPrompt ??= this.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '9px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(9);
    if (this.interactPrompt.text !== text) this.interactPrompt.setText(text);
    this.interactPrompt.setPosition(at.x, at.y - 22).setVisible(true);
  }

  private setInteractHint(kind: 'weapon' | 'chest' | 'merchant' | 'vending' | 'portal' | null): void {
    this.interactKind = kind;
    bus.emit('interactHint', { kind });
  }

  /** 머리 위 잠깐 뜨는 글자 */
  private floatLabel(at: Vec2, text: string, color: string): void {
    const t = this.add
      .text(at.x, at.y - 12, text, { fontFamily: 'sans-serif', fontSize: '8px', color, stroke: '#000000', strokeThickness: 2 })
      .setOrigin(0.5)
      .setDepth(7);
    this.tweens.add({ targets: t, y: t.y - 8, alpha: 0, duration: 600, onComplete: () => t.destroy() });
  }

  /** 같은 알림은 toastSec에 한 번만 */
  private toastThrottled(text: string): void {
    const last = this.toastTimes.get(text) ?? -Infinity;
    if (this.time.now - last < this.ctx.data.ui.toastSec * 1000) return;
    this.toastTimes.set(text, this.time.now);
    bus.emit('toast', { text });
  }

  // ---------- 진행 ----------

  /** 상호작용(F)이 닿는 포탈 */
  private nearPortal(): Prop | null {
    if (this.leaving) return null;
    const r = this.ctx.data.pickups.interactRadius;
    return this.portals.find((x) => Math.hypot(x.sprite.x - this.player.x, x.sprite.y - this.player.y) <= x.radius + r) ?? null;
  }

  private nearVending(): Vending | null {
    return this.nearest(
      this.vendings.filter((v) => v.stock > 0),
      this.ctx.data.pickups.interactRadius + this.ctx.data.mapgen.vending.size / 2,
    );
  }

  private nextStage(): void {
    this.leaving = true;
    const d = this.ctx.data;
    const { afterStage } = stageEndOffers(this.session.stage, d.mapgen, d.cards);
    const adv = advanceStage(this.session.stage, d.mapgen, playableChapters(d.waves, d.mapgen));
    this.session.player.record.stagesCleared++;
    if (adv.type === 'stage' || adv.type === 'chapter') {
      // 포탈에 빨려 들어가 이동 화면에서 스테이지 끝 카드를 고른 뒤 다음 스테이지로
      this.warpOut(() =>
        this.queueOffers([{ kind: afterStage, boss: false }], () => {
          const data: RunSceneData = { stage: adv.next, player: this.session.player, offers: [], warpIn: true };
          this.scene.restart(data);
        }),
      );
    } else if (adv.chapter >= d.mapgen.chapters) {
      // 3-5 런 클리어: 더 쓸 곳이 없는 카드는 건너뛰고 바로 결산
      this.endRun({ type: 'chapterClear', chapter: adv.chapter });
    } else {
      // 임시 마지막 챕터: 카드를 고른 뒤 클리어 화면
      this.queueOffers([{ kind: afterStage, boss: false }], () => this.endRun({ type: 'chapterClear', chapter: adv.chapter }));
    }
  }

  private endRun(outcome: NonNullable<RunSession['outcome']>): void {
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
    if (outcome.type === 'dead') this.player.setTint(0x555555);
    this.setInteractHint(null);
    bus.emit('overlay', { open: true });
  }

  /** 결산 확인 → 실험장으로 돌아간다 */
  private restartRun(): void {
    this.time.paused = false;
    bus.emit('overlay', { open: false });
    if (this.modal) bus.emit('modal', { kind: null });
    this.ctx.session = null;
    this.scene.start('Lab');
  }

  // ---------- 디버그 ----------

  private debugClearRoom(): void {
    const rid = this.session.currentRoomId;
    if (rid === null) return;
    for (const e of this.enemies.filter((x) => this.enemyRoom.get(x) === rid)) this.removeEnemy(e);
    const state = this.rooms.get(rid);
    if (state) this.handleRoomEvents(rid, state.forceClear());
    const sp = this.spires.find((x) => x.roomId === rid);
    if (sp) for (const e of sp.state.forceCharge()) this.spireEvents.push({ sp, e });
  }

  /** 디버그: 계열 집계를 정하고 바로 전직 (한 런에 한 번) */
  private debugAdvance(hectar: number, acro: number): void {
    const p = this.session.player;
    if (this.modal || p.advancement !== null) return;
    p.schoolPicks = { hectar, acro };
    this.advance(() => {});
  }

  private debugSetSkill(id: string, level: number, awakened: boolean): void {
    const d = this.ctx.data;
    const p = this.session.player;
    p.loadout = setSkillLevel(p.loadout, findSkill(d.skills, id), level, awakened);
    // 스킬을 없앴으면 그 스킬이 깔아 둔 오브젝트도 치운다
    if (level <= 0) for (const o of this.skillObjects.filter((x) => x.owner.split('.')[0] === id)) this.removeObject(o);
    this.refreshSkillView();
    bus.emit('inventoryChanged', {});
    const u = this.checkUltimateAwakening();
    if (u && !this.modal) this.playCutscenes([u], () => {});
  }

  private debugSpawn(enemyId: string, count: number, elite: string | null): void {
    const rid = this.session.currentRoomId;
    if (rid === null || this.modal) return;
    const rng = Rng.derive(this.ctx.config.seed, `debug-spawn-${this.time.now}`);
    // 방 웨이브와 무관하게 소환(방 클리어 판정에 넣지 않음)
    for (let i = 0; i < count; i++) this.spawnEnemy(enemyId, rid, rng, false, elite);
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
      fitArt(this.ctx.data, b, d.projectile.size, d.projectile.height ?? d.projectile.size);
      b.setDepth(5);
      b.setData({ damage: cfg.damage, refractable: true, cuttable: true });
      b.setVelocity(-Math.cos(a) * cfg.speed, -Math.sin(a) * cfg.speed);
    }
  }

  /** 카메라: 조준 중인 적 쪽으로 기울어 따라가고(없으면 플레이어), 방 바깥은 보이지 않게 */
  private updateCamera(): void {
    const cam = this.cameras.main;
    const target = this.cameraTarget();
    const lerp = this.ctx.data.ui.cameraLerp;
    cam.scrollX += (target.x - cam.width / 2 - cam.scrollX) * lerp;
    cam.scrollY += (target.y - cam.height / 2 - cam.scrollY) * lerp;
  }
}

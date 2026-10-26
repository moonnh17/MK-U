import Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { makeFallbackSeed } from '../core/config';
import { getContext, type GameContext } from '../core/context';
import { bus } from '../core/events';
import { DISABLED_ACTIONS } from '../core/features';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';
import { newPlayerState, type PlayerState, type RunSession } from '../core/session';
import { Door } from '../entities/door';
import { Enemy } from '../entities/enemy';
import { FloorWeapon, Pickup } from '../entities/pickup';
import { calcDamage, gradeMultiplier } from '../systems/damage';
import { pendingEncounter } from '../systems/encounter';
import { generateStage, type RoomNode } from '../systems/mapgen';
import { RoomState, wavesForRoom, type RoomEvent, type Wave } from '../systems/roomState';
import { advanceStage, firstStage, type StageRef } from '../systems/run';
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
import type { WeaponDef } from '../types/data';

export interface RunSceneData {
  stage?: StageRef;
  player?: PlayerState;
}

interface Prop {
  sprite: Phaser.GameObjects.Image;
  roomId: number;
  radius: number;
}

/** 전투 씬: 스테이지 하나(방·복도·적·무기). 스테이지를 넘기면 다음 스테이지 데이터로 재시작한다. */
export class RunScene extends Phaser.Scene {
  private ctx!: GameContext;
  private session!: RunSession;
  private m!: WorldMetrics;
  private rng!: Rng;

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

  private aimDir: Vec2 = { x: 1, y: 0 };
  private fireCooldown = 0;
  private invuln = 0;
  private interactKind: 'weapon' | 'core' | null = null;
  private lastToastAt = -Infinity;
  private unsubs: (() => void)[] = [];
  private initData: RunSceneData = {};

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
    this.session = {
      stage,
      map,
      visited: new Set([map.startId]),
      currentRoomId: map.startId,
      player: this.initData.player ?? newPlayerState(d),
      enemiesAlive: 0,
      outcome: null,
      energyEmptyAt: -Infinity,
    };
    this.ctx.session = this.session;
    this.rng = Rng.derive(seed, `combat-${stage.chapter}-${stage.stage}`);
    this.m = metrics(d.mapgen);

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
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
    });
    this.setInteractHint(null);
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
    this.aimDir = { x: 1, y: 0 };
    this.fireCooldown = 0;
    this.invuln = 0;
    this.interactKind = null;
    this.lastToastAt = -Infinity;
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

    const p = this.session.player;
    const d = this.ctx.data;
    const speed = d.player.moveSpeed;
    this.player.setVelocity(frame.move.x * speed, frame.move.y * speed);
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
        // 보스 스테이지: 보스방이 출구를 겸한다 → 처치하면 포털 생성
        if (node.kind === 'bossRoom') this.addPortal(node);
      }
    }
  }

  private setRoomLocked(roomId: number, locked: boolean): void {
    for (const door of this.doorsByRoom.get(roomId) ?? []) door.setLocked(locked);
  }

  private spawnWave(roomId: number, wave: Wave, index: number): void {
    const d = this.ctx.data;
    const { map } = this.session;
    const node = map.rooms[roomId]!;
    const rng = Rng.derive(this.ctx.config.seed, `spawn-${map.chapter}-${map.stage}-${roomId}-${index}`);
    for (const id of wave) {
      const def = d.enemies.enemies.find((e) => e.id === id)!;
      const pos =
        def.ai === 'idle' ? roomCenter(node, this.m) : this.spawnPoint(node, rng, def.size / 2);
      const enemy = new Enemy(this, def, pos.x, pos.y, d.waves.spawnWarnSec);
      this.enemyGroup.add(enemy.sprite);
      if (def.ai === 'idle') (enemy.sprite.body as Phaser.Physics.Arcade.Body).setImmovable(true);
      this.enemies.push(enemy);
      this.enemyRoom.set(enemy, roomId);
    }
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

  private hitDamage(w: WeaponDef): number {
    const d = this.ctx.data;
    const base = w.baseDamage * gradeMultiplier(w.grade, d.groupMultipliers);
    return calcDamage({ baseDamage: base, tags: w.tags }, this.session.player.stats, d.tags);
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
    const damage = this.hitDamage(w);
    const proj = this.ctx.data.weapons.projectile;
    for (const shot of gunShots(w, aimAngle, this.rng)) {
      const b = this.bullets.create(this.player.x, this.player.y, proj.spriteKey) as Phaser.Physics.Arcade.Image;
      b.setDepth(5);
      b.setData({ damage, range: shot.range, ox: this.player.x, oy: this.player.y });
      b.setVelocity(Math.cos(shot.angle) * shot.speed, Math.sin(shot.angle) * shot.speed);
    }
  }

  private slash(w: WeaponDef, aimAngle: number): void {
    if (w.pattern.kind !== 'arc') return;
    const { arcDeg, radius } = w.pattern;
    const origin = { x: this.player.x, y: this.player.y };
    const damage = this.hitDamage(w);
    for (const e of [...this.enemies]) {
      if (inArc(origin, aimAngle, arcDeg, radius, e.sprite, e.radius) && e.damage(damage)) this.onEnemyKilled(e);
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
    const dmg = b.getData('damage') as number;
    b.destroy();
    if (enemy.damage(dmg)) this.onEnemyKilled(enemy);
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
    this.removeEnemy(e);
    if (roomId !== undefined) this.rooms.get(roomId)?.enemyKilled();
  }

  private removeEnemy(e: Enemy): void {
    this.enemies = this.enemies.filter((x) => x !== e);
    this.enemyRoom.delete(e);
    e.destroy();
  }

  private onContact(enemy: Enemy | undefined): void {
    if (!enemy || enemy.dead || enemy.warn > 0 || enemy.def.contactDamage <= 0) return;
    const now = this.time.now;
    if (now - enemy.lastContactAt < enemy.def.contactIntervalSec * 1000) return;
    if (this.hurtPlayer(enemy.def.contactDamage)) enemy.lastContactAt = now;
  }

  /** 피해를 받았으면 true */
  private hurtPlayer(amount: number): boolean {
    if (this.invuln > 0 || this.ctx.debugFlags.invincible || this.session.outcome) return false;
    const p = this.session.player;
    p.hp = Math.max(0, p.hp - amount);
    this.invuln = this.ctx.data.player.hurtInvulnSec;
    this.cameras.main.shake(80, 0.004);
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
    for (const pk of this.pickups) {
      if (!pk.update(dt, this.player, d.pickups)) continue;
      if (pk.kind === 'energy') p.energy = gainEnergy(p.energy, d.player.energy.orbValue, p.energyMax);
      else p.coins += d.pickups.coin.value;
    }
    this.pickups = this.pickups.filter((pk) => !pk.collected);
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

  private toastThrottled(text: string): void {
    if (this.time.now - this.lastToastAt < this.ctx.data.ui.toastSec * 1000) return;
    this.lastToastAt = this.time.now;
    bus.emit('toast', { text });
  }

  // ---------- 진행 ----------

  private checkPortals(): void {
    const pr = this.ctx.data.player.size / 2;
    for (const portal of this.portals) {
      if (Math.hypot(portal.sprite.x - this.player.x, portal.sprite.y - this.player.y) <= portal.radius + pr) {
        this.nextStage();
        return;
      }
    }
  }

  private nextStage(): void {
    const adv = advanceStage(this.session.stage, this.ctx.data.mapgen);
    if (adv.type === 'stage') {
      const data: RunSceneData = { stage: adv.next, player: this.session.player };
      this.scene.restart(data);
    } else {
      this.endRun({ type: 'chapterClear', chapter: adv.chapter });
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
    bus.emit('overlay', { open: false });
    this.scene.restart({});
  }

  private debugClearRoom(): void {
    const rid = this.session.currentRoomId;
    if (rid === null) return;
    for (const e of this.enemies.filter((x) => this.enemyRoom.get(x) === rid)) this.removeEnemy(e);
    const state = this.rooms.get(rid);
    if (state) this.handleRoomEvents(rid, state.forceClear());
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

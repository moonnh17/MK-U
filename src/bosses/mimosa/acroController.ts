/**
 * 7-5 아크로 학파 연구원 미모사 (제안, 수치 임시): 정체를 드러낸 미모사. 시간·공간에 손댄다.
 * 1·2페이즈: 방 안을 순간이동하며 공간 베기·파편·각인(디버프)·되감기, 중간중간 맵의 다른 칸으로 함께 넘어가
 * 그 장(테마)의 잡몹과 보스를 부른다. 2→3 전환은 맵 곳곳에서 합을 겨루는 연출(점점 빨라지고 카메라가 멀어짐) 뒤
 * 무너진 붉은 공간에서 죽이기만을 위한 3페이즈. 수치는 overflow.json acro, 공식은 systems/acroMimosa.ts.
 */
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { bus } from '../../core/events';
import { hexColor } from '../../core/scale';
import type { Enemy } from '../../entities/enemy';
import { Ring, type Rect } from '../../entities/hazard';
import { shake } from '../../entities/juice';
import { playFx } from '../../skills/skillFx';
import { animKey } from '../../systems/art';
import { blinkTarget, clashTimes, crossLines, cutLines, hopRoom, summonPlan, themeBosses } from '../../systems/acroMimosa';
import { mimosaPhase } from '../../systems/mimosa';
import type { AcroData, AcroPatternDef, BossCore, BossesData, SpriteRef } from '../../types/data';
import type { BossHost } from '../host';
import { CutHazard, MarkHazard, RewindShards } from './acroHazards';
import type { BossControl } from './controller';

/** 아크로 미모사가 전투 씬에 바라는 것 (칸 넘나들기·연출은 씬이 맡는다) */
export interface AcroHooks {
  say(keys: string[], mood: 'calm' | 'ominous'): void;
  band(): void;
  focus(at: Vec2 | null): void;
  /** 전용 스토리 대화 (게임을 멈춘다). 끝나면 then */
  story(event: 'bossMet', then: () => void): void;
  rooms(): { id: number }[];
  bossRoomId(): number;
  /** 방 안쪽 / 벽까지 포함한 방 */
  roomArena(id: number): Rect;
  roomRect(id: number): Rect;
  movePlayer(to: Vec2): void;
  lockRoom(id: number, locked: boolean): void;
  /** 넘나드는 동안 방 입장(웨이브·조우)을 막는다 */
  freezeRooms(on: boolean): void;
  /** 그 장 바닥 무늬를 방 위에 덮는다 (다른 맵) */
  floorOverlay(rect: Rect, chapter: number, alpha: number): Phaser.GameObjects.GameObject | null;
  roster(chapter: number): string[];
  summonBoss(id: string, at: Vec2, hpMul: number, damageMul: number): Enemy;
  removeEnemy(e: Enemy): void;
  /** 아크로 디버프 아이템 하나 (한도면 null) */
  debuff(): string | null;
  /** 카메라 배율 (1 = 평소) */
  zoom(k: number, ms: number): void;
  /** 연출 중: 입력·피격을 막는다 */
  cinematic(on: boolean): void;
  /** 무너진 붉은 공간을 보스방에 깐다 (null이면 걷는다) */
  redSpace(on: boolean): void;
  /** 설정 '화면 효과 약하게' */
  reduceFx(): boolean;
  /** 시네마틱 덮개 (레터박스·하얀 막·큰 글자) */
  cinema(ev: { bars?: boolean; white?: number; ms?: number; big?: string | null }): void;
  /** HUD 스테이지 표시 바꿔 쓰기 (null이면 평소) */
  stageLabel(text: string | null): void;
  /** 지금 스테이지 표시 앞부분 ("7-") */
  stagePrefix(): string;
  hitStop(sec: number): void;
  /** 연출 속 플레이어가 angle 쪽으로 무기를 휘두르거나 쏜다 */
  playerStrike(angle: number): void;
  /** 연출 속 플레이어 스킬 모습 (n번째 장착 스킬) */
  playerSkillFx(n: number): void;
  data: { bosses: BossesData };
}

interface Run {
  update(dt: number): boolean;
  destroy(): void;
}

/** 시간표 실행: at(초, 일) + 끝나는 시각 */
class Seq implements Run {
  private t = 0;
  private readonly steps: { at: number; fn: () => void; done: boolean }[] = [];
  private readonly cleanups: (() => void)[] = [];
  constructor(
    private readonly endSec: number,
    private readonly tick?: (t: number, dt: number) => void,
  ) {}
  at(sec: number, fn: () => void): this {
    this.steps.push({ at: sec, fn, done: false });
    return this;
  }
  onDestroy(fn: () => void): this {
    this.cleanups.push(fn);
    return this;
  }
  update(dt: number): boolean {
    this.t += dt;
    for (const s of this.steps) {
      if (!s.done && this.t >= s.at) {
        s.done = true;
        s.fn();
      }
    }
    this.tick?.(this.t, dt);
    return this.t < this.endSec;
  }
  destroy(): void {
    for (const f of this.cleanups) f();
  }
}

type Pose = 'idle' | 'vanish' | 'appear' | 'command' | 'slash' | 'clash' | 'rage';

export class AcroController implements BossControl {
  def: Pick<BossCore, 'id' | 'enrageAt' | 'unlocks'>;
  private phase = 1;
  private started = false;
  private introLeft = Infinity;
  private idle: number;
  private run: Run | null = null;
  private cooldowns: Record<string, number> = {};
  private last: string | null = null;
  private transitionLeft = 0;
  private clash: Seq | null = null;
  private host: BossHost | null = null;
  private summons: Enemy[] = [];
  private poseLeft = 0;
  private home: Vec2;
  private arena: Rect;
  private readonly bossRoom: number;
  /** 한 패턴에서 각인 디버프는 한 번만 */
  private brandGiven = false;

  constructor(
    readonly enemy: Enemy,
    private readonly A: AcroData,
    arena: Rect,
    private readonly hooks: AcroHooks,
    private readonly scene: Phaser.Scene,
    private readonly damageMul = 1,
  ) {
    this.def = { id: enemy.def.id, enrageAt: 0, unlocks: A.phases };
    this.arena = arena;
    this.bossRoom = hooks.bossRoomId();
    this.home = { x: arena.x + arena.w / 2, y: arena.y + arena.h * 0.32 };
    (enemy.sprite.body as Phaser.Physics.Arcade.Body).reset(this.home.x, this.home.y);
    enemy.sprite.setImmovable(true).setVisible(false);
    enemy.warn = 999;
    this.idle = A.firstDelaySec;
    // 정체 공개 대화가 끝나면 붉은 균열에서 나타난다
    hooks.story('bossMet', () => this.beginIntro());
  }

  get enraged(): boolean {
    return this.phase >= 3;
  }

  // ---------- 등장 ----------

  private beginIntro(): void {
    const i = this.A.intro;
    this.started = true;
    this.introLeft = i.riftSec + i.appearSec;
    this.enemy.warn = this.introLeft + 0.1;
    this.hooks.focus({ x: this.home.x, y: this.home.y + 10 });
    const rift = this.fx(this.A.art.portal, this.home.x, this.home.y, i.riftPx);
    rift.setAlpha(0);
    this.scene.tweens.add({ targets: rift, alpha: 1, duration: i.riftSec * 500 });
    shake(this.scene, 'medium');
    bus.emit('sfx', { id: 'spaceRupture' });
    this.scene.time.delayedCall(i.riftSec * 1000, () => {
      this.enemy.sprite.setVisible(true).setAlpha(1);
      this.pose('appear');
      this.hooks.band();
      this.hooks.say(['acro.line.intro'], 'ominous');
      bus.emit('sfx', { id: 'blink' });
      this.scene.tweens.add({ targets: rift, alpha: 0, duration: 400, onComplete: () => rift.destroy() });
    });
  }

  // ---------- 매 프레임 ----------

  update(dt: number, host: BossHost): void {
    this.host = host;
    const e = this.enemy;
    this.summons = this.summons.filter((s) => !s.dead);
    // 부른 적이 있는 동안은 거의 맞지 않는다 (먼저 치우라는 뜻)
    e.guardMul = this.summons.length > 0 ? this.A.summon.guardMul : 1;
    if (e.dead || !this.started) return;
    e.sprite.setVelocity(0, 0);
    if (this.introLeft > 0) {
      this.introLeft -= dt;
      if (this.introLeft <= 0) {
        this.hooks.focus(null);
        this.setIdle();
      }
      return;
    }
    if (this.poseLeft > 0) {
      this.poseLeft -= dt;
      if (this.poseLeft <= 0) this.setIdle();
    }
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0, this.cooldowns[k]! - dt);
    // 합 겨루기 연출
    if (this.clash) {
      if (!this.clash.update(dt)) {
        this.clash.destroy();
        this.clash = null;
      }
      return;
    }
    const ph = mimosaPhase(e.hp / e.maxHp, this.A.phases);
    if (ph > this.phase) {
      this.phase = ph;
      this.enterPhase(ph);
      return;
    }
    if (this.transitionLeft > 0) {
      this.transitionLeft -= dt;
      return;
    }
    if (this.run && !this.run.update(dt)) {
      this.run.destroy();
      this.run = null;
      this.idle = this.A.gapSec[String(this.phase)] ?? 1;
    }
    if (this.run) return;
    this.idle -= dt;
    if (this.idle > 0) return;
    this.startPattern();
  }

  private startPattern(): void {
    const host = this.host!;
    const pool = this.A.patterns.filter((p) => p.phases.includes(this.phase) && (this.cooldowns[p.id] ?? 0) <= 0 && p.id !== this.last);
    if (pool.length === 0) {
      this.idle = 0.3;
      return;
    }
    const p = host.rng.weighted(pool.map((x) => ({ item: x, weight: x.weight })));
    this.cooldowns[p.id] = p.cooldownSec;
    this.last = p.id;
    this.brandGiven = false;
    this.run = this.makePattern(p);
  }

  private makePattern(p: AcroPatternDef): Run {
    switch (p.id) {
      case 'cut':
        return this.cut(p);
      case 'shards':
        return this.shards(p);
      case 'brand':
        return this.brand(p);
      case 'rewind':
        return this.rewind(p);
      case 'summon':
        return this.summon(p);
      case 'crossCut':
        return this.crossCut(p);
      case 'riftChain':
        return this.riftChain(p);
    }
  }

  private dmg(v: number): number {
    return v * this.damageMul;
  }

  private ref(key: string): SpriteRef {
    return { spriteKey: key, color: this.A.color, size: 8 };
  }

  private fx(key: string, x: number, y: number, w: number, depth = 6): Phaser.GameObjects.Sprite {
    return playFx(this.scene, this.ref(key), x, y, { w, depth });
  }

  private get color(): number {
    return hexColor(this.A.color);
  }

  // ---------- 그림 ----------

  private pose(name: Pose): void {
    const sp = this.enemy.sprite;
    const key = animKey(sp.texture.key, name);
    if (!sp.scene.anims.exists(key)) return;
    this.enemy.poseHold = name !== 'idle';
    sp.play(key);
    // 옆모습 동작은 플레이어 쪽을 본다 (그림은 오른쪽을 봄)
    if (name === 'slash' || name === 'clash') sp.setFlipX((this.host?.playerPos().x ?? sp.x) < sp.x);
    this.poseLeft = name === 'idle' || name === 'rage' ? 0 : 0.8;
  }

  /** 평소 모습: 3페이즈는 살의(rage) */
  private setIdle(): void {
    this.pose(this.phase >= 3 ? 'rage' : 'idle');
  }

  /** 순간이동: 사라졌다가 to에서 나타난다. 나타난 뒤 then */
  private blink(to: Vec2, then?: () => void): void {
    const B = this.A.blink;
    const e = this.enemy;
    const A = this.A.art;
    this.pose('vanish');
    this.fx(A.blink, e.sprite.x, e.sprite.y, A.blinkPx).setBlendMode('ADD');
    bus.emit('sfx', { id: 'blink' });
    this.scene.time.delayedCall(B.vanishSec * 1000, () => {
      if (e.dead) return;
      (e.sprite.body as Phaser.Physics.Arcade.Body).reset(to.x, to.y);
      this.fx(A.blinkRing, to.x, to.y, A.blinkPx).setBlendMode('ADD');
      this.pose('appear');
      this.scene.time.delayedCall(B.appearSec * 1000, () => {
        if (e.dead) return;
        this.setIdle();
        then?.();
      });
    });
  }

  private blinkNear(): Vec2 {
    const B = this.A.blink;
    return blinkTarget(this.host!.rng, this.arena, this.host!.playerPos(), B.minDistPx, B.maxDistPx, B.edgePx);
  }

  private at(): Vec2 {
    return { x: this.enemy.sprite.x, y: this.enemy.sprite.y };
  }

  // ---------- 페이즈 ----------

  private enterPhase(ph: number): void {
    const host = this.host!;
    this.run?.destroy();
    this.run = null;
    if (ph === 2) {
      host.bossPhaseFx(host.t(`boss.unlock.${this.def.id}.${ph - 1}`), this.A.color, this.at());
      this.transitionLeft = this.A.transitionSec;
      this.enemy.invuln = this.A.transitionSec;
      this.hooks.say(['acro.line.phase2'], 'ominous');
      shake(this.scene, 'heavy');
      this.pose('command');
    } else if (ph === 3) this.startClash();
  }

  /**
   * 2→3 전환 (시네마틱): ① 레터박스가 내려오고 카메라가 둘에게 확 다가가 보스방에서 느리게 합을 겨룬다
   * ② 맵 곳곳을 넘나들며 합 — 플레이어도 무기를 휘두르거나 쏘고 스킬을 쓴다. 갈수록 빨라지고 카메라가 멀어지며
   *    왼쪽 스테이지 표시(7-5)의 숫자가 기하급수로 불어나고 화면이 하얘진다 ③ 표시가 ∞가 되고 화면이 새하얗게 →
   * ④ 하얀 막이 걷히면 무너진 붉은 공간, 미모사 체력이 가득 차며 최종전이 시작된다
   */
  private startClash(): void {
    const C = this.A.clash;
    const host = this.host!;
    const h = this.hooks;
    const e = this.enemy;
    const stage = this.stagePrefix();
    const flashK = h.reduceFx() ? 0.3 : 1;
    const introEnd = C.introSec + C.introClashes * C.introGapSec;
    const times = clashTimes(C.hops, C.startGapSec, C.endGapSec).map((t) => introEnd + t);
    const last = times[times.length - 1]!;
    const whiteAt = last + C.endGapSec;
    const revealAt = whiteAt + C.whiteHoldSec;
    const end = revealAt + C.revealSec;
    e.invuln = end + 0.5;
    h.cinematic(true);
    h.freezeRooms(true);
    h.say(['acro.line.clash'], 'ominous');
    const rooms = h.rooms();
    const flash = this.scene.add.rectangle(0, 0, this.scene.scale.width * 4, this.scene.scale.height * 4, 0xffffff, 0).setScrollFactor(0).setDepth(40).setOrigin(0.5);
    const place = (c: Vec2, side: number, gap: number) => {
      h.movePlayer({ x: c.x - side * gap, y: c.y });
      (e.sprite.body as Phaser.Physics.Arcade.Body).reset(c.x + side * gap, c.y);
      e.sprite.setFlipX(side > 0);
    };
    /** 한 합: 미모사 합 자세, 플레이어 공격(+스킬), 불꽃, 번쩍임, 멈칫 */
    const strike = (c: Vec2, side: number, k: number, i: number, skill: boolean, hit: number) => {
      this.pose('clash');
      e.sprite.setFlipX(side > 0);
      h.playerStrike(side > 0 ? 0 : Math.PI);
      if (skill) h.playerSkillFx(i);
      this.fx(this.A.art.blink, c.x, c.y, this.A.art.blinkPx * (1 + k)).setBlendMode('ADD');
      this.fx(this.A.art.slash, c.x, c.y, this.A.art.slashPx * (0.6 + 0.6 * k)).setRotation(host.rng.range(0, Math.PI)).setBlendMode('ADD');
      flash.setFillStyle(i % 2 ? 0xffffff : this.color, C.flashAlpha * flashK * (0.4 + 0.6 * k));
      this.scene.tweens.add({ targets: flash, fillAlpha: 0, duration: Math.max(60, (C.startGapSec - (C.startGapSec - C.endGapSec) * k) * 700) });
      bus.emit('sfx', { id: i % 2 ? 'hitHeavy' : 'swingHeavy' });
      shake(this.scene, k > 0.6 ? 'medium' : 'light');
      h.hitStop(hit);
    };
    const s = new Seq(end).onDestroy(() => {
      flash.destroy();
      h.cinema({ bars: false, white: 0, big: null, ms: 200 });
    });

    // ① 다가가기: 레터박스, 보스방 가운데에서 마주 서고 확대
    const c0 = { x: this.arena.x + this.arena.w / 2, y: this.arena.y + this.arena.h * 0.55 };
    s.at(0, () => {
      h.cinema({ bars: true, ms: C.introSec * 1000 });
      place(c0, 1, C.introGapPx * 2);
      h.focus(c0);
      h.zoom(C.introZoom, C.introSec * 1000);
      this.pose('command');
    });
    for (let j = 0; j < C.introClashes; j++) {
      s.at(C.introSec + j * C.introGapSec, () => {
        const side = j % 2 ? -1 : 1;
        place(c0, side, C.introGapPx);
        strike(c0, side, 0.2 + 0.15 * j, j, j === C.introClashes - 1, C.introHitstopSec);
      });
    }

    // ② 맵 곳곳에서: 빨라지고, 멀어지고, 숫자가 불어나고, 하얘진다
    let lastRoom = -1;
    times.forEach((t, i) => {
      s.at(t, () => {
        const pool = rooms.filter((r) => r.id !== lastRoom);
        const room = host.rng.pick(pool.length > 0 ? pool : rooms).id;
        lastRoom = room;
        const ar = h.roomArena(room);
        const c = { x: ar.x + ar.w * host.rng.range(0.3, 0.7), y: ar.y + ar.h * host.rng.range(0.35, 0.7) };
        const side = host.rng.chance(0.5) ? 1 : -1;
        const k = (i + 1) / times.length;
        place(c, side, C.hopGapPx);
        h.focus(c);
        h.zoom(C.introZoom + (C.zoomTo - C.introZoom) * k, 60);
        strike(c, side, k, i + C.introClashes, i % C.skillEvery === 0, C.hitstopSec);
        // 스테이지 표시: 숫자 자리가 기하급수로 늘다가 ∞
        const len = Math.floor(Math.pow(C.labelGrowth, i + 1));
        const digits = Array.from({ length: len }, () => String(host.rng.int(0, 9))).join('');
        h.stageLabel(len >= C.labelDigits ? host.t('boss.stageLabel.infinite').replace('{s}', stage) : `${stage}${host.rng.int(1, 9)}${digits}`);
        if (k >= C.whiteFrom) h.cinema({ white: ((k - C.whiteFrom) / (1 - C.whiteFrom)) * C.whiteMax, ms: 60 });
      });
    });

    // ③ 새하얗게, ∞ — 그 뒤에서 무대를 바꾼다
    s.at(whiteAt, () => {
      h.cinema({ white: 1, ms: 120 });
      h.cinema({ big: host.t('boss.stageLabel.mark'), ms: 500 });
      h.stageLabel(host.t('boss.stageLabel.infinite').replace('{s}', stage));
      bus.emit('sfx', { id: 'explosionLarge' });
      shake(this.scene, 'heavy');
    });
    s.at(whiteAt + 0.15, () => {
      h.redSpace(true);
      h.movePlayer({ x: this.arena.x + this.arena.w / 2, y: this.arena.y + this.arena.h * 0.78 });
      (e.sprite.body as Phaser.Physics.Arcade.Body).reset(this.home.x, this.home.y);
      e.sprite.setFlipX(false);
      h.focus({ x: this.home.x, y: this.home.y + 20 });
      h.zoom(C.revealZoom, 1);
      this.setIdle();
    });

    // ④ 걷히며 최종전: 체력이 가득 차고, 카메라가 물러나며 레터박스가 걷힌다
    s.at(revealAt, () => {
      h.cinema({ white: 0, big: null, ms: C.revealSec * 1000 });
      this.fx(this.A.art.implode, this.home.x, this.home.y, this.A.art.burstPx * 1.6).setBlendMode('ADD');
      this.fx(this.A.art.burst, this.home.x, this.home.y + 10, this.A.art.burstPx * 1.8).setBlendMode('ADD');
      bus.emit('sfx', { id: 'bossPhase' });
      // 체력 가득 (페이즈 눈금은 이제 없다)
      this.def = { ...this.def, unlocks: [] };
      this.scene.tweens.addCounter({
        from: e.hp,
        to: e.maxHp,
        duration: C.refillSec * 1000,
        ease: 'Cubic.easeOut',
        onUpdate: (tw) => {
          if (!e.dead) e.hp = tw.getValue() ?? e.hp;
        },
      });
      host.bossPhaseFx(host.t(`boss.unlock.${this.def.id}.2`), this.A.color, this.at());
    });
    s.at(revealAt + C.revealSec * 0.5, () => {
      h.zoom(1, C.revealSec * 500);
      h.focus(null);
    });
    s.at(end, () => {
      h.cinema({ bars: false });
      h.cinematic(false);
      h.freezeRooms(false);
      h.say(['acro.line.phase3'], 'ominous');
      this.idle = this.A.firstDelaySec;
    });
    this.clash = s;
  }

  /** 스테이지 표시 앞부분 ("7-") */
  private stagePrefix(): string {
    return this.hooks.stagePrefix();
  }

  // ---------- 패턴 ----------

  /** 공간 베기: 가까이 나타나 플레이어를 지나는 선들을 벤다 */
  private cut(p: AcroPatternDef): Run {
    const C = this.A.cut;
    const host = this.host!;
    const s = new Seq(p.durationSec);
    this.blink(this.blinkNear(), () => {
      if (this.enemy.dead) return;
      this.pose('slash');
      const n = C.linesByPhase[String(this.phase)] ?? 2;
      cutLines(host.rng, host.playerPos(), n, 40).forEach((l, i) =>
        host.addHazard(new CutHazard(this.scene, l, C.warnSec + i * C.stepSec, C.widthPx, C.lengthPx, this.dmg(C.damage), this.color, { ref: this.ref(this.A.art.slash), px: this.A.art.slashPx })),
      );
    });
    return s;
  }

  /** 붉은 파편: 틈이 있는 원형 탄막 두 겹 */
  private shards(p: AcroPatternDef): Run {
    const S = this.A.shards;
    const host = this.host!;
    const n = S.countByPhase[String(this.phase)] ?? 14;
    this.pose('command');
    const s = new Seq(p.durationSec);
    for (let w = 0; w < S.waves; w++) {
      s.at(0.35 + w * S.waveGapSec, () => {
        const o = this.at();
        const pl = host.playerPos();
        const toP = Math.atan2(pl.y - o.y, pl.x - o.x);
        // 틈: 첫 겹은 플레이어 반대쪽, 둘째 겹은 플레이어 옆
        const gapAt = toP + (w % 2 ? Math.PI / 2 : Math.PI);
        const gap = (S.gapDeg * Math.PI) / 180;
        bus.emit('sfx', { id: 'shotNeedle' });
        for (let i = 0; i < n; i++) {
          const a = toP + (i * Math.PI * 2) / n + (w % 2 ? Math.PI / n : 0);
          const diff = Math.abs(Math.atan2(Math.sin(a - gapAt), Math.cos(a - gapAt)));
          if (diff < gap / 2) continue;
          host.fireEnemyBullet(o, a, S.speed, S.range, this.dmg(S.damage), true, this.ref(this.A.art.shard));
        }
      });
    }
    return s;
  }

  /** 각인: 플레이어 자리부터 표식이 차례로 터진다. 맞으면 아크로 디버프 아이템 (한 패턴에 한 번) */
  private brand(p: AcroPatternDef): Run {
    const B = this.A.brand;
    const host = this.host!;
    const n = B.countByPhase[String(this.phase)] ?? 2;
    this.pose('command');
    const pl = host.playerPos();
    const A = this.A.art;
    for (let i = 0; i < n; i++) {
      const at = i === 0 ? pl : { x: pl.x + host.rng.range(-B.spreadPx, B.spreadPx), y: pl.y + host.rng.range(-B.spreadPx, B.spreadPx) };
      const c = { x: Math.max(this.arena.x + 8, Math.min(this.arena.x + this.arena.w - 8, at.x)), y: Math.max(this.arena.y + 8, Math.min(this.arena.y + this.arena.h - 8, at.y)) };
      host.addHazard(
        new MarkHazard(this.scene, c, B.radius, B.warnSec + i * B.stepSec, 0, this.dmg(B.damage), this.color, () => this.onBrand(), {
          mark: this.ref(A.mark),
          markPx: A.markPx,
          burst: this.ref(A.burst),
          burstPx: A.burstPx * 0.6,
        }),
      );
    }
    return new Seq(p.durationSec);
  }

  private onBrand(): void {
    if (this.brandGiven) return;
    this.brandGiven = true;
    if (this.hooks.debuff()) this.hooks.say([this.host!.rng.pick(['acro.line.brand1', 'acro.line.brand2', 'acro.line.brand3'])], 'ominous');
  }

  /** 되감기: 퍼진 파편이 멈췄다가 미모사에게 되돌아온다 */
  private rewind(p: AcroPatternDef): Run {
    const R = this.A.rewind;
    const host = this.host!;
    this.pose('command');
    this.hooks.say(['acro.line.rewind'], 'ominous');
    const o = this.at();
    host.addHazard(new RewindShards(this.scene, o, R.count, host.rng.range(0, Math.PI * 2), R.speed, R.range, R.freezeSec, R.returnSpeed, this.dmg(R.damage), this.ref(this.A.art.shard), 10));
    bus.emit('sfx', { id: 'shotNeedle' });
    return new Seq(p.durationSec);
  }

  /** 교차 베기 (3페이즈): 방 가운데로 가서 쐐기만 남기고 벤다 */
  private crossCut(p: AcroPatternDef): Run {
    const C = this.A.crossCut;
    const host = this.host!;
    const center = { x: this.arena.x + this.arena.w / 2, y: this.arena.y + this.arena.h / 2 };
    this.blink(center, () => {
      if (this.enemy.dead) return;
      this.pose('slash');
      for (const l of crossLines(host.rng, center, C.lines)) host.addHazard(new CutHazard(this.scene, l, C.warnSec, C.widthPx, C.lengthPx, this.dmg(C.damage), this.color, { ref: this.ref(this.A.art.slash), px: this.A.art.slashPx }));
    });
    return new Seq(p.durationSec);
  }

  /** 균열 연쇄 (3페이즈): 연달아 나타나며 틈 있는 고리를 터뜨린다 */
  private riftChain(p: AcroPatternDef): Run {
    const R = this.A.riftChain;
    const host = this.host!;
    const s = new Seq(p.durationSec);
    for (let i = 0; i < R.blinks; i++) {
      s.at(i * R.gapSec, () => {
        if (this.enemy.dead) return;
        const to = this.blinkNear();
        (this.enemy.sprite.body as Phaser.Physics.Arcade.Body).reset(to.x, to.y);
        this.pose('clash');
        this.fx(this.A.art.blinkRing, to.x, to.y, this.A.art.blinkPx).setBlendMode('ADD');
        bus.emit('sfx', { id: 'blink' });
        const pl = host.playerPos();
        host.addHazard(
          new Ring(this.scene, {
            center: to,
            fromR: 4,
            toR: R.ringR,
            moveSec: R.ringSec,
            telegraphSec: 0.25,
            holdSec: 0,
            thickness: R.ringThickness,
            damage: this.dmg(R.damage),
            tickSec: 0,
            color: this.color,
            gapAngle: Math.atan2(pl.y - to.y, pl.x - to.x) + Math.PI,
            gapDeg: R.gapDeg,
          }),
        );
      });
    }
    return s;
  }

  /**
   * 맵 곳곳 소환: 함께 다른 칸으로 넘어가 그 장(1~3장 중 하나)의 바닥으로 바뀌고, 그 장 잡몹과 보스(약화)를 부른다.
   * 부른 적을 다 잡거나 시간이 다 되면 보스방으로 돌아온다. 중간에 끊기면(페이즈 전환) 바로 돌아온다.
   */
  private summon(_p: AcroPatternDef): Run {
    const S = this.A.summon;
    const host = this.host!;
    const h = this.hooks;
    const target = hopRoom(host.rng, h.rooms(), this.bossRoom, null);
    if (target === null) return this.shards(_p);
    const chapter = host.rng.pick(S.themeChapters);
    const plan = summonPlan(host.rng, h.roster(chapter), themeBosses(h.data, chapter, S.excludeBosses), S.normalsByPhase[String(this.phase)] ?? 5);
    const back = { x: this.arena.x + this.arena.w / 2, y: this.arena.y + this.arena.h * 0.78 };
    let overlay: Phaser.GameObjects.GameObject | null = null;
    let arrived = false;
    let returned = false;
    let attack = S.attackGapSec;
    const tar = h.roomArena(target);
    this.pose('command');
    h.say([host.rng.pick(['acro.line.summon1', 'acro.line.summon2'])], 'ominous');
    this.fx(this.A.art.portal, host.playerPos().x, host.playerPos().y, this.A.art.portalPx).setBlendMode('ADD');
    bus.emit('sfx', { id: 'warp' });
    const goBack = () => {
      if (returned) return;
      returned = true;
      for (const e of this.summons) if (!e.dead) h.removeEnemy(e);
      this.summons = [];
      if (arrived) {
        h.movePlayer(back);
        (this.enemy.sprite.body as Phaser.Physics.Arcade.Body).reset(this.home.x, this.home.y);
        h.lockRoom(target, false);
        bus.emit('sfx', { id: 'warpArrive' });
      }
      h.cinematic(false);
      h.freezeRooms(false);
      if (overlay) {
        const o = overlay;
        this.scene.tweens.add({ targets: o, alpha: 0, duration: 500, onComplete: () => o.destroy() });
      }
      this.setIdle();
    };
    const s = new Seq(S.timeoutSec + S.hopSec, (t, dt) => {
      if (!arrived || returned) return;
      // 넘어간 칸에서: 가끔 파편으로 거든다, 다 잡으면 돌아온다
      attack -= dt;
      if (attack <= 0) {
        attack = S.attackGapSec;
        const o = this.at();
        const pl = host.playerPos();
        const a0 = Math.atan2(pl.y - o.y, pl.x - o.x);
        for (let k = -2; k <= 2; k++) host.fireEnemyBullet(o, a0 + k * 0.22, this.A.shards.speed, this.A.shards.range, this.dmg(this.A.shards.damage), true, this.ref(this.A.art.shard));
        this.pose('command');
      }
      if (this.summons.every((e) => e.dead) && t > S.hopSec + 1) goBack();
    });
    s.at(S.hopSec, () => {
      if (this.enemy.dead) return;
      h.cinematic(true);
      h.freezeRooms(true);
      overlay = h.floorOverlay(h.roomRect(target), chapter, S.overlayAlpha);
      h.movePlayer({ x: tar.x + tar.w / 2, y: tar.y + tar.h * 0.75 });
      (this.enemy.sprite.body as Phaser.Physics.Arcade.Body).reset(tar.x + tar.w / 2, tar.y + tar.h * 0.25);
      h.lockRoom(target, true);
      this.pose('appear');
      bus.emit('sfx', { id: 'warpArrive' });
      shake(this.scene, 'medium');
      arrived = true;
      const c = { x: tar.x + tar.w / 2, y: tar.y + tar.h * 0.45 };
      plan.normals.forEach((id, i) => {
        const a = (i / plan.normals.length) * Math.PI * 2;
        const at = { x: c.x + Math.cos(a) * S.spreadPx, y: c.y + Math.sin(a) * S.spreadPx * 0.6 };
        this.fx(this.A.art.portal, at.x, at.y, this.A.art.portalPx * 0.6).setBlendMode('ADD');
        this.summons.push(host.spawnMinion(id, at));
      });
      if (plan.boss) {
        this.fx(this.A.art.portal, c.x, c.y, this.A.art.portalPx * 1.4).setBlendMode('ADD');
        this.summons.push(h.summonBoss(plan.boss, c, S.bossHpMul, S.bossDamageMul));
      }
      this.scene.time.delayedCall(400, () => h.cinematic(false));
    });
    // 시간이 다 되면 돌아온다
    s.at(S.timeoutSec + S.hopSec - 0.01, goBack);
    return {
      update: (dt) => {
        if (returned) return false;
        return s.update(dt);
      },
      destroy: () => {
        goBack();
        s.destroy();
      },
    };
  }

  /** 격파·정리: 부른 적과 연출을 모두 치운다 */
  destroy(): void {
    this.run?.destroy();
    this.run = null;
    this.clash?.destroy();
    this.clash = null;
    for (const e of this.summons) if (!e.dead) this.hooks.removeEnemy(e);
    this.summons = [];
    this.hooks.cinematic(false);
    this.hooks.freezeRooms(false);
    this.hooks.focus(null);
    this.hooks.zoom(1, 300);
    this.hooks.stageLabel(null);
    this.hooks.cinema({ bars: false, white: 0, big: null, ms: 200 });
    if (this.enemy.dead) {
      this.hooks.say(['acro.line.death1', 'acro.line.death2'], 'ominous');
      shake(this.scene, 'heavy');
      this.fx(this.A.art.implode, this.enemy.sprite.x, this.enemy.sprite.y, this.A.art.burstPx * 1.6, 7).setBlendMode('ADD');
      this.scene.time.delayedCall(900, () => this.hooks.redSpace(false));
    } else this.hooks.redSpace(false);
  }
}

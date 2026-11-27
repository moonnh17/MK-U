/**
 * 4-5 헥타르 학파 연구원 미모사 (제안): 맵 위쪽이 부서지고 포털에서 내려와 기계 위에 누운 채 움직이지 않고 공격한다.
 * 3페이즈(체력 2/3·1/3), 광범위 공격, 시스템 변조 3종(전조 → 발동 → 원복). 수치·규칙은 overflow.json mimosa,
 * 공식은 systems/mimosa.ts. 전투 씬의 bossControllers에 BossControl로 들어간다.
 */
import Phaser from 'phaser';
import { bus } from '../../core/events';
import { hexColor } from '../../core/scale';
import type { Enemy } from '../../entities/enemy';
import { shake } from '../../entities/juice';
import { DelayedBlast, Ring } from '../../entities/hazard';
import type { Rect } from '../../entities/hazard';
import { animKey } from '../../systems/art';
import type { EvolutionState } from '../../systems/evolution';
import {
  coverRects,
  coverShadows,
  derangement,
  dropCells,
  makeGrid,
  makeScan,
  mimosaPhase,
  observation,
  purgeCells,
  satelliteMarks,
  shiftCells,
  tamperBlocksAttacks,
  tamperStage,
  type Grid,
  type PatchRule,
  type TamperKind,
  type TamperStage,
} from '../../systems/mimosa';
import type { BossCore, MimosaData, MimosaPatternDef } from '../../types/data';
import type { BossHost } from '../host';
import { CoverLaser, GridStrike, ScanSweep } from './hazards';

/** 전투 씬의 보스 조종기 공통 모양 (BossController와 미모사) */
export interface BossControl {
  readonly def: Pick<BossCore, 'id' | 'enrageAt' | 'unlocks'>;
  readonly enraged: boolean;
  update(dt: number, host: BossHost): void;
  destroy(): void;
}

export type MimosaUiEvent =
  | { kind: 'scan' }
  | { kind: 'patch'; rule: PatchRule }
  | { kind: 'rollback' }
  | { kind: 'shuffleWarn' }
  | { kind: 'shuffle'; perm: number[] }
  | { kind: 'shuffleBack' }
  | { kind: 'glitch'; on: boolean }
  | { kind: 'observe'; lines: string[] }
  | { kind: 'crack' }
  | { kind: 'clear' };

/** 미모사가 전투 씬에 바라는 것 (변조는 표시·입력 쪽이라 씬이 맡는다) */
export interface MimosaHooks {
  setPatch(rules: PatchRule[]): void;
  setSlotPerm(perm: number[] | null): void;
  setGlitch(on: boolean): void;
  ui(ev: MimosaUiEvent): void;
  /** 미니 대사 (텍스트 키) */
  say(keys: string[], mood: 'calm' | 'ominous'): void;
  evolution(): EvolutionState | null;
  /** 보스 이름 띠 */
  band(): void;
  /** 등장 동안 카메라가 볼 곳 (null이면 원래대로) */
  focus(at: { x: number; y: number } | null): void;
  activeSlots: number;
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

export class MimosaController implements BossControl {
  readonly def: Pick<BossCore, 'id' | 'enrageAt' | 'unlocks'>;
  private phase = 1;
  private introLeft: number;
  private idle: number;
  private run: Run | null = null;
  private cooldowns: Record<string, number> = {};
  private last: string | null = null;
  private tamper: { kind: TamperKind; t: number; stage: TamperStage; run: Seq } | null = null;
  private tamperIn = 0;
  private transitionLeft = 0;
  private readonly grid: Grid;
  private host: BossHost | null = null;
  private fields: Enemy[] = [];
  private calls: Enemy[] = [];
  private gfx: Phaser.GameObjects.GameObject[] = [];
  private obs = { takenMul: 1, damageMul: 1, gapMul: 1 };
  private poseLeft = 0;
  private readonly home: { x: number; y: number };
  private readonly floor: Phaser.GameObjects.Graphics;
  private floorT = 0;

  constructor(
    readonly enemy: Enemy,
    private readonly M: MimosaData,
    private readonly arena: Rect,
    private readonly hooks: MimosaHooks,
    private readonly scene: Phaser.Scene,
    /** 오버플로우 장 배율·보스 진화 피해 */
    private readonly damageMul = 1,
  ) {
    this.def = { id: enemy.def.id, enrageAt: 0, unlocks: M.phases };
    this.grid = makeGrid(arena, M.grid.cellPx);
    this.home = { x: arena.x + arena.w / 2, y: arena.y + M.intro.topOffset };
    (enemy.sprite.body as Phaser.Physics.Arcade.Body).reset(this.home.x, this.home.y);
    enemy.sprite.setImmovable(true).setAlpha(0);
    const i = M.intro;
    this.introLeft = i.breakSec + i.portalSec + i.descendSec;
    enemy.warn = this.introLeft + 0.1;
    this.idle = M.firstDelaySec;
    this.floor = scene.add.graphics().setDepth(0.6);
    this.hooks.focus({ x: this.home.x, y: this.home.y + 20 });
    this.playIntro();
    this.playPose('idle');
  }

  get enraged(): boolean {
    return this.phase >= 3;
  }

  // ---------- 등장 ----------

  /** 맵 위쪽이 부서지고 포털이 열려 미모사가 내려온다 */
  private playIntro(): void {
    const i = this.M.intro;
    const s = this.scene;
    const a = this.arena;
    const color = hexColor(i.color);
    const x = this.home.x;
    const top = a.y;
    // 부서지는 위쪽 벽: 금 → 구멍
    const crack = s.add.graphics().setDepth(1.5);
    this.gfx.push(crack);
    s.time.delayedCall(0, () => {
      shake(s, 'medium');
      bus.emit('sfx', { id: 'bossSlam' });
    });
    s.tweens.addCounter({
      from: 0,
      to: 1,
      duration: i.breakSec * 1000,
      onUpdate: (tw) => {
        const k = tw.getValue() ?? 0;
        crack.clear().lineStyle(1, color, 0.9);
        for (let j = -3; j <= 3; j++) crack.lineBetween(x + j * 8 * k, top - 4, x + j * 14 * k, top + 6 + Math.abs(j) * 3 * k);
        crack.fillStyle(0x000000, 0.9 * k).fillRect(x - 60 * k, top - 8, 120 * k, 10);
        crack.lineStyle(1, color, 0.6 * k).strokeRect(x - 60 * k, top - 8, 120 * k, 10);
      },
      onComplete: () => {
        shake(s, 'heavy');
        bus.emit('sfx', { id: 'explosionLarge' });
        for (let j = 0; j < i.debris; j++) {
          const bit = s.add.rectangle(x + (j - i.debris / 2) * 10, top, 3 + (j % 3), 3 + (j % 2), 0xc8dde2).setDepth(3);
          s.tweens.add({ targets: bit, y: top + 30 + (j * 37) % 70, x: bit.x + ((j * 13) % 21) - 10, angle: 180, alpha: 0, duration: 700, onComplete: () => bit.destroy() });
        }
      },
    });
    // 포털
    s.time.delayedCall(i.breakSec * 1000, () => {
      const portal = s.add.sprite(x, this.home.y - 6, i.portalKey).setDepth(2).setTint(color).setBlendMode('ADD').setAlpha(0);
      if (portal.texture.key === '__MISSING') portal.setVisible(false);
      portal.setDisplaySize(1, 1);
      this.gfx.push(portal);
      bus.emit('sfx', { id: 'warp' });
      s.tweens.add({ targets: portal, displayWidth: i.portalPx, displayHeight: i.portalPx * 0.55, alpha: 0.9, duration: i.portalSec * 1000, ease: 'Back.easeOut' });
      s.tweens.add({ targets: portal, alpha: 0, duration: 500, delay: (i.portalSec + i.descendSec) * 1000, onComplete: () => portal.destroy() });
      this.hooks.band();
    });
    // 내려오기
    s.time.delayedCall((i.breakSec + i.portalSec) * 1000, () => {
      const e = this.enemy;
      e.sprite.setY(this.home.y - 30).setAlpha(0);
      s.tweens.add({ targets: e.sprite, y: this.home.y, alpha: 1, duration: i.descendSec * 1000, ease: 'Sine.easeOut' });
      this.hooks.say(['mimosa.line.intro'], 'calm');
    });
  }

  // ---------- 매 프레임 ----------

  update(dt: number, host: BossHost): void {
    this.host = host;
    const e = this.enemy;
    this.drawFloor(dt);
    this.fields = this.fields.filter((f) => {
      if (!f.dead) return true;
      this.fieldBreak(f);
      return false;
    });
    this.calls = this.calls.filter((c) => !c.dead);
    // 역장·관측 결과: 받는 피해
    e.guardMul = (this.fields.length > 0 ? this.M.field.takenMul : 1) * this.obs.takenMul;
    if (e.dead) return;
    if (this.introLeft > 0) {
      this.introLeft -= dt;
      e.sprite.setVelocity(0, 0);
      if (this.introLeft <= 0) {
        (e.sprite.body as Phaser.Physics.Arcade.Body).reset(this.home.x, this.home.y);
        this.hooks.focus(null);
      }
      return;
    }
    e.sprite.setVelocity(0, 0);
    if (this.poseLeft > 0) {
      this.poseLeft -= dt;
      if (this.poseLeft <= 0) this.playPose('idle');
    }
    for (const k of Object.keys(this.cooldowns)) this.cooldowns[k] = Math.max(0, this.cooldowns[k]! - dt);
    // 페이즈
    const ph = mimosaPhase(e.hp / e.maxHp, this.M.phases);
    if (ph > this.phase) {
      this.phase = ph;
      this.enterPhase(ph);
    }
    if (this.transitionLeft > 0) {
      this.transitionLeft -= dt;
      return;
    }
    this.updateTamper(dt);
    if (this.run && !this.run.update(dt)) {
      this.run.destroy();
      this.run = null;
      this.idle = (this.M.gapSec[String(this.phase)] ?? 1) * this.obs.gapMul;
    }
    if (this.run) return;
    this.idle -= dt;
    if (this.idle > 0) return;
    // 연산 오류는 표시만 흔들어 공격을 막지 않는다
    if (this.tamper && this.tamper.kind !== 'computeError' && tamperBlocksAttacks(this.tamper.stage)) return;
    // 곧 변조가 시작되면 새 공격을 열지 않는다 (변조 앞 쉼이 실제로 비게)
    if (this.pendingTamper) return;
    this.startPattern();
  }

  private patternsNow(): MimosaPatternDef[] {
    const room = this.tamperRoom();
    return this.M.patterns.filter((p) => p.phases.includes(this.phase) && (this.cooldowns[p.id] ?? 0) <= 0 && p.id !== this.last && this.allowed(p.id) && p.durationSec <= room);
  }

  /** 변조 발동 중이면 원복 전에 끝나는 공격만 (원복 앞뒤 쉼을 지킨다) */
  private tamperRoom(): number {
    if (!this.tamper || this.tamper.kind === 'computeError') return Infinity;
    const T = this.M.tamper[this.tamper.kind];
    return T.quietSec + T.telegraphSec + T.activeSec - this.tamper.t;
  }

  private allowed(id: string): boolean {
    if (id === 'field') return this.fields.length === 0;
    if (id === 'call') return this.calls.length === 0;
    return true;
  }

  private startPattern(): void {
    const host = this.host!;
    const pool = this.patternsNow();
    if (pool.length === 0) {
      this.idle = 0.3;
      return;
    }
    const p = host.rng.weighted(pool.map((x) => ({ item: x, weight: x.weight })));
    this.cooldowns[p.id] = p.cooldownSec;
    this.last = p.id;
    this.run = this.makePattern(p);
  }

  private dmg(v: number): number {
    return v * this.damageMul * this.obs.damageMul;
  }

  // ---------- 페이즈 전환 ----------

  private enterPhase(ph: number): void {
    const e = this.enemy;
    const host = this.host!;
    this.run?.destroy();
    this.run = null;
    this.transitionLeft = this.M.transitionSec;
    e.invuln = this.M.transitionSec;
    this.floorT = 0;
    this.flashGrid(0.9);
    shake(this.scene, 'heavy');
    host.bossPhaseFx(host.t(`boss.unlock.${this.def.id}.${ph - 1}`), this.M.color, { x: e.sprite.x, y: e.sprite.y });
    if (ph === 2) {
      this.hooks.say(['mimosa.line.phase2'], 'ominous');
      // 첫 패치 노트는 전환 직후에
      this.tamperIn = this.M.transitionSec;
      this.queueTamper('patchNote', 0);
    } else if (ph === 3) {
      this.hooks.say(['mimosa.line.phase3'], 'ominous');
      e.sprite.setAlpha(0.85);
      this.hooks.ui({ kind: 'glitch', on: true });
      this.scene.time.delayedCall(700, () => this.hooks.ui({ kind: 'glitch', on: false }));
      this.applyObservation();
      this.tamperIn = this.M.transitionSec + host.rng.range(...(this.M.tamperEverySec['3'] ?? [8, 10]));
    }
  }

  /** 관측 결과: 고른 진화 중 체력·공격·속도 계열이 보스에게 (제안) */
  private applyObservation(): void {
    const o = observation(this.hooks.evolution(), this.M.observation);
    this.obs = { takenMul: o.takenMul, damageMul: o.damageMul, gapMul: o.gapMul };
    const t = this.host!.t;
    const lines = [t('mimosa.observe.title')];
    if (o.counts.hp > 0) lines.push(t('mimosa.observe.hp').replace('{n}', String(Math.round((1 - o.takenMul) * 100))));
    if (o.counts.attack > 0) lines.push(t('mimosa.observe.attack').replace('{n}', String(Math.round((o.damageMul - 1) * 100))));
    if (o.counts.speed > 0) lines.push(t('mimosa.observe.speed').replace('{n}', String(Math.round((1 - o.gapMul) * 100))));
    if (lines.length === 1) lines.push(t('mimosa.observe.none'));
    this.hooks.ui({ kind: 'observe', lines });
  }

  // ---------- 시스템 변조 ----------

  private pendingTamper: { kind: TamperKind; inSec: number } | null = null;

  private queueTamper(kind: TamperKind, inSec: number): void {
    this.pendingTamper = { kind, inSec };
  }

  private updateTamper(dt: number): void {
    const host = this.host!;
    if (this.tamper) {
      this.tamper.t += dt;
      this.tamper.stage = tamperStage(this.tamper.t, this.M.tamper[this.tamper.kind]);
      if (!this.tamper.run.update(dt) || this.tamper.stage === 'done') {
        this.tamper.run.destroy();
        this.tamper = null;
        const r = this.M.tamperEverySec[String(this.phase)];
        if (r) this.tamperIn = host.rng.range(r[0], r[1]);
      }
      return;
    }
    if (this.pendingTamper) {
      this.pendingTamper.inSec -= dt;
      if (this.pendingTamper.inSec <= 0 && !this.run) {
        this.startTamper(this.pendingTamper.kind);
        this.pendingTamper = null;
      }
      return;
    }
    if (this.phase < 2) return;
    this.tamperIn -= dt;
    // 공격 중에는 시작하지 않는다 (변조 앞 쉼이 실제로 비어 있게)
    if (this.tamperIn > 0 || (this.run && this.phase < 3)) return;
    // 2페이즈: 패치 노트·슬롯 셔플 번갈아, 3페이즈: 연산 오류 (간헐 반복)
    const kind: TamperKind = this.phase >= 3 ? 'computeError' : host.rng.chance(0.5) ? 'patchNote' : 'slotShuffle';
    this.startTamper(kind);
  }

  private startTamper(kind: TamperKind): void {
    const T = this.M.tamper[kind];
    const host = this.host!;
    const tele = T.quietSec;
    const act = tele + T.telegraphSec;
    const back = act + T.activeSec;
    const total = back + T.rollbackSec + T.quietSec;
    const s = new Seq(total);
    const h = this.hooks;
    if (kind === 'patchNote') {
      const rule = host.rng.pick(this.M.tamper.patchNote.rules);
      s.at(tele, () => {
        h.ui({ kind: 'scan' });
        h.say(['mimosa.line.patch'], 'calm');
        bus.emit('sfx', { id: 'electric' });
        this.playPose('command');
      })
        .at(act, () => {
          h.setPatch([rule]);
          h.ui({ kind: 'patch', rule });
          bus.emit('sfx', { id: 'warning' });
        })
        .at(back, () => {
          h.setPatch([]);
          h.ui({ kind: 'rollback' });
          bus.emit('sfx', { id: 'uiClick' });
        })
        .onDestroy(() => h.setPatch([]));
    } else if (kind === 'slotShuffle') {
      s.at(tele, () => {
        h.ui({ kind: 'shuffleWarn' });
        h.say(['mimosa.line.shuffle'], 'calm');
        bus.emit('sfx', { id: 'warning' });
        this.playPose('swing');
      })
        .at(act, () => {
          const perm = derangement(host.rng, h.activeSlots);
          h.setSlotPerm(perm);
          h.ui({ kind: 'shuffle', perm });
          bus.emit('sfx', { id: 'cardPick' });
        })
        .at(back, () => {
          h.setSlotPerm(null);
          h.ui({ kind: 'shuffleBack' });
          bus.emit('sfx', { id: 'heal' });
        })
        .onDestroy(() => h.setSlotPerm(null));
    } else {
      // 연산 오류: 말이 끊기고 → 표시가 깨지고 → 돌아온다 (판정은 그대로)
      s.at(tele, () => h.say(['mimosa.line.errorCut'], 'ominous'))
        .at(act, () => {
          h.setGlitch(true);
          h.ui({ kind: 'glitch', on: true });
          h.say(['mimosa.line.error1', 'mimosa.line.error2'], 'ominous');
          bus.emit('sfx', { id: 'electric' });
        })
        .at(back, () => {
          h.setGlitch(false);
          h.ui({ kind: 'glitch', on: false });
        })
        .onDestroy(() => {
          h.setGlitch(false);
          h.ui({ kind: 'glitch', on: false });
        });
    }
    this.tamper = { kind, t: 0, stage: 'quietBefore', run: s };
  }

  // ---------- 패턴 ----------

  private makePattern(p: MimosaPatternDef): Run {
    switch (p.id) {
      case 'drones':
        return this.drones(p);
      case 'gridDrop':
        return this.gridDrop(p);
      case 'field':
        return this.field(p);
      case 'scan':
        return this.scan(p);
      case 'call':
        return this.call(p);
      case 'gridShift':
        return this.gridShift(p);
      case 'pulse':
        return this.pulse(p);
      case 'satellite':
        return this.satellite(p);
      case 'laser':
        return this.laser(p);
      case 'purge':
        return this.purge(p);
    }
  }

  /** 드론 전개: 공전한 뒤 각 드론이 플레이어를 노려 교차 사격 */
  private drones(p: MimosaPatternDef): Run {
    const D = this.M.drones;
    const host = this.host!;
    const n = D.countByPhase[String(this.phase)] ?? 4;
    const c = this.home;
    const sprites = Array.from({ length: n }, () => {
      const sp = this.scene.add.sprite(c.x, c.y, D.spriteKey).setDepth(4).setTint(hexColor(this.M.color));
      sp.setDisplaySize(D.size, D.size);
      return sp;
    });
    let ang = 0;
    const pos = (i: number) => ({ x: c.x + Math.cos(ang + (i * Math.PI * 2) / n) * D.orbitRadius, y: c.y + 14 + Math.sin(ang + (i * Math.PI * 2) / n) * D.orbitRadius * 0.7 });
    this.playPose('swing');
    const s = new Seq(p.durationSec, (_t, dt) => {
      ang += D.spinPerSec * dt;
      sprites.forEach((sp, i) => sp.setPosition(pos(i).x, pos(i).y));
    });
    for (let v = 0; v < D.volleys; v++) {
      s.at(D.orbitSec + v * D.volleyGapSec, () => {
        const pl = host.playerPos();
        bus.emit('sfx', { id: 'shotLaser' });
        sprites.forEach((_sp, i) => {
          const at = pos(i);
          host.fireEnemyBullet(at, Math.atan2(pl.y - at.y, pl.x - at.x), D.shotSpeed, D.shotRange, this.dmg(D.damage), true);
        });
      });
    }
    return s.onDestroy(() => sprites.forEach((sp) => sp.destroy()));
  }

  /** 격자 낙하: 예고 칸 후 일제 낙하 */
  private gridDrop(p: MimosaPatternDef): Run {
    const G = this.M.grid;
    const host = this.host!;
    this.playPose('command');
    host.addHazard(new GridStrike(this.scene, this.grid, dropCells(host.rng, this.grid, G.dropRatio), p.warnSec ?? G.dropWarnSec, this.dmg(G.dropDamage), hexColor(G.color)));
    return new Seq(p.durationSec);
  }

  /** 역장 전개: 발생기가 있는 동안 보스 받는 피해 감소, 부수면 척력 충격파 */
  private field(p: MimosaPatternDef): Run {
    const F = this.M.field;
    const host = this.host!;
    const n = F.countByPhase[String(this.phase)] ?? 1;
    this.playPose('command');
    for (let i = 0; i < n; i++) {
      const side = n === 1 ? 0 : i === 0 ? -1 : 1;
      const at = { x: this.home.x + side * F.offset * 1.6, y: this.home.y + F.offset };
      const f = host.spawnMinion('mimosaField', at, F.hp);
      this.fields.push(f);
    }
    bus.emit('sfx', { id: 'skill' });
    return new Seq(p.durationSec);
  }

  private fieldBreak(f: Enemy): void {
    const F = this.M.field;
    const host = this.host;
    if (!host) return;
    const at = { x: f.sprite.x, y: f.sprite.y };
    host.addHazard(
      new Ring(this.scene, { center: at, fromR: 4, toR: 260, moveSec: 260 / F.ringSpeed, telegraphSec: 0, holdSec: 0, thickness: F.ringThickness, damage: this.dmg(F.ringDamage), tickSec: 0, color: hexColor(F.color) }),
    );
    // 척력: 플레이어를 밀어낸다 (패치 노트 중력이면 끌려온다)
    const p = host.playerPos();
    const d = Math.hypot(p.x - at.x, p.y - at.y) || 1;
    for (let i = 0; i < 6; i++) this.scene.time.delayedCall(i * 16, () => host.pushPlayer({ x: ((p.x - at.x) / d) * F.pushPx, y: ((p.y - at.y) / d) * F.pushPx }));
    shake(this.scene, 'medium');
    bus.emit('sfx', { id: 'explosionMid' });
  }

  /** 격자 스캔: 1페이즈 느린 한 줄, 2·3페이즈 빠른 가로·세로 교차 */
  private scan(p: MimosaPatternDef): Run {
    const S = this.M.scan;
    const host = this.host!;
    const fast = this.phase >= 2;
    const warn = fast ? S.warnSecFast : S.warnSecSlow;
    const speed = fast ? S.speedFast : S.speedSlow;
    const axes: ('h' | 'v')[] = fast ? ['h', 'v'] : [host.rng.chance(0.5) ? 'h' : 'v'];
    this.playPose('swing');
    for (const ax of axes) host.addHazard(new ScanSweep(this.scene, this.arena, makeScan(host.rng, this.arena, ax, S.width, speed, S.gaps, S.gapPx), Math.max(warn, p.warnSec ?? 0), this.dmg(S.damage), hexColor(S.color)));
    const longest = Math.max(this.arena.w, this.arena.h) / speed + warn;
    return new Seq(Math.min(p.durationSec, longest));
  }

  /** 호출: 헥타르 전투원 2 + 수석 연구원 1 (진화 적용) */
  private call(p: MimosaPatternDef): Run {
    const host = this.host!;
    this.playPose('command');
    const ids = this.M.call.enemies.slice(0, this.M.call.maxAlive);
    ids.forEach((id, i) => {
      const at = { x: this.arena.x + this.arena.w * ((i + 1) / (ids.length + 1)), y: this.home.y + 70 };
      this.calls.push(host.spawnMinion(id, at));
    });
    bus.emit('sfx', { id: 'warp' });
    return new Seq(p.durationSec);
  }

  /** 격자 이동: 위험·안전 띠가 한 칸씩 옮겨 가며 차례로 떨어진다 */
  private gridShift(p: MimosaPatternDef): Run {
    const G = this.M.grid;
    const host = this.host!;
    const warn = p.warnSec ?? G.shiftWarnSec;
    const start = host.rng.int(0, G.shiftBandCols * 2 - 1);
    this.playPose('command');
    const s = new Seq(p.durationSec);
    for (let i = 0; i < G.shiftSteps; i++) {
      s.at(i * (warn + G.shiftGapSec), () => host.addHazard(new GridStrike(this.scene, this.grid, shiftCells(this.grid, start + i, G.shiftBandCols), warn, this.dmg(G.shiftDamage), hexColor(G.color))));
    }
    return s;
  }

  /** 전역 척력 펄스: 단말에서 틈 있는 고리가 박자에 맞춰 퍼진다 */
  private pulse(p: MimosaPatternDef): Run {
    const P = this.M.pulse;
    const host = this.host!;
    const base = host.rng.range(0, Math.PI * 2);
    this.playPose('swing');
    const s = new Seq(p.durationSec);
    for (let i = 0; i < P.rings; i++) {
      s.at(i * P.gapSec, () => {
        bus.emit('sfx', { id: 'bossSlam' });
        host.addHazard(
          new Ring(this.scene, {
            center: { x: this.home.x, y: this.home.y + 10 },
            fromR: 6,
            toR: P.toR,
            moveSec: P.moveSec,
            telegraphSec: i === 0 ? (p.warnSec ?? P.warnSec) : P.warnSec * 0.5,
            holdSec: 0,
            thickness: P.thickness,
            damage: this.dmg(P.damage),
            tickSec: 0,
            color: hexColor(P.color),
            gapAngle: Math.PI / 2 + base + (i % 2 ? 0.9 : -0.9),
            gapDeg: P.gapDeg,
          }),
        );
      });
    }
    return s;
  }

  /** 위성 포격: 조준 표지 후 순차 낙하 (첫 발은 플레이어 자리) */
  private satellite(p: MimosaPatternDef): Run {
    const S = this.M.satellite;
    const host = this.host!;
    const marks = satelliteMarks(host.rng, this.arena, host.playerPos(), S.count, S.maxCount, S.radius);
    this.playPose('command');
    marks.forEach((m, i) => host.addHazard(new DelayedBlast(this.scene, m, S.radius, (p.warnSec ?? S.warnSec) + i * S.stepSec, this.dmg(S.damage), hexColor(S.color))));
    return new Seq(p.durationSec);
  }

  /** 전역 레이저: 엄폐물 뒤(아래)만 안전 */
  private laser(p: MimosaPatternDef): Run {
    const L = this.M.laser;
    const host = this.host!;
    const covers = coverRects(host.rng, this.arena, L.covers, L.coverW, L.coverH);
    this.playPose('command');
    this.hooks.say(['mimosa.line.laser'], 'ominous');
    host.addHazard(new CoverLaser(this.scene, this.arena, covers, coverShadows(this.arena, covers), Math.max(L.chargeSec, p.warnSec ?? 0), this.dmg(L.damage), hexColor(L.color), hexColor(L.coverColor)));
    return new Seq(p.durationSec);
  }

  /** 최종 정리: 안전 칸 1~2개만 남기고 일제 낙하 */
  private purge(p: MimosaPatternDef): Run {
    const G = this.M.grid;
    const host = this.host!;
    const { danger, safe } = purgeCells(host.rng, this.grid, G.purgeSafeCells);
    this.playPose('command');
    this.hooks.say(['mimosa.line.purge'], 'ominous');
    host.addHazard(new GridStrike(this.scene, this.grid, danger, Math.max(G.purgeWarnSec, p.warnSec ?? 0), this.dmg(G.purgeDamage), hexColor(G.color), safe, G.purgeHighlightSec));
    return new Seq(p.durationSec);
  }

  // ---------- 그림 ----------

  private playPose(name: 'idle' | 'swing' | 'command'): void {
    const sp = this.enemy.sprite;
    const key = animKey(sp.texture.key, name);
    if (!sp.scene.anims.exists(key)) return;
    this.enemy.poseHold = name !== 'idle';
    sp.play(key);
    this.poseLeft = name === 'idle' ? 0 : 0.9;
  }

  /** 시뮬레이션 격자 바닥 (페이즈 전환 때 번쩍) */
  private drawFloor(dt: number): void {
    this.floorT += dt;
    const g = this.grid;
    const a = this.arena;
    const flash = Math.max(0, 1 - this.floorT / 0.6);
    const alpha = this.M.grid.lineAlpha + flash * 0.5 + (this.phase >= 3 ? 0.04 * Math.sin(this.floorT * 9) : 0);
    this.floor.clear().lineStyle(1, hexColor(this.M.grid.color), alpha);
    for (let c = 1; c < g.cols; c++) this.floor.lineBetween(a.x + c * g.cw, a.y, a.x + c * g.cw, a.y + a.h);
    for (let r = 1; r < g.rows; r++) this.floor.lineBetween(a.x, a.y + r * g.ch, a.x + a.w, a.y + r * g.ch);
  }

  private flashGrid(_k: number): void {
    this.floorT = 0;
  }

  /** 격파·정리: 변조를 모두 되돌리고 시뮬레이션 균열 연출 */
  destroy(): void {
    this.run?.destroy();
    this.run = null;
    this.tamper?.run.destroy();
    this.tamper = null;
    this.hooks.setPatch([]);
    this.hooks.setSlotPerm(null);
    this.hooks.setGlitch(false);
    this.hooks.focus(null);
    this.hooks.ui({ kind: 'clear' });
    if (this.enemy.dead) {
      this.hooks.ui({ kind: 'crack' });
      this.hooks.say(['mimosa.line.death1', 'mimosa.line.death2'], 'ominous');
      shake(this.scene, 'heavy');
    }
    for (const f of this.fields) if (!f.dead) this.host?.removeMinion(f);
    for (const c of this.calls) if (!c.dead) this.host?.removeMinion(c);
    this.fields = [];
    this.calls = [];
    for (const o of this.gfx) o.destroy();
    this.gfx = [];
    this.floor.destroy();
  }
}

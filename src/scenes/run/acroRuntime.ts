/**
 * 아크로 미모사가 전투 씬에 바라는 것: 칸 넘나들기(플레이어 옮기기·방 잠금·입장 막기·다른 장 바닥),
 * 연출(입력 잠금·카메라 배율), 3페이즈 무너진 붉은 공간, 전용 스토리 대화, 약화 보스 소환, 디버프 아이템.
 */
import Phaser from 'phaser';
import { bus } from '../../core/events';
import { hexColor } from '../../core/scale';
import type { AcroHooks } from '../../bosses/mimosa/acroController';
import type { Rect } from '../../entities/hazard';
import { artDensity, artKeys } from '../../systems/art';
import { interiorRect, roomRect } from '../../systems/worldLayout';
import type { RunScene } from '../RunScene';

export class AcroRuntime {
  /** 연출 중: 입력이 막히고 맞지 않는다 */
  cinematic = false;
  /** 넘나드는 동안 방 입장(웨이브·조우)을 막는다 */
  frozen = false;
  private red: Phaser.GameObjects.GameObject[] = [];
  private redTweens: Phaser.Tweens.Tween[] = [];

  constructor(private readonly run: RunScene) {}

  reset(): void {
    this.cinematic = false;
    this.frozen = false;
    this.clearRed();
  }

  hooks(): AcroHooks {
    const run = this.run;
    const node = (id: number) => run.session.map.rooms[id]!;
    return {
      say: (keys, mood) => run.progression.mini.push(keys.map((k) => ({ text: run.ctx.t(k), mood })), 3),
      band: () => {
        const e = [...run.bossControllers.keys()].find((x) => x.def.id === run.ctx.data.overflow.acro.enemyId);
        if (!e) return;
        bus.emit('bossIntroBand', { name: run.ctx.t(e.nameKey), sub: run.ctx.t('boss.intro.stage', { chapter: run.session.stage.chapter, stage: run.session.stage.stage }) });
        run.time.delayedCall(run.ctx.data.overflow.acro.intro.bandSec * 1000, () => bus.emit('bossIntroBand', { name: '', sub: '' }));
      },
      focus: (at) => {
        run.cameraHold = at;
      },
      story: (event, then) => run.progression.playStory(event, run.ctx.data.overflow.acro.enemyId, then),
      rooms: () => run.session.map.rooms.map((r) => ({ id: r.id })),
      bossRoomId: () => run.session.map.rooms.find((r) => r.kind === 'bossRoom')?.id ?? run.session.map.startId,
      roomArena: (id) => interiorRect(node(id), run.m),
      roomRect: (id) => roomRect(node(id), run.m),
      movePlayer: (to) => {
        run.player.setPosition(to.x, to.y);
        (run.player.body as Phaser.Physics.Arcade.Body).reset(to.x, to.y);
        run.cameras.main.centerOn(to.x, to.y);
      },
      lockRoom: (id, locked) => run.roomRt.setRoomLocked(id, locked),
      freezeRooms: (on) => {
        this.frozen = on;
      },
      floorOverlay: (r, chapter, alpha) => {
        const key = artKeys.tile('floor', chapter);
        if (!run.textures.exists(key)) return null;
        const o = run.add.tileSprite(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, key).setTileScale(1 / artDensity(run.ctx.data.art, key)).setDepth(0.55).setAlpha(0);
        run.tweens.add({ targets: o, alpha, duration: 350 });
        return o;
      },
      roster: (chapter) => run.roomRt.chapterRoster([chapter]),
      summonBoss: (id, at, hpMul, damageMul) => run.roomRt.spawnBossMinion(id, at, hpMul, damageMul),
      removeEnemy: (e) => {
        if (!e.dead) run.enemyLife.removeEnemy(e);
      },
      debuff: () => run.loot.giveDebuff('acro'),
      zoom: (k, ms) => {
        const cam = run.cameras.main;
        const base = run.ctx.data.ui.camera.zoom * run.ctx.renderScale;
        run.tweens.killTweensOf(cam);
        run.tweens.add({ targets: cam, zoom: base * k, duration: Math.max(1, ms) });
      },
      cinematic: (on) => {
        this.cinematic = on;
        // 연출이 시작되면 밀린 미니 대사를 비운다 (화면을 가리지 않게)
        if (on) run.progression.mini.clear();
        if (on) run.player.setVelocity(0, 0);
      },
      redSpace: (on) => (on ? this.buildRed() : this.fadeRed()),
      reduceFx: () => !!run.ctx.save.data.reduceFx,
      cinema: (ev) => bus.emit('cinema', ev),
      stageLabel: (text) => {
        run.session.stageLabel = text;
      },
      hitStop: (sec) => run.hitStop.request(sec),
      stagePrefix: () => run.ctx.t('hud.stage', { chapter: run.session.stage.chapter, stage: '' }),
      // 연출 속 플레이어 공격: 들고 있는 무기를 실제로 휘두르거나 쏜다 (에너지는 쓰지 않음)
      playerStrike: (angle) => {
        const p = run.session.player;
        const energy = p.energy;
        run.aimDir = { x: Math.cos(angle), y: Math.sin(angle) };
        run.combat.fireCooldown = 0;
        run.combat.attack(angle, 0);
        p.energy = energy;
      },
      // 연출 속 스킬: 장착한 스킬을 차례로 아이콘·이름·고리로 보여 준다 (실제 발동은 하지 않음)
      playerSkillFx: (n) => {
        const d = run.ctx.data;
        const ids = run.session.player.loadout.active.filter((x): x is string => !!x);
        const id = ids.length > 0 ? ids[n % ids.length]! : null;
        const def = id ? d.skills.skills.find((s) => s.id === id) : undefined;
        const color = hexColor(def?.color ?? '#ffffff');
        const px = run.player.x;
        const py = run.player.y;
        const key = id ? artKeys.skillIcon(id) : '';
        if (key && run.textures.exists(key)) {
          const img = run.add.image(px, py - 14, key).setDepth(8).setDisplaySize(4, 4);
          run.tweens.add({ targets: img, displayWidth: 16, displayHeight: 16, y: py - 22, duration: 140, ease: 'Back.easeOut' });
          run.tweens.add({ targets: img, alpha: 0, delay: 260, duration: 220, onComplete: () => img.destroy() });
        }
        const ring = run.add.circle(px, py, 6).setStrokeStyle(2, color, 1).setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
        run.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: 380, ease: 'Cubic.easeOut', onComplete: () => ring.destroy() });
        if (def) run.floatLabel({ x: px, y: py - 26 }, run.ctx.t(def.nameKey), def.color);
      },
      data: run.ctx.data,
    };
  }

  /** 3페이즈: 보스방이 무너진 붉은 공간이 된다 (바닥·바깥 허공·붉은 가장자리·떠도는 잔해) */
  private buildRed(): void {
    this.clearRed();
    const run = this.run;
    const R = run.ctx.data.overflow.acro.redSpace;
    const room = run.session.map.rooms.find((r) => r.kind === 'bossRoom');
    if (!room) return;
    const a = interiorRect(room, run.m);
    const floor = run.textures.exists(R.floorKey)
      ? run.add.tileSprite(a.x + a.w / 2, a.y + a.h / 2, a.w, a.h, R.floorKey).setTileScale(1 / artDensity(run.ctx.data.art, R.floorKey)).setDepth(0.58).setTint(hexColor(R.floorTint))
      : run.add.rectangle(a.x + a.w / 2, a.y + a.h / 2, a.w, a.h, hexColor(R.voidColor)).setDepth(0.58);
    this.red.push(floor);
    // 바깥(벽·복도)은 허공으로 덮는다. 벽 판정은 그대로라 나갈 수는 없다
    const P = R.voidPad;
    const voidC = hexColor(R.voidColor);
    const rects: Rect[] = [
      { x: a.x - P, y: a.y - P, w: a.w + P * 2, h: P },
      { x: a.x - P, y: a.y + a.h, w: a.w + P * 2, h: P },
      { x: a.x - P, y: a.y, w: P, h: a.h },
      { x: a.x + a.w, y: a.y, w: P, h: a.h },
    ];
    for (const r of rects) this.red.push(run.add.rectangle(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, voidC).setDepth(1.6));
    // 가장자리: 붉게 갈라진 테두리가 숨쉰다
    const edge = run.add.graphics().setDepth(1.65);
    edge.lineStyle(2, hexColor(R.edgeColor), 0.9).strokeRect(a.x, a.y, a.w, a.h);
    edge.lineStyle(6, hexColor(R.edgeColor), 0.18).strokeRect(a.x - 2, a.y - 2, a.w + 4, a.h + 4);
    this.red.push(edge);
    this.redTweens.push(run.tweens.add({ targets: edge, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 }));
    // 떠도는 잔해 (허공 쪽)
    const rng = run.rng;
    for (let i = 0; i < R.rubble; i++) {
      const side = i % 4;
      const along = rng.range(0, 1);
      const off = rng.range(8, 60);
      const x = side === 0 || side === 1 ? a.x + a.w * along : side === 2 ? a.x - off : a.x + a.w + off;
      const y = side === 2 || side === 3 ? a.y + a.h * along : side === 0 ? a.y - off : a.y + a.h + off;
      const s = rng.range(3, 9);
      const bit = run.add.rectangle(x, y, s, s * rng.range(0.5, 1), hexColor(R.rubbleColor)).setDepth(1.62).setStrokeStyle(1, hexColor(R.edgeColor), 0.6).setAngle(rng.range(0, 90));
      this.red.push(bit);
      this.redTweens.push(run.tweens.add({ targets: bit, y: y + rng.range(-6, 6), angle: bit.angle + rng.range(-40, 40), duration: rng.range(1600, 3200), yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }));
    }
  }

  private fadeRed(): void {
    const list = this.red;
    const tw = this.redTweens;
    this.red = [];
    this.redTweens = [];
    if (list.length === 0) return;
    this.run.tweens.add({
      targets: list,
      alpha: 0,
      duration: 900,
      onComplete: () => {
        for (const t of tw) t.remove();
        for (const o of list) o.destroy();
      },
    });
  }

  private clearRed(): void {
    for (const t of this.redTweens) t.remove();
    for (const o of this.red) o.destroy();
    this.red = [];
    this.redTweens = [];
  }
}

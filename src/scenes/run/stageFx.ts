/** 연출: 보스 등장·처치, 포털 이동, 보스 경고, 배경 음악 선택, 첫 방 조작 안내. */
import Phaser from 'phaser';
import type { ActionFrame, Vec2 } from '../../core/actions';
import { bus } from '../../core/events';
import { hexColor } from '../../core/scale';
import { Enemy } from '../../entities/enemy';
import { pickTrack } from '../../systems/music';
import { shake } from '../../entities/juice';
import { bossIntroStage, bossIntroTotal, type IntroStage } from '../../systems/juice';
import { roomCenter } from '../../systems/worldLayout';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';
import { burst, motes, shockRing } from '../../bosses/bossFx';

export class StageFx {
  /** 보스 등장 컷 (그동안 게임은 멈춘다) */
  intro: { e: Enemy; t: number; stage: IntroStage } | null = null;
  tutorialTexts: Phaser.GameObjects.Text[] = [];

  constructor(private readonly run: RunScene) {}

  /** 보스 등장 컷 시작: 게임을 멈추고 카메라가 보스 쪽으로 다가간다 */
  startBossIntro(e: Enemy): void {
    const bi = this.run.ctx.data.juice.bossIntro;
    e.warn = bossIntroTotal(bi) + 0.1;
    e.sprite.setAlpha(0);
    this.intro = { e, t: 0, stage: 'pan' };
    this.run.setModal('intro');
    const cam = this.run.cameras.main;
    cam.pan(e.sprite.x, e.sprite.y, bi.panSec * 1000, 'Sine.easeInOut');
    cam.zoomTo(this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale * bi.zoom, bi.panSec * 1000);
  }

  /** 등장 컷 한 프레임: 단계가 바뀔 때마다 연출. 아무 키·탭이면 건너뛴다 */
  updateIntro(dt: number, frame: ActionFrame): void {
    const it = this.intro!;
    const d = this.run.ctx.data;
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
    const cam = this.run.cameras.main;
    if (st === 'drop') {
      // 커다랗게 떠 있다가 내려찍는다
      e.sprite.setAlpha(1).setScale(e.baseScale * 1.8);
      this.run.tweens.add({
        targets: e.sprite,
        scale: e.baseScale,
        duration: bi.dropSec * 1000,
        ease: 'Quad.easeIn',
        onComplete: () => {
          shake(this.run, 'heavy');
          sfx('bossSlam');
          this.run.juice.landing({ x: e.sprite.x, y: e.sprite.y }, e.radius);
        },
      });
    } else if (st === 'name') {
      const { stage } = this.run.session;
      const hidden = e.rank === 'hiddenBoss';
      const sub = hidden ? this.run.ctx.t('boss.intro.hidden') : this.run.ctx.t('boss.intro.stage', { chapter: stage.chapter, stage: stage.stage });
      bus.emit('bossIntroBand', { name: this.run.ctx.t(e.def.nameKey), sub });
    } else if (st === 'return') {
      bus.emit('bossIntroBand', { name: '', sub: '' });
      const tgt = this.run.cameraTarget();
      cam.pan(tgt.x, tgt.y, bi.returnSec * 1000, 'Sine.easeInOut');
      cam.zoomTo(this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale, bi.returnSec * 1000);
    } else if (st === 'done') {
      this.finishIntro();
    }
  }

  /** 등장 컷 끝 (또는 건너뜀): 카메라를 제자리로, 보스를 깨운다 */
  finishIntro(): void {
    const it = this.intro;
    if (!it) return;
    this.intro = null;
    const cam = this.run.cameras.main;
    cam.panEffect.reset();
    cam.zoomEffect.reset();
    cam.setZoom(this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale);
    const tgt = this.run.cameraTarget();
    cam.setScroll(tgt.x - cam.width / 2, tgt.y - cam.height / 2);
    this.run.tweens.killTweensOf(it.e.sprite);
    it.e.sprite.setAlpha(1).setScale(it.e.baseScale);
    it.e.warn = 0;
    bus.emit('bossIntroBand', { name: '', sub: '' });
    if (this.run.modal === 'intro') this.run.setModal(null);
  }

  /**
   * 포탈 타기: 게임을 멈추고 캐릭터가 포탈 가운데로 빨려 들어가며(돌며 작아짐) 카메라가 확대된다.
   * 다 들어가면 이동 화면(빛줄기)을 덮고 잠깐 뒤 then (카드 고르기).
   */
  /** 플레이어 사망: 번쩍인 뒤 쓰러지며 흩어지고, 카메라가 다가간다. 끝나면 then */
  playDeath(then: () => void): void {
    const r = this.run;
    const c = r.ctx.data.juice.playerDeath;
    const ms = c.sec * 1000;
    const pl = r.player;
    r.weaponSprite.setVisible(false);
    pl.setVelocity(0, 0).setAlpha(1).setTintFill(0xffffff);
    bus.emit('sfx', { id: 'playerHurt' });
    bus.emit('sfx', { id: 'panic' });
    r.cameras.main.flash(c.flashMs, 255, 60, 60);
    r.cameras.main.shake(c.flashMs * 2, 0.01 / r.ctx.renderScale);
    r.time.delayedCall(c.flashMs, () => pl.clearTint().setTint(hexColor(c.tint)));
    for (let i = 0; i < c.shards; i++) {
      const a = (i / c.shards) * Math.PI * 2;
      const dist = 16 + (i % 5) * 7;
      const shard = r.add.rectangle(pl.x, pl.y - 6, 2, 2, hexColor(c.tint)).setDepth(7);
      r.tweens.add({ targets: shard, x: pl.x + Math.cos(a) * dist, y: pl.y - 6 + Math.sin(a) * dist, alpha: 0, duration: ms * 0.7, ease: 'Quad.easeOut', onComplete: () => shard.destroy() });
    }
    r.tweens.add({ targets: pl, angle: pl.flipX ? -90 : 90, duration: ms * 0.35, ease: 'Bounce.easeOut' });
    r.tweens.add({ targets: pl, alpha: 0.35, delay: ms * 0.45, duration: ms * 0.5 });
    r.tweens.add({ targets: r.cameras.main, zoom: r.cameras.main.zoom * c.zoom, duration: ms, ease: 'Sine.easeInOut' });
    r.time.delayedCall(ms, then);
  }

  /**
   * 부활 연출 (쓰러진 뒤). hectar: 헥타르 기술식 — 바닥 진, 몸을 훑는 스캔선, 데이터 조각이 모여 재구성, 푸른 섬광.
   * holy: 하늘에서 노란 빛기둥과 십자가, 금빛 알갱이가 솟고 몸이 금빛으로 빛나며 일어난다.
   */
  playRevive(look: 'hectar' | 'holy', then: () => void): void {
    const r = this.run;
    const pl = r.player;
    const at = { x: pl.x, y: pl.y - 6 };
    const holy = look === 'holy';
    const color = holy ? 0xffd23f : 0x3a8aff;
    const glow = holy ? 0xfff2b0 : 0x9fe0ff;
    const sec = 1.6;
    const temp: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      temp.push(o);
      return o;
    };
    sfx('warning');
    if (holy) {
      // 하늘에서 내려오는 빛기둥
      const pillar = add(r.add.rectangle(at.x, at.y - 150, 22, 320, color, 0).setDepth(8).setBlendMode('ADD'));
      r.tweens.add({ targets: pillar, fillAlpha: 0.55, duration: 400, yoyo: true, hold: 700 });
      // 머리 위 십자가
      const v = add(r.add.rectangle(at.x, at.y - 30, 5, 30, glow, 1).setDepth(9).setBlendMode('ADD').setScale(0));
      const h = add(r.add.rectangle(at.x, at.y - 36, 20, 5, glow, 1).setDepth(9).setBlendMode('ADD').setScale(0));
      r.tweens.add({ targets: [v, h], scale: 1, duration: 450, ease: 'Back.easeOut', delay: 200 });
      // 몸 둘레를 도는 빛살
      for (let i = 0; i < 8; i++) {
        const ray = add(r.add.rectangle(at.x, at.y, 1, 40, color, 0.7).setOrigin(0.5, 1).setDepth(8).setBlendMode('ADD').setRotation((i / 8) * Math.PI * 2).setAlpha(0));
        r.tweens.add({ targets: ray, alpha: 0.8, rotation: ray.rotation + 1.2, duration: sec * 1000, ease: 'Sine.easeInOut' });
      }
      // 금빛 알갱이가 바닥에서 솟는다
      r.time.addEvent({
        delay: 60,
        repeat: Math.floor((sec * 1000) / 60) - 2,
        callback: () => {
          for (let i = 0; i < 2; i++) {
            const x = at.x + r.rng.range(-22, 22);
            const m = r.add.rectangle(x, at.y + 12, 2, 2, i ? glow : color).setDepth(9).setBlendMode('ADD');
            r.tweens.add({ targets: m, y: at.y - r.rng.range(30, 60), alpha: 0, duration: 700, ease: 'Quad.easeOut', onComplete: () => m.destroy() });
          }
        },
      });
      pl.setTintFill(0xffe28a);
    } else {
      // 바닥의 헥타르 진
      const ring = add(r.add.image(at.x, at.y + 8, 'fx_chief_ring').setDepth(1.5).setAlpha(0).setScale(0.4).setBlendMode('ADD'));
      r.tweens.add({ targets: ring, alpha: 0.9, scale: 1.1, rotation: 2, duration: sec * 1000, ease: 'Sine.easeOut' });
      // 몸을 위아래로 훑는 스캔선 두 번
      const scan = add(r.add.rectangle(at.x, at.y - 18, 34, 2, glow, 0.9).setDepth(9).setBlendMode('ADD'));
      r.tweens.add({ targets: scan, y: at.y + 14, duration: 450, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });
      // 데이터 조각이 몸으로 모인다
      r.time.addEvent({ delay: 50, repeat: Math.floor((sec * 1000) / 50) - 3, callback: () => motes(r, r.rng, at, color, 3, 60, 0.35) });
      pl.setTintFill(0x6ab0ff);
    }
    // 쓰러진 몸이 일어선다
    r.tweens.add({ targets: pl, angle: 0, alpha: 1, delay: sec * 300, duration: sec * 600, ease: 'Back.easeOut' });
    r.time.delayedCall(sec * 1000, () => {
      for (const o of temp) o.destroy();
      r.cameras.main.flash(260, holy ? 255 : 80, holy ? 220 : 160, holy ? 120 : 255);
      shockRing(r, at, 46, color, 0.45, 3);
      shockRing(r, at, 28, 0xffffff, 0.3, 1);
      burst(r, r.rng, at, color, 26, [90, 180], 0.45, undefined, 6);
      if (!holy && r.textures.exists('fx_chief_burst')) {
        const b = r.add.image(at.x, at.y, 'fx_chief_burst').setDepth(9).setBlendMode('ADD');
        r.tweens.add({ targets: b, alpha: 0, scale: 1.4, duration: 400, onComplete: () => b.destroy() });
      }
      shake(r, 'medium');
      sfx('warp');
      pl.clearTint();
      then();
    });
  }

  warpOut(then: () => void): void {
    const p = this.run.ctx.data.juice.portal;
    const portal = this.run.nearest(this.run.portals.map((x) => ({ x: x.sprite.x, y: x.sprite.y })), Infinity) ?? { x: this.run.player.x, y: this.run.player.y };
    this.run.setModal('portal');
    sfx('warp');
    const cam = this.run.cameras.main;
    cam.zoomTo(this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale * p.zoom, p.suckSec * 1000, 'Quad.easeIn');
    cam.pan(portal.x, portal.y, p.suckSec * 1000, 'Sine.easeInOut');
    this.run.weaponSprite.setVisible(false);
    this.run.tweens.add({
      targets: this.run.player,
      x: portal.x,
      y: portal.y,
      scale: 0,
      angle: 540,
      duration: p.suckSec * 1000,
      ease: 'Quad.easeIn',
      onComplete: () => {
        bus.emit('warp', { on: true });
        // 덮인 뒤 잠깐 있다가 카드 (트윈은 모달 중에도 돈다)
        this.run.tweens.add({
          targets: this.run.player,
          alpha: 0,
          duration: (p.fadeInSec + p.holdSec) * 1000,
          onComplete: () => {
            if (this.run.modal === 'portal') this.run.setModal(null);
            then();
          },
        });
      },
    });
  }

  /** 포탈을 타고 도착: 이동 화면을 걷고 캐릭터가 빛 속에서 커지며 나타난다 */
  warpIn(): void {
    const p = this.run.ctx.data.juice.portal;
    bus.emit('warp', { on: false });
    sfx('warpArrive');
    this.run.player.setScale(0).setAngle(-360);
    this.run.tweens.add({ targets: this.run.player, scale: 1, angle: 0, duration: p.arriveSec * 1000, delay: p.fadeOutSec * 500, ease: 'Back.easeOut' });
    const ring = this.run.add.circle(this.run.player.x, this.run.player.y, 6).setStrokeStyle(2, hexColor(p.color), 1).setDepth(5);
    this.run.tweens.add({ targets: ring, scale: 5, alpha: 0, duration: p.arriveSec * 1000 * 1.4, delay: p.fadeOutSec * 500, onComplete: () => ring.destroy() });
  }

  /** 보스 강화·단계 개방: 번쩍임, 짧은 확대, 화면 가운데 큰 이름 */
  bossPhaseFx(text: string, color: string, at: Vec2): void {
    const bp = this.run.ctx.data.juice.bossPhase;
    const c = Phaser.Display.Color.HexStringToColor(color);
    const cam = this.run.cameras.main;
    cam.flash(bp.flashMs, c.red, c.green, c.blue);
    sfx('bossPhase');
    this.run.juice.colorBurst(at, color, bp);
    const base = this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale;
    this.run.tweens.add({ targets: cam, zoom: base * bp.zoom, duration: (bp.zoomSec * 1000) / 2, yoyo: true, onComplete: () => cam.setZoom(base) });
    bus.emit('banner', { text, color, size: bp.bannerSize, sec: bp.bannerSec });
  }

  /** 보스 처치: 슬로모션 + 흰 번쩍임 + 연쇄 폭발 */
  startBossKill(at: Vec2): void {
    const k = this.run.ctx.data.juice.bossKill;
    this.run.slowT = 0;
    this.run.cameras.main.flash(k.flashMs, 255, 255, 255);
    for (let i = 0; i < k.explosions; i++) {
      this.run.time.delayedCall(i * k.stepSec * 1000, () => {
        this.run.juice.explosionNear(at, k.spreadPx);
        sfx('explosionLarge');
      });
    }
  }

  /** 보스방 경고: 화면 가운데 WARNING + 보스 이름 */
  showBossWarning(name: string): void {
    sfx('warning');
    const cam = this.run.cameras.main;
    const sec = this.run.ctx.data.bosses.bannerSec;
    const style = { fontFamily: 'sans-serif', color: '#ff4a4a', stroke: '#000000', strokeThickness: 3 };
    const head = this.run.add.text(cam.width / 2, cam.height / 2 - 10, this.run.ctx.t('boss.warning'), { ...style, fontSize: '20px' });
    const sub = this.run.add.text(cam.width / 2, cam.height / 2 + 12, name, { ...style, fontSize: '12px', color: '#ffffff' });
    for (const t of [head, sub]) {
      t.setOrigin(0.5).setScrollFactor(0).setDepth(20);
      this.run.tweens.add({ targets: t, alpha: 0.3, duration: 250, yoyo: true, repeat: Math.max(0, Math.round((sec * 1000) / 500) - 1) });
      this.run.time.delayedCall(sec * 1000, () => t.destroy());
    }
    shake(this.run, 'rumble', sec * 1000);
  }

  /** 히든보스·보스와 마주하면 그 곡, 조우 칸에서 싸우는 동안은 2장 보스 곡, 일반 전투 칸에서 싸우는 동안은 챕터 전투 곡, 아니면 런 곡 (같은 곡이면 음악 쪽에서 무시한다) */
  updateMusic(): void {
    const live = this.run.enemies.filter((e) => !e.dead);
    const facingBoss = live.some((e) => e.rank === 'boss' || e.rank === 'hiddenBoss');
    const hiddenBoss = live.some((e) => e.rank === 'hiddenBoss');
    const rid = this.run.session.currentRoomId;
    const room = rid === null ? undefined : this.run.rooms.get(rid);
    const inCombat = room?.kind === 'combatRoom' && room.phase === 'locked';
    const inEncounter = room?.kind === 'encounterRoom' && live.some((e) => this.run.enemyRoom.get(e) === rid);
    bus.emit('music', { track: pickTrack(this.run.ctx.data.sounds.music, { place: 'run', chapter: this.run.session.stage.chapter, facingBoss, hiddenBoss, inCombat, inEncounter }) });
  }

  /** 첫 런 시작 방: 조작 안내. 다른 방으로 가면 사라지고 다시 나오지 않는다 */
  showTutorial(): void {
    const save = this.run.ctx.save;
    if (save.data.tutorialDone || this.run.session.stage.chapter !== 1 || this.run.session.stage.stage !== 1) return;
    const c = this.run.ctx.data.ui.tutorial;
    const center = roomCenter(this.run.session.map.rooms[this.run.session.map.startId]!, this.run.m);
    const keys = this.run.ctx.uiMode === 'mobile' ? c.mobile : c.pc;
    this.tutorialTexts = keys.map((k, i) =>
      this.run.add
        .text(center.x, center.y + c.offsetY + i * c.lineGapPx, this.run.ctx.t(k), { fontFamily: 'sans-serif', fontSize: `${c.fontPx}px`, color: '#ffffff', stroke: '#000000', strokeThickness: 2, align: 'center' })
        .setOrigin(0.5)
        .setDepth(6),
    );
  }

  updateTutorial(): void {
    if (this.tutorialTexts.length === 0 || this.run.session.currentRoomId === this.run.session.map.startId) return;
    for (const t of this.tutorialTexts) t.destroy();
    this.tutorialTexts = [];
    this.run.ctx.save.data.tutorialDone = true;
    this.run.ctx.save.write();
  }
}

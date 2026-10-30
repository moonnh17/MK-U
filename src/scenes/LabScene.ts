import Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { makeFallbackSeed } from '../core/config';
import { getContext, type GameContext } from '../core/context';
import { bus } from '../core/events';
import { registerGemini } from '../core/save';
import { hexColor } from '../core/scale';
import { animateArt, fitArt, fitBaseCamera } from '../entities/art';
import { hasLines, storyFor } from '../systems/gemini';
import { jobChoices, nearestInteractable, portalActive } from '../systems/lab';
import type { LabObjectDef } from '../types/data';
import type { TouchControlId } from '../ui/mobileLayout';

/** 실험장에서 숨기는 런 전용 터치 버튼 */
const RUN_ONLY_BUTTONS: TouchControlId[] = ['skill1', 'skill2', 'skill3', 'skill4', 'ultimate', 'swapWeapon', 'inventory', 'map', 'pause'];
const JOB_KEYS = ['skill1', 'skill2', 'skill3'] as const;

/**
 * 미모사 제미니의 실험장 (시작 방). 걸어 다니며 캡슐 → 직업 선택 장치 → 포털로 런에 들어간다.
 * 도감 단말·제미니 홀로그램은 '준비 중', 관측창은 장식. 기억조각 보관대는 3탭 창(과거·현재·실험체의 기억).
 * 런이 끝나면(결산 확인) 여기로 돌아온다.
 */
export class LabScene extends Phaser.Scene {
  private ctx!: GameContext;
  private player!: Phaser.Physics.Arcade.Sprite;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private prompt!: Phaser.GameObjects.Text;
  private crystalText!: Phaser.GameObjects.Text;
  private portal!: Phaser.GameObjects.Image;
  private near: LabObjectDef | null = null;
  private hintOn = false;
  private waking = false;
  private jobOpen = false;
  private archiveOpen = false;
  /** 첫 만남 스토리 대화가 떠 있다 */
  private storyOpen = false;
  private unsubs: (() => void)[] = [];
  /** 고른 직업 (실험장에 돌아와도 기억한다) */
  private job: string | null = null;
  /** 이번 실행에서 포털로 들어간 횟수 (두 번째 런부터 새 시드) */
  private runs = 0;

  constructor() {
    super('Lab');
  }

  create(): void {
    this.ctx = getContext();
    this.ctx.session = null;
    this.near = null;
    this.hintOn = false;
    this.jobOpen = false;
    this.archiveOpen = false;
    const d = this.ctx.data;
    const L = d.lab;
    const c = L.colors;
    fitBaseCamera(this, d.ui.baseWidth, d.ui.baseHeight, this.ctx.renderScale);

    this.drawRoom();
    this.walls = this.physics.add.staticGroup();
    const r = L.room;
    const w = L.wall;
    for (const [x, y, ww, hh] of [
      [r.x - w, r.y - w, r.w + w * 2, w],
      [r.x - w, r.y + r.h, r.w + w * 2, w],
      [r.x - w, r.y, w, r.h],
      [r.x + r.w, r.y, w, r.h],
    ] as const) {
      this.walls.add(this.add.rectangle(x + ww / 2, y + hh / 2, ww, hh, hexColor(c.wall)).setDepth(1));
    }

    for (const o of L.objects) {
      const img = this.add.image(o.x, o.y, o.spriteKey).setDepth(2);
      fitArt(this.ctx.data, img, o.w, o.h);
      if (o.solid) this.walls.add(img);
      if (o.kind === 'portal') this.portal = img;
      if (o.kind === 'window') this.drawWindow(o);
      if (o.kind === 'gemini') this.flicker(img);
    }
    this.refreshPortal();

    this.player = this.physics.add.sprite(L.start.x, L.start.y, d.player.spriteKey).setDepth(4);
    fitArt(d, this.player, d.player.size, d.player.height ?? d.player.size);
    this.physics.add.collider(this.player, this.walls);

    const fs = d.ui.hud.fontSize;
    this.prompt = this.add
      .text(0, 0, '', { fontFamily: 'sans-serif', fontSize: `${fs - 1}px`, color: '#ffffff', backgroundColor: '#000000aa', padding: { x: 3, y: 1 } })
      .setOrigin(0.5, 1)
      .setDepth(8)
      .setVisible(false);
    this.add.text(r.x + 4, 4, this.ctx.t('lab.title'), { fontFamily: 'sans-serif', fontSize: `${fs}px`, color: c.light }).setDepth(8);
    this.crystalText = this.add
      .text(r.x + r.w - 4, 4, this.ctx.t('lab.crystals', { n: this.ctx.save.data.crystals }), { fontFamily: 'sans-serif', fontSize: `${fs}px`, color: '#7ae0ff' })
      .setOrigin(1, 0)
      .setDepth(8);

    for (const id of RUN_ONLY_BUTTONS) this.ctx.touch.setHidden(id, true);
    this.unsubs.push(
      bus.on('labJobPicked', ({ jobId }) => this.pickJob(jobId)),
      bus.on('jobWindowClose', () => this.closeJobWindow()),
      bus.on('archiveClose', () => this.closeArchive()),
      bus.on('storyDone', () => {
        if (!this.storyOpen) return;
        this.storyOpen = false;
        bus.emit('modal', { kind: null });
      }),
      bus.on('saveChanged', () => this.crystalText.setText(this.ctx.t('lab.crystals', { n: this.ctx.save.data.crystals }))),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      this.unsubs = [];
      for (const id of RUN_ONLY_BUTTONS) this.ctx.touch.setHidden(id, false);
      bus.emit('interactHint', { kind: null });
    });

    if (!this.ctx.save.data.firstRunDone) this.wakeUp();
  }

  // ---------- 그리기 ----------

  private drawRoom(): void {
    const L = this.ctx.data.lab;
    const c = L.colors;
    const r = L.room;
    this.add.rectangle(r.x, r.y, r.w, r.h, hexColor(c.floor)).setOrigin(0).setDepth(0);
    // 바닥 격자와 측정 눈금
    const g = this.add.graphics().setDepth(0);
    g.lineStyle(1, hexColor(c.grid), 0.6);
    for (let x = r.x + L.gridStep; x < r.x + r.w; x += L.gridStep) g.lineBetween(x, r.y, x, r.y + r.h);
    for (let y = r.y + L.gridStep; y < r.y + r.h; y += L.gridStep) g.lineBetween(r.x, y, r.x + r.w, y);
    g.lineStyle(1, hexColor(c.light), 0.5);
    for (let x = r.x; x <= r.x + r.w; x += L.gridStep) g.lineBetween(x, r.y + r.h - 3, x, r.y + r.h);
    // 차가운 조명 띠
    this.add.rectangle(r.x, r.y, r.w, 2, hexColor(c.light), 0.7).setOrigin(0).setDepth(1);
    this.add.rectangle(r.x, r.y + r.h - 2, r.w, 2, hexColor(c.light), 0.4).setOrigin(0).setDepth(1);
    // 벽면 모니터 (기록이 흐르는 막대)
    const mon = this.add.graphics().setDepth(1);
    for (const mx of L.monitors) {
      mon.fillStyle(hexColor(c.monitor), 1).fillRect(mx, r.y + 4, 50, 18);
      mon.fillStyle(hexColor(c.monitorText), 0.8);
      for (let i = 0; i < 4; i++) mon.fillRect(mx + 4, r.y + 7 + i * 4, 10 + ((i * 13) % 30), 2);
    }
  }

  /** 관측창: 너머로 비어 있는 다른 캡슐들 */
  private drawWindow(o: LabObjectDef): void {
    const c = this.ctx.data.lab.colors;
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = o.x - o.w / 2 + ((i + 0.5) * o.w) / n;
      this.add.rectangle(x, o.y, 6, o.h - 4, hexColor(c.emptyCapsule)).setDepth(3);
    }
    this.add.rectangle(o.x, o.y, o.w, o.h).setStrokeStyle(1, hexColor(c.light), 0.8).setDepth(3);
  }

  private flicker(img: Phaser.GameObjects.Image): void {
    const f = this.ctx.data.lab.geminiFlicker;
    this.time.addEvent({
      delay: f.periodSec * 1000,
      loop: true,
      callback: () => img.setAlpha(f.minAlpha + Math.random() * (f.maxAlpha - f.minAlpha)),
    });
  }

  private refreshPortal(): void {
    const on = portalActive(this.ctx.data.jobs.jobs, this.job);
    this.tweens.killTweensOf(this.portal);
    this.portal.setAlpha(on ? 1 : 0.3).setScale(1);
    if (on) this.tweens.add({ targets: this.portal, scaleX: 1.12, scaleY: 1.12, duration: this.ctx.data.lab.portalPulseSec * 500, yoyo: true, repeat: -1 });
  }

  /** 첫 실행: 캡슐 뚜껑이 열리고 걸어 나온다 (첫 대화는 M6에서 여기에) */
  private wakeUp(): void {
    const L = this.ctx.data.lab;
    const cap = L.objects.find((o) => o.kind === 'capsule')!;
    this.waking = true;
    this.player.setPosition(L.start.x, L.start.y - L.wake.stepDistance).setAlpha(0);
    const lid = this.add.rectangle(cap.x, cap.y, cap.w, cap.h, hexColor(L.colors.light), 0.8).setDepth(5);
    this.tweens.add({
      targets: lid,
      y: cap.y - cap.h,
      alpha: 0,
      duration: L.wake.lidSec * 1000,
      onComplete: () => {
        lid.destroy();
        this.player.setPosition(cap.x, cap.y - cap.h / 2).setAlpha(1);
        this.tweens.add({
          targets: this.player,
          y: L.start.y,
          duration: L.wake.stepSec * 1000,
          onComplete: () => {
            this.waking = false;
            this.ctx.save.data.firstRunDone = true;
            this.ctx.save.write();
            this.playFirstRunStory();
          },
        });
      },
    });
  }

  /** 첫 실행: 캡슐에서 깨어난 뒤 미모사 제미니와 처음 만나는 대화 (내용이 비어 있으면 건너뜀) */
  private playFirstRunStory(): void {
    const d = this.ctx.data;
    const story = storyFor(d.gemini, 'firstRun');
    if (!story || !hasLines(story.lines, d.text)) return;
    if (registerGemini(this.ctx.save.data, `gemini.${story.id}`, story.lines)) this.ctx.save.write();
    this.storyOpen = true;
    bus.emit('modal', { kind: 'story' });
    bus.emit('storyShow', { lines: story.lines.map((k) => this.ctx.t(k)) });
  }

  // ---------- 루프 ----------

  override update(): void {
    const frame = this.ctx.input.poll();
    animateArt(this.ctx.data, this.player);
    if (this.jobOpen) {
      // 직업 선택 창: PC 1/2/3으로 고르고 Esc로 닫는다
      const jobs = jobChoices(this.ctx.data.jobs.jobs);
      JOB_KEYS.forEach((k, i) => {
        if (frame.pressed.has(k) && jobs[i]?.enabled) this.pickJob(jobs[i].id);
      });
      if (frame.pressed.has('pause') || frame.pressed.has('interact')) this.closeJobWindow();
      return;
    }
    if (this.archiveOpen) {
      if (frame.pressed.has('pause') || frame.pressed.has('interact')) this.closeArchive();
      return;
    }
    if (this.waking || this.storyOpen) {
      this.player.setVelocity(0, 0);
      return;
    }
    const speed = this.ctx.data.player.moveSpeed;
    this.player.setVelocity(frame.move.x * speed, frame.move.y * speed);

    const L = this.ctx.data.lab;
    const p: Vec2 = { x: this.player.x, y: this.player.y };
    this.near = nearestInteractable(L.objects, p, L.interactRadius);
    this.updatePrompt();
    if (frame.pressed.has('interact') && this.near) this.interact(this.near);

    // 켜진 포털에 들어서면 런 시작
    const portal = L.objects.find((o) => o.kind === 'portal')!;
    if (portalActive(this.ctx.data.jobs.jobs, this.job) && Math.abs(p.x - portal.x) < portal.w / 2 && Math.abs(p.y - portal.y) < portal.h / 2) this.enterRun();
  }

  private updatePrompt(): void {
    const n = this.near;
    if (n) {
      this.prompt
        // 모바일은 공격 버튼이 '조사'로 바뀌므로 키 표시 없이 이름만
        .setText(this.ctx.t(this.ctx.uiMode === 'mobile' ? 'lab.prompt.mobile' : 'lab.prompt', { name: this.ctx.t(`lab.object.${n.kind}`) }))
        .setPosition(n.x, n.y - n.h / 2 - 2)
        .setVisible(true);
    } else {
      this.prompt.setVisible(false);
    }
    if (!!n !== this.hintOn) {
      this.hintOn = !!n;
      bus.emit('interactHint', { kind: n ? 'lab' : null });
    }
  }

  private interact(o: LabObjectDef): void {
    const t = this.ctx.t;
    const name = t(`lab.object.${o.kind}`);
    if (o.kind === 'jobSelect') {
      this.openJobWindow();
    } else if (o.kind === 'portal') {
      if (portalActive(this.ctx.data.jobs.jobs, this.job)) this.enterRun();
      else bus.emit('toast', { text: t('lab.pickJobFirst') });
    } else if (o.kind === 'archive') {
      this.archiveOpen = true;
      this.player.setVelocity(0, 0);
      bus.emit('modal', { kind: 'archive' });
      bus.emit('archiveShow', {});
    } else {
      // 도감 단말·제미니 홀로그램
      bus.emit('toast', { text: t('lab.notReady', { name }) });
    }
  }

  private closeArchive(): void {
    if (!this.archiveOpen) return;
    this.archiveOpen = false;
    bus.emit('modal', { kind: null });
  }

  private openJobWindow(): void {
    this.jobOpen = true;
    this.player.setVelocity(0, 0);
    bus.emit('modal', { kind: 'job' });
    bus.emit('jobWindowShow', { selected: this.job });
  }

  private closeJobWindow(): void {
    if (!this.jobOpen) return;
    this.jobOpen = false;
    bus.emit('modal', { kind: null });
  }

  private pickJob(jobId: string): void {
    const job = this.ctx.data.jobs.jobs.find((j) => j.id === jobId);
    if (!job?.enabled) return;
    this.job = jobId;
    this.closeJobWindow();
    this.refreshPortal();
    bus.emit('toast', { text: this.ctx.t('lab.jobPicked', { job: this.ctx.t(job.nameKey) }) });
  }

  private enterRun(): void {
    if (!this.job) return;
    // 두 번째 런부터 새 시드 (?seed=로 정했으면 그대로)
    if (this.runs > 0 && !this.ctx.config.seedFromUrl) this.ctx.config.seed = makeFallbackSeed();
    this.runs++;
    this.scene.start('Run', { job: this.job });
  }
}

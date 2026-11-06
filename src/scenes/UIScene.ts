import { CombatBanner } from '../ui/combatBanner';
import { fitBaseCamera } from '../entities/art';
import { Warp } from '../ui/warp';
import { BossBar } from '../ui/bossBar';
import Phaser from 'phaser';
import { getContext, type GameContext } from '../core/context';
import { debugClearRoom, toggleDebugFlag } from '../core/debug';
import { bus } from '../core/events';
import { DebugPanel } from '../ui/debugPanel';
import { buildDebugSkills } from '../ui/debugSkills';
import { Hud } from '../ui/hud';
import { TouchSkills } from '../ui/touchSkills';
import { activeWeapon } from '../systems/weapons';

/** HUD·미니맵·알림·디버그 표시. Run·Lab 씬 위에 겹쳐 돈다(HUD는 런 중에만). */
export class UIScene extends Phaser.Scene {
  private ctx!: GameContext;
  private hud!: Hud;
  private toastText!: Phaser.GameObjects.Text;
  private bossBar!: BossBar;
  private warp!: Warp;
  private debugPanel!: DebugPanel;
  private touchSkills!: TouchSkills;
  private touchSkillLabels: string[] = [];
  private unsubs: (() => void)[] = [];

  constructor() {
    super('UI');
  }

  create(): void {
    this.ctx = getContext();
    const { ui } = this.ctx.data;
    const W = ui.baseWidth;
    const H = ui.baseHeight;
    fitBaseCamera(this, W, H, this.ctx.renderScale);
    this.hud = new Hud(this, this.ctx);
    this.bossBar = new BossBar(this, this.ctx);
    new CombatBanner(this, this.ctx);
    this.warp = new Warp(this, this.ctx);

    this.toastText = this.add
      .text(W / 2, H * 0.3, '', {
        fontFamily: 'sans-serif',
        fontSize: `${ui.hud.fontSize}px`,
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0.5)
      .setVisible(false);


    this.debugPanel = new DebugPanel(
      document.body,
      {
        revealMap: this.ctx.t('debug.revealMap'),
        invincible: this.ctx.t('debug.invincible'),
        clearRoom: this.ctx.t('debug.clearRoom'),
      },
      {
        toggle: (name) => toggleDebugFlag(this.ctx, name),
        clearRoom: () => debugClearRoom(this.ctx),
      },
    );
    this.debugPanel.addSection(this.ctx.t('debug.skills'), buildDebugSkills(this.ctx));
    this.debugPanel.setVisible(this.ctx.debug);
    this.touchSkillLabels = ['1', '2', '3', this.ctx.t('mobile.ultimate')];
    this.touchSkills = new TouchSkills(this.ctx.touch, ui, this.touchSkillLabels);

    this.unsubs.push(
      bus.on('uiModeChanged', () => this.relayout()),
      bus.on('debugToggled', ({ on }) => this.debugPanel.setVisible(on)),
      bus.on('command', ({ action }) => {
        this.hud.flash(action);
        if (action === 'map' && !this.ctx.session?.outcome) this.hud.toggleMinimap();
      }),
      bus.on('toast', ({ text }) => this.showToast(text)),
    );
    const onResize = () => this.relayout();
    window.addEventListener('resize', onResize);
    this.unsubs.push(() => window.removeEventListener('resize', onResize));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.unsubs.forEach((u) => u()));

    this.relayout();
  }

  private showToast(text: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(text).setAlpha(1).setVisible(true);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      delay: this.ctx.data.ui.toastSec * 700,
      duration: this.ctx.data.ui.toastSec * 300,
      onComplete: () => this.toastText.setVisible(false),
    });
  }

  override update(_time: number, deltaMs: number): void {
    const s = this.ctx.session;
    this.hud.setShown(s !== null);
    this.bossBar.update(s && !s.outcome ? s.boss : null, Math.min(deltaMs / 1000, 0.05));
    this.warp.update(Math.min(deltaMs / 1000, 0.05));
    if (s) {
      this.hud.update(s, this.time.now);
      if (this.ctx.uiMode === 'mobile') {
        this.touchSkills.update(s.skillView, this.touchSkillLabels);
        // 회피 버튼: 이름(전직하면 바뀜), 대기 중이면 남은 초
        const dv = s.dodgeView;
        this.ctx.touch.setLabel('dodge', dv.left > 0 ? dv.left.toFixed(1) : this.ctx.t(dv.nameKey));
        // 무기 특수공격 버튼: 특수공격이 있는 무기면 그 이름, 없으면 흐리게
        const held = activeWeapon(s.player.weapons);
        const special = held ? this.ctx.data.weapons.weapons.find((w) => w.id === held.defId) : undefined;
        const has = !!special?.needle || !!special?.twinStar;
        this.ctx.touch.setLabel('weaponSpecial', has ? this.ctx.t(special!.abilityNameKey!) : this.ctx.t('mobile.special'));
        this.ctx.touch.setDisabled('weaponSpecial', !has);
      }
    }

    if (this.ctx.debug) {
      this.debugPanel.setToggle('revealMap', this.ctx.debugFlags.revealMap);
      this.debugPanel.setToggle('invincible', this.ctx.debugFlags.invincible);
      const t = this.ctx.t;
      this.debugPanel.setInfo(
        [
          `${t('debug.fps')} ${Math.round(this.game.loop.actualFps)}`,
          `${t('debug.seed')} ${this.ctx.config.seed}`,
          `${t('debug.room')} ${s?.currentRoomId ?? '-'}`,
          `${t('debug.enemies')} ${s?.enemiesAlive ?? 0}`,
          `${t('debug.energy')} ${Math.floor(s?.player.energy ?? 0)}`,
          `${t('debug.uiMode')} ${this.ctx.uiMode}`,
          t('debug.schoolPicks', { hectar: s?.player.schoolPicks.hectar ?? 0, acro: s?.player.schoolPicks.acro ?? 0 }),
          t('debug.items', { list: s?.player.items.length ? s.player.items.map((id) => t(`item.${id}`)).join(', ') : t('debug.itemsNone') }),
        ].join('  '),
      );
    }
  }

  /** 모바일에서는 터치 버튼(CSS px) 위치를 게임 좌표로 바꿔 HUD가 버튼을 피하게 한다. */
  private relayout(): void {
    const ctx = this.ctx;
    const layout = ctx.touch.currentLayout();
    if (ctx.uiMode !== 'mobile' || !layout) {
      this.hud.applyMode(ctx.uiMode, null, null);
      return;
    }
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = ctx.data.ui.baseWidth / rect.width;
    const sy = ctx.data.ui.baseHeight / rect.height;
    const gap = ctx.data.ui.hud.margin;
    const pause = layout.pause;
    const map = layout.map;
    const barsX = (pause.x + pause.w - rect.left) * sx + gap;
    const minimapY = (map.y + map.h - rect.top) * sy + gap;
    this.hud.applyMode('mobile', barsX, minimapY);
  }
}

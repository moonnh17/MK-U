import Phaser from 'phaser';
import type { ButtonAction } from '../core/actions';
import type { GameContext } from '../core/context';
import { DISABLED_ACTIONS } from '../core/features';
import { hexColor } from '../core/scale';
import type { RunSession } from '../core/session';
import type { UiMode } from '../input/uiMode';
import { activeWeapon, otherWeapon } from '../systems/weapons';
import { Minimap } from './minimap';

const SKILLBAR: { action: ButtonAction | 'passive'; labelKey?: string; label?: string }[] = [
  { action: 'skill1', label: '1' },
  { action: 'skill2', label: '2' },
  { action: 'skill3', label: '3' },
  { action: 'skill4', label: '4' },
  { action: 'ultimate', labelKey: 'hud.ultimate' },
  { action: 'passive', labelKey: 'hud.passive' },
];

interface Bar {
  fill: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  color: number;
}

/**
 * HUD.
 * PC: 좌상단 체력·보호막·에너지 바 / 우상단 미니맵 / 하단 중앙 스킬바 / 우하단 무기 2슬롯
 * 모바일: 바는 가방·일시정지 버튼 오른쪽, 미니맵은 지도 탭 아래, 스킬·무기는 터치 버튼이 대신한다.
 */
export class Hud {
  private readonly bars: Phaser.GameObjects.Container;
  private readonly hp: Bar;
  private readonly shield: Bar;
  private readonly energy: Bar;
  private readonly stageText: Phaser.GameObjects.Text;
  private readonly coinText: Phaser.GameObjects.Text;
  readonly minimap: Minimap;
  private readonly pcOnly: Phaser.GameObjects.Container;
  private readonly slots = new Map<string, Phaser.GameObjects.Rectangle>();
  private readonly mainWeaponText: Phaser.GameObjects.Text;
  private readonly mainCostText: Phaser.GameObjects.Text;
  private readonly subWeaponText: Phaser.GameObjects.Text;
  private minimapVisible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    const { ui } = ctx.data;
    const h = ui.hud;
    const W = ui.baseWidth;
    const H = ui.baseHeight;
    const text = (x: number, y: number, s: string, size = h.fontSize) =>
      scene.add.text(x, y, s, { fontFamily: 'sans-serif', fontSize: `${size}px`, color: '#ffffff' });

    // --- 체력·보호막·에너지 바 ---
    this.bars = scene.add.container(h.margin, h.margin);
    const makeBar = (i: number, color: string): Bar => {
      const y = i * (h.bars.height + h.bars.gap);
      const back = scene.add.rectangle(0, y, h.bars.width, h.bars.height, hexColor(h.bars.backColor)).setOrigin(0);
      const fill = scene.add.rectangle(0, y, h.bars.width, h.bars.height, hexColor(color)).setOrigin(0);
      const label = text(h.bars.width + 3, y - 2, '', h.fontSize - 2);
      this.bars.add([back, fill, label]);
      return { fill, text: label, color: hexColor(color) };
    };
    this.hp = makeBar(0, h.bars.hpColor);
    this.shield = makeBar(1, h.bars.shieldColor);
    this.energy = makeBar(2, h.bars.energyColor);
    const barsBottom = 3 * (h.bars.height + h.bars.gap);
    this.stageText = text(0, barsBottom, '');
    this.coinText = text(0, barsBottom + h.fontSize + 2, '');
    this.bars.add([this.stageText, this.coinText]);

    // --- 미니맵 ---
    this.minimap = new Minimap(scene, ctx);
    this.minimap.container.setPosition(W - h.margin - h.minimap.width, h.margin);

    // --- PC 전용: 스킬바 + 무기 슬롯 ---
    this.pcOnly = scene.add.container(0, 0);
    const sb = h.skillbar;
    const totalW = SKILLBAR.length * sb.slotSize + (SKILLBAR.length - 2) * sb.gap + sb.groupGap;
    let x = (W - totalW) / 2;
    const y = H - h.margin - sb.slotSize;
    SKILLBAR.forEach((slot, i) => {
      if (i === 4) x += sb.groupGap - sb.gap;
      const rect = scene.add.rectangle(x, y, sb.slotSize, sb.slotSize, 0x000000, 0.5).setOrigin(0).setStrokeStyle(1, 0xffffff);
      const label = text(x + 2, y + 1, slot.labelKey ? ctx.t(slot.labelKey) : (slot.label ?? ''));
      const disabled = slot.action === 'passive' || DISABLED_ACTIONS.has(slot.action);
      if (disabled) {
        rect.setAlpha(sb.disabledAlpha);
        label.setAlpha(sb.disabledAlpha);
      }
      this.slots.set(slot.action, rect);
      this.pcOnly.add([rect, label]);
      x += sb.slotSize + sb.gap;
    });

    const wp = h.weapons;
    const mainX = W - h.margin - wp.mainWidth;
    const mainY = H - h.margin - wp.mainHeight;
    const subX = mainX - wp.gap - wp.subWidth;
    const subY = H - h.margin - wp.subHeight;
    this.mainWeaponText = text(mainX + 2, mainY + 1, '');
    this.mainCostText = text(mainX + wp.mainWidth - 2, mainY + wp.mainHeight - 1, '').setOrigin(1, 1).setColor(h.bars.energyColor);
    this.subWeaponText = text(subX + 2, subY + 1, '', h.fontSize - 2).setAlpha(0.7);
    this.pcOnly.add([
      scene.add.rectangle(mainX, mainY, wp.mainWidth, wp.mainHeight, 0x000000, 0.5).setOrigin(0).setStrokeStyle(1, 0xffffff),
      scene.add.rectangle(subX, subY, wp.subWidth, wp.subHeight, 0x000000, 0.5).setOrigin(0).setStrokeStyle(1, 0x888888),
      this.mainWeaponText,
      this.mainCostText,
      this.subWeaponText,
    ]);
  }

  update(s: RunSession, now: number): void {
    const p = s.player;
    const barW = this.ctx.data.ui.hud.bars.width;
    const setBar = (bar: Bar, value: number, max: number, color = bar.color) => {
      bar.fill.width = max > 0 ? (barW * Math.max(0, value)) / max : 0;
      bar.fill.setFillStyle(color);
      bar.text.setText(max > 0 ? `${Math.ceil(value)}/${max}` : '');
    };
    setBar(this.hp, p.hp, p.maxHp);
    setBar(this.shield, 0, this.ctx.data.player.shieldMax);
    const empty = now - s.energyEmptyAt < this.ctx.data.ui.energyEmptyFlashSec * 1000;
    setBar(this.energy, p.energy, p.energyMax, empty ? hexColor(this.ctx.data.ui.hud.bars.hpColor) : this.energy.color);

    this.stageText.setText(this.ctx.t('hud.stage', { chapter: s.stage.chapter, stage: s.stage.stage }));
    this.coinText.setText(this.ctx.t('hud.coins', { coins: p.coins }));

    const weapons = this.ctx.data.weapons.weapons;
    const main = weapons.find((w) => w.id === activeWeapon(p.weapons));
    const sub = weapons.find((w) => w.id === otherWeapon(p.weapons));
    this.mainWeaponText.setText(main ? this.ctx.t(main.nameKey) : '');
    this.mainCostText.setText(String(main?.energyCost ?? 0)).setColor(empty ? '#ff5555' : this.ctx.data.ui.hud.bars.energyColor);
    this.subWeaponText.setText(sub ? this.ctx.t(sub.nameKey) : '');

    this.minimap.render(s.map, s.visited, s.currentRoomId, this.ctx.debugFlags.revealMap);
  }

  applyMode(mode: UiMode, mobileBarsX: number | null, mobileMinimapY: number | null): void {
    const h = this.ctx.data.ui.hud;
    this.pcOnly.setVisible(mode === 'pc');
    this.bars.setX(mode === 'mobile' && mobileBarsX !== null ? mobileBarsX : h.margin);
    this.minimap.container.setY(mode === 'mobile' && mobileMinimapY !== null ? mobileMinimapY : h.margin);
  }

  toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    this.minimap.container.setVisible(this.minimapVisible);
  }

  /** 명령 입력이 들어왔음을 슬롯 깜빡임으로 보여준다(확인용) */
  flash(action: ButtonAction): void {
    const rect = this.slots.get(action);
    if (!rect) return;
    rect.setFillStyle(0xffffff, 0.6);
    this.scene.time.delayedCall(120, () => rect.setFillStyle(0x000000, 0.5));
  }
}

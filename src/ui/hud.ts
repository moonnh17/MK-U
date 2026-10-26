import Phaser from 'phaser';
import type { ButtonAction } from '../core/actions';
import type { GameContext } from '../core/context';
import { DISABLED_ACTIONS } from '../core/features';
import { hexColor } from '../core/scale';
import type { UiMode } from '../input/uiMode';

const SKILLBAR: { action: ButtonAction | 'passive'; labelKey?: string; label?: string }[] = [
  { action: 'skill1', label: '1' },
  { action: 'skill2', label: '2' },
  { action: 'skill3', label: '3' },
  { action: 'skill4', label: '4' },
  { action: 'ultimate', labelKey: 'hud.ultimate' },
  { action: 'passive', labelKey: 'hud.passive' },
];

/**
 * HUD 자리 잡기 (M0). 값 연결은 M1에서 한다.
 * PC: 좌상단 바 / 우상단 미니맵 / 하단 중앙 스킬바 / 우하단 무기 2슬롯
 * 모바일: 바는 가방·일시정지 버튼 오른쪽, 스킬·무기는 터치 버튼이 대신한다.
 */
export class Hud {
  private readonly bars: Phaser.GameObjects.Container;
  private readonly stageText: Phaser.GameObjects.Text;
  private readonly minimap: Phaser.GameObjects.Container;
  private readonly pcOnly: Phaser.GameObjects.Container;
  private readonly slots = new Map<string, Phaser.GameObjects.Rectangle>();
  private minimapVisible = true;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    const { ui, player, weapons } = ctx.data;
    const h = ui.hud;
    const W = ui.baseWidth;
    const H = ui.baseHeight;
    const fontSize = `${h.fontSize}px`;
    const text = (x: number, y: number, s: string) =>
      scene.add.text(x, y, s, { fontFamily: 'sans-serif', fontSize, color: '#ffffff' });

    // --- 체력·보호막·에너지 바 ---
    this.bars = scene.add.container(h.margin, h.margin);
    const barRows: [string, number, number, string][] = [
      ['hud.hp', player.maxHp, player.maxHp, h.bars.hpColor],
      ['hud.shield', 0, player.shieldMax, h.bars.shieldColor],
      ['hud.energy', player.energy.start, player.energy.max, h.bars.energyColor],
    ];
    barRows.forEach(([, value, max, color], i) => {
      const y = i * (h.bars.height + h.bars.gap);
      const back = scene.add.rectangle(0, y, h.bars.width, h.bars.height, hexColor(h.bars.backColor)).setOrigin(0);
      const ratio = max > 0 ? value / max : 0;
      const fill = scene.add.rectangle(0, y, h.bars.width * ratio, h.bars.height, hexColor(color)).setOrigin(0);
      this.bars.add([back, fill]);
    });
    const barsBottom = barRows.length * (h.bars.height + h.bars.gap);
    this.stageText = text(0, barsBottom, ctx.t('hud.stage', { chapter: 1, stage: 1 }));
    this.bars.add(this.stageText);

    // --- 미니맵 자리 ---
    this.minimap = scene.add.container(W - h.margin - h.minimap.width, h.margin);
    this.minimap.add(
      scene.add
        .rectangle(0, 0, h.minimap.width, h.minimap.height, hexColor(h.minimap.backColor))
        .setOrigin(0)
        .setStrokeStyle(1, hexColor(h.minimap.borderColor)),
    );
    this.minimap.add(text(3, 2, ctx.t('hud.minimap')).setAlpha(0.6));

    // --- PC 전용: 스킬바 + 무기 슬롯 ---
    this.pcOnly = scene.add.container(0, 0);
    const sb = h.skillbar;
    const totalW = SKILLBAR.length * sb.slotSize + (SKILLBAR.length - 2) * sb.gap + sb.groupGap;
    let x = (W - totalW) / 2;
    const y = H - h.margin - sb.slotSize;
    SKILLBAR.forEach((slot, i) => {
      if (i === 4) x += sb.groupGap - sb.gap;
      const rect = scene.add
        .rectangle(x, y, sb.slotSize, sb.slotSize, 0x000000, 0.5)
        .setOrigin(0)
        .setStrokeStyle(1, 0xffffff);
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
    const start = weapons.weapons.find((w) => w.id === weapons.startWeapon);
    this.pcOnly.add([
      scene.add.rectangle(mainX, mainY, wp.mainWidth, wp.mainHeight, 0x000000, 0.5).setOrigin(0).setStrokeStyle(1, 0xffffff),
      text(mainX + 2, mainY + 1, start ? ctx.t(start.nameKey) : ''),
      text(mainX + wp.mainWidth - 10, mainY + wp.mainHeight - h.fontSize - 2, String(start?.energyCost ?? 0)).setColor(
        h.bars.energyColor,
      ),
      scene.add
        .rectangle(mainX - wp.gap - wp.subWidth, H - h.margin - wp.subHeight, wp.subWidth, wp.subHeight, 0x000000, 0.5)
        .setOrigin(0)
        .setStrokeStyle(1, 0x888888),
    ]);

    for (const o of [this.bars, this.minimap, this.pcOnly]) o.setScrollFactor(0);
  }

  applyMode(mode: UiMode, mobileBarsX: number | null, mobileMinimapY: number | null): void {
    const h = this.ctx.data.ui.hud;
    this.pcOnly.setVisible(mode === 'pc');
    this.bars.setX(mode === 'mobile' && mobileBarsX !== null ? mobileBarsX : h.margin);
    this.minimap.setY(mode === 'mobile' && mobileMinimapY !== null ? mobileMinimapY : h.margin);
  }

  toggleMinimap(): void {
    this.minimapVisible = !this.minimapVisible;
    this.minimap.setVisible(this.minimapVisible);
  }

  /** 명령 입력이 들어왔음을 슬롯 깜빡임으로 보여준다(확인용) */
  flash(action: ButtonAction): void {
    const rect = this.slots.get(action);
    if (!rect) return;
    rect.setFillStyle(0xffffff, 0.6);
    this.scene.time.delayedCall(120, () => rect.setFillStyle(0x000000, 0.5));
  }
}

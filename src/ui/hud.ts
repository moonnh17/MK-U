import Phaser from 'phaser';
import type { ButtonAction } from '../core/actions';
import type { GameContext } from '../core/context';
import { DISABLED_ACTIONS } from '../core/features';
import { hexColor } from '../core/scale';
import type { RunSession } from '../core/session';
import type { UiMode } from '../input/uiMode';
import { storedSkills } from '../systems/skills';
import { activeWeapon, otherWeapon, weaponStats } from '../systems/weapons';
import { Minimap } from './minimap';

/** 스킬바 칸 순서는 RunSession.skillView와 같다 (액티브 4 + 궁극기 + 패시브) */
const SKILLBAR: { action: ButtonAction | 'passive'; keyLabel: string }[] = [
  { action: 'skill1', keyLabel: '1' },
  { action: 'skill2', keyLabel: '2' },
  { action: 'skill3', keyLabel: '3' },
  { action: 'skill4', keyLabel: '4' },
  { action: 'ultimate', keyLabel: '5' },
  { action: 'passive', keyLabel: 'P' },
];

interface Bar {
  fill: Phaser.GameObjects.Rectangle;
  text: Phaser.GameObjects.Text;
  color: number;
}

interface SlotUi {
  x: number;
  y: number;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
  cd: Phaser.GameObjects.Graphics;
  cdText: Phaser.GameObjects.Text;
  dots: Phaser.GameObjects.Rectangle[];
  star: Phaser.GameObjects.Text;
  container: Phaser.GameObjects.Container;
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
  private readonly slots: SlotUi[] = [];
  private readonly storedBadge: Phaser.GameObjects.Text;
  private readonly mainWeaponText: Phaser.GameObjects.Text;
  private readonly mainCostText: Phaser.GameObjects.Text;
  private readonly subWeaponText: Phaser.GameObjects.Text;
  private minimapVisible = true;
  private readonly buffY: number;
  private readonly buffTexts: Phaser.GameObjects.Text[] = [];

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
    // 현재 버프: 코인 아래 한 줄
    this.buffY = barsBottom + 2 * (h.fontSize + 2) + 2;

    // --- 미니맵 ---
    this.minimap = new Minimap(scene, ctx);
    this.minimap.container.setPosition(W - h.margin - h.minimap.width, h.margin);

    // --- PC 전용: 스킬바 + 무기 슬롯 ---
    this.pcOnly = scene.add.container(0, 0);
    const sb = h.skillbar;
    const totalW = SKILLBAR.length * sb.slotSize + (SKILLBAR.length - 2) * sb.gap + sb.groupGap;
    let x = (W - totalW) / 2;
    const y = H - h.margin - sb.slotSize;
    const size = sb.slotSize;
    const small = h.fontSize - 3;
    SKILLBAR.forEach((slot, i) => {
      if (i === 4) x += sb.groupGap - sb.gap;
      const bg = scene.add.rectangle(0, 0, size, size, 0x000000, 0.5).setOrigin(0).setStrokeStyle(1, hexColor(sb.emptyColor));
      const label = text(size / 2, size / 2 - 1, '', h.fontSize - 2).setOrigin(0.5);
      const cd = scene.add.graphics();
      const cdText = text(size / 2, size / 2 - 1, '', h.fontSize).setOrigin(0.5).setStroke('#000000', 2);
      const key = text(1, 0, slot.keyLabel, small).setAlpha(0.7);
      const star = text(size - 1, 0, '★', small).setOrigin(1, 0).setColor(sb.awakenedColor);
      const dots = [0, 1, 2].map((k) => scene.add.rectangle(size / 2 - 5 + k * 4, size - 3, 3, 2, 0x333333).setOrigin(0));
      const container = scene.add.container(x, y, [bg, label, cd, cdText, key, star, ...dots]);
      if (DISABLED_ACTIONS.has(slot.action as ButtonAction)) container.setAlpha(sb.disabledAlpha);
      this.slots.push({ x, y, bg, label, cd, cdText, dots, star, container });
      this.pcOnly.add(container);
      x += size + sb.gap;
    });
    this.storedBadge = text(x + 2, y + size / 2, '', h.fontSize - 2).setOrigin(0, 0.5).setColor(sb.awakenedColor);
    this.pcOnly.add(this.storedBadge);

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
    setBar(this.shield, p.shield, p.shieldMax);
    const empty = now - s.energyEmptyAt < this.ctx.data.ui.energyEmptyFlashSec * 1000;
    setBar(this.energy, p.energy, p.energyMax, empty ? hexColor(this.ctx.data.ui.hud.bars.hpColor) : this.energy.color);

    this.stageText.setText(this.ctx.t('hud.stage', { chapter: s.stage.chapter, stage: s.stage.stage }));
    this.coinText.setText(this.ctx.t('hud.coins', { coins: Math.floor(p.coins) }));

    const weapons = this.ctx.data.weapons.weapons;
    // 맨손이면 주먹
    const mainItem = activeWeapon(p.weapons) ?? { defId: this.ctx.data.weapons.fistWeapon, grade: 'common' as const, options: [] };
    const subItem = otherWeapon(p.weapons);
    const main = weapons.find((w) => w.id === mainItem?.defId);
    const sub = weapons.find((w) => w.id === subItem?.defId);
    const gradeColor = (g: string | undefined) => this.ctx.data.groupMultipliers.grades.find((x) => x.id === g)?.color ?? '#ffffff';
    this.mainWeaponText.setText(main ? this.ctx.t(main.nameKey) : '').setColor(gradeColor(mainItem?.grade));
    const cost = main && mainItem ? weaponStats(main, mainItem, 1).energyCost : 0;
    this.mainCostText.setText(String(cost)).setColor(empty ? '#ff5555' : this.ctx.data.ui.hud.bars.energyColor);
    this.subWeaponText.setText(sub ? this.ctx.t(sub.nameKey) : '').setColor(gradeColor(subItem?.grade));

    this.updateBuffs(s);
    this.minimap.render(s.map, s.visited, s.currentRoomId, this.ctx.debugFlags.revealMap, s.encounters);
    if (this.pcOnly.visible) this.updateSkillbar(s);
  }

  /** 현재 버프: 색 칸에 짧은 이름 + 남은 초 */
  private updateBuffs(s: RunSession): void {
    const h = this.ctx.data.ui.hud;
    let x = 0;
    s.buffs.forEach((b, i) => {
      let t = this.buffTexts[i];
      if (!t) {
        t = this.scene.add
          .text(0, this.buffY, '', { fontFamily: 'sans-serif', fontSize: `${h.fontSize - 2}px`, color: '#ffffff', padding: { x: 2, y: 1 } })
          .setStroke('#000000', 2);
        this.buffTexts.push(t);
        this.bars.add(t);
      }
      t.setVisible(true).setX(x).setBackgroundColor(b.color).setText(`${b.label} ${Math.ceil(b.leftSec)}`);
      x += t.width + 2;
    });
    for (let i = s.buffs.length; i < this.buffTexts.length; i++) this.buffTexts[i]!.setVisible(false);
  }

  private updateSkillbar(s: RunSession): void {
    const sb = this.ctx.data.ui.hud.skillbar;
    const size = sb.slotSize;
    const ultIndex = 4;
    s.skillView.forEach((v, i) => {
      const ui = this.slots[i];
      if (!ui) return;
      const filled = v.skillId !== null;
      const borderColor = !filled
        ? sb.emptyColor
        : i === ultIndex
          ? v.usable
            ? sb.ultimateReadyColor
            : sb.emptyColor
          : v.awakened
            ? sb.awakenedColor
            : (sb.levelColors[v.level - 1] ?? sb.emptyColor);
      ui.bg.setStrokeStyle(v.awakened || (i === ultIndex && v.usable) ? 2 : 1, hexColor(borderColor));
      ui.label.setText(v.label).setColor(filled ? '#ffffff' : '#666666');
      ui.star.setVisible(v.awakened);
      ui.dots.forEach((dot, k) => {
        dot.setVisible(filled && i !== ultIndex);
        dot.setFillStyle(k < v.level ? hexColor(sb.levelColors[v.level - 1] ?? sb.emptyColor) : 0x333333);
      });

      // 쿨타임: 위에서부터 시계 방향으로 줄어드는 원형 게이지 + 숫자 / 궁극기: 아래에서 차오르는 게이지
      ui.cd.clear();
      ui.cdText.setText('');
      if (i === ultIndex) {
        const hgt = Math.round(size * Math.min(1, v.gauge));
        ui.cd.fillStyle(hexColor(v.color), 0.45);
        ui.cd.fillRect(1, size - hgt, size - 2, hgt);
      } else if (v.cooldownLeft > 0 && v.cooldownTotal > 0) {
        const frac = Math.min(1, v.cooldownLeft / v.cooldownTotal);
        const start = -Math.PI / 2;
        ui.cd.fillStyle(hexColor(sb.cooldownColor), sb.cooldownAlpha);
        ui.cd.slice(size / 2, size / 2, size / 2 - 1, start, start + frac * Math.PI * 2, false);
        ui.cd.fillPath();
        ui.cdText.setText(String(Math.ceil(v.cooldownLeft)));
      }
      ui.container.setAlpha(filled && !v.usable && i !== ultIndex ? sb.disabledAlpha : 1);
    });
    // 보관 중인 스킬이 있으면 스킬바 옆에 개수 배지
    const stored = storedSkills(s.player.loadout).length;
    this.storedBadge.setText(stored > 0 ? this.ctx.t('hud.stored', { count: stored }) : '');
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
    const i = SKILLBAR.findIndex((s) => s.action === action);
    const bg = this.slots[i]?.bg;
    if (!bg) return;
    bg.setFillStyle(0xffffff, 0.6);
    this.scene.time.delayedCall(120, () => bg.setFillStyle(0x000000, 0.5));
  }
}

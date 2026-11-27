/**
 * 오버플로우 전용 HUD: 미니맵 테두리가 붉게 바뀌고 'OVERFLOW' 표시가 붙으며, 이따금 화면 테두리에 붉은 글리치가
 * 번쩍였다 사라진다. 미니맵 아래에는 지금까지 고른 진화(중첩)와 받은 보상이 쌓인다. 수치는 ui.json hud.overflow.
 */
import Phaser from 'phaser';
import type { GameContext } from '../core/context';
import { hexColor } from '../core/scale';
import type { RunSession } from '../core/session';

export class OverflowHud {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly list: Phaser.GameObjects.Text;
  private readonly glitch: Phaser.GameObjects.Graphics;
  private nextGlitch = 0;
  private glitchUntil = 0;
  private listKey = '';
  private on = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly ctx: GameContext,
  ) {
    const O = ctx.data.ui.hud.overflow;
    const font = (size: number, color: string) => ({ fontFamily: 'sans-serif', fontSize: `${size}px`, color });
    this.frame = scene.add.graphics().setDepth(5);
    this.label = scene.add.text(0, 0, O.label, font(O.labelSize, O.color)).setOrigin(1, 1).setDepth(5).setStroke('#000000', 2);
    this.list = scene.add.text(0, 0, '', { ...font(O.listSize, O.listColor), lineSpacing: 0, align: 'right' }).setOrigin(1, 0).setDepth(5).setStroke('#000000', 2);
    this.glitch = scene.add.graphics().setDepth(40).setScrollFactor(0);
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    this.on = v;
    for (const o of [this.frame, this.label, this.list, this.glitch]) o.setVisible(v);
  }

  /** mm: 미니맵 자리 (보일 때만) */
  update(s: RunSession, now: number, mm: { x: number; y: number; w: number; h: number; visible: boolean }): void {
    const ovf = s.player.overflow;
    if (!ovf !== !this.on) this.setVisible(!!ovf);
    if (!ovf) return;
    const O = this.ctx.data.ui.hud.overflow;
    const red = hexColor(O.color);
    // 미니맵 테두리: 붉은 이중선, 숨쉬듯
    const pulse = 0.55 + 0.45 * Math.abs(Math.sin(now / 700));
    this.frame.clear().setVisible(mm.visible);
    this.label.setVisible(mm.visible);
    this.list.setVisible(mm.visible);
    if (mm.visible) {
      this.frame.lineStyle(1, red, pulse).strokeRect(mm.x - 1, mm.y - 1, mm.w + 2, mm.h + 2);
      this.frame.lineStyle(1, red, pulse * 0.35).strokeRect(mm.x - 3, mm.y - 3, mm.w + 6, mm.h + 6);
      this.label.setPosition(mm.x + mm.w, mm.y + mm.h + O.labelSize + 2).setText(`${O.label} ${s.stage.chapter}-${s.stage.stage}`);
      this.list.setPosition(mm.x + mm.w, mm.y + mm.h + O.labelSize + 4);
      this.updateList(s);
    }
    this.updateGlitch(now);
  }

  /** 고른 진화(이름 ×중첩, 유니크, 과부하) + 받은 보상(이름 ×횟수) */
  private updateList(s: RunSession): void {
    const ovf = s.player.overflow!;
    const t = this.ctx.t;
    const O = this.ctx.data.ui.hud.overflow;
    const key = JSON.stringify([ovf.evolution, ovf.picks?.length ?? 0]);
    if (key === this.listKey) return;
    this.listKey = key;
    const st = ovf.evolution;
    // 이름만 줄이고 ×중첩은 남긴다
    const short = (x: string) => ([...x].length > O.lineChars ? `${[...x].slice(0, O.lineChars - 1).join('')}…` : x);
    const evo = [
      ...Object.entries(st.stacks)
        .filter(([, n]) => n > 0)
        .map(([id, n]) => `${short(t(`evo.${id}.name`))} ×${n}`),
      ...st.uniques.map((id) => `★ ${short(t(`evo.${id}.name`))}`),
      ...(st.overloadStacks > 0 ? [`${t(`evo.${this.ctx.data.overflow.evolution.overloadCard.id}.name`)} ×${st.overloadStacks}`] : []),
    ];
    const rewards = new Map<string, number>();
    for (const p of ovf.picks ?? []) rewards.set(p.reward, (rewards.get(p.reward) ?? 0) + 1);
    const rew = [...rewards].map(([id, n]) => (n > 1 ? `${short(t(`evoReward.${id}`))} ×${n}` : short(t(`evoReward.${id}`))));
    const cut = (xs: string[]) => (xs.length > O.maxLines ? [...xs.slice(0, O.maxLines - 1), t('hud.overflow.more', { n: xs.length - O.maxLines + 1 })] : xs);
    const lines = [
      t('hud.overflow.evolutions'),
      ...(evo.length > 0 ? cut(evo) : [t('hud.overflow.none')]),
      t('hud.overflow.rewards'),
      ...(rew.length > 0 ? cut(rew) : [t('hud.overflow.none')]),
    ];
    this.list.setText(lines.join('\n'));
  }

  /** 화면 테두리 글리치: everySec 범위마다 sec 동안 붉은 테두리 조각이 어긋나며 번쩍인다 (화면 효과 약하게면 흐리게) */
  private updateGlitch(now: number): void {
    const O = this.ctx.data.ui.hud.overflow.glitch;
    const W = this.ctx.data.ui.baseWidth;
    const H = this.ctx.data.ui.baseHeight;
    const g = this.glitch;
    if (this.nextGlitch === 0) this.nextGlitch = now + O.everySec[0] * 1000;
    if (now >= this.nextGlitch) {
      this.glitchUntil = now + O.sec * 1000;
      this.nextGlitch = now + (O.everySec[0] + Math.random() * (O.everySec[1] - O.everySec[0])) * 1000;
    }
    g.clear();
    if (now >= this.glitchUntil) return;
    const k = (this.glitchUntil - now) / (O.sec * 1000);
    const weak = this.ctx.save.data.reduceFx ? 0.35 : 1;
    const a = O.alpha * weak * (0.5 + 0.5 * Math.sin(k * Math.PI)) * (Math.random() < 0.8 ? 1 : 0.3);
    const red = hexColor(this.ctx.data.ui.hud.overflow.color);
    const th = O.thickness;
    // 테두리 네 변 + 어긋난 조각 몇 개
    g.fillStyle(red, a * 0.5).fillRect(0, 0, W, th).fillRect(0, H - th, W, th).fillRect(0, 0, th, H).fillRect(W - th, 0, th, H);
    for (let i = 0; i < O.slices; i++) {
      const side = i % 4;
      const len = 10 + Math.random() * 60;
      const off = Math.random() * (side < 2 ? W : H);
      const jitter = (Math.random() - 0.5) * 6;
      g.fillStyle(i % 3 === 0 ? 0xffffff : red, a);
      if (side === 0) g.fillRect(off, jitter + th, len, 2);
      else if (side === 1) g.fillRect(off, H - th - 2 + jitter, len, 2);
      else if (side === 2) g.fillRect(th + jitter, off, 2, len);
      else g.fillRect(W - th - 2 + jitter, off, 2, len);
    }
  }
}

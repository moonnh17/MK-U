/** 적 상태이상 겉모습: 화상·출혈(머리 위 문양·입자), 석화(굳는 금·깨지는 파편), 처형 X표시. 색·시간은 juice.status */
import type Phaser from 'phaser';
import { getContext } from '../core/context';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';

/** 겉모습 전용 랜덤 (게임 판정 RNG를 건드리지 않는다) */
let fxRng: Rng | null = null;
const rnd = () => (fxRng ??= Rng.derive(getContext().config.seed, 'status-fx')).next();

export type StatusKind = 'burn' | 'bleed';

/**
 * 머리 위 문양 픽셀 (숫자는 juice.status.<kind>.colors 순번, 1부터). small은 중첩이 차는 동안, full은 최대 중첩.
 * 불: 1 노랑 2 주황 3 빨강 4 흰 심지 / 핏방울: 1 밝은 빨강 2 빨강 3 검붉음 4 옅은 반짝임
 */
const MARKS: Record<StatusKind, { small: string[]; full: string[] }> = {
  burn: {
    small: ['...1...', '..121..', '..121..', '.12221.', '.12321.', '1233321', '1233321', '.12221.'],
    full: ['....1....', '...121...', '.1.121.1.', '.1122211.', '.1224221.', '122444221', '123444321', '123343321', '123333321', '.1233321.', '..11111..'],
  },
  bleed: {
    small: ['..3..', '.323.', '.323.', '32213', '32223', '32223', '.333.'],
    full: ['4...3...4', '....3....', '...323...', '..32223..', '.3221223.', '.3221223.', '322222223', '322222223', '.3222223.', '..33333..', '4.......4'],
  },
};

/** 3×5 숫자 (중첩 수 표시) */
const DIGITS = ['111101101101111', '010110010010111', '111001111100111', '111001111001111', '101101111001001', '111100111001111', '111100111101111', '111001010010010', '111101111101111', '111101111001111'];

/** 중첩 수 글자: 검은 테두리 1px를 두른 숫자 */
function numberTexture(scene: Phaser.Scene, kind: StatusKind, n: number, color: string): string {
  const key = `status_${kind}_n${n}`;
  if (scene.textures.exists(key)) return key;
  const ds = String(n).split('').map(Number);
  const w = ds.length * 4 - 1;
  const g = scene.make.graphics({}, false);
  const dots: [number, number][] = [];
  ds.forEach((d, i) => [...DIGITS[d]!].forEach((c, j) => c === '1' && dots.push([1 + i * 4 + (j % 3), 1 + Math.floor(j / 3)])));
  g.fillStyle(0x000000, 1);
  for (const [x, y] of dots) g.fillRect(x - 1, y - 1, 3, 3);
  g.fillStyle(hexColor(color), 1);
  for (const [x, y] of dots) g.fillRect(x, y, 1, 1);
  g.generateTexture(key, w + 2, 7);
  g.destroy();
  return key;
}

function markTexture(scene: Phaser.Scene, kind: StatusKind, size: 'small' | 'full'): string {
  const key = `status_${kind}_${size}`;
  if (scene.textures.exists(key)) return key;
  const cols = getContext().data.juice.status[kind].colors.map(hexColor);
  const rows = MARKS[kind][size];
  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && g.fillStyle(cols[Number(c) - 1]!, 1).fillRect(x, y, 1, 1)));
  g.generateTexture(key, rows[0]!.length, rows.length);
  g.destroy();
  return key;
}

/**
 * 화상·출혈 겉모습: 머리 위 문양 + 중첩 수 + 칸 게이지(최대 중첩만큼 칸, 찬 만큼 밝게). 최대 중첩이면 문양이 화려하게 바뀌어 맥박치고
 * 게이지가 번쩍인다. 입자는 불티는 위로, 핏방울은 아래로. 물듦은 enemy.restoreTint가 맡는다.
 */
export class StatusLook {
  private readonly mark: Phaser.GameObjects.Image;
  private readonly count: Phaser.GameObjects.Image;
  private readonly pips: Phaser.GameObjects.Graphics;
  private particleIn = 0;
  private full = false;
  private shown = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly kind: StatusKind,
  ) {
    this.mark = scene.add.image(0, 0, markTexture(scene, kind, 'small')).setDepth(6);
    this.count = scene.add.image(0, 0, numberTexture(scene, kind, 1, getContext().data.juice.status[kind].colors[0]!)).setDepth(6).setOrigin(0, 0.5);
    this.pips = scene.add.graphics().setDepth(6);
  }

  update(dt: number, x: number, headY: number, stacks: number, maxStacks: number): void {
    const st = getContext().data.juice.status;
    const def = st[this.kind];
    const full = stacks >= maxStacks;
    if (full !== this.full) {
      this.full = full;
      this.mark.setTexture(markTexture(this.scene, this.kind, full ? 'full' : 'small'));
    }
    const n = Math.min(stacks, maxStacks);
    if (n !== this.shown) {
      this.shown = n;
      this.count.setTexture(numberTexture(this.scene, this.kind, n, full ? def.colors[3]! : def.colors[0]!));
    }
    this.mark.setScale(full ? 1 + st.markFullPulse * Math.sin(this.scene.time.now / 90) : 1);
    // 문양 + 숫자를 한 줄로 가운데 맞춤, 그 아래 칸 게이지
    const pipsW = maxStacks * 2 - 1;
    const rowW = this.mark.width + 1 + this.count.width;
    const left = x - rowW / 2;
    const bottom = headY - st.markGapPx;
    const iconY = bottom - st.markPipGapPx - this.mark.height / 2;
    this.mark.setPosition(left + this.mark.width / 2, iconY);
    this.count.setPosition(left + this.mark.width + 1, iconY + 1);
    const blink = full && Math.sin(this.scene.time.now / 70) > 0;
    const px = Math.round(x - pipsW / 2);
    this.pips.clear().fillStyle(0x000000, 0.7).fillRect(px - 1, bottom - 1, pipsW + 2, 4);
    for (let i = 0; i < maxStacks; i++) this.pips.fillStyle(i < n ? hexColor(blink ? def.colors[3]! : def.colors[1]!) : 0x3a3a3a, 1).fillRect(px + i * 2, bottom, 1, 2);
    this.particleIn -= dt;
    if (this.particleIn > 0) return;
    this.particleIn = def.particleEverySec / (full ? st.markFullParticleMul : 1);
    const col = def.colors[Math.floor(rnd() * 3)]!;
    const s = full && rnd() < 0.4 ? 2 : 1;
    const p = this.scene.add.rectangle(x + (rnd() - 0.5) * 10, headY + 6 + rnd() * 8, s, s, hexColor(col)).setDepth(5);
    this.scene.tweens.add({ targets: p, y: p.y + def.particleMovePx, alpha: 0, duration: def.particleLifeSec * 1000, ease: def.particleMovePx > 0 ? 'Quad.easeIn' : 'Linear', onComplete: () => p.destroy() });
  }

  destroy(): void {
    this.mark.destroy();
    this.count.destroy();
    this.pips.destroy();
  }
}

/** 석화가 풀리며 돌 파편이 사방으로 튄다 */
export function shatter(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  const st = getContext().data.juice.status;
  for (let i = 0; i < st.shatterShards; i++) {
    const a = rnd() * Math.PI * 2;
    const sp = st.shatterSpeed[0] + rnd() * (st.shatterSpeed[1] - st.shatterSpeed[0]);
    const s = 1 + Math.floor(rnd() * 3);
    const col = hexColor(st.petrifyColors[Math.floor(rnd() * st.petrifyColors.length)]!);
    const p = scene.add.rectangle(x + Math.cos(a) * radius * 0.5, y + Math.sin(a) * radius * 0.5, s, s, col).setDepth(5).setRotation(rnd() * 3);
    const t = st.shatterLifeSec * (0.6 + rnd() * 0.4);
    // 위로 튀었다가 떨어지는 포물선
    scene.tweens.add({ targets: p, x: p.x + Math.cos(a) * sp * t, duration: t * 1000, onComplete: () => p.destroy() });
    scene.tweens.add({ targets: p, y: p.y + Math.sin(a) * sp * t * 0.6 + 10, alpha: 0, angle: 180, duration: t * 1000, ease: 'Quad.easeIn' });
  }
  const dust = scene.add.circle(x, y, radius, hexColor(st.petrifyColors[1]!), 0.4).setDepth(4);
  scene.tweens.add({ targets: dust, scale: 1.6, alpha: 0, duration: 300, onComplete: () => dust.destroy() });
}

/** 석화되는 순간: 금이 가는 선이 몸에 퍼진다 */
export function petrifyCrack(scene: Phaser.Scene, x: number, y: number, radius: number): void {
  const st = getContext().data.juice.status;
  const g = scene.add.graphics().setDepth(5);
  g.lineStyle(1, hexColor(st.petrifyColors[2]!), 1);
  for (let i = 0; i < 4; i++) {
    let px = x + (rnd() - 0.5) * radius;
    let py = y - radius * 0.8;
    g.beginPath().moveTo(px, py);
    for (let j = 0; j < 3; j++) {
      px += (rnd() - 0.5) * radius * 0.8;
      py += radius * 0.5;
      g.lineTo(px, py);
    }
    g.strokePath();
  }
  scene.tweens.add({ targets: g, alpha: 0, delay: st.petrifyCrackSec * 1000, duration: 300, onComplete: () => g.destroy() });
}

/** 처형: 적 자리에 붉은 X가 커지며 사라진다 */
export function executeMark(scene: Phaser.Scene, x: number, y: number): void {
  const st = getContext().data.juice.status;
  const g = scene.add.graphics().setDepth(7).setPosition(x, y);
  const s = st.executeSize;
  g.lineStyle(3, 0x000000, 0.6).lineBetween(-s, -s, s, s).lineBetween(-s, s, s, -s);
  g.lineStyle(2, hexColor(st.executeColor), 1).lineBetween(-s, -s, s, s).lineBetween(-s, s, s, -s);
  g.setScale(1.8);
  scene.tweens.add({ targets: g, scale: 1, duration: 90, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: g, alpha: 0, delay: st.executeSec * 600, duration: st.executeSec * 400, onComplete: () => g.destroy() });
}

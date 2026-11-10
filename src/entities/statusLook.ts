/** 적 상태이상 겉모습: 화상(머리 위 불 문양·불씨), 석화(굳는 금·깨지는 파편), 처형 X표시. 색·시간은 juice.status */
import type Phaser from 'phaser';
import { getContext } from '../core/context';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';

/** 겉모습 전용 랜덤 (게임 판정 RNG를 건드리지 않는다) */
let fxRng: Rng | null = null;
const rnd = () => (fxRng ??= Rng.derive(getContext().config.seed, 'status-fx')).next();

/** 7×8 불 문양 (1 밝은 노랑, 2 주황, 3 빨강) */
const FLAME = ['...1...', '..121..', '..121..', '.12221.', '.12321.', '1233321', '1233321', '.12221.'];
const FLAME_KEY = 'status_burn_mark';

function flameTexture(scene: Phaser.Scene): string {
  if (scene.textures.exists(FLAME_KEY)) return FLAME_KEY;
  const cols = getContext().data.juice.status.burnColors.map(hexColor);
  const g = scene.make.graphics({}, false);
  FLAME.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && g.fillStyle(cols[Number(c) - 1]!, 1).fillRect(x, y, 1, 1)));
  g.generateTexture(FLAME_KEY, 7, 8);
  g.destroy();
  return FLAME_KEY;
}

export class BurnLook {
  private readonly mark: Phaser.GameObjects.Image;
  private emberIn = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.mark = scene.add.image(0, 0, flameTexture(scene)).setDepth(6);
  }

  update(dt: number, x: number, headY: number): void {
    const st = getContext().data.juice.status;
    const bob = Math.sin(this.scene.time.now / 120) * 0.6;
    this.mark.setPosition(x, headY - st.burnMarkGapPx + bob);
    this.emberIn -= dt;
    if (this.emberIn > 0) return;
    this.emberIn = st.burnEmberEverySec;
    const col = st.burnColors[Math.floor(rnd() * st.burnColors.length)]!;
    const e = this.scene.add.rectangle(x + (rnd() - 0.5) * 10, headY + 6 + rnd() * 8, 1, 1, hexColor(col)).setDepth(5);
    this.scene.tweens.add({ targets: e, y: e.y - st.burnEmberRisePx, alpha: 0, duration: st.burnEmberLifeSec * 1000, onComplete: () => e.destroy() });
  }

  destroy(): void {
    this.mark.destroy();
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

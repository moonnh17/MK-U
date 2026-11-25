/** 적 상태이상 겉모습: 머리 위 문양·숫자(화상·출혈·냉기·기절·석화·묶기·부식), 화상·출혈 입자, 석화(굳는 금·깨지는 파편), 처형 X표시. 색·시간은 juice.status */
import type Phaser from 'phaser';
import { getContext } from '../core/context';
import { Rng } from '../core/rng';
import { hexColor } from '../core/scale';

/** 겉모습 전용 랜덤 (게임 판정 RNG를 건드리지 않는다) */
let fxRng: Rng | null = null;
const rnd = () => (fxRng ??= Rng.derive(getContext().config.seed, 'status-fx')).next();

/** 머리 위에 띄우는 상태이상. 화상·출혈·서리는 중첩 수, 나머지는 남은 초를 숫자로 */
export type StatusKind = 'bleed' | 'burn' | 'frost' | 'chill' | 'freeze' | 'stun' | 'petrify' | 'bind' | 'corruption';
/** 입자를 뿜는 종류 (juice.status.burn·bleed에 입자 설정이 있다) */
type ParticleKind = 'burn' | 'bleed';
const hasParticles = (k: StatusKind): k is ParticleKind => k === 'burn' || k === 'bleed';

/**
 * 머리 위 문양 픽셀 (숫자는 색 순번, 1부터). small은 평소, full은 최대 중첩(없으면 small 그대로).
 * 불: 1 노랑 2 주황 3 빨강 4 흰 심지 / 핏방울: 1 밝은 빨강 2 빨강 3 검붉음 4 옅은 반짝임
 */
const MARKS: Record<StatusKind, { small: string[]; full?: string[] }> = {
  burn: {
    small: ['...1...', '..121..', '..121..', '.12221.', '.12321.', '1233321', '1233321', '.12221.'],
    full: ['....1....', '...121...', '.1.121.1.', '.1122211.', '.1224221.', '122444221', '123444321', '123343321', '123333321', '.1233321.', '..11111..'],
  },
  bleed: {
    small: ['..3..', '.323.', '.323.', '32213', '32223', '32223', '.333.'],
    full: ['4...3...4', '....3....', '...323...', '..32223..', '.3221223.', '.3221223.', '322222223', '322222223', '.3222223.', '..33333..', '4.......4'],
  },
  // 눈송이
  frost: { small: ['1..1..1', '.1.1.1.', '..242..', '1144411', '..242..', '.1.1.1.', '1..1..1'] },
  // 아래로 겹친 화살(느려짐)
  chill: { small: ['1.....1', '21...12', '.21.12.', '..212..', '1..2..1', '21.2.12', '.21212.', '..212..'] },
  // 얼음 덩어리
  freeze: { small: ['3333333', '3442223', '3422223', '3222223', '3222213', '3222113', '3333333'] },
  // 별
  stun: { small: ['...1...', '..121..', '1112111', '.12421.', '..121..', '.12.21.', '1.....1'] },
  // 돌덩이
  petrify: { small: ['..333..', '.32243.', '3222223', '3221123', '3211113', '.33333.'] },
  // 자물쇠
  bind: { small: ['..111..', '.1...1.', '.1...1.', '1111111', '1222221', '1224221', '1222221', '1111111'] },
  // 부식된 눈
  corruption: { small: ['..111..', '.12221.', '1223221', '1234321', '1223221', '.12221.', '..111..'] },
};

/** 종류별 문양·숫자 색 (1 밝은색 2 중간 3 어두운 4 가장 밝은 점) */
function colorsOf(kind: StatusKind): string[] {
  const st = getContext().data.juice.status;
  return hasParticles(kind) ? st[kind].colors : st.markColors[kind];
}

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
  const cols = colorsOf(kind).map(hexColor);
  const rows = (size === 'full' ? MARKS[kind].full : undefined) ?? MARKS[kind].small;
  const g = scene.make.graphics({}, false);
  rows.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && g.fillStyle(cols[Number(c) - 1]!, 1).fillRect(x, y, 1, 1)));
  g.generateTexture(key, rows[0]!.length, rows.length);
  g.destroy();
  return key;
}

/**
 * 상태이상 하나의 머리 위 표시: 문양 + 오른쪽 아래 작은 숫자(중첩 수 또는 남은 초). 최대 중첩이면 문양이 화려하게 바뀌어 맥박치고
 * 숫자가 가장 밝은 색이 된다. 화상·출혈은 입자도 뿜는다(불티는 위로, 핏방울은 아래로). 물듦은 enemy.restoreTint가 맡는다.
 * 여러 개가 걸리면 enemy가 width로 한 줄에 나란히 놓는다.
 */
export class StatusLook {
  private readonly mark: Phaser.GameObjects.Image;
  private readonly count: Phaser.GameObjects.Image;
  private particleIn = 0;
  private full = false;
  private shown = -1;

  constructor(
    private readonly scene: Phaser.Scene,
    readonly kind: StatusKind,
  ) {
    this.mark = scene.add.image(0, 0, markTexture(scene, kind, 'small')).setDepth(6);
    this.count = scene.add.image(0, 0, numberTexture(scene, kind, 1, colorsOf(kind)[0]!)).setDepth(6.1).setOrigin(0, 1).setScale(getContext().data.juice.status.markNumberScale);
  }

  /** 한 줄에 차지하는 폭 (문양 + 숫자) */
  get width(): number {
    return this.mark.width + this.count.displayWidth - 1;
  }

  /** left: 왼쪽 끝, bottom: 문양 아래쪽 y */
  update(dt: number, left: number, bottom: number, n: number, full: boolean): void {
    const st = getContext().data.juice.status;
    const cols = colorsOf(this.kind);
    if (full !== this.full) {
      this.full = full;
      this.shown = -1;
      this.mark.setTexture(markTexture(this.scene, this.kind, full ? 'full' : 'small'));
    }
    if (n !== this.shown) {
      this.shown = n;
      this.count.setTexture(numberTexture(this.scene, this.kind, n, full ? cols[3]! : cols[0]!));
    }
    this.mark.setScale(full ? 1 + st.markFullPulse * Math.sin(this.scene.time.now / 90) : 1);
    const x = left + this.mark.width / 2;
    this.mark.setPosition(x, bottom - this.mark.height / 2);
    // 숫자는 문양 오른쪽 아래에 살짝 겹쳐 붙인다
    this.count.setPosition(left + this.mark.width - 1, bottom + 1);
    if (!hasParticles(this.kind)) return;
    const def = st[this.kind];
    this.particleIn -= dt;
    if (this.particleIn > 0) return;
    this.particleIn = def.particleEverySec / (full ? st.markFullParticleMul : 1);
    const col = def.colors[Math.floor(rnd() * 3)]!;
    const s = full && rnd() < 0.4 ? 2 : 1;
    const p = this.scene.add.rectangle(x + (rnd() - 0.5) * 10, bottom + 10 + rnd() * 8, s, s, hexColor(col)).setDepth(5);
    this.scene.tweens.add({ targets: p, y: p.y + def.particleMovePx, alpha: 0, duration: def.particleLifeSec * 1000, ease: def.particleMovePx > 0 ? 'Quad.easeIn' : 'Linear', onComplete: () => p.destroy() });
  }

  destroy(): void {
    this.mark.destroy();
    this.count.destroy();
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

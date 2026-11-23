/**
 * 무기 Q 스킬 (weapons.json qSkill). 재사용 대기는 무기마다 따로 센다.
 * - 3식 제미니(라스알하게의 검): 둘레에 푸른 분신이 나타나 본체와 함께 strikes번 벤다. 마지막 베기는 공간격 +
 *   케라우노스처럼 화면이 벤 선을 따라 갈라졌다가 봉합된다.
 * - 정화의 불길(아비오르의 지팡이): 사방으로 불길을 내뿜으며 굵은 직선 레이저를 난사한다. 한 번에 beams줄을 고르게,
 *   다음 번에는 반 칸 돌려 쏴서 레이저끼리 겹치지 않고 옆면만 맞닿는다.
 */
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { hexColor } from '../../core/scale';
import { startSpaceRift } from '../../entities/spaceCutFx';
import { shake } from '../../entities/juice';
import { playFx, tintedFx } from '../../skills/skillFx';
import { animKey } from '../../systems/art';
import { lineHits } from '../../systems/targeting';
import { inArc, type WeaponStats } from '../../systems/weapons';
import type { TagId, WeaponDef, WeaponQSkill } from '../../types/data';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

type Gemini = Extract<WeaponQSkill, { kind: 'gemini' }>;
type Flame = Extract<WeaponQSkill, { kind: 'purifyingFlame' }>;

export class WeaponSkills {
  /** 무기 id → 남은 재사용 대기(초) */
  private cd = new Map<string, number>();

  constructor(private readonly run: RunScene) {}

  update(dt: number): void {
    for (const [id, s] of this.cd) this.cd.set(id, Math.max(0, s - dt));
  }

  /** 남은 재사용 대기 (HUD·토스트) */
  cooldownOf(id: string): number {
    return this.cd.get(id) ?? 0;
  }

  /** Q: 들고 있는 무기의 스킬을 쓴다. 이 무기에 스킬이 있으면 true(재사용 대기 중이어도) */
  use(w: WeaponDef): boolean {
    const q = w.qSkill;
    if (!q) return false;
    const left = this.cooldownOf(w.id);
    if (left > 0) {
      this.run.toastThrottled(this.run.ctx.t('weapon.qCooldown', { name: this.run.ctx.t(q.nameKey), s: Math.ceil(left) }));
      return true;
    }
    this.cd.set(w.id, q.cooldownSec);
    const st = this.run.weaponStatsOf(this.run.weaponItem());
    this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y }, this.run.ctx.t(q.nameKey), q.color);
    if (q.kind === 'gemini') this.gemini(w, q, st);
    else this.purifyingFlame(w, q, st);
    return true;
  }

  // ---------- 3식 제미니 ----------

  private gemini(w: WeaponDef, q: Gemini, st: WeaponStats): void {
    const p = this.run.player;
    const color = hexColor(q.color);
    // 분신: 본체 둘레에 고르게, 푸른 빛으로 물든 모습이 번쩍이며 나타난다
    const clones: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < q.clones; i++) {
      const a = (i / q.clones) * Math.PI * 2 + Math.PI / 2;
      const c = this.run.add
        .image(p.x + Math.cos(a) * q.cloneDistPx, p.y + Math.sin(a) * q.cloneDistPx * 0.6, p.texture.key, p.frame.name)
        .setOrigin(p.originX, p.originY)
        .setScale(p.scaleX, p.scaleY)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
        .setDepth(5);
      this.run.tweens.add({ targets: c, alpha: 0.75, duration: 120 });
      clones.push(c);
    }
    sfx('awaken');
    for (let k = 0; k < q.strikes; k++) {
      this.run.time.delayedCall((0.12 + k * q.gapSec) * 1000, () => this.geminiStrike(w, q, st, clones, k === q.strikes - 1));
    }
    this.run.time.delayedCall((0.12 + q.strikes * q.gapSec + 0.25) * 1000, () => {
      for (const c of clones) this.run.tweens.add({ targets: c, alpha: 0, duration: 200, onComplete: () => c.destroy() });
    });
  }

  /** 한 번 베기: 본체와 분신이 각자 가장 가까운 적(없으면 조준 방향) 쪽으로 */
  private geminiStrike(w: WeaponDef, q: Gemini, st: WeaponStats, clones: Phaser.GameObjects.Image[], last: boolean): void {
    const p = this.run.player;
    const bodies: Vec2[] = [{ x: p.x, y: p.y }, ...clones.filter((c) => c.active).map((c) => ({ x: c.x, y: c.y }))];
    const arc = w.pattern.kind === 'arc' ? w.pattern : { arcDeg: 150, radius: 56 };
    const radius = arc.radius * q.radiusMul * (1 + this.run.itemRt.sums.area);
    const fx = this.run.ctx.data.weapons.meleeFx;
    const tags: readonly TagId[] = last ? [...w.tags, 'space'] : w.tags;
    const base = st.damage * q.damageMul;
    let riftDone = false;
    bodies.forEach((b, i) => {
      const target = this.nearest(b);
      const ang = target ? Math.atan2(target.y - b.y, target.x - b.x) : Math.atan2(this.run.aimDir.y, this.run.aimDir.x);
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const clone = i > 0 ? clones[i - 1] : null;
      // 분신은 베는 쪽으로 몸을 내밀었다 돌아온다
      if (clone) {
        clone.setFlipX(dir.x < 0);
        this.run.tweens.add({ targets: clone, x: clone.x + dir.x * 6, y: clone.y + dir.y * 6, duration: 70, yoyo: true });
      }
      if (!last) {
        const enemies = this.run.enemies.filter((e) => !e.dead && inArc(b, ang, arc.arcDeg, radius, e.sprite, e.radius));
        tintedFx(this.run, this.run.combat.tierFx(fx.slashTiers, w, true), b.x + dir.x * radius * 0.5, b.y + dir.y * radius * 0.5, hexColor(q.color), { w: radius * 1.5, rotation: ang, depth: 7 });
        for (const e of enemies) this.run.damage.hit(e, this.run.combat.critRoll(base, st.critChance, e.sprite), tags);
        return;
      }
      // 마지막: 벤 선을 따라 공간이 갈라진다 (선 위 적에게 공간격)
      const len = q.spaceLength * (1 + this.run.itemRt.sums.area);
      const a = { x: b.x - dir.x * len * 0.2, y: b.y - dir.y * len * 0.2 };
      const end = { x: b.x + dir.x * len, y: b.y + dir.y * len };
      const enemies = this.run.enemies.filter((e) => !e.dead);
      const hits = lineHits(a, dir, len * 1.2, q.spaceWidth / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      this.spaceSlash(q, a, end, !riftDone);
      riftDone = true;
      for (const h of hits) {
        const e = enemies[h]!;
        this.run.damage.hit(e, this.run.combat.critRoll(base, st.critChance, e.sprite), tags);
      }
    });
    sfx(last ? 'crit' : 'swing');
    shake(this.run, last ? 'medium' : 'light');
  }

  /** 공간 베기 연출: 절단 그림 3단계 + (rift면) 화면 전체가 선을 따라 갈라졌다가 봉합 */
  spaceSlash(q: Gemini, a: Vec2, b: Vec2, rift: boolean): void {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (rift && startSpaceRift(this.run, q.spaceCut, q.rift, mid, ang)) this.run.hitStop.request(q.spaceCut.hitStopSec);
    q.cut.forEach((ref, i) => {
      this.run.time.delayedCall(i * 70, () => playFx(this.run, ref, mid.x, mid.y, { w: len, h: q.spaceWidth * 3, rotation: ang, fadeSec: 0.25 }).setAlpha(0.85));
    });
    const g = this.run.add.graphics().setDepth(7).setBlendMode(Phaser.BlendModes.ADD);
    g.lineStyle(q.spaceWidth * 0.6, hexColor(q.color), 0.6).lineBetween(a.x, a.y, b.x, b.y);
    g.lineStyle(2, 0xffffff, 1).lineBetween(a.x, a.y, b.x, b.y);
    this.run.tweens.add({ targets: g, alpha: 0, duration: 320, onComplete: () => g.destroy() });
    this.run.cameras.main.flash(90, 170, 210, 255);
  }

  private nearest(from: Vec2): Vec2 | null {
    let best: Vec2 | null = null;
    let d = Infinity;
    for (const e of this.run.enemies) {
      if (e.dead) continue;
      const k = Math.hypot(e.sprite.x - from.x, e.sprite.y - from.y);
      if (k < d) {
        d = k;
        best = { x: e.sprite.x, y: e.sprite.y };
      }
    }
    return best;
  }

  // ---------- 정화의 불길 ----------

  private purifyingFlame(w: WeaponDef, q: Flame, st: WeaponStats): void {
    const volleys = Math.max(1, Math.round(q.durationSec / q.volleySec));
    const step = (Math.PI * 2) / q.beams;
    const start = this.run.rng.range(0, step);
    sfx('shotLaser');
    for (let v = 0; v < volleys; v++) {
      this.run.time.delayedCall(v * q.volleySec * 1000, () => {
        if (this.run.session.outcome) return;
        const p = { x: this.run.player.x, y: this.run.player.y };
        // 번갈아 반 칸 돌린다: 이번 줄은 지난 줄 사이를 채운다
        const off = start + (v % 2) * step * 0.5;
        for (let i = 0; i < q.beams; i++) this.run.combat.weaponLaser(w, st.damage * q.beamDamageMul, st.critChance, off + i * step, q.beamLength, q.beamWidth);
        this.flames(w, q, st, p);
        shake(this.run, 'light');
        if (v % 2 === 0) sfx('shotLaser');
      });
    }
  }

  /** 사방으로 퍼지는 불길: 반지름 안 적에게 피해 + 화상 */
  private flames(w: WeaponDef, q: Flame, st: WeaponStats, p: Vec2): void {
    const r = q.flameRadius * (1 + this.run.itemRt.sums.area);
    const color = hexColor(q.color);
    const n = 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + this.run.rng.range(-0.15, 0.15);
      const sp = this.run.add.sprite(p.x, p.y, q.flame.spriteKey).setDepth(6).setTint(color).setRotation(a).setBlendMode(Phaser.BlendModes.ADD);
      sp.setDisplaySize(q.flame.size, q.flame.size);
      const key = animKey(q.flame.spriteKey, 'play');
      if (this.run.anims.exists(key)) sp.play(key);
      this.run.tweens.add({ targets: sp, x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r, scale: sp.scale * 2.2, alpha: 0, duration: 380, ease: 'Quad.easeOut', onComplete: () => sp.destroy() });
    }
    const host = this.run.skillRt.hostFor('weapon');
    for (const e of [...this.run.enemies]) {
      if (e.dead || Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) > r + e.radius) continue;
      if (!this.run.damage.hit(e, st.damage * q.flameDamageMul, w.tags)) host.burn(e, q.burnStacks);
    }
  }
}

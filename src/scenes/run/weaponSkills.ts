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
import { signatureFires } from '../../systems/motion';
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
    // 공간격 차례(검의 다음 공격이 공간격)에 쓰면 마지막 베기가 공간격이 되고 그 차례를 쓴다
    const c = this.run.combat;
    const sig = w.signature;
    const space = !!sig && sig.kind === 'space' && c.sigItem === this.run.weaponItem() && signatureFires(c.sigCount + 1, sig.every);
    if (space) {
      c.sigCount = 0;
      this.run.floatLabel({ x: p.x, y: p.y - 14 }, this.run.ctx.t('weapon.q.geminiSpace'), q.color);
    }
    // 노릴 적: 가장 가까운 적(없으면 조준 방향 앞). 분신은 그 적을 사이에 두고 멀리 다른 쪽에 나타나 에워싼다
    const t0 = this.nearest(p);
    const aim = Math.atan2(this.run.aimDir.y, this.run.aimDir.x);
    const focus = t0 ?? { x: p.x + Math.cos(aim) * q.flankPx, y: p.y + Math.sin(aim) * q.flankPx };
    const from = Math.atan2(p.y - focus.y, p.x - focus.x);
    const clones: Phaser.GameObjects.Image[] = [];
    for (let i = 0; i < q.clones; i++) {
      const a = from + ((i + 1) / (q.clones + 1)) * Math.PI * 2;
      let at = { x: focus.x + Math.cos(a) * q.flankPx, y: focus.y + Math.sin(a) * q.flankPx };
      // 벽 속이면 적 쪽으로 당긴다
      for (let k = 0; k < 6 && this.run.condition.blockedAt()(at.x, at.y); k++) at = { x: (at.x + focus.x) / 2, y: (at.y + focus.y) / 2 };
      const img = this.run.add
        .image(at.x, at.y, p.texture.key, p.frame.name)
        .setOrigin(p.originX, p.originY)
        .setScale(p.scaleX, p.scaleY)
        .setFlipX(focus.x < at.x)
        .setTint(color)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0)
        .setDepth(5);
      // 번쩍이며 나타난다
      const flash = this.run.add.circle(at.x, at.y - 6, 4, 0xffffff, 0.9).setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
      this.run.tweens.add({ targets: flash, scale: 3, alpha: 0, duration: 200, onComplete: () => flash.destroy() });
      this.run.tweens.add({ targets: img, alpha: 0.8, duration: 100 });
      clones.push(img);
    }
    sfx('awaken');
    for (let k = 0; k < q.strikes; k++) {
      this.run.time.delayedCall((0.14 + k * q.gapSec) * 1000, () => this.geminiStrike(w, q, st, clones, focus, k === q.strikes - 1, space));
    }
    this.run.time.delayedCall((0.14 + q.strikes * q.gapSec + 0.3) * 1000, () => {
      for (const img of clones) this.run.tweens.add({ targets: img, alpha: 0, duration: 200, onComplete: () => img.destroy() });
    });
  }

  /** 한 번 베기: 본체와 분신이 함께 노린 적 쪽으로 (협공). 공간격 차례면 마지막 베기에 세 줄기 공간 가르기 */
  private geminiStrike(w: WeaponDef, q: Gemini, st: WeaponStats, clones: Phaser.GameObjects.Image[], focus0: Vec2, last: boolean, space: boolean): void {
    const p = this.run.player;
    const bodies: Vec2[] = [{ x: p.x, y: p.y }, ...clones.filter((c) => c.active).map((c) => ({ x: c.x, y: c.y }))];
    // 노린 적이 쓰러졌으면 그 자리에서 가장 가까운 적
    const focus = this.nearest(focus0) ?? focus0;
    const arc = w.pattern.kind === 'arc' ? w.pattern : { arcDeg: 150, radius: 56 };
    const radius = arc.radius * q.radiusMul * (1 + this.run.itemRt.sums.area);
    const fx = this.run.ctx.data.weapons.meleeFx;
    const useSpace = last && space;
    const tags: readonly TagId[] = useSpace ? [...w.tags, 'space'] : w.tags;
    const base = st.damage * q.damageMul * (last ? q.lastMul : 1);
    let riftDone = false;
    bodies.forEach((b, i) => {
      const ang = Math.atan2(focus.y - b.y, focus.x - b.x);
      const dir = { x: Math.cos(ang), y: Math.sin(ang) };
      const clone = i > 0 ? clones[i - 1] : null;
      // 분신은 적 쪽으로 파고들었다 돌아온다
      if (clone) {
        clone.setFlipX(dir.x < 0);
        this.run.tweens.add({ targets: clone, x: clone.x + dir.x * 10, y: clone.y + dir.y * 10, duration: 70, yoyo: true });
      }
      if (!useSpace) {
        const enemies = this.run.enemies.filter((e) => !e.dead && inArc(b, ang, arc.arcDeg, radius, e.sprite, e.radius));
        tintedFx(this.run, this.run.combat.tierFx(fx.slashTiers, w, true), b.x + dir.x * radius * 0.5, b.y + dir.y * radius * 0.5, hexColor(q.color), { w: radius * (last ? 1.9 : 1.5), rotation: ang, depth: 7 });
        for (const e of enemies) this.run.damage.hit(e, this.run.combat.critRoll(base, st.critChance, e.sprite), tags);
        return;
      }
      // 공간격: 각자 적을 꿰뚫는 선을 따라 공간이 갈라진다 (세 줄기가 적에게서 엇갈린다)
      const len = q.spaceLength * (1 + this.run.itemRt.sums.area);
      const a = { x: b.x - dir.x * 10, y: b.y - dir.y * 10 };
      const end = { x: b.x + dir.x * len, y: b.y + dir.y * len };
      const enemies = this.run.enemies.filter((e) => !e.dead);
      const hits = lineHits(a, dir, len + 10, q.spaceWidth / 2, enemies.map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius })));
      this.spaceSlash(q, a, end, !riftDone);
      riftDone = true;
      for (const h of hits) {
        const e = enemies[h]!;
        this.run.damage.hit(e, this.run.combat.critRoll(base, st.critChance, e.sprite), tags);
      }
    });
    sfx(last ? 'crit' : 'swing');
    shake(this.run, useSpace ? 'medium' : 'light');
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
    const shots = Math.max(1, Math.round(q.durationSec / q.laserEverySec));
    const flameEvery = Math.max(1, Math.round(q.volleySec / q.laserEverySec));
    // 나란한 길 순서: 가운데부터 좌우로 번갈아 (0, +1, -1, +2, -2 …)
    const lanes = Array.from({ length: q.lanes }, (_, i) => (i % 2 ? 1 : -1) * Math.ceil(i / 2));
    for (let n = 0; n < shots; n++) {
      this.run.time.delayedCall(n * q.laserEverySec * 1000, () => {
        if (this.run.session.outcome) return;
        const p = { x: this.run.player.x, y: this.run.player.y };
        // 조준한 적 쪽 (매 발 다시), 약간 흔들린다
        const t = this.run.aimTarget;
        const base = t ? Math.atan2(t.y - p.y, t.x - p.x) : Math.atan2(this.run.aimDir.y, this.run.aimDir.x);
        const ang = base + this.run.rng.range(-1, 1) * ((q.jitterDeg * Math.PI) / 180);
        // 옆으로 비켜선 길: 레이저 그림 굵기(판정 폭 ×2.5)만큼씩 떨어져 옆면이 맞닿는다
        const side = lanes[n % lanes.length]! * q.beamWidth * 2.5;
        const from = { x: p.x - Math.sin(ang) * side, y: p.y + Math.cos(ang) * side };
        this.run.combat.weaponLaser(w, st.damage * q.beamDamageMul, st.critChance, ang, q.beamLength, q.beamWidth, undefined, from);
        if (n % 2 === 0) sfx('shotLaser');
        if (n % flameEvery === 0) this.flames(w, q, st, p);
      });
    }
    shake(this.run, 'light');
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

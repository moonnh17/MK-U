/**
 * 무기 Q 스킬 (weapons.json qSkill). 재사용 대기는 무기마다 따로 센다.
 * - 3식 제미니(라스알하게의 검): 둘레에 푸른 분신이 나타나 본체와 함께 strikes번 벤다. 마지막 베기는 공간격 +
 *   케라우노스처럼 화면이 벤 선을 따라 갈라졌다가 봉합된다.
 * - 정화의 불길(아비오르의 지팡이): 둘레로 불길을 내뿜으며 조준한 쪽으로 굵은 레이저 연사(나란한 길을 돌아 옆면만 맞닿음).
 * - 판결(칠성신의 법봉): 하늘이 열리며 빛기둥이 내려와 durationSec 동안 그 자리를 태운다.
 * - 변인통제(데네볼라의 사복검, 헥타르만): 적을 묶어 탄막을 퍼붓는다. 보스가 묶인 동안 모든 스킬·조준이 보스로.
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
import type { Enemy } from '../../entities/enemy';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

type Gemini = Extract<WeaponQSkill, { kind: 'gemini' }>;
type Flame = Extract<WeaponQSkill, { kind: 'purifyingFlame' }>;
type Judgment = Extract<WeaponQSkill, { kind: 'judgment' }>;
type Control = Extract<WeaponQSkill, { kind: 'variableControl' }>;

export class WeaponSkills {
  /** 무기 id → 남은 재사용 대기(초) */
  private cd = new Map<string, number>();
  /** 변인통제로 묶은 적과 이어 그리는 줄 */
  private bound: Enemy[] = [];
  private tether: Phaser.GameObjects.Graphics | null = null;
  private tetherColor = 0xffffff;

  constructor(private readonly run: RunScene) {}

  update(dt: number): void {
    for (const [id, s] of this.cd) this.cd.set(id, Math.max(0, s - dt));
    this.bound = this.bound.filter((e) => !e.dead && e.bound);
    // 묶인 적에게 이어진 빛줄 (흔들리며 깜박인다)
    if (this.bound.length > 0) {
      this.tether ??= this.run.add.graphics().setDepth(6).setBlendMode(Phaser.BlendModes.ADD);
      const g = this.tether.clear();
      const p = this.run.player;
      const t = this.run.time.now / 1000;
      for (const e of this.bound) {
        const mid = { x: (p.x + e.sprite.x) / 2 + Math.sin(t * 30) * 2, y: (p.y + e.sprite.y) / 2 + Math.cos(t * 27) * 2 };
        g.lineStyle(3, this.tetherColor, 0.35 + 0.15 * Math.sin(t * 40)).beginPath().moveTo(p.x, p.y).lineTo(mid.x, mid.y).lineTo(e.sprite.x, e.sprite.y).strokePath();
        g.lineStyle(1, 0xffffff, 0.9).lineBetween(p.x, p.y, e.sprite.x, e.sprite.y);
        g.lineStyle(1.5, this.tetherColor, 0.9).strokeCircle(e.sprite.x, e.sprite.y, e.radius + 3 + Math.sin(t * 12) * 1.5);
      }
    } else if (this.tether) {
      this.tether.destroy();
      this.tether = null;
    }
  }

  /** 변인통제로 묶인 보스 (모든 스킬·조준이 노린다) */
  focusEnemy(): Enemy | null {
    return this.bound.find((e) => (e.rank === 'boss' || e.rank === 'hiddenBoss') && !e.dead && e.bound) ?? null;
  }

  /** 이 무기의 Q 스킬을 지금 직업으로 쓸 수 있는지 (학파 전용) */
  usable(w: WeaponDef): boolean {
    const school = w.qSkill && 'school' in w.qSkill ? w.qSkill.school : undefined;
    return !!w.qSkill && (!school || this.run.session.player.advancement === school);
  }

  /** 남은 재사용 대기 (HUD·토스트) */
  cooldownOf(id: string): number {
    return this.cd.get(id) ?? 0;
  }

  /** Q: 들고 있는 무기의 스킬을 쓴다. 이 무기에 스킬이 있으면 true(재사용 대기 중이어도) */
  use(w: WeaponDef): boolean {
    const q = w.qSkill;
    if (!q || !this.usable(w)) return false;
    const left = this.cooldownOf(w.id);
    if (left > 0) {
      this.run.toastThrottled(this.run.ctx.t('weapon.qCooldown', { name: this.run.ctx.t(q.nameKey), s: Math.ceil(left) }));
      return true;
    }
    this.cd.set(w.id, q.cooldownSec);
    const st = this.run.weaponStatsOf(this.run.weaponItem());
    this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y }, this.run.ctx.t(q.nameKey), q.color);
    if (q.kind === 'gemini') this.gemini(w, q, st);
    else if (q.kind === 'purifyingFlame') this.purifyingFlame(w, q, st);
    else if (q.kind === 'judgment') this.judgment(w, q, st);
    else this.variableControl(w, q, st);
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

  // ---------- 판결 ----------

  private judgment(w: WeaponDef, q: Judgment, st: WeaponStats): void {
    const p = this.run.player;
    const t = this.nearestEnemy({ x: p.x, y: p.y }, q.range);
    const aim = this.run.aimDir;
    const at = t ? { x: t.sprite.x, y: t.sprite.y } : { x: p.x + aim.x * q.ahead, y: p.y + aim.y * q.ahead };
    const r = q.radius * (1 + this.run.itemRt.sums.area);
    // 하늘이 열린다: 화면이 하얗게 번쩍, 바닥에 칠성 법진이 펼쳐지고 빛기둥이 위에서 내려꽂힌다
    this.run.cameras.main.flash(160, 255, 244, 210);
    const sigil = this.run.add.image(at.x, at.y, q.sigil.spriteKey).setDepth(2.6).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    sigil.setDisplaySize(r * 2.4, r * 2.4 * 0.55);
    const sw = sigil.scaleX;
    const sh = sigil.scaleY;
    sigil.setScale(sw * 0.3, sh * 0.3);
    this.run.tweens.add({ targets: sigil, scaleX: sw, scaleY: sh, alpha: 0.95, duration: 220, ease: 'Back.easeOut' });
    const beam = this.run.add.image(at.x, at.y + r * 0.25, q.beam.spriteKey).setOrigin(0.5, 1).setDepth(7).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.95);
    const bh = Math.max(220, this.run.cameras.main.worldView.height);
    beam.setDisplaySize(r * 2.2, 1);
    this.run.tweens.add({ targets: beam, displayHeight: bh, duration: 180, ease: 'Quad.easeIn', onComplete: () => shake(this.run, 'medium') });
    sfx('awaken');
    const ticks = Math.max(1, Math.round(q.durationSec / q.tickSec));
    for (let k = 0; k < ticks; k++) {
      this.run.time.delayedCall((0.18 + k * q.tickSec) * 1000, () => {
        // 일렁임
        beam.setAlpha(0.75 + 0.25 * (k % 2));
        for (const e of [...this.run.enemies]) {
          if (!e.dead && Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= r + e.radius) this.run.damage.hit(e, this.run.combat.critRoll(st.damage * q.damageMul, st.critChance, e.sprite), w.tags);
        }
        // 빛 알갱이가 솟는다
        for (let i = 0; i < 3; i++) this.run.combat.spark(at.x + this.run.rng.range(-r, r) * 0.8, at.y + this.run.rng.range(-r, r) * 0.4, i % 2 ? '#ffffff' : q.color, 0, -30);
      });
    }
    this.run.time.delayedCall((0.18 + q.durationSec) * 1000, () => {
      this.run.tweens.add({ targets: beam, scaleX: 0, alpha: 0, duration: 260, ease: 'Quad.easeIn', onComplete: () => beam.destroy() });
      this.run.tweens.add({ targets: sigil, alpha: 0, duration: 400, onComplete: () => sigil.destroy() });
    });
  }

  // ---------- 변인통제 ----------

  private variableControl(w: WeaponDef, q: Control, st: WeaponStats): void {
    const p = { x: this.run.player.x, y: this.run.player.y };
    const isBoss = (e: Enemy) => e.rank === 'boss' || e.rank === 'hiddenBoss';
    // 보스 먼저, 그다음 가까운 순
    const near = this.run.enemies
      .filter((e) => !e.dead && Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) <= q.range + e.radius)
      .sort((a, b) => Number(isBoss(b)) - Number(isBoss(a)) || Math.hypot(a.sprite.x - p.x, a.sprite.y - p.y) - Math.hypot(b.sprite.x - p.x, b.sprite.y - p.y))
      .slice(0, q.targets);
    if (near.length === 0) {
      this.run.toastThrottled(this.run.ctx.t('weapon.q.noTarget'));
      this.cd.set(w.id, 0);
      return;
    }
    this.tetherColor = hexColor(q.color);
    let longest = 0;
    for (const e of near) {
      const sec = isBoss(e) ? q.bossBindSec : q.bindSec;
      e.bind(sec);
      longest = Math.max(longest, sec);
      // 묶이는 순간: 고리가 조여든다
      const ring = this.run.add.circle(e.sprite.x, e.sprite.y, e.radius * 2.4).setStrokeStyle(2, this.tetherColor, 1).setDepth(7);
      this.run.tweens.add({ targets: ring, scale: 0.45, alpha: 0.2, duration: 220, ease: 'Quad.easeIn', onComplete: () => ring.destroy() });
    }
    this.bound = [...new Set([...this.bound, ...near])];
    if (near.some(isBoss)) this.run.floatLabel({ x: p.x, y: p.y - 14 }, this.run.ctx.t('weapon.q.bossLocked'), q.color);
    sfx('awaken');
    shake(this.run, 'light');
    // 묶인 동안 묶인 적들에게 탄막을 번갈아 퍼붓는다 (헥타르 육각 탄)
    const shots = Math.max(1, Math.round(longest / q.barrageEverySec));
    for (let n = 0; n < shots; n++) {
      this.run.time.delayedCall(n * q.barrageEverySec * 1000, () => {
        const live = near.filter((e) => !e.dead && e.bound);
        if (live.length === 0 || this.run.session.outcome) return;
        const e = live[n % live.length]!;
        const from = this.run.combat.firePoint();
        const a = Math.atan2(e.sprite.y - from.y, e.sprite.x - from.x) + this.run.rng.range(-0.12, 0.12);
        this.run.combat.fireBullet(from, a, q.barrageSpeed, q.range * 1.5, st.damage * q.barrageDamageMul, ['tech', 'ranged'], null, { pierce: 0, crit: st.critChance, sprite: q.shot, trail: q.color });
        if (n % 3 === 0) sfx('shotSmg');
      });
    }
  }

  private nearestEnemy(from: Vec2, range: number): Enemy | null {
    const f = this.focusEnemy();
    if (f) return f;
    let best: Enemy | null = null;
    let d = Infinity;
    for (const e of this.run.enemies) {
      const k = Math.hypot(e.sprite.x - from.x, e.sprite.y - from.y);
      if (!e.dead && k <= range + e.radius && k < d) {
        d = k;
        best = e;
      }
    }
    return best;
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

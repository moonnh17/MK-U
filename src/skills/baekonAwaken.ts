/**
 * 마기법사 백온파 각성 오브젝트 (기획: 마기법사/awakening-baekon/백온파-각성-확정안.md, 수치는 skills.json awakening).
 * - 불씨(백열 연쇄): 가까운 적에게 튀어 맞고, 화상이 꽉 찬 적이면 그 자리에서 다시 폭발.
 * - 불길 장판(불길의 행군·잔불): 원 또는 돌린 사각형, tickSec마다 피해 + 화상. 플레이어가 위에 서 있는지 알려 준다.
 * - 박힌 빙창(쇄빙): 적을 따라다니다 빙결 중이면 바로, 아니면 lodgeSec 뒤 파열.
 * - 뇌운: 자리에 머물며 반경 안 적에게 낙뢰를 반복, 충전 가득으로 쓰면 낙뢰가 짧게 연쇄.
 * - 원소 구슬(삼원소 수호): 화염·냉기·번개를 차례로 가까운 적에게.
 * 동시 개수는 상한을 둔다(모바일 부하).
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { Enemy } from '../entities/enemy';
import { shake } from '../entities/juice';
import type { ElementId, SkillDef, SpriteRef, TagId } from '../types/data';
import { loopArt, playFx, sparks, stretchFx } from './skillFx';
import { trimOldest, type SkillHost, type SkillObject } from './host';

const MAGIC_RANGED: TagId[] = ['magic', 'ranged'];

function isBoss(e: Enemy): boolean {
  return e.rank === 'boss' || e.rank === 'hiddenBoss';
}

/** 화상이 상한까지 쌓였는지 */
export function burnFull(host: SkillHost, e: Enemy): boolean {
  const rule = host.ctx.data.tags.tags.find((t) => t.id === 'burn')!.rule as { maxStacks: number; bossMaxStacks?: number };
  const cap = isBoss(e) ? (rule.bossMaxStacks ?? rule.maxStacks) : rule.maxStacks;
  return !!e.burn && e.burn.stacks >= cap;
}

/** 날아가는 그림 하나: from → 적(움직이면 따라감), 닿으면 onArrive */
function flyTo(host: SkillHost, ref: SpriteRef, from: Vec2, target: Enemy, speed: number, onArrive: (at: Vec2) => void): void {
  const sp = host.sprite(from.x, from.y, ref).setDepth(6);
  sp.setDisplaySize(ref.size, (ref.size * sp.height) / Math.max(1, sp.width));
  loopArt(sp, ref);
  let last = { x: target.sprite.x, y: target.sprite.y };
  const update = () => {
    if (!sp.active) return;
    if (!target.dead) last = { x: target.sprite.x, y: target.sprite.y };
    const dx = last.x - sp.x;
    const dy = last.y - sp.y;
    const d = Math.hypot(dx, dy);
    const step = (speed * host.scene.game.loop.delta) / 1000;
    sp.setRotation(Math.atan2(dy, dx));
    if (d <= step + 2) {
      host.scene.events.off('update', update);
      sp.destroy();
      onArrive(last);
      return;
    }
    sp.setPosition(sp.x + (dx / d) * step, sp.y + (dy / d) * step);
  };
  host.scene.events.on('update', update);
  // 혹시 끝까지 못 닿으면 정리
  host.scene.time.delayedCall(3000, () => {
    if (!sp.active) return;
    host.scene.events.off('update', update);
    sp.destroy();
  });
}

// ---------- 불씨 (백열 연쇄) ----------

let liveEmbers = 0;

/** at 둘레 가까운 적들에게 불씨 count개 (적이 적으면 같은 적에게도) */
export function spawnEmbers(host: SkillHost, fireball: SkillDef, v: Record<string, number>, at: Vec2, count: number): void {
  const list = [...host.enemies()]
    .filter((e) => Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= v.emberRange! + e.radius)
    .sort((a, b) => Math.hypot(a.sprite.x - at.x, a.sprite.y - at.y) - Math.hypot(b.sprite.x - at.x, b.sprite.y - at.y));
  if (list.length === 0) return;
  const tags = fireball.sources.blast ?? MAGIC_RANGED;
  for (let i = 0; i < count && liveEmbers < v.maxEmbers!; i++) {
    const target = list[i % list.length]!;
    liveEmbers++;
    flyTo(host, fireball.sprites.ember!, at, target, v.emberSpeed!, (p) => {
      liveEmbers--;
      if (target.dead) return;
      // 화상이 꽉 찬 적: 그 자리에서 다시 폭발 (화염 직접 피해)
      if (burnFull(host, target)) {
        const r = host.area(v.emberBlastRadius!);
        for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) <= r + e.radius) host.hit(e, v.emberBlastDamage!, tags);
        playFx(host.scene, fireball.sprites.blast!, p.x, p.y, { w: r * 2.4 });
        shake(host.scene, 'light');
        return;
      }
      if (!host.hit(target, v.emberDamage!, tags)) host.burn(target, 1);
      sparks(host.scene, p.x, p.y, fireball.color, host.ctx.data.juice.projectileLook, 0.5);
    });
  }
}

// ---------- 불길 장판 ----------

export const FIRE_ZONE_OWNER = 'fireZone';

/** 원(rect 없음) 또는 돌린 사각형(가운데 at, 길이 len·두께 thick, 방향 dir = 두께 방향) */
export class FireZone implements SkillObject {
  readonly owner = FIRE_ZONE_OWNER;
  readonly createdAt: number;
  private left: number;
  private tickIn = 0;
  private readonly fx: Phaser.GameObjects.Sprite[] = [];

  constructor(
    host: SkillHost,
    ref: SpriteRef,
    private readonly at: Vec2,
    private readonly o: { sec: number; tickSec: number; damage: number; burnStacks: number; tags: readonly TagId[]; radius?: number; rect?: { len: number; thick: number; dir: Vec2 } },
  ) {
    this.createdAt = host.scene.time.now;
    this.left = o.sec;
    const place = (x: number, y: number, w: number) => {
      const sp = host.sprite(x, y, ref).setDepth(2.6).setAlpha(0.85);
      sp.setDisplaySize(w, w * 0.6);
      loopArt(sp, ref);
      this.fx.push(sp);
    };
    if (o.rect) {
      const n = Math.max(2, Math.round(o.rect.len / (o.rect.thick * 1.2)));
      for (let i = 0; i < n; i++) {
        const t = (i / (n - 1) - 0.5) * o.rect.len;
        place(at.x - o.rect.dir.y * t, at.y + o.rect.dir.x * t, o.rect.thick * 1.6);
      }
    } else place(at.x, at.y, (o.radius ?? 16) * 2.2);
  }

  contains(x: number, y: number, pad = 0): boolean {
    const rx = x - this.at.x;
    const ry = y - this.at.y;
    if (!this.o.rect) return Math.hypot(rx, ry) <= (this.o.radius ?? 16) + pad;
    const across = rx * this.o.rect.dir.x + ry * this.o.rect.dir.y;
    const along = -rx * this.o.rect.dir.y + ry * this.o.rect.dir.x;
    return Math.abs(along) <= this.o.rect.len / 2 + pad && Math.abs(across) <= this.o.rect.thick / 2 + pad;
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    this.tickIn -= dt;
    if (this.tickIn <= 0) {
      this.tickIn = this.o.tickSec;
      for (const e of [...host.enemies()]) {
        if (!this.contains(e.sprite.x, e.sprite.y, e.radius)) continue;
        if (!host.hit(e, this.o.damage, this.o.tags)) host.burn(e, this.o.burnStacks);
      }
    }
    const a = Math.min(1, this.left / 0.5) * 0.85;
    for (const f of this.fx) f.setAlpha(a);
    return this.left > 0;
  }

  destroy(): void {
    for (const f of this.fx) f.destroy();
  }
}

/** 장판 하나 깔기 (상한을 넘으면 오래된 것부터) */
export function addFireZone(host: SkillHost, max: number, zone: (h: SkillHost) => FireZone): void {
  trimOldest(host, FIRE_ZONE_OWNER, Math.max(0, max - 1));
  host.addObject(zone(host));
}

// ---------- 박힌 빙창 (쇄빙) ----------

export class LodgedSpear implements SkillObject {
  readonly owner = 'iceSpear.lodge';
  readonly createdAt: number;
  private left: number;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly off: Vec2;

  constructor(
    host: SkillHost,
    private readonly def: SkillDef,
    private readonly v: Record<string, number>,
    private readonly target: Enemy,
    angle: number,
  ) {
    this.createdAt = host.scene.time.now;
    this.left = v.lodgeSec!;
    // 날아온 쪽에서 비스듬히 꽂힌다
    this.off = { x: -Math.cos(angle) * target.radius * 0.6, y: -Math.sin(angle) * target.radius * 0.6 };
    const ref = def.sprites.spear!;
    this.img = host.sprite(target.sprite.x + this.off.x, target.sprite.y + this.off.y, ref).setDepth(5).setRotation(angle);
    this.img.setDisplaySize(ref.size * 0.7, (ref.size * 0.7 * this.img.height) / Math.max(1, this.img.width));
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    if (!this.target.dead) this.img.setPosition(this.target.sprite.x + this.off.x, this.target.sprite.y + this.off.y);
    // 떨리며 금이 간다
    this.img.setAlpha(0.7 + 0.3 * Math.abs(Math.sin(this.left * 18)));
    if (this.target.dead || this.target.freezeLeft > 0 || this.left <= 0) {
      this.shatter(host);
      return false;
    }
    return true;
  }

  private shatter(host: SkillHost): void {
    const v = this.v;
    const at = { x: this.img.x, y: this.img.y };
    const r = host.area(v.shatterRadius!);
    const tags = this.def.sources.spear ?? MAGIC_RANGED;
    for (const e of [...host.enemies()]) {
      if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
      // 보스는 파열 피해만
      if (!host.hit(e, v.shatterDamage!, tags) && !isBoss(e)) host.chill(e, v.shatterSlow!, v.shatterSlowSec!);
    }
    playFx(host.scene, this.def.sprites.shatter!, at.x, at.y, { w: r * 2.4 }).setBlendMode('ADD');
    sparks(host.scene, at.x, at.y, this.def.color, host.ctx.data.juice.projectileLook, 1.2);
  }

  destroy(): void {
    this.img.destroy();
  }
}

// ---------- 뇌운 ----------

export const CLOUD_OWNER = 'chainLightning.cloud';

export class ThunderCloud implements SkillObject {
  readonly owner = CLOUD_OWNER;
  readonly createdAt: number;
  private left: number;
  private strikeIn = 0.2;
  private at: Vec2;
  private readonly img: Phaser.GameObjects.Sprite;

  constructor(
    host: SkillHost,
    private readonly def: SkillDef,
    private readonly v: Record<string, number>,
    private readonly target: Enemy | null,
    at: Vec2,
    private readonly charged: boolean,
  ) {
    this.createdAt = host.scene.time.now;
    this.left = v.cloudSec!;
    this.at = { ...at };
    const ref = def.sprites.cloud!;
    this.img = host.sprite(at.x, at.y - 26, ref).setDepth(7).setAlpha(0);
    this.img.setDisplaySize(ref.size, (ref.size * this.img.height) / Math.max(1, this.img.width));
    loopArt(this.img, ref);
    host.scene.tweens.add({ targets: this.img, alpha: 0.95, duration: 200 });
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    // 노린 적이 살아 있으면 머리 위를 따라간다
    if (this.target && !this.target.dead) {
      const k = Math.min(1, dt * 3);
      this.at = { x: this.at.x + (this.target.sprite.x - this.at.x) * k, y: this.at.y + (this.target.sprite.y - this.at.y) * k };
    }
    this.img.setPosition(this.at.x, this.at.y - 26).setAlpha(Math.min(0.95, this.left / 0.3));
    this.strikeIn -= dt;
    if (this.strikeIn <= 0 && this.left > 0.1) {
      this.strikeIn = this.v.strikeEverySec!;
      this.strike(host);
    }
    return this.left > 0;
  }

  private strike(host: SkillHost): void {
    const v = this.v;
    const r = host.area(v.cloudRadius!);
    const near = [...host.enemies()].filter((e) => Math.hypot(e.sprite.x - this.at.x, e.sprite.y - this.at.y) <= r + e.radius);
    if (near.length === 0) return;
    const e = host.rng.pick(near);
    const tags = this.def.sources.bolt ?? MAGIC_RANGED;
    const ref = this.def.sprites.strike!;
    playFx(host.scene, ref, e.sprite.x, e.sprite.y, { w: ref.size }).setOrigin(0.5, 0.85);
    host.hit(e, v.strikeDamage!, tags);
    if (!this.charged) return;
    // 충전 가득: 낙뢰가 짧게 연쇄
    let from = { x: e.sprite.x, y: e.sprite.y };
    const hit = new Set<Enemy>([e]);
    for (let i = 0; i < v.chargedChains!; i++) {
      const next = [...host.enemies()]
        .filter((x) => !hit.has(x) && Math.hypot(x.sprite.x - from.x, x.sprite.y - from.y) <= v.chargedChainRange! + x.radius)
        .sort((a, b) => Math.hypot(a.sprite.x - from.x, a.sprite.y - from.y) - Math.hypot(b.sprite.x - from.x, b.sprite.y - from.y))[0];
      if (!next) break;
      hit.add(next);
      const to = { x: next.sprite.x, y: next.sprite.y };
      stretchFx(host.scene, this.def.sprites.bolt!, from, to, this.def.sprites.bolt!.size * 0.8);
      host.hit(next, v.strikeDamage! * 0.6, tags);
      from = to;
    }
  }

  destroy(): void {
    this.img.destroy();
  }
}

// ---------- 원소 구슬 (삼원소 수호) ----------

const ORB_ORDER: ElementId[] = ['fire', 'ice', 'lightning'];
const ORB_KEY: Record<ElementId, string> = { fire: 'orbFire', ice: 'orbIce', lightning: 'orbLightning' };
let orbTurn = 0;
let liveOrbs = 0;
const MAX_ORBS = 8;

/** 다음 원소 구슬 하나를 from에서 가장 가까운 적에게 */
export function fireWardOrb(host: SkillHost, ward: SkillDef, v: Record<string, number>, from: Vec2): void {
  if (liveOrbs >= MAX_ORBS) return;
  const list = [...host.enemies()].filter((e) => Math.hypot(e.sprite.x - from.x, e.sprite.y - from.y) <= v.orbRange! + e.radius);
  if (list.length === 0) return;
  const target = list.sort((a, b) => Math.hypot(a.sprite.x - from.x, a.sprite.y - from.y) - Math.hypot(b.sprite.x - from.x, b.sprite.y - from.y))[0]!;
  const el = ORB_ORDER[orbTurn++ % ORB_ORDER.length]!;
  liveOrbs++;
  flyTo(host, ward.sprites[ORB_KEY[el]]!, from, target, v.orbSpeed!, (p) => {
    liveOrbs--;
    if (target.dead) return;
    if (!host.hit(target, v.orbDamage!, MAGIC_RANGED)) {
      if (el === 'fire') host.burn(target, v.burnStacks!);
      if (el === 'ice') host.chill(target, v.slow!, v.slowSec!);
    }
    sparks(host.scene, p.x, p.y, ward.sprites[ORB_KEY[el]]!.color, host.ctx.data.juice.projectileLook, 0.5);
  });
}

/** 보호막이 깨질 때: 세 원소가 한꺼번에 터진다 */
export function wardBurst(host: SkillHost, ward: SkillDef, v: Record<string, number>, at: Vec2): void {
  const r = host.area(v.burstRadius!);
  for (const e of [...host.enemies()]) {
    if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) > r + e.radius) continue;
    if (host.hit(e, v.burstDamage!, MAGIC_RANGED)) continue;
    host.burn(e, v.burnStacks!);
    host.chill(e, v.slow!, v.slowSec!);
  }
  playFx(host.scene, ward.sprites.burst!, at.x, at.y, { w: r * 2.2 });
  shake(host.scene, 'medium');
}

/** 방 소품: 부서지는 상자, 폭발 통, 일회용 석상, 문의 다음 방 표시. */
import type { Dir } from '../../systems/mapgen';
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import { Rng } from '../../core/rng';
import { BreakableProp, Statue } from '../../entities/roomProp';
import { crateDrops, placeRoomProps } from '../../systems/roomProps';
import { shake } from '../../entities/juice';
import { Pickup } from '../../entities/pickup';
import { type RoomNode } from '../../systems/mapgen';
import { heal } from '../../systems/vitals';
import { doorRect, interiorRect, roomCenter, type Rect } from '../../systems/worldLayout';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';

export class RoomProps {
  propGroup!: Phaser.Physics.Arcade.StaticGroup;
  breakables: BreakableProp[] = [];
  statues: Statue[] = [];
  doorIcons: { text: Phaser.GameObjects.Text; roomId: number; to: number }[] = [];

  constructor(private readonly run: RunScene) {}

  /** 상자·통·석상을 놓는다 (같은 시드면 같은 자리) */
  addRoomProps(node: RoomNode, obs: readonly Rect[]): void {
    const rp = this.run.ctx.data.mapgen.roomProps;
    const rule = rp.rules[node.kind];
    if (!rule || node.peaceful) return;
    const rng = Rng.derive(this.run.ctx.config.seed, `props-${this.run.session.map.chapter}-${this.run.session.map.stage}-${node.id}`);
    const c = roomCenter(node, this.run.m);
    const clear = rp.centerClearPx;
    const grow = (o: Rect, g: number): Rect => ({ x: o.x - g, y: o.y - g, w: o.w + g * 2, h: o.h + g * 2 });
    const avoid: Rect[] = [
      ...obs.map((o) => grow(o, rp.edgeInsetPx)),
      { x: c.x - clear, y: c.y - clear, w: clear * 2, h: clear * 2 },
      ...(Object.keys(node.doors) as Dir[]).map((dir) => grow(doorRect(node, dir, this.run.m), rp.doorClearPx)),
      ...this.run.loot.vendings.map((v) => grow({ x: v.x, y: v.y, w: 0, h: 0 }, clear)),
    ];
    for (const s of placeRoomProps(rng, interiorRect(node, this.run.m, rp.edgeInsetPx), avoid, rule, rp.spacingPx, rp.statues.map((x) => x.kind))) {
      if (s.kind === 'statue') {
        const def = rp.statues.find((x) => x.kind === s.statue)!;
        this.statues.push(new Statue(this.run, s.statue, def.spriteKey, s.x, s.y, this.propGroup));
      } else {
        const def = rp[s.kind];
        this.breakables.push(new BreakableProp(this.run, s.kind, def.spriteKey, s.x, s.y, def.hp, this.propGroup));
      }
    }
  }

  /** 문 안쪽에 그 너머 방 종류를 표시한다 (가 본 적 없는 방만) */
  addDoorIcons(node: RoomNode): void {
    const icon = this.run.ctx.data.mapgen.roomProps.doorIcon;
    const map = this.run.session.map;
    for (const [dir, to] of Object.entries(node.doors) as [Dir, number][]) {
      const r = doorRect(node, dir, this.run.m);
      const kind = map.rooms[to]!.kind;
      const x = r.x + r.w / 2 + (dir === 'w' ? icon.insetPx : dir === 'e' ? -icon.insetPx : 0);
      const y = r.y + r.h / 2 + (dir === 'n' ? icon.insetPx : dir === 's' ? -icon.insetPx : 0);
      const text = this.run.add
        .text(x, y, this.run.ctx.t(icon.keys[kind]), { fontFamily: 'sans-serif', fontSize: `${icon.fontPx}px`, fontStyle: 'bold', color: icon.colors[kind], stroke: '#000000', strokeThickness: 3 })
        .setOrigin(0.5)
        .setDepth(3)
        .setVisible(false);
      this.doorIcons.push({ text, roomId: node.id, to });
    }
  }

  /** 지금 방의 문 표시만 보인다 (전투 중에는 숨긴다) */
  updateDoorIcons(): void {
    const rid = this.run.session.currentRoomId;
    const locked = rid !== null && this.run.rooms.get(rid)?.phase === 'locked';
    for (const d of this.doorIcons) d.text.setVisible(d.roomId === rid && !locked && !this.run.session.visited.has(d.to));
  }

  /** 상자·통에 피해. 상자는 드롭, 통은 잠시 뒤 폭발 */
  damageBreakable(p: BreakableProp, amount: number): void {
    if (!p.damage(amount)) return;
    const d = this.run.ctx.data;
    const rp = d.mapgen.roomProps;
    const at = { x: p.x, y: p.y };
    this.breakables = this.breakables.filter((x) => x !== p);
    if (p.kind === 'crate') {
      sfx('kill');
      this.run.juice.death(p.sprite as unknown as Phaser.GameObjects.Sprite, rp.crate.color, false);
      p.destroy();
      this.popPickups('coin', at, crateDrops(this.run.rng, rp.crate.coins));
      this.popPickups('energy', at, crateDrops(this.run.rng, rp.crate.energy));
      return;
    }
    // 통: 몸체는 바로 비키고, 깜빡이다 터진다
    p.sprite.setTint(0xffffff);
    (p.sprite.body as Phaser.Physics.Arcade.StaticBody).enable = false;
    this.run.time.delayedCall(rp.barrel.fuseSec * 1000, () => this.explodeBarrel(p, at));
  }

  explodeBarrel(p: BreakableProp, at: Vec2): void {
    const b = this.run.ctx.data.mapgen.roomProps.barrel;
    p.destroy();
    sfx('explosion');
    shake(this.run, 'light');
    this.run.juice.explosionNear(at, 0);
    for (const e of [...this.run.enemies]) {
      if (!e.dead && Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= b.radius + e.radius) this.run.combat.hit(e, b.damage, b.tags, 'barrel');
    }
    if (Math.hypot(this.run.player.x - at.x, this.run.player.y - at.y) <= b.radius + this.run.ctx.data.player.size / 2) this.run.hurtPlayer(b.playerDamage);
    this.blastProps(at, b.radius, b.hp + this.run.ctx.data.mapgen.roomProps.crate.hp);
  }

  /** 범위 안의 상자·통에 피해 (통 폭발은 옆 통으로 이어진다) */
  blastProps(at: Vec2, radius: number, damage: number): void {
    for (const p of [...this.breakables]) if (Math.hypot(p.x - at.x, p.y - at.y) <= radius) this.damageBreakable(p, damage);
  }

  /** 근접 공격 판정 안의 소품에 피해 */
  meleeProps(amount: number, inside: (p: BreakableProp) => boolean): void {
    for (const p of [...this.breakables]) if (inside(p)) this.damageBreakable(p, amount);
  }

  /** 그 자리에서 튀어 나가는 코인·에너지 */
  popPickups(kind: 'coin' | 'energy', at: Vec2, n: number): void {
    const d = this.run.ctx.data;
    const pop = d.juice.death;
    for (let i = 0; i < n; i++) {
      const a = this.run.rng.range(0, Math.PI * 2);
      const r = this.run.rng.range(pop.orbPopPx[0], pop.orbPopPx[1]);
      const pk = new Pickup(this.run, kind, at.x, at.y, d.pickups);
      this.run.tweens.add({ targets: pk.sprite, x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r, duration: pop.orbPopSec * 1000, ease: 'Back.easeOut' });
      this.run.pickups.push(pk);
    }
  }

  /** 석상 사용: 비율만큼 회복하고 꺼진다 */
  useStatue(s: Statue): void {
    const def = this.run.ctx.data.mapgen.roomProps.statues.find((x) => x.kind === s.kind)!;
    const p = this.run.session.player;
    if (s.kind === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * def.value);
    else if (s.kind === 'energy') p.energy = Math.min(p.energyMax, p.energy + p.energyMax * def.value);
    else p.sanity = Math.min(p.sanityMax, p.sanity + p.sanityMax * def.value);
    s.use();
    sfx('heal');
    this.run.floatLabel({ x: s.x, y: s.y - 10 }, this.run.ctx.t(`statue.${s.kind}`), def.color);
  }

  nearStatue(): Statue | null {
    return this.run.nearest(
      this.statues.filter((s) => !s.used),
      this.run.ctx.data.pickups.interactRadius,
    );
  }
}

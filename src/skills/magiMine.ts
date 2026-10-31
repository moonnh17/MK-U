/**
 * 마기 지뢰 (헥타르, 기술·원거리).
 * 누르면 주변에 지뢰 여러 개를 던져 깐다. 잠시 뒤 활성화되고, 적이 밟으면 폭발한다.
 * 스테이지가 끝날 때까지 남고, 최대 개수를 넘으면 오래된 지뢰부터 사라진다.
 * 각성 '무한연쇄기폭'(기술·마기·원거리): 지뢰 폭발로 처치하면 그 자리에 새 지뢰가 생겨 연쇄 폭파한다.
 */
import { bus } from '../core/events';
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { skillTags } from '../systems/tags';
import { ringPoints } from '../systems/targeting';
import { levelRef, loopArt, playFx, stretchFx } from './skillFx';
import { trimOldest, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'magiMine';

class Mine implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Sprite;
  private t = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly from: Vec2,
    private readonly to: Vec2,
    private readonly throwSec: number,
    private readonly armSec: number,
  ) {
    this.createdAt = host.scene.time.now;
    // 각성: 연쇄로 생긴 지뢰는 작은 기뢰
    const ref = s.owned.awakened ? (throwSec === 0 ? s.def.sprites.chainMini! : s.def.sprites.chainMine!) : levelRef(s, 'mine');
    this.img = host.sprite(from.x, from.y, ref).setDepth(2).setAlpha(0.5);
    loopArt(this.img, ref);
  }

  update(dt: number, host: SkillHost): boolean {
    this.t += dt;
    const k = this.throwSec > 0 ? Math.min(1, this.t / this.throwSec) : 1;
    this.img.setPosition(this.from.x + (this.to.x - this.from.x) * k, this.from.y + (this.to.y - this.from.y) * k);
    if (this.t < this.throwSec + this.armSec) return true;
    this.img.setAlpha(1);
    const r = this.s.values.triggerRadius!;
    if (!host.enemies().some((e) => Math.hypot(e.sprite.x - this.to.x, e.sprite.y - this.to.y) <= r + e.radius)) return true;
    this.explode(host);
    return false;
  }

  private explode(host: SkillHost): void {
    bus.emit('sfx', { id: 'explosion' });
    const v = this.s.values;
    const awakened = this.s.owned.awakened;
    const radius = host.area(v.radius!);
    const tags = skillTags(this.s.def, awakened, awakened ? 'chainMine' : 'mine');
    const killedAt: Vec2[] = [];
    for (const e of [...host.enemies()]) {
      const pos = { x: e.sprite.x, y: e.sprite.y };
      if (Math.hypot(pos.x - this.to.x, pos.y - this.to.y) > radius + e.radius) continue;
      if (host.hit(e, v.damage!, tags)) killedAt.push(pos);
    }
    const sp = this.s.def.sprites;
    if (awakened) {
      playFx(host.scene, sp.chainTrigger!, this.to.x, this.to.y);
      playFx(host.scene, sp.chainBlast!, this.to.x, this.to.y, { w: radius * 2.6 });
      playFx(host.scene, sp.chainRing!, this.to.x, this.to.y, { w: radius * 2 });
    } else playFx(host.scene, levelRef(this.s, 'blast'), this.to.x, this.to.y, { w: radius * 2.4 });
    // 각성: 지뢰로 처치한 자리에 새 지뢰 (바로 활성화되어 근처 적과 연쇄)
    if (awakened) {
      for (const p of killedAt) {
        if (Math.hypot(p.x - this.to.x, p.y - this.to.y) > 2) stretchFx(host.scene, sp.chainLink!, this.to, p, 8);
        place(host, this.s, p, p, 0, v.chainArmSec!);
      }
    }
  }

  destroy(): void {
    this.img.destroy();
  }
}

function place(host: SkillHost, s: SkillCast, from: Vec2, to: Vec2, throwSec: number, armSec: number): void {
  trimOldest(host, ID, s.values.maxMines! - 1);
  host.addObject(new Mine(host, s, from, to, throwSec, armSec));
}

export const magiMine: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const from = host.playerPos();
    const phase = host.rng.range(0, Math.PI * 2);
    for (const to of ringPoints(from, v.count!, host.area(v.scatterRadius!), phase)) place(host, s, from, to, v.throwSec!, v.armSec!);
    return true;
  },
};

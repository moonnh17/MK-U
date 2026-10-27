/**
 * 마기 변질 (아크로, 마기·확률·원거리). 전방 부채꼴로 변질을 주입한다.
 * 변질된 적은 지속시간 동안 받는 피해가 늘고, 변질된 채 죽으면 폭발한다.
 * 대성공(확률 태그, 상한 60%)이면 받는 피해 증가가 2배.
 * 각성 '적색 반역': 변질된 적이 확률(실험 성공, 상한 98%)로 반역 개체가 되어 적과 싸운다(보스 불가).
 * 대성공이면 그 시전의 반역 개체가 더 강하고 오래가는 지배 개체가 된다. 반역 개체화는 처치로 친다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { hexColor } from '../core/scale';
import type { Enemy } from '../entities/enemy';
import { canRebel, rollChance } from '../systems/acro';
import { skillTags } from '../systems/tags';
import { inArc } from '../systems/weapons';
import type { EnemyDef } from '../types/data';
import { floatText, nearestEnemy, stepToward, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'magiCorruption';

/** 반역·지배 개체: 원래 적 모습으로 가까운 적에게 달려가 부딪혀 싸운다. 적에게 맞지 않는다 */
class Rebel implements SkillObject {
  readonly owner = `${ID}.rebel`;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Image;
  private life: number;
  private readonly damage: number;
  private timer = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private pos: Vec2,
    private readonly def: EnemyDef,
    dominate: boolean,
  ) {
    const v = s.values;
    this.createdAt = host.scene.time.now;
    this.life = dominate ? v.dominateSec! : v.rebelSec!;
    this.damage = v.rebelDamage! * (dominate ? v.dominateDamageMultiplier! : 1);
    this.img = host.scene.add
      .image(pos.x, pos.y, def.spriteKey)
      .setDepth(4)
      .setTint(hexColor(s.def.color))
      .setScale(dominate ? 1.25 : 1);
    floatText(host, pos.x, pos.y - 8, host.ctx.t(dominate ? 'skillMsg.dominate' : 'skillMsg.rebel'), s.def.color);
  }

  update(dt: number, host: SkillHost): boolean {
    this.life -= dt;
    if (this.life <= 0) return false;
    this.timer -= dt;
    const target = nearestEnemy(host, this.pos);
    // 움직이지 않는 적(더미)도 반역 개체로는 걷게 한다
    const speed = Math.max(this.def.moveSpeed, 40);
    if (!target) {
      this.pos = stepToward(this.pos, host.playerPos(), speed, dt, 16);
      this.img.setPosition(this.pos.x, this.pos.y);
      return true;
    }
    const touch = target.radius + this.def.size / 2;
    this.pos = stepToward(this.pos, { x: target.sprite.x, y: target.sprite.y }, speed, dt, touch * 0.8);
    this.img.setPosition(this.pos.x, this.pos.y);
    if (this.timer <= 0 && Math.hypot(target.sprite.x - this.pos.x, target.sprite.y - this.pos.y) <= touch + 1) {
      host.hit(target, this.damage, skillTags(this.s.def, true, 'corruption'));
      this.timer = this.s.values.rebelIntervalSec!;
    }
    return true;
  }

  destroy(): void {
    this.img.destroy();
  }
}

export const magiCorruption: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const awakened = s.owned.awakened;
    const tags = skillTags(s.def, awakened, 'corruption');
    const origin = host.playerPos();
    const range = host.area(v.range!);
    const target = nearestEnemy(host, origin, range);
    const aim = host.aimDir();
    const angle = target ? Math.atan2(target.sprite.y - origin.y, target.sprite.x - origin.x) : Math.atan2(aim.y, aim.x);
    const great = rollChance(host.rng, host.chance(v.greatChance!, 'greatSuccess', tags));
    if (great) floatText(host, origin.x, origin.y - 10, host.ctx.t('skillMsg.greatSuccess'), '#ffd23f');

    const hitList: Enemy[] = host.enemies().filter((e) => inArc(origin, angle, v.arcDeg!, range, e.sprite, e.radius));
    for (const e of hitList) {
      if (host.hit(e, v.damage!, tags)) continue;
      // 각성 전 대성공: 받는 피해 증가 2배 / 각성 후 대성공: 지배 개체
      const vuln = v.vulnerability! * (great && !awakened ? v.greatVulnerabilityMultiplier! : 1);
      host.corrupt(e, {
        leftSec: v.durationSec!,
        vulnerability: vuln,
        burstDamage: v.burstDamage!,
        burstRadius: host.area(v.burstRadius!),
        burstTags: tags,
      });
      if (!awakened || !canRebel(e.rank)) continue;
      if (!rollChance(host.rng, host.chance(v.rebelChance!, 'success', tags))) continue;
      const pos = { x: e.sprite.x, y: e.sprite.y };
      host.defeat(e);
      host.addObject(new Rebel(host, s, pos, e.def, great));
    }

    const half = (v.arcDeg! * Math.PI) / 360;
    const g = host.scene.add.graphics().setDepth(6);
    g.fillStyle(hexColor(s.def.color), 0.4);
    g.slice(origin.x, origin.y, range, angle - half, angle + half, false);
    g.fillPath();
    host.fx(g);
    return true;
  },
};

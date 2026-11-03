/**
 * 불안정 실험체 (아크로, 기술·확률·원거리). 무작위로 행동하는 실험체를 소환한다.
 * 행동은 소환 순간 정해진다: 돌진(닿은 적을 반복 타격) · 자폭(닿으면 폭발하고 사라짐) · 사격(플레이어 곁에서 쏨).
 * 대성공(확률 태그, 지능 보정, 상한 60%)이면 실험체가 2배로 나온다.
 * 각성 '증식하는 실패작': 실험체가 모두 집단 돌진해 자폭하고, 자폭으로 처치하면 확률(실험 성공, 상한 98%)로
 * 그 자리에서 증식해 연쇄 자폭한다. 실험체는 적에게 맞지 않는 아군이고, 지속시간이 끝나면 사라진다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import { rollChance } from '../systems/acro';
import { skillTags } from '../systems/tags';
import type { TagId } from '../types/data';
import { levelRef, loopArt, playFx, poseThen } from './skillFx';
import { floatText, nearestEnemy, stepToward, type SkillCast, type SkillHost, type SkillImpl, type SkillObject } from './host';

const ID = 'unstableSubject';

type Behavior = 'rush' | 'blast' | 'shot';
const BEHAVIORS: Behavior[] = ['rush', 'blast', 'shot'];

class Subject implements SkillObject {
  readonly owner = ID;
  readonly createdAt: number;
  private readonly img: Phaser.GameObjects.Sprite;
  private readonly aura: Phaser.GameObjects.Sprite | null = null;
  private life: number;
  private timer = 0;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private pos: Vec2,
    private readonly behavior: Behavior,
  ) {
    this.createdAt = host.scene.time.now;
    this.life = s.values.lifeSec!;
    const sp = s.def.sprites;
    const body = s.owned.awakened ? sp.moveA! : levelRef(s, 'subject');
    this.img = host.sprite(pos.x, pos.y, body).setDepth(4);
    if (s.owned.awakened) poseThen(this.img, sp.spawnA!, body);
    else {
      playFx(host.scene, sp.spawn!, pos.x, pos.y, { w: 22, depth: 3 });
      // Lv3(게임 Lv2)부터 변질 오라
      const aura = sp[`aura${s.owned.level}`];
      if (aura) this.aura = host.sprite(pos.x, pos.y, aura).setDepth(3).setAlpha(0.6).setDisplaySize(24, 24);
    }
    // 행동 구분: 자폭은 주황빛, 사격은 조금 작게
    if (behavior === 'blast') this.img.setTint(0xffb070);
    if (behavior === 'shot') this.img.setScale(0.8);
  }

  private get size(): number {
    return levelRef(this.s, 'subject').size;
  }

  private place(toward: Vec2): void {
    this.img.setPosition(this.pos.x, this.pos.y).setFlipX(toward.x < this.pos.x);
    this.aura?.setPosition(this.pos.x, this.pos.y).setRotation(this.life * 1.5);
  }

  private tags(): readonly TagId[] {
    return skillTags(this.s.def, this.s.owned.awakened, 'subject');
  }

  update(dt: number, host: SkillHost): boolean {
    this.life -= dt;
    if (this.life <= 0) return false;
    this.timer -= dt;
    const v = this.s.values;
    const target = nearestEnemy(host, this.pos);
    if (this.behavior === 'shot' || !target) {
      // 사격형·목표 없음: 플레이어 곁을 따라다닌다
      this.pos = stepToward(this.pos, host.playerPos(), v.moveSpeed!, dt, 14);
      this.place(target ? { x: target.sprite.x, y: target.sprite.y } : host.playerPos());
      if (this.behavior === 'shot' && target && this.timer <= 0) {
        const d = Math.hypot(target.sprite.x - this.pos.x, target.sprite.y - this.pos.y);
        if (d <= v.range! + target.radius) {
          const angle = Math.atan2(target.sprite.y - this.pos.y, target.sprite.x - this.pos.x);
          host.fireBullet(this.pos, angle, v.projectileSpeed!, v.range!, v.shotDamage!, this.tags(), this.s.def.sprites.bullet);
          this.timer = v.shotIntervalSec!;
        }
      }
      return true;
    }
    const tp = { x: target.sprite.x, y: target.sprite.y };
    const touch = target.radius + this.size / 2;
    this.pos = stepToward(this.pos, tp, v.moveSpeed!, dt, touch * 0.8);
    this.place(tp);
    if (Math.hypot(tp.x - this.pos.x, tp.y - this.pos.y) > touch + 1) return true;
    if (this.behavior === 'blast') {
      this.blast(host);
      return false;
    }
    if (this.timer <= 0) {
      const sp = this.s.def.sprites;
      playFx(host.scene, sp.flash!, tp.x, tp.y);
      playFx(host.scene, sp.shard!, tp.x, tp.y, { w: 20 });
      if (host.hit(target, v.rushDamage!, this.tags())) this.onKilled(host, tp);
      this.timer = v.rushIntervalSec!;
    }
    return true;
  }

  private blast(host: SkillHost): void {
    const v = this.s.values;
    const r = host.area(v.blastRadius!);
    const sp = this.s.def.sprites;
    playFx(host.scene, sp.blast!, this.pos.x, this.pos.y, { w: r * 2.2 });
    if (this.s.owned.awakened) {
      playFx(host.scene, sp.attackA!, this.pos.x, this.pos.y, { w: r * 1.2 });
      playFx(host.scene, sp.deathA!, this.pos.x, this.pos.y, { w: r * 1.4, depth: 5 });
    }
    for (const e of [...host.enemies()]) {
      const p = { x: e.sprite.x, y: e.sprite.y };
      if (Math.hypot(p.x - this.pos.x, p.y - this.pos.y) > r + e.radius) continue;
      if (host.hit(e, v.blastDamage!, this.tags())) this.onKilled(host, p);
    }
  }

  /** 각성: 처치하면 확률로 그 자리에 새 실험체 */
  private onKilled(host: SkillHost, at: Vec2): void {
    const v = this.s.values;
    if (!this.s.owned.awakened) return;
    if (host.objects().filter((o) => o.owner === ID).length >= v.maxSubjects!) return;
    if (!rollChance(host.rng, host.chance(v.multiplyChance!, 'success', this.tags()))) return;
    playFx(host.scene, this.s.def.sprites.variantA!, at.x, at.y);
    host.addObject(new Subject(host, this.s, at, 'blast'));
  }

  destroy(): void {
    this.img.destroy();
    this.aura?.destroy();
  }
}

/** 실험체를 at 둘레에 n마리 (특이점 실험 '증식'도 쓴다) */
export function spawnSubjects(host: SkillHost, s: SkillCast, at: Vec2, n: number, behavior: 'rush' | 'blast' | 'shot'): void {
  for (let i = 0; i < n; i++) {
    const a = (i * Math.PI * 2) / n;
    host.addObject(new Subject(host, s, { x: at.x + Math.cos(a) * 8, y: at.y + Math.sin(a) * 8 }, behavior));
  }
}

export const unstableSubject: SkillImpl = {
  cast(host, s) {
    const v = s.values;
    const tags = skillTags(s.def, s.owned.awakened, 'subject');
    const great = rollChance(host.rng, host.chance(v.greatChance!, 'greatSuccess', tags));
    const n = v.count! * (great ? 2 : 1);
    const at = host.playerPos();
    if (great) {
      floatText(host, at.x, at.y - 10, host.ctx.t('skillMsg.greatSuccess'), '#ffd23f');
      host.greatSuccess();
      if (s.owned.awakened) playFx(host.scene, s.def.sprites.powerA!, at.x, at.y);
    }
    for (let i = 0; i < n; i++) {
      const behavior: Behavior = s.owned.awakened
        ? 'blast'
        : host.rng.weighted(BEHAVIORS.map((b) => ({ item: b, weight: v[`${b}Weight`] ?? 0 })));
      const a = (i * Math.PI * 2) / n;
      host.addObject(new Subject(host, s, { x: at.x + Math.cos(a) * 8, y: at.y + Math.sin(a) * 8 }, behavior));
    }
    return true;
  },
};

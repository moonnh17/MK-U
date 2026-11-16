/**
 * 마기법사 전투 규칙: 개전 각인의 상시 효과(점화·서리·한파·대전·정화), 시전 강화(대전·원소 순환), 이번 런에 쓴 원소.
 * 공식은 systems/magiMage.ts(순수 함수), 여기서는 RunScene에 잇는다.
 */
import type { Vec2 } from '../../core/actions';
import type { BuffView } from '../../core/session';
import type { Enemy } from '../../entities/enemy';
import { playFx } from '../../skills/skillFx';
import { addElement, castBoost, chargeAfterMove, frostHit } from '../../systems/magiMage';
import { findSkill, skillValues } from '../../systems/skills';
import type { ElementId, SkillDef, TagId } from '../../types/data';
import type { RunScene } from '../RunScene';

export class MageRuntime {
  /** 대전 충전 (0~1) */
  charge = 0;
  private lastPos: Vec2 | null = null;
  private purifyIn = 0;
  /** 원소 순환: 마지막으로 쓴 원소 스킬의 원소 */
  lastElement: ElementId | null = null;
  /** 시전 강화: 그 스킬 출처의 피해에 until(ms)까지 */
  private boosts = new Map<string, { mul: number; until: number }>();
  /** castSlot이 시전 직전에 정한 강화 (성공하면 적용) */
  private pending: { skillId: string; mul: number; windowSec: number } | null = null;

  constructor(private readonly run: RunScene) {}

  /** 스테이지가 바뀌면 충전·강화는 비운다 (이번 런에 쓴 원소와 마지막 원소는 남긴다) */
  reset(): void {
    this.charge = 0;
    this.lastPos = null;
    this.purifyIn = 0;
    this.boosts.clear();
    this.pending = null;
  }

  update(dt: number): void {
    const im = this.run.skillRt.imprint();
    const p = { x: this.run.player.x, y: this.run.player.y };
    if (im?.effect === 'staticCharge' && this.lastPos) this.charge = chargeAfterMove(this.charge, Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y), im.values.fullPx!);
    this.lastPos = p;
    // 한파: 플레이어 둘레 적 감속 (매 프레임 다시)
    const r = im?.effect === 'coldAura' ? this.run.skillRt.area(im.values.radius!) : 0;
    for (const e of this.run.enemies) e.auraSlow = r > 0 && Math.hypot(e.sprite.x - p.x, e.sprite.y - p.y) <= r + e.radius ? im!.values.coldAura! : 0;
    // 정화: 주기적으로 해로운 상태 해제 + 회복
    if (im?.effect === 'purify') {
      this.purifyIn -= dt;
      if (this.purifyIn <= 0) {
        this.purifyIn = im.values.everySec!;
        this.purify(im.values.purify!);
      }
    } else this.purifyIn = 0;
  }

  /** 해로운 상태(위압 속박) 해제 + 회복 */
  private purify(amount: number): void {
    this.run.rootLeft = 0;
    this.run.host.heal(amount, false);
    this.run.juice.colorBurst({ x: this.run.player.x, y: this.run.player.y }, '#fff4d6', this.run.ctx.data.juice.skillBurst);
  }

  /** 시전 직전: 강화를 정하고 연쇄 수를 더한 값을 돌려준다 */
  beforeCast(def: SkillDef, values: Record<string, number>): Record<string, number> {
    const p = this.run.session.player;
    const cycle = p.loadout.passive === 'elementCycle' ? this.passiveValues('elementCycle') : null;
    const b = castBoost(this.charge, this.run.skillRt.imprint(), cycle ? { damage: cycle.damage!, windowSec: cycle.windowSec! } : null, def.element, this.lastElement);
    this.pending = b ? { skillId: def.id, mul: b.mul, windowSec: b.windowSec } : null;
    return b?.chains && values.chains !== undefined ? { ...values, chains: values.chains + b.chains } : values;
  }

  /** 시전 성공: 충전을 쓰고 강화를 걸고 원소를 기록한다 */
  afterCast(def: SkillDef): void {
    const p = this.run.session.player;
    if (this.run.skillRt.imprint()?.effect === 'staticCharge') this.charge = 0;
    if (this.pending?.skillId === def.id && this.pending.mul !== 1) this.boosts.set(def.id, { mul: this.pending.mul, until: this.run.time.now + this.pending.windowSec * 1000 });
    this.pending = null;
    if (def.element) {
      this.lastElement = def.element;
      p.elementsUsed = addElement(p.elementsUsed, def.element);
    }
  }

  /** 시전 강화로 그 스킬 피해에 곱하는 값 */
  boostMul(source: string | null): number {
    const b = source ? this.boosts.get(source) : undefined;
    if (!b) return 1;
    if (this.run.time.now > b.until) {
      this.boosts.delete(source!);
      return 1;
    }
    return b.mul;
  }

  /** 피해를 준 뒤: 점화(모든 피해에 확률 화상), 서리(냉기 피해 중첩 → 빙결) */
  onHit(enemy: Enemy, source: string | null, killed: boolean): void {
    const im = this.run.skillRt.imprint();
    if (!im || killed || enemy.dead) return;
    const host = this.run.skillRt.hostFor(im.skillId);
    if (im.effect === 'ignite' && this.run.rng.chance(im.values.ignite!)) host.burn(enemy, im.values.stacks!);
    if (im.effect === 'frost' && this.elementOf(source) === 'ice') {
      const r = frostHit(enemy.frost, im.values.need!, im.values.stackSec!);
      enemy.frost = r.state;
      if (r.freeze && enemy.freeze(im.values.frost!)) this.iceBurst(enemy);
      else if (r.state) enemy.chill(r.state.stacks * im.values.slowPerStack!, im.values.stackSec!);
    }
  }

  /** 적이 쓰러졌을 때: 점화(화상 걸린 적은 작은 폭발) */
  onKill(enemy: Enemy): void {
    const im = this.run.skillRt.imprint();
    if (im?.effect !== 'ignite' || !enemy.burn) return;
    const host = this.run.skillRt.hostFor(im.skillId);
    const at = { x: enemy.sprite.x, y: enemy.sprite.y };
    const r = host.area(im.values.blastRadius!);
    const def = findSkill(this.run.ctx.data.skills, im.skillId);
    const tags: TagId[] = def.sources.blast ?? def.tags;
    // 쓰러진 적 처리 중이라 다음 틱에 터뜨린다
    this.run.time.delayedCall(0, () => {
      for (const e of [...host.enemies()]) if (Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= r + e.radius) host.hit(e, im.values.blastDamage!, tags);
      const blast = def.sprites.blast;
      if (blast) playFx(this.run, blast, at.x, at.y, { w: r * 2.2 });
    });
  }

  /** 빙결 순간 이펙트 */
  iceBurst(enemy: Enemy): void {
    const ref = findSkill(this.run.ctx.data.skills, 'iceSpear').sprites.hit;
    if (ref) playFx(this.run, ref, enemy.sprite.x, enemy.sprite.y, { w: Math.max(ref.size, enemy.radius * 3) });
  }

  elementOf(source: string | null): ElementId | undefined {
    if (!source) return undefined;
    return this.run.ctx.data.skills.skills.find((s) => s.id === source)?.element;
  }

  private passiveValues(id: string): Record<string, number> | null {
    const owned = this.run.session.player.loadout.owned[id];
    if (!owned) return null;
    return skillValues(findSkill(this.run.ctx.data.skills, id), owned).values;
  }

  /** HUD: 대전 충전량 */
  buffs(): BuffView[] {
    const im = this.run.skillRt.imprint();
    if (im?.effect !== 'staticCharge' || this.charge <= 0) return [];
    const def = findSkill(this.run.ctx.data.skills, im.skillId);
    return [{ id: 'staticCharge', label: this.run.ctx.t('buff.staticCharge', { pct: Math.round(this.charge * 100) }), color: def.color }];
  }
}

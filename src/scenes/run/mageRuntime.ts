/**
 * 마기법사 전투 규칙: 개전 각인의 상시 효과, 시전 강화(대전·응축·원소 순환), 이번 런에 쓴 원소, 순수 전개.
 * - 백온파 각인: 점화·서리·한파·대전·정화. 휘강파 각인: 과잉 전개·관통 전개·반발·응축·극단·잔영 동행.
 * 공식은 systems/magiMage.ts(순수 함수), 여기서는 RunScene에 잇는다.
 */
import Phaser from 'phaser';
import type { Vec2 } from '../../core/actions';
import type { BuffView } from '../../core/session';
import type { Enemy } from '../../entities/enemy';
import type { SkillCast } from '../../skills/host';
import { playFx } from '../../skills/skillFx';
import { animKey } from '../../systems/art';
import { addElement, castBoost, chargeAfterMove, condenseFill, frostHit, imprintMods } from '../../systems/magiMage';
import { findSkill, skillValues } from '../../systems/skills';
import type { ElementId, SkillDef, TagId } from '../../types/data';
import type { PlayerMods } from '../../systems/vitals';
import type { RunScene } from '../RunScene';

export class MageRuntime {
  /** 대전 충전 (0~1) */
  charge = 0;
  /** 마기 응축 게이지 (0~1): 「응축」 각인과 순수 전개가 함께 쓴다 */
  condense = 0;
  private lastPos: Vec2 | null = null;
  private purifyIn = 0;
  private recoilIn = 0;
  /** 원소 순환: 마지막으로 쓴 원소 스킬의 원소 */
  lastElement: ElementId | null = null;
  /** 시전 강화: 그 스킬 출처의 피해에 until(ms)까지 */
  private boosts = new Map<string, { mul: number; until: number }>();
  /** castSlot이 시전 직전에 정한 강화 (성공하면 적용) */
  private pending: { skillId: string; mul: number; windowSec: number } | null = null;
  /** 잔영 동행: 플레이어를 따라다니는 작은 잔영 */
  private echo: Phaser.GameObjects.Sprite | null = null;

  constructor(private readonly run: RunScene) {}

  update(dt: number): void {
    const im = this.run.skillRt.imprint();
    const p = { x: this.run.player.x, y: this.run.player.y };
    if (im?.effect === 'staticCharge' && this.lastPos) this.charge = chargeAfterMove(this.charge, Math.hypot(p.x - this.lastPos.x, p.y - this.lastPos.y), im.values.fullPx!);
    this.lastPos = p;
    // 응축: 스킬을 쓰지 않는 동안 찬다 (쓰면 afterCast에서 비운다)
    if (im?.effect === 'condense') this.condense = condenseFill(this.condense, dt, im.values.fullSec!);
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
    this.recoilIn = Math.max(0, this.recoilIn - dt);
    this.updateEcho(im?.effect === 'followUp', dt);
  }

  /** 해로운 상태(위압 속박) 해제 + 회복 */
  private purify(amount: number): void {
    this.run.rootLeft = 0;
    this.run.host.heal(amount, false);
    this.run.juice.colorBurst({ x: this.run.player.x, y: this.run.player.y }, '#fff4d6', this.run.ctx.data.juice.skillBurst);
  }

  /** 잔영: 플레이어 조금 뒤를 늦게 따라온다 */
  private updateEcho(on: boolean, dt: number): void {
    if (!on) {
      this.echo?.destroy();
      this.echo = null;
      return;
    }
    const ref = findSkill(this.run.ctx.data.skills, 'executionWill').sprites.echo!;
    const back = { x: this.run.player.x - this.run.aimDir.x * 14, y: this.run.player.y - this.run.aimDir.y * 14 - 4 };
    if (!this.echo) {
      this.echo = this.run.add.sprite(back.x, back.y, ref.spriteKey).setAlpha(0.55).setDepth(4);
      this.echo.setDisplaySize(ref.size * 1.6, ref.height ?? ref.size);
      const idle = animKey(ref.spriteKey, 'idle');
      if (this.run.anims.exists(idle)) this.echo.play(idle);
    }
    const k = Math.min(1, dt * 8);
    this.echo.setPosition(this.echo.x + (back.x - this.echo.x) * k, this.echo.y + (back.y - this.echo.y) * k).setFlipX(this.run.aimDir.x < 0);
  }

  /** 각인이 주는 플레이어 보정 (과잉 전개·극단) */
  mods(): Partial<PlayerMods> {
    return imprintMods(this.run.skillRt.imprint());
  }

  /** 관통 전개: 스킬·무기 탄 관통 + */
  extraPierce(): number {
    const im = this.run.skillRt.imprint();
    return im?.effect === 'pierceUnfold' ? im.values.pierce! : 0;
  }

  /** 시전 직전: 강화를 정하고 연쇄·관통 수를 더한 값을 돌려준다 */
  beforeCast(def: SkillDef, values: Record<string, number>): Record<string, number> {
    const p = this.run.session.player;
    const im = this.run.skillRt.imprint();
    const cycle = p.loadout.passive === 'elementCycle' ? this.passiveValues('elementCycle') : null;
    const gauge = im?.effect === 'condense' ? this.condense : this.charge;
    const b = castBoost(gauge, im, cycle ? { damage: cycle.damage!, windowSec: cycle.windowSec! } : null, def.element, this.lastElement);
    this.pending = b ? { skillId: def.id, mul: b.mul, windowSec: b.windowSec } : null;
    const out = { ...values };
    if (b?.chains && out.chains !== undefined) out.chains += b.chains;
    if (out.pierce !== undefined) out.pierce += this.extraPierce();
    return out;
  }

  /** 시전 성공: 충전·응축을 쓰고 강화를 걸고 원소를 기록한다. 집행 의지체에게 알린다 */
  afterCast(cast: SkillCast): void {
    const def = cast.def;
    const p = this.run.session.player;
    const im = this.run.skillRt.imprint();
    if (im?.effect === 'staticCharge') this.charge = 0;
    if (im?.effect === 'condense') this.condense = 0;
    if (this.pending?.skillId === def.id && this.pending.mul !== 1) this.boosts.set(def.id, { mul: this.pending.mul, until: this.run.time.now + this.pending.windowSec * 1000 });
    this.pending = null;
    if (def.element) {
      this.lastElement = def.element;
      p.elementsUsed = addElement(p.elementsUsed, def.element);
    }
    for (const o of [...this.run.skillRt.skillObjects]) o.onSkillCast?.(this.run.skillRt.hostFor(def.id), cast);
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

  /** 관통 전개(마기 태그 피해)·순수 전개(휘강파 피해) 배율 */
  damageMul(school: string | null, tags: readonly TagId[]): number {
    const im = this.run.skillRt.imprint();
    let mul = im?.effect === 'pierceUnfold' && tags.includes('magic') ? 1 + im.values.pierceUnfold! : 1;
    const pure = school === 'hwigang' ? this.passiveValues('pureUnfolding', true) : null;
    if (pure) mul *= 1 + pure.magicDamage!;
    return mul;
  }

  /** 극단: 스킬(학파가 있는 출처) 치명 확률·치명 피해 추가. 아니면 null */
  skillCrit(school: string | null): { chance: number; bonus: number } | null {
    const im = this.run.skillRt.imprint();
    return school && im?.effect === 'extreme' ? { chance: im.values.critChance!, bonus: im.values.extreme! } : null;
  }

  /** 실제로 깎인 피해: 순수 전개는 휘강파 피해만큼 응축을 채운다 */
  onDealt(school: string | null, dealt: number): void {
    const pure = school === 'hwigang' ? this.passiveValues('pureUnfolding', true) : null;
    if (pure) this.condense = condenseFill(this.condense, 0, 0, dealt, pure.condensePerDamage!);
  }

  /** 피해를 준 뒤: 점화(모든 피해에 확률 화상), 서리(냉기 피해 중첩 → 빙결), 잔영 동행(무기 공격을 늦게 따라 친다) */
  onHit(enemy: Enemy, source: string | null, killed: boolean, base: number, tags: readonly TagId[]): void {
    const im = this.run.skillRt.imprint();
    if (!im) return;
    if (im.effect === 'followUp' && source === null) {
      const ratio = im.values.followUp!;
      this.run.time.delayedCall(im.values.delaySec! * 1000, () => {
        if (enemy.dead) return;
        const shot = findSkill(this.run.ctx.data.skills, 'executionWill').sprites.willHit;
        if (shot) playFx(this.run, shot, enemy.sprite.x, enemy.sprite.y, { w: Math.max(12, enemy.radius * 2) });
        this.run.combat.hit(enemy, base * ratio, tags, 'executionWill');
      });
    }
    if (killed || enemy.dead) return;
    const host = this.run.skillRt.hostFor(im.skillId);
    if (im.effect === 'ignite' && this.run.rng.chance(im.values.ignite!)) host.burn(enemy, im.values.stacks!);
    if (im.effect === 'frost' && this.elementOf(source) === 'ice') {
      const r = frostHit(enemy.frost, im.values.need!, im.values.stackSec!);
      enemy.frost = r.state;
      if (r.freeze && enemy.freeze(im.values.frost!)) this.iceBurst(enemy);
      else if (r.state) enemy.chill(r.state.stacks * im.values.slowPerStack!, im.values.stackSec!);
    }
  }

  /** 반발: 피격되면 둘레에 파동을 되돌린다 (재사용 대기) */
  onHurt(): void {
    const im = this.run.skillRt.imprint();
    if (im?.effect !== 'recoil' || this.recoilIn > 0) return;
    this.recoilIn = im.values.cooldownSec!;
    const host = this.run.skillRt.hostFor(im.skillId);
    const def = findSkill(this.run.ctx.data.skills, im.skillId);
    const p = host.playerPos();
    const r = host.area(im.values.radius!);
    for (const e of [...host.enemies()]) {
      const dx = e.sprite.x - p.x;
      const dy = e.sprite.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d > r + e.radius) continue;
      if (!host.hit(e, im.values.recoil!, def.sources.wave ?? def.tags) && d > 0) e.knockback({ x: dx / d, y: dy / d }, im.values.knockback!, im.values.knockSec!);
    }
    const ref = def.sprites.recoil;
    if (ref) playFx(this.run, ref, p.x, p.y, { w: r * 2.2 });
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

  /** 가진 패시브의 수치. equipped면 장착했을 때만 */
  private passiveValues(id: string, equipped = false): Record<string, number> | null {
    const p = this.run.session.player;
    const owned = p.loadout.owned[id];
    if (!owned || (equipped && p.loadout.passive !== id)) return null;
    return skillValues(findSkill(this.run.ctx.data.skills, id), owned).values;
  }

  /** HUD: 대전 충전량, 마기 응축 */
  buffs(): BuffView[] {
    const im = this.run.skillRt.imprint();
    const out: BuffView[] = [];
    if (im?.effect === 'staticCharge' && this.charge > 0) out.push({ id: 'staticCharge', label: this.run.ctx.t('buff.staticCharge', { pct: Math.round(this.charge * 100) }), color: findSkill(this.run.ctx.data.skills, im.skillId).color });
    if ((im?.effect === 'condense' || this.passiveValues('pureUnfolding', true)) && this.condense > 0) out.push({ id: 'condense', label: this.run.ctx.t('buff.condense', { pct: Math.round(this.condense * 100) }), color: '#b266ff' });
    return out;
  }
}

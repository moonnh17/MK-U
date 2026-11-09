/** 스킬 실행: SkillHost, 슬롯 발동, 궁극기, 패시브, 마기역장, 스킬바 표시. */
import { startSpaceCut, startSpaceRift } from '../../entities/spaceCutFx';
import { loopArt, playFx } from '../../skills/skillFx';
import Phaser from 'phaser';
import { hexColor } from '../../core/scale';
import { type BuffView, type SkillSlotView } from '../../core/session';
import { artKeys } from '../../systems/art';
import { type ShieldOpts, type SkillHost, type SkillObject } from '../../skills/host';
import { passiveImpl, skillImpl, ultimateImpl } from '../../skills/registry';
import { calcDamage, spaceDamage } from '../../systems/damage';
import { refracts, tickShield, type ShieldState } from '../../systems/shield';
import { applyCorruption, skillChance } from '../../systems/acro';
import { combineMods, heal, payHp, type PlayerMods } from '../../systems/vitals';
import { cooldownLeft, findSkill, refundCooldown, skillValues, ultimateCooldownSec } from '../../systems/skills';
import { applyBleed, canAutoCast, skillTags } from '../../systems/tags';
import type { BleedRule, SkillDef, SpaceRule, UltimateDef } from '../../types/data';
import type { RunScene } from '../RunScene';
import { sfx } from './shared';
import { shake } from '../../entities/juice';

export class SkillRuntime {
  /** 피해를 준 스킬 id별 SkillHost (학파 궁극기 게이지가 출처를 본다) */
  hosts = new Map<string, SkillHost>();
  /** 마기역장 보호막 */
  shield: ShieldState | null = null;
  shieldOpts: ShieldOpts | null = null;
  shieldFx: Phaser.GameObjects.Sprite | null = null;
  /** 겹 수만큼 그리는 테두리 */
  /** 끝날 때 종료 이펙트를 내기 위해 기억한다 */
  private lastShieldOpts: ShieldOpts | null = null;
  /** 지금 깔려 있는 패시브 (id:레벨:각성). 바뀌면 오브젝트를 다시 깐다 */
  passiveKey = '';
  passiveId: string | null = null;
  skillObjects: SkillObject[] = [];

  constructor(private readonly run: RunScene) {}

  /** source(스킬 id, 'magiTurret.shell'처럼 하위 오브젝트면 앞부분)를 단 SkillHost */
  hostFor(owner: string | null): SkillHost {
    const source = owner ? owner.split('.')[0]! : null;
    const key = source ?? '';
    let h = this.hosts.get(key);
    if (!h) {
      h = this.makeHost(source);
      this.hosts.set(key, h);
    }
    return h;
  }

  makeHost(source: string | null): SkillHost {
    const ctx = this.run.ctx;
    return {
      scene: this.run,
      ctx,
      rng: this.run.rng,
      playerPos: () => ({ x: this.run.player.x, y: this.run.player.y }),
      playerSprite: () => this.run.player,
      burst: (at, color) => this.run.juice.colorBurst(at, color, this.run.ctx.data.juice.skillBurst),
      aimDir: () => this.run.aimDir,
      enemies: () => this.run.enemies.filter((e) => !e.dead),
      area: (r) => this.area(r),
      hit: (e, base, tags) => this.run.combat.hit(e, base, tags, source),
      hitTrue: (e, amount, space) => {
        if (e.dead) return false;
        const dmg = space ? spaceDamage(e.rank, e.maxHp, amount, this.run.tagRule<SpaceRule>('space')) : amount;
        return this.run.combat.applyDamage(e, dmg, source);
      },
      hurtSelf: (amount) => {
        this.run.hurtPlayer(amount);
      },
      greatSuccess: () => {},
      buffDuration: (sec, tags) => sec * (tags.includes('buff') ? 1 + this.run.itemRt.sums.buffDuration : 1),
      chargeTime: (sec) => sec * (1 - this.run.itemRt.sums.chargeTime),
      shield: () => this.shield,
      setShield: (shield, opts) => {
        this.shield = shield;
        this.shieldOpts = opts;
      },
      // 아크룩스(아크로): 대성공 +20%p, 상한 무시
      chance: (base, capKey, tags) =>
        Math.min(1, skillChance(base, capKey, tags, ctx.data.tags) + (capKey === 'greatSuccess' ? this.run.itemRt.greatSuccess().bonus : 0)),
      noGreatFailure: () => this.run.itemRt.greatSuccess().noFailure,
      hitStop: (sec) => this.run.hitStop.request(sec),
      spaceCut: (def, a, b, telegraphSec) => startSpaceCut(this.run, def, a, b, telegraphSec),
      spaceRift: (def, rift, at, angle) => startSpaceRift(this.run, def, rift, at, angle),
      corrupt: (e, state) => {
        // 보스에게는 변질이 걸리지 않는다
        if (!e.dead && e.rank !== 'boss' && e.rank !== 'hiddenBoss') e.corruption = applyCorruption(e.corruption, state);
      },
      defeat: (e) => {
        if (e.dead) return;
        e.corruption = null;
        e.bleed = null;
        e.converted = true;
        this.run.onEnemyKilled(e);
      },
      blastProps: (at, radius, damage) => this.run.roomProps.blastProps(at, radius, damage),
      heal: (amount, overflow) => {
        const p = this.run.session.player;
        const v = heal(p, amount);
        p.hp = v.hp;
        if (overflow) this.run.condition.setSanity({ sanity: Math.min(p.sanityMax, p.sanity + v.overflow), panic: p.panic });
      },
      payHp: (ratio) => {
        const p = this.run.session.player;
        p.hp = payHp(p.hp, ratio).hp;
      },
      drainHp: (amount) => {
        const p = this.run.session.player;
        p.hp = Math.max(1, p.hp - amount);
      },
      hpRatio: () => this.run.session.player.hp / this.run.session.player.maxHp,
      maxHp: () => this.run.session.player.maxHp,
      ownedSkills: () => Object.keys(this.run.session.player.loadout.owned),
      roarBoost: () => this.run.itemRt.total('roarBoost'),
      dash: (dir, speed, sec) => {
        sfx('dash');
        this.run.dashVel = { x: dir.x * speed, y: dir.y * speed };
        this.run.dashLeft = sec;
      },
      refundCooldown: (id, ratio) => {
        const p = this.run.session.player;
        const owned = p.loadout.owned[id];
        if (!owned) return;
        const total = this.cooldownOf(skillValues(findSkill(ctx.data.skills, id), owned).cooldownSec);
        p.cooldowns = refundCooldown(p.cooldowns, id, total * ratio);
      },
      bleed: (e, base, stacks, tags) => {
        if (e.dead) return;
        const perStack = calcDamage({ baseDamage: base, tags }, this.run.combat.tagBonus(), ctx.data.tags, this.run.combat.rangeBonus());
        e.bleed = applyBleed(e.bleed, perStack, stacks, this.run.tagRule<BleedRule>('bleed'));
      },
      fireBullet: (from, angle, speed, range, base, tags, sprite, extra) =>
        this.run.combat.fireBullet(from, angle, speed, range, base, tags, source, { pierce: extra?.pierce ?? 0, crit: 0, sprite, hitSize: extra?.hitSize, tint: extra?.tint }),
      castEquipped: (id) => {
        const i = this.run.session.player.loadout.active.indexOf(id);
        if (i >= 0) this.castSlot(i, true);
      },
      addObject: (o) => this.skillObjects.push(o),
      removeObject: (o) => this.removeObject(o),
      objects: () => this.skillObjects,
      sprite: (x, y, ref) => this.run.add.sprite(x, y, ref.spriteKey),
      fx: (obj, sec) => {
        this.run.time.delayedCall((sec ?? ctx.data.ui.slashFxSec) * 1000, () => obj.destroy());
      },
    };
  }

  removeObject(o: SkillObject): void {
    this.skillObjects = this.skillObjects.filter((x) => x !== o);
    o.destroy();
  }

  /** 장착 패시브가 바뀌면(장착·해제·레벨·각성) 이전 오브젝트를 치우고 다시 깐다 */
  syncPassive(): void {
    const p = this.run.session.player;
    const id = p.loadout.passive;
    const owned = id ? p.loadout.owned[id] : undefined;
    const key = id && owned ? `${id}:${owned.level}:${owned.awakened}` : '';
    if (key === this.passiveKey) return;
    const prev = this.passiveId;
    if (prev) for (const o of this.skillObjects.filter((x) => x.owner.split('.')[0] === prev)) this.removeObject(o);
    this.passiveKey = key;
    this.passiveId = id;
    const impl = id ? passiveImpl(id) : undefined;
    if (!id || !owned || !impl) return;
    const def = findSkill(this.run.ctx.data.skills, id);
    impl.activate(this.hostFor(id), { def, owned, values: skillValues(def, owned).values });
  }

  /** 보호막 시간, 플레이어 둘레 표시, 각성(벡터굴절역장) 일반 탄 무효화 */
  updateShield(dt: number): void {
    if (this.shield) this.shield = tickShield(this.shield, dt);
    const s = this.shield;
    const opts = this.shieldOpts;
    // 몸 그림 가운데 (판정 자리는 발쪽이다)
    const at = this.run.player.getCenter();
    if (!s || !opts) {
      if (this.shieldFx && this.lastShieldOpts?.look?.end) playFx(this.run, this.lastShieldOpts.look.end, at.x, at.y, { w: this.lastShieldOpts.fxRadius * 2.4, depth: 5 });
      if (this.shieldFx) this.run.tweens.killTweensOf(this.shieldFx);
      this.shieldFx?.destroy();
      this.shieldFx = null;
      this.lastShieldOpts = null;
      return;
    }
    const color = hexColor(opts.color);
    const fresh = this.lastShieldOpts !== opts;
    if (fresh) {
      if (this.shieldFx) this.run.tweens.killTweensOf(this.shieldFx);
      this.shieldFx?.destroy();
      this.shieldFx = null;
      this.lastShieldOpts = opts;
      this.run.juice.colorBurst({ x: at.x, y: at.y }, opts.color, this.run.ctx.data.juice.shieldSpawn);
      if (opts.look?.spawn) playFx(this.run, opts.look.spawn, at.x, at.y, { w: opts.fxRadius * 2.4, depth: 5 });
    }
    if (opts.look) {
      if (!this.shieldFx) {
        const body = this.run.add.sprite(at.x, at.y, opts.look.body.spriteKey).setDepth(5);
        body.setDisplaySize(opts.fxRadius * 2.2, (opts.fxRadius * 2.2 * body.height) / Math.max(1, body.width));
        loopArt(body, opts.look.body);
        this.shieldFx = body;
      }
      // 겹이 쌓일수록 진해진다 (다 쓰고 굴절만 남으면 가장 흐리게)
      const look = this.run.ctx.data.juice.shieldSpawn;
      this.shieldFx.setPosition(at.x, at.y).setAlpha(look.stacks[Math.max(0, s.hits - 1)]!.bodyAlpha);
    }
    if (fresh && this.shieldFx) {
      // 작게 시작해 온몸을 덮을 때까지 커진다
      const sp = this.run.ctx.data.juice.shieldSpawn;
      const fx = this.shieldFx;
      const { scaleX, scaleY } = fx;
      fx.setScale(scaleX * sp.startScale, scaleY * sp.startScale);
      this.run.tweens.add({ targets: fx, scaleX, scaleY, duration: sp.growSec * 1000, ease: 'Back.easeOut' });
    }
    if (s.refractLeftSec <= 0) return;
    for (const b of [...this.run.enemyBullets.getChildren()] as Phaser.Physics.Arcade.Image[]) {
      const dist = Math.hypot(b.x - this.run.player.x, b.y - this.run.player.y);
      if (!refracts(s, dist, b.getData('refractable') !== false)) continue;
      if (opts.look?.contact) playFx(this.run, opts.look.contact, b.x, b.y);
      if (opts.look?.deflect) playFx(this.run, opts.look.deflect, b.x, b.y);
      if (!opts.look?.contact) this.run.fxAt(this.run.add.circle(b.x, b.y, 3, color, 0.8).setDepth(6));
      b.destroy();
    }
  }

  /** HUD '현재 버프': 보호막 + 스킬 오브젝트가 알리는 상태(충전 등) */
  buffViews(): BuffView[] {
    const out: BuffView[] = [];
    const s = this.shield;
    if (s && this.shieldOpts) {
      // 겹 수를 숫자로 보여 준다
      if (s.hits > 0) out.push({ id: 'magiField', label: this.run.ctx.t('buff.magiField'), color: this.shieldOpts.color, count: s.hits });
      if (s.refractLeftSec > 0) out.push({ id: 'magiFieldRefract', label: this.run.ctx.t('buff.magiField.refract'), color: this.shieldOpts.color, leftSec: s.refractLeftSec, totalSec: s.refractTotalSec });
    }
    for (const o of this.skillObjects) {
      const b = o.buff?.(this.run.host);
      if (b) out.push(b);
    }
    const c = this.run.combat;
    if (c.buffLeft > 0) out.push({ id: 'weaponBuff', label: this.run.ctx.t('buff.warBanner'), color: c.buffColor, leftSec: c.buffLeft, totalSec: c.buffTotal });
    out.push(...this.run.itemRt.buffs());
    return out;
  }

  /** 스킬 범위 보정 (아이템) */
  area(radius: number): number {
    return radius * (1 + this.run.itemRt.sums.area);
  }

  /** 아이템의 스킬 쿨타임 감소를 반영한 쿨타임 */
  cooldownOf(sec: number): number {
    return sec * (1 - this.run.itemRt.sums.skillCooldown);
  }

  /** 근접 스킬은 사거리 안에 적이 있어야 발동한다 */
  skillUsable(def: SkillDef, awakened: boolean, values: Record<string, number>): boolean {
    const targets = this.run.enemies.filter((e) => !e.dead).map((e) => ({ x: e.sprite.x, y: e.sprite.y, radius: e.radius }));
    return canAutoCast(skillTags(def, awakened), this.area(values.range ?? 0), this.run.player, targets);
  }

  /** auto: 저절로 쓰는 시전(라스알게티의 기억) — 대상이 없어도 알리지 않는다 */
  castSlot(i: number, auto = false): void {
    const p = this.run.session.player;
    const id = p.loadout.active[i];
    if (!id) return;
    const impl = skillImpl(id);
    const owned = p.loadout.owned[id];
    if (!impl || !owned) return;
    const def = findSkill(this.run.ctx.data.skills, id);
    const sv = skillValues(def, owned);
    if (impl.recast?.(this.hostFor(id), { def, owned, values: sv.values })) {
      sfx('skill');
      return;
    }
    if (cooldownLeft(p.cooldowns, id) > 0) return;
    if (!this.skillUsable(def, owned.awakened, sv.values)) {
      if (auto) return;
      this.run.toastThrottled(this.run.ctx.t('skillMsg.noTarget'));
      return;
    }
    if (impl.cast(this.hostFor(id), { def, owned, values: sv.values })) {
      p.cooldowns = { ...p.cooldowns, [id]: this.cooldownOf(sv.cooldownSec) };
      sfx('skill');
      // 스킬을 쓸 때마다 스킬 색 파동과 흔들림
      this.run.juice.colorBurst({ x: this.run.player.x, y: this.run.player.y }, def.color, this.run.ctx.data.juice.skillCast);
      shake(this.run, 'light');
    }
  }

  castUltimate(): void {
    const ult = this.run.session.player.ultimate;
    const def = this.ultimateDef();
    const impl = ultimateImpl(def.id);
    if (!impl) return;
    if (ult.cooldownLeft > 0) {
      this.run.toastThrottled(this.run.ctx.t('skillMsg.ultimateNotReady', { s: Math.ceil(ult.cooldownLeft) }));
      return;
    }
    const values = ult.awakened && def.awakening ? { ...def.values, ...def.awakening.values } : { ...def.values };
    if (!impl.cast(this.hostFor(def.id), { def, awakened: ult.awakened, values })) return;
    ult.cooldownTotal = ult.cooldownLeft = this.ultimateCooldown();
    sfx('ultimate');
    this.run.itemRt.onUltimate();
  }

  /** HUD·터치 버튼이 그릴 스킬 칸 (액티브 4 + 궁극기 + 패시브) */
  refreshSkillView(): void {
    const d = this.run.ctx.data;
    const t = this.run.ctx.t;
    const p = this.run.session.player;
    const empty: SkillSlotView = {
      skillId: null,
      label: '',
      level: 0,
      awakened: false,
      cooldownLeft: 0,
      cooldownTotal: 0,
      gauge: 0,
      usable: false,
      color: d.ui.hud.skillbar.emptyColor,
      iconKey: null,
    };
    const slot = (id: string | null, active: boolean): SkillSlotView => {
      const owned = id ? p.loadout.owned[id] : undefined;
      if (!id || !owned) return empty;
      const def = findSkill(d.skills, id);
      const sv = skillValues(def, owned);
      return {
        skillId: id,
        label: t(def.shortKey),
        level: owned.level,
        awakened: owned.awakened,
        cooldownLeft: active ? cooldownLeft(p.cooldowns, id) : 0,
        cooldownTotal: this.cooldownOf(sv.cooldownSec),
        gauge: 0,
        usable: !active || this.skillUsable(def, owned.awakened, sv.values),
        followUp: active && (skillImpl(id)?.followUpReady?.(this.hostFor(id)) ?? false),
        color: def.color,
        iconKey: artKeys.skillIcon(id),
      };
    };
    const ult = this.ultimateDef();
    this.run.session.buffs = this.buffViews();
    this.run.session.skillView = [
      ...p.loadout.active.map((id) => slot(id, true)),
      {
        ...empty,
        skillId: ult.id,
        label: t(p.ultimate.awakened && ult.awakening ? ult.awakening.shortKey : ult.shortKey),
        awakened: p.ultimate.awakened,
        // 칸이 차오르는 표시: 재사용 대기가 끝나면 가득
        gauge: p.ultimate.cooldownTotal > 0 ? 1 - p.ultimate.cooldownLeft / p.ultimate.cooldownTotal : 1,
        usable: p.ultimate.cooldownLeft <= 0,
        cooldownLeft: p.ultimate.cooldownLeft,
        cooldownTotal: p.ultimate.cooldownTotal,
        color: ult.color,
        iconKey: artKeys.ultimateIcon(ult.id),
      },
      slot(p.loadout.passive, false),
    ];
  }

  /** 지금 아이템으로 줄어든 궁극기 재사용 대기(초) */
  ultimateCooldown(): number {
    return ultimateCooldownSec(this.run.ctx.data.ultimates.cooldownSec, this.run.itemRt.total('ultimateCooldown'));
  }

  ultimateDef(): UltimateDef {
    const id = this.run.session.player.ultimate.id;
    return this.run.ctx.data.ultimates.ultimates.find((u) => u.id === id)!;
  }

  /** 지금 스킬 오브젝트들과 장착한 액티브(heldMods)가 주는 플레이어 보정 */
  playerMods(): PlayerMods {
    const p = this.run.session.player;
    const held = p.loadout.active.flatMap((id) => {
      const impl = id ? skillImpl(id) : undefined;
      const owned = id ? p.loadout.owned[id] : undefined;
      if (!id || !owned || !impl?.heldMods) return [];
      const def = findSkill(this.run.ctx.data.skills, id);
      const m = impl.heldMods(this.hostFor(id), { def, owned, values: skillValues(def, owned).values });
      return m ? [m] : [];
    });
    return combineMods([...this.skillObjects.flatMap((o) => (o.playerMods ? [o.playerMods()] : [])), ...held]);
  }

  /** 보호막 오브젝트가 피해를 먼저 흡수한다. 남은 피해 */
  absorb(amount: number): number {
    let left = amount;
    for (const o of this.skillObjects) if (o.absorb && left > 0) left = o.absorb(left);
    return left;
  }
}

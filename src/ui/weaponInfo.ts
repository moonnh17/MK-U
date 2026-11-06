/** 무기 한 자루의 설명 줄: 인벤토리와 바닥 무기 안내가 함께 쓴다. */
import type { GameContext } from '../core/context';
import { gradeEnergyMultiplier, gradeMultiplier } from '../systems/damage';
import { weaponStats, type WeaponItem } from '../systems/weapons';

export interface WeaponInfoLine {
  text: string;
  /** 고유 효과·보너스 줄 */
  sig?: boolean;
  /** 이름이 있는 특수공격: 제목과 설명 (도감은 따로 굵은 제목으로 보여 준다) */
  title?: string;
  desc?: string;
}

export function weaponInfoLines(ctx: GameContext, item: WeaponItem): WeaponInfoLine[] {
  const t = ctx.t;
  const d = ctx.data;
  const def = d.weapons.weapons.find((w) => w.id === item.defId)!;
  const st = weaponStats(def, item, gradeMultiplier(item.grade, d.groupMultipliers), gradeEnergyMultiplier(item.grade, d.groupMultipliers));
  const out: WeaponInfoLine[] = [
    { text: t('inventory.weaponStats', { damage: Math.round(st.damage * 10) / 10, interval: Math.round(st.fireIntervalSec * 100) / 100, energy: Math.round(st.energyCost * 100) / 100 }) },
    { text: t('weapon.info.range', { range: def.range, category: t(`weapon.category.${def.category}`) }) },
  ];
  if (st.critChance > 0) out.push({ text: t('weapon.info.crit', { value: Math.round(st.critChance * 100) }) });
  for (const o of item.options) {
    const odef = d.weapons.options.find((x) => x.id === o.id);
    if (odef) out.push({ text: t(odef.nameKey, { value: o.id === 'energyCost' ? o.value : Math.round(o.value * 100) }) });
  }
  // 이름 있는 고유 능력·특수공격은 제목을 붙인다 (도감은 굵은 제목으로 따로)
  const titled = (desc: string): WeaponInfoLine => {
    const title = def.abilityNameKey ? t(def.abilityNameKey) : undefined;
    return { text: title ? t('weapon.sigLine', { title, desc }) : desc, sig: true, title, desc };
  };
  // 능력 이름이 아래 전용 특수 능력(회수·질 낮은 가품·징수·옛 명령)의 것이 아니면, 처음 나오는 고유 능력 줄에 붙인다
  let nameFree = !!def.abilityNameKey && !(def.needle || def.energyRange || def.debt || def.beam || def.twinStar);
  const main = (desc: string): WeaponInfoLine => {
    if (!nameFree) return { text: desc, sig: true };
    nameFree = false;
    return titled(desc);
  };
  if (def.twinStar) {
    const ts = def.twinStar;
    const pc = (v: number) => Math.round(v * 100);
    const title = t(`weapon.passive.${def.id}`);
    const desc = t('weapon.sigDesc.twinStar', { sec: ts.phaseSec, rate1: pc(ts.primary.rateMul - 1), dmg1: pc(ts.primary.damageMul), rate2: pc(1 - ts.eclipse.rateMul), dmg2: pc(ts.eclipse.damageMul) });
    out.push({ text: t('weapon.sigLine', { title, desc }), sig: true, title, desc });
    out.push(titled(t('weapon.sigDesc.twinAlign', { sec: ts.align.sec, dmg: pc(ts.align.damageMul), cd: ts.align.cooldownSec })));
  }
  if (def.pattern.kind === 'meteor') out.push({ text: t('weapon.sigDesc.meteor'), sig: true });
  if (def.pierce) out.push({ text: t('weapon.sigDesc.pierce'), sig: true });
  if (def.flame) out.push({ text: t('weapon.sigDesc.flame'), sig: true });
  if (def.spinUp) out.push(main(t('weapon.sigDesc.spinUp', { n: def.spinUp.maxMul })));
  if (def.charge) out.push({ text: t('weapon.sigDesc.charge', { n: def.charge.damageMul }), sig: true });
  if (def.charge?.critAtMax) out.push({ text: t('weapon.sigDesc.chargeCrit', { v: Math.round(def.charge.critAtMax * 100) }), sig: true });
  if (def.charge?.minRatio) out.push({ text: t('weapon.sigDesc.minCharge'), sig: true });
  if (def.category !== 'blade' && def.pattern.kind === 'lob') out.push({ text: t('weapon.sigDesc.explosive'), sig: true });
  if (def.chargeMoveSpeed) out.push(main(t('weapon.sigDesc.chargeMove', { v: Math.round(def.chargeMoveSpeed * 100) })));
  if (def.meleeShot) out.push(main(t('weapon.sigDesc.meleeShot', { n: def.meleeShot.damageMul, e: Math.round(def.meleeShot.energyCost * gradeEnergyMultiplier(item.grade, d.groupMultipliers) * 100) / 100 })));
  if (def.ricochet) out.push(main(t('weapon.sigDesc.ricochet', { n: def.ricochet.bounces })));
  if (def.bleed) out.push(main(t('weapon.sigDesc.bleed')));
  if (def.selfBuff) out.push(main(t('weapon.sigDesc.gust', { dmg: Math.round(def.selfBuff.damage * 100), sec: def.selfBuff.sec })));
  const sig = def.signature;
  if (def.lunge) out.push({ text: t('weapon.sigDesc.lunge'), sig: true });
  if (def.boomerang) out.push(main(t('weapon.sigDesc.boomerang', { n: def.boomerang.charges })));
  if (def.needle) {
    const n = def.needle;
    out.push({ text: t('weapon.sigDesc.needle', { tick: n.tickSec, line: n.lineDamageMul, max: n.max, life: n.lifeSec }), sig: true });
    out.push(titled(t('weapon.sigDesc.recall', { n: n.recallDamageMul })));
  }
  if (def.energyRange && def.selfDestruct) {
    out.push(titled(t('weapon.sigDesc.bootleg', { min: def.energyRange[0], max: def.energyRange[1], pct: Math.round(def.selfDestruct.chance * 1000) / 10 })));
  }
  if (def.debt) out.push(titled(t('weapon.sigDesc.debt', { n: def.debt.coins, move: Math.round(def.debt.moveSpeed * 100) })));
  if (def.beam) {
    out.push({ text: t('weapon.sigDesc.beam', { gain: def.beam.energyGain }), sig: true });
    out.push(titled(t('weapon.sigDesc.beamCharge', { n: def.beam.stacks, dmg: def.beam.empowered.damageMul })));
  }
  if (sig) {
    const params: Record<string, string | number> = { every: sig.every };
    let key: string = sig.kind === 'laser' && sig.every === 1 ? 'weapon.sigDesc.beam' : `weapon.sigDesc.${sig.kind}`;
    if (sig.kind !== 'space') params.dmg = sig.damageMul;
    if (sig.kind === 'bigSmash') params.rad = sig.radiusMul;
    if (sig.kind === 'chainBolt') {
      params.jumps = sig.jumps;
      if (sig.anyDistance) key = 'weapon.sigDesc.chainBolt.far';
    }
    const desc = t(key, params);
    const title = sig.nameKey ? t(sig.nameKey) : undefined;
    out.push({ text: title ? t('weapon.sigLine', { title, desc }) : desc, sig: true, title, desc });
  }
  const bonus = def.equipBonus;
  if (bonus?.physicalDamage) out.push({ text: t('weapon.bonus.physical', { value: Math.round(bonus.physicalDamage * 100) }), sig: true });
  if (bonus?.rangedDamage) out.push({ text: t('weapon.bonus.ranged', { value: Math.round(bonus.rangedDamage * 100) }), sig: true });
  if (bonus?.meleeDamage) out.push({ text: t('weapon.bonus.melee', { value: Math.round(bonus.meleeDamage * 100) }), sig: true });
  if (bonus?.bossDamage) out.push({ text: t('weapon.bonus.boss', { value: Math.round(bonus.bossDamage * 100) }), sig: true });
  for (const [job, v] of Object.entries(bonus?.jobDamage ?? {})) out.push({ text: t('weapon.bonus.job', { job: t(`job.adv.${job}`), value: Math.round((v ?? 0) * 100) }), sig: true });
  return out;
}

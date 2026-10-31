/** 무기 한 자루의 설명 줄: 인벤토리와 바닥 무기 안내가 함께 쓴다. */
import type { GameContext } from '../core/context';
import { gradeMultiplier } from '../systems/damage';
import { weaponStats, type WeaponItem } from '../systems/weapons';

export interface WeaponInfoLine {
  text: string;
  /** 고유 효과·보너스 줄 */
  sig?: boolean;
}

export function weaponInfoLines(ctx: GameContext, item: WeaponItem): WeaponInfoLine[] {
  const t = ctx.t;
  const d = ctx.data;
  const def = d.weapons.weapons.find((w) => w.id === item.defId)!;
  const st = weaponStats(def, item, gradeMultiplier(item.grade, d.groupMultipliers));
  const out: WeaponInfoLine[] = [
    { text: t('inventory.weaponStats', { damage: Math.round(st.damage * 10) / 10, interval: Math.round(st.fireIntervalSec * 100) / 100, energy: st.energyCost }) },
    { text: t('weapon.info.range', { range: def.range, category: t(`weapon.category.${def.category}`) }) },
  ];
  if (st.critChance > 0) out.push({ text: t('weapon.info.crit', { value: Math.round(st.critChance * 100) }) });
  for (const o of item.options) {
    const odef = d.weapons.options.find((x) => x.id === o.id);
    if (odef) out.push({ text: t(odef.nameKey, { value: o.id === 'energyCost' ? o.value : Math.round(o.value * 100) }) });
  }
  if (def.pattern.kind === 'meteor') out.push({ text: t('weapon.sigDesc.meteor'), sig: true });
  const sig = def.signature;
  if (sig) {
    const params: Record<string, string | number> = { every: sig.every };
    if (sig.kind !== 'space') params.dmg = sig.damageMul;
    if (sig.kind === 'bigSmash') params.rad = sig.radiusMul;
    if (sig.kind === 'chainBolt') params.jumps = sig.jumps;
    out.push({ text: t(sig.kind === 'laser' && sig.every === 1 ? 'weapon.sigDesc.beam' : `weapon.sigDesc.${sig.kind}`, params), sig: true });
  }
  const bonus = def.equipBonus;
  for (const [k, v] of Object.entries(bonus?.stats ?? {})) out.push({ text: t('weapon.bonus.stat', { stat: t(`stat.${k}`), value: v ?? 0 }), sig: true });
  if (bonus?.rangedDamage) out.push({ text: t('weapon.bonus.ranged', { value: Math.round(bonus.rangedDamage * 100) }), sig: true });
  if (bonus?.meleeDamage) out.push({ text: t('weapon.bonus.melee', { value: Math.round(bonus.meleeDamage * 100) }), sig: true });
  if (bonus?.bossDamage) out.push({ text: t('weapon.bonus.boss', { value: Math.round(bonus.bossDamage * 100) }), sig: true });
  for (const [job, v] of Object.entries(bonus?.jobDamage ?? {})) out.push({ text: t('weapon.bonus.job', { job: t(`job.adv.${job}`), value: Math.round((v ?? 0) * 100) }), sig: true });
  return out;
}

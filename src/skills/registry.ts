/**
 * 스킬 id → 발동 함수. 여기 등록된 스킬만 카드로 나온다(로직이 없는 스킬은 카드 풀에서 빠짐).
 * M2-B(헥타르)·M2-C(아크로)에서 나머지를 등록한다.
 */
import { firstLaw } from './firstLaw';
import type { SkillImpl, UltimateImpl } from './host';
import { magiTurret } from './magiTurret';
import { purifyingWings } from './purifyingWings';

const SKILLS: Readonly<Record<string, SkillImpl>> = {
  magiTurret,
  purifyingWings,
};

const ULTIMATES: Readonly<Record<string, UltimateImpl>> = {
  firstLaw,
};

export function skillImpl(id: string): SkillImpl | undefined {
  return SKILLS[id];
}

export function ultimateImpl(id: string): UltimateImpl | undefined {
  return ULTIMATES[id];
}

export function isSkillImplemented(id: string): boolean {
  return id in SKILLS;
}

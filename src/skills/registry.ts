/**
 * 스킬 id → 발동 함수. 여기 등록된 스킬만 카드로 나온다(로직이 없는 스킬은 카드 풀에서 빠짐).
 * M2-C(아크로)에서 나머지를 등록한다.
 */
import { antimatterCannon } from './antimatterCannon';
import { combatDrone } from './combatDrone';
import { firstLaw } from './firstLaw';
import type { PassiveImpl, SkillImpl, UltimateImpl } from './host';
import { magiField } from './magiField';
import { magiMine } from './magiMine';
import { magiTurret } from './magiTurret';
import { purifyingWings } from './purifyingWings';
import { railgun } from './railgun';

const SKILLS: Readonly<Record<string, SkillImpl>> = {
  magiTurret,
  magiMine,
  antimatterCannon,
  magiField,
  railgun,
  purifyingWings,
};

const PASSIVES: Readonly<Record<string, PassiveImpl>> = {
  combatDrone,
};

const ULTIMATES: Readonly<Record<string, UltimateImpl>> = {
  firstLaw,
};

export function skillImpl(id: string): SkillImpl | undefined {
  return SKILLS[id];
}

export function passiveImpl(id: string): PassiveImpl | undefined {
  return PASSIVES[id];
}

export function ultimateImpl(id: string): UltimateImpl | undefined {
  return ULTIMATES[id];
}

export function isSkillImplemented(id: string): boolean {
  return id in SKILLS || id in PASSIVES;
}

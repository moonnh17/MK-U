/**
 * 스킬 id → 발동 함수. 여기 등록된 스킬만 카드로 나온다(로직이 없는 스킬은 카드 풀에서 빠짐).
 */
import { antimatterCannon } from './antimatterCannon';
import { combatDrone } from './combatDrone';
import { experimentalWeapon } from './experimentalWeapon';
import { firstLaw } from './firstLaw';
import type { PassiveImpl, SkillImpl, UltimateImpl } from './host';
import { magiCorruption } from './magiCorruption';
import { magiField } from './magiField';
import { magiMine } from './magiMine';
import { magiTurret } from './magiTurret';
import { mkPrototype } from './mkPrototype';
import { purifyingWings } from './purifyingWings';
import { railgun } from './railgun';
import { reductionist } from './reductionist';
import { singularity } from './singularity';
import { thunderbolt } from './thunderbolt';
import { unstableSubject } from './unstableSubject';

const SKILLS: Readonly<Record<string, SkillImpl>> = {
  magiTurret,
  magiMine,
  antimatterCannon,
  magiField,
  railgun,
  unstableSubject,
  magiCorruption,
  experimentalWeapon,
  purifyingWings,
  mkPrototype,
};

const PASSIVES: Readonly<Record<string, PassiveImpl>> = {
  combatDrone,
  reductionist,
};

const ULTIMATES: Readonly<Record<string, UltimateImpl>> = {
  firstLaw,
  thunderbolt,
  singularity,
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

export function isUltimateImplemented(id: string): boolean {
  return id in ULTIMATES;
}

export function isSkillImplemented(id: string): boolean {
  return id in SKILLS || id in PASSIVES;
}

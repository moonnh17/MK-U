import type { TagId, SpriteRef } from './common';
import type { EnemyRank } from './enemies';

// ---------- 스킬 ----------

export type JobId = 'magiScholar' | 'magiMage' | 'warrior';
/** 계열 태그. warrior는 전사 숙련(전직 전 카드)이다 */
export const SCHOOL_IDS = ['hectar', 'acro', 'warrior', 'barbarian', 'paladin', 'baekon', 'hwigang'] as const;
export type SchoolId = (typeof SCHOOL_IDS)[number];
/** mastery: 슬롯 없이 늘 켜져 있는 전사 숙련 (전직 후에도 유지) */
export type SkillSlotKind = 'active' | 'passive' | 'mastery';
/** 마기법사 백온파 공격의 원소 (태그가 아닌 별도 속성) */
export const ELEMENT_IDS = ['fire', 'ice', 'lightning'] as const;
export type ElementId = (typeof ELEMENT_IDS)[number];
/** 개전 각인 효과 종류. 효과별 수치 이름은 levels 값 키 */
export const IMPRINT_EFFECTS = ['fireDamage', 'staffDamage', 'ignite', 'frost', 'coldAura', 'staticCharge', 'purify', 'overdrive', 'pierceUnfold', 'recoil', 'condense', 'extreme', 'followUp'] as const;
export type ImprintEffect = (typeof IMPRINT_EFFECTS)[number];

/** 마기법사 개전 각인: 액티브 1번 칸 스킬의 각인만 상시 적용 */
export interface ImprintDef {
  nameKey: string;
  descKey: string;
  effect: ImprintEffect;
  /** Lv1~3 수치 (계열 공명이면 배율을 받는다) */
  levels: Record<string, number>[];
  /** 레벨·공명과 상관없는 값 (중첩 수 등) */
  fixed?: Record<string, number>;
}

export interface SkillLevelDef {
  /** 쿨타임(초). 패시브는 0 */
  cooldownSec: number;
  /** 레벨별 수치. 스킬마다 의미가 다르고, 설명 문구의 {이름} 자리에 들어간다 */
  values: Record<string, number>;
}

export interface SkillAwakeningDef {
  nameKey: string;
  descKey: string;
  /** 각성 조건: Lv3 + 이 아이템 보유 */
  requiredItem: string;
  /** 각성 후 카드·인벤토리에 보이는 태그 */
  tags: TagId[];
  cooldownSec: number;
  values: Record<string, number>;
}

export interface SkillDef {
  id: string;
  job: JobId;
  /** 계열 태그 (전직 판정 집계) */
  school: SchoolId;
  kind: SkillSlotKind;
  nameKey: string;
  /** HUD 슬롯에 들어가는 짧은 이름 */
  shortKey: string;
  descKey: string;
  /** 카드·인벤토리에 보이는 태그 */
  tags: TagId[];
  /** 실제 공격(source)별 태그. 피해 계산은 이것만 본다(부모 스킬 태그를 복사하지 않는다) */
  sources: Record<string, TagId[]>;
  /** Lv1~3 */
  levels: SkillLevelDef[];
  /** 없으면 각성하지 않는다 (요구 아이템이 아직 정해지지 않은 스킬) */
  awakening?: SkillAwakeningDef;
  /** 마기법사 개전 각인 */
  imprint?: ImprintDef;
  /** 원소 (백온파) */
  element?: ElementId;
  /** 아이콘 자리 색 */
  color: string;
  /** 스킬이 만드는 오브젝트 모양 */
  sprites: Record<string, SpriteRef>;
}

export interface SkillsData {
  /** 액티브 장착 칸 수 (기획서: 4) */
  activeSlots: number;
  /** 최대 레벨 (기획서: 3) */
  maxLevel: number;
  /** 강적·보스 우선 조준(다연장반입자포·군집지성)에 쓰는 등급별 가중치 */
  targetWeights: Record<EnemyRank, number>;
  skills: SkillDef[];
}

export interface UltimateDef {
  id: string;
  nameKey: string;
  shortKey: string;
  descKey: string;
  tags: TagId[];
  sources: Record<string, TagId[]>;
  /** 학파 궁극기면 그 학파 (궁극기 각성 조건: 이 학파 스킬 각성 수) */
  school?: SchoolId;
  values: Record<string, number>;
  /** 궁극기 각성. 없으면 각성판 없음 */
  awakening?: { requiredItem: string; nameKey: string; shortKey: string; descKey: string; tags: TagId[]; values: Record<string, number> };
  color: string;
  sprites: Record<string, SpriteRef>;
  /** 벼락: 화면 자체가 절단선에서 갈라지는 연출 (기준 해상도 px) */
  spaceCut?: SpaceCutDef;
  /** 케라우노스: 화면 전체가 사선으로 갈라져 미끄러졌다가 봉합되는 연출 */
  rift?: RiftDef;
}

export interface RiftDef {
  /** 사선 기울기 (조준이 왼쪽이면 반대로 기운다) */
  angleDeg: number;
  /** 확 갈라지는 시간, 가장 벌어진 채 멈추는 시간, 서서히 봉합되는 시간 */
  openSec: number;
  holdSec: number;
  sealSec: number;
  /** 틈 반폭, 사선을 따라 어긋나는 양 (기준 해상도 px) */
  gapPx: number;
  slidePx: number;
  rimPx: number;
  /** 하늘에서 떨어지는 벼락이 보이는 시간 */
  boltSec: number;
}

export interface SpaceCutDef {
  /** 예고 동안 선 쪽으로 압축되는 최대 변위 */
  compressPx: number;
  /** 절단 순간 양쪽이 밀려나는 변위 (= 검은 틈의 반폭) */
  shiftPx: number;
  /** 벌어진 틈이 닫히는 시간 */
  closeSec: number;
  /** 변위가 미치는 띠의 반폭 (선에서 이만큼 떨어지면 원래 화면) */
  bandPx: number;
  /** 선 양끝에서 약해지는 구간 */
  edgeFadePx: number;
  /** 틈 가장자리 청백색 빛의 굵기 */
  rimPx: number;
  /** 절단 순간 히트스톱 */
  hitStopSec: number;
  /** 잔상: 푸른 파편 수, 균열 그림이 남는 시간 */
  shards: number;
  afterSec: number;
  /** 벌어지는 동안 양쪽이 절단선을 따라 서로 반대로 미끄러지는 양 */
  slidePx: number;
}

export interface UltimatesData {
  /** 모든 궁극기의 재사용 대기(초). 스킬 쿨타임 감소는 받지 않고, 궁극기 쿨타임 감소(아이템)만 받는다 */
  cooldownSec: number;
  ultimates: UltimateDef[];
}

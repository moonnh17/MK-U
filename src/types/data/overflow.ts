/** 오버플로우 모드 (무한 모드) 데이터 */
import type { GradeId, TagId } from './common';

/** 4장부터 무작위로 뽑는 장 하나 */
export interface OverflowThemeDef {
  id: string;
  /** 표 조회 기준 장(1~3): 타일·음악·엘리트·조우·상자 표·X-2 보스 */
  chapter: number;
  /** 웨이브를 가져올 장 (여러 장이면 섞인다) */
  waveChapters: number[];
  weight: number;
  /** 오버플로우 전용 맵(임시)인지. 표시·통계용 */
  dedicated?: boolean;
  /** 방 바닥 색을 덮는 틴트 (없으면 기준 장 색 그대로) */
  tint?: string;
}

/** 고정 보스 칸. chapter 또는 everyChapters 중 하나 */
export interface OverflowFixedBossDef {
  chapter?: number;
  /** 이 수의 배수인 장 (3의 배수 장 X-5 마기카이저) */
  everyChapters?: number;
  stage: number;
  /** 보스 id. '@theme'이면 그 장(기준 장)의 보스 */
  boss: string;
  /** 한 런에 한 번만 */
  once?: boolean;
}

export interface OverflowScaleDef {
  /** 4장부터 적용. 적 자기 장 → 3장 수준으로 맞추는 배율 */
  tierToChapter3: Record<string, { hp: number; damage: number }>;
  /** 4장부터 장마다 더하는 비율 (4장 = 1번) */
  growthPerChapter: { hp: number; damage: number };
  /** 보스 피해 단계 (본편 스테이지 배율, DECISIONS 2026-11-06) */
  bossDamageTier: Record<string, number>;
  /** 같은 칸 3장 보스에 맞춘 뒤 더 곱하는 체력 (헥타르 미모사: 매우 강하게) */
  bossHpBonus?: Record<string, number>;
}

export interface OverflowData {
  /** 고정 순서로 진행하는 장 수 (1~3장) */
  fixedChapters: number;
  themes: OverflowThemeDef[];
  /** X-2·X-5 보스 풀 (스테이지 번호 → 보스 id) */
  bossPools: Record<string, string[]>;
  fixedBosses: OverflowFixedBossDef[];
  /** 아직 전투가 없는 보스 → 임시로 대신 나올 보스 */
  placeholderBosses: Record<string, string>;
  /** 보스 표시 이름 키 (임시 보스가 대신 나와도 이름은 이것) */
  bossNameKeys: Record<string, string>;
  scale: OverflowScaleDef;
  /** 실험장 오버플로우 포털 색 */
  portalColor: string;
  /** 테마 틴트를 방 바닥 위에 덮는 불투명도 */
  themeTintAlpha: number;
  /** 디버그 스테이지 이동 목록에 더 보일 장 수 */
  debugExtraChapters: number;
  evolution: EvolutionData;
  mimosa: MimosaData;
  acro: AcroData;
  kaiserLearning: KaiserLearningData;
}

export interface MimosaPatternDef {
  id: 'drones' | 'gridDrop' | 'field' | 'scan' | 'call' | 'gridShift' | 'pulse' | 'satellite' | 'laser' | 'purge' | 'sample';
  phases: number[];
  weight: number;
  cooldownSec: number;
  durationSec: number;
  /** 방 전체를 노리는 광범위 공격 (예고 warnSec 1초 이상, 안전 구역 보장) */
  wide?: boolean;
  warnSec?: number;
}

export interface MimosaTamperTiming {
  quietSec: number;
  telegraphSec: number;
  activeSec: number;
  rollbackSec: number;
}

/** 4-5 헥타르 학파 연구원 미모사 (제안, 수치 임시) */
export interface MimosaData {
  enemyId: string;
  /** 체력 비율 문턱 (2페이즈·3페이즈) */
  phases: number[];
  firstDelaySec: number;
  gapSec: Record<string, number>;
  transitionSec: number;
  grid: { cellPx: number; dropRatio: number; dropWarnSec: number; dropDamage: number; shiftBandCols: number; shiftSteps: number; shiftWarnSec: number; shiftGapSec: number; shiftDamage: number; purgeSafeCells: number; purgeWarnSec: number; purgeHighlightSec: number; purgeDamage: number; color: string; lineAlpha: number };
  scan: { width: number; speedSlow: number; speedFast: number; gaps: number; gapPx: number; warnSecSlow: number; warnSecFast: number; damage: number; color: string };
  drones: { countByPhase: Record<string, number>; orbitRadius: number; orbitSec: number; spinPerSec: number; volleys: number; volleyGapSec: number; shotSpeed: number; shotRange: number; damage: number; spriteKey: string; size: number };
  field: { hp: number; takenMul: number; countByPhase: Record<string, number>; offset: number; ringSpeed: number; ringThickness: number; ringDamage: number; pushPx: number; color: string };
  pulse: { rings: number; gapSec: number; thickness: number; moveSec: number; toR: number; gapDeg: number; damage: number; warnSec: number; color: string };
  satellite: { count: number; maxCount: number; radius: number; warnSec: number; stepSec: number; damage: number; color: string };
  laser: { covers: number; coverW: number; coverH: number; chargeSec: number; damage: number; color: string; coverColor: string };
  call: { enemies: string[]; maxAlive: number };
  patterns: MimosaPatternDef[];
  tamper: { patchNote: MimosaTamperTiming & { rules: ('invertX' | 'invertY' | 'invertXY' | 'gravity')[] }; slotShuffle: MimosaTamperTiming; computeError: MimosaTamperTiming };
  /** 페이즈 → 변조 사이 간격 [최소, 최대] */
  tamperEverySec: Record<string, [number, number]>;
  glitch: { glyphs: string; nameRatio: number; jitterPx: number; jitterPxReduced: number; flickerHz: number; flickerHzReduced: number; alphaMin: number; lines: number };
  observation: { groups: Record<string, 'hp' | 'attack' | 'speed'>; perStack: { hp: number; attack: number; speed: number }; max: { hp: number; attack: number; speed: number } };
  intro: { breakSec: number; portalSec: number; descendSec: number; topOffset: number; bandSec: number; debris: number; color: string; portalKey: string; portalPx: number };
  death: { cracks: number; sec: number; color: string };
  color: string;
  /** 패턴 그림 (art.json 키)과 화면 크기(px) */
  /** 실험 샘플 투여 (디버프 아이템): 페이즈별 개수, 예고·고임 시간, 반경, 피해, 날아가는 높이, 아이콘 크기 */
  sample: { count: Record<string, number>; warnSec: number; lingerSec: number; radius: number; damage: number; flightPx: number; iconPx: number; color: string };
  art: {
    drone: string; shot: string; cube: string; slam: string; beam: string; reticle: string; cover: string; dome: string; emp: string; warp: string; rune: string;
    dronePx: number; cubePx: number; slamPx: number; beamGap: number; beamPx: number; reticlePx: number; maxGridFx: number; domePx: number; empPx: number; warpPx: number; runePx: number;
  };
}

/** 진화 효과 수치 (중첩 n마다: 배율 항목은 (1+값)^n, 나머지는 값 × n) */
export interface EvolutionEffects {
  hpMul?: number;
  moveMul?: number;
  damageMul?: number;
  attackSpeedMul?: number;
  /** 방 적 수 배율 (군체 증식) */
  countMul?: number;
  defense?: number;
  knockbackRes?: number;
  /** regenEverySec마다 최대 체력 비율 */
  regenPct?: number;
  explodeDamage?: number;
  splitChance?: number;
  /** 주변 적 사망 시 공격·이동 강화 */
  predatorMul?: number;
  /** 치명상을 버티고 남는 체력 비율 */
  immortalHp?: number;
  /** 과부하 중 공격력·공격속도 증가 */
  overloadMul?: number;
  /** 변이 융합: 다른 공용 진화 중첩을 (1 + fusionPerStack × 이 값 × 중첩)배로 */
  fusion?: number;
  adaptPerHit?: number;
  adaptMax?: number;
}

export type EvolutionTarget = 'common' | 'boss';

export interface EvolutionDef {
  id: string;
  /** common: 일반 적·엘리트 / boss: 보스·히든보스 */
  target: EvolutionTarget;
  grade: Exclude<GradeId, 'mythic' | 'unique'>;
  effects: EvolutionEffects;
  explode?: { radius: number; warnSec: number; color: string };
  split?: { count: number; hpMul: number; scale: number };
  predator?: { radius: number; sec: number; color: string };
  overload?: { cycleSec: number; activeSec: number; color: string };
}

/** 유니크 진화: 고르면 그 변형 적이 모든 맵에 추가된다 */
export interface EvolutionUniqueDef {
  id: string;
  enemy: string;
  /** 바탕 종 */
  base: string;
}

export type EvolutionRewardDef =
  | { id: string; kind: 'coins'; amount: number }
  | { id: string; kind: 'heal'; amount: number }
  | { id: string; kind: 'skillLevelUp'; amount: number }
  | { id: string; kind: 'skillCard'; amount: number }
  | { id: string; kind: 'crystals'; amount: number }
  | { id: string; kind: 'weaponChest'; tier: string }
  | { id: string; kind: 'itemChest'; weights: Partial<Record<GradeId, number>> }
  | { id: string; kind: 'item'; weights: Partial<Record<GradeId, number>> };

export interface EvolutionData {
  gradeWeights: Record<'common' | 'rare' | 'legendary' | 'unique', number>;
  cardCount: number;
  maxStacks: number;
  /** 공용 진화를 받지 않는 적 */
  commonExempt: string[];
  fusionPerStack: number;
  /** maxWave: 군체 증식·유니크를 더한 뒤 한 웨이브 적 수 상한 (모바일 부하) */
  caps: { defense: number; regenPerSec: number; knockbackRes: number; splitChance: number; splitAlive: number; evoBlasts: number; evoBullets: number; maxWave: number };
  evolutions: EvolutionDef[];
  regenEverySec: number;
  uniques: EvolutionUniqueDef[];
  /** 전투 칸 웨이브마다 고른 유니크 변형이 한 마리 더해질 확률 */
  uniqueSpawnChance: number;
  /** 소진 대비: 공용·보스 진화가 모두 최대면 무한히 쌓는 카드 (일반 적 대상) */
  overloadCard: { id: string; effects: EvolutionEffects };
  rewards: Record<'common' | 'rare' | 'legendary' | 'unique', EvolutionRewardDef[]>;
  /** 다음 스테이지 시작방에 떨어뜨리는 상자 간격 */
  dropOffsetPx: number;
}

export type AcroPatternId = 'cut' | 'shards' | 'brand' | 'rewind' | 'summon' | 'crossCut' | 'riftChain';

export interface AcroPatternDef {
  id: AcroPatternId;
  phases: number[];
  weight: number;
  cooldownSec: number;
  durationSec: number;
}

/** 7-5 아크로 학파 연구원 미모사 (제안, 수치 임시). 시간·공간에 손대는 정체 공개 보스 */
export interface AcroData {
  enemyId: string;
  /** 체력 비율 문턱 (2페이즈·3페이즈) */
  phases: number[];
  firstDelaySec: number;
  gapSec: Record<string, number>;
  transitionSec: number;
  color: string;
  intro: { riftSec: number; appearSec: number; bandSec: number; riftPx: number };
  /** 순간이동: 사라짐·나타남 시간, 플레이어와의 거리, 방 가장자리 여백 */
  blink: { vanishSec: number; appearSec: number; minDistPx: number; maxDistPx: number; edgePx: number };
  patterns: AcroPatternDef[];
  /** 공간 베기: 플레이어를 지나는 선 n개 */
  cut: { linesByPhase: Record<string, number>; warnSec: number; widthPx: number; damage: number; lengthPx: number; stepSec: number };
  shards: { countByPhase: Record<string, number>; waves: number; waveGapSec: number; speed: number; range: number; damage: number; gapDeg: number };
  /** 각인: 맞으면 디버프 아이템 (아크로) */
  brand: { countByPhase: Record<string, number>; warnSec: number; stepSec: number; radius: number; damage: number; spreadPx: number };
  /** 되감기: 퍼진 탄이 멈췄다가 미모사에게 되돌아온다 */
  rewind: { count: number; speed: number; range: number; freezeSec: number; returnSpeed: number; damage: number };
  /** 맵 곳곳 소환: 다른 칸으로 함께 넘어가 그 장(테마)의 잡몹과 보스를 부른다 */
  summon: {
    normalsByPhase: Record<string, number>;
    bossHpMul: number;
    bossDamageMul: number;
    timeoutSec: number;
    hopSec: number;
    themeChapters: number[];
    excludeBosses: string[];
    overlayAlpha: number;
    /** 소환체가 있는 동안 미모사 받는 피해 배율 */
    guardMul: number;
    attackGapSec: number;
    spreadPx: number;
  };
  /** 2→3 전환: 맵 곳곳에서 합을 겨룬다 (점점 빨라지고 카메라가 멀어진다) */
  clash: { hops: number; startGapSec: number; endGapSec: number; hitstopSec: number; zoomTo: number; flashAlpha: number; holdSec: number; breakSec: number };
  /** 3페이즈 무너진 붉은 공간 */
  redSpace: { floorKey: string; /** 바닥을 어둡게 (위험 표시가 잘 보이게) */ floorTint: string; voidColor: string; edgeColor: string; rubble: number; rubbleColor: string; voidPad: number };
  crossCut: { lines: number; warnSec: number; widthPx: number; damage: number; lengthPx: number };
  riftChain: { blinks: number; gapSec: number; ringR: number; ringSec: number; ringThickness: number; damage: number; gapDeg: number };
  art: { blink: string; blinkRing: string; slash: string; shard: string; mark: string; burst: string; portal: string; implode: string; blinkPx: number; slashPx: number; markPx: number; burstPx: number; portalPx: number };
}

/** 오버플로우 마기카이저 학습 변형 (제안, 임시): 많이 쓴 계열의 피해를 덜 받고 맞서는 반응이 붙는다 */
export interface KaiserVariantDef {
  id: string;
  /** 이 태그들을 맞힌 수의 합으로 고른다 */
  tags: TagId[];
  nameKey: string;
  /** 태그별 받는 피해 배율 */
  takenMul: Partial<Record<TagId, number>>;
  /** 원거리 반사: 맞을 때 chance로 플레이어에게 탄을 되쏜다 */
  reflect?: { chance: number; speed: number; range: number; damage: number };
  /** 충격 갑주: 근접으로 맞으면 (재사용 대기) 둘레에 충격파 고리 + 밀어냄 */
  shock?: { cooldownSec: number; radius: number; thickness: number; damage: number; pushPx: number };
  /** 마기 흡수: 마기·기술로 hits번 맞으면 사방으로 흡수한 마기를 방출 */
  absorb?: { hits: number; count: number; speed: number; range: number; damage: number };
}

export interface KaiserLearningData {
  bossId: string;
  /** 이만큼 맞혀야 변형이 붙는다 */
  minHits: number;
  color: string;
  variants: KaiserVariantDef[];
}

/**
 * 데이터(JSON) 스키마. 수치·확률·정의는 전부 src/data/*.json에 있고 여기서 형태를 정한다.
 * 이름·설명은 직접 문자열이 아니라 text/ko.json의 키(nameKey, descKey)로 참조한다.
 */

// ---------- 공통 ----------

/** [min, max] 정수 범위 (양끝 포함) */
export type IntRange = readonly [number, number];

/** 기획서 태그 표의 11종 (표 제목은 12종이지만 나열된 것은 11개) */
export const TAG_IDS = [
  'physical',
  'magic',
  'tech',
  'chance',
  'charging',
  'targeted',
  'ranged',
  'melee',
  'buff',
  'space',
  'bleed',
] as const;
export type TagId = (typeof TAG_IDS)[number];

export const STAT_IDS = ['strength', 'toughness', 'agility', 'intelligence', 'magiPower', 'willpower'] as const;
export type StatId = (typeof STAT_IDS)[number];

export const GRADE_IDS = ['common', 'rare', 'legendary', 'unique', 'mythic'] as const;
export type GradeId = (typeof GRADE_IDS)[number];

/** 도형 플레이스홀더. 나중에 도트 아트로 바꿀 때 spriteKey만 교체한다. */
export interface SpriteRef {
  spriteKey: string;
  /** 플레이스홀더 색 (0xRRGGBB 문자열, 예: "#ff8800") */
  color: string;
  /** 플레이스홀더 크기(px, 기준 해상도) */
  size: number;
}

// ---------- 스탯 ----------

export interface StatDef {
  id: StatId;
  nameKey: string;
  descKey: string;
  /** 이 스탯이 보정하는 태그 */
  linkedTags: TagId[];
}

export interface StatsData {
  /** 시작 스탯 (기획서: 전부 10) */
  startValue: number;
  stats: StatDef[];
}

// ---------- 태그 ----------

/** 스탯이 기준점을 넘는 1포인트당 percentPerPoint씩, 최대 cap까지 더한다. */
export interface LinearStatScaling {
  kind: 'linearStat';
  stat: StatId;
  /** 이 값을 넘는 만큼만 보정 (기획서: 10) */
  pivot: number;
  /** 1포인트당 증가율 (0.04 = +4%) */
  perPoint: number;
  /** 증가율 상한 (1.5 = +150%) */
  cap: number;
}

/** min(상한, 기본 × base^(스탯 − pivot)) */
export interface ExponentialChanceScaling {
  kind: 'exponentialChance';
  stat: StatId;
  pivot: number;
  base: number;
  /** 결과별 상한 (예: success 0.98, greatSuccess 0.6) */
  caps: Record<string, number>;
}

export interface SpaceRule {
  kind: 'space';
  /** 일반 몬스터: 즉사 */
  normal: 'instakill';
  /** 엘리트: 최대 HP 비율 피해 */
  eliteMaxHpRatio: number;
  /** 집행자·집정관: 최대 HP 비율 피해 */
  championMaxHpRatio: number;
  /** 보스·히든보스: 공간격 피해 배율 */
  bossDamageMultiplier: number;
}

export interface BleedRule {
  kind: 'bleed';
  durationSec: number;
  tickIntervalSec: number;
  maxStacks: number;
  refreshOnReapply: boolean;
}

export interface NoScaling {
  kind: 'none';
}

export type TagRule = LinearStatScaling | ExponentialChanceScaling | SpaceRule | BleedRule | NoScaling;

/** 피해 계산에서 태그가 속하는 단계 */
export type TagDamageGroup =
  /** 물리·마기·기술: 보정을 더한 뒤 한 번 곱한다 */
  | 'attribute'
  /** 근접·원거리: 별도 단계에서 곱한다 */
  | 'range'
  /** 피해 배율과 무관 */
  | 'none';

export interface TagDef {
  id: TagId;
  nameKey: string;
  descKey: string;
  damageGroup: TagDamageGroup;
  rule: TagRule;
  /** 배지 색 */
  badgeColor: string;
}

export interface TagsData {
  tags: TagDef[];
}

// ---------- 등급·그룹 배율 ----------

export interface GradeDef {
  id: GradeId;
  nameKey: string;
  color: string;
  /** 기준 피해 배율 (무기·아이템 공통 그룹 배율) */
  damageMultiplier: number;
  /** 무작위 추가 옵션 개수 */
  randomOptions: number;
}

export interface GroupMultipliersData {
  /** 초기값은 임시. 밸런스 조정 시 이 표만 바꾼다. */
  grades: GradeDef[];
}

// ---------- 무기 ----------

export type WeaponCategory = 'gun' | 'blade';

export type WeaponPattern =
  | { kind: 'single' }
  | { kind: 'spread'; pellets: IntRange; spreadDeg: number }
  | { kind: 'arc'; arcDeg: number; radius: number };

export interface WeaponDef extends SpriteRef {
  id: string;
  nameKey: string;
  category: WeaponCategory;
  grade: GradeId;
  tags: TagId[];
  /** 기준 피해 (그룹 배율 적용 전) */
  baseDamage: number;
  /** 연사 간격(초) */
  fireIntervalSec: number;
  /** 1회 공격당 에너지 소모 */
  energyCost: number;
  pattern: WeaponPattern;
  /** 총: 탄속(px/s). 칼은 0 */
  projectileSpeed: number;
  /** 총: 탄 사거리(px). 칼: 베기 반지름과 같게 둔다 */
  range: number;
  /** 칼: 적의 일반 투사체를 지우는지 */
  cutsProjectiles: boolean;
  /** 상점·드롭에서 나올 수 있는지 (테스트 전용 무기 등은 false) */
  droppable: boolean;
}

export interface WeaponsData {
  startWeapon: string;
  /** 총알 모양 (공통) */
  projectile: SpriteRef;
  weapons: WeaponDef[];
}

// ---------- 적 ----------

/** chase: 직선 추격 / idle: 움직이지 않음(보스방 임시 더미) */
export type EnemyAi = 'chase' | 'idle';

export type EnemyRank = 'normal' | 'elite' | 'champion' | 'boss' | 'hiddenBoss';

export interface EnemyDef extends SpriteRef {
  id: string;
  nameKey: string;
  chapter: number;
  rank: EnemyRank;
  ai: EnemyAi;
  maxHp: number;
  /** px/s */
  moveSpeed: number;
  contactDamage: number;
  /** 접촉 피해 간격(초) */
  contactIntervalSec: number;
  /** 처치 시 에너지 구슬 개수 범위 */
  energyOrbs: IntRange;
  /** 처치 시 코인 개수 범위 */
  coins: IntRange;
}

export interface EnemiesData {
  enemies: EnemyDef[];
}

// ---------- 스테이지·방 생성 ----------

export type RoomKind = 'startRoom' | 'combatRoom' | 'encounterRoom' | 'bossRoom' | 'exitRoom';

export type StageKind = 'normal' | 'boss';

export interface StageRoomRule {
  combatRooms: IntRange;
  encounterRooms: number;
  bossRooms: number;
  /** 별도 출구 방 수. 보스 스테이지는 보스방이 출구를 겸하므로 0 */
  exitRooms: number;
  /** 시작방에서 가장 먼 '끝 방'의 종류 */
  lastRoom: RoomKind;
}

export interface MapgenData {
  chapters: number;
  stagesPerChapter: number;
  /** 보스 스테이지 번호 (챕터 내 1부터) */
  bossStages: number[];
  /** 방을 놓는 격자 크기 */
  grid: { width: number; height: number };
  tileSize: number;
  /** 방 하나의 크기(타일). 화면 한 칸에 들어가게 잡는다 */
  roomTiles: { width: number; height: number };
  corridor: { lengthTiles: number; widthTiles: number };
  stageRules: Record<StageKind, StageRoomRule>;
  /** 전투 칸 웨이브 수 */
  combatWaves: IntRange;
  /** 보스방 임시 표적 (보스 패턴은 M3) */
  bossPlaceholderEnemy: string;
  /** 1-1 시작방 바닥에 놓는 테스트 무기 (`?testWeapons=0`으로 끔) */
  testWeapons: string[];
  /** 문 */
  door: { color: string; openColor: string };
  props: { exitPortal: SpriteRef; encounterCore: SpriteRef };
  /** 플레이어가 방 안쪽으로 이만큼(px) 들어와야 문이 잠긴다 */
  lockInsetPx: number;
}

export interface PickupsData {
  /** 이 거리 안이면 플레이어에게 끌려온다(px) */
  magnetRadius: number;
  magnetSpeed: number;
  /** 획득 거리(px) */
  collectRadius: number;
  /** 드롭 시 흩어지는 반지름(px) */
  scatterRadius: number;
  energyOrb: SpriteRef;
  coin: SpriteRef & { value: number };
  /** 바닥 무기와 상호작용 가능한 거리(px) */
  interactRadius: number;
}

export interface WaveSpawn {
  enemy: string;
  count: IntRange;
}

export interface WaveTemplate {
  id: string;
  chapter: number;
  weight: number;
  spawns: WaveSpawn[];
}

export interface WavesData {
  /** 다음 웨이브까지 대기(초) */
  waveDelaySec: number;
  /** 적이 나타난 뒤 공격·접촉 피해가 없는 시간(초) */
  spawnWarnSec: number;
  /** 플레이어와 최소 이만큼 떨어진 곳에 소환(px) */
  spawnMinPlayerDistance: number;
  waves: WaveTemplate[];
}

// ---------- 플레이어 ----------

export interface PlayerData extends SpriteRef {
  maxHp: number;
  /** px/s */
  moveSpeed: number;
  /** 피격 후 무적(초) */
  hurtInvulnSec: number;
  /** 무적 중 깜빡임 간격(초) */
  blinkIntervalSec: number;
  /** 무기를 몸에서 이만큼 떨어뜨려 그린다(px) */
  weaponOffset: number;
  /** 보호막 최대치. 규칙은 나중에 정한다(M1은 바 자리만) */
  shieldMax: number;
  energy: { max: number; start: number; orbValue: number };
}

// ---------- UI ----------

export interface MobileLayoutData {
  /** 화면 가장자리 최소 여백(dp) */
  edgeMarginDp: number;
  attackDp: number;
  skillDp: number;
  ultimateDp: number;
  swapDp: number;
  bagDp: number;
  pauseDp: number;
  /** 버튼 사이 간격(dp) */
  gapDp: number;
  /** 스킬 4개 부채꼴 각도(도, 화면 좌표: 180=왼쪽, 270=위) */
  skillFanDeg: [number, number, number, number];
  /** 궁극기 방향(도). 스킬 부채꼴 바깥쪽에 놓인다 */
  ultimateDeg: number;
  minimapTab: { widthDp: number; heightDp: number };
  joystick: { radiusDp: number; knobDp: number; deadZone: number };
}

export interface HudLayoutData {
  margin: number;
  fontSize: number;
  bars: {
    width: number;
    height: number;
    gap: number;
    hpColor: string;
    shieldColor: string;
    energyColor: string;
    backColor: string;
  };
  minimap: {
    width: number;
    height: number;
    backColor: string;
    borderColor: string;
    maxCell: number;
    cellGap: number;
    roomColor: string;
    visitedColor: string;
    currentColor: string;
    corridorColor: string;
  };
  skillbar: { slotSize: number; gap: number; groupGap: number; disabledAlpha: number };
  weapons: { mainWidth: number; mainHeight: number; subWidth: number; subHeight: number; gap: number };
  /** 사망·클리어 화면의 다시 시작 버튼 */
  overlayButton: { width: number; height: number };
}

export interface UiData {
  baseWidth: number;
  baseHeight: number;
  backgroundColor: string;
  /** HUD 배치 (기준 해상도 px) */
  hud: HudLayoutData;
  room: { floorColor: string; wallColor: string; corridorColor: string };
  /** 칼 베기 이펙트 표시 시간(초) */
  slashFxSec: number;
  /** 카메라 따라가기 보간(0~1) */
  cameraLerp: number;
  toastSec: number;
  /** 에너지 부족 시 HUD 에너지 바를 빨갛게 표시하는 시간(초) */
  energyEmptyFlashSec: number;
  mobile: MobileLayoutData;
}

// ---------- 텍스트 ----------

export type TextTable = Record<string, string>;

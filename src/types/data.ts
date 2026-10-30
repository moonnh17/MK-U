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
  /** 세로 크기가 다를 때(px). 없으면 size */
  height?: number;
}

// ---------- 스탯 ----------

export interface StatDef {
  id: StatId;
  nameKey: string;
  descKey: string;
  /** 이 스탯이 보정하는 태그 */
  linkedTags: TagId[];
}

/** 스탯 하나로 정하는 효과: 기준점을 넘는 1포인트당 perPoint, 최대 cap */
export interface StatRule {
  stat: StatId;
  pivot: number;
  perPoint: number;
  cap: number;
}

/** 스탯 표의 태그 외 효과 */
export const STAT_EFFECT_IDS = ['maxHp', 'damageReduction', 'moveSpeed', 'skillArea', 'energyGain', 'coinGain', 'mentalResist'] as const;
export type StatEffectId = (typeof STAT_EFFECT_IDS)[number];

export interface StatsData {
  /** 시작 스탯 (기획서: 전부 10) */
  startValue: number;
  stats: StatDef[];
  /** maxHp는 더하는 값, 나머지는 비율(0.01 = 1%) */
  effects: Record<StatEffectId, StatRule>;
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

/** 아이템 효과 그룹. 실제 값 = 기준값 × 그룹 배율 */
export type ItemGroupId = 'statFlat' | 'hpFlat' | 'damagePct' | 'procDamage' | 'area' | 'cooldown';

export interface GroupMultipliersData {
  /** 초기값은 임시. 밸런스 조정 시 이 표만 바꾼다. */
  grades: GradeDef[];
  /** 아이템 효과 그룹 배율 (기획서 '수치를 유동적으로 두는 방법') */
  itemGroups: Record<ItemGroupId, number>;
}

// ---------- 무기 ----------

/** gun: 총 / blade: 칼(둔기 포함) / staff: 마법 지팡이(탄을 쏘고 에너지를 쓴다, 아비오르의 지팡이) */
export type WeaponCategory = 'gun' | 'blade' | 'staff';

/**
 * 유니크 무기의 고유 효과: every번째 공격마다 발동.
 * bigSmash: 내려찍기 피해·범위 증가(네메아의 종말) / laser: 탄 대신 직선 레이저 / space: 그 공격이 공간격
 */
export type WeaponSignature =
  | { every: number; kind: 'bigSmash'; damageMul: number; radiusMul: number }
  | { every: number; kind: 'laser'; damageMul: number; length: number; width: number }
  | { every: number; kind: 'space' };

/**
 * single: 한 발(jitterDeg면 매번 조금씩 흩어짐) / spread: 부채꼴 여러 발 / arc: 부채꼴 베기
 * lob: 목표 지점에 떨어져 터지는 폭발탄(자해 없음) / line: 직선 찌르기(관통) / smash: 앞쪽 원 내려찍기
 */
export type WeaponPattern =
  | { kind: 'single'; jitterDeg?: number }
  | { kind: 'spread'; pellets: IntRange; spreadDeg: number }
  | { kind: 'arc'; arcDeg: number; radius: number }
  | { kind: 'lob'; radius: number }
  | { kind: 'line'; length: number; width: number }
  | { kind: 'smash'; reach: number; radius: number }
  /** 지팡이: 가까운 적을 따라 휘는 탄 (turnRate rad/s) */
  | { kind: 'homing'; turnRate: number };

/** 무기 무작위 옵션 (레어 1개·전설 2개) */
export interface WeaponOptionDef {
  id: 'crit' | 'projectileSpeed' | 'energyCost' | 'attackSpeed';
  nameKey: string;
  /** 값 범위 [최소, 최대]. crit = 확률, projectileSpeed·attackSpeed = 비율, energyCost = 줄어드는 양 */
  value: [number, number];
  /** 붙을 수 있는 분류 */
  categories: WeaponCategory[];
  /** 에너지를 쓰는 무기에만 */
  needsEnergy?: boolean;
}

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
  /** 공격 소리 (없으면 분류·탄 모양으로) */
  sfx?: string;
  /** 총: 탄속(px/s). 칼은 0 */
  projectileSpeed: number;
  /** 총: 탄 사거리(px). 칼: 베기 반지름과 같게 둔다 */
  range: number;
  /** 칼: 적의 일반 투사체를 지우는지 */
  cutsProjectiles: boolean;
  /** 상점·드롭에서 나올 수 있는지 (신화·유니크처럼 따로 판정하는 무기는 false) */
  droppable: boolean;
  /** 총: 탄이 적을 몇 마리 더 뚫는지 */
  pierce?: number;
  /** 칼: 누르고 있으면 차지(대검). 놓으면 휘두른다 */
  charge?: { maxSec: number; damageMul: number; radiusMul: number };
  /** 맞은 적을 밀어낸다(해머). 거대 엘리트·보스는 면역 */
  knockback?: { distance: number; sec: number };
  /** 들고 있는 동안 효과 (신궁 환디) */
  equipBonus?: { stats?: Partial<Record<StatId, number>>; rangedDamage?: number; meleeDamage?: number };
  /** 유니크 고유 효과 */
  signature?: WeaponSignature;
}

export interface WeaponsData {
  startWeapon: string;
  /** 맨손일 때 나가는 공격 (슬롯에 들지 않고 버릴 수 없다) */
  fistWeapon: string;
  /** 총알 모양 (공통) */
  projectile: SpriteRef;
  /** 치명타 피해 배율 */
  critMultiplier: number;
  options: WeaponOptionDef[];
  weapons: WeaponDef[];
}

// ---------- 적 ----------

/** chase: 직선 추격 / idle: 움직이지 않음(보스방 임시 더미) / boss: 보스 패턴(bosses.json)이 움직인다 */
export type EnemyAi = 'chase' | 'idle' | 'boss';

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
  /** 공격 (목록 순서대로 우선). 없으면 추격·접촉만 */
  attacks?: EnemyAttackDef[];
  /** 보스가 부르는 적(분신). 챕터 로스터·웨이브에 들지 않는다 */
  summon?: boolean;
  /** 원거리 적: 플레이어와 이 거리를 유지한다 */
  keepDistance?: number;
  trail?: EnemyTrailDef;
  /** 집정관: 같은 방에서 죽은 적의 최대 체력을 흡수해 단계가 오른다 */
  absorb?: ArchonAbsorbDef;
}

/** 집정관 흡수 단계. stages[i]: i+1단계가 되는 누적 흡수량과 그 단계의 배율 */
export interface ArchonAbsorbDef {
  stages: { absorb: number; hpMul: number; damageMul: number; haloRadius: number }[];
  haloColor: string;
}

/**
 * 일반 적·엘리트의 공격. 예고(windup) → 실행(act) → 후딜(recover).
 * lunge: 예고선 방향으로 돌진, 돌진 중 닿으면 피해 / slam: 예고 원 자리에 강타
 * burst: 조준선 → 조준탄 여러 발 (헥타르 전투원) / puddle: 플레이어 자리 예고 원 → 지속 피해 장판 (어느 기억)
 * fan: 부채꼴 탄막 (고대인) / rope: 밧줄 → 끌어당김 → 도끼 강타 (집행자) / snipe: 따라오는 조준선 → 고정 → 직선 레이저 (집정관)
 */
export interface EnemyAttackDef {
  id: string;
  kind: 'lunge' | 'slam' | 'burst' | 'puddle' | 'fan' | 'rope' | 'snipe';
  triggerRange: number;
  windupSec: number;
  actSec: number;
  recoverSec: number;
  cooldownSec: number;
  damage: number;
  /** lunge: 돌진 속도(px/s) */
  speed?: number;
  /** slam: 강타 반지름 */
  radius?: number;
  /** slam: 몸에서 강타 중심까지 최대 거리 */
  reach?: number;
  /** lunge: 벽에 부딪히면 이 시간 기절, 그동안 받는 피해 ×stunTakenMul (마기갑충) */
  wallStunSec?: number;
  stunTakenMul?: number;
  /** burst: 발 수·간격·탄속·사거리 */
  shots?: number;
  shotGapSec?: number;
  range?: number;
  /** burst: 같은 방의 같은 적이 이 거리 안이면 함께 조준을 시작한다 (전술 연계) */
  linkRadius?: number;
  /** puddle: 장판 지속·피해 간격 (반지름은 radius) */
  liveSec?: number;
  tickSec?: number;
  /** lunge: 연속 돌진 총 횟수 범위와 이어지는 돌진의 예고 (증오의 파편) */
  chain?: IntRange;
  chainWindupSec?: number;
  /** fan: 부채꼴 각도 (발 수는 shots) */
  spreadDeg?: number;
  /** rope: 끌어당기는 속도, 끌려온 뒤 도끼까지, 도끼 부채꼴(반지름은 radius)·피해 */
  pullSpeed?: number;
  axeDelaySec?: number;
  arcDeg?: number;
  axeDamage?: number;
  /** snipe: 예고 끝 이 시간 동안 조준선이 고정된다, 레이저 폭 (길이는 range) */
  lockSec?: number;
  width?: number;
}

/** 지나간 자리에 남기는 장판 (어느 기억) */
export interface EnemyTrailDef {
  everyPx: number;
  radius: number;
  liveSec: number;
  damage: number;
  tickSec: number;
}

export interface EliteDef {
  id: string;
  nameKey: string;
  /** 머리 위 아이콘 글자 키 (ko.json) */
  iconKey: string;
  color: string;
  weight: number;
  moveSpeedMul?: number;
  attackSpeedMul?: number;
  damageTakenMul?: number;
  /** 넉백 면역 (넉백은 아직 없음, 표시만) */
  knockbackImmune?: boolean;
  /** 엘리트가 더하는 공격 (신속: 도약) */
  extraAttacks?: EnemyAttackDef[];
  /** 폭발: 사망 시 지연 폭발 */
  deathBlast?: { delaySec: number; radius: number; damage: number };
  /** 표시: outline(두꺼운 외곽선) / afterimage(잔상) / blink(깜빡임) */
  look: 'outline' | 'afterimage' | 'blink';
}

export interface ElitesData {
  /** 공통: 크기·체력 배율, 처치 보상 추가 */
  common: { scale: number; hpMul: number; bonusEnergyOrbs: IntRange; bonusCoins: IntRange };
  /** 스테이지 번호(챕터 안) → 전투 칸 웨이브당 엘리트 수 범위 */
  countByStage: Record<string, IntRange>;
  /** 챕터가 오를 때마다 더할 수 */
  perChapterBonus: number;
  elites: EliteDef[];
}

/** 보스 패턴 하나. values의 키Enraged가 있으면 강화 단계에서 그 값을 쓴다 */
export interface BossPatternDef {
  id: string;
  weight: number;
  cooldownSec: number;
  /** 보스가 이 패턴에 묶여 있는 시간 */
  durationSec: number;
  /** 1 = 처음부터, 2 = 강화 단계부터 */
  phase: 1 | 2;
  maxRange?: number;
  values: Record<string, number>;
  /** 소환 패턴이 부를 적 id (헥타르 전투원 호출) */
  summon?: string;
  /** 시간 단계(BossCore.unlocks)가 이 값 이상일 때부터 (마기카이저) */
  unlock?: number;
}

/** 보스 행동 (스테이지 보스·히든보스 공통) */
export interface BossCore {
  /** 적 id와 같다 */
  id: string;
  enrageAt: number;
  gapSec: number;
  /** 강화 단계 진입 연출 동안 쉬는 시간(무적) */
  enrageSec: number;
  firstDelaySec: number;
  /** 패턴이 없을 때 플레이어와 이 거리까지 다가간다 */
  keepDistance: number;
  enraged: { moveSpeedMul: number; scale: number; auraColor: string };
  patterns: BossPatternDef[];
  /** 전투 시작 후 이 초마다 다음 단계가 열린다 (마기카이저: 25·50·75). 첫 단계 전에는 움직이지 않는다(구속) */
  unlocks?: number[];
  /** 일식 어둠 (식광): 방을 어둡게, 플레이어 둘레만 밝게. 보스가 죽으면 걷힌다 */
  darkness?: { lightRadius: number; alpha: number; color: string };
}

/** 스테이지 보스 (X-2, X-5) */
export interface BossDef extends BossCore {
  chapter: number;
  stage: number;
}

/** 히든보스: 챕터와 상관없이 같은 패턴, 체력·피해만 챕터 배율. 처치하면 전용 무기·아이템 */
export interface HiddenBossDef extends BossCore {
  weaponId: string;
  itemId: string;
}

export interface BossesData {
  /** 보스방 경고 배너 시간 */
  bannerSec: number;
  bosses: BossDef[];
  hiddenBosses: HiddenBossDef[];
  /** 히든보스 체력·피해 배율 (챕터 번호 → 배율) */
  hiddenChapterMul: Record<string, number>;
  /** 지면 파괴 잔해 색 */
  rubbleColor: string;
}

export interface EnemiesData {
  /** 적 투사체 모양 */
  projectile: SpriteRef;
  /** 디버그 '적 탄막': 플레이어 주위에서 플레이어를 향해 일반 탄을 쏜다(벡터굴절역장 확인용) */
  debugBarrage: { count: number; distance: number; speed: number; damage: number };
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
  /** 방 크기 틀(타일, 벽 포함). 격자 한 칸은 가장 큰 틀 크기이고 방은 칸 가운데에 놓인다 */
  roomSizes: { id: string; w: number; h: number }[];
  /** 방 종류별로 뽑을 크기 틀과 가중치 */
  roomSizeRules: Record<RoomKind, { size: string; weight: number }[]>;
  /** 전투 칸 장애물: chance로 배치 틀 하나. 블록 x·y는 안쪽 바닥 비율(블록 가운데), w·h는 타일 */
  obstacles: { chance: number; doorLaneTiles: number; layouts: { id: string; weight: number; blocks: { x: number; y: number; w: number; h: number }[] }[] };
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

/** 정예(집행자·집정관) 등장 규칙. 엘리트 효과는 붙지 않는다 */
export interface ChampionRules {
  ids: string[];
  /** 챕터 → 전투 칸에 나오는 스테이지 */
  stages: Record<string, number[]>;
  /** 전투 칸 웨이브 하나에 정예 1마리가 섞일 확률, 방 하나의 상한 */
  waveChance: number;
  maxPerRoom: number;
  /** 대규모 습격: 한 웨이브에 정예가 나오고, 이 확률로 둘이 함께 */
  raidBothChance: number;
  /** 처치 시 아이템 상자 확률 */
  itemChestChance: number;
}

export interface WavesData {
  /** 다음 웨이브까지 대기(초) */
  waveDelaySec: number;
  champions: ChampionRules;
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
  skillbar: {
    slotSize: number;
    gap: number;
    groupGap: number;
    disabledAlpha: number;
    /** Lv1·2·3 테두리 색 */
    levelColors: string[];
    awakenedColor: string;
    emptyColor: string;
    /** 쿨타임 원형 게이지 색 */
    cooldownColor: string;
    cooldownAlpha: number;
    /** 궁극기 게이지가 다 찼을 때 테두리 */
    ultimateReadyColor: string;
  };
  weapons: { mainWidth: number; mainHeight: number; subWidth: number; subHeight: number; gap: number };
}

export interface UiData {
  baseWidth: number;
  baseHeight: number;
  backgroundColor: string;
  /** HUD 배치 (기준 해상도 px) */
  hud: HudLayoutData;
  room: { floorColor: string; wallColor: string; corridorColor: string };
  /** 챕터별 방 색 (없으면 room) */
  chapterRooms: Record<string, { floorColor: string; wallColor: string; corridorColor: string }>;
  /** 칼 베기 이펙트 표시 시간(초) */
  slashFxSec: number;
  /** 카메라 따라가기 보간(0~1) */
  cameraLerp: number;
  /** 런 카메라: 기본 확대, 조준 적 쪽으로 기우는 비율, 플레이어가 화면 가장자리에서 떨어질 거리 */
  camera: { zoom: number; lean: number; playerMarginPx: number };
  toastSec: number;
  /** "인벤토리에 보관됨" 알림(교체 버튼) 표시 시간(초) */
  storedNoticeSec: number;
  /** 마기 변질된 적 색·변질 폭발 색 */
  corruptionColor: string;
  /** 에너지 부족 시 HUD 에너지 바를 빨갛게 표시하는 시간(초) */
  energyEmptyFlashSec: number;
  mobile: MobileLayoutData;
}

// ---------- 스킬 ----------

export type JobId = 'magiScholar' | 'magiMage' | 'warrior';
export const SCHOOL_IDS = ['hectar', 'acro'] as const;
export type SchoolId = (typeof SCHOOL_IDS)[number];
export type SkillSlotKind = 'active' | 'passive';

export interface SkillLevelDef {
  /** 쿨타임(초). 패시브는 0 */
  cooldownSec: number;
  /** 레벨별 수치. 스킬마다 의미가 다르고, 설명 문구의 {이름} 자리에 들어간다 */
  values: Record<string, number>;
}

export interface SkillAwakeningDef {
  nameKey: string;
  descKey: string;
  /** 각성 조건: Lv3 + 이 스탯이 requiredValue 이상 */
  requiredStat: StatId;
  requiredValue: number;
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
  awakening: SkillAwakeningDef;
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
  /** 게이지가 이만큼 차면 발동할 수 있다 */
  gaugeMax: number;
  /** kill: 적 처치로 충전(열역학 제1법칙) / damage: 정해진 스킬의 피해량 × perDamage(+ 대성공 보너스) */
  gauge: { kind: 'kill' } | { kind: 'damage'; skills: string[]; perDamage: number; perGreatSuccess?: number };
  /** 학파 궁극기면 그 학파 (궁극기 각성 조건: 이 학파 스킬 각성 수) */
  school?: SchoolId;
  values: Record<string, number>;
  /** 궁극기 각성. 없으면 각성판 없음 */
  awakening?: { nameKey: string; shortKey: string; descKey: string; tags: TagId[]; values: Record<string, number> };
  color: string;
  sprites: Record<string, SpriteRef>;
}

export interface UltimatesData {
  /** 궁극기 각성에 필요한 자기 학파 각성 스킬 수 */
  awakeningNeed: number;
  /** 적 처치 시 게이지 충전량 (적 등급별) */
  gaugePerKill: Record<EnemyRank, number>;
  ultimates: UltimateDef[];
}

// ---------- 아이템 ----------

/**
 * 아이템 효과. 값은 기획서 기준값이고 실제 값은 그룹 배율을 곱한다:
 * value → group, damage → procDamage, radius·range → area, everySec·cooldownSec → cooldown.
 */
export type ItemEffect =
  | { kind: 'stat'; stat: StatId | 'all'; value: number; group: 'statFlat' }
  | { kind: 'maxHp'; value: number; group: 'hpFlat' }
  /** 피해 증가. all·melee·ranged·boss(보스에게) */
  | { kind: 'damage'; scope: 'all' | 'melee' | 'ranged' | 'boss'; value: number; group: 'damagePct' }
  /** 모든 적이 받는 피해 증가 (피해 증가와 따로 곱한다) */
  | { kind: 'enemyTaken'; value: number; group: 'damagePct' }
  /** 받는 피해 감소 */
  | { kind: 'damageTaken'; value: number; group: 'damagePct' }
  | { kind: 'coinGain'; value: number; group: 'damagePct' }
  /** 공격 범위(스킬 범위·근접 무기 범위·폭발 반지름) */
  | { kind: 'area'; value: number; group: 'damagePct' }
  | { kind: 'buffDuration'; value: number; group: 'damagePct' }
  /** 체력이 threshold 이하가 되면 healTo까지(추가가 아니라 그 비율까지) 회복. cooldownSec 0이면 1회. afterDamage: 쓴 뒤 피해 증가 */
  | { kind: 'lowHpHeal'; threshold: number; healTo: number; cooldownSec: number; priority: number; afterDamage?: number }
  /** 사망 시 완전 회복 + 무적 (school이면 그 학파로 전직했을 때만) */
  | { kind: 'revive'; invulnSec: number; school?: SchoolId }
  /** 특정 스킬 피해 증가 (school이면 그 학파로 전직했을 때만) */
  | { kind: 'skillDamage'; skillId: string; value: number; group: 'damagePct'; school?: SchoolId }
  /** 주기적으로 스킬 자동 발동 (notSchool로 전직했으면 꺼짐) */
  | { kind: 'autoCast'; skillId: string; level: number; everySec: number; notSchool?: SchoolId }
  /** 주기적 임시 함성: 피해·이동속도 증가 (버프 태그) */
  | { kind: 'tempRoar'; everySec: number; durationSec: number; damage: number; moveSpeed: number }
  /** 주기적 인력탄: 맞은 자리 둘레 적을 끌어당기며 피해 */
  | { kind: 'gravityShot'; everySec: number; damage: number; radius: number; pull: number; range: number; tags: TagId[] }
  /** 코인을 perCoins만큼 얻을 때마다 관통탄 shots발 (남은 양 이월) */
  | { kind: 'coinShots'; perCoins: number; shots: number; damage: number; range: number; tags: TagId[] }
  /** perKills 처치마다 피해 +value (최대 max), 피격 시 누적분 hurtKeep 비율만 남김 */
  | { kind: 'killStacks'; perKills: number; value: number; max: number; hurtKeep: number }
  /** 받은 피해를 공격한 적에게 반사 */
  | { kind: 'reflect'; ratio: number }
  /** 대성공 확률 +bonus(상한 무시), noFailure면 대실패 없음 (school로 전직했을 때만) */
  | { kind: 'greatSuccess'; bonus: number; noFailure: boolean; school: SchoolId }
  /** 적중마다 chance 확률로 공간격 */
  | { kind: 'spaceOnHit'; chance: number }
  /** 공격마다 chance(확률 태그, 지능 보정) 확률로 피해 ×mult */
  | { kind: 'luckyHit'; chance: number; mult: number }
  /** 피격 후 sec 무적(반투명), 재사용 cooldownSec */
  | { kind: 'hurtInvuln'; sec: number; cooldownSec: number }
  /** 피격 시 사방 공격 (힘·마기력 범위 보정) */
  | { kind: 'hurtBurst'; damage: number; radius: number; tags: TagId[] }
  /** 따라다니는 핵이 everySec마다 absorbSec 동안 둘레(radius)의 약한 적 탄을 흡수한 뒤 폭발 (식광의 핵) */
  | { kind: 'absorbCore'; everySec: number; absorbSec: number; damage: number; radius: number; tags: TagId[] }
  /** 전투 칸에 들어갈 때·엘리트를 잡을 때 함성: 피해·이동속도 증가 (버프 태그). 바바리안 데스 휘슬 */
  | { kind: 'roomRoar'; durationSec: number; damage: number; moveSpeed: number }
  /** 함성 효과(피해·이동속도) 배율 증가 (직업 변형) */
  | { kind: 'roarBoost'; value: number }
  /** 피해를 받기 직전 그 피해를 없애고 짧게 순간이동, 이후 기본공격 attacks회 피해 +bonus. 특무 인장 */
  | { kind: 'dodgeBlink'; cooldownSec: number; distance: number; attacks: number; bonus: number }
  /** 순간 회피 재사용을 이 값으로 (직업 변형, 짧은 쪽) */
  | { kind: 'dodgeCooldown'; cooldownSec: number }
  /** 주기적으로 벽에 튕기는 방패 투척. 날아가 있는 동안 받는 피해 −guard. 오리온의 방패 */
  | { kind: 'shieldThrow'; everySec: number; damage: number; bounces: number; speed: number; size: number; maxSec: number; guard: number; tags: TagId[] }
  /** 방패 튕김 횟수 증가 (직업 변형) */
  | { kind: 'shieldBounces'; value: number }
  /** 궁극기를 쓸 때 관통 탄환 shots발 전방위 (고대병기의 코어) */
  | { kind: 'ultimateBurst'; shots: number; damage: number; speed: number; range: number; tags: TagId[] }
  /** 기본 스탯을 base로, 정신력을 willpower로 재편하고 줄어든 양을 가장 많이 투자한 스탯에 옮김 */
  | { kind: 'statReshuffle'; base: number; willpower: number };

export type ItemPool = 'normal' | 'boss' | 'hiddenBoss' | 'set';

export interface ItemDef extends SpriteRef {
  id: string;
  nameKey: string;
  descKey: string;
  grade: GradeId;
  /** normal: 상자·첨탑 / boss: 그 보스 처치로만 / hiddenBoss: 히든보스 처치로만 / set: 세트 합성으로만 */
  pool: ItemPool;
  tags: TagId[];
  effects: ItemEffect[];
  /** 직업·학파별 추가 효과 (아직 없는 직업은 데이터만) */
  variants?: { job: string; effects: ItemEffect[] }[];
  /** boss: 이 보스 처치 시 확정 (dropChance가 있으면 그 확률) */
  bossId?: string;
  /** 보스 전용 아이템이 나올 확률 (헥타르 RAM 20%). 없으면 확정 */
  dropChance?: number;
}

export interface ItemsData {
  /** 등급 가중치 (보물 상자) */
  treasureWeights: Partial<Record<GradeId, number>>;
  /** 대규모 습격 상자 (레어 이상) */
  raidWeights: Partial<Record<GradeId, number>>;
  /** 획득 1회당 그 등급에서 바로 위 등급으로 옮기는 가중치 (확률 이전) */
  transferPerPickup: number;
  /** 챕터가 오를 때마다 일반에서 빼서 상위 등급에 나누는 가중치 */
  chapterCommonShift: number;
  /** 세트 합성: 재료 → 결과 */
  sets: { materials: string[]; result: string }[];
  /** 획득 카드 표시 시간(초) */
  pickupCardSec: number;
  items: ItemDef[];
}

// ---------- 전리품·조우 ----------

export type EncounterKindId = 'treasure' | 'merchant' | 'raid' | 'magiSpire' | 'hiddenBoss';

export interface LootData {
  /** 아이템·무기를 얻을 때마다 신화로 바뀌는 고정 확률 */
  mythicChance: number;
  /** 유니크 무기 목록이 없을 때 대신 줄 등급 */
  uniqueWeaponFallback: GradeId;
  /** 보스 무기 상자 등급 가중치 (스테이지 번호별) */
  weaponChest: Record<string, Partial<Record<GradeId, number>>>;
  /** 전투 칸을 깼을 때 무기가 떨어질 확률과 등급 */
  combatDrop: { chance: number; weights: Partial<Record<GradeId, number>> };
  merchant: { count: number; weights: Partial<Record<GradeId, number>>; prices: Record<GradeId, number> };
  encounter: { weights: Record<EncounterKindId, number> };
  raid: { waves: IntRange; sizeMul: number; elitesPerWave: number; coins: IntRange };
  chest: { weapon: SpriteRef; item: SpriteRef; openRadius: number };
  merchantStand: SpriteRef;
  /** 상인 진열대 간격(px) */
  standSpacing: number;
  spire: SpireData;
}

/** 마기수집첨탑. 처치 충전·방해 무리 규칙은 첨탑 크기와 무관하게 같다 (중형은 M6) */
export interface SpireData {
  small: { sprite: SpriteRef; weights: Partial<Record<GradeId, number>> };
  /**
   * 중형 첨탑: 챕터별 등장(그 스테이지부터 확률), 75% 확률로 강적 1마리
   * (1~2장: 엘리트 2종이 겹친 개체 / 3장: 집행자 또는 집정관)
   */
  medium: {
    sprite: SpriteRef;
    weights: Partial<Record<GradeId, number>>;
    chance: Record<string, { fromStage: number; chance: number }>;
    strongChance: number;
  };
  /** 충전 원 반지름(px) */
  radius: number;
  ringColor: string;
  fallSec: number;
  /** 낙하 시작 높이(px, 착지점 위) */
  fallHeight: number;
  riseSec: number;
  chargePerKill: Partial<Record<EnemyRank, number>>;
  minAlive: number;
  spawnGapSec: number;
  /** 엘리트 수 배율 (평소 웨이브 대비) */
  eliteMul: number;
  /** 무리마다 항상 섞이는 헥타르 전투원 (원본 첨탑 규칙) */
  troopers: { enemy: string; count: IntRange };
  /** 아이템 선택 카드 수 */
  cards: number;
}

// ---------- 직업·전직 ----------

/** 전직 분기 (마기학자: 헥타르/아크로). 마기법사·전사는 틀만 */
export interface AdvancementDef {
  id: string;
  nameKey: string;
  /** 학파 색 (연출·화면 전환) */
  color: string;
  /** 학파 궁극기 */
  ultimate: string | null;
  /** 이 학파의 패시브 (자동 지급하지 않고 카드로 고른다) */
  passive: string | null;
}

export interface JobDef {
  id: JobId;
  nameKey: string;
  enabled: boolean;
  /** 기본 스탯 보정 */
  statBonus: Partial<Record<StatId, number>>;
  startWeapon: string;
  startUltimate: string;
  advancements: AdvancementDef[];
}

export interface JobsData {
  /** 직업 선택 화면(M5) 전까지 쓰는 직업 */
  startJob: JobId;
  /** 이 챕터의 마지막 보스를 잡으면 전직 */
  advanceAfterChapter: number;
  /** 전직 스킬 변환에서 받을 스킬이 없을 때 포인트 1개당 무작위 스탯 증가량 */
  conversionStatAmount: number;
  jobs: JobDef[];
}

// ---------- 카드 ----------

export type CardOfferKind = 'skill' | 'stat';

export interface StatCardGrade {
  id: string;
  amount: number;
  /** 등장 가중치 */
  weight: number;
  color: string;
}

export interface CardsData {
  /** 한 번에 보여주는 카드 수 */
  cardCount: number;
  /** 카드창마다 1회 리롤 비용(코인) */
  rerollCost: number;
  /** 런 시작 카드 */
  runStart: CardOfferKind;
  /** 스테이지를 끝낼 때마다 이 순서로 돈다 (런 전체 스테이지 번호 1부터) */
  afterStageCycle: CardOfferKind[];
  /** 보스(X-2, X-5)를 잡으면 보스방에서 한 번 더 */
  bossBonus: CardOfferKind;
  /** 각성 카드는 조건을 채운 만큼 넣되 이 수까지 */
  maxAwakeningCards: number;
  /** 스킬 카드 종류별 뽑기 가중치 */
  skillWeights: { new: number; levelUp: number; passiveNew: number; passiveLevelUp: number };
  statGrades: StatCardGrade[];
}

// ---------- 텍스트 ----------

export type TextTable = Record<string, string>;

// ---------- 결산·영구 진행 ----------

/** 결산 마기력 결정 산식 (기획서 표) */
export interface CrystalRules {
  /** 스테이지 클리어 1개당 */
  perStage: number;
  /** 보스 처치: 스테이지 번호 → 결정 (X-2, X-5) */
  bossByStage: Record<string, number>;
  perElite: number;
  perSpire: number;
  perHiddenBoss: number;
  /** 런 클리어(3-5) 보너스: 합계 × 배율 */
  clearMultiplier: number;
}

export interface MetaData {
  crystals: CrystalRules;
  memory: {
    /** 과거의 기억 칸 수 (내용은 미공개, 칸·순서·잠금만) */
    pastSlots: number;
    /** 보스 처치 시 기억조각 확률 */
    bossShardChance: number;
    /** 히든보스 처치 시 확정 */
    hiddenBossShard: boolean;
  };
  /** 결산 화면 연출 */
  settlement: { lineStepSec: number; countSec: number };
  /** 실험체의 기억: 직업별 영구 강화 (최대 레벨 = 비용 표 길이) */
  upgrades: UpgradeDef[];
}

/** stat: 시작 스탯 +perLevel / maxHp: 기본 체력 +perLevel / shield: 보호막 최대치 +perLevel */
export type UpgradeDef =
  | { id: string; kind: 'stat'; stat: StatId; perLevel: number; costs: number[] }
  | { id: string; kind: 'maxHp' | 'shield'; perLevel: number; costs: number[] };

// ---------- 실험장 (시작 방) ----------

/**
 * capsule: 깨어나는 자리 / jobSelect: 직업 선택 장치 / portal: 시뮬레이션 포털 /
 * codex: 도감 단말(준비 중) / archive: 기억조각 보관대 / gemini: 미모사 제미니 홀로그램(준비 중) / window: 관측창(장식)
 */
export type LabObjectKind = 'capsule' | 'jobSelect' | 'portal' | 'codex' | 'archive' | 'gemini' | 'window';

export interface LabObjectDef {
  id: string;
  kind: LabObjectKind;
  /** 가운데 좌표 (기준 해상도 px) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 지나갈 수 없는지 */
  solid: boolean;
  color: string;
  spriteKey: string;
}

export interface LabData {
  /** 방 안쪽 */
  room: { x: number; y: number; w: number; h: number };
  wall: number;
  colors: { floor: string; grid: string; wall: string; light: string; monitor: string; monitorText: string; window: string; emptyCapsule: string };
  gridStep: number;
  /** 벽면 모니터 x (장식) */
  monitors: number[];
  interactRadius: number;
  /** 캡슐 앞 (첫 실행이 아니면 여기서 시작) */
  start: { x: number; y: number };
  /** 첫 실행: 캡슐 뚜껑이 열리고 걸어 나온다 */
  wake: { lidSec: number; stepSec: number; stepDistance: number };
  objects: LabObjectDef[];
  geminiFlicker: { minAlpha: number; maxAlpha: number; periodSec: number };
  portalPulseSec: number;
}

// ---------- 미모사 제미니 대화 ----------

/** 대사가 나오는 게임 이벤트. arg: 전직 학파 / 보스 id / 끝난 챕터 번호 */
export type GeminiEventId = 'firstRun' | 'advancement' | 'bossKill' | 'championMet' | 'chapterEnd' | 'hiddenBoss';

/** 게임을 멈추는 일반 스토리 대화. lines: 차례로 넘기는 문장(텍스트 키). 내용이 비어 있으면 띄우지 않는다 */
export interface GeminiStoryDef {
  id: string;
  nameKey: string;
  event: GeminiEventId;
  when?: string;
  lines: string[];
}

/**
 * 멈추지 않는 미니 대사. candidates 중 하나를 무작위로(같은 런에 나온 것 제외), 후보 하나는 차례로 띄우는 문장 목록.
 * record: 현재의 기억에 남는 복선 대사 / mood: 아이콘 표정(평범·불길)
 */
export interface GeminiMiniDef {
  id: string;
  nameKey: string;
  event: GeminiEventId;
  when?: string;
  priority: number;
  record: boolean;
  mood: 'calm' | 'ominous';
  candidates: string[][];
}

export interface GeminiData {
  /** 미니 대사 한 문장 표시 시간·페이드(초) */
  mini: { showSec: number; fadeSec: number };
  /** 초상화·아이콘 색 (헥타르 연구원의 푸른 분위기) */
  color: string;
  stories: GeminiStoryDef[];
  minis: GeminiMiniDef[];
}

// ---------- 도트 아트 ----------

/**
 * 그림 기준점. center: 그림 가운데가 판정 가운데 / feet: 판정이 그림 아래쪽에 붙는다(키 큰 캐릭터를 발밑 기준으로).
 * 그림이 판정과 같은 크기면 둘은 같다.
 */
export type ArtAnchor = 'center' | 'feet';

/** spriteKey 하나의 그림: PNG 한 장, 프레임은 가로로 이어 붙인다 */
export interface ArtSpriteDef {
  /** basePath 아래 파일 경로 */
  file: string;
  frameWidth: number;
  frameHeight: number;
  /** 프레임 수 (없으면 1) */
  frames?: number;
  /** 없으면 그림 종류별 기본값 (캐릭터·오브젝트는 feet, 탄·픽업·스킬·무기는 center) */
  anchor?: ArtAnchor;
  /** 프레임 애니메이션 (플레이어·적): 멈춰 있을 때 idle, 움직일 때 move. 없으면 첫 프레임 그대로 */
  anims?: Partial<Record<ArtAnimId, ArtAnimDef>>;
  /** 그림이 바라보는 방향 (없으면 오른쪽). 움직이는 방향에 따라 좌우로 뒤집는다 */
  facing?: 'right' | 'left';
}

export type ArtAnimId = 'idle' | 'move';

/** 프레임 번호 from~to(0부터, 둘 다 포함)를 초당 fps장으로 반복 */
export interface ArtAnimDef {
  from: number;
  to: number;
  fps: number;
}

export interface ArtData {
  /** public/ 아래 그림 폴더 */
  basePath: string;
  /** spriteKey → 그림. 적혀 있지 않은 키는 색 사각형 */
  sprites: Record<string, ArtSpriteDef>;
}

// ---------- 타격감·연출 ----------

export type ShakeLevel = 'light' | 'medium' | 'heavy' | 'rumble';

export interface JuiceData {
  /** 피해 숫자 (동시 max개, riseSec 동안 risePx 위로) */
  damageNumbers: {
    enabled: boolean;
    max: number;
    riseSec: number;
    risePx: number;
    spreadPx: number;
    fontSize: number;
    critFontSize: number;
    bossFontScale: number;
    colors: Record<'normal' | 'crit' | 'space' | 'dot', string>;
  };
  /** 맞으면 squash만큼 찌그러졌다 squashSec에 돌아온다 */
  hitFlash: { squash: number; squashSec: number };
  /** 맞은 자리 불꽃 (태그 색), fx 그림은 fxSec 동안 */
  sparks: { count: IntRange; speed: [number, number]; lifeSec: number; size: number; fxSec: number; colors: Record<'physical' | 'magic' | 'tech' | 'default', string> };
  /** 잠깐 멈춤(초). 끝난 뒤 minGapSec 동안은 다시 멈추지 않는다 */
  hitStop: { melee: number; crit: number; eliteKill: number; bossKill: number; minGapSec: number };
  /** 처치: 파편, 번쩍임, 보상 구슬이 튀어 나가는 거리·시간 */
  death: { shards: IntRange; eliteShards: IntRange; shardSpeed: [number, number]; shardLifeSec: number; shardSize: number; flashSec: number; orbPopPx: [number, number]; orbPopSec: number };
  /** 플레이어 피격: 화면 가장자리 붉은 번쩍임, 낮은 체력 맥박 */
  playerHurt: { flashSec: number; flashAlpha: number; lowHpRatio: number; pulseSec: number; pulseAlpha: number; color: string; edgePx: number };
  shake: Record<ShakeLevel, { ms: number; intensity: number }>;
  /** 이펙트 그림 (없으면 도형) */
  fx: Record<'hitTech' | 'hitMagic' | 'hitPhysical' | 'explosion' | 'eliteBurst' | 'spawn', SpriteRef>;
  /** 적 소환: 바닥 원(몸 반지름 × ringRadiusMul), 작게(startScale) 아래(risePx)에서 솟아오른다 */
  spawn: { ringColor: string; ringRadiusMul: number; startScale: number; risePx: number };
  /** 보스 등장 컷: 카메라 이동(panSec) → 내려찍기(dropSec, dropHeight) → 이름 띠(nameSec) → 복귀(returnSec) */
  /** zoom: 기본 확대에 곱하는 배율 */
  bossIntro: { panSec: number; dropSec: number; dropHeight: number; nameSec: number; returnSec: number; zoom: number; bandColor: string; bandAlpha: number; nameColor: string; subColor: string };
  /** 보스 체력바: 깎인 만큼 흰 잔상이 trailDelaySec 뒤 초당 trailPerSec(비율)씩 줄어든다 */
  bossBar: { width: number; height: number; y: number; trailDelaySec: number; trailPerSec: number; color: string; trailColor: string; backColor: string; markerColor: string; fontSize: number };
  /** 보스 강화·단계 개방: 번쩍임, 짧은 확대, 화면 가운데 큰 이름 */
  bossPhase: { flashMs: number; zoom: number; zoomSec: number; bannerSec: number; bannerSize: number };
  /** 보스 처치: slowSec 동안 slowScale 배속에서 점점 원래대로, 연쇄 폭발 */
  bossKill: { slowSec: number; slowScale: number; explosions: number; spreadPx: number; stepSec: number; flashMs: number };
  /** 포탈 이동: 빨려 들어감(suckSec, 확대 zoom배) → 이동 화면(덮기·걷기 시간, 빛줄기 수, 색) → 도착(arriveSec) */
  portal: { suckSec: number; zoom: number; holdSec: number; fadeInSec: number; fadeOutSec: number; arriveSec: number; streaks: number; color: string; bgColor: string };
  /** 방 클리어 글자, 문이 사라지는 시간 */
  roomClear: { sec: number; color: string; size: number; doorFadeSec: number };
}

// ---------- 효과음 ----------

/** 소리 한 층: 파형(또는 잡음), 높낮이 시작→끝(Hz), 길이, 크기, 걸러내기, 시작 지연 */
export interface SoundLayer {
  wave: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
  /** 잡음은 없어도 된다 */
  freq?: [number, number];
  durSec: number;
  volume: number;
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; freq: [number, number] };
  delaySec?: number;
}

export interface SoundDef {
  layers: SoundLayer[];
  /** 같은 소리를 다시 내기까지 최소 간격(초), 동시에 나는 최대 수 */
  gapSec?: number;
  maxVoices?: number;
}

export interface SoundsData {
  masterVolume: number;
  /** 소리 켜기·끄기 키 (KeyboardEvent.code) */
  muteKey: string;
  defaultGapSec: number;
  defaultMaxVoices: number;
  /** 음 높이 흔들림 비율 */
  pitchJitter: number;
  sounds: Record<string, SoundDef>;
}

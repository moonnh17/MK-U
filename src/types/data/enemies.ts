import type { IntRange, SpriteRef } from './common';

// ---------- 적 ----------

/** chase: 직선 추격 / idle: 움직이지 않음(보스방 임시 더미) / boss: 보스 패턴(bosses.json)이 움직인다 */
export type EnemyAi = 'chase' | 'idle' | 'boss';

export type EnemyRank = 'normal' | 'elite' | 'champion' | 'boss' | 'hiddenBoss';

export interface EnemyDef extends SpriteRef {
  id: string;
  nameKey: string;
  /** 도감 설명 아래 플레이버 문구 (ko.json 키). 없으면 그 칸을 보이지 않는다 */
  flavor?: string;
  /** 도감 번호 (도감에 나오는 몬스터만) */
  codexNo?: number;
  /** 위협 등급 1~6 (1이 가장 강함). 'unknown' = unknown, null = 미분류 */
  mun?: number | 'unknown' | null;
  /** true면 'N문급', 아니면 'N문' */
  munClass?: boolean;
  /** 땅에 뿌리박은 고정형: 밀려나지 않는다 */
  rooted?: boolean;
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
  /** 오버플로우 유니크 진화 변형: 도감·챕터 로스터에 따로 들지 않는다 (바탕 종 칸을 쓴다) */
  variant?: boolean;
  /** 그림·판정을 함께 키우는 배율 (그림 크기는 그림 밀도로 정해져 size만으로는 안 바뀐다) */
  artScale?: number;
  /** 보스가 부르는 적(분신). 챕터 로스터·웨이브에 들지 않는다 */
  summon?: boolean;
  /** 변이가 붙어도 변이 공격(도약 등)을 쓰지 않는다 */
  noEliteAttacks?: boolean;
  /** 원거리 적: 플레이어와 이 거리를 유지한다 */
  keepDistance?: number;
  trail?: EnemyTrailDef;
  /** 체력 피해의 이 배율만큼 정신 피해를 함께 준다 */
  mentalRatio?: number;
  /** 집정관: 같은 방에서 죽은 적의 최대 체력을 흡수해 단계가 오른다 */
  absorb?: ArchonAbsorbDef;
  /** 죽을 때 예고 원 뒤 대폭발 (오버플로우 토마끼 유니크, 플레이어에게만) */
  deathBlast?: { radius: number; warnSec: number; damage: number; color: string };
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
 * spikes: 플레이어 자리(와 주변)에 차례로 가시 예고 → 분출 (맥동낭·응시종) / roots: 몸에서 뻗는 뿌리 줄기 예고 → 솟음 (혈관수)
 */
export interface EnemyAttackDef {
  id: string;
  kind: 'lunge' | 'slam' | 'burst' | 'puddle' | 'fan' | 'rope' | 'snipe' | 'spikes' | 'roots';
  /** 픽셀 이펙트 (color로 물들인다): slam 내려찍기 자리 · rope 끌어온 뒤 도끼 베기 · snipe 저격 광선 */
  fx?: SpriteRef;
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
  /** puddle: 장판 틱마다 주는 정신 피해 */
  mentalDamage?: number;
  /** slam: 내리칠 때 / lunge: 내려앉을 때 사방으로 퍼지는 충격 탄 */
  ring?: { shots: number; speed: number; range: number; damage: number };
  /** 탄 그림과 물들일 색 (없으면 기본 적 탄) */
  shot?: SpriteRef;
  shotTint?: string;
  /** 등장 후 첫 공격을 이 시간 안에서 무작위로 늦춘다 (떼가 한꺼번에 쏘지 않게) */
  firstDelayJitterSec?: number;
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
  /** spikes·roots: 가시 수, 가시 사이 간격, 각 가시의 예고 시간 / fan: 탄막을 몇 번, 간격, 한 번마다 돌아가는 각도 */
  strikes?: number;
  strikeGapSec?: number;
  warnSec?: number;
  /** spikes: 두 번째 가시부터 플레이어 둘레 이 거리 안 아무 데나 */
  scatter?: number;
  /** roots: 줄기마다 플레이어 방향에서 번갈아 벌어지는 각도 (0, +turn, −turn …) */
  turnDeg?: number;
  bursts?: number;
  burstGapSec?: number;
  burstTurnDeg?: number;
  /** spikes·roots: 예고·타격 그림 */
  warnArt?: SpriteRef;
  hitArt?: SpriteRef;
  /** 준비 동안의 본체 자세 (그림의 애니메이션 이름, 없으면 aim) */
  pose?: string;
  /** spikes: 정하면 공격 시작 때 플레이어 자리를 고정하고, 조준 방향에 수직으로 이만큼 벌린 자리들에 차례로 (scatter 대신) */
  perpOffsets?: number[];
  /** roots: 뿌리가 솟은 뒤 이어 쏘는 부채꼴 탄막 (같은 방향, 다시 조준하지 않는다) */
  volley?: EnemyVolleyDef;
}

export interface EnemyVolleyDef {
  afterSec: number;
  shots: number;
  spreadDeg: number;
  speed: number;
  range: number;
  damage: number;
  bursts: number;
  burstGapSec: number;
  /** 첫 탄막 중심이 조준에서 벌어진 각도, 한 번마다 더해지는 각도 */
  burstStartDeg?: number;
  burstTurnDeg: number;
  shot?: SpriteRef;
}

/** 지나간 자리에 남기는 장판 (어느 기억) */
export interface EnemyTrailDef {
  everyPx: number;
  radius: number;
  liveSec: number;
  damage: number;
  tickSec: number;
  /** 틱마다 주는 정신 피해 */
  mentalDamage?: number;
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
  /** 근접은 플레이어가 maxRange 안에 있을 때만 쓴다 */
  reach: 'melee' | 'ranged';
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
  /** 체력 단계(BossCore.unlocks)가 이 값 이상일 때부터 (마기카이저) */
  unlock?: number;
  /** 강화 단계에서 교체돼 나오지 않는다 */
  maxPhase?: 1;
  /** 체력 단계가 이 값 이하일 때까지만 */
  maxUnlock?: number;
  /** 체력 비율이 이 값 이하일 때만 (식광 일식) */
  hpBelow?: number;
  /** 일반 순환이 아니라 독립 계승 주기로만 쓴다 */
  inherit?: boolean;
  /** 본체가 직접 움직이는 패턴(돌진·순간이동·주먹 돌진). 겹쳐 쓰지 않는다 */
  moves?: boolean;
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
  /** 강화 단계의 패턴 사이 쉬는 시간 (없으면 gapSec) */
  gapSecEnraged?: number;
  /** 체력이 이 비율 이하가 될 때마다 다음 단계가 열린다 (마기카이저 0.7·0.4, 내림차순). 첫 단계 전에는 움직이지 않는다(구속) */
  unlocks?: number[];
  /** 패턴마다 따라 나오는 소환수 (융합악귀) */
  companions?: { enemies: string[]; enemiesEnraged: string[]; count: number; countEnraged: number; maxAlive: number };
  /** 이 보스가 부르는 소환수(동행·패턴 소환)의 체력 배율. 없으면 1 */
  summonHpMul?: number;
  /** 저체력 추가 공격: 체력 at 이하면 패턴 시작 afterSec 뒤 플레이어 발밑 폭발 */
  lowHpStrike?: { at: number; afterSec: number; radius: number; delaySec: number; damage: number };
  /** 독립 계승 주기 (마기카이저): 마지막 단계에서 rollSec마다 chance로 시도, 끝난 뒤 minGapSec */
  inherit?: { rollSec: number; chance: number; minGapSec: number };
  /**
   * 겹쳐 쓰기: 패턴이 도는 동안 rollSec마다 chance로 두 번째 패턴을 같이 쓴다(동시에 최대 2개).
   * 두 번째는 움직이지 않는 패턴(moves 없음)만, 쿨타임은 일반 순환과 같이 쓴다
   */
  overlap?: { rollSec: number; chance: number };
  /** 패턴 이펙트 그림: 슬롯 이름 → 그림. '패턴id.슬롯'이 있으면 그 패턴에서 우선. 없으면 도형으로 그린다 */
  art?: Record<string, SpriteRef>;
  /** 본체 자세 (art.json anims 이름). dashReady·dash·recover·transition·패턴 id */
  poses?: Record<string, string | { first: string; sec: number; then: string }>;
  /** 원본 그림에서 작게 그려진 자세를 키운다: 애니메이션 키("그림키.자세") → 배율 */
  poseScale?: Record<string, number>;
  /** 강화 단계에 몸에 겹치는 그림: 맥동 (alpha ± pulse) */
  layers?: { sprite: SpriteRef; alpha: number; pulse: number; spin?: number }[];
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
  /** 보스 체력이 everyHpRatio씩 줄 때마다 에너지 구슬 orbs개 */
  energyDrops: { everyHpRatio: number; orbs: number; halfHpOrbs: number };
  bosses: BossDef[];
  hiddenBosses: HiddenBossDef[];
  /** 히든보스 체력·피해 배율 (챕터 번호 → 배율) */
  hiddenChapterMul: Record<string, number>;
  /** 지면 파괴 잔해 색 */
  rubbleColor: string;
}


/** 도감 '세계관 분류' 정렬: 분류 id → 그 분류의 id들 (적은 순서대로 묶음이 된다, 이름은 ko.json codex.lore.<탭>.<분류>) */
export type CodexLore = Record<string, string[]>;

export interface EnemiesData {
  codexLore: CodexLore;
  /** 히든보스(어느 장에서든 나온다) 체력·피해 배율: 장 번호 → 배율. 수치는 1장 기준값. 다른 적은 고정 스탯 */
  hiddenBossScale: Record<string, number>;
  /** 적 투사체 모양 */
  projectile: SpriteRef;
  /** 디버그 '적 탄막': 플레이어 주위에서 플레이어를 향해 일반 탄을 쏜다(벡터굴절역장 확인용) */
  debugBarrage: { count: number; distance: number; speed: number; damage: number };
  enemies: EnemyDef[];
  /** 도감 등급 문양: "1"~"6", "unknown"(미분류) */
  munGrades: Record<string, MunGradeArt>;
}

export interface MunGradeArt {
  color: string;
  /** 테두리 색 */
  rim: string;
  shape: 'star8' | 'star6' | 'pentagon' | 'diamond' | 'triangle' | 'circle' | 'broken';
}

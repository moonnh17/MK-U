import type { IntRange, TagId, SpriteRef } from './common';

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

export type StatueKind = 'heal' | 'energy' | 'sanity';

/** 방 하나의 소품 수·석상 확률 */
export interface RoomPropRule {
  crates: [number, number];
  barrels: [number, number];
  statueChance: number;
}

export interface RoomPropsData {
  spacingPx: number;
  /** 문 앞·방 가운데·벽에서 이만큼 떨어져 놓는다 */
  doorClearPx: number;
  centerClearPx: number;
  edgeInsetPx: number;
  rules: Partial<Record<RoomKind, RoomPropRule>>;
  crate: SpriteRef & { hp: number; coins: { chance: number; count: [number, number] }; energy: { chance: number; count: [number, number] } };
  /** 부서지면 fuseSec 뒤 폭발: 적에게 damage, 플레이어에게 playerDamage, 주변 소품도 부순다 */
  barrel: SpriteRef & { hp: number; fuseSec: number; radius: number; damage: number; playerDamage: number; tags: TagId[] };
  /** value: 최대치에 대한 회복 비율 */
  statues: (SpriteRef & { kind: StatueKind; value: number })[];
  /** 문 안쪽에 다음 방 종류 표시 */
  doorIcon: { insetPx: number; fontPx: number; keys: Record<RoomKind, string>; colors: Record<RoomKind, string> };
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
  /** 런 시작 무기 상자의 플레이어 아래 거리(px) */
  startChestOffsetPx: number;
  /** 스테이지에 조우 칸이 하나 더 생길 확률 */
  extraEncounterChance: number;
  stageRules: Record<StageKind, StageRoomRule>;
  /** 전투 칸 웨이브 수 */
  combatWaves: IntRange;
  /** 보스방 임시 표적 (보스 패턴은 M3) */
  bossPlaceholderEnemy: string;
  /** 1-1 시작방 바닥에 놓는 테스트 무기 (`?testWeapons=0`으로 끔) */
  testWeapons: string[];
  /** 문 */
  door: { color: string; openColor: string };
  /** 적 길 찾기 격자 한 칸, 장애물 여유 폭(px) */
  pathCellPx: number;
  pathMarginPx: number;
  props: { exitPortal: SpriteRef & { spinSec: number }; encounterCore: SpriteRef };
  /** 방 꾸미기: 챕터별 바닥 변형 수, 지형지물·바닥 장식 그림 수와 배치 */
  dressing: {
    floorVariants: Record<string, number>;
    obstacleKinds: number;
    /** 지형지물 그림을 이 간격(px)으로 찍어 덮는다 */
    obstacleStepPx: number;
    decalKinds: number;
    decalsPerRoom: [number, number];
    decalColor: string;
    obstacleBaseColor: string;
  };
  /** 조우 칸 물약 자판기 */
  vending: SpriteRef & { price: number; stock: number; healRatio: number; cornerInsetPx: number; potion: SpriteRef; pickupRadius: number };
  /** 플레이어가 방 안쪽으로 이만큼(px) 들어와야 문이 잠긴다 */
  lockInsetPx: number;
  /** 방 크기 틀(타일, 벽 포함). 격자 한 칸은 가장 큰 틀 크기이고 방은 칸 가운데에 놓인다 */
  roomSizes: { id: string; w: number; h: number }[];
  /** 방 종류별로 뽑을 크기 틀과 가중치 */
  roomSizeRules: Record<RoomKind, { size: string; weight: number }[]>;
  /** 전투 칸 장애물: chance로 배치 틀 하나. 블록 x·y는 안쪽 바닥 비율(블록 가운데), w·h는 타일 */
  /** otherRooms: 전투 칸 밖의 방에 장애물이 나올 확률 (open 틀만: 가운데가 비어 포털·코어·진열대를 가리지 않는다) */
  obstacles: { chance: number; doorLaneTiles: number; otherRooms: Partial<Record<RoomKind, number>>; layouts: { id: string; weight: number; open?: boolean; blocks: { x: number; y: number; w: number; h: number }[] }[] };
  roomProps: RoomPropsData;
  /** 전투 없는 조우 칸(아이템 상자·상인)이 될 확률과 그 방 크기 */
  encounterPeaceful: { chance: number; size: string };
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
  /** value: 입자 하나의 값 / dropRate: 떨어질 입자 하나하나가 실제로 나올 확률 */
  coin: SpriteRef & { value: number; dropRate: number };
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
  /** 챕터 → 그 챕터의 정예 id */
  ids: Record<string, string[]>;
  /** 챕터 → 전투 칸에 나오는 스테이지 */
  stages: Record<string, number[]>;
  /** 전투 칸 웨이브 하나에 정예 1마리가 섞일 확률, 방 하나의 상한 */
  waveChance: number;
  maxPerRoom: number;
  /** 대규모 습격: 한 웨이브에 정예가 나오고, 이 확률로 둘이 함께 */
  raidBothChance: number;
  /** 처치 시 무기 상자 확률과 그 등급 가중치 */
  /** 정예·엘리트 처치 때 무기 상자(전투 상자 등급표)가 떨어질 확률 */
  weaponChestChance: number;
}

export interface WavesData {
  /** 다음 웨이브까지 대기(초) */
  waveDelaySec: number;
  /** 웨이브 적 수 배율 */
  countMul: number;
  champions: ChampionRules;
  /** 적이 나타난 뒤 공격·접촉 피해가 없는 시간(초) */
  spawnWarnSec: number;
  /** 플레이어와 최소 이만큼 떨어진 곳에 소환(px) */
  spawnMinPlayerDistance: number;
  waves: WaveTemplate[];
}

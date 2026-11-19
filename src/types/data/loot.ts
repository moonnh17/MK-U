import type { IntRange, GradeId, SpriteRef } from './common';
import type { EnemyRank } from './enemies';

// ---------- 전리품·조우 ----------

export type WeaponChestTierId = 'basic' | 'advanced' | 'supreme' | 'legendary';

export type EncounterKindId = 'treasure' | 'merchant' | 'skillShop' | 'raid' | 'magiSpire' | 'hiddenBoss' | 'combiner';

export interface LootData {
  /** 아이템·무기를 얻을 때마다 신화로 바뀌는 고정 확률 */
  mythicChance: number;
  /** 유니크 무기 목록이 없을 때 대신 줄 등급 */
  uniqueWeaponFallback: GradeId;
  /** 보스 무기 상자 등급 가중치 (모든 보스 같은 표) */
  bossWeaponChest: Partial<Record<GradeId, number>>;
  /** 보스 아이템 상자(아이템) 등급 가중치. 전용 아이템이 남은 보스면 그 아이템 확정 */
  bossItemChest: Partial<Record<GradeId, number>>;
  /** 전투 칸을 깼을 때 무기 상자(전투 상자 등급표)가 떨어질 확률 */
  combatDrop: { chance: number };
  /** 무기 상자 등급: 이름·무기 등급 가중치·그림 */
  weaponChestTiers: Record<WeaponChestTierId, { nameKey: string; weights: Partial<Record<GradeId, number>>; sprite: SpriteRef }>;
  /** 전투에서 떨어지는 무기 상자(전투 칸·정예·습격)의 등급 가중치 (챕터별) */
  combatChestTiers: Record<string, Partial<Record<WeaponChestTierId, number>>>;
  /** 대규모 습격 무기 상자가 전설 무기 상자일 확률 (챕터별) */
  raidLegendaryChestChance: Record<string, number>;
  merchant: { count: number; weights: Partial<Record<GradeId, number>>; prices: Record<GradeId, number> };
  /** 런 시작 방의 무기 상자 등급 가중치 */
  startChest: Partial<Record<GradeId, number>>;
  /** 시작 무기 상자에서 나오지 않는 무기 id */
  startChestExclude: string[];
  /** 스테이지 보스 처치 시 그 보스의 유니크 무기가 나올 확률 (아니면 무기 상자 가중치대로) */
  bossWeaponChance: number;
  /** 상점 진열대 위 아이콘 크기(px) */
  cardStandIconPx: number;
  /** 스킬 상점: 카드 종류별 가격 */
  skillShop: { count: number; prices: { skillNew: number; skillLevelUp: number } };
  /** chapterWeights: 챕터별로 덮어쓸 가중치(평화로운 칸 합은 그대로 둔다) */
  encounter: { weights: Record<EncounterKindId, number>; chapterWeights: Record<string, Partial<Record<EncounterKindId, number>>> };
  raid: { waves: IntRange; sizeMul: number; elitesPerWave: number; coins: IntRange };
  /** weapon = 시작 무기 상자, boss = 보스·히든보스 무기 상자 */
  chest: { weapon: SpriteRef; item: SpriteRef; boss: SpriteRef; bossItem: SpriteRef; openRadius: number };
  merchantStand: SpriteRef;
  /** 아이템 조합기 (조우 칸): 같은 등급 2개 → 한 등급 위 1개, 한 대에 한 번 */
  combiner: SpriteRef;
  /** 상인 진열대 간격(px) */
  standSpacing: number;
  spire: SpireData;
}

/** 마기수집첨탑. 처치 충전·방해 무리 규칙은 첨탑 크기와 무관하게 같다 (중형은 M6) */
export interface SpireData {
  /** picks: 충전 완료 보상으로 고르는 스킬 수 */
  small: { sprite: SpriteRef; picks: number };
  /**
   * 중형 첨탑: 챕터별 등장(그 스테이지부터 확률), 75% 확률로 강적 1마리
   * (1~2장: 엘리트 2종이 겹친 개체 / 3장: 집행자 또는 집정관)
   */
  medium: {
    sprite: SpriteRef;
    picks: number;
    chance: Record<string, { fromStage: number; chance: number }>;
    strongChance: number;
  };
  /** 대형 첨탑: 중형 그림을 scale배로. 중형보다 먼저 판정하고, 강적 규칙은 중형과 같다 */
  large: { sprite: SpriteRef; scale: number; picks: number; chance: Record<string, { fromStage: number; chance: number }> };
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
}

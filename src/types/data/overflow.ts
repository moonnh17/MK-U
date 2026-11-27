/** 오버플로우 모드 (무한 모드) 데이터 */

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
}

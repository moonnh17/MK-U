import type { TagId, SpriteRef } from './common';

// ---------- 플레이어 ----------

/** 전직 회피. blink: 번개 순간이동(거리·무적·번개 모양) / leap: 장애물을 넘는 도약, 착지 피해 / shot: 구르면서 탄 발사 */
export type DodgeSchoolDef = { nameKey: string; descKey: string } & (
  | { kind: 'blink'; distancePx: number; invulnSec: number; stepPx: number; boltColor: string; boltSec: number; boltSegments: number; boltAmpPx: number }
  | { kind: 'leap'; distancePx: number; stepPx: number; airSec: number; heightPx: number; invulnSec: number; landRadius: number; landDamage: number; landKnockbackPx: number; tags: TagId[]; color: string }
  /** 방패 돌격(성기사): 더 멀리·오래 돌진, 무적 대신 받는 피해 감소, 닿은 적을 밀친다 */
  | { kind: 'charge'; speed: number; durationSec: number; damageReduction: number; hitRadius: number; knockbackPx: number; knockbackSec: number; color: string }
  | { kind: 'shot'; shots: number; spreadDeg: number; damage: number; projectileSpeed: number; range: number; tags: TagId[]; tint: string }
);

export interface SanityConfig {
  base: number;
  regenPerSec: number;
  /** 보스와 마주한 동안 초당 감소 (이때는 회복하지 않는다) */
  bossDrainPerSec: number;
  panic: {
    regenPerSec: number;
    /** 최대치의 이 비율까지 회복하면 패닉이 끝난다 */
    exitRatio: number;
    lightRadius: number;
    darkAlpha: number;
    darkColor: string;
    fadeSec: number;
    shakeMs: number;
    shakeIntensity: number;
    lines: number;
    lineEverySec: number;
    lineWidthPx: [number, number];
    lineSegments: number;
    lineAmpPx: number;
    lineAlpha: number;
    awakenTint: string;
  };
}

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
  /** 총구에서 목표가 이보다 가까우면 몸 기준 각도로 쏜다 */
  muzzleMinTargetPx: number;
  /** 무기를 쥔 오른손 자리 (플레이어 기준 px, 그림이 뒤집히면 x도 뒤집는다) */
  weaponHand: { x: number; y: number };
  /** 회피 구르기: 속도, 시간, 무적, 재사용 대기, 잔상 간격, 대기 막대 색 */
  dodge: {
    nameKey: string;
    speed: number;
    durationSec: number;
    invulnSec: number;
    cooldownSec: number;
    ghostEverySec: number;
    barColor: string;
    /** 전직하면 회피가 바뀐다 */
    schools: Partial<Record<string, DodgeSchoolDef>>;
  };
  /** 정신력 게이지: 최대치 = base + perWillpower × 정신력 스탯 */
  sanity: SanityConfig;
  energy: { max: number; start: number; orbValue: number };
}

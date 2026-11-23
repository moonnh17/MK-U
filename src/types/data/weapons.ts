import type { IntRange, TagId, GradeId, SpriteRef } from './common';
import type { CodexLore } from './enemies';
import type { RiftDef, SpaceCutDef } from './skills';

// ---------- 무기 ----------

/** gun: 총 / blade: 칼(둔기 포함) / staff: 마법 지팡이(탄을 쏘고 에너지를 쓴다, 아비오르의 지팡이) */
export type WeaponCategory = 'gun' | 'blade' | 'staff' | 'bow';

/**
 * 유니크 무기의 고유 효과: every번째 공격마다 발동.
 * bigSmash: 내려찍기 피해·범위 증가(네메아의 종말) / laser: 탄 대신 직선 레이저 / space: 그 공격이 공간격
 */
/** nameKey: 특수공격 이름 (설명 제목·발동 글씨) */
export type WeaponSignature = { nameKey?: string } & (
  /** sparks: 참격 호를 따라 튀는 빛줄기(streaks)·불티(dots) 연출 */
  | { every: number; kind: 'bigSmash'; damageMul: number; radiusMul: number; sparks?: { streaks: number; dots: number; color: string; lifeSec: number; speed: [number, number] } }
  /** beam: 레이저 그림 (없으면 선) */
  | { every: number; kind: 'laser'; damageMul: number; length: number; width: number; beam?: SpriteRef }
  /** 튕기는 번개: 가까운 적에서 적으로 jumps번. anyDistance면 첫 적은 거리 제한 없이 가장 가까운 적 */
  | { every: number; kind: 'chainBolt'; damageMul: number; jumps: number; range: number; color: string; anyDistance?: boolean }
  | { every: number; kind: 'space' }
);

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
  | { kind: 'homing'; turnRate: number }
  /** 가까운 적 자리에 delaySec 뒤 운석이 떨어져 터진다 */
  | { kind: 'meteor'; radius: number; delaySec: number; fallPx: number; color: string; sprite: SpriteRef }
  /** 몸 둘레로 바람을 일으킨다 (knockback으로 밀어낸다) */
  | { kind: 'gust'; radius: number }
  /** 지팡이: 몸에서 사방으로 퍼지는 파동 (반지름 안 적 모두, 그림은 shot) */
  | { kind: 'nova'; radius: number };

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

/** 쌍성 지팡이 한 상태: 연사력·피해·탄속 배율, 관통 수, 지형 무시, 탄 판정 크기, 탄 그림, 손에 든 모습 */
export interface TwinStarMode {
  rateMul: number;
  damageMul: number;
  speedMul: number;
  pierce: number;
  ghost: boolean;
  hitSize: number;
  shot: SpriteRef;
  look: SpriteRef;
}

export interface WeaponDef extends SpriteRef {
  id: string;
  /** 도감 번호 (게임에 추가된 순서) */
  codexNo?: number;
  nameKey: string;
  /** 도감 성능 아래 플레이버 문구 (ko.json 키) */
  flavor?: string;
  category: WeaponCategory;
  grade: GradeId;
  /** 무기 분류 id (weapons.classes) */
  classes: string[];
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
  /** critAtMax: 완전 차지 때의 치명타 확률 (활) */
  charge?: { maxSec: number; damageMul: number; radiusMul: number; minRatio?: number; critAtMax?: number };
  /** 차징 중 이동속도 증가 (서풍) */
  chargeMoveSpeed?: number;
  /** 탄 그림 (화살 등). 없으면 공통 탄 */
  shot?: SpriteRef;
  /** 쏠수록 발사가 빨라진다 (MG70). resetSec 동안 안 쏘면 처음부터 */
  spinUp?: { perShot: number; maxMul: number; resetSec: number };
  /** 화염: 날아가며 커지고 흐려진다 */
  flame?: { scaleTo: number };
  /** 근접 공격과 함께 탄을 쏜다. 에너지가 모자라면 탄만 나가지 않는다 */
  meleeShot?: { damageMul: number; speed: number; range: number; energyCost: number; color: string };
  /** 칼: 공격할 때 조준한 적 쪽으로 돌진한 뒤 벤다 (최대 distance, sec초) */
  lunge?: { distance: number; sec: number };
  /**
   * 발도(라스알히게의 검): 조준한 적을 꿰뚫고 그 뒤 behindPx까지 sec 만에 지나간다(최대 maxDistance, 벽에서 멈춤, 그동안 무적).
   * 지나간 길(폭 width)의 적은 cutDelaySec 뒤 칼을 거두는 순간 한꺼번에 베인다
   */
  iaido?: { maxDistance: number; behindPx: number; sec: number; width: number; cutDelaySec: number; color: string };
  /**
   * 되돌아오는 원반 (궤도절삭륜): 충전이 있을 때 던지고, 관통하며 range까지 날아간 뒤 플레이어를 따라 돌아온다.
   * 가는 길·오는 길 모두 피해, 잡으면 충전 하나가 바로 찬다. maxSec이 지나면 사라지고 충전이 돌아온다
   */
  /**
   * 궤도절삭륜: 날아간 길을 그대로 되짚어 느리게 돌아온다. 돌아오는 원반을 플레이어가 잡으면 바로 충전,
   * 못 잡으면 출발점을 overshootPx 지나 사라지고 missRechargeSec 뒤에 충전. scale: 원반 그림 배율(판정도 커진다)
   */
  boomerang?: { charges: number; /** 산탄 아이템(발사 탄수 +)으로 늘어나는 충전 상한 */ maxExtraCharges: number; range: number; returnSpeed: number; catchPx: number; maxSec: number; spinPerSec: number; scale: number; overshootPx: number; missRechargeSec: number; shot: SpriteRef };
  /**
   * 공간봉합침 (아크로제): 침이 적이나 벽에 박힌다. 박힌 침은 가까운 순서로 이어져 절단선이 되고 tickSec마다 선에 닿은 적에게 피해.
   * 최대 max개(넘으면 가장 오래된 것부터 사라짐), lifeSec 뒤 사라짐. 특수공격(Q)으로 모두 회수하며 지나는 길의 적에게 피해
   */
  needle?: { max: number; lifeSec: number; tickSec: number; lineDamageMul: number; lineWidth: number; recallDamageMul: number; recallSec: number; color: string; shot: SpriteRef };
  /** 공격마다 에너지 소모가 기본값 × [min, max] 사이에서 무작위 (야시장 복제총) */
  energyRange?: [number, number];
  /** 공격마다 chance 확률로 터지며 무기가 사라진다 (야시장 복제총) */
  selfDestruct?: { chance: number };
  /** 쏠 때마다 chance 확률로 자신도 damage 피해 (불안정 마기 조각) */
  selfHarm?: { chance: number; damage: number };
  /**
   * 징수 (체납자의 의수): 공격할 때마다 마기 입자 coins를 가져간다. 모자라면 그 공격은 맨손(주먹).
   * moveSpeed: 낼 수 있는 동안(마기 입자가 coins 이상) 이동속도 증가
   */
  debt?: { coins: number; moveSpeed: number; color: string };
  /**
   * 환국의 잔명: 관통 광선. 적을 맞힌 발사마다(여러 적이어도 한 번) 에너지 energyGain 회복·충전 1.
   * 충전이 stacks가 되면 다음 사격이 강화 광선(피해 ×damageMul, 굵기·길이 증가). 강화 사격은 충전에 들어가지 않는다
   */
  /** 민타카의 쌍성 지팡이: phaseSec마다 주성↔반성, 무기 특수공격으로 align(둘을 겹친 식 최대)을 sec 동안 */
  twinStar?: { phaseSec: number; primary: TwinStarMode; eclipse: TwinStarMode; align: TwinStarMode & { sec: number; cooldownSec: number; burst: SpriteRef; color: string } };
  /** 무기 특수공격(Q) 스킬 */
  qSkill?: WeaponQSkill;
  beam?: {
    length: number;
    width: number;
    energyGain: number;
    stacks: number;
    empowered: { damageMul: number; length: number; width: number };
    color: string;
    glyphColor: string;
    gauge: SpriteRef;
  };
  /** 이름 있는 고유 능력·특수공격 (도감 굵은 제목). 특수공격 버튼(Q)으로 쓰는 것은 needle 회수 */
  abilityNameKey?: string;
  /** 공격할 때 흘리는 파티클 */
  attackParticles?: { color: string };
  /** 그림 안 마력 중심(가로·세로 0~1). onCharge면 차징 중, 아니면 발사 때 번쩍인다 */
  core?: { u: number; v: number; color: string; onCharge?: boolean };
  /** 발사할 때 마력 중심에서 터지는 그림 */
  fireFlash?: SpriteRef;
  /** 폭발탄이 터질 때 그림 */
  lobBlast?: SpriteRef;
  /** 맞은 적을 밀어낸다(해머). 거대 엘리트·보스는 면역 */
  knockback?: { distance: number; sec: number };
  /** 총: 맞힌 뒤 가까운 다른 적으로 튕긴다 */
  ricochet?: { bounces: number; range: number };
  /** 칼: 맞은 적에게 출혈을 쌓는다 (중첩 상한은 출혈 태그 규칙) */
  bleed?: { base: number; stacks: number };
  /** 칼: 공격할 때마다 자신에게 공격력 버프 */
  selfBuff?: { sec: number; damage: number; color: string };
  /** 든 그림을 조준에 따라 돌리지 않고 세워 둔다 (깃발) */
  upright?: boolean;
  /**
   * 손에 들지 않고 팔에 차는 무기 (체납자의 의수): 그림의 gripX 자리를 몸 가운데에서 (shoulderX, shoulderY)
   * 어깨에 붙이고 조준 쪽으로 뻗는다. 위를 겨누면 몸 뒤로 간다
   */
  worn?: { gripX: number; shoulderX: number; shoulderY: number };
  /** 칼: 참격·타격 이펙트 색 */
  fxColor?: string;
  /** 들고 있는 동안 효과 (신궁 환디) */
  /** bossDamage: 이 무기로 보스에게 주는 피해 증가 / jobDamage: 전직별 피해 증가 */
  equipBonus?: { physicalDamage?: number; rangedDamage?: number; meleeDamage?: number; bossDamage?: number; jobDamage?: Partial<Record<string, number>> };
  /** 기본 치명타 확률 */
  critChance?: number;
  /** 이 보스를 잡으면 나오는 무기 */
  bossId?: string;
  /** 유니크 고유 효과 */
  signature?: WeaponSignature;
}

export interface WeaponsData {
  codexLore: CodexLore;
  /** 맨손일 때 나가는 공격 (슬롯에 들지 않고 버릴 수 없다) */
  fistWeapon: string;
  /** 총알 모양 (공통) */
  projectile: SpriteRef;
  /** 치명타 피해 배율 */
  critMultiplier: number;
  /** 무기를 바꾼 뒤 공격할 수 없는 시간(초) */
  swapDelaySec: number;
  /** 무기 분류 (산탄·레이저 등). 아이템 효과가 분류를 보고 붙는다 (산탄: 발사 탄수 +) */
  classes: { id: string; nameKey: string }[];
  /** 근접 이펙트: 흑백 그림에 무기 색을 입힌다. glowAlpha: 밝은 심을 더하는 겹 / buffSparkSec: 버프 불티 간격 */
  /**
   * tiers: 등급 → 무기 이펙트 단계(1~4, 높을수록 화려). xxxTiers: 단계별 그림(1단계부터). 강화 평타는 한 단계 위.
   * slash 베기 · thrust 찌르기 · smash 내려찍기·바람 · beam 레이저(그림이 따로 없는 무기) · bullet 총 탄 · orb 지팡이 구슬 · muzzle 총구 섬광
   */
  meleeFx: {
    slash: SpriteRef; slam: SpriteRef; slashBig: SpriteRef; slamBig: SpriteRef; buffAura: SpriteRef;
    tiers: Record<GradeId, number>;
    slashTiers: SpriteRef[]; thrustTiers: SpriteRef[]; smashTiers: SpriteRef[]; beamTiers: SpriteRef[];
    /** 총 탄 · 지팡이 구슬 · 총구 섬광. 탄과 섬광은 무기 색을 shotTintWhite만큼 흰색 쪽으로 밝혀 입힌다(어두운 무기 색도 바닥에서 보이게) */
    bulletTiers: SpriteRef[]; orbTiers: SpriteRef[]; muzzleTiers: SpriteRef[]; shotTintWhite: number;
    glowAlpha: number; buffSparkSec: number;
  };
  options: WeaponOptionDef[];
  weapons: WeaponDef[];
}

/** 무기 Q 스킬 */
export type WeaponQSkill =
  /** 3식 제미니(라스알히게의 검): 노린 적을 사이에 두고 flankPx 떨어진 곳에 분신 clones기가 나타나 함께 strikes번 벤다. 검의 공간격 차례에 쓰면 마지막 베기가 공간격(화면이 갈라진다) */
  | { kind: 'gemini'; nameKey: string; descKey: string; cooldownSec: number; clones: number; strikes: number; gapSec: number; damageMul: number; lastMul: number; radiusMul: number; flankPx: number; color: string; spaceLength: number; spaceWidth: number; spaceCut: SpaceCutDef; rift: RiftDef; cut: SpriteRef[] }
  /**
   * 정화의 불길(아비오르의 지팡이): durationSec 동안 volleySec마다 둘레로 불길, laserEverySec마다 조준 방향으로 굵은 직선 레이저 연사.
   * 레이저는 lanes줄의 나란한 길을 차례로 돌아 옆면이 맞닿는다(같은 길에 겹치지 않음)
   */
  | { kind: 'purifyingFlame'; nameKey: string; descKey: string; cooldownSec: number; durationSec: number; volleySec: number; laserEverySec: number; lanes: number; jitterDeg: number; beamLength: number; beamWidth: number; beamDamageMul: number; flameRadius: number; flameDamageMul: number; burnStacks: number; color: string; flame: SpriteRef };

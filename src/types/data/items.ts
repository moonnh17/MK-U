import type { TagId, GradeId, SpriteRef } from './common';
import type { CodexLore } from './enemies';
import type { SchoolId } from './skills';

// ---------- 아이템 ----------

/**
 * 아이템 효과. 값은 기획서 기준값이고 실제 값은 그룹 배율을 곱한다:
 * value → group, damage → procDamage, radius·range → area, everySec·cooldownSec → cooldown.
 */
export type ItemEffect =
  | { kind: 'maxHp'; value: number; group: 'hpFlat' }
  /** 원소 스킬 피해 + (all: 세 원소 모두) */
  | { kind: 'elementDamage'; element: 'fire' | 'ice' | 'lightning' | 'all'; value: number; group: 'damagePct' }
  /** 화상 틱 피해 + (화상은 지속시간이 없어 틱 피해로 바꿔 적용) */
  | { kind: 'burnDamage'; value: number; group: 'damagePct' }
  /** 화염 원소 공격으로 적을 쓰러뜨리면 그 자리에 잔불 장판 */
  | { kind: 'fireKillZone'; durationSec: number; radius: number; damage: number; everySec: number }
  /** 둔화 지속 + */
  | { kind: 'slowDuration'; value: number; group: 'damagePct' }
  /** 둔화 세기 + */
  | { kind: 'slowPower'; value: number; group: 'damagePct' }
  /** 연쇄 번개 연쇄 거리 + */
  | { kind: 'chainRange'; value: number; group: 'damagePct' }
  /** 스킬 시전 수치 key에 +% (skill이 있으면 그 스킬만): 광선 길이·밀치기·흡인 반경·장판 지속·순간이동 거리·소환체 체력 등 */
  | { kind: 'skillValueMul'; skill?: string; key: string; value: number; group: 'damagePct' }
  /** 원소 순환 유지 시간 +초 */
  | { kind: 'cycleWindow'; value: number }
  /** 피해 증가. all·melee·ranged·boss(보스에게) */
  | { kind: 'damage'; scope: 'all' | 'melee' | 'ranged' | 'boss' | 'physical' | 'magic' | 'tech'; value: number; group: 'damagePct' }
  | { kind: 'maxSanity'; value: number; group: 'hpFlat' }
  | { kind: 'moveSpeed'; value: number; group: 'damagePct' }
  | { kind: 'skillCooldown'; value: number; group: 'damagePct' }
  /** 산탄 무기 발사 탄수 + */
  | { kind: 'pellets'; value: number }
  /** 모든 적이 받는 피해 증가 (피해 증가와 따로 곱한다) */
  | { kind: 'enemyTaken'; value: number; group: 'damagePct' }
  /** 받는 피해 감소 */
  | { kind: 'damageTaken'; value: number; group: 'damagePct' }
  | { kind: 'coinGain'; value: number; group: 'damagePct' }
  /** 최대 에너지 + */
  | { kind: 'maxEnergy'; value: number; group: 'hpFlat' }
  /** 에너지 구슬로 얻는 에너지 증가 */
  | { kind: 'energyGain'; value: number; group: 'damagePct' }
  /** 무기 레이저가 벽에 닿으면 bounces번 튕긴다 (스넬의 법칙) */
  | { kind: 'laserBounce'; bounces: number }
  /** 자연 치유: everySec마다 체력 value 회복 (최대 체력까지) */
  | { kind: 'regen'; value: number; everySec: number }
  /** 차징 시간 감소 (무기 차징·차징 스킬) */
  | { kind: 'chargeTime'; value: number; group: 'damagePct' }
  /** 피해 흡혈: 준 피해의 value만큼 체력 회복 */
  | { kind: 'lifesteal'; value: number; group: 'damagePct' }
  /** 공격 범위(스킬 범위·근접 무기 범위·폭발 반지름) */
  | { kind: 'area'; value: number; group: 'damagePct' }
  | { kind: 'buffDuration'; value: number; group: 'damagePct' }
  /** 체력이 threshold 이하가 되면 healTo까지(추가가 아니라 그 비율까지) 회복. cooldownSec 0이면 1회. afterDamage: 쓴 뒤 피해 증가 */
  /** uses: 재사용 대기가 없을 때 런당 쓸 수 있는 횟수 (기본 1). maxEnergyPerUse: 쓸 때마다 최대 에너지 + */
  | { kind: 'lowHpHeal'; threshold: number; healTo: number; cooldownSec: number; priority: number; afterDamage?: number; uses?: number; maxEnergyPerUse?: number }
  /** 사망 시 완전 회복 + 무적 (school이면 그 학파로 전직했을 때만) */
  /** look: 부활 연출 (hectar = 헥타르 기술식 재구성, holy = 노란 빛) */
  | { kind: 'revive'; invulnSec: number; school?: SchoolId; look?: 'hectar' | 'holy' }
  /** 특정 스킬 피해 증가 (school이면 그 학파로 전직했을 때만) */
  | { kind: 'skillDamage'; skillId: string; value: number; group: 'damagePct'; school?: SchoolId }
  /** 주기적으로 스킬 자동 발동 (notSchool로 전직했으면 꺼짐) */
  | { kind: 'autoCast'; skillId: string; level: number; everySec: number; notSchool?: SchoolId }
  /** 주기적 임시 함성: 피해·이동속도 증가 (버프 태그) */
  | { kind: 'tempRoar'; everySec: number; durationSec: number; damage: number; moveSpeed: number; /** 이 학파로 전직했으면 꺼짐 (야만용사는 전장의 함성 강화로 대신) */ notSchool?: SchoolId }
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
  /** 구르다 적 탄을 통과하면 탄 1발당 에너지 +value */
  | { kind: 'grazeEnergy'; value: number }
  /** 칼로 벤 적 탄이 되돌아간다 */
  | { kind: 'cutReflect'; range: number }
  /** 체력 비율 ratio 이상이면 피해 증가, 미만이면 받는 피해 감소 */
  | { kind: 'hpStance'; ratio: number; damageUp: number; takenDown: number }
  /** 정신력이 낮을수록 피해 증가 (0일 때 maxDamage) */
  | { kind: 'lowSanityDamage'; maxDamage: number }
  /** 패닉에도 방향이 뒤집히지 않고, 시야 방해가 visionMul배로 준다 */
  | { kind: 'panicCalm'; visionMul: number }
  /** 패닉 중 각성: 체력이 초당 hpPerSec 닳고(1 아래로는 안 내려감) 모든 피해 +damage */
  | { kind: 'panicAwaken'; hpPerSec: number; damage: number; /** 패닉 중 화면에 지직거리며 떠오르는 비석 문양 색 (기숲 비석의 조각) */ glyphColor?: string }
  /** 회피(구르기) 재사용 대기 −value 비율 (투르비용) */
  | { kind: 'dodgeCdReduce'; value: number }
  /** 구르는 동안 적 공격(탄·근접·장판)을 피하면 durationSec 동안 무기 공격 속도 +value (투르비용: 원심 가속) */
  | { kind: 'dodgeHaste'; durationSec: number; value: number }
  /** 궁극기 쿨타임 감소 비율 (스킬 쿨타임 감소와 따로) */
  | { kind: 'ultimateCooldown'; value: number }
  /** 무기 치명타 확률 + (크레퓌스퀼) */
  | { kind: 'critChance'; value: number }
  /** 무기 치명타 피해 배율 + (크레퓌스퀼) */
  | { kind: 'critDamage'; value: number }
  /** 궁극기를 쓸 때 관통 탄환 shots발 전방위 (고대병기의 코어) */
  /** 근접 공격이 맞으면 chance 확률로 출혈 (중첩당 틱 피해 damage). 신성한 이코르 */
  | { kind: 'meleeBleed'; chance: number; damage: number; stacks: number }
  /** 근접 공격이 맞으면 chance 확률로 화상 (중첩당 틱 피해 damage). 새벽불길 */
  | { kind: 'meleeBurn'; chance: number; damage: number; stacks: number }
  /** 화상 걸린 적이 죽으면 그 중첩이 radius 안의 가장 가까운 적에게 옮겨붙는다. 새벽불길 */
  | { kind: 'burnSpread'; radius: number }
  /** 체력이 threshold 비율 이하인 적에게 피해 +value. 선혈기수 */
  | { kind: 'lowHpEnemyDamage'; threshold: number; value: number }
  /** 체력이 가득 찬 뒤 넘친 회복량이 보호막이 된다 (최대 체력 × capPct까지). 마스터 G 조각상 */
  | { kind: 'overhealShield'; capPct: number }
  /** 자동 조준으로 겨눈 적이 점점 느려지다(최대 slow) afterSec을 넘기면 durationSec 석화. 보스는 느려지기만. 사르비스의 방패 */
  | { kind: 'gazePetrify'; slow: number; afterSec: number; durationSec: number }
  /** 체력이 threshold 아래로 떨어지면 durationSec 동안 받는 피해 −reduction, 재사용 cooldownSec. 시리우스의 갑주 */
  | { kind: 'lowHpGuard'; threshold: number; reduction: number; durationSec: number; cooldownSec: number }
  | { kind: 'ultimateBurst'; shots: number; damage: number; speed: number; range: number; tags: TagId[] };

export type ItemPool = 'normal' | 'boss' | 'hiddenBoss' | 'set' | 'debuff';

/** 디버프 아이템을 주는 미모사 (헥타르 4-5 / 아크로 7-5) */
export type DebuffSet = 'hectar' | 'acro';

export interface ItemDef extends SpriteRef {
  id: string;
  /** 도감 번호 (게임에 추가된 순서) */
  codexNo?: number;
  nameKey: string;
  /** 일반 능력(늘 켜진 수치 등). 능력만 있는 아이템은 없다 */
  descKey?: string;
  /** 도감 효과 아래 플레이버 문구 (ko.json 키) */
  flavor?: string;
  /** 추가 능력의 이름 (도감 굵은 제목) */
  abilityNameKey?: string;
  /** 추가 능력 설명 (도감은 일반 능력 아래 제목과 함께, 카드·가방은 일반 능력 뒤에 이어서) */
  abilityDescKey?: string;
  grade: GradeId;
  /** normal: 상자·첨탑 / boss: 그 보스 처치로만 / hiddenBoss: 히든보스 처치로만 / set: 세트 합성으로만 / debuff: 미모사 패턴으로만 (버리거나 보스를 잡으면 사라짐) */
  pool: ItemPool;
  /** pool debuff: 어느 미모사가 주는지 */
  debuffSet?: DebuffSet;
  tags: TagId[];
  effects: ItemEffect[];
  /** 직업·학파별 추가 효과 (아직 없는 직업은 데이터만) */
  variants?: { job: string; effects: ItemEffect[] }[];
  /** boss: 이 보스 처치 시 보스 아이템 상자에서 확정 */
  bossId?: string;
}

export interface ItemsData {
  codexLore: CodexLore;
  /** 등급 가중치 (아이템 상자·아이템 카드), 챕터 번호별 */
  treasureWeights: Record<string, Partial<Record<GradeId, number>>>;
  /** 대규모 습격 상자 (레어 이상) */
  raidWeights: Partial<Record<GradeId, number>>;
  /** 획득 1회당 그 등급에서 바로 위 등급으로 옮기는 가중치 (확률 이전) */
  transferPerPickup: number;
  /** 디버프 아이템: 표시 색·이름, 미모사별 한 번에 가질 수 있는 최대 수 */
  debuff: { color: string; nameKey: string; maxHeld: Record<DebuffSet, number> };
  /** 세트 합성: 재료 → 결과 */
  sets: { materials: string[]; result: string }[];
  /** 무기 세트: 든 무기 + 아이템 → 그 슬롯의 새 무기 (아이템은 사라진다) */
  weaponSets: { weapon: string; item: string; result: string }[];
  /** 획득 카드 표시 시간(초) */
  items: ItemDef[];
}

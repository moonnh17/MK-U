/**
 * 스킬 발동 함수가 전투 씬에 바라는 것. RunScene이 구현한다.
 * 스킬은 키·터치를 모르고, 피해는 항상 실제 공격(source)의 태그로 계산한다.
 */
import type Phaser from 'phaser';
import type { Vec2 } from '../core/actions';
import type { GameContext } from '../core/context';
import type { BuffView } from '../core/session';
import type { Rng } from '../core/rng';
import type { Enemy } from '../entities/enemy';
import type { CorruptionState } from '../systems/acro';
import type { ShieldState } from '../systems/shield';
import type { OwnedSkill } from '../systems/skills';
import type { PlayerMods } from '../systems/vitals';
import type { SkillDef, SpriteRef, TagId, UltimateDef } from '../types/data';

export interface SkillHost {
  readonly scene: Phaser.Scene;
  readonly ctx: GameContext;
  readonly rng: Rng;
  playerPos(): Vec2;
  /** 플레이어 그림 (MK 슈트가 잠시 가린다) */
  playerSprite(): Phaser.Physics.Arcade.Sprite;
  /** 마지막 조준 방향 (단위 벡터) */
  aimDir(): Vec2;
  /** 살아 있는 적 */
  enemies(): readonly Enemy[];
  /** 스킬 범위(반지름) 보정: 마기력 */
  area(radius: number): number;
  /** 피해 한 번. base는 태그 보정 전 값, tags는 이 공격(source)의 태그. 이번에 죽였으면 true */
  hit(enemy: Enemy, base: number, tags: readonly TagId[]): boolean;
  /** 태그 보정 없는 그대로의 피해(벼락의 보스 최대 체력 비례, 역설 재현). space면 공간격 규칙만 건다 */
  hitTrue(enemy: Enemy, amount: number, space: boolean): boolean;
  /** 플레이어 자신이 받는 피해(특이점 실험 대실패) */
  hurtSelf(amount: number): void;
  /** 이 스킬이 대성공했다(아크로 궁극기 게이지 보너스) */
  greatSuccess(): void;
  /** 대실패가 나오지 않는다 (아크룩스의 십자가, 아크로) */
  noGreatFailure(): boolean;
  /** 출혈을 건다. base는 중첩 1개당 틱 피해(태그 보정 전), tags는 출혈 공격 source의 태그 */
  bleed(enemy: Enemy, base: number, stacks: number, tags: readonly TagId[]): void;
  /** 탄 하나 (벽에 막히고, 사거리를 넘으면 사라진다) */
  fireBullet(from: Vec2, angle: number, speed: number, range: number, base: number, tags: readonly TagId[], sprite?: SpriteRef): void;
  /** 스테이지가 끝날 때까지 매 프레임 도는 오브젝트(포탑·투사체 등) */
  addObject(o: SkillObject): void;
  removeObject(o: SkillObject): void;
  objects(): readonly SkillObject[];
  /** 시간제 버프 지속시간 (버프 태그: 정신력) */
  buffDuration(baseSec: number, tags: readonly TagId[]): number;
  /** 차징 시간 (아이템의 차징 시간 감소 반영) */
  chargeTime(baseSec: number): number;
  /** 지금 보호막 (없으면 null) */
  shield(): ShieldState | null;
  /** 플레이어 보호막(마기역장)을 씌운다 */
  setShield(shield: ShieldState, opts: ShieldOpts): void;
  /** 스킬 쿨타임을 전체 쿨타임 × ratio만큼 돌려준다 */
  refundCooldown(skillId: string, ratio: number): void;
  /** 확률 판정용 확률: 확률 태그가 있으면 지능 보정·상한(capKey: success / greatSuccess) */
  chance(base: number, capKey: string, tags: readonly TagId[]): number;
  /** 마기 변질을 건다(다시 걸면 센 쪽·긴 쪽) */
  corrupt(enemy: Enemy, state: CorruptionState): void;
  /** 적을 쓰러뜨린 것으로 처리하고 필드에서 치운다(드롭·게이지·방 클리어 집계 포함, 변질 폭발 없음). 반역 개체화에 쓴다 */
  defeat(enemy: Enemy): void;
  /** 폭발이 주변 소품(상자·통)도 부순다 */
  blastProps(at: { x: number; y: number }, radius: number, damage: number): void;
  /** 체력 회복. overflowToSanity면 넘치는 양으로 정신력을 회복한다 */
  heal(amount: number, overflowToSanity: boolean): void;
  /** 현재 체력의 ratio만큼 소모한다(죽지 않음) */
  payHp(ratio: number): void;
  /** 체력을 amount만큼 잃는다 (1 아래로는 내려가지 않음) */
  drainHp(amount: number): void;
  /** 지금 체력 비율 (0~1) */
  hpRatio(): number;
  /** 플레이어 돌진: sec 동안 입력 대신 dir 방향으로 speed로 움직인다(벽에는 막힘) */
  dash(dir: Vec2, speed: number, sec: number): void;
  /** 빛 입자가 사방으로 터지는 연출 */
  burst(at: Vec2, color: string): void;
  /** 짧은 이펙트를 fxSec 뒤에 지운다 */
  fx(obj: Phaser.GameObjects.GameObject, sec?: number): void;
  /** 색 사각형 텍스처 스프라이트 */
  sprite(x: number, y: number, ref: SpriteRef): Phaser.GameObjects.Sprite;
}

export type { BuffView };

export interface ShieldOpts {
  /** 막은 뒤 잠깐 무적(초) */
  blockInvulnSec: number;
  color: string;
  /** 플레이어 둘레 표시 반지름(px) */
  fxRadius: number;
  /** 역장 그림: 유지 그림과 (각성) 생성·종료·막기·탄 지우기 이펙트 */
  look?: { body: SpriteRef; spawn?: SpriteRef; end?: SpriteRef; block?: SpriteRef; contact?: SpriteRef; deflect?: SpriteRef };
}

export interface SkillObject {
  /** 어떤 스킬이 만들었는지 (최대 개수 관리) */
  readonly owner: string;
  readonly createdAt: number;
  /** false를 돌려주면 제거된다 */
  update(dt: number, host: SkillHost): boolean;
  destroy(): void;
  /** HUD에 버프로 보일 상태 (반물질포 충전 등) */
  buff?(host: SkillHost): BuffView | null;
  /** 플레이어가 실제로 피해를 받았을 때(보호막으로 막은 공격은 제외). false면 제거된다 */
  onPlayerHurt?(host: SkillHost): boolean;
  /** 플레이어 쪽 공격이 적에게 피해를 줬을 때(실제로 깎인 양) */
  onDamageDealt?(host: SkillHost, amount: number, enemy: Enemy): void;
  /** 적이 쓰러졌을 때 */
  onKill?(host: SkillHost, enemy: Enemy): void;
  /** 이 오브젝트가 있는 동안 플레이어에게 주는 보정 (MK 슈트 등) */
  playerMods?(): Partial<PlayerMods>;
}

export interface SkillCast {
  def: SkillDef;
  owned: OwnedSkill;
  values: Record<string, number>;
}

export interface SkillImpl {
  /** 발동. false면 발동하지 않은 것(쿨타임이 돌지 않음) */
  cast(host: SkillHost, s: SkillCast): boolean;
  /** 이미 켜진 효과가 있을 때 다시 누름 (쿨타임과 상관없이 먼저 묻는다). 처리했으면 true */
  recast?(host: SkillHost, s: SkillCast): boolean;
  /** 다시 누르면 쓸 추가 스킬이 지금 준비돼 있는지 (스킬 칸에 노란 테두리가 돈다) */
  followUpReady?(host: SkillHost): boolean;
}

/** 패시브: 장착되면 한 번 불려 상시 오브젝트(드론 등)를 깐다. 해제·레벨 변경 시 그 오브젝트를 치우고 다시 부른다 */
export interface PassiveImpl {
  activate(host: SkillHost, s: SkillCast): void;
}

export interface UltimateCast {
  def: UltimateDef;
  awakened: boolean;
  /** 각성했으면 기본 수치 위에 각성 수치를 덮은 값 */
  values: Record<string, number>;
}

export interface UltimateImpl {
  cast(host: SkillHost, u: UltimateCast): boolean;
}

/** 가장 가까운 적 (최대 거리 안, 적 몸 반지름 포함) */
export function nearestEnemy(host: SkillHost, from: Vec2, maxDist = Infinity): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of host.enemies()) {
    const d = Math.hypot(e.sprite.x - from.x, e.sprite.y - from.y);
    if (d <= maxDist + e.radius && d < bestD) {
      best = e;
      bestD = d;
    }
  }
  return best;
}

/** 같은 owner 오브젝트가 keep개 이하가 되도록 오래된 것부터 치운다 */
export function trimOldest(host: SkillHost, owner: string, keep: number): void {
  const mine = host
    .objects()
    .filter((o) => o.owner === owner)
    .sort((a, b) => a.createdAt - b.createdAt);
  for (let i = 0; i < mine.length - keep; i++) host.removeObject(mine[i]!);
}
/** 적 쪽으로 다가간다. 닿을 거리면 그대로. 새 위치를 돌려준다 */
export function stepToward(from: Vec2, to: Vec2, speed: number, dt: number, stopAt = 0): Vec2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const d = Math.hypot(dx, dy);
  if (d <= stopAt || d === 0) return from;
  const step = Math.min(d - stopAt, speed * dt);
  return { x: from.x + (dx / d) * step, y: from.y + (dy / d) * step };
}
/** 잠깐 떠 있는 글자 (대성공·실험 결과 이름 등) */
export function floatText(host: SkillHost, x: number, y: number, text: string, color = '#ffffff', sec = 0.6): void {
  const t = host.scene.add
    .text(x, y, text, { fontFamily: 'sans-serif', fontSize: '9px', color, stroke: '#000000', strokeThickness: 2 })
    .setOrigin(0.5)
    .setDepth(7);
  host.scene.tweens.add({ targets: t, y: y - 10, duration: sec * 1000 });
  host.fx(t, sec);
}
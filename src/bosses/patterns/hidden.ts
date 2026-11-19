/** 히든보스 패턴 (선조의 잔상·왕속특무 마기법사·오리온의 성전사) */
import { shake } from '../../entities/juice';
import type { Vec2 } from '../../core/actions';
import { BouncingDisc, DelayedBlast, Beams, SectorBlast, Zone } from '../../entities/hazard';
import { playFx, stretchFx } from '../../skills/skillFx';
import type { PatternRun } from '../host';
import { fallSprite, shockRing } from '../bossFx';
import { Timed, angleTo, Dash, rad, predict, beam, ring, faultBand, rectAt, clampTo, around } from './base';
import type { PatternCtx } from './base';

/** 그림 한 번 (그림이 없으면 아무것도 안 함) */
function fx(c: PatternCtx, slot: string, at: Vec2, o: Parameters<typeof playFx>[4] = {}): void {
  const art = c.art(slot);
  if (art) playFx(c.host.scene, art, at.x, at.y, o);
}

/** 예고 원 → 폭발, 그 패턴의 그림(blastWarn·blastHit)으로 */
function hblast(c: PatternCtx, at: Vec2, radius: number, delaySec: number, damage: number): void {
  c.host.addHazard(new DelayedBlast(c.host.scene, at, radius, delaySec, damage, c.boss.color, { warn: c.art('blastWarn'), hit: c.art('blastHit') }));
}

/** 전장의 함성 (선조의 잔상): 포효 후 자기 강화 */
export class WarCry extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    fx(c, 'spirits', c.boss.pos(), { w: c.boss.radius() * 4, depth: 7 });
    this.at(c.v('windupSec'), () => {
      c.buff(c.v('buffSec'), c.v('damageMul'), c.v('speedMul'));
      const p = c.boss.pos();
      fx(c, 'burst', p, { w: c.boss.radius() * 6, depth: 7 });
      fx(c, 'heart', { x: p.x, y: p.y - c.boss.radius() * 0.4 }, { w: c.boss.radius() * 1.8, depth: 8 });
      shockRing(c.host.scene, p, c.boss.radius() * 4, c.boss.fxColor, 0.4, 3);
      shake(c.host.scene, 'medium');
    });
  }
}

/** 소용돌이 돌진 (선조의 잔상): 다시 조준하며 여러 번 돌진. 출발마다 발 구르기·잔혼 소용돌이 */
export class WhirlDash implements PatternRun {
  private cur: Dash;
  private n = 1;
  private spin = 0;

  constructor(private readonly c: PatternCtx) {
    this.cur = this.start();
  }

  private start(): Dash {
    const p = this.c.boss.pos();
    fx(this.c, 'stomp', { x: p.x, y: p.y + this.c.boss.radius() * 0.5 }, { w: this.c.boss.radius() * 3, depth: 2 });
    fx(this.c, 'vortex', p, { w: this.c.boss.radius() * 3.5, depth: 6 });
    return new Dash(this.c, false);
  }

  update(dt: number): void {
    this.cur.update(dt);
    this.spin += dt * 20;
    this.c.boss.setAlpha(0.75 + 0.25 * Math.sin(this.spin));
    if (this.cur.finished && this.n < this.c.v('dashes')) {
      this.cur.destroy();
      this.cur = this.start();
      this.n++;
    }
  }

  destroy(): void {
    this.cur.destroy();
    this.c.boss.setAlpha(1);
  }
}

/** 출혈 장판 (선조의 잔상): 예고 → 지속 피해 장판 */
export class BleedField extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const r = c.v('radius');
    const spots = Array.from({ length: c.v('fields') }, (_, i) => around(c, i, c.v('spread'), r));
    for (const s of spots) {
      const warn = c.art('warn');
      if (warn) playFx(c.host.scene, warn, s.x, s.y, { w: r * 2.6, depth: 2 });
      else c.host.addHazard(new DelayedBlast(c.host.scene, s, r, c.v('delaySec'), 0, c.boss.color));
    }
    this.at(c.v('delaySec'), () => {
      for (const s of spots) c.host.addHazard(new Zone(c.host.scene, s, r, c.v('liveSec'), c.v('damage'), c.v('tickSec'), c.boss.color, 0, 0, c.art('zone')));
    });
  }
}

/** 지면 파괴 (선조의 잔상): 플레이어 자리 내려찍기 → 지나갈 수 없는 잔해 (무덤이 깨지며 솟는다) */
export class GroundBreak extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const at = clampTo(c.host.playerPos(), c, c.v('radius'));
    hblast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
    this.at(c.v('delaySec'), () => {
      fx(c, 'tomb', at, { w: c.v('radius') * 3, depth: 6 });
      c.rubble(at, c.v('rubbleRadius'));
      shake(c.host.scene, 'medium');
    });
  }
}

/** 연속 내려찍기 (선조의 잔상 광폭): 플레이어 쪽으로 이어지는 강타 */
export class EarthShatter extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const from = c.boss.pos();
    const a = angleTo(from, c.host.playerPos());
    for (let i = 0; i < c.v('count'); i++) {
      const at = clampTo({ x: from.x + Math.cos(a) * c.v('gap') * (i + 1), y: from.y + Math.sin(a) * c.v('gap') * (i + 1) }, c, c.v('radius'));
      this.at(i * c.v('stepSec'), () => hblast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage')));
    }
  }
}

/** 잔향 연참 (선조의 잔상): 가까이에서 두 번 베고, 마지막에 쌍월이 교차한다 */
export class EchoSlash extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('hits'); i++) {
      this.at(i * c.v('gapSec'), () => {
        const p = c.boss.pos();
        const a = angleTo(p, c.host.playerPos()) + (i % 2 ? 0.25 : -0.25);
        c.host.addHazard(new SectorBlast(c.host.scene, p, a, c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color, c.art(i === c.v('hits') - 1 ? 'finish' : 'sectorHit')));
      });
    }
  }
}

/** 망자의 철쇄 (선조의 잔상): 사슬 세 줄을 부채꼴로 던진다. 맞으면 잠시 묶인다 */
export class DeadChain extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const base = angleTo(p, c.host.playerPos());
    const n = c.v('chains');
    for (let i = 0; i < n; i++) {
      const a = base + rad(c.v('spreadDeg')) * (i / Math.max(1, n - 1) - 0.5);
      beam(c, { center: p, angle: a, length: c.v('length'), telegraphSec: c.v('telegraphSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage'), bare: !!c.art('chain'), onHit: () => c.host.rootPlayer(c.v('rootSec')) });
    }
    this.at(c.v('telegraphSec'), () => {
      fx(c, 'chain', p, { w: c.v('length'), rotation: base, originX: 0, depth: 6 });
      shake(c.host.scene, 'light');
    });
  }
}

/** 고분 파쇄 (선조의 잔상): 보스 둘레 두 겹으로 무덤이 깨지며 솟는다 */
export class TombBreak extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const base = c.host.rng.range(0, Math.PI * 2);
    for (const [k, ring] of [c.v('ring1'), c.v('ring2')].entries()) {
      const n = c.v('count');
      for (let i = 0; i < n; i++) {
        const a = base + ((i + k * 0.5) * Math.PI * 2) / n;
        hblast(c, clampTo({ x: p.x + Math.cos(a) * ring, y: p.y + Math.sin(a) * ring }, c, c.v('radius')), c.v('radius'), c.v('delaySec') + k * c.v('lagSec'), c.v('damage'));
      }
    }
    this.at(c.v('delaySec'), () => shake(c.host.scene, 'medium'));
  }
}

/** 선조들의 귀환 (선조의 잔상 광폭): 플레이어가 갈 자리에 선조의 혼 기둥이 솟는다 */
export class AncestorsReturn extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    fx(c, 'vortex', c.boss.pos(), { w: c.boss.radius() * 4, depth: 6 });
    for (let i = 0; i < c.v('pillars'); i++) {
      this.at(i * c.v('stepSec'), () => hblast(c, predict(c, c.v('delaySec'), i === 0 ? 0 : c.v('spread')), c.v('radius'), c.v('delaySec'), c.v('damage')));
    }
  }
}

/** 순간이동 탄막 (왕속특무 마기법사): 소리 없이 사라졌다가 떨어진 곳에 나타나 원형 탄막 */
export class BlinkBarrage extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const fade = c.v('fadeSec');
    fx(c, 'shift', c.boss.pos(), { w: c.boss.radius() * 3.5, depth: 6 });
    c.boss.setAlpha(0.2);
    this.at(fade, () => {
      const a = c.host.arena();
      const pl = c.host.playerPos();
      const m = c.boss.radius() + 4;
      let best = c.boss.pos();
      let bestD = -1;
      for (let i = 0; i < 20; i++) {
        const p = { x: c.host.rng.range(a.x + m, a.x + a.w - m), y: c.host.rng.range(a.y + m, a.y + a.h - m) };
        const d = Math.hypot(p.x - pl.x, p.y - pl.y);
        if (d >= c.v('minDist')) {
          best = p;
          break;
        }
        if (d > bestD) {
          best = p;
          bestD = d;
        }
      }
      c.boss.teleport(best.x, best.y);
      c.boss.setAlpha(1);
      fx(c, 'flash', best, { w: c.boss.radius() * 3.5, depth: 7 });
    });
    for (let i = 0; i < c.v('rings'); i++) {
      this.at(fade + i * c.v('ringGapSec'), () => {
        const p = c.boss.pos();
        fx(c, 'ring', p, { w: c.boss.radius() * 4.5, depth: 6 });
        const n = c.v('bullets');
        for (let k = 0; k < n; k++) {
          const ang = ((k + (i % 2) * 0.5) * Math.PI * 2) / n;
          c.host.fireEnemyBullet(p, ang, c.v('speed'), c.v('range'), c.v('damage'), true, c.art('bullet'));
        }
      });
    }
  }
  override destroy(): void {
    super.destroy();
    this.c.boss.setAlpha(1);
  }
}

/** 강력한 레이저 (왕속특무 마기법사): 예고선 → 굵은 직선 (대형 레이저: 굴절 불가) */
export class GreatLaser extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    c.host.addHazard(
      new Beams(c.host.scene, {
        center: () => p,
        count: 1,
        length: c.v('length'),
        width: c.v('width'),
        spin: 0,
        startAngle: a,
        telegraphSec: c.v('telegraphSec'),
        liveSec: c.v('liveSec'),
        damage: c.v('damage'),
        tickSec: c.v('tickSec'),
        color: c.boss.color,
        art: c.art('beam'),
        warnArt: c.art('beamWarn'),
      }),
    );
    this.at(c.v('telegraphSec'), () => {
      fx(c, 'muzzle', { x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10 }, { w: 44, depth: 7 });
      shake(c.host.scene, 'medium');
    });
  }
}

/** 분신 (왕속특무 마기법사) */
export class Clones extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    this.at(0.3, () => c.summonClones());
  }
}

/** 마기 강타 (왕속특무 마기법사 마기화): 플레이어에게 돌진 → 부채꼴 연타 */
export class MagiStrike implements PatternRun {
  private readonly dash: Dash;
  private t = 0;
  private swipes = 0;

  constructor(private readonly c: PatternCtx) {
    this.dash = new Dash(c, false, c.v('stopDist'));
  }

  update(dt: number): void {
    const c = this.c;
    this.dash.update(dt);
    if (!this.dash.finished || this.swipes >= c.v('swipes')) return;
    this.t -= dt;
    if (this.t > 0) return;
    this.t = c.v('swipeGapSec');
    this.swipes++;
    const p = c.boss.pos();
    // 마기화 그림: 1·2타 삼중 발톱, 마지막 타 변이 강타 충격 (없으면 공용 부채꼴)
    const art = (this.swipes === c.v('swipes') ? c.art('finisher') : c.art('claw')) ?? c.art('sectorHit');
    c.host.addHazard(new SectorBlast(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('radius'), c.v('arcDeg'), c.v('swipeWindupSec'), c.v('swipeDamage'), c.boss.color, art));
  }

  /** 돌진 중엔 돌진 자세, 이후엔 n번째 타격 자세 (strike1~3) */
  bodyPose(): string {
    return this.swipes > 0 ? `strike${Math.min(this.swipes, 3)}` : this.dash.bodyPose();
  }

  destroy(): void {
    this.dash.destroy();
  }
}

/** 왕인 각인 → 왕실 추적구 (왕속특무 마기법사): 플레이어에게 왕인을 새긴 뒤 추적구를 날린다 */
export class RoyalMark extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    fx(c, 'mark', c.host.playerPos(), { w: 36, depth: 7 });
    for (let i = 0; i < c.v('seekers'); i++) {
      this.at(c.v('markSec') + i * c.v('stepSec'), () => {
        const p = c.boss.pos();
        const a = angleTo(p, c.host.playerPos()) + rad(c.v('spreadDeg')) * (i % 2 ? 1 : -1) * (1 + Math.floor(i / 2));
        c.host.fireEnemyMissile(p, a, c.v('speed'), c.v('range'), c.v('damage'), c.v('turnRate'), c.art('seeker'));
      });
    }
  }
}

/** 특무 관통선 (왕속특무 마기법사): 다시 조준하며 빠르고 좁은 관통선을 연달아 */
export class PiercingLine extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const pierce = c.art('pierce');
    for (let i = 0; i < c.v('lines'); i++) {
      this.at(i * c.v('stepSec'), () => {
        const p = c.boss.pos();
        const a = angleTo(p, c.host.playerPos());
        beam(c, { center: p, angle: a, length: c.v('length'), telegraphSec: c.v('telegraphSec'), liveSec: c.v('liveSec'), width: c.v('width'), damage: c.v('damage'), bare: !!pierce });
        this.at(this.t + c.v('telegraphSec'), () => {
          if (pierce) stretchFx(c.host.scene, pierce, p, { x: p.x + Math.cos(a) * c.v('length'), y: p.y + Math.sin(a) * c.v('length') }, c.v('width') * 3, 0.25);
        });
      });
    }
  }
}

/** 봉쇄 칙령 → 집행의 흑창 (왕속특무 마기법사): 플레이어 양옆을 봉인판으로 막고, 그 안으로 흑창이 떨어진다 */
export class SealEdict extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const p = c.host.playerPos();
    for (const s of [-1, 1]) {
      const at = { x: p.x + s * c.v('offset'), y: p.y };
      faultBand(c, rectAt(a, at, true, c.v('width')), true, c.v('delaySec'), c.v('damage'));
      fx(c, 'seal', at, { w: c.v('width') * 4, depth: 6 });
    }
    for (let i = 0; i < c.v('lances'); i++) {
      this.at(c.v('delaySec') * 0.6 + i * c.v('stepSec'), () => hblast(c, predict(c, c.v('lanceDelaySec'), i === 0 ? 0 : c.v('spread')), c.v('lanceRadius'), c.v('lanceDelaySec'), c.v('lanceDamage')));
    }
  }
}

/** 왕명·최종 집행 (왕속특무 마기법사 마기화): 마기를 거둬들인 뒤 방을 세로 집행선으로 가른다. 한 줄만 비어 있다 */
export class FinalDecree extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    fx(c, 'confiscate', c.boss.pos(), { w: c.boss.radius() * 5, depth: 7 });
    const a = c.host.arena();
    const n = c.v('lanes');
    const lane = a.w / n;
    const safe = c.host.rng.int(0, n - 1);
    this.at(c.v('windupSec'), () => {
      for (let i = 0; i < n; i++) {
        if (i === safe) continue;
        const cx = a.x + lane * (i + 0.5);
        faultBand(c, { x: cx - lane * 0.45, y: a.y, w: lane * 0.9, h: a.h }, true, c.v('delaySec'), c.v('damage'));
        this.at(c.v('windupSec') + c.v('delaySec'), () => fx(c, 'decree', { x: cx, y: a.y + a.h / 2 }, { w: lane * 1.4, depth: 7 }));
      }
    });
    this.at(c.v('windupSec') + c.v('delaySec'), () => shake(c.host.scene, 'heavy'));
  }
}

/** 성검 낙하 (오리온의 성전사): 플레이어 둘레에 차례로 성검이 떨어진다 */
export class HolySwords extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    fx(c, 'prayer', c.boss.pos(), { w: c.boss.radius() * 3.5, depth: 7 });
    for (let i = 0; i < c.v('swords'); i++) {
      this.at(i * c.v('stepSec'), () => {
        const at = around(c, i, c.v('spread'), c.v('radius'));
        hblast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
        const sword = c.art('sword');
        if (sword) fallSprite(c.host.scene, sword, at, c.v('delaySec'), c.v('radius') * 3, c.boss.fxColor);
      });
    }
  }
}

/** 메이스 강타 (오리온의 성전사): 가까울 때 앞쪽 큰 부채꼴, 별빛이 터진다 */
export class MaceSmash extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    c.host.addHazard(new SectorBlast(c.host.scene, p, a, c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color, c.art('sectorHit')));
    this.at(c.v('windupSec'), () => {
      fx(c, 'starMace', { x: p.x + Math.cos(a) * c.v('radius') * 0.6, y: p.y + Math.sin(a) * c.v('radius') * 0.6 }, { w: c.v('radius') * 1.6, depth: 7 });
      shake(c.host.scene, 'medium');
    });
  }
}

/** 방패 투척 (오리온의 성전사): 방벽을 펼친 뒤 방 벽에 튕기는 방패를 던진다 */
export class ShieldThrow extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    fx(c, 'barrier', p, { w: c.boss.radius() * 3.2, depth: 7 });
    c.host.addHazard(
      new BouncingDisc(c.host.scene, p, angleTo(p, c.host.playerPos()), c.v('speed'), c.host.arena(), c.v('bounces'), c.v('radius'), c.v('damage'), c.v('maxSec'), c.boss.color, { body: c.art('shield'), spark: c.art('spark') }),
    );
  }
}

/** 성검 십자 낙하 (오리온의 성전사 성광): 플레이어를 지나는 가로·세로 줄로 성검이 떨어진다 */
export class Judgment extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const a = c.host.arena();
    const p = c.host.playerPos();
    const gap = c.v('gap');
    const r = c.v('radius');
    fx(c, 'cross', p, { w: Math.min(a.w, a.h) * 0.9, depth: 2 });
    const spots: Vec2[] = [];
    for (let x = a.x + r; x <= a.x + a.w - r; x += gap) spots.push({ x, y: p.y });
    for (let y = a.y + r; y <= a.y + a.h - r; y += gap) spots.push({ x: p.x, y });
    // 플레이어에게서 가까운 것부터
    spots.sort((u, v) => Math.hypot(u.x - p.x, u.y - p.y) - Math.hypot(v.x - p.x, v.y - p.y));
    const sword = c.art('sword');
    spots.forEach((s, i) =>
      this.at(i * c.v('stepSec'), () => {
        c.host.addHazard(new DelayedBlast(c.host.scene, s, r, c.v('delaySec'), c.v('damage'), c.boss.color, { hit: c.art('blastHit') }));
        if (sword && i % 2 === 0) fallSprite(c.host.scene, sword, s, c.v('delaySec'), r * 3, c.boss.fxColor);
      }),
    );
  }
}

/** 추락성 강타 (오리온의 성전사): 플레이어가 갈 자리에 별이 떨어진다 */
export class FallingStar extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    for (let i = 0; i < c.v('stars'); i++) {
      this.at(i * c.v('stepSec'), () => hblast(c, predict(c, c.v('delaySec'), i === 0 ? 0 : c.v('spread')), c.v('radius'), c.v('delaySec'), c.v('damage')));
    }
  }
}

/** 삼연성 성역 (오리온의 성전사): 플레이어를 지나는 한 줄에 별 셋의 성역이 깔린다 */
export class BeltSanctuary extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.host.playerPos();
    const side = angleTo(c.boss.pos(), p) + Math.PI / 2;
    const r = c.v('radius');
    const spots = [-1, 0, 1].map((k) => clampTo({ x: p.x + Math.cos(side) * k * c.v('gap'), y: p.y + Math.sin(side) * k * c.v('gap') }, c, r));
    for (const s of spots) c.host.addHazard(new Zone(c.host.scene, s, r, c.v('liveSec'), c.v('damage'), c.v('tickSec'), c.boss.color, 0, c.v('delaySec'), c.art('zone')));
  }
}

/** 사냥꾼의 서약 (오리온의 성전사): 플레이어에게 표식을 남기고, 잠시 뒤 그 자리에 성검 셋이 꽂힌다 */
export class HunterOath extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const at = clampTo(c.host.playerPos(), c, c.v('radius'));
    fx(c, 'oath', at, { w: c.v('radius') * 2.6, depth: 7 });
    hblast(c, at, c.v('radius'), c.v('delaySec'), c.v('damage'));
  }
}

/** 별사냥의 심판 (오리온의 성전사 성광): 크게 숨을 고른 뒤 넓은 별빛 초승달로 앞을 벤다 */
export class StarHunt extends Timed {
  constructor(c: PatternCtx) {
    super(c);
    const p = c.boss.pos();
    const a = angleTo(p, c.host.playerPos());
    fx(c, 'prayer', p, { w: c.boss.radius() * 3.5, depth: 7 });
    c.host.addHazard(new SectorBlast(c.host.scene, p, a, c.v('radius'), c.v('arcDeg'), c.v('windupSec'), c.v('damage'), c.boss.color, c.art('sectorHit')));
    this.at(c.v('windupSec'), () => shake(c.host.scene, 'heavy'));
  }
}

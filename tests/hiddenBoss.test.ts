import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { availablePatterns, initialBoss, stepBoss } from '../src/systems/bossBrain';
import { IMPLEMENTED_ENCOUNTERS } from '../src/systems/encounter';
import { encounterKinds, hiddenChapterMul, pickHiddenBoss } from '../src/systems/hiddenBoss';
import { activeEffects, dodgeValues, roarValues, rollItem, shieldValues } from '../src/systems/items';
import { rollWeapon } from '../src/systems/loot';
import { bounceStep, signatureFires, steerToward } from '../src/systems/motion';

const B = gameData.bosses;
const H = B.hiddenBosses;
const ids = H.map((h) => h.id);
const item = (id: string) => gameData.items.items.find((x) => x.id === id)!;
const weapon = (id: string) => gameData.weapons.weapons.find((x) => x.id === id)!;
const G = gameData.groupMultipliers;

describe('히든보스 데이터 (기획서 표)', () => {
  it('3명, 전용 무기·아이템이 짝지어져 있다', () => {
    expect(H.map((h) => [h.id, h.weaponId, h.itemId])).toEqual([
      ['ancestorEcho', 'rasalgethiClub', 'deathWhistle'],
      ['royalMage', 'aviorStaff', 'royalSeal'],
      ['orionCrusader', 'rasalhagueSword', 'orionShield'],
    ]);
    for (const h of H) {
      expect(gameData.enemies.enemies.find((e) => e.id === h.id)!.rank).toBe('hiddenBoss');
      expect(weapon(h.weaponId).grade).toBe('unique');
      expect(item(h.itemId)).toMatchObject({ grade: h.itemId === 'deathWhistle' ? 'legendary' : 'unique', pool: 'hiddenBoss', bossId: h.id });
    }
  });
  it('세 명 모두 페이즈2가 있고 강화 패턴이 하나씩 더해진다', () => {
    for (const h of H) expect(h.patterns.filter((p) => p.phase === 2).length).toBeGreaterThanOrEqual(1);
  });
  it('기획서 핵심 패턴', () => {
    const pats = (id: string) => H.find((h) => h.id === id)!.patterns.filter((p) => p.phase === 1).map((p) => p.id);
    expect(pats('ancestorEcho')).toEqual(['warCry', 'whirlDash', 'bleedField', 'groundBreak']);
    expect(pats('royalMage')).toEqual(['blinkBarrage', 'greatLaser', 'clones']);
    expect(pats('orionCrusader')).toEqual(['holySwords', 'maceSmash', 'shieldThrow']);
  });
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});

describe('등장 규칙', () => {
  it('이미 나온 히든보스는 다시 나오지 않는다', () => {
    for (let s = 0; s < 30; s++) expect(pickHiddenBoss(new Rng(s), H, ['ancestorEcho', 'royalMage'])!.id).toBe('orionCrusader');
    expect(pickHiddenBoss(new Rng(1), H, ids)).toBeNull();
  });
  it('셋 다 나왔으면 조우 판정에서 빠진다', () => {
    expect(IMPLEMENTED_ENCOUNTERS.has('hiddenBoss')).toBe(true);
    expect(encounterKinds(IMPLEMENTED_ENCOUNTERS, H, ['royalMage']).has('hiddenBoss')).toBe(true);
    expect(encounterKinds(IMPLEMENTED_ENCOUNTERS, H, ids).has('hiddenBoss')).toBe(false);
  });
  it('챕터 배율: 1 · 1.5 · 2, 표에 없으면 아래 챕터 값', () => {
    expect([1, 2, 3].map((c) => hiddenChapterMul(B, c))).toEqual([1, 1.5, 2]);
    expect(hiddenChapterMul({ hiddenChapterMul: { '1': 1, '2': 1.5 } }, 4)).toBe(1.5);
  });
});

describe('전용 무기·아이템은 다른 곳에서 나오지 않는다', () => {
  it('무기: 상자·상인 뽑기에 없다 (유니크는 전설 대체)', () => {
    const d = gameData.weapons;
    for (let s = 0; s < 200; s++) {
      const w = rollWeapon(new Rng(s), 'unique', d.weapons, d.options, G, gameData.loot.uniqueWeaponFallback);
      expect(['rasalgethiClub', 'aviorStaff', 'rasalhagueSword']).not.toContain(w.defId);
    }
  });
  it('아이템: 상자·첨탑 뽑기에 없다', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 400; s++) seen.add(rollItem(new Rng(s), { unique: 1 }, 0, gameData.items, new Set())!);
    for (const id of ['deathWhistle', 'royalSeal', 'orionShield']) expect(seen.has(id)).toBe(false);
  });
});

describe('보스 패턴 선택: 막힌 패턴', () => {
  it('분신이 살아 있으면 분신 소환을 고르지 않는다', () => {
    const P = [
      { id: 'clones', weight: 100, cooldownSec: 1, durationSec: 1, phase: 1 as const },
      { id: 'greatLaser', weight: 1, cooldownSec: 1, durationSec: 1, phase: 1 as const },
    ];
    expect(availablePatterns(initialBoss(0), P, 50, new Set(['clones'])).map((p) => p.id)).toEqual(['greatLaser']);
    const r = stepBoss(initialBoss(0), 0.1, 1, 50, P, { enrageAt: 0.5, gapSec: 0, enrageSec: 0 }, new Rng(1), new Set(['clones']));
    expect(r.events).toEqual([{ type: 'start', id: 'greatLaser' }]);
  });
});

describe('움직임', () => {
  const rect = { x: 0, y: 0, w: 100, h: 50 };
  it('벽에 닿으면 그 축 속도를 뒤집는다', () => {
    const r = bounceStep({ x: 90, y: 25 }, { x: 100, y: 0 }, 0.1, rect, 5);
    expect(r.bounces).toBe(1);
    expect(r.vel).toEqual({ x: -100, y: 0 });
    expect(r.pos.x).toBeCloseTo(90);
  });
  it('모서리는 두 번 튕긴 것으로 센다', () => {
    expect(bounceStep({ x: 94, y: 44 }, { x: 100, y: 100 }, 0.1, rect, 5).bounces).toBe(2);
  });
  it('벽에 닿지 않으면 그대로', () => {
    expect(bounceStep({ x: 50, y: 25 }, { x: 10, y: 10 }, 0.1, rect, 5)).toEqual({ pos: { x: 51, y: 26 }, vel: { x: 10, y: 10 }, bounces: 0 });
  });
  it('유도탄: 한 프레임에 turnRate*dt까지만 돌고 빠르기는 그대로', () => {
    const v = steerToward({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 100 }, 1, 0.1);
    expect(Math.atan2(v.y, v.x)).toBeCloseTo(0.1);
    expect(Math.hypot(v.x, v.y)).toBeCloseTo(100);
    const w = steerToward({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 1 }, 5, 0.1);
    expect(Math.atan2(w.y, w.x)).toBeCloseTo(Math.atan2(1, 100));
  });
  it('고유 효과는 every번째 공격마다', () => {
    expect([1, 2, 3, 4, 5, 6].map((n) => signatureFires(n, 3))).toEqual([false, false, true, false, false, true]);
  });
});

describe('전용 아이템 효과', () => {
  const eff = (id: string, job = 'magiScholar', school: 'hectar' | 'acro' | null = null) => activeEffects(item(id), { job, school }, G);
  it('바바리안 데스 휘슬: 함성 10초 피해 +20%·이동 +10%, 야만용사는 함성 효과 +20%', () => {
    expect(roarValues(eff('deathWhistle'))).toMatchObject({ durationSec: 10, damage: 0.2, moveSpeed: 0.1 });
    const b = roarValues(activeEffects(item('deathWhistle'), { job: 'warrior', school: 'barbarian' as never }, G))!;
    expect(b.damage).toBeCloseTo(0.24);
    expect(b.moveSpeed).toBeCloseTo(0.12);
  });
  it('특무 인장: 재사용 8초, 마기법사 6초', () => {
    expect(dodgeValues(eff('royalSeal'))).toMatchObject({ cooldownSec: 8, attacks: 3, bonus: 0.5 });
    expect(dodgeValues(eff('royalSeal', 'magiMage'))!.cooldownSec).toBe(6);
  });
  it('오리온의 방패: 6초마다, 기준 피해 800 × 발동 피해 배율, 튕김 3 (성기사 +2), 받는 피해 -15%', () => {
    const s = shieldValues(eff('orionShield'))!;
    expect(s).toMatchObject({ everySec: 6, bounces: 3, guard: 0.15 });
    expect(s.damage).toBeCloseTo(800 * G.itemGroups.procDamage);
    expect(shieldValues(activeEffects(item('orionShield'), { job: 'warrior', school: 'paladin' as never }, G))!.bounces).toBe(5);
  });
});

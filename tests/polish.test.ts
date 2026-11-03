import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { generateStage } from '../src/systems/mapgen';
import { availablePatterns, initialBoss } from '../src/systems/bossBrain';
import { bossHalfOrbs } from '../src/systems/bossEnergy';
import { cardPrice, cardStock, collectCoins, encounterPool, rollCoinDrops, rollWeapon } from '../src/systems/loot';
import { muzzleAngle, shotOrigin } from '../src/systems/targeting';
import { cardStillValid } from '../src/systems/cards';
import { enemyStageScale } from '../src/systems/champions';
import { readyWeaponSet } from '../src/systems/items';
import { weaponPose } from '../src/systems/motion';
import { chargedCrit, spinUpMul, weaponStats } from '../src/systems/weapons';

const D = gameData;
const hp = (id: string) => D.enemies.enemies.find((e) => e.id === id)!.maxHp;

describe('보스 체력', () => {
  it('전체적으로 늘었고 마기카이저가 가장 많다', () => {
    expect(hp('fusionAkgwi')).toBe(1080);
    expect(hp('electricRing')).toBe(2520);
    expect(hp('magiKaiser')).toBe(31200);
    for (const b of D.bosses.bosses) if (b.id !== 'magiKaiser') expect(hp('magiKaiser')).toBeGreaterThan(hp(b.id) * 2);
  });
  it('반피를 넘는 순간 한 번만 추가 구슬', () => {
    const r = D.bosses.energyDrops;
    expect(bossHalfOrbs(0.6, 0.45, r)).toBe(r.halfHpOrbs);
    expect(bossHalfOrbs(0.45, 0.3, r)).toBe(0);
    expect(bossHalfOrbs(0.9, 0.8, r)).toBe(0);
    expect(r.halfHpOrbs).toBeGreaterThan(0);
  });
});

describe('보스 패턴 근접·원거리', () => {
  const all = [...D.bosses.bosses, ...D.bosses.hiddenBosses].flatMap((b) => b.patterns);
  it('모든 패턴이 분류되어 있고 근접은 거리 제한이 있다', () => {
    for (const p of all) {
      expect(['melee', 'ranged'], p.id).toContain(p.reach);
      if (p.reach === 'melee') expect(p.maxRange, p.id).toBeGreaterThan(0);
      else expect(p.maxRange, p.id).toBeUndefined();
    }
  });
  it('멀리 있으면 근접 패턴을 쓰지 않는다', () => {
    const boss = D.bosses.bosses.find((b) => b.id === 'fusionAkgwi')!;
    const far = availablePatterns(initialBoss(0), boss.patterns, 500).map((p) => p.id);
    expect(far).not.toContain('claw');
    expect(far).toContain('spiritBlast');
    expect(far).toContain('eruption');
    expect(availablePatterns(initialBoss(0), boss.patterns, 30).map((p) => p.id)).toContain('claw');
  });
});

describe('전투 없는 방', () => {
  it('시작 방·포탈 방·평화로운 조우 칸은 작고 장애물이 없다', () => {
    const small = D.mapgen.roomSizes.find((s) => s.id === D.mapgen.encounterPeaceful.size)!;
    let peaceful = 0;
    let fight = 0;
    for (let seed = 1; seed < 80; seed++) {
      for (const n of generateStage(seed, 1, 1, D.mapgen).rooms) {
        if (n.kind === 'startRoom' || n.kind === 'exitRoom' || n.peaceful) {
          expect(n.size, n.kind).toEqual({ w: small.w, h: small.h });
          expect(n.layout ?? null).toBeNull();
        }
        if (n.kind === 'encounterRoom') n.peaceful ? peaceful++ : fight++;
      }
    }
    expect(peaceful).toBeGreaterThan(0);
    expect(fight).toBeGreaterThan(0);
  });
  it('소품 규칙이 시작·포탈 방에 없다', () => {
    expect(D.mapgen.roomProps.rules.startRoom).toBeUndefined();
    expect(D.mapgen.roomProps.rules.exitRoom).toBeUndefined();
  });
  it('평화로운 칸 확률은 보물·상인 가중치와 맞는다', () => {
    const w = D.loot.encounter.weights;
    const sum = Object.values(w).reduce((a, b) => a + b, 0);
    expect(D.mapgen.encounterPeaceful.chance).toBeCloseTo((w.treasure + w.merchant + w.skillShop) / sum, 2);
  });
  it('평화로운 칸은 보물·상점만, 아니면 전투 유형만', () => {
    const all = new Set(Object.keys(D.loot.encounter.weights) as (keyof typeof D.loot.encounter.weights)[]);
    expect([...encounterPool(all, true)].sort()).toEqual(['merchant', 'skillShop', 'treasure']);
    expect(encounterPool(all, false).has('merchant')).toBe(false);
    expect(encounterPool(all, false).has('raid')).toBe(true);
  });
  it('시드 RNG 재현', () => {
    expect(generateStage(5, 1, 1, D.mapgen).rooms.map((n) => n.peaceful)).toEqual(generateStage(5, 1, 1, D.mapgen).rooms.map((n) => n.peaceful));
    void Rng;
  });
});

describe('정신력', () => {
  it('정신력 회복이 느려졌다', () => {
    expect(D.player.sanity.regenPerSec).toBeLessThan(2);
  });
});

describe('화면 수치', () => {
  it('무기는 몸 가운데', () => {
    expect(D.player.weaponHand.x).toBe(0);
  });
  it('사망 연출 시간이 있다', () => {
    expect(D.juice.playerDeath.sec).toBeGreaterThan(0.5);
  });
});

describe('스킬 상점', () => {
  const owned = { level: 1, awakened: false, order: 0 };
  const lo = (o: Record<string, typeof owned>) => ({ active: [null, null, null, null], passive: null, owned: o }) as never;
  it('카드 종류별 가격: 스킬 상점 100', () => {
    expect(cardPrice({ kind: 'skillNew', skillId: 'x' }, D.loot)).toBe(D.loot.skillShop.prices.skillNew);
    expect(D.loot.skillShop.prices).toEqual({ skillNew: 100, skillLevelUp: 100 });
  });
  it('진열 카드는 아직 안 팔렸다', () => {
    expect(cardStock([{ kind: 'skillNew', skillId: 'x' }], D.loot)[0]).toMatchObject({ sold: false, price: D.loot.skillShop.prices.skillNew });
  });
  it('그사이 같은 스킬을 얻었으면 진열 카드는 무효', () => {
    expect(cardStillValid({ kind: 'skillNew', skillId: 'magiField' }, lo({}), D.skills)).toBe(true);
    expect(cardStillValid({ kind: 'skillNew', skillId: 'magiField' }, lo({ magiField: owned }), D.skills)).toBe(false);
    expect(cardStillValid({ kind: 'skillLevelUp', skillId: 'magiField' }, lo({ magiField: { ...owned, level: D.skills.maxLevel } }), D.skills)).toBe(false);
  });
});

describe('후반 체력', () => {
  const t = D.enemies.hpScale;
  it('1장은 그대로, 2·3장은 스테이지가 갈수록 커진다', () => {
    expect(enemyStageScale(1, 5, t)).toBe(1);
    expect(enemyStageScale(2, 1, t)).toBeGreaterThan(1);
    expect(enemyStageScale(2, 5, t)).toBeGreaterThan(enemyStageScale(2, 1, t));
    expect(enemyStageScale(3, 1, t)).toBeGreaterThan(enemyStageScale(2, 5, t));
    expect(enemyStageScale(3, 5, t)).toBeGreaterThan(enemyStageScale(3, 1, t));
  });
  it('뒤 챕터 보스일수록 체력이 많다', () => {
    const order = ['electricRing', 'hectarChief', 'magiGolem', 'eclipse', 'magiKaiser'].map(hp);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('든 무기의 움직임', () => {
  it('총: 쏘자마자 가장 크게 뒤로 튕기고 위로 들렸다 제자리로', () => {
    const o = { rad: 0.2, px: 5 };
    expect(weaponPose('recoil', 0, o)).toEqual({ rot: -0.2, push: -5 });
    expect(Math.abs(weaponPose('recoil', 0.5, o).push)).toBeLessThan(5);
    expect(weaponPose('recoil', 1, o).push === 0 || Object.is(weaponPose('recoil', 1, o).push, -0)).toBe(true);
  });
  it('휘두르기: 한쪽 끝에서 반대쪽 끝으로 가고, 방향을 뒤집을 수 있으며, 제자리로 돌아온다', () => {
    const p = { rad: 1, sign: 1 };
    expect(weaponPose('swing', 0.12, p).rot).toBeCloseTo(1);
    expect(weaponPose('swing', 0.64, p).rot).toBeLessThan(-0.9);
    expect(weaponPose('swing', 1, p).rot).toBeCloseTo(0);
    expect(weaponPose('swing', 0.12, { rad: 1, sign: -1 }).rot).toBeCloseTo(-1);
  });
  it('내려찍기: 위에서 아래로, 찌르기: 앞으로 나갔다 돌아온다', () => {
    const s = { rad: -2, toRad: 0.5 };
    expect(weaponPose('smash', 0.12, s).rot).toBeCloseTo(-2);
    expect(weaponPose('smash', 0.64, s).rot).toBeGreaterThan(0.4);
    expect(weaponPose('thrust', 0.35, { px: 14 }).push).toBeCloseTo(14);
    expect(weaponPose('thrust', 1, { px: 14 }).push).toBeCloseTo(0);
  });
});

describe('무기 밸런스', () => {
  const g = D.groupMultipliers.grades;
  const w = (id: string) => D.weapons.weapons.find((x) => x.id === id)!;
  it('등급이 오를수록 피해·에너지 배율이 커진다', () => {
    for (let i = 1; i < g.length; i++) {
      expect(g[i]!.damageMultiplier).toBeGreaterThan(g[i - 1]!.damageMultiplier);
      expect(g[i]!.energyMultiplier).toBeGreaterThan(g[i - 1]!.energyMultiplier);
    }
    const st = weaponStats(w('rifle'), { defId: 'rifle', grade: 'rare', options: [] }, 1.4, 1.5);
    expect(st.damage).toBeCloseTo(7);
    expect(st.energyCost).toBeCloseTo(1.5);
  });
  it('저격총·대검은 레어, 장검은 없다, 전설은 모두 추가 능력이 있다', () => {
    expect(w('sniper').grade).toBe('rare');
    expect(w('greatsword').grade).toBe('rare');
    expect(D.weapons.weapons.some((x) => x.id === 'longsword')).toBe(false);
    for (const x of D.weapons.weapons.filter((y) => y.grade === 'legendary')) {
      expect(!!(x.signature || x.pierce || x.chargeMoveSpeed || x.meleeShot || x.charge), x.id).toBe(true);
    }
  });
  it('활은 차징 무기, 화살 그림이 있다', () => {
    const bows = D.weapons.weapons.filter((x) => x.category === 'bow');
    expect(bows.map((x) => x.id).sort()).toEqual(['curvedBow', 'zephyr']);
    for (const b of bows) {
      expect(b.charge, b.id).toBeDefined();
      expect(b.shot, b.id).toBeDefined();
    }
  });
  it('MG70: 쏠수록 빨라지고 상한이 있다', () => {
    const s = w('mg70').spinUp!;
    expect(spinUpMul(1, s)).toBe(1);
    expect(spinUpMul(5, s)).toBeGreaterThan(1);
    expect(spinUpMul(10000, s)).toBe(s.maxMul);
  });
  it('반물질 권총은 차징이 모자라면 나가지 않는다', () => {
    expect(w('antimatterPistol').charge!.minRatio).toBeGreaterThan(0);
  });
});

describe('무기 옵션·치명타', () => {
  const w = (id: string) => D.weapons.weapons.find((x) => x.id === id)!;
  it('어떤 등급의 무기도 무작위 옵션이 붙지 않는다', () => {
    for (const g of ['common', 'rare', 'legendary', 'unique'] as const) {
      for (let s = 0; s < 40; s++) expect(rollWeapon(new Rng(s), g, D.weapons.weapons, D.weapons.options, D.groupMultipliers, D.loot.uniqueWeaponFallback).options).toEqual([]);
    }
  });
  it('저격총·검 계열은 치명타 30%', () => {
    for (const id of ['sniper', 'soulCalibur', 'dagger', 'brokenBlade', 'greatsword', 'hanabi', 'alGulBlade', 'rasalhagueSword', 'magiFang']) expect(w(id).critChance, id).toBe(0.3);
  });
  it('활은 차징할수록 치명타가 올라 최대 70%', () => {
    for (const id of ['curvedBow', 'zephyr']) {
      const max = w(id).charge!.critAtMax;
      expect(max, id).toBe(0.7);
      expect(chargedCrit(0, 0, max)).toBe(0);
      expect(chargedCrit(0, 0.5, max)).toBeCloseTo(0.35);
      expect(chargedCrit(0, 1, max)).toBeCloseTo(0.7);
    }
    expect(chargedCrit(0.3, 1, undefined)).toBe(0.3);
  });
});

describe('에너지', () => {
  it('에너지 구슬 하나가 6', () => {
    expect(D.player.energy.orbValue).toBe(6);
  });
});

describe('가까운 적 사격', () => {
  const body = { x: 0, y: 0 };
  const muzzle = { x: 20, y: -6 };
  it('몸과 총구 사이에 적이 있으면 몸에서 쏜다', () => {
    expect(shotOrigin(body, muzzle, [{ x: 10, y: -3, radius: 4 }])).toEqual(body);
    expect(shotOrigin(body, muzzle, [{ x: 2, y: 0, radius: 4 }])).toEqual(body);
  });
  it('적이 총구 너머나 다른 쪽에 있으면 총구에서 쏜다', () => {
    expect(shotOrigin(body, muzzle, [{ x: 60, y: 0, radius: 4 }])).toEqual(muzzle);
    expect(shotOrigin(body, muzzle, [{ x: -30, y: 0, radius: 4 }])).toEqual(muzzle);
  });
  it('가까운 적도 총구 높이 차이를 보정해 겨눈다', () => {
    expect(D.player.muzzleMinTargetPx).toBeLessThan(8);
    expect(muzzleAngle(muzzle, { x: 30, y: 0 }, 0, D.player.muzzleMinTargetPx)).toBeCloseTo(Math.atan2(6, 10));
  });
});

describe('마기 입자 정수', () => {
  it('소수 부분은 넘겨 두었다가 1이 되면 더한다', () => {
    expect(collectCoins(0, 0.5)).toEqual({ whole: 0, carry: 0.5 });
    expect(collectCoins(0.5, 0.5)).toEqual({ whole: 1, carry: 0 });
    const r = collectCoins(0.5, 1.75);
    expect(r.whole).toBe(2);
    expect(r.carry).toBeCloseTo(0.25);
    let coins = 0;
    let carry = 0;
    for (let i = 0; i < 7; i++) {
      const g = collectCoins(carry, 0.5);
      coins += g.whole;
      carry = g.carry;
      expect(Number.isInteger(coins)).toBe(true);
    }
    expect(coins).toBe(3);
  });
});

describe('포탑·역장', () => {
  const sk = (id: string) => D.skills.skills.find((x) => x.id === id)!;
  it('포탑은 개수 제한 대신 유지시간, 레벨마다 늘어 재사용보다 길어진다', () => {
    const lv = sk('magiTurret').levels;
    expect(lv.some((l) => l.values.maxCount !== undefined)).toBe(false);
    expect(lv[1]!.values.lifeSec!).toBeGreaterThan(lv[0]!.values.lifeSec!);
    expect(lv[2]!.values.lifeSec!).toBeGreaterThan(lv[1]!.values.lifeSec!);
    expect(lv[2]!.values.lifeSec! / lv[2]!.cooldownSec).toBeGreaterThan(lv[0]!.values.lifeSec! / lv[0]!.cooldownSec);
  });
  it('마기역장은 겹치지 않는다', () => {
    for (const l of sk('magiField').levels) expect(l.values.maxHits).toBe(1);
    expect(sk('magiField').awakening.values.maxHits).toBe(1);
  });
  it('런 시작은 빈손, 시작 상자는 낮은 등급 + 전설 1%', () => {
    expect(D.loot.startChest).toEqual({ common: 80, rare: 19, legendary: 1 });
  });
});

describe('적 피해 배율', () => {
  const t = D.enemies.damageScale;
  it('1장부터 늘고 뒤로 갈수록 커진다', () => {
    const order = [[1, 1], [1, 5], [2, 1], [2, 5], [3, 1], [3, 5]].map(([c, s]) => enemyStageScale(c!, s!, t));
    expect(order[0]).toBeGreaterThan(1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(new Set(order).size).toBe(order.length);
  });
});

describe('무기 세트', () => {
  const sets = D.items.weaponSets;
  it('부러진 칼날 + 망가진 손잡이 = 알 굴 참마검', () => {
    expect(sets).toContainEqual({ weapon: 'brokenBlade', item: 'brokenHilt', result: 'alGulBlade' });
    expect(readyWeaponSet([null, { defId: 'brokenBlade' }], ['brokenHilt'], sets)).toMatchObject({ slot: 1 });
    expect(readyWeaponSet([{ defId: 'pistol' }, null], ['brokenHilt'], sets)).toBeNull();
    expect(readyWeaponSet([{ defId: 'brokenBlade' }, null], [], sets)).toBeNull();
  });
  it('결과물은 일반 경로로 나오지 않는다', () => {
    expect(D.weapons.weapons.find((w) => w.id === 'alGulBlade')!.droppable).toBe(false);
    for (const s of D.items.sets) expect(D.items.items.find((i) => i.id === s.result)!.pool).toBe('set');
    for (let seed = 0; seed < 300; seed++) expect(rollWeapon(new Rng(seed), 'unique', D.weapons.weapons, D.weapons.options, D.groupMultipliers, D.loot.uniqueWeaponFallback).defId).not.toBe('alGulBlade');
  });
});

describe('조우 칸 수', () => {
  it('스테이지마다 1개, 확률적으로 2개', () => {
    let two = 0;
    const n = 400;
    for (let seed = 1; seed <= n; seed++) {
      const c = generateStage(seed, 1, 1, D.mapgen).rooms.filter((r) => r.kind === 'encounterRoom').length;
      expect([1, 2]).toContain(c);
      if (c === 2) two++;
    }
    expect(two / n).toBeGreaterThan(D.mapgen.extraEncounterChance - 0.1);
    expect(two / n).toBeLessThan(D.mapgen.extraEncounterChance + 0.1);
  });
});

describe('스킬 피해', () => {
  it('레벨이 오를수록, 각성하면 더 세다', () => {
    const sk = D.skills.skills.find((x) => x.id === 'railgun')!;
    expect(sk.levels[1]!.values.damage).toBe(34);
    expect(sk.levels[2]!.values.damage).toBe(49);
    expect(sk.awakening.values.damage).toBe(52);
    expect(sk.levels[0]!.values.damage).toBe(20);
    expect(D.skills.skills.find((x) => x.id === 'mkPrototype')!.levels[2]!.values.damageReduction).toBe(0.3);
  });
});

describe('회복·재화', () => {
  const cd = (id: string) => (D.items.items.find((i) => i.id === id)!.effects[0] as { cooldownSec: number }).cooldownSec;
  it('회복 아이템 재사용 3배', () => {
    expect(cd('magicasol')).toBe(60);
    expect(cd('hanwooSteak')).toBe(0);
  });
  it('마기 입자 획득 절반', () => {
    expect(D.pickups.coin.value).toBe(1);
    expect(D.pickups.coin.dropRate).toBe(0.5);
    let n = 0;
    const rng = new Rng(3);
    for (let i = 0; i < 4000; i++) n += rollCoinDrops(rng, 1, D.pickups.coin.dropRate);
    expect(n / 4000).toBeCloseTo(0.5, 1);
    expect(rollCoinDrops(new Rng(1), 5, 1)).toBe(5);
  });
  it('토마끼는 변이 공격을 쓰지 않는다', () => {
    expect(D.enemies.enemies.find((e) => e.id === 'tomakki')!.noEliteAttacks).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { itemDescParams } from '../src/ui/itemCard';
import { validateGameData } from '../src/data/validate';
import {
  activeEffects,
  chapterWeights,
  effectiveWeights,
  itemDamageMultiplier,
  itemTotals,
  healReady,
  pickHeal,
  pickItem,
  readySet,
  itemChoices,
  rollItem,
  scaleEffect,
  transferWeight,
  combineGrade,
  combinableItems,
} from '../src/systems/items';

const I = gameData.items;
const G = gameData.groupMultipliers;
const item = (id: string) => I.items.find((x) => x.id === id)!;
const totals = (ids: string[], school: 'hectar' | 'acro' | null = null) =>
  itemTotals(ids, I, { school, job: 'magiScholar' }, G);

describe('아이템 목록 (기획서 표)', () => {
  it('일반 5·레어 12·전설 8·유니크 6·신화 1 + 세트 1 + 보스 전용', () => {
    const by = (g: string) => I.items.filter((x) => x.pool === 'normal' && x.grade === g).length;
    expect([by('common'), by('rare'), by('legendary'), by('unique'), by('mythic')]).toEqual([5, 12, 8, 6, 1]);
    expect(I.items.filter((x) => x.pool === 'set').map((x) => x.id)).toEqual(['warriorMemory']);
    expect(I.items.filter((x) => x.pool === 'boss').map((x) => [x.id, x.bossId])).toEqual([
      ['wonhonLump', 'fusionAkgwi'],
      ['hectarRam', 'hectarChief'],
    ]);
  });
  it('데이터 검증 통과', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });
});

describe('그룹 배율', () => {
  it('실제 값 = 기준값 × 그룹 배율', () => {
    const helm = scaleEffect(item('namelessHelm').effects[0]!, G);
    expect(helm).toMatchObject({ value: 10 * G.itemGroups.hpFlat });
  });
  it('그룹 배율 하나를 바꾸면 그 그룹 아이템이 같이 바뀐다', () => {
    const g2 = structuredClone(G);
    g2.itemGroups.hpFlat = 2;
    const t = itemTotals(['brokenHilt', 'afroBelt'], I, { school: null, job: 'magiScholar' }, g2);
    expect(t.maxHp).toBe(60);
  });
});

describe('효과 합산', () => {
  it('같은 종류의 +%는 더한 뒤 한 번 곱한다', () => {
    const t = totals(['namelessSword', 'combatTheory', 'leeSeal']);
    expect(t.damage.all).toBeCloseTo(0.07 + 0.15);
    expect(itemDamageMultiplier(t, 0, false, null)).toBeCloseTo(1.22);
  });
  it('신검 영디·마기만 있으면 4배', () => {
    expect(itemDamageMultiplier(totals(['divineSword']), 0, false, null)).toBeCloseTo(4);
  });
  it('모든 적이 받는 피해·보스 피해는 따로 곱한다', () => {
    const t = totals(['magowikiCodex']);
    expect(itemDamageMultiplier(t, 0, false, null)).toBeCloseTo(1.15 * 1.05);
  });
  it('각성 아이템 효과: 태그 피해·쿨타임·정신력·탄수·받는 피해', () => {
    expect(totals(['magnetResonator'])).toMatchObject({ damage: { tech: 0.07, magic: 0.07 }, moveSpeed: 0.1 });
    expect(totals(['magowikiCodex']).energyGain).toBeCloseTo(0.05);
    expect(totals(['lk99', 'warDiary', 'helaCell']).skillCooldown).toBeCloseTo(0.28);
    expect(totals(['warDiary'])).toMatchObject({ lifesteal: 0.005, damage: { magic: 0, tech: 0 } });
    expect(totals(['helaCell']).maxSanity).toBe(15);
    expect(totals(['extraArms']).pellets).toBe(1);
    expect(totals(['forbiddenVirus']).damage.magic).toBeCloseTo(0.05);
    expect(totals(['forbiddenGift']).damageTaken).toBeCloseTo(-0.1);
    expect(totals(['steelCastleFigure'])).toMatchObject({ maxHp: 20, damageTaken: 0.05, maxEnergy: 20 });
  });
  it('각성 아이템은 모두 일반 풀 또는 보스 드롭에 있다', () => {
    const skills = gameData.skills.skills.map((s) => s.awakening.requiredItem);
    expect(new Set(skills).size).toBe(skills.length);
    for (const id of skills) expect(['normal', 'boss']).toContain(item(id).pool);
    const ult = gameData.ultimates.ultimates.filter((u) => u.awakening).map((u) => u.awakening!.requiredItem);
    expect(ult.sort()).toEqual(['atrosCodex', 'regulusShard']);
  });
  it('실험용 반물질: 모두 기술 피해 +10%, 헥타르 외에는 자동 발사, 헥타르는 반물질포 피해 +50%', () => {
    const kinds = (school: 'hectar' | 'acro' | null) => activeEffects(item('antimatterSample'), { school, job: 'magiScholar' }, G).map((e) => e.kind);
    expect(kinds(null)).toEqual(['autoCast', 'damage']);
    expect(kinds('acro')).toEqual(['autoCast', 'damage']);
    expect(kinds('hectar')).toEqual(['skillDamage', 'damage']);
    expect(totals(['antimatterSample']).damage.tech).toBeCloseTo(0.1);
    expect(itemDamageMultiplier(totals(['antimatterSample'], 'hectar'), 0, false, 'antimatterCannon')).toBeCloseTo(1.5);
  });
  it('직업 변형은 그 직업일 때만 (마기학자에게는 없음)', () => {
    expect(activeEffects(item('deathWhistle'), { school: null, job: 'magiScholar' }, G).map((e) => e.kind)).toEqual(['roomRoar']);
  });
  it('레굴루스 부활은 헥타르만, 아크룩스 대성공은 아크로만', () => {
    const kinds = (id: string, school: 'hectar' | 'acro' | null) => activeEffects(item(id), { school, job: 'magiScholar' }, G).map((e) => e.kind);
    expect(kinds('regulusShard', 'hectar')).toContain('revive');
    expect(kinds('regulusShard', 'acro')).not.toContain('revive');
    expect(kinds('acruxCross', 'acro')).toContain('greatSuccess');
    expect(kinds('acruxCross', null)).not.toContain('greatSuccess');
    expect(kinds('acruxCross', null)).toContain('revive');
  });
});

describe('등급 가중치', () => {
  it('확률 이전: 얻은 등급의 가중치 2가 바로 위 등급으로, 유니크는 그대로', () => {
    let s = transferWeight({}, 'common', 2);
    s = transferWeight(s, 'rare', 2);
    expect(s).toEqual({ common: -2, rare: 0, legendary: 2 });
    expect(transferWeight(s, 'unique', 2)).toBe(s);
  });
  it('아이템 상자 표는 챕터별, 유니크 2·3·6%, 모두 합 100인 정수', () => {
    expect([1, 2, 3].map((ch) => chapterWeights(I.treasureWeights, ch).unique)).toEqual([2, 3, 6]);
    for (const ch of [1, 2, 3]) {
      const w = chapterWeights(I.treasureWeights, ch);
      expect(Object.values(w).every((v) => Number.isInteger(v))).toBe(true);
      expect(Object.values(w).reduce((s, v) => s + (v ?? 0), 0)).toBe(100);
    }
    // 표가 없는 챕터는 가장 가까운 아래 챕터 표
    expect(chapterWeights({ '1': 'a', '3': 'c' }, 2)).toBe('a');
  });
  it('가중치는 0 아래로 내려가지 않는다', () => {
    expect(effectiveWeights({ common: 1, rare: 1 }, { common: -5 }).common).toBe(0);
  });
});

describe('아이템 뽑기', () => {
  it('같은 아이템은 한 런에 한 번만', () => {
    const obtained = new Set<string>();
    for (let i = 0; i < 6; i++) {
      const id = pickItem(new Rng(i), 'common', I, obtained)!;
      expect(obtained.has(id)).toBe(false);
      obtained.add(id);
    }
    // 일반이 다 떨어지면 다른 등급에서
    expect(I.items.find((x) => x.id === pickItem(new Rng(1), 'common', I, obtained))!.grade).not.toBe('common');
  });
  it('보스 전용·세트 결과는 상자에서 나오지 않는다', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 400; s++) seen.add(rollItem(new Rng(s), I.treasureWeights['1']!, 0.001, I, new Set())!);
    for (const id of ['wonhonLump', 'warriorMemory']) expect(seen.has(id)).toBe(false);
  });
  it('신화 판정이 나면 신검 영디·마기', () => {
    expect(rollItem(new Rng(1), I.treasureWeights['1']!, 1, I, new Set())).toBe('divineSword');
  });
});

describe('회복·세트', () => {
  const c = (itemId: string, threshold: number, priority: number, ready = true) => ({ itemId, threshold, healTo: 0.8, priority, ready });
  it('동시 조건이면 생등심 → 스튜 → 마기카솔 순으로 하나만', () => {
    const cands = [c('magicasol', 0.5, 3), c('slimeStew', 0.5, 2), c('hanwooSteak', 0.1, 1)];
    expect(pickHeal(cands, 0.05)?.itemId).toBe('hanwooSteak');
    expect(pickHeal(cands, 0.4)?.itemId).toBe('slimeStew');
    expect(pickHeal([c('slimeStew', 0.5, 2, false), c('magicasol', 0.5, 3)], 0.4)?.itemId).toBe('magicasol');
    expect(pickHeal(cands, 0.6)).toBeNull();
  });
  it('생등심은 런당 3회, 쿨타임 회복은 대기로만 판정', () => {
    const steak = item('hanwooSteak').effects[0] as { cooldownSec: number; uses?: number };
    expect([0, 1, 2, 3].map((n) => healReady(steak, 0, n))).toEqual([true, true, true, false]);
    expect(healReady({ cooldownSec: 0 }, 0, 1)).toBe(false);
    expect(healReady({ cooldownSec: 60 }, 5, 9)).toBe(false);
    expect(healReady({ cooldownSec: 60 }, 0, 9)).toBe(true);
  });
  it('기획서 회복 순서와 데이터가 같다', () => {
    const pr = (id: string) => (item(id).effects[0] as { priority: number }).priority;
    expect(pr('hanwooSteak') < pr('slimeStew') && pr('slimeStew') < pr('magicasol')).toBe(true);
  });
  it('이름 없는 검 + 이름 없는 투구 → 어느 전사의 기억', () => {
    const m = ['namelessSword', 'namelessHelm'];
    expect(readySet(new Set(m), new Set(m), I.sets)?.result).toBe('warriorMemory');
    expect(readySet(new Set(['namelessSword']), new Set(['namelessSword']), I.sets)).toBeNull();
    expect(readySet(new Set(m), new Set(['warriorMemory']), I.sets)).toBeNull();
  });
});

describe('아이템 카드', () => {
  it('서로 다른 아이템 3장, 가진 아이템·보스 전용·세트 결과는 나오지 않는다', () => {
    const owned = new Set(['elegantMagi', 'leeSeal']);
    for (let seed = 0; seed < 100; seed++) {
      const ids = itemChoices(new Rng(seed), I.treasureWeights['1']!, 0.001, I, owned, 3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) {
        expect(owned.has(id)).toBe(false);
        expect(item(id).pool).toBe('normal');
      }
    }
  });
  it('남은 아이템이 모자라면 있는 만큼만', () => {
    const got = new Set(I.items.filter((x) => x.pool === 'normal').map((x) => x.id));
    got.delete('magicasol');
    expect(itemChoices(new Rng(3), I.treasureWeights['1']!, 0.001, I, got, 3)).toEqual(['magicasol']);
  });
});

describe('샹트포레의 기운', () => {
  it('레어, 최대 체력 +10, 자연 치유 2초마다 체력 1', () => {
    const def = I.items.find((x) => x.id === 'chantforetSpirit')!;
    expect(def.grade).toBe('rare');
    expect(def.effects).toEqual([{ kind: 'maxHp', value: 10, group: 'hpFlat' }, { kind: 'regen', value: 1, everySec: 2 }]);
  });
});

describe('아이템 조합기', () => {
  it('일반→레어→전설→유니크, 유니크·신화는 조합 불가(신화는 못 만든다)', () => {
    expect(['common', 'rare', 'legendary', 'unique', 'mythic'].map((g) => combineGrade(g as never))).toEqual(['rare', 'legendary', 'unique', null, null]);
  });
  it('같은 등급이 2개 이상인 것만 넣을 수 있다', () => {
    const commons = I.items.filter((x) => x.pool === 'normal' && x.grade === 'common').map((x) => x.id);
    const legendary = I.items.find((x) => x.pool === 'normal' && x.grade === 'legendary')!.id;
    const owned = [commons[0]!, commons[1]!, legendary];
    expect(combinableItems(owned, I, new Set(owned)).sort()).toEqual([commons[0]!, commons[1]!].sort());
  });
});


describe('브이로드 신규 아이템', () => {
  it('투르비용: 회피 쿨타임 -10%, 회피 시 3초 공격 속도 / 크레퓌스퀼: 치명타 +15%, 치명 피해 +25%', () => {
    const t = (id: string) => gameData.items.items.find((x) => x.id === id)!;
    expect(itemDescParams(t('tourbillon'), gameData.groupMultipliers)).toMatchObject({ v0: '10', dur1: '3' });
    expect(itemDescParams(t('crepuscule'), gameData.groupMultipliers)).toMatchObject({ v0: '15', v1: '25' });
    expect([t('tourbillon').grade, t('crepuscule').grade]).toEqual(['rare', 'legendary']);
    expect(gameData.items.codexLore.vroad).toEqual(expect.arrayContaining(['tourbillon', 'crepuscule']));
  });
});

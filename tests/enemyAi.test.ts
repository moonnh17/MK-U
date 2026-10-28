import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { assignElites, canBeElite, effectiveRank, eliteCount, eliteMods } from '../src/systems/elites';
import { initialAi, stepAi, type AiAttack, type AiState } from '../src/systems/enemyAi';
import type { EnemyRank } from '../src/types/data';

const slam: AiAttack = { id: 'slam', triggerRange: 30, windupSec: 0.5, actSec: 0.1, recoverSec: 0.4, cooldownSec: 2 };
const lunge: AiAttack = { id: 'lunge', triggerRange: 80, windupSec: 0.3, actSec: 0.2, recoverSec: 0.2, cooldownSec: 3 };

/** 이벤트를 모으며 sec만큼 돌린다 */
function run(s: AiState, sec: number, dist: number, attacks: AiAttack[], speedMul = 1) {
  const events: string[] = [];
  const dt = 0.05;
  for (let t = 0; t < sec - 1e-9; t += dt) {
    const r = stepAi(s, dt, dist, attacks, speedMul);
    s = r.state;
    events.push(...r.events.map((e) => `${e.type}:${e.attackId}`));
  }
  return { s, events };
}

describe('적 행동 상태 기계', () => {
  it('멀면 추격만 한다', () => {
    const r = run(initialAi([slam]), 1, 100, [slam]);
    expect(r.s.phase).toBe('chase');
    expect(r.events).toEqual([]);
  });

  it('사거리 안이면 예고 → 공격 → 후딜 → 추격', () => {
    const r = run(initialAi([slam]), 1.2, 20, [slam]);
    expect(r.events).toEqual(['windup:slam', 'strike:slam', 'end:slam']);
    expect(r.s.phase).toBe('chase');
    // 후딜이 끝나도 쿨타임이 남아 바로 다시 치지 않는다
    expect(r.s.cooldowns.slam).toBeGreaterThan(0);
  });

  it('예고 시간이 끝나야 친다', () => {
    const r = run(initialAi([slam]), 0.45, 20, [slam]);
    expect(r.events).toEqual(['windup:slam']);
    expect(r.s.phase).toBe('windup');
  });

  it('공격 목록 순서대로 우선한다', () => {
    const r = run(initialAi([lunge, slam]), 0.05, 20, [lunge, slam]);
    expect(r.events).toEqual(['windup:lunge']);
  });

  it('공격 속도 배율(신속)은 예고·후딜·쿨타임을 줄인다', () => {
    const normal = run(initialAi([slam]), 0.4, 20, [slam]);
    const fast = run(initialAi([slam]), 0.4, 20, [slam], 2);
    expect(normal.events).toEqual(['windup:slam']);
    expect(fast.events).toEqual(['windup:slam', 'strike:slam']);
  });

  it('첫 공격 지연', () => {
    const r = run(initialAi([slam], 1), 0.5, 20, [slam]);
    expect(r.events).toEqual([]);
  });
});

describe('엘리트', () => {
  const data = gameData.elites;
  const rank: Record<string, EnemyRank> = { a: 'normal', b: 'normal', c: 'normal', boss: 'boss' };

  it('3종: 거대·신속·폭발, 공통 크기 1.3배·체력 ×3', () => {
    expect(data.elites.map((e) => e.id)).toEqual(['giant', 'swift', 'explosive']);
    expect(data.common.scale).toBe(1.3);
    expect(data.common.hpMul).toBe(3);
  });

  it('거대는 받는 피해 −30%, 신속은 이동·공격 +50%·도약, 폭발은 지연 폭발', () => {
    const by = (id: string) => data.elites.find((e) => e.id === id)!;
    expect(eliteMods(by('giant'), data).damageTakenMul).toBeCloseTo(0.7);
    expect(eliteMods(by('swift'), data)).toMatchObject({ moveSpeedMul: 1.5, attackSpeedMul: 1.5 });
    expect(by('swift').extraAttacks?.[0]?.cooldownSec).toBe(4);
    expect(by('explosive').deathBlast?.delaySec).toBe(1);
    expect(eliteMods(null, data)).toEqual({ scale: 1, hpMul: 1, moveSpeedMul: 1, attackSpeedMul: 1, damageTakenMul: 1 });
  });

  it('웨이브당 수: X-1·X-2는 1, X-3 이후 1~2, 챕터마다 +1', () => {
    for (let s = 0; s < 30; s++) {
      expect(eliteCount(new Rng(s), 1, 1, data)).toBe(1);
      expect(eliteCount(new Rng(s), 1, 2, data)).toBe(1);
      const n = eliteCount(new Rng(s), 1, 4, data);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(2);
      expect(eliteCount(new Rng(s), 2, 1, data)).toBe(2);
    }
  });

  it('보스에게는 붙지 않고, 한 개체에 하나만', () => {
    expect(canBeElite('boss')).toBe(false);
    expect(canBeElite('normal')).toBe(true);
    for (let s = 0; s < 30; s++) {
      const r = assignElites(new Rng(s), ['a', 'boss', 'b'], 5, (id) => rank[id]!, data);
      expect(r[1]).toBeNull();
      expect(r.filter((x) => x !== null)).toHaveLength(2);
      for (const x of r) if (x) expect(['giant', 'swift', 'explosive']).toContain(x);
    }
  });

  it('정해진 수만큼, 시드가 같으면 같은 결과', () => {
    const a = assignElites(new Rng(9), ['a', 'b', 'c', 'a'], 1, (id) => rank[id]!, data);
    expect(a.filter((x) => x !== null)).toHaveLength(1);
    expect(assignElites(new Rng(9), ['a', 'b', 'c', 'a'], 1, (id) => rank[id]!, data)).toEqual(a);
  });

  it('엘리트가 붙은 일반 적은 등급 판정에서 엘리트', () => {
    expect(effectiveRank('normal', data.elites[0]!)).toBe('elite');
    expect(effectiveRank('normal', null)).toBe('normal');
  });

  it('데이터 검증: 엘리트 수가 3종이 아니거나 공격 수치가 빠지면 잡는다', () => {
    const d = structuredClone(gameData);
    d.elites.elites.pop();
    expect(validateGameData(d).some((e) => e.includes('elites: 3종'))).toBe(true);
    const d2 = structuredClone(gameData);
    const akgwi = d2.enemies.enemies.find((e) => e.id === 'akgwi')!;
    delete akgwi.attacks![0]!.radius;
    expect(validateGameData(d2).some((e) => e.includes('akgwi.attacks.slam.radius'))).toBe(true);
  });
});

describe('전술 연계·거리 유지', () => {
  it('쫓는 중이고 쿨타임이 끝났으면 바로 예고, 아니면 그대로', async () => {
    const { forceWindup, initialAi } = await import('../src/systems/enemyAi');
    const a = { id: 'burst', triggerRange: 100, windupSec: 0.6, actSec: 0.4, recoverSec: 0.5, cooldownSec: 2 };
    const s = initialAi([a]);
    const r = forceWindup(s, a);
    expect(r.started).toBe(true);
    expect(r.state).toMatchObject({ phase: 'windup', attackId: 'burst', left: 0.6 });
    expect(forceWindup(r.state, a).started).toBe(false);
    expect(forceWindup({ ...s, cooldowns: { burst: 1 } }, a).started).toBe(false);
  });
  it('거리 유지: 멀면 다가가고 가까우면 물러난다', async () => {
    const { keepDistanceStep } = await import('../src/systems/enemyAi');
    expect(keepDistanceStep(200, 90, 30)).toBe(1);
    expect(keepDistanceStep(100, 90, 30)).toBe(0);
    expect(keepDistanceStep(60, 90, 30)).toBe(-1);
  });
});

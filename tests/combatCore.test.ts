import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { bossOrbDrops } from '../src/systems/bossEnergy';
import { blinkTarget, dodgeConfig, dodgeReady, startDodge, stepDodge, zigzag, type DodgeConfig } from '../src/systems/dodge';
import { Rng } from '../src/core/rng';
import { buildPathField, pathDir, segmentClear } from '../src/systems/pathField';
import { muzzleAngle, muzzlePoint } from '../src/systems/targeting';

const cfg: DodgeConfig = { speed: 200, durationSec: 0.2, invulnSec: 0.3, cooldownSec: 1 };

describe('회피', () => {
  it('이동 중이면 이동 방향, 멈춰 있으면 조준 방향으로 구른다', () => {
    expect(startDodge(0, { x: 0, y: 1 }, { x: 1, y: 0 }, cfg)?.vel).toEqual({ x: 0, y: 200 });
    expect(startDodge(0, { x: 0, y: 0 }, { x: 1, y: 0 }, cfg)?.vel).toEqual({ x: 200, y: 0 });
  });
  it('조이스틱을 살짝 밀어도 속도는 같다', () => {
    const v = startDodge(0, { x: 0.3, y: 0 }, { x: 1, y: 0 }, cfg)!.vel;
    expect(v.x).toBeCloseTo(200);
  });
  it('재사용 대기 중이면 못 구른다', () => {
    const s = startDodge(0, { x: 1, y: 0 }, { x: 1, y: 0 }, cfg)!;
    expect(dodgeReady(s.cooldown)).toBe(false);
    expect(startDodge(s.cooldown, { x: 1, y: 0 }, { x: 1, y: 0 }, cfg)).toBeNull();
  });
  it('시간이 지나면 끝나고 재사용 대기가 줄어든다', () => {
    let s = startDodge(0, { x: 1, y: 0 }, { x: 1, y: 0 }, cfg)!;
    s = stepDodge(s, 0.25);
    expect(s.left).toBe(0);
    expect(s.invuln).toBeCloseTo(0.05);
    expect(s.cooldown).toBeCloseTo(0.75);
    s = stepDodge(s, 1);
    expect(s.invuln).toBe(0);
    expect(dodgeReady(s.cooldown)).toBe(true);
  });
  it('데이터의 무적은 구르는 시간보다 길고, 대기는 그보다 길다', () => {
    const d = gameData.player.dodge;
    expect(d.invulnSec).toBeGreaterThanOrEqual(d.durationSec);
    expect(d.cooldownSec).toBeGreaterThan(d.invulnSec);
  });
});

describe('전직 회피', () => {
  const base = gameData.player.dodge;
  it('전직 전은 회피, 헥타르는 점멸, 아크로는 진격', () => {
    expect(dodgeConfig(base, null).nameKey).toBe('dodge.name');
    expect(dodgeConfig(base, 'hectar').nameKey).toBe('dodge.hectar');
    expect(dodgeConfig(base, 'acro').nameKey).toBe('dodge.acro');
    expect(gameData.text['dodge.hectar']).toBe('점멸');
    expect(gameData.text['dodge.acro']).toBe('진격');
  });
  it('점멸은 막히기 직전까지만 간다', () => {
    const blocked = (x: number) => x >= 30;
    const to = blinkTarget({ x: 0, y: 0 }, { x: 1, y: 0 }, 48, 4, (x) => blocked(x));
    expect(to.x).toBe(28);
    expect(blinkTarget({ x: 0, y: 0 }, { x: 0, y: 1 }, 48, 4, (x) => blocked(x)).y).toBe(48);
  });
  it('번개는 양 끝이 정확하고 가운데는 흔들린다', () => {
    const pts = zigzag({ x: 0, y: 0 }, { x: 50, y: 0 }, 6, 7, new Rng(1));
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[pts.length - 1]).toEqual({ x: 50, y: 0 });
    expect(pts.slice(1, -1).some((p) => p.y !== 0)).toBe(true);
    expect(pts).toHaveLength(7);
  });
});

describe('적 길 찾기', () => {
  const area = { x: 0, y: 0, w: 100, h: 100 };
  // 가운데 세로 벽 (위쪽 칸만 뚫림)
  const wall = [{ x: 40, y: 20, w: 20, h: 80 }];

  it('장애물이 있으면 돌아가는 방향을 준다', () => {
    const f = buildPathField(area, wall, 10, 0);
    const goal = { x: 90, y: 90 };
    const d = pathDir(f, { x: 15, y: 90 }, goal)!;
    // 왼쪽 아래에서 오른쪽 아래로 가려면 먼저 위로 가야 한다
    expect(d.y).toBeLessThan(0);
  });
  it('따라가면 실제로 도착한다', () => {
    const f = buildPathField(area, wall, 10, 0);
    const goal = { x: 90, y: 90 };
    let p = { x: 15, y: 90 };
    for (let i = 0; i < 400 && Math.hypot(p.x - goal.x, p.y - goal.y) > 10; i++) {
      const d = pathDir(f, p, goal);
      if (!d) break;
      p = { x: p.x + d.x * 2, y: p.y + d.y * 2 };
      expect(wall[0]!.x < p.x && p.x < wall[0]!.x + wall[0]!.w && p.y > wall[0]!.y).toBe(false);
    }
    expect(Math.hypot(p.x - goal.x, p.y - goal.y)).toBeLessThanOrEqual(10);
  });
  it('목표가 구역 밖이면 null', () => {
    const f = buildPathField(area, wall, 10, 0);
    expect(pathDir(f, { x: 15, y: 90 }, { x: 500, y: 500 })).toBeNull();
  });
  it('시야: 장애물을 지나면 막힌다', () => {
    expect(segmentClear({ x: 10, y: 50 }, { x: 90, y: 50 }, wall)).toBe(false);
    expect(segmentClear({ x: 10, y: 10 }, { x: 90, y: 10 }, wall)).toBe(true);
  });
  it('시야: 여유 폭만큼 벽에서 떨어져야 한다', () => {
    expect(segmentClear({ x: 10, y: 15 }, { x: 90, y: 15 }, wall, 8)).toBe(false);
  });
});

describe('보스전 에너지', () => {
  const rule = { everyHpRatio: 0.1, orbs: 4 };
  it('경계를 넘을 때마다 구슬을 준다', () => {
    expect(bossOrbDrops(1, 0.95, rule)).toBe(0);
    expect(bossOrbDrops(0.95, 0.89, rule)).toBe(4);
    expect(bossOrbDrops(0.89, 0.55, rule)).toBe(12);
  });
  it('처치 순간에는 주지 않는다 (0 경계 제외)', () => {
    expect(bossOrbDrops(0.05, 0, rule)).toBe(0);
  });
  it('체력이 늘어도 주지 않는다', () => {
    expect(bossOrbDrops(0.5, 0.9, rule)).toBe(0);
  });
  it('권총만으로 첫 보스를 끝까지 쏠 수 있다', () => {
    const boss = gameData.enemies.enemies.find((e) => e.id === 'fusionAkgwi')!;
    const pistol = gameData.weapons.weapons.find((w) => w.id === 'pistol')!;
    const r = gameData.bosses.energyDrops;
    const shots = Math.ceil(boss.maxHp / pistol.baseDamage);
    const orbs = bossOrbDrops(1, 1 / boss.maxHp, r);
    expect(gameData.player.energy.max + orbs * gameData.player.energy.orbValue).toBeGreaterThanOrEqual(shots * pistol.energyCost);
  });
});

describe('총구', () => {
  it('총구는 손에서 조준 방향으로 나간다', () => {
    expect(muzzlePoint({ x: 10, y: 20 }, { x: 1, y: 0 }, 8)).toEqual({ x: 18, y: 20 });
  });
  it('목표가 있으면 총구에서 목표를 향한다', () => {
    expect(muzzleAngle({ x: 0, y: 0 }, { x: 0, y: 50 }, 0, 8)).toBeCloseTo(Math.PI / 2);
  });
  it('목표가 없거나 너무 가까우면 원래 각도', () => {
    expect(muzzleAngle({ x: 0, y: 0 }, null, 1, 8)).toBe(1);
    expect(muzzleAngle({ x: 0, y: 0 }, { x: 3, y: 0 }, 1, 8)).toBe(1);
  });
});

describe('1장 일반 적의 탄', () => {
  const def = (id: string) => gameData.enemies.enemies.find((e) => e.id === id)!;
  it('토마끼는 탄을 쏘지 않는다', () => {
    expect(def('tomakki').attacks ?? []).toHaveLength(0);
  });
  it('유령 사수는 거리를 두고 활을 쏘고, 1장 웨이브에 나온다', () => {
    const g = def('ghostShooter');
    expect(g.keepDistance).toBeGreaterThan(0);
    expect(g.attacks!.some((x) => x.kind === 'burst')).toBe(true);
    expect(gameData.waves.waves.some((w) => w.chapter === 1 && w.spawns.some((s) => s.enemy === 'ghostShooter'))).toBe(true);
  });
  it('악귀는 강타 때 충격 탄이 퍼진다', () => {
    const a = def('akgwi').attacks!.find((x) => x.kind === 'slam')!;
    expect(a.ring?.shots).toBeGreaterThan(0);
  });
});

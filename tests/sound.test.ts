import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { pitchFactor, SFX_IDS, SoundGate, soundLength, weaponSfx } from '../src/systems/sound';

const S = gameData.sounds;

describe('효과음 목록', () => {
  it('게임이 내는 소리와 sounds.json이 정확히 같다', () => {
    expect(Object.keys(S.sounds).sort()).toEqual([...SFX_IDS].sort());
  });
  it('데이터 검증 통과, 잘못된 층은 잡는다', () => {
    expect(validateGameData(gameData)).toEqual([]);
    const bad = { ...gameData, sounds: { ...S, sounds: { x: { layers: [{ wave: 'saw' as never, durSec: 0, volume: 2 }] } } } };
    const e = validateGameData(bad).join('\n');
    for (const k of ['wave', 'freq', 'durSec', 'volume']) expect(e).toContain(k);
  });
  it('소리 길이는 가장 늦게 끝나는 층', () => {
    expect(soundLength(S.sounds.warning!)).toBeCloseTo(0.66 + 0.18);
  });
});

describe('겹침 제한', () => {
  it('같은 소리는 간격 안에 다시 나지 않는다', () => {
    const g = new SoundGate(S);
    expect(g.tryPlay('hit', 0, 0.05)).toBe(true);
    expect(g.tryPlay('hit', 0.02, 0.05)).toBe(false);
    expect(g.tryPlay('hit', 0.05, 0.05)).toBe(true);
  });
  it('동시에 나는 수 상한 (끝난 소리는 빠진다)', () => {
    const g = new SoundGate(S);
    const max = S.sounds.playerHurt!.maxVoices!;
    expect(max).toBe(1);
    expect(g.tryPlay('playerHurt', 0, 1)).toBe(true);
    expect(g.tryPlay('playerHurt', 0.5, 1)).toBe(false);
    expect(g.tryPlay('playerHurt', 1.1, 1)).toBe(true);
  });
  it('없는 소리는 내지 않는다', () => {
    expect(new SoundGate(S).tryPlay('nope', 0, 1)).toBe(false);
  });
});

describe('음 높이·무기 소리', () => {
  it('음 높이 흔들림은 ±jitter 안, 같은 시드면 같다', () => {
    const r = new Rng(5);
    for (let i = 0; i < 50; i++) {
      const f = pitchFactor(r, S.pitchJitter);
      expect(Math.abs(f - 1)).toBeLessThanOrEqual(S.pitchJitter);
    }
    expect(pitchFactor(new Rng(1), 0.05)).toBe(pitchFactor(new Rng(1), 0.05));
  });
  it('칼은 휘두르기, 지팡이는 마법탄, 유탄은 발사음, 산탄총·저격총은 데이터대로', () => {
    const w = (id: string) => gameData.weapons.weapons.find((x) => x.id === id)!;
    expect(weaponSfx(w('longsword'))).toBe('swing');
    expect(weaponSfx(w('pistol'))).toBe('shotPistol');
    expect(weaponSfx(w('shotgun'))).toBe('shotShotgun');
    expect(weaponSfx(w('sniper'))).toBe('shotSniper');
    expect(weaponSfx(w('grenadeLauncher'))).toBe('shotLob');
    expect(weaponSfx(w('aviorStaff'))).toBe('shotStaff');
  });
});

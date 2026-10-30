import { describe, expect, it } from 'vitest';
import { parseLaunchConfig } from '../src/core/config';
import { computeZoom, renderScale } from '../src/core/scale';
import { formatText } from '../src/core/text';

describe('parseLaunchConfig', () => {
  it('?seed=123을 읽는다', () => {
    const c = parseLaunchConfig('?seed=123', 999);
    expect(c.seed).toBe(123);
    expect(c.seedFromUrl).toBe(true);
  });

  it('seed가 없거나 잘못되면 fallback을 쓴다', () => {
    expect(parseLaunchConfig('', 999).seed).toBe(999);
    expect(parseLaunchConfig('?seed=abc', 999).seed).toBe(999);
    expect(parseLaunchConfig('?seed=-5', 999).seedFromUrl).toBe(false);
  });

  it('debug와 ui를 읽는다', () => {
    const c = parseLaunchConfig('?debug=1&ui=mobile', 1);
    expect(c.debug).toBe(true);
    expect(c.ui).toBe('mobile');
    expect(parseLaunchConfig('?ui=tv', 1).ui).toBe('auto');
    expect(parseLaunchConfig('', 1).debug).toBe(false);
  });

  it('테스트 무기는 기본 켜짐, ?testWeapons=0이면 끔', () => {
    expect(parseLaunchConfig('', 1).testWeapons).toBe(true);
    expect(parseLaunchConfig('?testWeapons=0', 1).testWeapons).toBe(false);
  });
});

describe('computeZoom', () => {
  it('창에 꽉 차는 배율 (짧은 쪽 기준)', () => {
    expect(computeZoom(1920, 1080, 480, 270)).toBe(4);
    expect(computeZoom(1366, 768, 480, 270)).toBeCloseTo(768 / 270);
    expect(computeZoom(800, 360, 480, 270)).toBeCloseTo(360 / 270);
  });
});

describe('renderScale', () => {
  it('화면 실제 픽셀에 맞추되 범위 안', () => {
    expect(renderScale(1920, 1080, 1, 480, 270, 2, 4)).toBe(4);
    expect(renderScale(1366, 768, 1, 480, 270, 2, 4)).toBe(3);
    expect(renderScale(800, 600, 1, 480, 270, 2, 4)).toBe(2);
    expect(renderScale(3840, 2160, 2, 480, 270, 2, 4)).toBe(4);
  });

  it('세로로 쥔 폰도 가로 화면 기준', () => {
    expect(renderScale(390, 844, 3, 480, 270, 2, 3)).toBe(3);
  });
});

describe('formatText', () => {
  it('자리 표시자를 채우고 없는 키는 키를 돌려준다', () => {
    const table = { a: '{chapter}-{stage}' };
    expect(formatText(table, 'a', { chapter: 1, stage: 2 })).toBe('1-2');
    expect(formatText(table, 'missing')).toBe('missing');
  });
});

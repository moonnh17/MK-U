import { describe, expect, it } from 'vitest';
import { parseLaunchConfig } from '../src/core/config';
import { computeZoom } from '../src/core/scale';
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
});

describe('computeZoom', () => {
  it('PC는 정수 배, 최소 1', () => {
    expect(computeZoom(1920, 1080, 480, 270, 'pc')).toBe(4);
    expect(computeZoom(1366, 768, 480, 270, 'pc')).toBe(2);
    expect(computeZoom(400, 200, 480, 270, 'pc')).toBe(1);
  });

  it('모바일은 화면에 맞는 비정수 배', () => {
    expect(computeZoom(800, 360, 480, 270, 'mobile')).toBeCloseTo(360 / 270);
  });
});

describe('formatText', () => {
  it('자리 표시자를 채우고 없는 키는 키를 돌려준다', () => {
    const table = { a: '{chapter}-{stage}' };
    expect(formatText(table, 'a', { chapter: 1, stage: 2 })).toBe('1-2');
    expect(formatText(table, 'missing')).toBe('missing');
  });
});

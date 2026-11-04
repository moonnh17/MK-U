import { describe, expect, it } from 'vitest';
import { munEmblemSvg, munPoints } from '../src/ui/munEmblem';
import { gameData } from '../src/data/index';

describe('위협 등급 문양', () => {
  it('별은 꼭짓점이 두 배, 정다각형은 n개', () => {
    expect(munPoints(8, 40, 0.6).split(' ')).toHaveLength(16);
    expect(munPoints(5, 40).split(' ')).toHaveLength(5);
  });
  it('모든 등급이 숫자(미분류는 ?)가 든 SVG를 낸다', () => {
    const g = gameData.enemies.munGrades;
    for (const k of ['1', '2', '3', '4', '5', '6']) expect(munEmblemSvg(k, g[k]!, 20)).toContain(`>${k}</text>`);
    expect(munEmblemSvg('unknown', g.unknown!, 20)).toContain('>?</text>');
  });
  it('N문은 인장 테가 있고 N문급은 없다', () => {
    const g = gameData.enemies.munGrades;
    expect(munEmblemSvg('5', g['5']!, 20, true).length).toBeGreaterThan(munEmblemSvg('5', g['5']!, 20, false).length);
    expect(munEmblemSvg('5', g['5']!, 20, true)).toContain('r="55"');
    expect(munEmblemSvg('5', g['5']!, 20, false)).not.toContain('r="55"');
  });
});

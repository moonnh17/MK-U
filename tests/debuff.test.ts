import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { gameData } from '../src/data/index';
import { discardItem, isDebuff, pickDebuff, stripDebuffs } from '../src/systems/items';

const I = gameData.items;
const hectar = I.items.filter((x) => x.debuffSet === 'hectar').map((x) => x.id);
const acro = I.items.filter((x) => x.debuffSet === 'acro').map((x) => x.id);

describe('디버프 아이템', () => {
  it('헥타르·아크로 미모사가 8종씩 준다', () => {
    expect(hectar).toHaveLength(8);
    expect(acro).toHaveLength(8);
    for (const id of [...hectar, ...acro]) expect(isDebuff(I, id)).toBe(true);
    expect(isDebuff(I, 'slimeStew')).toBe(false);
  });
  it('그 미모사의 디버프 중 아직 없는 것을 주고, 같은 것은 두 번 주지 않는다', () => {
    const rng = new Rng(3);
    let held: string[] = ['slimeStew'];
    for (let i = 0; i < I.debuff.maxHeld.hectar; i++) {
      const id = pickDebuff(rng, I, 'hectar', held);
      expect(id).not.toBeNull();
      expect(hectar).toContain(id);
      expect(held).not.toContain(id);
      held = [...held, id!];
    }
    // 한도에 차면 더 주지 않는다
    expect(pickDebuff(rng, I, 'hectar', held)).toBeNull();
  });
  it('한도는 미모사마다 따로 센다 (다른 쪽 디버프는 세지 않음)', () => {
    const held = hectar.slice(0, I.debuff.maxHeld.hectar);
    expect(pickDebuff(new Rng(1), I, 'acro', held)).not.toBeNull();
  });
  it('같은 시드면 같은 디버프', () => {
    expect(pickDebuff(new Rng(9), I, 'acro', [])).toBe(pickDebuff(new Rng(9), I, 'acro', []));
  });
  it('보스를 잡으면 디버프만 사라진다', () => {
    expect(stripDebuffs(['slimeStew', hectar[0]!, 'magicasol', acro[1]!], I)).toEqual(['slimeStew', 'magicasol']);
  });
  it('버리기: 그 아이템 하나만 빠진다 (가진 적 있다는 기록은 그대로)', () => {
    expect(discardItem(['a', 'b', 'c'], 'b')).toEqual(['a', 'c']);
    expect(discardItem(['a'], 'x')).toEqual(['a']);
  });
  it('디버프는 상자·카드 추첨에 나오지 않는다', () => {
    for (const id of [...hectar, ...acro]) expect(I.items.find((x) => x.id === id)!.pool).toBe('debuff');
  });
});

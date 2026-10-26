import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { layoutMobileControls, type ControlRect } from '../src/ui/mobileLayout';

const cfg = gameData.ui.mobile;

function overlaps(a: ControlRect, b: ControlRect): boolean {
  if (a.round && b.round) {
    const d = Math.hypot(a.x + a.w / 2 - (b.x + b.w / 2), a.y + a.h / 2 - (b.y + b.h / 2));
    return d < a.w / 2 + b.w / 2;
  }
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

// 흔한 폰 가로 화면 (CSS px)
describe.each([
  [640, 360],
  [740, 360],
  [844, 390],
  [915, 412],
  [1024, 768],
])('모바일 배치 %ix%i', (w, h) => {
  const layout = layoutMobileControls(w, h, cfg);
  const entries = Object.entries(layout);

  it('모든 버튼이 가장자리에서 16dp 이상 떨어져 있다', () => {
    for (const [id, r] of entries) {
      expect(r.x, id).toBeGreaterThanOrEqual(cfg.edgeMarginDp - 1e-6);
      expect(r.y, id).toBeGreaterThanOrEqual(cfg.edgeMarginDp - 1e-6);
      expect(r.x + r.w, id).toBeLessThanOrEqual(w - cfg.edgeMarginDp + 1e-6);
      expect(r.y + r.h, id).toBeLessThanOrEqual(h - cfg.edgeMarginDp + 1e-6);
    }
  });

  it('버튼끼리 겹치지 않는다', () => {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [ia, a] = entries[i]!;
        const [ib, b] = entries[j]!;
        expect(overlaps(a, b), `${ia} vs ${ib}`).toBe(false);
      }
    }
  });

  it('버튼 크기가 기획서 값과 같다', () => {
    expect(layout.attack.w).toBe(96);
    expect(layout.skill1.w).toBe(68);
    expect(layout.ultimate.w).toBe(84);
    expect(layout.swapWeapon.w).toBe(56);
    expect(layout.inventory.w).toBe(48);
  });

  it('공격은 오른쪽 아래, 궁극기는 스킬 위, 가방은 왼쪽 위', () => {
    expect(layout.attack.x).toBeGreaterThan(w / 2);
    expect(layout.attack.y).toBeGreaterThan(h / 2);
    const topSkill = Math.min(layout.skill1.y, layout.skill2.y, layout.skill3.y, layout.skill4.y);
    expect(layout.ultimate.y).toBeLessThan(topSkill);
    expect(layout.inventory.x).toBeLessThan(w / 2);
    expect(layout.inventory.y).toBeLessThan(h / 2);
  });
});

import type { ButtonAction } from '../core/actions';
import type { MobileLayoutData } from '../types/data';

export type TouchControlId = Extract<
  ButtonAction,
  'attack' | 'dodge' | 'weaponSpecial' | 'skill1' | 'skill2' | 'skill3' | 'ultimate' | 'swapWeapon' | 'inventory' | 'pause' | 'map'
>;

export interface ControlRect {
  /** 왼쪽 위 (CSS px = dp) */
  x: number;
  y: number;
  w: number;
  h: number;
  round: boolean;
}

export type MobileLayout = Record<TouchControlId, ControlRect>;

function circle(cx: number, cy: number, d: number): ControlRect {
  return { x: cx - d / 2, y: cy - d / 2, w: d, h: d, round: true };
}

/**
 * 모바일 버튼 배치 (순수 함수, 단위 dp = CSS px).
 * - 공격: 오른쪽 아래 / 스킬 4개: 공격 버튼을 감싸는 부채꼴 / 궁극기: 부채꼴 바깥 왼쪽 위
 * - 교체: 스킬 부채꼴 왼쪽 아래 / 회피: 교체 위 / 무기 특수공격: 교체 왼쪽 / 가방·일시정지: 왼쪽 위 / 미니맵 탭: 오른쪽 위
 */
export function layoutMobileControls(viewW: number, viewH: number, c: MobileLayoutData): MobileLayout {
  const m = c.edgeMarginDp;
  const cx = viewW - m - c.attackDp / 2;
  const cy = viewH - m - c.attackDp / 2;
  const [d1, d2, d3] = c.skillFanDeg;
  // 공격 버튼에 붙는 최소 반지름과, 이웃 스킬 버튼끼리 겹치지 않는 반지름 중 큰 값
  const sorted = [...c.skillFanDeg].sort((a, b) => a - b);
  const minStepRad = Math.min(...sorted.slice(1).map((d, i) => d - sorted[i]!)) * (Math.PI / 180);
  const fanR = Math.max(
    c.attackDp / 2 + c.skillDp / 2 + c.gapDp,
    (c.skillDp + c.gapDp) / (2 * Math.sin(minStepRad / 2)),
  );

  const skill = (deg: number) => {
    const r = (deg * Math.PI) / 180;
    return circle(cx + fanR * Math.cos(r), cy + fanR * Math.sin(r), c.skillDp);
  };

  // 궁극기: 스킬 부채꼴 바깥쪽(ultimateDeg 방향)에 붙인다
  const ultR = fanR + c.skillDp / 2 + c.gapDp + c.ultimateDp / 2;
  const ultRad = (c.ultimateDeg * Math.PI) / 180;
  const swapCx = cx - fanR - c.skillDp / 2 - c.gapDp - c.swapDp / 2;
  const swapCy = viewH - m - c.swapDp / 2;

  return {
    attack: circle(cx, cy, c.attackDp),
    skill1: skill(d1),
    skill2: skill(d2),
    skill3: skill(d3),
    ultimate: circle(cx + ultR * Math.cos(ultRad), cy + ultR * Math.sin(ultRad), c.ultimateDp),
    swapWeapon: circle(swapCx, swapCy, c.swapDp),
    dodge: circle(swapCx, swapCy - c.swapDp / 2 - c.gapDp - c.dodgeDp / 2, c.dodgeDp),
    weaponSpecial: circle(swapCx - c.swapDp / 2 - c.gapDp - c.specialDp / 2, viewH - m - c.specialDp / 2, c.specialDp),
    inventory: { x: m, y: m, w: c.bagDp, h: c.bagDp, round: false },
    pause: { x: m + c.bagDp + c.gapDp, y: m, w: c.pauseDp, h: c.pauseDp, round: false },
    map: { x: viewW - m - c.minimapTab.widthDp, y: m, w: c.minimapTab.widthDp, h: c.minimapTab.heightDp, round: false },
  };
}

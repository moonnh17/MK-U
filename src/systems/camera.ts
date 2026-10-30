/**
 * 카메라 따라가기 (순수 함수).
 * 조준 중인 적이 있으면 플레이어와 적 사이(적 쪽으로 lean만큼)를 보고, 플레이어는 화면 가장자리 margin 안에 남으며,
 * 방 안이면 방 바깥이 보이지 않게 방 경계에서 멈춘다(방이 화면보다 작으면 가운데).
 * 적이 없으면 복도에서처럼 캐릭터에 고정한다.
 */
import type { Vec2 } from '../core/actions';
import type { Rect } from './worldLayout';

export interface CameraRules {
  /** 기본 확대 배율 */
  zoom: number;
  /** 플레이어 → 조준 적 거리 중 카메라가 적 쪽으로 기우는 비율 */
  lean: number;
  /** 플레이어가 화면 가장자리에서 떨어져 있어야 하는 거리(월드 px) */
  playerMarginPx: number;
}

/** 확대했을 때 화면에 보이는 월드 크기 */
export function viewSize(screenW: number, screenH: number, zoom: number): { w: number; h: number } {
  return { w: screenW / zoom, h: screenH / zoom };
}

/** 한 축: 범위 [lo, hi] 안에 값을 넣는다 (범위가 뒤집히면 가운데) */
function clampAxis(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}

/** 카메라가 볼 가운데 지점 */
export function cameraFocus(player: Vec2, target: Vec2 | null, view: { w: number; h: number }, rules: CameraRules, room: Rect | null): Vec2 {
  // 적이 없으면 복도에서처럼 캐릭터에 고정 (방 경계에서 멈추지 않는다)
  if (!target) return { x: player.x, y: player.y };
  let x = player.x + (target.x - player.x) * rules.lean;
  let y = player.y + (target.y - player.y) * rules.lean;
  // 플레이어가 화면 안(가장자리 margin 안쪽)에 남게
  const mx = Math.max(0, view.w / 2 - rules.playerMarginPx);
  const my = Math.max(0, view.h / 2 - rules.playerMarginPx);
  x = clampAxis(x, player.x - mx, player.x + mx);
  y = clampAxis(y, player.y - my, player.y + my);
  if (!room) return { x, y };
  // 방 바깥이 보이지 않게 (방이 화면보다 작으면 방 가운데)
  return {
    x: room.w <= view.w ? room.x + room.w / 2 : clampAxis(x, room.x + view.w / 2, room.x + room.w - view.w / 2),
    y: room.h <= view.h ? room.y + room.h / 2 : clampAxis(y, room.y + view.h / 2, room.y + room.h - view.h / 2),
  };
}

/**
 * 화면에 고정된 오브젝트(스크롤 0)도 카메라 확대를 받는다. 화면 좌표 → 그 오브젝트의 지역 좌표.
 * (화면 가운데를 기준으로 zoom배 커지므로 거꾸로 나눈다)
 */
export function screenToFixed(sx: number, sy: number, screenW: number, screenH: number, zoom: number): Vec2 {
  return { x: screenW / 2 + (sx - screenW / 2) / zoom, y: screenH / 2 + (sy - screenH / 2) / zoom };
}

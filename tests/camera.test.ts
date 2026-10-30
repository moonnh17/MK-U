import { describe, expect, it } from 'vitest';
import { gameData } from '../src/data/index';
import { cameraFocus, screenToFixed, viewSize } from '../src/systems/camera';

const R = gameData.ui.camera;
const view = viewSize(480, 270, R.zoom);
const bigRoom = { x: 0, y: 0, w: 1000, h: 1000 };

describe('카메라 따라가기', () => {
  it('확대하면 보이는 월드가 작아진다', () => {
    expect(view).toEqual({ w: 480 / R.zoom, h: 270 / R.zoom });
  });
  it('적이 없으면 플레이어를 본다', () => {
    expect(cameraFocus({ x: 500, y: 500 }, null, view, R, bigRoom)).toEqual({ x: 500, y: 500 });
  });
  it('조준 적이 있으면 그쪽으로 lean만큼 기운다', () => {
    const f = cameraFocus({ x: 500, y: 500 }, { x: 600, y: 500 }, view, R, bigRoom);
    expect(f.x).toBeCloseTo(500 + 100 * R.lean);
    expect(f.y).toBe(500);
  });
  it('적이 멀어도 플레이어는 화면 가장자리 margin 안에 남는다', () => {
    const f = cameraFocus({ x: 500, y: 500 }, { x: 2000, y: 500 }, view, R, bigRoom);
    expect(f.x - 500).toBeCloseTo(view.w / 2 - R.playerMarginPx);
  });
  it('방 바깥은 보이지 않게 경계에서 멈추고, 방이 화면보다 작으면 가운데', () => {
    const edge = cameraFocus({ x: 10, y: 10 }, null, view, R, bigRoom);
    expect(edge).toEqual({ x: view.w / 2, y: view.h / 2 });
    const small = { x: 100, y: 100, w: view.w - 20, h: view.h - 20 };
    expect(cameraFocus({ x: 110, y: 110 }, null, view, R, small)).toEqual({ x: 100 + small.w / 2, y: 100 + small.h / 2 });
  });
  it('복도(방 밖)에서는 플레이어 그대로', () => {
    expect(cameraFocus({ x: -50, y: 7 }, null, view, R, null)).toEqual({ x: -50, y: 7 });
  });
  it('화면 고정 오브젝트 좌표: 가운데는 그대로, 가장자리는 확대만큼 안쪽', () => {
    expect(screenToFixed(240, 135, 480, 270, 2)).toEqual({ x: 240, y: 135 });
    expect(screenToFixed(0, 0, 480, 270, 2)).toEqual({ x: 120, y: 67.5 });
  });
});

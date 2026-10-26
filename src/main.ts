import Phaser from 'phaser';
import './style.css';
import { makeFallbackSeed, parseLaunchConfig } from './core/config';
import { setContext } from './core/context';
import { bus } from './core/events';
import { DISABLED_ACTIONS } from './core/features';
import { computeZoom, hexColor } from './core/scale';
import { formatText } from './core/text';
import { gameData } from './data/index';
import { validateGameData } from './data/validate';
import { InputManager } from './input/inputManager';
import { KeyboardSource } from './input/keyboard';
import { TouchSource } from './input/touch';
import { initialUiMode, nextUiMode, type UiMode } from './input/uiMode';
import { BootScene } from './scenes/BootScene';
import { RunScene } from './scenes/RunScene';
import { UIScene } from './scenes/UIScene';
import type { TouchControlId } from './ui/mobileLayout';

const config = parseLaunchConfig(window.location.search, makeFallbackSeed());
const data = gameData;
const t = (key: string) => formatText(data.text, key);

if (import.meta.env.DEV) {
  const errors = validateGameData(data);
  if (errors.length) console.error('[데이터 검증 실패]\n' + errors.join('\n'));
}

// --- 모바일 브라우저 기본 동작 막기 (스크롤·확대·길게 누르기) ---
const stop = (e: Event) => e.preventDefault();
document.addEventListener('touchmove', stop, { passive: false });
document.addEventListener('gesturestart', stop);
document.addEventListener('contextmenu', stop);
document.addEventListener('selectstart', stop);
document.addEventListener('dblclick', stop);
document.getElementById('rotate-hint')!.textContent = t('system.rotate');

// --- 입력 ---
const input = new InputManager();
const keyboard = new KeyboardSource(data.keybindings);
const touchLabels: Record<TouchControlId, string> = {
  attack: t('mobile.attack'),
  skill1: '1',
  skill2: '2',
  skill3: '3',
  skill4: '4',
  ultimate: t('mobile.ultimate'),
  swapWeapon: t('mobile.swap'),
  inventory: t('mobile.bag'),
  pause: t('mobile.pause'),
  map: t('mobile.map'),
};
const touch = new TouchSource(document.getElementById('touch-layer')!, data.ui.mobile, touchLabels);
for (const id of Object.keys(touchLabels) as TouchControlId[]) touch.setDisabled(id, DISABLED_ACTIONS.has(id));
input.add(keyboard);
input.add(touch);

const coarse = window.matchMedia('(pointer: coarse)').matches;
const ctx = setContext({
  config,
  data,
  input,
  touch,
  uiMode: initialUiMode(config.ui, coarse),
  debug: config.debug,
});

// --- Phaser ---
const zoomFor = (mode: UiMode) =>
  computeZoom(window.innerWidth, window.innerHeight, data.ui.baseWidth, data.ui.baseHeight, mode);

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: data.ui.baseWidth,
  height: data.ui.baseHeight,
  backgroundColor: hexColor(data.ui.backgroundColor),
  pixelArt: true,
  roundPixels: true,
  scale: { mode: Phaser.Scale.NONE, zoom: zoomFor(ctx.uiMode) },
  physics: { default: 'arcade', arcade: { debug: false } },
  input: { keyboard: false, gamepad: false },
  scene: [BootScene, RunScene, UIScene],
});

function applyUiMode(mode: UiMode): void {
  ctx.uiMode = mode;
  touch.setActive(mode === 'mobile');
  game.scale.setZoom(zoomFor(mode));
  bus.emit('uiModeChanged', { mode });
}

function switchTo(activity: 'touch' | 'keyboard'): void {
  const next = nextUiMode(config.ui, ctx.uiMode, activity);
  if (next !== ctx.uiMode) applyUiMode(next);
}

window.addEventListener(
  'pointerdown',
  (e) => {
    if (e.pointerType === 'touch') switchTo('touch');
  },
  { capture: true },
);
keyboard.onActivity = () => switchTo('keyboard');
keyboard.onDebugToggle = () => {
  ctx.debug = !ctx.debug;
  bus.emit('debugToggled', { on: ctx.debug });
};
window.addEventListener('resize', () => game.scale.setZoom(zoomFor(ctx.uiMode)));

applyUiMode(ctx.uiMode);
console.info(`[MKU] seed=${config.seed} ui=${ctx.uiMode} debug=${ctx.debug}`);

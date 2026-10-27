import Phaser from 'phaser';
import './style.css';
import { makeFallbackSeed, parseLaunchConfig } from './core/config';
import { setContext } from './core/context';
import { debugClearRoom, toggleDebug, toggleDebugFlag } from './core/debug';
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
import { CardWindow } from './ui/cardWindow';
import { CutsceneWindow } from './ui/cutsceneWindow';
import { InventoryWindow } from './ui/inventoryWindow';
import { ItemCard } from './ui/itemCard';
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
// 디버그: 콘솔에서 상태를 보거나 프레임을 직접 돌릴 수 있게
if (config.debug) Object.assign(window, { __game: game, __ctx: ctx });

function applyUiMode(mode: UiMode): void {
  ctx.uiMode = mode;
  refreshTouch();
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
keyboard.onDebugKey = (key) => {
  if (key === 'toggle') toggleDebug(ctx);
  else if (key === 'clearRoom') debugClearRoom(ctx);
  else toggleDebugFlag(ctx, key);
};

// 근처에 줍거나 조사할 것이 있으면 모바일 공격 버튼이 상호작용 버튼이 된다
bus.on('interactHint', ({ kind }) => {
  if (kind === 'weapon') touch.setAttackOverride('interact', t('mobile.pickup'));
  else if (kind === 'chest') touch.setAttackOverride('interact', t('mobile.open'));
  else if (kind === 'merchant') touch.setAttackOverride('interact', t('mobile.buy'));
  else touch.setAttackOverride(null, t('mobile.attack'));
});
// 사망·클리어 화면, 카드 선택창·인벤토리가 떠 있으면 터치 레이어를 걷어 그 화면을 누를 수 있게 한다
let overlayOpen = false;
let modalOpen = false;
const refreshTouch = () => touch.setActive(ctx.uiMode === 'mobile' && !overlayOpen && !modalOpen);
bus.on('overlay', ({ open }) => {
  overlayOpen = open;
  refreshTouch();
});
bus.on('modal', ({ kind }) => {
  modalOpen = kind !== null;
  refreshTouch();
});
new CardWindow(ctx);
new InventoryWindow(ctx);
new CutsceneWindow(ctx);
new ItemCard(ctx);
window.addEventListener('resize', () => game.scale.setZoom(zoomFor(ctx.uiMode)));

applyUiMode(ctx.uiMode);
// 디버그 모드에서만 콘솔 점검용 핸들을 노출한다
if (config.debug) (window as unknown as { __mku: unknown }).__mku = { ctx, game };
console.info(`[MKU] seed=${config.seed} ui=${ctx.uiMode} debug=${ctx.debug}`);

import type { SpriteRef } from './common';

// ---------- UI ----------

export interface MobileLayoutData {
  /** 화면 가장자리 최소 여백(dp) */
  edgeMarginDp: number;
  attackDp: number;
  skillDp: number;
  ultimateDp: number;
  swapDp: number;
  dodgeDp: number;
  /** 무기 특수공격 버튼 */
  specialDp: number;
  bagDp: number;
  pauseDp: number;
  /** 버튼 사이 간격(dp) */
  gapDp: number;
  /** 스킬 4개 부채꼴 각도(도, 화면 좌표: 180=왼쪽, 270=위) */
  skillFanDeg: [number, number, number];
  /** 궁극기 방향(도). 스킬 부채꼴 바깥쪽에 놓인다 */
  ultimateDeg: number;
  minimapTab: { widthDp: number; heightDp: number };
  joystick: { radiusDp: number; knobDp: number; deadZone: number };
}

export interface HudLayoutData {
  /** 오버플로우 전용: 미니맵 붉은 테두리·표시, 진화·보상 목록, 화면 테두리 글리치 */
  overflow: { label: string; labelSize: number; color: string; listSize: number; listColor: string; /** 한 줄 글자 수 (넘으면 …) */ lineChars: number; maxLines: number; glitch: { everySec: [number, number]; sec: number; alpha: number; thickness: number; slices: number } };
  margin: number;
  fontSize: number;
  bars: {
    width: number;
    height: number;
    gap: number;
    hpColor: string;
    sanityColor: string;
    energyColor: string;
    backColor: string;
  };
  /** 현재 버프 목록 (왼쪽 작은 줄) */
  buffs: {
    fontSize: number;
    height: number;
    gap: number;
    minWidth: number;
    padX: number;
    accentWidth: number;
    backColor: string;
    backAlpha: number;
    nameColor: string;
    valueColor: string;
    cooldownTextColor: string;
    cooldownAlpha: number;
  };
  minimap: {
    width: number;
    height: number;
    backColor: string;
    borderColor: string;
    maxCell: number;
    cellGap: number;
    roomColor: string;
    visitedColor: string;
    currentColor: string;
    corridorColor: string;
  };
  skillbar: {
    slotSize: number;
    gap: number;
    groupGap: number;
    disabledAlpha: number;
    /** Lv1·2·3 테두리 색 */
    levelColors: string[];
    awakenedColor: string;
    emptyColor: string;
    /** 쿨타임 원형 게이지 색 */
    cooldownColor: string;
    cooldownAlpha: number;
    /** 궁극기 게이지가 다 찼을 때 테두리 */
    ultimateReadyColor: string;
    /** 추가 스킬(다시 누르기)이 준비된 칸: 노란 테두리 조각이 이 주기로 한 바퀴 돈다 */
    followUpColor: string;
    followUpSpinSec: number;
    /** 개전 각인이 걸린 칸(마기법사 1번 칸)의 안쪽 테두리, 계열 공명이면 다른 색 */
    imprintColor: string;
    imprintResonanceColor: string;
    /** 각인 칸 장식 틀 그림(size = 화면 폭, 띠 가운데가 칸 테두리에 오게), 공명이면 금빛 틀. 맥박 주기·알파 폭 */
    imprintFrame: SpriteRef;
    imprintFrameResonance: SpriteRef;
    imprintPulseHz: number;
    imprintPulse: number;
  };
  weapons: { mainWidth: number; mainHeight: number; subWidth: number; subHeight: number; gap: number };
}

export interface UiData {
  /** 시네마틱 덮개: 레터박스 띠 높이·움직이는 시간, 가운데 큰 글자 */
  cinema: { barPx: number; barSec: number; bigSize: number; bigColor: string; bigStroke: string; bigStrokePx: number; bigGlowPx: number; bigFromScale: number };
  /** 첫 방 조작 안내: 방 가운데 기준 위치, 글자, PC·모바일 문구 키 */
  tutorial: { offsetY: number; fontPx: number; lineGapPx: number; pc: string[]; mobile: string[] };
  baseWidth: number;
  baseHeight: number;
  /** 게임 1px을 캔버스 몇 px로 그릴지 (기기 화면에 맞춰 이 범위에서 고른다) */
  renderScaleMin: number;
  renderScaleMax: number;
  renderScaleMaxMobile: number;
  backgroundColor: string;
  /** HUD 배치 (기준 해상도 px) */
  hud: HudLayoutData;
  room: { floorColor: string; wallColor: string; corridorColor: string };
  /** 챕터별 방 색 (없으면 room) */
  chapterRooms: Record<string, { floorColor: string; wallColor: string; corridorColor: string }>;
  /** 칼 베기 이펙트 표시 시간(초) */
  slashFxSec: number;
  /** 카메라 따라가기 보간(0~1) */
  cameraLerp: number;
  /** 런 카메라: 기본 확대, 조준 적 쪽으로 기우는 비율, 플레이어가 화면 가장자리에서 떨어질 거리 */
  camera: { zoom: number; lean: number; playerMarginPx: number };
  toastSec: number;
  /** "인벤토리에 보관됨" 알림(교체 버튼) 표시 시간(초) */
  storedNoticeSec: number;
  /** 마기 변질된 적 색·변질 폭발 색 */
  corruptionColor: string;
  /** 에너지 부족 시 HUD 에너지 바를 빨갛게 표시하는 시간(초) */
  energyEmptyFlashSec: number;
  mobile: MobileLayoutData;
}

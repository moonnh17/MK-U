// ---------- 텍스트 ----------

export type TextTable = Record<string, string>;

// ---------- 결산·영구 진행 ----------

/** 결산 마기력 결정 산식 (기획서 표) */
export interface CrystalRules {
  /** 스테이지 클리어 1개당 */
  perStage: number;
  /** 보스 처치: 스테이지 번호 → 결정 (X-2, X-5) */
  bossByStage: Record<string, number>;
  perElite: number;
  perSpire: number;
  perHiddenBoss: number;
  /** 런 클리어(3-5) 보너스: 합계 × 배율 */
  clearMultiplier: number;
}

export interface MetaData {
  crystals: CrystalRules;
  memory: {
    /** 과거의 기억 칸 수 (내용은 미공개, 칸·순서·잠금만) */
    pastSlots: number;
    /** 보스 처치 시 기억조각 확률 */
    bossShardChance: number;
    /** 히든보스 처치 시 확정 */
    hiddenBossShard: boolean;
  };
  /** 결산 화면 연출 */
  settlement: { lineStepSec: number; countSec: number };
  /** 실험체의 기억: 직업별 영구 강화 (최대 레벨 = 비용 표 길이) */
  upgrades: UpgradeDef[];
  /** 삭제된 스탯 강화: 예전 저장의 레벨을 결정으로 돌려줄 때 쓴다 */
  removedUpgrades: { ids: string[]; costs: number[] };
}

/** stat: 시작 스탯 +perLevel / maxHp: 기본 체력 +perLevel / sanity: 최대 정신력 +perLevel */
export type UpgradeDef =
  | { id: string; kind: 'maxHp' | 'sanity'; perLevel: number; costs: number[] };

// ---------- 실험장 (시작 방) ----------

/**
 * capsule: 깨어나는 자리 / jobSelect: 직업 선택 장치 / portal: 시뮬레이션 포털 /
 * codex: 도감 단말(준비 중) / archive: 기억조각 보관대 / gemini: 미모사 제미니 홀로그램(준비 중) / window: 관측창(장식)
 */
export type LabObjectKind = 'capsule' | 'jobSelect' | 'portal' | 'codex' | 'archive' | 'gemini' | 'window';

export interface LabObjectDef {
  id: string;
  kind: LabObjectKind;
  /** 가운데 좌표 (기준 해상도 px) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 지나갈 수 없는지 */
  solid: boolean;
  color: string;
  spriteKey: string;
}

export interface LabData {
  /** 방 안쪽 */
  room: { x: number; y: number; w: number; h: number };
  wall: number;
  colors: { floor: string; grid: string; wall: string; light: string; monitor: string; monitorText: string; window: string; emptyCapsule: string };
  gridStep: number;
  /** 벽면 모니터 x (장식) */
  monitors: number[];
  interactRadius: number;
  /** 캡슐 앞 (첫 실행이 아니면 여기서 시작) */
  start: { x: number; y: number };
  /** 첫 실행: 캡슐 뚜껑이 열리고 걸어 나온다 */
  wake: { lidSec: number; stepSec: number; stepDistance: number };
  objects: LabObjectDef[];
  geminiFlicker: { minAlpha: number; maxAlpha: number; periodSec: number };
  portalPulseSec: number;
}

// ---------- 미모사 제미니 대화 ----------

/**
 * 대사가 나오는 게임 이벤트. arg: 시작 직업(runStart) / 전직 id / 보스 id(bossKill·bossMet) / 정예 id / 끝난 챕터 번호.
 * runClear: 마지막 챕터 클리어 결산 화면을 닫은 뒤
 */
export type GeminiEventId = 'firstRun' | 'runStart' | 'advancement' | 'bossKill' | 'bossMet' | 'championMet' | 'chapterEnd' | 'hiddenBoss' | 'runClear';
export const GEMINI_EVENTS: readonly GeminiEventId[] = ['firstRun', 'runStart', 'advancement', 'bossKill', 'bossMet', 'championMet', 'chapterEnd', 'hiddenBoss', 'runClear'];

/**
 * 게임을 멈추는 일반 스토리 대화. lines: 차례로 넘기는 문장(텍스트 키). 내용이 비어 있으면 띄우지 않는다.
 * 문장 키에 `<키>.speaker` 텍스트가 있으면 그 줄의 화자 이름(없으면 gemini.speaker). 문장 안 **…**은 붉은 강조
 */
export interface GeminiStoryDef {
  id: string;
  nameKey: string;
  event: GeminiEventId;
  when?: string;
  lines: string[];
}

/**
 * 멈추지 않는 미니 대사. candidates 중 하나를 무작위로(같은 런에 나온 것 제외), 후보 하나는 차례로 띄우는 문장 목록.
 * record: 현재의 기억에 남는 복선 대사 / mood: 아이콘 표정(평범·불길)
 */
export interface GeminiMiniDef {
  id: string;
  nameKey: string;
  event: GeminiEventId;
  when?: string;
  priority: number;
  record: boolean;
  /** 저장 기준 평생 한 번 (현재의 기억에 남은 적이 있으면 다시 띄우지 않는다, record 필요) */
  once?: boolean;
  mood: 'calm' | 'ominous';
  candidates: string[][];
}

export interface GeminiData {
  /** 미니 대사 한 문장 표시 시간 = showSec + 글자 수 × perCharSec, 페이드(초) */
  mini: { showSec: number; perCharSec: number; fadeSec: number };
  /** 타이핑 효과: 글자 하나가 나오는 시간(초) */
  typeCharSec: number;
  /** 초상화·아이콘 색 (헥타르 연구원의 푸른 분위기) */
  color: string;
  stories: GeminiStoryDef[];
  minis: GeminiMiniDef[];
}

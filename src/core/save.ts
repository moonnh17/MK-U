import { clampVolume } from '../systems/music';
/**
 * 영구 저장 (localStorage). 런 사이에 남는 것만: 마기력 결정, 직업별 강화, 처음 본 컷씬·제미니 대사, 과거의 기억 조각, 첫 실행 여부.
 * 읽다가 실패하거나 내용이 깨져 있으면 기본값으로 시작한다(게임은 저장 없이도 돌아간다).
 */
import type { CutIn, CutPage } from '../ui/cutscenePages';

export const SAVE_KEY = 'mku.save';
export const SAVE_VERSION = 1;

/** 다시보기용으로 저장한 컷씬 (컷인 + 설명창 그대로) */
export interface SavedCutscene {
  cut: CutIn;
  pages: CutPage[];
  /** 처음 본 순서 */
  order: number;
}

export interface SaveData {
  version: number;
  crystals: number;
  /** 직업 id → 강화 항목 id → 레벨 (M5-D) */
  upgrades: Record<string, Record<string, number>>;
  cutscenes: Record<string, SavedCutscene>;
  /** 얻은 과거의 기억 조각 수 (칸이 순서대로 열린다) */
  pastShards: number;
  /** 캡슐에서 깨어나는 첫 실행 연출을 봤는지 (M5-C) */
  firstRunDone: boolean;
  /** 현재의 기억에 남은 미모사 제미니 대사: 칸 id → 본 문장(텍스트 키)·처음 본 순서 */
  gemini: Record<string, { lines: string[]; order: number }>;
  /** 소리 꺼 둠 */
  muted: boolean;
  /** 음악·효과음 음량 0~1 */
  musicVolume: number;
  sfxVolume: number;
  /** 첫 방 조작 안내를 봤는지 */
  tutorialDone: boolean;
}

export function defaultSave(): SaveData {
  return { version: SAVE_VERSION, crystals: 0, upgrades: {}, cutscenes: {}, pastShards: 0, firstRunDone: false, gemini: {}, muted: false, musicVolume: 1, sfxVolume: 1, tutorialDone: false };
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const nonNeg = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback);

/** 저장 문자열 → 데이터. 모르는 값은 버리고 빠진 값은 기본값 */
export function parseSave(raw: string | null): SaveData {
  const d = defaultSave();
  if (!raw) return d;
  let o: unknown;
  try {
    o = JSON.parse(raw);
  } catch {
    return d;
  }
  if (!isObj(o) || o.version !== SAVE_VERSION) return d;
  const upgrades: SaveData['upgrades'] = {};
  if (isObj(o.upgrades)) {
    for (const [job, levels] of Object.entries(o.upgrades)) {
      if (!isObj(levels)) continue;
      upgrades[job] = {};
      for (const [k, v] of Object.entries(levels)) upgrades[job]![k] = nonNeg(v, 0);
    }
  }
  const cutscenes: SaveData['cutscenes'] = {};
  if (isObj(o.cutscenes)) {
    for (const [id, c] of Object.entries(o.cutscenes)) {
      if (isObj(c) && isObj(c.cut) && Array.isArray(c.pages)) cutscenes[id] = { cut: c.cut as unknown as CutIn, pages: c.pages as CutPage[], order: nonNeg(c.order, 0) };
    }
  }
  const gemini: SaveData['gemini'] = {};
  if (isObj(o.gemini)) {
    for (const [id, g] of Object.entries(o.gemini)) {
      if (isObj(g) && Array.isArray(g.lines) && g.lines.every((x) => typeof x === 'string')) gemini[id] = { lines: g.lines as string[], order: nonNeg(g.order, 0) };
    }
  }
  return {
    version: SAVE_VERSION,
    gemini,
    crystals: nonNeg(o.crystals, 0),
    upgrades,
    cutscenes,
    pastShards: nonNeg(o.pastShards, 0),
    firstRunDone: o.firstRunDone === true,
    muted: o.muted === true,
    musicVolume: clampVolume(o.musicVolume, 1),
    sfxVolume: clampVolume(o.sfxVolume, 1),
    tutorialDone: o.tutorialDone === true,
  };
}

/** 컷씬을 처음 봤으면 등록하고 true */
export function registerCutscene(s: SaveData, id: string, cut: CutIn, pages: CutPage[]): boolean {
  if (s.cutscenes[id]) return false;
  s.cutscenes[id] = { cut, pages, order: Object.keys(s.cutscenes).length };
  return true;
}

/** 제미니 대사를 처음 봤으면 현재의 기억에 등록하고 true */
export function registerGemini(s: SaveData, id: string, lines: readonly string[]): boolean {
  if (s.gemini[id]) return false;
  s.gemini[id] = { lines: [...lines], order: Object.keys(s.gemini).length };
  return true;
}

/** localStorage 같은 저장소 (테스트는 가짜를 넣는다) */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** 저장 데이터 + 쓰기. 저장소를 못 쓰면(사생활 보호 모드 등) 메모리에만 둔다 */
export class SaveStore {
  data: SaveData;

  constructor(private readonly store: KeyValueStore | null) {
    let raw: string | null = null;
    try {
      raw = store?.getItem(SAVE_KEY) ?? null;
    } catch {
      raw = null;
    }
    this.data = parseSave(raw);
  }

  write(): void {
    try {
      this.store?.setItem(SAVE_KEY, JSON.stringify(this.data));
    } catch {
      // 저장 실패는 무시 (다음 쓰기에서 다시 시도)
    }
  }

  /** 디버그: 저장 초기화 */
  reset(): void {
    this.data = defaultSave();
    try {
      this.store?.removeItem(SAVE_KEY);
    } catch {
      // 무시
    }
  }
}

/** 브라우저 localStorage (접근 자체가 막혀 있으면 null) */
export function browserStore(): KeyValueStore | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

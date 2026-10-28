/**
 * 미모사 제미니 대사 (순수 함수).
 * 이벤트 → 스토리 대화(멈춤) 또는 미니 대사(안 멈춤). 내용이 빈 대사는 띄우지 않는다(미공개 설정은 빈 자리).
 * 미니 대사는 같은 런에 같은 이벤트(보스는 보스마다)·같은 대사를 다시 띄우지 않는다.
 * 여러 개가 겹치면 중요도(priority) 높은 것부터, 같으면 먼저 온 것부터 한 문장씩 차례로.
 */
import type { Rng } from '../core/rng';
import type { GeminiData, GeminiEventId, GeminiMiniDef, GeminiStoryDef } from '../types/data';

/** 대사 문장이 모두 채워져 있는지 (빈 문자열이거나 없는 키면 false) */
export function hasLines(keys: readonly string[], text: Readonly<Record<string, string>>): boolean {
  return keys.length > 0 && keys.every((k) => (text[k] ?? '').trim() !== '');
}

/** when이 있으면 arg가 같아야 하고, 없으면 그 이벤트 전부 */
function matches(def: { event: GeminiEventId; when?: string }, event: GeminiEventId, arg: string | undefined): boolean {
  return def.event === event && (def.when === undefined || def.when === arg);
}

/** 이 이벤트의 스토리 대화 (내용과 상관없이 정해져 있는지). when이 맞는 것이 우선 */
export function storyFor(data: GeminiData, event: GeminiEventId, arg?: string): GeminiStoryDef | undefined {
  const list = data.stories.filter((s) => matches(s, event, arg));
  return list.find((s) => s.when !== undefined) ?? list[0];
}

/** 같은 런 안에서 다시 띄우지 않는 단위: 이벤트(+보스 id 등) */
export function instanceKey(event: GeminiEventId, arg?: string): string {
  return `${event}:${arg ?? ''}`;
}

export interface MiniPick {
  def: GeminiMiniDef;
  /** 고른 후보 번호 (같은 런 중복 방지 키: `id#번호`) */
  index: number;
  lines: string[];
}

/**
 * 미니 대사 고르기. 스토리 대화가 정해진 이벤트(식광·마기카이저 처치)는 미니 대사를 띄우지 않는다.
 * said: 이번 런에 이미 쓴 이벤트·대사 키. 내용이 빈 후보와 이미 쓴 후보는 빼고 무작위.
 */
export function pickMini(
  data: GeminiData,
  event: GeminiEventId,
  arg: string | undefined,
  said: ReadonlySet<string>,
  rng: Rng,
  text: Readonly<Record<string, string>>,
): MiniPick | null {
  if (storyFor(data, event, arg)) return null;
  if (said.has(instanceKey(event, arg))) return null;
  const defs = data.minis.filter((m) => matches(m, event, arg));
  const def = defs.find((m) => m.when !== undefined) ?? defs[0];
  if (!def) return null;
  const ok = def.candidates.map((lines, index) => ({ lines, index })).filter((c) => hasLines(c.lines, text) && !said.has(`${def.id}#${c.index}`));
  if (ok.length === 0) return null;
  const c = rng.pick(ok);
  return { def, index: c.index, lines: c.lines };
}

/** 고른 미니 대사를 '이번 런에 썼다'로 남길 키 */
export function saidKeys(event: GeminiEventId, arg: string | undefined, pick: MiniPick): string[] {
  return [instanceKey(event, arg), `${pick.def.id}#${pick.index}`];
}

export interface MiniLine {
  text: string;
  mood: GeminiMiniDef['mood'];
}

interface QueuedMini {
  lines: MiniLine[];
  priority: number;
  seq: number;
}

/**
 * 미니 대사 표시 순서. update(dt)는 표시할 문장이 바뀌었을 때만 그 문장(또는 null = 숨김)을 돌려준다.
 * 한 문장은 showSec 동안, 문장 사이에는 fadeSec 동안 비운다(페이드).
 */
export class MiniQueue {
  private queue: QueuedMini[] = [];
  private current: MiniLine[] = [];
  private left = 0;
  private showing = false;
  private gap = 0;
  private seq = 0;

  constructor(
    private readonly showSec: number,
    private readonly fadeSec: number,
  ) {}

  push(lines: readonly MiniLine[], priority: number): void {
    if (lines.length === 0) return;
    this.queue.push({ lines: [...lines], priority, seq: this.seq++ });
    this.queue.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
  }

  get idle(): boolean {
    return !this.showing && this.current.length === 0 && this.queue.length === 0;
  }

  update(dt: number): { line: MiniLine | null } | null {
    if (this.showing) {
      this.left -= dt;
      if (this.left > 0) return null;
      this.showing = false;
      this.gap = this.fadeSec;
      return { line: null };
    }
    if (this.gap > 0) {
      this.gap -= dt;
      if (this.gap > 0) return null;
    }
    if (this.current.length === 0) {
      const next = this.queue.shift();
      if (!next) return null;
      this.current = next.lines;
    }
    const line = this.current.shift()!;
    this.showing = true;
    this.left = this.showSec;
    return { line };
  }

  clear(): void {
    this.queue = [];
    this.current = [];
    this.showing = false;
    this.gap = 0;
  }
}

/** 현재의 기억에 남는 제미니 대사 칸: 스토리 대화 전부 + 복선 미니 대사. ready: 내용이 있는지 */
export function geminiSlots(data: GeminiData, text: Readonly<Record<string, string>>): { id: string; nameKey: string; ready: boolean }[] {
  const out = data.stories.map((s) => ({ id: `gemini.${s.id}`, nameKey: s.nameKey, ready: hasLines(s.lines, text) }));
  for (const m of data.minis) {
    if (m.record) out.push({ id: `gemini.${m.id}`, nameKey: m.nameKey, ready: m.candidates.some((c) => hasLines(c, text)) });
  }
  return out;
}

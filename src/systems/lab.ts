/**
 * 실험장 (순수 함수): 가까운 조사 대상, 직업 선택 목록, 포털 활성.
 * 중앙 동선(캡슐 → 직업 선택 → 포털)만 작동하고, 나머지는 상호작용 표시만(준비 중).
 */
import type { Vec2 } from '../core/actions';
import type { JobDef, LabObjectDef, LabObjectKind } from '../types/data';

/** 조사할 수 있는 오브젝트 (캡슐·관측창은 장식) */
export const INTERACTIVE_KINDS: ReadonlySet<LabObjectKind> = new Set<LabObjectKind>(['jobSelect', 'portal', 'codex', 'archive', 'gemini']);

/** 오브젝트 테두리까지의 거리 (사각형) */
export function distanceToObject(o: Pick<LabObjectDef, 'x' | 'y' | 'w' | 'h'>, p: Vec2): number {
  const dx = Math.max(0, Math.abs(p.x - o.x) - o.w / 2);
  const dy = Math.max(0, Math.abs(p.y - o.y) - o.h / 2);
  return Math.hypot(dx, dy);
}

/** 반경 안에서 가장 가까운 조사 대상 (없으면 null) */
export function nearestInteractable(objects: readonly LabObjectDef[], p: Vec2, radius: number): LabObjectDef | null {
  let best: LabObjectDef | null = null;
  let bestD = radius;
  for (const o of objects) {
    if (!INTERACTIVE_KINDS.has(o.kind)) continue;
    const d = distanceToObject(o, p);
    if (d <= bestD) {
      best = o;
      bestD = d;
    }
  }
  return best;
}

export interface JobChoice {
  id: string;
  nameKey: string;
  /** 지금 고를 수 있는지 (마기학자만) */
  enabled: boolean;
  advancementKeys: string[];
}

/** 직업 선택 장치에 보일 직업 (데이터 순서) */
export function jobChoices(jobs: readonly JobDef[]): JobChoice[] {
  return jobs.map((j) => ({ id: j.id, nameKey: j.nameKey, enabled: j.enabled, advancementKeys: j.advancements.map((a) => a.nameKey) }));
}

/** 포털은 고를 수 있는 직업을 고른 뒤에만 켜진다 */
export function portalActive(jobs: readonly JobDef[], selected: string | null): boolean {
  return selected !== null && jobs.some((j) => j.id === selected && j.enabled);
}

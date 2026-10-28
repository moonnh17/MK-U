/**
 * 기억조각 보관대의 칸 목록 (순수 함수).
 * 과거의 기억: 칸 수만큼, 얻은 수만큼 순서대로 열린다(내용은 미공개라 비워 둔다).
 * 현재의 기억: 지금 나올 수 있는 컷씬마다 한 칸. 아직 연출이 없는 보스 등장은 '준비 중' 칸.
 * 미모사 제미니 대사 칸은 systems/gemini.ts geminiSlots.
 */
import type { GameData } from '../data/index';

export interface PastSlot {
  index: number;
  open: boolean;
}

export function pastSlots(slots: number, owned: number): PastSlot[] {
  return Array.from({ length: slots }, (_, i) => ({ index: i, open: i < owned }));
}

export type CutsceneGroup = 'skill' | 'ultimate' | 'advancement' | 'boss' | 'gemini';

export interface CutsceneSlot {
  /** 컷씬 id (저장 키와 같다). 준비 중 칸은 null */
  id: string | null;
  group: CutsceneGroup;
  /** 칸 이름 (텍스트 키) */
  nameKey: string;
}

/**
 * 현재의 기억 칸: 고를 수 있는 직업의 스킬 각성·궁극기 각성·전직 컷씬.
 * implemented: 발동 로직이 있는 스킬·궁극기만 (나올 수 없는 컷씬 칸은 만들지 않는다)
 */
export function cutsceneSlots(
  data: Pick<GameData, 'jobs' | 'skills' | 'ultimates'>,
  implemented: { skill(id: string): boolean; ultimate(id: string): boolean },
): CutsceneSlot[] {
  const jobs = data.jobs.jobs.filter((j) => j.enabled);
  const out: CutsceneSlot[] = [];
  for (const s of data.skills.skills) if (implemented.skill(s.id)) out.push({ id: `skill.${s.id}`, group: 'skill', nameKey: s.awakening.nameKey });
  for (const u of data.ultimates.ultimates) {
    if (u.awakening && implemented.ultimate(u.id)) out.push({ id: `ultimate.${u.id}`, group: 'ultimate', nameKey: u.awakening.nameKey });
  }
  for (const j of jobs) for (const a of j.advancements) out.push({ id: `advancement.${a.id}`, group: 'advancement', nameKey: a.nameKey });
  // 연출이 생기면 채운다
  out.push({ id: null, group: 'boss', nameKey: 'archive.slot.boss' });
  return out;
}

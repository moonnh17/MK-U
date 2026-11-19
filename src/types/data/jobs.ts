import type { JobId, SchoolId } from './skills';

// ---------- 직업·전직 ----------

/** 전직 분기 (마기학자: 헥타르/아크로). 마기법사·전사는 틀만 */
export interface AdvancementDef {
  id: string;
  nameKey: string;
  /** 학파 색 (연출·화면 전환) */
  color: string;
  /** 학파 궁극기 */
  ultimate: string | null;
  /** 이 학파의 패시브 (자동 지급하지 않고 카드로 고른다) */
  passive: string | null;
}

export interface JobDef {
  id: JobId;
  nameKey: string;
  enabled: boolean;
  startUltimate: string;
  /** 시작 무기 (1번 칸) */
  startWeapon: string;
  /** 전직 전 카드로 나오는 계열 */
  preSchools: SchoolId[];
  /**
   * 숙련 판정(전사, 원본 규칙): 두 숙련 레벨을 비교해 큰 쪽 분기로. 같으면 두 번째가 1 이상일 때 두 번째, 아니면 첫 번째.
   * 없으면 고른 카드 계열 수로 판정한다.
   */
  masteryJudge?: [string, string];
  /** 전직하면 새 학파 스킬을 이만큼 무작위로 준다 (전사, 사용자 지정) */
  advancementGrantSkills?: number;
  /** 'slots': 액티브 1→2→3번 칸 스킬의 학파로 전직 (마기법사). 없으면 카드 계열 집계 */
  judge?: 'slots';
  /** 'allJobs': 전직 후 모든 직업 스킬이 카드로 (숙련 제외, 마기법사). 없으면 자기 학파만 */
  afterAdvancePool?: 'allJobs';
  /** 전직해도 반대 학파 스킬 제거·변환을 하지 않는다 (마기법사) */
  keepSkillsOnAdvance?: boolean;
  /** 개전 각인: 이 칸(0부터) 스킬의 각인 적용, 전직 학파 스킬이면 수치 × (1 + resonance) */
  imprint?: { slot: number; resonance: number };
  advancements: AdvancementDef[];
}

export interface JobsData {
  /** 직업 선택 화면(M5) 전까지 쓰는 직업 */
  startJob: JobId;
  /** 이 챕터의 마지막 보스를 잡으면 전직 */
  advanceAfterChapter: number;
  jobs: JobDef[];
}

// ---------- 카드 ----------

export type CardOfferKind = 'skill' | 'item';

export interface CardsData {
  /** 한 번에 보여주는 카드 수 */
  cardCount: number;
  /** 카드창마다 1회 리롤 비용(코인) */
  rerollCost: number;
  /** 런 시작 카드 */
  runStart: CardOfferKind;
  /** 스테이지를 끝낼 때마다 이 순서로 돈다 (런 전체 스테이지 번호 1부터) */
  afterStageCycle: CardOfferKind[];
  /** 보스(X-2, X-5)를 잡으면 보스방에서 한 번 더 */
  bossBonus: CardOfferKind;
  /** 스킬 카드 종류별 뽑기 가중치 */
  skillWeights: { new: number; levelUp: number; passiveNew: number; passiveLevelUp: number };
}

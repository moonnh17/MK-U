import type { WeaponItem } from '../systems/weapons';
import type { CutIn, CutPage } from '../ui/cutscenePages';
import type { SfxId } from '../systems/sound';
import type { ButtonAction } from './actions';
import type { UiMode } from '../input/uiMode';
import type { AnyCard } from '../systems/cards';
import type { CardOfferKind, EncounterKindId, GradeId, StatId } from '../types/data';

/** 이벤트 이름 → 페이로드 */
export interface GameEvents {
  /** 눌린 순간의 버튼 명령 (로그·UI 피드백용) */
  command: { action: ButtonAction; enabled: boolean };
  uiModeChanged: { mode: UiMode };
  debugToggled: { on: boolean };
  /** 디버그: 현재 방 즉시 클리어 */
  debugClearRoom: Record<string, never>;
  /** 화면 가운데 짧은 알림 */
  toast: { text: string };
  /** 근처에 상호작용 대상이 생기거나 사라짐 (모바일 공격 버튼 → 줍기/조사) */
  interactHint: { kind: 'weapon' | 'chest' | 'merchant' | 'lab' | 'vending' | 'portal' | 'statue' | null };
  /** 전투 시작·방 클리어 띠 */
  combatBanner: { kind: 'start' | 'clear' };
  /** 아이템 획득 창을 닫았다 */
  itemGetDone: Record<string, never>;
  /** 사망·클리어 화면이 뜨거나(true) 닫힘(false) */
  overlay: { open: boolean };
  /** 화면의 '다시 시작' 버튼 */
  restartRequested: Record<string, never>;

  /** 게임을 멈추는 창(카드 선택·인벤토리)이 열리거나 닫힘 */
  modal: { kind: 'cards' | 'inventory' | 'cutscene' | 'job' | 'archive' | 'story' | 'intro' | 'pause' | 'portal' | 'itemGet' | null };
  /** 포탈 이동 화면을 덮거나(on) 걷는다 */
  warp: { on: boolean };
  /** 효과음 하나 */
  sfx: { id: SfxId };
  /** 소리 켜기·끄기 요청 / 바뀜 */
  muteToggle: Record<string, never>;
  /** 지금 앞에 있는 바닥 무기·진열 무기 (없으면 null) */
  weaponTip: { item: WeaponItem | null };
  /** 이 곡을 튼다 (같은 곡이면 그대로) */
  music: { track: string };
  volumeChanged: Record<string, never>;
  muteChanged: { muted: boolean };
  /** 일시정지 창의 '계속하기' */
  pauseResume: Record<string, never>;
  /** 화면 가운데 큰 글자 (보스 단계 이름·방 클리어) */
  banner: { text: string; color: string; size: number; sec: number };
  /** 보스 등장 컷 이름 띠 (name이 빈 문자열이면 걷는다) */
  bossIntroBand: { name: string; sub: string };
  /** 보스 체력바가 보이거나 사라짐 (미니 대사 말풍선 자리) */
  bossBarShown: { shown: boolean };
  /** 컷인 → 설명창 (각성·궁극기 각성·전직) */
  cutsceneShow: { cut: CutIn; pages: CutPage[] };
  /** 컷인·설명창을 다 넘겼다 */
  cutsceneDone: Record<string, never>;
  /** 미모사 제미니 일반 스토리 대화 (게임을 멈춘다). lines: 차례로 넘길 문장 */
  storyShow: { lines: string[] };
  storyDone: Record<string, never>;
  /** 미모사 제미니 미니 대사 한 문장을 띄우거나(null이면) 숨긴다 */
  geminiMini: { line: { text: string; mood: 'calm' | 'ominous' } | null };
  /** 디버그: 계열 집계를 정하고 바로 전직 */
  debugAdvance: { hectar: number; acro: number };
  /** 카드 선택창에 카드를 띄운다 */
  cardsShow: { titleKey: string; cards: AnyCard[]; reroll: { cost: number; enabled: boolean; used: boolean } | null };
  /** 카드창 리롤 (코인) */
  cardReroll: Record<string, never>;
  /** 디버그: 다음 조우 칸 유형 / 무기 지급 / 코인 */
  debugForceEncounter: { kind: EncounterKindId | null };
  /** 다음 조우 칸을 이 히든보스로 */
  debugHiddenBoss: { id: string };
  /** 디버그: 지금 빌드 그대로 이 스테이지로 */
  debugGoStage: { chapter: number; stage: number };
  debugGiveWeapon: { defId: string; grade: GradeId };
  debugCoins: { amount: number };
  debugGiveItem: { itemId: string };
  /** 아이템을 얻었다 (set: 세트 합성 결과) */
  itemGot: { itemId: string; set: boolean };
  /** 카드 선택창 → 이 카드를 골랐다 */
  cardPick: { index: number };
  /** 인벤토리 → 스킬을 칸에 넣는다 */
  inventoryEquip: { skillId: string; target: number | 'passive' };
  /** 실험장: 직업 선택 창 열기·고르기·닫기 */
  jobWindowShow: { selected: string | null };
  labJobPicked: { jobId: string };
  jobWindowClose: Record<string, never>;
  /** 실험장: 기억조각 보관대 */
  archiveShow: Record<string, never>;
  archiveClose: Record<string, never>;
  /** 저장이 바뀌었다 (결정 표시 갱신) */
  saveChanged: Record<string, never>;
  /** 인벤토리 아이템 탭: 그 슬롯의 무기를 발밑에 버린다 */
  inventoryDropWeapon: { slot: 0 | 1 };
  /** 인벤토리 열기 요청(보관 알림의 버튼) / 닫기 요청(닫기 버튼) */
  inventoryOpenRequest: Record<string, never>;
  inventoryCloseRequest: Record<string, never>;
  /** 장착 상태가 바뀜 → 인벤토리 다시 그리기 */
  inventoryChanged: Record<string, never>;
  /** 새 스킬이 칸이 없어 보관됨 */
  storedNotice: { skillId: string };

  /** 디버그 패널 */
  debugSetSkill: { skillId: string; level: number; awakened: boolean };
  debugSetStat: { stat: StatId; value: number };
  debugOpenCards: { kind: CardOfferKind };
  debugFillUltimate: Record<string, never>;
  debugSpawn: { enemyId: string; count: number; elite?: string | null };
  debugBarrage: Record<string, never>;
  /** 보스 체력을 최대 체력의 ratio로 */
  debugBossHp: { ratio: number };
}

type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(name: K, fn: Handler<E[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<never>);
    return () => this.off(name, fn);
  }

  off<K extends keyof E>(name: K, fn: Handler<E[K]>): void {
    this.handlers.get(name)?.delete(fn as Handler<never>);
  }

  emit<K extends keyof E>(name: K, payload: E[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of [...set]) (fn as Handler<E[K]>)(payload);
  }
}

export const bus = new EventBus<GameEvents>();

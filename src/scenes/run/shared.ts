/** 전투 씬과 그 부품이 함께 쓰는 선언 */
import type Phaser from 'phaser';
import type { ButtonAction } from '../../core/actions';
import { bus } from '../../core/events';
import type { PlayerState } from '../../core/session';
import type { StageRef } from '../../systems/run';
import type { SfxId } from '../../systems/sound';
import type { CardOfferKind, SchoolId } from '../../types/data';

/** 효과음 하나 (합성은 audio/sfx.ts) */
export const sfx = (id: SfxId) => bus.emit('sfx', { id });

export interface RunSceneData {
  stage?: StageRef;
  player?: PlayerState;
  /** 이 스테이지 시작방에서 고를 카드 */
  offers?: CardOfferKind[];
  /** 새 런: 실험장에서 고른 직업 */
  job?: string;
  /** 포탈을 타고 왔다 (도착 연출, 이동 화면을 걷는다) */
  warpIn?: boolean;
  /** 이동 화면에서 고른 아이템의 획득 카드 (다음 스테이지에서 보여 준다) */
  itemGets?: ItemGet[];
}

export interface Prop {
  sprite: Phaser.GameObjects.Image;
  roomId: number;
  radius: number;
}

export interface Offer {
  kind: CardOfferKind | 'school';
  boss: boolean;
  /** 마기수집첨탑 보상 */
  spire?: boolean;
  /** 학파 선택 카드(전직 동점): 동점인 학파 */
  schools?: SchoolId[];
}

/** 아이템 획득 창 한 장. from: 합쳐지는 재료 그림(세트) / weapon: itemId가 무기 id */
export interface ItemGet {
  itemId: string;
  set: boolean;
  weapon?: boolean;
  from?: { key: string; color: string }[];
}

export type Modal = 'cards' | 'inventory' | 'cutscene' | 'story' | 'intro' | 'pause' | 'portal' | 'itemGet' | null;

/** 조우 칸 물약 자판기 */
export interface Vending {
  x: number;
  y: number;
  stock: number;
  sprite: Phaser.GameObjects.Image;
}

export const SKILL_ACTIONS: ButtonAction[] = ['skill1', 'skill2', 'skill3', 'skill4'];

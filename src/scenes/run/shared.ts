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
}

export interface Prop {
  sprite: Phaser.GameObjects.Image;
  roomId: number;
  radius: number;
}

export interface Offer {
  kind: CardOfferKind | 'item' | 'school';
  boss: boolean;
  /** 아이템 선택 카드(첨탑): 미리 뽑아 둔 아이템 */
  items?: string[];
  /** 학파 선택 카드(전직 동점): 동점인 학파 */
  schools?: SchoolId[];
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

/**
 * 방 하나의 전투 진행 (순수 로직). 씬은 이 상태기계가 내놓는 이벤트대로 문을 잠그고 적을 소환한다.
 *  idle ──입장──▶ locked ──마지막 웨이브 처치──▶ cleared
 * 웨이브가 없는 방(시작방·조우 칸·출구)은 처음부터 cleared라 잠기지 않는다.
 */
import { Rng } from '../core/rng';
import type { RoomKind, WavesData } from '../types/data';

export type RoomPhase = 'idle' | 'locked' | 'cleared';

/** 웨이브 = 소환할 적 id 목록 */
export type Wave = string[];

export type RoomEvent = { type: 'lock' } | { type: 'spawn'; wave: Wave; index: number } | { type: 'cleared' };

export class RoomState {
  phase: RoomPhase;
  waveIndex = -1;
  alive = 0;
  private delay = 0;

  constructor(
    readonly kind: RoomKind,
    readonly waves: readonly Wave[],
    private readonly waveDelaySec: number,
  ) {
    this.phase = waves.length > 0 ? 'idle' : 'cleared';
  }

  /** 플레이어가 방 안쪽까지 들어왔을 때. 한 번 깬 방은 다시 잠기지 않는다. */
  enter(): RoomEvent[] {
    if (this.phase !== 'idle') return [];
    this.phase = 'locked';
    this.delay = 0;
    return [{ type: 'lock' }];
  }

  update(dt: number): RoomEvent[] {
    if (this.phase !== 'locked' || this.alive > 0) return [];
    if (this.delay > 0) {
      this.delay -= dt;
      return [];
    }
    if (this.waveIndex + 1 < this.waves.length) {
      this.waveIndex++;
      const wave = this.waves[this.waveIndex]!;
      this.alive = wave.length;
      return [{ type: 'spawn', wave, index: this.waveIndex }];
    }
    this.phase = 'cleared';
    return [{ type: 'cleared' }];
  }

  enemyKilled(): void {
    if (this.alive <= 0) return;
    this.alive--;
    if (this.alive === 0) this.delay = this.waveDelaySec;
  }

  /** 디버그: 즉시 클리어 */
  forceClear(): RoomEvent[] {
    if (this.phase === 'cleared') return [];
    this.phase = 'cleared';
    this.alive = 0;
    return [{ type: 'cleared' }];
  }

  get remainingWaves(): number {
    return Math.max(0, this.waves.length - this.waveIndex - 1);
  }
}

/** 전투 칸 웨이브 계획 (시드 재현). 웨이브 수와 구성은 데이터에서 뽑는다. */
export function planCombatWaves(rng: Rng, chapter: number, waveCount: readonly [number, number], data: WavesData): Wave[] {
  const pool = data.waves.filter((w) => w.chapter === chapter);
  if (pool.length === 0) throw new Error(`챕터 ${chapter} 웨이브 데이터 없음`);
  const n = rng.int(waveCount[0], waveCount[1]);
  const waves: Wave[] = [];
  for (let i = 0; i < n; i++) {
    const tpl = rng.weighted(pool.map((w) => ({ item: w, weight: w.weight })));
    const wave: Wave = [];
    for (const s of tpl.spawns) {
      const count = rng.int(s.count[0], s.count[1]);
      for (let k = 0; k < count; k++) wave.push(s.enemy);
    }
    waves.push(wave);
  }
  return waves;
}

export function roomWaveSeedLabel(chapter: number, stage: number, roomId: number): string {
  return `waves-${chapter}-${stage}-${roomId}`;
}

/** 방 종류별 웨이브. 보스방은 M1에서 정지 더미 1개(보스 패턴은 M3). */
export function wavesForRoom(
  seed: number,
  chapter: number,
  stage: number,
  roomId: number,
  kind: RoomKind,
  combatWaves: readonly [number, number],
  bossPlaceholder: string,
  data: WavesData,
): Wave[] {
  if (kind === 'combatRoom') {
    return planCombatWaves(Rng.derive(seed, roomWaveSeedLabel(chapter, stage, roomId)), chapter, combatWaves, data);
  }
  if (kind === 'bossRoom') return [[bossPlaceholder]];
  return [];
}

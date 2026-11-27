/**
 * 헥타르 미모사 시스템 변조를 전투 씬에 입힌다: 패치 노트(이동 반전·밀림 반전), 슬롯 셔플(스킬 칸 순서·입력),
 * 연산 오류(표시만 깨짐). 판정·인벤토리는 건드리지 않고, 보스가 사라지면 모두 원래대로.
 */
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import type { Vec2 } from '../../core/actions';
import type { MimosaHooks, MimosaUiEvent } from '../../bosses/mimosa/controller';
import { garble, patchMove, patchPush, shuffledSlot, type PatchRule } from '../../systems/mimosa';
import type { RunScene } from '../RunScene';

export class TamperRuntime {
  patch: PatchRule[] = [];
  slotPerm: number[] | null = null;
  glitch = false;
  private garbleRng = new Rng(1);
  private garbleText: string | null = null;
  private garbleLeft = 0;

  constructor(private readonly run: RunScene) {}

  hooks(): MimosaHooks {
    const run = this.run;
    return {
      setPatch: (rules) => {
        this.patch = rules;
      },
      setSlotPerm: (perm) => {
        this.slotPerm = perm;
        run.skillRt.refreshSkillView();
      },
      setGlitch: (on) => {
        this.glitch = on;
      },
      ui: (ev: MimosaUiEvent) => bus.emit('mimosaUi', ev),
      say: (keys, mood) => run.progression.mini.push(keys.map((k) => ({ text: run.ctx.t(k), mood })), 3),
      evolution: () => run.session.player.overflow?.evolution ?? null,
      band: () => {
        const e = [...run.bossControllers.keys()].find((x) => x.def.id === run.ctx.data.overflow.mimosa.enemyId);
        if (e) bus.emit('bossIntroBand', { name: run.ctx.t(e.nameKey), sub: run.ctx.t('boss.intro.stage', { chapter: run.session.stage.chapter, stage: run.session.stage.stage }) });
        // 띠는 잠깐만 (보통 보스는 등장 컷이 끝날 때 지운다)
        run.time.delayedCall(run.ctx.data.overflow.mimosa.intro.bandSec * 1000, () => bus.emit('bossIntroBand', { name: '', sub: '' }));
      },
      focus: (at) => {
        run.cameraHold = at;
      },
      activeSlots: run.ctx.data.skills.activeSlots,
    };
  }

  /** 이동 입력 (패치 노트) */
  move(m: Vec2): Vec2 {
    return this.patch.length > 0 ? patchMove(m, this.patch) : m;
  }

  /** 밀림 (중력 패치면 반대로) */
  push(v: Vec2): Vec2 {
    return this.patch.length > 0 ? patchPush(v, this.patch) : v;
  }

  /** 화면 칸 j를 눌렀을 때 쓸 원래 칸 */
  slot(j: number): number {
    return shuffledSlot(this.slotPerm, j);
  }

  /** 연산 오류 중 보스 이름: 잠깐씩 깨진 글자로 바뀌었다 돌아온다 (표시만) */
  bossName(name: string, dt: number): string {
    if (!this.glitch) return name;
    this.garbleLeft -= dt;
    if (this.garbleLeft <= 0) {
      const g = this.run.ctx.data.overflow.mimosa.glitch;
      this.garbleLeft = 0.12;
      this.garbleText = this.garbleRng.chance(0.5) ? garble(this.garbleRng, name, g.nameRatio, g.glyphs) : null;
    }
    return this.garbleText ?? name;
  }

  reset(): void {
    this.patch = [];
    this.slotPerm = null;
    this.glitch = false;
  }
}

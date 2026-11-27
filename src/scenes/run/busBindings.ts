/** 전투 씬이 받는 이벤트(UI·디버그 패널) 연결. 씬이 끝날 때 풀 해제 함수들을 돌려준다. */
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { rollOptions } from '../../systems/loot';
import { overflowStageAt } from '../../systems/overflow';
import type { RunScene } from '../RunScene';
import type { RunSceneData } from './shared';

export function bindRunEvents(run: RunScene): (() => void)[] {
  return [
    bus.on('debugClearRoom', () => run.debugTools.debugClearRoom()),
    bus.on('restartRequested', () => run.playerLife.restartRun()),
    bus.on('cardPick', ({ index }) => run.progression.pickCard(index)),
    bus.on('combinerPick', ({ a, b }) => run.loot.combine(a, b)),
    bus.on('combinerClose', () => run.loot.closeCombiner()),
    bus.on('inventoryEquip', ({ skillId, target }) => run.progression.equip(skillId, target)),
    bus.on('inventoryDropWeapon', ({ slot }) => run.loot.dropFromSlot(slot)),
    bus.on('inventoryDiscardItem', ({ id }) => run.loot.discardItem(id)),
    bus.on('inventoryOpenRequest', () => run.progression.openInventory()),
    bus.on('inventoryCloseRequest', () => run.progression.closeInventory()),
    bus.on('debugSetSkill', (e) => run.debugTools.debugSetSkill(e.skillId, e.level, e.awakened)),
    bus.on('debugOpenCards', ({ kind }) => run.progression.queueOffers([{ kind, boss: false }])),
    bus.on('debugFillUltimate', () => {
      run.session.player.ultimate.cooldownLeft = 0;
    }),
    bus.on('debugSpawn', ({ enemyId, count, elite }) => run.debugTools.debugSpawn(enemyId, count, elite ?? null)),
    bus.on('debugBarrage', () => run.debugTools.debugBarrage()),
    bus.on('cutsceneDone', () => run.progression.showNextCut()),
    bus.on('storyDone', () => run.progression.finishStory()),
    bus.on('itemGetDone', () => {
      if (run.modal === 'itemGet') run.setModal(null);
    }),
    bus.on('pauseResume', () => {
      if (run.modal === 'pause') run.setModal(null);
    }),
    bus.on('cardReroll', () => run.progression.rerollCards()),
    bus.on('debugForceEncounter', ({ kind }) => {
      run.encounters.forcedEncounter = kind;
    }),
    bus.on('debugGoStage', ({ chapter, stage }) => {
      if (run.modal || run.session.outcome) return;
      const p = run.session.player;
      // 오버플로우는 1-1부터 따라가 그 스테이지의 장·보스 칸을 맞춘다. 본편은 마지막 장까지만
      if (p.overflow) {
        const at = overflowStageAt(run.ctx.config.seed, chapter, stage, run.ctx.data);
        // 보스 칸 기록만 맞추고 고른 진화·받을 상자는 그대로
        p.overflow = { ...p.overflow, onceBosses: at.state.onceBosses, lastBoss: at.state.lastBoss };
        run.scene.restart({ stage: at.stage, player: p, offers: [] } satisfies RunSceneData);
        return;
      }
      if (chapter > run.ctx.data.mapgen.chapters) return;
      run.scene.restart({ stage: { chapter, stage }, player: p, offers: [] } satisfies RunSceneData);
    }),
    bus.on('debugHiddenBoss', ({ id }) => {
      run.encounters.forcedEncounter = 'hiddenBoss';
      run.encounters.forcedHiddenBoss = id;
    }),
    bus.on('debugGiveWeapon', ({ defId }) => {
      const d = run.ctx.data;
      const def = run.weaponDefOf(defId);
      const grade = def.grade;
      const count = d.groupMultipliers.grades.find((g) => g.id === grade)?.randomOptions ?? 0;
      const rng = Rng.derive(run.ctx.config.seed, `debug-weapon-${run.loot.lootSeq++}`);
      const options = rollOptions(rng, def, count, d.weapons.options);
      run.loot.dropWeapon({ defId, grade, options }, run.player.x + 16, run.player.y);
    }),
    bus.on('debugGiveItem', ({ itemId }) => {
      run.loot.giveItem(itemId);
      run.progression.checkAwakenings();
    }),
    bus.on('debugAllItems', () => run.debugTools.debugAllItems()),
    bus.on('debugClearItems', () => run.debugTools.debugClearItems()),
    bus.on('debugAllSkills', ({ awakened }) => run.debugTools.debugAllSkills(awakened)),
    bus.on('debugHeal', () => run.debugTools.debugHeal()),
    bus.on('debugCoins', ({ amount }) => {
      run.session.player.coins += amount;
    }),
    bus.on('debugAdvance', ({ hectar, acro }) => run.debugTools.debugAdvance(hectar, acro)),
    bus.on('debugAdvanceTo', ({ school }) => run.debugTools.debugAdvanceTo(school)),
    bus.on('debugBossHp', ({ ratio }) => {
      for (const e of run.enemies) if (e.def.rank === 'boss' || e.def.rank === 'hiddenBoss') e.hp = Math.max(1, e.maxHp * ratio);
    }),
  ];
}

/** 전투 씬이 받는 이벤트(UI·디버그 패널) 연결. 씬이 끝날 때 풀 해제 함수들을 돌려준다. */
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { rollOptions } from '../../systems/loot';
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
      run.scene.restart({ stage: { chapter, stage }, player: run.session.player, offers: [] } satisfies RunSceneData);
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

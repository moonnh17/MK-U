/**
 * 디버그 패널의 탭들: 전투(적 소환·보스 체력·회복) / 아이템(지급·전부·비우기·무기·입자) / 스킬(적용·전부·카드·전직) /
 * 진행(스테이지 이동·조우·히든보스) / 저장. 요청은 이벤트로 RunScene에 보낸다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { isSkillImplemented } from '../skills/registry';
import type { EncounterKindId, GradeId } from '../types/data';
import type { DebugTab } from './debugPanel';

function select(options: [string, string][]): HTMLSelectElement {
  const s = document.createElement('select');
  for (const [value, label] of options) {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    s.appendChild(o);
  }
  return s;
}

function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  if (cls) b.className = cls;
  b.addEventListener('click', onClick);
  return b;
}

function num(value: string, width = 44): HTMLInputElement {
  const el = document.createElement('input');
  el.type = 'number';
  el.value = value;
  el.style.width = `${width}px`;
  return el;
}

/** 이름표가 붙은 한 줄 */
function field(label: string, ...els: HTMLElement[]): HTMLDivElement {
  const r = document.createElement('div');
  r.className = 'dbg-row';
  const l = document.createElement('label');
  l.textContent = label;
  const box = document.createElement('div');
  box.append(...els);
  r.append(l, box);
  return r;
}

/** 버튼만 늘어선 줄 */
function buttons(...els: HTMLElement[]): HTMLDivElement {
  const r = document.createElement('div');
  r.className = 'dbg-buttons';
  r.append(...els);
  return r;
}

function page(...rows: HTMLElement[]): HTMLDivElement {
  const p = document.createElement('div');
  p.append(...rows);
  return p;
}

export function buildDebugTabs(ctx: GameContext): DebugTab[] {
  const t = ctx.t;
  const d = ctx.data;

  // ---------- 전투 ----------
  const enemySel = select(d.enemies.enemies.map((e) => [e.id, t(e.nameKey)]));
  const eliteSel = select([['', t('debug.eliteNone')], ...d.elites.elites.map((e): [string, string] => [e.id, t(e.nameKey)])]);
  const countInput = num('3', 40);
  const bossHpInput = num('51');
  const combat = page(
    field(t('debug.spawn'), enemySel, eliteSel, countInput, button(t('debug.spawnGo'), () => bus.emit('debugSpawn', { enemyId: enemySel.value, count: Math.max(1, Number(countInput.value) || 1), elite: eliteSel.value === '' ? null : eliteSel.value }), 'go')),
    field(t('debug.bossHp'), bossHpInput, button(t('debug.apply'), () => bus.emit('debugBossHp', { ratio: Math.max(1, Math.min(100, Number(bossHpInput.value) || 100)) / 100 }), 'go')),
    buttons(
      button(t('debug.heal'), () => bus.emit('debugHeal', {}), 'big'),
      button(t('debug.fillUltimate'), () => bus.emit('debugFillUltimate', {}), 'big'),
      button(t('debug.barrage'), () => bus.emit('debugBarrage', {})),
    ),
  );

  // ---------- 아이템·무기 ----------
  const itemSel = select(d.items.items.map((x): [string, string] => [x.id, t(x.nameKey)]));
  const weaponSel = select(d.weapons.weapons.map((w): [string, string] => [w.id, t(w.nameKey)]));
  const gradeSel = select(d.groupMultipliers.grades.map((g): [string, string] => [g.id, t(g.nameKey)]));
  const items = page(
    buttons(
      button(t('debug.allItems'), () => bus.emit('debugAllItems', {}), 'big'),
      button(t('debug.clearItems'), () => bus.emit('debugClearItems', {}), 'big warn'),
    ),
    field(t('debug.giveItem'), itemSel, button(t('debug.give'), () => bus.emit('debugGiveItem', { itemId: itemSel.value }), 'go')),
    field(t('debug.giveWeapon'), weaponSel, gradeSel, button(t('debug.give'), () => bus.emit('debugGiveWeapon', { defId: weaponSel.value, grade: gradeSel.value as GradeId }), 'go')),
    buttons(
      button(t('debug.coins'), () => bus.emit('debugCoins', { amount: 50 })),
      button(t('debug.coinsMany'), () => bus.emit('debugCoins', { amount: 1000 })),
      button(t('debug.itemCard'), () => bus.emit('debugOpenCards', { kind: 'item' })),
    ),
  );

  // ---------- 스킬·전직 ----------
  const skills = d.skills.skills.filter((s) => isSkillImplemented(s.id));
  const skillSel = select(skills.map((s) => [s.id, t(s.nameKey)]));
  const levelSel = select([
    ['0', t('debug.level0')],
    ['1', 'Lv1'],
    ['2', 'Lv2'],
    ['3', 'Lv3'],
    ['A', `Lv3 ${t('debug.awakened')}`],
  ]);
  levelSel.value = '1';
  const hectarInput = num('3', 36);
  const acroInput = num('2', 36);
  const schoolSel = select(d.jobs.jobs.filter((j) => j.enabled).flatMap((j) => j.advancements.map((a): [string, string] => [a.id, `${t(j.nameKey)} · ${t(a.nameKey)}`])));
  const skillPage = page(
    buttons(
      button(t('debug.allSkills'), () => bus.emit('debugAllSkills', { awakened: false }), 'big'),
      button(t('debug.allSkillsAwakened'), () => bus.emit('debugAllSkills', { awakened: true }), 'big'),
    ),
    field(
      t('debug.setSkill'),
      skillSel,
      levelSel,
      button(t('debug.apply'), () => {
        const v = levelSel.value;
        bus.emit('debugSetSkill', { skillId: skillSel.value, level: v === 'A' ? d.skills.maxLevel : Number(v), awakened: v === 'A' });
      }, 'go'),
    ),
    buttons(
      button(t('debug.skillCard'), () => bus.emit('debugOpenCards', { kind: 'skill' })),
      button(t('debug.evolutionCard'), () => bus.emit('debugOpenCards', { kind: 'evolution' })),
    ),
    field(t('debug.advanceHint'), hectarInput, acroInput, button(t('debug.advance'), () => bus.emit('debugAdvance', { hectar: Number(hectarInput.value) || 0, acro: Number(acroInput.value) || 0 }), 'go')),
    field(t('debug.advanceTo'), schoolSel, button(t('debug.apply'), () => bus.emit('debugAdvanceTo', { school: schoolSel.value }), 'go')),
  );

  // ---------- 진행 ----------
  const stageSel = select(
    // 오버플로우 런이면 장 너머까지 (본편 런에서 4장 이후는 무시된다)
    Array.from({ length: (d.mapgen.chapters + d.overflow.debugExtraChapters) * d.mapgen.stagesPerChapter }, (_, i): [string, string] => {
      const c = Math.floor(i / d.mapgen.stagesPerChapter) + 1;
      const s = (i % d.mapgen.stagesPerChapter) + 1;
      return [`${c}-${s}`, `${c}-${s}`];
    }),
  );
  const encSel = select([['', t('debug.encounterRandom')], ...(['treasure', 'merchant', 'skillShop', 'raid', 'magiSpire', 'hiddenBoss'] as const).map((k): [string, string] => [k, t(`encounter.${k}`)])]);
  const hbSel = select(d.bosses.hiddenBosses.map((h): [string, string] => [h.id, t(`enemy.${h.id}`)]));
  const progress = page(
    field(
      t('debug.goStage'),
      stageSel,
      button(t('debug.go'), () => {
        const [c, s] = stageSel.value.split('-').map(Number);
        bus.emit('debugGoStage', { chapter: c!, stage: s! });
      }, 'go'),
    ),
    field(t('debug.forceEncounter'), encSel, button(t('debug.apply'), () => bus.emit('debugForceEncounter', { kind: encSel.value === '' ? null : (encSel.value as EncounterKindId) }), 'go')),
    field(t('debug.hiddenBoss'), hbSel, button(t('debug.apply'), () => bus.emit('debugHiddenBoss', { id: hbSel.value }), 'go')),
  );

  // ---------- 저장 ----------
  const save = page(
    buttons(
      button(t('debug.crystals'), () => {
        ctx.save.data.crystals += 100;
        ctx.save.write();
        bus.emit('saveChanged', {});
      }),
      button(t('debug.resetSave'), () => {
        ctx.save.reset();
        bus.emit('saveChanged', {});
        bus.emit('toast', { text: t('debug.saveReset') });
      }, 'warn'),
    ),
  );

  return [
    { id: 'combat', title: t('debug.tab.combat'), body: combat },
    { id: 'items', title: t('debug.tab.items'), body: items },
    { id: 'skills', title: t('debug.tab.skills'), body: skillPage },
    { id: 'progress', title: t('debug.tab.progress'), body: progress },
    { id: 'save', title: t('debug.tab.save'), body: save },
  ];
}

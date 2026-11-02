/**
 * 디버그 패널의 '스킬·스탯' 구획: 스킬 추가·레벨 설정, 스탯 설정, 카드창 열기, 궁극기 충전, 적 소환.
 * 각성 요구 스탯(20)을 런 중에 맞추기 어려워 테스트용으로 둔다. 요청은 이벤트로 RunScene에 보낸다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { isSkillImplemented } from '../skills/registry';
import type { EncounterKindId, GradeId } from '../types/data';

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

function button(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}

function row(...els: HTMLElement[]): HTMLDivElement {
  const r = document.createElement('div');
  r.append(...els);
  return r;
}

export function buildDebugSkills(ctx: GameContext): HTMLElement {
  const t = ctx.t;
  const d = ctx.data;
  const body = document.createElement('div');
  body.className = 'dbg-skills';

  // 스킬 (발동 로직이 있는 스킬만)
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
  body.appendChild(
    row(
      skillSel,
      levelSel,
      button(t('debug.setSkill'), () => {
        const v = levelSel.value;
        bus.emit('debugSetSkill', { skillId: skillSel.value, level: v === 'A' ? d.skills.maxLevel : Number(v), awakened: v === 'A' });
      }),
    ),
  );

  // 카드창·궁극기
  body.appendChild(
    row(
      button(t('debug.skillCard'), () => bus.emit('debugOpenCards', { kind: 'skill' })),
      button(t('debug.itemCard'), () => bus.emit('debugOpenCards', { kind: 'item' })),
      button(t('debug.fillUltimate'), () => bus.emit('debugFillUltimate', {})),
    ),
  );

  // 적 소환 (현재 방)
  const enemySel = select(d.enemies.enemies.map((e) => [e.id, t(e.nameKey)]));
  const eliteSel = select([['', t('debug.eliteNone')], ...d.elites.elites.map((e): [string, string] => [e.id, t(e.nameKey)])]);
  const countInput = document.createElement('input');
  countInput.type = 'number';
  countInput.value = '3';
  countInput.style.width = '36px';
  body.appendChild(
    row(
      enemySel,
      eliteSel,
      countInput,
      button(t('debug.spawn'), () =>
        bus.emit('debugSpawn', {
          enemyId: enemySel.value,
          count: Math.max(1, Number(countInput.value) || 1),
          elite: eliteSel.value === '' ? null : eliteSel.value,
        }),
      ),
      button(t('debug.barrage'), () => bus.emit('debugBarrage', {})),
    ),
  );
  const bossHpInput = document.createElement('input');
  bossHpInput.type = 'number';
  bossHpInput.value = '51';
  bossHpInput.style.width = '40px';
  body.appendChild(
    row(
      bossHpInput,
      button(t('debug.bossHp'), () => bus.emit('debugBossHp', { ratio: Math.max(1, Math.min(100, Number(bossHpInput.value) || 100)) / 100 })),
    ),
  );
  // 다음 조우 칸 유형 강제, 무기 지급, 코인
  const encSel = select([['', t('debug.encounterRandom')], ...(['treasure', 'merchant', 'skillShop', 'raid', 'magiSpire', 'hiddenBoss'] as const).map((k): [string, string] => [k, t(`encounter.${k}`)])]);
  // 스테이지 이동 (지금 빌드 그대로)
  const stageSel = select(
    Array.from({ length: d.mapgen.chapters * d.mapgen.stagesPerChapter }, (_, i): [string, string] => {
      const c = Math.floor(i / d.mapgen.stagesPerChapter) + 1;
      const s = (i % d.mapgen.stagesPerChapter) + 1;
      return [`${c}-${s}`, `${c}-${s}`];
    }),
  );
  body.appendChild(
    row(
      stageSel,
      button(t('debug.goStage'), () => {
        const [c, s] = stageSel.value.split('-').map(Number);
        bus.emit('debugGoStage', { chapter: c!, stage: s! });
      }),
    ),
  );
  // 히든보스: 다음 조우 칸을 그 히든보스로
  const hbSel = select(d.bosses.hiddenBosses.map((h): [string, string] => [h.id, t(`enemy.${h.id}`)]));
  body.appendChild(row(hbSel, button(t('debug.hiddenBoss'), () => bus.emit('debugHiddenBoss', { id: hbSel.value }))));
  const itemSel = select(d.items.items.map((x): [string, string] => [x.id, t(x.nameKey)]));
  body.appendChild(row(itemSel, button(t('debug.giveItem'), () => bus.emit('debugGiveItem', { itemId: itemSel.value }))));
  const weaponSel = select(d.weapons.weapons.map((w): [string, string] => [w.id, t(w.nameKey)]));
  const gradeSel = select(d.groupMultipliers.grades.map((g): [string, string] => [g.id, t(g.nameKey)]));
  body.appendChild(
    row(
      encSel,
      button(t('debug.forceEncounter'), () => bus.emit('debugForceEncounter', { kind: encSel.value === '' ? null : (encSel.value as EncounterKindId) })),
      button(t('debug.coins'), () => bus.emit('debugCoins', { amount: 50 })),
    ),
  );
  // 영구 저장: 마기력 결정 지급·저장 초기화
  body.appendChild(
    row(
      button(t('debug.crystals'), () => {
        ctx.save.data.crystals += 100;
        ctx.save.write();
        bus.emit('saveChanged', {});
      }),
      button(t('debug.resetSave'), () => {
        ctx.save.reset();
        bus.emit('saveChanged', {});
        bus.emit('toast', { text: t('debug.saveReset') });
      }),
    ),
  );
  body.appendChild(
    row(
      weaponSel,
      gradeSel,
      button(t('debug.giveWeapon'), () => bus.emit('debugGiveWeapon', { defId: weaponSel.value, grade: gradeSel.value as GradeId })),
    ),
  );
  // 계열 집계를 정하고 바로 전직
  const pickInput = (v: string) => {
    const el = document.createElement('input');
    el.type = 'number';
    el.value = v;
    el.style.width = '32px';
    return el;
  };
  const hectarInput = pickInput('3');
  const acroInput = pickInput('2');
  const advHint = document.createElement('span');
  advHint.textContent = t('debug.advanceHint');
  body.appendChild(
    row(
      advHint,
      hectarInput,
      acroInput,
      button(t('debug.advance'), () =>
        bus.emit('debugAdvance', { hectar: Number(hectarInput.value) || 0, acro: Number(acroInput.value) || 0 }),
      ),
    ),
  );
  // 입력칸에서 친 키가 게임 조작(WASD 등)으로 새지 않게
  body.addEventListener('keydown', (e) => e.stopPropagation());
  return body;
}

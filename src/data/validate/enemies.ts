/** 데이터 검증: 적·보스·엘리트·웨이브 */
import { HEX_COLOR, isNum, checkPositive, checkRange, checkSprite, checkUnique, checkAttacks } from './shared';
import type { V } from './shared';

/** 적 */
export function validateEnemies(v: V): void {
  const { d, errors, needText } = v;
  // 도감 세계관 분류: 있는 id만, 한 번씩
  for (const [w, lore, ids] of [
    ['enemies', d.enemies.codexLore, d.enemies.enemies.map((e) => e.id)],
    ['items', d.items.codexLore, d.items.items.map((x) => x.id)],
    ['weapons', d.weapons.codexLore, d.weapons.weapons.map((x) => x.id)],
  ] as const) {
    const seen = new Set<string>();
    for (const [g, list] of Object.entries(lore)) {
      needText(`${w}.codexLore.${g}`, `codex.lore.${w === 'enemies' ? 'monsters' : w}.${g}`);
      for (const id of list) {
        if (!(ids as readonly string[]).includes(id)) errors.push(`${w}.codexLore.${g}: 없는 id '${id}'`);
        if (seen.has(id)) errors.push(`${w}.codexLore: '${id}'가 두 분류에 있음`);
        seen.add(id);
      }
    }
  }
  const enemyIds = d.enemies.enemies.map((e) => e.id);
  checkUnique(errors, 'enemies', enemyIds);
  checkUnique(errors, 'enemies.codexNo', d.enemies.enemies.filter((e) => e.codexNo !== undefined).map((e) => String(e.codexNo)));
  checkUnique(errors, 'items.codexNo', d.items.items.filter((e) => e.codexNo !== undefined).map((e) => String(e.codexNo)));
  checkUnique(errors, 'weapons.codexNo', d.weapons.weapons.filter((e) => e.codexNo !== undefined).map((e) => String(e.codexNo)));
  for (const g of ['1', '2', '3', '4', '5', '6', 'unknown']) if (!d.enemies.munGrades[g]) errors.push(`enemies.munGrades: ${g} 없음`);
  for (const e of d.enemies.enemies) if (e.mun !== undefined && e.mun !== null && e.mun !== 'unknown' && !(Number.isInteger(e.mun) && e.mun >= 1 && e.mun <= 6)) errors.push(`enemies.${e.id}.mun: 1~6, 'unknown' 또는 null`);
  for (const e of d.enemies.enemies) {
    const w = `enemies.${e.id}`;
    checkSprite(errors, w, e);
    needText(w, e.nameKey);
    if (!Number.isInteger(e.chapter) || e.chapter < 1 || e.chapter > d.mapgen.chapters) errors.push(`${w}: chapter 범위 밖`);
    if (!['normal', 'elite', 'champion', 'boss', 'hiddenBoss'].includes(e.rank)) errors.push(`${w}: rank 잘못됨`);
    if (!['chase', 'idle', 'boss'].includes(e.ai)) errors.push(`${w}: 알 수 없는 ai '${e.ai}'`);
    if (e.ai === 'boss' && e.id !== d.overflow.mimosa.enemyId && e.id !== d.overflow.acro.enemyId && ![...d.bosses.bosses, ...d.bosses.hiddenBosses].some((b) => b.id === e.id)) errors.push(`${w}: 보스 ai인데 bosses.json에 패턴이 없음`);
    checkPositive(errors, `${w}.maxHp`, e.maxHp);
    checkPositive(errors, `${w}.moveSpeed`, e.moveSpeed, true);
    checkPositive(errors, `${w}.contactDamage`, e.contactDamage, true);
    checkPositive(errors, `${w}.contactIntervalSec`, e.contactIntervalSec);
    checkRange(errors, `${w}.energyOrbs`, e.energyOrbs);
    checkRange(errors, `${w}.coins`, e.coins);
  }

  for (const e of d.enemies.enemies) {
    checkAttacks(v, `enemies.${e.id}`, e.attacks);
    if (e.trail) for (const k of ['everyPx', 'radius', 'liveSec', 'damage', 'tickSec'] as const) checkPositive(errors, `enemies.${e.id}.trail.${k}`, e.trail[k]);
    if (e.keepDistance !== undefined) checkPositive(errors, `enemies.${e.id}.keepDistance`, e.keepDistance);
    if (e.absorb) {
      const w = `enemies.${e.id}.absorb`;
      if (e.absorb.stages.length === 0) errors.push(`${w}.stages: 비어 있음`);
      e.absorb.stages.forEach((st, i) => {
        for (const k of ['absorb', 'hpMul', 'damageMul', 'haloRadius'] as const) checkPositive(errors, `${w}.stages[${i}].${k}`, st[k]);
        if (i > 0 && st.absorb <= e.absorb!.stages[i - 1]!.absorb) errors.push(`${w}.stages[${i}].absorb: 앞 단계보다 커야 함`);
      });
      if (!HEX_COLOR.test(e.absorb.haloColor)) errors.push(`${w}.haloColor: #RRGGBB`);
    }
  }
  // 정예
  const ch = d.waves.champions;
  for (const [c, ids] of Object.entries(ch.ids))
    for (const id of ids) {
      const e = d.enemies.enemies.find((x) => x.id === id);
      if (e?.rank !== 'champion') errors.push(`waves.champions.ids.${c}: '${id}'는 rank champion인 적이어야 함`);
      else if (String(e.chapter) !== c) errors.push(`waves.champions.ids.${c}: '${id}'는 ${c}장 적이어야 함`);
    }
  for (const [c, stages] of Object.entries(ch.stages)) {
    for (const s of stages) if (!Number.isInteger(s) || s < 1 || s > d.mapgen.stagesPerChapter) errors.push(`waves.champions.stages.${c}: 스테이지 범위 밖 (${s})`);
  }
  for (const k of ['waveChance', 'raidBothChance', 'weaponChestChance'] as const) if (!(ch[k] >= 0 && ch[k] <= 1)) errors.push(`waves.champions.${k}: 0~1`);
  if (!(Number.isInteger(ch.maxPerRoom) && ch.maxPerRoom >= 1)) errors.push('waves.champions.maxPerRoom: 1 이상 정수');
  for (const [c, room] of Object.entries(d.ui.chapterRooms)) for (const [k, col] of Object.entries(room)) if (!HEX_COLOR.test(col)) errors.push(`ui.chapterRooms.${c}.${k}: #RRGGBB`);
  if (!d.enemies.enemies.some((x) => x.id === d.loot.spire.troopers.enemy)) errors.push('loot.spire.troopers.enemy: 없는 적');
  checkSprite(errors, 'enemies.projectile', d.enemies.projectile);
}

/** 보스 */
export function validateBosses(v: V): void {
  const { d, errors, needText } = v;
  checkPositive(errors, 'bosses.bannerSec', d.bosses.bannerSec, true);
  checkUnique(errors, 'bosses', [...d.bosses.bosses, ...d.bosses.hiddenBosses].map((b) => b.id));
  for (const b of d.bosses.bosses) {
    if (b.stage < 1 || b.stage > d.mapgen.stagesPerChapter || !d.mapgen.bossStages.includes(b.stage)) errors.push(`bosses.${b.id}: 보스 스테이지가 아님 (${b.stage})`);
  }
  for (const [k, v] of Object.entries(d.bosses.hiddenChapterMul)) checkPositive(errors, `bosses.hiddenChapterMul.${k}`, v);
  if (d.bosses.hiddenChapterMul['1'] === undefined) errors.push('bosses.hiddenChapterMul: 챕터 1 배율 필요');
  for (const h of d.bosses.hiddenBosses) {
    const w = `bosses.hiddenBosses.${h.id}`;
    const wpn = d.weapons.weapons.find((x) => x.id === h.weaponId);
    if (!wpn) errors.push(`${w}: 없는 무기 '${h.weaponId}'`);

    const it = d.items.items.find((x) => x.id === h.itemId);
    if (!it || it.pool !== 'hiddenBoss' || it.bossId !== h.id) errors.push(`${w}: 전용 아이템 '${h.itemId}'는 pool hiddenBoss·bossId ${h.id}여야 함`);
  }
  for (const b of [...d.bosses.bosses, ...d.bosses.hiddenBosses]) {
    const hidden = d.bosses.hiddenBosses.includes(b as never);
    const w = `bosses.${b.id}`;
    const e = d.enemies.enemies.find((x) => x.id === b.id);
    const rank = hidden ? 'hiddenBoss' : 'boss';
    if (!e) errors.push(`${w}: 같은 id의 적이 없음`);
    else if (e.ai !== 'boss' || e.rank !== rank) errors.push(`${w}: 적 '${b.id}'는 ai boss·rank ${rank}여야 함`);
    // 0이면 체력 강화 단계가 없다 (시간 단계 보스)
    if (!(b.enrageAt >= 0 && b.enrageAt < 1)) errors.push(`${w}.enrageAt: 0~1 사이`);
    if (b.enrageAt === 0 && b.patterns.some((p) => p.phase === 2)) errors.push(`${w}: enrageAt 0이면 강화 단계 패턴을 둘 수 없음`);
    const unlocks = b.unlocks ?? [];
    unlocks.forEach((t, i) => {
      if (!(t > 0 && t < 1)) errors.push(`${w}.unlocks[${i}]: 0~1 체력 비율`);
      if (i > 0 && t >= unlocks[i - 1]!) errors.push(`${w}.unlocks: 내림차순이어야 함`);
      needText(w, `boss.unlock.${b.id}.${i + 1}`);
    });
    if (b.darkness) {
      checkPositive(errors, `${w}.darkness.lightRadius`, b.darkness.lightRadius);
      if (!(b.darkness.alpha > 0 && b.darkness.alpha <= 1)) errors.push(`${w}.darkness.alpha: 0~1`);
      if (!HEX_COLOR.test(b.darkness.color)) errors.push(`${w}.darkness.color: #RRGGBB`);
    }
    if (b.enrageAt > 0) needText(w, `boss.enraged.${b.id}`);
    for (const id of [...(b.companions?.enemies ?? []), ...(b.companions?.enemiesEnraged ?? [])]) if (!d.enemies.enemies.some((x) => x.id === id)) errors.push(`${w}.companions: 없는 적 '${id}'`);
    if (b.patterns.some((p) => p.inherit) && !b.inherit) errors.push(`${w}: 계승 패턴에는 inherit 주기가 필요`);
    for (const k of ['gapSec', 'enrageSec', 'firstDelaySec', 'keepDistance'] as const) checkPositive(errors, `${w}.${k}`, b[k], true);
    checkPositive(errors, `${w}.enraged.moveSpeedMul`, b.enraged.moveSpeedMul);
    checkPositive(errors, `${w}.enraged.scale`, b.enraged.scale);
    if (!HEX_COLOR.test(b.enraged.auraColor)) errors.push(`${w}.enraged.auraColor: #RRGGBB`);
    checkUnique(errors, `${w}.patterns`, b.patterns.map((p) => p.id));
    if (!b.patterns.some((p) => p.phase === 1)) errors.push(`${w}: 처음부터 쓰는 패턴이 없음`);
    for (const p of b.patterns) {
      const pw = `${w}.patterns.${p.id}`;
      checkPositive(errors, `${pw}.weight`, p.weight);
      checkPositive(errors, `${pw}.cooldownSec`, p.cooldownSec, true);
      checkPositive(errors, `${pw}.durationSec`, p.durationSec);
      if (p.phase !== 1 && p.phase !== 2) errors.push(`${pw}.phase: 1 또는 2`);
      if (p.unlock !== undefined && !(Number.isInteger(p.unlock) && p.unlock >= 0 && p.unlock <= unlocks.length)) errors.push(`${pw}.unlock: 0~${unlocks.length} 정수`);
      for (const [k, v] of Object.entries(p.values)) if (!isNum(v)) errors.push(`${pw}.values.${k}: 숫자여야 함`);
      if (p.summon && !d.enemies.enemies.some((x) => x.id === p.summon)) errors.push(`${pw}.summon: 없는 적 '${p.summon}'`);
      needText(pw, `boss.pattern.${p.id}`);
    }
  }
}

/** 엘리트 */
export function validateElites(v: V): void {
  const { d, errors, needText } = v;
  const el = d.elites;
  checkPositive(errors, 'elites.common.scale', el.common.scale);
  checkPositive(errors, 'elites.common.hpMul', el.common.hpMul);
  checkRange(errors, 'elites.common.bonusEnergyOrbs', el.common.bonusEnergyOrbs);
  checkRange(errors, 'elites.common.bonusCoins', el.common.bonusCoins);
  checkPositive(errors, 'elites.perChapterBonus', el.perChapterBonus, true);
  for (let s = 1; s <= d.mapgen.stagesPerChapter; s++) checkRange(errors, `elites.countByStage.${s}`, el.countByStage[String(s)]);
  checkUnique(errors, 'elites', el.elites.map((x) => x.id));
  if (el.elites.length !== 3) errors.push(`elites: 3종이어야 함 (현재 ${el.elites.length})`);
  for (const x of el.elites) {
    const w = `elites.${x.id}`;
    needText(w, x.nameKey);
    needText(w, x.iconKey);
    if (!HEX_COLOR.test(x.color)) errors.push(`${w}: color는 #RRGGBB`);
    checkPositive(errors, `${w}.weight`, x.weight);
    for (const k of ['moveSpeedMul', 'attackSpeedMul', 'damageTakenMul'] as const) if (x[k] !== undefined) checkPositive(errors, `${w}.${k}`, x[k]);
    if (!['outline', 'afterimage', 'blink'].includes(x.look)) errors.push(`${w}: look 잘못됨`);
    checkAttacks(v, w, x.extraAttacks);
    if (x.deathBlast) for (const k of ['delaySec', 'radius', 'damage'] as const) checkPositive(errors, `${w}.deathBlast.${k}`, x.deathBlast[k]);
  }
  for (const k of ['count', 'distance', 'speed', 'damage'] as const) {
    checkPositive(errors, `enemies.debugBarrage.${k}`, d.enemies.debugBarrage?.[k]);
  }
}

/** 웨이브 */
export function validateWaves(v: V): void {
  const { d, errors, enemyIds } = v;
  checkPositive(errors, 'waves.waveDelaySec', d.waves.waveDelaySec, true);
  checkPositive(errors, 'waves.countMul', d.waves.countMul);
  checkPositive(errors, 'waves.spawnWarnSec', d.waves.spawnWarnSec, true);
  checkPositive(errors, 'waves.spawnMinPlayerDistance', d.waves.spawnMinPlayerDistance, true);
  checkUnique(errors, 'waves', d.waves.waves.map((x) => x.id));
  for (const wave of d.waves.waves) {
    const w = `waves.${wave.id}`;
    checkPositive(errors, `${w}.weight`, wave.weight);
    if (wave.spawns.length === 0) errors.push(`${w}: spawns 비어 있음`);
    for (const s of wave.spawns) {
      if (!enemyIds.includes(s.enemy)) errors.push(`${w}: 알 수 없는 적 '${s.enemy}'`);
      checkRange(errors, `${w}.${s.enemy}.count`, s.count, 1);
    }
  }
  if (!d.waves.waves.some((x) => x.chapter === 1)) errors.push('waves: 챕터1 웨이브가 없음');
}

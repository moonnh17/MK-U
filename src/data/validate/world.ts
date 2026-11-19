/** 데이터 검증: 맵 생성·픽업·방 모양·카메라 */
import { HEX_COLOR, checkPositive, checkRange, checkSprite, checkUnique } from './shared';
import type { V } from './shared';

/** 맵 생성 */
export function validateMapgen(v: V): void {
  const { d, errors, weaponIds, enemyIds } = v;
  const m = d.mapgen;
  checkPositive(errors, 'mapgen.chapters', m.chapters);
  checkPositive(errors, 'mapgen.stagesPerChapter', m.stagesPerChapter);
  for (const s of m.bossStages) {
    if (!Number.isInteger(s) || s < 1 || s > m.stagesPerChapter) errors.push(`mapgen.bossStages: ${s} 범위 밖`);
  }
  checkRange(errors, 'mapgen.combatWaves', m.combatWaves, 1);
  for (const [kind, rule] of Object.entries(m.stageRules)) {
    const w = `mapgen.stageRules.${kind}`;
    checkRange(errors, `${w}.combatRooms`, rule.combatRooms);
    const total = 1 + rule.combatRooms[1] + rule.encounterRooms + 1 + rule.bossRooms + rule.exitRooms;
    if (total > m.grid.width * m.grid.height) errors.push(`${w}: 방 수(${total})가 격자보다 많음`);
    const lastCount = rule.lastRoom === 'bossRoom' ? rule.bossRooms : rule.lastRoom === 'exitRoom' ? rule.exitRooms : 0;
    if (lastCount !== 1) errors.push(`${w}: lastRoom '${rule.lastRoom}'은 정확히 1개여야 함`);
  }
  const roomW = m.roomTiles.width * m.tileSize;
  const roomH = m.roomTiles.height * m.tileSize;
  if (roomW > d.ui.baseWidth || roomH > d.ui.baseHeight) {
    errors.push(`mapgen.roomTiles: 방(${roomW}×${roomH})이 화면(${d.ui.baseWidth}×${d.ui.baseHeight})보다 큼`);
  }
  if (m.corridor.widthTiles >= m.roomTiles.height) errors.push('mapgen.corridor.widthTiles: 방 높이보다 작아야 함');
  if (!enemyIds.includes(m.bossPlaceholderEnemy)) errors.push(`mapgen.bossPlaceholderEnemy: '${m.bossPlaceholderEnemy}' 적 없음`);
  for (const id of m.testWeapons) if (!weaponIds.includes(id)) errors.push(`mapgen.testWeapons: '${id}' 무기 없음`);
  checkSprite(errors, 'mapgen.props.exitPortal', m.props.exitPortal);
  checkSprite(errors, 'mapgen.props.encounterCore', m.props.encounterCore);
  if (!HEX_COLOR.test(m.door.color) || !HEX_COLOR.test(m.door.openColor)) errors.push('mapgen.door: 색은 #RRGGBB');
  checkPositive(errors, 'mapgen.lockInsetPx', m.lockInsetPx, true);
}

/** 픽업 */
export function validatePickups(v: V): void {
  const { d, errors } = v;
  const pk = d.pickups;
  checkSprite(errors, 'pickups.energyOrb', pk.energyOrb);
  checkSprite(errors, 'pickups.coin', pk.coin);
  checkPositive(errors, 'pickups.coin.value', pk.coin.value);
  if (!(pk.coin.dropRate > 0 && pk.coin.dropRate <= 1)) errors.push('pickups.coin.dropRate: 0 초과 1 이하');
  for (const k of ['magnetRadius', 'magnetSpeed', 'collectRadius', 'interactRadius'] as const) {
    checkPositive(errors, `pickups.${k}`, pk[k]);
  }
  checkPositive(errors, 'pickups.scatterRadius', pk.scatterRadius, true);
}

/** 방 크기·장애물 */
export function validateRoomShapes(v: V): void {
  const { d, errors } = v;
  const mg = d.mapgen;
  checkUnique(errors, 'mapgen.roomSizes', mg.roomSizes.map((s) => s.id));
  for (const s of mg.roomSizes) {
    // 문·복도가 가운데에 오도록 크기는 홀수 너비의 복도와 맞아야 하고, 최소 크기
    if (!(Number.isInteger(s.w) && Number.isInteger(s.h) && s.w >= 12 && s.h >= 9)) errors.push(`mapgen.roomSizes.${s.id}: 12×9 이상 정수`);
  }
  for (const kind of ['startRoom', 'combatRoom', 'encounterRoom', 'bossRoom', 'exitRoom'] as const) {
    const rules = mg.roomSizeRules[kind];
    if (!rules || rules.length === 0) errors.push(`mapgen.roomSizeRules.${kind}: 없음`);
    for (const r of rules ?? []) if (!mg.roomSizes.some((s) => s.id === r.size)) errors.push(`mapgen.roomSizeRules.${kind}: 없는 크기 '${r.size}'`);
  }
  if (!(mg.obstacles.chance >= 0 && mg.obstacles.chance <= 1)) errors.push('mapgen.obstacles.chance: 0~1');
  checkUnique(errors, 'mapgen.obstacles.layouts', mg.obstacles.layouts.map((l) => l.id));
  for (const l of mg.obstacles.layouts) {
    for (const b of l.blocks) if (!(b.x > 0 && b.x < 1 && b.y > 0 && b.y < 1 && b.w >= 1 && b.h >= 1)) errors.push(`mapgen.obstacles.layouts.${l.id}: 블록 자리 0~1, 크기 1 이상`);
  }
}

/** 카메라 */
export function validateCamera(v: V): void {
  const { d, errors } = v;
  if (!(d.ui.camera.zoom >= 1 && d.ui.camera.zoom <= 4)) errors.push('ui.camera.zoom: 1~4');
  if (!(d.ui.camera.lean >= 0 && d.ui.camera.lean <= 1)) errors.push('ui.camera.lean: 0~1');
  checkPositive(errors, 'ui.camera.playerMarginPx', d.ui.camera.playerMarginPx, true);
}

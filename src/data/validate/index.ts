/**
 * 데이터 JSON 검증. 문제마다 사람이 읽을 수 있는 문장을 돌려준다(빈 배열 = 통과).
 * Phaser에 의존하지 않으며 테스트와 개발 모드 부팅에서 함께 쓴다.
 */
import { GRADE_IDS, TAG_IDS } from '../../types/data';
import type { GameData } from '../index';
import type { Errors, V } from './shared';
import { validateTags, validateGrades, validateWeapons } from './combat';
import { validateLoot, validateItems } from './loot';
import { validateEnemies, validateBosses, validateElites, validateWaves } from './enemies';
import { validateMapgen, validatePickups, validateRoomShapes, validateCamera } from './world';
import { validatePlayer, validateSkills, validateUltimates, validateJobs, validateCards } from './skills';
import { validateUi, validateKeybindings, validateJuice, validateSounds, validateArtData } from './presentation';
import { validateSettlement, validateLab, validateGemini, validateOverflow } from './meta';

export function validateGameData(d: GameData): Errors {
  const errors: Errors = [];
  const textKeys: { where: string; key: string }[] = [];
  const v: V = {
    d,
    errors,
    needText: (where, key) => textKeys.push({ where, key }),
    tagIds: new Set<string>(TAG_IDS),
    gradeIds: new Set<string>(GRADE_IDS),
    weaponIds: d.weapons.weapons.map((x) => x.id),
    enemyIds: d.enemies.enemies.map((e) => e.id),
  };
  validateTags(v);
  validateGrades(v);
  validateWeapons(v);
  validateLoot(v);
  validateItems(v);
  validateEnemies(v);
  validateBosses(v);
  validateElites(v);
  validateMapgen(v);
  validatePickups(v);
  validateWaves(v);
  validatePlayer(v);
  validateSkills(v);
  validateUltimates(v);
  validateJobs(v);
  validateCards(v);
  validateUi(v);
  validateKeybindings(v);
  validateSettlement(v);
  validateLab(v);
  validateOverflow(v);
  validateRoomShapes(v);
  validateCamera(v);
  validateJuice(v);
  validateSounds(v);
  validateArtData(v);
  validateGemini(v);

  for (const { where, key } of textKeys) {
    if (!(key in d.text)) errors.push(`${where}: 텍스트 키 '${key}'가 ko.json에 없음`);
  }

  return errors;
}

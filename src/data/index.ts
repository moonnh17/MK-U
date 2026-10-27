/**
 * 모든 데이터 JSON을 한곳에서 타입을 붙여 내보낸다.
 * 형태 검증은 validate.ts(테스트와 개발 모드 부팅 시 실행)가 맡는다.
 */
import type {
  BossesData,
  ElitesData,
  EnemiesData,
  GroupMultipliersData,
  JobsData,
  MapgenData,
  PickupsData,
  PlayerData,
  CardsData,
  SkillsData,
  StatsData,
  TagsData,
  UltimatesData,
  TextTable,
  UiData,
  WavesData,
  WeaponsData,
} from '../types/data';
import type { KeybindingsData } from '../input/keyboard';

import statsJson from './stats.json';
import tagsJson from './tags.json';
import groupMultipliersJson from './groupMultipliers.json';
import weaponsJson from './weapons.json';
import enemiesJson from './enemies.json';
import elitesJson from './elites.json';
import bossesJson from './bosses.json';
import jobsJson from './jobs.json';
import mapgenJson from './mapgen.json';
import wavesJson from './waves.json';
import playerJson from './player.json';
import pickupsJson from './pickups.json';
import skillsJson from './skills.json';
import ultimatesJson from './ultimates.json';
import cardsJson from './cards.json';
import uiJson from './ui.json';
import keybindingsJson from './keybindings.json';
import koJson from './text/ko.json';

export interface GameData {
  stats: StatsData;
  tags: TagsData;
  groupMultipliers: GroupMultipliersData;
  weapons: WeaponsData;
  enemies: EnemiesData;
  elites: ElitesData;
  bosses: BossesData;
  jobs: JobsData;
  mapgen: MapgenData;
  waves: WavesData;
  player: PlayerData;
  pickups: PickupsData;
  skills: SkillsData;
  ultimates: UltimatesData;
  cards: CardsData;
  ui: UiData;
  keybindings: KeybindingsData;
  text: TextTable;
}

// JSON 리터럴 타입(문자열 등)을 유니온 타입으로 좁히기 위해 unknown을 거친다.
export const gameData: GameData = {
  stats: statsJson as unknown as StatsData,
  tags: tagsJson as unknown as TagsData,
  groupMultipliers: groupMultipliersJson as unknown as GroupMultipliersData,
  weapons: weaponsJson as unknown as WeaponsData,
  enemies: enemiesJson as unknown as EnemiesData,
  elites: elitesJson as unknown as ElitesData,
  bosses: bossesJson as unknown as BossesData,
  jobs: jobsJson as unknown as JobsData,
  mapgen: mapgenJson as unknown as MapgenData,
  waves: wavesJson as unknown as WavesData,
  player: playerJson as unknown as PlayerData,
  pickups: pickupsJson as unknown as PickupsData,
  skills: skillsJson as unknown as SkillsData,
  ultimates: ultimatesJson as unknown as UltimatesData,
  cards: cardsJson as unknown as CardsData,
  ui: uiJson as unknown as UiData,
  keybindings: keybindingsJson as unknown as KeybindingsData,
  text: koJson as TextTable,
};

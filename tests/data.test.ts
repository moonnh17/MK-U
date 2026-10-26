import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { TAG_IDS } from '../src/types/data';

const clone = (): GameData => structuredClone(gameData);

describe('데이터 검증', () => {
  it('현재 데이터는 오류가 없다', () => {
    expect(validateGameData(gameData)).toEqual([]);
  });

  it('태그는 기획서 표의 11종이다', () => {
    expect(gameData.tags.tags.map((t) => t.id).sort()).toEqual([...TAG_IDS].sort());
    expect(TAG_IDS).toHaveLength(11);
  });

  it('시작 스탯은 10, 6종이다', () => {
    expect(gameData.stats.startValue).toBe(10);
    expect(gameData.stats.stats).toHaveLength(6);
  });

  it('물리·마기·기술은 10 초과 1당 +4%, 상한 +150%', () => {
    for (const id of ['physical', 'magic', 'tech']) {
      const rule = gameData.tags.tags.find((t) => t.id === id)!.rule;
      expect(rule).toMatchObject({ kind: 'linearStat', pivot: 10, perPoint: 0.04, cap: 1.5 });
    }
  });

  it('시작 무기는 에너지 0인 권총이다', () => {
    const w = gameData.weapons.weapons.find((x) => x.id === gameData.weapons.startWeapon)!;
    expect(w.id).toBe('pistol');
    expect(w.energyCost).toBe(0);
  });

  it('챕터1 일반 적 3종이 있다', () => {
    const ids = gameData.enemies.enemies.filter((e) => e.chapter === 1 && e.rank === 'normal').map((e) => e.id);
    expect(ids.sort()).toEqual(['akgwi', 'gaedeulgae', 'tomakki']);
  });

  it('방 개수 규칙이 기획서와 같다', () => {
    const r = gameData.mapgen.stageRules;
    expect(r.normal.combatRooms).toEqual([4, 5]);
    expect(r.boss.combatRooms).toEqual([2, 3]);
    expect(r.normal.encounterRooms).toBe(1);
    expect(r.boss.bossRooms).toBe(1);
    expect(gameData.mapgen.bossStages).toEqual([2, 5]);
  });

  describe('잘못된 데이터를 잡아낸다', () => {
    it('없는 태그를 쓰는 무기', () => {
      const d = clone();
      (d.weapons.weapons[0]!.tags as string[]).push('fire');
      expect(validateGameData(d).join('\n')).toMatch(/알 수 없는 태그 'fire'/);
    });

    it('총에 기술·원거리 태그가 빠짐', () => {
      const d = clone();
      d.weapons.weapons[0]!.tags = ['tech'];
      expect(validateGameData(d).join('\n')).toMatch(/'ranged' 태그 필요/);
    });

    it('웨이브가 없는 적을 참조', () => {
      const d = clone();
      d.waves.waves[0]!.spawns[0]!.enemy = 'ghost';
      expect(validateGameData(d).join('\n')).toMatch(/알 수 없는 적 'ghost'/);
    });

    it('ko.json에 없는 텍스트 키', () => {
      const d = clone();
      d.enemies.enemies[0]!.nameKey = 'enemy.nope';
      expect(validateGameData(d).join('\n')).toMatch(/enemy\.nope/);
    });

    it('뒤집힌 범위', () => {
      const d = clone();
      d.enemies.enemies[0]!.coins = [3, 1];
      expect(validateGameData(d).join('\n')).toMatch(/범위가 잘못됨/);
    });

    it('두 명령에 같은 키', () => {
      const d = clone();
      d.keybindings.buttons.attack = ['KeyE'];
      expect(validateGameData(d).join('\n')).toMatch(/KeyE/);
    });

    it('시작 무기가 없음', () => {
      const d = clone();
      d.weapons.startWeapon = 'bfg';
      expect(validateGameData(d).join('\n')).toMatch(/startWeapon/);
    });

    it('방이 화면보다 큼', () => {
      const d = clone();
      d.mapgen.roomTiles.width = 100;
      expect(validateGameData(d).join('\n')).toMatch(/화면/);
    });
  });
});

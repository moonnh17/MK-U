import { describe, expect, it } from 'vitest';
import { gameData, type GameData } from '../src/data/index';
import { validateGameData } from '../src/data/validate';
import { EXPERIMENT_RESULTS } from '../src/skills/experimentalWeapon';
import { isSkillImplemented } from '../src/skills/registry';
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

  it('시작 무기는 탄당 에너지 1인 권총이다', () => {
    const w = gameData.weapons.weapons.find((x) => x.id === gameData.weapons.startWeapon)!;
    expect(w.id).toBe('pistol');
    expect(w.energyCost).toBe(1);
  });

  it('챕터1 일반 적 4종이 있다', () => {
    const ids = gameData.enemies.enemies.filter((e) => e.chapter === 1 && e.rank === 'normal' && !e.summon).map((e) => e.id);
    expect(ids.sort()).toEqual(['akgwi', 'gaedeulgae', 'ghostShooter', 'tomakki']);
  });

  it('방 개수 규칙이 기획서와 같다', () => {
    const r = gameData.mapgen.stageRules;
    expect(r.normal.combatRooms).toEqual([2, 3]);
    expect(r.boss.combatRooms).toEqual([1, 2]);
    expect(r.normal.encounterRooms).toBe(1);
    expect(r.boss.bossRooms).toBe(1);
    expect(gameData.mapgen.bossStages).toEqual([2, 5]);
  });

  describe('스킬 데이터 (기획서 마기학자 표)', () => {
    const skill = (id: string) => gameData.skills.skills.find((s) => s.id === id)!;
    const name = (key: string) => gameData.text[key];

    it('헥타르 6개·아크로 6개, 패시브는 전투 드론·환원주의자', () => {
      const by = (school: string) => gameData.skills.skills.filter((s) => s.school === school).map((s) => s.id);
      expect(by('hectar')).toHaveLength(6);
      expect(by('acro')).toHaveLength(6);
      expect(gameData.skills.skills.filter((s) => s.kind === 'passive').map((s) => s.id).sort()).toEqual([
        'combatDrone',
        'reductionist',
      ]);
    });

    it('이름·각성 이름·요구 스탯이 표와 같다', () => {
      const table: [string, string, string, string, number][] = [
        ['magiTurret', '마기 자동포탑', '대형권역사수주포', 'strength', 20],
        ['magiMine', '마기 지뢰', '무한연쇄기폭', 'magiPower', 20],
        ['antimatterCannon', '반물질포', '다연장반입자포', 'magiPower', 20],
        ['magiField', '마기역장', '벡터굴절역장', 'willpower', 20],
        ['railgun', '레일건', '초전도 레일건', 'intelligence', 20],
        ['combatDrone', '전투 드론', '군집지성', 'agility', 20],
        ['unstableSubject', '불안정 실험체', '증식하는 실패작', 'agility', 20],
        ['magiCorruption', '마기 변질', '적색 반역', 'magiPower', 20],
        ['experimentalWeapon', '실험 병기', '판도라 장치', 'intelligence', 20],
        ['purifyingWings', '정화의 날개', '첫 사람의 날개', 'strength', 20],
        ['mkPrototype', 'MK : 프로토타입', 'MK : 오버드라이브', 'toughness', 20],
        ['reductionist', '환원주의자', '제1원리', 'willpower', 20],
      ];
      for (const [id, n, an, stat, value] of table) {
        const s = skill(id);
        expect(name(s.nameKey)).toBe(n);
        expect(name(s.awakening.nameKey)).toBe(an);
        expect(s.awakening.requiredStat).toBe(stat);
        expect(s.awakening.requiredValue).toBe(value);
      }
    });

    it('태그가 표와 같다 (source별 예외 포함)', () => {
      expect(skill('magiTurret').tags).toEqual(['tech', 'ranged']);
      expect(skill('magiTurret').sources.bigBullet).toEqual(['physical', 'ranged']);
      expect(skill('purifyingWings').tags).toEqual(['physical', 'melee']);
      expect(skill('purifyingWings').awakening.tags).toEqual(['physical', 'melee', 'bleed']);
      // 출혈 공격 source는 물리·출혈, 근접 없음
      expect(skill('purifyingWings').sources.bleed).toEqual(['physical', 'bleed']);
      expect(skill('antimatterCannon').tags).toContain('charging');
      expect(skill('railgun').tags).not.toContain('charging');
      expect(skill('magiField').awakening.tags).toEqual([]);
      expect(skill('magiField').tags).toEqual(['buff']);
      // 무한연쇄기폭: 기술·마기·원거리
      expect(skill('magiMine').awakening.tags).toEqual(['tech', 'magic', 'ranged']);
      expect(skill('magiMine').sources.chainMine).toEqual(['tech', 'magic', 'ranged']);
      expect(skill('combatDrone').sources.droneShot).toEqual(['tech', 'ranged']);
    });

    it('12개 스킬이 모두 발동 함수를 가진다', () => {
      expect(gameData.skills.skills.filter((s) => !isSkillImplemented(s.id)).map((s) => s.id)).toEqual([]);
    });

    it('실험 병기: 결과마다 source가 있고 공간격은 공간 붕괴에만', () => {
      const s = skill('experimentalWeapon');
      expect(Object.keys(s.sources).sort()).toEqual([...EXPERIMENT_RESULTS].sort());
      for (const [id, tags] of Object.entries(s.sources)) {
        expect(tags.includes('space'), id).toBe(id === 'collapse');
        expect(s.levels[0]!.values[`${id}Weight`], `${id} 가중치`).toBeGreaterThan(0);
      }
    });

    it('대성공을 쓰는 아크로 스킬은 각자 대성공 확률을 갖는다 (확률 태그)', () => {
      for (const id of ['unstableSubject', 'magiCorruption', 'experimentalWeapon']) {
        expect(skill(id).tags).toContain('chance');
        skill(id).levels.forEach((lv) => expect(lv.values.greatChance, id).toBeGreaterThan(0));
      }
      expect(skill('mkPrototype').sources.punch).toEqual(['physical', 'melee']);
      expect(skill('mkPrototype').sources.dash).toEqual(['physical', 'melee']);
    });

    it('카드로 나오는 스킬은 레벨·각성 수치가 채워져 있다', () => {
      for (const id of gameData.skills.skills.map((x) => x.id).filter(isSkillImplemented)) {
        const s = skill(id);
        s.levels.forEach((lv) => expect(Object.keys(lv.values).length, `${id} 레벨 수치`).toBeGreaterThan(0));
        expect(Object.keys(s.awakening.values).length, `${id} 각성 수치`).toBeGreaterThan(0);
      }
    });

    it('레벨이 오르면 지뢰 수·드론 수가 늘고 역장 쿨타임이 준다', () => {
      const v = (id: string, k: string) => skill(id).levels.map((lv) => lv.values[k]!);
      expect(v('magiMine', 'count')).toEqual([...v('magiMine', 'count')].sort((a, b) => a - b));
      expect(new Set(v('combatDrone', 'count')).size).toBe(3);
      const cds = skill('magiField').levels.map((lv) => lv.cooldownSec);
      expect(cds[0]).toBeGreaterThan(cds[2]!);
    });

    it('기본 궁극기는 열역학 제1법칙(기술·원거리)', () => {
      const job = gameData.jobs.jobs.find((x) => x.id === gameData.jobs.startJob)!;
      const u = gameData.ultimates.ultimates.find((x) => x.id === job.startUltimate)!;
      expect(name(u.nameKey)).toBe('열역학 제1법칙');
      expect(u.tags).toEqual(['tech', 'ranged']);
    });

    it('요구 스탯이 빠진 스킬을 잡아낸다', () => {
      const d = clone();
      (d.skills.skills[0]!.awakening as { requiredStat?: string }).requiredStat = undefined;
      expect(validateGameData(d).join('\n')).toMatch(/요구 스탯/);
    });

    it('계열 태그가 빠진 스킬을 잡아낸다', () => {
      const d = clone();
      (d.skills.skills[0] as { school?: string }).school = undefined;
      expect(validateGameData(d).join('\n')).toMatch(/계열 태그/);
    });

    it('레벨이 3개가 아닌 스킬을 잡아낸다', () => {
      const d = clone();
      d.skills.skills[0]!.levels.pop();
      expect(validateGameData(d).join('\n')).toMatch(/Lv1~3/);
    });
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

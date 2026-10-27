/**
 * 런 기록과 결산 (순수 함수): 처치·보스·첨탑·스테이지·시간을 모으고, 마기력 결정을 계산한다.
 * 결정 산식은 기획서 '결산과 마기력 결정' 표 (meta.json crystals).
 */
import type { Rng } from '../core/rng';
import type { CrystalRules, MetaData } from '../types/data';

export interface RunRecord {
  kills: number;
  eliteKills: number;
  /** 처치한 스테이지 보스 (스테이지 번호로 X-2·X-5 구분) */
  bossKills: { id: string; stage: number }[];
  hiddenBossKills: string[];
  /** 충전 완료한 마기수집첨탑 */
  spires: number;
  /** 깬 스테이지 (포털을 지난 수) */
  stagesCleared: number;
  /** 플레이 시간(초). 게임이 멈춘 시간(카드창·인벤토리·컷씬)은 빼고 센다 */
  playSec: number;
  /** 이번 런에 얻은 과거의 기억 조각 수 */
  shards: number;
  /** 이번 런에 처음 본 컷씬 id */
  newCutscenes: string[];
}

export function newRunRecord(): RunRecord {
  return { kills: 0, eliteKills: 0, bossKills: [], hiddenBossKills: [], spires: 0, stagesCleared: 0, playSec: 0, shards: 0, newCutscenes: [] };
}

export type CrystalKey = 'stages' | 'midBoss' | 'chapterBoss' | 'elites' | 'spires' | 'hiddenBosses';

export interface CrystalLine {
  key: CrystalKey;
  count: number;
  amount: number;
}

export interface CrystalResult {
  lines: CrystalLine[];
  subtotal: number;
  /** 런 클리어 보너스로 더해진 양 (클리어가 아니면 0) */
  bonus: number;
  total: number;
}

/**
 * 결정 계산. runClear: 3-5 보스까지 잡은 런 클리어일 때만 합계 × clearMultiplier.
 * 보스는 스테이지 번호로 X-2(중간보스)·X-5(챕터보스)를 나눈다.
 */
export function crystalBreakdown(r: RunRecord, runClear: boolean, rules: CrystalRules): CrystalResult {
  const stages = Object.keys(rules.bossByStage)
    .map(Number)
    .sort((a, b) => a - b);
  const mid = stages[0];
  const bossLine = (key: 'midBoss' | 'chapterBoss', pick: (stage: number) => boolean): CrystalLine => {
    const kills = r.bossKills.filter((b) => pick(b.stage));
    return { key, count: kills.length, amount: kills.reduce((s, b) => s + (rules.bossByStage[String(b.stage)] ?? 0), 0) };
  };
  const lines: CrystalLine[] = [
    { key: 'stages', count: r.stagesCleared, amount: r.stagesCleared * rules.perStage },
    bossLine('midBoss', (s) => s === mid),
    bossLine('chapterBoss', (s) => s !== mid),
    { key: 'elites', count: r.eliteKills, amount: r.eliteKills * rules.perElite },
    { key: 'spires', count: r.spires, amount: r.spires * rules.perSpire },
    { key: 'hiddenBosses', count: r.hiddenBossKills.length, amount: r.hiddenBossKills.length * rules.perHiddenBoss },
  ];
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const total = runClear ? Math.round(subtotal * rules.clearMultiplier) : subtotal;
  return { lines, subtotal, bonus: total - subtotal, total };
}

/** 보스·히든보스 처치 시 과거의 기억 조각을 얻는가 (칸이 다 찼으면 없음) */
export function rollShard(rng: Rng, kind: 'boss' | 'hiddenBoss', owned: number, rules: MetaData['memory']): boolean {
  if (owned >= rules.pastSlots) return false;
  if (kind === 'hiddenBoss' && rules.hiddenBossShard) return true;
  return rng.chance(rules.bossShardChance);
}

/** 플레이 시간 표시 (분:초) */
export function formatPlayTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

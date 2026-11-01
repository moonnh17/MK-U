export type UiModeSetting = 'auto' | 'pc' | 'mobile';

export interface LaunchConfig {
  seed: number;
  /** URL에 seed가 있었는지(디버그 표시용) */
  seedFromUrl: boolean;
  debug: boolean;
  ui: UiModeSetting;
  /** 1-1 시작방에 테스트 무기를 놓는다 (`?testWeapons=1`일 때만) */
  testWeapons: boolean;
}

/**
 * URL 쿼리(`?seed=123&debug=1&ui=mobile`)를 읽는다.
 * seed가 없거나 잘못되면 fallbackSeed를 쓴다.
 */
export function parseLaunchConfig(search: string, fallbackSeed: number): LaunchConfig {
  const params = new URLSearchParams(search);

  const rawSeed = params.get('seed');
  const parsed = rawSeed !== null && /^\d+$/.test(rawSeed) ? Number(rawSeed) : NaN;
  const seedFromUrl = Number.isSafeInteger(parsed);
  const seed = seedFromUrl ? parsed >>> 0 : fallbackSeed >>> 0;

  const debugRaw = params.get('debug');
  const debug = debugRaw === '1' || debugRaw === 'true';

  const uiRaw = params.get('ui');
  const ui: UiModeSetting = uiRaw === 'pc' || uiRaw === 'mobile' ? uiRaw : 'auto';

  const testWeapons = params.get('testWeapons') === '1';

  return { seed, seedFromUrl, debug, ui, testWeapons };
}

/** URL에 시드가 없을 때 쓸 시드. 이 값 자체는 디스플레이에 표시해 재현할 수 있게 한다. */
export function makeFallbackSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0]! % 1_000_000_000;
}

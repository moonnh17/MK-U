// 리팩터 확인용 브라우저 장면 점검. `?debug=1&seed=7`로 연 뒤 콘솔에서:
//   const s = await import('/scripts/smoke.js'); await s.run('warriorFight')
// 장면 하나가 ~10초 안에 끝난다(도구의 45초 제한 때문에 한 번에 하나씩). 결과의 errors가 비어 있어야 통과.
const errors = [];
if (!window.__smokeHooked) {
  window.__smokeHooked = true;
  window.addEventListener('error', (e) => errors.push(String(e.message)));
  window.addEventListener('unhandledrejection', (e) => errors.push(String(e.reason)));
  const orig = console.error;
  console.error = (...a) => (errors.push(a.map(String).join(' ')), orig(...a));
}

const mku = () => window.__mku;
const bus = async () => (await import('/src/core/events.ts')).bus;
const rs = () => mku().game.scene.getScene('Run');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 창이 가려져도 진행되게 게임 루프를 직접 돌린다 */
async function frames(n) {
  for (let i = 0; i < n; i++) {
    mku().game.loop.step(performance.now());
    if (i % 30 === 0) await sleep(0);
  }
}

async function waitFor(cond, n = 600) {
  for (let i = 0; i < n && !cond(); i++) await frames(5);
  if (!cond()) throw new Error('시간 초과');
}

async function startRun(job, stage) {
  await waitFor(() => mku().game.scene.getScenes(true).some((s) => s.sys.settings.key === 'Lab' || s.sys.settings.key === 'Run'), 2000);
  document.querySelector('#story .sw-btn')?.dispatchEvent(new PointerEvent('pointerdown'));
  const active = mku().game.scene.getScenes(true)[0];
  active.scene.start('Run', stage ? { job, stage } : { job });
  await waitFor(() => rs()?.sys.isActive() && rs().session && rs().player);
  await frames(30);
  await clearModals();
  rs().invuln = 1e9;
}

/** 시작방 카드 같은 창을 첫 칸으로 고르며 닫는다 */
async function clearModals() {
  const b = await bus();
  for (let i = 0; i < 10 && rs().modal; i++) {
    if (rs().modal === 'cards') b.emit('cardPick', { index: 0 });
    else {
      // 보스 등장 컷 등은 아무 키로 건너뛴다
      window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
      await frames(2);
      window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
    }
    await frames(60);
  }
  if (rs().modal) throw new Error(`창이 안 닫힘: ${rs().modal}`);
}

/** 보스방 한가운데로 옮겨 보스전을 시작시키고, 보스 옆에서 공격하며 버틴다 */
async function bossFight(sec) {
  const { roomCenter } = await import('/src/systems/worldLayout.ts');
  const node = rs().session.map.rooms.find((n) => n.kind === 'bossRoom');
  const c = roomCenter(node, rs().m);
  rs().player.setPosition(c.x, c.y);
  await waitFor(() => rs().bossControllers.size > 0 || rs().modal, 300);
  await clearModals();
  spawned += rs().enemies.length;
  await fight(null, 0, sec);
}

/** 그 방 한가운데로 옮겨 보스(히든보스)를 불러낸다 */
async function enterRoom(kind) {
  const { roomCenter } = await import('/src/systems/worldLayout.ts');
  const node = rs().session.map.rooms.find((n) => n.kind === kind);
  const c = roomCenter(node, rs().m);
  rs().player.setPosition(c.x, c.y);
  await waitFor(() => rs().bossControllers.size > 0 || rs().modal, 300);
  await clearModals();
  await waitFor(() => rs().bossControllers.size > 0, 300);
}

/** 보스의 패턴을 하나씩 강제로 실행한다 (보스 두뇌가 고르기를 기다리지 않고 전부 돌려 보려고) */
async function forceAllPatterns(perPatternFrames = 150) {
  const { makePattern } = await import('/src/bosses/patterns/index.ts');
  const [enemy, bc] = [...rs().bossControllers.entries()][0];
  await waitFor(() => bc.host && enemy.warn <= 0, 300);
  for (const { id } of bc.def.patterns) {
    if (enemy.dead) break;
    bc.run?.destroy();
    bc.run = makePattern(id, bc.patternCtx(bc.host, id, bc.body));
    if (!bc.run) errors.push(`패턴 없음: ${id}`);
    bc.patternId = id;
    forced.push(id);
    await frames(perPatternFrames);
  }
}

let spawned = 0;
/** 강제로 돌린 보스 패턴 */
let forced = [];
/** 실제로 칸에 들어가 쓴 스킬 */
let cast = new Set();
async function fight(enemyId, count, sec) {
  if (enemyId) (await bus()).emit('debugSpawn', { enemyId, count });
  await frames(1);
  spawned += count;
  // 공격 키(keybindings.json의 Space)를 누른 채 싸운다
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  for (let t = 0; t < sec * 2; t++) {
    // 근접 무기도 닿게 가장 가까운 적 옆으로 옮긴다
    const e = rs().enemies[0];
    if (e) rs().player.setPosition(e.sprite.x - 14, e.sprite.y);
    await frames(30);
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
}

/** 액티브 칸(3개)을 이 스킬들로 바꿔 끼우고 모두 쓴다 */
async function castAll(skillIds) {
  const b = await bus();
  const slots = [...rs().session.player.loadout.active];
  for (const s of slots) if (s) b.emit('debugSetSkill', { skillId: s, level: 0, awakened: false });
  for (const skillId of skillIds) b.emit('debugSetSkill', { skillId, level: 3, awakened: false });
  for (const s of rs().session.player.loadout.active) if (s) cast.add(s);
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i < 4; i++) rs().skillRt.castSlot(i);
    await frames(90);
  }
  b.emit('debugFillUltimate', {});
  rs().skillRt.castUltimate();
  await frames(180);
}

const SCENES = {
  /** 1-1 전사: 기본 무기·적·자동 조준 */
  warriorFight: async () => {
    await startRun('warrior');
    await fight('tomakki', 4, 4);
    await fight('ghostShooter', 3, 4);
  },
  /** 1-2 보스 패턴 */
  boss1: async () => {
    await startRun('warrior', { chapter: 1, stage: 2 });
    await bossFight(8);
  },
  /** 마기학자 스킬 6종 + 궁극기 */
  scholarSkills: async () => {
    await startRun('magiScholar');
    await fight('akgwi', 3, 1);
    await castAll(['magiTurret', 'magiMine', 'railgun']);
    await castAll(['magiField', 'antimatterCannon', 'unstableSubject']);
  },
  /** 마기법사 백온파·휘강파 스킬 */
  mageSkills: async () => {
    await startRun('magiMage');
    await fight('akgwi', 4, 1);
    await castAll(['fireball', 'iceOrb', 'chainLightning']);
    await castAll(['magiBolt', 'magiWave', 'magiPillar']);
    await castAll(['magiCondenser', 'executionWill', 'iceSpear']);
  },
  /** 2장 보스·3장 보스 */
  boss2: async () => {
    await startRun('warrior', { chapter: 2, stage: 2 });
    await bossFight(8);
  },
  boss3: async () => {
    await startRun('warrior', { chapter: 3, stage: 5 });
    await bossFight(8);
  },
};
// 보스 패턴 전부: 챕터 보스 6종(X-2·X-5)과 히든보스 3종
for (const [c, s] of [[1, 2], [1, 5], [2, 2], [2, 5], [3, 2], [3, 5]]) {
  SCENES[`patterns${c}_${s}`] = async () => {
    await startRun('warrior', { chapter: c, stage: s });
    await enterRoom('bossRoom');
    await forceAllPatterns();
  };
}
for (const id of ['ancestorEcho', 'royalMage', 'orionCrusader']) {
  SCENES[`hidden_${id}`] = async () => {
    await startRun('warrior');
    (await bus()).emit('debugHiddenBoss', { id });
    await enterRoom('encounterRoom');
    await forceAllPatterns();
  };
}

export const names = Object.keys(SCENES);

export async function run(name) {
  errors.length = 0;
  spawned = 0;
  forced = [];
  cast = new Set();
  let threw = null;
  try {
    await SCENES[name]();
  } catch (e) {
    threw = String(e?.stack ?? e);
  }
  const r = window.__mku?.game.scene.getScene('Run');
  return {
    name,
    ok: !threw && errors.length === 0,
    threw,
    errors: errors.slice(0, 10),
    stage: r?.session?.stage,
    hp: r?.session?.player.hp,
    spawned,
    // 새 런마다 기록이 0부터라 이 장면의 처치 수다 (debugSpawn 적도 센다)
    kills: r?.session?.player.record.kills,
    left: r?.enemies?.length,
    cast: [...cast],
    forced,
    bossHp: r ? [...r.bossControllers.keys()].map((e) => Math.round(e.hp)) : [],
  };
}

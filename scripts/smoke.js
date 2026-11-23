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
/** 들어 본 무기·불러 본 적 */
let tried = [];
/** 시간 안에 공격하지 않은 적 */
let quiet = [];
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
  /** 마기학자 액티브 10종 + 궁극기 */
  scholarSkills: async () => {
    await startRun('magiScholar');
    await fight('akgwi', 3, 1);
    await castAll(['magiTurret', 'magiMine', 'railgun']);
    await castAll(['magiField', 'antimatterCannon', 'unstableSubject']);
    await castAll(['magiCorruption', 'experimentalWeapon', 'purifyingWings']);
    await castAll(['mkPrototype']);
  },
  /** 마기법사 백온파·휘강파 스킬 */
  mageSkills: async () => {
    await startRun('magiMage');
    await fight('akgwi', 4, 1);
    await castAll(['fireball', 'iceOrb', 'chainLightning']);
    await castAll(['magiBolt', 'magiWave', 'magiPillar']);
    await castAll(['magiCondenser', 'executionWill', 'iceSpear']);
    await castAll(['fireWall', 'elementWard', 'magiBurst']);
    await castAll(['teleport']);
  },
  /** 전사 바바리안·성기사 스킬 */
  warriorSkills: async () => {
    await startRun('warrior');
    await fight('akgwi', 4, 1);
    await castAll(['frenzySlash', 'chainThrow', 'earthShatter']);
    await castAll(['whirlwind', 'warCry', 'holyBulwark']);
    await castAll(['oathOfRetribution', 'sanctuaryAura', 'smite']);
    await castAll(['holySwords']);
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
/** 사망 → 결산 → 실험장 (로컬 저장의 결정 수가 늘어난다) */
SCENES.death = async () => {
  await startRun('warrior');
  await fight('tomakki', 3, 1);
  rs().invuln = 0;
  for (let i = 0; i < 20 && !rs().dying; i++) {
    rs().playerLife.hurtPlayer(9999);
    await frames(10);
  }
  await waitFor(() => rs().session.settlement, 600);
  rs().playerLife.restartRun();
  await waitFor(() => mku().game.scene.getScenes(true).some((s) => s.sys.settings.key === 'Lab'), 300);
};
/** 실제 시간 ms 동안 공격 키를 누른 채 가장 가까운 적 옆에서 싸운다 (발사 간격·탄 비행이 실제 시간 기준이라) */
async function fightReal(ms) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  const end = performance.now() + ms;
  while (performance.now() < end) {
    const e = rs().enemies[0];
    if (e) rs().player.setPosition(e.sprite.x - 14, e.sprite.y);
    await frames(2);
    await sleep(16);
  }
  window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space' }));
  await frames(2);
}
/** 무기를 차례로 들고 공격한다 (특수 동작도 한 번씩). 표적이 줄면 다시 부른다 */
async function tryWeapons(ids) {
  await startRun('warrior');
  const b = await bus();
  for (const defId of ids) {
    const def = rs().ctx.data.weapons.weapons.find((w) => w.id === defId);
    rs().session.player.weapons = { slots: [{ defId, grade: def.grade, options: [] }, null], active: 0 };
    rs().session.player.energy = rs().session.player.energyMax;
    if (rs().enemies.length < 3) b.emit('debugSpawn', { enemyId: 'akgwi', count: 3 });
    tried.push(defId);
    await fightReal(900);
    rs().useWeaponSpecial();
    await frames(15);
  }
}
const WEAPON_IDS = ['pistol', 'shotgun', 'smg', 'sniper', 'grenadeLauncher', 'dagger', 'greatsword', 'spear', 'handi', 'rasalgethiClub', 'aviorStaff', 'rasalhagueSword', 'brokenBlade', 'hanabi', 'alGulBlade', 'gihwanArm', 'ancientCore', 'eclipseCore', 'algiebaSling', 'nekkarCleaver', 'argoBanner', 'curvedBow', 'mg70', 'flameStaff', 'zephyr', 'soulCalibur', 'magiFang', 'antimatterPistol', 'orbitalDisc', 'spaceNeedle', 'bootlegGun', 'debtorArm', 'hwanRemnant', 'mintakaStaff', 'woodenStaff', 'spiritFist', 'fist'];
for (let i = 0; i < 4; i++) SCENES[`weapons${i + 1}`] = () => tryWeapons(WEAPON_IDS.slice(i * 10, i * 10 + 10));
/** 적(보스 말고)을 한 종씩 전투 칸에 불러 무적 플레이어를 공격하게 둔다, 엘리트 3종도 */
async function tryEnemies(ids, elites) {
  await startRun('warrior');
  const { roomCenter } = await import('/src/systems/worldLayout.ts');
  const room = rs().session.map.rooms.findIndex((n) => n.kind === 'combatRoom');
  const c = roomCenter(rs().session.map.rooms[room], rs().m);
  rs().player.setPosition(c.x, c.y);
  await waitFor(() => rs().session.currentRoomId === room, 100);
  const b = await bus();
  const pairs = [...ids.map((id) => [id, null]), ...elites.map((el) => ['akgwi', el])];
  for (const [enemyId, elite] of pairs) {
    b.emit('debugSpawn', { enemyId, count: 2, elite });
    const name = elite ? `${enemyId}+${elite}` : enemyId;
    tried.push(name);
    // 공격이 실제로 나왔는지: 플레이어 피해 호출·적 탄·위험 지대 중 하나라도
    const life = rs().playerLife;
    const hurt0 = life.hurtPlayer;
    let acted = false;
    life.hurtPlayer = (...a) => ((acted = true), hurt0.apply(life, a));
    // 스폰 예고·공격 대기는 실제 시간이라 실제로 기다린다 (맞지 않고 곁에 서 있는다)
    const end = performance.now() + 5000;
    while (performance.now() < end && !acted) {
      const e = rs().enemies[0];
      if (e) rs().player.setPosition(e.sprite.x - 20, e.sprite.y);
      if (rs().enemyBullets.getLength() > 0 || rs().hazards.length > 0) acted = true;
      await frames(2);
      await sleep(16);
    }
    life.hurtPlayer = hurt0;
    // 공격이 없는 적(몸통 박치기만)은 무적이면 피해 호출이 없다
    const def = rs().ctx.data.enemies.enemies.find((x) => x.id === enemyId);
    if (!acted && (def.attacks?.length ?? 0) > 0) quiet.push(name);
    for (const e of [...rs().enemies]) if (!e.dead) rs().enemyLife.removeEnemy(e);
    for (const x of [...rs().enemyBullets.getChildren()]) x.destroy();
  }
}
const ENEMY_IDS = ['tomakki', 'gaedeulgae', 'akgwi', 'ghostShooter', 'hectarTrooper', 'magiBeetle', 'aMemory', 'ancientOne', 'hatredShard', 'executor', 'archon', 'vesselTree', 'pulseSac', 'gazeBell', 'clusterAlveoli', 'magiColonyFusion'];
for (let i = 0; i < 4; i++) SCENES[`enemies${i + 1}`] = () => tryEnemies(ENEMY_IDS.slice(i * 4, i * 4 + 4), []);
SCENES.elites = () => tryEnemies([], ['giant', 'swift', 'explosive']);
/** 부활 아이템: 쓰러졌다가 체력 가득 일어난다 (결산으로 가지 않음) */
SCENES.revive = async () => {
  await startRun('warrior');
  (await bus()).emit('debugGiveItem', { itemId: 'acruxCross' });
  await clearModals();
  rs().invuln = 0;
  for (let i = 0; i < 20 && !rs().dying; i++) {
    rs().playerLife.hurtPlayer(9999);
    await frames(10);
  }
  if (!rs().dying) throw new Error('안 쓰러짐');
  for (let t = 0; t < 80 && rs().dying; t++) {
    // 사망·부활 연출은 실제 흐른 시간으로 움직인다
    await sleep(100);
    await frames(5);
  }
  if (rs().dying || rs().session.settlement) throw new Error('부활 안 함');
  const p = rs().session.player;
  if (p.hp !== p.maxHp) throw new Error(`체력이 가득이 아님: ${p.hp}/${p.maxHp}`);
};
/** 전투 칸에 들어가 웨이브를 실제로 처치해 방을 깬다 (적 체력을 1로 낮춰 빨리) */
SCENES.combatClear = async () => {
  await startRun('magiScholar');
  const { roomCenter } = await import('/src/systems/worldLayout.ts');
  const id = rs().session.map.rooms.findIndex((n) => n.kind === 'combatRoom');
  const c = roomCenter(rs().session.map.rooms[id], rs().m);
  rs().player.setPosition(c.x, c.y);
  await waitFor(() => rs().rooms.get(id).phase === 'locked', 300);
  for (let t = 0; t < 40 && rs().rooms.get(id).phase !== 'cleared'; t++) {
    for (const e of rs().enemies) if (!e.dead) e.hp = Math.min(e.hp, 1);
    await fight(null, 0, 1);
    // 웨이브 사이 대기는 실제 흐른 시간으로 센다
    await sleep(150);
  }
  if (rs().rooms.get(id).phase !== 'cleared') throw new Error(`방이 안 깨짐: ${rs().rooms.get(id).phase}`);
  await frames(60);
};
/** 보스 처치 → 슬로모션·대사·보스 카드 → 포털 */
SCENES.bossKill = async () => {
  await startRun('warrior', { chapter: 1, stage: 2 });
  await enterRoom('bossRoom');
  const b = await bus();
  for (let t = 0; t < 40 && rs().session.player.record.bossKills.length === 0; t++) {
    b.emit('debugBossHp', { ratio: 0.0001 });
    await fight(null, 0, 1);
    await sleep(50);
  }
  if (rs().session.player.record.bossKills.length === 0) throw new Error('보스가 안 죽음');
  for (let t = 0; t < 60 && (rs().modal || rs().portals.length === 0); t++) {
    if (rs().modal) await clearModals();
    await sleep(100);
    await frames(5);
  }
  if (rs().portals.length === 0) throw new Error('포털이 안 생김');
};
/** 스테이지 끝 → 이동 화면 카드 → 다음 스테이지 */
SCENES.nextStage = async () => {
  await startRun('warrior');
  rs().nextStage();
  for (let i = 0; i < 100 && rs().session.stage.stage === 1; i++) {
    if (rs().modal === 'cards') (await bus()).emit('cardPick', { index: 0 });
    // 포탈 연출은 실제 흐른 시간으로 움직이는 트윈이라 진짜로 기다린다
    await sleep(100);
    await frames(5);
  }
  if (rs().session.stage.stage !== 2) throw new Error('다음 스테이지로 안 넘어감');
  await frames(60);
};
// 조우 칸 종류마다: 강제로 정하고 들어가 본다
for (const kind of ['treasure', 'merchant', 'combiner', 'skillShop', 'raid', 'magiSpire']) {
  SCENES[`encounter_${kind}`] = async () => {
    await startRun('warrior');
    (await bus()).emit('debugForceEncounter', { kind });
    const { roomCenter } = await import('/src/systems/worldLayout.ts');
    const id = rs().session.map.rooms.findIndex((n) => n.kind === 'encounterRoom');
    const c = roomCenter(rs().session.map.rooms[id], rs().m);
    rs().player.setPosition(c.x, c.y);
    await waitFor(() => rs().session.encounters.has(id), 300);
    if (rs().session.encounters.get(id) !== kind) throw new Error(`조우 종류가 다름: ${rs().session.encounters.get(id)}`);
    await frames(60);
    await clearModals();
    await fight(null, 0, 4);
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
  tried = [];
  quiet = [];
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
    tried,
    quiet,
    bossHp: r ? [...r.bossControllers.keys()].map((e) => Math.round(e.hp)) : [],
  };
}

/** 여러 장면을 차례로: 실패한 것만 자세히 (한 번에 2~3개, 도구 45초 제한) */
export async function runMany(list) {
  const out = [];
  for (const n of list) {
    const r = await run(n);
    out.push(r.ok ? `${n} ok` : `${n} 실패: ${r.threw ?? r.errors.join(' | ')}`);
  }
  return out;
}

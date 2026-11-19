/** 전투 씬이 아이템·적·보스에게 넘기는 Host(씬 기능을 좁혀 건넨 것)를 만든다. */
import type Phaser from 'phaser';
import { bus } from '../../core/events';
import { ItemRuntime } from '../../items/runtime';
import type { RunScene } from '../RunScene';

export function buildHosts(run: RunScene): void {
  const d = run.ctx.data;
  run.itemRt = new ItemRuntime({
    scene: run,
    ctx: run.ctx,
    player: () => run.session.player,
    skill: () => run.skillRt.hostFor('item'),
    skillFor: (id) => run.skillRt.hostFor(id),
    fireBullet: (from, angle, speed, range, base, tags, pierce) => run.combat.fireBullet(from, angle, speed, range, base, tags, 'item', { pierce, crit: 0 }),
    setInvuln: (sec) => {
      run.invuln = Math.max(run.invuln, sec);
    },
    buffDuration: (sec) => run.skillRt.hostFor('item').buffDuration(sec, ['buff']),
    area: (r) => run.skillRt.area(r),
    toast: (text) => bus.emit('toast', { text }),
    arena: () => run.currentArena(),
    blink: (distance) => run.blinkPlayer(distance),
    absorbEnemyBullets: (at, radius) => run.bulletRt.absorbEnemyBullets(at, radius),
  });
  run.enemyHost = {
    scene: run,
    playerPos: () => ({ x: run.player.x, y: run.player.y }),
    playerRadius: d.player.size / 2,
    hurtPlayer: (amount, attacker, mental) => run.hurtPlayer(amount * run.enemyDamageMul(), attacker ?? null, mental === undefined ? undefined : mental * run.enemyDamageMul()),
    fireEnemyBullet: (from, angle, speed, range, damage, refractable, mental, sprite, tint) =>
      run.bulletRt.fireEnemyBullet(from, angle, speed, range, damage * run.enemyDamageMul(), refractable, 0, (mental ?? 0) * run.enemyDamageMul(), sprite, tint),
    addHazard: (h) => run.hazards.push(h),
    linkWindup: (e, attackId) => run.linkWindup(e, attackId),
    rng: run.rng,
    pullPlayer: (to, speed) => run.pullPlayer(to, speed),
    pathDir: (from, radius) => run.enemyPathDir(from, radius),
  };
  run.bossHost = {
    ...run.enemyHost,
    rng: run.rng,
    t: (key) => run.ctx.t(key),
    addHazard: (h) => run.hazards.push(h),
    fireEnemyBullet: (from, angle, speed, range, damage, refractable, sprite) =>
      run.bulletRt.fireEnemyBullet(from, angle, speed, range, damage * run.enemyDamageMul(), refractable, 0, 0, sprite),
    fireEnemyMissile: (from, angle, speed, range, damage, turnRate, sprite) => run.bulletRt.fireEnemyBullet(from, angle, speed, range, damage * run.enemyDamageMul(), true, turnRate, 0, sprite),
    pushPlayer: (v) => {
      const body = run.player.body as Phaser.Physics.Arcade.Body;
      body.velocity.x += v.x;
      body.velocity.y += v.y;
    },
    playerVel: () => {
      const v = (run.player.body as Phaser.Physics.Arcade.Body).velocity;
      return { x: v.x, y: v.y };
    },
    playerSanity: () => run.session.player.sanity,
    rootPlayer: (sec) => {
      if (run.rootLeft <= 0) run.floatLabel({ x: run.player.x, y: run.player.y - 14 }, run.ctx.t('boss.rooted'), '#ff5a5a');
      run.rootLeft = Math.max(run.rootLeft, sec);
    },
    spawnMinion: (id, at, maxHp) => run.spawnMinion(id, at, maxHp),
    removeMinion: (e) => {
      if (!e.dead) run.removeEnemy(e);
    },
    addObstacle: (at, radius, doorClear, art) => run.world.addObstacle(at, radius, doorClear, art),
    chapterRoster: () => run.chapterRoster(),
    arena: () => run.currentArena(),
    bossPhaseFx: (text, color, at) => run.stageFx.bossPhaseFx(text, color, at),
  };
}

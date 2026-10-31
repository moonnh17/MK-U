/** 디버그 명령 (?debug=1 패널). */
import Phaser from 'phaser';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { fitArt } from '../../entities/art';
import { findSkill, setSkillLevel } from '../../systems/skills';
import type { RunScene } from '../RunScene';

export class RunDebug {
  constructor(private readonly run: RunScene) {}

  debugClearRoom(): void {
    const rid = this.run.session.currentRoomId;
    if (rid === null) return;
    for (const e of this.run.enemies.filter((x) => this.run.enemyRoom.get(x) === rid)) this.run.removeEnemy(e);
    const state = this.run.rooms.get(rid);
    if (state) this.run.handleRoomEvents(rid, state.forceClear());
    const sp = this.run.encounters.spires.find((x) => x.roomId === rid);
    if (sp) for (const e of sp.state.forceCharge()) this.run.encounters.spireEvents.push({ sp, e });
  }

  /** 디버그: 계열 집계를 정하고 바로 전직 (한 런에 한 번) */
  debugAdvance(hectar: number, acro: number): void {
    const p = this.run.session.player;
    if (this.run.modal || p.advancement !== null) return;
    p.schoolPicks = { hectar, acro };
    this.run.progression.advance(() => {});
  }

  debugSetSkill(id: string, level: number, awakened: boolean): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    p.loadout = setSkillLevel(p.loadout, findSkill(d.skills, id), level, awakened);
    // 스킬을 없앴으면 그 스킬이 깔아 둔 오브젝트도 치운다
    if (level <= 0) for (const o of this.run.skillRt.skillObjects.filter((x) => x.owner.split('.')[0] === id)) this.run.skillRt.removeObject(o);
    this.run.skillRt.refreshSkillView();
    bus.emit('inventoryChanged', {});
    const u = this.run.progression.checkUltimateAwakening();
    if (u && !this.run.modal) this.run.progression.playCutscenes([u], () => {});
  }

  debugSpawn(enemyId: string, count: number, elite: string | null): void {
    const rid = this.run.session.currentRoomId;
    if (rid === null || this.run.modal) return;
    const rng = Rng.derive(this.run.ctx.config.seed, `debug-spawn-${this.run.time.now}`);
    // 방 웨이브와 무관하게 소환(방 클리어 판정에 넣지 않음)
    for (let i = 0; i < count; i++) this.run.spawnEnemy(enemyId, rid, rng, false, elite);
  }

  /** 플레이어 둘레에서 플레이어를 향해 일반 적 탄을 쏜다 (적 공격은 M3, 역장 확인용) */
  debugBarrage(): void {
    if (this.run.modal || this.run.session.outcome) return;
    const d = this.run.ctx.data.enemies;
    const cfg = d.debugBarrage;
    for (let i = 0; i < cfg.count; i++) {
      const a = (i * Math.PI * 2) / cfg.count;
      const x = this.run.player.x + Math.cos(a) * cfg.distance;
      const y = this.run.player.y + Math.sin(a) * cfg.distance;
      const b = this.run.enemyBullets.create(x, y, d.projectile.spriteKey) as Phaser.Physics.Arcade.Image;
      fitArt(this.run.ctx.data, b, d.projectile.size, d.projectile.height ?? d.projectile.size);
      b.setDepth(5);
      b.setData({ damage: cfg.damage, refractable: true, cuttable: true });
      b.setVelocity(-Math.cos(a) * cfg.speed, -Math.sin(a) * cfg.speed);
    }
  }
}

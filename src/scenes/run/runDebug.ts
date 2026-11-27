/** 디버그 명령 (?debug=1 패널). */
import Phaser from 'phaser';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { fitArt } from '../../entities/art';
import { findSkill, setSkillLevel } from '../../systems/skills';
import { isSkillImplemented } from '../../skills/registry';
import type { RunScene } from '../RunScene';
import type { SchoolId } from '../../types/data';

export class RunDebug {
  constructor(private readonly run: RunScene) {}

  debugClearRoom(): void {
    const rid = this.run.session.currentRoomId;
    if (rid === null) return;
    for (const e of this.run.enemies.filter((x) => this.run.enemyRoom.get(x) === rid)) this.run.enemyLife.removeEnemy(e);
    const state = this.run.rooms.get(rid);
    if (state) this.run.roomRt.handleRoomEvents(rid, state.forceClear());
    const sp = this.run.encounters.spires.find((x) => x.roomId === rid);
    if (sp) for (const e of sp.state.forceCharge()) this.run.encounters.spireEvents.push({ sp, e });
  }

  /** 디버그: 계열 집계를 정하고 바로 전직 (한 런에 한 번) */
  debugAdvance(hectar: number, acro: number): void {
    const p = this.run.session.player;
    if (this.run.modal || p.advancement !== null) return;
    p.schoolPicks = { ...p.schoolPicks, hectar, acro };
    this.run.progression.advance(() => {});
  }

  /** 디버그: 학파를 정해 바로 전직 (지금 직업의 학파일 때만, 한 런에 한 번) */
  debugAdvanceTo(school: string): void {
    const p = this.run.session.player;
    const job = this.run.ctx.data.jobs.jobs.find((j) => j.id === p.job);
    if (this.run.modal || p.advancement !== null || !job?.advancements.some((a) => a.id === school)) return;
    this.run.progression.advanceTo(school as SchoolId, () => {});
  }

  /** 모든 아이템 (디버프 제외): 획득 카드·각성 연출 없이 한꺼번에 (줄줄이 뜨는 창에 갇히지 않게) */
  debugAllItems(): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const ids = d.items.items.filter((x) => x.pool !== 'debuff').map((x) => x.id);
    p.items = [...new Set([...p.items, ...ids])];
    p.itemsObtained = [...new Set([...p.itemsObtained, ...ids])];
    for (const id of ids) this.run.discover('items', id);
    this.run.itemRt.refresh();
    bus.emit('inventoryChanged', {});
    bus.emit('toast', { text: this.run.ctx.t('debug.allItemsDone', { n: ids.length }) });
  }

  debugClearItems(): void {
    this.run.session.player.items = [];
    this.run.itemRt.refresh();
    bus.emit('inventoryChanged', {});
  }

  /** 발동 로직이 있는 모든 스킬을 최고 레벨로 (각성 여부 선택, 연출 없이) */
  debugAllSkills(awakened: boolean): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    for (const s of d.skills.skills) if (isSkillImplemented(s.id)) p.loadout = setSkillLevel(p.loadout, s, d.skills.maxLevel, awakened && !!s.awakening);
    this.run.skillRt.refreshSkillView();
    bus.emit('inventoryChanged', {});
    bus.emit('toast', { text: this.run.ctx.t('debug.allSkillsDone') });
  }

  /** 체력·에너지·정신력 가득 */
  debugHeal(): void {
    const p = this.run.session.player;
    p.hp = p.maxHp;
    p.energy = p.energyMax;
    p.sanity = p.sanityMax;
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
    for (let i = 0; i < count; i++) this.run.roomRt.spawnEnemy(enemyId, rid, rng, false, elite);
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

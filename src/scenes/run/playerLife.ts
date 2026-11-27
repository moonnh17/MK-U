/** 플레이어가 받는 피해·접촉, 사망·부활 연출, 런 종료(결산)·재시작, 끌려가기·순간이동. */
import { playFx } from '../../skills/skillFx';
import Phaser from 'phaser';
import { sfx } from './shared';
import type { Vec2 } from '../../core/actions';
import { bus } from '../../core/events';
import type { RunSession } from '../../core/session';
import { Enemy } from '../../entities/enemy';
import { applyMental } from '../../systems/sanity';
import { shake } from '../../entities/juice';
import { hiddenBossScale } from '../../systems/champions';
import { crystalBreakdown } from '../../systems/runRecord';
import { absorbHit } from '../../systems/shield';
import { hpStance, takeDamage } from '../../systems/vitals';
import { hiddenTableChapter } from '../../systems/overflow';
import { bestStage } from '../../core/save';
import type { RunScene } from '../RunScene';

export class PlayerLife {
  constructor(private readonly run: RunScene) {}

  /** 피해를 받았으면 true. attacker: 때린 적(반사용, 모르면 null) */
  hurtPlayer(amount: number, attacker: Enemy | null = null, mentalRaw?: number): boolean {
    // 구르기로 피한 공격 (투르비용: 원심 가속)
    if (this.run.condition.dodge.invuln > 0 && amount > 0 && !this.run.session.outcome) this.run.itemRt.onDodgeAvoid();
    if (this.run.invuln > 0 || this.run.acro.cinematic || this.run.condition.dodge.invuln > 0 || this.run.dying || this.run.ctx.debugFlags.invincible || this.run.session.outcome || this.run.modal) return false;
    // 특무 인장: 피해를 받기 직전 순간이동으로 피한다 (피격 무적과 같은 시간)
    if (this.run.itemRt.tryDodge()) {
      this.run.invuln = this.run.ctx.data.player.hurtInvulnSec;
      return true;
    }
    // 마기역장: 공격을 막고 잠깐 무적
    const absorbed = absorbHit(this.run.skillRt.shield);
    if (absorbed.blocked) {
      this.run.skillRt.shield = absorbed.shield;
      this.run.invuln = this.run.skillRt.shieldOpts?.blockInvulnSec ?? 0;
      this.run.cameras.main.flash(60, 140, 170, 210);
      if (this.run.skillRt.shieldOpts?.look?.block) {
        const at = this.run.player.getCenter();
        playFx(this.run, this.run.skillRt.shieldOpts.look.block, at.x, at.y);
      }
      return true;
    }
    const p = this.run.session.player;
    const stance = this.run.itemRt.first('hpStance');
    const taken = this.run.itemRt.absorbOverheal(this.run.skillRt.absorb(amount * (1 - this.run.skillRt.playerMods().damageReduction) * (1 + (this.run.skillRt.playerMods().damageTaken ?? 0)) * (1 - this.run.condition.chargeGuard()) * (1 - this.run.itemRt.sums.damageTaken - this.run.itemRt.guard()) * (stance ? 1 - hpStance(p.hp, p.maxHp, stance).taken : 1)));
    // 정신 피해: 패닉 중이면 체력 피해로 바뀐다
    const mental = (mentalRaw ?? amount * (attacker?.def.mentalRatio ?? 0)) ;
    const m = applyMental(p, mental);
    this.run.condition.setSanity(m);
    const v = takeDamage(p, taken + m.hpDamage);
    p.hp = v.hp;
    this.run.invuln = this.run.ctx.data.player.hurtInvulnSec;
    shake(this.run, 'light');
    this.run.juice.hurt();
    sfx('playerHurt');
    this.run.mage.onHurt();
    // 피격에 반응하는 스킬 오브젝트 (반물질포 충전 취소 등)
    for (const o of [...this.run.skillRt.skillObjects]) if (o.onPlayerHurt && !o.onPlayerHurt(this.run.host)) this.run.skillRt.removeObject(o);
    // 아이템: 피격 효과 → 낮은 체력 회복 → 부활
    this.run.itemRt.onHurt(taken, attacker);
    if (p.hp > 0) this.run.itemRt.tryHeal();
    // 부활 아이템이 있으면 죽는 연출 뒤 부활 연출로 일어난다
    if (p.hp <= 0) this.beginDeath(this.run.itemRt.takeRevive());
    return true;
  }

  onContact(enemy: Enemy | undefined): void {
    if (!enemy || enemy.dead || enemy.warn > 0 || enemy.def.contactDamage <= 0) return;
    const now = this.run.time.now;
    if (now - enemy.lastContactAt < enemy.def.contactIntervalSec * 1000) return;
    if (this.hurtPlayer(enemy.def.contactDamage * enemy.damageMul * this.enemyDamageMul(), enemy)) enemy.lastContactAt = now;
  }

  /** 적 피해 배율: 몬스터는 고정 스탯(1), 히든보스와 싸우는 동안만 장 배율 (히든보스 방에는 그 보스와 부른 것만 있다) */
  enemyDamageMul(): number {
    if (!this.run.enemies.some((e) => !e.dead && e.rank === 'hiddenBoss')) return 1;
    return hiddenBossScale(hiddenTableChapter(this.run.session.stage, this.run.ctx.data), this.run.ctx.data.enemies.hiddenBossScale);
  }

  /** 사망: 연출을 보여 준 뒤 결산으로 */
  beginDeath(revive: { invulnSec: number; look?: 'hectar' | 'holy' } | null = null): void {
    if (this.run.dying) return;
    this.run.dying = true;
    this.run.loot.setInteractHint(null);
    bus.emit('weaponTip', { item: null });
    bus.emit('cardTip', { card: null });
    this.run.physics.pause();
    this.run.dropSuit();
    this.run.stageFx.playDeath(() => {
      if (!revive) return this.endRun({ type: 'dead' });
      this.run.stageFx.playRevive(revive.look ?? 'holy', () => this.finishRevive(revive.invulnSec));
    });
  }

  /** 부활 연출이 끝나면: 체력 가득, 쓰러진 모습·카메라를 되돌리고 잠깐 무적 */
  finishRevive(invulnSec: number): void {
    const p = this.run.session.player;
    p.hp = p.maxHp;
    this.run.dying = false;
    this.run.physics.resume();
    this.run.tweens.killTweensOf(this.run.player);
    this.run.player.setAngle(0).setAlpha(1).clearTint();
    this.run.weaponSprite.setVisible(true);
    this.run.cameras.main.zoomTo(this.run.ctx.data.ui.camera.zoom * this.run.ctx.renderScale, 300, 'Sine.easeOut');
    this.run.invuln = Math.max(this.run.invuln, invulnSec);
    bus.emit('toast', { text: this.run.ctx.t('item.revived') });
  }

  endRun(outcome: NonNullable<RunSession['outcome']>): void {
    this.run.session.outcome = outcome;
    // 결산: 결정을 계산해 바로 저장에 더한다 (결산 화면을 닫지 않고 꺼도 남게)
    const d = this.run.ctx.data;
    const save = this.run.ctx.save;
    const runClear = outcome.type === 'chapterClear' && outcome.chapter >= d.mapgen.chapters;
    const crystals = crystalBreakdown(this.run.session.player.record, runClear, d.meta.crystals);
    save.data.crystals += crystals.total;
    // 본편 클리어 → 오버플로우 포털 개방, 오버플로우는 최고 도달 스테이지만 따로
    if (runClear) save.data.storyCleared = true;
    if (this.run.session.player.overflow) save.data.overflowBest = bestStage(save.data.overflowBest, this.run.session.stage);
    save.write();
    this.run.session.settlement = { runClear, crystals, balance: save.data.crystals, shardsOwned: save.data.pastShards };
    this.run.physics.pause();
    this.run.player.setAlpha(1);
    this.run.loot.setInteractHint(null);
    bus.emit('overlay', { open: true });
  }

  /** 결산 확인 → 실험장으로 돌아간다 */
  restartRun(): void {
    if (this.run.modal === 'story') return;
    // 마지막 챕터 클리어: 결산 화면을 닫고 엔딩 대화를 본 뒤 실험장으로 (대화가 비어 있으면 바로)
    if (this.run.session.settlement?.runClear && !this.run.endingPlayed) {
      this.run.endingPlayed = true;
      bus.emit('overlay', { open: false });
      this.run.progression.playStory('runClear', undefined, () => this.restartRun());
      return;
    }
    this.run.time.paused = false;
    bus.emit('overlay', { open: false });
    if (this.run.modal) bus.emit('modal', { kind: null });
    this.run.ctx.session = null;
    this.run.scene.start('Lab');
  }

  /** 집행자 밧줄: 플레이어를 to까지 끌어당긴다 (그동안 입력 무시). 걸리는 시간 */
  pullPlayer(to: Vec2, speed: number): number {
    const dx = to.x - this.run.player.x;
    const dy = to.y - this.run.player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return 0;
    const sec = dist / speed;
    this.run.dashVel = { x: (dx / dist) * speed, y: (dy / dist) * speed };
    this.run.dashLeft = sec;
    return sec;
  }

  /** 특무 인장: 방 안, 벽·잔해가 없는 쪽으로 짧게 순간이동 */
  blinkPlayer(distance: number): void {
    const a = this.run.roomRt.currentArena();
    const r = this.run.ctx.data.player.size / 2;
    const base = this.run.rng.range(0, Math.PI * 2);
    for (let i = 0; i < 8; i++) {
      const ang = base + (i * Math.PI) / 4;
      const x = this.run.player.x + Math.cos(ang) * distance;
      const y = this.run.player.y + Math.sin(ang) * distance;
      if (x < a.x + r || x > a.x + a.w - r || y < a.y + r || y > a.y + a.h - r) continue;
      if (this.run.physics.overlapRect(x - r, y - r, r * 2, r * 2, false, true).length > 0) continue;
      const from = { x: this.run.player.x, y: this.run.player.y };
      this.run.fxAt(this.run.add.circle(from.x, from.y, r + 3, 0x8a6aff, 0.5).setDepth(6));
      (this.run.player.body as Phaser.Physics.Arcade.Body).reset(x, y);
      break;
    }
    this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y }, this.run.ctx.t('item.dodged'), '#b0a0ff');
  }
}

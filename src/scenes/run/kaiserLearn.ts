/**
 * 오버플로우 마기카이저 학습 (제안, 임시 변형 3종): 이 런에서 가장 많이 맞힌 계열(원거리·근접·마기/기술)에 맞서
 * 그 계열 피해를 덜 받고, 맞을 때 반응한다(원거리 반사 / 근접 충격파 / 마기 흡수 후 방출). 고르는 공식은 systems/kaiserLearning.ts.
 */
import { bus } from '../../core/events';
import { hexColor } from '../../core/scale';
import type { Enemy } from '../../entities/enemy';
import { Ring } from '../../entities/hazard';
import { pickKaiserVariant } from '../../systems/kaiserLearning';
import type { RunScene } from '../RunScene';

export class KaiserLearn {
  constructor(private readonly run: RunScene) {}

  /** 마기카이저가 나올 때: 학습 변형을 붙인다 (본편·학습 부족이면 아무것도 안 함) */
  /** mul: 보스 피해 배율 (오버플로우 장 배율·보스 진화) */
  apply(enemy: Enemy, mul: number): void {
    const run = this.run;
    const ovf = run.session.player.overflow;
    if (!ovf) return;
    const K = run.ctx.data.overflow.kaiserLearning;
    const v = pickKaiserVariant(ovf.tagUse ?? {}, K);
    if (!v) return;
    enemy.tagTaken = v.takenMul;
    let shockCd = 0;
    let absorbed = 0;
    let lastT = run.time.now;
    const color = hexColor(K.color);
    enemy.onTagHit = (tags) => {
      if (enemy.dead) return;
      const host = run.bossHost;
      const at = { x: enemy.sprite.x, y: enemy.sprite.y };
      const now = run.time.now;
      shockCd = Math.max(0, shockCd - (now - lastT) / 1000);
      lastT = now;
      if (v.reflect && tags.includes('ranged') && run.rng.chance(v.reflect.chance)) {
        const p = host.playerPos();
        host.fireEnemyBullet(at, Math.atan2(p.y - at.y, p.x - at.x), v.reflect.speed, v.reflect.range, v.reflect.damage * mul, true);
      }
      if (v.shock && tags.includes('melee') && shockCd <= 0) {
        shockCd = v.shock.cooldownSec;
        const S = v.shock;
        host.addHazard(new Ring(run, { center: at, fromR: enemy.radius, toR: S.radius, moveSec: 0.25, telegraphSec: 0, holdSec: 0, thickness: S.thickness, damage: S.damage * mul, tickSec: 0, color }));
        const p = host.playerPos();
        const d = Math.hypot(p.x - at.x, p.y - at.y) || 1;
        if (d < S.radius + 20) for (let i = 0; i < 6; i++) run.time.delayedCall(i * 16, () => host.pushPlayer({ x: ((p.x - at.x) / d) * S.pushPx, y: ((p.y - at.y) / d) * S.pushPx }));
        bus.emit('sfx', { id: 'bossSlam' });
      }
      if (v.absorb && (tags.includes('magic') || tags.includes('tech'))) {
        absorbed += 1;
        if (absorbed >= v.absorb.hits) {
          absorbed = 0;
          const A = v.absorb;
          const base = run.rng.range(0, Math.PI * 2);
          for (let i = 0; i < A.count; i++) host.fireEnemyBullet(at, base + (i * Math.PI * 2) / A.count, A.speed, A.range, A.damage * mul, true);
          bus.emit('sfx', { id: 'electric' });
        }
      }
    };
    // 알림: 무엇을 배웠는지
    run.time.delayedCall(1500, () => {
      if (enemy.dead) return;
      run.stageFx.bossPhaseFx(run.ctx.t(v.nameKey), K.color, { x: enemy.sprite.x, y: enemy.sprite.y });
      run.progression.mini.push([{ text: run.ctx.t(`${v.nameKey}.line`), mood: 'ominous' }], 3);
    });
  }
}

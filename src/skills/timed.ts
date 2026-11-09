/**
 * 시간제 스킬 오브젝트 바탕 (전사 버프·지속 공격). 지속이 끝나면 사라지고, HUD에 남은 시간을 보인다.
 * 몸을 따라다니는 그림(follow)이 있으면 매 프레임 플레이어 자리로 옮긴다.
 */
import type Phaser from 'phaser';
import type { SpriteRef } from '../types/data';
import { loopArt } from './skillFx';
import type { BuffView, SkillHost, SkillObject } from './host';

export abstract class Timed implements SkillObject {
  readonly createdAt: number;
  left: number;
  private follow: Phaser.GameObjects.Sprite | null = null;

  constructor(
    readonly owner: string,
    host: SkillHost,
    readonly total: number,
    private readonly buffLabel: { key: string; color: string } | null,
  ) {
    this.createdAt = host.scene.time.now;
    this.left = total;
  }

  /** 몸을 따라다니는 반복 그림 (반지름 r) */
  protected attach(host: SkillHost, ref: SpriteRef, r: number, alpha = 0.7): void {
    const p = host.playerPos();
    const sp = host.sprite(p.x, p.y, ref).setDepth(2.6).setAlpha(alpha);
    sp.setDisplaySize(r * 2, (r * 2 * sp.height) / Math.max(1, sp.width));
    loopArt(sp, ref);
    this.follow = sp;
  }

  update(dt: number, host: SkillHost): boolean {
    this.left -= dt;
    if (this.follow) {
      const p = host.playerPos();
      this.follow.setPosition(p.x, p.y);
    }
    this.tick(dt, host);
    return this.left > 0;
  }

  protected tick(_dt: number, _host: SkillHost): void {}

  buff(host: SkillHost): BuffView | null {
    if (!this.buffLabel) return null;
    return { id: this.owner, label: host.ctx.t(this.buffLabel.key), color: this.buffLabel.color, leftSec: Math.max(0, this.left), totalSec: this.total };
  }

  destroy(): void {
    this.follow?.destroy();
    this.follow = null;
  }
}

/** at에서 반지름 r 안(적 몸 포함)의 살아 있는 적 */
export function enemiesWithin(host: SkillHost, at: { x: number; y: number }, r: number) {
  return host.enemies().filter((e) => Math.hypot(e.sprite.x - at.x, e.sprite.y - at.y) <= r + e.radius);
}

/** 같은 스킬 오브젝트를 모두 치운다 (다시 쓰면 새로 시작) */
export function clearOwner(host: SkillHost, owner: string): void {
  for (const o of host.objects().filter((x) => x.owner === owner)) host.removeObject(o);
}

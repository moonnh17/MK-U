/**
 * 마기법사 스킬. 백온파(원소)·휘강파(순수 마기).
 * - 화염벽: 조준 방향 앞에 조준과 직각인 불길 벽을 세운다. 벽 안 적은 tickSec마다 피해, burnEverySec마다 화상.
 * - 순간이동: 조준 방향으로 곧장 옮긴다(벽 앞에서 멈춤, 도착 폭발 없음).
 */
import type Phaser from 'phaser';
import type { Enemy } from '../entities/enemy';
import { loopArt } from './skillFx';
import type { SkillCast, SkillHost, SkillImpl, SkillObject } from './host';

// ---------- 화염벽 ----------

class FireWall implements SkillObject {
  readonly owner = 'fireWall';
  readonly createdAt: number;
  private life: number;
  private tick = 0;
  private readonly lastBurn = new Map<Enemy, number>();
  private age = 0;
  private readonly flames: Phaser.GameObjects.Sprite[] = [];
  private readonly len: number;
  private readonly thick: number;

  constructor(
    host: SkillHost,
    private readonly s: SkillCast,
    private readonly at: { x: number; y: number },
    /** 조준 방향 (벽 두께 방향) */
    private readonly dir: { x: number; y: number },
  ) {
    const v = s.values;
    this.createdAt = host.scene.time.now;
    this.life = v.lifeSec!;
    this.len = host.area(v.length!);
    this.thick = v.thickness!;
    // 벽을 따라 불길 그림을 늘어놓는다
    const ref = s.def.sprites.flame!;
    const n = Math.max(2, Math.round(this.len / (ref.size * 0.7)));
    for (let i = 0; i < n; i++) {
      const t = (i / (n - 1) - 0.5) * this.len;
      const sp = host.sprite(at.x - dir.y * t, at.y + dir.x * t, ref).setDepth(4);
      sp.setDisplaySize(ref.size * 1.4, ref.size * 1.4);
      loopArt(sp, ref);
      this.flames.push(sp);
    }
  }

  /** 적 몸이 벽(회전한 사각형) 안에 걸리는지 */
  private inside(e: Enemy): boolean {
    const rx = e.sprite.x - this.at.x;
    const ry = e.sprite.y - this.at.y;
    const across = rx * this.dir.x + ry * this.dir.y;
    const along = -rx * this.dir.y + ry * this.dir.x;
    return Math.abs(along) <= this.len / 2 + e.radius && Math.abs(across) <= this.thick / 2 + e.radius;
  }

  update(dt: number, host: SkillHost): boolean {
    const v = this.s.values;
    this.age += dt;
    this.life -= dt;
    this.tick -= dt;
    const hitNow = this.tick <= 0;
    if (hitNow) this.tick = v.tickSec!;
    for (const e of host.enemies()) {
      if (!this.inside(e)) continue;
      if (hitNow && host.hit(e, v.damage!, this.s.def.sources.wall!)) continue;
      const last = this.lastBurn.get(e) ?? -Infinity;
      if (!e.dead && this.age - last >= v.burnEverySec!) {
        this.lastBurn.set(e, this.age);
        host.burn(e, v.burnStacks!);
      }
    }
    // 마지막 0.4초는 옅어진다
    const fade = Math.min(1, this.life / 0.4);
    for (const f of this.flames) f.setAlpha(fade);
    return this.life > 0;
  }

  destroy(): void {
    for (const f of this.flames) f.destroy();
  }
}

export const fireWall: SkillImpl = {
  cast(host, s) {
    const p = host.playerPos();
    const d = host.aimDir();
    const off = s.values.offset!;
    host.addObject(new FireWall(host, s, { x: p.x + d.x * off, y: p.y + d.y * off }, d));
    return true;
  },
};

// ---------- 순간이동 ----------

export const teleport: SkillImpl = {
  cast(host, s) {
    const { from, to } = host.teleport(host.aimDir(), s.values.distance!, s.values.stepPx!);
    // 임시 연출: 떠난 자리·도착한 자리에 보라 파동 (pixelfx는 D 단계)
    host.burst(from, s.def.color);
    host.burst(to, s.def.color);
    return true;
  },
};

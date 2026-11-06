/**
 * 아이템 획득 창 (DOM). 게임을 멈추고, 빛줄기 속에서 아이템이 떠오른 뒤 아래 글상자에 이름·설명이 뜬다.
 * 세트 결과물이면 재료 둘이 양쪽에서 모여 빛나며 합쳐진 뒤 새 아이템이 나온다. 아무 키나 화면을 누르면 닫힌다.
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { scaleEffect } from '../systems/items';
import { plainWeapon } from '../systems/weapons';
import type { GroupMultipliersData, ItemDef } from '../types/data';
import { weaponInfoLines } from './weaponInfo';

const PCT = new Set(['damage', 'enemyTaken', 'damageTaken', 'coinGain', 'energyGain', 'chargeTime', 'area', 'buffDuration', 'skillDamage', 'moveSpeed', 'skillCooldown', 'lifesteal', 'dodgeCdReduce', 'dodgeHaste', 'critChance', 'critDamage', 'ultimateCooldown']);

function num(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** 설명 문구의 자리: v{i} 주 값(%는 100배) · d{i} 피해 · r{i} 반경 · s{i} 주기·재사용 · th/to/a{i} 회복 · dur/per/n{i} · pd/pm/b/c/g{i} */
/** 아이템 설명 전체 (일반 능력, 추가 능력 순으로 잇는다): 카드·가방용 */
export function itemDescText(def: ItemDef, groups: GroupMultipliersData, t: (key: string, vars?: Record<string, string>) => string): string {
  const p = itemDescParams(def, groups);
  return [def.descKey, def.abilityDescKey].filter((k): k is string => !!k).map((k) => t(k, p)).join(', ');
}

export function itemDescParams(def: ItemDef, groups: GroupMultipliersData): Record<string, string> {
  const out: Record<string, string> = {};
  def.effects.forEach((raw, i) => {
    const e = scaleEffect(raw, groups) as Record<string, unknown> & { kind: string };
    if (typeof e.value === 'number') {
      out[`v${i}`] = num(PCT.has(e.kind) ? e.value * 100 : e.value);
      // 음수 효과를 "+n%"로 쓸 때 (받는 피해 증가)
      out[`m${i}`] = num(Math.abs(PCT.has(e.kind) ? e.value * 100 : e.value));
    }
    if (typeof e.damage === 'number') out[`d${i}`] = num(e.damage);
    if (typeof e.radius === 'number') out[`r${i}`] = num(e.radius);
    const sec = typeof e.everySec === 'number' ? e.everySec : e.cooldownSec;
    if (typeof sec === 'number') out[`s${i}`] = num(sec);
    if (typeof e.threshold === 'number') out[`th${i}`] = num(e.threshold * 100);
    if (typeof e.healTo === 'number') out[`to${i}`] = num(e.healTo * 100);
    if (typeof e.afterDamage === 'number') out[`a${i}`] = num(e.afterDamage * 100);
    if (typeof e.uses === 'number') out[`u${i}`] = num(e.uses);
    if (typeof e.maxEnergyPerUse === 'number') out[`me${i}`] = num(e.maxEnergyPerUse);
    if (typeof e.durationSec === 'number') out[`dur${i}`] = num(e.durationSec);
    if (typeof e.absorbSec === 'number') out[`dur${i}`] = num(e.absorbSec);
    if (typeof e.perCoins === 'number') out[`per${i}`] = num(e.perCoins);
    if (typeof e.perKills === 'number') out[`per${i}`] = num(e.perKills);
    if (typeof e.shots === 'number') out[`n${i}`] = num(e.shots);
    if (typeof e.attacks === 'number') out[`n${i}`] = num(e.attacks);
    // 함성: pd 피해 %, pm 이동속도 % / 순간 회피: b 피해 % / 방패: c 튕김, g 받는 피해 감소 %
    if (e.kind === 'roomRoar') {
      out[`pd${i}`] = num((e.damage as number) * 100);
      out[`pm${i}`] = num((e.moveSpeed as number) * 100);
    }
    if (typeof e.maxDamage === 'number') out[`md${i}`] = num(e.maxDamage * 100);
    if (e.kind === 'hpStance') {
      out[`sr${i}`] = num((e.ratio as number) * 100);
      out[`sd${i}`] = num((e.damageUp as number) * 100);
      out[`st${i}`] = num((e.takenDown as number) * 100);
    }
    if (typeof e.hpPerSec === 'number') out[`hp${i}`] = num(e.hpPerSec);
    if (e.kind === 'panicAwaken') out[`pd${i}`] = num((e.damage as number) * 100);
    if (typeof e.bonus === 'number') out[`b${i}`] = num(e.bonus * 100);
    if (typeof e.bounces === 'number') out[`c${i}`] = num(e.bounces);
    if (typeof e.guard === 'number') out[`g${i}`] = num(e.guard * 100);
  });
  return out;
}

/** 연속 입력으로 바로 닫히지 않게 */
const CLOSE_GUARD_MS = 700;
/** 합성 연출: 결과물이 나올 때까지 (style.css의 ig-fuse 시간과 맞춘다) */
const FUSE_REVEAL_MS = 1250;

export class ItemCard {
  private readonly root: HTMLDivElement;
  private open = false;
  private shownAt = 0;
  private guardMs = CLOSE_GUARD_MS;

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'item-card';
    document.body.appendChild(this.root);
    bus.on('itemGot', (e) => this.show(e));
    const close = (e: Event) => {
      if (!this.open) return;
      e.preventDefault();
      e.stopPropagation();
      if (performance.now() - this.shownAt < this.guardMs) return;
      this.open = false;
      this.root.style.display = 'none';
      this.root.replaceChildren();
      bus.emit('itemGetDone', {});
    };
    window.addEventListener('keydown', close, true);
    this.root.addEventListener('pointerdown', close);
  }

  private show(e: { itemId: string; set: boolean; weapon?: boolean; from?: { key: string; color: string }[] }): void {
    const t = this.ctx.t;
    const d = this.ctx.data;
    const weapon = e.weapon ? d.weapons.weapons.find((x) => x.id === e.itemId) : undefined;
    const def = e.weapon ? weapon : d.items.items.find((x) => x.id === e.itemId);
    if (!def) {
      bus.emit('itemGetDone', {});
      return;
    }
    const descText = weapon
      ? weaponInfoLines(this.ctx, plainWeapon(weapon))
          .map((l) => l.text)
          .join('\n')
      : itemDescText(def as ItemDef, d.groupMultipliers, t);
    const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
    const color = grade?.color ?? '#ffffff';
    this.root.style.setProperty('--grade', color);
    this.root.replaceChildren();
    const stage = document.createElement('div');
    stage.className = 'ig-stage';
    const rays = document.createElement('div');
    rays.className = 'ig-rays';
    const icon = document.createElement('div');
    icon.className = 'ig-icon';
    if (!applyArtIcon(icon, this.ctx, def.spriteKey, color)) icon.classList.add('ig-noart');
    stage.append(rays, icon);
    const fusing = !!e.from?.length;
    this.root.classList.toggle('ig-fusing', fusing);
    if (fusing) {
      e.from!.forEach((m, i) => {
        const part = document.createElement('div');
        part.className = `ig-part ig-part${i}`;
        if (!applyArtIcon(part, this.ctx, m.key, m.color)) part.classList.add('ig-noart');
        stage.appendChild(part);
      });
      const flash = document.createElement('div');
      flash.className = 'ig-flash';
      stage.appendChild(flash);
    }
    for (let i = 0; i < 14; i++) {
      const spark = document.createElement('i');
      spark.className = 'ig-spark';
      spark.style.setProperty('--a', `${(i / 14) * 360}deg`);
      spark.style.animationDelay = `${(fusing ? FUSE_REVEAL_MS / 1000 : 0.35) + (i % 4) * 0.08}s`;
      stage.appendChild(spark);
    }
    const box = document.createElement('div');
    box.className = 'ig-box';
    const head = document.createElement('div');
    head.className = 'ic-head';
    head.textContent = `${t(e.set ? 'item.set' : 'item.got')} · ${grade ? t(grade.nameKey) : ''}`;
    const name = document.createElement('div');
    name.className = 'ic-name';
    name.textContent = t(def.nameKey);
    const desc = document.createElement('div');
    desc.className = 'ic-desc';
    desc.textContent = descText;
    desc.style.whiteSpace = 'pre-line';
    const next = document.createElement('div');
    next.className = 'ig-next';
    next.textContent = `▼ ${t(this.ctx.uiMode === 'mobile' ? 'itemGet.next.mobile' : 'itemGet.next.pc')}`;
    box.append(head, name, desc, next);
    this.root.append(stage, box);
    this.root.style.display = 'flex';
    this.open = true;
    this.shownAt = performance.now();
    this.guardMs = fusing ? FUSE_REVEAL_MS + CLOSE_GUARD_MS : CLOSE_GUARD_MS;
    if (fusing) {
      bus.emit('sfx', { id: 'skill' });
      window.setTimeout(() => bus.emit('sfx', { id: 'itemFanfare' }), FUSE_REVEAL_MS);
    } else bus.emit('sfx', { id: 'itemFanfare' });
  }
}

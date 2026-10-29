/**
 * 아이템 획득 카드 (DOM). 얻는 순간 화면 위쪽에 잠깐 뜬다(게임은 멈추지 않음).
 * 아이템 탭은 M5에서 만든다.
 */
import { applyArtIcon } from './artIcon';
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { scaleEffect } from '../systems/items';
import type { GroupMultipliersData, ItemDef } from '../types/data';

const PCT = new Set(['damage', 'enemyTaken', 'damageTaken', 'coinGain', 'area', 'buffDuration', 'skillDamage']);

function num(v: number): string {
  return String(Math.round(v * 10) / 10);
}

/** 설명 문구의 자리: v{i} 주 값(%는 100배) · d{i} 피해 · r{i} 반경 · s{i} 주기·재사용 · th/to/a{i} 회복 · dur/per/n{i} · pd/pm/b/c/g{i} */
export function itemDescParams(def: ItemDef, groups: GroupMultipliersData): Record<string, string> {
  const out: Record<string, string> = {};
  def.effects.forEach((raw, i) => {
    const e = scaleEffect(raw, groups) as Record<string, unknown> & { kind: string };
    if (typeof e.value === 'number') out[`v${i}`] = num(PCT.has(e.kind) ? e.value * 100 : e.value);
    if (typeof e.damage === 'number') out[`d${i}`] = num(e.damage);
    if (typeof e.radius === 'number') out[`r${i}`] = num(e.radius);
    const sec = typeof e.everySec === 'number' ? e.everySec : e.cooldownSec;
    if (typeof sec === 'number') out[`s${i}`] = num(sec);
    if (typeof e.threshold === 'number') out[`th${i}`] = num(e.threshold * 100);
    if (typeof e.healTo === 'number') out[`to${i}`] = num(e.healTo * 100);
    if (typeof e.afterDamage === 'number') out[`a${i}`] = num(e.afterDamage * 100);
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
    if (typeof e.bonus === 'number') out[`b${i}`] = num(e.bonus * 100);
    if (typeof e.bounces === 'number') out[`c${i}`] = num(e.bounces);
    if (typeof e.guard === 'number') out[`g${i}`] = num(e.guard * 100);
  });
  return out;
}

export class ItemCard {
  private readonly root: HTMLDivElement;
  private timer = 0;
  private queue: { itemId: string; set: boolean }[] = [];

  constructor(private readonly ctx: GameContext) {
    this.root = document.createElement('div');
    this.root.id = 'item-card';
    document.body.appendChild(this.root);
    bus.on('itemGot', (e) => {
      this.queue.push(e);
      if (!this.timer) this.next();
    });
  }

  private next(): void {
    const e = this.queue.shift();
    if (!e) {
      this.timer = 0;
      this.root.style.display = 'none';
      return;
    }
    const t = this.ctx.t;
    const d = this.ctx.data;
    const def = d.items.items.find((x) => x.id === e.itemId);
    if (!def) return this.next();
    const grade = d.groupMultipliers.grades.find((g) => g.id === def.grade);
    this.root.style.borderColor = grade?.color ?? '#ffffff';
    this.root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'ic-head';
    head.textContent = `${t(e.set ? 'item.set' : 'item.got')} · ${grade ? t(grade.nameKey) : ''}`;
    const name = document.createElement('div');
    name.className = 'ic-name';
    name.style.color = grade?.color ?? '#ffffff';
    name.textContent = t(def.nameKey);
    // 아이템 그림이 있으면 이름 앞에 아이콘
    const icon = document.createElement('span');
    icon.className = 'cw-icon';
    if (applyArtIcon(icon, this.ctx, def.spriteKey)) name.prepend(icon);
    const desc = document.createElement('div');
    desc.className = 'ic-desc';
    desc.textContent = t(def.descKey, itemDescParams(def, d.groupMultipliers));
    this.root.append(head, name, desc);
    this.root.style.display = 'flex';
    this.timer = window.setTimeout(() => this.next(), d.items.pickupCardSec * 1000);
  }
}

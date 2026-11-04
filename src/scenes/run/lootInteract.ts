/** 상호작용과 전리품: 무기 줍기·버리기, 상자, 상인, 자판기, 아이템 획득, 조작 안내. */
import Phaser from 'phaser';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { CardStand, Chest, MerchantStand, type ChestKind } from '../../entities/chest';
import { FloorWeapon } from '../../entities/pickup';
import { fitArt } from '../../entities/art';
import { describeCard } from '../../ui/cardView';
import { artKeys } from '../../systems/art';
import { cardStillValid, type Card } from '../../systems/cards';
import { chapterWeights, combinableItems, combineCandidates, combineGrade, effectiveWeights, readySet, readyWeaponSet, rollItem, transferWeight } from '../../systems/items';
import { canBuy, cardStock, rollChestTier, rollGrade, rollWeapon } from '../../systems/loot';
import { heal } from '../../systems/vitals';
import { dropWeaponAt, pickUpWeapon, plainWeapon, type WeaponItem } from '../../systems/weapons';
import type { GradeId, SpriteRef } from '../../types/data';
import type { RunScene } from '../RunScene';
import { sfx, type ItemGet, type Prop, type Vending } from './shared';

export class LootInteract {
  floorWeapons: FloorWeapon[] = [];
  private tipItem: WeaponItem | null = null;
  chests: Chest[] = [];
  stands: MerchantStand[] = [];
  cardStands: CardStand[] = [];
  private tipCard: Card | null = null;
  vendings: Vending[] = [];
  /** 아이템 조합기 (한 대에 한 번) */
  combiners: { x: number; y: number; sprite: Phaser.GameObjects.Image; used: boolean }[] = [];
  /** 지금 열린 조합기 */
  private activeCombiner: LootInteract['combiners'][number] | null = null;
  potions: Phaser.GameObjects.Image[] = [];
  /** 포탈·자판기 앞에 뜨는 조작 안내 */
  interactPrompt: Phaser.GameObjects.Text | null = null;
  /** 아직 보여주지 않은 아이템 획득 창 */
  itemGets: ItemGet[] = [];
  interactKind: 'weapon' | 'chest' | 'merchant' | 'vending' | 'portal' | 'statue' | 'combiner' | null = null;
  /** 상자·드롭 무기 시드 순번 */
  lootSeq = 0;

  constructor(private readonly run: RunScene) {}

  nearestFloorWeapon(): FloorWeapon | null {
    const r = this.run.ctx.data.pickups.interactRadius;
    let best: FloorWeapon | null = null;
    let bestD = r;
    for (const fw of this.floorWeapons) {
      const dist = Math.hypot(fw.x - this.run.player.x, fw.y - this.run.player.y);
      if (dist <= bestD) {
        best = fw;
        bestD = dist;
      }
    }
    return best;
  }

  nearChest(): Chest | null {
    return this.run.nearest(
      this.chests.filter((c) => !c.opened),
      this.run.ctx.data.loot.chest.openRadius,
    );
  }

  nearStand(): MerchantStand | null {
    return this.run.nearest(
      this.stands.filter((s) => !s.stock.sold),
      this.run.ctx.data.pickups.interactRadius,
    );
  }

  nearCardStand(): CardStand | null {
    return this.run.nearest(
      this.cardStands.filter((s) => !s.stock.sold),
      this.run.ctx.data.pickups.interactRadius,
    );
  }

  /** 스킬 상점: 뽑아 둔 카드를 진열한다 */
  openCardShop(cards: readonly Card[], c: { x: number; y: number }): void {
    const d = this.run.ctx.data;
    const stock = cardStock(cards, d.loot);
    stock.forEach((s, i) => {
      const x = c.x + (i - (stock.length - 1) / 2) * d.loot.standSpacing;
      const view = describeCard(s.card, this.run.session.player, this.run.ctx);
      const icon = artKeys.skillIcon(s.card.skillId);
      const label = `${view.name}\n${this.run.ctx.t('merchant.price', { price: s.price })}`;
      this.cardStands.push(new CardStand(this.run, s, d.loot.merchantStand, icon, d.loot.cardStandIconPx, x, c.y, label, view.accent));
    });
  }

  private buyCard(stand: CardStand): void {
    const t = this.run.ctx.t;
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const { card, price } = stand.stock;
    if (!cardStillValid(card, p.loadout, d.skills)) {
      this.run.toastThrottled(t('shop.stale'));
      return;
    }
    if (p.coins < price) {
      this.run.toastThrottled(t('merchant.noCoins'));
      return;
    }
    p.coins -= price;
    const name = describeCard(card, p, this.run.ctx).name;
    stand.markSold(t('merchant.sold'));
    bus.emit('toast', { text: t('shop.bought', { name }) });
    this.run.progression.grantCard(card, () => {
      this.run.skillRt.refreshSkillView();
      bus.emit('inventoryChanged', {});
    });
  }

  /** 무기 이름 (일반이 아니면 등급을 앞에) */
  weaponName(item: WeaponItem): string {
    const t = this.run.ctx.t;
    const name = t(this.run.weaponDefOf(item.defId).nameKey);
    return item.grade === 'common' ? name : `${t(`grade.${item.grade}`)} ${name}`;
  }

  gradeColor(grade: GradeId): string {
    return this.run.ctx.data.groupMultipliers.grades.find((g) => g.id === grade)?.color ?? '#ffffff';
  }

  /** 바닥에 무기를 놓는다 (상자·드롭·버린 무기) */
  dropWeapon(item: WeaponItem, x: number, y: number): void {
    const def = this.run.weaponDefOf(item.defId);
    this.floorWeapons.push(new FloorWeapon(this.run, item, def.spriteKey, x, y, item.grade === 'common' ? null : this.gradeColor(item.grade)));
  }

  /** 인벤토리에서 무기 버리기: 발밑에 떨어뜨린다 (마지막 무기를 버리면 맨손) */
  dropFromSlot(slot: 0 | 1): void {
    const p = this.run.session.player;
    const r = dropWeaponAt(p.weapons, slot);
    if (!r.dropped) return;
    p.weapons = r.slots;
    this.dropWeapon(r.dropped, this.run.player.x, this.run.player.y + 10);
    this.run.combat.fireCooldown = 0;
    this.run.combat.resetCharge();
    bus.emit('toast', { text: this.run.ctx.t('inventory.dropped', { weapon: this.weaponName(r.dropped) }) });
    bus.emit('inventoryChanged', {});
  }

  /** 손에 든다. 슬롯이 차 있으면 들고 있던 무기를 그 자리에 버린다 */
  takeWeapon(item: WeaponItem, x: number, y: number): void {
    const p = this.run.session.player;
    const { slots, dropped } = pickUpWeapon(p.weapons, item);
    p.weapons = slots;
    this.run.discover('weapons', item.defId);
    if (dropped) this.dropWeapon(dropped, x, y);
    this.run.combat.fireCooldown = 0;
    this.run.combat.resetCharge();
    this.checkWeaponSet();
  }

  /** 무기 세트: 재료 무기를 들고 재료 아이템을 가졌으면 그 슬롯의 무기가 결과물로 바뀐다 */
  private checkWeaponSet(): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const ready = readyWeaponSet(p.weapons.slots, p.items, d.items.weaponSets);
    if (!ready) return;
    const { set, slot } = ready;
    const slots: typeof p.weapons.slots = [...p.weapons.slots];
    slots[slot] = plainWeapon(this.run.weaponDefOf(set.result));
    this.run.discover('weapons', set.result);
    p.weapons = { ...p.weapons, slots };
    p.items = p.items.filter((x) => x !== set.item);
    this.run.combat.fireCooldown = 0;
    this.run.combat.resetCharge();
    this.run.itemRt.refresh();
    const itemDef = d.items.items.find((x) => x.id === set.item)!;
    const weaponDef = this.run.weaponDefOf(set.weapon);
    this.itemGets.push({
      itemId: set.result,
      set: true,
      weapon: true,
      from: [
        { key: weaponDef.spriteKey, color: weaponDef.color },
        { key: itemDef.spriteKey, color: itemDef.color },
      ],
    });
  }

  rollWeaponItem(weights: Partial<Record<GradeId, number>>, label: string, exclude: readonly string[] = []): WeaponItem {
    const d = this.run.ctx.data;
    const rng = Rng.derive(this.run.ctx.config.seed, `${label}-${this.run.session.stage.chapter}-${this.run.session.stage.stage}-${this.lootSeq++}`);
    const grade = rollGrade(rng, weights, d.loot.mythicChance);
    return rollWeapon(rng, grade, d.weapons.weapons, d.weapons.options, d.groupMultipliers, d.loot.uniqueWeaponFallback, exclude);
  }

  interact(): void {
    const t = this.run.ctx.t;
    const fw = this.nearestFloorWeapon();
    if (fw) {
      this.floorWeapons = this.floorWeapons.filter((x) => x !== fw);
      const { x, y } = fw;
      fw.destroy();
      this.takeWeapon(fw.item, x, y);
      bus.emit('toast', { text: t('room.pickedUp', { weapon: this.weaponName(fw.item) }) });
      return;
    }
    const chest = this.nearChest();
    if (chest) {
      this.openChest(chest);
      return;
    }
    const stand = this.nearStand();
    if (stand) {
      const p = this.run.session.player;
      if (!canBuy(p.coins, stand.stock)) {
        this.run.toastThrottled(t('merchant.noCoins'));
        return;
      }
      p.coins -= stand.stock.price;
      stand.markSold(t('merchant.sold'));
      this.takeWeapon(stand.stock.weapon, stand.x, stand.y + 14);
      bus.emit('toast', { text: t('merchant.bought', { weapon: this.weaponName(stand.stock.weapon) }) });
      return;
    }
    const cardStand = this.nearCardStand();
    if (cardStand) {
      this.buyCard(cardStand);
      return;
    }
    const nearStatue = this.run.roomProps.nearStatue();
    if (nearStatue && !this.nearVending()) {
      this.run.roomProps.useStatue(nearStatue);
      return;
    }
    const vending = this.nearVending();
    if (vending) {
      this.buyPotion(vending);
      return;
    }
    const combiner = this.nearCombiner();
    if (combiner) {
      this.openCombiner(combiner);
      return;
    }
    if (this.nearPortal()) this.run.nextStage();
  }

  /** 아이템 조합기를 방 가운데에 놓는다 */
  addCombiner(x: number, y: number): void {
    const ref = this.run.ctx.data.loot.combiner;
    const sprite = this.run.add.image(x, y, ref.spriteKey).setDepth(2);
    fitArt(this.run.ctx.data, sprite, ref.size, ref.height ?? ref.size);
    this.run.tweens.add({ targets: sprite, y: y - 2, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.combiners.push({ x, y, sprite, used: false });
  }

  nearCombiner(): LootInteract['combiners'][number] | null {
    return this.run.nearest(
      this.combiners.filter((c) => !c.used),
      this.run.ctx.data.pickups.interactRadius + this.run.ctx.data.loot.combiner.size / 2,
    );
  }

  private openCombiner(c: LootInteract['combiners'][number]): void {
    const p = this.run.session.player;
    this.activeCombiner = c;
    this.run.setModal('combiner');
    bus.emit('combinerShow', { items: combinableItems(p.items, this.run.ctx.data.items, new Set(p.itemsObtained)) });
  }

  closeCombiner(): void {
    this.activeCombiner = null;
    if (this.run.modal === 'combiner') this.run.setModal(null);
  }

  /** 같은 등급 두 아이템을 넣어 한 등급 위 아이템 하나를 얻는다 (넣은 아이템은 사라진다) */
  combine(a: string, b: string): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const c = this.activeCombiner;
    const da = d.items.items.find((x) => x.id === a);
    const db = d.items.items.find((x) => x.id === b);
    const to = da ? combineGrade(da.grade) : null;
    const obtained = new Set(p.itemsObtained);
    if (!c || c.used || !da || !db || a === b || da.grade !== db.grade || !to || !p.items.includes(a) || !p.items.includes(b)) return;
    const pool = combineCandidates(to, d.items, obtained);
    if (pool.length === 0) return;
    const { stage } = this.run.session;
    const rng = Rng.derive(this.run.ctx.config.seed, `combine-${stage.chapter}-${stage.stage}-${this.lootSeq++}`);
    p.items = p.items.filter((x) => x !== a && x !== b);
    this.run.itemRt.refresh();
    c.used = true;
    this.run.tweens.killTweensOf(c.sprite);
    c.sprite.setAlpha(0.45);
    this.closeCombiner();
    sfx('warp');
    this.giveItem(rng.pick(pool));
    this.run.progression.checkAwakenings();
    bus.emit('inventoryChanged', {});
  }

  openChest(chest: Chest): void {
    chest.open();
    if (chest.kind === 'weapon') {
      // 히든보스 전용 무기는 정해진 유니크 (무작위 옵션 없음)
      const item = chest.fixedItem ? plainWeapon(this.run.weaponDefOf(chest.fixedItem)) : this.rollWeaponItem(chest.weights, 'chest', chest.weights === this.run.ctx.data.loot.startChest ? this.run.ctx.data.loot.startChestExclude : []);
      this.dropWeapon(item, chest.x, chest.y + 14);
      return;
    }
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    let id = chest.fixedItem;
    if (!id) {
      const { stage } = this.run.session;
      const rng = Rng.derive(this.run.ctx.config.seed, `item-${stage.chapter}-${stage.stage}-${this.lootSeq++}`);
      const weights = effectiveWeights(chest.weights, p.lootShift);
      id = rollItem(rng, weights, d.loot.mythicChance, d.items, new Set(p.itemsObtained)) ?? undefined;
    }
    if (id) {
      this.giveItem(id);
      this.run.progression.checkAwakenings();
    }
  }

  /** 아이템 획득: 확률 이전 → 세트 합성 → 획득 카드 */
  giveItem(id: string): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const def = d.items.items.find((x) => x.id === id);
    if (!def || p.itemsObtained.includes(id)) return;
    p.items = [...p.items, id];
    p.itemsObtained = [...p.itemsObtained, id];
    this.run.discover('items', id);
    if (def.pool === 'normal') p.lootShift = transferWeight(p.lootShift, def.grade, d.items.transferPerPickup);
    this.itemGets.push({ itemId: id, set: false });
    // 세트: 재료가 모이면 자동 합성, 재료 효과는 사라지고 다시 나오지 않는다
    const set = readySet(new Set(p.items), new Set(p.itemsObtained), d.items.sets);
    if (set) {
      p.items = [...p.items.filter((x) => !set.materials.includes(x)), set.result];
      p.itemsObtained = [...p.itemsObtained, set.result];
      this.run.discover('items', set.result);
      const from = set.materials.map((m) => d.items.items.find((x) => x.id === m)!).map((m) => ({ key: m.spriteKey, color: m.color }));
      this.itemGets.push({ itemId: set.result, set: true, from });
    }
    this.run.itemRt.refresh();
    this.checkWeaponSet();
  }

  /** ref·nameKey가 없으면 시작 무기 상자 / 아이템 상자 모습 */
  addChest(kind: ChestKind, x: number, y: number, weights: Partial<Record<GradeId, number>>, opts: { fixedItem?: string; ref?: SpriteRef; nameKey?: string } = {}): void {
    const c = this.run.ctx.data.loot.chest;
    const ref = opts.ref ?? (kind === 'weapon' ? c.weapon : c.item);
    this.chests.push(new Chest(this.run, kind, ref, x, y, weights, opts.fixedItem, opts.nameKey ?? (kind === 'weapon' ? 'chest.weapon' : 'chest.item')));
  }

  /** 보스·히든보스 무기 상자 */
  addBossChest(x: number, y: number, weights: Partial<Record<GradeId, number>>, fixedItem?: string): void {
    this.addChest('weapon', x, y, weights, { fixedItem, ref: this.run.ctx.data.loot.chest.boss, nameKey: 'chest.weapon.boss' });
  }

  /** 전투에서 떨어지는 무기 상자: 챕터 표로 등급을 정한다 (습격은 전설 상자 확률을 더한다) */
  addCombatChest(x: number, y: number, label: string, legendaryChance = 0): void {
    const d = this.run.ctx.data.loot;
    const { stage } = this.run.session;
    const rng = Rng.derive(this.run.ctx.config.seed, `${label}-tier-${stage.chapter}-${stage.stage}-${this.lootSeq++}`);
    const tier = d.weaponChestTiers[rollChestTier(rng, chapterWeights(d.combatChestTiers, stage.chapter), legendaryChance)];
    this.addChest('weapon', x, y, tier.weights, { ref: tier.sprite, nameKey: tier.nameKey });
  }

  updateInteractHint(): void {
    // 앞에 있는 무기의 정보를 화면 아래에
    const tip = this.nearestFloorWeapon()?.item ?? this.nearStand()?.stock.weapon ?? null;
    if (tip !== this.tipItem) {
      this.tipItem = tip;
      bus.emit('weaponTip', { item: tip });
    }
    const cardTip = this.nearCardStand()?.stock.card ?? null;
    if (cardTip !== this.tipCard) {
      this.tipCard = cardTip;
      bus.emit('cardTip', { card: cardTip });
    }
    const vending = this.nearVending();
    const portal = this.nearPortal();
    const statue = this.run.roomProps.nearStatue();
    const chest = this.nearChest();
    const combiner = this.nearCombiner();
    const kind = this.nearestFloorWeapon() ? 'weapon' : chest ? 'chest' : this.nearStand() || this.nearCardStand() ? 'merchant' : vending ? 'vending' : combiner ? 'combiner' : portal ? 'portal' : statue ? 'statue' : null;
    if (kind !== this.interactKind) this.setInteractHint(kind);
    // 포탈·자판기: 머리 위에 조작 안내
    const at = kind === 'vending' ? vending : kind === 'statue' ? statue : kind === 'portal' ? { x: portal!.sprite.x, y: portal!.sprite.y } : kind === 'chest' ? chest : kind === 'combiner' ? combiner : null;
    if (!at) {
      this.interactPrompt?.setVisible(false);
      return;
    }
    const mode = this.run.ctx.uiMode === 'mobile' ? 'mobile' : 'pc';
    const text = this.run.ctx.t(`interact.${kind}.${mode}`, { price: this.run.ctx.data.mapgen.vending.price, what: statue ? this.run.ctx.t(`statue.${statue.kind}`) : chest ? this.run.ctx.t(chest.nameKey) : '' });
    this.interactPrompt ??= this.run.add.text(0, 0, '', { fontFamily: 'sans-serif', fontSize: '9px', color: '#ffffff', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5, 1).setDepth(9);
    if (this.interactPrompt.text !== text) this.interactPrompt.setText(text);
    this.interactPrompt.setPosition(at.x, at.y - 22).setVisible(true);
  }

  setInteractHint(kind: 'weapon' | 'chest' | 'merchant' | 'vending' | 'portal' | 'statue' | 'combiner' | null): void {
    this.interactKind = kind;
    bus.emit('interactHint', { kind });
  }

  /** 상호작용(F)이 닿는 포탈 */
  nearPortal(): Prop | null {
    if (this.run.leaving) return null;
    const r = this.run.ctx.data.pickups.interactRadius;
    return this.run.portals.find((x) => Math.hypot(x.sprite.x - this.run.player.x, x.sprite.y - this.run.player.y) <= x.radius + r) ?? null;
  }

  nearVending(): Vending | null {
    return this.run.nearest(
      this.vendings.filter((v) => v.stock > 0),
      this.run.ctx.data.pickups.interactRadius + this.run.ctx.data.mapgen.vending.size / 2,
    );
  }

  /** 자판기에서 물약을 뽑는다: 코인을 내면 앞으로 물약이 튀어나온다 */
  buyPotion(m: Vending): void {
    const v = this.run.ctx.data.mapgen.vending;
    const p = this.run.session.player;
    if (p.coins < v.price) {
      this.run.toastThrottled(this.run.ctx.t('merchant.noCoins'));
      return;
    }
    p.coins -= v.price;
    m.stock--;
    sfx('vend');
    this.run.tweens.add({ targets: m.sprite, x: m.x + 1.5, duration: 40, yoyo: true, repeat: 3, onComplete: () => m.sprite.setX(m.x) });
    if (m.stock <= 0) m.sprite.setAlpha(0.45);
    const potion = this.run.add.image(m.x, m.y + 4, v.potion.spriteKey).setDepth(3);
    this.potions.push(potion);
    this.run.tweens.add({ targets: potion, y: m.y + 26, x: m.x + this.run.rng.range(-8, 8), duration: 280, ease: 'Bounce.easeOut' });
  }

  /** 물약 줍기: 체력이 닳아 있을 때 닿으면 회복 */
  updatePotions(): void {
    const v = this.run.ctx.data.mapgen.vending;
    const p = this.run.session.player;
    this.potions = this.potions.filter((img) => {
      if (p.hp >= p.maxHp || Math.hypot(img.x - this.run.player.x, img.y - this.run.player.y) > v.pickupRadius) return true;
      const before = p.hp;
      p.hp = Math.min(p.maxHp, p.hp + p.maxHp * v.healRatio);
      sfx('heal');
      this.run.floatLabel({ x: this.run.player.x, y: this.run.player.y - 8 }, this.run.ctx.t('vending.heal', { n: Math.round(p.hp - before) }), '#7dff9a');
      img.destroy();
      return false;
    });
  }
}

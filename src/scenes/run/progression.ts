/** 진행 창: 카드 보상, 컷씬, 미모사 제미니 대화, 전직, 인벤토리. */
import type { ActionFrame } from '../../core/actions';
import { bus } from '../../core/events';
import { Rng } from '../../core/rng';
import { isSkillImplemented } from '../../skills/registry';
import { applyCard, drawSkillCards, type AnyCard, type Card } from '../../systems/cards';
import { convertSkills, judgeSchool, skillAllowed, topSchools } from '../../systems/advancement';
import { advancementCut, skillAwakeningCut, ultimateAwakeningCut, type Cutscene } from '../../ui/cutscenePages';
import { type RoomNode } from '../../systems/mapgen';
import { registerCutscene, registerGemini } from '../../core/save';
import { hasLines, MiniQueue, pickMini, saidKeys, storyFor } from '../../systems/gemini';
import { chapterWeights, effectiveWeights, itemChoices } from '../../systems/items';
import { awakenSkill, awakeningReady, equipSkill, findSkill, skillValues } from '../../systems/skills';
import { roomCenter } from '../../systems/worldLayout';
import type { GeminiEventId, SchoolId } from '../../types/data';
import type { RunScene } from '../RunScene';
import { SKILL_ACTIONS, sfx, type Offer } from './shared';

export class Progression {
  /** 이번 카드창에서 리롤을 썼는지 */
  rerolled = false;
  currentOffer: Offer | null = null;
  offerQueue: Offer[] = [];
  afterOffers: (() => void)[] = [];
  currentCards: AnyCard[] | null = null;
  /** 컷인 → 설명창 대기열과 다 본 뒤 할 일 */
  /** 미모사 제미니 미니 대사 순서, 스토리 대화가 끝난 뒤 할 일 */
  mini!: MiniQueue;
  storyThen: (() => void) | null = null;
  cutQueue: Cutscene[] = [];
  afterCuts: (() => void) | null = null;
  cardSeq = 0;
  /** 학파 선택 카드를 고른 뒤 전직을 마치고 할 일 */
  pendingAdvance: (() => void) | null = null;

  constructor(private readonly run: RunScene) {}

  updateModal(frame: ActionFrame): void {
    if (this.run.modal === 'cards') {
      // PC: 1/2/3 키로 바로 고른다 (숫자키는 skill1~3 명령으로 들어온다)
      SKILL_ACTIONS.forEach((action, i) => {
        if (frame.pressed.has(action) && this.run.ctx.uiMode === 'pc') this.pickCard(i);
      });
    } else if (this.run.modal === 'inventory') {
      if (frame.pressed.has('inventory') || frame.pressed.has('pause')) this.closeInventory();
    } else if (this.run.modal === 'pause') {
      if (frame.pressed.has('pause')) this.run.setModal(null);
    } else if (this.run.modal === 'combiner') {
      if (frame.pressed.has('pause')) this.run.loot.closeCombiner();
    }
  }

  /** 카드를 차례로 띄운다. 다 고르면 then을 부른다 */
  queueOffers(offers: Offer[], then?: () => void): void {
    this.offerQueue.push(...offers);
    if (then) this.afterOffers.push(then);
    if (this.run.modal === null) this.openNextCards();
  }

  openNextCards(): void {
    const next = this.offerQueue.shift();
    if (!next) {
      this.currentCards = null;
      if (this.run.modal === 'cards') this.run.setModal(null);
      const calls = this.afterOffers;
      this.afterOffers = [];
      for (const f of calls) f();
      return;
    }
    this.currentOffer = next;
    this.rerolled = false;
    this.showCards();
  }

  /** 지금 카드창(currentOffer)의 카드를 뽑아 띄운다. 리롤도 이걸 다시 부른다 */
  showCards(): void {
    const next = this.currentOffer!;
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const { stage } = this.run.session;
    const rng = Rng.derive(this.run.ctx.config.seed, `cards-${stage.chapter}-${stage.stage}-${this.cardSeq++}`);
    if (next.kind === 'school') {
      // 학파 선택 카드(전직 동점): 리롤 없음
      const cards = (next.schools ?? []).map((school) => ({ kind: 'school' as const, school }));
      this.currentCards = cards;
      this.run.setModal('cards');
      bus.emit('cardsShow', { titleKey: 'card.title.school', cards, reroll: null });
      return;
    }
    const cards: AnyCard[] = next.kind === 'skill' ? this.drawSkills(rng) : this.drawItems(rng);
    // 고를 것이 없으면(스킬 만렙·아이템 소진) 건너뛴다
    if (cards.length === 0) {
      this.openNextCards();
      return;
    }
    this.currentCards = cards;
    this.run.setModal('cards');
    const cost = d.cards.rerollCost;
    bus.emit('cardsShow', {
      titleKey: next.boss ? 'card.title.boss' : next.spire ? 'card.title.spire' : `card.title.${next.kind}`,
      cards,
      reroll: { cost, enabled: !this.rerolled && p.coins >= cost, used: this.rerolled },
    });
  }

  private drawSkills(rng: Rng): Card[] {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    return drawSkillCards(rng, p.loadout, d.skills, d.cards, (id) => isSkillImplemented(id) && skillAllowed(findSkill(d.skills, id), p.advancement));
  }

  /** 아이템 카드: 보물 상자와 같은 가중치 */
  private drawItems(rng: Rng): AnyCard[] {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const weights = effectiveWeights(chapterWeights(d.items.treasureWeights, this.run.session.stage.chapter), p.lootShift);
    return itemChoices(rng, weights, d.loot.mythicChance, d.items, new Set(p.itemsObtained), d.cards.cardCount).map((itemId) => ({ kind: 'item', itemId }));
  }

  /** 상점 진열: 카드 보상과 같은 규칙으로 뽑는다 */
  drawShopCards(rng: Rng): Card[] {
    return this.drawSkills(rng).slice(0, this.run.ctx.data.loot.skillShop.count);
  }

  /** 각성 조건(Lv3 + 아이템)을 채운 스킬·궁극기를 각성시키고 연출을 돌려준다 */
  private collectAwakenings(): Cutscene[] {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const cuts: Cutscene[] = [];
    for (const id of awakeningReady(p.loadout, d.skills, p.items)) {
      p.loadout = awakenSkill(p.loadout, id);
      cuts.push(skillAwakeningCut(this.run.ctx, id));
    }
    const u = this.checkUltimateAwakening();
    if (u) cuts.push(u);
    if (cuts.length > 0) {
      this.run.skillRt.refreshSkillView();
      bus.emit('inventoryChanged', {});
    }
    return cuts;
  }

  /** 스킬 레벨이나 아이템이 바뀐 뒤: 각성할 것이 있으면 연출을 보여 주고 then */
  checkAwakenings(then: () => void = () => {}): void {
    this.playCutscenes(this.collectAwakenings(), then);
  }

  /** 카드 보상을 받는다 (상점 구매도 같다). 각성하면 연출을 다 본 뒤 then */
  grantCard(card: Card, then: () => void): void {
    const d = this.run.ctx.data;
    const t = this.run.ctx.t;
    const r = applyCard(this.run.session.player, card, { skills: d.skills });
    this.run.session.player = r.holder;
    const def = findSkill(d.skills, card.skillId);
    const owned = r.holder.loadout.owned[card.skillId]!;
    const skill = t(def.nameKey);
    if (card.kind === 'skillNew') bus.emit('toast', { text: t('skillMsg.acquired', { skill }) });
    else bus.emit('toast', { text: t('skillMsg.levelUp', { skill, level: owned.level }) });
    if (r.stored) bus.emit('storedNotice', { skillId: card.skillId });
    this.checkAwakenings(then);
  }

  /** 카드창마다 1회, 코인으로 다시 뽑기 */
  rerollCards(): void {
    const p = this.run.session.player;
    const cost = this.run.ctx.data.cards.rerollCost;
    if (this.run.modal !== 'cards' || this.rerolled || !this.currentOffer || this.currentOffer.kind === 'school' || p.coins < cost) return;
    p.coins -= cost;
    this.rerolled = true;
    this.showCards();
  }

  pickCard(index: number): void {
    const card = this.currentCards?.[index];
    if (!card || this.run.modal !== 'cards') return;
    sfx('cardPick');
    if (card.kind === 'item') {
      this.run.loot.giveItem(card.itemId);
      this.checkAwakenings(() => this.openNextCards());
      return;
    }
    if (card.kind === 'school') {
      const then = this.pendingAdvance ?? (() => {});
      this.pendingAdvance = null;
      this.advanceTo(card.school, () => {
        this.openNextCards();
        then();
      });
      return;
    }
    this.grantCard(card, () => this.openNextCards());
  }

  /** 컷인 → 설명창을 차례로 보여 주고, 다 넘기면 then */
  playCutscenes(list: Cutscene[], then: () => void): void {
    if (list.length === 0) {
      then();
      return;
    }
    this.cutQueue = [...list];
    this.afterCuts = then;
    this.showNextCut();
  }

  showNextCut(): void {
    const next = this.cutQueue.shift();
    if (!next) {
      const f = this.afterCuts;
      this.afterCuts = null;
      if (this.run.modal === 'cutscene') this.run.setModal(null);
      f?.();
      return;
    }
    // 현재의 기억: 처음 본 컷씬은 다시보기용으로 저장
    const save = this.run.ctx.save;
    if (registerCutscene(save.data, next.id, next.cut, next.pages)) {
      this.run.session.player.record.newCutscenes.push(next.id);
      save.write();
    }
    this.run.setModal('cutscene');
    sfx('awaken');
    bus.emit('cutsceneShow', next);
  }

  /** 미니 대사: 이벤트에 맞는 대사를 골라 순서에 넣는다 (같은 런 반복 없음, 빈 대사는 건너뜀). 복선 대사는 현재의 기억에 */
  say(event: GeminiEventId, arg?: string): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const rng = Rng.derive(this.run.ctx.config.seed, `gemini-${event}-${arg ?? ''}-${p.geminiSaid.length}`);
    const pick = pickMini(d.gemini, event, arg, new Set(p.geminiSaid), rng, d.text);
    if (!pick) return;
    p.geminiSaid = [...p.geminiSaid, ...saidKeys(event, arg, pick)];
    this.mini.push(
      pick.lines.map((k) => ({ text: this.run.ctx.t(k), mood: pick.def.mood })),
      pick.def.priority,
    );
    if (pick.def.record && registerGemini(this.run.ctx.save.data, `gemini.${pick.def.id}`, pick.lines)) this.run.ctx.save.write();
  }

  /** 일반 스토리 대화: 게임을 멈추고 띄운 뒤 then. 정해진 대화가 없거나 내용이 비어 있으면 바로 then */
  playStory(event: GeminiEventId, arg: string | undefined, then: () => void): void {
    const d = this.run.ctx.data;
    const story = storyFor(d.gemini, event, arg);
    if (!story || !hasLines(story.lines, d.text)) {
      then();
      return;
    }
    if (registerGemini(this.run.ctx.save.data, `gemini.${story.id}`, story.lines)) this.run.ctx.save.write();
    this.storyThen = then;
    this.run.setModal('story');
    bus.emit('storyShow', { lines: story.lines.map((k) => this.run.ctx.t(k)) });
  }

  finishStory(): void {
    if (this.run.modal !== 'story') return;
    this.run.setModal(null);
    const f = this.storyThen;
    this.storyThen = null;
    f?.();
  }

  /** 요구 아이템이 있으면 학파 궁극기를 자동 각성한다. 이번에 각성했으면 연출을 돌려준다 */
  checkUltimateAwakening(): Cutscene | null {
    const p = this.run.session.player;
    const def = this.run.skillRt.ultimateDef();
    if (p.ultimate.awakened || !def.awakening || !def.school || p.advancement !== def.school) return null;
    if (!p.items.includes(def.awakening.requiredItem)) return null;
    p.ultimate.awakened = true;
    return ultimateAwakeningCut(this.run.ctx, def);
  }

  /** 보스방 카드 뒤: 챕터1 마지막 보스면 전직, 그다음 포털 */
  afterBossRoom(node: RoomNode): void {
    const d = this.run.ctx.data;
    const { stage } = this.run.session;
    const last = stage.stage === d.mapgen.stagesPerChapter && stage.chapter === d.jobs.advanceAfterChapter;
    // 보스 처치: 보스 보물 상자 1 + 보스 무기 상자 1 확정 (포털 양옆)
    const c = roomCenter(node, this.run.m);
    const bossId = d.bosses.bosses.find((b) => b.chapter === stage.chapter && b.stage === stage.stage)?.id;
    // 전용 아이템이 아직 남아 있으면 보물 상자에서 그 아이템 확정
    const bossItem = d.items.items.find((x) => x.pool === 'boss' && x.bossId === bossId && !this.run.session.player.itemsObtained.includes(x.id));
    // 전용 무기가 있으면 bossWeaponChance(20%)로 그 무기, 아니면 보스 무기 상자 가중치
    const bossWeapon = d.weapons.weapons.find((w) => w.bossId === bossId);
    const unique = !!bossWeapon && Rng.derive(this.run.ctx.config.seed, `boss-weapon-${stage.chapter}-${stage.stage}`).chance(d.loot.bossWeaponChance);
    const reward = () => {
      this.run.world.addPortal(node);
      this.run.loot.addChest('item', c.x - 40, c.y, d.loot.bossItemChest, { fixedItem: bossItem?.id, ref: d.loot.chest.bossItem, nameKey: 'chest.item.boss' });
      this.run.loot.addBossChest(c.x + 40, c.y, d.loot.bossWeaponChest, unique ? bossWeapon!.id : undefined);
    };
    if (last && this.run.session.player.advancement === null) this.advance(reward);
    else reward();
  }

  /** 계열 판정. 동점이면 학파 선택 카드(원본 규칙: 플레이어가 직접 고른다) */
  advance(then: () => void): void {
    const p = this.run.session.player;
    const job = this.run.ctx.data.jobs.jobs.find((j) => j.id === p.job)!;
    const order = job.advancements.map((a) => a.id as SchoolId);
    const school = judgeSchool(p.schoolPicks, order);
    if (school) {
      this.advanceTo(school, then);
      return;
    }
    this.pendingAdvance = then;
    this.queueOffers([{ kind: 'school', boss: false, schools: topSchools(p.schoolPicks, order) }]);
  }

  /** 스킬 변환 → 궁극기 교체 → 연출 */
  advanceTo(school: SchoolId, then: () => void): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const job = d.jobs.jobs.find((j) => j.id === p.job)!;
    const adv = job.advancements.find((a) => a.id === school)!;
    const r = convertSkills(Rng.derive(this.run.ctx.config.seed, 'advancement'), p.loadout, d.skills, school);
    p.loadout = r.loadout;
    const removed = new Set(r.log.removed.map((x) => x.skillId));
    p.cooldowns = Object.fromEntries(Object.entries(p.cooldowns).filter(([id]) => !removed.has(id)));
    for (const o of this.run.skillRt.skillObjects.filter((x) => removed.has(x.owner.split('.')[0]!))) this.run.skillRt.removeObject(o);
    const fromUlt = this.run.skillRt.ultimateDef();
    p.ultimate = { id: adv.ultimate!, gauge: 0, awakened: false };
    p.advancement = school;
    p.advancementLog = r.log;
    this.run.applyPlayerArt();
    const cuts = [advancementCut(this.run.ctx, { jobNameKey: job.nameKey, adv, picks: p.schoolPicks, fromUlt, toUlt: this.run.skillRt.ultimateDef(), log: r.log }), ...this.collectAwakenings()];
    this.run.skillRt.refreshSkillView();
    bus.emit('inventoryChanged', {});
    this.playCutscenes(cuts, () => {
      this.say('advancement', school);
      then();
    });
  }

  openInventory(): void {
    if (this.run.modal || this.run.session.outcome) return;
    this.run.setModal('inventory');
  }

  closeInventory(): void {
    if (this.run.modal === 'inventory') this.run.setModal(null);
  }

  equip(skillId: string, target: number | 'passive'): void {
    const d = this.run.ctx.data;
    const p = this.run.session.player;
    const r = equipSkill(p.loadout, skillId, target, d.skills);
    p.loadout = r.loadout;
    // 보관함에서 꺼낸 스킬은 쿨타임이 처음부터 돈다
    for (const id of r.restarted) {
      const sv = skillValues(findSkill(d.skills, id), p.loadout.owned[id]!);
      if (sv.cooldownSec > 0) p.cooldowns = { ...p.cooldowns, [id]: this.run.skillRt.cooldownOf(sv.cooldownSec) };
    }
    this.run.skillRt.refreshSkillView();
    bus.emit('inventoryChanged', {});
  }
}

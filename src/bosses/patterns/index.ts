/**
 * 보스 패턴 (챕터1~3 보스·히든보스). 같은 동작은 패턴 id만 달리 해 다시 쓴다(예: 마기카이저 기계 펀치 = 악귀 할퀴기). 패턴 id → 실행 객체.
 * 패턴마다 예고 → 위치·방향 고정 → 판정 → 잔류 순서를 지킨다. 패턴이 끝나도 깔아 둔 위험 지대는 끝까지 간다. 수치는 bosses.json의 values(강화 단계는 `키Enraged`).
 * 패턴은 보스를 멈추거나 돌진시키고, 피해는 entities/hazard.ts의 위험 지대·적 탄으로 준다.
 */
import type { PatternRun } from '../host';
import type { PatternCtx } from './base';
import { Intimidate } from './base';
import { Claw, SpiritDash, Eruption, SpiritBurst } from './fusionAkgwi';
import { LightningChase, ShockRipple, SpinBeam, Prison, LockGrid, ShrinkCurrent, CrossCut, ChaseField, BlueDash } from './electricRing';
import { Repulse, DroneFire, Antimatter, RailCross, MineSiege, GapWave, BoltProof, CallTroopers } from './hectarChief';
import { EarthCrush, Bombard, RuinBeam, RuinLegion, BreakerDash, CrustCrack, CollapseZone, DoomFault } from './magiGolem';
import { ShadowChase, AimFan, SafeCircle, GravityCollapse } from './eclipse';
import { HomingMissiles, LineLaser, GroundShock, Geyser, KaiserDash, UnstableLaser, DoomCommand, RedEruption, CrimsonRain, EmperorDescent } from './magiKaiser';
import { WarCry, WhirlDash, BleedField, GroundBreak, EarthShatter, EchoSlash, DeadChain, TombBreak, AncestorsReturn, BlinkBarrage, GreatLaser, Clones, MagiStrike, RoyalMark, PiercingLine, SealEdict, FinalDecree, HolySwords, MaceSmash, ShieldThrow, Judgment, FallingStar, BeltSanctuary, HunterOath, StarHunt } from './hidden';

export type { BossBody, PatternCtx } from './base';

const PATTERNS: Readonly<Record<string, (c: PatternCtx) => PatternRun>> = {
  // 융합악귀
  claw: (c) => new Claw(c),
  spiritDash: (c) => new SpiritDash(c),
  eruption: (c) => new Eruption(c),
  spiritBlast: (c) => new SpiritBurst(c),
  // 전기환띠
  lightningChase: (c) => new LightningChase(c),
  shockRipple: (c) => new ShockRipple(c),
  spinLightning: (c) => new SpinBeam(c),
  prison: (c) => new Prison(c),
  edgeLock: (c) => new LockGrid(c),
  shrinkCurrent: (c) => new ShrinkCurrent(c),
  crossCut: (c) => new CrossCut(c),
  chaseField: (c) => new ChaseField(c),
  blueDash: (c) => new BlueDash(c),
  // 헥타르 수석 연구원
  repulse: (c) => new Repulse(c),
  droneFire: (c) => new DroneFire(c),
  antimatter: (c) => new Antimatter(c),
  railCross: (c) => new RailCross(c),
  mineSiege: (c) => new MineSiege(c),
  vectorField: (c) => new GapWave(c),
  boltProof: (c) => new BoltProof(c),
  callTroopers: (c) => new CallTroopers(c),
  // 마기골렘
  earthCrush: (c) => new EarthCrush(c),
  bombard: (c) => new Bombard(c),
  ruinBeam: (c) => new RuinBeam(c),
  breakerDash: (c) => new BreakerDash(c),
  ruinLegion: (c) => new RuinLegion(c),
  crustCrack: (c) => new CrustCrack(c),
  collapseZone: (c) => new CollapseZone(c),
  doomFault: (c) => new DoomFault(c),
  golemIntimidate: (c) => new Intimidate(c),
  // 식광
  sunspotFall: (c) => new Bombard(c),
  orbitCut: (c) => new AimFan(c),
  shadowChase: (c) => new ShadowChase(c),
  eclipseShards: (c) => new AimFan(c),
  wideErosion: (c) => new SafeCircle(c),
  gravityCollapse: (c) => new GravityCollapse(c),
  totalEclipse: (c) => new SafeCircle(c),
  // 마기카이저
  lineLaser: (c) => new LineLaser(c),
  groundShock: (c) => new GroundShock(c),
  homingMissiles: (c) => new HomingMissiles(c),
  redBarrage: (c) => new AimFan(c),
  geyser: (c) => new Geyser(c),
  kaiserPunch: (c) => new Claw(c),
  kaiserDash: (c) => new KaiserDash(c),
  spinLaser: (c) => new SpinBeam(c),
  unstableLaser: (c) => new UnstableLaser(c),
  kaiserIntimidate: (c) => new Intimidate(c),
  doomCommand: (c) => new DoomCommand(c),
  redChase: (c) => new ChaseField(c),
  redFault: (c) => new DoomFault(c),
  redSunspots: (c) => new Bombard(c),
  redEruption: (c) => new RedEruption(c),
  crimsonRain: (c) => new CrimsonRain(c),
  emperorDescent: (c) => new EmperorDescent(c),
  // 히든보스
  warCry: (c) => new WarCry(c),
  whirlDash: (c) => new WhirlDash(c),
  bleedField: (c) => new BleedField(c),
  groundBreak: (c) => new GroundBreak(c),
  earthShatter: (c) => new EarthShatter(c),
  blinkBarrage: (c) => new BlinkBarrage(c),
  greatLaser: (c) => new GreatLaser(c),
  clones: (c) => new Clones(c),
  magiStrike: (c) => new MagiStrike(c),
  holySwords: (c) => new HolySwords(c),
  maceSmash: (c) => new MaceSmash(c),
  shieldThrow: (c) => new ShieldThrow(c),
  judgment: (c) => new Judgment(c),
  echoSlash: (c) => new EchoSlash(c),
  deadChain: (c) => new DeadChain(c),
  tombBreak: (c) => new TombBreak(c),
  ancestorsReturn: (c) => new AncestorsReturn(c),
  royalMark: (c) => new RoyalMark(c),
  piercingLine: (c) => new PiercingLine(c),
  sealEdict: (c) => new SealEdict(c),
  finalDecree: (c) => new FinalDecree(c),
  fallingStar: (c) => new FallingStar(c),
  beltSanctuary: (c) => new BeltSanctuary(c),
  hunterOath: (c) => new HunterOath(c),
  starHunt: (c) => new StarHunt(c),
};

export function makePattern(id: string, c: PatternCtx): PatternRun | null {
  return PATTERNS[id]?.(c) ?? null;
}

export const BOSS_PATTERN_IDS = Object.keys(PATTERNS);

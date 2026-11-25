import type { IntRange, SpriteRef } from './common';

// ---------- 도트 아트 ----------

/**
 * 그림 기준점. center: 그림 가운데가 판정 가운데 / feet: 판정이 그림 아래쪽에 붙는다(키 큰 캐릭터를 발밑 기준으로).
 * 그림이 판정과 같은 크기면 둘은 같다.
 */
export type ArtAnchor = 'center' | 'feet';

/** spriteKey 하나의 그림: PNG 한 장, 프레임은 가로로 이어 붙인다 */
export interface ArtSpriteDef {
  /** basePath 아래 파일 경로 */
  file: string;
  frameWidth: number;
  frameHeight: number;
  /** 프레임 수 (없으면 1) */
  frames?: number;
  /** 돌아가는 머리(포탑): 회전 중심, 받침 위 높이, 그림의 기울기, 총구까지 거리 */
  aim?: { pivotX: number; pivotY: number; mountY: number; tiltDeg: number; muzzlePx: number };
  /** 게임 1px에 들어간 그림 픽셀 수 (없으면 1). 크면 도트가 작게 보인다 */
  density?: number;
  /** 무기: 손에 쥐는 가로 위치 0~1 (없으면 가운데) */
  gripX?: number;
  /** 없으면 그림 종류별 기본값 (캐릭터·오브젝트는 feet, 탄·픽업·스킬·무기는 center) */
  anchor?: ArtAnchor;
  /** 프레임 애니메이션 (플레이어·적): 멈춰 있을 때 idle, 움직일 때 move. 없으면 첫 프레임 그대로 */
  anims?: Partial<Record<ArtAnimId, ArtAnimDef>>;
  /** 그림이 바라보는 방향 (없으면 오른쪽). 움직이는 방향에 따라 좌우로 뒤집는다 */
  facing?: 'right' | 'left';
}

/** idle·move·play·aim 또는 보스 자세 이름 */
export type ArtAnimId = string;

/** 프레임 번호 from~to(0부터, 둘 다 포함)를 초당 fps장으로 반복 */
export interface ArtAnimDef {
  from: number;
  to: number;
  fps: number;
  /** false면 한 번만 (없으면 반복) */
  loop?: boolean;
}

export interface ArtData {
  /** public/ 아래 그림 폴더 */
  basePath: string;
  /** spriteKey → 그림. 적혀 있지 않은 키는 색 사각형 */
  sprites: Record<string, ArtSpriteDef>;
}

// ---------- 타격감·연출 ----------

export type ShakeLevel = 'light' | 'medium' | 'heavy' | 'rumble';

export interface StatusLookDef {
  tint: string;
  colors: string[];
  particleEverySec: number;
  particleLifeSec: number;
  particleMovePx: number;
}

export interface JuiceData {
  /** 피해 숫자 (동시 max개, riseSec 동안 risePx 위로) */
  damageNumbers: {
    enabled: boolean;
    max: number;
    riseSec: number;
    risePx: number;
    spreadPx: number;
    fontSize: number;
    critFontSize: number;
    bossFontScale: number;
    colors: Record<'normal' | 'crit' | 'space' | 'dot', string>;
  };
  /** 맞으면 squash만큼 찌그러졌다 squashSec에 돌아온다 */
  hitFlash: { squash: number; squashSec: number };
  /** 맞은 자리 불꽃 (태그 색), fx 그림은 fxSec 동안 */
  sparks: { count: IntRange; speed: [number, number]; lifeSec: number; size: number; fxSec: number; colors: Record<'physical' | 'magic' | 'tech' | 'default', string> };
  /** 잠깐 멈춤(초). 끝난 뒤 minGapSec 동안은 다시 멈추지 않는다 */
  hitStop: { melee: number; crit: number; eliteKill: number; bossKill: number; minGapSec: number };
  /** 처치: 파편, 번쩍임, 보상 구슬이 튀어 나가는 거리·시간 */
  /** 플레이어 사망 연출 */
  /** 함성 버프(스킬·아이템) 동안 몸에서 피어오르는 불씨와 발밑 고리. itemShoutWidth: 아이템 함성이 걸릴 때 함성 그림 폭 */
  roarAura: { color: string; everySec: number; lifeSec: number; risePx: number; spreadPx: number; size: number; ringRadius: number; ringAlpha: number; pulseSec: number; itemShoutWidth: number };
  playerDeath: { sec: number; zoom: number; flashMs: number; tint: string; shards: number };
  /** 상태이상 겉모습: 화상(주황 물듦·머리 위 불 문양·불씨), 석화(회색·금·깨지는 파편), 처형(X표시) */
  status: {
    /** 화상·출혈: 적 물듦 색(보스는 안 물듦), 문양·입자 색(1 밝은색 2 중간 3 어두운 4 가장 밝은 점), 입자 간격·수명·이동(음수면 위로) */
    burn: StatusLookDef; bleed: StatusLookDef;
    /** 문양: 머리 위 간격, 여러 개일 때 사이 간격, 숫자 배율, 최대 중첩일 때 맥박 폭·입자 배수 */
    markGapPx: number; markRowGapPx: number; markNumberScale: number; markFullPulse: number; markFullParticleMul: number;
    /** 입자 없는 상태이상 문양·숫자 색 (서리·둔화·빙결·기절·석화·묶기·부식) */
    markColors: Record<'frost' | 'chill' | 'freeze' | 'stun' | 'petrify' | 'bind' | 'corruption', string[]>;
    petrifyTint: string; petrifyColors: string[]; petrifyCrackSec: number; shatterShards: number; shatterSpeed: [number, number]; shatterLifeSec: number;
    executeColor: string; executeSec: number; executeSize: number;
    /** 냉기(마기법사 백온파): 빙결·둔화 물듦 색, 적 이동 감속 상한(시선·둔화·한파 합) */
    freezeTint: string; chillTint: string; slowCap: number;
  };
  death: { shards: IntRange; eliteShards: IntRange; shardSpeed: [number, number]; shardLifeSec: number; shardSize: number; flashSec: number; orbPopPx: [number, number]; orbPopSec: number };
  /** 플레이어 피격: 화면 가장자리 붉은 번쩍임, 낮은 체력 맥박 */
  playerHurt: { flashSec: number; flashAlpha: number; lowHpRatio: number; pulseSec: number; pulseAlpha: number; color: string; edgePx: number };
  shake: Record<ShakeLevel, { ms: number; intensity: number }>;
  /** 이펙트 그림 (없으면 도형) */
  /** hazardBlast·hazardSector·hazardBeam: 그림이 따로 없는 적 공격(원·부채꼴·직사각·추적 폭발, 광선)이 터질 때 위험 색으로 물들여 쓰는 픽셀 이펙트 */
  fx: Record<'hitTech' | 'hitMagic' | 'hitPhysical' | 'explosion' | 'eliteBurst' | 'spawn' | 'death' | 'hazardBlast' | 'hazardSector' | 'hazardBeam', SpriteRef>;
  /** 적 소환: 바닥 원(몸 반지름 × ringRadiusMul), 작게(startScale) 아래(risePx)에서 솟아오른다 */
  /**
   * 생성 그림 투사체(마기법사): trailEverySec마다 몸 그림 잔상(ADD, trailAlpha에서 trailFadeSec 동안 trailShrink배로 줄며 사라짐),
   * 아래에 움직이는 픽셀 빛(glowAlpha·몸 폭 × glowScale), 구체는 초당 spinPerSec 라디안 돌고 pulseHz로 ±pulse 맥박.
   * 터지거나 맞힐 때 sparks개 불티(속도 sparkSpeed, sparkLifeSec, sparkSize px)
   */
  projectileLook: {
    trailEverySec: number; trailFadeSec: number; trailAlpha: number; trailShrink: number; glowAlpha: number; glowScale: number;
    spinPerSec: number; pulse: number; pulseHz: number; sparks: number; sparkSpeed: [number, number]; sparkLifeSec: number; sparkSize: number;
    /** 스킬 레벨별 그림 배율(판정과 무관): [Lv1, Lv2, Lv3]. 불티 수에도 곱한다 */
    levelScale: number[];
    /** ringFromLevel 이상이면 맞힘·터짐마다 퍼지는 고리(ringSec, 굵기 ringWidth, 알파 ringAlpha) + 화면 흔들림 ringShake */
    ringFromLevel: number; ringSec: number; ringWidth: number; ringAlpha: number; ringShake: ShakeLevel;
  };
  spawn: { ringColor: string; ringRadiusMul: number; startScale: number; risePx: number };
  /** 보스 등장 컷: 카메라 이동(panSec) → 내려찍기(dropSec, dropHeight) → 이름 띠(nameSec) → 복귀(returnSec) */
  /** zoom: 기본 확대에 곱하는 배율 */
  bossIntro: { panSec: number; dropSec: number; dropHeight: number; nameSec: number; returnSec: number; zoom: number; bandColor: string; bandAlpha: number; nameColor: string; subColor: string };
  /** 보스 체력바: 깎인 만큼 흰 잔상이 trailDelaySec 뒤 초당 trailPerSec(비율)씩 줄어든다 */
  bossBar: { width: number; height: number; y: number; trailDelaySec: number; trailPerSec: number; color: string; trailColor: string; backColor: string; markerColor: string; fontSize: number };
  /** 보스 강화·단계 개방: 번쩍임, 짧은 확대, 화면 가운데 큰 이름 */
  /** 전직 연출: 입자가 모여드는 시간, 입자 수, 터진 뒤 멈춤 */
  advancement: { chargeSec: number; particles: number; burstHoldSec: number };
  /** 전투 시작 띠 */
  combatStart: { sec: number; color: string; size: number; bandPx: number };
  /**
   * 든 무기의 움직임. 총: 뒤로 튕김 / 지팡이: 끝에서 파티클이 번쩍임 / 칼: 휘두르기·찌르기·내려찍기·깃발 흔들기와 잔상.
   * fitInterval: 공격 간격보다 짧게 끝내는 비율 / ghostStepDeg: 잔상을 촘촘히 채우는 각도 간격
   */
  weaponMotion: {
    recoil: { sec: number; minPx: number; maxPx: number; kickDeg: number; refIntervalSec: number };
    staff: { sec: number; px: number; particles: [number, number]; particleSpeed: [number, number]; particleLifeSec: number; particleSize: number; flashPx: number; flashSec: number };
    swing: { sec: number; maxArcDeg: number };
    thrust: { sec: number; px: number };
    smash: { sec: number; fromDeg: number; toDeg: number };
    wave: { sec: number; deg: number };
    /** 차징·흘리는 파티클 간격, 모여드는 거리·시간, 중심 빛 크기 */
    chargeCore: { everySec: number; gatherPx: number; gatherSec: number; glowPx: number };
    fitInterval: number;
    ghostAlpha: number;
    ghostFadeSec: number;
    ghostStepDeg: number;
  };
  /** 포탑이 쏠 때 포신이 뒤로 밀렸다 돌아온다 */
  turretRecoil: { sec: number; px: number; bigPx: number; squash: number };
  /** 마기역장이 생길 때: 입자가 뿜어져 나오며 막이 작게 시작해 몸을 덮는다 */
  /** 탄 테두리 빛: 플레이어 탄·적 탄 색 */
  bulletRim: { player: string; enemy: string; strength: number; distance: number };
  /** 스킬 빛 입자 (실험 병기) */
  skillBurst: { particles: [number, number]; particleSpeed: [number, number]; particleLifeSec: number; particleSize: number; ringRadiusPx: number };
  /** 스킬을 쓸 때 플레이어 둘레 파동 */
  skillCast: { particles: [number, number]; particleSpeed: [number, number]; particleLifeSec: number; particleSize: number; ringRadiusPx: number };
  shieldSpawn: { particles: [number, number]; particleSpeed: [number, number]; particleLifeSec: number; particleSize: number; ringRadiusPx: number; growSec: number; startScale: number; stacks: { bodyAlpha: number }[] };
  bossPhase: { particles: [number, number]; particleSpeed: [number, number]; particleLifeSec: number; particleSize: number; ringRadiusPx: number; flashMs: number; zoom: number; zoomSec: number; bannerSec: number; bannerSize: number };
  /** 보스 처치: slowSec 동안 slowScale 배속에서 점점 원래대로, 연쇄 폭발 */
  bossKill: { slowSec: number; slowScale: number; explosions: number; spreadPx: number; stepSec: number; flashMs: number };
  /** 포탈 이동: 빨려 들어감(suckSec, 확대 zoom배) → 이동 화면(덮기·걷기 시간, 빛줄기 수, 색) → 도착(arriveSec) */
  portal: { suckSec: number; zoom: number; holdSec: number; fadeInSec: number; fadeOutSec: number; arriveSec: number; streaks: number; color: string; bgColor: string };
  /** 방 클리어 글자, 문이 사라지는 시간 */
  roomClear: { sec: number; color: string; size: number; doorFadeSec: number; bandPx: number; particles: [number, number]; particleSpeed: [number, number]; particleLifeSec: number; particleSize: number; ringRadiusPx: number; zoom: number; zoomSec: number };
}

// ---------- 효과음 ----------

/** 소리 한 층: 파형(또는 잡음), 높낮이 시작→끝(Hz), 길이, 크기, 걸러내기, 시작 지연 */
export interface SoundLayer {
  wave: 'sine' | 'square' | 'triangle' | 'sawtooth' | 'noise';
  /** 잡음은 없어도 된다 */
  freq?: [number, number];
  durSec: number;
  volume: number;
  filter?: { type: 'lowpass' | 'highpass' | 'bandpass'; freq: [number, number] };
  delaySec?: number;
}

export interface SoundDef {
  /** 합성 층 (files가 없을 때) */
  layers?: SoundLayer[];
  /** 녹음 파일 (sfxBasePath 기준). 여럿이면 낼 때마다 하나를 고른다 */
  files?: string[];
  /** 파일 소리 음량 (0~1) */
  volume?: number;
  /** 파일 소리의 대략 길이(초): 겹침 제한용 */
  durSec?: number;
  /** 같은 소리를 다시 내기까지 최소 간격(초), 동시에 나는 최대 수 */
  gapSec?: number;
  maxVoices?: number;
}

export interface MusicData {
  /** public/ 아래 음악 폴더 */
  basePath: string;
  /** 곡을 겹쳐 넘기는 시간(초) */
  fadeSec: number;
  labTrack: string;
  runTrack: string;
  /** 챕터 → 보스 곡 id */
  bossTracks: Record<string, string>;
  /** 챕터 → 일반 전투 칸에서 싸우는 동안의 곡 id (없는 챕터는 런 곡) */
  combatTracks: Record<string, string>;
  /** 히든보스와 마주한 동안의 곡 id */
  hiddenBossTrack: string;
  /** 조우 칸에서 싸우는 동안의 곡 id */
  encounterTrack: string;
  /** startSec: 처음 틀 때 이 초부터 (반복은 처음부터) */
  tracks: Record<string, { file: string; volume: number; startSec?: number }>;
}

export interface SoundsData {
  masterVolume: number;
  music: MusicData;
  /** 소리 켜기·끄기 키 (KeyboardEvent.code) */
  muteKey: string;
  defaultGapSec: number;
  defaultMaxVoices: number;
  /** 음 높이 흔들림 비율 */
  pitchJitter: number;
  /** 녹음 효과음 폴더 (public/ 아래) */
  sfxBasePath: string;
  /**
   * 크기·위력에 따라 다른 소리를 내는 묶음: 값(반지름·피해)이 upTo 이하인 첫 단계. 마지막 단계는 upTo 없이 나머지 전부.
   * 예) explosion: 작은 폭발 / 폭발 / 큰 폭발
   */
  tiers: Record<string, { upTo?: number; id: string }[]>;
  sounds: Record<string, SoundDef>;
}

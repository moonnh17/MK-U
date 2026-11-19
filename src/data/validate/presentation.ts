/** 데이터 검증: UI·키 바인딩·타격감·효과음·도트 아트 */
import { collectAssets, validateArt } from '../../systems/art';
import { BUTTON_ACTIONS } from '../../core/actions';
import { HEX_COLOR, checkPositive, checkRange, checkSprite } from './shared';
import type { V } from './shared';

/** UI */
export function validateUi(v: V): void {
  const { d, errors } = v;
  checkPositive(errors, 'ui.baseWidth', d.ui.baseWidth);
  checkPositive(errors, 'ui.baseHeight', d.ui.baseHeight);
  if (!(d.ui.renderScaleMin >= 1 && d.ui.renderScaleMin <= d.ui.renderScaleMax && d.ui.renderScaleMin <= d.ui.renderScaleMaxMobile)) errors.push('ui.renderScale: 1 <= min <= max');
  const mb = d.ui.mobile;
  for (const k of ['edgeMarginDp', 'attackDp', 'skillDp', 'ultimateDp', 'swapDp', 'bagDp', 'pauseDp'] as const) {
    checkPositive(errors, `ui.mobile.${k}`, mb[k]);
  }
  if (mb.skillFanDeg.length !== 3) errors.push('ui.mobile.skillFanDeg: 3개여야 함');
  if (!HEX_COLOR.test(d.ui.corruptionColor)) errors.push('ui.corruptionColor: #RRGGBB');
  const sb = d.ui.hud.skillbar;
  if (sb.levelColors.length !== 3) errors.push('ui.hud.skillbar.levelColors: Lv1~3, 3개여야 함');
  for (const col of [...sb.levelColors, sb.awakenedColor, sb.emptyColor, sb.cooldownColor, sb.ultimateReadyColor]) {
    if (!HEX_COLOR.test(col)) errors.push(`ui.hud.skillbar: 색은 #RRGGBB (값: ${col})`);
  }
}

/** 키 바인딩 */
export function validateKeybindings(v: V): void {
  const { d, errors } = v;
  const kb = d.keybindings;
  const keyOwner = new Map<string, string>();
  const claim = (key: string, owner: string) => {
    const prev = keyOwner.get(key);
    if (prev && prev !== owner) errors.push(`keybindings: '${key}'가 ${prev}와 ${owner}에 겹침`);
    keyOwner.set(key, owner);
  };
  for (const dir of ['up', 'down', 'left', 'right'] as const) {
    if (!kb.move[dir]?.length) errors.push(`keybindings.move.${dir}: 키 없음`);
    for (const k of kb.move[dir] ?? []) claim(k, `move.${dir}`);
  }
  for (const action of BUTTON_ACTIONS) {
    const keys = kb.buttons[action];
    if (!keys?.length) errors.push(`keybindings.buttons.${action}: 키 없음`);
    for (const k of keys ?? []) claim(k, action);
  }
  for (const [name, codes] of Object.entries(kb.debug)) for (const k of codes) claim(k, `debug.${name}`);
}

/** 타격감 */
export function validateJuice(v: V): void {
  const { d, errors } = v;
  const ju = d.juice;
  for (const [k, c] of [...Object.entries(ju.damageNumbers.colors), ...Object.entries(ju.sparks.colors)]) if (!HEX_COLOR.test(c)) errors.push(`juice 색 ${k}: #RRGGBB`);
  if (!HEX_COLOR.test(ju.playerHurt.color)) errors.push('juice.playerHurt.color: #RRGGBB');
  for (const [k, v] of Object.entries(ju.hitStop)) if (!(v >= 0 && v <= 0.3)) errors.push(`juice.hitStop.${k}: 0~0.3초`);
  for (const [k, v] of Object.entries(ju.shake)) {
    checkPositive(errors, `juice.shake.${k}.ms`, v.ms);
    if (!(v.intensity > 0 && v.intensity < 0.05)) errors.push(`juice.shake.${k}.intensity: 0~0.05`);
  }
  checkRange(errors, 'juice.sparks.count', ju.sparks.count);
  checkRange(errors, 'juice.death.shards', ju.death.shards);
  checkRange(errors, 'juice.death.eliteShards', ju.death.eliteShards);
  for (const [k, ref] of Object.entries(ju.fx)) checkSprite(errors, `juice.fx.${k}`, ref);
  for (const c of [ju.spawn.ringColor, ju.bossIntro.bandColor, ju.bossIntro.nameColor, ju.bossIntro.subColor, ju.bossBar.color, ju.bossBar.trailColor, ju.bossBar.backColor, ju.bossBar.markerColor, ju.roomClear.color]) {
    if (!HEX_COLOR.test(c)) errors.push(`juice 색 ${c}: #RRGGBB`);
  }
  for (const [k, v] of Object.entries(ju.bossIntro)) if (typeof v === 'number') checkPositive(errors, `juice.bossIntro.${k}`, v);
  if (!(ju.bossKill.slowScale > 0 && ju.bossKill.slowScale <= 1)) errors.push('juice.bossKill.slowScale: 0~1');
}

/** 효과음 */
export function validateSounds(v: V): void {
  const { d, errors } = v;
  const so = d.sounds;
  if (!(so.masterVolume >= 0 && so.masterVolume <= 1)) errors.push('sounds.masterVolume: 0~1');
  const mu = so.music;
  for (const id of [mu.labTrack, mu.runTrack, mu.hiddenBossTrack, mu.encounterTrack, ...Object.values(mu.bossTracks), ...Object.values(mu.combatTracks)]) if (!mu.tracks[id]) errors.push(`sounds.music: 없는 곡 '${id}'`);
  for (const [id, t] of Object.entries(mu.tracks)) if (t.startSec !== undefined && !(t.startSec >= 0)) errors.push(`sounds.music.tracks.${id}.startSec: 0 이상`);
  for (const [id, def] of Object.entries(so.sounds)) {
    const w = `sounds.${id}`;
    if (def.files) {
      if (def.files.length === 0) errors.push(`${w}.files: 비어 있음`);
      if (!(def.volume === undefined || (def.volume > 0 && def.volume <= 1))) errors.push(`${w}.volume: 0~1`);
      if (!(def.durSec && def.durSec > 0)) errors.push(`${w}.durSec: 파일 소리는 대략 길이가 필요`);
      continue;
    }
    if (!def.layers?.length) errors.push(`${w}: 층이 없음`);
    (def.layers ?? []).forEach((l, i) => {
      const lw = `${w}.layers[${i}]`;
      if (!['sine', 'square', 'triangle', 'sawtooth', 'noise'].includes(l.wave)) errors.push(`${lw}.wave: sine·square·triangle·sawtooth·noise`);
      if (l.wave !== 'noise' && !(l.freq && l.freq[0] > 0 && l.freq[1] > 0)) errors.push(`${lw}.freq: 0보다 큰 [시작, 끝]`);
      checkPositive(errors, `${lw}.durSec`, l.durSec);
      if (!(l.volume > 0 && l.volume <= 1)) errors.push(`${lw}.volume: 0~1`);
      if (l.filter && !(['lowpass', 'highpass', 'bandpass'].includes(l.filter.type) && l.filter.freq[0] > 0 && l.filter.freq[1] > 0)) errors.push(`${lw}.filter`);
    });
  }
  for (const wpn of d.weapons.weapons) if (wpn.sfx !== undefined && !so.sounds[wpn.sfx] && !so.tiers[wpn.sfx]) errors.push(`weapons.${wpn.id}.sfx: 없는 소리 '${wpn.sfx}'`);
  for (const [g, tiers] of Object.entries(so.tiers)) {
    if (tiers.length === 0) errors.push(`sounds.tiers.${g}: 비어 있음`);
    tiers.forEach((t, i) => {
      if (!so.sounds[t.id]) errors.push(`sounds.tiers.${g}[${i}]: 없는 소리 '${t.id}'`);
      if (i < tiers.length - 1 && t.upTo === undefined) errors.push(`sounds.tiers.${g}[${i}]: 마지막이 아니면 upTo 필요`);
    });
  }
}

/** 도트 아트 */
export function validateArtData(v: V): void {
  const { d, errors } = v;
  errors.push(...validateArt(d.art, collectAssets(d)));
}

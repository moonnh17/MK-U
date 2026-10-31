import { describe, expect, it } from 'vitest';
import { defaultSave } from '../src/core/save';
import { gameData } from '../src/data/index';
import { clampVolume, musicGain, pickTrack } from '../src/systems/music';

const M = gameData.sounds.music;

describe('배경 음악', () => {
  it('실험장·런·챕터별 보스 곡', () => {
    expect(M.tracks[pickTrack(M, { place: 'lab' })]!.file).toBe('architecture-of-doubt.mp3');
    expect(M.tracks[pickTrack(M, { place: 'run', chapter: 1, facingBoss: false })]!.file).toBe('ruins-loop.ogg');
    expect(M.tracks[pickTrack(M, { place: 'run', chapter: 1, facingBoss: true })]!.file).toBe('corrupted-technology.mp3');
    expect(M.tracks[pickTrack(M, { place: 'run', chapter: 2, facingBoss: true })]!.file).toBe('corrupted-simulation.mp3');
    expect(M.tracks[pickTrack(M, { place: 'run', chapter: 3, facingBoss: true })]!.file).toBe('despair-grandeur.mp3');
  });
  it('보스 곡이 없는 챕터면 런 곡', () => {
    expect(pickTrack(M, { place: 'run', chapter: 9, facingBoss: true })).toBe(M.runTrack);
  });
  it('음량: 끄면 0, 슬라이더를 곱하고 0~1로 자른다', () => {
    expect(musicGain(0.5, 0.5, false)).toBeCloseTo(0.25);
    expect(musicGain(0.5, 1, true)).toBe(0);
    expect(musicGain(2, 1, false)).toBe(1);
  });
  it('저장값 정리', () => {
    expect(clampVolume(0.3, 1)).toBe(0.3);
    expect(clampVolume(5, 1)).toBe(1);
    expect(clampVolume('x', 0.7)).toBe(0.7);
  });
  it('기본 저장값: 음량 최대, 안내 안 봄', () => {
    expect(defaultSave()).toMatchObject({ musicVolume: 1, sfxVolume: 1, tutorialDone: false });
  });
  it('조작 안내 문구가 PC·모바일 모두 있다', () => {
    for (const k of gameData.ui.tutorial.pc) expect(gameData.text[k], k).toBeTypeOf('string');
    for (const k of gameData.ui.tutorial.mobile) expect(gameData.text[k], k).toBeTypeOf('string');
  });
});

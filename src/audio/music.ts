/**
 * 배경 음악 재생 (HTML 오디오). 씬이 'music' 이벤트로 곡 id를 보내면 겹쳐 넘긴다.
 * 자동 재생이 막히면 첫 사용자 입력에서 다시 튼다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { musicGain } from '../systems/music';

interface Playing {
  id: string;
  el: HTMLAudioElement;
  /** 0~1: 겹쳐 넘기는 진행 */
  fade: number;
  leaving: boolean;
}

const TICK_MS = 50;

export class Music {
  private playing: Playing[] = [];
  private wanted: string | null = null;

  constructor(private readonly ctx: GameContext) {
    bus.on('music', ({ track }) => this.play(track));
    bus.on('muteChanged', () => this.applyVolume());
    bus.on('volumeChanged', () => this.applyVolume());
    const resume = () => {
      for (const p of this.playing) if (p.el.paused) void p.el.play().catch(() => undefined);
    };
    window.addEventListener('pointerdown', resume, { capture: true });
    window.addEventListener('keydown', resume, { capture: true });
    // 탭을 숨기면 멈춘다
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) for (const p of this.playing) p.el.pause();
      else resume();
    });
    window.setInterval(() => this.tick(TICK_MS / 1000), TICK_MS);
  }

  private play(id: string): void {
    if (id === this.wanted) return;
    this.wanted = id;
    const m = this.ctx.data.sounds.music;
    const def = m.tracks[id];
    for (const p of this.playing) p.leaving = true;
    if (!def) return;
    const el = new Audio(`${m.basePath}${def.file}`);
    el.loop = true;
    el.volume = 0;
    // 곡 중간부터 (히든보스: 2장 보스 곡 1분 19초부터). 반복은 처음부터
    if (def.startSec) el.currentTime = def.startSec;
    this.playing.push({ id, el, fade: 0, leaving: false });
    void el.play().catch(() => undefined);
  }

  private tick(dt: number): void {
    const step = dt / this.ctx.data.sounds.music.fadeSec;
    for (const p of this.playing) p.fade = Math.min(1, Math.max(0, p.fade + (p.leaving ? -step : step)));
    for (const p of this.playing.filter((x) => x.leaving && x.fade <= 0)) {
      p.el.pause();
      p.el.src = '';
    }
    this.playing = this.playing.filter((x) => !(x.leaving && x.fade <= 0));
    this.applyVolume();
  }

  private applyVolume(): void {
    const m = this.ctx.data.sounds.music;
    const s = this.ctx.save.data;
    for (const p of this.playing) p.el.volume = musicGain(m.tracks[p.id]?.volume ?? 1, s.musicVolume, s.muted) * p.fade;
  }
}

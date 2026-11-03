/**
 * 효과음 (Web Audio). sounds.json의 files가 있으면 녹음 파일(여럿이면 무작위 하나), 없으면 층마다 발진기(또는 잡음) →
 * 걸러내기 → 음량 봉투로 합성한다. 묶음 이름(swing·hit·explosion)은 size(피해·반지름)에 맞는 단계로 바꿔 낸다.
 * 게임 쪽은 bus.emit('sfx', { id, size })만 한다. 브라우저 규칙상 첫 클릭·키 입력 뒤에 소리가 켜진다.
 * 소리 끄기는 저장에 남고, M 키(또는 일시정지 창)로 바꾼다.
 */
import type { GameContext } from '../core/context';
import { bus } from '../core/events';
import { Rng } from '../core/rng';
import { pitchFactor, resolveSfx, SoundGate, soundLength } from '../systems/sound';
import type { SoundLayer } from '../types/data';

export class Sfx {
  private ac: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  /** 녹음 파일 (불러온 것만). 불러오는 중이면 그 소리는 건너뛴다 */
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly gate: SoundGate;
  private readonly rng: Rng;

  constructor(private readonly ctx: GameContext) {
    this.gate = new SoundGate(ctx.data.sounds);
    this.rng = Rng.derive(ctx.config.seed, 'sfx');
    // 첫 사용자 입력에서 오디오를 연다 (자동 재생 막힘)
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === ctx.data.sounds.muteKey && !e.repeat) bus.emit('muteToggle', {});
    });
    bus.on('sfx', ({ id, size }) => this.play(resolveSfx(ctx.data.sounds, id, size)));
    bus.on('muteToggle', () => this.setMuted(!ctx.save.data.muted));
    bus.on('volumeChanged', () => this.applyGain());
  }

  get muted(): boolean {
    return this.ctx.save.data.muted;
  }

  private setMuted(m: boolean): void {
    this.ctx.save.data.muted = m;
    this.ctx.save.write();
    this.applyGain();
    bus.emit('muteChanged', { muted: m });
    bus.emit('toast', { text: this.ctx.t(m ? 'sound.off' : 'sound.on') });
  }

  private applyGain(): void {
    if (this.master) this.master.gain.value = this.muted ? 0 : this.ctx.data.sounds.masterVolume * this.ctx.save.data.sfxVolume;
  }

  private ensure(): AudioContext | null {
    if (!this.ac) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      this.ac = new AC();
      this.master = this.ac.createGain();
      this.applyGain();
      this.master.connect(this.ac.destination);
      // 1초짜리 흰 잡음 (잡음 층이 함께 쓴다)
      const len = this.ac.sampleRate;
      this.noise = this.ac.createBuffer(1, len, this.ac.sampleRate);
      const ch = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) ch[i] = this.rng.range(-1, 1);
      this.loadFiles(this.ac);
    }
    if (this.ac.state === 'suspended') void this.ac.resume();
    return this.ac;
  }

  play(id: string): void {
    if (this.muted) return;
    const ac = this.ac;
    const def = this.ctx.data.sounds.sounds[id];
    if (!ac || ac.state !== 'running' || !def || !this.master) return;
    if (!this.gate.tryPlay(id, ac.currentTime, soundLength(def))) return;
    const pitch = pitchFactor(this.rng, this.ctx.data.sounds.pitchJitter);
    if (def.files) {
      const buf = this.buffers.get(this.rng.pick(def.files));
      if (!buf) return;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = pitch;
      const g = ac.createGain();
      g.gain.value = def.volume ?? 1;
      src.connect(g);
      g.connect(this.master);
      src.start();
      return;
    }
    for (const layer of def.layers ?? []) this.layer(ac, layer, pitch);
  }

  /** 녹음 효과음을 모두 미리 불러온다 (첫 입력 뒤 한 번) */
  private loadFiles(ac: AudioContext): void {
    const base = this.ctx.data.sounds.sfxBasePath;
    const files = new Set(Object.values(this.ctx.data.sounds.sounds).flatMap((d) => d.files ?? []));
    for (const file of files) {
      fetch(base + file)
        .then((r) => r.arrayBuffer())
        .then((b) => ac.decodeAudioData(b))
        .then((buf) => this.buffers.set(file, buf))
        .catch(() => console.warn('효과음을 불러오지 못함', file));
    }
  }

  private layer(ac: AudioContext, l: SoundLayer, pitch: number): void {
    const t0 = ac.currentTime + (l.delaySec ?? 0);
    const t1 = t0 + l.durSec;
    let src: AudioScheduledSourceNode;
    if (l.wave === 'noise') {
      const n = ac.createBufferSource();
      n.buffer = this.noise;
      n.loop = true;
      src = n;
    } else {
      const o = ac.createOscillator();
      o.type = l.wave;
      const [f0, f1] = l.freq!;
      o.frequency.setValueAtTime(f0 * pitch, t0);
      o.frequency.exponentialRampToValueAtTime(Math.max(1, f1 * pitch), t1);
      src = o;
    }
    let node: AudioNode = src;
    if (l.filter) {
      const f = ac.createBiquadFilter();
      f.type = l.filter.type;
      f.frequency.setValueAtTime(l.filter.freq[0], t0);
      f.frequency.exponentialRampToValueAtTime(Math.max(1, l.filter.freq[1]), t1);
      node.connect(f);
      node = f;
    }
    // 음량 봉투: 아주 빠르게 올라가 길이 동안 줄어든다
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(l.volume, t0 + Math.min(0.005, l.durSec / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t1);
    node.connect(g);
    g.connect(this.master!);
    src.start(t0);
    src.stop(t1 + 0.02);
  }
}

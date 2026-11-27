"""
헥타르 미모사 전용 BGM (코드 합성). G단조 150BPM, 64마디 반복 곡.
MKU 곡에서 뽑은 음형:
  M1 실험장(Architecture of Doubt) C-Bb-G  → G단조로 G-F-D (미모사 테마)
  M2 2막 보스(Corrupted Simulation) G-Bb-C-D 상승 / Eb-D-C 하강
  M3 최종보스(Despair Grandeur) C-D-Eb-G ... Bb
  M4 1막 보스(Corrupted Technology) C-Bb-F-Eb-D-C 하강
구성: 인트로 8 / A 질주 16 / B 웅장 16 / C 브리지(실험장 음형, 글리치) 8 / D 클라이맥스 16 → A로 이어짐
"""
import sys
import numpy as np
from scipy.signal import lfilter, butter, fftconvolve

SR = 44100
BPM = 150
BEAT = 60 / BPM
BAR = BEAT * 4
rng = np.random.default_rng(7)


def mtof(m):
    return 440.0 * 2 ** ((m - 69) / 12)


N = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}


def note(s):
    name, octv = s[:-1], int(s[-1])
    return 12 * (octv + 1) + N[name]


# ---------- 소리 ----------

def env(n, a, d, s, r, sustain_n=None):
    a, d, r = int(a * SR), int(d * SR), int(r * SR)
    sustain_n = max(0, n - a - d - r) if sustain_n is None else sustain_n
    e = np.concatenate([np.linspace(0, 1, max(a, 1)), np.linspace(1, s, max(d, 1)), np.full(sustain_n, s), np.linspace(s, 0, max(r, 1))])
    return e[:n] if len(e) >= n else np.pad(e, (0, n - len(e)))


def saw(f, n, detune=0.0, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    for d in ([-detune, 0, detune] if detune else [0]):
        ff = f * 2 ** (d / 1200)
        out += 2 * ((t * ff + phase + rng.random()) % 1.0) - 1
    return out / (3 if detune else 1)


def square(f, n, pw=0.5):
    t = np.arange(n) / SR
    return np.where((t * f) % 1.0 < pw, 1.0, -1.0)


def sine(f, n):
    return np.sin(2 * np.pi * f * np.arange(n) / SR)


def lp(x, cutoff, order=2):
    b, a = butter(order, min(cutoff, SR / 2 - 100) / (SR / 2), 'low')
    return lfilter(b, a, x)


def hp(x, cutoff, order=2):
    b, a = butter(order, cutoff / (SR / 2), 'high')
    return lfilter(b, a, x)


def bp(x, lo, hi):
    b, a = butter(2, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return lfilter(b, a, x)


# ---------- 악기 ----------

def lead(m, dur, vib=True):
    n = int(dur * SR)
    f = mtof(m)
    t = np.arange(n) / SR
    v = 1 + (0.0025 * np.sin(2 * np.pi * 5.0 * t) * np.clip((t - 0.25) / 0.3, 0, 1) if vib else 0)
    ph = np.cumsum(f * v / SR)
    x = (2 * (ph % 1.0) - 1) * 0.5 + (2 * ((ph * 1.006) % 1.0) - 1) * 0.35 + (2 * ((ph * 0.994 + 0.3) % 1.0) - 1) * 0.35 + (2 * ((ph * 0.5) % 1.0) - 1) * 0.25
    x = np.tanh(lp(x, 3600) * 2.4) * 0.7
    return x * env(n, 0.01, 0.12, 0.75, 0.08)


def bell(m, dur):
    n = int((dur + 1.2) * SR)
    f = mtof(m)
    x = sine(f, n) + 0.5 * sine(f * 2.01, n) + 0.25 * sine(f * 3.98, n) + 0.12 * sine(f * 5.4, n)
    return x * np.exp(-np.arange(n) / SR * 2.6) * env(n, 0.002, 0.05, 1, 0.05)


def pad(ms, dur):
    n = int(dur * SR)
    x = sum(saw(mtof(m), n, detune=12) for m in ms) / len(ms)
    x = lp(x, 1600)
    return x * env(n, 0.35, 0.3, 0.8, 0.4)


def choir(ms, dur):
    n = int(dur * SR)
    out = np.zeros(n)
    for m in ms:
        x = saw(mtof(m), n, detune=8)
        # 모음 'aa' 포먼트
        out += bp(x, 650, 1100) * 1.2 + bp(x, 1050, 1300) * 0.6 + bp(x, 2300, 2900) * 0.3
    return out / len(ms) * env(n, 0.5, 0.3, 0.85, 0.6) * 2.2


def bass(m, dur):
    """그르렁 베이스: 일그러뜨린 톱니 + 8분음 박자로 흔들리는 필터"""
    n = int(dur * SR)
    f = mtof(m)
    t = np.arange(n) / SR
    x = saw(f, n) * 0.7 + saw(f * 1.007, n) * 0.5 + sine(f / 2, n) * 0.35
    x = np.tanh(x * 3.5)
    lfo = 0.5 + 0.5 * np.sin(2 * np.pi * (2 / BEAT) * t - np.pi / 2)
    lo = lp(x, 350)
    hi = lp(x, 2600)
    y = lo * (1 - lfo) + hi * lfo
    return y * env(n, 0.004, 0.05, 0.85, 0.03) * 0.8


def brass(ms, dur):
    n = int(dur * SR)
    x = sum(saw(mtof(m), n, detune=9) for m in ms) / len(ms)
    t = np.arange(n) / SR
    y = lp(x, 700) * (1 - np.exp(-t * 30)) + lp(x, 1900) * np.exp(-t * 14)
    return np.tanh(y * 4.5) * 0.6 * env(n, 0.01, 0.15, 0.6, 0.08)


def arp(m, dur):
    n = int(dur * SR)
    x = saw(mtof(m), n) * 0.6 + saw(mtof(m) * 1.003, n) * 0.4
    return lp(x, 1500) * env(n, 0.002, 0.09, 0.15, 0.05)


def kick():
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    f = 55 + 120 * np.exp(-t * 30)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 11)
    click = rng.standard_normal(n) * np.exp(-t * 300) * 0.3
    return np.tanh((x + click) * 1.6)


def snare():
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    noise = bp(rng.standard_normal(n), 1200, 8000) * np.exp(-t * 16)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 22)
    return noise * 0.9 + tone * 0.5


def hat(open_=False):
    n = int((0.25 if open_ else 0.06) * SR)
    t = np.arange(n) / SR
    return lp(hp(rng.standard_normal(n), 6000), 11000) * np.exp(-t * (14 if open_ else 70)) * 0.18


def crash():
    n = int(2.0 * SR)
    t = np.arange(n) / SR
    return lp(hp(rng.standard_normal(n), 3000), 10000) * np.exp(-t * 2.2) * 0.3


def riser(dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = rng.standard_normal(n)
    out = np.zeros(n)
    seg = n // 16
    for i in range(16):
        c = 400 + i * 600
        out[i * seg:(i + 1) * seg] = bp(x[i * seg:(i + 1) * seg], c, c * 1.8)
    return out * (t / dur) ** 2 * 0.5


# ---------- 배치 ----------

TOTAL_BARS = 64
L = int(TOTAL_BARS * BAR * SR) + SR * 3
tracks = {k: np.zeros(L) for k in ['drums', 'bass', 'lead', 'lead2', 'pad', 'choir', 'arp', 'bell', 'fx', 'brass']}


def put(track, x, t, gain=1.0):
    i = int(t * SR)
    j = min(L, i + len(x))
    tracks[track][i:j] += x[: j - i] * gain


def bar_t(b, beat=0.0):
    return b * BAR + beat * BEAT


# 화음 (근음 기준 G단조): i Gm, VI Eb, III Bb, VII F, iv Cm, V D
CH = {
    'Gm': ['G3', 'Bb3', 'D4'], 'Eb': ['Eb3', 'G3', 'Bb3'], 'Bb': ['Bb2', 'D3', 'F3'], 'F': ['F3', 'A3', 'C4'],
    'Cm': ['C3', 'Eb3', 'G3'], 'D': ['D3', 'F#3', 'A3'], 'Dsus': ['D3', 'G3', 'A3'], 'Ab': ['Ab2', 'C3', 'Eb3'],
}
ROOT = {'Gm': 'G1', 'Eb': 'Eb1', 'Bb': 'Bb1', 'F': 'F1', 'Cm': 'C2', 'D': 'D2', 'Dsus': 'D2', 'Ab': 'Ab1'}
PROG_A = ['Gm', 'Ab', 'Eb', 'D']
PROG_B = ['Gm', 'Cm', 'Ab', 'D']
PROG_D = ['Gm', 'Eb', 'Ab', 'D']


def chords(start, bars, prog, choir_on=False, pad_gain=0.5):
    for i in range(bars):
        c = prog[i % len(prog)]
        ms = [note(x) + 12 for x in CH[c]]
        put('pad', pad(ms, BAR), bar_t(start + i), pad_gain)
        if choir_on:
            put('choir', choir([m + 12 for m in ms], BAR), bar_t(start + i), 0.55)


def bassline(start, bars, prog, pattern='eighth'):
    for i in range(bars):
        r = note(ROOT[prog[i % len(prog)]])
        steps = 8 if pattern == 'eighth' else 16
        for s in range(steps):
            oct_ = 12 if (pattern == 'eighth' and s % 2 == 1) else 0
            if pattern == 'gallop':
                oct_ = 12 if s % 4 == 2 else 0
            put('bass', bass(r + 12 + oct_, BAR / steps * 0.9), bar_t(start + i, s * 4 / steps), 0.55)


def drums(start, bars, style='drive'):
    for i in range(bars):
        b = start + i
        if style == 'intro':
            put('drums', kick(), bar_t(b, 0), 0.9)
        elif style == 'half':
            for k_ in (0, 2.5):
                put('drums', kick(), bar_t(b, k_), 0.95)
            put('drums', snare(), bar_t(b, 2), 0.85)
        else:
            # 브레이크비트: 킥 1·2.75(+클라이맥스 3.5), 스네어 2·4, 고스트
            for k_ in ((0, 0.75, 2.5, 3.5) if style == 'climax' else (0, 2.5)):
                put('drums', kick(), bar_t(b, k_), 0.95)
            put('drums', snare(), bar_t(b, 1), 0.8)
            put('drums', snare(), bar_t(b, 3), 0.8)
            for g_ in (1.75, 3.75):
                put('drums', snare(), bar_t(b, g_), 0.25)
        if style != 'intro':
            n16 = 16
            for s_ in range(n16):
                put('drums', hat(open_=(s_ % 8 == 6)), bar_t(b, s_ * 0.25), 0.7 if s_ % 2 else 1.0)
        if i % 4 == 3 and style in ('drive', 'climax'):
            for k in range(8):
                put('drums', snare(), bar_t(b, 2 + k * 0.25), 0.3 + 0.08 * k)
    if style != 'intro':
        put('fx', crash(), bar_t(start), 0.8)


def melody(track, start, phrase, gain=0.42, inst=lead):
    """phrase: [(음, 박 길이)], 음이 None이면 쉼"""
    t = bar_t(start)
    for m, beats in phrase:
        if m is not None:
            put(track, inst(note(m) if isinstance(m, str) else m, beats * BEAT * 0.95), t, gain)
        t += beats * BEAT


# M1 미모사(실험장 음형 G-F-D), M2 상승/하강, M3 절망, M4 하강
M1 = [('G5', 1.5), ('F5', 0.5), ('D5', 2), ('G5', 1), ('F5', 1), ('D5', 1), ('C5', 1)]
M1b = [('Bb4', 1.5), ('C5', 0.5), ('D5', 2), ('F5', 1), ('D5', 1), ('C5', 2)]
M2 = [('G4', 0.5), ('Bb4', 0.5), ('C5', 1), ('D5', 2), ('Eb5', 0.5), ('D5', 0.5), ('C5', 1), ('Bb4', 2)]
M2b = [('G4', 0.5), ('Bb4', 0.5), ('C5', 1), ('D5', 1), ('F5', 1), ('Eb5', 1), ('D5', 1), ('C5', 2)]
M3 = [('C5', 1), ('D5', 1), ('Eb5', 1), ('G5', 3), ('Bb5', 1), ('A5', 1), ('G5', 2), ('D5', 2), ('Eb5', 2), ('D5', 4)]
M4 = [('C6', 1), ('Bb5', 1), ('F5', 1), ('Eb5', 1), ('D5', 2), ('C5', 2), ('D5', 1), ('F5', 1), ('G5', 2), ('A5', 2), ('D5', 2)]

# --- 인트로 (0-7): 종소리로 미모사 음형, 패드, 마지막에 상승음
chords(0, 8, ['Gm', 'Gm', 'Eb', 'Eb', 'Cm', 'Cm', 'D', 'D'], pad_gain=0.45)
melody('bell', 0, M1, gain=0.33, inst=bell)
melody('bell', 4, M1b, gain=0.33, inst=bell)
drums(4, 4, 'intro')
put('fx', riser(BAR * 2), bar_t(6), 1.0)

# --- A 질주 (8-23)
chords(8, 16, PROG_A)
bassline(8, 16, PROG_A)
drums(8, 16, 'drive')
for k in range(4):
    melody('lead', 8 + k * 4, M2 if k % 2 == 0 else M2b)
for i in range(16):
    ms = [note(x) + 12 for x in CH[PROG_A[i % 4]]]
    for s in range(16):
        put('arp', arp(ms[[0, 1, 2, 1][s % 4]] + (12 if s // 8 else 0), BAR / 16), bar_t(8 + i, s * 0.25), 0.11)

def stabs(start, bars, prog, beats=(0, 1.5, 2.5)):
    for i in range(bars):
        ms = [note(x) for x in CH[prog[i % len(prog)]]]
        for b_ in beats:
            put('brass', brass(ms + [ms[0] - 12], BEAT * 0.8), bar_t(start + i, b_), 0.5)


stabs(8, 16, PROG_A)
chords(8, 16, PROG_A, choir_on=True, pad_gain=0.0)

# --- B 웅장 (24-39): 하프타임, 합창, 절망 음형
chords(24, 16, PROG_B, choir_on=True, pad_gain=0.4)
bassline(24, 16, PROG_B, 'gallop')
drums(24, 16, 'half')
melody('lead', 24, M3, gain=0.45)
melody('lead', 32, M3, gain=0.45)
melody('lead2', 32, [(m and (note(m) - 12), b) for m, b in M3], gain=0.22)

# --- C 브리지 (40-47): 드럼이 빠지고 실험장 음형, 글리치
chords(40, 8, ['Gm', 'Gm', 'Eb', 'Eb', 'Cm', 'Cm', 'Dsus', 'D'], choir_on=True, pad_gain=0.35)
melody('bell', 40, M1, gain=0.4, inst=bell)
melody('bell', 44, M1b, gain=0.4, inst=bell)
put('fx', riser(BAR * 2), bar_t(46), 1.1)
for i in range(2):
    put('drums', kick(), bar_t(44 + i * 2), 0.8)

# --- D 클라이맥스 (48-63): 두 배 드럼, 1막 하강 음형 + 2막 상승 대선율
chords(48, 16, PROG_D, choir_on=True, pad_gain=0.45)
bassline(48, 16, PROG_D)
drums(48, 16, 'climax')
melody('lead', 48, M4, gain=0.45)
melody('lead', 52, M4, gain=0.45)
melody('lead', 56, M1, gain=0.45)
melody('lead', 60, M2b, gain=0.45)
melody('lead2', 48, [(m and (note(m) - 12 if isinstance(m, str) else m), b) for m, b in M2] * 2, gain=0.18)
for i in range(16):
    ms = [note(x) + 12 for x in CH[PROG_D[i % 4]]]
    for s in range(16):
        put('arp', arp(ms[[0, 2, 1, 2][s % 4]] + (12 if s % 8 >= 4 else 0), BAR / 16), bar_t(48 + i, s * 0.25), 0.1)
put('fx', riser(BAR * 1), bar_t(63), 0.9)

stabs(48, 16, PROG_D, beats=(0, 0.75, 1.5, 2.5, 3.0))
stabs(24, 16, PROG_B, beats=(0, 2))

# ---------- 글리치 (미모사의 시스템 변조): 브리지·클라이맥스 리드를 잘게 되풀이
def stutter(track, t, slice_beats=0.125, reps=6):
    i = int(t * SR)
    n = int(slice_beats * BEAT * SR)
    piece = tracks[track][i:i + n].copy()
    for r in range(reps):
        a = i + r * n
        tracks[track][a:a + n] = piece * (1 - r / reps)


for b in [15, 23, 31, 39, 55, 63]:
    stutter('lead', bar_t(b, 3), reps=8)


def crush(track, t0, t1, bits=5, hold=6):
    i, j = int(t0 * SR), int(t1 * SR)
    x = tracks[track][i:j]
    q = 2 ** bits
    x = np.round(x * q) / q
    x = np.repeat(x[::hold], hold)[: j - i]
    tracks[track][i:j] = x


for b in (44, 45, 46, 47):
    crush('bell', bar_t(b, 2), bar_t(b, 4))
crush('lead', bar_t(56), bar_t(58), bits=6, hold=4)


# ---------- 믹스 ----------
def reverb(x, sec=2.2, wet=0.25):
    n = int(sec * SR)
    ir = rng.standard_normal(n) * np.exp(-np.arange(n) / SR * (6.9 / sec))
    ir = lp(ir, 5000)
    y = fftconvolve(x, ir)[: len(x)]
    y /= np.max(np.abs(y)) + 1e-9
    return x * (1 - wet) + y * wet * np.max(np.abs(x))


# 킥에 맞춰 패드·베이스 숨쉬기 (사이드체인)
duck = np.ones(L)
for b in range(TOTAL_BARS):
    for q in range(4):
        i = int(bar_t(b, q) * SR)
        n = int(BEAT * SR * 0.6)
        duck[i:i + n] = np.minimum(duck[i:i + n], 0.55 + 0.45 * np.linspace(0, 1, len(duck[i:i + n])) ** 0.5)
duck[: int(bar_t(8) * SR)] = 1
duck[int(bar_t(40) * SR):int(bar_t(48) * SR)] = 1

mixL = np.zeros(L)
mixR = np.zeros(L)
pan = {'brass': 0, 'drums': 0, 'bass': 0, 'lead': -0.15, 'lead2': 0.45, 'pad': 0, 'choir': 0, 'arp': 0.55, 'bell': -0.5, 'fx': 0}
gain = {'brass': 0.8, 'drums': 0.8, 'bass': 0.7, 'lead': 1.0, 'lead2': 0.75, 'pad': 0.9, 'choir': 0.9, 'arp': 0.6, 'bell': 0.8, 'fx': 0.55}
WIDE = {'pad', 'choir', 'brass'}


def reverb2(x, sec, wet):
    """좌우가 다른 잔향 (넓게)"""
    outs = []
    for seed in (1, 2):
        r = np.random.default_rng(seed)
        n = int(sec * SR)
        ir = lp(r.standard_normal(n), 5000) * np.exp(-np.arange(n) / SR * (6.9 / sec))
        y = fftconvolve(x, ir)[: len(x)]
        y = y / (np.max(np.abs(y)) + 1e-9) * (np.max(np.abs(x)) + 1e-9)
        outs.append(y * wet)
    return outs


for k, x in tracks.items():
    if k in ('pad', 'bass', 'choir', 'arp'):
        x = x * duck
    # 중역을 두껍게: 리드·패드에 중역 강조
    if k in ('lead', 'pad', 'choir'):
        x = x + bp(x, 400, 1800) * 0.6
    g = gain[k]
    p = pan[k]
    l = x * g * np.sqrt((1 - p) / 2) * 1.414
    rr = x * g * np.sqrt((1 + p) / 2) * 1.414
    if k in WIDE:
        # 하스 효과로 넓게: 오른쪽을 12ms 늦춘다
        d = int(0.012 * SR)
        rr = np.concatenate([np.zeros(d), rr[:-d]])
    if k in ('lead', 'lead2', 'pad', 'choir', 'bell', 'arp'):
        rl, rrv = reverb2(x * g, 2.4 if k in WIDE or k == 'bell' else 1.4, 0.35 if k != 'lead' else 0.2)
        l = l + rl
        rr = rr + rrv
    mixL += l
    mixR += rr
# 초저역 정리
mixL = hp(mixL, 35)
mixR = hp(mixR, 35)

# 반복 이음매: 끝(꼬리)을 처음에 겹쳐 넣고 정확히 64마디로 자른다
loop_n = int(TOTAL_BARS * BAR * SR)
tail_l, tail_r = mixL[loop_n:], mixR[loop_n:]
mixL, mixR = mixL[:loop_n].copy(), mixR[:loop_n].copy()
mixL[: len(tail_l)] += tail_l
mixR[: len(tail_r)] += tail_r

stereo = np.stack([mixL, mixR], 1)
stereo = np.tanh(stereo / (np.max(np.abs(stereo)) + 1e-9) * 1.4) * 0.89
out = sys.argv[1]
import wave
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((stereo * 32767).astype(np.int16).tobytes())
print('wrote', out, round(loop_n / SR, 2), 's')

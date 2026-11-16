# EagleEye の動画用 BGM をコードで作る（自作なので権利の心配がない）。
# 使い方：python3 scripts/social/bgm/make-bgm.py <出力.wav> [秒数=24]
# 128BPM・Am-F-C-G のバトル風ループ：キック・スネア・ハイハット・ベース・パッド・リード。
import sys, wave
import numpy as np

SR = 44100
out = sys.argv[1] if len(sys.argv) > 1 else "bgm.wav"
length = float(sys.argv[2]) if len(sys.argv) > 2 else 24.0
BPM = 128
beat = 60 / BPM
n = int(SR * length)
mix = np.zeros(n)
rng = np.random.default_rng(1524)

def note(freq):
    return 440.0 * 2 ** ((freq - 69) / 12)

def env(dur, a=0.005, r=0.1):
    t = np.arange(int(SR * dur)) / SR
    e = np.minimum(1, t / a) * np.exp(-t / r)
    return t, e

def place(sig, start):
    i = int(start * SR)
    if i >= n: return
    j = min(n, i + len(sig))
    mix[i:j] += sig[: j - i]

def kick():
    t, e = env(0.35, 0.001, 0.12)
    f = 50 + 90 * np.exp(-t * 30)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * e * 0.9

def snare():
    t, e = env(0.25, 0.001, 0.07)
    return (rng.standard_normal(len(t)) * 0.5 + np.sin(2 * np.pi * 190 * t) * 0.4) * e * 0.5

def hat(open_=False):
    t, e = env(0.2 if open_ else 0.06, 0.001, 0.05 if open_ else 0.015)
    noise = rng.standard_normal(len(t))
    noise = np.diff(np.concatenate([[0], noise]))  # 高い音だけ残す
    return noise * e * 0.18

def saw(freq, dur, amp, r=0.25, detune=0.0):
    t, e = env(dur, 0.01, r)
    s = 0
    for d in (-detune, 0, detune):
        f = freq * (1 + d)
        s = s + (2 * ((t * f) % 1) - 1)
    return s / 3 * e * amp

def pad(freqs, dur, amp):
    t = np.arange(int(SR * dur)) / SR
    e = np.minimum(1, t / 0.3) * np.minimum(1, (dur - t) / 0.3)
    s = sum(np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) for f in freqs)
    return s / len(freqs) * e * amp

# Am F C G（1小節ずつ）
chords = [(57, [57, 60, 64]), (53, [53, 57, 60]), (48, [55, 60, 64]), (55, [55, 59, 62])]
bar = beat * 4
lead = [76, 74, 72, 74, 76, 79, 76, 74, 72, 71, 72, 74, 76, 72, 71, 67]
t0 = 0.0
b = 0
while t0 < length:
    root, triad = chords[b % 4]
    place(pad([note(m) for m in triad], bar, 0.16), t0)
    for k in range(8):  # 8分のベース
        place(saw(note(root - 12), beat / 2, 0.22, r=0.12, detune=0.004), t0 + k * beat / 2)
    intro = b < 2
    for k in range(4):
        tb = t0 + k * beat
        if not intro or k % 2 == 0: place(kick(), tb)
        if not intro and k in (1, 3): place(snare(), tb)
        place(hat(), tb + beat / 2)
        if not intro: place(hat(), tb)
    if b >= 2:  # 3小節目からリード
        for k in range(4):
            m = lead[(b * 4 + k) % len(lead)]
            place(saw(note(m), beat * 0.9, 0.12, r=0.3, detune=0.006), t0 + k * beat)
    t0 += bar
    b += 1

# 最後の1.5秒でフェードアウト、全体を正規化
fade = int(1.5 * SR)
mix[-fade:] *= np.linspace(1, 0, fade)
mix = np.tanh(mix * 1.2)
mix = mix / np.max(np.abs(mix)) * 0.8
data = (mix * 32767).astype(np.int16)
with wave.open(out, "wb") as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data.tobytes())
print(f"wrote {out} {length}s {BPM}bpm")

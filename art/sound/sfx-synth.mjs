// もぐもGO の効果音 9 個をコードで合成して WAV にする（2026-11-16、A6。オーナーが試聴して直す）。
// 使い方: node art/sound/sfx-synth.mjs  → art/sound/sfx/*.wav（m4a への変換は make-m4a.sh）
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'sfx')

// ---- 部品 ----
const midi = (n) => 440 * 2 ** ((n - 69) / 12)
const N = { C4: 60, D4: 62, E4: 64, F4: 65, G4: 67, A4: 69, B4: 71, C5: 72, D5: 74, E5: 76, F5: 77, G5: 79, A5: 81, B5: 83, C6: 84, D6: 86, E6: 88, G6: 91, A6: 93, C7: 96, E7: 100 }

function buf(sec) { return new Float32Array(Math.ceil(sec * SR)) }

// 倍音を足して作る音（折り返しのノイズが出ないよう、ナイキストより上の倍音は足さない）
function voice(out, { t, f, dur, kind = 'sine', amp = 0.3, a = 0.005, d = 0.1, s = 0.6, r = 0.15, bend = 0, vib = 0, decay = 0 }) {
  const i0 = Math.floor(t * SR)
  const len = Math.floor((dur + r) * SR)
  const harm = kind === 'sine' ? [[1, 1]]
    : kind === 'tri' ? [1, 3, 5, 7, 9].map((k, j) => [k, (j % 2 ? -1 : 1) / (k * k)])
    : kind === 'square' ? [1, 3, 5, 7, 9, 11].map((k) => [k, 1 / k])
    : kind === 'saw' ? [1, 2, 3, 4, 5, 6, 7, 8].map((k) => [k, 1 / k])
    : kind === 'bell' ? [[1, 1], [2.76, 0.4], [5.4, 0.18], [8.9, 0.08]]
    : kind === 'glock' ? [[1, 1], [3.0, 0.25], [6.2, 0.1]]
    : kind === 'marimba' ? [[1, 1], [4.0, 0.22], [9.9, 0.04]]
    : kind === 'kalimba' ? [[1, 1], [2.0, 0.1], [5.9, 0.06]]
    : kind === 'musicbox' ? [[1, 1], [2.0, 0.3], [3.0, 0.08], [4.2, 0.05]]
    : [[1, 1]]
  let ph = harm.map(() => 0)
  for (let n = 0; n < len; n++) {
    const tt = n / SR
    // 包絡
    let e
    if (tt < a) e = tt / a
    else if (tt < a + d) e = 1 - (1 - s) * ((tt - a) / d)
    else if (tt < dur) e = s
    else e = s * Math.max(0, 1 - (tt - dur) / r)
    const dk = decay || ({ bell: 3.2, glock: 3.2, marimba: 9, kalimba: 5, musicbox: 4 })[kind] || 0
    if (dk) e *= Math.exp(-tt * dk) // 叩く楽器は自然に減る
    const ff = f * (1 + bend * Math.min(1, tt / Math.max(dur, 0.001))) * (1 + vib * Math.sin(2 * Math.PI * 5.5 * tt))
    let v = 0
    harm.forEach(([k, g], j) => {
      const hf = ff * k
      if (hf < SR / 2.2) { ph[j] += (2 * Math.PI * hf) / SR; v += g * Math.sin(ph[j]) }
    })
    const idx = i0 + n
    if (idx < out.length) out[idx] += v * e * amp
  }
}

// 雑音（ふわっ・しゅわ）。低域通過の切れ目を時間で動かす
function noise(out, { t, dur, amp = 0.2, from = 400, to = 4000, a = 0.2 }) {
  const i0 = Math.floor(t * SR)
  const len = Math.floor(dur * SR)
  let lp = 0, lp2 = 0
  let seed = 12345
  for (let n = 0; n < len; n++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const w = seed / 0x7fffffff * 2 - 1
    const p = n / len
    const fc = from + (to - from) * Math.sin(Math.PI * Math.min(1, p * 1.2)) // 上がって下がる
    const k = 1 - Math.exp((-2 * Math.PI * fc) / SR)
    lp += k * (w - lp); lp2 += k * (lp - lp2)
    const e = Math.min(1, (n / SR) / a) * (1 - p) ** 1.5
    const idx = i0 + n
    if (idx < out.length) out[idx] += (lp2 - lp * 0.3) * e * amp
  }
}

// 手拍子（高めの雑音を 3 回すばやく）
function clap(out, t, amp = 0.25) {
  let seed = 777, hp = 0, prev = 0
  const i0 = Math.floor(t * SR), len = Math.floor(0.18 * SR)
  for (let n = 0; n < len; n++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const w = seed / 0x7fffffff * 2 - 1
    hp = 0.85 * (hp + w - prev); prev = w
    const tt = n / SR
    const e = [0, 0.011, 0.022].reduce((m, o) => m + (tt >= o ? Math.exp(-(tt - o) * (o === 0.022 ? 28 : 160)) : 0), 0)
    if (i0 + n < out.length) out[i0 + n] += hp * e * amp
  }
}

// 軽い残響（くし形の遅れを 3 本）
function reverb(x, mix = 0.18) {
  const y = Float32Array.from(x)
  for (const [ms, fb] of [[37, 0.5], [53, 0.45], [71, 0.4]]) {
    const D = Math.floor((ms / 1000) * SR)
    const c = new Float32Array(x.length)
    for (let i = 0; i < x.length; i++) c[i] = x[i] + (i >= D ? c[i - D] * fb : 0)
    for (let i = 0; i < x.length; i++) y[i] += c[i] * mix / 3
  }
  return y
}

function finish(x, peak = 0.85) {
  let m = 0
  for (const v of x) m = Math.max(m, Math.abs(v))
  const g = m > 0 ? peak / m : 1
  // 終わり 20ms を消してプツッといわないように
  const fade = Math.floor(0.02 * SR)
  return x.map((v, i) => v * g * Math.min(1, (x.length - i) / fade))
}

function wav(name, x) {
  const b = Buffer.alloc(44 + x.length * 2)
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22)
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(x.length * 2, 40)
  x.forEach((v, i) => b.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2))
  writeFileSync(join(OUT, `${name}.wav`), b)
}

// ---- 9 個（2026-11-16 v2: RPG っぽさをやめてポップに。木琴・カリンバ・オルゴール・泡の「ぽん」・手拍子） ----
// 泡がはじける「ぽん」: 低い所から上へすばやくすべるサイン波
const pop = (x, t, f = 500, amp = 0.3, dur = 0.05) => voice(x, { t, f, dur, kind: 'sine', amp, a: 0.002, d: dur, s: 0.1, r: 0.03, bend: 1.3 })
const sounds = {
  // 1 スタート: ぽんぽん（泡）→ 木琴で跳ねるメロディ → オルゴールの和音
  '01-start': () => {
    const x = buf(2.2)
    pop(x, 0, 420, 0.28); pop(x, 0.09, 560, 0.28)
    ;[[N.C6, 0.2], [N.G5, 0.32], [N.E6, 0.44], [N.G6, 0.62]].forEach(([n, t]) => voice(x, { t, f: midi(n), dur: 0.05, kind: 'marimba', amp: 0.35, r: 0.4 }))
    ;[N.C6, N.E6, N.G6, N.C7].forEach((n, i) => voice(x, { t: 0.62 + i * 0.03, f: midi(n), dur: 0.05, kind: 'musicbox', amp: 0.13, r: 1.2 }))
    return reverb(x, 0.18)
  },
  // 2 チェックイン: 「ぽぽん♪」＋手拍子＋きらっ
  '02-checkin': () => {
    const x = buf(1.2)
    pop(x, 0, 480, 0.25)
    voice(x, { t: 0.06, f: midi(N.G5), dur: 0.05, kind: 'marimba', amp: 0.35, r: 0.3 })
    voice(x, { t: 0.18, f: midi(N.C6), dur: 0.05, kind: 'marimba', amp: 0.38, r: 0.5 })
    voice(x, { t: 0.18, f: midi(N.E6), dur: 0.05, kind: 'marimba', amp: 0.2, r: 0.5 })
    clap(x, 0.18, 0.18)
    voice(x, { t: 0.3, f: midi(N.G6), dur: 0.04, kind: 'musicbox', amp: 0.1, r: 0.8 })
    return reverb(x, 0.15)
  },
  // 3 霧が晴れる: やわらかい「ふわっ」＋上っていく小さな泡
  '03-fog-clear': () => {
    const x = buf(1.5)
    noise(x, { t: 0, dur: 1.2, amp: 0.25, from: 250, to: 1500, a: 0.3 })
    ;[0.2, 0.32, 0.42, 0.5, 0.58, 0.65].forEach((t, i) => pop(x, t, 500 + i * 140, 0.12 + i * 0.01, 0.035))
    voice(x, { t: 0.7, f: midi(N.E6), dur: 0.04, kind: 'kalimba', amp: 0.12, r: 0.6 })
    voice(x, { t: 0.78, f: midi(N.A6), dur: 0.04, kind: 'kalimba', amp: 0.1, r: 0.6 })
    return reverb(x, 0.2)
  },
  // 4 コイン: 「ピロン」（明るい 2 音、丸い音）
  '04-coin': () => {
    const x = buf(0.6)
    voice(x, { t: 0, f: midi(N.E6), dur: 0.04, kind: 'kalimba', amp: 0.3, r: 0.2, decay: 12 })
    voice(x, { t: 0.06, f: midi(N.C7), dur: 0.06, kind: 'kalimba', amp: 0.34, r: 0.35, decay: 7 })
    voice(x, { t: 0.06, f: midi(N.C7) * 2, dur: 0.02, kind: 'sine', amp: 0.04, r: 0.15 })
    return reverb(x, 0.12)
  },
  // 5 Lv アップ: 泡がぽこぽこ上って、木琴の和音でぱっ
  '05-levelup': () => {
    const x = buf(1.8)
    ;[N.C5, N.E5, N.G5, N.A5, N.C6, N.D6, N.E6, N.G6].forEach((n, i) => voice(x, { t: i * 0.045, f: midi(n), dur: 0.03, kind: 'marimba', amp: 0.22 + i * 0.01, r: 0.15, decay: 14 }))
    ;[N.C6, N.E6, N.G6].forEach((n) => voice(x, { t: 0.42, f: midi(n), dur: 0.06, kind: 'marimba', amp: 0.25, r: 0.6 }))
    clap(x, 0.42, 0.18)
    ;[N.C7, N.E7, N.G6, N.C7].forEach((n, i) => voice(x, { t: 0.5 + i * 0.07, f: midi(n), dur: 0.04, kind: 'musicbox', amp: 0.09, r: 0.8 }))
    return reverb(x, 0.18)
  },
  // 6 達成: 「ピロリン♪」（カリンバの 3 音）＋きらきら
  '06-achieve': () => {
    const x = buf(1.4)
    ;[[N.G5, 0], [N.C6, 0.08], [N.E6, 0.16], [N.G6, 0.3]].forEach(([n, t], i) => voice(x, { t, f: midi(n), dur: 0.05, kind: 'kalimba', amp: i === 3 ? 0.32 : 0.26, r: i === 3 ? 0.8 : 0.3 }))
    ;[N.C7, N.E7].forEach((n, i) => voice(x, { t: 0.36 + i * 0.06, f: midi(n), dur: 0.03, kind: 'musicbox', amp: 0.08, r: 0.7 }))
    return reverb(x, 0.2)
  },
  // 7 町のクリア: 木琴の跳ねる短いメロディ＋手拍子 2 回＋低い弾む音＋オルゴールのきらきら（いちばんにぎやか）
  '07-town-clear': () => {
    const x = buf(2.6)
    const mel = [[N.C6, 0], [N.C6, 0.12], [N.G5, 0.24], [N.C6, 0.36], [N.E6, 0.54], [N.D6, 0.66], [N.E6, 0.78], [N.G6, 0.96]]
    mel.forEach(([n, t], i) => voice(x, { t, f: midi(n), dur: 0.05, kind: 'marimba', amp: i === 7 ? 0.38 : 0.3, r: i === 7 ? 0.9 : 0.25 }))
    ;[[N.C4, 0], [N.G4, 0.36], [N.C5, 0.96]].forEach(([n, t]) => voice(x, { t, f: midi(n), dur: 0.08, kind: 'kalimba', amp: 0.3, r: 0.3, decay: 8 }))
    ;[N.C6, N.E6, N.G6].forEach((n) => voice(x, { t: 0.96, f: midi(n), dur: 0.06, kind: 'marimba', amp: 0.18, r: 0.9 }))
    clap(x, 0.54, 0.16); clap(x, 0.96, 0.2)
    ;[N.C7, N.G6, N.E7, N.C7, N.G6].forEach((n, i) => voice(x, { t: 1.0 + i * 0.08, f: midi(n), dur: 0.03, kind: 'musicbox', amp: 0.09, r: 0.9 }))
    return reverb(x, 0.18)
  },
  // 8 キラーン: ひゅっと上へすべる口笛風＋オルゴールのきらきら
  '08-reveal': () => {
    const x = buf(1.3)
    voice(x, { t: 0, f: midi(N.G5), dur: 0.16, kind: 'sine', amp: 0.14, a: 0.02, s: 0.8, r: 0.08, bend: 1.0 })
    ;[N.E7, N.C7, N.G6, N.E7].forEach((n, i) => voice(x, { t: 0.16 + i * 0.05, f: midi(n), dur: 0.03, kind: 'musicbox', amp: 0.14 - i * 0.015, r: 0.6 }))
    return reverb(x, 0.22)
  },
  // 9 タップ: 小さな泡の「ぽこっ」
  '09-tap': () => {
    const x = buf(0.09)
    voice(x, { t: 0, f: 520, dur: 0.035, kind: 'sine', amp: 0.5, a: 0.002, d: 0.035, s: 0.15, r: 0.02, bend: 1.1 })
    return x
  },
}

mkdirSync(OUT, { recursive: true })
const peaks = { '09-tap': 0.45, '04-coin': 0.7 } // タップはいちばん小さく
for (const [name, make] of Object.entries(sounds)) wav(name, finish(make(), peaks[name] ?? 0.85))
console.log('wrote', Object.keys(sounds).length, 'sounds to', OUT)

// もぐもGO の BGM 2 曲（昼・夜）をコードで合成して WAV にする（2026-11-16、A6）。
// 使い方: node art/sound/bgm-synth.mjs → art/sound/bgm/day.wav・night.wav
//   m4a へ: ffmpeg -y -i day.wav -c:a aac -b:a 96k day.m4a（night も同じ）
// 音色は効果音（sfx-synth.mjs の v2 ポップ: 木琴・カリンバ・オルゴール・泡・手拍子）に合わせる。
// 矩形波のリード・金管・ティンパニなど「RPG っぽい」音は使わない。
// つなぎ目: 曲の長さは小節ちょうど。残響と音の余韻を曲の後ろまで描いてから頭に重ねるので、
//   終わり → 頭がそのままつながる（プツッ・余韻の切れなし）。
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'bgm')
const TAIL = 4 // 余韻のために余分に描く秒数（あとで頭に重ねる）

// ---- 部品（voice は sfx-synth.mjs と同じ作り） ----
const midi = (n) => 440 * 2 ** ((n - 69) / 12)
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
// 'E5'・'Bb4'・'F#5' → MIDI 番号（C4 = 60）
function nn(name) {
  if (typeof name === 'number') return name
  const m = /^([A-G])([b#]?)(\d)$/.exec(name)
  if (!m) throw new Error(`音名が読めない: ${name}`)
  return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12
}

const HARM = {
  sine: [[1, 1]],
  tri: [1, 3, 5, 7, 9].map((k, j) => [k, (j % 2 ? -1 : 1) / (k * k)]),
  marimba: [[1, 1], [4.0, 0.22], [9.9, 0.04]],
  kalimba: [[1, 1], [2.0, 0.1], [5.9, 0.06]],
  musicbox: [[1, 1], [2.0, 0.3], [3.0, 0.08], [4.2, 0.05]],
}
const DECAY = { marimba: 9, kalimba: 5, musicbox: 4 }

function voice(out, { t, f, dur, kind = 'sine', amp = 0.3, a = 0.005, d = 0.1, s = 0.6, r = 0.15, bend = 0, vib = 0, decay = 0 }) {
  const i0 = Math.floor(t * SR)
  const len = Math.floor((dur + r) * SR)
  const harm = HARM[kind] ?? HARM.sine
  const dk = decay || DECAY[kind] || 0
  const ph = harm.map(() => 0)
  for (let n = 0; n < len; n++) {
    const tt = n / SR
    let e
    if (tt < a) e = tt / a
    else if (tt < a + d) e = 1 - (1 - s) * ((tt - a) / d)
    else if (tt < dur) e = s
    else e = s * Math.max(0, 1 - (tt - dur) / r)
    if (dk) e *= Math.exp(-tt * dk) // 叩く楽器は自然に減る
    const ff = f * (1 + bend * Math.min(1, tt / Math.max(dur, 0.001))) * (1 + vib * Math.sin(2 * Math.PI * 5.5 * tt))
    let v = 0
    for (let j = 0; j < harm.length; j++) {
      const hf = ff * harm[j][0]
      if (hf < SR / 2.2) { ph[j] += (2 * Math.PI * hf) / SR; v += harm[j][1] * Math.sin(ph[j]) }
    }
    const idx = i0 + n
    if (idx >= 0 && idx < out.length) out[idx] += v * e * amp
  }
}

// 泡の「ぽん」
const pop = (x, t, f = 500, amp = 0.3, dur = 0.05) => voice(x, { t, f, dur, kind: 'sine', amp, a: 0.002, d: dur, s: 0.1, r: 0.03, bend: 1.3 })
// やわらかいキック（低いサイン波が下へすべる。小さく）
const kick = (x, t, amp = 0.3) => voice(x, { t, f: 135, dur: 0.09, kind: 'sine', amp, a: 0.002, d: 0.09, s: 0.2, r: 0.05, bend: -0.6, decay: 22 })
// 木のこつん（リムの代わり）
const tock = (x, t, f, amp = 0.1) => voice(x, { t, f, dur: 0.02, kind: 'marimba', amp, a: 0.001, r: 0.05, decay: 60 })

let seedCounter = 1
// シェイカー（高い雑音を短く。たたくたびに雑音の種を変える）
function shaker(out, t, amp = 0.05, dec = 70, lenSec = 0.09) {
  let seed = (seedCounter++ * 7919) & 0x7fffffff, hp = 0, hp2 = 0, p1 = 0, p2 = 0
  const i0 = Math.floor(t * SR), len = Math.floor(lenSec * SR)
  for (let n = 0; n < len; n++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    const w = seed / 0x7fffffff * 2 - 1
    hp = 0.8 * (hp + w - p1); p1 = w
    hp2 = 0.8 * (hp2 + hp - p2); p2 = hp
    const tt = n / SR
    const e = (1 - Math.exp(-tt * 900)) * Math.exp(-tt * dec)
    if (i0 + n < out.length) out[i0 + n] += hp2 * e * amp
  }
}
// 手拍子（sfx と同じ形。3 回すばやく）
function clap(out, t, amp = 0.1) {
  let seed = (seedCounter++ * 104729) & 0x7fffffff, hp = 0, prev = 0
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

// 残響（響きだけを返す。くし形 4 本＋高い音を少しずつ吸う＋全域通過 2 本）
function reverbWet(x, rt60, spreadMs = 0) {
  const y = new Float32Array(x.length)
  for (const ms of [29.7, 37.1, 41.1, 43.7]) {
    const D = Math.floor(((ms + spreadMs) / 1000) * SR)
    const fb = 10 ** ((-3 * D) / (rt60 * SR))
    const c = new Float32Array(x.length)
    let lp = 0
    for (let i = 0; i < x.length; i++) {
      const back = i >= D ? c[i - D] : 0
      lp += 0.45 * (back - lp) // 高い音は早く消える
      c[i] = x[i] + lp * fb
      y[i] += back * 0.25
    }
  }
  let z = y
  for (const ms of [5.0, 1.7]) {
    const D = Math.floor(((ms + spreadMs * 0.3) / 1000) * SR)
    const o = new Float32Array(z.length), g = 0.5
    for (let i = 0; i < z.length; i++) {
      const xd = i >= D ? z[i - D] : 0, od = i >= D ? o[i - D] : 0
      o[i] = -g * z[i] + xd + g * od
    }
    z = o
  }
  return z
}

// ---- 曲の入れ物 ----
// tracks: 名前 → { pan: -1〜1, send: 残響へ送る量, gain }
function makeSong({ bpm, bars, swing = 0, tracks }) {
  const spb = 60 / bpm
  const loopLen = Math.round(bars * 4 * spb * SR)
  const total = loopLen + TAIL * SR
  const T = {}
  for (const [k, v] of Object.entries(tracks)) T[k] = { ...v, buf: new Float32Array(total) }
  // 拍 → 秒（裏拍を少し後ろへ = はねる）
  const sec = (bar, beat) => {
    const whole = Math.floor(beat), fr = beat - whole
    const w = fr < 0.5 ? fr * (1 + 2 * swing) : 0.5 + swing + (fr - 0.5) * (1 - 2 * swing)
    return (bar * 4 + whole + w) * spb
  }
  // 音を 1 つ置く
  const note = (track, bar, beat, name, lenBeats, o = {}) =>
    voice(T[track].buf, { t: sec(bar, beat), f: midi(nn(name) + (o.oct ?? 0) * 12), dur: lenBeats * spb, ...o })
  // '0 E5 .5, .5 G5 .5' の形のフレーズを置く
  const phrase = (track, bar, text, o = {}) => {
    for (const part of text.split(',')) {
      const [b, name, len] = part.trim().split(/\s+/)
      const beat = Number(b)
      const acc = beat === 0 ? 1.12 : beat % 1 === 0 ? 1 : 0.88 // 頭を少し強く、裏を少し弱く
      note(track, bar, beat, name, Number(len), { ...o, amp: (o.amp ?? 0.2) * acc })
    }
  }
  function render(rt60, wetGain, peak) {
    const L = new Float32Array(total), R = new Float32Array(total), send = new Float32Array(total)
    if (process.env.BGM_STATS) {
      // 調整用: トラックごとの山と平均（BGM_STATS=1 node art/sound/bgm-synth.mjs）
      for (const [k, tr] of Object.entries(T)) {
        let pk = 0, sq = 0, at = 0
        tr.buf.forEach((v, i) => { sq += v * v; if (Math.abs(v) > pk) { pk = Math.abs(v); at = i } })
        console.log(`  ${k.padEnd(6)} 山 ${pk.toFixed(3)}（${(at / SR).toFixed(2)} 秒） 平均 ${(10 * Math.log10(sq / total + 1e-12)).toFixed(1)} dB`)
      }
    }
    for (const tr of Object.values(T)) {
      const g = tr.gain ?? 1
      const gl = g * Math.cos(((tr.pan + 1) * Math.PI) / 4), gr = g * Math.sin(((tr.pan + 1) * Math.PI) / 4)
      for (let i = 0; i < total; i++) {
        const v = tr.buf[i]
        if (v === 0) continue
        L[i] += v * gl * 1.414; R[i] += v * gr * 1.414; send[i] += v * g * tr.send
      }
    }
    const wl = reverbWet(send, rt60, 0), wr = reverbWet(send, rt60, 0.9)
    for (let i = 0; i < total; i++) { L[i] += wl[i] * wetGain; R[i] += wr[i] * wetGain }
    // 余韻を頭に重ねる（ループのつなぎ目）
    const oL = L.slice(0, loopLen), oR = R.slice(0, loopLen)
    for (let i = loopLen; i < total; i++) { oL[i - loopLen] += L[i]; oR[i - loopLen] += R[i] }
    let m = 0
    for (let i = 0; i < loopLen; i++) m = Math.max(m, Math.abs(oL[i]), Math.abs(oR[i]))
    const g = peak / m
    if (process.env.BGM_STATS) console.log(`  全体の山 ${m.toFixed(3)} → ${g.toFixed(2)} 倍`)
    for (let i = 0; i < loopLen; i++) { oL[i] *= g; oR[i] *= g }
    return { L: oL, R: oR, seconds: loopLen / SR }
  }
  return { T, sec, spb, note, phrase, render }
}

function wavStereo(name, { L, R }) {
  const n = L.length
  const b = Buffer.alloc(44 + n * 4)
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 4, 4); b.write('WAVE', 8)
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(2, 22)
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 4, 28); b.writeUInt16LE(4, 32); b.writeUInt16LE(16, 34)
  b.write('data', 36); b.writeUInt32LE(n * 4, 40)
  const q = (v) => Math.round(Math.max(-1, Math.min(1, v)) * 32767)
  for (let i = 0; i < n; i++) { b.writeInt16LE(q(L[i]), 44 + i * 4); b.writeInt16LE(q(R[i]), 46 + i * 4) }
  writeFileSync(join(OUT, `${name}.wav`), b)
}

// ============================================================
// 昼: 「おさんぽ」 ハ長調・110 BPM・32 小節（約 70 秒）・少しはねる
//   1〜8  A  : 木琴のメロディ
//   9〜16 A' : 木琴＋オルゴールの重ね、手拍子
//   17〜24 B : カリンバのゆったりしたメロディ（木琴は分散和音に回る）
//   25〜32 休み: メロディなし。カリンバの分散和音＋オルゴールのひとこと（耳を休める）→ 頭へ
// ============================================================
function day() {
  const S = makeSong({
    bpm: 110, bars: 32, swing: 0.07,
    tracks: {
      mel: { pan: -0.12, send: 0.3 },
      box: { pan: 0.4, send: 0.45, gain: 1.5 },
      kal: { pan: 0.3, send: 0.3 },
      chord: { pan: -0.35, send: 0.22, gain: 1.2 },
      bass: { pan: 0, send: 0.03, gain: 0.62 }, // 低い音は山を食うので控えめに
      pad: { pan: 0, send: 0.35 },
      perc: { pan: 0.15, send: 0.1 },
      clap: { pan: -0.2, send: 0.18, gain: 1.8 },
    },
  })
  const { T, sec, note, phrase } = S
  // 和音: [低音, 押さえる音…]
  const CH = {
    C: [48, 'C4', 'E4', 'G4'], Am: [45, 'C4', 'E4', 'A4'], F: [53, 'C4', 'F4', 'A4'], G: [43, 'B3', 'D4', 'G4'],
    Dm: [50, 'D4', 'F4', 'A4'], Em: [52, 'B3', 'E4', 'G4'],
  }
  const prog = [
    'C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G',
    'C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'C',
    'F', 'G', 'Em', 'Am', 'F', 'G', 'C', 'G',
    'C', 'Am', 'F', 'G', 'C', 'Am', 'Dm', 'G',
  ]
  const melA = [
    '0 E5 .5, .5 G5 .5, 1 C6 1, 2.5 A5 .5, 3 G5 1',
    '0 E5 .5, .5 G5 .5, 1 A5 1.5, 3 E5 .5, 3.5 D5 .5',
    '0 C5 .5, .5 F5 .5, 1 A5 1, 2.5 G5 .5, 3 F5 1',
    '0 D5 .5, .5 G5 .5, 1 B5 1, 2 A5 .5, 2.5 G5 1.5',
    '0 E5 .5, .5 G5 .5, 1 C6 1, 2.5 D6 .5, 3 C6 1',
    '0 A5 .5, .5 C6 .5, 1 E6 1.5, 3 D6 .5, 3.5 C6 .5',
    '0 A5 1, 1 F5 .5, 1.5 A5 .5, 2 D6 1, 3 C6 .5, 3.5 A5 .5',
    '0 G5 1.5, 1.5 B5 .5, 2 D6 1.5',
  ]
  const melA2 = [
    '0 E5 .5, .5 G5 .5, 1 C6 1, 2.5 A5 .5, 3 G5 .5, 3.5 E5 .5',
    '0 A5 1, 1 E5 .5, 1.5 A5 .5, 2 C6 1.5, 3.5 A5 .5',
    '0 F5 .5, .5 A5 .5, 1 C6 1, 2.5 A5 .5, 3 F5 1',
    '0 G5 1, 1 B5 .5, 1.5 D6 .5, 2 G5 1.5',
    '0 E6 .5, .5 D6 .5, 1 C6 1, 2.5 G5 .5, 3 E5 1',
    '0 A5 .5, .5 C6 .5, 1 E6 1.5, 3 D6 .5, 3.5 C6 .5',
    '0 A5 1, 1 C6 .5, 1.5 A5 .5, 2 F5 1, 3 A5 .5, 3.5 B5 .5',
    '0 C6 1, 1 G5 .5, 1.5 E5 .5, 2 C5 1.5',
  ]
  const melB = [
    '0 A5 1.5, 1.5 C6 .5, 2 F5 2',
    '0 B5 1.5, 1.5 D6 .5, 2 G5 2',
    '0 G5 1, 1 B5 1, 2 E6 1.5, 3.5 D6 .5',
    '0 C6 2, 2 A5 1, 3 E5 1',
    '0 F5 .5, .5 A5 .5, 1 C6 1, 2 A5 .5, 2.5 C6 .5, 3 F6 1',
    '0 D6 1.5, 1.5 B5 .5, 2 G5 1, 3 B5 1',
    '0 C6 1, 1 E6 1, 2 G5 2',
    '0 D5 .5, .5 G5 .5, 1 B5 .5, 1.5 D6 .5, 2 G5 1',
  ]
  // 休みの段のオルゴールのひとこと（小節番号 → フレーズ）
  const boxBreak = {
    25: '2 E6 .5, 2.5 G6 .5, 3 A6 1', 27: '2 G6 .5, 2.5 D6 .5, 3 B5 1',
    29: '2 E6 .5, 2.5 C6 .5, 3 A5 1', 30: '0 D6 1, 2 A5 .5, 2.5 F6 1.5',
  }

  for (let bar = 0; bar < 32; bar++) {
    const sect = bar >> 3 // 0:A 1:A' 2:B 3:休み
    const k = bar & 7
    const [root, ...tones] = CH[prog[bar]]
    const fifth = root + 7

    // ---- ベース（やわらかくはじく音。スマホでも聞こえるよう 1 オクターブ上を少し足す） ----
    const bassNote = (beat, n, len, amp) => {
      note('bass', bar, beat, n, len, { kind: 'tri', amp, a: 0.004, s: 0.8, r: 0.08, decay: 4.5 })
      note('bass', bar, beat, n + 12, len, { kind: 'sine', amp: amp * 0.3, a: 0.004, s: 0.8, r: 0.08, decay: 6 })
    }
    if (sect === 2) { bassNote(0, root, 1.4, 0.3); bassNote(2.5, fifth, 0.5, 0.2); bassNote(3, root, 0.9, 0.24) }
    else if (sect === 3 && k < 4) { bassNote(0, root, 1.8, 0.28); bassNote(2.5, root, 0.5, 0.18) }
    else { bassNote(0, root, 0.9, 0.3); bassNote(1.5, fifth, 0.45, 0.2); bassNote(2, root, 0.9, 0.26); bassNote(3, fifth, 0.5, 0.2); if (k % 2) bassNote(3.5, root + 12, 0.4, 0.14) }

    // ---- 和音 ----
    if (sect < 2) {
      // 木琴の合いの手（2・4 拍目と 3 拍目の裏）
      for (const [beat, a] of [[1, 0.075], [2.5, 0.05], [3, 0.07]]) tones.forEach((n) => note('chord', bar, beat, n, 0.2, { kind: 'marimba', amp: a, r: 0.2 }))
    } else if (sect === 2) {
      // 木琴の分散和音（静かに）
      const seq = [0, 1, 2, 1, 0, 1, 2, 1]
      seq.forEach((ix, j) => note('chord', bar, j * 0.5, tones[ix], 0.3, { kind: 'marimba', amp: j % 2 ? 0.055 : 0.07, r: 0.2, oct: 1 }))
    } else {
      // カリンバの分散和音
      const pool = [tones[0], tones[1], tones[2], nn(tones[0]) + 12]
      const seq = [0, 1, 2, 1, 3, 2, 1, 2]
      seq.forEach((ix, j) => note('kal', bar, j * 0.5, pool[ix], 0.4, { kind: 'kalimba', amp: j === 0 ? 0.15 : j % 2 ? 0.1 : 0.125, r: 0.3, oct: 1 }))
    }
    // うすい和音の敷物（B と休みだけ）
    if (sect >= 2) tones.forEach((n) => note('pad', bar, 0, n, 3.9, { kind: 'sine', amp: 0.022, a: 0.5, d: 0.3, s: 0.9, r: 0.6, vib: 0.002 }))

    // ---- メロディ ----
    if (sect === 0) phrase('mel', bar, melA[k], { kind: 'marimba', amp: 0.27, r: 0.35 })
    if (sect === 1) {
      phrase('mel', bar, melA2[k], { kind: 'marimba', amp: 0.27, r: 0.35 })
      // オルゴールが小節の頭の音を 1 オクターブ上で重ねる
      const first = melA2[k].split(',')[0].trim().split(/\s+/)
      note('box', bar, 0, first[1], 0.5, { kind: 'musicbox', amp: 0.06, r: 0.8, oct: 1 })
      if (k === 7) ['C6', 'E6', 'G6'].forEach((n, i) => note('box', bar, 2 + i * 0.5, n, 0.4, { kind: 'musicbox', amp: 0.06, r: 0.8 }))
    }
    if (sect === 2) phrase('kal', bar, melB[k], { kind: 'kalimba', amp: 0.26, r: 0.5 })
    if (sect === 3) {
      if (boxBreak[bar]) phrase('box', bar, boxBreak[bar], { kind: 'musicbox', amp: 0.1, r: 0.9 })
      // 最後の小節: 木琴が頭へ送る
      if (k === 7) phrase('mel', bar, '2 G5 .5, 2.5 A5 .5, 3 B5 .5, 3.5 D6 .5', { kind: 'marimba', amp: 0.22, r: 0.3 })
    }

    // ---- 打つ音（全部小さく） ----
    const P = T.perc.buf
    const eighths = sect === 2 ? [0, 1, 2, 3] : [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
    for (const beat of eighths) {
      const off = beat % 1 !== 0
      shaker(P, sec(bar, beat), sect === 2 ? 0.035 : off ? 0.05 : 0.032, off ? 55 : 80)
    }
    if (sect === 2) shaker(P, sec(bar, 2.5), 0.03, 60)
    if (!(sect === 3 && k < 4)) {
      kick(P, sec(bar, 0), 0.26)
      kick(P, sec(bar, sect === 2 ? 2.5 : 2), 0.2)
    }
    if (sect === 0) { tock(P, sec(bar, 1), midi(79), 0.09); tock(P, sec(bar, 3), midi(79), 0.1) }
    if (sect === 1) { tock(P, sec(bar, 1), midi(79), 0.09); clap(T.clap.buf, sec(bar, 3), 0.085) }
    if (sect === 2) tock(P, sec(bar, 3), midi(79), 0.08)
    if (sect === 3) { tock(P, sec(bar, 1), midi(84), 0.07); clap(T.clap.buf, sec(bar, 3), k < 4 ? 0.06 : 0.08) }
    // 4 小節ごとの小さな合図（泡）
    if (k === 3 && sect !== 2) { pop(P, sec(bar, 3.5), 520, 0.09); }
    if (k === 7 && sect < 3) { pop(P, sec(bar, 3), 440, 0.08); pop(P, sec(bar, 3.5), 590, 0.1) }
    if (k === 7 && sect === 3) { clap(T.clap.buf, sec(bar, 3.5), 0.06); pop(P, sec(bar, 1.5), 480, 0.08) }
  }
  return S.render(1.0, 0.5, 0.68) // AAC にすると山が 2dB ほど上がるので WAV は -3.3dB
}

// ============================================================
// 夜: 「おやすみのまち」 ヘ長調・84 BPM・24 小節（約 69 秒）・はねない
//   1〜8  A  : オルゴールのメロディ＋カリンバの分散和音
//   9〜16 B  : カリンバのメロディ（低め）＋オルゴールは星のきらきらだけ
//   17〜24 A': オルゴールのメロディ（後半を変える）→ 頭へ
// ============================================================
function night() {
  const S = makeSong({
    bpm: 84, bars: 24, swing: 0,
    tracks: {
      box: { pan: -0.15, send: 0.5 },
      echo: { pan: 0.55, send: 0.6, gain: 1.3 },
      kal: { pan: 0.25, send: 0.35 },
      arp: { pan: -0.3, send: 0.3 },
      bass: { pan: 0, send: 0.05, gain: 0.65 },
      pad: { pan: 0, send: 0.4 },
      perc: { pan: 0.2, send: 0.2, gain: 2.5 },
    },
  })
  const { T, sec, note, phrase } = S
  const CH = {
    Fmaj7: [41, 'F3', 'A3', 'C4', 'E4'], Dm7: [38, 'F3', 'A3', 'C4', 'D4'], Bbmaj7: [46, 'Bb3', 'D4', 'F4', 'A4'],
    C: [36, 'G3', 'C4', 'E4', 'G4'], Gm7: [43, 'G3', 'Bb3', 'D4', 'F4'], Am7: [45, 'A3', 'C4', 'E4', 'G4'],
    Dm: [38, 'A3', 'D4', 'F4', 'A4'], Bb: [46, 'Bb3', 'D4', 'F4', 'Bb4'], F: [41, 'F3', 'A3', 'C4', 'F4'],
    C7: [36, 'G3', 'Bb3', 'C4', 'E4'],
  }
  const prog = [
    'Fmaj7', 'Dm7', 'Bbmaj7', 'C', 'Fmaj7', 'Dm7', 'Gm7', 'C',
    'Bb', 'C', 'Am7', 'Dm', 'Bb', 'C7', 'F', 'C',
    'Fmaj7', 'Dm7', 'Bbmaj7', 'C', 'Fmaj7', 'Dm7', 'Gm7', 'C',
  ]
  const mel = [
    // A
    '0 C6 1.5, 1.5 A5 .5, 2 F5 2',
    '0 D6 1.5, 1.5 A5 .5, 2 F5 1, 3 A5 1',
    '0 Bb5 1, 1 D6 1, 2 F6 1.5, 3.5 D6 .5',
    '0 C6 1.5, 1.5 G5 .5, 2 E5 2',
    '0 C6 1.5, 1.5 A5 .5, 2 F5 1, 3 G5 .5, 3.5 A5 .5',
    '0 D6 1, 1 C6 1, 2 A5 2',
    '0 Bb5 1, 1 G5 1, 2 D6 1, 3 Bb5 1',
    '0 C6 2, 2 G5 1.5',
    // B（カリンバ）
    '0 D5 1, 1 F5 1, 2 Bb5 2',
    '0 E5 1, 1 G5 1, 2 C6 2',
    '0 C6 1.5, 1.5 A5 .5, 2 E5 1, 3 G5 1',
    '0 F5 1, 1 A5 1, 2 D6 2',
    '0 D6 1, 1 Bb5 1, 2 F5 1, 3 D5 1',
    '0 E5 1, 1 G5 1, 2 Bb5 1, 3 C6 1',
    '0 A5 3, 3 C6 1',
    '0 F5 2, 2 G5 2',
    // A'
    '0 C6 1.5, 1.5 A5 .5, 2 F5 2',
    '0 D6 1.5, 1.5 A5 .5, 2 F5 1, 3 A5 1',
    '0 Bb5 1, 1 D6 1, 2 F6 1.5, 3.5 D6 .5',
    '0 C6 1.5, 1.5 G5 .5, 2 E5 2',
    '0 A5 1, 1 C6 1, 2 F6 1.5, 3.5 E6 .5',
    '0 D6 1.5, 1.5 C6 .5, 2 A5 2',
    '0 Bb5 1, 1 D6 1, 2 G5 1, 3 Bb5 1',
    '0 G5 1.5, 1.5 E5 .5, 2 C6 2',
  ]
  // B の星のきらきら（オルゴール、高い所でぽつぽつ）
  const stars = { 8: [[2.5, 'F6'], [3.5, 'D6']], 9: [[3, 'G6']], 10: [[2.5, 'E6']], 11: [[3, 'A6'], [3.5, 'F6']], 12: [[2.5, 'F6']], 13: [[3.5, 'G6']], 14: [[1, 'C6'], [1.5, 'F6'], [2, 'A6']], 15: [[3, 'E6']] }

  for (let bar = 0; bar < 24; bar++) {
    const sect = bar >> 3
    const [root, ...tones] = CH[prog[bar]]

    // ベース（丸いサイン波。スマホ用に 1 オクターブ上を足す）
    const bassNote = (beat, n, len, amp) => {
      note('bass', bar, beat, n, len, { kind: 'sine', amp, a: 0.01, s: 0.85, r: 0.25, decay: 1.6 })
      note('bass', bar, beat, n + 12, len, { kind: 'tri', amp: amp * 0.45, a: 0.01, s: 0.8, r: 0.25, decay: 2.5 })
    }
    bassNote(0, root, 2.3, 0.26)
    bassNote(2.5, root + 7, 1.3, 0.15)

    // カリンバの分散和音（8 分。B ではメロディをじゃましないよう 4 分に減らす）
    if (sect !== 1) {
      const seq = [0, 2, 1, 2, 3, 2, 1, 2]
      seq.forEach((ix, j) => note('arp', bar, j * 0.5, tones[ix], 0.6, { kind: 'kalimba', amp: j === 0 ? 0.11 : j % 2 ? 0.07 : 0.09, r: 0.5 }))
    } else {
      const seq = [0, 1, 2, 3]
      seq.forEach((ix, j) => note('arp', bar, j, tones[ix], 0.9, { kind: 'marimba', amp: 0.07, r: 0.5, decay: 5 }))
    }
    // うすい和音の敷物
    tones.slice(1).forEach((n) => note('pad', bar, 0, n, 3.95, { kind: 'sine', amp: 0.026, a: 0.7, d: 0.4, s: 0.9, r: 0.9, vib: 0.002 }))

    // メロディ
    if (sect === 1) {
      phrase('kal', bar, mel[bar], { kind: 'kalimba', amp: 0.24, r: 0.8, decay: 3.5 })
      for (const [beat, n] of stars[bar] ?? []) note('echo', bar, beat, n, 0.3, { kind: 'musicbox', amp: 0.05, r: 1.0 })
    } else {
      phrase('box', bar, mel[bar], { kind: 'musicbox', amp: 0.2, r: 1.0 })
      // やまびこ（付点 8 分おくれ・反対側・小さく）
      for (const part of mel[bar].split(',')) {
        const [b, n, len] = part.trim().split(/\s+/)
        if (Number(len) >= 1) note('echo', bar + Math.floor((Number(b) + 0.75) / 4), (Number(b) + 0.75) % 4, n, 0.4, { kind: 'musicbox', amp: 0.045, r: 0.9 })
      }
      // A' は頭の音を 1 オクターブ下のカリンバでそっと支える
      if (sect === 2) note('kal', bar, 0, mel[bar].trim().split(/\s+/)[1], 1.5, { kind: 'kalimba', amp: 0.08, r: 0.6, oct: -1 })
    }

    // 打つ音はごく小さいシェイカーだけ（2・4 拍目）。A の前半は無し
    if (bar >= 4) {
      shaker(T.perc.buf, sec(bar, 1), 0.022, 35, 0.14)
      shaker(T.perc.buf, sec(bar, 3), 0.028, 35, 0.14)
      if (sect === 1) shaker(T.perc.buf, sec(bar, 2.5), 0.016, 45, 0.12)
    }
  }
  return S.render(1.6, 0.6, 0.68)
}

mkdirSync(OUT, { recursive: true })
for (const [name, make] of [['day', day], ['night', night]]) {
  const song = make()
  wavStereo(name, song)
  let sq = 0
  for (let i = 0; i < song.L.length; i++) sq += song.L[i] ** 2 + song.R[i] ** 2
  const rms = 10 * Math.log10(sq / (song.L.length * 2))
  console.log(`${name}.wav  ${song.seconds.toFixed(2)} 秒  平均の大きさ ${rms.toFixed(1)} dB`)
}

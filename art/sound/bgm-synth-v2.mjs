// もぐもGO の BGM 第 2 案（昼・夜）をコードで合成して WAV にする（2026-11-16、A6。v1 = bgm-synth.mjs と聴き比べる用）。
// 使い方: node art/sound/bgm-synth-v2.mjs → art/sound/bgm/day-v2.wav・night-v2.wav
//   m4a へ: ffmpeg -y -i day-v2.wav -c:a aac -b:a 96k day-v2.m4a（night-v2 も同じ）
//   調整用: BGM_STATS=1 を付けるとトラックごとの音量が出る
// オーナーの注文: 昼 = 木琴とチェレスタの主旋律・アコースティックギター・弦のピチカート・木管・軽い打楽器。
//                夜 = ピアノの主旋律・オルゴール・チェレスタ・ギター・うすい弦。
// 楽器は全部ここで合成する（素材なし）: ギターとピチカートは弦の模型（Karplus-Strong）、
//   ピアノ・チェレスタ・木琴・オルゴールは倍音の足し算、木管は倍音＋ビブラート＋息の雑音、弦の敷物は少しずらした音の重ね。
// メロディはこの曲のために書いたもの（既存の曲はまねしない）。
// つなぎ目: 長さは小節ちょうど。余韻を後ろまで描いてから頭に重ねる。
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SR = 44100
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'bgm')

const midi = (n) => 440 * 2 ** ((n - 69) / 12)
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
function nn(name) {
  if (typeof name === 'number') return name
  const m = /^([A-G])([b#]?)(\d)$/.exec(name)
  if (!m) throw new Error(`音名が読めない: ${name}`)
  return SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12
}
let seedCounter = 1
function rng(mult = 7919) {
  let seed = (seedCounter++ * mult + 13) & 0x7fffffff
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff * 2 - 1 }
}

// ---- 楽器 ----
// 倍音の足し算。partials = [倍率, 大きさ, 減る速さの倍率]。decay = 0 なら鳴り続ける音
function add(out, { t, f, dur, amp = 0.2, partials, decay = 0, a = 0.004, r = 0.15, vib = 0, vibHz = 5 }) {
  const i0 = Math.floor(t * SR), len = Math.floor((dur + r) * SR)
  const P = partials.filter(([k]) => f * k < SR / 2.2)
  const inc = P.map(([k]) => (2 * Math.PI * f * k) / SR)
  const ph = P.map(() => 0)
  const dk = P.map(([, , m = 1]) => Math.exp((-decay * m) / SR))
  const g = P.map(([, gain]) => gain)
  for (let n = 0; n < len; n++) {
    const tt = n / SR
    let e = tt < a ? tt / a : 1
    if (tt > dur) e *= Math.max(0, 1 - (tt - dur) / r)
    const vm = vib ? 1 + vib * Math.sin(2 * Math.PI * vibHz * tt) : 1
    let v = 0
    for (let j = 0; j < P.length; j++) {
      ph[j] += inc[j] * vm
      v += g[j] * Math.sin(ph[j])
      if (decay) g[j] *= dk[j]
    }
    const idx = i0 + n
    if (idx >= 0 && idx < out.length) out[idx] += v * e * amp
  }
}
const marimba = (out, o) => add(out, { partials: [[1, 1, 1], [4.0, 0.22, 1.6], [9.9, 0.04, 3]], decay: 8, r: 0.3, ...o })
const musicbox = (out, o) => add(out, { partials: [[1, 1, 1], [2.0, 0.3, 1.3], [3.0, 0.08, 2], [4.2, 0.05, 3]], decay: 4, r: 0.9, ...o })
// チェレスタ: 丸い鈴。高い倍音はすぐ消える
const celesta = (out, o) => add(out, { partials: [[1, 1, 1], [2, 0.08, 1.5], [3, 0.18, 2], [4, 0.06, 2.5], [6, 0.04, 4], [9.2, 0.05, 12]], decay: 3.6, r: 0.6, ...o })
// ピアノ（やわらかめ）: 少し広がった倍音・高い倍音ほど早く消える・弦 2 本ぶんのわずかなずれ
function piano(out, o) {
  const f = o.f
  const B = 0.0004, soft = Math.min(1, 700 / f) // 高い音ほど倍音を減らす
  const partials = []
  ;[1, 0.5, 0.26, 0.13, 0.08, 0.045, 0.025].forEach((g, i) => {
    const k = i + 1, ratio = k * Math.sqrt(1 + B * k * k), gg = i === 0 ? g : g * soft
    if (i < 2) { partials.push([ratio, gg * 0.55, 1 + 0.5 * i], [ratio * 1.0008, gg * 0.45, 1 + 0.5 * i]) }
    else partials.push([ratio, gg, 1 + 0.5 * i])
  })
  add(out, { partials, decay: 0.85 * (f / 262) ** 0.6, a: 0.006, r: 0.35, ...o })
}
// 弦をはじく模型（Karplus-Strong）。ギターとピチカートに使う
function pluck(out, { t, f, dur, amp = 0.2, t60 = 1.5, bright = 0.5, damp = 0.5, pos = 0.22, r = 0.08 }) {
  const D = SR / f - damp
  const len = Math.floor((dur + r) * SR)
  const y = new Float32Array(len)
  const ne = Math.floor(D)
  const rand = rng()
  // はじいた瞬間の形（雑音を丸めたもの。はじく位置のくし形を掛ける）
  const exc = new Float32Array(ne)
  let lp = 0, mean = 0
  for (let i = 0; i < ne; i++) { lp += bright * (rand() - lp); exc[i] = lp; mean += lp / ne }
  const pk = Math.max(1, Math.round(pos * ne))
  let mx = 1e-9
  for (let i = ne - 1; i >= 0; i--) { exc[i] = exc[i] - mean - (i >= pk ? exc[i - pk] - mean : 0); mx = Math.max(mx, Math.abs(exc[i])) }
  const g = 10 ** (-3 / (f * t60))
  const rd = (x) => { if (x < 0) return 0; const i = Math.floor(x), fr = x - i; return y[i] * (1 - fr) + y[i + 1] * fr }
  const i0 = Math.floor(t * SR), relStart = dur * SR
  for (let n = 0; n < len; n++) {
    const v = (n < ne ? exc[n] / mx : 0) + g * ((1 - damp) * rd(n - D) + damp * rd(n - D - 1))
    y[n] = v
    const e = n > relStart ? Math.max(0, 1 - (n - relStart) / (r * SR)) : 1
    const idx = i0 + n
    if (idx >= 0 && idx < out.length) out[idx] += v * e * amp
  }
}
const guitar = (out, o) => pluck(out, { t60: 3, bright: 0.5, damp: 0.12, pos: 0.18, ...o }) // 測って決めた値: 0.5 秒で約 -15dB
const pizz = (out, o) => pluck(out, { t60: 0.9, bright: 0.3, damp: 0.3, pos: 0.3, ...o })
// 木管（flute / clarinet）: 倍音＋おくれて掛かるビブラート＋息の雑音
function wind(out, { t, f, dur, amp = 0.1, kind = 'flute', a = 0.05, r = 0.09 }) {
  const harm = kind === 'flute' ? [[1, 1], [2, 0.28], [3, 0.1], [4, 0.04]] : [[1, 1], [2, 0.04], [3, 0.4], [5, 0.18], [7, 0.07], [9, 0.03]]
  const breath = kind === 'flute' ? 0.05 : 0.012
  const i0 = Math.floor(t * SR), len = Math.floor((dur + r) * SR)
  const ph = harm.map(() => 0)
  const rand = rng(104729)
  let lp = 0, lp2 = 0
  const kc = 1 - Math.exp((-2 * Math.PI * Math.min(6000, f * 3)) / SR)
  for (let n = 0; n < len; n++) {
    const tt = n / SR
    let e = tt < a ? (tt / a) ** 1.5 : 0.85 + 0.15 * Math.min(1, (tt - a) / 0.3)
    if (tt > dur) e *= Math.max(0, 1 - (tt - dur) / r)
    const vd = Math.min(1, Math.max(0, (tt - 0.18) / 0.25))
    const lfo = Math.sin(2 * Math.PI * 5.2 * tt)
    const ff = f * (1 + 0.0045 * vd * lfo)
    let v = 0
    for (let j = 0; j < harm.length; j++) {
      const hf = ff * harm[j][0]
      if (hf < SR / 2.2) { ph[j] += (2 * Math.PI * hf) / SR; v += harm[j][1] * Math.sin(ph[j]) }
    }
    lp += kc * (rand() - lp); lp2 += 0.05 * (lp - lp2)
    v += (lp - lp2) * breath * (1 + 3 * Math.exp(-tt * 30)) * 3
    const idx = i0 + n
    if (idx >= 0 && idx < out.length) out[idx] += v * e * (1 + 0.06 * vd * lfo) * amp
  }
}
// 弦の敷物: 丸めたのこぎり波を 2 本、少しずらして重ねる。ゆっくり出てゆっくり消える
function strings(out, { t, f, dur, amp = 0.03, detune = 0.003, a = 0.9, r = 1.3 }) {
  const i0 = Math.floor(t * SR), len = Math.floor((dur + r) * SR)
  const K = [1, 2, 3, 4, 5, 6].filter((k) => f * k < 5000)
  const ph = [K.map(() => 0), K.map((_, j) => j * 1.3)]
  const fs = [f * (1 - detune), f * (1 + detune)]
  for (let n = 0; n < len; n++) {
    const tt = n / SR
    let e = tt < a ? 0.5 - 0.5 * Math.cos((Math.PI * tt) / a) : 1
    if (tt > dur) e *= 0.5 + 0.5 * Math.cos((Math.PI * Math.min(r, tt - dur)) / r)
    const vm = 1 + 0.002 * Math.sin(2 * Math.PI * 4.6 * tt)
    let v = 0
    for (let d = 0; d < 2; d++) for (let j = 0; j < K.length; j++) {
      ph[d][j] += (2 * Math.PI * fs[d] * K[j] * vm) / SR
      v += Math.sin(ph[d][j]) / K[j] ** 1.7
    }
    const idx = i0 + n
    if (idx >= 0 && idx < out.length) out[idx] += v * e * amp * 0.5
  }
}
// 打つ音（どれも小さく使う）
function shaker(out, t, amp = 0.05, dec = 70, lenSec = 0.09) {
  const rand = rng()
  let hp = 0, hp2 = 0, p1 = 0, p2 = 0
  const i0 = Math.floor(t * SR), len = Math.floor(lenSec * SR)
  for (let n = 0; n < len; n++) {
    const w = rand()
    hp = 0.8 * (hp + w - p1); p1 = w
    hp2 = 0.8 * (hp2 + hp - p2); p2 = hp
    const tt = n / SR
    if (i0 + n < out.length) out[i0 + n] += hp2 * (1 - Math.exp(-tt * 900)) * Math.exp(-tt * dec) * amp
  }
}
function clap(out, t, amp = 0.1) {
  const rand = rng(104729)
  let hp = 0, prev = 0
  const i0 = Math.floor(t * SR), len = Math.floor(0.18 * SR)
  for (let n = 0; n < len; n++) {
    const w = rand()
    hp = 0.85 * (hp + w - prev); prev = w
    const tt = n / SR
    const e = [0, 0.011, 0.022].reduce((m, o) => m + (tt >= o ? Math.exp(-(tt - o) * (o === 0.022 ? 28 : 160)) : 0), 0)
    if (i0 + n < out.length) out[i0 + n] += hp * e * amp
  }
}
const kick = (out, t, amp = 0.25) => {
  const i0 = Math.floor(t * SR), len = Math.floor(0.16 * SR)
  let ph = 0
  for (let n = 0; n < len; n++) {
    const tt = n / SR
    ph += (2 * Math.PI * (55 + 80 * Math.exp(-tt * 40))) / SR
    if (i0 + n < out.length) out[i0 + n] += Math.sin(ph) * Math.min(1, tt / 0.002) * Math.exp(-tt * 24) * amp
  }
}
const tock = (out, t, f, amp = 0.1) => add(out, { t, f, dur: 0.02, amp, partials: [[1, 1, 1], [4, 0.22, 1]], decay: 60, a: 0.001, r: 0.05 })

// 残響（響きだけを返す）
function reverbWet(x, rt60, spreadMs = 0) {
  const y = new Float32Array(x.length)
  for (const ms of [29.7, 37.1, 41.1, 43.7, 47.9, 53.3]) {
    const D = Math.floor(((ms + spreadMs) / 1000) * SR)
    const fb = 10 ** ((-3 * D) / (rt60 * SR))
    const c = new Float32Array(x.length)
    let lp = 0
    for (let i = 0; i < x.length; i++) {
      const back = i >= D ? c[i - D] : 0
      lp += 0.4 * (back - lp)
      c[i] = x[i] + lp * fb
      y[i] += back * 0.18
    }
  }
  let z = y
  for (const ms of [5.0, 1.7]) {
    const D = Math.floor(((ms + spreadMs * 0.3) / 1000) * SR)
    const o = new Float32Array(z.length), g = 0.5
    for (let i = 0; i < z.length; i++) o[i] = -g * z[i] + (i >= D ? z[i - D] + g * o[i - D] : 0)
    z = o
  }
  return z
}

// ---- 曲の入れ物 ----
function makeSong({ bpm, bars, swing = 0, tail = 4, tracks }) {
  const spb = 60 / bpm
  const loopLen = Math.round(bars * 4 * spb * SR)
  const total = loopLen + tail * SR
  const T = {}
  for (const [k, v] of Object.entries(tracks)) T[k] = { ...v, buf: new Float32Array(total) }
  const sec = (bar, beat) => {
    const whole = Math.floor(beat), fr = beat - whole
    const w = fr < 0.5 ? fr * (1 + 2 * swing) : 0.5 + swing + (fr - 0.5) * (1 - 2 * swing)
    return (bar * 4 + whole + w) * spb
  }
  // 音を 1 つ置く（inst = 上の楽器の関数）
  const play = (track, inst, bar, beat, name, lenBeats, o = {}) => {
    const { oct = 0, late = 0, ...rest } = o
    inst(T[track].buf, { t: sec(bar, beat) + late, f: midi(nn(name) + oct * 12), dur: lenBeats * spb, ...rest })
  }
  // '0 E5 .5, .5 G5 .5' の形のフレーズを置く
  const phrase = (track, inst, bar, text, o = {}) => {
    for (const part of text.split(',')) {
      const [b, name, len] = part.trim().split(/\s+/)
      const beat = Number(b)
      const acc = beat === 0 ? 1.1 : beat % 1 === 0 ? 1 : 0.9
      play(track, inst, bar, beat, name, Number(len) * (o.legato ?? 1), { ...o, legato: undefined, amp: (o.amp ?? 0.2) * acc })
    }
  }
  function render(rt60, wetGain, peak) {
    const L = new Float32Array(total), R = new Float32Array(total), send = new Float32Array(total)
    for (const [k, tr] of Object.entries(T)) {
      const g = tr.gain ?? 1
      if (process.env.BGM_STATS) {
        let pk = 0, sq = 0
        for (const v of tr.buf) { sq += v * v; if (Math.abs(v) > pk) pk = Math.abs(v) }
        console.log(`  ${k.padEnd(7)} 山 ${(pk * g).toFixed(3)} 平均 ${(10 * Math.log10((sq * g * g) / total + 1e-12)).toFixed(1)} dB`)
      }
      const gl = g * Math.cos(((tr.pan + 1) * Math.PI) / 4) * 1.414, gr = g * Math.sin(((tr.pan + 1) * Math.PI) / 4) * 1.414
      for (let i = 0; i < total; i++) {
        const v = tr.buf[i]
        if (v === 0) continue
        L[i] += v * gl; R[i] += v * gr; send[i] += v * g * tr.send
      }
    }
    const wl = reverbWet(send, rt60, 0), wr = reverbWet(send, rt60, 0.9)
    for (let i = 0; i < total; i++) { L[i] += wl[i] * wetGain; R[i] += wr[i] * wetGain }
    const oL = L.slice(0, loopLen), oR = R.slice(0, loopLen)
    for (let i = loopLen; i < total; i++) { oL[i - loopLen] += L[i]; oR[i - loopLen] += R[i] } // 余韻を頭に重ねる
    let m = 0
    for (let i = 0; i < loopLen; i++) m = Math.max(m, Math.abs(oL[i]), Math.abs(oR[i]))
    const g = peak / m
    if (process.env.BGM_STATS) console.log(`  全体の山 ${m.toFixed(3)} → ${g.toFixed(2)} 倍`)
    for (let i = 0; i < loopLen; i++) { oL[i] *= g; oR[i] *= g }
    return { L: oL, R: oR, seconds: loopLen / SR }
  }
  return { T, sec, spb, play, phrase, render }
}
// 'Am7/D7' は小節の前半と後半で和音が変わる
const chordAt = (prog, CH, bar, beat) => { const p = prog[bar].split('/'); return CH[p.length > 1 && beat >= 2 ? p[1] : p[0]] }

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
// 昼 v2: ト長調・112 BPM・40 小節（約 86 秒）・はねるリズム
//   0〜3   前ぶれ: ギターのストロークとピチカートだけ。最後にクラリネットが主題へ送る
//   4〜11  A  : 主題（木琴）。合いの手はチェレスタとフルート
//   12〜19 A' : 主題（木琴）＋クラリネットの対旋律、ピチカートの和音が入る
//   20〜27 B  : フルートが歌い、クラリネットが答える。木琴は分散和音に回る
//   28〜35 A'': 主題（木琴＋チェレスタが 1 オクターブ上）＋対旋律＋手拍子。いちばんにぎやか
//   36〜39 結び: 主題のかけらをチェレスタ → クラリネット → チェレスタ → フルートで回して頭へ
// ============================================================
function day() {
  const S = makeSong({
    bpm: 112, bars: 40, swing: 0.09, tail: 4,
    tracks: {
      mar: { pan: -0.1, send: 0.28, gain: 0.85 },
      cel: { pan: 0.35, send: 0.45, gain: 1.3 },
      flute: { pan: 0.45, send: 0.4 },
      clar: { pan: -0.45, send: 0.35, gain: 0.75 },
      gtr: { pan: -0.3, send: 0.18, gain: 2 },
      pizz: { pan: 0.3, send: 0.3, gain: 2.5 },
      bass: { pan: 0, send: 0.1, gain: 1.3 },
      perc: { pan: 0.12, send: 0.1 },
      clap: { pan: -0.15, send: 0.2, gain: 1.8 },
    },
  })
  const { T, sec, play, phrase } = S
  // 和音: bass = ピチカートの低音、g = ギターの押さえ方（低い弦から）
  const CH = {
    G: { bass: 43, g: [43, 47, 50, 55, 59, 67] }, Em: { bass: 40, g: [40, 47, 52, 55, 59, 64] },
    C: { bass: 48, g: [48, 52, 55, 60, 64] }, D: { bass: 50, g: [50, 57, 62, 66] },
    D7: { bass: 50, g: [50, 57, 60, 66] }, E7: { bass: 40, g: [40, 47, 50, 56, 59, 64] },
    Am7: { bass: 45, g: [45, 52, 55, 60, 64] }, Bm7: { bass: 47, g: [47, 54, 57, 62, 66] },
    A7: { bass: 45, g: [45, 52, 55, 61, 64] }, Dsus4: { bass: 50, g: [50, 57, 62, 67] },
  }
  const theme = ['G', 'Em', 'C', 'D', 'G', 'E7', 'Am7/D7', 'G']
  const prog = ['G', 'Em', 'C', 'D', ...theme, ...theme, 'C', 'D', 'Bm7', 'Em', 'C', 'A7', 'Dsus4/D', 'D7', ...theme, 'G', 'C', 'G', 'D7']
  const sectOf = (bar) => (bar < 4 ? 'intro' : bar < 12 ? 'A' : bar < 20 ? 'A2' : bar < 28 ? 'B' : bar < 36 ? 'A3' : 'tag')

  // 主題（タ、タ・ターン、タ・タ の形を 1 段ずつ下げて、3 小節目で上りつめる）
  const melTheme = [
    '0 B5 1, 1 B5 .5, 1.5 D6 1, 2.5 B5 .5, 3 G5 1',
    '0 A5 1, 1 A5 .5, 1.5 B5 1, 2.5 G5 .5, 3 E5 1',
    '0 G5 .5, .5 A5 .5, 1 C6 .5, 1.5 E6 1, 2.5 D6 .5, 3 C6 1',
    '0 D6 1.5, 1.5 A5 .5, 2 F#5 1',
    '0 B5 1, 1 B5 .5, 1.5 D6 1, 2.5 B5 .5, 3 G5 1',
    '0 B5 1, 1 B5 .5, 1.5 E6 1, 2.5 D6 .5, 3 B5 .5, 3.5 G#5 .5',
    '0 A5 .5, .5 C6 .5, 1 E6 1, 2 D6 .5, 2.5 C6 .5, 3 A5 .5, 3.5 F#5 .5',
    '0 G5 1.5, 1.5 B5 .5, 2 G5 1',
  ]
  const melEndUp = '0 G5 1, 1 B5 .5, 1.5 D6 .5, 2 G6 1.5' // A'・A'' の終わりは上へ抜ける
  // クラリネットの対旋律（主題の下で、長い音でゆっくり動く）
  const counter = [
    '0 D5 2, 2 E5 1, 3 D5 1', '0 B4 2, 2 E5 2', '0 E5 2, 2 G5 2', '0 F#5 1.5, 1.5 E5 .5, 2 D5 2',
    '0 D5 2, 2 G5 2', '0 G#5 2, 2 E5 1, 3 D5 1', '0 E5 2, 2 F#5 2', '0 G5 3',
  ]
  // B: フルート（呼びかけ）とクラリネット（答え）
  const bFlute = {
    0: '0 E6 1.5, 1.5 D6 .5, 2 C6 1, 3 G5 1', 1: '0 A5 1.5, 1.5 B5 .5, 2 D6 2',
    4: '0 E6 1.5, 1.5 D6 .5, 2 C6 1, 3 E6 1', 5: '0 G6 1.5, 1.5 E6 .5, 2 C#6 1, 3 E6 1', 6: '0 D6 2, 2 A5 2',
  }
  const bClar = {
    2: '0 D5 .5, .5 F#5 .5, 1 A5 1, 2 B5 .5, 2.5 A5 .5, 3 F#5 1', 3: '0 G5 1.5, 1.5 F#5 .5, 2 E5 2',
    6: '0 G5 2, 2 F#5 2',
  }
  const tagLines = [
    ['cel', celesta, '0 B5 1, 1 B5 .5, 1.5 D6 1.5', 0.13], ['clar', wind, '0 E5 1, 1 E5 .5, 1.5 G5 1.5', 0.085],
    ['cel', celesta, '0 D6 1, 1 D6 .5, 1.5 G6 1.5', 0.13], ['flute', wind, '0 F#5 .5, .5 A5 .5, 1 C6 .5, 1.5 D6 1.5', 0.085],
  ]

  for (let bar = 0; bar < 40; bar++) {
    const sect = sectOf(bar)
    const k = sect === 'intro' || sect === 'tag' ? bar % 4 : (bar - 4) % 8
    const isTheme = sect === 'A' || sect === 'A2' || sect === 'A3'
    const ch = (beat) => chordAt(prog, CH, bar, beat)

    // ---- ギター（下ろす = 低い弦から、上げる = 高い弦 3 本だけ） ----
    const strum = (beat, down, amp) => {
      const g = ch(beat).g
      const notes = down ? g : g.slice(-3).reverse()
      notes.forEach((n, i) => play('gtr', guitar, bar, beat, n, 2.2, { amp: amp * (down ? 0.75 + 0.05 * i : 1), late: i * (down ? 0.013 : 0.009) }))
    }
    const pat = sect === 'tag' && k < 3 ? [[0, 1, 0.07], [2, 1, 0.045]]
      : sect === 'B' ? [[0, 1, 0.065], [1.5, 0, 0.04], [2, 1, 0.05], [3.5, 0, 0.04]]
      : [[0, 1, 0.07], [1, 1, 0.05], [1.5, 0, 0.04], [2.5, 0, 0.042], [3, 1, 0.052], [3.5, 0, 0.038]]
    for (const [beat, down, amp] of pat) strum(beat, down, amp)

    // ---- ピチカート（低音は 1・3 拍目、和音は 2・4 拍目） ----
    const lowFifth = (c) => (c.bass + 7 > 52 ? c.bass - 5 : c.bass + 7)
    const split = prog[bar].includes('/')
    play('bass', pizz, bar, 0, ch(0).bass, 0.9, { amp: 0.3, t60: 1.4, bright: 0.25 })
    if (sect !== 'tag') play('bass', pizz, bar, 2, split ? ch(2).bass : lowFifth(ch(0)), 0.9, { amp: 0.24, t60: 1.4, bright: 0.25 })
    if (sect !== 'tag' && k % 2 === 1) play('bass', pizz, bar, 3.5, ch(2).bass + (k === 7 ? 0 : 2), 0.4, { amp: 0.14, t60: 1.0, bright: 0.25 })
    if (sect === 'A2' || sect === 'A3' || sect === 'B' || (sect === 'intro' && k >= 2)) {
      const beats = sect === 'B' ? [1, 3] : [1, 2.5, 3]
      for (const beat of beats) ch(beat).g.slice(-3).forEach((n) => play('pizz', pizz, bar, beat, n + 12, 0.4, { amp: beat === 2.5 ? 0.05 : 0.07 }))
    }

    // ---- 主旋律と合いの手 ----
    if (isTheme) {
      const line = k === 7 && sect !== 'A' ? melEndUp : melTheme[k]
      phrase('mar', marimba, bar, line, { amp: 0.3 })
      if (sect === 'A3') phrase('cel', celesta, bar, line, { amp: 0.085, oct: 1 }) // 1 オクターブ上で重ねる
      if (sect !== 'A') phrase('clar', wind, bar, counter[k], { kind: 'clarinet', amp: sect === 'A3' ? 0.06 : 0.065, legato: 0.96 })
      // 4 小節目の合いの手
      if (k === 3) {
        if (sect !== 'A2') phrase('cel', celesta, bar, '2.5 D6 .5, 3 F#6 .5, 3.5 A6 .5', { amp: 0.12 })
        if (sect !== 'A') phrase('flute', wind, bar, '2.5 A5 .5, 3 B5 .5, 3.5 C6 .5', { amp: 0.08, legato: 0.9 })
      }
      // 8 小節目の合いの手（A だけ。A'・A'' は木琴が上へ抜ける）
      if (k === 7 && sect === 'A') phrase('flute', wind, bar, '2.5 E6 .5, 3 D6 .5, 3.5 C6 .5', { amp: 0.08, legato: 0.9 })
    }
    if (sect === 'B') {
      if (bFlute[k]) phrase('flute', wind, bar, bFlute[k], { amp: 0.105, legato: 0.97 })
      if (bClar[k]) phrase('clar', wind, bar, bClar[k], { kind: 'clarinet', amp: 0.085, legato: 0.97 })
      if (k === 7) phrase('mar', marimba, bar, '0 D5 .5, .5 F#5 .5, 1 A5 .5, 1.5 C6 .5, 2 D6 1, 3 C6 .5, 3.5 A5 .5', { amp: 0.24 })
      else {
        // 木琴の分散和音（静かに）
        const g = ch(0).g.slice(-3)
        ;[0, 1, 2, 1, 0, 1, 2, 1].forEach((ix, j) => play('mar', marimba, bar, j * 0.5, chordAt(prog, CH, bar, j * 0.5).g.slice(-3)[ix] ?? g[ix], 0.3, { amp: j % 2 ? 0.05 : 0.065, oct: 1 }))
      }
    }
    if (sect === 'tag') {
      const [track, inst, line, amp] = tagLines[k]
      phrase(track, inst, bar, line, { amp, kind: track === 'clar' ? 'clarinet' : 'flute', legato: 0.95 })
    }
    if (sect === 'intro' && k === 3) phrase('clar', wind, bar, '2 D5 .5, 2.5 E5 .5, 3 G5 .5, 3.5 A5 .5', { kind: 'clarinet', amp: 0.085, legato: 0.9 })
    if (sect === 'intro' && k === 1) phrase('cel', celesta, bar, '2 B5 .5, 2.5 E6 .5, 3 G6 1', { amp: 0.08 })

    // ---- 打つ音（全部小さく） ----
    const P = T.perc.buf
    if (sect === 'tag') {
      for (const beat of [1, 3]) shaker(P, sec(bar, beat), 0.03, 60)
      // 最後の小節の後半でリズムを戻して頭へ（終わりがしんとしないように）
      if (k === 3) { for (const beat of [2, 2.5, 3.5]) shaker(P, sec(bar, beat), 0.04, 55); tock(P, sec(bar, 3), midi(79), 0.08); clap(T.clap.buf, sec(bar, 3.5), 0.05) }
    }
    else {
      for (let j = 0; j < 8; j++) { const off = j % 2 === 1; shaker(P, sec(bar, j * 0.5), sect === 'B' ? (off ? 0.035 : 0.022) : off ? 0.048 : 0.03, off ? 55 : 80) }
      kick(P, sec(bar, 0), 0.2); kick(P, sec(bar, 2), 0.15)
      if (sect === 'A3') { clap(T.clap.buf, sec(bar, 1), 0.07); clap(T.clap.buf, sec(bar, 3), 0.09) }
      else if (sect === 'B') tock(P, sec(bar, 3), midi(79), 0.07)
      else { tock(P, sec(bar, 1), midi(79), 0.08); tock(P, sec(bar, 3), midi(79), 0.09) }
      if (isTheme && k === 7) { clap(T.clap.buf, sec(bar, 3), 0.07); clap(T.clap.buf, sec(bar, 3.5), 0.06) }
    }
  }
  return S.render(1.1, 0.5, 0.68) // AAC にすると山が 2dB ほど上がるので WAV は -3.3dB
}

// ============================================================
// 夜 v2: ヘ長調・72 BPM・24 小節（80 秒）・はねない・打つ音はほぼ無し
//   0〜7   A  : ピアノの主旋律＋ギターの分散和音＋うすい弦
//   8〜15  B  : ピアノが歌い、チェレスタが高い所で答える。最後にオルゴール
//   16〜23 A' : 主旋律にオルゴールが 1 オクターブ上でそっと重なる。ピアノの左手とチェレスタの星。後半を変えて頭へ
// ============================================================
function night() {
  const S = makeSong({
    bpm: 72, bars: 24, swing: 0, tail: 7,
    tracks: {
      piano: { pan: -0.08, send: 0.4, gain: 0.8 },
      lh: { pan: -0.2, send: 0.3 },
      box: { pan: 0.45, send: 0.6, gain: 2 },
      cel: { pan: 0.4, send: 0.6, gain: 2 },
      gtr: { pan: 0.28, send: 0.3, gain: 3 },
      strL: { pan: -0.7, send: 0.5, gain: 0.8 },
      strR: { pan: 0.7, send: 0.5, gain: 0.8 },
      perc: { pan: -0.2, send: 0.3, gain: 3 },
    },
  })
  const { T, sec, play, phrase } = S
  // bass = 低音、v = 押さえる 4 音
  const CH = {
    Fmaj7: { bass: 41, v: [53, 60, 64, 69] }, Am7: { bass: 45, v: [57, 60, 64, 67] }, Bbmaj7: { bass: 46, v: [53, 58, 62, 69] },
    C7sus4: { bass: 48, v: [55, 58, 60, 65] }, C7: { bass: 48, v: [55, 58, 60, 64] }, C: { bass: 48, v: [55, 60, 64, 67] },
    Csus4: { bass: 48, v: [55, 60, 65, 67] }, Dm7: { bass: 50, v: [53, 57, 60, 65] }, Gm7: { bass: 43, v: [55, 58, 62, 65] },
    Fadd9: { bass: 41, v: [53, 57, 60, 67] },
  }
  const prog = [
    'Fmaj7', 'Am7', 'Bbmaj7', 'C7sus4/C7', 'Dm7', 'Bbmaj7', 'Gm7', 'C7sus4',
    'Bbmaj7', 'C', 'Am7', 'Dm7', 'Bbmaj7', 'C', 'Fadd9', 'Csus4/C',
    'Fmaj7', 'Am7', 'Bbmaj7', 'C7sus4/C7', 'Dm7', 'Bbmaj7', 'Gm7', 'C7',
  ]
  const mel = [
    // A（1 小節目の形を 3 小節目で 1 段上げてくり返す）
    '0 C6 1.5, 1.5 A5 .5, 2 F5 1, 3 A5 1',
    '0 G5 3, 3 E5 1',
    '0 D6 1.5, 1.5 Bb5 .5, 2 F5 1, 3 A5 1',
    '0 G5 2, 2 F5 1, 3 E5 1',
    '0 F5 1, 1 A5 1, 2 D6 1.5, 3.5 C6 .5',
    '0 A5 1.5, 1.5 F5 .5, 2 D5 2',
    '0 Bb5 1, 1 D6 1, 2 F6 1.5, 3.5 D6 .5',
    '0 C6 3',
    // B
    '0 F5 1, 1 Bb5 1, 2 D6 2',
    '0 E6 1.5, 1.5 D6 .5, 2 C6 2',
    '0 E5 1, 1 A5 1, 2 C6 2',
    '0 D6 1.5, 1.5 C6 .5, 2 A5 2',
    '0 F5 1, 1 Bb5 1, 2 D6 1, 3 F6 1',
    '0 E6 2, 2 G5 1, 3 C6 1',
    '0 A5 2, 2 G5 1, 3 F5 1',
    '0 F5 2, 2 E5 2',
    // A'
    '0 C6 1.5, 1.5 A5 .5, 2 F5 1, 3 A5 1',
    '0 G5 3, 3 E5 1',
    '0 D6 1.5, 1.5 Bb5 .5, 2 F5 1, 3 A5 1',
    '0 G5 2, 2 F5 1, 3 E5 1',
    '0 F5 1, 1 A5 1, 2 D6 1, 3 F6 1',
    '0 D6 1.5, 1.5 Bb5 .5, 2 F5 2',
    '0 G5 1, 1 Bb5 1, 2 D6 1, 3 Bb5 1',
    '0 A5 1.5, 1.5 G5 .5, 2 E5 2',
  ]
  // チェレスタの答え（B）とオルゴールの合いの手
  const celAns = { 9: '2.5 G6 .5, 3 E6 1', 11: '2.5 F6 .5, 3 D6 1', 13: '2.5 G6 .5, 3 E6 .5, 3.5 C6 .5' }
  const boxFill = { 7: '2 G5 .5, 2.5 Bb5 .5, 3 C6 .5, 3.5 F6 .5', 15: '2.5 G5 .5, 3 C6 .5, 3.5 E6 .5', 3: '3.5 G6 .5' }

  for (let bar = 0; bar < 24; bar++) {
    const sect = bar >> 3
    const ch = (beat) => chordAt(prog, CH, bar, beat)
    const halves = prog[bar].includes('/') ? [[0, 2], [2, 2]] : [[0, 4]]

    // うすい弦（左右で少しずらす。小節をまたいでゆっくり入れ替わる）
    for (const [beat, len] of halves) {
      const v = ch(beat).v
      ;[v[1], v[2], v[3]].forEach((n, i) => {
        play(i % 2 ? 'strR' : 'strL', strings, bar, beat, n, len, { amp: 0.03, detune: 0.0025 })
        if (i === 1) play('strL', strings, bar, beat, n + 12, len, { amp: 0.012, detune: 0.002 })
      })
      play('strR', strings, bar, beat, ch(beat).bass + 12, len, { amp: 0.028, detune: 0.002 })
    }

    // ギターの分散和音（8 分。低音 → 上の弦）
    const pat = sect === 1 ? [0, 2, 3, 2, 0, 2, 4, 2] : [0, 2, 3, 4, 2, 3, 4, 3]
    pat.forEach((ix, j) => {
      const beat = j * 0.5, c = ch(beat)
      const pool = [c.bass, c.bass + 7, c.v[1], c.v[2], c.v[3]]
      const isBass = ix === 0
      play('gtr', guitar, bar, beat, pool[ix], isBass ? 2 : 1.5, { amp: isBass ? 0.085 : j % 2 ? 0.05 : 0.062, t60: 3.5, damp: 0.1, bright: 0.4, pos: 0.25 })
    })

    // ピアノの左手（A は頭の低音だけ、A' は少し動く）
    if (sect !== 1) play('lh', piano, bar, 0, ch(0).bass, 3, { amp: 0.11 })
    if (sect === 2) {
      play('lh', piano, bar, 1, ch(1).bass + 7, 2, { amp: 0.06 })
      play('lh', piano, bar, 2, ch(2).v[1] + (ch(2).v[1] < 58 ? 12 : 0), 2, { amp: 0.06 })
    }
    if (sect === 1 && bar % 2 === 0) play('lh', piano, bar, 0, ch(0).bass, 4, { amp: 0.09 })

    // 主旋律（ピアノ）
    phrase('piano', piano, bar, mel[bar], { amp: 0.26 })
    if (sect === 2) {
      // オルゴールが長い音だけ 1 オクターブ上でそっと重ねる
      for (const part of mel[bar].split(',')) {
        const [b, n, len] = part.trim().split(/\s+/)
        if (Number(len) >= 1.5) play('box', musicbox, bar, Number(b), n, 0.5, { amp: 0.04, oct: 1 })
      }
      // チェレスタの星（和音の音を高い所でぽつり）
      const c = ch(2)
      play('cel', celesta, bar, bar % 2 ? 1.5 : 2.5, (bar % 2 ? c.v[2] : c.v[3]) + 24, 0.5, { amp: 0.035 })
    }
    if (celAns[bar]) phrase('cel', celesta, bar, celAns[bar], { amp: 0.075 })
    if (boxFill[bar]) phrase('box', musicbox, bar, boxFill[bar], { amp: 0.075 })

    // 打つ音は A' の 2・4 拍目にごく小さいシェイカーだけ
    if (sect === 2) { shaker(T.perc.buf, sec(bar, 1), 0.012, 30, 0.16); shaker(T.perc.buf, sec(bar, 3), 0.015, 30, 0.16) }
  }
  return S.render(2.2, 0.7, 0.68)
}

mkdirSync(OUT, { recursive: true })
for (const [name, make] of [['day-v2', day], ['night-v2', night]]) {
  const song = make()
  wavStereo(name, song)
  let sq = 0
  for (let i = 0; i < song.L.length; i++) sq += song.L[i] ** 2 + song.R[i] ** 2
  console.log(`${name}.wav  ${song.seconds.toFixed(2)} 秒  平均の大きさ ${(10 * Math.log10(sq / (song.L.length * 2))).toFixed(1)} dB`)
}

// 音を鳴らす（A6。Web Audio）。iPhone はタップの中で unlock() するまで鳴らせない（タイトルの「タップしてスタート」で呼ぶ）。
// 音のファイルは src/assets/sound/*.m4a（元は art/sound/sfx-synth.mjs で合成）。設定は端末ごとに localStorage `mogumo.sound`。
// AudioContext が無い所（テストの jsdom など）では何もしない。
import { parsePrefs } from '../domain/sfx.ts'
import type { Cue, SfxName, SoundPrefs } from '../domain/sfx.ts'

const urls = import.meta.glob('../../assets/sound/*.m4a', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const KEY = 'mogumo.sound'
const SFX_VOLUME = 0.8

let ctx: AudioContext | null = null
let sfxOut: GainNode | null = null
const buffers = new Map<SfxName, AudioBuffer>()
const pending = new Map<SfxName, number>() // 用意ができる前に頼まれた音（頼まれた時刻）
const LATE_MS = 800 // これより遅れたら鳴らさない
// ファイルは先に取りに行っておく（最初のタップで鳴らすスタートの音を間に合わせる）
// （AudioContext が無い所では取りに行かない。テストの fetch の差し替えを横取りしない）
const AC: typeof AudioContext | undefined =
  typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
const raw = AC
  ? Object.entries(urls).map(([path, url]) => ({
      name: path.split('/').pop()!.replace('.m4a', '') as SfxName,
      data: fetch(url).then((r) => r.arrayBuffer()).catch(() => null),
    }))
  : []
const listeners = new Set<() => void>()
let prefs: SoundPrefs = (() => {
  try {
    return parsePrefs(localStorage.getItem(KEY))
  } catch {
    return parsePrefs(null)
  }
})()

function ensure(): AudioContext | null {
  if (ctx) return ctx
  if (!AC) return null
  // マナーモードのときは鳴らさない（iOS 17 以降の Safari だけにある）
  try {
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession
    if (s) s.type = 'ambient'
  } catch {
    /* 無い端末は気にしない */
  }
  const c = new AC()
  ctx = c
  sfxOut = c.createGain()
  sfxOut.gain.value = SFX_VOLUME
  sfxOut.connect(c.destination)
  // アプリを閉じたら止め、戻ったら続ける
  document.addEventListener('visibilitychange', () => void (document.hidden ? c.suspend() : c.resume()).catch(() => {}))
  for (const { name, data } of raw) {
    void data
      .then((b) => (b ? c.decodeAudioData(b) : null))
      .then((buf) => {
        if (!buf) return
        buffers.set(name, buf)
        const at = pending.get(name)
        pending.delete(name)
        if (at !== undefined && performance.now() - at < LATE_MS) play(name)
      })
      .catch(() => {})
  }
  return c
}

function play(name: SfxName) {
  if (!prefs.sfx || !ctx || !sfxOut) return
  const buf = buffers.get(name)
  if (!buf) {
    pending.set(name, performance.now())
    return
  }
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.connect(sfxOut)
  src.start()
}

export const sound = {
  // タップの中で呼ぶ。最初の 1 回で音の用意をして、止まっていれば動かす
  unlock() {
    const c = ensure()
    if (c && c.state !== 'running') void c.resume().catch(() => {})
  },
  play,
  // 間をあけて順に鳴らす。戻り値で取り消せる（画面が先に閉じたとき）
  cues(list: Cue[]): () => void {
    const ids = list.map((c) => setTimeout(() => play(c.name), c.atMs))
    return () => ids.forEach(clearTimeout)
  },
  prefs: () => prefs,
  setPrefs(next: SoundPrefs) {
    prefs = next
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      /* 保存できなくてもこの間は効く */
    }
    listeners.forEach((f) => f())
  },
  subscribe(f: () => void) {
    listeners.add(f)
    return () => void listeners.delete(f)
  },
}

// 画面のボタンを押したら「ぽこっ」（アプリ全体で 1 か所）。押せないボタンと data-sfx="none" の中は鳴らさない。
// 最初のタップで音の用意もする（タイトルを通らない入り方の保険）。
export function installTapSound() {
  document.addEventListener(
    'click',
    (e) => {
      sound.unlock()
      const el = (e.target as Element | null)?.closest?.('button, [role="button"], a[href]')
      if (!el || el.matches(':disabled, [aria-disabled="true"]') || el.closest('[data-sfx="none"]')) return
      play('tap')
    },
    true,
  )
}

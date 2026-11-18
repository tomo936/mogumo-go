// 音を鳴らす（A6。Web Audio）。iPhone はタップの中で unlock() するまで鳴らせない（タイトルの「タップしてスタート」で呼ぶ）。
// 音のファイルは src/assets/sound/*.m4a（元は art/sound/sfx-synth.mjs で合成）。設定は端末ごとに localStorage `mogumo.sound`。
// AudioContext が無い所（テストの jsdom など）では何もしない。
import { parsePrefs } from '../domain/sfx.ts'
import type { Cue, SfxName, SoundPrefs } from '../domain/sfx.ts'

const urls = import.meta.glob('../../assets/sound/*.m4a', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
import dayBgmUrl from '../../assets/sound/bgm/day.m4a?url'
import nightBgmUrl from '../../assets/sound/bgm/night.m4a?url'
import { isNight, onPhase } from '../../daynight/infra/phase.ts'

const KEY = 'mogumo.sound'
const BGM_VOLUME = 0.3
const BGM_FADE_S = 3
const SFX_VOLUME = 0.6

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
// BGM: 昼の曲（夜は夜の曲。A14）を Web Audio でループ（<audio loop> だと継ぎ目に間が出る端末があるため）
let bgmOut: GainNode | null = null
let bgmSrc: AudioBufferSourceNode | null = null
let bgmBuf: AudioBuffer | null = null
let bgmLoading = false
let bgmWanted = false // 地図に入った後は true。設定でオフにしても true のまま（オンに戻したら鳴らす）
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
  // アプリを閉じたら止め、戻ったら続ける。iPhone は裏から戻ると音の仕組みが固まって鳴らないことがあるので、
  // 戻ったあとの最初の操作で作り直す（2026-11-18 オーナー「再度開くと音が消える」）
  const onVis = () => {
    if (ctx !== c) return document.removeEventListener('visibilitychange', onVis) // 作り直した古いもの
    if (document.hidden) {
      void c.suspend().catch(() => {})
      stale = true
    } else void c.resume().catch(() => {})
  }
  document.addEventListener('visibilitychange', onVis)
  for (const { name, data } of raw) {
    void data
      .then((b) => (b ? c.decodeAudioData(b.slice(0)) : null)) // 作り直したときにもう一度ほどけるよう、写しをほどく
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

// 裏から戻ったあと（stale）の最初の操作で、音の仕組みを作り直す。BGM を鳴らしていたら新しい方で続ける
let stale = false
function rebuild() {
  stale = false
  const old = ctx
  ctx = null
  sfxOut = null
  bgmOut = null
  bgmSrc = null
  buffers.clear()
  if (old) void old.close().catch(() => {})
  ensure()
  applyBgm()
}

function applyBgm() {
  const c = ctx
  if (!c) return
  if (!bgmOut) {
    bgmOut = c.createGain()
    bgmOut.gain.value = 0
    bgmOut.connect(c.destination)
  }
  const g = bgmOut.gain
  const now = c.currentTime
  g.cancelScheduledValues(now)
  g.setValueAtTime(g.value, now)
  if (bgmWanted && prefs.bgm) {
    if (!bgmSrc && bgmBuf) {
      bgmSrc = c.createBufferSource()
      bgmSrc.buffer = bgmBuf
      bgmSrc.loop = true
      bgmSrc.connect(bgmOut)
      bgmSrc.start()
    } else if (!bgmBuf && !bgmLoading) {
      bgmLoading = true
      void fetch(isNight() ? nightBgmUrl : dayBgmUrl) // 夜は夜の曲（A14）
        .then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b))
        .then((buf) => {
          bgmBuf = buf
          bgmLoading = false
          applyBgm()
        })
        .catch(() => {
          bgmLoading = false
        })
    }
    g.linearRampToValueAtTime(BGM_VOLUME, now + BGM_FADE_S) // ふわっと始まる
  } else {
    g.linearRampToValueAtTime(0, now + 0.4)
    if (bgmSrc) {
      const old = bgmSrc
      bgmSrc = null
      setTimeout(() => {
        try {
          old.stop()
        } catch {
          /* もう止まっている */
        }
      }, 500)
    }
  }
}

// 昼と夜が切り替わったら、今の曲をふわっと消して、もう片方の曲に替える（A14）
const SWAP_FADE_S = 1.5
onPhase(() => {
  bgmBuf = null // 次に鳴らすときは新しい時間帯の曲を読む
  const c = ctx
  if (!c || !bgmOut || !bgmSrc) return
  const old = bgmSrc
  bgmSrc = null
  const g = bgmOut.gain
  g.cancelScheduledValues(c.currentTime)
  g.setValueAtTime(g.value, c.currentTime)
  g.linearRampToValueAtTime(0, c.currentTime + SWAP_FADE_S)
  setTimeout(() => {
    try {
      old.stop()
    } catch {
      /* もう止まっている */
    }
    applyBgm() // 新しい曲を読んで、ふわっと始める
  }, SWAP_FADE_S * 1000 + 100)
})

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
    if (stale && ctx) rebuild()
    const c = ensure()
    if (c && c.state !== 'running') void c.resume().catch(() => {})
  },
  play,
  // 地図に降りるときに呼ぶ。BGM（昼）がふわっと始まる
  startBgm() {
    bgmWanted = true
    applyBgm()
  },
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
    applyBgm()
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
  // 地図をさわる操作は click にならない（地図が止める）ので、指を離したときにも音を動かす（iPhone は touchend の中なら再開できる）
  const wake = () => sound.unlock()
  document.addEventListener('touchend', wake, { capture: true, passive: true })
  document.addEventListener('pointerup', wake, { capture: true, passive: true })
}

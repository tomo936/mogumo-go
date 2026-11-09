// 気配の流れのまとめ。開いたら読むだけ、探索シートを開いたら（無ければ）作る、速い間は待つ、
// この辺りで探し直す、日付の切り替わり、30m の明かし、達成。
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { jstDay } from '../../checkin/domain/day.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import type { MapViewHandle } from '../../map/ui/MapView.tsx'
import type { Shop } from '../../shops/domain/shop.ts'
import { HINT_DAY_CHECK_MS, HINT_READY_TIMEOUT_MS } from '../config.ts'
import { collectCandidates } from '../domain/candidates.ts'
import { hintPosition, matchesShop } from '../domain/hint.ts'
import type { DailyHint, HintSet } from '../domain/hint.ts'
import { updateRevealed } from '../domain/reveal.ts'
import { emptyGate, mayGenerate, pushSample, showRegen } from '../domain/when.ts'
import type { SpeedGate } from '../domain/when.ts'
import { postDailyHints, readTodayHints } from '../infra/hintsApi.ts'
import { loadRevealed, saveRevealed } from '../infra/revealStore.ts'

export type ExploreStatus = 'idle' | 'loading' | 'fast' | 'unavailable' | 'timeout' | 'error' | 'ready'

type Api = { readTodayHints: typeof readTodayHints; postDailyHints: typeof postDailyHints }

type Args = {
  userId: string
  enabled: boolean // 気配を作れる環境か（shopSourceEnabled の結果）
  me: LatLng | null
  home: LatLng | null
  map: RefObject<MapViewHandle | null>
  api?: Api
}

export const NO_HINTS_NOTICE = 'この辺りには気配がありませんでした'

const sameKey = (a: ReadonlyMap<string, LatLng>) => [...a].map(([id, p]) => `${id}@${p.lat},${p.lng}`).join('|')

export function useDailyHints(a: Args) {
  const { userId, enabled, me, home, map } = a
  const api = a.api ?? { readTodayHints, postDailyHints }
  const [set, setSet] = useState<HintSet | null>(null)
  const [status, setStatus] = useState<ExploreStatus>('idle')
  const [revealed, setRevealed] = useState<ReadonlySet<string>>(new Set())
  const [positions, setPositions] = useState<ReadonlyMap<string, LatLng>>(new Map())
  const [newlyRevealed, setNewly] = useState<DailyHint | null>(null)
  const [regenBlocked, setRegenBlocked] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [fast, setFast] = useState(false)

  // 非同期の中から最新の値を読むための ref
  const latest = useRef({ set, status, me, home, enabled, userId, api, revealed })
  useEffect(() => {
    latest.current = { set, status, me, home, enabled, userId, api, revealed }
  })
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const gate = useRef<SpeedGate>(emptyGate)
  const genSeq = useRef(0)
  const sheetOpen = useRef(false)
  const lastRegen = useRef(false)
  const today = useRef(jstDay(new Date()))

  // 組を入れ替える。明かした記録は同じ日・同じ世代のものだけ引き継ぐ（達成済みは明かした扱い）
  const applySet = useCallback((next: HintSet | null) => {
    const prev = latest.current.set
    setSet(next)
    if (!next) {
      setRevealed(new Set())
      return
    }
    const ids = loadRevealed(latest.current.userId, next.day, next.generation)
    for (const h of next.hints) if (h.completed) ids.add(h.id)
    setRevealed(ids)
    if (!prev || prev.generation !== next.generation || prev.day !== next.day) setRegenBlocked(false)
  }, [])

  const generate = useCallback(async (regen: boolean) => {
    const seq = ++genSeq.current
    const stale = () => seq !== genSeq.current || !mounted.current
    lastRegen.current = regen
    setNotice(null)
    if (!latest.current.enabled) return setStatus('unavailable')
    if (!mayGenerate(gate.current, Date.now())) return setStatus('fast')
    setStatus('loading')
    const handle = map.current
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<'timeout'>((r) => {
      timer = setTimeout(() => r('timeout'), HINT_READY_TIMEOUT_MS)
    })
    const ready = await Promise.race([handle ? handle.whenShopsReady().then(() => 'ok' as const) : timeout, timeout])
    clearTimeout(timer)
    if (stale()) return
    const inputs = map.current?.hintInputs()
    const here = latest.current.me
    if (ready === 'timeout' || !inputs || !here) return setStatus('timeout')
    const candidates = collectCandidates({ ...inputs, home: latest.current.home, me: here, regen, random: Math.random })
    const res = await latest.current.api.postDailyHints({ regen, candidates })
    if (stale()) return
    if (res.ok) {
      const prev = latest.current.set
      if (regen && prev && res.set.generation === prev.generation) {
        // 作り直しで0件: 今の組のまま（回数は使っていない）
        setNotice(NO_HINTS_NOTICE)
        return setStatus('ready')
      }
      if (regen) saveRevealed(latest.current.userId, { day: res.set.day, generation: res.set.generation, ids: [] }) // 古い組の記録は捨てる
      applySet(res.set)
      return setStatus('ready')
    }
    if (res.reason === 'regen_used' || res.reason === 'regen_done' || res.reason === 'not_far' || res.reason === 'no_hints') {
      setRegenBlocked(true)
      const r = await latest.current.api.readTodayHints(jstDay(new Date()))
      if (stale()) return
      if (r.ok && r.set) applySet(r.set)
      return setStatus('ready')
    }
    setStatus('error')
  }, [map, applySet])

  const openSheet = useCallback(() => {
    sheetOpen.current = true
    void (async () => {
      const day = jstDay(new Date())
      if (latest.current.set?.hints.length) setStatus('ready')
      const r = await latest.current.api.readTodayHints(day)
      if (!mounted.current || !sheetOpen.current) return
      if (r.ok && r.set && r.set.day === day) {
        applySet(r.set)
        return setStatus('ready')
      }
      // 読めなかったときは、手元の組があればそれを使う
      const have = r.ok ? null : latest.current.set
      if (have?.hints.length) return setStatus('ready')
      await generate(false)
    })()
  }, [applySet, generate])
  const openRef = useRef(openSheet)
  useEffect(() => {
    openRef.current = openSheet
  })

  const closeSheet = useCallback(() => {
    sheetOpen.current = false
  }, [])
  const retry = useCallback(() => void generate(lastRegen.current), [generate])
  const regen = useCallback(() => {
    if (!mayGenerate(gate.current, Date.now())) return
    void generate(true)
  }, [generate])

  // 開いたら今日の組を読むだけ（作らない）
  useEffect(() => {
    let cancelled = false
    const day = jstDay(new Date())
    void latest.current.api.readTodayHints(day).then((r) => {
      if (cancelled || !r.ok || !r.set || r.set.day !== day) return
      applySet(r.set)
    })
    return () => {
      cancelled = true
    }
  }, [userId, applySet])

  // 速さ: 位置が変わるたびに測り、遅くなったらその場で作る（シートを開いたまま待っていたとき）
  useEffect(() => {
    if (!me) return
    const now = Date.now()
    gate.current = pushSample(gate.current, { p: me, t: now })
    const isFast = !mayGenerate(gate.current, now)
    setFast(isFast)
    if (!isFast && sheetOpen.current && latest.current.status === 'fast') void generate(lastRegen.current)
  }, [me, generate])

  // 気配の店の位置（端末の店があればその位置）と、30m の明かし
  useEffect(() => {
    if (!set) {
      setPositions((p) => (p.size === 0 ? p : new Map()))
      return
    }
    const shops = map.current?.hintInputs()?.shops ?? []
    const next = new Map(set.hints.map((h) => [h.id, hintPosition(h, shops)]))
    setPositions((p) => (sameKey(p) === sameKey(next) ? p : next))
    if (!me || set.hints.length === 0) return
    const r = updateRevealed(latest.current.revealed, set.hints, me, (h) => next.get(h.id)!)
    if (r.revealed.size === latest.current.revealed.size) return
    setRevealed(r.revealed)
    saveRevealed(userId, { day: set.day, generation: set.generation, ids: [...r.revealed] })
    const first = set.hints.find((h) => h.id === r.newly[0])
    if (first) {
      setNewly(first)
      for (const id of r.newly) map.current?.bounceHint(id)
    }
  }, [set, me, map, userId])

  // ピンを地図に出す
  useEffect(() => {
    map.current?.setHints(set?.hints ?? [], positions, revealed)
  }, [set, positions, revealed, map])

  // 日付の切り替わり（日本時間0時）: 気配と明かしを消す。シートを開いていれば新しく作る
  useEffect(() => {
    const check = () => {
      const d = jstDay(new Date())
      if (d === today.current) return
      today.current = d
      genSeq.current++
      setSet(null)
      setRevealed(new Set())
      setPositions(new Map())
      setNewly(null)
      setRegenBlocked(false)
      setNotice(null)
      setStatus('idle')
      if (sheetOpen.current) openRef.current()
    }
    const t = setInterval(check, HINT_DAY_CHECK_MS)
    document.addEventListener('visibilitychange', check)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', check)
    }
  }, [])

  const hintFor = (shop: Shop): DailyHint | null => set?.hints.find((h) => matchesShop(h, shop)) ?? null
  const isMasked = (shop: Shop): boolean => {
    const h = hintFor(shop)
    return !!h && !h.completed && !revealed.has(h.id)
  }
  const markCompleted = (shop: Shop) => {
    const h = hintFor(shop)
    if (!set || !h) return
    setSet({ ...set, hints: set.hints.map((x) => (x.id === h.id ? { ...x, completed: true } : x)) })
    const ids = new Set(revealed).add(h.id)
    setRevealed(ids)
    saveRevealed(userId, { day: set.day, generation: set.generation, ids: [...ids] })
  }

  return {
    status, set, revealed, positions, newlyRevealed, fast, notice,
    regenVisible: showRegen(set, me) && !regenBlocked && status !== 'loading',
    openSheet, closeSheet, retry, regen, hintFor, isMasked, markCompleted,
    clearNewly: () => setNewly(null),
  }
}

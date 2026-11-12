import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useAuth } from '../auth/AuthContext.ts'
import { LocationOverlay } from '../map/ui/LocationOverlay.tsx'
import { MapView } from '../map/ui/MapView.tsx'
import type { MapViewHandle } from '../map/ui/MapView.tsx'
import { distanceMeters } from '../map/domain/geo.ts'
import type { LatLng } from '../map/domain/geo.ts'
import { farFromHome } from '../checkin/domain/far.ts'
import { loadProgress, postCheckin } from '../checkin/infra/checkinApi.ts'
import { profileRepo } from '../setup/infra/profileRepo.ts'
import { EXP_NEW, EXP_REVISIT, expFromCounts, levelFor } from '../zukan/domain/level.ts'
import { loadCoins } from '../mypage/infra/coins.ts'
import { syncMissions } from '../missions/infra/missionsApi.ts'
import { nearbyKinds } from '../missions/domain/nearbyKinds.ts'
import type { Mission, MissionWeek } from '../missions/domain/mission.ts'
import { MissionTickets } from '../missions/ui/MissionTickets.tsx'
import type { MissionsState } from '../missions/ui/MissionTickets.tsx'
import { MissionBanner } from '../missions/ui/MissionBanner.tsx'
import { MapHud } from '../map/ui/MapHud.tsx'
import { Record, type RecordTab } from '../record/ui/Record.tsx'
import { MyPage } from '../mypage/ui/MyPage.tsx'
import { Settings } from '../settings/ui/Settings.tsx'
import type { StarterId } from '../setup/infra/profileRepo.ts'
import { CheckinEffect } from '../checkin/ui/CheckinEffect.tsx'
import { BuildingSheet } from '../checkin/ui/BuildingSheet.tsx'
import { ShopSheet } from '../checkin/ui/ShopSheet.tsx'
import type { CheckinError } from '../checkin/ui/ShopSheet.tsx'
import type { Visits } from '../checkin/domain/visits.ts'
import type { Shop } from '../shops/domain/shop.ts'
import { shopSourceEnabled } from '../shops/infra/hotpepper.ts'
import { guideShops, hintPosition, matchesShop } from '../hints/domain/hint.ts'
import { ExploreSheet } from '../hints/ui/ExploreSheet.tsx'
import { directionName } from '../hints/domain/sheetText.ts'
import { Zukan } from '../zukan/ui/Zukan.tsx'
import { zukanToShop } from '../zukan/domain/zukan.ts'
import { HintSheet } from '../hints/ui/HintSheet.tsx'
import { RevealBanner } from '../hints/ui/RevealBanner.tsx'
import { useDailyHints } from '../hints/ui/useDailyHints.ts'
import { loadHome } from '../setup/infra/homeStore.ts'
import { nextStatus } from '../map/domain/locationStatus.ts'
import { syncUntilSettled } from '../towns/infra/townsApi.ts'
import type { TownNews, TownSync } from '../towns/domain/progress.ts'
import { TownBanner } from '../towns/ui/TownBanner.tsx'
import { ReviewEditor } from '../reviews/ui/ReviewEditor.tsx'
import { loadLatest, loadSummary } from '../reviews/infra/reviewsApi.ts'
import { syncOsmShops } from '../zukan/infra/osmSync.ts'
import type { Review } from '../reviews/domain/review.ts'
import { jstDay } from '../checkin/domain/day.ts'

const SHOPS_ERROR_BANNER_MS = 6000
const PINS_HIDDEN_KEY = 'mogumo.pinsHidden' // ピンを出さない設定（その端末だけ。読めなくても動く）

function loadPinsHidden(): boolean {
  try {
    return localStorage.getItem(PINS_HIDDEN_KEY) === '1'
  } catch {
    return false
  }
}

const REVIEW_OFFER_MS = 10_000 // チェックインの後に「感想を書く」を出しておく時間

export function MapPage() {
  const { session, signOut } = useAuth()
  const userId = session?.user.id
  const home = useMemo(() => (userId ? loadHome(userId) : null), [userId])
  const [shopsError, setShopsError] = useState(false)
  // 帯は数秒で消える
  useEffect(() => {
    if (!shopsError) return
    const t = setTimeout(() => setShopsError(false), SHOPS_ERROR_BANNER_MS)
    return () => clearTimeout(t)
  }, [shopsError])
  const [status, dispatch] = useReducer(nextStatus, 'searching')
  const [attempt, setAttempt] = useState(0)
  const [pinsHidden, setPinsHidden] = useState(loadPinsHidden)
  const togglePins = () => {
    const next = !pinsHidden
    setPinsHidden(next)
    try {
      localStorage.setItem(PINS_HIDDEN_KEY, next ? '1' : '0')
    } catch {
      // 保存できなくても、この画面の間は切りかわる
    }
  }

  const mapRef = useRef<MapViewHandle>(null)
  const subscribeBearing = useCallback((cb: (b: number) => void) => mapRef.current?.subscribeBearing(cb) ?? (() => {}), [])
  const [selected, setSelected] = useState<Shop | null>(null)
  const [building, setBuilding] = useState<{ shops: Shop[]; checked: ReadonlySet<string>; title: string | null } | null>(null)
  const [me, setMe] = useState<LatLng | null>(null)
  const [busy, setBusy] = useState(false)
  const [checkinError, setCheckinError] = useState<CheckinError | null>(null)
  const [effect, setEffect] = useState<{ coins: 0 | 30 | 40; reveal: string | null; key: number; exp: number; levelUp: number | null } | null>(null)
  const [doneToday, setDoneToday] = useState(false)
  // チェックインの直後の「感想を書く」: 成功で持ち、演出が終わったら 10 秒出す。新しいチェックインで置き換わる
  const [reviewOffer, setReviewOffer] = useState<{ checkinId: string; shop: Shop; shown: boolean } | null>(null)
  // 図鑑に地図のデータだけのお店を出す（設計 2026-11-12-zukan-osm-shops）: 晴れた場所の地図のお店のタイルを shops-osm に送る。
  // 霧が晴れたとき（チェックイン・町のクリア）・お店がそろったとき・図鑑を開いたとき。時間では送らない（オーナー 2026-11-13）。
  // 失敗しても何もしない（次にまた送る）
  const osmEnabled = shopSourceEnabled(import.meta.env.DEV, window.location.hostname)
  const syncOsm = useCallback(() => {
    const inp = mapRef.current?.hintInputs()
    if (!userId || !osmEnabled || !inp) return
    void syncOsmShops(userId, inp.cleared)
  }, [userId, osmEnabled])
  useEffect(() => {
    let alive = true
    void mapRef.current?.whenShopsReady().then(() => alive && syncOsm())
    return () => {
      alive = false
    }
  }, [syncOsm])
  const [zukanInput, setZukanInput] = useState<{ mapShops: readonly Shop[]; cleared: ReadonlySet<string> } | null>(null)
  // お店のシートの「みんなの感想」。シートを開いたときだけ読み、店が替われば古い返事は捨てる
  const [sheetReviews, setSheetReviews] = useState<{ shopId: string; summary: { avg: number; count: number } | null; latest: Review[] } | null>(null)
  const selectedId = selected?.id ?? null
  useEffect(() => {
    if (!selectedId) return
    let alive = true
    Promise.all([loadSummary(selectedId), loadLatest(selectedId)])
      .then(([summary, latest]) => alive && setSheetReviews({ shopId: selectedId, summary, latest }))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [selectedId])
  const [reviewing, setReviewing] = useState<{ checkinId: string; shop: Shop; day: string } | null>(null)
  useEffect(() => {
    if (!reviewOffer?.shown) return
    const t = setTimeout(() => setReviewOffer(null), REVIEW_OFFER_MS)
    return () => clearTimeout(t)
  }, [reviewOffer])
  const [record, setRecord] = useState<{ visits: Visits | null; ready: boolean }>({ visits: null, ready: false })
  const [exploreOpen, setExploreOpen] = useState(false)
  const [pickedHint, setPickedHint] = useState<string | null>(null)
  const hints = useDailyHints({
    userId: userId ?? '',
    enabled: shopSourceEnabled(import.meta.env.DEV, window.location.hostname),
    me,
    home,
    map: mapRef,
  })
  // 町のクリア・コンプリート。新しく取れたものを帯の列に入れ（1つずつ出す）、クリアした町の霧を晴らす
  const [townNews, setTownNews] = useState<TownNews[]>([])
  const townSeen = useRef(new Set<string>())
  const aliveRef = useRef(true)
  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false // 画面を離れたら、町の呼び直しを止める
    }
  }, [])
  const [coins, setCoins] = useState<number | null>(null) // 持っているコイン（地図の上に出す）
  const onTownSync = useCallback((s: TownSync) => {
    const fresh = s.newly.filter((n) => !townSeen.current.has(`${n.id}:${n.kind}`))
    if (fresh.length === 0) return
    for (const n of fresh) {
      townSeen.current.add(`${n.id}:${n.kind}`)
      if (n.kind === 'clear' && n.town) mapRef.current?.addTown(n.town)
    }
    if (fresh.some((n) => n.kind === 'clear')) syncOsm() // 町のクリアで霧が晴れた
    setTownNews((q) => [...q, ...fresh])
    if (fresh.some((n) => n.coins > 0)) loadCoins().then(setCoins).catch(() => {}) // 町のコインを数字に反映
  }, [syncOsm])
  const busyRef = useRef(false)
  const effectSeq = useRef(0)
  const selectedRef = useRef<Shop | null>(null)
  useEffect(() => {
    selectedRef.current = selected
  })
  const closeHintSheet = hints.closeSheet
  const select = useCallback((shop: Shop | null) => {
    if (busyRef.current && shop) return // チェックイン中は別のお店にシートを入れ替えない（閉じるのは可）
    if (shop) {
      // シートは同時に1つ。探索・ヒントのシートは閉じる
      setExploreOpen(false)
      setPickedHint(null)
      closeHintSheet()
    }
    setSelected(shop)
    // 今日もうチェックインしたお店かは、板を開いたときに地図に聞いておく（描画中に ref を読まない）
    setDoneToday(shop ? (mapRef.current?.isCheckedToday(shop) ?? false) : false)
    setRecord({ visits: shop ? (mapRef.current?.visitsFor(shop) ?? null) : null, ready: mapRef.current?.progressReady() ?? false })
    setCheckinError(null)
    if (!shop) mapRef.current?.unfocus() // 板を閉じたらカメラを自分に戻す
  }, [closeHintSheet])

  // ビルの一覧（済みの印は開いたときに地図に聞いておく）
  const selectBuilding = useCallback((shops: Shop[] | null, title?: string | null) => {
    if (busyRef.current && shops) return
    setBuilding(shops ? { shops, checked: mapRef.current?.checked() ?? new Set<string>(), title: title ?? null } : null)
    if (shops) {
      setSelected(null)
      setExploreOpen(false)
      setPickedHint(null)
      closeHintSheet()
    }
  }, [closeHintSheet])

  // 週ミッション（気配のシートの下）。開いたときは出題つき、チェックインのあとは数え直しだけ
  const [missions, setMissions] = useState<MissionsState>({ status: 'loading' })
  const [missionNews, setMissionNews] = useState<Mission[]>([]) // 達成の帯の順番待ち
  const missionSeen = useRef(new Set<string>())
  const missionOpen = useRef(new Set<string>()) // 見たときにまだ達成していなかったもの（チェックイン後の呼び出しが失敗しても、次に読んだときに帯を出す）
  const applyMissions = useCallback((w: MissionWeek) => {
    setMissions({ status: 'ready', week: w })
    const fresh = w.missions.filter((m) => m.completed && (w.newly.includes(m.id) || missionOpen.current.has(m.id)) && !missionSeen.current.has(m.id))
    for (const m of w.missions) if (!m.completed) missionOpen.current.add(m.id)
    if (fresh.length === 0) return
    for (const m of fresh) missionSeen.current.add(m.id)
    setMissionNews((q) => [...q, ...fresh])
    loadCoins().then(setCoins).catch(() => {})
  }, [])
  const loadMissions = useCallback(async () => {
    setMissions((cur) => (cur.status === 'ready' ? cur : { status: 'loading' }))
    // まわりのお店がそろうのを少しだけ待つ（そろわなければ、ジャンル指定なしで出題される）
    const handle = mapRef.current
    if (handle) await Promise.race([handle.whenShopsReady().catch(() => {}), new Promise((r) => setTimeout(r, 4000))])
    const shops = mapRef.current?.hintInputs()?.shops ?? []
    const w = await syncMissions({ kinds: nearbyKinds(shops, home, me), hasHome: home !== null })
    if (!aliveRef.current) return
    if (w) applyMissions(w)
    else setMissions((cur) => (cur.status === 'ready' ? cur : { status: 'error' }))
  }, [home, me, applyMissions])

  // 探索シート
  const openExplore = () => {
    if (busyRef.current) return
    setSelected(null)
    setBuilding(null)
    setPickedHint(null)
    mapRef.current?.unfocus()
    setExploreOpen(true)
    hints.openSheet()
    void loadMissions()
  }
  const [zukanOpen, setZukanOpen] = useState(false) // 図鑑（メニューから開く）
  const [recordTab, setRecordTab] = useState<RecordTab | null>(null) // 記録（メニューから開く。マイページからは じっせき で）
  const [myPageOpen, setMyPageOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [profile, setProfile] = useState<{ nickname: string; starterId: StarterId } | null>(null)
  const [exp, setExp] = useState(0) // プレイヤーの経験値（新しいお店 +10・もう一度 +2。記録から計算）
  const visitedIds = useRef(new Set<string>()) // 行ったことのあるお店（チェックインで +10 か +2 かを決める）
  const refreshStats = useCallback(() => {
    loadProgress()
      .then((p) => {
        setExp(expFromCounts([...p.visitsByShop.values()].map((v) => v.count)))
        visitedIds.current = new Set(p.visitsByShop.keys())
      })
      .catch(() => {})
    loadCoins().then(setCoins).catch(() => {})
  }, [])
  const [soonName, setSoonName] = useState<string | null>(null) // まだ作っていない画面の名前（短く出す）
  useEffect(() => {
    if (!userId) return
    profileRepo.load(userId).then(setProfile).catch(() => setProfile(null))
    refreshStats()
  }, [userId, refreshStats])
  useEffect(() => {
    if (!soonName) return
    const t = setTimeout(() => setSoonName(null), 1600)
    return () => clearTimeout(t)
  }, [soonName])
  const closeExplore = () => {
    setExploreOpen(false)
    hints.closeSheet()
    mapRef.current?.unfocus()
  }
  // 気配を押した（ピンも、探索シートの行も同じ）。明かし済み・達成は店のシート、それ以外はカメラを寄せてヒントのシート
  const pickHint = (id: string) => {
    if (busyRef.current) return
    const h = hints.set?.hints.find((x) => x.id === id)
    if (!h) return
    const all = mapRef.current?.hintInputs()?.shops ?? []
    const at = hints.positions.get(id) ?? hintPosition(h, all)
    if (h.completed || hints.revealed.has(id)) {
      const found = all.find((s) => matchesShop(h, s))
      if (found) {
        mapRef.current?.focusAt(at)
        select(found)
        return
      }
    }
    setExploreOpen(false)
    setSelected(null)
    setBuilding(null)
    hints.closeSheet()
    setPickedHint(id)
    mapRef.current?.focusAt(at)
  }
  const closeHint = () => {
    setPickedHint(null)
    mapRef.current?.unfocus()
  }

  const checkin = async () => {
    if (!selected || !me || busyRef.current) return
    busyRef.current = true // 連打を state の反映より前に止める
    setBusy(true)
    setCheckinError(null)
    const posted = selected
    const maskedBefore = hints.isMasked(posted) // 伏せたままチェックインしたら、演出で正体を出す
    const result = await postCheckin({ shopId: posted.id, me, farFromHome: farFromHome(home, me), ...(posted.mapId ? { mapId: posted.mapId } : {}) })
    busyRef.current = false
    setBusy(false)
    if (result.ok) {
      setSelected((cur) => (cur?.id === posted.id ? null : cur))
      // 経験値: 初めてのお店 +10、行ったことのあるお店 +2（コインを受け取り済みの日は 0）
      const isNew = !(visitedIds.current.has(posted.id) || (posted.mapId !== null && visitedIds.current.has(posted.mapId)))
      const gain = result.coins === 0 ? 0 : isNew ? EXP_NEW : EXP_REVISIT
      visitedIds.current.add(posted.id)
      const before = levelFor(exp).level
      const after = levelFor(exp + gain).level
      setExp(exp + gain)
      setReviewOffer({ checkinId: result.checkinId, shop: posted, shown: false })
      setEffect({ coins: result.coins, reveal: maskedBefore ? posted.name : null, key: ++effectSeq.current, exp: gain, levelUp: after > before ? after : null })
      if (result.wasHint) hints.markCompleted(posted)
      mapRef.current?.checkin(posted, result.newCells)
      syncOsm() // チェックインで霧が晴れた
      // 3D の男の子が喜ぶ。レベルが上がるのはチェックインのときだけなので、両方でも 1 回
      mapRef.current?.express('happy')
      // 町の進み具合をサーバーに確かめる（失敗しても、チェックインはそのまま）
      refreshStats() // コインとレベルの数字を読み直す
      void syncMissions(null).then((w) => {
        if (w && aliveRef.current && w.missions.length > 0) applyMissions(w)
      })
      void syncUntilSettled(onTownSync, { alive: () => aliveRef.current })
    } else {
      if (selectedRef.current?.id === posted.id) setCheckinError(result.reason)
    }
  }

  // 探索シート・ヒントのシートに出す、気配までの距離と、気配なしの日の案内
  const distances = useMemo(() => {
    const m = new Map<string, number>()
    if (me) for (const [id, p] of hints.positions) m.set(id, distanceMeters(me, p))
    return m
  }, [me, hints.positions])
  const directions = useMemo(() => {
    const m = new Map<string, string | null>()
    if (me) for (const [id, p] of hints.positions) m.set(id, directionName(me, p))
    return m
  }, [me, hints.positions])
  const pickedHintData = pickedHint ? (hints.set?.hints.find((h) => h.id === pickedHint) ?? null) : null
  const noHints = exploreOpen && hints.status === 'ready' && hints.set !== null && hints.set.hints.length === 0
  const guide = (() => {
    if (!noHints || !me) return []
    const inputs = mapRef.current?.hintInputs()
    if (!inputs) return []
    return guideShops(inputs.near, inputs.checked, me).map((shop) => ({ shop, distanceM: distanceMeters(me, shop) }))
  })()

  const retry = () => {
    dispatch({ type: 'retry' })
    setAttempt((n) => n + 1) // 地図と位置の監視を作り直す
  }

  return (
    <>
      <MapView
        key={attempt}
        ref={mapRef}
        onStatus={dispatch}
        home={home}
        onShopsError={() => setShopsError(true)}
        onSelectShop={(shop) => {
          setBuilding(null) // 地図で別のお店を押したら、ビルの一覧からは外れる
          select(shop)
        }}
        onSelectBuilding={selectBuilding}
        onPosition={setMe}
        onHintTap={pickHint}
        pinsHidden={pinsHidden}
        paused={recordTab !== null || zukanOpen || myPageOpen || settingsOpen}
      />
      {building && !selected && (
        <BuildingSheet
          shops={building.shops}
          checkedIds={building.checked}
          maskedIds={new Set(building.shops.filter((x) => hints.isMasked(x)).map((x) => x.id))}
          hintIds={new Set(building.shops.filter((x) => hints.hintFor(x)).map((x) => x.id))}
          title={building.title}
          onPick={(shop) => select(shop) /* ビルの一覧は残しておき、お店のシートの「‹ ビル名」で戻れる */}
          onClose={() => {
            setBuilding(null)
            mapRef.current?.unfocus()
          }}
        />
      )}
      {selected && me && (
        <ShopSheet
          key={selected.id}
          shop={selected}
          visits={record.visits}
          recordReady={record.ready}
          distanceM={distanceMeters(me, selected)}
          doneToday={doneToday}
          hint={hints.hintFor(selected)}
          masked={hints.isMasked(selected)}
          reviews={sheetReviews?.shopId === selected.id ? sheetReviews : null}
          busy={busy}
          error={checkinError}
          onCheckin={() => void checkin()}
          onClose={() => {
            setBuilding(null)
            select(null)
          }}
          backLabel={building ? (building.title ?? 'このビル') : null}
          onBack={
            building
              ? () => {
                  // ビルの一覧に戻る。済みの印はチェックインを反映して読み直す
                  setSelected(null)
                  setBuilding((b) => (b ? { ...b, checked: mapRef.current?.checked() ?? b.checked } : b))
                }
              : undefined
          }
        />
      )}
      {exploreOpen && (
        <ExploreSheet
          status={hints.status}
          set={hints.set}
          revealed={hints.revealed}
          distances={distances}
          directions={directions}
          regenVisible={hints.regenVisible}
          fast={hints.fast}
          notice={hints.notice}
          guide={guide}
          onPickHint={pickHint}
          onPickShop={(shop) => {
            mapRef.current?.focusAt(shop)
            select(shop)
          }}
          onRegen={hints.regen}
          onRetry={hints.retry}
          placement="top"
          onClose={closeExplore}
          extra={<MissionTickets state={missions} onRetry={() => void loadMissions()} />}
        />
      )}
      {zukanOpen && (
        <Zukan
          mapShops={zukanInput?.mapShops}
          cleared={zukanInput?.cleared}
          onLocate={(z) => {
            setZukanOpen(false)
            mapRef.current?.focusAt(z) // 詳細の「地図で見る」: 視点をお店へ寄せて、シートを開く
            select(zukanToShop(z))
          }}
          onClose={() => setZukanOpen(false)}
        />
      )}
      {recordTab && <Record home={home} initialTab={recordTab} onTownSync={onTownSync} onClose={() => setRecordTab(null)} />}
      {myPageOpen && userId && (
        <MyPage
          userId={userId}
          nickname={profile?.nickname ?? null}
          starterId={profile?.starterId ?? 101}
          home={home}
          onNicknameChanged={(nickname) => setProfile((p) => (p ? { ...p, nickname } : p))}
          onOpenBadges={() => {
            setMyPageOpen(false)
            setRecordTab('badges')
          }}
          onClose={() => setMyPageOpen(false)}
        />
      )}
      {settingsOpen && (
        <Settings
          email={session?.user.email ?? null}
          pinsHidden={pinsHidden}
          onTogglePins={togglePins}
          onSignOut={() => void signOut()}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {pickedHintData && (
        <HintSheet hint={pickedHintData} distanceM={distances.get(pickedHintData.id) ?? null} direction={directions.get(pickedHintData.id) ?? null} onClose={closeHint} />
      )}
      {hints.newlyRevealed && (
        <RevealBanner key={hints.newlyRevealed.id} name={hints.newlyRevealed.shop.name} onDone={hints.clearNewly} />
      )}
      {townNews.length > 0 && (
        <TownBanner key={`${townNews[0].id}:${townNews[0].kind}`} news={townNews[0]} onDone={() => setTownNews((q) => q.slice(1))} />
      )}
      {!effect && townNews.length === 0 && missionNews.length > 0 && (
        <MissionBanner key={missionNews[0].id} mission={missionNews[0]} onDone={() => setMissionNews((q) => q.slice(1))} />
      )}
      {effect && <CheckinEffect key={effect.key} coins={effect.coins} exp={effect.exp} levelUp={effect.levelUp} reveal={effect.reveal} onDone={() => {
            setEffect(null)
            setReviewOffer((o) => (o ? { ...o, shown: true } : o))
            if (!selectedRef.current) mapRef.current?.unfocus() // 演出が終わったらカメラを自分に戻す
          }} />}
      {!effect && reviewOffer?.shown && (
        <button
          type="button"
          className="review-offer"
          aria-label="感想を書く"
          onClick={() => {
            setReviewing({ checkinId: reviewOffer.checkinId, shop: reviewOffer.shop, day: jstDay(new Date()) })
            setReviewOffer(null)
          }}
        >
          ✎ 感想を書く
        </button>
      )}
      {reviewing && (
        <ReviewEditor
          shopName={reviewing.shop.name}
          shopId={reviewing.shop.id}
          checkinId={reviewing.checkinId}
          visitDay={reviewing.day}
          existing={null}
          existingPhotoUrl={null}
          onSaved={() => setReviewing(null)}
          onDeleted={() => setReviewing(null)}
          onClose={() => setReviewing(null)}
        />
      )}
      <div className="map-overlay">
        <LocationOverlay status={status} onRetry={retry} onReload={() => window.location.reload()} />
        {shopsError && <p className="location-banner">お店を読み込めませんでした</p>}
        <MapHud
          nickname={profile?.nickname ?? null}
          starterId={profile?.starterId ?? 101}
          level={levelFor(exp).level}
          expInto={levelFor(exp).into}
          expSpan={levelFor(exp).span}
          coins={coins}
          hintsRemaining={hints.set ? hints.set.hints.filter((h) => !h.completed).length : null}
          hintOpen={exploreOpen}
          onHintTap={() => (exploreOpen ? closeExplore() : openExplore())}
          onZukan={() => {
            closeExplore()
            const inp = mapRef.current?.hintInputs()
            setZukanInput(inp ? { mapShops: inp.shops, cleared: inp.cleared } : null)
            syncOsm()
            setZukanOpen(true)
          }}
          onRecord={() => {
            closeExplore()
            setRecordTab('record')
          }}
          onMyPage={() => {
            closeExplore()
            setMyPageOpen(true)
          }}
          onSettings={() => {
            closeExplore()
            setSettingsOpen(true)
          }}
          onSoon={(name) => setSoonName(name)}
          subscribeBearing={subscribeBearing}
          onCompass={() => mapRef.current?.resetNorth()}
        />
        {soonName && <p className="hud-soon" role="status">{`${soonName}は準備中です`}</p>}
      </div>
    </>
  )
}

# 初回設定（ニックネーム・最初のキャラ・自宅）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 初めてログインした人が ① ニックネーム → ② 最初のキャラ → ③ 自宅 を順に決め、profiles を作ってから地図に入れるようにする。

**Architecture:** `src/setup/` を domain（判定）・infra（profiles・端末保存・現在地1回取得）・ui（3画面と振り分け）に分ける。ログイン後の画面は `SetupStatusProvider` が「profiles があるか」「この端末にこのアカウントの自宅があるか」を持ち、`SetupGate` が足りない画面へ振り分ける。

**Tech Stack:** React 19 / react-router 8 / supabase-js 2 / maplibre-gl 6 / Vitest

**Spec:** `docs/superpowers/specs/2026-11-06-initial-setup-design.md`

## Global Constraints

- 作業ブランチ `cycle1-setup`（`cycle1-map-style` から作る）
- CLAUDE.md のツールチェーン規則とクリーンアーキテクチャ（domain は React・Supabase・ブラウザ API を import しない）
- 自宅の座標はサーバー・URL・ログ・console に出さない。localStorage のキーは `mogumo.home.<userId>`、値は `{"lat":number,"lng":number}`
- 下書きは sessionStorage のキー `mogumo.setupDraft`、値は `{"nickname"?:string,"starterId"?:101|102}`
- キャラ: `101` = 男の子（`src/assets/characters/starter-boy.webp`）、`102` = 女の子（`starter-girl.webp`）
- ニックネーム: 前後の空白を除いてから、Unicode のコードポイント数で 1〜10
- 文言（そのまま）:
  - ①見出し「ニックネームを決めよう」、説明「10文字まで。ほかの人と同じでも大丈夫です。あとから変えられます」、残り「あと{n}文字」、エラー「ニックネームを入れてください」「10文字までにしてください」、ボタン「次へ」
  - ②見出し「最初のなかまを選ぼう」、カードの名前「男の子」「女の子」、ボタン「次へ」（未選択のあいだは押せない）
  - ③見出し「自宅の場所を決めよう」、説明「地図を動かして、家の印を自宅に合わせてください。自宅の場所はこのスマホの中だけに保存します」、ボタン「現在地へ」「ここを自宅にする」、保存中「保存しています…」、失敗「保存できませんでした。もう一度お試しください」
  - 共通の戻るボタン「戻る」、読み込み中「読み込み中…」
- 位置情報が取れないときの文言は `src/map/ui/LocationOverlay.tsx` をそのまま使う
- 各タスクの終わりに `npm test`・`npx tsc -b`・`npx oxlint src` が通ること

## Review Focus

1. **自宅の座標がサーバーに送られる** → profiles 作成の送信内容が `{ nickname, starter_character_id }` だけであること（Task 2 のテスト）
2. **同じスマホの別アカウントに前の人の自宅が出る** → user_id ごとに別キーで、別の id では読めない（Task 2 のテスト）
3. **「ここを自宅にする」を2回押す** → profiles を2回作ろうとして2回目が失敗表示になる → 保存中はボタンを押せず、作成は1回だけ（Task 4 のテスト）
4. **profiles を作った直後にアプリが落ちて自宅が保存されなかった** → 次に開いたとき `/setup/home` だけが出て、profiles は作り直さない（Task 3・4 のテスト）
5. **②や③の URL を直接開く／リロード** → ニックネームが無ければ①へ、キャラが無ければ②へ戻す。入力済みの下書きは残る（Task 4 のテスト）

---

### Task 1: 判定（domain）

**Files:** Create `src/setup/domain/nickname.ts`・`home.ts`・`gate.ts` とそれぞれの `.test.ts`

**Interfaces — Produces:**
- `nickname.ts`: `export type NicknameCheck = { ok: true; value: string } | { ok: false; reason: 'empty' | 'tooLong' }`、`checkNickname(raw: string): NicknameCheck`、`remainingChars(raw: string): number`（10 − 前後の空白を除いたコードポイント数。負もそのまま返す）
- `home.ts`: `export type Home = { lat: number; lng: number }`、`parseHome(text: string | null): Home | null`
- `gate.ts`: `export type SetupState = { hasProfile: boolean; hasHome: boolean }`、`nextSetupPath(s: SetupState): '/setup/name' | '/setup/home' | null`（null＝地図へ進んでよい）

- [ ] **Step 1: 失敗するテスト**
  - `checkNickname('  もぐ  ')` → `{ ok: true, value: 'もぐ' }`／`'   '` → empty／`''` → empty／`'あ'.repeat(10)` → ok／`'あ'.repeat(11)` → tooLong／`'😀'.repeat(10)` → ok（コードポイント数）
  - `remainingChars('もぐもぐ')` → 6
  - `parseHome('{"lat":35.7,"lng":139.5}')` → その値／`null`・`'x'`・`'{"lat":"a","lng":1}'`・`'{"lat":91,"lng":0}'`・`'{"lat":0,"lng":181}'` → null
  - `nextSetupPath`: profile なし（home の有無にかかわらず）→ `/setup/name`／profile あり・home なし → `/setup/home`／両方 → null
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装
- [ ] **Step 4:** `npm test`・`npx tsc -b`・`npx oxlint src` → PASS
- [ ] **Step 5:** コミット `feat(setup): add nickname, home and gate rules`

### Task 2: 保存先（infra）

**Files:** Create `src/setup/infra/homeStore.ts`・`draftStore.ts`・`profileRepo.ts`・`currentLocation.ts` とそれぞれの `.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Home`・`parseHome`、`src/map/domain/locationStatus.ts` の `GeoFailure`
- Produces:
  - `homeStore.ts`: `loadHome(userId: string, storage?: Storage): Home | null`、`saveHome(userId: string, home: Home, storage?: Storage): void`（既定は `localStorage`。読み書きの例外は握りつぶし、load は null）
  - `draftStore.ts`: `export type SetupDraft = { nickname?: string; starterId?: 101 | 102 }`、`loadDraft(storage?: Storage): SetupDraft`、`saveDraft(patch: SetupDraft, storage?: Storage): void`（既存とマージ）、`clearDraft(storage?: Storage): void`（既定は `sessionStorage`）
  - `profileRepo.ts`: `export type ProfileRepo = { exists(userId: string): Promise<boolean>; create(input: { nickname: string; starterId: 101 | 102 }): Promise<void> }`、`createProfileRepo(client: SupabaseClient): ProfileRepo`、`profileRepo = createProfileRepo(supabase)`。`create` は `from('profiles').insert({ nickname, starter_character_id: starterId })`、エラーなら throw。`exists` は `select('user_id').eq('user_id', userId).maybeSingle()`、エラーなら throw
  - `currentLocation.ts`: `getCurrentLocation(geo?: Geolocation): Promise<Home>`（`enableHighAccuracy: true, timeout: 15000`。失敗は `GeoFailure` を reject）

- [ ] **Step 1: 失敗するテスト**（Storage と Geolocation と Supabase は偽物を渡す）
  - homeStore: 保存した値を同じ userId で読める／**別の userId では null**／壊れた値は null／`getItem` が throw しても null
  - draftStore: `saveDraft({nickname:'a'})` のあと `saveDraft({starterId:101})` で両方残る／`clearDraft` で `{}`
  - profileRepo: `create` が `insert` に渡す値が**ちょうど** `{ nickname: 'もぐ', starter_character_id: 101 }`（lat・lng などを含まない）／insert がエラーを返すと reject／`exists` は行があれば true、null なら false
  - currentLocation: 成功で `{lat,lng}`、コード1 → `'denied'`、3 → `'timeout'` で reject
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装
- [ ] **Step 4:** `npm test`・`npx tsc -b`・`npx oxlint src` → PASS
- [ ] **Step 5:** コミット `feat(setup): add profile repo, device stores and one-shot location`

### Task 3: 振り分け（ui）

**Files:** Create `src/setup/ui/SetupStatus.tsx`（Context と Provider）、`src/setup/ui/SetupGate.tsx`、`src/setup/ui/setupGate.test.tsx`。Modify `src/routes/router.tsx`、`src/routes/routes.test.tsx`。Delete `src/routes/SetupPage.tsx`

**Interfaces:**
- Consumes: Task 1 `nextSetupPath`、Task 2 `ProfileRepo`・`loadHome`、`useAuth`
- Produces:
  - `SetupStatus.tsx`: `export type SetupStatus = { loading: boolean; error: boolean; hasProfile: boolean; hasHome: boolean; markProfileCreated(): void; markHomeSaved(): void; retry(): void }`、`SetupStatusContext`、`useSetupStatus(): SetupStatus`、`SetupStatusProvider({ children, repo? }: { children: ReactNode; repo?: ProfileRepo })`（既定は `profileRepo`。`session.user.id` で `exists` を1回、`loadHome` を1回）
  - `SetupGate.tsx`: `RequireSetupDone`（未完了なら `nextSetupPath` へ `<Navigate replace>`、完了なら `<Outlet />`）、`RedirectIfSetupDone`（完了なら `/` へ、`/setup/home` は profile があって home が無いときだけ通す）
  - ルート: `RequireAuth` の下に `SetupStatusProvider` を置き、その下に `{ element: <RequireSetupDone/>, children: [{ path: '/' }] }` と `{ path: '/setup', element: <RedirectIfSetupDone/>, children: [index → Navigate 'name', 'name', 'character', 'home'] }`

- [ ] **Step 1: 失敗するテスト**（`SetupStatusContext.Provider` に値を直接渡す）
  - profile なし → `/` を開くと `/setup/name` の画面（見出し「ニックネームを決めよう」）
  - profile あり・home なし → `/` で「自宅の場所を決めよう」
  - 両方あり → `/` で地図（`map-view`）。`/setup/name` を開いても地図へ戻る
  - profile あり・home なしで `/setup/name` を開くと `/setup/home` へ
  - loading 中は「読み込み中…」、error なら「読み込めませんでした」と「もう一度試す」（押すと `retry`）
  - 既存の routes.test のログイン済みケースは、Provider に「両方あり」を渡して地図が出ること
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装（Task 4 の画面は、このタスクでは見出しだけの仮で置き、Task 4 で中身を作る）
- [ ] **Step 4:** `npm test`・`npx tsc -b`・`npx oxlint src` → PASS
- [ ] **Step 5:** コミット `feat(setup): route users to the missing setup step`

### Task 4: 3つの画面（ui）

**Files:** Create `src/setup/ui/NamePage.tsx`・`CharacterPage.tsx`・`HomePage.tsx`・`HomePickerMap.tsx`・`setup.css`・`pages.test.tsx`

**Interfaces:**
- Consumes: Task 1〜3 のすべて、`src/map/config.ts`（`STYLE_URL`・`MAP_THEME`・`MIN_ZOOM`・`MAX_ZOOM`・`INITIAL_ZOOM`）、`src/map/infra/theme.ts`・`themes.ts`・`maplibreWorker.ts`、`LocationOverlay`
- Produces: `HomePickerMap({ start, onCenterChange }: { start: Home; onCenterChange: (center: Home) => void })`（MapLibre。指で動かせる・回転なし・pitch 0。中央に CSS で描いた家の印を重ねる。`moveend` で中心を返す）。テストでは `vi.mock` で差し替える

- [ ] **Step 1: 失敗するテスト**（`HomePickerMap`・`getCurrentLocation`・`ProfileRepo` は偽物）
  - ①: 11文字で「10文字までにしてください」と「次へ」が押せない／空白だけで「ニックネームを入れてください」／「もぐもぐ」で「あと6文字」→「次へ」で `/setup/character`、下書きに `nickname: 'もぐもぐ'`
  - ②: 下書きにニックネームが無いと `/setup/name` へ／「女の子」を押して「次へ」で `/setup/home`、下書きに `starterId: 102`／未選択では「次へ」が押せない
  - ③（profile なし）: 下書きにキャラが無いと `/setup/character` へ／現在地が取れるまで「現在地を探しています…」／取れたら地図／「ここを自宅にする」で `create({ nickname, starterId })` が**1回だけ**（2回押しても）→ `saveHome(userId, 地図の中心)` → `clearDraft` → `/`
  - ③: `create` が失敗したら「保存できませんでした。もう一度お試しください」、自宅は保存されず画面に残る
  - ③（profile あり・home なし）: 下書きが無くても表示され、「ここを自宅にする」で `create` は呼ばれず `saveHome` だけ
  - ③: 現在地が `denied` なら「位置情報がオフになっています」、`timeout` なら「現在地が見つかりません」と「もう一度試す」
  - 各画面の「戻る」で1つ前へ（①には無い）
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装。カードの画像は `import boy from '../../assets/characters/starter-boy.webp'` のように ui 層で読み込む
- [ ] **Step 4:** `npm test`・`npx tsc -b`・`npm run build`・`npx oxlint src` → PASS
- [ ] **Step 5: 確認**: Playwright で3画面のスクショ（ログインは偽の Context で通す確認用ページ）。本人は開発環境の iPhone で通し確認（新しいアカウントか、開発用 Supabase の profiles が空の状態で）
- [ ] **Step 6:** コミット `feat(setup): nickname, starter character and home screens`

### Task 5: 記録

**Files:** Modify `CLAUDE.md`（現状の節に `src/setup/`）、`docs/basic-design.md`（N-01 に決定）、`docs/detailed-design-db.md`（D-09 に 101＝男の子・102＝女の子）、`docs/learning-log.md`（8件目）

- [ ] **Step 1:** 追記して `npm test` が通ることを確認し、コミット `docs: record initial setup step`

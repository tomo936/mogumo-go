# 土台作り（ルーティング・テスト・Google ログイン・Vercel）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google でログインして仮の地図画面に入れるアプリの骨組みを、テスト付きで作り、Vercel で配信できる状態にする。

**Architecture:** React Router（library mode、`createBrowserRouter`）で `/login`・`/setup`・`/` の3画面。ログイン状態は `AuthProvider`（Context）が Supabase Auth から受け取り、`RequireAuth` が未ログインを `/login` へ戻す。画面のテストは Context に値を直接渡して行い、Supabase は `vi.mock` で差し替える。

**Tech Stack:** React 19 / Vite 8 / TypeScript 7 / react-router 7 / @supabase/supabase-js 2 / Vitest＋@testing-library/react＋jsdom

**Spec:** `docs/superpowers/specs/2026-11-05-foundation-design.md`

## Global Constraints

- import は拡張子付き（`./App.tsx`）、型のみは `import type`、enum・namespace 不可、未使用の変数・引数はビルドエラー（CLAUDE.md）
- ブラウザが読む環境変数は `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` の2つだけ。`.env*` は読まない・作らない
- npm は Sandbox 内で `--cache "$TMPDIR/npm-cache"` を付けて実行する
- 画像素材を新しく使わない（Vite デモの画像は削除してよい）
- 各タスクの終わりに `npm test`・`npm run build`・`npm run lint` がすべて通ること
- 文言: ログインボタン「Google でログイン」、ログアウトボタン「ログアウト」、仮画面の見出し「もぐもGO」「初回設定（準備中）」「地図（準備中）」、読み込み中「読み込み中…」

## Review Focus

1. **Google から戻った直後**（URL にログイン情報が付いた状態）に、読み込み中のまま `/login` へ飛ばしてしまうと、ログインが成立しない → `RequireAuth` は `loading` 中はリダイレクトしない（Task 3 のテスト）
2. **Vercel 上でログイン**したとき、戻り先が `localhost` 固定だと戻れない → `signInWithOAuth` の `redirectTo` は `window.location.origin`（Task 2 のテスト）
3. **環境変数が未設定の Vercel**では真っ白になる → `src/lib/supabase.ts` が分かる文言で例外を投げる（Task 2 のテスト）
4. **`/setup` などを直接開く・リロード**すると Vercel で 404 → `vercel.json` の書き換え設定（Task 4、手動確認）
5. **ログイン済みで `/login` を開いた**とき、ログイン画面が出たままになる → `/` へ戻す（Task 3 のテスト）

---

### Task 1: テスト基盤

**Files:**
- Modify: `package.json`（`"test": "vitest run"` を追加）、`vite.config.ts`（`test` 設定）、`tsconfig.app.json`（`types` に `vitest/globals` は入れない。明示 import を使う）
- Create: `src/test/setup.ts`（`import '@testing-library/jest-dom/vitest'`）、`src/test/sanity.test.ts`
- Modify: `CLAUDE.md`（コマンド節「テスト: 未導入」→「テスト: `npm test`（Vitest）」、現状の節も更新）

- [ ] **Step 1:** devDependencies に `vitest`、`jsdom`、`@testing-library/react`、`@testing-library/jest-dom`、`@testing-library/user-event` を追加（Vite 8 に対応する最新版。インストール後に `npx vitest --version` で確認）
- [ ] **Step 2:** `vite.config.ts` の `defineConfig` を `vitest/config` から import し、`test: { environment: 'jsdom', setupFiles: ['./src/test/setup.ts'] }` を追加
- [ ] **Step 3:** `src/test/sanity.test.ts` に `expect(1 + 1).toBe(2)` を書き、`npm test` → PASS 1件
- [ ] **Step 4:** `npm run build` と `npm run lint` が通ることを確認（テストファイルも tsc の対象。型エラーが出たら `vitest` の型を import で解決）
- [ ] **Step 5:** コミット `chore: add Vitest and Testing Library`

### Task 2: Supabase クライアントとログイン状態（AuthProvider）

**Files:**
- Modify: `src/lib/supabase.ts`
- Create: `src/auth/AuthContext.ts`、`src/auth/AuthProvider.tsx`、`src/auth/AuthProvider.test.tsx`、`src/lib/supabase.test.ts`

**Interfaces:**
- Produces:
  - `src/auth/AuthContext.ts`: `export type AuthState = { session: Session | null; loading: boolean; signInWithGoogle: () => Promise<void>; signOut: () => Promise<void> }`、`export const AuthContext = createContext<AuthState | null>(null)`、`export function useAuth(): AuthState`（Provider 外で呼ぶと `Error('useAuth must be used inside AuthProvider')`）
  - `src/auth/AuthProvider.tsx`: `export function AuthProvider({ children }: { children: ReactNode })`
  - `src/lib/supabase.ts`: `export function createSupabase(url: string | undefined, key: string | undefined): SupabaseClient` と `export const supabase = createSupabase(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)`

- [ ] **Step 1: 失敗するテストを書く**
  - `supabase.test.ts`: `createSupabase(undefined, 'x')` と `createSupabase('https://a.supabase.co', undefined)` が `/VITE_SUPABASE_URL.*VITE_SUPABASE_ANON_KEY/` に一致するメッセージで throw する
  - `AuthProvider.test.tsx`（`vi.mock('../lib/supabase.ts')` で `supabase.auth` の `getSession`・`onAuthStateChange`・`signInWithOAuth`・`signOut` を差し替え）:
    - `getSession` が解決する前は `loading === true`、解決後は `loading === false` かつ `session` が返った値
    - `onAuthStateChange` のコールバックに新しい session を渡すと `session` が更新される
    - アンマウントで `subscription.unsubscribe` が呼ばれる
    - `signInWithGoogle()` が `signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })` を呼ぶ
- [ ] **Step 2:** `npm test` → 上記が FAIL
- [ ] **Step 3:** 実装。`createSupabase` は値が欠けていたら `Error('VITE_SUPABASE_URL と VITE_SUPABASE_ANON_KEY を設定してください')` を投げる。`AuthProvider` は `getSession` と `onAuthStateChange` で session を持つ
- [ ] **Step 4:** `npm test`・`npm run build`・`npm run lint` → PASS
- [ ] **Step 5:** コミット `feat: add Supabase auth provider`

### Task 3: 画面とルーティング

**Files:**
- Create: `src/routes/router.tsx`、`src/routes/RequireAuth.tsx`、`src/routes/LoginPage.tsx`、`src/routes/SetupPage.tsx`、`src/routes/MapPage.tsx`、`src/routes/routes.test.tsx`
- Modify: `src/main.tsx`（`<AuthProvider><RouterProvider router={router} /></AuthProvider>`）、`src/index.css`（白基調の最低限に置き換え）
- Delete: `src/App.tsx`、`src/App.css`、`src/assets/hero.png`、`src/assets/react.svg`、`src/assets/vite.svg`

**Interfaces:**
- Consumes: Task 2 の `AuthContext`・`useAuth`・`AuthState`
- Produces: `src/routes/router.tsx`: `export const routes: RouteObject[]`（テスト用）と `export const router = createBrowserRouter(routes)`。`/login` は公開、`/`・`/setup` は `RequireAuth` の子

- [ ] **Step 1: 失敗するテストを書く**（`createMemoryRouter(routes, { initialEntries: [...] })` を `AuthContext.Provider` で包み、`AuthState` を直接渡す）
  - 未ログイン（`session: null, loading: false`）で `/` → 「Google でログイン」ボタンが出る
  - 未ログインで `/setup` → 同上
  - 読み込み中（`loading: true`）で `/` → 「読み込み中…」が出て、「Google でログイン」は出ない
  - ログイン済みで `/` → 「地図（準備中）」と「ログアウト」が出る
  - ログイン済みで `/setup` → 「初回設定（準備中）」が出る
  - ログイン済みで `/login` → 「地図（準備中）」が出る
  - 「Google でログイン」を押すと `signInWithGoogle` が1回呼ばれる。「ログアウト」を押すと `signOut` が1回呼ばれる
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** 実装。`RequireAuth` は loading 中「読み込み中…」、session 無しで `<Navigate to="/login" replace />`、あれば `<Outlet />`。`LoginPage` は loading 中「読み込み中…」、session ありで `<Navigate to="/" replace />`
- [ ] **Step 4:** `npm test`・`npm run build`・`npm run lint` → PASS
- [ ] **Step 5: 手動確認（本人）:** `npm run dev` → `http://localhost:5173` → Google でログイン → 「地図（準備中）」→ ログアウト → ログイン画面に戻る
- [ ] **Step 6:** コミット `feat: add login, setup and map routes`

### Task 4: Vercel 配信

**Files:**
- Create: `vercel.json`: `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`
- Modify: `docs/learning-log.md`（作業記録。本人の感想欄は触らない）

- [ ] **Step 1:** `vercel.json` を作り、`npm run build` が通ることを確認してコミット `chore: add Vercel SPA rewrite`
- [ ] **Step 2（本人）:** GitHub へ push（WSL の認証設定が済んでいること）
- [ ] **Step 3（本人）:** Vercel で GitHub の `mogumo-go` を Import（Framework: Vite）。Environment Variables に `VITE_SUPABASE_URL`・`VITE_SUPABASE_ANON_KEY` を登録してデプロイ
- [ ] **Step 4（本人）:** 発行された URL を、Supabase の Redirect URLs（`https://<vercel の URL>/**`）と Google の JavaScript 生成元に追加
- [ ] **Step 5（本人）:** iPhone で Vercel の URL を開き、ログイン → 仮の地図 → `/setup` を直接開いてリロードしても表示される

# 図鑑（案B）＋感想と写真 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 図鑑を案B のコレクションカードに作り直し、行ったお店に星・ひとこと・写真 1 枚の感想（公開／非公開）を残して、みんなの感想を見たり通報したりできるようにする。

**Architecture:**
- 新しいフォルダ `src/reviews/`（domain／infra／ui）が、感想の決まり・Supabase の読み書き・写真の縮小・画面を持つ。
- 図鑑（`src/zukan/ui/`）と地図（`MapPage`・`ShopSheet`）は、その部品を使うだけにする。
- サーバーは今ある表・RLS・バケットに `0007_review_visibility.sql` を足すだけで、関数は増やさない。

**Tech Stack:** React 19 / TypeScript 7 / Vitest＋Testing Library / Supabase JS（PostgREST・Storage）/ `@fontsource/m-plus-rounded-1c`

**Spec:** `docs/superpowers/specs/2026-11-12-zukan-b-reviews-design.md`（見た目の元は `.superpowers/preview/zukan2/z.css` の `.dB` と `z.ts`）

## Global Constraints
- 星 1〜5（必須）。ひとことは前後の空白を除いて 1〜500 文字、または無し（null）。写真は 0〜1 枚。
- 公開は既定 true。他人に見えるのは `hidden = false かつ is_public`（RLS が守る）。
- 写真は canvas で JPEG に描き直してから送る。250KB 以下、長い辺 1080px 以下。置き場所は `review-photos/{uid}/{uuid}.jpg`。
- 期限付き URL は 3600 秒。
- みんなの感想は 10 件ずつ、新しい順で、自分の分は除く。ニックネームは `public_profiles` だけから読む。
- 図鑑の 1 ページは 9 枚（3 列×3 段）。
- 丸い字体は `.zukan`・`.zd`・`.rv-ed` の中だけに使う。
- 依存の向きは ui → infra → domain。domain は何も import しない。import には拡張子を付け、型は `import type` にする。
- 各タスクの最後に、`npm test`・`npx tsc -b`・`npm run lint` を通してからコミットする。

## Review Focus
1. **非公開の感想が他人に出ないこと。** RLS が守るが、アプリ側でも、みんなの感想の読み取りで `user_id` が自分の行を除くこと、件数・平均が返ってきた行だけで計算されることを、テストで確かめる（Task 3）。
2. **保存に失敗しても、書いた文・星・写真が画面に残ること**（Task 5）。
3. **写真を替える・外す・感想を消すときに、古いファイルを消すこと。消すのに失敗しても、感想の保存は成功扱いにすること**（Task 3）。
4. **10 秒のボタンの途中で別のチェックインをしたら、新しいチェックインの ID に替わること**（Task 7）。
5. **ひとことが空白だけのときは null として保存し、500 文字を超えたら保存できないこと**（Task 1・5）。

---

### Task 1: 感想の決まり（domain）

**Files:**
- Create: `src/reviews/domain/review.ts`
- Test: `src/reviews/domain/review.test.ts`

**Interfaces:**
- Produces:
  - `type Review = { id: string; checkinId: string; shopId: string; userId: string; stars: number; body: string | null; photoPath: string | null; isPublic: boolean; createdAt: string; nickname: string | null }`
  - `type Draft = { stars: number; body: string; isPublic: boolean }`
  - `type DraftError = 'stars' | 'too_long'`
  - `validateDraft(d: Draft): { ok: true; stars: number; body: string | null; isPublic: boolean } | { ok: false; error: DraftError }`
  - `summarize(stars: readonly number[]): { avg: number; count: number } | null`（avg は小数 1 桁に丸める）
  - `type VisitRef = { checkinId: string; checkedInAt: string }`
  - `targetCheckin(visits: readonly VisitRef[], mine: readonly Review[]): { checkinId: string; existing: Review | null } | null`（いちばん新しい訪問。感想があれば existing）
  - `myReviewsByVisit(visits: readonly VisitRef[], mine: readonly Review[]): Review[]`（訪問の新しい順）
  - `REVIEW_BODY_MAX = 500`、`REVIEWS_PAGE = 10`

- [ ] **Step 1: 失敗するテストを書く**
  - `validateDraft({stars:0,...})` → `{ok:false,error:'stars'}`。stars 6・3.5 も 'stars'。
  - `validateDraft({stars:4, body:'  ', isPublic:true})` → `body: null`。
  - 501 文字 → `'too_long'`。500 文字 → ok。
  - `summarize([])` → null。`summarize([5,4,4])` → `{avg:4.3,count:3}`。
  - `targetCheckin` は、訪問が `[a(11-03), b(10-12)]` で感想が b だけなら `{checkinId:a, existing:null}`。a にあれば existing はその感想。訪問 0 件なら null。
  - `myReviewsByVisit` は a の感想を b より先に並べる。訪問に無い感想は出さない。
- [ ] **Step 2:** `npx vitest run src/reviews/domain` → FAIL（未定義）
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** 同じコマンド → PASS
- [ ] **Step 5:** コミット `reviews: domain rules (validate, summarize, target visit)`

### Task 2: 写真の縮小

**Files:**
- Create: `src/reviews/domain/photoFit.ts`（純粋な計算）、`src/reviews/infra/photo.ts`（canvas）
- Test: `src/reviews/domain/photoFit.test.ts`

**Interfaces:**
- Produces:
  - `fitSize(w: number, h: number, maxSide: number): { w: number; h: number }`（縦横比を保ち、小さければそのまま。整数に丸める）
  - `nextAttempt(a: { quality: number; scale: number }): { quality: number; scale: number } | null`
    - 品質を 0.82 から 0.06 ずつ下げる。0.5 を下回るなら品質を 0.82 に戻し、scale を ×0.85 にする。
    - scale が 0.3 を下回るなら null。
  - `PHOTO_MAX_BYTES = 250 * 1024`、`PHOTO_MAX_SIDE = 1080`
  - `compressPhoto(file: Blob): Promise<Blob>`（infra）
    - `createImageBitmap(file, { imageOrientation: 'from-image' })` → canvas → `toBlob('image/jpeg', q)`。
    - 250KB 以下になるまで `nextAttempt` を回す。読めない・縮まないときは `Error('photo_unusable')`。
- [ ] **Step 1:** テストを書く。
  - `fitSize(4032,3024,1080)` → `{w:1080,h:810}`。
  - `fitSize(800,600,1080)` → そのまま。
  - `nextAttempt({quality:0.82,scale:1})` → `{0.76,1}`。
  - `nextAttempt({quality:0.52,scale:1})` → `{0.82,0.85}`。
  - scale 0.31 から下げると null。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。`compressPhoto` は jsdom では動かないので、単体テストは domain だけにする。
- [ ] **Step 4:** PASS を確かめる。
- [ ] **Step 5:** コミット `reviews: photo fitting and compression`

### Task 3: Supabase の読み書き（infra）

**Files:**
- Create: `src/reviews/infra/reviewsApi.ts`
- Test: `src/reviews/infra/reviewsApi.test.ts`

**Interfaces:**
- Consumes: Task 1 の型、Task 2 の `compressPhoto`
- Produces（どれも、最後の引数でテスト用の client を渡せる。省略時は `src/lib/supabase.ts`）:
  - `loadMine(shopId): Promise<{ visits: VisitRef[]; mine: Review[] }>`
    - `checkins`（本人・その店・`checked_in_at` の新しい順）と、`reviews`（`user_id = 自分`・その店）を読む。
  - `loadOthers(shopId, page: number): Promise<{ items: Review[]; hasMore: boolean }>`
    - `reviews` を `neq('user_id', 自分)`・新しい順で、`range(page*10, page*10+10)` で 11 件読み、10 件と hasMore にする。
    - `public_profiles` を `in('user_id', ids)` で読み、nickname を合わせる。
  - `loadSummary(shopId): Promise<{ avg: number; count: number } | null>`
    - 自分を除いた `stars` 列だけを読み、`summarize` する。
  - `loadLatest(shopId, n = 2): Promise<Review[]>`（お店のシート用。写真の URL は取らない）
  - ~~`loadMyLatestStars()`~~（2026-11-12 カードの下の段をお店の特徴に変えたので削除）
    - 図鑑の一覧用。自分の感想を `created_at` の新しい順に読み、店ごとに最初の 1 件の星を取る。
  - `saveReview(input: { shopId; checkinId; existing: Review | null; stars; body; isPublic; photo: { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: Blob } }): Promise<Review>`
    - 新しい写真なら、`compressPhoto` してから `{uid}/{crypto.randomUUID()}.jpg` に上げる。
    - そのあと insert または update する。
    - 成功したら、古い写真を消す（`remove`／`new` で古いのがあるとき。消すのに失敗しても成功を返す）。
    - insert／update に失敗したら、上げたばかりの写真を消して throw する。
  - `deleteReview(r: Review): Promise<void>`（行を消してから写真を消す）
  - `reportReview(id): Promise<'ok' | 'already'>`（一意違反 `23505` は 'already'）
  - `photoUrls(paths: string[]): Promise<Map<string, string>>`（`createSignedUrls(paths, 3600)`。空なら呼ばない）
  - 返事を読むときは、型が違う行を捨てる（壊れた返事でも落ちない）。
- [ ] **Step 1:** テストを書く（偽の client。`zukanApi.test.ts` の書き方に合わせる）。
  - `loadOthers` が `neq('user_id', 自分)` を付け、11 件返れば `hasMore:true` で 10 件にする。nickname を合わせる。
  - 壊れた行（stars が文字）を捨てる。
  - `saveReview` の new：上げる → insert → 古い写真の remove の順に呼ぶ。
  - insert に失敗したら、上げた写真を remove して throw する。
  - remove の失敗は無視する。
  - `reportReview` の 23505 → 'already'。
  - `loadMyLatestStars` は店ごとに新しい 1 件を取る。
  - `photoUrls([])` は client を呼ばない。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** PASS を確かめる。
- [ ] **Step 5:** コミット `reviews: supabase api (mine, others, summary, save with photo, report)`

### Task 4: 図鑑の一覧（案B）と字体

**Files:**
- Modify:
  - `package.json`（`npm i @fontsource/m-plus-rounded-1c`）
  - `src/zukan/domain/zukan.ts`（`PAGE_SIZE = 9`）
  - `src/zukan/ui/Zukan.tsx`
  - `src/zukan/ui/zukan.css`（全部書き直し）
  - `src/settings/ui/Settings.tsx`・`src/credits/`（出典に「M PLUS Rounded 1c（SIL Open Font License 1.1）」）
- Test: `src/zukan/ui/Zukan.test.tsx`、`src/zukan/domain/zukan.test.ts`、`src/settings/ui/Settings.test.tsx`

**Interfaces:**
- Consumes: `loadMyLatestStars`（Task 3）。`loadZukan` と同時に読む。失敗しても図鑑は出す（星は「感想まだ」になる）。
- Produces: `cardNo(indexInKind: number): string` → `'No.001'`（`zukan.ts` に置く）

- [ ] **Step 1:** テストを書く。
  - 行ったカードに `No.001`、名前、「6回」、星 4 なら `★★★★☆`、星が無ければ「感想まだ」。
  - 金・銀のカードに class `zukan__card--gold`／`--silver` が付く。
  - 行っていないカードは「？？？」とキャッチで、押せない。
  - 1 ページは 9 枚。
  - 設定の出典にフォントの名前がある。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。
  - 見た目は見本の `.dB` を、今の class 名（`zukan__*`）に移す。
  - タブにはピンの絵（`src/assets/pins/<kind>.png`。`PIN_ICON` があれば使う）を付ける。
  - `@fontsource/m-plus-rounded-1c/500.css`・`800.css`・`900.css` を `zukan.css` の先頭で import する。
  - `font-family: 'M PLUS Rounded 1c', system-ui, sans-serif` は `.zukan, .zd, .rv-ed` だけに付ける。
- [ ] **Step 4:** PASS を確かめる。さらに、見本の撮影の台本で実物の一覧を 1 枚撮り、見本の B と見比べる。
- [ ] **Step 5:** コミット `zukan: option B collection cards, rounded font, 9 per page`

### Task 5: 感想を書く画面

**Files:**
- Create: `src/reviews/ui/ReviewEditor.tsx`、`src/reviews/ui/reviews.css`
- Test: `src/reviews/ui/ReviewEditor.test.tsx`

**Interfaces:**
- Consumes: `validateDraft`、`saveReview`、`deleteReview`
- Produces: `ReviewEditor(props: { shopName: string; shopId: string; checkinId: string; visitDay: string; existing: Review | null; existingPhotoUrl: string | null; onSaved: (r: Review) => void; onDeleted: () => void; onClose: () => void; save?: typeof saveReview; remove?: typeof deleteReview })`

- [ ] **Step 1:** テストを書く。
  - 星を選ぶまで「保存」が押せない。
  - 星 4 とひとことで保存すると、`save` に `{stars:4, body:'…', isPublic:true, photo:{kind:'keep'}}` が渡る。
  - 「みんなに見せる」をオフにすると `isPublic:false`。
  - 501 文字は「500 文字までです」と出て保存されない。
  - `save` が reject すると「保存できませんでした。もう一度押してください」と出て、入力が残る。
  - existing があると「この感想を消す」→ 確認 → `remove`。
  - 写真の「外す」で `{kind:'remove'}`。
  - 保存中はボタンが「保存しています…」で押せない。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。
  - 写真は `<input type="file" accept="image/*">` で選び、`URL.createObjectURL` で見本を出す（閉じるときに revoke する）。
  - `compressPhoto` の `photo_unusable` は「この写真は使えませんでした」と出す。
- [ ] **Step 4:** PASS を確かめる。
- [ ] **Step 5:** コミット `reviews: editor (stars, note, photo, public switch, delete)`

### Task 6: 図鑑の詳細（案B）＋わたしの感想＋みんなの感想

**Files:**
- Create: `src/reviews/ui/MyReviews.tsx`、`src/reviews/ui/ReviewList.tsx`
- Modify: `src/zukan/ui/ZukanDetail.tsx`、`src/zukan/ui/zukan.css`
- Test: `src/reviews/ui/MyReviews.test.tsx`、`src/reviews/ui/ReviewList.test.tsx`、`src/zukan/ui/Zukan.test.tsx`

**Interfaces:**
- Consumes: `loadMine`、`loadOthers`、`loadSummary`、`photoUrls`、`reportReview`、`targetCheckin`、`myReviewsByVisit`、`ReviewEditor`
- Produces:
  - `MyReviews(props: { shopId; shopName; load?: typeof loadMine })`
    - 先頭の感想、「前の感想（n件）」、非公開なら「🔒 自分だけ」、「書く・直す」→ editor。
  - `ReviewList(props: { shopId; load?; summary?; report? })`
    - 件数と平均、10 件、「もっと見る」、写真を押すと大きく、「⋯」→「通報する」→ 確認 → `reportReview`。'already' でも「通報しました」と出す。
- [ ] **Step 1:** テストを書く。
  - MyReviews：感想 0 件なら「まだ感想がありません」と「感想を書く」。非公開の札。前の感想の件数。
  - ReviewList：0 件の文、「もっと見る」で page 1 を読む、通報の確認と結果。
  - ZukanDetail：`No.` とはんこ、数字 3 つ、2 つの欄がある。「準備中」の文が無い。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する（見本の `detailView` を元にする。共有ボタンと「お店の情報」は出さない）。
- [ ] **Step 4:** PASS を確かめる。実物の詳細を 1 枚撮って見本と見比べる。
- [ ] **Step 5:** コミット `zukan: option B detail with my reviews and everyone's reviews`

### Task 7: チェックインの直後の「感想を書く」

**Files:**
- Modify: `src/routes/MapPage.tsx`（成功の `result.checkinId` と店を持つ。演出の `onDone` のあと 10 秒ボタン）、`src/checkin/ui/checkin.css`
- Test: `src/routes/MapPage.test.tsx`

**Interfaces:**
- Consumes: `ReviewEditor`（Task 5）。`existing: null`、`visitDay` は今日（日本時間）。

- [ ] **Step 1:** テストを書く（偽のタイマー）。
  - 演出が終わると「感想を書く」が出て、10 秒で消える。
  - 押すとエディターがそのチェックイン ID で開く。
  - 出ている間に別のチェックインが成功したら、新しい ID に替わる。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** PASS を確かめる。
- [ ] **Step 5:** コミット `checkin: offer "write a review" for 10s after the effect`

### Task 8: お店のシートのみんなの感想

**Files:**
- Modify: `src/checkin/ui/ShopSheet.tsx`（任意の `reviews?: { summary: { avg: number; count: number } | null; latest: Review[] } | null`）、`src/routes/MapPage.tsx`（シートを開いたら `loadSummary`＋`loadLatest` を読む。店が替われば古い返事を捨てる）
- Test: `src/checkin/ui/ShopSheet.test.tsx`、`src/routes/MapPage.test.tsx`

- [ ] **Step 1:** テストを書く。
  - `reviews` があると「みんなの感想 ★4.3（12件）」と 2 件が出る。
  - summary が null なら「まだ感想がありません」。
  - `reviews` が無い（読み中）なら欄を出さない。
  - `masked`（伏せた気配）のときは出さない。
- [ ] **Step 2:** FAIL を確かめる。
- [ ] **Step 3:** 実装する。
- [ ] **Step 4:** PASS を確かめる。
- [ ] **Step 5:** コミット `shop sheet: everyone's reviews summary`

### Task 9: 置き方の手順・文書・送る

**Files:**
- Create: `docs/superpowers/plans/2026-11-12-zukan-b-reviews-deploy.md`
  - オーナー用。`reviews`・`review_reports`・`review-photos` があるかの確かめ方。
  - 0007 を SQL Editor で流す手順と、確かめの SQL。
  - 関数の置き直しは無い。
- Modify: `CLAUDE.md`（現状の節に `src/reviews/` と図鑑 B）、`docs/SPEC.md`（S12・S14 に「実装 2026-11-1x」）、`docs/session-handoff.md`

- [ ] **Step 1:** 文書を書く。
- [ ] **Step 2:** `npm test`・`npx tsc -b`・`npm run lint`・`npm run build` を通す。
- [ ] **Step 3:** コミットする。オーナーに手順を伝え、「dev に送って」を待つ。

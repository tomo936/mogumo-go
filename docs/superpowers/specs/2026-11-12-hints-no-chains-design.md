# 気配からチェーン店をなくす（A1）設計（2026-11-12）

状態: オーナー承認済み（「いいよ」。山岡家などマイナーなチェーンも外したい）

## 決まり
1. 次の店は、気配（デイリーの3件）の候補にしない。
   - チェーン名の一覧に当たる店。
   - 同じ店名（正規化して比べる）が、端末が持っているお店の中に 3 軒以上ある店（地域チェーン用）。
2. チェーン名の一覧は、次の 2 つを合わせたもの。
   - OSM の name-suggestion-index（NSI、BSD-3-Clause）の `brands/amenity/{fast_food,restaurant,cafe,ice_cream,bar,pub}` のうち、`locationSet.include` に `jp` を含むもの。使うのは `tags.name`・`tags["name:ja"]`・`matchNames`。
   - 手で足す一覧（NSI に無いチェーン。初めは空でよい。オーナーから「出た」と言われたら足す）。
3. 当たり方: 店名と一覧の名前を、どちらも次のように正規化する。
   - NFKC にする。
   - 英字を小文字にする。
   - 空白と記号（・ー以外の約物）を除く。

   正規化した店名が、一覧の名前（正規化後 2 文字以上）を**含めば**チェーンとみなす（例: 「ラーメン山岡家 中野店」⊃「ラーメン山岡家」）。

   誤判定を減らすため、一覧の名前が 2 文字以下のもの（例「松屋」は 2 文字なので対象）は、**前方一致のときだけ**当たりとする。
4. 外す場所は端末とサーバーの両方。
   - 端末: `src/hints/domain/candidates.ts` の `collectCandidates`。
   - サーバー: `supabase/functions/daily-hints/`。名前が分かった後で、抽選の前に外す。前の日の気配や、すでに出した気配は対象外。

   どちらも同じ一覧と同じ関数を使う。サーバーの側は写し（`weekly-missions/kind.ts` と同じやり方）にして、ずれはテストで見つける。
5. 候補が尽きたときは、今と同じく「今日は気配なし」。
6. 出典: スプラッシュと設定の出典に「チェーン店の判定: name-suggestion-index（OpenStreetMap、BSD-3-Clause）」を足す。

## 作り
- `scripts/chains/build.ts`: NSI の JSON を取ってきて、`src/hints/domain/chainNames.ts` を作る台本。
  - 作るのは `export const CHAIN_NAMES: readonly string[]`（正規化済み・重複なし・並べ替え済み）。
  - 手で足す一覧 `src/hints/domain/chainNamesExtra.ts` は台本が上書きしない。
  - できたファイルはコミットする（アプリは外から取りに行かない）。
- `src/hints/domain/chain.ts`
  - `normalizeShopName(s: string): string`
  - `isChainName(name: string, list?: readonly string[]): boolean`
  - `chainLikeByCount(shops: readonly { name: string }[], min = 3): Set<string>`（正規化した名前の集合）
- サーバーの写し: `supabase/functions/daily-hints/chain.ts`（関数）、`chainNames.ts`（一覧の写し）。
- 一覧の大きさの目安は数百件（数十 KB 以下）。

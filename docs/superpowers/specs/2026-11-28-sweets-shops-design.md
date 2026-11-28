# 甘味・洋菓子のお店が出ない — 原因と設計

- 日付: 2026-11-28（依頼 `handoff/to-claude/2026-11-28-sweets-shops-missing.md`。ギルベルトのメモは参考として、裏取りし直した）
- ゴール: 浅草九重・経堂の亀屋のような実在の甘味・洋菓子のお店を、地図・図鑑・チェックインの対象にする。

## 1. 原因（裏取りした事実）
| 確かめたこと | 結果 |
|---|---|
| OSM での登録（Overpass、2026-11-28） | 浅草九重 node 10314175806・経堂の亀屋 node 12818712643 とも **`shop=pastry`** |
| 地図のタイルの元の決まり（OpenMapTiles `layers/poi/mapping.yaml`、master） | shop の一覧に **`pastry`・`tea` が無い**（`bakery`・`confectionery`・`chocolate`・`deli`・`coffee`・`ice_cream` はある） |
| 実際に配られているタイル（OpenFreeMap `20261122_124456_pt`、z14 14546/6453 経堂） | poi 1,682 件のうち pastry・tea は **0 件**、亀屋も無い。confectionery 6・bakery 10・ice_cream 1 はある |
| アプリが拾う種類（`src/shops/infra/mapShops.ts` の FOOD） | restaurant・cafe・fast_food・bar・pub・bakery・confectionery・ice_cream の 8 つ |

→ **アプリが落としているのではなく、地図のタイルに最初から入っていない。** タイルだけを土台にしている限り、`shop=pastry`・`shop=tea` のお店は出せない。
- 日本全体の数（Overpass、2026-11-28）: `shop=pastry` 1,783（名前あり 1,715、うち建物の形で登録 388）、`shop=tea` 938。
- ついでに分かったこと: `shop=chocolate` はタイルにあるが、アプリの FOOD に入っていないので出ていない。
- 未確認: ギルベルトのメモの「浅草・京都で restaurant・pub が数件タイルに無い」理由（名前の付き方・建物の形での登録などの可能性）。実装の最初に 1 件ずつ確かめる。

## 2. タイルのお店を使っている所（全部そろえる必要がある）
| 所 | 何に使う | 足りないと起きること |
|---|---|---|
| アプリ `src/shops/infra/mapShops.ts` | 地図に出すお店 | 出ない |
| `supabase/functions/checkin/`（`core.ts` の FOOD・`osmTile.ts`） | 50m の確かめで、お店がタイルにあるか | **アプリに出してもチェックインが断られる** |
| `supabase/functions/towns/`（`core.ts`・`tiles.ts`） | 町のお店の数（クリア・コンプリート） | 町の分母とずれる |
| `supabase/functions/daily-hints/` | 気配の出題 | 出題されない |
| `supabase/functions/shops-osm/` | 図鑑に地図のお店を入れる | 図鑑に出ない |
FOOD は 5 か所で同じ一覧を持ち、テストで同じかを確かめている。

## 3. 足し方の案
| 案 | 中身 | 良い所 | 困る所 |
|---|---|---|---|
| A 使うたびに Overpass | 端末かサーバーが、その場で Overpass に聞く | 新しい登録がすぐ出る | Overpass は共用で遅く、回数の制限がある。止まると地図・チェックインが止まる。使い方の決まり（大量・頻繁に使わない）に反する |
| **B 日本全体を表に持つ（おすすめ）** | 月 1 回、台本で Overpass に 1 回だけ聞き、日本全体の `shop=pastry`（＋決めた種類）を Supabase の表 `extra_shops` に入れる。5 か所は、タイルのお店にこの表のお店を足して使う | 数が少ない（約 1,800 件・数百 KB）。速い。Overpass に頼るのは月 1 回だけ。無料の範囲 | 新しく OSM に登録されたお店は、次の月の入れ直しまで出ない |
| C 地図のタイルを自分で作る | 決まりを変えたタイルを自前で作って配る | 一番きれい | 作る・置く・更新するのが重い。無料の範囲を超えやすい |

## 4. 設計（案 B）
- **表** `public.extra_shops`（SQL 0020）: `shop_id`（`osmx:n<番号>`・`osmx:w<番号>`。タイルの `osm:` と分けて、どこから来たか分かるようにする）・`name`・`lat`・`lng`（建物の形は中心）・`osm_tag`（`pastry` など）・`tile14`（z14 のタイル番号の文字。引くときの索引）・`updated_at`。読めるのはログインした人（RLS で select だけ）、書くのは service_role だけ。
- **入れる台本** `scripts/extra-shops/build.ts`: Overpass に日本全体で 1 回（名前のあるものだけ）→ 表を入れ替え（消えたお店は消す）。月 1 回、リーダーかオーナーが流す（鍵は .env、ソースに書かない）。Overpass には決まった名前の User-Agent で、1 回だけ。
- **5 か所の足し方**: タイルを読む所で、同じ z14 のタイル番号の `extra_shops` を足す（サーバーの関数は表を直接、アプリは RPC `extra_shops_in_tiles(tiles text[])`）。重なり（同じお店がタイルと表の両方にある＝将来 OpenMapTiles が pastry を入れた場合）は、`src/shops/domain/merge.ts` の名前と距離の突き合わせで 1 つにする。
- **種類**: `pastry` → `cake`（スイーツ）。店名の決まり（`kind.ts` の byName）を先に見るのは今と同じ。
- **チェックインの確かめ**: `checkin` は、タイルのお店に加えて `extra_shops` のお店も 50m の候補にする（ID は `osmx:` のまま `shops` に upsert）。
- **町の数**: `towns` の数え方にも足す（クリアの分母が変わる。今クリアしている町の扱いは下の判断）。
- テスト: 5 か所の「同じ一覧」のテストに `extra_shops` の種類も入れる。経堂の亀屋・浅草九重が、地図・図鑑・チェックインの候補・町の数に入ることを確かめる。

## 5. 判断が要ること（判断ボード B-31〜B-34）
- B-31 足し方は案 B（月 1 回の日本全体の表）でよいか。
- B-32 `shop=tea`（お茶の店、938 件。多くは茶葉の販売）も入れるか。おすすめは**入れない**（甘味・洋菓子のゴールから外れる。甘味処は OSM では cafe や confectionery のことが多い）。
- B-33 `shop=chocolate`（タイルにあるのに出ていない）を FOOD に足すか。おすすめは**足す**（スイーツの店。タイルにあるので足すだけ）。
- B-34 町の数が増えると、もうクリアした町の扱い: おすすめは**一度クリアした町はクリアのまま**（コンプリートの分母だけ増える）。

## 6. 範囲外
- OSM に未登録のお店（例: パン工房 KIMURAYA）。登録はデータの側の問題。
- deli・coffee・alcohol（総菜・コーヒー豆・酒屋）を入れるか。

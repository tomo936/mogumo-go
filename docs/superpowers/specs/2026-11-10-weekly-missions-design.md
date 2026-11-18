# 週ミッション 設計メモ

- 日付: 2026-11-10
- 元: `docs/superpowers/specs/2026-11-10-hint-sheet-and-weekly-mission-placement.md`（置き場所・種類の表・ごほうび）、SPEC S4・S15・S17・D-16
- 状態: 設計（実装前）。最後の「オーナーに聞くこと」に答えが出たら計画を書く。

---

## 1. 目的・やらないこと・制約

**目的**
- 気配（日ごと）が達成できない日の受け皿として、週に3つの条件型の目標を出す。かんたん・ふつう・むずかしい を1つずつ、同じ「系」は重ねない。
- 達成したら、チェックインのその場でコイン（50 / 100 / 150）を渡し、帯で知らせる。

**やらないこと**
- 日ごとのミッション（日の分は気配）。
- 町が要るもの（同じ町で2軒）。町のデータが育ってから足す。
- ミッションの作り直し・入れかえ・ごほうびの受け取りボタン（その場で自動で渡す）。
- 週をまたいだ繰り越し。先週の未達成は消えるだけ（行は残す）。

**制約（決定済み）**
- 書くのはサーバーだけ（service_role）。ブラウザは自分の行を読むだけ。
- 週は 月曜0時（日本時間）〜日曜。出題はその週に最初にシート（出題の呼び出し）が来たとき。**出題より前のチェックインは数えない。**
- 気配のお店もミッションに数える（二重カウント可）。
- 「自宅から500m以上先」は端末の申告（真偽だけ。座標・距離は送らない。D-16）。今も `checkins.far_from_home` に入っている。
- ジャンル指定は、そのプレイヤーの周りで見つかっているジャンルから選ぶ。
- ログに利用者・店・位置の識別子を出さない（towns 関数と同じ。`console.error('weekly: … failed')` のような固定の文だけ）。

---

## 2. データ（0006 のマイグレーション案）

### 2.1 weekly_missions（1週1件 → 1週3件）

今の表（0001）: `week_start`・`condition_type`（5種）・`condition_params`・`target`（既定3）・`progress`・`completed_at`・`unique (user_id, week_start)`。

足す列:

| 列 | 型 | 中身 |
|---|---|---|
| `difficulty` | text not null default 'normal' | `'easy' / 'normal' / 'hard'` |
| `family` | text not null default 'other' | 系。`hint / pioneer / genre / regular / far / variety / time / fog / hashigo / town` |
| `reward` | smallint not null default 100 | 50 / 100 / 150 |

付けかえる制約:
- `unique (user_id, week_start)` を外し（0001 の自動の名前。流す前に `pg_constraint` で名前を確かめる。0004 と同じ手順）、次の2つにする。
  - `unique (user_id, week_start, difficulty)` … むずかしさごとに1つ
  - `unique (user_id, week_start, family)` … 同じ系を重ねない（DB でも守る）
- `check (difficulty in ('easy','normal','hard'))`
- `check ((difficulty, reward) in (('easy',50),('normal',100),('hard',150)))` … むずかしさとごほうびを固定
- `condition_type` の check を付けかえる（下の表の種類。古い `genre / first_visit / far_from_home / same_town / hint_shop` はそのまま使えるので残る）。
  新しい一覧: `hint_shop, first_visit, genre, revisit, far_from_home, distinct_kinds, lunch, fog_cells, active_days, hashigo_days, weekend, same_town`
- 今ある `check (progress between 0 and target)` と `check ((completed_at is not null) = (progress = target))` はそのまま使う。

`condition_params`（jsonb）の中身:
- ジャンル系だけ `{ "kinds": ["ramen"] }`（おやつタイムは `["cafe","cake","bakery"]`）。ほかは `{}`。
- 自宅の座標・距離は入れない（0001 のコメントのまま）。
- 名前（「今週のラーメン」など）は保存しない。画面が種類・目標・kinds から作る。

出題の時刻は今ある `created_at` を使う（＝これより前のチェックインは数えない）。

**slot 列は作らない**。並び順は difficulty（かんたん → ふつう → むずかしい）で決まるため。

### 2.2 coin_ledger

- 金額の check（0001 の無名の check。名前を `pg_constraint` で確かめてから外す）を作り直し、`reason = 'weekly_mission' and amount in (50, 100, 150)` にする。ほかの理由の金額は今のまま。
- 二重付与は今ある `coin_ledger_weekly_mission_uniq (weekly_mission_id)` で防げる（1ミッション1行）。足すものは無い。
- 金額がミッションの `reward` と合っているかは表の check では見られないので、後述の `settle_weekly_missions` が `reward` をそのまま書く（関数の外からは書けない）。

### 2.3 RLS・権限

今のまま（0001）: `weekly_missions_select_own`（自分の行だけ読める）、authenticated は select だけ、insert/update/delete は service_role だけ。新しい SQL 関数2つは `revoke ... from public, anon, authenticated` → `grant execute ... to service_role`（0004・0005 と同じ）。

### 2.4 新しい SQL 関数（2つ）

1. **`create_weekly_missions(p_user uuid, p_week date, p_rows jsonb)`**
   - `profiles` の本人の行を `for update` で押さえる（同じ人の同時の呼び出しを1つずつにする。`create_daily_hints` と同じ）。
   - その週の行が無ければ `p_rows`（3行）を入れる。あれば何も書かずに返す。
   - 戻り値: その週の行（difficulty 順）。
2. **`settle_weekly_missions(p_user uuid, p_week date, p_progress jsonb)`**
   - `p_progress`: `[{ "mission_id": "...", "progress": 2 }, ...]`（Edge Function が数えた値）。
   - 1つのトランザクションで、各行を `for update` で押さえ、`progress = least(target, greatest(progress, 新しい値))`（**下がらない**）。
   - `target` に届いて `completed_at` が空なら、`completed_at = now()` と `coin_ledger`（`reason='weekly_mission'`, `amount = reward`）を書く。`on conflict (weekly_mission_id) ... do nothing` でも二重を防ぐ。
   - 戻り値: その週の全行＋今回はじめて達成したかの印（`newly_completed`）。帯に使う。

### 2.5 既存の行・既存の関数への影響

- **既存の行**: これまで weekly_missions に書くコードは無い（関数・アプリとも未使用）ので、開発の DB でも0件のはず。流す前に `select count(*) from public.weekly_missions;` で確かめる。もし行があっても、`difficulty='normal' / reward=100 / family` は既定値・古い種類からの置きかえ（`genre→genre`, `first_visit→pioneer`, `far_from_home→far`, `hint_shop→hint`, `same_town→town`）で埋まり、制約に当たらない。100コインの台帳の行も新しい check（50/100/150）を通る。
- **perform_checkin（0004）は変えない**。チェックインの記録・コイン30/40・晴れたマスはそのまま。週ミッションの進みは別の関数（2.4）で書く（理由は 4.2）。
- `grant_town`・`create_daily_hints`・ガチャには触らない。
- 流す順: 0006 を流す → 関数 `weekly-missions` を置く → `checkin` を置き直す。0006 は表と新関数を足すだけなので、置き直すまでの間も今のチェックインは壊れない。

---

## 3. 種類ごとの数え方

**共通**: 数えるのは、その週のミッションの `created_at` 以降で、週の終わり（次の月曜0時 JST）より前の `checkins`（本人の行）。0003 以降、チェックインの行は必ず `reward_day` が入る（同じ店・同じ日の2回目は行ができない）ので、行の数＝「行った回数」。時刻・曜日は `checked_in_at` を日本時間にして見る。

**お店の種類（ジャンル）**: 18種の `kind`（`src/shops/domain/kind.ts`）で数える。`shops` の `genre_code`（ホットペッパー）・`genre_name`（地図の店は分類）・`name` から、サーバー側で `kindFromHotpepper` / `kindFromMap` と同じ計算をする（後述 4.4）。`mystery`（その他）は「ちがうジャンル」に数えない。

| むずかしさ | 名前 | condition_type | 目標 | 数え方（どのデータから・何を） |
|---|---|---|---|---|
| かんたん | 気配をたどって | hint_shop | 1 | checkins の `was_hint = true` の行数 |
| かんたん | はじめましての1軒 | first_visit | 1 | 期間内のチェックインのうち、その店（shop_id）への本人の最初のチェックインだった行の数（期間より前に行っていない店） |
| かんたん | 今週の◯◯ | genre `{kinds:[k]}` | 1 | kind が k の店への行数 |
| かんたん | おやつタイム | genre `{kinds:[cafe,cake,bakery]}` | 1 | kind がその3つのどれかの店への行数 |
| かんたん | また来たよ | revisit | 1 | 期間内のチェックインのうち、それより前（出題前も含む・別の日）に同じ店へのチェックインがある行の数 |
| ふつう | 霧の向こうへ | far_from_home | 2 | `far_from_home = true` の行数 |
| ふつう | 開拓日和 | first_visit | 3 | はじめましてと同じ |
| ふつう | ◯◯めぐり | genre `{kinds:[k]}` | 2 | 今週の◯◯と同じ |
| ふつう | 三色だんご | distinct_kinds | 3 | 行った店の kind の種類数（mystery を除く） |
| ふつう | 気配ハンター | hint_shop | 2 | 気配をたどってと同じ |
| ふつう | お昼の散歩 | lunch | 3 | 日本時間 11:00〜13:59 の行数 |
| ふつう | 晴れ間をひろげる | fog_cells | 200 | **下の「数えられないもの」を参照** |
| むずかしい | 大開拓 | first_visit | 5 | はじめましてと同じ |
| むずかしい | 遠くの町まで | far_from_home | 4 | 霧の向こうへと同じ |
| むずかしい | 五つの味 | distinct_kinds | 5 | 三色だんごと同じ |
| むずかしい | 気配の達人 | hint_shop | 3 | 気配をたどってと同じ（謎の気配も `was_hint` が立つ） |
| むずかしい | 毎日がグルメ | active_days | 4 | チェックインがあった日（日本時間の日付）の数 |
| むずかしい | はしごの日 | hashigo_days | 2 | 1日に2行以上ある日の数 |
| むずかしい | 週末の冒険 | weekend | 3 | 土・日（日本時間）の行数 |

### 数えられないもの・弱いもの（正直に）

1. **晴れ間をひろげる（道で晴れた分）**: 歩いて晴れたマスはサーバーに保存していない（`fog_cells.source` は `shop_radius` と `town` だけで、実際に入るのはチェックインの `shop_radius` だけ）。サーバーで数えられるのは「チェックインで新しく晴れたマス」だけ。
   - さらに、チェックイン1回で半径200m＝最大約200マス晴れるので、目標200は「知らない場所で1回チェックイン」で済み、ふつうとしては軽すぎる。
   - 代案: (a) チェックインで晴れたマスだけを数え、目標を **400**（知らない場所で2回くらい）にする【推奨】 (b) 種類から外す。→ オーナーに聞く（§8）。
   - 数え方（a の場合）: `fog_cells` の `cleared_at >= created_at`（週の終わりより前）かつ `source = 'shop_radius'` の行数。
2. **はじめてのお店の id のずれ**: 同じ店が地図の id（`osm:`）とホットペッパーの id（`hp:`）で別の行になることがある。そのため「はじめて」が同じ店で2回数わる・「また来たよ」を取りこぼすことがまれにある。気配の照合ほど大事ではないので、**今は id のまま数える**（あとで困れば 0004 の `p_alt_shop_id` と同じ照合を足す）。
3. **「500m以上先」は端末の申告**なので、自宅を置いていない人は常に false。→ 自宅が無い人には遠征系を出さない（4.1）。

---

## 4. サーバーの流れ

### 4.1 出題（新しい Edge Function `weekly-missions`）

- 受け取る: `POST { kinds: ShopKind[], has_home: boolean }`（JWT 必須）。`kinds` は端末がまわりで見つけているお店の種類（18種の名前だけ。位置・店 id・距離は送らない）。
- 流れ:
  1. JWT から利用者を決める。週の月曜（日本時間）を計算。
  2. その週の行があれば、そのまま「進みのまとめ直し」（4.2 と同じ計算）をして返す。
  3. 無ければ core.ts の `drawMissions(...)` で3つ選び、`create_weekly_missions` で書く。
- **抽選**（core.ts、乱数は引数で渡してテストできるようにする）:
  1. まず「出せるか」でふるう:
     - ジャンル系: `kinds` に入っている種類からだけ選ぶ（mystery は除く）。おやつタイムは cafe・cake・bakery のどれかがあるときだけ。`kinds` が空ならジャンル系は出さない。
     - 遠征系: `has_home` が false なら出さない。
     - 時間系・はしご（週の途中で出題されたとき）: 残りの日数で届かないものは出さない。毎日がグルメは残り4日以上、はしごの日は残り2日以上、週末の冒険は土曜までの出題。お昼の散歩は1日でも届くので、いつでも出す。
  2. むずかしい → ふつう → かんたん の順に1つずつ、等しい確率で選ぶ。選んだ系は次から除く（むずかしいの候補が一番系が少ないので先に決める）。
  3. ジャンル指定の種類は `kinds` から等しい確率で1つ（めぐり＝2軒のときも同じ。軒数が足りるかまでは見ない → §8）。
  4. どこかで候補が0になったら、その段は系の重なりだけを避けて残りから選ぶ。それでも0なら「気配をたどって」など常に出せるもの（hint_shop・first_visit・revisit・distinct_kinds）が残るので、3つは必ず埋まる。
- 返す: その週の3行（`mission_id, difficulty, condition_type, params, target, progress, reward, completed`）と `week_start`・`week_end`（日曜の日付）。

### 4.2 チェックイン時の進みの更新

**やり方（推奨: perform_checkin とは別の関数）**
- `checkin` の Edge Function が `perform_checkin` に成功したあと、
  1. その週のミッションを読む（無ければ何もしない。チェックインでは出題しない）。
  2. 一番古い `created_at` 以降の自分の checkins（＋shops の名前・ジャンル）と、同じ店への過去のチェックインの有無、（必要なら）晴れたマスの数を読む。
  3. core.ts の `countProgress(missions, visits, …)` で3つの進みを数える。
  4. `settle_weekly_missions` を呼ぶ（1トランザクション。進みは下がらない・達成は1回だけ・コインは二重に付かない）。
- **数え直し方式**（足し算ではなく、毎回データから数え直す）なので、同じ呼び出しが2回走っても結果は同じ。途中で失敗しても、次のチェックインかシートを開いたときに正しい値に戻る。
- 失敗したとき: チェックイン自体は成功として返す（`missions: null`）。ログは `console.error('checkin: weekly failed')` だけ。コインはシートを開いたときのまとめ直しで渡る（帯はそのときに出す）。

**なぜ perform_checkin に足さないか**
- 13の数え方を plpgsql で書くと、Vitest で試せない。core.ts（純粋な TypeScript）に置けば単体テストで全部の種類を確かめられる。
- 進みは「データから数え直す・下がらない」ので、チェックインと別のトランザクションでも二重や食い違いが起きない。二重付与は `settle_weekly_missions` の行ロック＋ `coin_ledger_weekly_mission_uniq` で防ぐ。
- perform_checkin を置き直さずに済む（0004 のような「流してから置き直すまでチェックインが止まる」時間が無い）。

### 4.3 画面への返し方（帯用）

`checkin` の返事に足す:

```
missions: [
  { mission_id, difficulty, condition_type, params, target, progress, reward, completed, newly_completed }
] | null
```

`newly_completed = true` の行があれば、アプリが達成の帯を出す。`coins_awarded`（30/40）は今のまま、ミッションの分は別に `reward` で見せる。

### 4.4 共通の部品（サーバー側）

- 週の数え方・抽選・進みの計算は `supabase/functions/_shared/weekly.ts`（純粋な計算だけ）に置き、`weekly-missions` と `checkin` の両方から使う。Supabase の公式のやり方（`_shared`）。初めて使うので、段1で置けるか確かめる（置けなければ、今までどおり2か所に写して「keep in sync」）。
- お店の種類の計算は `src/shops/domain/kind.ts` を `_shared/kind.ts` に写す。ずれ防止に、両方に同じ店名・ジャンルを入れて結果が同じかを見るテストを1つ置く（Vitest は `supabase/functions/**/*.test.ts` も走る。towns のテストが checkin の core を読むのと同じ形）。

---

## 5. 画面の流れ

- **置き場所**: 気配のシート（上の真ん中「？」）の、気配3枚の下にチケット3枚を横に並べる（C 案）。気配のカードより控えめ。
- **チケット1枚**: むずかしさ（かんたん／ふつう／むずかしい の小さい札）・料理の絵（ジャンル系は指定の種類の絵、ほかは系ごとの決まった絵）・条件の短い文・進み（`2/3` と目盛り）・ごほうび（`CoinIcon` ＋数字）。達成したら済みの印（`src/ui/DoneMark.tsx`）。
  - 見出しの横に「のこり ◯日」（日曜まで）と「気配のお店もミッションに数えます」。
  - 文言は domain（`src/missions/domain/text.ts` など）で、種類・目標・kinds から作る（「ラーメンのお店に 2軒」）。
- **出題の呼び出し**: シートを開いたとき、気配と並べて `weekly-missions` を呼ぶ（その週の最初の1回で出題される）。`kinds` は気配の候補を集める処理で見えているお店の種類を使う。
- **進み**: シートを開くたびにサーバーの値を表示（呼び出しの返事）。チェックインの返事で `missions` が来たら、手元の表示も更新する。
- **達成の帯**: チェックインの演出（紙ふぶき・「チェックイン +30」の帯）が終わったあとに、続けて「ミッション達成！ ＋100」の帯を出す（重ねない）。複数が同時に達成したら1つずつ。
- **読み込み失敗**: チケットの場所に「ミッションを読めませんでした」と「もう一度」ボタン。気配の表示は止めない。チェックインの返事が `missions: null` なら何も出さない（次にシートを開いたときに整う）。
- フォルダ: `src/missions/`（domain: 文言・のこり日数・並び／infra: `missionsApi.ts`／ui: `MissionTickets.tsx`・帯）。domain は React・Supabase を import しない。

---

## 6. テストの方針

**単体テスト（Vitest）**
- `_shared/weekly.ts`:
  - 週の月曜（日本時間。日曜23:59 と 月曜0:00 のさかい目、UTC との9時間のずれ）。
  - 抽選: むずかしさが1つずつ・系が重ならない・`kinds` が空／自宅なし／週の途中で、出せないものが出ない・必ず3つ埋まる（乱数を固定して何通りも）。
  - 数え方: 表の種類ぜんぶ。出題前のチェックインを数えない・週の終わり以降を数えない・お昼のさかい目（10:59/11:00/13:59/14:00）・土日・はしご（同じ日2行）・はじめて／また来た（出題前の訪問の有無）・mystery を「ちがうジャンル」に数えない・目標を超えても target で止まる。
- `_shared/kind.ts` と `src/shops/domain/kind.ts` の結果が同じ。
- `src/missions/domain`: 文言・のこり日数。ui はチケットの表示・失敗時の表示・帯の順番（Testing Library）。

**SQL（開発の Supabase で手で確かめる。0004・0005 のように 0006 の頭に手順を書く）**
- 同じ週に2回作っても3行のまま／同じ系・同じむずかしさが入らない。
- settle: 進みが下がらない・達成で coin_ledger に1行（金額＝reward）・2回呼んでも1行・target を超えない。
- authenticated から2つの関数を実行できない。他人の行が読めない（RLS）。

**実機でしか確かめられない点**
- チェックインの帯のあとに達成の帯が続いて見えるか（iPhone の画面の大きさ・時間の長さ）。
- チケット3枚が横に並んで文字があふれないか（小さい iPhone）。
- 週の変わり目（月曜0時をまたいでシートを開く）で新しい3つが出るか。
- 自宅から500m以上先の申告が実際に効くか（自宅を置いた状態で、遠い店でチェックイン）。

---

## 7. 実装の段（小さく刻む順）と見積り

| 段 | 中身 | 見積り |
|---|---|---|
| 1 | `_shared/weekly.ts`（週・抽選・数え方）＋ `_shared/kind.ts` とテスト。`_shared` が置けるかの確認 | 1日 |
| 2 | 0006（列・制約・coin_ledger の check・2つの関数）と手での確かめ手順 | 0.5日 |
| 3 | Edge Function `weekly-missions`（出題・まとめ直し） | 0.5日 |
| 4 | `checkin` に進みの更新と `missions` の返事を足す | 0.5日 |
| 5 | 画面: `src/missions/`（チケット3枚・進み・失敗時）をシートに入れる | 1日 |
| 6 | 達成の帯（チェックインの演出のあと） | 0.5日 |
| 7 | dev の Supabase に置く（0006 → weekly-missions → checkin）・tester のレビュー・実機確認・SPEC の直し（S4「週に3軒」、ガチャ節の「週ミッション達成100」→ 50/100/150） | 0.5日 |

合計 約4.5日。段1〜4 はサーバーだけで、画面が無くても SQL Editor と単体テストで確かめられる。

---

## 8. オーナーに聞くこと

1. **「晴れ間をひろげる」**: 歩いて晴れた分はサーバーに残っていないので数えられません。チェックイン1回で最大約200マス晴れるため、目標200だと1回で済みます。
   - 推奨: チェックインで晴れたマスだけを数え、目標を **400** にする。／ 別案: 種類から外す。
2. **ジャンル指定の「周り」の範囲**: 気配と同じ範囲（自宅から1km、自宅から遠いときは今いる場所のまわり）で見えているお店の種類から選ぶ、でよいか。
   - 推奨: 気配と同じ範囲。「◯◯めぐり（2軒）」は、その種類の店がまわりに2軒以上あるときだけ出す（端末が種類ごとの軒数も送る。位置は送らない）。
3. **「ちがうジャンル」に「その他」を数えるか**: 推奨は数えない（「その他」の店ばかりで達成できてしまうため）。

## 9. オーナーの答え（2026-11-10「おすすめで」）と、リーダーが決めた変更

**オーナーの答え**
1. 晴れ間をひろげる: チェックインで晴れたマス（`fog_cells.source = 'shop_radius'`）だけを数え、目標 **400**。
2. ジャンル指定: 気配と同じ範囲（自宅から1km、自宅から遠いときは今いる場所のまわり）。端末は種類ごとの軒数を送る（位置は送らない）。「今週の◯◯」は1軒以上、「◯◯めぐり」は2軒以上ある種類から選ぶ。
3. 「ちがうジャンル」に「その他」（mystery）は数えない。

**リーダーの判断（設計からの変更）**
- **checkin 関数は変えない。** Edge Function は管理画面に貼って置くため、同じフォルダのファイルしか使えない（`_shared` は使えない）。checkin に足すと数え方を2か所に写すことになる。町と同じく、**チェックインが成功したらアプリが `weekly-missions` を呼ぶ**形にする（数え直し方式なので、遅れて呼んでも結果は同じ）。
  - `weekly-missions` の本文: `{ draw?: { kinds: { [kind]: 軒数 }, has_home: boolean } }`。`draw` があり、その週の行が無いときだけ出題する。無ければ数え直しだけ（行が無ければ空を返す）。チェックインのあとは `draw` なしで呼ぶ。
  - 返事: `{ week_start, week_end, missions: [...], newly: [mission_id...] }`。
- お店の種類の計算（`kindFromHotpepper`）は `supabase/functions/weekly-missions/kind.ts` に写し、`src/shops/domain/kind.ts` と結果が同じかのテストを置く（記録の画面と同じく、店名とホットペッパーのジャンルから決める）。
- 種類の見分けのため、`condition_params.key` に表の種類の名前（`oyatsu` など）を入れる。画面の文言は key・目標・kinds から作る。

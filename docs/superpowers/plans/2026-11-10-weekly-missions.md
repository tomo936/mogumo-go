# 週ミッション 実装計画

**Goal:** 気配のシートに週ミッション3つ（かんたん+50・ふつう+100・むずかしい+150）を出し、チェックインで進めて達成でコインを渡す。

**Spec:** `docs/superpowers/specs/2026-11-10-weekly-missions-design.md`（§9 の変更を含む）

**Architecture:** サーバーは Edge Function `weekly-missions`（出題・数え直し）と SQL 0006（表の直し・`create_weekly_missions`・`settle_weekly_missions`）。純粋な計算は `core.ts`。アプリは `src/missions/`（domain 文言 / infra 呼び出し / ui チケットと帯）。

## Global Constraints
- 書くのは service_role だけ。ログは固定の文だけ。座標・距離は送らない（種類ごとの軒数と、自宅があるかだけ）。
- 週は月曜0時（JST）〜日曜。出題より前・週の後のチェックインは数えない。進みは下がらない。コインは1ミッション1回。
- 数え方は設計 §3 の表（晴れ間は 400・mystery は種類に数えない）。

## Review Focus
1. 週のさかい目（日曜 23:59 JST と月曜 0:00 JST、UTC との 9 時間差）で、別の週の行・チェックインを混ぜない。
2. 同時に2回呼ばれても、行が6つにならない・コインが2回付かない（SQL の行ロック＋一意）。
3. 種類の候補が空・自宅なし・週の途中の出題でも、必ず3つ（重ならない系）出る。
4. チェックインの返事より先に週ミッションの呼び出しが失敗しても、チェックインの演出は出る。
5. 読めないとき、気配の表示は止まらない（チケットの場所だけ「もう一度」）。

## Tasks
1. **core.ts と kind.ts**（`supabase/functions/weekly-missions/`）: `weekStart(nowMs): string`・`weekEndMs(weekStart): number`・`CATALOG`・`drawMissions({ kinds, hasHome, nowMs }, random): Draft[]`・`countProgress(missions, visits, priorShops, fogCells): number[]`。テスト `core.test.ts`（さかい目・抽選・全種類の数え方）と kind の一致テスト。
2. **0006**（`supabase/migrations/0006_weekly_missions.sql`）: 列・制約・coin_ledger の check・2つの関数・権限・手での確かめ手順。
3. **index.ts**: JWT → 週の行を読む → 無くて draw があれば出題 → 数え直し → settle → 返す。
4. **アプリ**: `src/missions/domain/`（文言・のこり日数・軒数の集計）、`infra/missionsApi.ts`（呼び出し・返事の読み取り）、`ui/MissionTickets.tsx`（チケット3枚）・`MissionBanner.tsx`、気配のシートと MapPage へのつなぎ（開いたら draw つき、チェックイン後は draw なし）。
5. **仕上げ**: tester・SPEC（S4・ガチャ節）・CLAUDE.md・handoff・置き方の手順（0006 → 関数）・dev。

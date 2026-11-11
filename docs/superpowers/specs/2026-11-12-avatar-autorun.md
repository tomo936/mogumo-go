# アバター 自動で進める手順書（2026-11-12 オーナー指示。オーナーは操作しない）

オーナーの指示: 「トークン切れるから、回復したら**自動で**、方針自体が誤っていないか Opus に確認して、その結果で改めて作成を試してもらう。**俺が操作しなくても勝手に動くように**」。
この文書は、会話が止まっても（上限・再起動）、次の担当（リーダー or 定期の起動）がここを読んで続けるための状態表。**各段の終わりに、この表を更新してコミットする**（push しない）。

## オーナーの指摘（動画 walk-preview.gif を見て、2026-11-12 01:15）
1. 歩き・走りが**ロボットみたいにカクつく**。
2. **腕が上がったとき、裏側（内側・切り口）が見える**。
3. 走り方がおかしい。
4. うれしい顔を「板で上に貼り付ける」作り方そのものがおかしい（線が出る）。
5. 全体の質が参考画像に届かない（過去の指摘: 肌の色・肩のピンク・うれしい顔の線）。
- 決まっていること: アバターは 3D。足が実際に動く。完全無料。iPhone で軽く（容量 2〜3MB まで可、三角形 3万前後）。地図は持たせない。表情は ふつう・うれしい（＋まばたき）。呼吸は入れる。アプリの縮尺・大きさは別（仕事2）。
- 材料: `art/prototypes/avatar/boy-b-skin.glb`（骨11本）、台本 `blender-b-repaint.py`・`blender-finish.py`（`AVATAR_B=1`）、動きの式 `round2-page.ts.txt` の `poseFor`・`applyPose`、動画 `walk-preview.mp4`・`.gif`、設計メモ `2026-11-11-avatar-design.md`、進み `2026-11-11-avatar-progress.md`、参考画像 `art/reference/avatar/boy/`、生成済みの形 `/mnt/d/mogumo-3d/ComfyUI/output/mogumo/boy_mv123_*.glb`。
- 道具: Blender `/home/otosa/tools/blender/blender-4.2.3-linux-x64/blender`、Playwright `/home/otosa/tools/pw`（`PLAYWRIGHT_BROWSERS_PATH=/home/otosa/tools/browsers`）、試作ページ `.superpowers/preview/avatar/`。`/tmp` は容量 3.9GB の小さなメモリ領域（終わったら一時ファイルを消す）。

## 段の状態（pending / running / done / blocked）
| 段 | 内容 | 担当 | 状態 | 成果物 |
|---|---|---|---|---|
| S1 | **方針の点検**: 今のやり方（AI の形＋自動の骨の重み＋式で動かす動き＋板の顔）が誤っていないか、Opus が独立に点検し、直し方の計画を書く | Opus | running（開始 2026-11-12 01:30） | `docs/superpowers/specs/2026-11-12-avatar-review-opus.md` |
| S2 | **S1 の計画で作り直しを試す**（動きのカクつき・腕の裏・走り・顔の差し替え・まばたき）。動画を作り直す | Opus | pending | `boy-b-v2.glb`、`walk-preview-v2.mp4`/`.gif`、比べ画像 |
| S3 | **オーナーに結果を知らせる**（動画・画像・数字・直らなかった点） | リーダー | pending | メッセージ |

- 段が `running` のまま 90 分以上たっていて、担当（サブエージェント）が動いていないときは、`pending` に戻して再開してよい（`ListAgents` で確認。続きは前の担当へ `SendMessage` で再開）。
- 各段のあと、状態を `done` にして、コミット（push しない）。S3 が終わったら、定期の起動（CronList で、この文書に触れる起動を探して CronDelete）を止める。

## 守ること（全段共通）
- オーナーの操作が要る作業（Windows 側の ComfyUI の起動・ダウンロードなど）は**しない**。要るなら、その点を `blocked` として書き、できる範囲で進める。新しい物（ソフト・モデル・ライブラリ）の導入・PC への書き込みはしない（既にある物だけで作る）。
- `src/` は触らない。APIキーを書かない・`.env` は読まない。push しない。Windows 側（`/mnt/d/mogumo-3d`）は読むだけ。
- 使用量を抑える: 画像は段ごとに多くて1〜2枚、試行は各項目 2 回まで（2 回で直らなければ「直らなかった」と書く）。長い設計メモは不要。
- 最後に `npm test`・`npx tsc -b`・`npm run lint`（warning は基準の 33 件）。
- 「Disk full」が出たら止めて報告（`/tmp` を小さく保つ）。

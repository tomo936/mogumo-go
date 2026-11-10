# アバター 作業の進み（Fable が書く。途中で止まっても、これを読めば続けられる）

- 依頼書: `docs/superpowers/specs/2026-11-11-avatar-brief-for-fable.md`
- 書き方: 作業の区切りごとに、下の「やったこと」の先頭に1行（日時・何をしたか・どのファイルか）を足し、「次にやること」を書き直して、コミットする（push はしない）。
- 再開: 新しい担当（またはこのエージェントの続き）は、まずこのファイルと依頼書を読み、「次にやること」から始める。試作の画像・数字・ファイルの場所も、ここに書いておく。

## いまの段
仕事1（設計メモ）— **書き終わり。オーナーの確認待ち**（OK が出るまで仕事2 に進まない）

## やったこと（新しい順）
- 2026-11-11 深夜（Fable 5.2）: 設計メモ `docs/superpowers/specs/2026-11-11-avatar-design.md` を書いた。ミシェーラへの依頼 `handoff/to-shiro/2026-11-11-avatar-3d-art.md`（着手は OK のあと）と `handoff/LOG.md` の 1 行。
- 2026-11-11 深夜: 試作と実測。①今の 3D ②色の絵をならした版 ③形をならして少ない色で塗り直した版 ④組み立て式（男の子・女の子）を作り、見た目・表情・動き・大きさの 4 枚の PNG にした（`art/prototypes/avatar/`）。地図の縮尺を本物の MapLibre で測り、今の式が 2 倍ずれていること（標準でも約 66px で出ている）を確かめた。
- 2026-11-11 深夜: リーダーからの追加の決定を受けた。「3D で決まり。2D 系は対象外」「足が実際に動く歩きが必須」「すでにある環境（ComfyUI＋Hunyuan3D-2・Blender）は自由に使ってよい。新しく入れる前だけ止めて報告」。
- 2026-11-11 深夜: 依頼書・引き継ぎメモ・今のアバターのコードと素材・`D:\mogumo-3d` の前回の記録を読んだ。

## 実測した数字・試作の置き場
- 画像（PNG）: `art/prototypes/avatar/compare-look.png`・`expressions.png`・`motion.png`・`size.png`
- 台本: `art/prototypes/avatar/blender-chibi.py`（組み立て式。`blender -b -P blender-chibi.py -- boy|girl 出力.glb`）、`blender-repaint.py`（AI の 3D の塗り直し）、`compare-page.ts.txt`（くらべのページ。動きの式 `poseFor`・顔の絵 `drawFace` が入っている）
- 動かす場所（git 管理外・消えてもよい）: `.superpowers/preview/avatar/`（`index.html`・`main.ts`・`vite.config.mjs`・試作の GLB）。撮り方は、vite を `--config .superpowers/preview/avatar/vite.config.mjs --port 5231` で立て、同じコマンドの中で Playwright（作業用フォルダ `f1bcb96d…/scratchpad/pw/avproto.mjs`）を動かす。Blender は `f1bcb96d…/scratchpad/blender/blender-4.2.3-linux-x64/blender`。
- 数字: 今の 3D 897KB・三角形 5,000／組み立て式 男の子 233KB（転送時 95KB）・三角形 9,572・描く回数 8、女の子 274KB（104KB）・11,304／関節の計算 1 コマ 約 0.001ms／地図の縮尺 ズーム 17 で 1px = 0.4853m（今の式は 0.9705m）／大きさの案 20m（引き 17px・標準 34px・寄り 68px）。
- 前回の AI 生成の環境: `D:\mogumo-3d`（WSL からは `/mnt/d/mogumo-3d`）。色付きまで 192 秒で成功した記録あり（`work/color2.log`、台本 `tools/run_boy.py`、起動に `--disable-pinned-memory`）。今は ComfyUI は止まっている。今回は新しい生成はしていない。

## 次にやること
1. オーナーの返事を待つ（設計メモ §12 の 7 つ。とくに 1 見た目・2 大きさ）。
2. OK が出たら仕事2: 設計メモ §13 の見取り図どおり。最初に「髪だけ AI の形を借りる」を 1 回試す（§3.1）。iPhone での重さを `?debug` で測る。

## 止めて聞きたいこと
- 設計メモ §12（オーナーに聞くこと）を参照。

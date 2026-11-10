# アバター 作業の進み（Fable が書く。途中で止まっても、これを読めば続けられる）

- 依頼書: `docs/superpowers/specs/2026-11-11-avatar-brief-for-fable.md`
- 書き方: 作業の区切りごとに、下の「やったこと」の先頭に1行（日時・何をしたか・どのファイルか）を足し、「次にやること」を書き直して、コミットする（push はしない）。
- 再開: 新しい担当（またはこのエージェントの続き）は、まずこのファイルと依頼書を読み、「次にやること」から始める。試作の画像・数字・ファイルの場所も、ここに書いておく。

## いまの段
**やり直し（参考画像に忠実な 3D の試作）— 形の生成で止まっている**。組み立て式はオーナーが不合格にした。仕事2 にはまだ進まない。

## やったこと（新しい順）
- 2026-11-11 未明（Fable 5.2）: 設計メモに「§A 追記」（新しい作り方 5 段・止まっている理由・生成を動かす手順・続きの手順）。ミシェーラへの依頼を見直し（三面図・色の見本は取り下げ。OK のあとに、顔の参考 2 枚と女の子の参考画像だけ）。
- 2026-11-11 未明: 骨組み（11 本）＋重みの自動付け＋計算の歩き・走り（ひざ・ひじも曲がる）を、**代役の形**（前回の古い形）で試作して動いた。`art/prototypes/avatar/rig-standin.png`。重みの自動付けは 1 回失敗 → 余分な殻を消す＋10 倍の大きさで計算、で通った。
- 2026-11-11 未明: 参考画像 6 枚（`art/reference/avatar/boy/`）を見た。正面の背景を消した絵（`art/prototypes/avatar/input/boy-ref-front-rgba.png`）と、生成の台本（`hunyuan-run.py`）を用意。
- 2026-11-11 未明: **Windows 側の ComfyUI を起動できなかった**。Sandbox の中は Windows を呼ぶ通信が作れず失敗、Sandbox の外での実行は権限の仕組みに止められた。回り道はしていない。
- 2026-11-11 未明: オーナー決定「組み立て式は不合格。参考画像に忠実に」。
- 2026-11-11 深夜（Fable 5.2）: 設計メモ `docs/superpowers/specs/2026-11-11-avatar-design.md` を書いた。ミシェーラへの依頼 `handoff/to-shiro/2026-11-11-avatar-3d-art.md`（着手は OK のあと）と `handoff/LOG.md` の 1 行。
- 2026-11-11 深夜: 試作と実測。①今の 3D ②色の絵をならした版 ③形をならして少ない色で塗り直した版 ④組み立て式（男の子・女の子）を作り、見た目・表情・動き・大きさの 4 枚の PNG にした（`art/prototypes/avatar/`）。地図の縮尺を本物の MapLibre で測り、今の式が 2 倍ずれていること（標準でも約 66px で出ている）を確かめた。
- 2026-11-11 深夜: リーダーからの追加の決定を受けた。「3D で決まり。2D 系は対象外」「足が実際に動く歩きが必須」「すでにある環境（ComfyUI＋Hunyuan3D-2・Blender）は自由に使ってよい。新しく入れる前だけ止めて報告」。
- 2026-11-11 深夜: 依頼書・引き継ぎメモ・今のアバターのコードと素材・`D:\mogumo-3d` の前回の記録を読んだ。

## 実測した数字・試作の置き場
- 参考画像: `art/reference/avatar/boy/`（6 枚、1600×1600）
- 画像（PNG）: `art/prototypes/avatar/rig-standin.png`（骨組み＋歩き・走り。代役の形なので見た目の比較には使えない）、`compare-look.png`・`expressions.png`・`motion.png`（組み立て式＝不合格の記録）、`size.png`（大きさの案。そのまま使える）
- 台本: `art/prototypes/avatar/prep-ref.py`（背景を消す）、`hunyuan-run.py`（生成。Windows 側で動かす）、`blender-rig.py`（面の作り直し → 骨組み → 重み → GLB。`blender -b -P blender-rig.py -- 入力.glb 出力.glb [voxel 0.008] [三角形 24000]`。入力に点の色があれば写す）、`rig-page.ts.txt`（骨を計算で動かすページ。式 `poseFor`・`applyPose`）、`blender-chibi.py`・`blender-repaint.py`・`compare-page.ts.txt`（前の試作）
- 動かす場所（git 管理外）: `.superpowers/preview/avatar/`（`rig.html?glb=<ファイル名>` で骨つきの GLB を見る。撮るのは作業用フォルダの `av/shot.sh rig.html rig`）。Blender は `f1bcb96d…/scratchpad/blender/blender-4.2.3-linux-x64/blender`、Playwright は `f1bcb96d…/scratchpad/pw/`（`avproto2.mjs <url> <出力先> <枠の id>`）。
- 数字: 代役の骨つき GLB 802KB・2.4 万三角形・骨 11 本・骨の計算 1 コマ 約 0.009ms（この PC）／今の 3D 897KB・5,000 三角形／地図の縮尺 ズーム 17 で 1px = 0.4853m（今の式は 0.9705m で 2 倍）／大きさの案 20m（引き 17px・標準 34px・寄り 68px）。
- 生成の環境: `D:\mogumo-3d`（`/mnt/d/mogumo-3d`）。入っているモデルは `hunyuan3d-dit-v2-0-fp16`（1 枚の絵から作る版）・delight・paint。前回は色付きまで 192 秒。ComfyUI は止まっている。

## 次にやること
1. **形の生成**（設計メモ §A.4 の手順。リーダーかオーナーが Sandbox の外で）。できた `boy_ref*_shape_*.glb` の場所を受け取る。
2. 設計メモ §A.5 の 1〜5（面の作り直し → 参考画像の色の投影 → 顔の膜と表情 → 骨組み → 並べた PNG）。
3. 設計メモの §A を、選んだ方式・実測の数字で書き直す。最後に `npm test`・`npx tsc -b`・`npm run lint`。

## 止めて聞きたいこと
- 設計メモ §A.7（生成を動かす方法／3 枚を同時に入れる版のモデルを入れるか）。

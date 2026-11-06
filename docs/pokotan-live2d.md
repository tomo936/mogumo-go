# ポコタン Live2D モデルの使い方

ぽこポケ（`tomo936/pokotan-front`、コミット a35ef5d）で使っていたポコタンの Live2D モデルと、その表示方法をまとめたもの。
もぐもGOでの起用（案内役など）は SPEC §「案内役キャラクター」のとおり **まだ検討中**。このファイルは素材と手順の置き場で、採用の決定ではない。

## 置いたもの

| 場所 | 中身 |
|---|---|
| `public/live2d/poko/` | モデル本体（`poko.model3.json` が入口、`poko.moc3`、テクスチャ、物理演算 `poko.physics3.json`、表示名 `poko.cdi3.json`） |
| `public/live2d/core/` | Cubism Core（`live2dcubismcore.min.js`）とそのライセンス |
| `public/live2d/shaders/` | Cubism Web Framework が WebGL 描画で読むシェーダー |
| `docs/reference/pokotan-live2d/` | ぽこポケでの表示コード（参考用。`src/` の外なのでビルド対象外） |

参考コードの役割:
- `Live2DCharacter.jsx` / `.css`: React コンポーネント。Core の遅延読み込み、Framework の初期化、canvas と描画ループ、タップ判定、`chomp()`（食べる）・`talk()`（しゃべる）を外から呼べる ref を持つ。
- `PokoModel.js`: 公式サンプル LAppModel を、このモデルにあるもの（moc・テクスチャ・物理）だけに削った版。待機の揺れ、呼吸、まばたき、口パクを担当。
- `runtime.js`: Core 読み込み後に Framework を動的 import するための入口。

## モデルの特徴（実装で効く点）

- モーション・表情・ポーズのファイルはない。動きはすべてコードでパラメータを動かして作っている。
- `model3.json` の EyeBlink / LipSync グループは Ids が空。Framework の自動まばたきは効かないので、`PokoModel.js` で `ParamEyeLOpen` / `ParamEyeROpen` を直接動かしている。
- 頭のメッシュは drawable index 5（ArtMesh9）。帽子などの重ね表示や吹き出しの位置はここから取っている。
- もぐもGOの SPEC にあるアニメーションの規則（動きは横方向だけ、変化は顔の表情だけ）に合わせるなら、`PokoModel.js` の待機の揺れ（AngleX/Y/Z）を AngleX 中心に絞る。

## 表示までの流れ（ぽこポケでのやり方）

1. 画面に出すときだけ `/live2d/core/live2dcubismcore.min.js` を `<script>` で読み込む（約230KB。全画面で読まないため）。
2. 読み込み後に Framework を import して `CubismFramework.startUp()` → `initialize()` を1回だけ呼ぶ。
3. `fetch('/live2d/poko/poko.model3.json')` → moc3・物理・テクスチャを順に読み込む。
4. `renderer.loadShaders('/live2d/shaders/')` でシェーダーの場所を渡す。
5. canvas の描画サイズは `devicePixelRatio` を掛けたデバイスピクセルにする（しないと iPhone でぼやける）。
6. `requestAnimationFrame` で毎フレーム `update(dt)` → `draw(matrix)`。

## もぐもGOに入れるときの注意：Cubism Web Framework と TypeScript 設定

Framework 本体（ぽこポケの `src/live2d-framework/`、約860KB の TypeScript）は **このブランチには入れていない**。
理由: Framework は `enum` と `namespace` を多用しており（52ファイル）、もぐもGOの `tsconfig.app.json` の `erasableSyntaxOnly` と衝突する。`src/` にそのまま置くと `npm run build`（`tsc -b`）が落ちる。ぽこポケは JavaScript だったので型チェックがなく、問題にならなかった。

入れるときの方法（実装時に決めて SPEC か設計メモに残すこと）:
- Framework を一度だけ JS（＋ `.d.ts`）にビルドして `src/vendor/live2d-framework/` に置き、アプリからはそれを import する。アプリ側の設定は変えずに済む。
- 入手元: ぽこポケの `src/live2d-framework/`、または公式 `Live2D/CubismWebFramework`（GitHub）。

## ライセンス

- Cubism Core: Live2D Proprietary Software License（`public/live2d/core/LICENSE.md`）。
- Cubism Web Framework: Live2D Open Software License（`docs/reference/pokotan-live2d/FRAMEWORK-LICENSE.md`）。
- 公開アプリで使う場合、Live2D の出版許諾契約が必要かどうかは事業規模で決まる。公開前に Live2D 公式の条件を確認する。
- モデル（ポコタン）は本人のオリジナルキャラクター。

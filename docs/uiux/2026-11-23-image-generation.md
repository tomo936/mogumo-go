# Claude Code ひとりで絵を作る方法の調査（2026-11-23。サブエージェントが web で調べたもの。速さは推定で実測ではない）

手元: RTX 3060（VRAM 12GB）、D の空き 716GB。ComfyUI は Windows 側 D:\mogumo-3d（今は 3D の Hunyuan3D-2 だけ。2D のモデルは無し）。このセッションの comfy-mcp は ENOENT で接続できていない。

## ローカルのモデル（無料・商用）
- **FLUX.2 klein 4B**: Apache 2.0（商用可）。約 8.4〜9.2GB で 12GB に入る。**複数の参照画像による画風移し・編集が標準**（https://docs.comfy.org/tutorials/flux/flux-2-klein）。アイコン向きかは未検証。9B は非商用。
- FLUX.1 schnell: Apache 2.0。FLUX.1 dev は非商用（避ける）。
- SDXL 系（Animagine XL）: 出力の商用は制限なしの趣旨。12GB で快適。Illustrious・Pony はライセンスの記述が割れていて避ける。SD3.5 は年商 100 万ドル未満なら商用可。

## 画風をそろえる
- 既存の画風に合わせるには「参照画像つきの編集モデル」か「参照スタイル」が先、LoRA は最後の手段（https://blog.comfy.org/p/the-complete-style-transfer-handbook）。
- 数十枚の既存アイコンに本気でそろえるなら画風 LoRA（20〜40 枚・1200〜1800 ステップ）。FluxGym は 12GB 対応。SDXL の LoRA は 12GB が実質の下限、時間は 1〜6 時間と幅がある。

## 後処理（コマンドで回せる）
背景を抜く（BiRefNet。ライセンスは公式の LICENSE を要確認。RMBG-2.0 は非商用で不可）、輪郭の色・太さとパレットのそろえ（Pillow・OpenCV の自作）、ベクター化（vtracer）。Adobe コネクタの背景除去・ベクター化も使える。

## クラウド（有料）
- **Recraft**: 参照画像 1〜10 枚で独自スタイル（学習なし。作成 $0.005）、1 枚 $0.035（ベクター $0.05〜0.08）。アイコン・ベクター向き。商用条件は未確認。
- OpenAI gpt-image-1.5: 1024px で $0.009〜0.133（旧モデル扱い）。Google Nano Banana: 約 $0.034〜0.134（第三者の情報）。Adobe Firefly API: 最低月額が高い（第三者情報で約 $1,000）。

## Claude Code から ComfyUI を動かす
artokun/comfyui-mcp（MIT、`npx -y comfyui-mcp`、`COMFYUI_URL` で接続先）、または ComfyUI の API（/prompt にワークフロー JSON）。

## 構成案
1. 無料・ローカル: FLUX.2 klein 4B ＋既存アイコンを参照画像に → 後処理。0 円、手間大、質は中〜高の見込み
2. ローカル＋画風 LoRA: 既存 20〜40 枚で学習。画風は一番そろう。0 円、学習に数時間（12GB で動くかは実測要）
3. Recraft の API を混ぜる: 参照スタイルで 1 枚 $0.035〜0.08（100 枚で約 $4〜8）。手間小・そろえやすさ高。商用条件の確認が先

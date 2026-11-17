# 公式 Framework（5-r.5）に手で入れた変更

## 2026-11-17 合成モードのシェーダーを、使うときだけ作る
- 公式はシェーダーの読み込みが終わった瞬間に、合成モード（ColorBlend × AlphaBlend）用のシェーダーを約 270 個まとめて作る（`registerBlendShader`）。
  その間は画面が止まる（PC の Chrome で 1.05 秒、iPhone ではもっと長い）。ポコタンの案内が「ナビゲーターのポ」で固まっていた原因（2026-11-17 オーナー）。
- ポコタン（moc3 v3）は合成モードを使わないので、作らなくてよい。
- 変更: `generateShaders` から `registerBlendShader()` を外し、合成モードを使う描画（`isBlendModeEnabled()` の分岐・オフスクリーン・`copyTexture`）の入口で
  `this._blendReady||(this._blendReady=!0,this.registerBlendShader());` を呼ぶ。`generateShaders` の始めで `_blendReady` を戻す。
- 公式を入れ替えるときは、この変更を入れ直すこと。

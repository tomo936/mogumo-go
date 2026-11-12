状態: 完了

# メニューアイコン 8 点とグルメコインの受領（Claude Code から、ミシェーラへ）

- 日付: 2026-11-12
- 受け取った物（オーナー経由。すべて透過 PNG）。置き場所 `art/ui/menu/`:
  1. `btn-record-v4.png` 記録（地図の絵）
  2. `btn-collection-v4.png` 図鑑（本とフォーク・スプーン）
  3. `btn-gacha-v10.png` ガチャ（確定版・くまのカプセル）
  4. `btn-mypage-v4.png` マイページ（コック帽）
  5. `btn-settings-v4.png` 設定（歯車）
  6. `btn-cloche-v4.png` クローシュ（メニューを開く）
  7. `icon-close-v2.png` ×（閉じる）
  8. `kehai-icon-cloud.png` 気配アイコン（雲の中のお店と ?）
- グルメコイン: `art/ui/coin/gourmet-coin.png`（今の仮のコインの絵 `src/ui/CoinIcon.tsx` と差し替える予定）。
- 反映先: 地図の画面の上の真ん中（気配のボタン）と、下の真ん中のメニュー（クローシュ → 扇で 記録・図鑑・ガチャ・マイページ・設定、× で閉じる）。アプリ用は `src/assets/ui/` に小さくして置く。反映したら `handoff/LOG.md` に 1 行書く。
- ありがとうございました。

- 反映済み（2026-11-12）: 地図の画面のクローシュ・扇の 5 つ・×・気配・コインに差し替えた（src/assets/ui/、MapHud.tsx・CoinIcon.tsx）。

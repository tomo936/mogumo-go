# 判断ボードの根拠資料（公式の参照先）

判断ボード（handoff/BOARD.md）の土台になった調査資料です。最初の受け渡しに入っていなかったため、追加で置きます。

- 調査の記録：ギルベルトの知識ログ第7号「判断ボトルネックと『判断ボード』」（2026-11-22、調査2回分）
- 発端：上司が「判断がボトルネックになる」として、優先順位と全体を可視化する判断ボードを作っていた。Anthropic 公式の見解と、ボード自体の根拠を調査した

## 公式の参照先（全部）

1. How the Claude Code team does code review（claude.dev、2026-10-15）
   https://claude.dev/blog/solving-code-review-at-anthropic/
2. How the Claude Code team thinks about verification（claude.dev、2026-11-16）
   https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/
3. The AI-native SDLC playbook（claude.com、2026-08-21）
   https://claude.com/blog/the-ai-native-sdlc-playbook
4. How employment is changing at Anthropic（anthropic.com、2026-10-16）
   https://www.anthropic.com/research/employment-at-anthropic
5. When AI builds itself（anthropic.com、2026-06）
   https://www.anthropic.com/institute/recursive-self-improvement
6. How we contain Claude（anthropic.com、2026-05-25）
   https://www.anthropic.com/research/how-we-contain-claude

## 調査の結論（知識ログ第7号より）

- Anthropic は問題を明言している：「人間の注意力がエージェント出力のボトルネック」（社内レポート）。対話セッションの約80%は人間入力待ち
- 公式の対策は「ボード」ではなく「関門（ゲート）型」：自己検証（証拠提示）→ AIレビュー（重要度順＋タグ Important／Nit／Pre-existing、全件 fix-or-resolve 必須）→ セキュリティ → CI → リスク比例の人間承認（Low 0人／Med 1人／High 2人。「変更内容が層を決める」）→ マージキュー＋フラグ＋段階リリース → 高速巻き戻し
- 検証側の部品：verify skill、39項目チェックリスト（diffで発火判定、通常3〜10項目）、3回失敗で人間へエスカレーション、コミットへの検証スタンプ（未検証も記録）、REVIEW.md はベースブランチから読む
- 「判断ボード」という名称・単一製品は公式に無い。ただし社員がダッシュボードや「agent chief of staff（依頼の振り分け役）」を自作しており、可視化・集約の仕事（meta-work）はセッションの10%→22%に増加。SDLC playbook には triage queue（今直す／予定に入れる／理由付き却下。却下は基準調整に使う）と「各ゲートの待ち時間を測る」も明記
- 判断の場は分散型：①PR内の指摘リスト ②Claude Code agent view（Ready for review／Needs input／Working／Completed、peek要約、PRバッジ）③マージキュー。判断ボードはこの3つを横断集約した UI 層と位置づけるのが実態に最も近い
- 実在の同型製品：Codex アプリの Triage 受信箱、Linear Triage（優先度必須・担当ローテーション・SLA・AI優先度提案）、Graphite の PR Inbox／Merge Queue、Devin の Command Center（第三者情報のみ）
- 反対側の根拠：承認疲れ（利用者は約93%をそのまま承認）。Anthropic の対策は一覧改善ではなく分類器による自動承認＋サンドボックスで「承認自体を減らす」こと。ボード単体の効果を示す対照研究は未確認
- ボードの推奨形（根拠のある部品の組み合わせ）：列は優先度順／カードには件名・重要度・証拠・推奨結論と確信度・滞留時間・必要承認人数／出口は承認・却下＋理由・保留／却下理由はルール化に回す／担当ローテーション

## 調査レポートの実物（同梱）

- `handoff/to-claude/refs-decision-board/report-anthropic-judgment-bottleneck-20261122.md`
  （調査1回目：Anthropic の判断ボトルネックとボードの根拠）
- `handoff/to-claude/refs-decision-board/report-judgment-board-evidence-20261122.md`
  （調査2回目：判断ボードの根拠の裏取り）

# Anthropic「判断ボトルネック」と Judgment Board — 調査レポート

- 調査日: 2026-11-22
- 凡例: **verified live** = 一次資料を直接開いて確認 / **index** = 検索結果・二次資料での確認のみ

## Summary（結論先出し）

- **Anthropic公式は、この問題を明確に言語化している。** 最も直接的な表現は3つ:
  1. 「human attention is the bottleneck for agent output（人間の注意力がエージェント出力のボトルネック）」— Anthropic Economics レポート, 2026-10-16, **verified live**
  2. 「if they can't review code as quickly as Claude can generate it, human review will become the bottleneck」+ Amdahlの法則として「human code review has become a new bottleneck」— Anthropic Institute『When AI builds itself』, 2026-06, **verified live**
  3. 「The bottleneck moves to the steps to the left and right of the build phase. This is mainly plan, review/test, and deploy, which still run at human speed」—『The AI-native SDLC playbook』, 2026-08-21, **verified live**
- **対策の中核は「人間が全部読むのをやめ、リスクで振り分ける」こと**で、Claude Codeチームの code review 記事（2026-10-15）と verification 記事（2026-11-16）が具体策の一次資料。どちらも **verified live**。
- **「Judgment board（優先度順に並んだ、人間の判断待ちを一枚で可視化するボード）」そのものは、Anthropic公式資料には見つからなかった（後述 Q2）。** 最も近いのは、(i) severity順のPR findings + リスク階層別承認 + merge queue の組み合わせ、(ii) 社員が自作する「agent fleet の dashboards / monitors」「agent chief of staff による triage」という記述。つまり実践者の judgment board は、Anthropicの公式処方箋の**自然なUI化**だが、Anthropic自身がその名前・形で提示したものではない。

---

## Findings

### 1. Anthropic公式: 人間レビュー/判断がボトルネックになる問題と対策

#### 1-0. 問題の公式な定式化（総論）

- **『When AI builds itself』— The Anthropic Institute, Marina Favaro & Jack Clark, 2026-06-04頃（引用情報より）**
  - URL: https://www.anthropic.com/institute/recursive-self-improvement — **verified live**
  - 「Once human- and AI-authored code quality reach parity, humans will stop writing code entirely, and shift to only reviewing it. But **if they can't review code as quickly as Claude can generate it, human review will become the bottleneck to AI development**」
  - 「speeding up one part of a process often just shifts the bottleneck elsewhere … **Anthropic has already encountered one signature of Amdahl's law: as we've begun to push more code around the organization, human code review has become a new bottleneck**」
  - 背景数値: 2026-05時点で Anthropic にマージされるコードの **80%超がClaude執筆**、典型的なエンジニアは2024年比で **1日あたり8倍**のコードをマージ。人間に残る比較優位は「research taste and judgment（どの問題が重要か、どの結果を信じるか、いつ行き止まりと判断するか）」。
  - 提出変化への自動Claude reviewer の遡及分析: 過去インシデントの原因バグの **約1/3** を本番前に検出できたと報告。

- **『How employment is changing at Anthropic』— Anthropic Economics, Nathan Wilmers 他, 2026-10-16（updated 2026-10-23）**
  - URL: https://www.anthropic.com/research/employment-at-anthropic — **verified live**
  - Key finding の原文: 「**This acceleration makes human attention the bottleneck for agent output.** Even among non-technical employees, reading all the output of their Claude agents would take half their work week. In response, employees turn to "meta-work," of building visibility tools and monitoring agent pipelines.」
  - 実測: interactive session の **約80%は人間入力待ちの idle**（「people are "bottlenecking the agents"」というエンジニアの言葉を引用）。対話型 agent 時間は 2026-08 に従業員の **6倍**。対話出力すべてを読むと技術職では週 **424時間**相当（二次資料の数値、一次資料は「技術職で急増、非技術職でも週の半分超」と記述）。
  - 社員の比喩: 「an army of Claudes, with every one asking for my attention」「babysitting（すべてのClaudeが同じ緊急度で注意を要求する）」。
  - 採用基準の変化: hiring manager が重視するのは domain expertise / implementation より **autonomy and judgment**。
  - 対策としての meta-work: sessions に占める割合が 2025秋 **10% → 2026春 22%** に増加。内容は「multi-agent runs の spec 作成、別agentに別agentの出力をレビューさせる、pipelines の monitoring」。standing instructions は数百件 → **8,500件** に。

- **『The AI-native SDLC playbook』— Louis Claxton, Anthropic Applied AI team, 2026-08-21**
  - URL: https://claude.com/blog/the-ai-native-sdlc-playbook — **verified live**
  - 冒頭の診断「Code is no longer the bottleneck」: 「**The bottleneck moves to the steps to the left and right of the build phase. This is mainly plan, review/test, and deploy, which still run at human speed.**」「Reviewing each line by hand … can't keep up once agents write most of the diff」「Governance costs increase because exceptions still route through meetings and committees」
  - セキュリティの例: 「Security teams are sized for human output, so when agents multiply code output, **either the review queue builds or code ships under-reviewed**」
  - 処方: 6段階を線形フローからループへ。各段階が version管理された成果物（`intent.md` → `spec.md` → `plan.md` → diff/tests → PR/review findings → incident record）を commit し、次段階がそれを読む。commit chain 自体が監査証跡。
  - 人間の位置づけ: 「**Humans remain accountable for every decision that requires judgment**」「**Human attention concentrates at the gates, reviewing what the agent flagged** rather than starting each stage from scratch」／Deploy段階は「Layers of agentic review with human review reserved for regulated and critical code. Governance is enforced as the AI acts, with **hooks as approval gates**」

#### 1-(a) 『How the Claude Code team does code review』— claude.dev Blog, 2026-10-15

- URL: https://claude.dev/blog/solving-code-review-at-anthropic/ — **verified live**
- 著者: Addy Osmani, Morgan Westlee Lunt, Qing Wang（二次資料 blogs.techbytes.app / aicoder.com による。一次ページの取得テキストには byline が含まれなかったため著者名は **index** 扱い）
- 前提: 「Claude writes about **90 percent** of Claude Code's own code」／ Anthropic monorepo の landing は 2025-05 の約2,500件/日 → 09月 **30,000件超/日**。「manual, line-by-line code review is incredibly difficult if not impossible」
- 核心文: 「We didn't remove review. But we did **move most of the reading to machines, optimized for human time and attention**, and invested heavily in making it fast and easy to undo mistakes.」
- 章題そのものが「**THE SCARCE RESOURCE: HUMAN TIME AND ATTENTION**」。問いを「did a human read the code?」から「**what could go wrong with this change, and which check—automated or human—is the right one to catch it?**」へ置換。レビューは終端のゲートから「spellcheck while you write（書きながらのスペルチェック）」型の継続的プロセスへ。
- **目標（mission が引くフレーズの原文）**: 「most pull requests in the Claude Code repos … merge with **at most one human in the loop, who can be the author**, with no increase in reverts or incidents」。測定指標: human approvals per PR（median / 95th percentile）、human comments、PR が人を待つ時間。guardrail は revert / incident 率。
- 成果（自己申告、外部検証なし）: 2026-06→09 で merged PR **2倍超**、revert 割合 **40%超減**。
- **6〜7層の仕組み（layer by layer）**:
  1. **PR前の検証**: Claude に tests / build / design との screenshot 比較など「実行できるもの」を渡し、完了主張でなく出力を示させる。fresh-context の subagent が diff をレビュー。内部 skills（bug hunt / diff simplify / E2E check）。
  2. **全PRへの AI review**: diff を repo 全体と PR の意図に照らして読む。**複数 agent が並行して bug を探し、別のグループが各 finding に投票（voting）し、十分な同意を得たものだけ投稿**。style/diagnostics/cleanup のみの finding は除外。残ったものは「**inline comments sorted by severity**」で、各 finding は **Important / Nit / Pre-existing** とタグ付け（Pre-existing = PR が持ち込んだバグでないことを示す）。すべての finding は「修正するか、理由を付けて thread を resolve するか」必須。内部 launch 時、substantive comment を受ける PR は 16% → 54%。
  3. **Blocking security review**: bug / security の open finding がある間はマージ不可。
  4. **Blocking automated checks**: lint / type / 全 platform の tests / build。PR template に Testing・Risk・How to revert。
  5. **Human approval, scaled by risk（リスク階層別承認）**:
     | Risk | 例 | 人間承認 |
     |---|---|---|
     | Low | docs, copy, internal-only, flag 背後の additive 変更 | **0人**（自動 review + security が green なら） |
     | Medium | 通常の product 変更、caching / auto-updater / system prompts 等の sensitive 領域 | **1人** |
     | High | 最高リスクのコード + 常に2人必要な少数 path | **2人** |
     - 「**The change sets the tier, not the author**」— classifier が変更内容から tier を決定し、第2の classifier が「tier 上は不要でも追加の人が必要か」を判定。CI workflow file と owner 指定の sensitive path は常時人間必須。lighter path は trusted authors のみ。**agent の承認は人間の枠を代替しない**。承認は特定 commit に紐づき、検証できない新 commit が来れば再承認。
  6. **Merge queue, flags, gradual release**: merge queue が main との組み合わせで全 check 再実行。新挙動は flag でまず社員へ、`latest` → `stable` の段階 release。
  7. **Fast detection / rollback**: flag は deploy なしで off 可、weekly on-call、incident review で「どの層が捕捉すべきだったか」を問う。**未実装の正直な告白**: 「We don't yet have **circuit breakers that tighten approval when those numbers move**; engineers here want them before more code moves to zero-human merges」
- **Reviewer の改善ループ**: 過去 incident PR 群を eval 化して毎日実行。noise は「人間が comment にどう反応したか（fix / wrong / intentional / doesn't matter）」で測定。「Noise costs more when the author is an agent」— agent は nit でも修正してしまい round が増える。
- **収束（convergence）策**: agent author × agent reviewer が無限ループした事例（50 round超）。対策 = **round cap（3 round で reviewer が author にアプローチ再考を促す）**、diff-only re-review、bug の class 単位での指摘、既出 finding の繰り返し禁止。結果（二次資料含む）: 1 round pass 65%→78%、mean reviews to pass 2.08→1.32。
- **人間が残る場所（WHERE HUMANS STAY IN THE LOOP）**: (1) 作るべきか否かの判断（direction, taste, scope）、(2) billing / auto-updater / CI workflow 等 risky code、(3) 他が真似る architecture、(4) 証拠を読むこと、(5) 結果への accountability。「A person is accountable for every change that ships, whoever typed it」
- 他チームへの採用手順も提示: risk tiers を文書化し「change rather than the author」で決める、CODEOWNERS + branch protection、PR template に Testing / Risk / How to revert、review rounds に cap、incident/revert を eval set 化。

#### 1-(b) 『How the Claude Code team thinks about verification』— Addy Osmani, claude.dev Blog, 2026-11-16

- URL: https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/ — **verified live**（著者名は一次ページ取得テキストに byline なし。Addy Osmani 著は Gigazine / Rig Labs 等の二次資料による **index**）
- 冒頭の thesis: 「On the Claude Code team, the vast majority of our code (**~90%**) is written and reviewed by Claude」「**Verification loops are the building block that lets you delegate more work to Claude. Without them, you can really only run one or two Claudes at a time, because you have to check everything yourself. With them, you can run dozens or hundreds in parallel.**」
- 根拠: structured file generation の内部 test で、別 grader が rubric で検証すると task success が **最大 +10 points**（最も難しい問題で最大の gain）。
- **投資すべき3種の test**: (1) **E2E**（「focus on one ならこれ」。実ユーザーフローを screenshot / trace 付きで示すので誤魔化しにくい）、(2) **Property tests**（round-trip / invariants / idempotency / equivalence。edge case が code を書いた agent と bias を共有しない）、(3) **Differential tests**（旧 system を oracle に同入力で比較。migration 向け）。
- **チームの実務（mission の各項目に対応）**:
  - **verify skill**: app の起動・操作法を `.claude/skills/` の `verify` skill に codify。Claude は commit 前に使う。web=Chrome extension、mobile=iOS/Android MCP、desktop=computer use。「Running the app end to end matters more than tests」
  - **Escalation to human**: 「**Failing tests require human attention** — Nobody can read every change, so we use failures as one way to decide what needs a person. Claude runs the checks and tries to fix anything that fails. **If a check is still failing after three rounds, Claude stops and brings in a human.**」← 失敗ベースの triage
  - **39-item reliability checklist with diff-based triggers**: 「We maintain a **reliability checklist with 39 items, each with a trigger that can be read from a diff**, a check, and the incidents or PRs behind it」例: 「--resume loads old transcripts」。「Claude reads the diff and **checks only the items whose trigger matches–usually 3 to 10**–so nobody has to memorize past outages」
  - **One reviewer, multiple rounds**: reviewer を積み増すより primary reviewer の精度を上げる。`REVIEW.md`（何に注意すべきか）+ 過去 round / failure の context を次 pass に渡す。※ code review 記事の multi-agent voting とは別文脈（あちらは製品版 Code Review、本記事はチーム内部の review 方針）である点に注意
  - **Changes can't modify their own checks**: 「If a change can modify the check that judges it, the check is broken」— Code Review は `REVIEW.md` を base / default branch から読み、PR の変更からは読まない。review は commit に予約され、push 中の review 結果は無効扱い。cheap checks first（PR 前に tests/build/linter）
  - **Verification stamps on commits**: 「**we stamp each commit with how it was verified. The stamp even includes "none" so we can query for commits that weren't verified.**」+ commit gate（session に `/code-review` か `/verify` が無ければ block 可能。off / **observe** / enforce の3モード。observe で false positive を先に観測。2回 block されたら次は通して Claude を stuck させない）
  - **Reviewing the reviewers**: revert 数、maintainer に reject された変更数で検証器自体を評価。重要度次元も明示: must-fix / should-fix / nit。Code Review のタグ **Important / Nit / Pre-existing** をここでも紹介
  - **Turn misses into rules**: human review comment と revert から pattern 抽出（2 PR以上で発生 + diff から識別可能が条件 → 3 agents が反証を試み → 人間が PR で承認）。incident PR に 3 bug finders を replay し 2つ以上が見つければ detectable
  - 結論: 「your job shifts from **reading every diff to defining what "done" looks like and reviewing the evidence**」

#### 1-(c) その他の Anthropic engineering / docs（human oversight, triage, evals）

- **Multi-agent research system『How we built our multi-agent research system』, Anthropic Engineering, 2025-06-13** — **index**（二次要約で確認）
  - URL: https://www.anthropic.com/engineering/multi-agent-research-system
  - LLM-as-judge（factual accuracy / citation precision / completeness / source quality / tool efficiency の rubric）で自動評価する一方、**human の手動 testing が自動 eval の見逃した edge case（SEO content farm を権威ある source より優先する bias）を捕捉した**と明記。少数（約20件）の代表 query から eval を始める手法。
- **『Demystifying evals for AI agents』, Anthropic Engineering, 2026-01-09** — **index**（二次要約で確認、一次本文は未取得）
  - URL: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
  - grader は code-based / model-based / **human（gold standard だが slow で in-the-loop には不向き）** の portfolio で組み合わせる。自動 eval + production monitoring + **selective human studies** の多層構成。coding agent は deterministic な unit test 中心、という agent 種別ごとの戦略。
- **Claude Code docs / best practices の unattended runs・human approver**: 本調査では一次 docs 本文で「approval queue / human approver」という形の記述は**確認できなかった**（Could not verify 参照）。確認できた公式の gate 機構は SDLC playbook の「hooks as approval gates」と、上記 commit gate / permission 的な仕組みの記述まで。
- **Agent oversight の計測（参考）**: Anthropic の AI R&D automation 測定に関する二次報道（2026-08 データ）では、社内 platform の約30,000 agents の全 action が online monitor を通過し、offline monitor の flag 約100,000件/週 → classifier で絞り **約50件/週が human reviewer に到達**、という「大量 → 自動 filtering → 少数の人間判断」という funnel が報告されている — **index**（一次資料未取得のため数値は参考扱い）
  - 出典（二次）: https://blog.thecgaigroup.com/ai-rd-automation-index-anthropic-pace-metrics

### 2. 「Judgment board」相当物はあるか?

**結論: Anthropic公式資料に、"judgment board" という名称・概念での「判断待ちを一枚に集約し優先度順に並べるボード/ダッシュボード」の記述は見つからなかった。** 検索（"judgment board"、dashboard + queue + triage 等）でも Anthropic 公式の該当物は出てこなかった。

最も近い仕組み（近い順）:

| # | Anthropic の仕組み | Judgment board との距離 |
|---|---|---|
| 1 | **PR review の集約面**: 全 finding は severity 順 inline comments として提示され **Important / Nit / Pre-existing** タグ付き。全 thread の fix-or-resolve が merge 条件（code review 記事, 2026-10-15, verified live） | 「判断待ちリスト + 重要度ソート」に最も近い。ただし単位は PR 内の findings で、横断的な一枚ボードではない |
| 2 | **Risk-tiered human approval + merge queue**: classifier が 0/1/2人の承認を割り当て、merge queue が順序付けて再検証（同上） | 「リスクで優先度付けされた承認キュー」。可視化ボードではなく GitHub 上の gate として実装 |
| 3 | **Failure-driven escalation**: check が3 round 失敗したら人間を呼ぶ（verification 記事, 2026-11-16）／ commit の verification stamp（"none" を query 可能） | 「例外だけが人間に上がる」triage ロジックそのもの。ボードの"並び順"ではなく"上がる条件" |
| 4 | **SDLC の gates**: 「Human attention concentrates at the gates, reviewing what the agent flagged」+ hooks as approval gates + 成果物 chain が監査証跡（SDLC playbook, 2026-08-21） | 判断ポイントを gate に集約する思想は一致。UI の提示はない |
| 5 | **社員の自作 dashboards / triage**: 「Dashboards monitor fleets of agents」「One engineer set up an **agent chief of staff to triage agent requests**」「Recruiters built **integrated dashboards** with agents surfacing problems and initiating actions」、meta-work =「building **visibility tools** and monitoring agent pipelines」（employment レポート, 2026-10-16, verified live） | **意味的には judgment board に最も近い記述**。ただし製品/公式パターンとしてではなく、社員が個別に作る visibility tool として報告されている |

- 解釈: 実践者の judgment board は、Anthropic 公式の部品（severity tagging、risk classifier、3-round escalation、verification stamp、merge queue）を**横断的に可視化する UI 層**として組み立てたものと位置づけられる。Anthropic は部品と原則（「人間の注意は gate に集中させよ」「flag されたものだけ人間が見る」）は提供しているが、ボードという統合 UI は提示していない。

### 3. 非Anthropic 参考資料（verification / review bottleneck、risk-based triage）

| # | 資料 | 一行要約 | URL / 日付 |
|---|---|---|---|
| 1 | **Addy Osmani（個人ブログ）『Agentic Code Review』** | 「hard part は書くことから信じてよいか決めることへ移った」。agent は千行を秒で出すが人間の読む速度は不変 → 制約は downstream の「変更が正しいと確信できるか」に移動。自身は Claude Code / Codex に PR 群を triage させて時間の使い方を変えたと記述。Faros（22,000人）等のデータも集成 | https://addyosmani.com/blog/agentic-code-review/ （2026年、O'Reilly Radar 転載あり） — **index** |
| 2 | **Fiona Chen & James Stratton（Harvard）『Artificial Intelligence in the Firm: Bottlenecks in Software Production』** job-market paper, 初版 2026-01-07 / 改訂 2026-08-04〜11-08（未査読） | 718社・約72.5万人・3億件超の work events。agent 導入で code 量 +約30%（改訂版では agents +44%）だが shipped work は有意に増えず、**PR submission→merge が +49%、change request される PR 割合がほぼ倍増**。「**code review becomes the bottleneck**」と明言し、処方は生成能力でなく downstream review capacity への投資 | https://fichiers.breizh.pm/Documents/Artificial%20Intelligence%20in%20the%20Firm:%20Bottlenecks%20in%20Software%20Production.pdf — **index**（PDF 一次資料の要約部を確認） |
| 3 | **DORA / Google Cloud『State of AI-assisted Software Development 2025』**, 2025-09 | 約5,000人の調査。「**AI's primary role is that of an amplifier**」— 良い組織の強みも悪い組織の dysfunction も増幅する。AI 採用は throughput と正相関に転じたが **delivery stability とは依然負の関係**。30%が AI 生成 code をほとんど/全く信頼していない → その gap が reviewer に落ちる | https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf — **index** |
| 4 | **METR『Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity』**, 2025-07-10 | RCT（16人・246 tasks、自分の repo）。AI 許可で所要時間 **+19%（遅くなった）**のに開発者は「20%速くなった」と感じていた — 知覚と実測の乖離＝検証コストの過小評価を示す古典的証拠。※初期世代ツールの snapshot で、METR 自身が一般化に慎重。2026-02 の follow-up は選択 bias で「unreliable」と自己評価 | https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ — **index** |
| 5 | **Simon Willison『Productive use of coding agents requires confident instruction and confident verification, not granular code review』**, 2026-08-22 | 必要な skill は行単位 review ではなく「confident instruction（的確な指示）+ confident verification（挙動レベルでの確信ある検証）」という反論的視点。review 万能論へのカウンターとして有用 | 元記事 simonwillison.net（本調査では二次要約 https://abcodex.iamkesava.com/ins/ins_willison-instruction-over-review/ で確認） — **index** |
| 6 | **Faros AI『AI Engineering Report / Acceleration Whiplash』, 2026-03頃**（Osmani 経由） | 22,000人・4,000 teams の telemetry: 高 AI 採用で median review duration **+441.5%**、incidents/PR +242.7%、review なし merge 31.3%、defect 率 9%→54%。※ vendor telemetry で利害あり（Osmani 自身が caveat を明記） | 一次 URL は本調査で未特定。Osmani『Agentic Code Review』内の引用として確認 — **index** |
| 補 | **GitHub Copilot code review の規模**（二次資料群） | Copilot review は 2026-03 時点で累計 **60M reviews 超**、GitHub 上の review の 1/5 超 — 「AI が review する側に回る」産業規模の裏付け。ただし一次 GitHub 発表は本調査で未取得 | 二次: https://hub.cissychen.com/deep-research/ai-code-review-deep.en.html — **index** |

- 実践者による judgment board 的実装の傍例（参考、公式でも学術でもない）: git-backed priority queue + owner inbox + review viewer を作った開発者の事例（Sergey Kuhne、techbytes 経由の二次報道, 2026-11-08）— 「判断が必要なものだけが owner inbox に集まり、優先度順に処理する」という、まさに judgment board 型の個人実装。https://www.techbytes.app/posts/how-i-fight-ai-brain-fry/ — **index**

---

## Could not verify / 注意点

- **「judgment board」の Anthropic 公式での不在**は「検索範囲で見つからなかった」という結論であり、全資料の網羅的否定ではない。
- code review 記事（2026-10-15）の**著者名**と verification 記事（2026-11-16）の**著者名（Addy Osmani）**は、一次ページの取得テキストに byline が含まれず、二次資料に基づく（内容自体は一次で verified live）。
- 『Demystifying evals』『Multi-agent research system』は一次本文を開いておらず **index** 扱い。引用する場合は一次確認を推奨。
- Claude Code docs best practices の「unattended runs / human approver」に関する一次記述は未確認（Lydia Hallie の talk を扱う二次資料は存在）。
- Anthropic の数値（PR 2倍、revert -40%、80% idle、6:1 等）はすべて**自己申告・社内データ**で外部検証なし。Harvard 論文は未査読の working paper で版により数値が変動する（+30%版と +44%版が混在）。
- Faros / CodeRabbit 等 vendor データは販売側の利害を含む。

## Sources

### Anthropic 公式（一次）
- How the Claude Code team does code review — claude.dev, 2026-10-15 — https://claude.dev/blog/solving-code-review-at-anthropic/ — verified live
- How the Claude Code team thinks about verification — claude.dev, 2026-11-16 — https://claude.dev/blog/how-the-claude-code-team-thinks-about-verification/ — verified live
- The AI-native SDLC playbook — claude.com, Louis Claxton, 2026-08-21 — https://claude.com/blog/the-ai-native-sdlc-playbook — verified live
- How employment is changing at Anthropic — anthropic.com/research, Wilmers et al., 2026-10-16 — https://www.anthropic.com/research/employment-at-anthropic — verified live
- When AI builds itself — Anthropic Institute, Favaro & Clark, 2026-06 — https://www.anthropic.com/institute/recursive-self-improvement — verified live
- Demystifying evals for AI agents — Anthropic Engineering, 2026-01-09 — https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents — index
- How we built our multi-agent research system — Anthropic Engineering, 2025-06-13 — https://www.anthropic.com/engineering/multi-agent-research-system — index

### 非Anthropic
- Addy Osmani, Agentic Code Review — https://addyosmani.com/blog/agentic-code-review/ — index
- Chen & Stratton, Artificial Intelligence in the Firm — https://fichiers.breizh.pm/Documents/Artificial%20Intelligence%20in%20the%20Firm:%20Bottlenecks%20in%20Software%20Production.pdf — index
- DORA, State of AI-assisted Software Development 2025 — https://services.google.com/fh/files/misc/2025_state_of_ai_assisted_software_development.pdf — index
- METR, Early-2025 AI / experienced OS developers study, 2025-07-10 — https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/ — index
- Simon Willison, instruction & verification (二次要約) — https://abcodex.iamkesava.com/ins/ins_willison-instruction-over-review/ — index

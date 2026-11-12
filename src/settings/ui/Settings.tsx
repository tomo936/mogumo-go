// 設定（全画面）。仕様: docs/superpowers/specs/2026-11-10-record-pins-badges-mypage-settings-design.md（確定・設定の項目）
// まだ作っていない項目（音・お知らせ・軽量モード・規約など）は「準備中」で押せない見た目にする。
import { useState } from 'react'
import type { ReactNode } from 'react'
import './settings.css'
import { Icon } from '../../ui/Icon.tsx'
import { APP_VERSION, CONTACT_FORM_URL } from '../config.ts'

type Props = {
  email: string | null
  pinsHidden: boolean
  onTogglePins: () => void
  onSignOut: () => void
  onClose: () => void
}

const Soon = () => <span className="st__soon">準備中</span>

function Group({ title, soon, children }: { title: string; soon?: boolean; children: ReactNode }) {
  return (
    <section className="st__group" aria-label={title}>
      <h3>{title}{soon && <Soon />}</h3>
      <div className={soon ? 'st__box is-soon' : 'st__box'}>{children}</div>
    </section>
  )
}

function SoonRow({ label, sub }: { label: string; sub?: string }) {
  return (
    <div className="st__row is-soon" aria-disabled="true">
      <span>{label}{sub && <small>{sub}</small>}</span>
      <Soon />
    </div>
  )
}

function Switch({ label, on, onChange, disabled, sub }: { label: string; on: boolean; onChange?: () => void; disabled?: boolean; sub?: string }) {
  return (
    <div className={disabled ? 'st__row is-soon' : 'st__row'}>
      <span>{label}{sub && <small>{sub}</small>}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'st__switch is-on' : 'st__switch'} disabled={disabled} onClick={onChange} />
    </div>
  )
}

export function Settings(p: Props) {
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  return (
    <section className="st" aria-label="設定">
      <header className="st__bar">
        <button type="button" className="st__back" aria-label="戻る" onClick={p.onClose}>
          <Icon name="back" size={20} />
        </button>
        <h2>設定</h2>
      </header>

      <Group title="サウンド" soon>
        <div className="st__row is-soon" aria-disabled="true"><span>BGM</span><span className="st__vol" /></div>
        <div className="st__row is-soon" aria-disabled="true"><span>効果音</span><span className="st__vol" /></div>
      </Group>

      <Group title="地図">
        <Switch label="お店のピンを出す" on={!p.pinsHidden} onChange={p.onTogglePins} />
        <Switch label="軽量モード" sub="建物の立体・雲を軽くして電池を長持ち（準備中）" on={false} disabled />
      </Group>

      <Group title="お知らせ" soon>
        <Switch label="今日の気配が届いたら知らせる" sub="ホーム画面に追加したときだけ使えます" on={false} disabled />
      </Group>

      <Group title="アカウント">
        <div className="st__row">
          <span><small>Google でログイン中</small>{p.email ?? '—'}</span>
        </div>
        <button type="button" className="st__row st__link" onClick={p.onSignOut}>
          <span className="st__warn">ログアウト</span><span aria-hidden="true">›</span>
        </button>
      </Group>

      <Group title="サポート">
        <SoonRow label="遊び方をもう一度見る" />
        <SoonRow label="よくある質問" />
        {CONTACT_FORM_URL ? (
          <a className="st__row st__link" href={CONTACT_FORM_URL} target="_blank" rel="noopener noreferrer">
            <span>お問い合わせ・不具合の報告<small>フォームが開きます</small></span><span aria-hidden="true">›</span>
          </a>
        ) : (
          <SoonRow label="お問い合わせ・不具合の報告" sub="フォームを準備しています" />
        )}
      </Group>

      <Group title="プライバシー">
        <button type="button" className="st__row st__link" aria-expanded={privacyOpen} onClick={() => setPrivacyOpen((v) => !v)}>
          <span>位置情報の使い方<small>自宅はこの端末の中だけに保存</small></span><span aria-hidden="true">{privacyOpen ? '⌃' : '›'}</span>
        </button>
        {privacyOpen && (
          <p className="st__text">
            現在地は、お店までの距離と、霧を晴らすことにだけ使います。自宅の場所はこの端末の中だけに保存し、サーバーには送りません。
          </p>
        )}
        <SoonRow label="プライバシーポリシー" />
      </Group>

      <Group title="このアプリについて">
        <SoonRow label="利用規約" />
        <button type="button" className="st__row st__link" aria-expanded={creditsOpen} onClick={() => setCreditsOpen((v) => !v)}>
          <span>出典・クレジット</span><span aria-hidden="true">{creditsOpen ? '⌃' : '›'}</span>
        </button>
        {creditsOpen && (
          <div className="st__text">
            <p>地図: <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noreferrer">OpenMapTiles</a></p>
            <p>データ: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap contributors</a></p>
            <p>町の境目の出典: <a href="https://www.e-stat.go.jp/" target="_blank" rel="noreferrer">政府統計の総合窓口（e-Stat）</a></p>
            <p>「国勢調査 町丁・字等別境界データ」（総務省統計局）を加工して作成</p>
            <p>地名検索: <a href="https://www.gsi.go.jp/" target="_blank" rel="noreferrer">国土地理院</a></p>
            <p>図鑑の字体: <a href="https://fonts.google.com/specimen/M+PLUS+Rounded+1c" target="_blank" rel="noreferrer">M PLUS Rounded 1c</a>（SIL Open Font License 1.1）</p>
            <p>チェーン店の判定: <a href="https://github.com/osmlab/name-suggestion-index" target="_blank" rel="noreferrer">name-suggestion-index</a>（OpenStreetMap, BSD-3-Clause）</p>
          </div>
        )}
        <a className="st__row st__link st__hp" href="https://webservice.recruit.co.jp/" target="_blank" rel="noopener noreferrer">
          <span>Powered by ホットペッパーグルメ Webサービス</span>
        </a>
        <div className="st__row"><span>バージョン</span><span className="st__value">{`${APP_VERSION}（${__BUILD_ID__}）`}</span></div>
      </Group>

      <div className="st__box is-soon st__last">
        <div className="st__row is-soon" aria-disabled="true"><span className="st__warn">データを消してやめる（退会）</span><Soon /></div>
      </div>
    </section>
  )
}

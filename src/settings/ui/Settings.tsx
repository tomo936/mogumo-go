// 設定（全画面）。仕様: docs/superpowers/specs/2026-11-10-record-pins-badges-mypage-settings-design.md、
// 項目の整理（2026-11-17）: docs/superpowers/specs/2026-11-17-settings-legal-contact-design.md。準備中の項目は置かない。
import { useState, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import './settings.css'
import { Icon } from '../../ui/Icon.tsx'
import { APP_VERSION } from '../config.ts'
import { sound } from '../../sound/infra/sound.ts'
import { LegalScreen } from '../../legal/ui/LegalScreen.tsx'
import type { LegalKind } from '../../legal/ui/LegalScreen.tsx'
import { ContactForm } from '../../contact/ui/ContactForm.tsx'
import { sendInquiry } from '../../contact/infra/contactApi.ts'
import { DeleteAccount } from '../../account/ui/DeleteAccount.tsx'
import { deleteAccount } from '../../account/infra/deleteAccount.ts'
import { LinkPrompt } from '../../auth/ui/LinkPrompt.tsx'

type Props = {
  userId: string
  email: string | null
  isGuest: boolean // ゲスト（A3）。アカウントの表示とログアウトの確かめが変わる
  onLinkGoogle: () => void // ゲストに Google をつなぐ
  onDeleted: () => void // 退会できた（ログアウトしてログイン画面へ）
  pinsHidden: boolean
  onTogglePins: () => void
  onSignOut: () => void
  onGuide: () => void // ポコタンの案内をもう一度（A5）
  onClose: () => void
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="st__group" aria-label={title}>
      <h3>{title}</h3>
      <div className="st__box">{children}</div>
    </section>
  )
}

function Switch({ label, on, onChange }: { label: string; on: boolean; onChange: () => void }) {
  return (
    <div className="st__row">
      <span>{label}</span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className={on ? 'st__switch is-on' : 'st__switch'} onClick={onChange} />
    </div>
  )
}

function LinkRow({ label, sub, onClick, warn }: { label: string; sub?: string; onClick: () => void; warn?: boolean }) {
  return (
    <button type="button" className="st__row st__link" onClick={onClick}>
      <span className={warn ? 'st__warn' : undefined}>{label}{sub && <small>{sub}</small>}</span><span aria-hidden="true">›</span>
    </button>
  )
}

type Sub = LegalKind | 'contact' | 'delete' | null

export function Settings(p: Props) {
  const [privacyOpen, setPrivacyOpen] = useState(false)
  const [creditsOpen, setCreditsOpen] = useState(false)
  const [sub, setSub] = useState<Sub>(null)
  const [guestLogout, setGuestLogout] = useState(false) // ゲストのログアウトの確かめ
  const snd = useSyncExternalStore(sound.subscribe, sound.prefs) // BGM・効果音の ON/OFF（A6。端末ごと）
  return (
    <section className="st" aria-label="設定">
      <header className="st__bar">
        <button type="button" className="st__back" aria-label="戻る" onClick={p.onClose}>
          <Icon name="back" size={20} />
        </button>
        <h2>設定</h2>
      </header>

      <Group title="サウンド">
        <Switch label="BGM" on={snd.bgm} onChange={() => sound.setPrefs({ ...snd, bgm: !snd.bgm })} />
        <Switch label="効果音" on={snd.sfx} onChange={() => sound.setPrefs({ ...snd, sfx: !snd.sfx })} />
      </Group>

      <Group title="地図">
        <Switch label="お店のピンを出す" on={!p.pinsHidden} onChange={p.onTogglePins} />
      </Group>

      <Group title="アカウント">
        {p.isGuest ? (
          <>
            <div className="st__row">
              <span>ゲストで遊んでいます<small>記録のかぎはこの端末だけ。Google をつなぐと引き継げます</small></span>
            </div>
            <LinkRow label="Google をつないで記録を守る" sub="同じ記録のまま本登録になります" onClick={p.onLinkGoogle} />
          </>
        ) : (
          <div className="st__row">
            <span><small>Google でログイン中</small>{p.email ?? '—'}</span>
          </div>
        )}
        <LinkRow label="ログアウト" warn onClick={p.isGuest ? () => setGuestLogout(true) : p.onSignOut} />
      </Group>

      <Group title="サポート">
        <LinkRow label="遊び方をもう一度見る" sub="ポコタンが案内します" onClick={p.onGuide} />
        <LinkRow label="お問い合わせ・不具合の報告" onClick={() => setSub('contact')} />
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
        <LinkRow label="プライバシーポリシー" onClick={() => setSub('privacy')} />
      </Group>

      <Group title="このアプリについて">
        <LinkRow label="利用規約" onClick={() => setSub('terms')} />
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
            <p>ポコタンの動き: Live2D Cubism SDK（© Live2D Inc.）</p>
            <p>チェーン店の判定: <a href="https://github.com/osmlab/name-suggestion-index" target="_blank" rel="noreferrer">name-suggestion-index</a>（OpenStreetMap, BSD-3-Clause）</p>
          </div>
        )}
        <a className="st__row st__link st__hp" href="https://webservice.recruit.co.jp/" target="_blank" rel="noopener noreferrer">
          <span>Powered by ホットペッパーグルメ Webサービス</span>
        </a>
        <div className="st__row"><span>バージョン</span><span className="st__value">{`${APP_VERSION}（${__BUILD_ID__}）`}</span></div>
      </Group>

      <div className="st__box st__last">
        <LinkRow label="データを消してやめる（退会）" warn onClick={() => setSub('delete')} />
      </div>

      {(sub === 'privacy' || sub === 'terms') && <LegalScreen kind={sub} onClose={() => setSub(null)} />}
      {sub === 'contact' && (
        <ContactForm
          email={p.email}
          guest={p.isGuest}
          send={(kind, body) => sendInquiry(kind, body, `${APP_VERSION}（${__BUILD_ID__}）`)}
          onClose={() => setSub(null)}
        />
      )}
      {guestLogout && (
        <LinkPrompt
          title="ゲストのままログアウトしますか？"
          text="ゲストの記録のかぎはこの端末にしかありません。ログアウトすると、この記録には二度と戻れません。"
          okLabel="ログアウトする"
          cancelLabel="やめる"
          danger
          onOk={() => {
            setGuestLogout(false)
            p.onSignOut()
          }}
          onCancel={() => setGuestLogout(false)}
        />
      )}
      {sub === 'delete' && <DeleteAccount remove={() => deleteAccount(p.userId)} onDeleted={p.onDeleted} onClose={() => setSub(null)} />}
    </section>
  )
}

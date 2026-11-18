import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { Settings } from './Settings.tsx'

const show = (o: Partial<Parameters<typeof Settings>[0]> = {}) => {
  const p = { userId: 'u1', email: 'mogu@example.com', isGuest: false, onLinkGoogle: vi.fn(), onDeleted: vi.fn(), pinsHidden: false, onTogglePins: vi.fn(), onSignOut: vi.fn(), onGuide: vi.fn(), onClose: vi.fn(), ...o }
  render(<Settings {...p} />)
  return p
}

test('ピンのスイッチで onTogglePins（出しているときは ON）', async () => {
  const p = show()
  const sw = screen.getByRole('switch', { name: 'お店のピンを出す' })
  expect(sw).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(sw)
  expect(p.onTogglePins).toHaveBeenCalled()
})

test('ログイン中のメールとログアウト', async () => {
  const p = show()
  expect(screen.getByText('mogu@example.com')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /ログアウト/ }))
  expect(p.onSignOut).toHaveBeenCalled()
})

test('遊び方をもう一度見るで onGuide（ポコタンの案内）', async () => {
  const p = show()
  await userEvent.click(screen.getByRole('button', { name: /遊び方をもう一度見る/ }))
  expect(p.onGuide).toHaveBeenCalled()
})

test('準備中の項目は置かない（軽量モード・通知・よくある質問）', () => {
  show()
  expect(screen.queryByText('準備中')).toBeNull()
  expect(screen.queryByText(/軽量モード/)).toBeNull()
  expect(screen.queryByText(/よくある質問/)).toBeNull()
  expect(screen.queryByText(/気配が届いたら知らせる/)).toBeNull()
})

test('プライバシーポリシー・利用規約・お問い合わせ・退会の画面が開き、戻れる', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: 'プライバシーポリシー' }))
  expect(screen.getByRole('region', { name: 'プライバシーポリシー' })).toHaveTextContent('自宅の場所は、お使いの端末の中だけに保存し')
  await userEvent.click(screen.getAllByRole('button', { name: '戻る' }).at(-1)!)
  expect(screen.queryByRole('region', { name: 'プライバシーポリシー' })).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: '利用規約' }))
  expect(screen.getByRole('region', { name: '利用規約' })).toHaveTextContent('第1条')
  await userEvent.click(screen.getAllByRole('button', { name: '戻る' }).at(-1)!)

  await userEvent.click(screen.getByRole('button', { name: 'お問い合わせ・不具合の報告' }))
  expect(screen.getByRole('region', { name: 'お問い合わせ' })).toBeInTheDocument()
  await userEvent.click(screen.getAllByRole('button', { name: '戻る' }).at(-1)!)

  await userEvent.click(screen.getByRole('button', { name: 'データを消してやめる（退会）' }))
  expect(screen.getByRole('region', { name: 'データを消してやめる' })).toBeInTheDocument()
})

test('ホットペッパーの表示（リンク）とバージョンがある', () => {
  show()
  expect(screen.getByRole('link', { name: 'Powered by ホットペッパーグルメ Webサービス' })).toHaveAttribute('href', 'https://webservice.recruit.co.jp/')
  expect(screen.getByText('バージョン')).toBeInTheDocument()
})

test('位置情報の使い方を押すと説明が開く、出典も開く', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: /位置情報の使い方/ }))
  expect(screen.getByText(/サーバーには送りません/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '出典・クレジット' }))
  expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: '国土地理院' })).toHaveAttribute('href', 'https://www.gsi.go.jp/')
  // 町の境目（e-Stat の利用規約: 出典と、加工したことを書く）
  expect(screen.getByRole('link', { name: '政府統計の総合窓口（e-Stat）' })).toHaveAttribute('href', 'https://www.e-stat.go.jp/')
  expect(screen.getByText('「国勢調査 町丁・字等別境界データ」（総務省統計局）を加工して作成')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'M PLUS Rounded 1c' })).toHaveAttribute('href', 'https://fonts.google.com/specimen/M+PLUS+Rounded+1c')
  expect(screen.getByRole('link', { name: 'name-suggestion-index' })).toHaveAttribute('href', 'https://github.com/osmlab/name-suggestion-index')
})

test('戻るで閉じる', async () => {
  const p = show()
  await userEvent.click(screen.getByRole('button', { name: '戻る' }))
  expect(p.onClose).toHaveBeenCalled()
})

test('BGM と効果音のスイッチは別々に切り替わり、端末に覚える（A6）', async () => {
  show()
  const bgm = screen.getByRole('switch', { name: 'BGM' })
  const sfx = screen.getByRole('switch', { name: '効果音' })
  expect(bgm).toHaveAttribute('aria-checked', 'true')
  expect(sfx).toHaveAttribute('aria-checked', 'true')
  await userEvent.click(sfx)
  expect(sfx).toHaveAttribute('aria-checked', 'false')
  expect(bgm).toHaveAttribute('aria-checked', 'true')
  expect(JSON.parse(localStorage.getItem('mogumo.sound')!)).toEqual({ bgm: true, sfx: false })
  await userEvent.click(sfx) // 戻しておく（ほかのテストに残さない）
})

test('ゲスト: Google をつなぐボタン。ログアウトは確かめてから', async () => {
  const p = show({ isGuest: true, email: null })
  expect(screen.getByText('ゲストで遊んでいます')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: /Google をつないで記録を守る/ }))
  expect(p.onLinkGoogle).toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'ログアウト' }))
  expect(p.onSignOut).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog', { name: 'ゲストのままログアウトしますか？' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'ログアウトする' }))
  expect(p.onSignOut).toHaveBeenCalled()
})

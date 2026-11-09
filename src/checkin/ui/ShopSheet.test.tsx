import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import type { Shop } from '../../shops/domain/shop.ts'
import { ShopSheet } from './ShopSheet.tsx'
import { formatOpen } from '../domain/openHours.ts'

const hp: Shop = {
  id: 'hp:J001', name: '麺屋もぐも', lat: 35, lng: 139, kind: 'ramen',
  details: { genreCode: 'G013', genreName: 'ラーメン', catch: null, budgetName: null, photoUrl: null, open: '11:00〜22:00' }, mapId: null,
}
const mapShop: Shop = { id: 'osm:1', name: '名無しの店', lat: 35, lng: 139, kind: 'cafe', details: null, mapId: null }

const setup = (p: Partial<Parameters<typeof ShopSheet>[0]> = {}) => {
  const props = { shop: hp, distanceM: 32, busy: false, error: null, onCheckin: vi.fn(), onClose: vi.fn(), ...p }
  render(<ShopSheet {...props} />)
  return props
}

test('名前・営業時間・距離を出し、50m以内なら押せる', async () => {
  const props = setup({ distanceM: 50 })
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument()
  expect(screen.getByText('11:00〜22:00')).toBeInTheDocument()
  expect(screen.getByText('ここから 50m')).toBeInTheDocument()
  const btn = screen.getByRole('button', { name: 'チェックイン' })
  expect(btn).toBeEnabled()
  await userEvent.click(btn)
  expect(props.onCheckin).toHaveBeenCalledTimes(1)
})

test('50.4m だと押せず「あと 1m」', () => {
  setup({ distanceM: 50.4 })
  const btn = screen.getByRole('button', { name: 'あと 1m' })
  expect(btn).toBeDisabled()
})

test('通信中は押せない', () => {
  setup({ busy: true })
  expect(screen.getByRole('button', { name: /チェックイン/ })).toBeDisabled()
})

test.each([
  ['too_far', 'お店から50mより遠いようです'],
  ['network', '通信できませんでした。記録されていることもあるので、少し待ってからもう一度押してください'],
  ['not_found', 'このお店は見つかりませんでした'],
  ['no_profile', '初回設定を終えてからチェックインできます'],
  ['already_today', 'このお店は今日もうチェックインしました。また明日来てね'],
] as const)('エラー %s の文言', (reason, text) => {
  setup({ error: reason })
  expect(screen.getByText(text)).toBeInTheDocument()
})

test('地図だけのお店は営業時間を出さない', () => {
  setup({ shop: mapShop })
  expect(screen.getByText('名無しの店')).toBeInTheDocument()
  expect(screen.queryByText(/11:00/)).not.toBeInTheDocument()
})

test('閉じるボタン', async () => {
  const props = setup()
  await userEvent.click(screen.getByRole('button', { name: '閉じる' }))
  expect(props.onClose).toHaveBeenCalled()
})

test('距離は切り上げで出す（50.4m は 51m、あと 1m）', () => {
  setup({ distanceM: 50.4 })
  expect(screen.getByText('ここから 51m')).toBeInTheDocument()
})

test('通信中のボタンは「チェックイン中…」', () => {
  setup({ busy: true })
  expect(screen.getByRole('button', { name: 'チェックイン中…' })).toBeDisabled()
})

test('営業時間の時刻のつなぎ目に区切りを入れる', () => {
  expect(formatOpen('月: 11:00～15:0018:00～翌0:00')).toBe('月: 11:00～15:00 / 18:00～翌0:00')
  expect(formatOpen('（L.O. 15:00）17:00～23:00')).toBe('（L.O. 15:00） 17:00～23:00')
})

test('今日もうチェックインしたお店は、近くても押せず「今日はチェックイン済み」', () => {
  setup({ distanceM: 10, doneToday: true })
  const button = screen.getByRole('button', { name: '今日はチェックイン済み' })
  expect(button).toBeDisabled()
})

const secret = {
  id: 'h1', slot: 1, shopId: 'hp:J001', genre: '中華', catch: '自家製麺', budget: '1,000円台', isMystery: false, completed: false,
  shop: { name: '麺屋もぐも', lat: 35, lng: 139 },
}

test('masked で店名と営業時間が出ず「？？？」とヒントの行が出る', () => {
  setup({ masked: true, hint: secret })
  expect(screen.getByText('？？？')).toBeInTheDocument()
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
  expect(screen.queryByText('11:00〜22:00')).not.toBeInTheDocument()
  expect(screen.getByText('中華？')).toBeInTheDocument()
  expect(screen.getByText('予算 1,000円台')).toBeInTheDocument()
})

test('masked でもチェックインのボタンは押せる', async () => {
  const props = setup({ masked: true, hint: secret, distanceM: 40 })
  await userEvent.click(screen.getByRole('button', { name: 'チェックイン' }))
  expect(props.onCheckin).toHaveBeenCalledTimes(1)
})

test('未達成の気配の店に「気配の店 +10」。達成済み・気配でない店には出ない', () => {
  const { unmount } = render(<ShopSheet shop={hp} distanceM={10} busy={false} error={null} onCheckin={() => {}} onClose={() => {}} hint={secret} />)
  expect(screen.getByText('気配の店 +10')).toBeInTheDocument()
  expect(screen.getByText('麺屋もぐも')).toBeInTheDocument() // 明かしたあとは名前が出る
  unmount()
  const done = render(<ShopSheet shop={hp} distanceM={10} busy={false} error={null} onCheckin={() => {}} onClose={() => {}} hint={{ ...secret, completed: true }} />)
  expect(screen.queryByText('気配の店 +10')).not.toBeInTheDocument()
  done.unmount()
  setup()
  expect(screen.queryByText('気配の店 +10')).not.toBeInTheDocument()
})

// ---- 2段のシート（2026-11-09 設計 shop-sheet） ----
const photoShop: Shop = { ...hp, details: { ...hp.details!, catch: '濃厚とんこつ', budgetName: '～1000円', photoUrl: 'https://imgfp.hotp.jp/x_l.jpg' } }
const twice = { count: 2, firstDay: '2026-11-03', lastDay: '2026-11-08' }
const expand = () => userEvent.click(screen.getByRole('button', { name: 'くわしく見る' }))

test('小さい段: 行った回数を出す。0回（null）なら出さない', () => {
  const { unmount } = render(<ShopSheet shop={hp} distanceM={10} busy={false} error={null} onCheckin={() => {}} onClose={() => {}} visits={twice} />)
  expect(screen.getByText('2回行った')).toBeInTheDocument()
  unmount()
  setup({ visits: null })
  expect(screen.queryByText(/回行った/)).not.toBeInTheDocument()
})

test('全画面: 写真のシール・ひと言・わたしの記録・ホットペッパーのリンク', async () => {
  setup({ shop: photoShop, visits: twice })
  await expand()
  expect(screen.getByRole('img', { name: '麺屋もぐも の写真' })).toHaveAttribute('src', 'https://imgfp.hotp.jp/x_l.jpg')
  expect(screen.getByText('写真: ホットペッパーグルメ')).toBeInTheDocument() // 自分の写真と間違えないよう、日付は書かない
  expect(screen.queryByText(/2026\.11\.3/)).not.toBeInTheDocument()
  expect(screen.getByText('濃厚とんこつ')).toBeInTheDocument()
  expect(screen.getByText('わたしの記録')).toBeInTheDocument()
  expect(screen.getByText('11/3')).toBeInTheDocument()
  expect(screen.getByText('11/8')).toBeInTheDocument()
  expect(screen.getByText('あと1回で銀の枠')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'ホットペッパーで見る' })).toHaveAttribute('href', 'https://www.hotpepper.jp/strJ001/')
  // 小さくする
  await userEvent.click(screen.getByRole('button', { name: '小さくする' }))
  await waitFor(() => expect(screen.queryByText('わたしの記録')).not.toBeInTheDocument()) // 小さくなり終わってから中身が替わる
})

test('全画面: まだ行っていない店は案内を出す', async () => {
  setup({ visits: null, recordReady: true })
  await expand()
  expect(screen.getByText(/まだ行っていません/)).toBeInTheDocument()
})

test('全画面: 記録が読めていなければ記録の欄を出さない', async () => {
  setup({ visits: null, recordReady: false })
  await expand()
  expect(screen.queryByText('わたしの記録')).not.toBeInTheDocument()
})

test('全画面: 写真の無い店は種類の絵、地図だけの店はリンク無しで「くわしい情報はまだありません」', async () => {
  setup({ shop: mapShop })
  await expand()
  expect(screen.getByRole('img', { name: '名無しの店 の絵' })).toBeInTheDocument()
  expect(screen.getByText(/くわしい情報はまだありません/)).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'ホットペッパーで見る' })).not.toBeInTheDocument()
})

test('全画面: 伏せた気配の店は名前・写真・ひと言・リンクを出さない', async () => {
  setup({ shop: photoShop, masked: true, hint: secret, visits: null, recordReady: true })
  await expand()
  expect(screen.queryByText('麺屋もぐも')).not.toBeInTheDocument()
  expect(screen.queryByRole('img', { name: /の写真/ })).not.toBeInTheDocument()
  expect(screen.queryByText('濃厚とんこつ')).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'ホットペッパーで見る' })).not.toBeInTheDocument()
  expect(screen.getByText('中華？')).toBeInTheDocument()
})

test('全画面: 金の枠まで行ったら次の段の案内は出さない', async () => {
  setup({ visits: { count: 12, firstDay: '2026-10-01', lastDay: '2026-11-08' } })
  await expand()
  expect(screen.getByText('12回')).toBeInTheDocument()
  expect(screen.queryByText(/の枠$/)).not.toBeInTheDocument()
})

test('onLocate があるときだけ「地図で見る」を出し、押すと呼ばれる', async () => {
  const onLocate = vi.fn()
  setup({ onLocate })
  await userEvent.click(screen.getByRole('button', { name: '地図で見る' }))
  expect(onLocate).toHaveBeenCalledTimes(1)
})

test('onLocate が無ければ「地図で見る」は出ない', () => {
  setup()
  expect(screen.queryByRole('button', { name: '地図で見る' })).not.toBeInTheDocument()
})

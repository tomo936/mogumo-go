import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import type { ClearedCell, VisitEntry } from '../../record/domain/timeline.ts'

const record = vi.hoisted(() => ({ load: vi.fn() }))
const coins = vi.hoisted(() => ({ load: vi.fn() }))
const repo = vi.hoisted(() => ({ updateNickname: vi.fn() }))
vi.mock('../../record/infra/recordApi.ts', () => ({ loadRecord: () => record.load() }))
vi.mock('../infra/coins.ts', () => ({ loadCoins: () => coins.load() }))
vi.mock('../../setup/infra/profileRepo.ts', () => ({ profileRepo: repo }))
vi.mock('./ChangeHome.tsx', () => ({ ChangeHome: () => <div>自宅を変える画面</div> }))

import { MyPage } from './MyPage.tsx'

const visit = (shopId: string, kind: VisitEntry['kind'], iso: string): VisitEntry => ({
  shopId, name: shopId, kind, photoUrl: null, day: iso.slice(0, 10), at: Date.parse(iso), lat: 35, lng: 139, wasHint: false, mysteryHint: false,
})
const visits = [visit('A', 'ramen', '2026-11-01T03:00:00Z'), visit('B', 'cafe', '2026-11-02T03:00:00Z'), visit('C', 'sushi', '2026-11-03T03:00:00Z')]
const cells: ClearedCell[] = Array.from({ length: 800 }, (_, i) => ({ x: i, y: 0, at: 1 }))

beforeEach(() => {
  record.load.mockResolvedValue({ cells, visits, towns: [] })
  coins.load.mockResolvedValue(420)
  repo.updateNickname.mockReset()
})

const show = (o: Partial<Parameters<typeof MyPage>[0]> = {}) => {
  const p = { userId: 'u1', nickname: 'もぐたろう', starterId: 101 as const, home: null, onNicknameChanged: vi.fn(), onOpenBadges: vi.fn(), onClose: vi.fn(), ...o }
  render(<MyPage {...p} />)
  return p
}

test('Lv・数字のカード・コインを出す', async () => {
  show()
  expect(await screen.findByText('420')).toBeInTheDocument()
  expect(screen.getByText('Lv 2')).toBeInTheDocument() // 3軒で Lv2
  expect(screen.getByText('次の Lv まで あと 6軒')).toBeInTheDocument()
  expect(screen.getByText('0.50')).toBeInTheDocument()
})

test('晴れた広さに、クリアした町の広さが入る（実績にも）', async () => {
  record.load.mockResolvedValue({
    cells, visits,
    towns: [{
      id: '13112-経堂', name: '経堂', city: '世田谷区', areaM2: 1_000_000, at: Date.parse('2026-11-03T04:00:00Z'),
      geom: { type: 'Polygon', coordinates: [[[1, 1], [1.01, 1], [1.01, 1.01], [1, 1.01], [1, 1]]] }, bbox: [1, 1, 1.01, 1.01],
    }],
  })
  show()
  expect(await screen.findByText('1.50')).toBeInTheDocument() // マス 0.5km² ＋ 町 1km²
  expect(screen.getByRole('img', { name: '霧はらい' })).toBeInTheDocument() // 1km² の実績
})

test('最近とった実績を新しい順に3つ、すべて見るで onOpenBadges', async () => {
  const p = show()
  await screen.findByText('420')
  expect(screen.getByRole('img', { name: 'はじめての寿司' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'すべて見る ›' }))
  expect(p.onOpenBadges).toHaveBeenCalled()
})

test('ニックネームを変えると updateNickname と onNicknameChanged', async () => {
  repo.updateNickname.mockResolvedValue(undefined)
  const p = show()
  await userEvent.click(screen.getByRole('button', { name: 'ニックネームを変える' }))
  const input = screen.getByLabelText('ニックネーム')
  await userEvent.clear(input)
  await userEvent.type(input, ' もぐもぐ ')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(repo.updateNickname).toHaveBeenCalledWith('u1', 'もぐもぐ')
  expect(p.onNicknameChanged).toHaveBeenCalledWith('もぐもぐ')
})

test('11文字・空白だけは保存しない', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: 'ニックネームを変える' }))
  const input = screen.getByLabelText('ニックネーム')
  await userEvent.clear(input)
  await userEvent.type(input, 'あいうえおかきくけこさ')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(screen.getByRole('alert')).toHaveTextContent('10文字までです')
  await userEvent.clear(input)
  await userEvent.type(input, '   ')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(screen.getByRole('alert')).toHaveTextContent('ニックネームを入れてください')
  expect(repo.updateNickname).not.toHaveBeenCalled()
})

test('保存に失敗したら alert、名前は元のまま', async () => {
  repo.updateNickname.mockRejectedValue(new Error('x'))
  const p = show()
  await userEvent.click(screen.getByRole('button', { name: 'ニックネームを変える' }))
  await userEvent.type(screen.getByLabelText('ニックネーム'), 'X')
  await userEvent.click(screen.getByRole('button', { name: '保存' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存できませんでした')
  expect(p.onNicknameChanged).not.toHaveBeenCalled()
})

test('自宅の場所を変えるで、自宅の画面に切りかわる', async () => {
  show()
  await userEvent.click(screen.getByRole('button', { name: /自宅の場所を変える/ }))
  expect(screen.getByText('自宅を変える画面')).toBeInTheDocument()
})

test('コインが読めなくても他は出る', async () => {
  coins.load.mockRejectedValue(new Error('x'))
  show()
  expect(await screen.findByText('—')).toBeInTheDocument()
})

test('記録が読めなければ「もう一度」で読み直す', async () => {
  record.load.mockRejectedValueOnce(new Error('x'))
  show()
  await userEvent.click(await screen.findByRole('button', { name: 'もう一度' }))
  expect(await screen.findByText('420')).toBeInTheDocument()
})

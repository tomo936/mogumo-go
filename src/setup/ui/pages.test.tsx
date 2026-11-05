import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Session } from '@supabase/supabase-js'
import { useEffect } from 'react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { beforeEach, expect, test, vi } from 'vitest'
import { AuthContext } from '../../auth/AuthContext.ts'
import { routes } from '../../routes/router.tsx'
import { loadDraft, saveDraft } from '../infra/draftStore.ts'

const repo = vi.hoisted(() => ({ exists: vi.fn(), create: vi.fn() }))
const homeStore = vi.hoisted(() => ({ loadHome: vi.fn(), saveHome: vi.fn() }))
const location = vi.hoisted(() => ({ get: vi.fn() }))
vi.mock('../../lib/supabase.ts', () => ({ supabase: {} }))
vi.mock('../infra/profileRepo.ts', () => ({ profileRepo: repo }))
vi.mock('../infra/homeStore.ts', () => homeStore)
vi.mock('../infra/currentLocation.ts', () => ({ getCurrentLocation: location.get }))
vi.mock('../../map/ui/MapView.tsx', () => ({ MapView: () => <div data-testid="map-view" /> }))
// 地図（WebGL）の代わり。表示されたら中心として決まった場所を返す
vi.mock('./HomePickerMap.tsx', () => ({
  HomePickerMap: ({ onCenterChange }: { onCenterChange: (c: { lat: number; lng: number }) => void }) => {
    useEffect(() => onCenterChange({ lat: 35.1, lng: 139.1 }), [onCenterChange])
    return <div data-testid="home-picker" />
  },
}))

const session = { user: { id: 'u1' } } as unknown as Session

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] })
  render(
    <AuthContext.Provider value={{ session, loading: false, signInWithGoogle: vi.fn(), signOut: vi.fn() }}>
      <RouterProvider router={router} />
    </AuthContext.Provider>,
  )
  return router
}

beforeEach(() => {
  sessionStorage.clear()
  repo.exists.mockReset().mockResolvedValue(false)
  repo.create.mockReset().mockResolvedValue(undefined)
  homeStore.loadHome.mockReset().mockReturnValue(null)
  homeStore.saveHome.mockReset()
  location.get.mockReset().mockResolvedValue({ lat: 35.0, lng: 139.0 })
})

const next = () => screen.getByRole('button', { name: '次へ' })

test('ニックネーム: 11文字は長すぎで次へ進めない', async () => {
  renderAt('/setup/name')
  await userEvent.type(await screen.findByLabelText('ニックネーム'), 'あ'.repeat(11))
  expect(screen.getByText('10文字までにしてください')).toBeInTheDocument()
  expect(next()).toBeDisabled()
})

test('ニックネーム: 空白だけは入れてもらう', async () => {
  renderAt('/setup/name')
  await userEvent.type(await screen.findByLabelText('ニックネーム'), '   ')
  expect(screen.getByText('ニックネームを入れてください')).toBeInTheDocument()
  expect(next()).toBeDisabled()
})

test('ニックネーム: 残りの文字数を出し、次へで下書きに残してキャラの画面へ', async () => {
  renderAt('/setup/name')
  await userEvent.type(await screen.findByLabelText('ニックネーム'), 'もぐもぐ')
  expect(screen.getByText('あと6文字')).toBeInTheDocument()
  await userEvent.click(next())
  expect(await screen.findByText('最初のなかまを選ぼう')).toBeInTheDocument()
  expect(loadDraft()).toEqual({ nickname: 'もぐもぐ' })
})

test('キャラ: ニックネームが無ければニックネームの画面へ戻す', async () => {
  renderAt('/setup/character')
  expect(await screen.findByText('ニックネームを決めよう')).toBeInTheDocument()
})

test('キャラ: 選ぶまで次へは押せず、女の子を選ぶと 102 を残して自宅の画面へ', async () => {
  saveDraft({ nickname: 'もぐ' })
  renderAt('/setup/character')
  expect(await screen.findByText('最初のなかまを選ぼう')).toBeInTheDocument()
  expect(next()).toBeDisabled()
  await userEvent.click(screen.getByRole('button', { name: /女の子/ }))
  await userEvent.click(next())
  expect(await screen.findByText('自宅の場所を決めよう')).toBeInTheDocument()
  expect(loadDraft()).toEqual({ nickname: 'もぐ', starterId: 102 })
})

test('キャラ: 戻るでニックネームの画面へ', async () => {
  saveDraft({ nickname: 'もぐ' })
  renderAt('/setup/character')
  await userEvent.click(await screen.findByRole('button', { name: '戻る' }))
  expect(await screen.findByText('ニックネームを決めよう')).toBeInTheDocument()
})

test('自宅: キャラが無ければキャラの画面へ戻す', async () => {
  saveDraft({ nickname: 'もぐ' })
  renderAt('/setup/home')
  expect(await screen.findByText('最初のなかまを選ぼう')).toBeInTheDocument()
})

test('自宅: 現在地が取れるまで探している表示、取れたら地図', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  let resolve: (v: { lat: number; lng: number }) => void = () => {}
  location.get.mockReturnValue(new Promise((r) => { resolve = r }))
  renderAt('/setup/home')
  expect(await screen.findByText('現在地を探しています…')).toBeInTheDocument()
  await act(async () => resolve({ lat: 35, lng: 139 }))
  expect(await screen.findByTestId('home-picker')).toBeInTheDocument()
})

test('自宅: 確定で profiles を1回だけ作り、地図の中心を自宅として保存して地図へ', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  renderAt('/setup/home')
  const button = await screen.findByRole('button', { name: 'ここを自宅にする' })
  await userEvent.dblClick(button)
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  expect(repo.create).toHaveBeenCalledTimes(1)
  expect(repo.create).toHaveBeenCalledWith({ nickname: 'もぐ', starterId: 101 })
  expect(homeStore.saveHome).toHaveBeenCalledWith('u1', { lat: 35.1, lng: 139.1 })
  expect(loadDraft()).toEqual({})
})

test('自宅: 保存に失敗したら知らせて、自宅は保存せず画面に残る', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  repo.create.mockRejectedValue(new Error('x'))
  renderAt('/setup/home')
  await userEvent.click(await screen.findByRole('button', { name: 'ここを自宅にする' }))
  expect(await screen.findByText('保存できませんでした。もう一度お試しください')).toBeInTheDocument()
  expect(homeStore.saveHome).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'ここを自宅にする' })).toBeEnabled()
})

test('自宅: プロフィールがある人は下書きが無くても自宅だけ保存し、profiles は作らない', async () => {
  repo.exists.mockResolvedValue(true)
  renderAt('/setup/home')
  await userEvent.click(await screen.findByRole('button', { name: 'ここを自宅にする' }))
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  expect(repo.create).not.toHaveBeenCalled()
  expect(homeStore.saveHome).toHaveBeenCalledWith('u1', { lat: 35.1, lng: 139.1 })
})

test('自宅: 位置情報を断られたら設定の案内、見つからなければもう一度試す', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  location.get.mockRejectedValueOnce('denied')
  renderAt('/setup/home')
  expect(await screen.findByText('位置情報がオフになっています')).toBeInTheDocument()
})

test('自宅: 見つからないときは「もう一度試す」で取り直す', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  location.get.mockRejectedValueOnce('timeout')
  renderAt('/setup/home')
  await userEvent.click(await screen.findByRole('button', { name: 'もう一度試す' }))
  expect(await screen.findByTestId('home-picker')).toBeInTheDocument()
})

// --- 最終レビューの指摘への対応 ---
test('自宅: 実はサーバーに作れていたのに通信エラーになったときは、読み直して先へ進む', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  repo.exists.mockResolvedValueOnce(false).mockResolvedValue(true)
  repo.create.mockRejectedValue(new Error('duplicate'))
  renderAt('/setup/home')
  await userEvent.click(await screen.findByRole('button', { name: 'ここを自宅にする' }))
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
  expect(homeStore.saveHome).toHaveBeenCalledWith('u1', { lat: 35.1, lng: 139.1 })
})

test('自宅: 保存の通信中にもう一度押しても、作るのは1回だけ', async () => {
  saveDraft({ nickname: 'もぐ', starterId: 101 })
  let finish: () => void = () => {}
  repo.create.mockReturnValue(new Promise<void>((r) => { finish = r }))
  renderAt('/setup/home')
  const button = await screen.findByRole('button', { name: 'ここを自宅にする' })
  await userEvent.click(button)
  await userEvent.click(screen.getByRole('button', { name: '保存しています…' }))
  expect(repo.create).toHaveBeenCalledTimes(1)
  await act(async () => finish())
  expect(await screen.findByTestId('map-view')).toBeInTheDocument()
})

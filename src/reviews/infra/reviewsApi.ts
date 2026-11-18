// 感想の読み書き（Supabase の reviews・review_reports・public_profiles・バケット review-photos）。
// 他人の非公開・非表示の感想は RLS が返さない。念のためアプリでも自分の行と非公開の行を捨てる。
import { REVIEWS_PAGE, summarize } from '../domain/review.ts'
import type { Review, VisitRef } from '../domain/review.ts'
import { compressPhoto } from './photo.ts'

type Res = { data: unknown; error: unknown }
type Query = PromiseLike<Res> & {
  select(c: string): Query
  eq(c: string, v: unknown): Query
  neq(c: string, v: unknown): Query
  in(c: string, v: readonly unknown[]): Query
  order(c: string, o?: { ascending: boolean }): Query
  range(from: number, to: number): Query
  limit(n: number): Query
  insert(row: Record<string, unknown>): Query
  update(row: Record<string, unknown>): Query
  delete(): Query
  single(): Query
}
type Bucket = {
  upload(path: string, file: Blob, opts: { contentType: string; upsert: boolean }): PromiseLike<Res>
  remove(paths: string[]): PromiseLike<Res>
  createSignedUrls(paths: string[], expiresIn: number): PromiseLike<Res>
}
export type ReviewsClient = {
  from(table: string): Query
  auth: { getSession(): PromiseLike<{ data: { session: { user: { id: string } } | null } }> }
  storage: { from(bucket: string): Bucket }
}

const BUCKET = 'review-photos'
const SIGN_SECONDS = 3600
const COLS = 'review_id, checkin_id, shop_id, user_id, stars, body, photo_path, is_public, created_at'

export type PhotoChange = { kind: 'keep' } | { kind: 'remove' } | { kind: 'new'; file: Blob }

// supabase は読み込み時に環境変数を要求するので、使う時に読む
const getClient = async (c?: ReviewsClient): Promise<ReviewsClient> =>
  c ?? ((await import('../../lib/supabase.ts')).supabase as unknown as ReviewsClient)

async function myId(c: ReviewsClient): Promise<string> {
  const id = (await c.auth.getSession()).data.session?.user.id
  if (!id) throw new Error('no_session')
  return id
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null
const rows = (r: Res, what: string): Record<string, unknown>[] => {
  if (r.error || !Array.isArray(r.data)) throw new Error(what)
  return r.data.filter(isObj)
}

function toReview(r: Record<string, unknown>): Review | null {
  const { review_id, checkin_id, shop_id, user_id, stars, body, photo_path, created_at } = r
  if (typeof review_id !== 'string' || typeof checkin_id !== 'string' || typeof shop_id !== 'string' || typeof user_id !== 'string') return null
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5 || typeof created_at !== 'string') return null
  return {
    id: review_id,
    checkinId: checkin_id,
    shopId: shop_id,
    userId: user_id,
    stars,
    body: typeof body === 'string' && body !== '' ? body : null,
    photoPath: typeof photo_path === 'string' && photo_path !== '' ? photo_path : null,
    isPublic: r.is_public !== false,
    createdAt: created_at,
    nickname: null,
  }
}

const parseAll = (list: Record<string, unknown>[]): Review[] => list.map(toReview).filter((r): r is Review => r !== null)

export async function loadMine(shopId: string, client?: ReviewsClient): Promise<{ visits: VisitRef[]; mine: Review[] }> {
  const c = await getClient(client)
  const me = await myId(c)
  const [ck, rv] = await Promise.all([
    c.from('checkins').select('checkin_id, checked_in_at').eq('user_id', me).eq('shop_id', shopId).order('checked_in_at', { ascending: false }),
    c.from('reviews').select(COLS).eq('user_id', me).eq('shop_id', shopId),
  ])
  const visits: VisitRef[] = []
  for (const r of rows(ck, 'reviews_unavailable')) {
    if (typeof r.checkin_id === 'string' && typeof r.checked_in_at === 'string') visits.push({ checkinId: r.checkin_id, checkedInAt: r.checked_in_at })
  }
  return { visits, mine: parseAll(rows(rv, 'reviews_unavailable')).filter((r) => r.userId === me) }
}

async function withNicknames(c: ReviewsClient, list: Review[]): Promise<Review[]> {
  const ids = [...new Set(list.map((r) => r.userId))]
  if (ids.length === 0) return list
  const res = await c.from('public_profiles').select('user_id, nickname').in('user_id', ids)
  const names = new Map<string, string>()
  if (!res.error && Array.isArray(res.data)) {
    for (const p of res.data.filter(isObj)) if (typeof p.user_id === 'string' && typeof p.nickname === 'string') names.set(p.user_id, p.nickname)
  }
  return list.map((r) => ({ ...r, nickname: names.get(r.userId) ?? null }))
}

async function readOthers(c: ReviewsClient, shopId: string, from: number, count: number): Promise<Review[]> {
  const me = await myId(c)
  const res = await c.from('reviews').select(COLS).eq('shop_id', shopId).neq('user_id', me)
    .order('created_at', { ascending: false }).range(from, from + count - 1)
  return parseAll(rows(res, 'reviews_unavailable')).filter((r) => r.userId !== me && r.isPublic)
}

export async function loadOthers(shopId: string, page: number, client?: ReviewsClient): Promise<{ items: Review[]; hasMore: boolean }> {
  const c = await getClient(client)
  const got = await readOthers(c, shopId, page * REVIEWS_PAGE, REVIEWS_PAGE + 1)
  return { items: await withNicknames(c, got.slice(0, REVIEWS_PAGE)), hasMore: got.length > REVIEWS_PAGE }
}

export async function loadLatest(shopId: string, n = 2, client?: ReviewsClient): Promise<Review[]> {
  const c = await getClient(client)
  return withNicknames(c, await readOthers(c, shopId, 0, n))
}

// 件数と平均: 他人の星だけを読んで端末で計算する（増えたら SQL の関数にする）
export async function loadSummary(shopId: string, client?: ReviewsClient): Promise<{ avg: number; count: number } | null> {
  const c = await getClient(client)
  const me = await myId(c)
  const res = await c.from('reviews').select('stars, user_id, is_public').eq('shop_id', shopId).neq('user_id', me)
  const stars = rows(res, 'reviews_unavailable')
    .filter((r) => r.user_id !== me && r.is_public !== false && typeof r.stars === 'number' && Number.isInteger(r.stars) && r.stars >= 1 && r.stars <= 5)
    .map((r) => r.stars as number)
  return summarize(stars)
}

async function removeQuietly(c: ReviewsClient, path: string): Promise<void> {
  try {
    await c.storage.from(BUCKET).remove([path])
  } catch {
    // 消せなくても感想の保存は成功扱い（ファイルが残るだけ）
  }
}

export async function saveReview(
  input: { shopId: string; checkinId: string; existing: Review | null; stars: number; body: string | null; isPublic: boolean; photo: PhotoChange },
  client?: ReviewsClient,
): Promise<Review> {
  const c = await getClient(client)
  const me = await myId(c)
  let uploaded: string | null = null
  if (input.photo.kind === 'new') {
    const blob = await compressPhoto(input.photo.file)
    const path = `${me}/${crypto.randomUUID()}.jpg`
    const up = await c.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: false })
    if (up.error) throw new Error('photo_upload_failed')
    uploaded = path
  }
  const fields: Record<string, unknown> = { stars: input.stars, body: input.body, is_public: input.isPublic }
  if (input.photo.kind === 'remove') fields.photo_path = null
  if (uploaded) fields.photo_path = uploaded
  const q = input.existing
    ? c.from('reviews').update(fields).eq('review_id', input.existing.id)
    : c.from('reviews').insert({ checkin_id: input.checkinId, shop_id: input.shopId, photo_path: null, ...fields })
  const res = await q.select(COLS).single()
  const saved = !res.error && isObj(res.data) ? toReview(res.data) : null
  if (!saved) {
    if (uploaded) await removeQuietly(c, uploaded)
    throw new Error('review_save_failed')
  }
  const old = input.existing?.photoPath
  if (old && input.photo.kind !== 'keep' && old !== saved.photoPath) await removeQuietly(c, old)
  return saved
}

export async function deleteReview(r: Review, client?: ReviewsClient): Promise<void> {
  const c = await getClient(client)
  const res = await c.from('reviews').delete().eq('review_id', r.id)
  if (res.error) throw new Error('review_delete_failed')
  if (r.photoPath) await removeQuietly(c, r.photoPath)
}

export async function reportReview(id: string, client?: ReviewsClient): Promise<'ok' | 'already'> {
  const c = await getClient(client)
  const res = await c.from('review_reports').insert({ review_id: id })
  if (!res.error) return 'ok'
  if (isObj(res.error) && res.error.code === '23505') return 'already'
  throw new Error('report_failed')
}

export async function photoUrls(paths: string[], client?: ReviewsClient): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (paths.length === 0) return out
  const c = await getClient(client)
  const res = await c.storage.from(BUCKET).createSignedUrls(paths, SIGN_SECONDS)
  if (res.error || !Array.isArray(res.data)) return out
  for (const s of res.data.filter(isObj)) if (typeof s.path === 'string' && typeof s.signedUrl === 'string') out.set(s.path, s.signedUrl)
  return out
}

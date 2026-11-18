// 町の境目のファイルを作る（1回だけ。国勢調査が新しくなったら作り直す）。
//   node scripts/towns/build.ts --work <作業フォルダ> --out .towns-out [--pref 13]
// すること: 都道府県ごとの zip を e-Stat から取る（作業フォルダにあれば取らない）→ mapshaper で
// 「町丁だけ → 丁目をまとめる → 10m でならす → 小数5桁」→ 0.25 度の格子に分けて
// <out>/g/<格子>.json.gz と、格子の一覧 <out>/g/index.json を書く。
// 出典: 「国勢調査 町丁・字等別境界データ」（総務省統計局・e-Stat）。このスクリプトが加工する。
// 格子の決まりは Edge Function と同じもの（supabase/functions/towns/core.ts）を使う。
import { execFileSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { bboxOf, chunkKeysForGeometry } from '../../supabase/functions/towns/core.ts'
import type { Chunk, ChunkTown, Geometry } from '../../supabase/functions/towns/core.ts'

const MAPSHAPER = 'mapshaper@0.7.101' // 版を固定（結果を変えないため）
const SURVEY = 'A002005212020' // 令和2年国勢調査 町丁・字等別（e-Stat の境界データ）
const WARN_RAW = 3_000_000 // いちばん大きいファイルがこれを超えたら知らせる（関数のメモリ 256MB を守る目安）
// 町名: 「◯丁目」を外してまとめる。名前が無ければ市区町村名
const TOWN_NAME = 'town=(S_NAME||"").replace(/[〇一二三四五六七八九十0-9０-９]+丁目$/,"")||CITY_NAME'

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

async function download(code: string, zip: string): Promise<void> {
  const url = `https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=${SURVEY}&code=${code}&coordSys=1&format=shape&downloadType=5&datum=2011`
  const res = await fetch(url, { signal: AbortSignal.timeout(300_000) })
  if (!res.ok) throw new Error(`e-Stat ${code}: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length < 4 || buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error(`e-Stat ${code}: zip ではない`)
  writeFileSync(zip, buf)
  await new Promise((r) => setTimeout(r, 1000)) // e-Stat に続けて当てない
}

type Feature = { geometry: Geometry | null; properties: { PREF?: string; CITY?: string; CITY_NAME?: string; town?: string; area?: number } }

// 1つの県の町。id は <県2桁><市区町村3桁>-<町名>
function townsOf(geojson: string): { towns: ChunkTown[]; skipped: number } {
  const fc = JSON.parse(readFileSync(geojson, 'utf8')) as { features: Feature[] }
  const out: ChunkTown[] = []
  let skipped = 0 // 形の無いもの（ならしたら消えた小さなかけら など）
  for (const f of fc.features) {
    const p = f.properties
    if (!f.geometry || !p.PREF || !p.CITY || !p.town) {
      skipped++
      continue
    }
    out.push({ id: `${p.PREF}${p.CITY}-${p.town}`, name: p.town, city: p.CITY_NAME ?? '', area: Math.round(p.area ?? 0), bbox: bboxOf(f.geometry), geom: f.geometry })
  }
  return { towns: out, skipped }
}

const work = arg('work')
const out = arg('out')
if (!work || !out) {
  console.error('使い方: node scripts/towns/build.ts --work <作業フォルダ> --out <出力フォルダ> [--pref 13]')
  process.exit(1)
}
const only = arg('pref')
const prefs = only ? [only.padStart(2, '0')] : Array.from({ length: 47 }, (_, i) => String(i + 1).padStart(2, '0'))

// 格子ごとに1行1町で書きためる（全国を一度にメモリへ載せない）
const parts = join(work, 'parts')
rmSync(parts, { recursive: true, force: true })
mkdirSync(parts, { recursive: true })

let townCount = 0
for (const code of prefs) {
  const dir = join(work, code)
  mkdirSync(dir, { recursive: true })
  const zip = join(dir, `r2ka${code}.zip`)
  if (!existsSync(zip)) await download(code, zip)
  const geojson = join(dir, 'towns.geojson')
  execFileSync('npx', ['--yes', MAPSHAPER, zip, 'encoding=sjis',
    '-filter', 'HCODE==8101',
    '-each', TOWN_NAME,
    '-dissolve2', 'CITY,town', 'copy-fields=PREF,CITY_NAME',
    '-simplify', 'dp', 'interval=10', 'keep-shapes',
    '-each', 'area=this.area',
    '-o', 'precision=0.00001', 'format=geojson', geojson], { stdio: 'ignore' })
  const { towns, skipped } = townsOf(geojson)
  for (const t of towns) {
    const line = JSON.stringify(t) + '\n'
    for (const key of chunkKeysForGeometry(t.geom)) appendFileSync(join(parts, `${key}.ndjson`), line)
  }
  townCount += towns.length
  console.log(`${code}: ${towns.length} 町${skipped > 0 ? `（形が無くて外した ${skipped}）` : ''}`)
}

const g = join(out, 'g')
rmSync(g, { recursive: true, force: true })
mkdirSync(g, { recursive: true })
const keys: string[] = []
let total = 0
let biggest = { key: '', raw: 0, gz: 0 }
for (const file of readdirSync(parts).sort()) {
  const key = file.replace(/\.ndjson$/, '')
  const towns = readFileSync(join(parts, file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l) as ChunkTown)
  const chunk: Chunk = { v: 1, towns }
  const raw = Buffer.from(JSON.stringify(chunk))
  const gz = gzipSync(raw, { level: 9 })
  writeFileSync(join(g, `${key}.json.gz`), gz)
  keys.push(key)
  total += gz.length
  if (raw.length > biggest.raw) biggest = { key, raw: raw.length, gz: gz.length }
}
writeFileSync(join(g, 'index.json'), JSON.stringify({ v: 1, keys }))
total += statSync(join(g, 'index.json')).size

const mb = (n: number) => `${(n / 1_000_000).toFixed(2)}MB`
console.log(`町 ${townCount}／ファイル ${keys.length + 1}（一覧を含む）／合計 ${mb(total)}`)
console.log(`いちばん大きい格子 ${biggest.key}: 元 ${mb(biggest.raw)}・圧縮後 ${mb(biggest.gz)}`)
if (biggest.raw > WARN_RAW) {
  console.error(`注意: ${biggest.key} が ${mb(WARN_RAW)} を超えています。格子を細かくするか、ならす幅を見直してください`)
  process.exitCode = 2
}

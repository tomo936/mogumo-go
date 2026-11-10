// 実績の一覧（条件・名前・★）。名前と条件は 2026-11-10 にオーナーが確定した案のとおり。
import { KIND_LABEL } from '../../shops/domain/kindLabel.ts'
import type { ShopKind } from '../../shops/domain/shop.ts'
import { anniversary, countWhere, directions, distinctCount, distinctInGroup, farFromHome, firstWhere, fogArea, groupReach, nth, sameDayAll, shopsReaching, streak } from './measures.ts'
import type { BadgeDef, BadgeGroup, BadgeIcon, Measure, Prepared, Stars } from './types.ts'

// 図鑑と同じ並び
export const GENRE_ORDER: ShopKind[] = [
  'ramen', 'sushi', 'soba', 'washoku', 'izakaya', 'chinese', 'yakiniku', 'western', 'curry',
  'cafe', 'cake', 'bakery', 'donburi', 'burger', 'ethnic', 'okonomiyaki', 'takoyaki', 'mystery',
]
const GENRE_STEPS: { need: number; name: (l: string) => string }[] = [
  { need: 1, name: (l) => `はじめての${l}` },
  { need: 3, name: (l) => `${l}好き` },
  { need: 10, name: (l) => `${l}通` },
  { need: 30, name: (l) => `${l}名人` },
  { need: 50, name: (l) => `${l}マスター` },
]
const genreLabel = (k: ShopKind) => (k === 'mystery' ? 'なぞ' : KIND_LABEL[k])
const genreWhere = (k: ShopKind) => (k === 'mystery' ? 'その他（なぞ）のお店' : `${KIND_LABEL[k]}のお店`)

type Opt = { secret?: boolean; needsHome?: boolean; unit?: string; series?: string }
const def = (
  id: string, group: BadgeGroup, name: string, how: string, stars: Stars, art: BadgeDef['art'],
  need: number | null, measure: (p: Prepared, need: number) => Measure, o: Opt = {},
): BadgeDef => ({ id, series: o.series ?? id, group, name, how, stars, art, need, measure, secret: o.secret ?? false, needsHome: o.needsHome ?? false, unit: o.unit ?? '回' })
const icon = (i: BadgeIcon) => ({ icon: i })
// 1つだけの実績（進み具合は出さない）
const single = (id: string, group: BadgeGroup, name: string, how: string, stars: Stars, i: BadgeIcon, m: (p: Prepared) => Measure, o: Opt = {}) =>
  def(id, group, name, how, stars, icon(i), null, (p) => m(p), o)

const SWEET: ShopKind[] = ['cake', 'cafe', 'bakery']
const WA: ShopKind[] = ['washoku', 'sushi', 'soba', 'donburi']
const YO: ShopKind[] = ['western', 'burger']
const CHU: ShopKind[] = ['chinese']
const season = (month: number) => (month >= 3 && month <= 5 ? 'spring' : month >= 6 && month <= 8 ? 'summer' : month >= 9 && month <= 11 ? 'autumn' : 'winter')

const genre: BadgeDef[] = GENRE_ORDER.flatMap((k) =>
  GENRE_STEPS.map((s, i) =>
    def(`genre_${k}_${i + 1}`, 'genre', s.name(genreLabel(k)), `${genreWhere(k)}に ${s.need}回行く`, (i + 1) as Stars, { kind: k }, s.need, countWhere((v) => v.kind === k), { series: `genre_${k}` }),
  ),
)

const shop = (v: { shopId: string }) => v.shopId
const others: BadgeDef[] = [
  // 開拓
  single('explore_first', 'explore', 'はじめの一歩', 'はじめてチェックインする', 1, 'walk', (p) => nth(p.visits.map((v) => v.at), 1)),
  def('explore_new_10', 'explore', '新米たんけん家', 'はじめてのお店に 10軒行く', 1, icon('store'), 10, distinctCount(shop), { unit: '軒', series: 'explore_new' }),
  def('explore_new_30', 'explore', 'たんけん家', 'はじめてのお店に 30軒行く', 2, icon('store'), 30, distinctCount(shop), { unit: '軒', series: 'explore_new' }),
  def('explore_new_100', 'explore', '開拓王', 'はじめてのお店に 100軒行く', 3, icon('store'), 100, distinctCount(shop), { unit: '軒', series: 'explore_new' }),
  def('explore_new_300', 'explore', 'グルメ大王', 'はじめてのお店に 300軒行く', 4, icon('store'), 300, distinctCount(shop), { unit: '軒', series: 'explore_new' }),
  def('explore_kinds_7', 'explore', '七変化', '7種類のジャンルのお店に行く', 2, icon('bowls'), 7, distinctCount((v) => v.kind), { unit: '種類' }),
  def('explore_kinds_all', 'explore', 'ぜんぶ食べた', '18種類ぜんぶのジャンルのお店に行く', 4, icon('bowls'), 18, distinctCount((v) => v.kind), { unit: '種類' }),
  // 常連
  def('regular_3', 'regular', '顔なじみ', '同じお店に 3回行く', 1, icon('heart'), 3, groupReach(shop), { series: 'regular' }),
  def('regular_10', 'regular', '常連さん', '同じお店に 10回行く', 2, icon('heart'), 10, groupReach(shop), { series: 'regular' }),
  def('regular_30', 'regular', 'お店の家族', '同じお店に 30回行く', 3, icon('heart'), 30, groupReach(shop), { series: 'regular' }),
  def('regular_five', 'regular', '行きつけ5', '3回以上行ったお店を 5軒つくる', 3, icon('heart'), 5, shopsReaching(3), { unit: '軒' }),
  // 霧はらい
  def('fog_01', 'fog', 'そよ風', '霧を 0.1km² 晴らす', 1, icon('cloud'), 0.1, fogArea, { unit: 'km²', series: 'fog' }),
  def('fog_1', 'fog', '霧はらい', '霧を 1km² 晴らす', 2, icon('cloud'), 1, fogArea, { unit: 'km²', series: 'fog' }),
  def('fog_5', 'fog', '晴れわたり', '霧を 5km² 晴らす', 3, icon('cloud'), 5, fogArea, { unit: 'km²', series: 'fog' }),
  def('fog_10', 'fog', '青空の主', '霧を 10km² 晴らす', 4, icon('cloud'), 10, fogArea, { unit: 'km²', series: 'fog' }),
  // 遠征（自宅が要る）
  def('far_1', 'far', 'ご近所たんけん', '自宅から 1km 以上はなれたお店に行く', 1, icon('flag'), 1, farFromHome, { needsHome: true, unit: 'km', series: 'far' }),
  def('far_3', 'far', '遠征隊', '自宅から 3km 以上はなれたお店に行く', 2, icon('flag'), 3, farFromHome, { needsHome: true, unit: 'km', series: 'far' }),
  def('far_10', 'far', '大遠征', '自宅から 10km 以上はなれたお店に行く', 3, icon('flag'), 10, farFromHome, { needsHome: true, unit: 'km', series: 'far' }),
  def('far_compass', 'far', '四方八方', '自宅から 1km 以上先のお店に、北・東・南・西すべての向きで行く', 3, icon('compass'), 4, directions, { needsHome: true, unit: '方向' }),
  // 毎日・リズム
  def('rhythm_3', 'rhythm', 'つづけてグルメ', '3日つづけてお店に行く', 1, icon('calendar'), 3, streak(), { unit: '日', series: 'rhythm_streak' }),
  def('rhythm_7', 'rhythm', '毎日グルメ', '7日つづけてお店に行く', 2, icon('calendar'), 7, streak(), { unit: '日', series: 'rhythm_streak' }),
  def('rhythm_30', 'rhythm', 'グルメの鬼', '30日つづけてお店に行く', 3, icon('calendar'), 30, streak(), { unit: '日', series: 'rhythm_streak' }),
  def('rhythm_month20', 'rhythm', 'ひと月に20軒', '同じ月に 20回お店に行く', 3, icon('calendar'), 20, groupReach((v) => v.month)),
  def('rhythm_lunch', 'rhythm', 'お昼の常連', '平日のお昼（11〜14時）に 10回お店に行く', 2, icon('sun'), 10, countWhere((v) => v.dow >= 1 && v.dow <= 5 && v.hour >= 11 && v.hour < 14)),
  def('rhythm_weekend', 'rhythm', '週末グルメ', '土日に 10回お店に行く', 2, icon('sun'), 10, countWhere((v) => v.dow === 0 || v.dow === 6)),
  // はしご
  def('hashigo_2', 'hashigo', 'はしご', '1日に 2軒行く', 1, icon('walk'), 2, distinctInGroup((v) => v.day, shop), { unit: '軒', series: 'hashigo_day' }),
  def('hashigo_3', 'hashigo', 'はしご上手', '1日に 3軒行く', 2, icon('walk'), 3, distinctInGroup((v) => v.day, shop), { unit: '軒', series: 'hashigo_day' }),
  def('hashigo_5', 'hashigo', '食い倒れ', '1日に 5軒行く', 3, icon('walk'), 5, distinctInGroup((v) => v.day, shop), { unit: '軒', series: 'hashigo_day' }),
  def('hashigo_course', 'hashigo', 'フルコース', '同じ日に 4種類のジャンルのお店に行く', 3, icon('bowls'), 4, distinctInGroup((v) => v.day, (v) => v.kind), { unit: '種類' }),
  def('hashigo_world', 'hashigo', '世界一周', '同じ日に 和・洋・中 のお店に行く', 3, icon('bowls'), 3, sameDayAll([WA, YO, CHU]), { unit: '種類' }),
  // 気配
  def('hint_1', 'hint', 'はじめての気配', '気配のお店に行く', 1, icon('hint'), 1, countWhere((v) => v.wasHint), { series: 'hint' }),
  def('hint_5', 'hint', '気配ハンター', '気配のお店に 5回行く', 2, icon('hint'), 5, countWhere((v) => v.wasHint), { series: 'hint' }),
  def('hint_20', 'hint', '気配の達人', '気配のお店に 20回行く', 3, icon('hint'), 20, countWhere((v) => v.wasHint), { series: 'hint' }),
  def('hint_50', 'hint', '千里眼', '気配のお店に 50回行く', 4, icon('hint'), 50, countWhere((v) => v.wasHint), { series: 'hint' }),
  single('hint_mystery', 'hint', 'なぞの気配', '謎の気配のお店に行く', 2, 'hint', firstWhere((v) => v.mysteryHint)),
  // 季節・記念日（ひみつ）
  single('season_soba', 'season', '年越しそば', '大みそか（12/31）にそばのお店に行く', 3, 'gift', firstWhere((v) => v.md === '12-31' && v.kind === 'soba'), { secret: true }),
  single('season_xmas', 'season', 'メリークリスマス', 'クリスマス（12/24〜25）にスイーツかカフェのお店に行く', 3, 'gift', firstWhere((v) => (v.md === '12-24' || v.md === '12-25') && (v.kind === 'cake' || v.kind === 'cafe')), { secret: true }),
  single('season_valentine', 'season', 'バレンタイン', '2/14 にスイーツかカフェのお店に行く', 3, 'heart', firstWhere((v) => v.md === '02-14' && (v.kind === 'cake' || v.kind === 'cafe')), { secret: true }),
  def('season_four', 'season', '四季のグルメ', '春・夏・秋・冬のそれぞれでお店に行く', 4, icon('leaf'), 4, distinctCount((v) => season(Number(v.md.slice(0, 2)))), { secret: true, unit: '季節' }),
  single('season_year', 'season', '1周年', 'はじめてのお店から 1年たって、またお店に行く', 4, 'star', anniversary, { secret: true }),
  // ちょっと変わった（ひみつ）
  single('quirky_morning', 'quirky', '朝ごはん隊', '朝9時より前にお店に行く', 2, 'sun', firstWhere((v) => v.hour < 9), { secret: true }),
  single('quirky_night', 'quirky', '夜ふかしグルメ', '夜22時より後にお店に行く', 2, 'moon', firstWhere((v) => v.hour >= 22), { secret: true }),
  def('quirky_hitosuji', 'quirky', 'ひとすじ', '同じお店に 3日つづけて行く', 3, icon('heart'), 3, streak(shop), { secret: true, unit: '日' }),
  def('quirky_sweets', 'quirky', '甘いもの別腹', '同じ日に、ごはんのお店とスイーツ・カフェ・パンのお店に行く', 2, icon('gift'), 2,
    distinctInGroup((v) => v.day, (v) => (SWEET.includes(v.kind) ? 'sweet' : 'meal')), { secret: true, unit: '軒' }),
  def('quirky_ramen2', 'quirky', 'ラーメンのはしご', '同じ日にラーメンのお店に 2回行く', 2, { kind: 'ramen' }, 2, groupReach((v) => v.day, (v) => v.kind === 'ramen'), { secret: true }),
  single('quirky_zorome', 'quirky', 'ゾロ目', '11:11・22:22・0:00 ちょうどにチェックインする', 3, 'clock',
    firstWhere((v) => (v.hour === 11 && v.minute === 11) || (v.hour === 22 && v.minute === 22) || (v.hour === 0 && v.minute === 0)), { secret: true }),
  def('quirky_nazo', 'quirky', 'なぞの常連', 'その他（なぞ）のお店に 5回行く', 2, { kind: 'mystery' }, 5, countWhere((v) => v.kind === 'mystery'), { secret: true }),
  def('quirky_100', 'quirky', '記念の100回', 'チェックインを 100回する', 3, icon('star'), 100, countWhere(() => true), { secret: true }),
]

export const CATALOG: BadgeDef[] = [...genre, ...others]

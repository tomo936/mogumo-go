import type { ShopKind } from './shop.ts'

type Input = { tags: Record<string, string>; cuisines: string[]; name: string }
type Rule = [ShopKind, (i: Input) => boolean]

const cuisineIn = (i: Input, list: string[]) => i.cuisines.some((c) => list.includes(c))
const nameHas = (i: Input, words: string[]) => words.some((w) => i.name.includes(w))

// 上から順に判定して、最初に合ったものが種類になる（spec 4.4）
const rules: Rule[] = [
  ['ramen', (i) => cuisineIn(i, ['ramen']) || nameHas(i, ['ラーメン', 'らーめん', '拉麺', '中華そば'])],
  ['sushi', (i) => cuisineIn(i, ['sushi']) || nameHas(i, ['寿司', '鮨', 'すし'])],
  ['soba', (i) => cuisineIn(i, ['soba', 'udon', 'noodle']) || nameHas(i, ['そば', '蕎麦', 'うどん'])],
  ['curry', (i) => cuisineIn(i, ['curry', 'indian', 'nepalese']) || nameHas(i, ['カレー'])],
  ['yakiniku', (i) => cuisineIn(i, ['bbq', 'barbecue', 'yakiniku', 'korean'])],
  ['chinese', (i) => cuisineIn(i, ['chinese'])],
  ['western', (i) => cuisineIn(i, ['italian', 'pizza', 'french', 'western', 'steak', 'spanish'])],
  ['washoku', (i) => cuisineIn(i, ['japanese', 'tonkatsu', 'tempura', 'kaiseki', 'teishoku'])],
  ['izakaya', (i) => ['bar', 'pub'].includes(i.tags.amenity) || cuisineIn(i, ['izakaya', 'yakitori'])],
  [
    'cake',
    (i) =>
      ['confectionery', 'pastry'].includes(i.tags.shop) ||
      i.tags.amenity === 'ice_cream' ||
      cuisineIn(i, ['cake', 'dessert', 'crepe']),
  ],
  ['bakery', (i) => i.tags.shop === 'bakery'],
  ['cafe', (i) => i.tags.amenity === 'cafe'],
]

export function kindOf(tags: Record<string, string>, name: string): ShopKind {
  const cuisines = (tags.cuisine ?? '').split(';').map((c) => c.trim().toLowerCase())
  const input: Input = { tags, cuisines, name }
  return rules.find(([, test]) => test(input))?.[0] ?? 'mystery'
}

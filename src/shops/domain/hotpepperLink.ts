// ホットペッパーのお店のページ。店 ID（hp:J…）から作る。形が違う id は作らない（変な URL を開かないため）
export function hotpepperPageUrl(shopId: string): string | null {
  const m = /^hp:([A-Za-z0-9]+)$/.exec(shopId)
  return m ? `https://www.hotpepper.jp/str${m[1]}/` : null
}

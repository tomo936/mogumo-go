// チェックインの「1日」は日本時間の0時で区切る（サーバーの jstDay と同じ）
export function jstDay(d: Date): string {
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10)
}

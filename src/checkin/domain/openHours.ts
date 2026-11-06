// ホットペッパーの営業時間は区切りなしで続くことがある（例: 15:0018:00）。時刻のつなぎ目に区切りを入れる
export function formatOpen(text: string): string {
  return text.replace(/(\d{1,2}:\d{2})(?=\d{1,2}:\d{2})/g, '$1 / ').replace(/）(?=\S)/g, '） ')
}

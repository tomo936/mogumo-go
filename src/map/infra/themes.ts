import type { MapTheme } from './theme.ts'

// 世界観「明るい昼のグルメ」（青空色＋パステル、白基調）に沿った3案。標準は config.ts の MAP_THEME
export const THEMES = {
  // A: 空色パステル。白に近い地面、空色の水、淡いミントの公園
  sky: {
    ground: '#f6faff', residential: '#eef4fb', park: '#d9f1e1', wood: '#cbeacf', water: '#b9dff9', waterLine: '#9ccff3',
    building: '#e6edf6', buildingLine: '#d3deec', road: '#ffffff', roadCasing: '#cddff1', path: '#e1eaf5', rail: '#c4cfdd', majorRoad: '#ffffff', majorRoadCasing: '#b9cfe8',
    label: '#5a6b82', labelHalo: '#ffffff', showPlaceLabels: true, showRoadLabels: true,
  },
  // B: ミントとレモン。少し温かい白、黄みのある道のふち
  mint: {
    ground: '#fbfcf5', residential: '#f4f7ea', park: '#d5efc8', wood: '#c4e6b3', water: '#c3e5f6', waterLine: '#a7d6ef',
    building: '#f0eee2', buildingLine: '#e1ddcb', road: '#ffffff', roadCasing: '#e7e1bf', path: '#ebe7d1', rail: '#d2cfbf', majorRoad: '#fff8dc', majorRoadCasing: '#e3d6a4',
    label: '#66684f', labelHalo: '#ffffff', showPlaceLabels: true, showRoadLabels: true,
  },
  // C: ポップ（本人が選択 2026-11-06）。淡い草色の地面に白い道、大きい道は淡いクリーム色、地名なし・道路名なし（本人 2026-11-06）
  pop: {
    ground: '#e4f4d8', residential: '#dcefcf', park: '#c3e7ae', wood: '#b1dd98', water: '#8ccff3', waterLine: '#74c3ef',
    building: '#f8f1e4', buildingLine: '#e6d9bf', road: '#ffffff', roadCasing: '#cfe5c2', path: '#f3f8ec', rail: '#b8c6ad', majorRoad: '#fff4cf', majorRoadCasing: '#ead39a',
    label: '#4d6656', labelHalo: '#ffffff', showPlaceLabels: false, showRoadLabels: false,
  },
  // D: イラスト調（2026-11-10 オーナー: 鮮やかなイラストの色。起動画面の絵に寄せる）。ふちは濃い茶色の縁取り
  illust: {
    ground: '#fbf1d6', residential: '#f8ebcd', park: '#8fd35a', wood: '#6fc045', water: '#55bdf0', waterLine: '#2f93d1',
    building: '#ffe1bd', buildingLine: '#8a5532', road: '#fffbef', roadCasing: '#8a5532', path: '#f2d7a8', rail: '#a3876a', majorRoad: '#ffe9a3', majorRoadCasing: '#7a4526',
    label: '#6b3f26', labelHalo: '#ffffff', showPlaceLabels: false, showRoadLabels: false,
    illust: {
      buildingFills: ['#fff0dc', '#ffe6c8', '#fbdcb6', '#f4d1a6'], // クリームの濃淡（2026-11-10 オーナーが案Bを選択）
      buildingShadow: 'rgba(130, 75, 35, 0.28)',
      roadScale: 1.5,
      majorRoadScale: 1.25,
    },
  },
} satisfies Record<string, MapTheme>

export type ThemeName = keyof typeof THEMES

// 見比べ用: URL の ?theme=sky|mint|pop で色の案を選ぶ（知らない名前なら標準）
export function pickTheme(search: string, fallback: ThemeName): ThemeName {
  const name = new URLSearchParams(search).get('theme')
  return name !== null && Object.hasOwn(THEMES, name) ? (name as ThemeName) : fallback
}

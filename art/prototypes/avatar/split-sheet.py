# 3 方向が 1 枚に並んだ絵を、背景を消して 3 つに切り分ける（Blender 内の numpy で動く）。
# 使い方: blender -b -P split-sheet.py -- シート.webp 出力フォルダ接頭辞  → <接頭辞>-front/side/back-rgba.png（1024x1024）
import bpy, sys
import numpy as np
src, pre = sys.argv[sys.argv.index('--') + 1:][:2]
img = bpy.data.images.load(src)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[::-1]  # 上が先頭
rgb = (px[:, :, :3] * 255).astype(np.int16)
white = (rgb.min(2) > 225) & ((rgb.max(2) - rgb.min(2)) < 22)
bg = np.zeros_like(white); bg[0, :] = white[0, :]; bg[-1, :] = white[-1, :]; bg[:, 0] = white[:, 0]; bg[:, -1] = white[:, -1]
def grow(m, allow):
    while True:
        g = m.copy()
        g[1:, :] |= m[:-1, :]; g[:-1, :] |= m[1:, :]; g[:, 1:] |= m[:, :-1]; g[:, :-1] |= m[:, 1:]
        g &= allow
        if (g == m).all(): return m
        m = g
bg = grow(bg, white)
fg = ~bg
seeds = {'front': (700, 380), 'side': (700, 950), 'back': (700, 1500)}  # (y, x) 体のまん中
for name, (sy, sx) in seeds.items():
    m = np.zeros_like(fg); m[sy, sx] = True
    m = grow(m, fg)
    ys, xs = np.where(m)
    print(name, 'pixels', m.sum(), 'bbox x', xs.min(), xs.max(), 'y', ys.min(), ys.max())
    y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    out = px[::-1].copy()[::-1]  # 元の向き（下が先頭）に戻す用
    a = m.astype(np.float32)
    rgba = px.copy(); rgba[:, :, 3] = a
    crop = rgba[y0:y1 + 1, x0:x1 + 1]
    h, w = crop.shape[:2]
    s = int(max(h, w) * 1.15)
    canvas = np.zeros((s, s, 4), np.float32)
    canvas[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = crop
    o = bpy.data.images.new('o' + name, s, s, alpha=True)
    o.pixels = canvas[::-1].ravel()
    o.scale(1024, 1024)
    o.filepath_raw = f'{pre}-{name}-rgba.png'; o.file_format = 'PNG'; o.save()
    print('saved', o.filepath_raw)

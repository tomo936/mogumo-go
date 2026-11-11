# 参考画像の白い背景を消して、透明な 1024x1024 の PNG にする（Blender に入っている numpy だけで動く）。
# 使い方: blender -b -P prep-ref.py -- 入力.png 出力.png [shadow] [mirror]
#   shadow: 床のうすい影（明るい灰色）も背景として消す（横の絵で使う）。mirror: 左右を返す
import bpy, sys
import numpy as np
args = sys.argv[sys.argv.index('--') + 1:]
src, dst = args[:2]
SHADOW = 'shadow' in args
MIRROR = 'mirror' in args
img = bpy.data.images.load(src)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)
rgb = (px[:, :, :3] * 255).astype(np.int16)
white = (rgb.min(2) > 225) & ((rgb.max(2) - rgb.min(2)) < 22)
if SHADOW:
    white |= (rgb.min(2) > 196) & ((rgb.max(2) - rgb.min(2)) < 20)  # 床の影（明るい灰色）
# ふちから白でつながっている所が背景
bg = np.zeros_like(white)
bg[0, :] = white[0, :]; bg[-1, :] = white[-1, :]; bg[:, 0] = white[:, 0]; bg[:, -1] = white[:, -1]
while True:
    g = bg.copy()
    g[1:, :] |= bg[:-1, :]; g[:-1, :] |= bg[1:, :]; g[:, 1:] |= bg[:, :-1]; g[:, :-1] |= bg[:, 1:]
    g &= white
    if (g == bg).all():
        break
    bg = g
fg = ~bg
ys, xs = np.where(fg)
y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
print('bbox', x0, x1, y0, y1, 'of', W, H)
out = px.copy()
out[:, :, 3] = fg.astype(np.float32)
crop = out[y0:y1 + 1, x0:x1 + 1]
h, w = crop.shape[:2]
s = int(max(h, w) * 1.15)
canvas = np.zeros((s, s, 4), np.float32)
canvas[(s - h) // 2:(s - h) // 2 + h, (s - w) // 2:(s - w) // 2 + w] = crop
if MIRROR:
    canvas = canvas[:, ::-1].copy()
o = bpy.data.images.new('o', s, s, alpha=True)
o.pixels = canvas.ravel()
o.scale(1024, 1024)
o.filepath_raw = dst
o.file_format = 'PNG'
o.save()
print('saved', dst)

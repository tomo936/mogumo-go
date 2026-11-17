# 地図の上の 2D のキャラ（3D がまだ無いキャラの代わり）用に、原画の白い背景を抜いて、いちばん大きいかたまり（キャラ本体。まわりのキラキラは捨てる）だけを残す。
# 出力: src/assets/gacha/stand/NN.webp（ガチャ 30 体）・102.webp（女の子）。高さ 360px・透明つき・下の余白なし（足元＝画像の下端）
# 使い方: blender -b -P art/prototypes/gacha-stand.py -- <リポジトリの場所>
import bpy, sys, os, re
import numpy as np
root = sys.argv[sys.argv.index('--') + 1]
dst = os.path.join(root, 'src/assets/gacha/stand'); os.makedirs(dst, exist_ok=True)
jobs = []
for f in sorted(os.listdir(os.path.join(root, 'art/gacha/chars'))):
    m = re.match(r'char-(\d\d)-.*\.webp$', f)
    if m: jobs.append((os.path.join(root, 'art/gacha/chars', f), m.group(1)))
jobs.append((os.path.join(root, 'src/assets/characters/starter-girl.webp'), '102'))
sc = bpy.context.scene
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
s = sc.render.image_settings; s.file_format = 'WEBP'; s.quality = 85; s.color_mode = 'RGBA'
S = 400  # 計算は 400px に縮めて行う

def label_largest(mask):
    h, w = mask.shape; lab = np.zeros((h, w), np.int32); best, best_n, cur = 0, 0, 0
    for y0, x0 in zip(*np.nonzero(mask)):
        if lab[y0, x0]: continue
        cur += 1; stack = [(y0, x0)]; lab[y0, x0] = cur; n = 0
        while stack:
            y, x = stack.pop(); n += 1
            for yy, xx in ((y+1, x), (y-1, x), (y, x+1), (y, x-1)):
                if 0 <= yy < h and 0 <= xx < w and mask[yy, xx] and not lab[yy, xx]:
                    lab[yy, xx] = cur; stack.append((yy, xx))
        if n > best_n: best, best_n = cur, n
    return lab == best

for path, name in jobs:
    img = bpy.data.images.load(path); W, H = img.size
    px = np.array(img.pixels[:], np.float32).reshape(H, W, 4)[::-1]  # 上から下へ
    rgb = (px[:, :, :3] * 255)
    white = (rgb.min(2) > 232) & ((rgb.max(2) - rgb.min(2)) < 24)
    # 縮めて、ふちからつながる白＝背景
    k = W // S
    wsm = white[:S*k, :S*k].reshape(S, k, S, k).all(axis=(1, 3))
    bg = np.zeros_like(wsm); bg[0] = wsm[0]; bg[-1] = wsm[-1]; bg[:, 0] = wsm[:, 0]; bg[:, -1] = wsm[:, -1]
    while True:
        g = bg.copy(); g[1:] |= bg[:-1]; g[:-1] |= bg[1:]; g[:, 1:] |= bg[:, :-1]; g[:, :-1] |= bg[:, 1:]; g &= wsm
        if (g == bg).all(): break
        bg = g
    body = label_largest(~bg)
    # 中の穴（腕と胴のすき間の白）は背景として抜けている。元の大きさに戻す
    full = np.repeat(np.repeat(body, k, 0), k, 1)
    fg = np.zeros((H, W), bool); fg[:S*k, :S*k] = full
    ys, xs = np.nonzero(fg); y0, y1, x0, x1 = ys.min(), ys.max(), xs.min(), xs.max()
    crop = px[y0:y1 + 1, x0:x1 + 1].copy(); crop[:, :, 3] = fg[y0:y1 + 1, x0:x1 + 1]
    h, w = crop.shape[:2]; out_h = 360; out_w = max(1, round(w * out_h / h))
    o = bpy.data.images.new('o', w, h, alpha=True); o.pixels[:] = crop[::-1].ravel()
    o.scale(out_w, out_h)
    o.save_render(os.path.join(dst, name + '.webp'), scene=sc)
    bpy.data.images.remove(o); bpy.data.images.remove(img)
    print('ok', name, out_w, out_h)

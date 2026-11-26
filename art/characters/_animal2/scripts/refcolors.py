# 元の絵から区分けの色を測る（段 2 の塗り直しの色を決めるため）。config の repaint.ref_samples に、区分けごとに
# {"img": "ref/<名前>.png", "box": [x0, y0, x1, y1]（画像の幅・高さの割合、左上から）, "h"/"s"/"v": [下, 上]（任意）} を書く。
# 使い方: blender -b -P refcolors.py -- <config.json>   → 区分けごとの中央値の色（0〜255）を表示し、work/refcolors.json に書く
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *

out = {}
cache = {}
for name, smp in CFG['repaint']['ref_samples'].items():
    p = os.path.join(CH, smp['img'])
    if p not in cache: cache[p] = load_png(p)[::-1]          # 上の行から
    P = cache[p]; H, W = P.shape[:2]
    x0, y0, x1, y1 = smp['box']
    A = P[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W), :3].reshape(-1, 3)
    h, s, v = hsv(A); m = in_class(h, s, v, smp)
    col = np.median(A[m], 0) if m.any() else np.zeros(3)
    out[name] = dict(rgb=[int(round(c * 255)) for c in col], n=int(m.sum()))
dump(out, wpath('refcolors.json'))
print('REFCOLORS', json.dumps(out, ensure_ascii=False))

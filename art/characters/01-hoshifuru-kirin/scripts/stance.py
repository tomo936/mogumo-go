# 立ち姿の足の幅・腕の開きを、絵（または撮った画像）の影から測る（2 回目）。
# 実行: blender -b -P stance.py -- <画像>... 。白い背景か透明の背景。身長を 1 として、高さ z の行の左右の足の帯を出す
import bpy, sys, numpy as np, json
out = {}
for p in sys.argv[sys.argv.index('--') + 1:]:
    im = bpy.data.images.load(p); w, h = im.size; a = np.empty(w * h * 4, np.float32); im.pixels.foreach_get(a)
    A = a.reshape(h, w, 4)  # 下の行から
    fg = (A[:, :, 3] > 0.5) & (A[:, :, :3].min(2) < 0.88) if A[:, :, 3].min() > 0.5 else A[:, :, 3] > 0.5
    if A[:, :, 3].min() > 0.5: fg = A[:, :, :3].min(2) < 0.86
    # 小さなごみ・床の影を除く: 行ごと・列ごとに数が少ない所を落とす
    ys, xs = np.nonzero(fg); y0 = ys.min(); y1 = ys.max(); H = y1 - y0
    # 床の影（足の下の薄い灰色）は min<0.86 に入りうるので、あざやかさのない薄い所を落とす
    if A[:, :, 3].min() > 0.5:
        sat = A[:, :, :3].max(2) - A[:, :, :3].min(2); fg &= ~((sat < 0.06) & (A[:, :, :3].min(2) > 0.6))
        ys, xs = np.nonzero(fg); y0 = ys.min(); y1 = ys.max(); H = y1 - y0
    res = {'H_px': int(H)}
    cx = None
    for z in (0.02, 0.05, 0.08, 0.10, 0.12):
        r = fg[int(y0 + z * H)]
        runs = np.diff(np.concatenate([[0], r.astype(int), [0]])); st = np.nonzero(runs == 1)[0]; en = np.nonzero(runs == -1)[0]
        seg = [(s, e) for s, e in zip(st, en) if e - s > 0.01 * H]
        if len(seg) >= 2:
            seg = sorted(seg, key=lambda t: -(t[1] - t[0]))[:2]; seg.sort()
            (a0, a1), (b0, b1) = seg
            res[f'z{z:.2f}'] = dict(gap=round((b0 - a1) / H, 4), centers=round(((b0 + b1) / 2 - (a0 + a1) / 2) / H, 4), outer=round((b1 - a0) / H, 4))
        else:
            res[f'z{z:.2f}'] = dict(runs=len(seg), outer=round(((seg[-1][1] - seg[0][0]) / H) if seg else 0, 4))
    # 腕: 全体の幅が一番広い高さ（手）と、その幅
    wid = [(fg[y].nonzero()[0].ptp() if fg[y].any() else 0) for y in range(y0, y1)]
    k = int(np.argmax(wid[: int(0.6 * H)])); res['widest'] = dict(z=round(k / H, 3), width=round(wid[k] / H, 4))
    out[p.split('/')[-1]] = res
print('STANCE', json.dumps(out, ensure_ascii=False))

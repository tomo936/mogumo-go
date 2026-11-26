# 段 4: 顔（「動物の二本足」型の共通の台本。キャラ固有の数字は config.json の face）。
# 頭の前の面（頭の骨に 100%・前向き・face.box の中）だけを材質 face にし、前から平らに写した絵（4 こまを横に並べる）を貼る。
# こま 0 = 体の絵を、同じ面の同じ場所から写したもの（だから毛との境で色が変わらない）に、目（ふつう）・鼻・口を描き直したもの
#   （生成の絵の目・鼻・口は線が切れて白い点が混ざるので写さない: 箱の中を地の色でならしてから、だ円・角の丸い逆三角・ω の線で描く。2026-11-26）。
# こま 1〜3 は こま 0 から目と口だけを描き替える:
#   1 半分とじ（目の上半分を消して、まぶたの線）・2 とじ（目を消して下向きの弧）・3 うれしい（目を消して上向きの弧 ∩ ＋口を少し開ける。仮）
# 目を消すのは、目の箱のまわり 1 画素を元の色に固定して中をならす（ラプラスの式）。目・口の箱の外は 1 画素も変えない（数えて確かめる）。
# 使い方: blender -b -P stage4.py -- <config.json>   （work/stage3.blend を読む）
#   出力: work/stage4.blend・work/face4.png（4 こま）・work/stage4-log.json。PREVIEW=1 で こま 0 と目の箱だけ書いて止める
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from mathutils.bvhtree import BVHTree
from mathutils import Vector
from collections import deque

bpy.ops.wm.open_mainfile(filepath=wpath('stage3.blend'))
ob = bpy.data.objects['avatar']; me = ob.data; FC = CFG['face']; LOG = {}
X0, X1, Z0, Z1 = FC['box']; CW = FC['cell_w']; CH_ = int(round(CW * (Z1 - Z0) / (X1 - X0)))
V, _, TRI = mesh_arrays(me)
names = [g.name for g in ob.vertex_groups]; hw = np.zeros(len(V))
hi = names.index('head')
for v in me.vertices:
    for g in v.groups:
        if g.group == hi: hw[v.index] = g.weight
FN = np.cross(V[TRI[:, 1]] - V[TRI[:, 0]], V[TRI[:, 2]] - V[TRI[:, 0]]); FN /= np.maximum(np.linalg.norm(FN, axis=1, keepdims=True), 1e-12)
FCn = V[TRI].mean(1)
inbox = lambda P: (P[..., 0] > X0) & (P[..., 0] < X1) & (P[..., 2] > Z0) & (P[..., 2] < Z1)
sel = (hw[TRI] > 0.999).all(1) & (FN[:, 1] < -FC['front_dot']) & inbox(V[TRI]).all(1) & (FCn[:, 1] < 0)
LOG['faces'] = int(sel.sum())
# 体の絵と UV
timg = tex_of(ob); TW, TH = timg.size; tex = pixels(timg)[:, :, :3]
UV = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', UV); UV = UV.reshape(-1, 3, 2)
bvh = BVHTree.FromPolygons(V.tolist(), TRI.tolist())


def sample(img, uv):
    W_, H_ = img.shape[1], img.shape[0]; x = uv[0] * W_ - 0.5; y = uv[1] * H_ - 0.5
    x0 = int(math.floor(x)); y0 = int(math.floor(y)); fx = x - x0; fy = y - y0
    g = lambda yy, xx: img[min(max(yy, 0), H_ - 1), min(max(xx, 0), W_ - 1)]
    return (g(y0, x0) * (1 - fx) + g(y0, x0 + 1) * fx) * (1 - fy) + (g(y0 + 1, x0) * (1 - fx) + g(y0 + 1, x0 + 1) * fx) * fy


cell = np.zeros((CH_, CW, 3), np.float32); cover = np.zeros((CH_, CW), bool)
for r in range(CH_):
    z = Z1 - (r + 0.5) / CH_ * (Z1 - Z0)
    for c in range(CW):
        x = X0 + (c + 0.5) / CW * (X1 - X0)
        hit = bvh.ray_cast(Vector((x, -2.0, z)), Vector((0, 1, 0)))
        if hit[0] is None or not sel[hit[2]]: continue
        f = hit[2]; P = np.array(hit[0]); A, B, C = V[TRI[f]]
        v0, v1, v2 = B - A, C - A, P - A; d00 = v0 @ v0; d01 = v0 @ v1; d11 = v1 @ v1; d20 = v2 @ v0; d21 = v2 @ v1
        den = d00 * d11 - d01 * d01; w1 = (d11 * d20 - d01 * d21) / den; w2 = (d00 * d21 - d01 * d20) / den; w0 = 1 - w1 - w2
        uv = UV[f, 0] * w0 + UV[f, 1] * w1 + UV[f, 2] * w2
        cell[r, c] = sample(tex, uv); cover[r, c] = True
LOG['cover'] = round(float(cover.mean()), 3)
# 面の外（絵のすき間）は近い色でうめる（ふちへ黒がにじまないように）
cv = cover.copy()
while not cv.all():
    m_ = cv.astype(np.float32); acc = np.zeros_like(cell); cnt = np.zeros_like(m_)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        acc += np.roll(np.roll(cell * m_[:, :, None], dy, 0), dx, 1); cnt += np.roll(np.roll(m_, dy, 0), dx, 1)
    gr = (~cv) & (cnt > 0); cell[gr] = acc[gr] / cnt[gr][:, None]; cv |= gr
yy, xx = np.mgrid[0:CH_, 0:CW]
def to_px(x, z): return ((x - X0) / (X1 - X0) * CW, (Z1 - z) / (Z1 - Z0) * CH_)


def blobs(mask):
    lab = np.zeros(mask.shape, int); out = []
    for sy, sx in zip(*np.nonzero(mask)):
        if lab[sy, sx]: continue
        q = deque([(sy, sx)]); lab[sy, sx] = len(out) + 1; pts = []
        while q:
            a_, b_ = q.popleft(); pts.append((a_, b_))
            for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c_, d_ = a_ + da, b_ + db
                if 0 <= c_ < mask.shape[0] and 0 <= d_ < mask.shape[1] and mask[c_, d_] and not lab[c_, d_]:
                    lab[c_, d_] = len(out) + 1; q.append((c_, d_))
        out.append(np.array(pts))
    return sorted(out, key=len, reverse=True)


ink = np.array(CFG['repaint']['colors']['eyes'], np.float32) / 255
dist = np.linalg.norm(cell - ink, axis=2)
ex0, ex1 = to_px(FC['eye_x'][0], 0)[0], to_px(FC['eye_x'][1], 0)[0]; ez1, ez0 = to_px(0, FC['eye_z'][0])[1], to_px(0, FC['eye_z'][1])[1]
EB = []
for sg in (-1, 1):   # 画像の左 = キャラの右（x が小さい方）
    xa, xb = (CW / 2 - (ex1 - CW / 2), CW / 2 - (ex0 - CW / 2)) if sg < 0 else (ex0, ex1)
    zone = (xx > xa) & (xx < xb) & (yy > ez0) & (yy < ez1)
    b = blobs((dist < FC['eye_t']) & zone)[0]
    EB.append([int(b[:, 0].min()), int(b[:, 1].min()), int(b[:, 0].max()), int(b[:, 1].max())])
LOG['eyes'] = EB
if os.environ.get('PREVIEW'):
    pv = cell.copy()
    for r0, c0, r1, c1 in EB: pv[r0, c0:c1 + 1] = pv[r1, c0:c1 + 1] = pv[r0:r1 + 1, c0] = pv[r0:r1 + 1, c1] = (1, 0, 0)
    im = bpy.data.images.new('pv', CW, CH_, alpha=False); im.pixels.foreach_set(np.dstack([pv, np.ones((CH_, CW))])[::-1].astype(np.float32).ravel())
    im.filepath_raw = wpath('face-cell0.png'); im.file_format = 'PNG'; im.save()
    print('STAGE4PV', json.dumps(LOG)); sys.exit(0)


def erase(img, box, pad):
    r0, c0, r1, c1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
    R = img[r0 - 1:r1 + 2, c0 - 1:c1 + 2].copy()
    t = np.linspace(0, 1, R.shape[0])[:, None, None]; R[1:-1, 1:-1] = (R[0:1] * (1 - t) + R[-1:] * t)[1:-1, 1:-1]
    for _ in range(3000): R[1:-1, 1:-1] = (R[:-2, 1:-1] + R[2:, 1:-1] + R[1:-1, :-2] + R[1:-1, 2:]) / 4
    out = img.copy(); out[r0:r1 + 1, c0:c1 + 1] = R[1:-1, 1:-1]; return out


def stroke(img, pts, th, col):
    pts = np.array(pts, np.float64); r0 = int(pts[:, 0].min() - th - 2); r1 = int(pts[:, 0].max() + th + 3)
    c0 = int(pts[:, 1].min() - th - 2); c1 = int(pts[:, 1].max() + th + 3)
    Y, X = np.mgrid[r0:r1, c0:c1] + 0.5; d = np.full(Y.shape, 1e9)
    for (ya, xa), (yb, xb) in zip(pts[:-1], pts[1:]):
        vx, vy = xb - xa, yb - ya; L2 = vx * vx + vy * vy
        t_ = np.clip(((X - xa) * vx + (Y - ya) * vy) / max(L2, 1e-9), 0, 1)
        d = np.minimum(d, np.hypot(X - xa - t_ * vx, Y - ya - t_ * vy))
    a = np.clip(th / 2 - d + 0.5, 0, 1)[:, :, None]; out = img.copy()
    out[r0:r1, c0:c1] = out[r0:r1, c0:c1] * (1 - a) + col * a; return out


def arc(box, yfrac, hfrac, up):
    r0, c0, r1, c1 = box; h, w = r1 - r0, c1 - c0
    xs = np.linspace(c0 + w * 0.08, c1 - w * 0.08, 24); sn = np.sin(np.pi * (xs - xs[0]) / (xs[-1] - xs[0]))
    ys = r0 + h * yfrac + (-1 if up else 1) * h * hfrac * sn
    return list(zip(ys, xs))


PAD = FC['erase_pad']; th = max(2.5, (EB[0][2] - EB[0][0]) * FC['line_w'])
nose_c = np.array(CFG['repaint']['colors']['nose'], np.float32) / 255
# 鼻と口の箱: 暗いところを少し太らせて（生成の絵の切れ目をつなぐ）かたまりにし、上 = 鼻・下 = 口
mx0, mx1 = to_px(-FC['mouth_x'], 0)[0], to_px(FC['mouth_x'], 0)[0]; nz0 = to_px(0, FC['nose_z'])[1]; mz1 = to_px(0, FC['mouth_z'][0])[1]
dark = (np.linalg.norm(cell - nose_c, axis=2) < FC['mouth_t']) & (xx > mx0) & (xx < mx1) & (yy > nz0) & (yy < mz1)
R_ = FC['join_px']; fat = dark.copy()
for dy in range(-R_, R_ + 1):
    for dx in range(-R_, R_ + 1):
        if dy * dy + dx * dx <= R_ * R_: fat |= np.roll(np.roll(dark, dy, 0), dx, 1)
bl = sorted([b for b in blobs(fat) if (dark[b[:, 0], b[:, 1]]).sum() > 30], key=lambda b: b[:, 0].mean())
def bbox(b):
    b = b[dark[b[:, 0], b[:, 1]]]; return [int(b[:, 0].min()), int(b[:, 1].min()), int(b[:, 0].max()), int(b[:, 1].max())]
NB, MB = bbox(bl[0]), bbox(bl[-1]); NB[0] = min(NB[0], int(NB[2] + 1 - (NB[3] - NB[1] + 1) * FC['nose_hw'])); LOG['nose'] = NB; LOG['mouth'] = MB; LOG['nose_mouth_blobs'] = len(bl)   # 鼻の箱の上は描く鼻の高さまで広げる


def fill(img, cov, col):
    return img * (1 - cov[:, :, None]) + col * cov[:, :, None]


def ellipse(cy, cx, ay, ax):
    e = np.sqrt(((xx + 0.5 - cx) / ax) ** 2 + ((yy + 0.5 - cy) / ay) ** 2); return np.clip((1 - e) * min(ax, ay) + 0.5, 0, 1)


def seg_d(P, A, B):
    v = B - A; t_ = np.clip(((P[..., 0] - A[0]) * v[0] + (P[..., 1] - A[1]) * v[1]) / (v @ v), 0, 1)
    return np.hypot(P[..., 0] - A[0] - t_ * v[0], P[..., 1] - A[1] - t_ * v[1])


def round_tri(T, r):
    """角の丸い三角（T: 3 点 (行, 列)、r: 角の丸みの半径）。内心へ縮めた三角から r の距離までを塗る"""
    T = np.array(T, np.float64); L = np.array([np.linalg.norm(T[(i + 1) % 3] - T[(i + 2) % 3]) for i in range(3)])
    I = (L[:, None] * T).sum(0) / L.sum(); s_ = L.sum() / 2; area = abs(np.cross(T[1] - T[0], T[2] - T[0])) / 2; rho = area / s_
    Ti = I + (T - I) * max(rho - r, 0.5) / rho
    P = np.dstack([yy + 0.5, xx + 0.5]); d = np.minimum(np.minimum(seg_d(P, Ti[0], Ti[1]), seg_d(P, Ti[1], Ti[2])), seg_d(P, Ti[2], Ti[0]))
    sg = [np.sign((Ti[(i + 1) % 3][1] - Ti[i][1]) * (P[..., 0] - Ti[i][0]) - (Ti[(i + 1) % 3][0] - Ti[i][0]) * (P[..., 1] - Ti[i][1])) for i in range(3)]
    ins = ((sg[0] >= 0) & (sg[1] >= 0) & (sg[2] >= 0)) | ((sg[0] <= 0) & (sg[1] <= 0) & (sg[2] <= 0))
    d = np.where(ins, 0, d); return np.clip(r - d + 0.5, 0, 1)


# 地: 目・鼻・口の跡を消す（箱のまわりの色から中をならす）
bare = cell
for b in EB: bare = erase(bare, b, PAD)
bare = erase(bare, [min(NB[0], MB[0]), min(NB[1], MB[1]), max(NB[2], MB[2]), max(NB[3], MB[3])], PAD)
# 鼻（角の丸い逆三角）と口（ω の滑らかな線）を描く。どのこまも同じ
nw = NB[3] - NB[1] + 1; nh = nw * FC['nose_hw']; nb_ = NB[2] + 1; ncx = (NB[1] + NB[3] + 1) / 2   # 鼻の上は生成の絵で明るい帯に切られるので、高さは幅から（nose_hw）
face = fill(bare, round_tri([(nb_ - nh, ncx - nw / 2), (nb_ - nh, ncx + nw / 2), (nb_, ncx)], nh * FC['nose_round']), nose_c)
mh_, mw_ = MB[2] - MB[0] + 1, MB[3] - MB[1] + 1; tm = th * FC['mouth_w']
us = np.linspace(0, 1, 49); mxs = MB[1] + tm / 2 + (mw_ - tm) * us; mys = MB[0] + tm / 2 + (mh_ - tm) * np.abs(np.sin(2 * np.pi * us))
face = stroke(face, list(zip(mys, mxs)), tm, nose_c)
# 目（ふつう）: こげ茶のだ円＋白い丸の光（config face.shine = [右へ, 下へ, 半径]、目の幅に対する割合。両目で同じ向き）
shine_c = np.array(CFG['repaint']['colors']['shine'], np.float32) / 255
cell0 = face.copy()
for r0, c0, r1, c1 in EB:
    ay, ax = (r1 - r0 + 1) / 2, (c1 - c0 + 1) / 2; cy, cx = r0 + ay, c0 + ax
    cell0 = fill(cell0, ellipse(cy, cx, ay, ax), ink)
    for dx_, dy_, rr in FC['shine']:
        cell0 = fill(cell0, ellipse(cy + dy_ * 2 * ax, cx + dx_ * 2 * ax, rr * 2 * ax, rr * 2 * ax), shine_c)
# 1 半分とじ: 目の下半分だけ残して、切り口にまぶたの線
half = face.copy()
for r0, c0, r1, c1 in EB:
    mid = int(r0 + (r1 - r0) * FC['half_cut']); half[mid:r1 + PAD + 1, c0 - PAD:c1 + PAD + 1] = cell0[mid:r1 + PAD + 1, c0 - PAD:c1 + PAD + 1]
    half = stroke(half, arc((r0, c0, r1, c1), FC['half_cut'], 0.06, True), th, ink)
# 2 とじ: 下向きの弧
closed = face.copy()
for b in EB: closed = stroke(closed, arc(b, FC['closed_y'], FC['closed_h'], False), th, ink)
# 3 うれしい: 上向きの弧 ∩ ＋口を少し開ける（仮）
happy = face.copy()
for b in EB: happy = stroke(happy, arc(b, FC['happy_y'], FC['happy_h'], True), th * 1.15, ink)
mcx = (MB[1] + MB[3]) / 2; mw = (MB[3] - MB[1]) * FC['open_w']; mtop = MB[0] + (MB[2] - MB[0]) * FC['open_top']; mh = mw * FC['open_h']
e = ((xx + 0.5 - mcx) / (mw / 2)) ** 2 + ((yy + 0.5 - mtop) / mh) ** 2
inside = np.clip((1 - e) * mh / 2, 0, 1) * (yy + 0.5 >= mtop)
tongue = np.array(FC['tongue'], np.float32) / 255
et = ((xx + 0.5 - mcx) / (mw * 0.3)) ** 2 + ((yy + 0.5 - (mtop + mh)) / (mh * 0.55)) ** 2
mcol = np.where((et < 1)[:, :, None], tongue, nose_c)
happy = happy * (1 - inside[:, :, None]) + mcol * inside[:, :, None]
OPEN = [int(mtop) - 1, int(mcx - mw / 2) - 1, int(mtop + mh) + 2, int(mcx + mw / 2) + 2]; LOG['mouth_open'] = OPEN
# 目・口の箱の外が こま 0 と同じか（1 画素も違わない）
keep = np.ones((CH_, CW), bool)
for r0, c0, r1, c1 in EB: keep[r0 - PAD - 1:r1 + PAD + 2, c0 - PAD - 1:c1 + PAD + 2] = False
keep3 = keep.copy(); keep3[OPEN[0]:OPEN[2] + 1, OPEN[1]:OPEN[3] + 1] = False
for i, (img, k) in enumerate(((half, keep), (closed, keep), (happy, keep3)), 1):
    LOG[f'cell{i}_changed_outside'] = int((np.abs(img - cell0).max(2)[k] > 0).sum())
keep0 = keep.copy(); nm = [min(NB[0], MB[0]), min(NB[1], MB[1]), max(NB[2], MB[2]), max(NB[3], MB[3])]
keep0[nm[0] - PAD - 1:nm[2] + PAD + 2, nm[1] - PAD - 1:nm[3] + PAD + 2] = False
LOG['cell0_changed_outside_vs_body'] = int((np.abs(cell0 - cell).max(2)[keep0] > 0).sum())
atlas = np.clip(np.concatenate([cell0, half, closed, happy], 1), 0, 1)
aimg = bpy.data.images.new('face4', CW * 4, CH_, alpha=False)
aimg.pixels.foreach_set(np.dstack([atlas, np.ones((CH_, CW * 4))])[::-1].astype(np.float32).ravel())
aimg.filepath_raw = wpath('face4.png'); aimg.file_format = 'PNG'; aimg.save(); aimg.pack()
fmat = bpy.data.materials.new('face'); fmat.use_nodes = True
bsdf = fmat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.9
tn = fmat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = aimg; tn.interpolation = 'Linear'; tn.extension = 'EXTEND'
fmat.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
me.materials.append(fmat); fi = len(me.materials) - 1
uvd = me.uv_layers.active.data
for f in np.nonzero(sel)[0]:
    p = me.polygons[int(f)]; p.material_index = fi
    for li in p.loop_indices:
        co = me.vertices[me.loops[li].vertex_index].co
        uvd[li].uv = (((co.x - X0) / (X1 - X0)) / 4, (co.z - Z0) / (Z1 - Z0))
save('stage4.blend')
dump(LOG, wpath('stage4-log.json'))
print('STAGE4', json.dumps(LOG))

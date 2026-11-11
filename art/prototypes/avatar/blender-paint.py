# AI が作った形（色なし）を軽くして、参考画像（正面）の色を貼り付けた色の絵を作る。
# 使い方: blender -b -P blender-paint.py -- 形.glb AIの色付き.glb 正面の透明PNG(1024) 出力.blend 出力の絵.png 参考画像のフォルダ(side-stand.png・back.png) [三角形の目安] [絵の一辺]
# - 正面から見える所: 参考画像の色をそのまま（顔・パーカーのひも・ポケットなど）
# - 正面から見えない所: AI の色で「髪・肌・青・ピンク…」の区分けだけを借り、色そのものは参考画像から取った代表の色にする
import bpy, sys, bmesh, math
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index('--') + 1:]
shape_glb, ai_glb, front_png, out_blend, out_png, ref_dir = a[:6]
TARGET = int(a[6]) if len(a) > 6 else 14000
TEX = int(a[7]) if len(a) > 7 else 1024
bpy.ops.wm.read_factory_settings(use_empty=True)


def load(path):
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    objs = [o for o in bpy.context.scene.objects if o not in before and o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def normalize(o, ref=None):
    co = np.array([v.co[:] for v in o.data.vertices])
    mn, mx = (co.min(0), co.max(0)) if ref is None else ref
    s = 1 / (mx[2] - mn[2])
    c = (mn + mx) / 2
    for v in o.data.vertices:
        v.co = Vector(((v.co.x - c[0]) * s, (v.co.y - c[1]) * s, (v.co.z - mn[2]) * s))
    return mn, mx


# ---- AI の色付き（区分けを借りるだけ）----
ai = load(ai_glb)
box = normalize(ai)
aimg = next(i for i in bpy.data.images if i.size[0] > 0)
AW, AH = aimg.size
apx = np.array(aimg.pixels[:], dtype=np.float32).reshape(AH, AW, 4)[:, :, :3]
auv = ai.data.uv_layers.active.data
ai_col = np.zeros((len(ai.data.vertices), 3), np.float32)
for l in ai.data.loops:
    u, v = auv[l.index].uv
    ai_col[l.vertex_index] = apx[min(AH - 1, int((v % 1) * AH)), min(AW - 1, int((u % 1) * AW))]
ai_kd = kdtree.KDTree(len(ai.data.vertices))
for i, v in enumerate(ai.data.vertices):
    ai_kd.insert(v.co, i)
ai_kd.balance()
bpy.data.objects.remove(ai)

# ---- 形: 小さなかけらを消す → 少しならす → 軽くする ----
o = load(shape_glb)
normalize(o, box)
me = o.data
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, isl = [v], []
    seen.add(v.index)
    while stack:
        w = stack.pop()
        isl.append(w)
        for e in w.link_edges:
            u = e.other_vert(w)
            if u.index not in seen:
                seen.add(u.index)
                stack.append(u)
    islands.append(isl)
islands.sort(key=len, reverse=True)
print('islands', [len(i) for i in islands[:6]])
bmesh.ops.delete(bm, geom=[v for isl in islands[1:] for v in isl], context='VERTS')
# AI のリュックは使わない: 背中の面（少しかたむいた平面）より後ろを切り取り、切り口をふさぐ。新しいリュックは別の部品で作る
CUT_CO = Vector((0, 0.078, 0.20))
CUT_NO = Vector((0, 1, -0.115)).normalized()
Z0, Z1 = 0.185, 0.545
bm.faces.ensure_lookup_table()
sub_f = [f for f in bm.faces if all(Z0 < v.co.z < Z1 for v in f.verts)]
geom = list({v for f in sub_f for v in f.verts}) + list({e for f in sub_f for e in f.edges}) + sub_f
bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=CUT_CO, plane_no=CUT_NO, clear_outer=True, clear_inner=False)
# 取り残し（切る範囲の上下にはみ出ていたリュックの面）も消す
left = [v for v in bm.verts if 0.15 < v.co.z < 0.58 and (v.co - CUT_CO).dot(CUT_NO) > 0.012 and abs(v.co.x) < 0.2 and v.co.z < 0.56]
bmesh.ops.delete(bm, geom=left, context='VERTS')
edges = [e for e in bm.edges if e.is_boundary]
print('cut: open edges', len(edges))
bmesh.ops.holes_fill(bm, edges=edges, sides=0)
bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
print('after fill: open edges', sum(1 for e in bm.edges if e.is_boundary))
bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
bm.to_mesh(me)
bm.free()
bpy.context.view_layer.objects.active = o
m = o.modifiers.new('d', 'DECIMATE')
m.ratio = min(1.0, TARGET / len(me.polygons))
bpy.ops.object.modifier_apply(modifier='d')
for p in me.polygons:
    p.use_smooth = True
print('tris', len(me.polygons), 'verts', len(me.vertices))

# ---- 展開（色の絵のどこに、形のどの面を置くか）----
bpy.ops.object.mode_set(mode='EDIT')
bpy.ops.mesh.select_all(action='SELECT')
bpy.ops.uv.smart_project(angle_limit=math.radians(85), island_margin=0.006)
bpy.ops.object.mode_set(mode='OBJECT')
me.calc_loop_triangles()
uvd = me.uv_layers.active.data

# ---- 絵の 1 点ごとに、形の上の場所と向きを求める ----
P = np.zeros((TEX, TEX, 3), np.float32)
N = np.zeros((TEX, TEX, 3), np.float32)
M = np.zeros((TEX, TEX), bool)
for t in me.loop_triangles:
    uv = np.array([uvd[l].uv[:] for l in t.loops]) * TEX
    p3 = np.array([me.vertices[v].co[:] for v in t.vertices])
    n3 = np.array([me.vertices[v].normal[:] for v in t.vertices])
    x0, y0 = np.floor(uv.min(0)).astype(int) - 1
    x1, y1 = np.ceil(uv.max(0)).astype(int) + 1
    x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, TEX - 1), min(y1, TEX - 1)
    if x1 < x0 or y1 < y0:
        continue
    xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
    d = (uv[1, 1] - uv[2, 1]) * (uv[0, 0] - uv[2, 0]) + (uv[2, 0] - uv[1, 0]) * (uv[0, 1] - uv[2, 1])
    if abs(d) < 1e-9:
        continue
    w0 = ((uv[1, 1] - uv[2, 1]) * (xs - uv[2, 0]) + (uv[2, 0] - uv[1, 0]) * (ys - uv[2, 1])) / d
    w1 = ((uv[2, 1] - uv[0, 1]) * (xs - uv[2, 0]) + (uv[0, 0] - uv[2, 0]) * (ys - uv[2, 1])) / d
    w2 = 1 - w0 - w1
    e = -0.6 / max(1.0, math.sqrt(abs(d)))  # ふちを少しはみ出して塗る（つなぎ目のすき間を防ぐ）
    inside = (w0 >= e) & (w1 >= e) & (w2 >= e)
    if not inside.any():
        continue
    yy, xx = np.nonzero(inside)
    W = np.stack([w0[inside], w1[inside], w2[inside]], 1)
    P[yy + y0, xx + x0] = W @ p3
    N[yy + y0, xx + x0] = W @ n3
    M[yy + y0, xx + x0] = True
print('texels', int(M.sum()))

# ---- 正面の参考画像を貼る（かくれている所・横を向いた面は使わない）----
fimg = bpy.data.images.load(front_png)
FW, FH = fimg.size
fpx = np.array(fimg.pixels[:], dtype=np.float32).reshape(FH, FW, 4)
PXU = FH / 1.15  # 高さ 1 が何 px か（下ごしらえで、キャラを枠の 1/1.15 に収めている）
bvh = BVHTree.FromObject(o, bpy.context.evaluated_depsgraph_get())
ys, xs = np.nonzero(M)
Pn = P[ys, xs]
Nn = N[ys, xs]
Nn /= np.maximum(np.linalg.norm(Nn, axis=1, keepdims=True), 1e-6)
fu = FW / 2 + Pn[:, 0] * PXU
fv = (FH - PXU) / 2 + Pn[:, 2] * PXU
iu = np.clip(fu.astype(int), 0, FW - 1)
iv = np.clip(fv.astype(int), 0, FH - 1)
# なめらかに読む（2x2 の平均）
samp = (fpx[iv, iu] + fpx[np.clip(iv + 1, 0, FH - 1), iu] + fpx[iv, np.clip(iu + 1, 0, FW - 1)] + fpx[np.clip(iv + 1, 0, FH - 1), np.clip(iu + 1, 0, FW - 1)]) / 4
facing = -Nn[:, 1]  # 正面（-Y）を向いているほど 1
vis = np.zeros(len(Pn), bool)
front = np.nonzero(facing > 0.12)[0]
dirv = Vector((0, -1, 0))
for i in front:
    p = Vector(Pn[i]) + Vector(Nn[i]) * 0.004
    if bvh.ray_cast(p, dirv)[0] is None:
        vis[i] = True
wf = np.clip((facing - 0.3) / 0.3, 0, 1) * vis * (samp[:, 3] > 0.98) * ~((samp[:, :3].min(1) > 0.9) & ((samp[:, :3].max(1) - samp[:, :3].min(1)) < 0.07))
print('front-painted texels', int((wf > 0).sum()))

# ---- 見えない所: AI の色で「髪・肌・ピンク・青」に区分けして、参考画像から取った代表の色を入れる ----
def classify(c):  # c: (n,3) の AI の色 → 0 髪 / 1 肌 / 2 ピンク / 3 青
    r, g, b_ = c[:, 0], c[:, 1], c[:, 2]
    out = np.full(len(c), 0)
    out[(b_ > r + 0.08)] = 3
    warm = ~(b_ > r + 0.08)
    out[warm & (r > 0.55) & (r - g > 0.27)] = 2
    out[warm & (r > 0.6) & (r - g <= 0.27)] = 1
    return out
ai_cls = classify(ai_col)
# まわり（半径 2.5cm）の多数決で決める（AI の色の細かいごみ・ごま塩を消す）
NC = 4
lab = np.zeros(len(Pn), int)
sure = np.zeros(len(Pn), np.float32)  # まわりのうち、同じ区分けだった割合
for i, p in enumerate(Pn):
    near = ai_kd.find_range(Vector(p), 0.011 if p[2] > 0.57 else 0.025)
    if near:
        bc = np.bincount([ai_cls[j] for (_, j, _) in near], minlength=NC)
        lab[i] = bc.argmax()
        sure[i] = bc.max() / bc.sum()
    else:
        lab[i] = ai_cls[ai_kd.find(Vector(p))[1]]
# 場所の決まり: 髪は首より上だけ。首より下の暗い色（AI の影）は服。首より上の青・ピンクは髪（AI の色のごみ）。切り口（背中）はパーカー
z = Pn[:, 2]
lab = np.where((lab == 0) & (z < 0.53), 3, lab)
lab = np.where(((lab == 3) | (lab == 2)) & (z > 0.62), 0, lab)
lab = np.where((lab == 2) & ((z < 0.13) | ((np.abs(Pn[:, 0]) > 0.17) & (z < 0.3))), 1, lab)  # ひざ下と手の赤みは肌
on_cut = (np.abs((Pn - np.array(CUT_CO)) @ np.array(CUT_NO)) < 0.004) & (z > Z0) & (z < Z1) & (Nn @ np.array(CUT_NO) > 0.7)
lab = np.where(on_cut, 3, lab)
# 背中側に残った AI のリュックのピンクは服の色にする（新しいリュックは別の部品）
lab = np.where((lab == 2) & (Pn[:, 1] > -0.02) & (z > 0.15) & (z < 0.57), 3, lab)
# 青は高さで 3 つに分ける（パーカー・短パン・くつ）。くつは高さで決め、ひざ下の暗い所は肌にする
zone = np.where(z > 0.25, 0, np.where(z > 0.075, 1, 2))
lab = np.where(lab == 3, 3 + zone, lab)
lab = np.where(z < 0.068, 5, lab)
# 首より下は、正面の参考画像の同じ場所（左右・高さ）の色の区分けを、奥まで同じとみなす（手の甲・ひざの裏・服の後ろ）
def ref_class(c):  # 参考画像の色 → 0 髪 / 1 肌 / 2 ピンク / 3 青 / -1 分からない
    r, g, b_ = c[:, 0], c[:, 1], c[:, 2]
    out = np.full(len(c), -1)
    out[(b_ > r + 0.1)] = 3
    warm = (r > b_ + 0.1) & (r >= g)
    out[warm & (g <= 0.5)] = 0
    out[warm & (g > 0.5) & (r > 0.7) & (r - g < 0.26) & (b_ < g + 0.02)] = 1
    out[(r > 0.7) & (r - g > 0.2) & (b_ >= g - 0.03) & (b_ < r)] = 2
    return out
fcls = ref_class(samp[:, :3])
fcls = np.where(samp[:, 3] > 0.98, fcls, -1)
ext = (z < 0.53) & ~on_cut & ((fcls == 1) | (fcls == 3))
lab = np.where(ext & (fcls == 1), 1, lab)
lab = np.where(ext & (fcls == 3), 3 + zone, lab)
names = ['hair', 'skin', 'pink', 'hoodie', 'shorts', 'shoes']
strong = wf > 0.9
rep = np.zeros((6, 3), np.float32)
for k in range(6):
    sel = strong & (lab == k)
    rep[k] = np.median(samp[sel][:, :3], axis=0) if sel.sum() > 100 else (0.5, 0.5, 0.5)
    print('class', names[k], 'ref', np.round(rep[k], 2), 'n', int((lab == k).sum()), 'front n', int(sel.sum()))
def load_top(name):
    im = bpy.data.images.load(f'{ref_dir}/{name}.png')
    w, h = im.size
    return np.array(im.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3].copy()


def ink_of(px):  # キャラの部分（白い背景と、床のうすい影をのぞく）
    return ~((px.min(2) > 0.80) & ((px.max(2) - px.min(2)) < 0.10))


def read_class(px, u, v):
    iu = np.clip(u.astype(int), 0, px.shape[1] - 1)
    iv = np.clip(v.astype(int), 0, px.shape[0] - 1)
    rc = ref_class(px[iv, iu])
    return np.where(ink_of(px)[iv, iu], rc, -1)


bk = load_top('back')
ys_, xs_ = np.nonzero(ink_of(bk))
bt, bb, bcx = ys_.min(), ys_.max(), (xs_.min() + xs_.max()) / 2
bu, bv = bcx - Pn[:, 0] * (bb - bt), bb - z * (bb - bt)
sd = load_top('side-stand')
si = ink_of(sd)
ys_, xs_ = np.nonzero(si)
st, sb = ys_.min(), ys_.max()
spx = sb - st
rows = si[int(sb - 0.70 * spx):int(sb - 0.60 * spx)]
cols = np.nonzero(rows.any(0))[0]
V_ = np.array([v.co[:] for v in me.vertices])
hv = V_[(V_[:, 2] > 0.60) & (V_[:, 2] < 0.70)]
sc_ = cols.max() + hv[:, 1].min() * spx  # 絵の右はし（顔の前）＝ 形のいちばん前
su, sv = sc_ - Pn[:, 1] * spx, sb - z * spx
head = z > 0.6
rs = read_class(sd, su, sv)
rb = read_class(bk, bu, bv)
side_face = head & (np.abs(Nn[:, 0]) > 0.55) & (wf < 0.5) & (rs >= 0) & (rs <= 2)
lab = np.where(side_face, np.where(rs == 0, 0, 1), lab)
back_face = head & (Nn[:, 1] > 0.55) & (wf < 0.5) & (rb >= 0) & (rb <= 2) & ~side_face
lab = np.where(back_face, np.where(rb == 0, 0, 1), lab)
print('head class from side', int(side_face.sum()), 'from back', int(back_face.sum()))
base = rep[lab]
broad = np.where(lab >= 3, 3, lab)


def project(px, u, v, facing, direction, lo=0.25, span=0.35):
    """u, v（上が 0 の px）で色を読み、向き・かくれ・色の区分けが合う所だけ重みを付ける。"""
    H_, W_ = px.shape[:2]
    iu = np.clip(u.astype(int), 0, W_ - 2)
    iv = np.clip(v.astype(int), 0, H_ - 2)
    c = (px[iv, iu] + px[iv + 1, iu] + px[iv, iu + 1] + px[iv + 1, iu + 1]) / 4
    rc = ref_class(c)
    # 首より下は、色の区分けが合う所だけ。頭は「髪か肌」ならその色を信じる（耳・ほお・えりあしの境目は、参考画像のほうが正しい）
    ok = ink_of(px)[iv, iu] & (z > 0.585) & (rc == 0) & (broad == 0) & (wf < 0.99)
    w = np.zeros(len(u), np.float32)
    d = Vector(direction)
    for i in np.nonzero(ok & (facing > lo))[0]:
        if bvh.ray_cast(Vector(Pn[i]) + Vector(Nn[i]) * 0.004, d)[0] is None:
            w[i] = min(1.0, (facing[i] - lo) / span)
    return c, w


cb, wb = project(bk, bu, bv, Nn[:, 1], (0, 1, 0))
cs1, ws1 = project(sd, su, sv, -Nn[:, 0], (-1, 0, 0))
cs2, ws2 = project(sd, su, sv, Nn[:, 0], (1, 0, 0))
print('back-painted', int((wb > 0).sum()), 'side-painted', int((ws1 > 0).sum()), int((ws2 > 0).sum()))
wf_front = wf.copy()
rest = 1 - wf
wsum = wb + ws1 + ws2
k = np.where(wsum > 1, 1 / np.maximum(wsum, 1e-6), 1.0)
wb, ws1, ws2 = wb * k * rest, ws1 * k * rest, ws2 * k * rest
col = samp[:, :3] * wf[:, None] + cb * wb[:, None] + cs1 * ws1[:, None] + cs2 * ws2[:, None] + base * (rest - wb - ws1 - ws2)[:, None]
wf = np.clip(wf + wb + ws1 + ws2, 0, 1)  # ここから下の wf は「参考画像から貼れた割合」

def island_blur(img, n):  # 絵の中の「形がある所」だけで平均する
    A = M.astype(np.float32)
    B = img.copy()
    for _ in range(n):
        s_ = np.zeros_like(B)
        c_ = np.zeros_like(A)
        for dy, dx in ((0, 0), (0, 1), (0, -1), (1, 0), (-1, 0)):
            s_ += np.roll(B * (A[:, :, None] if B.ndim == 3 else A), (dy, dx), (0, 1))
            c_ += np.roll(A, (dy, dx), (0, 1))
        cc = c_[:, :, None] if B.ndim == 3 else c_
        B = np.where(cc > 0, s_ / np.maximum(cc, 1e-6), B)
    return B


Tb = np.zeros((TEX, TEX, 3), np.float32)
Tb[ys, xs] = base
Tb = island_blur(Tb, 8)
hairm = np.zeros((TEX, TEX), bool)
hairm[ys, xs] = lab == 0
known = np.zeros((TEX, TEX), bool)
known[ys, xs] = (lab == 0) & (wf > 0.6)
Kc = np.zeros((TEX, TEX, 3), np.float32)
Kc[ys, xs] = np.where(((lab == 0) & (wf > 0.6))[:, None], (col - base * (1 - wf)[:, None]) / np.maximum(wf, 1e-4)[:, None], 0)
grown = known.copy()
for _ in range(120):
    s_ = np.zeros_like(Kc)
    c_ = np.zeros((TEX, TEX), np.float32)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        s_ += np.roll(Kc * grown[:, :, None], (dy, dx), (0, 1))
        c_ += np.roll(grown.astype(np.float32), (dy, dx), (0, 1))
    new_ = hairm & ~grown & (c_ > 0)
    if not new_.any():
        break
    Kc[new_] = s_[new_] / c_[new_][:, None]
    grown |= new_
filled_hair = grown & ~known
print('hair filled from neighbours', int(filled_hair.sum()), 'left flat', int((hairm & ~grown).sum()))
Ks = Kc.copy()
for _ in range(6):  # 広げた所だけ、ならす
    Ks = np.where(filled_hair[:, :, None], (Ks + np.roll(Ks, 1, 0) + np.roll(Ks, -1, 0) + np.roll(Ks, 1, 1) + np.roll(Ks, -1, 1)) / 5, Kc)
Tb = np.where(filled_hair[:, :, None], Ks, Tb)
Tp = np.zeros((TEX, TEX, 3), np.float32)
Tp[ys, xs] = (col - base * (1 - wf)[:, None]) / np.maximum(wf, 1e-4)[:, None]
Wm = np.zeros((TEX, TEX), np.float32)
Wm[ys, xs] = wf
Ws = np.minimum(Wm, island_blur(Wm, 3))  # 重みは、ふちで少しずつ下げる（広げはしない）
T = np.zeros((TEX, TEX, 4), np.float32)
T[:, :, :3] = np.where(M[:, :, None], Tp * Ws[:, :, None] + Tb * (1 - Ws[:, :, None]), 0)
# 正面から貼った所（顔・服の細部）以外は、最後に少しだけならす（髪の細かい黒い点・境目のがたつきを消す）
Fw = np.zeros((TEX, TEX), np.float32)
Fw[ys, xs] = wf_front
T[:, :, :3] = np.where((Fw > 0.8)[:, :, None], T[:, :, :3], island_blur(T[:, :, :3], 2))
# 島のふちの外へ色を広げる（小さく表示したときに、すき間から黒や白がにじまないように）
filled = M.copy()
for _ in range(12):
    s = np.zeros((TEX, TEX, 3), np.float32)
    c = np.zeros((TEX, TEX), np.float32)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
        s += np.roll(T[:, :, :3] * filled[:, :, None], (dy, dx), (0, 1))
        c += np.roll(filled.astype(np.float32), (dy, dx), (0, 1))
    new = (~filled) & (c > 0)
    T[new, :3] = s[new] / c[new][:, None]
    filled |= new
T[:, :, :3] = np.where(filled[:, :, None], T[:, :, :3], rep[0])
T[:, :, 3] = 1
img = bpy.data.images.new('avatar', TEX, TEX, alpha=False)
img.pixels = T.ravel()
img.filepath_raw = out_png
img.file_format = 'PNG'
img.save()
# 正面から貼れた所の地図（顔の膜を作るときに使う）
np.save(out_png + '.wf.npy', Wm)

me.materials.clear()
mat = bpy.data.materials.new('avatar')
mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.9
tx = mat.node_tree.nodes.new('ShaderNodeTexImage')
tx.image = bpy.data.images.load(out_png)
mat.node_tree.links.new(tx.outputs['Color'], b.inputs['Base Color'])
me.materials.append(mat)
o.name = 'avatar'
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=out_blend.replace('.blend', '-static.glb'), export_format='GLB', export_image_format='WEBP', export_image_quality=84)
print('saved', out_blend)

# AI が作った形（色なし）を軽くして、参考画像（正面）の色を貼り付けた色の絵を作る。
# 使い方: blender -b -P blender-paint.py -- 形.glb AIの色付き.glb 正面の透明PNG(1024) 出力.blend 出力の絵.png [三角形の目安] [絵の一辺]
# - 正面から見える所: 参考画像の色をそのまま（顔・パーカーのひも・ポケットなど）
# - 正面から見えない所: AI の色で「髪・肌・青・ピンク…」の区分けだけを借り、色そのものは参考画像から取った代表の色にする
import bpy, sys, bmesh, math
import numpy as np
from mathutils import Vector, kdtree
from mathutils.bvhtree import BVHTree

a = sys.argv[sys.argv.index('--') + 1:]
shape_glb, ai_glb, front_png, out_blend, out_png = a[:5]
TARGET = int(a[5]) if len(a) > 5 else 20000
TEX = int(a[6]) if len(a) > 6 else 1024
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
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.006)
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
wf = np.clip((facing - 0.3) / 0.3, 0, 1) * vis * (samp[:, 3] > 0.98)
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
for i, p in enumerate(Pn):
    near = ai_kd.find_range(Vector(p), 0.025)
    if near:
        lab[i] = np.bincount([ai_cls[j] for (_, j, _) in near], minlength=NC).argmax()
    else:
        lab[i] = ai_cls[ai_kd.find(Vector(p))[1]]
# 場所の決まり: 髪は首より上だけ。首より下の暗い色（AI の影）は服。首より上の青・ピンクは髪（AI の色のごみ）。切り口（背中）はパーカー
z = Pn[:, 2]
lab = np.where((lab == 0) & (z < 0.53), 3, lab)
lab = np.where(((lab == 3) | (lab == 2)) & (z > 0.57), 0, lab)
on_cut = (np.abs((Pn - np.array(CUT_CO)) @ np.array(CUT_NO)) < 0.004) & (z > Z0) & (z < Z1) & (Nn @ np.array(CUT_NO) > 0.7)
lab = np.where(on_cut, 3, lab)
# 背中側に残った AI のリュックのピンクは服の色にする（新しいリュックは別の部品）
lab = np.where((lab == 2) & (Pn[:, 1] > -0.02) & (z > 0.15) & (z < 0.57), 3, lab)
# 青は高さで 3 つに分ける（パーカー・短パン・くつ）。くつは高さで決め、ひざ下の暗い所は肌にする
zone = np.where(z > 0.25, 0, np.where(z > 0.075, 1, 2))
lab = np.where(lab == 3, 3 + zone, lab)
lab = np.where(z < 0.068, 5, lab)
names = ['hair', 'skin', 'pink', 'hoodie', 'shorts', 'shoes']
strong = wf > 0.9
rep = np.zeros((6, 3), np.float32)
for k in range(6):
    sel = strong & (lab == k)
    rep[k] = np.median(samp[sel][:, :3], axis=0) if sel.sum() > 100 else (0.5, 0.5, 0.5)
    print('class', names[k], 'ref', np.round(rep[k], 2), 'n', int((lab == k).sum()), 'front n', int(sel.sum()))
base = rep[lab]
col = samp[:, :3] * wf[:, None] + base * (1 - wf[:, None])

T = np.zeros((TEX, TEX, 4), np.float32)
T[ys, xs, :3] = col
T[ys, xs, 3] = 1
Wm = np.zeros((TEX, TEX), np.float32)
Wm[ys, xs] = wf
# 見えない所の色を、島の中でぼかして、区分けの境目のがたつきを消す（正面の色は動かさない）
B = T[:, :, :3].copy()
A = M.astype(np.float32)
for _ in range(10):
    s = np.zeros_like(B)
    c = np.zeros_like(A)
    for dy, dx in ((0, 0), (0, 1), (0, -1), (1, 0), (-1, 0)):
        s += np.roll(B * A[:, :, None], (dy, dx), (0, 1))
        c += np.roll(A, (dy, dx), (0, 1))
    B = np.where(c[:, :, None] > 0, s / np.maximum(c[:, :, None], 1e-6), B)
T[:, :, :3] = np.where(M[:, :, None], T[:, :, :3] * Wm[:, :, None] + B * (1 - Wm[:, :, None]), 0)
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
bpy.ops.export_scene.gltf(filepath=out_blend.replace('.blend', '-static.glb'), export_format='GLB', export_image_format='WEBP', export_image_quality=90)
print('saved', out_blend)

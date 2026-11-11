# 版 B（AI が色を付けた形 boy_mv123_textured）の色の絵を、場所を決めて塗り直す。形は変えない（軽くするのと、うでの切りはなしだけ）。
# 使い方: blender -b -P blender-b-repaint.py -- B.glb 参考画像のフォルダ(front-stand.png・back.png) 出力.blend 出力の絵.png 作業用フォルダ [三角形の目安]
# - 髪: 首より上で肌でない所を、参考画像の髪の茶色に（明るさの変化だけ B から借りる。青い粒は明るさにも使わない）
# - リュック: 背中の面より後ろに出ている所を、参考画像のピンクに（明るさの変化は B から借りるので、ポケットの線は残る）
# - 肩・袖・背中の赤いしみ: まわりの青で埋める
# - 手の先: 青でない所は肌の色に。耳のうしろの黒ずみ: 耳の肌の近くで暗い所を、まわりの肌で埋める
# 出力の .blend の 'avatar' は blender-finish.py（AVATAR_B=1）にそのまま渡せる
import bpy, sys, bmesh, math, os, json
import numpy as np
from mathutils import Vector, kdtree

a = sys.argv[sys.argv.index('--') + 1:]
src_glb, ref_dir, out_blend, out_png, work = a[:5]
TARGET = int(a[5]) if len(a) > 5 else 30000
bpy.ops.wm.read_factory_settings(use_empty=True)
os.makedirs(work, exist_ok=True)


def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


bpy.ops.import_scene.gltf(filepath=src_glb)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
active(objs[0])
for o_ in objs:
    o_.select_set(True)
if len(objs) > 1:
    bpy.ops.object.join()
o = bpy.context.object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
for e_ in [e for e in bpy.context.scene.objects if e.type != 'MESH']:
    bpy.data.objects.remove(e_)
me = o.data
co = np.array([v.co[:] for v in me.vertices])
mn, mx = co.min(0), co.max(0)
s = 1 / (mx[2] - mn[2])
c = (mn + mx) / 2
for v in me.vertices:  # blender-paint.py の normalize と同じ（高さ 1・左右前後のまん中が 0・足が 0）
    v.co = Vector(((v.co.x - c[0]) * s, (v.co.y - c[1]) * s, (v.co.z - mn[2]) * s))
me.update()
src_img = next(i for i in bpy.data.images if i.size[0] > 0)
TEX = src_img.size[0]
print('B tris', len(me.polygons), 'tex', src_img.size[:])

# ---- 絵の 1 点ごとに、形の上の場所と向き（blender-paint.py と同じ）。重いので作業用フォルダに残す ----
cache = f'{work}/b-texels.npz'
if os.path.exists(cache):
    z_ = np.load(cache)
    P, N, M, T0 = z_['P'], z_['N'], z_['M'], z_['T0']
else:
    T0 = np.array(src_img.pixels[:], dtype=np.float32).reshape(TEX, TEX, 4)[:, :, :3].copy()
    me.calc_loop_triangles()
    uvd = me.uv_layers.active.data
    P = np.zeros((TEX, TEX, 3), np.float32)
    N = np.zeros((TEX, TEX, 3), np.float32)
    M = np.zeros((TEX, TEX), bool)
    for t in me.loop_triangles:
        uv = np.array([uvd[l].uv[:] for l in t.loops]) * TEX
        p3 = np.array([me.vertices[v].co[:] for v in t.vertices])
        n3 = np.array([t.normal[:]] * 3)
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
        e = -0.6 / max(1.0, math.sqrt(abs(d)))
        inside = (w0 >= e) & (w1 >= e) & (w2 >= e)
        if not inside.any():
            continue
        yy, xx = np.nonzero(inside)
        W = np.stack([w0[inside], w1[inside], w2[inside]], 1)
        P[yy + y0, xx + x0] = W @ p3
        N[yy + y0, xx + x0] = W @ n3
        M[yy + y0, xx + x0] = True
    np.savez(cache, P=P, N=N, M=M, T0=T0)
print('texels', int(M.sum()))


def load_px(name):
    img = bpy.data.images.load(f'{ref_dir}/{name}.png')
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3].copy()  # 上が 0 行目


def masked_blur(img, mask, n):
    """mask の中だけで平均する（ほかの区分けの色を混ぜない）。"""
    B = img.copy()
    A = mask.astype(np.float32)
    for _ in range(n):
        s_ = np.zeros_like(B)
        c_ = np.zeros_like(A)
        for dy, dx in ((0, 0), (0, 1), (0, -1), (1, 0), (-1, 0)):
            w_ = np.roll(A, (dy, dx), (0, 1))
            s_ += np.roll(B, (dy, dx), (0, 1)) * (w_[:, :, None] if B.ndim == 3 else w_)
            c_ += w_
        cc = c_[:, :, None] if B.ndim == 3 else c_
        B = np.where(cc > 0, s_ / np.maximum(cc, 1e-6), B)
    return B


def fill_from(img, known, todo, n=200):
    """todo の所を、known のとなりから少しずつ埋める（しみを、まわりの色で埋める）。"""
    img = img.copy()
    known = known.copy()
    for _ in range(n):
        s_ = np.zeros_like(img)
        c_ = np.zeros(known.shape, np.float32)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            s_ += np.roll(img * known[:, :, None], (dy, dx), (0, 1))
            c_ += np.roll(known.astype(np.float32), (dy, dx), (0, 1))
        new = todo & ~known & (c_ > 0)
        if not new.any():
            break
        img[new] = s_[new] / c_[new][:, None]
        known |= new
    return img, known


x, y, z = P[:, :, 0], P[:, :, 1], P[:, :, 2]
r, g, b = T0[:, :, 0], T0[:, :, 1], T0[:, :, 2]
L = T0.mean(2)
T = T0.copy()

# ---- 参考画像の色 ----
front = load_px('front-stand')
ink = ~((front.min(2) > 225 / 255) & ((front.max(2) - front.min(2)) < 22 / 255))
ys_, xs_ = np.nonzero(ink)
TOP, BOT = ys_.min(), ys_.max()
PXU = BOT - TOP
top = front[TOP:TOP + int(0.2 * PXU)]
hair_ref = (top[:, :, 0] < 0.74) & (top[:, :, 0] - top[:, :, 2] > 0.08) & (top.mean(2) < 0.5)
HAIR = np.median(top[hair_ref], axis=0)
back = load_px('back')
PINK = np.median(back[900:1060, 730:870].reshape(-1, 3), axis=0)
EYE_Z = (BOT - 572) / PXU  # 正面の参考画像の目の高さ（形の座標）
print('hair', np.round(HAIR, 3), 'pink', np.round(PINK, 3), 'eye z', round(float(EYE_Z), 3))

blue = (b > r + 0.06)
skinlike = (r > 0.62) & (g > 0.42) & (r > b + 0.12) & (r - g < 0.3)
FX0, FX1, FZ0, FZ1 = -0.17, 0.17, 0.548, 0.752  # 顔の枠（blender-finish.py と同じ）
in_face = (x > FX0) & (x < FX1) & (z > FZ0) & (z < FZ1) & (N[:, :, 1] < -0.3)

# ---- 耳: 頭の横で肌の色の所。そのまわり（うしろ側）の暗い所を耳の肌で埋める ----
head = M & (z > 0.57)
ear_skin = head & skinlike & (np.abs(x) > 0.15) & (y > -0.09) & (z < 0.72)
ez = z[ear_skin]
print('ear skin texels', int(ear_skin.sum()), 'z', np.round([ez.min(), ez.max()], 3) if len(ez) else '-',
      'x', np.round(np.abs(x[ear_skin]).min(), 3) if len(ez) else '-')
ear_dark = np.zeros_like(M)
if ear_skin.sum() > 50:
    kd = kdtree.KDTree(int(ear_skin.sum()))
    for i, p in enumerate(P[ear_skin]):
        kd.insert(Vector(p), i)
    kd.balance()
    cand = head & ~skinlike & (np.abs(x) > 0.14) & (z > ez.min() - 0.01) & (z < ez.max() + 0.01) & (L < 0.45)
    cy, cx = np.nonzero(cand)
    for yy_, xx_ in zip(cy, cx):
        if kd.find(Vector(P[yy_, xx_]))[2] < 0.008:
            ear_dark[yy_, xx_] = True
print('ear dark texels', int(ear_dark.sum()))

# ---- 髪 ----
keep_face = in_face & (z < EYE_Z + 0.04)  # 目・口・ほおは B のまま
hair = head & (~skinlike | ((z > 0.75) & ~in_face) | (z > FZ1)) & ~keep_face & ~ear_dark & ~ear_skin
# 頭の後ろ（耳より後ろ・上）の肌色は髪にする。区分けのふちは、まわりの多数決でならす（ぎざぎざを消す）
hair = hair | (head & (y > 0.02) & (z > 0.6) & ~ear_skin & ~ear_dark)
hair = (masked_blur(hair.astype(np.float32), head, 4) > 0.5) & head & ~keep_face
speck = hair & (blue | (r > 0.45))  # 青い粒・赤い粒
print('hair texels', int(hair.sum()), 'specks', int(speck.sum()))
Lh = masked_blur(L, hair & ~speck, 6)
ratio = np.clip(Lh / np.median(L[hair & ~speck]), 0.72, 1.25)
T = np.where(hair[:, :, None], HAIR[None, None, :] * ratio[:, :, None], T)

# ---- リュック: 背中の面（blender-paint.py の切り口）より後ろ ----
CUT_CO = np.array((0, 0.078, 0.20))
CUT_NO = np.array((0, 1, -0.115))
CUT_NO = CUT_NO / np.linalg.norm(CUT_NO)
behind = ((P - CUT_CO) @ CUT_NO)
pack = M & (behind > 0.006) & (z > 0.15) & (z < 0.50)  # 上はフードにかからない高さまで & (np.abs(x) < 0.2)
pack_c = pack & ~skinlike
print('pack texels', int(pack.sum()))
Lp = masked_blur(L, pack_c, 3)
ratio = np.clip(Lp / np.median(L[pack_c]), 0.6, 1.2)
T = np.where(pack_c[:, :, None], PINK[None, None, :] * ratio[:, :, None], T)

# ---- 肩・袖・背中の赤いしみ → まわりの青で埋める ----
red = (~blue & ~skinlike) | (r > g + 0.05)  # 赤・ピンク・こげ茶のしみ（服の青でも肌でもない色）
body = M & (z > 0.24) & (z < 0.57) & ~pack & ~(np.abs(x) > 0.152) | (M & (np.abs(x) > 0.152) & (z > 0.262) & (z < 0.57) & ~pack)  # 手はのぞく
stain = body & red & ((np.abs(x) > 0.135) | (y > -0.01))  # 前の肩ひも（左右 0.135 より内側・前）は残す
for _ in range(2):  # しみのふち（にじんだ色）も含める
    stain = stain | (body & ~blue & (np.roll(stain, 1, 0) | np.roll(stain, -1, 0) | np.roll(stain, 1, 1) | np.roll(stain, -1, 1)))
print('stain texels', int(stain.sum()))
T, _ = fill_from(T, body & blue & ~stain, stain)
T = np.where(stain[:, :, None], masked_blur(T, stain | (body & blue), 3), T)

# ---- 手の先: 袖口より下で青でない所は肌の色に ----
hand = M & (np.abs(x) > 0.152) & (z > 0.165) & (z < 0.262) & ~blue
hs = hand & skinlike & (L > np.median(L[hand & skinlike]) * 0.9)
SKIN = np.median(T0[hs], axis=0)
Lk = masked_blur(L, hand, 4)
ratio = np.clip(Lk / np.median(L[hs]), 0.93, 1.05)
T = np.where(hand[:, :, None], SKIN[None, None, :] * ratio[:, :, None], T)
print('hand texels', int(hand.sum()), 'skin', np.round(SKIN, 3))

# ---- 耳のうしろ ----
T, _ = fill_from(T, head & skinlike & ~ear_dark & (np.abs(x) > 0.13), ear_dark)
T = np.where(ear_dark[:, :, None], masked_blur(T, ear_dark | ear_skin, 3), T)

# 顔の肌の色（顔の膜の色合わせに使う）
fs = in_face & skinlike & (z < EYE_Z) & (np.abs(x) > 0.06)
FACE_SKIN = np.median(T0[fs], axis=0)
json.dump({'face_skin': FACE_SKIN.tolist(), 'eye_z': float(EYE_Z)}, open(out_png + '.json', 'w'))

# 島のふちの外へ色を広げる（小さく表示したときに、すき間から元の色がにじまないように）
T, filled = fill_from(T, M.copy(), ~M, 24)
img = bpy.data.images.new('avatar', TEX, TEX, alpha=False)
T4 = np.ones((TEX, TEX, 4), np.float32)
T4[:, :, :3] = np.clip(T, 0, 1)
img.pixels = T4.ravel()
img.filepath_raw = out_png
img.file_format = 'PNG'
img.save()
print('painted', out_png)
if os.environ.get('ONLY_TEX') == '1':
    sys.exit(0)

# ---- 形: 同じ場所の点をつなぐ → 軽くする（色の絵の切れ目はくずさない）----
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
bm.to_mesh(me)
bm.free()
active(o)
m = o.modifiers.new('d', 'DECIMATE')
m.ratio = min(1.0, TARGET / len(me.polygons))
m.delimit = {'UV', 'SEAM'}
bpy.ops.object.modifier_apply(modifier='d')
for p in me.polygons:
    p.use_smooth = True
print('tris', len(me.polygons))

# ---- うでを体から切りはなす: わきの溝（左右 0.142）の平面で切って、切り口をふさぐ（B の形は閉じていないので、箱の引き算は使えない）。
# 切り口の面は、そでの青の所を指す。うでの点には armL・armR のしるし（blender-finish.py が使う）
ARM_X = 0.142
blue_uv = np.argwhere(M & blue & (z > 0.3) & (z < 0.45) & (np.abs(x) > 0.16) & (y > -0.03))
BUV = Vector(((blue_uv[len(blue_uv) // 2][1] + 0.5) / TEX, (blue_uv[len(blue_uv) // 2][0] + 0.5) / TEX))
if os.environ.get('NO_ARM_CUT') != '1':
    bm = bmesh.new()
    bm.from_mesh(me)
    for sgn in (1, -1):
        sub = [f for f in bm.faces if any(0.10 < v.co.z < 0.56 for v in f.verts)]
        geom = list({v for f in sub for v in f.verts}) + list({e for f in sub for e in f.edges}) + sub
        bmesh.ops.bisect_plane(bm, geom=geom, dist=1e-5, plane_co=(sgn * ARM_X, 0, 0), plane_no=(1, 0, 0))
    cut_e = [e for e in bm.edges if all(abs(abs(v.co.x) - ARM_X) < 2e-5 and 0.10 < v.co.z < 0.56 for v in e.verts) and len(e.link_faces) == 2]
    bmesh.ops.split_edges(bm, edges=cut_e)
    print('cut edges', len(cut_e))
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
    arm_v = {1: [], -1: []}
    for isl in islands:
        xs_i = np.array([v.co.x for v in isl])
        zs_i = np.array([v.co.z for v in isl])
        for sgn in (1, -1):
            if (sgn * xs_i >= ARM_X - 1e-4).all() and 0.12 < zs_i.mean() < 0.56:
                arm_v[sgn] += isl
    print('islands', len(islands), 'arm verts', len(arm_v[1]), len(arm_v[-1]))
    # 切り口をふさぐ
    bnd = [e for e in bm.edges if e.is_boundary and all(abs(abs(v.co.x) - ARM_X) < 2e-5 for v in e.verts)]
    res = bmesh.ops.holes_fill(bm, edges=bnd, sides=0)
    caps = res['faces']
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 3])
    uvl = bm.loops.layers.uv.active
    ncap = 0
    for f in bm.faces:
        if all(abs(abs(v.co.x) - ARM_X) < 2e-5 for v in f.verts) and abs(f.normal.x) > 0.9:
            ncap += 1
            for l in f.loops:
                l[uvl].uv = BUV
    print('cap faces', ncap, 'filled', len(caps))
    ids = {1: {v.index for v in arm_v[1]}, -1: {v.index for v in arm_v[-1]}}
    bm.to_mesh(me)
    bm.free()
    for sgn, name in ((1, 'armL'), (-1, 'armR')):
        g_ = o.vertex_groups.new(name=name)
        g_.add(list(ids[sgn]), 1.0, 'REPLACE')
    print('faces after cut', len(me.polygons))

me.materials.clear()
mat = bpy.data.materials.new('avatar')
mat.use_nodes = True
bs = mat.node_tree.nodes['Principled BSDF']
bs.inputs['Roughness'].default_value = 0.9
tx = mat.node_tree.nodes.new('ShaderNodeTexImage')
tx.image = bpy.data.images.load(out_png)
mat.node_tree.links.new(tx.outputs['Color'], bs.inputs['Base Color'])
me.materials.append(mat)
o.name = 'avatar'
bpy.ops.wm.save_as_mainfile(filepath=out_blend)
active(o)
bpy.ops.export_scene.gltf(filepath=out_blend.replace('.blend', '-static.glb'), export_format='GLB', use_selection=True,
                          export_image_format='WEBP', export_image_quality=84)
print('saved', out_blend)

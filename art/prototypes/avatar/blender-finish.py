# 色を貼った形（blender-paint.py の出力）に、①きれいなリュック（別の部品）②顔の膜（表情の差し替え用）③骨組みと重み を足して GLB にする。
# 使い方: blender -b -P blender-finish.py -- 入力.blend 参考画像のフォルダ(front-stand.png など) 出力.glb 顔の並べ絵.png
import bpy, sys, bmesh, math
import numpy as np
from mathutils import Vector, Matrix, kdtree

a = sys.argv[sys.argv.index('--') + 1:]
src_blend, ref_dir, dst, atlas_png = a[:4]
bpy.ops.wm.open_mainfile(filepath=src_blend)
av = bpy.data.objects['avatar']
me = av.data


def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def load_px(name):
    img = bpy.data.images.load(f'{ref_dir}/{name}.png')
    w, h = img.size
    return np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, :3].copy()  # 上が 0 行目


# ===================== ① リュック =====================
back = load_px('back')
pink = np.median(back[900:1060, 730:870].reshape(-1, 3), axis=0)  # 後ろの参考画像の、リュックのまん中あたり
print('backpack pink', np.round(pink, 3))


def lin(c):
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1.0]


pmat = bpy.data.materials.new('backpack')
pmat.use_nodes = True
pb = pmat.node_tree.nodes['Principled BSDF']
pb.inputs['Roughness'].default_value = 0.9
vc = pmat.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
pmat.node_tree.links.new(vc.outputs['Color'], pb.inputs['Base Color'])


def paint(o, k):
    ca = o.data.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    c = lin([min(1.0, x * k) for x in pink])
    for d in ca.data:
        d.color = c
    o.data.materials.append(pmat)
    while o.data.uv_layers:
        o.data.uv_layers.remove(o.data.uv_layers[0])
    for p in o.data.polygons:
        p.use_smooth = True
    return o


def rbox(loc, size, bevel, k, seg=5):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.object
    o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    m = o.modifiers.new('b', 'BEVEL')
    m.width = bevel
    m.segments = seg
    m.limit_method = 'NONE'
    bpy.ops.object.modifier_apply(modifier='b')
    return paint(o, k)


# リュックの中だけの座標: x 左右、y 後ろ向き（0 が背中に当たる面）、z 上下（0 がまん中）
W, D, H = 0.235, 0.115, 0.225
parts = [rbox((0, D / 2, 0), (W, D, H), 0.042, 1.0, 6)]
parts.append(rbox((0, D + 0.012, -0.048), (0.165, 0.036, 0.098), 0.016, 0.985))  # 前のポケット
parts.append(rbox((0, D + 0.03, -0.012), (0.178, 0.02, 0.05), 0.009, 0.93))  # ポケットのふた
for sx in (-1, 1):
    parts.append(rbox((sx * 0.042, D + 0.04, -0.036), (0.022, 0.011, 0.07), 0.004, 0.84, 3))  # ベルト
    parts.append(rbox((sx * 0.042, D + 0.046, -0.058), (0.028, 0.008, 0.014), 0.003, 0.74, 2))  # 留め具
    parts.append(rbox((sx * (W / 2 + 0.008), D / 2 + 0.005, -0.055), (0.03, 0.07, 0.085), 0.013, 0.95))  # 横のポケット
# ふた（上の 3 分の 1 にかぶさる、ひとまわり大きい帯）
parts.append(rbox((0, D / 2 + 0.004, H / 2 - 0.045), (W + 0.012, D + 0.012, 0.085), 0.04, 0.955, 6))
bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.0085, major_segments=24, minor_segments=10, location=(0, D / 2, H / 2 - 0.004), rotation=(math.pi / 2, 0, 0))
parts.append(paint(bpy.context.object, 0.88))  # 持ち手
bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
active(parts[0])
for p in parts:
    p.select_set(True)
bpy.ops.object.join()
pack = bpy.context.object
pack.name = 'backpack'
# 背中の面（blender-paint.py の切り口）に合わせて置く
CUT_CO = Vector((0, 0.078, 0.20))
SLOPE = 0.115
zc = 0.385
pack.matrix_world = Matrix.Translation((0, CUT_CO.y + SLOPE * (zc - CUT_CO.z) - 0.012, zc)) @ Matrix.Rotation(-math.atan(SLOPE), 4, 'X')
active(pack)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
print('backpack tris', sum(len(p.vertices) - 2 for p in pack.data.polygons))

# ===================== ② 顔の膜と、表情の並べ絵 =====================
# 正面の参考画像（1600x1600）での、キャラの枠（上・下・まん中）。blender-paint.py と同じ合わせ方
front = load_px('front-stand')
ink = ~((front.min(2) > 225 / 255) & ((front.max(2) - front.min(2)) < 22 / 255))
ys, xs = np.nonzero(ink)
TOP, BOT = ys.min(), ys.max()
CX = (xs.min() + xs.max()) / 2
PXU = BOT - TOP  # 高さ 1 が何 px か
FX0, FX1, FZ0, FZ1 = -0.15, 0.15, 0.555, 0.745  # 顔の枠（形の座標）
x0, x1 = int(round(CX + FX0 * PXU)), int(round(CX + FX1 * PXU))
y0, y1 = int(round(BOT - FZ1 * PXU)), int(round(BOT - FZ0 * PXU))
CW, CH = x1 - x0, y1 - y0
print('face cell', CW, CH, 'at', x0, y0)
base = front[y0:y1, x0:x1].copy()

# 髪（暗い茶色で、枠のふちからつながっている所）は透明にする → 下の髪がそのまま見える
dark = (base[:, :, 0] < 0.74) & (base[:, :, 0] - base[:, :, 2] > 0.08)
hair = np.zeros_like(dark)
hair[0, :] = dark[0, :]; hair[:, 0] = dark[:, 0]; hair[:, -1] = dark[:, -1]
while True:
    g = hair.copy()
    g[1:, :] |= hair[:-1, :]; g[:-1, :] |= hair[1:, :]; g[:, 1:] |= hair[:, :-1]; g[:, :-1] |= hair[:, 1:]
    g &= dark
    if (g == hair).all():
        break
    hair = g


def blur(m, n):
    m = m.astype(np.float32)
    for _ in range(n):
        m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
    return m


yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
edge = np.clip(np.minimum(np.minimum(xx, CW - 1 - xx), np.minimum(yy, CH - 1 - yy)) / 14, 0, 1)
alpha = np.clip(1 - blur(hair, 3) * 1.6, 0, 1) * edge
skin = np.median(base[(~dark) & (base[:, :, 0] > 0.85)].reshape(-1, 3), axis=0)
print('skin', np.round(skin, 3))


def ell(cx, cy, rx, ry, soft=6.0):  # やわらかいふちの楕円（1 = 中）
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip((1 - d) * min(rx, ry) / soft + 0.5, 0, 1)


# 目・口の場所（1600x1600 の参考画像の px。並べた絵から読み取った値）
N_EYES = ((680, 572), (912, 572))
N_MOUTH = (797, 664)
ne = [(ex - x0, ey - y0) for ex, ey in N_EYES]
nm = (N_MOUTH[0] - x0, N_MOUTH[1] - y0)
EYE_R = (62, 66)  # 目（まゆの下まで）を入れ替える範囲
MOUTH_R = (70, 46)
eye_mask = np.maximum(ell(ne[0][0], ne[0][1] - 4, *EYE_R), ell(ne[1][0], ne[1][1] - 4, *EYE_R))
mouth_mask = ell(nm[0], nm[1] + 6, *MOUTH_R)


def warp(name, eyes, mouth_from=None):
    """別の表情の参考画像を、目の位置と間隔が ふつうの顔 に重なるように写す。"""
    img = load_px(name)
    s = math.dist(*eyes) / math.dist(*N_EYES)
    mx, my = (eyes[0][0] + eyes[1][0]) / 2, (eyes[0][1] + eyes[1][1]) / 2
    nx, ny = (N_EYES[0][0] + N_EYES[1][0]) / 2, (N_EYES[0][1] + N_EYES[1][1]) / 2
    sx = (xx + x0 - nx) * s + mx
    sy = (yy + y0 - ny) * s + my
    ix = np.clip(sx.astype(int), 0, img.shape[1] - 2)
    iy = np.clip(sy.astype(int), 0, img.shape[0] - 2)
    fx = (sx - ix)[:, :, None]
    fy = (sy - iy)[:, :, None]
    out = img[iy, ix] * (1 - fx) * (1 - fy) + img[iy, ix + 1] * fx * (1 - fy) + img[iy + 1, ix] * (1 - fx) * fy + img[iy + 1, ix + 1] * fx * fy
    # 肌の明るさを ふつうの顔 にそろえる
    sk = np.median(out[(out[:, :, 0] > 0.85) & (out[:, :, 0] - out[:, :, 2] < 0.35)].reshape(-1, 3), axis=0)
    return np.clip(out * (skin / sk), 0, 1)


def mix(dst_img, src_img, m):
    return dst_img * (1 - m[:, :, None]) + src_img * m[:, :, None]


cells = {'normal': base}
happy_src = warp('cheer-happy', ((636, 586), (896, 586)))
cells['happy'] = mix(mix(base, happy_src, eye_mask), happy_src, mouth_mask)
sur_src = warp('surprised', ((676, 580), (900, 580)))
cells['surprised'] = mix(mix(base, sur_src, eye_mask), sur_src, mouth_mask)
# おいしい: うれしい の閉じた目 ＋ ふつうの口 ＋ 小さな舌
y_img = mix(base, happy_src, eye_mask)
tongue = ell(nm[0] + 20, nm[1] + 16, 13, 12, 3)
y_img = mix(y_img, np.broadcast_to(np.array([0.96, 0.52, 0.55], np.float32), y_img.shape), tongue)
cells['yummy'] = y_img
# ねむい: ふつうの目の上半分を、肌の色のまぶたでかくし、まぶたの線を引く
s_img = base.copy()
for ex, ey in ne:
    lid = ell(ex, ey - 4, 52, 56, 3) * np.clip((ey + 6 - yy) / 4, 0, 1)
    s_img = mix(s_img, np.broadcast_to(skin, s_img.shape), lid)
    line = ell(ex, ey + 8, 42, 5.5, 2.5)
    s_img = mix(s_img, np.broadcast_to(np.array([0.3, 0.17, 0.12], np.float32), s_img.shape), line)
cells['sleepy'] = s_img
ORDER = ['normal', 'happy', 'surprised', 'yummy', 'sleepy']
atlas = np.zeros((CH, CW * len(ORDER), 4), np.float32)
for i, n in enumerate(ORDER):
    atlas[:, i * CW:(i + 1) * CW, :3] = cells[n]
    atlas[:, i * CW:(i + 1) * CW, 3] = alpha
aimg = bpy.data.images.new('faces', CW * len(ORDER), CH, alpha=True)
aimg.pixels = atlas[::-1].ravel()
aimg.filepath_raw = atlas_png
aimg.file_format = 'PNG'
aimg.save()

# 顔の膜: 形のうち、顔の枠に入る前向きの面を写し取り、少し浮かせる
bm = bmesh.new()
bm.from_mesh(me)
keep = [f for f in bm.faces if all(FX0 < v.co.x < FX1 and FZ0 < v.co.z < FZ1 for v in f.verts) and f.normal.y < -0.3]
fb = bmesh.new()
vmap = {}
uvl = fb.loops.layers.uv.new('UVMap')
for f in keep:
    vs = []
    for v in f.verts:
        if v.index not in vmap:
            vmap[v.index] = fb.verts.new(v.co + v.normal * 0.0025)
        vs.append(vmap[v.index])
    nf = fb.faces.new(vs)
    nf.smooth = True
    for l in nf.loops:
        l[uvl].uv = (((l.vert.co.x - FX0) / (FX1 - FX0)) / len(ORDER), (l.vert.co.z - FZ0) / (FZ1 - FZ0))
bm.free()
fme = bpy.data.meshes.new('face')
fb.to_mesh(fme)
fb.free()
face = bpy.data.objects.new('face', fme)
bpy.context.collection.objects.link(face)
fmat = bpy.data.materials.new('face')
fmat.use_nodes = True
fmat.blend_method = 'BLEND'
fbs = fmat.node_tree.nodes['Principled BSDF']
fbs.inputs['Roughness'].default_value = 0.9
ft = fmat.node_tree.nodes.new('ShaderNodeTexImage')
ft.image = bpy.data.images.load(atlas_png)
fmat.node_tree.links.new(ft.outputs['Color'], fbs.inputs['Base Color'])
fmat.node_tree.links.new(ft.outputs['Alpha'], fbs.inputs['Alpha'])
fme.materials.append(fmat)
print('face tris', len(fme.polygons))

# ===================== ③ 骨組みと重み =====================
HIP, WAIST, NECK, HEAD_ONLY = 0.25, 0.37, 0.545, 0.585
TY = -0.04
bones = {
    'hips': ((0, TY, HIP), (0, TY, WAIST), None),
    'chest': ((0, TY, WAIST), (0, TY, NECK), 'hips'),
    'head': ((0, TY, NECK), (0, TY, 0.95), 'chest'),
}
for sg, n in ((1, 'L'), (-1, 'R')):
    bones['upperarm' + n] = ((sg * 0.15, TY + 0.01, 0.495), (sg * 0.19, TY + 0.01, 0.385), 'chest')
    bones['forearm' + n] = ((sg * 0.19, TY + 0.01, 0.385), (sg * 0.215, TY, 0.255), 'upperarm' + n)
    bones['thigh' + n] = ((sg * 0.068, TY + 0.01, HIP), (sg * 0.068, TY + 0.01, 0.145), 'hips')
    bones['shin' + n] = ((sg * 0.068, TY + 0.01, 0.145), (sg * 0.068, TY + 0.01, 0.03), 'thigh' + n)
arm = bpy.data.armatures.new('rig')
ao = bpy.data.objects.new('rig', arm)
bpy.context.collection.objects.link(ao)
active(ao)
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, parent) in bones.items():
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = h, t
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')

# 重みは、面を作り直した「代わりの形」で自動で付けてから、近い点へ写す（細かい形のままだと自動の計算が失敗しやすい）
active(av)
bpy.ops.object.duplicate()
proxy = bpy.context.object
m = proxy.modifiers.new('r', 'REMESH')
m.mode = 'VOXEL'
m.voxel_size = 0.009
bpy.ops.object.modifier_apply(modifier='r')
pbm = bmesh.new()
pbm.from_mesh(proxy.data)
pbm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in pbm.verts:
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
bmesh.ops.delete(pbm, geom=[v for isl in islands[1:] for v in isl], context='VERTS')
pbm.to_mesh(proxy.data)
pbm.free()
for ob in (proxy, ao):
    ob.scale = (10, 10, 10)
bpy.ops.object.select_all(action='DESELECT')
proxy.select_set(True)
ao.select_set(True)
bpy.context.view_layer.objects.active = ao
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.ops.object.select_all(action='DESELECT')
proxy.select_set(True)
ao.select_set(True)
bpy.context.view_layer.objects.active = ao
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
unw = sum(1 for v in proxy.data.vertices if not v.groups)
print('proxy verts', len(proxy.data.vertices), 'unweighted', unw)
gnames = [g.name for g in proxy.vertex_groups]
PW = np.zeros((len(proxy.data.vertices), len(gnames)), np.float32)
for v in proxy.data.vertices:
    for g in v.groups:
        PW[v.index, g.group] = g.weight
kd = kdtree.KDTree(len(proxy.data.vertices))
for i, v in enumerate(proxy.data.vertices):
    kd.insert(v.co / 10, i)
kd.balance()
bpy.data.objects.remove(proxy)
ao.scale = (0.1, 0.1, 0.1)
active(ao)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)


def skin_to(ob, fixed=None):
    for n in gnames:
        ob.vertex_groups.new(name=n)
    for v in ob.data.vertices:
        if fixed:
            ob.vertex_groups[fixed].add([v.index], 1.0, 'REPLACE')
            continue
        if v.co.z > HEAD_ONLY:
            ob.vertex_groups['head'].add([v.index], 1.0, 'REPLACE')
            continue
        near = kd.find_n(v.co, 4)
        w = np.zeros(len(gnames), np.float32)
        for _, j, d in near:
            w += PW[j] / (d + 1e-4)
        # あごの下〜首は、頭と胸だけで分ける（顔がうでに引っぱられないように）
        if w.sum() <= 0:
            w[gnames.index('chest')] = 1
        w /= w.sum()
        for gi, x in enumerate(w):
            if x > 0.02:
                ob.vertex_groups[gnames[gi]].add([v.index], float(x), 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = ao
    ob.parent = ao


skin_to(av)
skin_to(pack, 'chest')
skin_to(face, 'head')
for n in gnames:
    print('weights', n, sum(1 for v in me.vertices if any(av.vertex_groups[g.group].name == n and g.weight > 0.5 for g in v.groups)))

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=False, export_normals=True, export_texcoords=True,
                          export_vertex_color='ACTIVE', export_skins=True, export_animations=False, export_yup=True,
                          export_image_format='WEBP', export_image_quality=88)
print('saved', dst)

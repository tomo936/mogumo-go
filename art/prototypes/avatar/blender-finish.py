# 色を貼った形（blender-paint.py の出力）に、①きれいなリュック（別の部品）②顔の膜（表情の差し替え用）③骨組みと重み を足して GLB にする。
# 使い方: blender -b -P blender-finish.py -- 入力.blend 参考画像のフォルダ(front-stand.png など) 出力.glb 顔の並べ絵.png
import bpy, sys, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix, kdtree

a = sys.argv[sys.argv.index('--') + 1:]
src_blend, ref_dir, dst, atlas_png = a[:4]
MV = os.environ.get('AVATAR_MV') == '1'
# AVATAR_B=1: 版 B（blender-b-repaint.py の出力）。リュックは作らない。顔は B の絵のままで、膜は うれしい のときだけ出す（ふつう は透明）。
# B_JSON に blender-b-repaint.py が書いた顔の肌の色（.json）を渡す
BMODE = os.environ.get('AVATAR_B') == '1'  # 3 枚入力版の形: リュックは AI の形のまま（体の一部）。作ったリュックと肩ひもは足さない
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
if BMODE:  # 版 B（AI の色を塗り直した形）: リュックは形の一部なので作らない
    pack = None
else:
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
        c = lin([min(1.0, x * k * s_) for x, s_ in zip(pink, (0.98, 0.93, 0.96) if MV else (0.97, 0.86, 0.94))])  # 3 枚版: 参考画像のピンクにほぼそのまま合わせる
        for d in ca.data:
            d.color = c
        o.data.materials.append(pmat)
        while o.data.uv_layers:
            o.data.uv_layers.remove(o.data.uv_layers[0])
        for p in o.data.polygons:
            p.use_smooth = True
        return o


    def rbox(loc, size, bevel, k, seg=3):
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
    W, D, H = (0.238, 0.108, 0.25) if MV else (0.25, 0.12, 0.25)


    def arch(w, h, d, y0, k, bevel, top=0.42, corner=0.035):
        """後ろから見て「上が丸いアーチ・下は角の丸い四角」の形を、奥行き d で作る。"""
        pts = []
        zt = h / 2 - h * top  # ここから上がアーチ
        n = 14
        for i in range(n + 1):  # 上のアーチ（右 → 左）
            t = math.pi * i / n
            pts.append((w / 2 * math.cos(t), zt + h * top * math.sin(t) ** 0.8))
        for cx, sgn in ((-w / 2 + corner, 1), (w / 2 - corner, -1)):  # 下の角（左下 → 右下）
            for i in range(5):
                t = math.pi / 2 * i / 4
                if sgn == 1:
                    pts.append((cx - corner * math.cos(t), -h / 2 + corner - corner * math.sin(t)))
                else:
                    pts.append((cx + corner * math.sin(t), -h / 2 + corner - corner * math.cos(t)))
        bm_ = bmesh.new()
        vs = [bm_.verts.new((x, y0, z_)) for x, z_ in pts]
        f_ = bm_.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(bm_, geom=[f_])
        bmesh.ops.translate(bm_, verts=[e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)], vec=(0, d, 0))
        bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
        m_ = bpy.data.meshes.new('arch')
        bm_.to_mesh(m_)
        bm_.free()
        o_ = bpy.data.objects.new('arch', m_)
        bpy.context.collection.objects.link(o_)
        active(o_)
        md = o_.modifiers.new('b', 'BEVEL')
        md.width = bevel
        md.segments = 4
        md.limit_method = 'ANGLE'
        md.angle_limit = math.radians(50)
        bpy.ops.object.modifier_apply(modifier='b')
        md = o_.modifiers.new('t', 'TRIANGULATE')
        bpy.ops.object.modifier_apply(modifier='t')
        md = o_.modifiers.new('n', 'WEIGHTED_NORMAL')
        md.keep_sharp = False
        bpy.ops.object.modifier_apply(modifier='n')
        return paint(o_, k)


    parts = [arch(W, H, D, 0, 1.0, 0.03)]
    parts.append(arch(W + 0.008, H + 0.008, 0.012, D * 0.5, 0.9, 0.005))  # ファスナーの線（ぐるっと 1 周の細い帯）
    parts.append(rbox((0, D + 0.013, -0.062), (0.168, 0.034, 0.092), 0.016, 0.985))  # 前のポケット
    parts.append(rbox((0, D + 0.03, -0.032), (0.178, 0.018, 0.046), 0.008, 0.93))  # ポケットのふた
    for sx in (-1, 1):
        parts.append(rbox((sx * 0.045, D + 0.039, -0.05), (0.02, 0.01, 0.05), 0.004, 0.86, 2))  # ベルト
        parts.append(rbox((sx * 0.045, D + 0.044, -0.068), (0.026, 0.008, 0.013), 0.003, 0.76, 2))  # 留め具
        parts.append(rbox((sx * (W / 2 + 0.006), D * 0.5, -0.068), (0.03, 0.068, 0.08), 0.013, 0.95))  # 横のポケット
    bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.0085, major_segments=16, minor_segments=8, location=(0, D * 0.42, H / 2 - 0.006), rotation=(math.pi / 2, 0, 0))
    parts.append(paint(bpy.context.object, 0.9))  # 持ち手
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
    zc = 0.37 if MV else 0.375
    pack.matrix_world = Matrix.Translation((0, CUT_CO.y + SLOPE * (zc - CUT_CO.z) - 0.012, zc)) @ Matrix.Rotation(-math.atan(SLOPE), 4, 'X')
    active(pack)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


    from mathutils.bvhtree import BVHTree
    body_bvh = BVHTree.FromObject(av, bpy.context.evaluated_depsgraph_get())
    def back_point(x, z_):
        """後ろから前へ光線を打って、背中側の表面の点を返す（肩ひもを背中・フードの上にはわせるため）。"""
        hit = body_bvh.ray_cast(Vector((x, 0.6, z_)), Vector((0, -1, 0)))
        return Vector((x, (hit[0].y if hit[0] is not None else 0.1) + 0.002, z_))


    def band(xz, width=0.027, thick=0.01, k=0.93):
        """(左右, 高さ) の点をなめらかにつないだ道を、背中の表面にはり付けて、平たい帯（肩ひも）にする。"""
        P_ = [Vector((x, 0, z_)) for x, z_ in xz]
        P_ = [P_[0]] + P_ + [P_[-1]]
        path = []
        for i in range(1, len(P_) - 2):
            for j in range(5):
                t = j / 5
                a_, b_, c_, d_ = P_[i - 1], P_[i], P_[i + 1], P_[i + 2]
                path.append(0.5 * ((2 * b_) + (-a_ + c_) * t + (2 * a_ - 5 * b_ + 4 * c_ - d_) * t * t + (-a_ + 3 * b_ - 3 * c_ + d_) * t ** 3))
        path.append(P_[-2])
        path = [back_point(p.x, p.z) for p in path]
        # 表面のでこぼこで帯ががたつかないよう、前後の位置だけ少しならす
        for _ in range(3):
            ys_ = [p.y for p in path]
            for i in range(1, len(path) - 1):
                path[i].y = (ys_[i - 1] + ys_[i] * 2 + ys_[i + 1]) / 4
        bm_ = bmesh.new()
        rings = []
        out = Vector((0, 1, 0))
        for i, p in enumerate(path):
            tan = (path[min(i + 1, len(path) - 1)] - path[max(i - 1, 0)]).normalized()
            o2 = (out - tan * out.dot(tan)).normalized()
            side = tan.cross(o2).normalized()
            rings.append([bm_.verts.new(p + side * sx * width / 2 + o2 * oz) for sx, oz in ((-1, -0.006), (1, -0.006), (1, thick), (-1, thick))])
        for r0, r1 in zip(rings, rings[1:]):
            for q in range(4):
                bm_.faces.new((r0[q], r0[(q + 1) % 4], r1[(q + 1) % 4], r1[q]))
        bm_.faces.new(rings[0][::-1])
        bm_.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm_, faces=bm_.faces)
        m_ = bpy.data.meshes.new('strap')
        bm_.to_mesh(m_)
        bm_.free()
        o_ = bpy.data.objects.new('strap', m_)
        bpy.context.collection.objects.link(o_)
        active(o_)
        md = o_.modifiers.new('n', 'WEIGHTED_NORMAL')
        bpy.ops.object.modifier_apply(modifier='n')
        return paint(o_, k)


    straps = []
    for sx in (-1, 1):
        # 上: リュックの上のふち → 背中・フードの上 → 肩（髪の下へ入って終わる。参考画像の後ろ姿の V 字）
        straps.append(band([(sx * 0.055, 0.455), (sx * 0.075, 0.495), (sx * 0.098, 0.53), (sx * 0.112, 0.552)]))
        # 下: リュックの下の横 → わきの下へ（うでの付け根で終わる）
        straps.append(band([(sx * 0.095, 0.30), (sx * 0.125, 0.312), (sx * 0.152, 0.328), (sx * 0.168, 0.34)]))
    active(pack)
    for o_ in straps:
        o_.select_set(True)
    bpy.ops.object.join()
    pack = bpy.context.object
    print('backpack tris', sum(len(p.vertices) - 2 for p in pack.data.polygons))

# ===================== ② 顔の膜と、表情の並べ絵 =====================
# 正面の参考画像（1600x1600）での、キャラの枠（上・下・まん中）。blender-paint.py と同じ合わせ方
front = load_px('front-stand')
ink = ~((front.min(2) > 225 / 255) & ((front.max(2) - front.min(2)) < 22 / 255))
ys, xs = np.nonzero(ink)
TOP, BOT = ys.min(), ys.max()
CX = (xs.min() + xs.max()) / 2
PXU = BOT - TOP  # 高さ 1 が何 px か
FX0, FX1, FZ0, FZ1 = -0.17, 0.17, 0.548, 0.752  # 顔の枠（形の座標）
x0, x1 = int(round(CX + FX0 * PXU)), int(round(CX + FX1 * PXU))
y0, y1 = int(round(BOT - FZ1 * PXU)), int(round(BOT - FZ0 * PXU))
CW, CH = x1 - x0, y1 - y0
print('face cell', CW, CH, 'at', x0, y0)
base = front[y0:y1, x0:x1].copy()
yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)


def grow(m, n):
    for _ in range(n):
        m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


def shrink(m, n):
    return ~grow(~m, n)


def blur(m, n):
    m = m.astype(np.float32)
    for _ in range(n):
        m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
    return m


def hair_of(img):
    """髪（太い暗い茶色で、枠の上・左右のふちからつながっている所）。細いまゆは髪に入れない。"""
    dark = (img[:, :, 0] < 0.74) & (img[:, :, 0] - img[:, :, 2] > 0.08)
    thick = shrink(dark, 6)  # まゆ（細い）はここで消える
    h = np.zeros_like(thick)
    h[0, :] = thick[0, :]; h[:, 0] = thick[:, 0]; h[:, -1] = thick[:, -1]
    while True:
        g = grow(h, 1) & thick
        if (g == h).all():
            break
        h = g
    return grow(h, 9) & dark


def skin_of(img):
    return (img[:, :, 0] > 0.8) & (img[:, :, 0] > img[:, :, 2] + 0.08) & (img[:, :, 1] > 0.55)


hair = hair_of(base)
edge = np.clip(np.minimum(np.minimum(xx, CW - 1 - xx) / 22, np.minimum(yy / 10, (CH - 1 - yy) / 26)), 0, 1)
alpha = np.clip(1 - blur(hair, 3) * 1.6, 0, 1) * edge
skin = np.median(base[skin_of(base)].reshape(-1, 3), axis=0)
print('skin', np.round(skin, 3))
# 顔の内側（肌の所。目・口の穴はうめる）。別の表情は、この内側だけを入れ替え、輪郭の近くは ふつうの顔 のままにする
# 肌でない所のうち、枠のふちからつながっている所が「顔の外」。残り（目・口の穴もふくむ）が顔の内側
sk = grow(skin_of(base) & ~hair, 2)
outside = np.zeros_like(sk)
outside[0, :] = ~sk[0, :]; outside[-1, :] = ~sk[-1, :]; outside[:, 0] = ~sk[:, 0]; outside[:, -1] = ~sk[:, -1]
while True:
    g = grow(outside, 1) & ~sk
    if (g == outside).all():
        break
    outside = g
facem = ~outside & ~hair
inner = blur(shrink(facem, 12), 10)
inner = np.clip(inner * 1.15, 0, 1)


def ell(cx, cy, rx, ry, soft=14.0):  # やわらかいふちの楕円（1 = 中）
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    return np.clip((1 - d) * min(rx, ry) / soft + 0.5, 0, 1)


def eye_center(img, guess, r=46):
    """目の場所: 見当の近くにある、暗い所の重心。"""
    gx, gy = guess
    ys_, xs_ = np.mgrid[gy - r:gy + r, gx - r:gx + r]
    win = img[gy - r:gy + r, gx - r:gx + r]
    lum = win.mean(2)
    m = (lum < 0.45) & (((xs_ - gx) ** 2 + (ys_ - gy) ** 2) < r * r)
    if m.sum() < 30:
        return float(gx), float(gy)
    return float(xs_[m].mean()), float(ys_[m].mean())


N_EYES = [eye_center(front, g) for g in ((680, 572), (912, 572))]
N_MOUTH = (797, 664)
print('neutral eyes', np.round(N_EYES, 1))
ne = [(ex - x0, ey - y0) for ex, ey in N_EYES]
nm = (N_MOUTH[0] - x0, N_MOUTH[1] - y0)


USE = {}


def warp(name, guesses):
    """別の表情の参考画像を、両目の位置（大きさ・かたむきも）が ふつうの顔 に重なるように写す。"""
    img = load_px(name)
    eyes = [eye_center(img, g) for g in guesses]
    print(name, 'eyes', np.round(eyes, 1))
    (ax, ay), (bx, by) = eyes
    (cx_, cy_), (dx_, dy_) = N_EYES
    s = math.hypot(bx - ax, by - ay) / math.hypot(dx_ - cx_, dy_ - cy_)
    rot = math.atan2(by - ay, bx - ax) - math.atan2(dy_ - cy_, dx_ - cx_)
    mx, my = (ax + bx) / 2, (ay + by) / 2
    nx, ny = (cx_ + dx_) / 2, (cy_ + dy_) / 2
    px_, py_ = xx + x0 - nx, yy + y0 - ny
    sx = (px_ * math.cos(rot) - py_ * math.sin(rot)) * s + mx
    sy = (px_ * math.sin(rot) + py_ * math.cos(rot)) * s + my
    ix = np.clip(sx.astype(int), 0, img.shape[1] - 2)
    iy = np.clip(sy.astype(int), 0, img.shape[0] - 2)
    fx = (sx - ix)[:, :, None]
    fy = (sy - iy)[:, :, None]
    out = img[iy, ix] * (1 - fx) * (1 - fy) + img[iy, ix + 1] * fx * (1 - fy) + img[iy + 1, ix] * (1 - fx) * fy + img[iy + 1, ix + 1] * fx * fy
    # 肌の明るさと色みを ふつうの顔 にそろえる（顔の内側の肌どうしでくらべる）
    sel = skin_of(out) & facem & ~hair_of(out)
    gain = np.median(base[skin_of(base) & facem].reshape(-1, 3), axis=0) / np.median(out[sel].reshape(-1, 3), axis=0)
    out = np.clip(out * gain, 0, 1)
    # その表情の絵の前髪がかかっている所は使わない（ふつうの顔 のままにする）
    # その表情の絵で、顔でない物（上げたうでの青いそで・白い背景）が写っている所も使わない
    other = (out[:, :, 2] > out[:, :, 0] + 0.04) | (out.min(2) > 0.93)
    use = inner * np.clip(1 - blur(grow(hair_of(out), 3), 4) * 1.5, 0, 1) * np.clip(1 - blur(grow(other, 6), 5) * 1.6, 0, 1)
    use = np.minimum(use, blur(use, 8))  # 境目をさらにやわらかく（内側へだけ広げる）
    use = blur(use, 4)
    USE[name] = use
    return base * (1 - use[:, :, None]) + out * use[:, :, None], out


def mix(dst_img, src_img, m):
    return dst_img * (1 - m[:, :, None]) + src_img * m[:, :, None]


cells = {'normal': base}
cells['happy'], happy_raw = warp('cheer-happy', ((636, 586), (896, 586)))
ORDER = ['normal', 'happy']
atlas = np.zeros((CH, CW * len(ORDER), 4), np.float32)
for i, n in enumerate(ORDER):
    atlas[:, i * CW:(i + 1) * CW, :3] = cells[n]
    atlas[:, i * CW:(i + 1) * CW, 3] = alpha
if BMODE:
    import json
    bskin = np.array(json.load(open(os.environ['B_JSON']))['face_skin'], np.float32)
    sel = skin_of(happy_raw) & facem & ~hair_of(happy_raw)
    hk = np.clip(happy_raw * (bskin / np.median(happy_raw[sel].reshape(-1, 3), axis=0)), 0, 1)
    print('B face skin', np.round(bskin, 3))
    atlas[:, :CW, 3] = 0  # ふつう: B の顔のまま
    # うれしい: 膜のふちの色は下の肌の色にそろえる（透明な所の色が白いと、ふちに うすい線が出ていた。2026-11-12）
    u_ = np.clip(USE['cheer-happy'] * 3, 0, 1)[:, :, None]
    atlas[:, :CW, :3] = bskin
    atlas[:, CW:, :3] = hk * u_ + bskin * (1 - u_)
    hg = np.load(os.environ['B_JSON'].replace('.json', '.hair.npy'))  # 上が 0 行目・200x120
    hgc = hg[(yy * hg.shape[0] / CH).astype(int).clip(0, hg.shape[0] - 1), (xx * hg.shape[1] / CW).astype(int).clip(0, hg.shape[1] - 1)] > 0.5
    keep_b = np.clip(1 - blur(hgc, 2) * 1.3, 0, 1)  # B の前髪がある所は膜を出さない
    atlas[:, CW:, 3] = np.clip(USE['cheer-happy'] * 1.1, 0, 1) * keep_b
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
    bones['upperarm' + n] = ((sg * 0.135, TY + 0.01, 0.49), (sg * 0.185, TY + 0.01, 0.375), 'chest')
    bones['forearm' + n] = ((sg * 0.185, TY + 0.01, 0.375), (sg * 0.215, TY, 0.255), 'upperarm' + n)
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
for g_ in [g for g in proxy.vertex_groups if g.name in ('armL', 'armR')]:
    proxy.vertex_groups.remove(g_)
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


ARM_X, ARM_Z1 = 0.142, 0.405
ARM_GROUPS = None


def sstep(t):
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def arm_amount(co):
    """うでの骨にどれだけ付くか。わきの溝（左右 0.142）をはさんで、なめらかに 0 → 1。"""
    ax = abs(co.x)
    if co.z < 0.15 or co.z > 0.545:
        return 0.0
    if co.z < 0.27:
        xs_ = 0.158  # 手は体から離れている（すき間のまん中で分ける）
    elif co.z < ARM_Z1:
        xs_ = ARM_X
    else:
        xs_ = ARM_X + (co.z - ARM_Z1) / (0.53 - ARM_Z1) * (0.10 - ARM_X)  # わきから肩のてっぺんへ、ななめの境目
    return sstep((ax - xs_) / 0.03 + 0.5)


def skin_to(ob, fixed=None):
    global ARM_GROUPS
    ARM_GROUPS = None
    marks = [g for g in ob.vertex_groups if g.name in ('armL', 'armR')]
    if marks and not fixed:
        idx = {g.index for g in marks}
        ARM_GROUPS = {v.index for v in ob.data.vertices if any(g.group in idx and g.weight > 0.5 for g in v.groups)}
        print('arm verts (separated)', len(ARM_GROUPS))
    for g in marks:
        ob.vertex_groups.remove(g)
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
        for gi, n in enumerate(gnames):
            if 'arm' in n:
                w[gi] = 0
        if w.sum() <= 1e-6:
            w[gnames.index('chest' if v.co.z > WAIST else 'hips')] = 1
        w /= w.sum()
        # あし: 反対側のあしの骨は使わない。短パンは腰に付け、すそへ向かって少しずつ あし に付ける。取った分は腰へ
        moved = 0.0
        for gi, n in enumerate(gnames):
            if 'thigh' in n or 'shin' in n:
                keep = sstep((0.215 - v.co.z) / 0.08)
                if (v.co.x > 0) != n.endswith('L') or (abs(v.co.x) < 0.018 and v.co.z > 0.135):
                    keep = 0.0
                moved += w[gi] * (1 - keep)
                w[gi] *= keep
        w[gnames.index('hips')] += moved
        a_ = arm_amount(v.co)
        if ARM_GROUPS is not None:
            a_ = 1.0 if v.index in ARM_GROUPS else 0.0
        if a_ > 0:
            side = 'L' if v.co.x > 0 else 'R'
            fore = sstep((0.40 - v.co.z) / 0.05)
            w *= (1 - a_)
            w[gnames.index('upperarm' + side)] += a_ * (1 - fore)
            w[gnames.index('forearm' + side)] += a_ * fore
        for gi, x in enumerate(w):
            if x > 0.02:
                ob.vertex_groups[gnames[gi]].add([v.index], float(x), 'REPLACE')
    mod = ob.modifiers.new('Armature', 'ARMATURE')
    mod.object = ao
    ob.parent = ao


skin_to(av)
if pack is not None:
    skin_to(pack, 'chest')
skin_to(face, 'head')
for n in gnames:
    print('weights', n, sum(1 for v in me.vertices if any(av.vertex_groups[g.group].name == n and g.weight > 0.5 for g in v.groups)))

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=False, export_normals=True, export_texcoords=True,
                          export_vertex_color='ACTIVE', export_skins=True, export_animations=False, export_yup=True,
                          export_image_format='WEBP', export_image_quality=84)
print('saved', dst)

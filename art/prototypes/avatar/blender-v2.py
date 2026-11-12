# S2: boy-b-skin.glb から boy-b-v2.glb を作る（うでの切り口・肩の重み・骨 14 本・決めた形の動き・顔の差し替え）。
# 実行: blender -b -P blender-v2.py -- <出力 glb>   （環境変数 STEP=2|3|4 で、どこまでやるか。既定 4 = 全部）
# 元の boy-b-skin.glb は読むだけ（上書きしない）。
import bpy, bmesh, sys, os, math, numpy as np
from mathutils import Matrix, Vector, kdtree

STEP = int(os.environ.get('STEP', '4'))
HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, 'boy-b-skin.glb')
DST = sys.argv[sys.argv.index('--') + 1]
FPS = 30
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
for o in list(bpy.data.objects):
    if o.name.startswith('Icosphere'):  # 前の版に紛れていた使わない球
        bpy.data.objects.remove(o)
rig = bpy.data.objects['rig']
av = bpy.data.objects['avatar']
plate = bpy.data.objects['face']
me = av.data
print('rig matrix identity', rig.matrix_world == Matrix())


def sstep(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


# ===================== 2. うでの切り口と肩の重み =====================
GI = {g.name: g.index for g in av.vertex_groups}
ARMG = {GI[n] for n in GI if 'arm' in n}
CAPX = 0.142
ARMBLEND = float(os.environ.get('ARMBLEND', '0.45'))
bm = bmesh.new()
bm.from_mesh(me)
dl = bm.verts.layers.deform.active
uvl = bm.loops.layers.uv.active
bm.verts.ensure_lookup_table()


def armw(v):
    return sum(w for g, w in v[dl].items() if g in ARMG)


def on_cap(f):
    return all(abs(abs(v.co.x) - CAPX) < 3e-4 for v in f.verts)


capk = bm.faces.layers.int.new('capk')
body_caps_L = []  # 測る用: 元の体側の切り口（左）の (y, z) の中心と面積
for f in bm.faces:
    if on_cap(f):
        k = 2 if armw(f.verts[0]) > 0.5 else 1
        f[capk] = k
        if k == 1 and f.verts[0].co.x > 0:
            c = f.calc_center_median()
            body_caps_L.append((c.y, c.z, f.calc_area()))
print('caps body', sum(1 for f in bm.faces if f[capk] == 1), 'arm', sum(1 for f in bm.faces if f[capk] == 2))
# 切り口の色: 平らな「そでの青 1 点」をやめ、近くの胴（体側）／そで（うで側）の絵の場所を写す
# うでの陰（わきの前後）に描かれていた手・肌の色を、近くの胴の色に塗りかえる（うでを振ると見えるため）
_img = next(n.image for n in me.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
_W, _H = _img.size
_px = np.empty(_W * _H * 4, np.float32)
_img.pixels.foreach_get(_px)
_px = _px.reshape(_H, _W, 4)


def skinlike(uv):
    c = _px[int(uv[1] * _H) % _H, int(uv[0] * _W) % _W]
    return c[0] > 0.6 and c[0] > c[2] + 0.15


kd_src = {1: [], 2: []}
for f in bm.faces:
    if f[capk]:
        continue
    for l in f.loops:
        v = l.vert
        if abs(v.co.x) > 0.09 and 0.2 < v.co.z < 0.56:
            if armw(v) > 0.5 and (v.co.z < 0.31 or f.normal.x * v.co.x < 0.3 * abs(v.co.x)):  # うで側は外向きのそでの面だけ（手・内側の肌色は使わない）
                continue
            if skinlike(l[uvl].uv):  # 肌・ひもの色は切り口に使わない
                continue
            kd_src[2 if armw(v) > 0.5 else 1].append((v.co.copy(), l[uvl].uv.copy()))
kds = {}
for k, pts in kd_src.items():
    t = kdtree.KDTree(len(pts))
    for i, (co, _) in enumerate(pts):
        t.insert(co, i)
    t.balance()
    kds[k] = t
# 体側は内へへこんだ丸い面、うで側は体の方へふくらむ面に（3 段の内側への縁取り）
for k, depth in ((1, -0.0045), (2, 0.004)):
    for side in (1, -1):
        faces = [f for f in bm.faces if f[capk] == k and f.verts[0].co.x * side > 0]
        cv = {v for f in faces for v in f.verts}
        lo = Vector((min(v.co.x for v in cv), min(v.co.y for v in cv), min(v.co.z for v in cv)))
        hi = Vector((max(v.co.x for v in cv), max(v.co.y for v in cv), max(v.co.z for v in cv)))
        for _ in range(3):
            r = bmesh.ops.inset_region(bm, faces=faces, thickness=0.007, depth=depth, use_even_offset=False)
            for nf in r['faces']:
                nf[capk] = k
        # 細い角で点が飛び出さないように、元の切り口の箱（x は ±2cm）の中へ戻す
        for f in faces:
            for v in f.verts:
                v.co.x = min(max(v.co.x, lo.x - 0.02), hi.x + 0.02)
                v.co.y = min(max(v.co.y, lo.y), hi.y)
                v.co.z = min(max(v.co.z, lo.z), hi.z)
for f in bm.faces:  # 面ごとに 1 色（点ごとに違う絵の島を指すと、絵をまたいだ筋が出るため）
    if f[capk]:
        _, i, _ = kds[f[capk]].find(f.calc_center_median())
        for l in f.loops:
            l[uvl].uv = kd_src[f[capk]][i][1]
def in_zone(co):
    return 0.125 < abs(co.x) and 0.25 < co.z < 0.50


src = []
for f in bm.faces:
    if f[capk] or armw(f.verts[0]) > 0.5:
        continue
    c = f.calc_center_median()
    if 0.07 < abs(c.x) and 0.2 < c.z < 0.56 and not skinlike(f.loops[0][uvl].uv):
        src.append((c, f.loops[0][uvl].uv.copy()))
kd_t = kdtree.KDTree(len(src))
for i, (c, _) in enumerate(src):
    kd_t.insert(c, i)
kd_t.balance()
nrep = 0
for f in bm.faces:
    if f[capk] or armw(f.verts[0]) > 0.5:
        continue
    c = f.calc_center_median()
    if in_zone(c) and skinlike(f.loops[0][uvl].uv):
        _, i, _ = kd_t.find(c)
        for l in f.loops:
            l[uvl].uv = src[i][1]
        nrep += 1
# うでの内側（体の方を向いた面）に描かれていた肌の色も、外側のそでの色に（うでを開くと見えるため）
for f in bm.faces:
    if f[capk] or armw(f.verts[0]) < 0.5:
        continue
    c = f.calc_center_median()
    if c.z > 0.31 and skinlike(f.loops[0][uvl].uv):
        _, i, _ = kds[2].find(c)
        for l in f.loops:
            l[uvl].uv = kd_src[2][i][1]
        nrep += 1
print('armpit skin faces repainted', nrep)
nw = sum(1 for v in bm.verts if not v[dl])
print('verts without weight after inset', nw)
# 肩の重み: うでの上のはし（z 0.45〜0.53）は胸にも少し付け、体側の肩のはしは うで に少し付ける（0/1 の切り替えをやめる）
CH = GI['chest']
for v in bm.verts:
    d = v[dl]
    a = armw(v)
    z, ax = v.co.z, abs(v.co.x)
    if a > 0.5:
        s = 0.5 * sstep((z - 0.45) / 0.08) if z > 0.45 else 0.0
        if ARMBLEND and 0.24 < z < 0.52:  # 2 回目: うでの切り口のまわり（わきの面から 2.5cm）は胸にも付けて、切り口が半分だけ回るように
            s = max(s, ARMBLEND * sstep(1 - (ax - CAPX) / 0.025))
    elif a <= 0.5 and z > 0.45 and ax > 0.11:
        s = 0.3 * sstep((ax - 0.11) / 0.032) * sstep((z - 0.45) / 0.05)
    else:
        continue
    if s <= 0:
        continue
    tgt = CH if a > 0.5 else GI['upperarm' + ('L' if v.co.x > 0 else 'R')]
    for g in list(d.keys()):
        d[g] = d[g] * (1 - s)
    d[tgt] = d.get(tgt, 0.0) + s
co_ = np.array([v.co[:] for v in bm.verts])
print('bbox after caps', co_.min(0).round(3), co_.max(0).round(3))
bm.to_mesh(me)
bm.free()
me.update()

# ===================== 3. 骨を足す（足先 2・リュック 1 → 14 本） =====================
bpy.context.view_layer.objects.active = rig
if STEP >= 3:
    bpy.ops.object.mode_set(mode='EDIT')
    eb = rig.data.edit_bones
    for s, sg in (('L', 1), ('R', -1)):
        b = eb.new('foot' + s)
        b.head, b.tail = (sg * 0.068, -0.02, 0.045), (sg * 0.068, -0.11, 0.02)
        b.parent = eb['shin' + s]
    b = eb.new('pack')
    b.head, b.tail = (0, 0.09, 0.50), (0, 0.11, 0.30)
    b.parent = eb['chest']
    bpy.ops.object.mode_set(mode='OBJECT')
    for n in ('footL', 'footR', 'pack'):
        av.vertex_groups.new(name=n)
    GI = {g.name: g.index for g in av.vertex_groups}
    nfoot = npack = 0
    for v in me.vertices:
        x, y, z = v.co
        ws = {g.group: g.weight for g in v.groups}
        a = sum(w for g, w in ws.items() if g in {GI[n] for n in GI if 'arm' in n})
        if z < 0.09:
            f = sstep((0.0 - y) / 0.05) * sstep((0.085 - z) / 0.03)
            s = 'L' if x > 0 else 'R'
            if f > 0.01:
                sh = GI['shin' + s]
                take = ws.get(sh, 0.0) * f
                if take > 0:
                    av.vertex_groups['shin' + s].add([v.index], ws[sh] - take, 'REPLACE')
                    av.vertex_groups['foot' + s].add([v.index], take, 'REPLACE')
                    nfoot += 1
        elif a < 0.5 and abs(x) < 0.18:
            p = sstep((y - 0.075) / 0.03) * sstep((0.53 - z) / 0.03) * sstep((z - 0.225) / 0.02)
            if p > 0.01:
                for g, w in ws.items():
                    av.vertex_groups[av.vertex_groups[g].name].add([v.index], w * (1 - p), 'REPLACE')
                av.vertex_groups['pack'].add([v.index], p, 'REPLACE')
                npack += 1
    print('foot verts', nfoot, 'pack verts', npack)

# ===================== 形を付ける道具（体の座標で、骨の根元を中心に回す） =====================
AXV = {'X': 'X', 'Y': 'Y', 'Z': 'Z'}


def reset():
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()


def rot(name, *rots, offset=None):
    pb = rig.pose.bones.get(name)
    if pb is None:
        return
    h = pb.head.copy()
    R = Matrix.Identity(4)
    for axis, ang in rots:
        R = R @ Matrix.Rotation(ang, 4, axis)
    M = Matrix.Translation(h) @ R @ Matrix.Translation(-h)
    if offset is not None:
        M = Matrix.Translation(offset) @ M
    pb.matrix = M @ pb.matrix
    bpy.context.view_layer.update()


def g(p, k):
    return p.get(k, 0.0)


def apply(p):
    reset()
    rot('hips', ('Z', g(p, 'hipTwist')), ('Y', g(p, 'hipRoll')), ('X', g(p, 'lean')), offset=Vector((0, 0, g(p, 'y'))))
    rot('chest', ('Z', g(p, 'chestTwist')), ('Y', g(p, 'chestRoll')), ('X', g(p, 'chestLean')))
    br = g(p, 'breath')
    if br:
        rig.pose.bones['chest'].scale = (1 + br, 1, 1 + br)
        rig.pose.bones['head'].scale = (1 / (1 + br), 1, 1 / (1 + br))
        bpy.context.view_layer.update()
    rot('head', ('Z', g(p, 'headTwist')), ('X', g(p, 'headPitch')))
    rot('pack', ('Y', g(p, 'packRoll')), ('X', g(p, 'pack')))
    for s, sg in (('L', 1), ('R', -1)):
        rot('upperarm' + s, ('Y', -sg * g(p, 'armOut')), ('X', -g(p, 'arm' + s)))
        rot('forearm' + s, ('X', -g(p, 'elbow' + s)))
        rot('thigh' + s, ('Y', -sg * g(p, 'legOut')), ('X', -g(p, 'thigh' + s)))
        rot('shin' + s, ('X', g(p, 'knee' + s)))
        rot('foot' + s, ('X', g(p, 'foot' + s)))


# ===================== うでの切り口の見え方を測る（S1 と同じ測り方: 横から見て、体側の元の切り口がうでの切り口に隠れない割合） =====================
def exposed(p):
    apply(p)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = av.evaluated_get(dg)
    em = ev.to_mesh()
    ck = em.attributes.get('capk')
    tri = []
    bodyc = []
    for poly in em.polygons:
        if ck and ck.data[poly.index].value == 1 and em.vertices[poly.vertices[0]].co.x > 0:
            c = poly.center
            bodyc.append((c.y, c.z, poly.area))
        if ck and ck.data[poly.index].value == 2 and em.vertices[poly.vertices[0]].co.x > 0:
            vs = [em.vertices[i].co for i in poly.vertices]
            for k in range(1, len(vs) - 1):
                tri.append([(vs[0].y, vs[0].z), (vs[k].y, vs[k].z), (vs[k + 1].y, vs[k + 1].z)])
    ev.to_mesh_clear()
    T = np.array(tri)
    A, B, C = T[:, 0], T[:, 1], T[:, 2]

    def cr(P, Q, c):
        return (Q[:, 0] - P[:, 0]) * (c[1] - P[:, 1]) - (Q[:, 1] - P[:, 1]) * (c[0] - P[:, 0])
    tot = cov = 0.0
    for (y, z, ar) in bodyc:
        c = (y, z)
        d1, d2, d3 = cr(A, B, c), cr(B, C, c), cr(C, A, c)
        inside = ((d1 >= 0) & (d2 >= 0) & (d3 >= 0)) | ((d1 <= 0) & (d2 <= 0) & (d3 <= 0))
        tot += ar
        cov += ar * inside.any()
    return 1 - cov / tot


# 測る形: 左うでを前に一番振ったとき・後ろに一番振ったとき
TESTS = {
    'walk front (0.28)': {'armL': 0.28, 'elbowL': 0.44},
    'walk back (-0.28)': {'armL': -0.28, 'elbowL': 0.2},
    'run front (0.55)': {'armL': 0.55, 'elbowL': 1.57, 'armOut': 0.12, 'lean': 0.22},
    'run back (-0.45)': {'armL': -0.45, 'elbowL': 1.33, 'armOut': 0.12, 'lean': 0.22},
    'S1 old walk (0.45)': {'armL': 0.45, 'elbowL': 0.35},
}
for k, p in TESTS.items():
    print(f'EXPOSE {k}: {exposed(p) * 100:.0f}%')


# ===================== 3. 動き（決めた形をなめらかにつなぐ。折れ目なし） =====================
def spline(keys, ph):
    """周期 1 の決めた値 [(位相, 値)] を、なめらかな 3 次の曲線（Catmull-Rom）でつなぐ"""
    ph %= 1.0
    n = len(keys)
    P = [k[0] for k in keys]
    V = [k[1] for k in keys]
    i = max(j for j in range(n) if P[j] <= ph) if ph >= P[0] else n - 1

    def at(j):
        q, s = divmod(j, n)
        return P[s] + q, V[s]
    p0, v0 = at(i - 1)
    p1, v1 = at(i)
    p2, v2 = at(i + 1)
    p3, v3 = at(i + 2)
    if ph < p1:
        ph += 1
    m1 = (v2 - v0) / (p2 - p0)
    m2 = (v3 - v1) / (p3 - p1)
    h = p2 - p1
    t = (ph - p1) / h
    t2, t3 = t * t, t * t * t
    return (2 * t3 - 3 * t2 + 1) * v1 + (t3 - 2 * t2 + t) * h * m1 + (-2 * t3 + 3 * t2) * v2 + (t3 - t2) * h * m2


TAU = 2 * math.pi
WALK = {
    'thigh': [(0, .40), (.12, .30), (.30, .02), (.50, -.32), (.60, -.22), (.75, .18), (.88, .42)],
    'knee': [(0, .05), (.10, .22), (.30, .06), (.48, .12), (.62, .70), (.78, .45), (.92, .08)],
    'foot': [(0, -.22), (.10, 0), (.40, .08), (.55, .42), (.65, .28), (.80, -.05), (.92, -.2)],
}
RUN = {
    'thigh': [(0, .55), (.15, .25), (.30, -.20), (.40, -.38), (.52, -.10), (.68, .55), (.82, 1.0), (.93, .85)],
    'knee': [(0, .35), (.10, .65), (.28, .40), (.40, .55), (.52, 1.95), (.66, 1.85), (.82, 1.45), (.94, .6)],
    'foot': [(0, -.1), (.1, .05), (.3, .35), (.42, .7), (.6, .5), (.8, .1), (.92, -.1)],
}


def gait(ph, K, run):
    p = {}
    for s, o in (('L', 0.0), ('R', 0.5)):
        q = ph + o
        p['thigh' + s] = spline(K['thigh'], q)
        p['knee' + s] = spline(K['knee'], q)
        p['foot' + s] = spline(K['foot'], q)
        sg = 1 if s == 'L' else -1
        A = 0.5 if run else 0.28
        c = math.cos(TAU * (q - 0.04))
        p['arm' + s] = -A * c + (0.05 if run else 0.0)
        ce = math.cos(TAU * (q - 0.07))
        p['elbow' + s] = (1.45 + 0.12 * -ce) if run else (0.32 + 0.12 * -ce)
        del sg
    c = math.cos(TAU * ph)
    sn = math.sin(TAU * ph)
    p['hipTwist'] = -(0.12 if run else 0.10) * c
    p['chestTwist'] = (0.20 if run else 0.17) * math.cos(TAU * (ph - 0.03))
    p['headTwist'] = -(p['hipTwist'] + p['chestTwist']) * 0.8
    p['hipRoll'] = -0.035 * sn
    p['chestRoll'] = 0.05 * math.sin(TAU * (ph - 0.03))
    p['lean'] = 0.22 if run else 0.05
    p['chestLean'] = 0.04 if run else 0.0
    # 頭は体の上下から約 0.05 秒おくれてうなずく
    lag = 0.05 / (0.6 if run else 1.0)
    p['headPitch'] = (-0.18 if run else -0.04) + (0.04 if run else 0.025) * math.sin(2 * TAU * (ph - 0.1 - lag))
    p['pack'] = (0.05 if run else 0.0) + (0.08 if run else 0.04) * math.sin(2 * TAU * (ph - 0.2))
    p['packRoll'] = 0.03 * math.sin(TAU * (ph - 0.15))
    p['armOut'] = 0.12 if run else 0.04
    return p


def joy(ph):
    k = spline([(0, .15), (.15, .55), (.3, .1), (.55, .2), (.75, .55), (.9, .25)], ph)
    p = {'armOut': 0.55 + 0.15 * math.sin(TAU * ph), 'headPitch': -0.1, 'pack': 0.04 * math.sin(TAU * (ph - 0.35))}
    for s in 'LR':
        p['knee' + s] = k
        p['thigh' + s] = k * 0.5
        p['foot' + s] = -(k - k * 0.5)
        p['arm' + s] = 0.3 + 0.1 * math.sin(TAU * ph)
        p['elbow' + s] = 0.6
    return p


def idle(ph):
    b = 0.5 - 0.5 * math.cos(TAU * ph)
    p = {'breath': 0.015 * b, 'chestLean': -0.012 * b, 'headPitch': -0.01 + 0.012 * b, 'armOut': 0.03 + 0.02 * b, 'pack': 0.01 * b}
    for s in 'LR':
        p['elbow' + s] = 0.15
    return p


def lift_run(ph):  # 両足が浮く時間（0.3〜0.5・0.8〜1.0）に体を持ち上げる
    c = math.cos(2 * TAU * (ph - 0.4))
    return 0.03 * max(0.0, c) ** 2


def lift_joy(ph):
    if 0.25 < ph < 0.62:
        return 0.05 * math.sin(math.pi * (ph - 0.25) / 0.37) ** 2
    return 0.0


ACTS = {
    'walk': (30, lambda ph: gait(ph, WALK, False), lambda ph: 0.0),
    'run': (18, lambda ph: gait(ph, RUN, True), lift_run),
    'idle': (90, idle, None),
    'joy': (24, joy, lift_joy),
}


def ground_clear():
    """足の一番低い所の、立ち姿からの高さ（かかと・つま先）"""
    m = 9.0
    for s in 'LR':
        f = rig.pose.bones['foot' + s]
        m = min(m, f.head.z - REST_ANKLE, f.tail.z - REST_TOE)
    return m


if STEP >= 3:
    reset()
    REST_ANKLE, REST_TOE = rig.pose.bones['footL'].head.z, rig.pose.bones['footL'].tail.z
    bpy.context.scene.render.fps = FPS
    rig.animation_data_create()
    for name, (N, fn, lift) in ACTS.items():
        ys = np.zeros(N)
        if lift is not None:  # 1 回目: 足が地面に着くように体の高さを決める（足の形から上下が自然に出る）
            for i in range(N):
                apply(fn(i / N))
                ys[i] = -ground_clear()
            k = np.array([0.25, 0.5, 0.25])  # 角を取る（周期のままなめらかに）
            for _ in range(2):
                ys = k[0] * np.roll(ys, 1) + k[1] * ys + k[2] * np.roll(ys, -1)
            ys += np.array([lift(i / N) for i in range(N)])
        act = bpy.data.actions.new(name)
        rig.animation_data.action = act
        for i in range(N + 1):  # 最後のコマ = 最初のコマ（つなぎ目なし）
            p = fn((i % N) / N)
            if lift is not None:
                p['y'] = float(ys[i % N])
            apply(p)
            for pb in rig.pose.bones:
                pb.keyframe_insert('rotation_quaternion', frame=i)
                pb.keyframe_insert('location', frame=i)
                pb.keyframe_insert('scale', frame=i)
        print('action', name, 'frames', N, 'sec', N / FPS, 'y range %.3f..%.3f' % (ys.min(), ys.max()))
        tr = rig.animation_data.nla_tracks.new()
        tr.name = name
        tr.strips.new(name, 0, act)
        rig.animation_data.action = None
    reset()
    for k, p in {'run front (from action)': gait(0.5 + 0.04, RUN, True), 'run back (from action)': gait(0.04, RUN, True)}.items():
        print(f'EXPOSE {k}: {exposed(p) * 100:.0f}%')
    reset()

# ===================== 4. 顔: 顔の面だけ別の材質にして、4 こまの絵を切り替える =====================
if STEP >= 4:
    FX0, FX1, FZ0, FZ1 = -0.17, 0.17, 0.548, 0.752
    timg = av.data.materials[0].node_tree.nodes['Image Texture'].image if 'Image Texture' in av.data.materials[0].node_tree.nodes else next(n.image for n in av.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
    TW, TH = timg.size
    tex = np.empty(TW * TH * 4, np.float32)
    timg.pixels.foreach_get(tex)
    tex = tex.reshape(TH, TW, 4)[:, :, :3]  # 下が 0 行目
    fimg = next(n.image for n in plate.data.materials[0].node_tree.nodes if n.type == 'TEX_IMAGE')
    FW, FH = fimg.size
    CW, CHh = FW // 2, FH
    fpx = np.empty(FW * FH * 4, np.float32)
    fimg.pixels.foreach_get(fpx)
    fpx = fpx.reshape(FH, FW, 4)[::-1]  # 上が 0 行目
    happy = fpx[:, CW:CW * 2]

    def sample(u, v):
        x = np.clip(u * TW - 0.5, 0, TW - 1.001)
        y = np.clip(v * TH - 0.5, 0, TH - 1.001)
        x0, y0 = x.astype(int), y.astype(int)
        fx, fy = (x - x0)[:, None], (y - y0)[:, None]
        return (tex[y0, x0] * (1 - fx) * (1 - fy) + tex[y0, x0 + 1] * fx * (1 - fy) + tex[y0 + 1, x0] * (1 - fx) * fy + tex[y0 + 1, x0 + 1] * fx * fy)

    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv.active
    bm.faces.ensure_lookup_table()
    sel = [f for f in bm.faces if all(FX0 < v.co.x < FX1 and FZ0 < v.co.z < FZ1 for v in f.verts) and f.normal.y < -0.3]
    print('face polys', len(sel))
    # 正面から見た顔の絵（ふつう）を、体の絵から写し取る（いちばん手前の面を使う）
    normal = np.zeros((CHh, CW, 3), np.float32)
    depth = np.full((CHh, CW), 9.0, np.float32)
    cover = np.zeros((CHh, CW), bool)
    yy, xx = np.mgrid[0:CHh, 0:CW].astype(np.float32) + 0.5
    for f in sel:
        ls = list(f.loops)
        for k in range(1, len(ls) - 1):
            tri = [ls[0], ls[k], ls[k + 1]]
            P = np.array([((l.vert.co.x - FX0) / (FX1 - FX0) * CW, (FZ1 - l.vert.co.z) / (FZ1 - FZ0) * CHh) for l in tri])
            D = np.array([l.vert.co.y for l in tri])
            UV = np.array([l[uvl].uv[:] for l in tri])
            x0, x1 = max(0, int(P[:, 0].min())), min(CW, int(P[:, 0].max()) + 2)
            y0, y1 = max(0, int(P[:, 1].min())), min(CHh, int(P[:, 1].max()) + 2)
            if x0 >= x1 or y0 >= y1:
                continue
            X, Y = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
            (ax, ay), (bx, by), (cx, cy) = P
            den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
            if abs(den) < 1e-9:
                continue
            w0 = ((by - cy) * (X - cx) + (cx - bx) * (Y - cy)) / den
            w1 = ((cy - ay) * (X - cx) + (ax - cx) * (Y - cy)) / den
            w2 = 1 - w0 - w1
            ins = (w0 >= -1e-4) & (w1 >= -1e-4) & (w2 >= -1e-4)
            d = w0 * D[0] + w1 * D[1] + w2 * D[2]
            ins &= d < depth[y0:y1, x0:x1]
            if not ins.any():
                continue
            u = (w0 * UV[0, 0] + w1 * UV[1, 0] + w2 * UV[2, 0])[ins]
            v = (w0 * UV[0, 1] + w1 * UV[1, 1] + w2 * UV[2, 1])[ins]
            sub = normal[y0:y1, x0:x1]
            sub[ins] = sample(u, v)
            depth[y0:y1, x0:x1][ins] = d[ins]
            cover[y0:y1, x0:x1] |= ins
    # 覆っていない所は近い色でうめる（ふちのにじみ止め）
    for _ in range(12):
        m = cover.astype(np.float32)
        acc = np.zeros_like(normal)
        cnt = np.zeros_like(m)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(np.roll(normal * m[:, :, None], dy, 0), dx, 1)
            cnt += np.roll(np.roll(m, dy, 0), dx, 1)
        grow = (~cover) & (cnt > 0)
        normal[grow] = acc[grow] / cnt[grow][:, None]
        cover = cover | grow

    def blur(a, n):
        a = a.astype(np.float32)
        for _ in range(n):
            a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5
        return a

    def erode(m, n):
        m = m.copy()
        for _ in range(n):
            m = m & np.roll(m, 1, 0) & np.roll(m, -1, 0) & np.roll(m, 1, 1) & np.roll(m, -1, 1)
        return m
    cov0 = depth < 9.0
    # まばたき・うれしい: 目（暗い所）を探す
    lum = normal @ np.array([0.3, 0.55, 0.15], np.float32)
    dark = (lum < 0.33) & cov0 & (yy > CHh * 0.25) & (yy < CHh * 0.85)
    # つながった暗い所を 2 つ（左右の目）取る
    lab = np.zeros(dark.shape, int)
    blobs = []
    for sy, sx in zip(*np.nonzero(dark)):
        if lab[sy, sx]:
            continue
        lid = len(blobs) + 1
        st = [(sy, sx)]
        lab[sy, sx] = lid
        pts = []
        while st:
            a_, b_ = st.pop()
            pts.append((a_, b_))
            for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                c_, d_ = a_ + da, b_ + db
                if 0 <= c_ < CHh and 0 <= d_ < CW and dark[c_, d_] and not lab[c_, d_]:
                    lab[c_, d_] = lid
                    st.append((c_, d_))
        blobs.append(np.array(pts))
    blobs.sort(key=len, reverse=True)
    eyes = sorted(blobs[:2], key=lambda b: b[:, 1].mean())
    EB = [(int(b[:, 0].min()), int(b[:, 1].min()), int(b[:, 0].max()), int(b[:, 1].max())) for b in eyes]  # (上, 左, 下, 右)
    print('eye boxes', EB)
    ink = np.median(normal[dark], axis=0) * 0.8

    def hsm(a, k=11):  # 横にならす
        pad = np.pad(a, ((k // 2, k // 2), (0, 0)), mode='edge')
        c = np.cumsum(np.vstack([np.zeros((1, a.shape[1])), pad]), 0)
        return (c[k:] - c[:-k]) / k

    def erase(img, box, pad, below=None):
        """箱（楕円）の中を、上と下の肌の色で縦に補ってぬる。below: この行より上だけぬる（半分のまぶた）"""
        r0, c0, r1, c1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
        top = hsm(img[r0 - 4:r0, c0:c1 + 1].mean(0))
        bot = hsm(img[r1 + 1:r1 + 5, c0:c1 + 1].mean(0))
        t = ((np.arange(r0, r1 + 1) - r0 + 0.5) / (r1 - r0 + 1))[:, None, None]
        full = img.copy()
        full[r0:r1 + 1, c0:c1 + 1] = top[None] * (1 - t) + bot[None] * t
        cy, cx, ry, rx = (r0 + r1) / 2, (c0 + c1) / 2, (r1 - r0) / 2 + 0.5, (c1 - c0) / 2 + 0.5
        nd = np.sqrt(((yy - 0.5 - cy) / ry) ** 2 + ((xx - 0.5 - cx) / rx) ** 2)
        m = np.clip((1.0 - nd) * min(rx, ry) / 4, 0, 1)
        if below is not None:
            m = m * np.clip(below - (yy - 0.5) + 0.5, 0, 1)
        return img * (1 - m[:, :, None]) + full * m[:, :, None]

    def stroke(img, pts, wid, col):
        """やわらかい線（点の列）を描く"""
        P = np.array(pts)
        out = img
        for (ya, xa), (yb, xb) in zip(P[:-1], P[1:]):
            vx, vy = xb - xa, yb - ya
            L2 = vx * vx + vy * vy + 1e-9
            t = np.clip(((xx - xa) * vx + (yy - ya) * vy) / L2, 0, 1)
            d = np.hypot(xx - (xa + t * vx), yy - (ya + t * vy))
            a = np.clip(wid / 2 + 0.5 - d, 0, 1)[:, :, None]
            out = out * (1 - a) + col * a
        return out

    PAD = 7

    def eyes_closed(img, frac):
        """frac = まぶたが下りた割合（0.5 半分・1 閉じ）"""
        out = img
        for (r0, c0, r1, c1) in EB:
            hgt, w = r1 - r0, c1 - c0
            cut = r0 + hgt * frac
            out = erase(out, (r0, c0, r1, c1), PAD, None if frac >= 0.99 else cut)
            lw = max(3.0, hgt * 0.11)
            xs_ = np.linspace(c0 + w * 0.06, c1 - w * 0.06, 14)
            sn = [math.sin(math.pi * (x_ - xs_[0]) / (xs_[-1] - xs_[0])) for x_ in xs_]
            if frac >= 0.99:  # 閉じ: 少し下へふくらむ線（目の下の方）
                ys_ = [r0 + hgt * 0.58 + hgt * 0.14 * s_ for s_ in sn]
            else:  # 半分: まぶたのふち（少し上へふくらむ）
                ys_ = [cut - hgt * 0.08 * s_ for s_ in sn]
            out = stroke(out, list(zip(ys_, xs_)), lw, ink)
        return out
    half = eyes_closed(normal, 0.5)
    closed = eyes_closed(normal, 1.0)
    # うれしい: ふつうの目と口を肌でぬってから、前の うれしい の絵から「目の線・口」だけを写す（肌・髪・ふちは ふつう のまま）
    hrgb, hal = happy[:, :, :3], np.clip(happy[:, :, 3], 0, 1)
    eb_ = max(b[2] for b in EB)
    mr0, mr1, mc0, mc1 = eb_ + 4, int(CHh * 0.97), EB[0][3], EB[1][1]

    def feat(img, alpha, lo=0.12):
        sk = np.median(img[(alpha > 0.95) & cov0], axis=0)
        return np.clip((np.linalg.norm(img - sk, axis=2) - lo) / 0.12, 0, 1) * alpha

    def bbox(m, r0, r1, c0, c1):
        sub = np.zeros_like(m)
        sub[r0:r1, c0:c1] = m[r0:r1, c0:c1]
        ys, xs = np.nonzero(sub)
        return (int(ys.min()), int(xs.min()), int(ys.max()), int(xs.max()))
    fn_ = feat(normal, cov0.astype(np.float32))
    fh_ = feat(hrgb, hal, 0.2)  # 口のまわりの明るい肌は写さない
    nmouth = bbox(fn_ > 0.5, mr0, mr1, mc0, mc1)
    hmouth = bbox(fh_ > 0.5, mr0, mr1, mc0, mc1)
    print('mouth normal', nmouth, 'happy', hmouth)
    base = normal
    for b in EB:
        base = erase(base, b, PAD)
    base = erase(base, nmouth, 5)

    def ell(box, pad):
        r0, c0, r1, c1 = box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad
        cy, cx, ry, rx = (r0 + r1) / 2, (c0 + c1) / 2, (r1 - r0) / 2 + 0.5, (c1 - c0) / 2 + 0.5
        nd = np.sqrt(((yy - 0.5 - cy) / ry) ** 2 + ((xx - 0.5 - cx) / rx) ** 2)
        return np.clip((1.0 - nd) * min(rx, ry) / 4, 0, 1)
    R = np.maximum.reduce([ell(EB[0], 16), ell(EB[1], 16), ell(hmouth, 3)])
    ha = fh_ * R
    happyc = base * (1 - ha[:, :, None]) + hrgb * ha[:, :, None]
    atlas = np.ones((CHh, CW * 4, 4), np.float32)
    for i, c in enumerate((normal, half, closed, happyc)):
        atlas[:, i * CW:(i + 1) * CW, :3] = np.clip(c, 0, 1)
    out_png = os.environ.get('FACE_PNG')
    aimg = bpy.data.images.new('face4', CW * 4, CHh, alpha=False)
    aimg.pixels.foreach_set(atlas[::-1].ravel())
    aimg.pack()
    if out_png:
        aimg.filepath_raw = out_png
        aimg.file_format = 'PNG'
        aimg.save()
    fmat = bpy.data.materials.new('face')
    fmat.use_nodes = True
    bsdf = fmat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Roughness'].default_value = 0.9
    tn = fmat.node_tree.nodes.new('ShaderNodeTexImage')
    tn.image = aimg
    tn.interpolation = 'Linear'
    fmat.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    me.materials.append(fmat)
    for f in sel:
        f.material_index = 1
        for l in f.loops:
            l[uvl].uv = (((l.vert.co.x - FX0) / (FX1 - FX0)) / 4, (l.vert.co.z - FZ0) / (FZ1 - FZ0))
    bm.to_mesh(me)
    bm.free()
    pm = plate.data.materials[0]
    bpy.data.objects.remove(plate)
    bpy.data.materials.remove(pm)
    fmat.name = 'face'  # 板の材質の名前と重なって face.001 になっていた
    print('face material', fmat.name)

# ===================== 頭（髪ふくむ）は頭の骨 100% に固定（胸の重みが混ざると、胸のひねり・呼吸で髪がぷるぷる揺れる） =====================
HEADG = av.vertex_groups['head']
nlock = 0
for v in me.vertices:
    z = v.co.z
    k = sstep((z - 0.72) / 0.06)  # 0.72 から 0.78 で、頭 100% へ
    if k <= 0.001:
        continue
    ws = {g.group: g.weight for g in v.groups}
    for gi, w in ws.items():
        if gi != HEADG.index:
            av.vertex_groups[gi].add([v.index], w * (1 - k), 'REPLACE')
    HEADG.add([v.index], ws.get(HEADG.index, 0.0) * (1 - k) + k, 'REPLACE')
    nlock += 1
print('head-locked verts', nlock)

# ===================== 書き出し =====================
if 'capk' in me.attributes:
    me.attributes.remove(me.attributes['capk'])
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=DST, export_format='GLB', export_apply=False, export_normals=True, export_texcoords=True,
                          export_skins=True, export_animations=STEP >= 3, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
                          export_yup=True, export_image_format='WEBP', export_image_quality=84, export_attributes=False)
tris = sum(len(p.vertices) - 2 for o in bpy.data.objects if o.type == 'MESH' for p in o.data.polygons)
print('SAVED', DST, 'bytes', os.path.getsize(DST), 'tris', tris, 'bones', len(rig.data.bones))

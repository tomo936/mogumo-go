# 星降るキリン（01）を段ごとに組み立てる。女の子（102）の build.py を写して直したもの（骨にしっぽ 2・耳 2 を足す。設計 2026-11-17-kirin-rig-design.md）。方針書 avatar-character-pipeline.md・詳細設計書 D5〜D10。
# 実行: blender -b -P build.py -- <段 2|3|31|4|45|5>   （前の段の .blend を work/ から読む。段 2 は生成の GLB から）
# 腕を切る・ふたをする処理は書かない（方針書 原則 1）。Blender で面を減らさない（D5-3）。
import bpy, bmesh, sys, os, math, json
import numpy as np
from collections import defaultdict

STAGE = int(sys.argv[sys.argv.index('--') + 1])
HERE = os.path.dirname(os.path.abspath(__file__))
CH = os.path.dirname(HERE)
WORK = os.path.join(CH, 'work'); os.makedirs(WORK, exist_ok=True)
CFG = json.load(open(os.path.join(CH, 'config.json')))
LOG = {}


def hsv(K):
    mx = K.max(-1); mn = K.min(-1); d = np.maximum(mx - mn, 1e-6)
    s = (mx - mn) / np.maximum(mx, 1e-6); r, g, b = K[..., 0], K[..., 1], K[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, s, mx


def in_class(K, c):
    h, s, v = hsv(K); m = np.ones(h.shape, bool)
    if 'h' in c:
        lo, hi = c['h']; m &= ((h >= lo) & (h <= hi)) if lo <= hi else ((h >= lo) | (h <= hi))
    if 's' in c: m &= (s >= c['s'][0]) & (s <= c['s'][1])
    if 'v' in c: m &= (v >= c['v'][0]) & (v <= c['v'][1])
    return m


def tex_of(ob):
    for n in ob.data.materials[0].node_tree.nodes:
        if n.type == 'TEX_IMAGE': return n.image


def pixels(img):
    W, H = img.size; a = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(a); return a.reshape(H, W, 4)


def face_data(ob, img):
    """面ごとの 重心・法線・面積・絵の色（面の中の 4 点の平均）"""
    me = ob.data; P = pixels(img)[:, :, :3]; H, W = P.shape[:2]
    n = len(me.polygons)
    fc = np.empty(n * 3, np.float32); me.polygons.foreach_get('center', fc); fc = fc.reshape(n, 3)
    fn = np.empty(n * 3, np.float32); me.polygons.foreach_get('normal', fn); fn = fn.reshape(n, 3)
    fa = np.empty(n, np.float32); me.polygons.foreach_get('area', fa)
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 3, 2)
    pts = [uv.mean(1)] + [(uv[:, i] * 2 + uv[:, (i + 1) % 3] + uv[:, (i + 2) % 3]) / 4 for i in range(3)]
    col = np.zeros((n, 3))
    for p in pts:
        col += P[(np.clip(p[:, 1], 0, 1) * (H - 1)).astype(int), (np.clip(p[:, 0], 0, 1) * (W - 1)).astype(int)]
    return fc, fn, fa, col / len(pts), uv


def face_adj(me):
    """辺でつながる面どうし"""
    bm = bmesh.new(); bm.from_mesh(me); bm.edges.ensure_lookup_table()
    adj = [[] for _ in range(len(me.polygons))]
    for e in bm.edges:
        fs = [f.index for f in e.link_faces]
        for a in fs:
            for b in fs:
                if a != b: adj[a].append(b)
    bm.free(); return adj


def components(mask, adj):
    lab = -np.ones(len(mask), int); comps = []
    for s in np.nonzero(mask)[0]:
        if lab[s] >= 0: continue
        st = [s]; lab[s] = len(comps); c = []
        while st:
            a = st.pop(); c.append(a)
            for b in adj[a]:
                if mask[b] and lab[b] < 0: lab[b] = len(comps); st.append(b)
        comps.append(np.array(c))
    return comps, lab


def save(name):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, name), compress=True)


def vneighbors(me):
    E = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    nbr = [[] for _ in range(len(me.vertices))]
    for a_, b_ in E: nbr[a_].append(b_); nbr[b_].append(a_)
    return nbr


# 区分けの名前（点ごとの区分け lab と、面ごとの seg に使う。面の seg は点の多数決）
NAMES = ['fur', 'earin', 'paw', 'hoof', 'horn', 'gold', 'pack', 'strap', 'collar', 'eyes', 'tuft']
NI = {n: i for i, n in enumerate(NAMES)}


# ===================================================================== 段 2: 向き・大きさ・掃除・区分け（色は段 45 で塗り直すので、ここでは直さない）
# キリン: 区分けは 毛（fur。色は段 45 で場所から決めるグラデーション）・耳の内側・手（paw）・ひづめ（hoof）・角の茎（horn）・金（星・飾り）・
# リュック・肩ひも・首輪・目・しっぽの毛束（tuft）。場所（形の目印）を先に使い、色は補いに使う
if STAGE == 2:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(CH, 'src', CFG['generate']['file']))
    ob = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
    ob.name = 'avatar'; ob.data.name = 'avatar'
    me = ob.data
    me.transform(ob.matrix_world); ob.matrix_world.identity()
    V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    zmin, zmax = V[:, 2].min(), V[:, 2].max(); s = 1.0 / (zmax - zmin)
    cx, cy = (V[:, 0].max() + V[:, 0].min()) / 2, (V[:, 1].max() + V[:, 1].min()) / 2
    V = np.stack([(V[:, 0] - cx) * s, (V[:, 1] - cy) * s, (V[:, 2] - zmin) * s], 1)
    me.vertices.foreach_set('co', V.ravel()); me.update()
    bm = bmesh.new(); bm.from_mesh(me)
    n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=0.0005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    LOG['merged_verts'] = n0 - len(bm.verts)
    bm.to_mesh(me); bm.free(); me.update()
    for p in me.polygons: p.use_smooth = True
    img = tex_of(ob); img.name = 'body'
    fc, fn, fa, col, uv = face_data(ob, img)
    LOG['tris'] = len(me.polygons)
    L = CFG['landmarks']
    nv = len(me.vertices)
    V = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    NVn = np.empty(nv * 3, np.float32); me.vertices.foreach_get('normal', NVn); NVn = NVn.reshape(-1, 3)
    TRI = np.empty(len(me.polygons) * 3, np.int64); me.polygons.foreach_get('vertices', TRI); TRI = TRI.reshape(-1, 3)
    vcol = np.zeros((nv, 3)); vcnt = np.zeros(nv)
    for k in range(3): np.add.at(vcol, TRI[:, k], col); np.add.at(vcnt, TRI[:, k], 1)
    vcol /= np.maximum(vcnt, 1)[:, None]
    h_, s_, v_ = hsv(vcol)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]; ax = np.abs(x)
    nbr = vneighbors(me)
    NECK, AP = L['neck'], L['armpit']
    lab = np.full(nv, NI['fur'])
    purple = (h_ > 0.6) & (h_ < 0.85) & (s_ > 0.25) & (v_ < 0.8)
    gold = (h_ > 0.08) & (h_ < 0.19) & (s_ > 0.45) & (v_ > 0.5)
    pinkred = ((h_ < 0.05) | (h_ > 0.92)) & (s_ > 0.3)
    # ---- 腕: キリンの腕は短く横へ開いていて、わきより下の島は手の先だけ（0.29〜0.30）。腕は位置で決める:
    # 胴の幅（|x| 0.17）より外で、高さ 0.25〜わき+0.15。毛と手（紫）を、腕の軸に沿った手首の位置で分ける ----
    ARM = {}; ZONES = {}
    for sd, sg in (('L', 1), ('R', -1)):
        m = (sg * x > L['arm_x0']) & (z > 0.25) & (z < AP + 0.15)
        sh = np.array([sg * L['shoulder_x'], float(np.median(y[m])), L['shoulder_z']])
        dd = np.linalg.norm(V[m] - sh, axis=1); tip = V[m][dd.argmax()]
        a2 = tip - sh; a2 /= np.linalg.norm(a2)
        zone = m
        ZONES[sd] = zone
        t = (V - sh) @ a2; tl = float(np.linalg.norm(tip - sh)); cuff = None
        for t0 in np.arange(0.4 * tl, tl, 0.002):
            b = zone & (t >= t0) & (t < t0 + 0.004)
            if b.sum() > 6 and purple[b].mean() > 0.5: cuff = float(t0); break
        ARM[sd] = dict(sh=sh.tolist(), a=a2.tolist(), tip=tip.tolist(), cuff=cuff, tl=tl)
        lab[zone & (t > cuff)] = NI['paw']
    LOG['arms'] = {k: dict(cuff=round(v['cuff'], 4), tl=round(v['tl'], 4), tip=np.round(v['tip'], 3).tolist()) for k, v in ARM.items()}
    armz = ZONES['L'] | ZONES['R']
    # ---- ひづめ（高さの線）----
    lab[(z < L['hoof_line']) & ~armz] = NI['hoof']
    # ---- 角: 頭のてっぺん（crown）より上は角と星。少し下（茎の付け根）は、角の軸からの距離で ----
    HC = {}
    for sd, sg in (('L', 1), ('R', -1)):
        m = (z > L['crown'] + 0.005) & (z < L['crown'] + 0.03) & (sg * x > 0.04)
        HC[sd] = [float(np.median(x[m])), float(np.median(y[m]))]
        d = np.hypot(x - HC[sd][0], y - HC[sd][1])
        lab[(z > L['horn_base']) & (d < L['horn_r'])] = NI['horn']
    lab[(z > L['crown'] + 0.005) & (ax > 0.04)] = NI['horn']
    lab[(z > L['horn_base']) & gold] = NI['gold']
    # ---- しっぽ: 胴の後ろの面より後ろ、根元から先 ----
    TL = L['tail']
    tail = (z > TL['z'][0]) & (z < TL['z'][1]) & (ax < TL['x']) & (y > TL['y_root'])
    lab[tail & (y > TL['y_tuft'])] = NI['tuft']
    # ---- リュック（背中の後ろで桃色）・肩ひも（桃色）・金の飾り ----
    torso = ~armz & (z > L['crotch']) & (z < NECK + 0.12) & ~tail
    packbody = torso & (y > L['pack_y']) & pinkred
    lab[packbody] = NI['pack']
    lab[torso & ~packbody & pinkred & (z < NECK + 0.02)] = NI['strap']
    lab[torso & gold & (z < L['horn_base'])] = NI['gold']
    # ---- 首輪: 首の前と横の紫の帯 ----
    collar = ~armz & purple & (z > NECK - L['collar'][0]) & (z < NECK + L['collar'][1]) & (y < L['collar_y'])
    lab[collar] = NI['collar']
    # ---- 耳の内側（耳の前の面で桃色）----
    ear = (z > L['ear_z'][0]) & (z < L['ear_z'][1]) & (ax > L['ear_x'])
    # 生成の色では片方の耳で外れた（左右で違う）ので、形で決める: 耳の前を向いた面のうち、正面から見た耳の中心のだ円（ear_in の割合）の中
    ein = np.zeros(nv, bool); EARS = {}
    for sd, sg in (('L', 1), ('R', -1)):
        ef = ear & (NVn[:, 1] < -0.1) & (sg * x > 0)
        ecx, ecz = float(np.median(x[ef])), float((np.percentile(z[ef], 3) + np.percentile(z[ef], 97)) / 2)
        rx_ = L['ear_in'] * (np.percentile(sg * x[ef], 97) - L['ear_x']) / 2; rz_ = L['ear_in'] * (np.percentile(z[ef], 97) - np.percentile(z[ef], 3)) / 2
        ecx = sg * (L['ear_x'] + (np.percentile(sg * x[ef], 97) - L['ear_x']) / 2 + L['ear_in_dx'])
        ein |= ef & (((x - ecx) / rx_) ** 2 + ((z - ecz) / rz_) ** 2 < 1)
        EARS[sd] = [round(ecx, 4), round(ecz, 4), round(float(rx_), 4), round(float(rz_), 4)]
    LOG['ears'] = EARS
    lab[ein] = NI['earin']
    # ---- 目: 顔の前のとても暗い所 ----
    lab[(z > 0.53) & (z < 0.72) & (y < -0.12) & (v_ < 0.3)] = NI['eyes']
    LOG['labels_raw'] = {n: int((lab == i).sum()) for i, n in enumerate(NAMES)}
    fixed = armz | (z < L['hoof_line'] + 0.005) | tail | (z > L['crown'] + 0.005)
    # ならし: 多数決（位置で決めた所は動かさない）→ 小さな島を周りに合わせる
    for _ in range(6):
        new = lab.copy()
        for i in np.nonzero(~fixed)[0]:
            c = np.bincount(lab[nbr[i] + [i]], minlength=len(NAMES))
            if c[lab[i]] * 2 < c.sum(): new[i] = c.argmax()
        lab = new
    for it in range(4):
        comp = -np.ones(nv, int); small = []
        for sidx in range(nv):
            if comp[sidx] >= 0: continue
            st = [sidx]; comp[sidx] = sidx; mem = []
            while st:
                a_ = st.pop(); mem.append(a_)
                for b_ in nbr[a_]:
                    if comp[b_] < 0 and lab[b_] == lab[sidx]: comp[b_] = sidx; st.append(b_)
            if len(mem) < 12 and lab[sidx] not in (NI['eyes'], NI['gold']): small.append(mem)
        if not small: break
        for mem in small:
            ms = set(mem); c = np.zeros(len(NAMES), int)
            for a_ in mem:
                for b_ in nbr[a_]:
                    if b_ not in ms: c[lab[b_]] += 1
            if c.sum(): lab[mem] = c.argmax()
    LOG['labels'] = {n: int((lab == i).sum()) for i, n in enumerate(NAMES)}
    LOG['horn_centers'] = HC
    LOG['collar_z'] = [round(float(np.percentile(z[lab == NI['collar']], p_)), 4) for p_ in (5, 50, 95)]
    LOG['earin_x'] = [[round(float(np.percentile(sg * x[(lab == NI['earin']) & (sg * x > 0)], p_)), 4) for p_ in (5, 95)] for sg in (1, -1)]
    me.attributes.new('lab', 'INT', 'POINT').data.foreach_set('value', lab)
    seg = np.array([np.bincount(lab[t], minlength=len(NAMES)).argmax() for t in TRI])
    me.attributes.new('seg', 'INT', 'FACE').data.foreach_set('value', seg)
    json.dump(dict(arms=ARM, horns=HC), open(os.path.join(WORK, 'stage2-geo.json'), 'w'), indent=1)
    save('stage2.blend')
    # 確かめ用: 区分けの色で塗った GLB
    if os.environ.get('PREVIEW'):
        Cc = CFG['repaint']['colors']
        me.materials.clear()
        for n in NAMES:
            m_ = bpy.data.materials.new(n); m_.use_nodes = True
            m_.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = tuple((np.array(Cc[n]) / 255.0) ** 2.2) + (1,)
            me.materials.append(m_)
        me.polygons.foreach_set('material_index', seg)
        bpy.ops.export_scene.gltf(filepath=os.path.join(WORK, 'stage2-seg.glb'), export_format='GLB', export_apply=False)
    json.dump(LOG, open(os.path.join(WORK, 'stage2-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE2', json.dumps(LOG, ensure_ascii=False))


# ===================================================================== 段 3〜5 の道具
def sstep(t):
    t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


def vert_seg(me):
    """キリン: 点ごとの区分け（段 2 の lab）を、骨の決まりで使う番号（0 体 1 頭に固い物 2 手 3 持ち物 4 ひづめ 5 目 8 肩ひも）に寄せて返す。
    角の茎・頭の上の金（星）は 1、リュックの上の金の飾りは 3。2 つ目は元の lab"""
    lab = np.empty(len(me.vertices), int); me.attributes['lab'].data.foreach_get('value', lab)
    V_ = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V_); V_ = V_.reshape(-1, 3)
    vs = np.zeros(len(lab), int)
    vs[lab == NI['paw']] = 2; vs[lab == NI['pack']] = 3; vs[lab == NI['hoof']] = 4; vs[lab == NI['eyes']] = 5; vs[lab == NI['strap']] = 8
    vs[(lab == NI['horn']) | ((lab == NI['gold']) & (V_[:, 2] > CFG['landmarks']['horn_base']))] = 1
    vs[(lab == NI['gold']) & (V_[:, 1] > CFG['landmarks']['pack_y']) & (V_[:, 2] < CFG['landmarks']['horn_base'])] = 3
    return vs, lab


def arm_zone(V, s, x0):
    """キリン: 腕の点（胴の幅より外・高さ 0.25〜わき+0.15）"""
    sg = 1 if s == 'L' else -1; L_ = CFG['landmarks']
    return (sg * V[:, 0] > x0) & (V[:, 2] > 0.25) & (V[:, 2] < L_['armpit'] + 0.15)


def vcomponents(me, mask):
    par = np.arange(len(me.vertices))
    def find(a):
        r = a
        while par[r] != r: r = par[r]
        while par[a] != r: par[a], a = r, par[a]
        return r
    for e in me.edges:
        a, b = e.vertices
        if mask[a] and mask[b]:
            ra, rb = find(a), find(b)
            if ra != rb: par[ra] = rb
    return np.array([find(i) for i in range(len(par))])


Mx = None
LEG_STAND = float(os.environ.get('LEGSTAND', CFG['motion'].get('legStand', 0.0)))
TWIST_F = float(os.environ.get('TWISTF', CFG['motion'].get('twistForearm', 0.0)))   # 前腕のねじり（ラジアン、+ で手のひらが内側へ）
TWIST_H = float(os.environ.get('TWISTH', CFG['motion'].get('twistHand', 0.0)))     # 手首のねじり


def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.matrix_basis = Mx()
    bpy.context.view_layer.update()


def rot(rig, name, *rots, offset=None):
    from mathutils import Matrix
    pb = rig.pose.bones.get(name)
    if pb is None: return
    h = pb.head.copy(); R = Matrix.Identity(4)
    for axis, ang in rots: R = R @ Matrix.Rotation(ang, 4, axis)
    M = Matrix.Translation(h) @ R @ Matrix.Translation(-h)
    if offset is not None: M = Matrix.Translation(offset) @ M
    pb.matrix = M @ pb.matrix
    bpy.context.view_layer.update()


def apply_pose(rig, p, armDown):
    g = lambda k: p.get(k, 0.0)
    from mathutils import Vector
    reset(rig)
    rot(rig, 'hips', ('Z', g('hipTwist')), ('Y', g('hipRoll')), ('X', g('lean')), offset=Vector((0, 0, g('y'))))
    rot(rig, 'chest', ('Z', g('chestTwist')), ('Y', g('chestRoll')), ('X', g('chestLean')))
    br = g('breath')
    if br:
        rig.pose.bones['chest'].scale = (1 + br, 1, 1 + br); rig.pose.bones['head'].scale = (1 / (1 + br), 1, 1 / (1 + br))
        bpy.context.view_layer.update()
    rot(rig, 'head', ('Z', g('headTwist')), ('X', g('headPitch')))
    # キリン: 耳（上げる = 先を上へ、後ろ = 先を後ろへ）・しっぽ（横に振る・持ち上げる。先は遅れて）
    for s_, sg_ in (('L', 1), ('R', -1)):
        if 'ear' + s_ in rig.pose.bones:
            rot(rig, 'ear' + s_, ('Z', sg_ * (g('earBack') + g('earBack' + s_))), ('Y', -sg_ * (g('earUp') + g('earUp' + s_))))
    if 'tail1' in rig.pose.bones:
        rot(rig, 'tail1', ('Z', g('tailSwing')), ('X', g('tailLift')))
        rot(rig, 'tail2', ('Z', g('tailSwing2')), ('X', g('tailLift2')))
    for s, sg in (('L', 1), ('R', -1)):
        # 腕: まず A ポーズから下ろし（Y 軸）、それから前後に振る（X 軸）
        rot(rig, 'upperarm' + s, ('X', -g('arm' + s)), ('Y', sg * (armDown - g('armOut') - g('armOut' + s))))
        # 女の子（2 回目）: 手のひらを体の内側へ（親指が前）。前腕を自分の軸で TWIST_F、手首で TWIST_H ねじる（1 か所で 90° ねじると細くつぶれるので分ける）。
        # ねじってから、ひじを前へ曲げる（世界の X 軸）
        fa_ = rig.pose.bones['forearm' + s]; axv = (fa_.tail - fa_.head).normalized()
        rot(rig, 'forearm' + s, ('X', -g('elbow' + s)), (axv, sg * (TWIST_F + g('twist' + s))))
        from mathutils import Quaternion
        for bn, q in (('hand' + s, Quaternion((0, 1, 0), sg * (TWIST_H + g('handTwist' + s)))), ('fingers' + s, Quaternion((1, 0, 0), g('fingers' + s)))):
            pb_ = rig.pose.bones.get(bn)
            if pb_ is not None: pb_.rotation_quaternion = q
        bpy.context.view_layer.update()
        # 2 回目: 足の開きの土台 LEG_STAND（元の立ち絵のくるぶしの幅に合わせる。立ち・歩き・走り・喜び すべてに足す）。靴の裏は水平に戻す
        rot(rig, 'thigh' + s, ('Y', -sg * (LEG_STAND + g('legOut'))), ('X', -g('thigh' + s)))
        rot(rig, 'shin' + s, ('X', g('knee' + s)))
        rot(rig, 'foot' + s, ('Y', sg * (LEG_STAND + g('legOut'))), ('X', g('foot' + s)))


# ===================================================================== 段 3: 骨と重み
if STAGE == 3:
    from mathutils import Matrix, Vector
    Mx = Matrix
    bpy.ops.wm.open_mainfile(filepath=os.path.join(WORK, 'stage2.blend'))
    ob = bpy.data.objects['avatar']; me = ob.data; L = CFG['landmarks']
    V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    vs, _ = vert_seg(me)
    # ---- 目印（D6）----
    ap, crotch, neck = L['armpit'], L['crotch'], L['neck']
    # キリン: 腕は位置で決める（わきより下の島は手の先だけ）。胴の幅より 0.03 外を「腕の島」として腕の骨だけにする
    arm_v = {s_: arm_zone(V, s_, L['arm_x0'] + 0.03) for s_ in 'LR'}
    LM = {}
    for s, sg in (('L', 1), ('R', -1)):
        P = V[arm_v[s]]; c0 = P.mean(0)
        sh = np.array([sg * L['shoulder_x'], float(np.median(P[:, 1])), L['shoulder_z']])
        tip = P[np.linalg.norm(P - sh, axis=1).argmax()]
        ax = (tip - sh) / np.linalg.norm(tip - sh); t = (P - sh) @ ax
        dist_ = np.linalg.norm((P - sh) - np.outer(t, ax), axis=1)
        r_ = float(np.median(dist_)); top_ = float(V[arm_zone(V, s, L['arm_x0']), 2].max())
        LM['arm_r' + s] = r_
        LM['shoulder_top' + s] = top_
        LM['shoulder' + s] = sh; LM['elbow' + s] = sh + (tip - sh) * L['elbow_frac']; LM['wrist' + s] = sh + (tip - sh) * L['wrist_frac']
        LM['handtip' + s] = tip
        d_ = tip - sh
        LM['armOpen' + s] = float(math.degrees(math.atan2(abs(d_[0]), abs(d_[2]))))
        leg = (V[:, 2] > 0.04) & (V[:, 2] < 0.09) & (sg * V[:, 0] > 0.01)   # キリン: 足が短い（股 0.105）
        lx = float(np.median(V[leg, 0])); ly = float((V[leg, 1].min() + V[leg, 1].max()) / 2)
        shoe = (vs == 4) & (sg * V[:, 0] > 0)
        LM['hipj' + s] = Vector((lx, ly, crotch + L['hipj_up']))
        LM['ankle' + s] = Vector((lx, ly, L['ankle']))
        LM['knee' + s] = Vector((lx, ly, L['ankle'] + (crotch + L['hipj_up'] - L['ankle']) * 0.58))
        LM['toe' + s] = Vector((lx, float(V[shoe, 1].min()) + 0.01, 0.02))
    # 3 回目: 手（手首 hand・指のかたまり fingers）。手の肌の点から、手首・指の付け根・手のひらの向き・親指を決める
    HC = CFG['hand']; HAND = {}
    for s, sg in (('L', 1), ('R', -1)):
        sh = np.array(LM['shoulder' + s]); a = np.array(LM['handtip' + s]) - sh; a /= np.linalg.norm(a)
        hm = arm_v[s] & (vs == 2); P = V[hm]; t = (P - sh) @ a
        tw, tt = float(np.percentile(t, 3)), float(t.max())
        Q = P - P.mean(0); Q = Q - np.outer(Q @ a, a); _, _, vt = np.linalg.svd(Q)
        n = vt[2] if vt[2][0] * sg < 0 else -vt[2]          # 手のひらの向き（体の方）
        n = n - (n @ a) * a; n /= np.linalg.norm(n); w = np.cross(a, n)
        wd = P @ w; tip_sl = t > tw + 0.85 * (tt - tw)
        w0, w1 = float(wd[tip_sl].min()), float(wd[tip_sl].max())
        tk = tw + HC['knuckle_frac'] * (tt - tw)
        def cen(tc):
            k = np.abs(t - tc) < 0.005; return P[k].mean(0) if k.sum() > 3 else sh + a * tc
        Wc, Kc = cen(tw + 0.004), cen(tk)
        kk = np.abs(t - tk) < 0.005; th_ = float(np.ptp(P[kk] @ n))      # 付け根の厚み
        Kc = Kc + n * (HC['pivot_palm'] * th_)                            # 曲げの中心を手のひら側へ（内側の折れを減らす）
        mid = (t > tw + 0.25 * (tt - tw)) & (t < tk + 0.01)
        tside = -1 if (wd[mid] < w0 - HC['thumb_gap']).sum() >= (wd[mid] > w1 + HC['thumb_gap']).sum() else 1   # 親指のある側だけ
        HAND[s] = dict(a=a, n=n, w=w, sh=sh, tw=tw, tt=tt, tk=tk, w0=w0, w1=w1, W=Wc, K=Kc, T=Kc + a * (tt - tk), tside=tside, th=th_)
        LOG['hand' + s] = dict(th=round(th_, 4), tside=tside, tw=round(tw, 4), tk=round(tk, 4), tt=round(tt, 4), n=n.round(3).tolist(), w=[round(w0, 4), round(w1, 4)],
                               verts=int(hm.sum()))
    tor = (np.abs(V[:, 0]) < 0.1) & (V[:, 2] > 0.28) & (V[:, 2] < 0.34) & (vs != 3)
    ty = float((V[tor, 1].min() + V[tor, 1].max()) / 2)
    hd = (V[:, 2] > neck + 0.05)
    hy = float((V[hd, 1].min() + V[hd, 1].max()) / 2)
    pkb = (vs == 3) & (V[:, 1] > ty + 0.03)
    pk = (vs == 3)  # 女の子: 段 2 の持ち物の区分けは本体だけ（肩ひもは別の区分け 8 で、自動の重み）
    py = float(V[pkb, 1].mean()); pz0, pz1 = float(V[pkb, 2].min()), float(V[pkb, 2].max())
    waist = crotch + (neck - crotch) / 3
    LOG['landmarks'] = {k: [round(float(x), 4) for x in v] if hasattr(v, '__len__') else round(v, 2) for k, v in LM.items()}
    LOG['landmarks'].update(ty=round(ty, 4), head_y=round(hy, 4), waist=round(waist, 4), pack=[round(py, 3), round(pz0, 3), round(pz1, 3)])
    # ---- 骨（D1・D6）----
    arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(rig)
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
    eb = arm.edit_bones

    def bone(n, h, t, par=None):
        b = eb.new(n); b.head = Vector(h); b.tail = Vector(t); b.roll = 0
        if par: b.parent = eb[par]
        b.use_connect = False
        return b
    bone('hips', (0, ty, crotch + L['hipj_up']), (0, ty, waist))
    bone('chest', (0, ty, waist), (0, ty, neck), 'hips')
    bone('head', (0, hy, neck), (0, hy, 1.0), 'chest')
    for s in 'LR':
        bone('upperarm' + s, LM['shoulder' + s], LM['elbow' + s], 'chest')
        bone('forearm' + s, LM['elbow' + s], HAND[s]['W'], 'upperarm' + s)
        bh = bone('hand' + s, HAND[s]['W'], HAND[s]['K'], 'forearm' + s); bh.align_roll(Vector(HAND[s]['n']))
        bf = bone('fingers' + s, HAND[s]['K'], HAND[s]['T'], 'hand' + s); bf.align_roll(Vector(HAND[s]['n']))
        bone('thigh' + s, LM['hipj' + s], LM['knee' + s], 'hips')
        bone('shin' + s, LM['knee' + s], LM['ankle' + s], 'thigh' + s)
        bone('foot' + s, LM['ankle' + s], LM['toe' + s], 'shin' + s)
    bone('pack', (0, py, pz1), (0, py, pz0), 'chest')
    # キリン: しっぽ 2 本（根元 → 毛束の根元 → 先）と耳 左右 1 本（設計 2026-11-17-kirin-rig-design.md）
    TLc = L['tail']
    tl_ = (V[:, 2] > TLc['z'][0]) & (V[:, 2] < TLc['z'][1]) & (np.abs(V[:, 0]) < TLc['x']) & (V[:, 1] > TLc['y_root'] - 0.01) & (vs != 3)
    def tmean(y0, y1):
        m_ = tl_ & (V[:, 1] > y0) & (V[:, 1] < y1); return np.array([0.0, float(V[m_, 1].mean()), float(V[m_, 2].mean())])
    T0 = tmean(TLc['y_root'] - 0.01, TLc['y_root'] + 0.005); T1 = tmean(TLc['y_tuft'] - 0.008, TLc['y_tuft'] + 0.008)
    T2 = V[tl_][V[tl_, 1].argmax()].copy(); T2[0] = 0
    bone('tail1', T0, T1, 'hips'); bone('tail2', T1, T2, 'tail1')
    LM['tail'] = [T0.tolist(), T1.tolist(), T2.tolist()]
    for s, sg in (('L', 1), ('R', -1)):
        em = (V[:, 2] > L['ear_z'][0]) & (V[:, 2] < L['ear_z'][1]) & (sg * V[:, 0] > L['ear_x'])
        P_ = V[em]; root = np.array([sg * L['ear_root'], float(np.median(P_[:, 1])), float(np.median(P_[:, 2]))])
        tipe = P_[sg * P_[:, 0] > np.percentile(sg * P_[:, 0], 95)].mean(0)   # 耳の先（外へ一番出た 5%）。遠い点にすると頬の毛を拾った
        bone('ear' + s, root, tipe, 'head')
        LM['ear' + s] = [root.tolist(), tipe.tolist()]
    bpy.ops.object.mode_set(mode='OBJECT')
    # ---- 重み（D7）: 自動 → 固い物の上書き → 腕の島 ----
    bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    ob.matrix_parent_inverse.identity()
    names = [b.name for b in arm.bones]; NB = len(names)
    Wt = np.zeros((len(me.vertices), NB))
    gi = {g.index: names.index(g.name) for g in ob.vertex_groups}
    for v in me.vertices:
        for g in v.groups: Wt[v.index, gi[g.group]] = g.weight
    B = {n: i for i, n in enumerate(names)}
    LOG['auto_zero_verts'] = int((Wt.sum(1) < 1e-6).sum())
    # 重みの無い点: 同じ区分けの中で、近い骨（線分までの距離）に付ける
    def seg_dist(P, a, b):
        ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)
    zero = Wt.sum(1) < 1e-6
    if zero.any():
        D = np.stack([seg_dist(V[zero], np.array(arm.bones[n].head_local), np.array(arm.bones[n].tail_local)) for n in names], 1)
        Wt[np.nonzero(zero)[0], D.argmin(1)] = 1
    Wt[:, B['pack']] = 0
    for n_ in ('tail1', 'tail2', 'earL', 'earR'): Wt[:, B[n_]] = 0   # キリン: しっぽ・耳は自動の重みを使わず、下で場所から決める
    # 腕の島（わきより下）: 腕の骨だけ。胴の点: 腕の骨なし
    armb = {s: [B['upperarm' + s], B['forearm' + s]] for s in 'LR'}
    for s in 'LR':
        m = arm_v[s]
        w = Wt[m][:, armb[s]]
        tot = w.sum(1)
        P = V[m]
        D = np.stack([seg_dist(P, np.array(arm.bones[n + s].head_local), np.array(arm.bones[n + s].tail_local)) for n in ('upperarm', 'forearm')], 1)
        fb = np.zeros_like(w); fb[np.arange(len(P)), D.argmin(1)] = 1
        w = np.where(tot[:, None] > 0.05, w / np.maximum(tot[:, None], 1e-9), fb)
        Wt[m] = 0; Wt[np.ix_(np.nonzero(m)[0], armb[s])] = w
    # 3 回目: 手首より先は hand 100%（手首の帯 ±wrist_band だけ前腕と混ぜる）。指のかたまり（親指を除く）は fingers 100%（付け根の帯 ±finger_band）
    hb = {s: [B['hand' + s], B['fingers' + s]] for s in 'LR'}
    for s in 'LR': Wt[:, hb[s]] = 0
    for s in 'LR':
        H_ = HAND[s]; m = np.nonzero(arm_v[s])[0]; P = V[m]
        t = (P - H_['sh']) @ H_['a']; wd = P @ H_['w']
        h = np.array([sstep((x - (H_['tw'] - HC['wrist_band'])) / (2 * HC['wrist_band'])) for x in t])
        out_ = (H_['w0'] - wd) if H_['tside'] < 0 else (wd - H_['w1'])    # 親指の側へ、指のかたまりのふちから外へ出た量
        keep = np.array([1 - sstep((o - HC['thumb_gap']) / 0.008) for o in out_])   # 親指は hand のまま（なめらかに）
        f = np.array([sstep((x - (H_['tk'] - HC['finger_band'])) / (2 * HC['finger_band'])) for x in t]) * keep
        Wt[m] *= (1 - h)[:, None]
        Wt[m, B['hand' + s]] = h * (1 - f); Wt[m, B['fingers' + s]] = h * f
        tot = Wt[m].sum(1); Wt[m] /= np.maximum(tot, 1e-9)[:, None]
    # 肩のまわり（わきより上）: 肩の関節を通り腕の軸に垂直な面で分け、面の前後 ±band の帯だけ腕と胸を混ぜる。
    # 帯より胴側の点（フード・ひも・首など）には腕の重みを付けない（大きく振ったとき遠くの点が引っぱられて、とげになる）
    band = L['shoulder_band']
    for s, sg in (('L', 1), ('R', -1)):
        hj = np.array(arm.bones['upperarm' + s].head_local); ax_ = np.array(arm.bones['upperarm' + s].tail_local) - hj; ax_ /= np.linalg.norm(ax_)
        t_ = (V - hj) @ ax_
        f_ = np.array([sstep((t + band) / (2 * band)) for t in t_])
        f_[arm_v[s]] = 1.0
        f_[np.isin(vs, [1, 3, 5])] = 0.0
        f_[sg * V[:, 0] < 0] = 0.0
        moved = Wt[:, armb[s]].sum(1) * (1 - f_)
        Wt[:, armb[s]] *= f_[:, None]
        Wt[:, B['chest']] += moved
    # 足の骨（股・すね・足先）の重みは、腰より下の点だけ。持ち物の区分けの点には付けない（股を曲げたとき背中の下がとげになる）
    legb = [B[n + s] for n in ('thigh', 'shin', 'foot') for s in 'LR']
    lt = L['leg_top']  # 足の重みは この高さ（ベルトの下）から下だけ。0.04 の帯でなめらかに 0 へ
    for i in np.nonzero(V[:, 2] > lt - L['leg_band'])[0]:
        mv = Wt[i, legb].sum()
        if mv <= 0: continue
        f = 0.0 if (vs[i] == 3 or (V[i, 1] > ty + 0.06 and V[i, 2] > pz0 - 0.02)) else sstep((lt - V[i, 2]) / L['leg_band'])
        Wt[i, legb] *= f; Wt[i, B['hips']] += mv * (1 - f)
    # キリン: わきより下の胴（|x| が腕の島より内）には腕の骨を付けない
    for s, sg in (('L', 1), ('R', -1)):
        torso_below = (V[:, 2] < ap) & (sg * V[:, 0] < L['arm_x0'] + 0.005) & (sg * V[:, 0] > -0.05)
        mv = Wt[np.ix_(np.nonzero(torso_below)[0], armb[s] + hb[s])].sum(1)
        Wt[np.ix_(np.nonzero(torso_below)[0], armb[s] + hb[s])] = 0; Wt[np.nonzero(torso_below)[0], B['chest']] += mv
    armz_all = np.zeros(len(V), bool)
    for s_ in 'LR': armz_all |= arm_zone(V, s_, L['arm_x0'])
    # キリン: 頭は首の帯（neck−0.03〜neck+0.03）より上の毛ぜんぶ（腕・持ち物・肩ひもをのぞく）。角・星・目は head 100%
    k = np.array([sstep((V[i, 2] - (neck - 0.03)) / 0.06) for i in range(len(V))])
    k[np.isin(vs, [1, 5])] = 1.0; k[np.isin(vs, [2, 3, 8])] = 0.0; k[armz_all] = 0.0
    for i in np.nonzero(k > 0)[0]:
        Wt[i] *= (1 - k[i]); Wt[i, B['head']] += k[i]
    # 耳: 頭の重みのうち、耳の付け根（|x| = ear_root）から外へ ear_band でなめらかに耳の骨へ（付け根より内は頭 100%）
    for s, sg in (('L', 1), ('R', -1)):
        em = (V[:, 2] > L['ear_z'][0] - 0.02) & (V[:, 2] < L['ear_z'][1] + 0.02) & (sg * V[:, 0] > L['ear_root'] - 0.01)
        for i in np.nonzero(em)[0]:
            f = sstep((sg * V[i, 0] - L['ear_root']) / L['ear_band'] + 0.5)
            mv = Wt[i, B['head']] * f; Wt[i, B['head']] -= mv; Wt[i, B['ear' + s]] += mv
    # しっぽ: 根元の帯（y_root ± tail_band/2）から先を tail1、毛束の根元（y_tuft）から先を tail2。胴の点は今のまま
    for i in np.nonzero(tl_)[0]:
        f1 = sstep((V[i, 1] - TLc['y_root']) / L['tail_band'] + 0.5); f2 = sstep((V[i, 1] - TLc['y_tuft']) / L['tail_band'] + 0.5)
        Wt[i] *= (1 - f1); Wt[i, B['tail1']] += f1 * (1 - f2); Wt[i, B['tail2']] += f1 * f2
    # 持ち物: pack 100%
    Wt[pk] = 0; Wt[pk, B['pack']] = 1
    # 靴: foot 100%（足首の帯 0.03 だけ shin と混ぜる）
    for s, sg in (('L', 1), ('R', -1)):
        m = (vs == 4) & (sg * V[:, 0] > 0)
        for i in np.nonzero(m)[0]:
            f = sstep((L['ankle'] + 0.015 - V[i, 2]) / 0.03)
            Wt[i] *= (1 - f); Wt[i, B['foot' + s]] += f
    # 上書きで重みが 0 になった点: 胴の骨（hips・chest）の近い方
    zero = Wt.sum(1) < 1e-6
    LOG['zero_after_override'] = int(zero.sum())
    if zero.any():
        cand = ['hips', 'chest']
        D = np.stack([seg_dist(V[zero], np.array(arm.bones[n].head_local), np.array(arm.bones[n].tail_local)) for n in cand], 1)
        for j, i in enumerate(np.nonzero(zero)[0]): Wt[i, B[cand[D[j].argmin()]]] = 1
    # 仕上げ: 4 本まで・合計 1
    for i in range(len(Wt)):
        w = Wt[i]
        if (w > 0).sum() > 4: w[np.argsort(w)[:-4]] = 0
        sm = w.sum(); Wt[i] = w / sm if sm > 0 else w
    for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
    for n in names: ob.vertex_groups.new(name=n)
    for j, n in enumerate(names):
        vg = ob.vertex_groups[n]
        for i in np.nonzero(Wt[:, j] > 1e-4)[0]: vg.add([int(i)], float(Wt[i, j]), 'REPLACE')
    LOG['weights'] = dict(zero=int((Wt.sum(1) < 0.999).sum()), head_not100=int((Wt[np.isin(vs, [1, 5]), B['head']] < 0.999).sum()),
                          pack_not100=int((Wt[pk, B['pack']] < 0.999).sum()),
                          tuft_not100=int((Wt[tl_ & (V[:, 1] > TLc['y_tuft'] + L['tail_band']), B['tail2']] < 0.999).sum()),
                          ear_blade_not100=int(sum((Wt[(V[:, 2] > L['ear_z'][0]) & (sg_ * V[:, 0] > L['ear_root'] + L['ear_band']), B['ear' + s_]] < 0.999).sum() for s_, sg_ in (('L', 1), ('R', -1)))),
                          shoe_not100_below_band=int(sum(1 for i in np.nonzero(vs == 4)[0] if V[i, 2] < L['ankle'] - 0.015 and Wt[i, B['footL' if V[i, 0] > 0 else 'footR']] < 0.999)))
    save('stage3.blend')
    json.dump(LOG, open(os.path.join(WORK, 'stage3-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE3', json.dumps(LOG, ensure_ascii=False))


def export(path, anim_mode='ACTIONS', anim=True):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=False, export_normals=True, export_texcoords=True,
                              export_skins=True, export_animations=anim, export_animation_mode=anim_mode, export_force_sampling=True,
                              export_yup=True, export_image_format=os.environ.get('IMGFMT', 'WEBP'), export_image_quality=int(os.environ.get('IMGQ', '84')),
                              export_attributes=False, export_anim_slide_to_zero=True)


def key_all(rig, frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame); pb.keyframe_insert('location', frame=frame); pb.keyframe_insert('scale', frame=frame)


# ===================================================================== 段 3 の試しの姿勢（関門 3）
if STAGE == 31:
    from mathutils import Matrix
    Mx = Matrix
    bpy.ops.wm.open_mainfile(filepath=os.path.join(WORK, 'stage3.blend'))
    rig = bpy.data.objects['rig']; D = math.radians
    AD = float(os.environ.get('ARMDOWN', CFG['motion'].get('armDown', 0.79)))
    AO = json.load(open(os.path.join(WORK, 'stage3-log.json')))['landmarks']['armOpenL']  # A ポーズの腕の開き（度。2 回目: 形から）
    POSES = [
        ('A ポーズ', {}, 0.0),
        ('立ち（腕を下ろす）', {}, AD),
        ('左腕 前60・右腕 後40', {'armL': D(60), 'armR': -D(40)}, AD),
        ('左腕 後40・右腕 前60・ひじ90', {'armL': -D(40), 'armR': D(60), 'elbowL': D(90), 'elbowR': D(90)}, AD),
        ('腕 横90', {}, -(D(90) - D(AO))),
        ('ひじ90（下ろした腕）', {'elbowL': D(90), 'elbowR': D(90)}, AD),
        ('左股 前60＋ひざ110・右股 後30', {'thighL': D(60), 'kneeL': D(110), 'thighR': -D(30)}, AD),
        ('左股 後30＋ひざ110・右股 前60', {'thighL': -D(30), 'kneeL': D(110), 'thighR': D(60)}, AD),
    ]
    if os.environ.get('POSESET') == 'kirin':   # キリン: 短い手足の上限を小さい角度から測る
        POSES = [('腕 前20・後20', {'armL': D(20), 'armR': -D(20)}, AD), ('腕 前30・後30', {'armL': D(30), 'armR': -D(30)}, AD),
                 ('腕 前40・後30 ひじ30', {'armL': D(40), 'armR': -D(30), 'elbowL': D(30), 'elbowR': D(30)}, AD),
                 ('股 前25 ひざ30・後20', {'thighL': D(25), 'kneeL': D(30), 'thighR': -D(20)}, AD),
                 ('股 前35 ひざ50・後25 ひざ40', {'thighL': D(35), 'kneeL': D(50), 'thighR': -D(25), 'kneeR': D(40)}, AD),
                 ('股 前45 ひざ70', {'thighL': D(45), 'kneeL': D(70)}, AD),
                 ('腕 開く 35（うれしい）', {'armOut': D(35), 'armL': D(15), 'armR': D(15), 'elbowL': D(30), 'elbowR': D(30)}, AD),
                 ('股 後35 ひざ80', {'thighL': -D(35), 'kneeL': D(80)}, AD)]
    if os.environ.get('POSESET') == 'legs2':   # キリン: ひざを小さく
        POSES = [('股 前25', {'thighL': D(25)}, AD), ('股 前35', {'thighL': D(35)}, AD), ('股 後25', {'thighL': -D(25)}, AD),
                 ('股 前30 ひざ15', {'thighL': D(30), 'kneeL': D(15)}, AD), ('股 後20 ひざ25', {'thighL': -D(20), 'kneeL': D(25)}, AD),
                 ('股 前30 ひざ15 足先-15', {'thighL': D(30), 'kneeL': D(15), 'footL': -D(15)}, AD),
                 ('歩き 前22・後18', {'thighL': D(22), 'thighR': -D(18), 'kneeR': D(15)}, AD), ('立ち', {}, AD)]
    if os.environ.get('POSESET') == 'tailear':   # キリン: しっぽ・耳（設計の角度の 1.5 倍まで）
        POSES = [('立ち', {}, AD), ('しっぽ 右18・先27', {'tailSwing': D(18), 'tailSwing2': D(27)}, AD), ('しっぽ 左18・先27', {'tailSwing': -D(18), 'tailSwing2': -D(27)}, AD),
                 ('しっぽ 上げ 15', {'tailLift': D(15), 'tailLift2': D(10)}, AD), ('耳 上げ 18', {'earUp': D(18)}, AD), ('耳 下げ 15', {'earUp': -D(15)}, AD),
                 ('耳 後ろ 12', {'earBack': D(12)}, AD), ('耳 前 12', {'earBack': -D(12)}, AD)]
    if os.environ.get('POSESET') == 'legs':
        POSES = [(f'左股 前{a}＋ひざ{k}', {'thighL': D(a), 'kneeL': D(k)}, AD) for a, k in ((30, 60), (40, 80), (50, 95), (60, 0), (0, 110), (45, 0))]
    if os.environ.get('POSESET') == 'skirt':   # 女の子: スカートと足（歩き・走りに近い角度）
        POSES = [('立ち', {}, AD), ('歩き 前25・後20', {'thighL': D(25), 'kneeL': D(15), 'thighR': -D(20), 'kneeR': D(30)}, AD),
                 ('走り 前45＋ひざ60・後25', {'thighL': D(45), 'kneeL': D(60), 'thighR': -D(25), 'kneeR': D(60)}, AD),
                 ('前35・後30', {'thighL': D(35), 'thighR': -D(30)}, AD), ('後30＋ひざ100', {'thighL': -D(30), 'kneeL': D(100)}, AD),
                 ('前50＋ひざ90', {'thighL': D(50), 'kneeL': D(90)}, AD)]
    if os.environ.get('POSESET') == 'hands':   # 3 回目: 手の骨・ひじ・腕を閉じた立ち姿の上限
        POSES = [('立ち 指0', {}, AD)] + [(f'指{a}', {'fingersL': D(a), 'fingersR': D(a)}, AD) for a in (70, 90, 110)] + [
            ('ひじ110＋指90', {'elbowL': D(110), 'elbowR': D(110), 'fingersL': D(90), 'fingersR': D(90)}, AD),
            ('腕 前50 ひじ100 指90・後40', {'armL': D(50), 'elbowL': D(100), 'armR': -D(40), 'elbowR': D(60), 'fingersL': D(90), 'fingersR': D(90)}, AD),
            ('手首ひねり ±20', {'handTwistL': D(20), 'handTwistR': -D(20), 'fingersL': D(90), 'fingersR': D(90)}, AD)]
    if os.environ.get('POSESET') == 'twist':   # 女の子 2 回目: 手のひらの向き（前腕・手首のねじり）と走りの腕
        POSES = [('立ち 指0', {}, AD), ('立ち 指0.8', {'fingersL': 0.8, 'fingersR': 0.8}, AD),
                 ('ひじ90 指1.5', {'elbowL': D(90), 'elbowR': D(90), 'fingersL': 1.5, 'fingersR': 1.5}, AD),
                 ('左 前40ひじ95・右 後30ひじ80', {'armL': D(40), 'elbowL': D(95), 'armR': -D(30), 'elbowR': D(80), 'fingersL': 1.5, 'fingersR': 1.5}, AD),
                 ('左 後30ひじ80・右 前40ひじ95', {'armR': D(40), 'elbowR': D(95), 'armL': -D(30), 'elbowL': D(80), 'fingersL': 1.5, 'fingersR': 1.5}, AD)]
    bpy.context.scene.render.fps = 30
    HP = []
    rig.animation_data_create(); act = bpy.data.actions.new('gate3'); rig.animation_data.action = act
    for i, (n, p, ad) in enumerate(POSES):
        apply_pose(rig, p, ad); key_all(rig, i)
        HP.append({k: [round(v_, 4) for v_ in (lambda q: (q.x, q.z, -q.y))(rig.matrix_world @ rig.pose.bones['hand' + k].tail)] for k in 'LR' if 'hand' + k in rig.pose.bones})
    apply_pose(rig, POSES[-1][1], POSES[-1][2]); key_all(rig, len(POSES))  # 最後の姿勢をもう 1 コマ（再生の折り返し対策）
    for fc_ in act.fcurves:
        for kp in fc_.keyframe_points: kp.interpolation = 'CONSTANT'
    bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, len(POSES)
    export(os.path.join(WORK, 'gate3.glb'))
    json.dump([n for n, _, _ in POSES], open(os.path.join(WORK, 'gate3-poses.json'), 'w'), ensure_ascii=False)
    json.dump(HP, open(os.path.join(WORK, 'gate3-hands.json'), 'w'))
    print('GATE3 exported', len(POSES))


# ===================================================================== 段 4: 顔（顔の面だけ材質 face。4 こまを横に並べた絵）
if STAGE == 4:
    import textwrap
    bpy.ops.wm.open_mainfile(filepath=os.path.join(WORK, 'stage3.blend'))
    av = bpy.data.objects['avatar']; me = av.data; L = CFG['landmarks']; FC = CFG['face']
    FX0, FX1, FZ0, FZ1 = FC['box']
    timg = tex_of(av); TW, TH = timg.size
    tex = pixels(timg)[:, :, :3]
    CW = FC['cell'][0]; CHh = FC['cell'][1]
    V2 = open('/home/otosa/mogumo-go/art/prototypes/avatar/blender-v2.py').read().split('\n')
    partA = textwrap.dedent('\n'.join(V2[503:601]))   # 体の絵から顔を写す〜目の箱（blender-v2.py の顔の節。実績）
    partB = textwrap.dedent('\n'.join(V2[601:691]))   # 半分・閉じ・うれしい の絵（同上）
    # 顔の面: 頭の前の肌・目（髪・耳・フードは入れない）
    vs_ = np.empty(len(me.polygons), int); me.attributes['seg'].data.foreach_get('value', vs_)
    seg_face = set(int(i) for i, p in enumerate(me.polygons) if vs_[i] in (2, 5) and p.normal.y < -0.2 and FX0 < p.center.x < FX1 and FZ0 < p.center.z < FZ1 and p.center.y < 0)
    partA = partA.replace("sel = [f for f in bm.faces if all(FX0 < v.co.x < FX1 and FZ0 < v.co.z < FZ1 for v in f.verts) and f.normal.y < -0.3]",
                          "sel = [f for f in bm.faces if f.index in seg_face and all(FX0 < v.co.x < FX1 and FZ0 < v.co.z < FZ1 for v in f.verts)]")
    assert 'seg_face' in partA
    ns = dict(globals()); ns.update(locals())
    exec(partA, ns)
    EB = ns['EB']
    # 顔の面の外（絵のすき間）は、近い色で全部うめる（小さく表示したときに、ふちへ黒がにじまないように）
    nrm, cov = ns['normal'], ns['cover']
    while not cov.all():
        m_ = cov.astype(np.float32); acc = np.zeros_like(nrm); cnt = np.zeros_like(m_)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(np.roll(nrm * m_[:, :, None], dy, 0), dx, 1); cnt += np.roll(np.roll(m_, dy, 0), dx, 1)
        grow = (~cov) & (cnt > 0); nrm[grow] = acc[grow] / cnt[grow][:, None]; cov = cov | grow
    ns['normal'], ns['cover'] = nrm, cov
    # 男の子の face4.png の うれしい のこまを、目の位置で合わせて写す
    src = bpy.data.images.load('/home/otosa/mogumo-go/' + FC['happy_src'])   # 女の子: うれしい の絵が無いので、男の子の仕上がりの顔のこま 3 を写す（仮）
    OP = pixels(src)[::-1]; OW = src.size[0] // 4; OH = src.size[1]
    old_normal, old_happy = OP[:, 0:OW, :3], OP[:, OW * 3:OW * 4]
    lum_o = old_normal @ np.array([0.3, 0.55, 0.15], np.float32)
    from collections import deque
    def blobs2(dark):
        lab = np.zeros(dark.shape, int); out = []
        for sy, sx in zip(*np.nonzero(dark)):
            if lab[sy, sx]: continue
            q = deque([(sy, sx)]); lab[sy, sx] = len(out) + 1; pts = []
            while q:
                a_, b_ = q.popleft(); pts.append((a_, b_))
                for da, db in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    c_, d_ = a_ + da, b_ + db
                    if 0 <= c_ < dark.shape[0] and 0 <= d_ < dark.shape[1] and dark[c_, d_] and not lab[c_, d_]:
                        lab[c_, d_] = len(out) + 1; q.append((c_, d_))
            out.append(np.array(pts))
        out.sort(key=len, reverse=True)
        return sorted(out[:2], key=lambda b: b[:, 1].mean())
    yo, xo = np.mgrid[0:OH, 0:OW]
    eo = blobs2((lum_o < 0.33) & (yo > OH * 0.25) & (yo < OH * 0.85))
    EO = [(b[:, 0].min(), b[:, 1].min(), b[:, 0].max(), b[:, 1].max()) for b in eo]
    cx_n = [(e[1] + e[3]) / 2 for e in EB]; cx_o = [(e[1] + e[3]) / 2 for e in EO]
    cy_n = np.mean([(e[0] + e[2]) / 2 for e in EB]); cy_o = np.mean([(e[0] + e[2]) / 2 for e in EO])
    sx = (cx_o[1] - cx_o[0]) / (cx_n[1] - cx_n[0]); sy = sx
    yy_, xx_ = np.mgrid[0:CHh, 0:CW]
    ox = np.clip(((xx_ - (cx_n[0] + cx_n[1]) / 2) * sx + (cx_o[0] + cx_o[1]) / 2).round().astype(int), 0, OW - 1)
    oy = np.clip(((yy_ - cy_n) * sy + cy_o).round().astype(int), 0, OH - 1)
    happy = old_happy[oy, ox]
    # 口は口どうしで合わせる（目の間の幅で縮めたうえで、ふつうの口のまん中どうしをそろえる）
    def mouth_box(img, eyes, h, r1=None):
        sk = np.median(img[int(h * 0.3):int(h * 0.6), (eyes[0][3] + eyes[1][1]) // 2 - 10:(eyes[0][3] + eyes[1][1]) // 2 + 10].reshape(-1, 3), 0)
        r0 = max(e[2] for e in eyes) + 8; c0, c1 = eyes[0][3], eyes[1][1]
        d = np.linalg.norm(img[r0:(r1 or int(h * 0.97)), c0:c1] - sk, axis=2) > 0.15
        ys, xs = np.nonzero(d); return (ys.mean() + r0, xs.mean() + c0)
    MR1 = max(e[2] for e in EB) + FC['mouth_rows']   # 女の子: あごの印を口と取り違えないよう、目の下 mouth_rows 画素まで
    mo = mouth_box(old_normal, EO, OH); mn_ = mouth_box(ns['normal'], EB, CHh, MR1)
    LOG['mouth_centers'] = dict(old=[round(float(v), 1) for v in mo], new=[round(float(v), 1) for v in mn_])
    low = yy_ > max(e[2] for e in EB) + 6
    ox2 = np.clip(((xx_ - mn_[1]) * sx + mo[1]).round().astype(int), 0, OW - 1)
    oy2 = np.clip(((yy_ - mn_[0]) * sy + mo[0]).round().astype(int), 0, OH - 1)
    happy[low] = old_happy[oy2, ox2][low]
    LOG['face'] = dict(eyes_new=[list(map(int, e)) for e in EB], eyes_old=[list(map(int, e)) for e in EO], scale=round(float(sx), 3), faces=len(seg_face))
    ns['happy'] = happy
    # 2 回目: 目を消すぬり方を変える。箱のふち 1 画素を元の色に固定して中をならす（ラプラスの式）。だ円のやわらかいふちで元の暗い色が
    # 半分残ると、目のまわりにうすい輪が出た（1 回目の不具合）。ふちと中が続いているので、箱の全体をぬっても境目が出ない
    partB = partB.replace('np.clip((1.0 - nd) * min(rx, ry) / 4, 0, 1)', 'np.clip((1.0 - nd) * min(rx, ry) / 12, 0, 1)')  # うれしいの写し（ell）は 1 回目のまま
    i0 = partB.index('def erase(img, box, pad, below=None):'); i1 = partB.index('def stroke(')
    partB = partB[:i0] + textwrap.dedent("""
        def erase(img, box, pad, below=None):
            r0, c0, r1, c1 = max(box[0] - pad, 5), max(box[1] - pad, 1), min(box[2] + pad, img.shape[0] - 6), min(box[3] + pad, img.shape[1] - 2)
            top = hsm(img[r0 - 4:r0, c0:c1 + 1].mean(0))
            bot = hsm(img[r1 + 1:r1 + 5, c0:c1 + 1].mean(0))
            t = ((np.arange(r0, r1 + 1) - r0 + 0.5) / (r1 - r0 + 1))[:, None, None]
            full = img.copy()
            full[r0:r1 + 1, c0:c1 + 1] = top[None] * (1 - t) + bot[None] * t
            Rg = full[r0 - 1:r1 + 2, c0 - 1:c1 + 2].copy()
            for _ in range(1500):
                Rg[1:-1, 1:-1] = (Rg[:-2, 1:-1] + Rg[2:, 1:-1] + Rg[1:-1, :-2] + Rg[1:-1, 2:]) / 4
            full[r0:r1 + 1, c0:c1 + 1] = Rg[1:-1, 1:-1]
            m = np.zeros(img.shape[:2], np.float32); m[r0:r1 + 1, c0:c1 + 1] = 1
            if below is not None:
                m = m * np.clip(below - (yy - 0.5) + 0.5, 0, 1)
            return img * (1 - m[:, :, None]) + full * m[:, :, None]

    """) + partB[i1:]
    # この子の目は大きく、まつげが暗い所の箱の外へ出るので、消す範囲を広げる
    partB = partB.replace('mr0, mr1, mc0, mc1 = eb_ + 4, int(CHh * 0.97), EB[0][3], EB[1][1]', 'mr0, mr1, mc0, mc1 = eb_ + 4, MR1, EB[0][3], EB[1][1]')
    # 女の子: うれしい の目の弧は、女の子の目の色（ink）でぬる。目の箱の上 30% より上は写さない（男の子の絵の小さな汚れ・まゆを入れない）
    partB = partB.replace('happyc = base * (1 - ha[:, :, None]) + hrgb * ha[:, :, None]',
        'eyezone = np.maximum(ell(EB[0], PAD + 9), ell(EB[1], PAD + 9)) > 0\n'
        'ha = ha * np.where(eyezone, (yy >= min(e[0] for e in EB) + 0.3 * (EB[0][2] - EB[0][0])), 1.0)\n'
        'happyc = base * (1 - ha[:, :, None]) + np.where(eyezone[:, :, None], ink[None, None], hrgb) * ha[:, :, None]')
    # 女の子: 口は元の笑顔のまま（男の子の開いた口は写さない。立ち絵の顔も口を閉じた笑顔）
    partB = partB.replace('base = erase(base, nmouth, 5)', 'pass').replace('R = np.maximum.reduce([ell(EB[0], 16), ell(EB[1], 16), ell(hmouth, 3)])', 'R = np.maximum(ell(EB[0], 16), ell(EB[1], 16))')
    assert 'MR1' in partB and 'eyezone' in partB and 'ell(hmouth' not in partB
    partB = partB.replace('PAD = 7', 'PAD = %d' % FC['erase_pad']).replace('ell(EB[0], 16), ell(EB[1], 16)', 'ell(EB[0], %d), ell(EB[1], %d)' % (FC['erase_pad'] + 9, FC['erase_pad'] + 9))
    assert 'PAD = %d' % FC['erase_pad'] in partB
    ns['MR1'] = MR1
    exec(partB, ns)
    atlas = ns['atlas']; normal = ns['normal']
    # ふち 1 画素も変えない: こま 1〜3 の、目・口の枠の外が こま 0 と同じかを数える
    R = ns['R']; keep = R <= 0
    for i in (1, 2, 3):
        cell = atlas[:, i * CW:(i + 1) * CW, :3]
        if i in (1, 2):
            pad = FC['erase_pad'] + 16
            m = np.ones((CHh, CW), bool)
            for (r0, c0, r1, c1) in EB: m[max(r0 - pad, 0):r1 + pad + 1, max(c0 - pad, 0):c1 + pad + 1] = False
        else:
            m = keep.copy()
            nm = ns['nmouth']
            for (r0, c0, r1, c1) in EB: m[max(r0 - FC['erase_pad'] - 16, 0):r1 + FC['erase_pad'] + 17, max(c0 - FC['erase_pad'] - 16, 0):c1 + FC['erase_pad'] + 17] = False
            m[nm[0] - 6:nm[2] + 7, nm[1] - 6:nm[3] + 7] = False
        LOG['face'][f'cell{i}_changed_outside_boxes'] = int((np.abs(cell - atlas[:, :CW, :3]).max(2)[m] > 1e-6).sum())
    aimg = bpy.data.images.new('face4', CW * 4, CHh, alpha=False)
    aimg.pixels.foreach_set(atlas[::-1].ravel()); aimg.pack()
    aimg.filepath_raw = os.path.join(WORK, 'face4-stage4.png'); aimg.file_format = 'PNG'; aimg.save()   # 女の子: 段 45 はこの絵から（face4.png は段 45 の出力。上書きで二重に塗り直された）
    fmat = bpy.data.materials.new('face'); fmat.use_nodes = True
    bsdf = fmat.node_tree.nodes['Principled BSDF']; bsdf.inputs['Roughness'].default_value = 0.9
    tn = fmat.node_tree.nodes.new('ShaderNodeTexImage'); tn.image = aimg; tn.interpolation = 'Linear'
    fmat.node_tree.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    me.materials[0].name = 'avatar'
    me.materials.append(fmat)
    bm = ns['bm']; uvl = bm.loops.layers.uv.active
    for f in ns['sel']:
        f.material_index = 1
        for l in f.loops: l[uvl].uv = (((l.vert.co.x - FX0) / (FX1 - FX0)) / 4, (l.vert.co.z - FZ0) / (FZ1 - FZ0))
    bm.to_mesh(me); bm.free()
    save('stage4.blend')
    json.dump(LOG, open(os.path.join(WORK, 'stage4-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE4', json.dumps(LOG, ensure_ascii=False))


# ===================================================================== 段 45（3 回目）: 塗り直し。区分けごとの色＋形の陰（repaint.py）
if STAGE == 45:
    from mathutils import Matrix
    Mx = Matrix
    exec(open(os.path.join(HERE, 'repaint.py')).read())


# ===================================================================== 段 5: 動き（この体の寸法と、関門 3 の上限の 8 割で決め直す）
if STAGE == 5:
    from mathutils import Matrix
    Mx = Matrix
    bpy.ops.wm.open_mainfile(filepath=os.path.join(WORK, 'stage4r.blend'))   # 3 回目: 塗り直した物から
    rig = bpy.data.objects['rig']; MO = CFG['motion']; AD = float(os.environ.get('ARMDOWN', MO['armDown']))
    for mi_, path_ in ((0, os.path.join(WORK, 'body-r3.png')), (1, os.path.join(CH, 'face4.png'))):   # 3 回目: 塗り直した絵を読み直す
        for n_ in bpy.data.objects['avatar'].data.materials[mi_].node_tree.nodes:
            if n_.type == 'TEX_IMAGE':
                im_ = bpy.data.images.load(path_, check_existing=False); im_.colorspace_settings.name = n_.image.colorspace_settings.name
                im_.pack(); im_.name = n_.image.name + '_r3'; n_.image = im_
    src = open('/home/otosa/mogumo-go/art/prototypes/avatar/blender-v2.py').read().split('\n')
    block = '\n'.join(src[333:441])   # spline・WALK・RUN・gait・joy・idle・lift（blender-v2.py の動きの節。決め方の実績）
    block = block.replace("A = RUNA if run else 0.28", "A = MO['runSwing'] if run else MO['walkSwing']")
    block = block.replace("p['arm' + s] = -A * c + (0.05 if run else 0.0)", "p['arm' + s] = -A * c + (MO.get('runArmOffset', 0.05) if run else 0.0)")   # 女の子 3 回目: 走りの前の振りを抑える
    assert "runArmOffset" in block
    block = block.replace("(1.45 + 0.12 * -ce) if run else (0.32 + 0.12 * -ce)", "(MO['runElbow'] + 0.12 * -ce) if run else (0.32 + 0.12 * -ce)")
    # 3 回目: わきを閉じる（腕の開きの足し分を設定から）。手は軽く握る（指のかたまりを曲げる）。うれしいは前の版と同じ開き・手は開いたまま
    # 4 回目（オーナー: 走りの足をもっとまっすぐ）: 走りは腰のひねりを小さく、ももを内へ戻して、足を前後にまっすぐ振る
    assert "p['hipTwist'] = -(0.12 if run else 0.10) * c" in block
    block = block.replace("p['hipTwist'] = -(0.12 if run else 0.10) * c", "p['hipTwist'] = -(MO.get('runHipTwist', 0.12) if run else 0.10) * c\n    p['legOut'] = -MO.get('runLegIn', 0.0) if run else 0.0")
    block = block.replace("p['armOut'] = 0.12 if run else 0.04", "p['armOut'] = MO['runOut'] if run else MO['walkOut']\n    for s_ in 'LR': p['fingers' + s_] = MO['fistRun'] if run else MO['fistWalk']")
    block = block.replace("p = {'armOut': 0.55 + 0.15 * math.sin(TAU * ph)", "p = {'armOut': 0.55 + (AD - 0.60) + 0.15 * math.sin(TAU * ph)")
    block = block.replace("'armOut': 0.03 + 0.02 * b, 'pack': 0.01 * b}", "'armOut': MO['idleOut'] + 0.02 * b, 'pack': 0.01 * b, 'fingersL': MO['fistIdle'], 'fingersR': MO['fistIdle']}")
    assert block.count("MO['fistRun']") == 1 and block.count("MO['fistIdle']") == 2 and "(AD - 0.60)" in block
    ns = dict(globals()); ns.update(MO=MO, AD=AD)
    exec(block, ns)
    # 走り: 股の前は上限の 8 割まで、ひざは上限の 8 割まで（体のはずみで走りを見せる）
    RUN = ns['RUN']
    RUN['thigh'] = [(p, v * MO['runThighScale'] if v > 0 else v) for p, v in RUN['thigh']]
    RUN['knee'] = [(p, v * MO['runKneeScale']) for p, v in RUN['knee']]
    lim = CFG['limits']
    LOG['run_max'] = dict(thigh=max(v for _, v in RUN['thigh']), knee=max(v for _, v in RUN['knee']), limits=lim)
    def ap(p): apply_pose(rig, p, AD)
    reset(rig)
    REST_ANKLE, REST_TOE = rig.pose.bones['footL'].head.z, rig.pose.bones['footL'].tail.z
    def ground_clear():
        m = 9.0
        for s in 'LR':
            f = rig.pose.bones['foot' + s]; m = min(m, f.head.z - REST_ANKLE, f.tail.z - REST_TOE)
        return m
    def idle_r5(ph):
        T2 = 2 * math.pi
        br = math.sin(T2 * 2 * ph)            # 息（4 秒に 2 回）
        sw = math.sin(T2 * ph)                # 体重の左右の移動（4 秒に 1 回）
        p = {'hipRoll': 0.018 * sw, 'hipTwist': 0.012 * math.sin(T2 * (ph - 0.15)),
             'chestRoll': -0.014 * sw, 'chestLean': -0.018 * br,
             'headPitch': -0.012, 'headTwist': 0.03 * math.sin(T2 * (ph - 0.3)),
             'armOut': MO['idleOut'] + 0.012 * br, 'elbowL': 0.14 + 0.03 * br, 'elbowR': 0.14 + 0.03 * br,
             'fingersL': MO['fistIdle'], 'fingersR': MO['fistIdle']}
        return p
    ACTS = {'walk': (30, lambda ph: ns['gait'](ph, ns['WALK'], False), lambda ph: 0.0),
            'run': (18, lambda ph: ns['gait'](ph, RUN, True), ns['lift_run']),
            'idle': (120, idle_r5, lambda ph: 0.0),   # 5 回目: ふくらまさない自然な待機（体重の移動・息で胸と肩が少し上がる・頭のゆらぎ）。4 秒
            'joy': (24, ns['joy'], ns['lift_joy'])}
    bpy.context.scene.render.fps = 30
    rig.animation_data_create()
    # 角度の上限を数える（動きの全コマで）
    peak = defaultdict(float)
    for name, (N, fn, lift) in ACTS.items():
        ys = np.zeros(N)
        if lift is not None:
            for i in range(N):
                ap(fn(i / N)); ys[i] = -ground_clear()
            k = np.array([0.25, 0.5, 0.25])
            for _ in range(2): ys = k[0] * np.roll(ys, 1) + k[1] * ys + k[2] * np.roll(ys, -1)
            ys += np.array([lift(i / N) for i in range(N)])
        act = bpy.data.actions.new(name); rig.animation_data.action = act
        for i in range(N + 1):
            p = fn((i % N) / N)
            for k_ in ('pack', 'packRoll'): p.pop(k_, None)   # 持ち物は揺らさない
            if lift is not None: p['y'] = float(ys[i % N])
            for k_ in ('armL', 'armR', 'thighL', 'thighR', 'kneeL', 'kneeR', 'elbowL', 'elbowR'):
                peak[k_[:-1] + ('+' if p.get(k_, 0) >= 0 else '-')] = max(peak[k_[:-1] + ('+' if p.get(k_, 0) >= 0 else '-')], abs(p.get(k_, 0)))
            ap(p); key_all(rig, i + 1)   # コマは 1 から（0 から始めると、書き出しで前の動きの姿勢が 0 コマ目に混ざった）
        act.use_fake_user = True   # 書き出しは ACTIONS（NLA で書き出すと、0 コマ目に別の動きの姿勢が混ざった）
        rig.animation_data.action = None
        LOG[f'{name}_y'] = [round(float(ys.min()), 4), round(float(ys.max()), 4)]
    LOG['peak_angles'] = {k: round(v, 3) for k, v in peak.items()}
    # 3 回目: わきのすき間（腕・手と、胴・持ち物・足の面との、符号つきの距離の最小。負ならめりこみ）を全コマで測る
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    av = bpy.data.objects['avatar']; mm = av.data; nv_ = len(mm.vertices)
    gidx = {g.index: g.name for g in av.vertex_groups}
    armw = np.zeros(nv_); headw = np.zeros(nv_); side = np.zeros(nv_, int); part = np.zeros(nv_, int)
    for v in mm.vertices:
        for g in v.groups:
            nm_ = gidx[g.group]
            if nm_[:-1] in ('upperarm', 'forearm', 'hand', 'fingers'):
                armw[v.index] += g.weight; side[v.index] = 1 if nm_[-1] == 'L' else -1
                part[v.index] = max(part[v.index], ('upperarm', 'forearm', 'hand', 'fingers').index(nm_[:-1]) + 1 if g.weight > 0.5 else 0)
            if nm_ == 'head': headw[v.index] += g.weight
    R0 = np.array([v.co for v in mm.vertices]); shj = {1: np.array(rig.data.bones['upperarmL'].head_local), -1: np.array(rig.data.bones['upperarmR'].head_local)}
    dsh = np.array([np.linalg.norm(R0[i] - shj[side[i]]) if side[i] else 0 for i in range(nv_)])
    # 腕の点のうち、わきより下（腕の島）で、肩の関節から 0.05 より先（肩のつなぎ目の点は、胴と重みを分け合うので数えない）
    armv = np.nonzero((armw > 0.99) & (R0[:, 2] < CFG['landmarks']['armpit'] - 0.012) & (dsh > 0.05))[0]; torv = (armw < 1e-4) & (headw < 0.5)
    TRI_ = np.array([p_.vertices[:] for p_ in mm.polygons]); tf = TRI_[torv[TRI_].all(1)]
    GAP = {}
    for name, (N, fn, lift) in ACTS.items():
        rig.animation_data.action = bpy.data.actions[name]; best = (9.0, 0, ''); far = (9.0, 0, '')
        for i in range(1, N + 1):
            bpy.context.scene.frame_set(i); dg = bpy.context.evaluated_depsgraph_get(); em = av.evaluated_get(dg).to_mesh()
            P_ = np.empty(nv_ * 3, np.float32); em.vertices.foreach_get('co', P_); P_ = P_.reshape(-1, 3); av.evaluated_get(dg).to_mesh_clear()
            bvh = BVHTree.FromPolygons(P_.tolist(), tf.tolist())
            for vi in armv:
                r_ = bvh.find_nearest(Vector(P_[vi]))
                if r_[0] is None: continue
                sd = (Vector(P_[vi]) - r_[0]).dot(r_[1])
                if dsh[vi] > 0.09 and sd < far[0]: far = (sd, i, ('上腕', '前腕', '手', '指')[part[vi] - 1] + ('L' if side[vi] > 0 else 'R'))
                if sd < best[0]: best = (sd, i, ('上腕', '前腕', '手', '指')[part[vi] - 1] + ('L' if side[vi] > 0 else 'R'), [round(float(x), 3) for x in R0[vi]], int(r_[2]), [round(float(x), 3) for x in R0[tf[r_[2]][0]]])
        GAP[name] = dict(min=round(float(best[0]), 4), frame=best[1], part=best[2], rest=best[3] if len(best) > 3 else None, face_rest=best[5] if len(best) > 3 else None, beyond009=dict(min=round(float(far[0]), 4), frame=far[1], part=far[2]))
        rig.animation_data.action = None
    LOG['arm_gap'] = GAP
    print('GAP', json.dumps(GAP, ensure_ascii=False))
    if os.environ.get('NOEXPORT'): raise SystemExit
    reset(rig)
    bpy.context.scene.frame_start = 1; bpy.context.scene.frame_set(1)
    save('stage5.blend')
    out = os.environ.get('OUT', os.path.join(CH, 'avatar.glb'))
    export(out, 'ACTIONS')
    tris = sum(len(p.vertices) - 2 for p in bpy.data.objects['avatar'].data.polygons)
    LOG['export'] = dict(bytes=os.path.getsize(out), tris=tris, bones=len(rig.data.bones), actions=[a.name for a in bpy.data.actions])
    json.dump(LOG, open(os.path.join(WORK, 'stage5-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE5', json.dumps(LOG, ensure_ascii=False))

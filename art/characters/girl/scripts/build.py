# 女の子（102）を段ごとに組み立てる。男の子の build.py を写して直したもの。方針書 avatar-character-pipeline.md・詳細設計書 D5〜D10。
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
NAMES = ['cardigan', 'hair', 'skin', 'pack', 'shoe', 'eyes', 'skirt', 'socks', 'strap', 'red', 'green', 'tie', 'sole']
NI = {n: i for i, n in enumerate(NAMES)}
HEADISH = [NI[n] for n in ('hair', 'eyes', 'red', 'green', 'tie')]   # 頭に 100% にする区分け（頭の肌は首の帯より上）


# ===================================================================== 段 2: 向き・大きさ・掃除・区分け（色は段 45 で塗り直すので、ここでは直さない）
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
    TRI = np.empty(len(me.polygons) * 3, np.int64); me.polygons.foreach_get('vertices', TRI); TRI = TRI.reshape(-1, 3)
    vcol = np.zeros((nv, 3)); vcnt = np.zeros(nv)
    for k in range(3): np.add.at(vcol, TRI[:, k], col); np.add.at(vcnt, TRI[:, k], 1)
    vcol /= np.maximum(vcnt, 1)[:, None]
    h_, s_, v_ = hsv(vcol)
    x, y, z = V[:, 0], V[:, 1], V[:, 2]; ax = np.abs(x)
    nbr = vneighbors(me)
    NECK, AP = L['neck'], L['armpit']
    lab = np.full(nv, NI['cardigan'])
    # ---- 腕（わきより下で胴の島と別の島。わきより上は肩の帯の外）: 袖と手を、腕の軸に沿った袖口で分ける ----
    below = z < AP - 0.012
    par = np.arange(nv)
    def find(a):
        while par[a] != a: par[a] = par[par[a]]; a = par[a]
        return a
    for i in np.nonzero(below)[0]:
        for j in nbr[i]:
            if below[j]:
                ra, rb = find(i), find(j)
                if ra != rb: par[ra] = rb
    roots = np.array([find(i) for i in range(nv)])
    rr, cnt = np.unique(roots[below], return_counts=True)
    main = rr[cnt.argmax()]
    ARM = {}
    skinish = (h_ < 0.055) | (h_ > 0.97)
    for r in rr:
        m = below & (roots == r)
        if r == main or m.sum() < 50 or np.abs(V[m, 0]).mean() < 0.15: continue
        sd = 'L' if V[m, 0].mean() > 0 else 'R'; sg = 1 if sd == 'L' else -1
        P = V[m]; c0 = P.mean(0); _, _, vt = np.linalg.svd(P - c0); a = vt[0]
        if a[0] * sg < 0: a = -a
        tip = c0 + a * ((P - c0) @ a).max()
        sh = np.array([sg * L['shoulder_x'], c0[1], AP + 0.1])        # 肩のおおよその所（軸の向きを決めるため）
        a2 = tip - sh; a2 /= np.linalg.norm(a2)
        zone = (sg * x > L['shoulder_x'] + 0.02) & (z < AP + 0.08) & (z > 0.2)
        zone |= m
        t = (V - sh) @ a2; tl = float(np.linalg.norm(tip - sh)); cuff = None
        for t0 in np.arange(0.4 * tl, tl, 0.002):
            b = zone & (t >= t0) & (t < t0 + 0.004)
            if b.sum() > 6 and skinish[b].mean() > 0.5: cuff = float(t0); break
        ARM[sd] = dict(sh=sh.tolist(), a=a2.tolist(), tip=tip.tolist(), cuff=cuff, tl=tl)
        lab[zone & (t > cuff)] = NI['skin']
        lab[zone & (t <= cuff)] = NI['cardigan']
    LOG['arms'] = {k: dict(cuff=round(v['cuff'], 4), tl=round(v['tl'], 4), tip=np.round(v['tip'], 3).tolist()) for k, v in ARM.items()}
    armz = np.zeros(nv, bool)
    for sd, sg in (('L', 1), ('R', -1)): armz |= (sg * x > L['shoulder_x'] + 0.02) & (z < AP + 0.08) & (z > 0.2)
    # ---- 足・スカート（位置で決める）----
    def legd(sg): return np.hypot(x - sg * L['leg_x'], y - LEGY)
    LEGY = float(np.median(y[(z > 0.12) & (z < 0.16) & (ax < 0.12)]))
    inleg = (np.minimum(legd(1), legd(-1)) < L['leg_r']) & (z < L['crotch'] - 0.005)
    lowz = z < L['skirt_top']
    # スカート: 足の軸から leg_r より外で、z 0.15〜skirt_top（すそは後ろで低いので、高さだけで切らない）。中の足は肌
    shell = lowz & ~armz & (np.minimum(legd(1), legd(-1)) > L['skirt_r']) & (z > 0.15)
    lab[lowz & ~armz] = NI['skin']
    lab[shell] = NI['skirt']
    lab[lowz & ~armz & ~inleg & (z >= L['crotch'] - 0.005)] = NI['skirt']   # スカートの中の、足のつけ根より上（中のパンツの所）
    lab[(z < L['sock_top']) & ~armz] = NI['socks']
    lab[(z < L['shoe_line']) & ~armz] = NI['shoe']
    lab[(z < L['sole_z']) & ~armz] = NI['sole']
    LOG['leg_y'] = round(LEGY, 4)
    # ---- 持ち物（背中から後ろへ出た所）と肩ひも（桃色）----
    pinkc = ((h_ > 0.93) | (h_ < 0.03)) & (s_ > 0.42) & (v_ > 0.45)
    PZ = L['pack_z']
    torso = ~armz & (z >= L['skirt_top']) & (z < NECK + 0.01)
    packbody = torso & (y > L['pack_y']) & (z > PZ[0]) & (z < PZ[1]) & (ax < L['pack_x'])
    lab[packbody] = NI['pack']
    lab[torso & ~packbody & pinkc & (z < NECK - 0.005)] = NI['strap']
    # ---- 首・頭 ----
    head = (z > NECK)
    dark = (v_ < 0.42) & ~pinkc
    hairish = dark & (z > 0.45) & ~packbody
    lab[head] = NI['skin']
    lab[hairish & ~armz] = NI['hair']
    twin = (z > 0.47) & (z < 0.62) & (ax > 0.17) & ~armz & ~packbody   # ツインテールの先（生成の色が明るい所も髪）
    lab[twin] = NI['hair']
    lab[torso & ~packbody & skinish & (s_ > 0.45) & (z > NECK - 0.05) & ~pinkc & (ax < 0.11)] = NI['skin']   # 首の肌（ツインテールの先は入れない）
    red = (z > 0.75) & ((h_ > 0.95) | (h_ < 0.035)) & (s_ > 0.62) & (v_ > 0.35)
    green = (z > 0.75) & (h_ > 0.12) & (h_ < 0.5) & (s_ > 0.25)
    lab[red] = NI['red']; lab[green] = NI['green']
    tie = (z > 0.72) & pinkc & ~red & (s_ < 0.62)
    lab[tie] = NI['tie']
    # 目・まゆ・口: 顔の前の暗い所（髪のかたまりにつながらない小島）
    facezone = head & (y < -0.06) & (ax < 0.16) & (z < 0.74) & (z > 0.57)
    LOG['labels_raw'] = {n: int((lab == i).sum()) for i, n in enumerate(NAMES)}
    # 髪のかたまり: 髪の点のつながりで一番大きいものを髪、顔の前の小さいものは目
    hm = lab == NI['hair']
    par = np.arange(nv)
    for i in np.nonzero(hm)[0]:
        for j in nbr[i]:
            if hm[j]:
                ra, rb = find(i), find(j)
                if ra != rb: par[ra] = rb
    roots = np.array([find(i) for i in range(nv)])
    rr, cnt = np.unique(roots[hm], return_counts=True)
    big = rr[cnt.argmax()]
    for r, c_ in zip(rr, cnt):
        m = hm & (roots == r)
        if r != big and (facezone[m].mean() > 0.5): lab[m] = NI['eyes']
    LOG['hair_islands'] = sorted(cnt.tolist(), reverse=True)[:12]
    fixed = (z < L['skirt_top']) | armz
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
            if len(mem) < 12 and lab[sidx] not in (NI['eyes'], NI['red'], NI['green'], NI['tie']): small.append(mem)
        if not small: break
        for mem in small:
            ms = set(mem); c = np.zeros(len(NAMES), int)
            for a_ in mem:
                for b_ in nbr[a_]:
                    if b_ not in ms: c[lab[b_]] += 1
            if c.sum(): lab[mem] = c.argmax()
    LOG['labels'] = {n: int((lab == i).sum()) for i, n in enumerate(NAMES)}
    me.attributes.new('lab', 'INT', 'POINT').data.foreach_set('value', lab)
    seg = np.array([np.bincount(lab[t], minlength=len(NAMES)).argmax() for t in TRI])
    me.attributes.new('seg', 'INT', 'FACE').data.foreach_set('value', seg)
    json.dump(dict(arms=ARM, leg_y=LEGY), open(os.path.join(WORK, 'stage2-geo.json'), 'w'), indent=1)
    save('stage2.blend')
    # 確かめ用: 区分けの色で塗った GLB（点の色 → 絵に焼かず、材質を区分けごとにする）
    if os.environ.get('PREVIEW'):
        Cc = CFG['repaint']['colors']
        me.materials.clear()
        for n in NAMES:
            m_ = bpy.data.materials.new(n); m_.use_nodes = True
            m_.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = tuple(np.array(Cc[n]) / 255.0) + (1,) if False else tuple((np.array(Cc[n]) / 255.0) ** 2.2) + (1,)
            me.materials.append(m_)
        me.polygons.foreach_set('material_index', seg)
        bpy.ops.export_scene.gltf(filepath=os.path.join(WORK, 'stage2-seg.glb'), export_format='GLB', export_apply=False)
    json.dump(LOG, open(os.path.join(WORK, 'stage2-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE2', json.dumps(LOG, ensure_ascii=False))


# ===================================================================== 段 3〜5 の道具
def sstep(t):
    t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


def vert_seg(me):
    """女の子: 点ごとの区分け（段 2 の lab）を、男の子の番号（0 体 1 髪 2 肌 3 持ち物 4 靴 5 目）に寄せて返す。
    髪どめ（赤・緑・ゴム）は髪、靴底は靴。スカート 6・くつした 7・肩ひも 8 はそのまま。2 つ目は元の lab"""
    lab = np.empty(len(me.vertices), int); me.attributes['lab'].data.foreach_get('value', lab)
    vs = lab.copy(); vs[np.isin(lab, [NI['red'], NI['green'], NI['tie']])] = 1; vs[lab == NI['sole']] = 4
    return vs, lab


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
    for s, sg in (('L', 1), ('R', -1)):
        # 腕: まず A ポーズから下ろし（Y 軸）、それから前後に振る（X 軸）
        rot(rig, 'upperarm' + s, ('X', -g('arm' + s)), ('Y', sg * (armDown - g('armOut') - g('armOut' + s))))
        rot(rig, 'forearm' + s, ('X', -g('elbow' + s)))
        from mathutils import Quaternion
        for bn, q in (('hand' + s, Quaternion((0, 1, 0), sg * g('handTwist' + s))), ('fingers' + s, Quaternion((1, 0, 0), g('fingers' + s)))):
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
    below = V[:, 2] < ap - 0.012  # わきの点（輪切りで 0.355〜0.365 の間）より確実に下
    comp = vcomponents(me, below)
    roots, counts = np.unique(comp[below], return_counts=True)
    main = roots[counts.argmax()]
    arm_v = {}
    for r in roots:
        m = below & (comp == r)
        if r == main or m.sum() < 50: continue
        side = 'L' if V[m, 0].mean() > 0 else 'R'
        arm_v[side] = m
    LM = {}
    for s, sg in (('L', 1), ('R', -1)):
        P = V[arm_v[s]]; c0 = P.mean(0); _, _, vt = np.linalg.svd(P - c0); ax = vt[0]
        if ax[0] * sg < 0: ax = -ax
        t = (P - c0) @ ax
        tip = c0 + ax * t.max()
        # 肩: 腕の軸を胴へのばし、x = 肩の x（config）になる点
        # 肩の関節: x = shoulder_x の所で、わきの高さと肩の上の面の高さのまん中（腕の付け根の断面の中心）
        col_ = (np.abs(V[:, 0] - sg * L['shoulder_x']) < 0.01) & (V[:, 2] < neck - 0.02) & (np.abs(V[:, 1] - c0[1]) < 0.03) & ~np.isin(vs, [1, 3, 5])
        top_ = float(V[col_, 2].max())
        # 腕の太さ（手を除く所の、軸からの距離の中央値）から、付け根の断面の中心の高さ = わき + 半径 ÷ sin(開き)
        dist_ = np.linalg.norm((P - c0) - np.outer(t, ax), axis=1)
        r_ = float(np.median(dist_[t < t.max() - 0.08]))
        op_ = math.atan2(abs(ax[0]), abs(ax[2]))
        sh = np.array([sg * L['shoulder_x'], c0[1], (ap + top_) / 2])   # 女の子: わきと肩の上の面のまん中（わきより下の島が前腕と手だけで、軸が寝ているため、男の子の式は低すぎた）
        LM['arm_r' + s] = r_
        LM['shoulder_top' + s] = top_
        LM['shoulder' + s] = sh; LM['elbow' + s] = sh + (tip - sh) * L['elbow_frac']; LM['wrist' + s] = sh + (tip - sh) * L['wrist_frac']
        LM['handtip' + s] = tip
        d_ = tip - sh
        LM['armOpen' + s] = float(math.degrees(math.atan2(abs(d_[0]), abs(d_[2]))))
        leg = (V[:, 2] > 0.08) & (V[:, 2] < 0.15) & (sg * V[:, 0] > 0.01)
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
    for i in np.nonzero(V[:, 2] > lt - 0.04)[0]:
        mv = Wt[i, legb].sum()
        if mv <= 0: continue
        f = 0.0 if (vs[i] == 3 or (V[i, 1] > ty + 0.06 and V[i, 2] > pz0 - 0.02)) else sstep((lt - V[i, 2]) / 0.04)
        Wt[i, legb] *= f; Wt[i, B['hips']] += mv * (1 - f)
    # 女の子: スカート。上（すその上の帯）は今の重み（腰・胸）のまま、すそに向かって、同じ側の股の骨を SKIRT_K まで混ぜる
    # （足を前後に振ったとき、すそが足といっしょに少し動いて、足がスカートを突き抜けないように）。まん中は左右を半分ずつ
    SK = CFG['skirt']
    sk = np.nonzero(vs == 6)[0]
    for i in sk:
        mv = Wt[i, legb].sum(); Wt[i, legb] = 0; Wt[i, B['hips']] += mv
        f = SK['k'] * sstep((SK['top'] - V[i, 2]) / (SK['top'] - L['hem']))
        if f <= 0: continue
        wl = sstep(V[i, 0] / SK['mid'] + 0.5)
        Wt[i] *= (1 - f); Wt[i, B['thighL']] += f * wl; Wt[i, B['thighR']] += f * (1 - wl)
    LOG['skirt_verts'] = int(len(sk))
    torso_below = below & (comp == main)
    for s in 'LR': Wt[np.ix_(np.nonzero(torso_below)[0], armb[s] + hb[s])] = 0
    armz_all = np.zeros(len(V), bool)
    for s_ in 'LR': armz_all |= arm_v[s_]
    # 頭（髪・耳・顔）: head 100%。首の肌は首の帯（上下 0.03）で胸と混ぜる。フード（体）は胸
    headish = np.isin(vs, [1, 5]) | ((vs == 2) & (V[:, 2] > neck - 0.03) & ~armz_all)
    k = np.array([1.0 if vs[i] in (1, 5) else sstep((V[i, 2] - (neck - 0.03)) / 0.06) for i in range(len(V))])
    for i in np.nonzero(headish)[0]:
        Wt[i] *= (1 - k[i]); Wt[i, B['head']] += k[i]
    hood = np.isin(vs, [0, 8]) & (V[:, 2] > neck - 0.05)
    Wt[np.ix_(np.nonzero(hood)[0], [B['head']])] = 0
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



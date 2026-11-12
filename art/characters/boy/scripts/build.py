# 男の子（A ポーズの流れ）を段ごとに組み立てる。方針書 avatar-character-pipeline.md・詳細設計書 D5〜D10。
# 実行: blender -b -P build.py -- <段 2|3|4|5>   （前の段の .blend を work/ から読む。段 2 は生成の GLB から）
# 腕を切る・ふたをする処理は書かない（方針書 原則 1）。Blender で面を減らさない（D5-3）。
import bpy, bmesh, sys, os, math, json
import numpy as np
from collections import defaultdict

STAGE = int(sys.argv[sys.argv.index('--') + 1])
HERE = os.path.dirname(os.path.abspath(__file__))
BOY = os.path.dirname(HERE)
WORK = os.path.join(BOY, 'work'); os.makedirs(WORK, exist_ok=True)
CFG = json.load(open(os.path.join(BOY, 'config.json')))
G1 = json.load(open(os.path.join(BOY, 'gate1', CFG['generate']['gate1'])))
REF = '/home/otosa/mogumo-go/' + CFG['ref_prefix']
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


def ref_mean(view, cls, y0, y1):
    im = bpy.data.images.load(REF + view + '-rgba.png'); A = pixels(im)[::-1]
    ys, xs = np.nonzero(A[:, :, 3] > 0.5); A = A[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    yy = (np.arange(A.shape[0]) / A.shape[0])[:, None] * np.ones((1, A.shape[1]))
    m = (A[:, :, 3] > 0.5) & (yy >= y0) & (yy < y1) & in_class(A[:, :, :3], cls)
    return A[:, :, :3][m].mean(0)


def save(name):
    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(WORK, name), compress=True)


# ===================================================================== 段 2: 向き・大きさ・掃除・区分け・色合わせ
if STAGE == 2:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(BOY, 'src', CFG['generate']['file']))
    ob = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
    ob.name = 'avatar'; ob.data.name = 'avatar'
    me = ob.data
    me.transform(ob.matrix_world); ob.matrix_world.identity()
    V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
    zmin, zmax = V[:, 2].min(), V[:, 2].max(); s = 1.0 / (zmax - zmin)
    cx, cy = (V[:, 0].max() + V[:, 0].min()) / 2, (V[:, 1].max() + V[:, 1].min()) / 2
    V = np.stack([(V[:, 0] - cx) * s, (V[:, 1] - cy) * s, (V[:, 2] - zmin) * s], 1)
    me.vertices.foreach_set('co', V.ravel()); me.update()
    # 掃除: 重なった点をまとめる（色の継ぎ目の UV は面の角ごとに残る）・法線を外向き
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
    C = CFG['colors']; L = CFG['landmarks']
    adj = face_adj(me)
    skin = in_class(col, C['skin'])
    # 区分け（D5-4）: 0 体（服など） 1 髪 2 肌（顔・耳・首・手・足） 3 持ち物 4 靴 5 目・まゆ（顔の上の暗い小島）
    seg = np.zeros(len(fc), int)
    head = fc[:, 2] > L['neck'] + 0.01
    # 頭の肌でない面のつながり: 一番大きいかたまり＝髪（髪に混ざった青い点も髪に含める）。顔の前の小さな暗い島＝目・まゆ
    blue = in_class(col, C['top'])
    # 頭の高さの青: 小さい島は髪に混ざった点（髪にする）、大きいかたまりはフード（体のまま）
    bcomps, _ = components(head & blue, adj)
    hood = np.zeros(len(fc), bool)
    for c in bcomps:
        if fa[c].sum() >= 0.0005: hood[c] = True
    LOG['head_blue_islands'] = [round(float(fa[c].sum()), 5) for c in bcomps]
    comps, _ = components(head & ~skin & ~hood, adj)
    comps.sort(key=lambda c: -fa[c].sum())
    for i, c in enumerate(comps):
        front_small = fa[c].sum() < 0.002 and fn[c, 1].mean() < -0.3 and fc[c, 1].mean() < -0.05
        seg[c] = 5 if (i > 0 and front_small) else 1
    seg[head & skin] = 2
    # 目のまわり（顔の前の目の帯）の暗い面は目（色を動かさない）
    eb = L['eye_band']
    eyes = head & ~skin & (np.abs(fc[:, 0]) < eb[2]) & (fc[:, 2] > eb[0]) & (fc[:, 2] < eb[1]) & (fn[:, 1] < -0.3) & (fc[:, 1] < 0)
    seg[eyes] = 5
    # あごの下（首の前）の暗いしみは肌（参考の絵では首の肌）
    neckfix = (seg == 1) & (fc[:, 2] < L['chin']) & (fc[:, 1] < 0.0)
    seg[neckfix] = 2
    LOG['neck_fix_faces'] = int(neckfix.sum())
    # 手: わきより下で、腕の島（胴の外）の面のうち、手の先（gate1 の hand_t より先）
    arm_hand = np.zeros(len(fc), bool)
    for k, sign in (('L', 1), ('R', -1)):
        A = G1['arm'][k]
        sel = (sign * fc[:, 0] > 0.17) & (fc[:, 2] < A['armpit']) & (fc[:, 2] > A['hand'] - 0.02)
        Pm = fc[sel]; c0 = Pm.mean(0); _, _, vt = np.linalg.svd(Pm - c0); ax = vt[0]
        if np.dot(ax, [sign, 0, -0.3]) < 0: ax = -ax
        t = (fc - c0) @ ax; tn = (t - t[sel].min()) / (t[sel].max() - t[sel].min())
        hs = G1['inner'][k]['hand_t']
        hand = sel & ((tn >= hs + 0.1) | ((tn >= hs - 0.05) & ~in_class(col, C['top'])))  # 2 回目: 袖口のすぐ先の手も入れる
        arm_hand |= hand
        LOG[f'hand{k}_faces'] = int(hand.sum())
    top = in_class(col, C['top'])
    seg[arm_hand] = 2
    LOG['hand_blue_faces'] = int((arm_hand & top).sum())
    # 持ち物: 背中側の赤・桃色（ベルトの高さは除く）＋前の肩ひも
    pinkish = in_class(col, C['pack'])
    belt = (fc[:, 2] > L['belt'][0]) & (fc[:, 2] < L['belt'][1]) & (fc[:, 1] < 0.04)  # 背中の持ち物の下のふちはベルトにしない
    # 腕の面（わきより下で胴の外）は持ち物にしない（手のひらの赤みが桃色の範囲に入るため）
    arm_zone = (np.abs(fc[:, 0]) > L['shoulder_x'] + 0.03) & (fc[:, 2] < L['armpit'] + 0.03)
    seg[pinkish & ~belt & ~arm_zone & (fc[:, 2] > 0.2) & (fc[:, 2] < L['neck'])] = 3
    # 2 回目: 背中から後ろへ出た所（リュックの本体・持ち手・ふたの下）は、色でなく場所で持ち物にする（ふちのぎざぎざ・暗いすき間の元）
    PZ = L['pack_zone']  # [背中の後ろの y, z の下, z の上, |x| の上限]
    packgeo = (fc[:, 1] > PZ[0]) & (fc[:, 2] > PZ[1]) & (fc[:, 2] < PZ[2] - 0.03) & (np.abs(fc[:, 0]) < PZ[3])
    packgeo |= (fc[:, 1] > PZ[0] + 0.025) & (fc[:, 2] >= PZ[2] - 0.03) & (fc[:, 2] < PZ[2] + 0.01) & (np.abs(fc[:, 0]) < 0.045)  # 持ち手（フードより後ろへ出た所だけ）
    seg[packgeo] = 3
    # 靴
    seg[(fc[:, 2] < L['shoe_top']) & in_class(col, C['shoes'])] = 4
    seg[(fc[:, 2] < L['shoe_top'] - 0.01)] = 4  # 2 回目: 靴の上のふちより下は色によらず靴（靴の横の肌色のしみ）
    # 足・首の肌
    seg[(fc[:, 2] <= L['neck'] + 0.01) & skin & (seg == 0)] = 2
    me.attributes.new('seg', 'INT', 'FACE').data.foreach_set('value', seg)
    LOG['seg_counts'] = {n: int((seg == i).sum()) for i, n in enumerate(['body', 'hair', 'skin', 'pack', 'shoes', 'eyes'])}

    # ---- 色合わせ（関門 2 で落ちた所だけ: 髪・持ち物の平均の色を参考へ移す、髪の青い点・手の青い所を周りの色に）----
    P = pixels(img); H, W = P.shape[:2]
    lab = np.full((H, W), -1, np.int16)   # 絵の画素ごとの区分け（面の UV の三角を塗る）
    fixm = np.zeros((H, W), np.int8)      # 1 = 手の青い面（肌で塗る）
    # ---- 色の直し（2 回目）: 区分けごとの平均の色の移動と、しみの塗りつぶし（周りの同じ区分けの色で）だけ ----
    # 面ごとに「直す所」の種類を決め、絵の上でその種類の中の「しみ」の画素を、同じ種類の良い画素からにじませて埋める
    ty0 = float(np.median(fc[(np.abs(fc[:, 0]) < 0.1) & (fc[:, 2] > 0.28) & (fc[:, 2] < 0.34), 1]))
    cat = np.zeros(len(fc), np.int8)
    hood_rim = (seg == 0) & (hood | ((fc[:, 2] > L['neck'] - 0.04) & (fc[:, 1] > 0.0)))  # フードの後ろの上のふち
    underarm = (seg == 0) & (np.abs(fc[:, 0]) > 0.06) & (np.abs(fc[:, 0]) < L['shoulder_x'] + 0.06) & (fc[:, 2] > L['belt'][1]) & (fc[:, 2] < L['armpit'] + 0.06)
    hem = L['shoe_top']
    for z0 in np.arange(L['shoe_top'], L['crotch'], 0.005):
        bnd = (fc[:, 2] >= z0) & (fc[:, 2] < z0 + 0.005) & (np.abs(fc[:, 0]) < 0.13)
        if fa[bnd & top].sum() > 0.5 * fa[bnd].sum(): hem = float(z0); break
    LOG['shorts_hem'] = round(hem, 3)
    legskin = ((seg == 0) | (seg == 2)) & (fc[:, 2] > L['shoe_top'] - 0.004) & (fc[:, 2] < hem - 0.004) & (np.abs(fc[:, 0]) < 0.13)
    seg[legskin] = 2
    shoes = (seg == 4)
    neckring = ((seg == 2) | neckfix) & (fc[:, 2] > L['neck'] - 0.04) & (fc[:, 2] < L['chin'] + 0.01)
    chin_under = np.isin(seg, [1, 2]) & (fn[:, 2] < -0.35) & (fc[:, 2] > L['neck'] - 0.03) & (fc[:, 2] < L['chin'] + 0.04) & (fc[:, 1] < 0.03)
    packf = (seg == 3)
    nearpack = (seg == 0) & (fc[:, 1] > 0.03) & (fc[:, 2] > L['belt'][1] + 0.005) & (fc[:, 2] < L['neck'] + 0.02)
    neckback = np.isin(seg, [0, 2]) & (fc[:, 2] > L['neck'] - 0.06) & (fc[:, 2] < L['neck'] + 0.03) & (np.abs(fc[:, 0]) < 0.13) & ~neckring & ~chin_under  # フードのえりのまわり（前も後ろも）
    faceref = (seg == 2) & (fc[:, 2] > L['chin'] + 0.02) & (fc[:, 2] < L['eye_band'][0]) & (fn[:, 1] < -0.5)  # 首・あごの下を合わせる先（ほおの肌）
    # 先に書いた方が優先
    for code, m in ((1, arm_hand), (6, neckring | chin_under), (4, legskin), (5, shoes), (7, packf), (9, neckback), (8, nearpack), (2, hood_rim), (3, underarm), (10, faceref)):
        cat[(cat == 0) & m] = code
    LOG['fix_faces'] = {str(k): int((cat == k).sum()) for k in range(1, 11)}
    U = uv * [W, H]
    lv = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', lv)
    Vc = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', Vc); PC = Vc.reshape(-1, 3)[lv].reshape(-1, 3, 3)
    xyz = np.full((H, W, 3), np.nan, np.float32)   # 2 回目: 画素ごとの 3D の位置（境目を三角形でなく高さの線で決めるため）
    for f in range(len(fc)):
        T = U[f]; x0, y0 = np.floor(T.min(0)).astype(int); x1, y1 = np.ceil(T.max(0)).astype(int) + 1
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        (ax_, ay), (bx, by), (cx_, cy_) = T
        den = (by - cy_) * (ax_ - cx_) + (cx_ - bx) * (ay - cy_)
        if abs(den) < 1e-12: continue
        w0 = ((by - cy_) * (X - cx_) + (cx_ - bx) * (Y - cy_)) / den; w1 = ((cy_ - ay) * (X - cx_) + (ax_ - cx_) * (Y - cy_)) / den
        ins = (w0 >= -0.02) & (w1 >= -0.02) & (1 - w0 - w1 >= -0.02)
        lab[y0:y1, x0:x1][ins] = seg[f]
        if cat[f]: fixm[y0:y1, x0:x1][ins] = cat[f]
        w2 = 1 - w0 - w1
        xyz[y0:y1, x0:x1][ins] = (w0[:, :, None] * PC[f, 0] + w1[:, :, None] * PC[f, 1] + w2[:, :, None] * PC[f, 2])[ins]
    # 面に覆われない画素（絵のすき間のにじみ止め）は、近い画素の区分けにする
    cov = lab >= 0
    for _ in range(6):
        grow = ~cov
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb = np.roll(np.roll(lab, dy, 0), dx, 1); nf = np.roll(np.roll(fixm, dy, 0), dx, 1)
            take = grow & (lab < 0) & (nb >= 0)
            lab[take] = nb[take]; fixm[take] = nf[take]
        cov = lab >= 0
    rgb = P[:, :, :3].copy()
    # 2 回目: 靴と足・手と袖の境目は、面（三角形）でなく画素の 3D の位置で決める（三角形のぎざぎざが見えたため）
    X_, Y_, Z_ = xyz[:, :, 0], xyz[:, :, 1], xyz[:, :, 2]
    have = ~np.isnan(Z_); Zs = np.where(have, Z_, 9); Xs = np.where(have, X_, 9)
    SL = L['shoe_line']
    legs_px = have & (np.abs(Xs) < 0.14) & (Zs < hem - 0.006) & ~np.isin(fixm, [1])
    shoe_px = legs_px & (Zs < SL); leg_px = legs_px & (Zs >= SL)
    fixm[shoe_px] = 5; lab[shoe_px] = 4; fixm[leg_px] = 4; lab[leg_px] = 2
    LOG['cuff'] = {}
    for k, sign in (('L', 1), ('R', -1)):
        A = G1['arm'][k]
        sel = (sign * fc[:, 0] > 0.17) & (fc[:, 2] < A['armpit']) & (fc[:, 2] > A['hand'] - 0.02)
        Pm = fc[sel]; c0 = Pm.mean(0); _, _, vt = np.linalg.svd(Pm - c0); ax = vt[0]
        if np.dot(ax, [sign, 0, -0.3]) < 0: ax = -ax
        t = (fc - c0) @ ax; tmin, tmax = t[sel].min(), t[sel].max()
        armp = have & (sign * Xs > 0.17) & (Zs < A['armpit'])
        tn = np.where(armp, ((np.nan_to_num(xyz) - c0) @ ax - tmin) / (tmax - tmin), -9)
        skp = in_class(rgb, C['skin'])
        cuff = None
        for b0 in np.arange(0.3, 1.0, 0.01):   # 袖口: 腕の軸に沿って、肌の画素が半分を超える所
            bb = armp & (tn >= b0) & (tn < b0 + 0.01)
            if bb.sum() > 50 and (bb & skp).sum() / bb.sum() > 0.5: cuff = float(b0); break
        if cuff is None: continue
        LOG['cuff'][k] = round(cuff, 3)
        hand_px = armp & (tn >= cuff); sleeve_px = armp & (tn >= cuff - 0.08) & (tn < cuff)
        fixm[hand_px] = 1; lab[hand_px] = 2; fixm[sleeve_px] = 11; lab[sleeve_px] = 0
    # 口・顔の前は首の直しに入れない（あごの下の直しが口にかかった）
    Ys = np.where(have, Y_, 9)
    fixm[(fixm == 6) & (Zs > L['chin'] - 0.01) & (Ys < -0.07)] = 0

    def fill(bad, good, it=200):
        """しみ（bad）を、まわりの良い画素（good）の色を少しずつにじませて埋める。届かない所は良い画素の中央値"""
        bad = bad & ~good
        if not bad.any() or not good.any(): return 0
        ys, xs = np.nonzero(bad); y0, y1, x0, x1 = max(ys.min() - 24, 0), ys.max() + 25, max(xs.min() - 24, 0), xs.max() + 25
        B = bad[y0:y1, x0:x1].copy(); Gd = good[y0:y1, x0:x1].copy(); C = rgb[y0:y1, x0:x1].copy()
        for _ in range(it):
            if not B.any(): break
            m_ = Gd.astype(np.float32); acc = np.zeros_like(C); cnt = np.zeros_like(m_)
            for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (-1, -1), (1, -1), (-1, 1)):
                acc += np.roll(np.roll(C * m_[:, :, None], dy, 0), dx, 1); cnt += np.roll(np.roll(m_, dy, 0), dx, 1)
            gr = B & (cnt > 0)
            if not gr.any(): break
            C[gr] = acc[gr] / cnt[gr][:, None]; Gd |= gr; B &= ~gr
        n_ = int(bad.sum())
        rgb[y0:y1, x0:x1][bad[y0:y1, x0:x1]] = C[bad[y0:y1, x0:x1]]
        left = bad.copy(); left[y0:y1, x0:x1] &= B
        if left.any(): rgb[left] = np.median(rgb[good], 0)
        return n_

    # 髪: 混ざった青・肌色・白の点を埋めてから、平均の色を参考へ
    hair_px = lab == 1
    _, hs_, hv_ = hsv(rgb)
    blue_in_hair = hair_px & (in_class(rgb, C['top']) | (hv_ > 0.5))
    LOG['hair_blue_px'] = fill(blue_in_hair, hair_px & ~blue_in_hair)
    m_hair = rgb[hair_px].mean(0)
    r_hair = np.mean([ref_mean(v, C['hair_ref'], 0, 0.33) for v in ('front', 'side', 'back')], 0)
    rgb[hair_px] = np.clip(rgb[hair_px] + (r_hair - m_hair), 0, 1)
    SK = in_class(rgb, C['skin']); TOP = in_class(rgb, C['top']); _, sat_, val_ = hsv(rgb)
    # 1 手・4 足・6 首とあごの下: 肌でない・暗い画素を、同じ所の肌から
    def odd(zone, ok, d, lo=0.55, hi=1.5):  # 区分けの中央値と、色み（明るさを除いた色）が d より違う・明るさが lo〜hi 倍の外の画素（灰色・青・茶色のしみ）
        med = np.median(rgb[zone & ok], 0); ch = rgb / np.maximum(rgb.sum(2, keepdims=True), 1e-4); mc = med / max(med.sum(), 1e-4)
        lum = rgb.sum(2) / max(med.sum(), 1e-4)
        return (np.linalg.norm(ch - mc, axis=2) > d) | (lum < lo) | (lum > hi)
    for code, nm, vmin in ((1, 'hand_px', 0.55), (4, 'leg_px', 0.6), (6, 'neck_px', 0.5)):
        zone = fixm == code
        bad = zone & (~SK | (val_ < vmin)); bad |= zone & odd(zone, ~bad, 0.035)
        LOG[nm] = fill(bad, zone & ~bad)
    # 6 首・あごの下: しみを埋めたあと、平均の色を ほおの肌の平均へ（生成で焼き込まれた影の茶色の輪）
    z6 = fixm == 6; zr = (fixm == 10) & SK
    if z6.any() and zr.any():
        sh = rgb[zr].mean(0) - rgb[z6].mean(0); wz = np.clip((L['chin'] - 0.005 - Zs[z6]) / 0.025, 0, 1)[:, None]; rgb[z6] = np.clip(rgb[z6] + sh * 0.85 * wz, 0, 1)  # あごの前は少しずつ（境目の線を出さない）; LOG['neck_shift'] = sh.round(3).tolist()
        LOG['neck_px2'] = fill(z6 & odd(z6, z6, 0.03, 0.75, 1.3), z6 & ~odd(z6, z6, 0.03, 0.75, 1.3))  # 移したあとに残った桃色・茶色
    # 5 靴: 肌色・茶色の画素を、靴の青から
    zone = fixm == 5; skinish = zone & (hsv(rgb)[0] < 0.14) & (sat_ > 0.12)
    bad = skinish | (zone & ~TOP & (val_ > 0.35)); bad |= zone & odd(zone, ~bad, 0.05, 0.45, 1.6)
    LOG['shoe_px'] = fill(bad, zone & ~bad)
    # 2 フードのふち・3 わきの下・8 リュックのまわりの服・9 首の後ろ: 服の青でない・暗い画素を、服の青から
    for code, nm, vmin in ((2, 'hood_rim_px', 0.0), (3, 'underarm_px', 0.45), (8, 'nearpack_px', 0.35)):
        zone = fixm == code
        LOG[nm] = fill(zone & (~TOP | (val_ < vmin)), zone & TOP & (val_ >= vmin))
    # 11 袖口の手前: 肌色の画素を、袖の青から
    zone = fixm == 11; LOG['sleeve_px'] = fill(zone & ~(TOP & (val_ >= 0.35)), zone & TOP & (val_ >= 0.35))
    # 9 えりのまわり: 服の青・肌のどちらでもない画素（桃色・茶色・暗いすき間）を、近い青か肌から
    zone = fixm == 9; okc = (TOP & (val_ >= 0.35)) | (SK & (val_ >= 0.55))
    LOG['collar_px'] = fill(zone & ~okc, zone & okc)
    # 7 リュック: 青い画素（ふちのぎざぎざ）・とても暗い画素（ふたの下のすき間）を、リュックの色から。そのあと平均の色を参考へ
    zone = fixm == 7; PK = in_class(rgb, C['pack'])
    bad = zone & (~PK | (val_ < 0.38)); bad |= zone & odd(zone, ~bad, 0.07, 0.4, 1.7)
    LOG['pack_px'] = fill(bad, zone & ~bad)
    pack_px = lab == 3
    m_pack = rgb[pack_px].mean(0)
    r_pack = ref_mean('back', C['pack_ref'], 0.38, 0.75)
    rgb[pack_px] = np.clip(rgb[pack_px] + (r_pack - m_pack), 0, 1)
    LOG['colors'] = dict(hair_model=m_hair.round(3).tolist(), hair_ref=r_hair.round(3).tolist(), pack_model=m_pack.round(3).tolist(), pack_ref=r_pack.round(3).tolist())
    P[:, :, :3] = rgb
    img.pixels.foreach_set(P.ravel()); img.update(); img.pack()
    save('stage2.blend')
    # 確認用の GLB（形と色だけ）
    bpy.ops.export_scene.gltf(filepath=os.path.join(BOY, 'work', 'stage2.glb'), export_format='GLB', use_selection=False, export_apply=False)
    json.dump(LOG, open(os.path.join(BOY, 'work', 'stage2-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE2', json.dumps(LOG, ensure_ascii=False))


# ===================================================================== 段 3〜5 の道具
def sstep(t):
    t = min(1.0, max(0.0, t)); return t * t * (3 - 2 * t)


def vert_seg(me):
    """点ごとの区分け（その点を使う面の区分けの多い方）"""
    seg = np.empty(len(me.polygons), int); me.attributes['seg'].data.foreach_get('value', seg)
    cnt = np.zeros((len(me.vertices), 6), int)
    for p in me.polygons:
        for v in p.vertices: cnt[v, seg[p.index]] += 1
    return cnt.argmax(1), cnt


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
        col_ = (np.abs(V[:, 0] - sg * L['shoulder_x']) < 0.01) & (V[:, 2] < neck) & (np.abs(V[:, 1] - c0[1]) < 0.03) & (vs != 3)
        top_ = float(V[col_, 2].max())
        # 腕の太さ（手を除く所の、軸からの距離の中央値）から、付け根の断面の中心の高さ = わき + 半径 ÷ sin(開き)
        dist_ = np.linalg.norm((P - c0) - np.outer(t, ax), axis=1)
        r_ = float(np.median(dist_[t < t.max() - 0.08]))
        op_ = math.atan2(abs(ax[0]), abs(ax[2]))
        sh = np.array([sg * L['shoulder_x'], c0[1], ap + r_ / math.sin(op_)])
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
    pk = (vs == 3) & (V[:, 1] > ty + L['pack_dy'])  # 背中から後ろへ出た持ち物の本体だけ固くする（肩ひもは自動の重み）
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
    torso_below = below & (comp == main)
    for s in 'LR': Wt[np.ix_(np.nonzero(torso_below)[0], armb[s] + hb[s])] = 0
    # 頭（髪・耳・顔）: head 100%。首の肌は首の帯（上下 0.03）で胸と混ぜる。フード（体）は胸
    headish = np.isin(vs, [1, 5]) | ((vs == 2) & (V[:, 2] > neck - 0.03))
    k = np.array([1.0 if vs[i] in (1, 5) else sstep((V[i, 2] - (neck - 0.03)) / 0.06) for i in range(len(V))])
    for i in np.nonzero(headish)[0]:
        Wt[i] *= (1 - k[i]); Wt[i, B['head']] += k[i]
    hood = (vs == 0) & (V[:, 2] > neck - 0.05)
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
    # 前の版（boy-b-v2.glb）の うれしい のこまを、目の位置で合わせて写す
    src = bpy.data.images.load('/home/otosa/mogumo-go/art/characters/boy/work/old-face4.png')
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
    def mouth_box(img, eyes, h):
        sk = np.median(img[int(h * 0.3):int(h * 0.6), (eyes[0][3] + eyes[1][1]) // 2 - 10:(eyes[0][3] + eyes[1][1]) // 2 + 10].reshape(-1, 3), 0)
        r0 = max(e[2] for e in eyes) + 8; c0, c1 = eyes[0][3], eyes[1][1]
        d = np.linalg.norm(img[r0:int(h * 0.97), c0:c1] - sk, axis=2) > 0.15
        ys, xs = np.nonzero(d); return (ys.mean() + r0, xs.mean() + c0)
    mo = mouth_box(old_normal, EO, OH); mn_ = mouth_box(ns['normal'], EB, CHh)
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
    partB = partB.replace('PAD = 7', 'PAD = %d' % FC['erase_pad']).replace('ell(EB[0], 16), ell(EB[1], 16)', 'ell(EB[0], %d), ell(EB[1], %d)' % (FC['erase_pad'] + 9, FC['erase_pad'] + 9))
    assert 'PAD = %d' % FC['erase_pad'] in partB
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
    aimg.filepath_raw = os.path.join(BOY, 'face4.png'); aimg.file_format = 'PNG'; aimg.save()
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
    src = open('/home/otosa/mogumo-go/art/prototypes/avatar/blender-v2.py').read().split('\n')
    block = '\n'.join(src[333:441])   # spline・WALK・RUN・gait・joy・idle・lift（blender-v2.py の動きの節。決め方の実績）
    block = block.replace("A = RUNA if run else 0.28", "A = MO['runSwing'] if run else MO['walkSwing']")
    block = block.replace("(1.45 + 0.12 * -ce) if run else (0.32 + 0.12 * -ce)", "(MO['runElbow'] + 0.12 * -ce) if run else (0.32 + 0.12 * -ce)")
    # 3 回目: わきを閉じる（腕の開きの足し分を設定から）。手は軽く握る（指のかたまりを曲げる）。うれしいは前の版と同じ開き・手は開いたまま
    block = block.replace("p['armOut'] = 0.12 if run else 0.04", "p['armOut'] = MO['runOut'] if run else MO['walkOut']\n    for s_ in 'LR': p['fingers' + s_] = MO['fist']")
    block = block.replace("p = {'armOut': 0.55 + 0.15 * math.sin(TAU * ph)", "p = {'armOut': 0.55 + (AD - 0.60) + 0.15 * math.sin(TAU * ph)")
    block = block.replace("'armOut': 0.03 + 0.02 * b, 'pack': 0.01 * b}", "'armOut': MO['idleOut'] + 0.02 * b, 'pack': 0.01 * b, 'fingersL': MO['fist'], 'fingersR': MO['fist']}")
    assert block.count("MO['fist']") == 3 and "(AD - 0.60)" in block
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
    ACTS = {'walk': (30, lambda ph: ns['gait'](ph, ns['WALK'], False), lambda ph: 0.0),
            'run': (18, lambda ph: ns['gait'](ph, RUN, True), ns['lift_run']),
            'idle': (90, ns['idle'], None),
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
    out = os.environ.get('OUT', os.path.join(BOY, 'avatar.glb'))
    export(out, 'ACTIONS')
    tris = sum(len(p.vertices) - 2 for p in bpy.data.objects['avatar'].data.polygons)
    LOG['export'] = dict(bytes=os.path.getsize(out), tris=tris, bones=len(rig.data.bones), actions=[a.name for a in bpy.data.actions])
    json.dump(LOG, open(os.path.join(WORK, 'stage5-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE5', json.dumps(LOG, ensure_ascii=False))

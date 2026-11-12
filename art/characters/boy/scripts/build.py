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
G1 = json.load(open(os.path.join(BOY, 'gate1', 'boyS_s123_textured_00002_.json')))
REF = '/home/otosa/mogumo-go/art/prototypes/avatar/input/sheet-'
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
    bpy.ops.import_scene.gltf(filepath=os.path.join(BOY, 'src', 'boyS_s123_textured_00002_.glb'))
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
        hand = sel & (tn >= hs + 0.1)
        arm_hand |= hand
        LOG[f'hand{k}_faces'] = int(hand.sum())
    top = in_class(col, C['top'])
    seg[arm_hand] = 2
    LOG['hand_blue_faces'] = int((arm_hand & top).sum())
    # 持ち物: 背中側の赤・桃色（ベルトの高さは除く）＋前の肩ひも
    pinkish = in_class(col, C['pack'])
    belt = (fc[:, 2] > L['belt'][0]) & (fc[:, 2] < L['belt'][1])
    seg[pinkish & ~belt & (fc[:, 2] > 0.2) & (fc[:, 2] < L['neck'])] = 3
    # 靴
    seg[(fc[:, 2] < L['shoe_top']) & in_class(col, C['shoes'])] = 4
    seg[(fc[:, 2] < L['shoe_top'] * 0.6)] = 4
    # 足・首の肌
    seg[(fc[:, 2] <= L['neck'] + 0.01) & skin & (seg == 0)] = 2
    me.attributes.new('seg', 'INT', 'FACE').data.foreach_set('value', seg)
    LOG['seg_counts'] = {n: int((seg == i).sum()) for i, n in enumerate(['body', 'hair', 'skin', 'pack', 'shoes', 'eyes'])}

    # ---- 色合わせ（関門 2 で落ちた所だけ: 髪・持ち物の平均の色を参考へ移す、髪の青い点・手の青い所を周りの色に）----
    P = pixels(img); H, W = P.shape[:2]
    lab = np.full((H, W), -1, np.int16)   # 絵の画素ごとの区分け（面の UV の三角を塗る）
    fixm = np.zeros((H, W), np.int8)      # 1 = 手の青い面（肌で塗る）
    hand_blue = (arm_hand & top) | neckfix
    hood_rim = (seg == 0) & (hood | ((fc[:, 2] > L['neck'] - 0.04) & (fc[:, 1] > 0.0)))  # フードの後ろの上のふち（髪の色のしみ）
    U = uv * [W, H]
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
        if hand_blue[f]: fixm[y0:y1, x0:x1][ins] = 1
        elif hood_rim[f]: fixm[y0:y1, x0:x1][ins] = 2
    # 面に覆われない画素（絵のすき間のにじみ止め）は、近い画素の区分けにする
    cov = lab >= 0
    for _ in range(6):
        grow = ~cov
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            nb = np.roll(np.roll(lab, dy, 0), dx, 1)
            take = grow & (lab < 0) & (nb >= 0)
            lab[take] = nb[take]
        cov = lab >= 0
    rgb = P[:, :, :3].copy()
    hair_px = lab == 1
    _, hs_, hv_ = hsv(rgb)
    blue_in_hair = hair_px & (in_class(rgb, C['top']) | (hv_ > 0.5))  # 髪に混ざった青・肌色・白の点
    hair_ok = hair_px & ~blue_in_hair
    m_hair = rgb[hair_ok].mean(0)
    r_hair = np.mean([ref_mean(v, C['hair_ref'], 0, 0.33) for v in ('front', 'side', 'back')], 0)
    rgb[blue_in_hair] = m_hair
    LOG['hair_blue_px'] = int(blue_in_hair.sum())
    rgb[hair_px] = np.clip(rgb[hair_px] + (r_hair - m_hair), 0, 1)
    rim = (fixm == 2); rim_bad = rim & ~in_class(rgb, C['top'])
    rgb[rim_bad] = np.median(rgb[rim & ~rim_bad], 0)
    LOG['hood_rim_px'] = int(rim_bad.sum())
    pack_px = lab == 3
    m_pack = rgb[pack_px].mean(0)
    r_pack = ref_mean('back', C['pack_ref'], 0.38, 0.75)
    rgb[pack_px] = np.clip(rgb[pack_px] + (r_pack - m_pack), 0, 1)
    # 手の青い所: 手の肌の色（青でない手の画素の中央値）で塗る
    hand_skin = (lab == 2) & ~(fixm == 1) & in_class(rgb, C['skin'])
    sk = np.median(rgb[hand_skin], 0)
    # 塗る所のふちを 2 画素ぼかして、周りの肌となじませる
    fm = (fixm == 1).astype(np.float32)
    for _ in range(2): fm = np.maximum(fm, (np.roll(fm, 1, 0) + np.roll(fm, -1, 0) + np.roll(fm, 1, 1) + np.roll(fm, -1, 1)) / 4 * 0.7)
    rgb = rgb * (1 - fm[:, :, None]) + sk * fm[:, :, None]
    LOG['colors'] = dict(hair_model=m_hair.round(3).tolist(), hair_ref=r_hair.round(3).tolist(), pack_model=m_pack.round(3).tolist(), pack_ref=r_pack.round(3).tolist(), hand_skin=sk.round(3).tolist())
    P[:, :, :3] = rgb
    img.pixels.foreach_set(P.ravel()); img.update(); img.pack()
    save('stage2.blend')
    # 確認用の GLB（形と色だけ）
    bpy.ops.export_scene.gltf(filepath=os.path.join(BOY, 'work', 'stage2.glb'), export_format='GLB', use_selection=False, export_apply=False)
    json.dump(LOG, open(os.path.join(BOY, 'work', 'stage2-log.json'), 'w'), indent=1, ensure_ascii=False)
    print('STAGE2', json.dumps(LOG, ensure_ascii=False))

# キリン（女の子の repaint.py を写して、区分けと位置の境目をキリン用にした。毛は場所からのグラデーション＝案 A）: 塗り直し（段 4 のあと、段 5 の前）。build.py の段 45 から読む（exec）。
# 生成の色を捨て、区分けごとに元の立ち絵から取った色で塗る。陰は形から計算した陰（AO、なめらか）だけを薄く乗せる。
# 区分けは点（頂点）ごとに決めてなめらかにし、絵の画素ごとに 3D の位置で補って決める（面の境で切らない）。
# 顔の 4 こまは、目・まゆ・口・ほほの赤みだけ残し、肌は新しい肌の色にそろえる（こまの間でふちが同じことは保つ）。
from mathutils.bvhtree import BVHTree
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=os.path.join(WORK, 'stage4.blend'))
ob = bpy.data.objects['avatar']; me = ob.data; L = CFG['landmarks']; RC = CFG['repaint']
S3 = json.load(open(os.path.join(WORK, 'stage3-log.json')))['landmarks']
nv = len(me.vertices); nf = len(me.polygons)
V = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3)
NV = np.empty(nv * 3, np.float32); me.vertices.foreach_get('normal', NV); NV = NV.reshape(-1, 3)
TRI = np.empty(nf * 3, np.int64); me.polygons.foreach_get('vertices', TRI); TRI = TRI.reshape(-1, 3)
MAT = np.empty(nf, np.int64); me.polygons.foreach_get('material_index', MAT)
vs, _ = vert_seg(me)
bimg = None; fimg = None
for n_ in me.materials[0].node_tree.nodes:
    if n_.type == 'TEX_IMAGE': bimg = n_.image
for n_ in me.materials[1].node_tree.nodes:
    if n_.type == 'TEX_IMAGE': fimg = n_.image
fimg = bpy.data.images.load(os.path.join(WORK, 'face4-stage4.png'), check_existing=False); fimg.colorspace_settings.name = 'sRGB'   # 段 4 の絵から（何度やっても同じ結果）
for n_ in me.materials[1].node_tree.nodes:
    if n_.type == 'TEX_IMAGE': n_.image = fimg
fc, fn, fa, col, uv = face_data(ob, bimg)
vcol = np.zeros((nv, 3)); vcnt = np.zeros(nv)
for k in range(3):
    np.add.at(vcol, TRI[MAT == 0, k], col[MAT == 0]); np.add.at(vcnt, TRI[MAT == 0, k], 1)
vcol /= np.maximum(vcnt, 1)[:, None]
# 点のつながり
E = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
nbr = [[] for _ in range(nv)]
for a_, b_ in E: nbr[a_].append(b_); nbr[b_].append(a_)

# ---------------------------------------------------------------- 区分け（点ごと。段 2 の区分け lab をそのまま使う）
NAMES_R = NAMES   # build.py の区分けの名前（13）
K = len(NAMES_R); Cc = np.array([RC['colors'][n_] for n_ in NAMES_R], np.float32) / 255.0
z = V[:, 2]; ax = np.abs(V[:, 0]); y = V[:, 1]
lab = np.empty(nv, int); me.attributes['lab'].data.foreach_get('value', lab)
lab[lab == NI['eyes']] = NI['fur']   # 目は顔の絵（face）の側にある。下地は毛
GEO = json.load(open(os.path.join(WORK, 'stage2-geo.json')))
ARM = {s: dict(sh=np.array(GEO['arms'][s]['sh']), a=np.array(GEO['arms'][s]['a']), cuff=GEO['arms'][s]['cuff'], tl=GEO['arms'][s]['tl']) for s in 'LR'}
def armzone(P, side=None):
    """腕の範囲（段 2 と同じ: 胴の幅より外・高さ 0.25〜わき+0.15）"""
    m = np.zeros(len(P), bool)
    for s, sg in (('L', 1), ('R', -1)):
        if side and s != side: continue
        m |= (sg * P[:, 0] > L['arm_x0']) & (P[:, 2] > 0.25) & (P[:, 2] < L['armpit'] + 0.15)
    return m


GR = RC['fur_grad']
def interp(stops, t):
    zs = np.array([s_[0] for s_ in stops]); cs = np.array([s_[1] for s_ in stops], np.float32) / 255.0
    return np.stack([np.interp(t, zs, cs[:, c]) for c in range(3)], -1)
def fur_color(P):
    """毛の色（案 A）: 体は高さで 若草 → 水色 → うす紫、頭は 水色（顔）→ 紫〜桃（てっぺん）。背中側は紫へ寄せる"""
    X_, Y_, Z_ = P[:, 0], P[:, 1], P[:, 2]
    body = interp(GR['body'], Z_); head = interp(GR['head'], Z_)
    wh = sz(Z_ - GR['head_from'], GR['head_w'])[:, None]
    c = body * (1 - wh) + head * wh
    bk = (GR['back_amount'] * sz(Y_ - GR['back_y'], GR['back_w']) * sz(Z_ - GR['back_z'], 0.06))[:, None]
    c = c * (1 - bk) + (np.array(GR['back'], np.float32) / 255.0)[None] * bk
    # 腕: 肩（うす紫）→ 手首（水色〜若草）を腕の軸に沿って（元の立ち絵の腕は水色〜若草）
    for s_, sg_ in (('L', 1), ('R', -1)):
        A_ = ARM[s_]; m_ = (sg_ * X_ > L['arm_x0'] - 0.02) & (Z_ > 0.25) & (Z_ < L['armpit'] + 0.15)
        if not m_.any(): continue
        t_ = np.clip(((P[m_] - A_['sh']) @ A_['a']) / max(A_['cuff'], 1e-3), 0, 1)
        wa = sz(sg_ * X_[m_] - L['arm_x0'], 0.03)[:, None]
        c[m_] = c[m_] * (1 - wa) + interp(GR['arm'], t_) * wa
    # 耳の外側: 付け根（水色）→ 先（うす紫）
    em_ = (Z_ > L['ear_z'][0] - 0.02) & (np.abs(X_) > L['ear_x'] - 0.02)
    if em_.any():
        we = sz(np.abs(X_[em_]) - L['ear_x'] - 0.01, 0.06)[:, None]   # 付け根の裏で頭の紫との境が縦の線に見えたので広く
        c[em_] = c[em_] * (1 - we) + interp(GR['ear'], np.abs(X_[em_])) * we
    return c


armz = armzone(V)
legz = (ax < 0.2) & (z < L['hoof_line'] + 0.012) & ~armz
fixed = armz | legz                                               # 位置で決めた所は、ならしで動かさない
SMALL = [NI['gold']]          # 小さくても消さない区分け（星・飾り）
LOG['labels_raw'] = {NAMES_R[k]: int((lab == k).sum()) for k in range(K)}
for _ in range(RC['vote_iter']):
    new = lab.copy()
    for i in np.nonzero(~fixed)[0]:
        c = np.bincount(lab[nbr[i] + [i]], minlength=K)
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
        if len(mem) < RC['min_island'] and lab[sidx] not in SMALL: small.append(mem)
    if not small: break
    for mem in small:
        ms = set(mem); c = np.zeros(K, int)
        for a_ in mem:
            for b_ in nbr[a_]:
                if b_ not in ms: c[lab[b_]] += 1
        if c.sum(): lab[mem] = c.argmax()
LOG['labels'] = {NAMES_R[k]: int((lab == k).sum()) for k in range(K)}
Pv = np.eye(K, dtype=np.float32)[lab]
for _ in range(RC['smooth_iter']):
    Pn = np.zeros_like(Pv)
    for i in range(nv): Pn[i] = Pv[nbr[i]].mean(0) if nbr[i] else Pv[i]
    Pv = 0.5 * Pv + 0.5 * Pn

# ---------------------------------------------------------------- 形から計算した陰（AO、点ごと → なめらか）
bvh = BVHTree.FromPolygons([Vector(p_) for p_ in V.tolist()], TRI.tolist())
rng = np.random.default_rng(7); NR = RC['ao_rays']; MD = RC['ao_dist']
u1 = rng.random(NR); u2 = rng.random(NR); rr = np.sqrt(u1); th = 2 * np.pi * u2
Dl = np.stack([rr * np.cos(th), rr * np.sin(th), np.sqrt(1 - u1)], 1)
ao = np.ones(nv)
for i in range(nv):
    n_ = NV[i]; t1 = np.cross(n_, [0, 0, 1] if abs(n_[2]) < 0.9 else [1, 0, 0]); t1 /= np.linalg.norm(t1); t2 = np.cross(n_, t1)
    o = Vector((V[i] + n_ * 0.0015).tolist()); occ = 0.0
    for d in (Dl @ np.stack([t1, t2, n_])).tolist():
        hit = bvh.ray_cast(o, Vector(d), MD)
        if hit[0] is not None: occ += 1 - hit[3] / MD
    ao[i] = 1 - occ / NR
for _ in range(RC['ao_smooth']):
    ao = 0.5 * ao + 0.5 * np.array([ao[nb].mean() if nb else ao[i] for i, nb in enumerate(nbr)])
LOG['ao'] = [round(float(np.percentile(ao, p_)), 3) for p_ in (1, 10, 50, 90)]
shade = lambda a: 1 - RC['ao_strength'] * (1 - a)


# ---------------------------------------------------------------- 絵の画素ごと: 面・重心座標
def raster(faces, U, W, H):
    fid = -np.ones((H, W), np.int64); bar = np.zeros((H, W, 3), np.float32)
    for f in faces:
        T = U[f]; x0, y0 = np.floor(T.min(0)).astype(int); x1, y1 = np.ceil(T.max(0)).astype(int) + 1
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, W), min(y1, H)
        if x1 <= x0 or y1 <= y0: continue
        X, Y = np.meshgrid(np.arange(x0, x1) + 0.5, np.arange(y0, y1) + 0.5)
        (ax_, ay), (bx, by), (cx_, cy_) = T
        den = (by - cy_) * (ax_ - cx_) + (cx_ - bx) * (ay - cy_)
        if abs(den) < 1e-12: continue
        w0 = ((by - cy_) * (X - cx_) + (cx_ - bx) * (Y - cy_)) / den; w1 = ((cy_ - ay) * (X - cx_) + (ax_ - cx_) * (Y - cy_)) / den; w2 = 1 - w0 - w1
        ins = (w0 >= -0.02) & (w1 >= -0.02) & (w2 >= -0.02)
        fid[y0:y1, x0:x1][ins] = f
        bar[y0:y1, x0:x1][ins] = np.clip(np.stack([w0, w1, w2], -1)[ins], 0, 1)
    return fid, bar


def dilate_fill(rgb, cov, maxit=400):
    rgb = rgb.copy(); cov = cov.copy()
    for _ in range(maxit):
        if cov.all(): break
        m_ = cov.astype(np.float32); acc = np.zeros_like(rgb); cnt = np.zeros_like(m_)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            acc += np.roll(np.roll(rgb * m_[:, :, None], dy, 0), dx, 1); cnt += np.roll(np.roll(m_, dy, 0), dx, 1)
        g_ = (~cov) & (cnt > 0); rgb[g_] = acc[g_] / cnt[g_][:, None]; cov |= g_
    if not cov.all(): rgb[~cov] = rgb[cov].mean(0)
    return rgb


def sz(u, w):  # なめらかな 0→1（幅 w、u=0 で 0.5）
    t_ = np.clip(u / w + 0.5, 0, 1); return t_ * t_ * (3 - 2 * t_)


LV = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', LV)
UVa = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', UVa); UVa = UVa.reshape(-1, 3, 2)
W, H = bimg.size
fid, bar = raster(np.nonzero(MAT == 0)[0], UVa * [W, H], W, H)
cov = fid >= 0; F = fid[cov]; Bc = bar[cov]; Bc /= np.maximum(Bc.sum(1, keepdims=True), 1e-6)
VI = TRI[F]
q = (Pv[VI] * Bc[:, :, None]).sum(1)                              # 区分けの割合（画素ごと）
xyz = (V[VI] * Bc[:, :, None]).sum(1); X_, Y_, Z_ = xyz[:, 0], xyz[:, 1], xyz[:, 2]
aot = (ao[VI] * Bc).sum(1)
SH = RC['sharp']; q = (q / np.maximum(q.max(1, keepdims=True), 1e-9)) ** SH; q /= q.sum(1, keepdims=True)   # 女の子: 最大で割ってから乗する（3 つの区分けが出会う所で 0 になり黒くなった）
# 位置で決める境目（画素ごと。幅 edge_w のなめらかな境目）
ew = RC['edge_w']
AX = np.abs(X_)
iF, iP, iHo, iCo = NI['fur'], NI['paw'], NI['hoof'], NI['collar']
# 足: ひづめは高さの線で（色によらない）
legp = (AX < 0.2) & (Z_ < L['hoof_line'] + 0.012) & (q[:, [iF, iHo]].sum(1) > 0.5) & ~armzone(xyz)
if legp.any():
    hf = sz(L['hoof_line'] - Z_[legp], ew)
    qq = np.zeros((legp.sum(), K), np.float32); qq[:, iHo] = hf; qq[:, iF] = 1 - hf; q[legp] = qq
# 首輪: 首の高さの帯（collar_band）。毛・首輪の所だけ
c0_, c1_ = RC['collar_band']
nkp = (Z_ > c0_ - 0.01) & (Z_ < c1_ + 0.01) & (AX < 0.2) & (q[:, [iF, iCo]].sum(1) > 0.5) & ~armzone(xyz)
cl_ = sz(Z_[nkp] - c0_, ew) * sz(c1_ - Z_[nkp], ew)
qq = np.zeros((nkp.sum(), K), np.float32); qq[:, iCo] = cl_; qq[:, iF] = 1 - cl_; q[nkp] = qq
LOG['collar_band'] = RC['collar_band']
# 腕: 毛と手は、腕の軸に沿った手首の位置で
for s, sg in (('L', 1), ('R', -1)):
    A_ = ARM[s]; m = armzone(xyz, s) & (q[:, [iF, iP]].sum(1) > 0.5)
    t = (xyz[m] - A_['sh']) @ A_['a']; hand = sz(t - A_['cuff'], ew)
    qq = np.zeros((m.sum(), K), np.float32); qq[:, iP] = hand; qq[:, iF] = 1 - hand; q[m] = qq
rgb = (q @ Cc + q[:, [iF]] * (fur_color(xyz) - Cc[iF][None])) * shade(aot)[:, None]   # 毛はグラデーション
img = np.zeros((H, W, 3), np.float32); img[cov] = rgb
img = dilate_fill(img, cov)
Pb = pixels(bimg); Pb[:, :, :3] = img; Pb[:, :, 3] = 1
bimg.pixels.foreach_set(Pb.ravel()); bimg.update(); bimg.pack()
bimg.filepath_raw = os.path.join(WORK, 'body-r3.png'); bimg.file_format = 'PNG'; bimg.save()   # 段 5 はこの絵を読み直す（.blend の中の詰めた絵が古いまま残ったため）

# ---------------------------------------------------------------- 顔の 4 こま
FC_ = CFG['face']; CW, CHh = FC_['cell']
FA = pixels(fimg)                                                # 下から上の並び（UV と同じ向き）
AW, AH = fimg.size
ffaces = np.nonzero(MAT == 1)[0]
fidF, barF = raster(ffaces, UVa * [AW, AH], CW, AH)               # こま 0 の範囲（u < 1/4）
covF = fidF >= 0; BF = barF[covF]; BF /= np.maximum(BF.sum(1, keepdims=True), 1e-6); VF = TRI[fidF[covF]]
qF = (Pv[VF] * BF[:, :, None]).sum(1); qF = (qF / np.maximum(qF.max(1, keepdims=True), 1e-9)) ** SH; qF /= qF.sum(1, keepdims=True)
xyzF = (V[VF] * BF[:, :, None]).sum(1)
base = np.zeros((AH, CW, 3), np.float32); base[covF] = (qF @ Cc + qF[:, [iF]] * (fur_color(xyzF) - Cc[iF][None])) * shade((ao[VF] * BF).sum(1))[:, None]
base = dilate_fill(base, covF)
O0 = FA[:, :CW, :3].copy()
# 元の肌の色（目・口などをのぞいて、なめらかに）
med = np.median(O0[covF], 0)
feat0 = (np.abs(O0 - med).max(2) > RC['face_t0']) | ~covF
Sl = O0.copy(); good = ~feat0
for _ in range(300):
    if good.all(): break
    m_ = good.astype(np.float32); acc = np.zeros_like(Sl); cnt = np.zeros_like(m_)
    for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
        acc += np.roll(np.roll(Sl * m_[:, :, None], dy, 0), dx, 1); cnt += np.roll(np.roll(m_, dy, 0), dx, 1)
    g_ = (~good) & (cnt > 0); Sl[g_] = acc[g_] / cnt[g_][:, None]; good |= g_
for _ in range(RC['face_blur']):
    Sl = (Sl + np.roll(Sl, 1, 0) + np.roll(Sl, -1, 0) + np.roll(Sl, 1, 1) + np.roll(Sl, -1, 1)) / 5
# 顔の面のふちから内側だけに絵を残す（ふちは体の肌と同じ色にする）
inner = covF.astype(np.float32)
for _ in range(RC['face_inset']):
    inner = np.minimum(inner, np.minimum(np.minimum(np.roll(inner, 1, 0), np.roll(inner, -1, 0)), np.minimum(np.roll(inner, 1, 1), np.roll(inner, -1, 1))))
for _ in range(6):
    inner = (inner + np.roll(inner, 1, 0) + np.roll(inner, -1, 0) + np.roll(inner, 1, 1) + np.roll(inner, -1, 1)) / 5
t0, t1 = RC['face_t0'], RC['face_t1']
S4 = json.load(open(os.path.join(WORK, 'stage4-log.json')))
EBt = S4['face']['eyes_new']; mc = S4['mouth_centers']['new']
rows_b = np.arange(AH)[::-1][:, None] * np.ones((1, CW)); cols_b = np.ones((AH, 1)) * np.arange(CW)[None]   # 上から数えた行・列（FA は下から）
def box(r0, c0, r1, c1): return ((rows_b >= r0) & (rows_b <= r1) & (cols_b >= c0) & (cols_b <= c1)).astype(np.float32)
pe = RC['eye_pad']
ph = RC['eye_padx']
eyem = np.maximum(box(EBt[0][0] - pe, EBt[0][1] - ph, EBt[0][2] + pe, EBt[0][3] + ph), box(EBt[1][0] - pe, EBt[1][1] - ph, EBt[1][2] + pe, EBt[1][3] + ph))
brow = np.maximum(box(EBt[0][0] - 80, EBt[0][1] - 10, EBt[0][0] - 25, EBt[0][3] + 10), box(EBt[1][0] - 80, EBt[1][1] - 10, EBt[1][0] - 25, EBt[1][3] + 10))
mb_ = S4['mouth_box']; mouth = box(mb_[0] - 12, mb_[1] - 12, mb_[2] + 12, mb_[3] + 12)   # キリン: 口と鼻の点を囲む枠（段 4 で測った）
def soften(m, n=3):
    for _ in range(n): m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
    return m
# ほほの赤み（こま 0 で見つける。どのこまも同じ）
pink = ((O0[:, :, 0] - O0[:, :, 1]) - (Sl[:, :, 0] - Sl[:, :, 1])) * covF
cheek = (rows_b > max(EBt[0][2], EBt[1][2])) & (rows_b < mc[0] - 5)
blush = np.zeros((AH, CW), np.float32); LOG['blush'] = []
for (r0, c0, r1, c1) in EBt:
    cm = cheek & (cols_b > c0 - 40) & (cols_b < c1 + 40) & (pink > RC['blush_t'])
    if cm.sum() < 50: continue
    w_ = pink[cm]; ry, rx = rows_b[cm], cols_b[cm]
    my, mx = np.average(ry, weights=w_), np.average(rx, weights=w_)
    sy, sx = np.sqrt(np.average((ry - my) ** 2, weights=w_)), np.sqrt(np.average((rx - mx) ** 2, weights=w_))
    LOG['blush'].append([round(float(v), 1) for v in (my, mx, sy, sx)])
sgm = np.mean([b_[2:] for b_ in LOG['blush']], 0) if LOG['blush'] else None
if sgm is not None: sgm[0] = max(sgm[0], RC['blush_ry'] * sgm[1])   # キリン: 生成の頬は細い横線（縦 6・横 40 画素）だったので、縦を横の blush_ry 倍以上に（元の立ち絵は丸い頬）
for (my, mx, _, _) in LOG['blush']:   # 左右で同じ大きさの、やわらかいだ円
    rr2 = ((rows_b - my) / (RC['blush_r'] * sgm[0])) ** 2 + ((cols_b - mx) / (RC['blush_r'] * sgm[1])) ** 2
    blush = np.maximum(blush, np.clip(1 - rr2, 0, 1) ** 1.5)
bcol = np.array(RC['blush_color'], np.float32) / 255.0   # ほほの赤み（元の立ち絵のほほの色）
from collections import deque
def blobs_mask(Oi, region, lum_t, min_px, grow):
    """枠の中の、暗いかたまり（min_px 以上）を、穴をうめて grow 画素広げた形"""
    lum = Oi @ np.array([0.3, 0.55, 0.15], np.float32); dk = (lum < lum_t) & (region > 0.5)
    lab_ = np.zeros(dk.shape, int); keep = np.zeros(dk.shape, bool); nid = 0
    for sy_, sx_ in zip(*np.nonzero(dk)):
        if lab_[sy_, sx_]: continue
        nid += 1; qd = deque([(sy_, sx_)]); lab_[sy_, sx_] = nid; pts = []
        while qd:
            a_, b_ = qd.popleft(); pts.append((a_, b_))
            for da, db_ in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                c_, d_ = a_ + da, b_ + db_
                if 0 <= c_ < dk.shape[0] and 0 <= d_ < dk.shape[1] and dk[c_, d_] and not lab_[c_, d_]: lab_[c_, d_] = nid; qd.append((c_, d_))
        if len(pts) >= min_px:
            pa = np.array(pts); keep[pa[:, 0], pa[:, 1]] = True
    for _ in range(grow):
        keep = keep | np.roll(keep, 1, 0) | np.roll(keep, -1, 0) | np.roll(keep, 1, 1) | np.roll(keep, -1, 1)
    # 穴をうめる（外からつながらない所）
    out = ~keep; reach = np.zeros_like(keep); reach[0, :] = out[0, :]; reach[-1, :] = out[-1, :]; reach[:, 0] = out[:, 0]; reach[:, -1] = out[:, -1]
    for _ in range(400):
        nr = reach | ((np.roll(reach, 1, 0) | np.roll(reach, -1, 0) | np.roll(reach, 1, 1) | np.roll(reach, -1, 1)) & out)
        if (nr == reach).all(): break
        reach = nr
    return soften((~reach).astype(np.float32), 2)
for i in range(4):
    Oi = FA[:, i * CW:(i + 1) * CW, :3]; d = Oi - Sl; mag = np.abs(d).max(2)
    al = np.clip((mag - t0) / (t1 - t0), 0, 1); al = al * al * (3 - 2 * al)
    a2 = np.maximum(np.maximum(blobs_mask(Oi, eyem, RC['eye_lum'], RC['min_dark'], 4), blobs_mask(Oi, mouth, RC['mouth_lum'], 40, 3)),
                    (blobs_mask(Oi, brow, RC['dark_lum'], RC['min_dark'], 2) if RC.get('brows', True) else 0 * eyem)) * inner
    out = base * (1 - blush[:, :, None] * RC['blush_a']) + bcol[None, None] * (blush[:, :, None] * RC['blush_a'])
    d = np.stack([soften(d[:, :, c], RC['feat_soft']) for c in range(3)], -1)   # 目のふちの画素の段・まつげの点線をならす
    FA[:, i * CW:(i + 1) * CW, :3] = np.clip(out * (1 - a2[:, :, None]) + (base + d) * a2[:, :, None], 0, 1)
    if os.environ.get('FACEDBG'):
        for nm_, arr in (('O', Oi), ('a2', np.repeat(a2[:, :, None], 3, 2)), ('Sl', Sl), ('d', np.clip(d + 0.5, 0, 1))):
            im_ = bpy.data.images.new(f'dbg{i}{nm_}', CW, AH); px_ = np.ones((AH, CW, 4), np.float32); px_[:, :, :3] = arr; im_.pixels.foreach_set(px_.ravel())
            im_.filepath_raw = os.path.join(os.environ['FACEDBG'], f'{i}-{nm_}.png'); im_.file_format = 'PNG'; im_.save()   # 目・まゆ・口は、新しい肌に元の差を足す
FA[:, :, 3] = 1
fimg.pixels.foreach_set(FA.ravel()); fimg.update(); fimg.pack()
fimg.filepath_raw = os.path.join(CH, 'face4.png'); fimg.file_format = 'PNG'; fimg.save()
# こまの間の差（目・口の枠の外で 0 か）は段 4 と同じ数え方で確かめる
FAt = FA[::-1, :, :3]; EB = json.load(open(os.path.join(WORK, 'stage4-log.json')))['face']['eyes_new']
for i in (1, 2):
    mm = np.ones((CHh, CW), bool); pad = FC_['erase_pad'] + 16
    for (r0, c0, r1, c1) in EB: mm[max(r0 - pad, 0):r1 + pad + 1, max(c0 - pad, 0):c1 + pad + 1] = False
    LOG[f'face_cell{i}_changed_outside'] = int((np.abs(FAt[:, i * CW:(i + 1) * CW] - FAt[:, :CW]).max(2)[mm] > 1e-6).sum())
save('stage4r.blend')
bpy.ops.export_scene.gltf(filepath=os.path.join(WORK, 'stage4r.glb'), export_format='GLB', export_apply=False, export_animations=False, export_skins=False)
json.dump(LOG, open(os.path.join(WORK, 'stage45-log.json'), 'w'), indent=1, ensure_ascii=False)
print('STAGE45', json.dumps(LOG, ensure_ascii=False))

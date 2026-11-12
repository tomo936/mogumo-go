# 関門 1 の測り方（詳細設計書 D4）。形（GLB）を測って、合否の数字と JSON を出す。
# 実行: blender -b -P gate1-probe.py -- <glb> <出力 json> [参考の絵の接頭辞 = art/prototypes/avatar/input/sheet]
# 形は読むだけ。向きと大きさはこの中だけで D1 にそろえる（足の裏 0・身長 1・前 −Y）。
import bpy, bmesh, sys, os, math, json
import numpy as np
from collections import defaultdict, deque

argv = sys.argv[sys.argv.index('--') + 1:]
SRC, OUT = argv[0], argv[1]
REF = argv[2] if len(argv) > 2 else os.path.join(os.path.dirname(__file__), '../../../prototypes/avatar/input/sheet')
STEP = 0.01
# しきい値（案。男の子で実測して D14 を直す）
T = dict(gap_min=0.008, armpit_tol=0.03, inner_top=0.90, inner_skin=0.90, neck_ratio=0.35,
         sil_miss=0.05, sym_iou=0.90, frag=0.005, head_tol=0.05)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Icosphere')]
ob = max(meshes, key=lambda o: len(o.data.polygons))
# 骨がある形は、立ち姿（骨の休みの姿勢）の形をそのまま使う
bm = bmesh.new()
bm.from_mesh(ob.data)
bm.transform(ob.matrix_world)
bmesh.ops.triangulate(bm, faces=bm.faces[:])
# つながり（色の継ぎ目で分かれた点を、位置でまとめる）
bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
bmesh.ops.dissolve_degenerate(bm, dist=1e-7, edges=bm.edges[:])
bmesh.ops.triangulate(bm, faces=bm.faces[:])
uvl = bm.loops.layers.uv.active
# 絵
img = None
for m in ob.data.materials:
    if m and m.use_nodes:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE' and n.image and (img is None or n.image.size[0] * n.image.size[1] > img.size[0] * img.size[1]):
                img = n.image
PIX = None
if img:
    W, H = img.size
    a = np.empty(W * H * 4, np.float32)
    img.pixels.foreach_get(a)
    PIX = a.reshape(H, W, 4)[:, :, :3]

# 面ごとの色（面の中の 4 点を絵から取る）。顔の材質は顔の絵から。
fmat = np.array([f.material_index for f in bm.faces])


def face_color(f):
    if PIX is None or uvl is None:
        return (0.5, 0.5, 0.5)
    uvs = [l[uvl].uv for l in f.loops]
    pts = [((uvs[0] + uvs[1] + uvs[2]) / 3)] + [(uvs[i] * 2 + uvs[(i + 1) % 3] + uvs[(i + 2) % 3]) / 4 for i in range(3)]
    c = np.zeros(3)
    for p in pts:
        x = int((p.x % 1.0) * (W - 1)); y = int((p.y % 1.0) * (H - 1))
        c += PIX[y, x]
    return tuple(c / len(pts))


# ---- 向きと大きさ ----
V = np.array([v.co[:] for v in bm.verts])
zmin, zmax = V[:, 2].min(), V[:, 2].max()
s = 1.0 / (zmax - zmin)
cx = (V[:, 0].max() + V[:, 0].min()) / 2
cy = (V[:, 1].max() + V[:, 1].min()) / 2
for v in bm.verts:
    v.co.x = (v.co.x - cx) * s; v.co.y = (v.co.y - cy) * s; v.co.z = (v.co.z - zmin) * s
bm.normal_update()
F = list(bm.faces)
fc = np.array([f.calc_center_median()[:] for f in F])
fn = np.array([f.normal[:] for f in F])
fa = np.array([f.calc_area() for f in F])
col = np.array([face_color(f) for f in F])
# HSV
mx, mn = col.max(1), col.min(1)
hsv_v = mx; hsv_s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
d = np.maximum(mx - mn, 1e-6)
r, g, b = col[:, 0], col[:, 1], col[:, 2]
hue = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
is_skin = (hsv_s > 0.12) & (hsv_s < 0.75) & (hsv_v > 0.55) & (hue > 0.015) & (hue < 0.11)
is_top = (hue > 0.5) & (hue < 0.72) & (hsv_s > 0.2)
# 前の向き: 頭の高さの肌（顔）の面が −Y 側にあること。逆なら 180° 回す
head = fc[:, 2] > 0.62
yf = (fc[head & is_skin, 1] * fa[head & is_skin]).sum() / max(fa[head & is_skin].sum(), 1e-9) if (head & is_skin).any() else -1
flipped = bool(yf > 0)
if flipped:
    for v in bm.verts:
        v.co.x, v.co.y = -v.co.x, -v.co.y
    bm.normal_update()
    fc[:, :2] *= -1; fn[:, :2] *= -1
bm.verts.ensure_lookup_table(); bm.edges.ensure_lookup_table(); bm.faces.ensure_lookup_table()
bm.verts.index_update(); bm.edges.index_update()
VZ = np.array([v.co.z for v in bm.verts]); VX = np.array([v.co.x for v in bm.verts]); VY = np.array([v.co.y for v in bm.verts])
EV = np.array([(e.verts[0].index, e.verts[1].index) for e in bm.edges])
FE = np.array([[e.index for e in f.edges] for f in F])
nonmanifold = sum(1 for e in bm.edges if len(e.link_faces) != 2)

# ---- 島（ちぎれた小片）----
par = list(range(len(bm.verts)))


def find(a):
    while par[a] != a:
        par[a] = par[par[a]]; a = par[a]
    return a


for a_, b_ in EV:
    ra, rb = find(a_), find(b_)
    if ra != rb: par[ra] = rb
froot = np.array([find(f.verts[0].index) for f in F])
isl = defaultdict(float)
for i, rt in enumerate(froot): isl[rt] += fa[i]
tot = sum(isl.values())
islands = sorted(isl.values(), reverse=True)
frags = [a_ / tot for a_ in islands if a_ / tot < T['frag']]


# ---- 輪切り ----
# 面の中で輪切りをまたぐ 2 辺をつなぐ（速さのため、面ごとの z の範囲で先に絞る）
FZmin = VZ[np.array([[v.index for v in f.verts] for f in F])].min(1)
FZmax = VZ[np.array([[v.index for v in f.verts] for f in F])].max(1)


def loops_at(z):
    z0, z1 = VZ[EV[:, 0]], VZ[EV[:, 1]]
    cross = (z0 - z) * (z1 - z) < 0
    fidx = np.nonzero((FZmin < z) & (FZmax > z))[0]
    adj = defaultdict(list)
    for fi in fidx:
        es = [e for e in FE[fi] if cross[e]]
        if len(es) == 2:
            adj[es[0]].append(es[1]); adj[es[1]].append(es[0])
    seen, out = set(), []
    for e0 in adj:
        if e0 in seen: continue
        comp, q = [], deque([e0]); seen.add(e0)
        while q:
            e = q.popleft(); comp.append(e)
            for n2 in adj[e]:
                if n2 not in seen: seen.add(n2); q.append(n2)
        ce = np.array(comp)
        t = (z - z0[ce]) / (z1[ce] - z0[ce])
        px = VX[EV[ce, 0]] + t * (VX[EV[ce, 1]] - VX[EV[ce, 0]])
        py = VY[EV[ce, 0]] + t * (VY[EV[ce, 1]] - VY[EV[ce, 0]])
        # 面積: 辺をたどった順に並べて靴ひもの式
        order, prev, cur = [comp[0]], None, comp[0]
        idx = {e: i for i, e in enumerate(comp)}
        while True:
            nx = [n2 for n2 in adj[cur] if n2 != prev]
            if not nx or nx[0] == comp[0] or len(order) > len(comp): break
            prev, cur = cur, nx[0]; order.append(cur)
        oi = [idx[e] for e in order]
        ox, oy = px[oi], py[oi]
        if len(oi) != len(comp):  # 面が 3 枚以上集まる辺でたどれないとき: 重心のまわりの角度で並べる（ほぼ凸の輪の近似）
            ang = np.arctan2(py - py.mean(), px - px.mean()); oi = np.argsort(ang); ox, oy = px[oi], py[oi]
        area = abs(np.dot(ox, np.roll(oy, -1)) - np.dot(oy, np.roll(ox, -1))) / 2
        out.append(dict(x0=px.min(), x1=px.max(), y0=py.min(), y1=py.max(), cx=px.mean(), cy=py.mean(), area=area, pts=np.stack([px, py], 1)))
    return out


ZS = np.round(np.arange(STEP / 2, 1.0, STEP), 4)
SL = {float(z): loops_at(z) for z in ZS}


def big(loops, amin=2e-4):
    return [l for l in loops if not (l['area'] < amin)]


# 股: 下から、左右の足が 1 つにつながる高さ
crotch = None
for z in ZS:
    L = big(SL[float(z)])
    if z > 0.08 and len(L) >= 1 and any(l['x0'] < 0 < l['x1'] for l in L):
        crotch = float(z); break
legs_sep = all(len([l for l in big(SL[float(z)]) if l['x1'] < 0 or l['x0'] > 0]) >= 2 for z in ZS if 0.02 < z < (crotch or 0) - 0.01)


def torso(loops):
    c = [l for l in loops if l['x0'] < 0 < l['x1']]
    return max(c, key=lambda l: (l['x1'] - l['x0'])) if c else None


# 腕: 手の一番下から上へ、胴と別の輪がある間 = 腕が離れている。最初に無くなる高さ = わき（3D）
def arm_side(sign):
    rows = []
    for z in ZS:
        if crotch is None or z <= crotch: continue
        L = big(SL[float(z)], 5e-5); t = torso(L)
        if t is None: continue
        side = [l for l in L if l is not t and sign * l['cx'] > 0.04 and (sign * l['x0'] > sign * 0 if sign > 0 else l['x1'] < 0)]
        gap = None
        if side:
            tp = t['pts']; gaps = []
            for l in side:
                dd = np.sqrt(((l['pts'][:, None, :] - tp[None, :, :]) ** 2).sum(2)).min()
                gaps.append(dd)
            gap = float(min(gaps))
        rows.append(dict(z=float(z), n=len(side), gap=gap, tx=float(t['x1'] if sign > 0 else -t['x0'])))
    zs_with = [r_['z'] for r_ in rows if r_['n'] > 0]
    if not zs_with:
        return dict(found=False, rows=rows)
    hand = min(zs_with)
    armpit = None
    for r_ in rows:
        if r_['z'] >= hand and r_['n'] == 0:
            armpit = r_['z']; break
    below = [r_ for r_ in rows if hand <= r_['z'] < (armpit or 2)]
    gmin = min((r_['gap'] for r_ in below if r_['gap'] is not None), default=None)
    holes = [r_['z'] for r_ in below if r_['n'] == 0]
    # 腕の帯の中で、胴の外側の x（面を腕と胴に分けるため）
    return dict(found=True, hand=hand, armpit=armpit, gap_min=gmin, rows=rows, holes=holes)


ARM = {'L': arm_side(1), 'R': arm_side(-1)}

# 首: 胴の上（わき）から頭のてっぺんまでで、輪切りの面積が一番小さい高さ
prof = []
for z in ZS:
    L = big(SL[float(z)])
    prof.append((float(z), sum(l['area'] for l in L if not math.isnan(l['area'])), len(L)))
ap = max([a_['armpit'] for a_ in ARM.values() if a_.get('armpit')] or [0.5])
headmax, zhead = max((a_, z) for z, a_, n in prof if z > ap + 0.1)
cand = [(a_, z, n) for z, a_, n in prof if ap + 0.02 < z < zhead]
neck_area, neck, neck_n = min(cand)
torso_top = max(a_ for z, a_, n in prof if ap - 0.08 < z < ap)
neck_prof = [(z, round(a_, 5), n) for z, a_, n in prof if neck - 0.06 <= z <= neck + 0.06]


# ---- 内側の色（腕の面のうち、胴の方を向いた面）----
def arm_faces(sign, A):
    if not A.get('found') or A.get('armpit') is None: return np.zeros(len(F), bool)
    tx = {r_['z']: r_['tx'] for r_ in A['rows']}
    zz = np.round(np.clip(np.floor(fc[:, 2] / STEP) * STEP + STEP / 2, STEP / 2, 1 - STEP / 2), 4)
    txf = np.array([tx.get(float(z), 9) for z in zz])
    return (fc[:, 2] >= A['hand'] - 0.02) & (fc[:, 2] < A['armpit']) & (sign * fc[:, 0] > txf + 0.002)


INNER = {}
for k, sign in (('L', 1), ('R', -1)):
    m = arm_faces(sign, ARM[k])
    if not m.any():
        INNER[k] = None; continue
    inner = m & (sign * fn[:, 0] < -0.5)
    # 腕の軸: わき → 手の先
    P = fc[m]; c0 = P.mean(0); u, sv, vt = np.linalg.svd(P - c0); ax = vt[0]
    if np.dot(ax, [sign, 0, -0.3]) < 0: ax = -ax
    t = (fc - c0) @ ax
    tmin, tmax = t[m].min(), t[m].max(); tn = (t - tmin) / (tmax - tmin)
    # 手: 腕の先の方で、肌の面積が半分を超える所から先
    hand_t = 1.0
    for b0 in np.arange(0, 1, 0.05):
        sel = m & (tn >= b0) & (tn < b0 + 0.05)
        if fa[sel].sum() > 0 and fa[sel & is_skin].sum() / fa[sel].sum() > 0.5:
            hand_t = float(b0); break
    sl = inner & (tn < hand_t - 0.1); hd = inner & (tn >= hand_t + 0.1)  # 袖口と手の境目の帯（腕の長さの ±10%）は数えない
    if os.environ.get('DUMP'):
        for i in np.nonzero(hd & ~is_skin)[0]:
            print('HAND', k, round(float(tn[i]), 2), 'hsv', round(float(hue[i]), 3), round(float(hsv_s[i]), 2), round(float(hsv_v[i]), 2), 'n', np.round(fn[i], 2))
    INNER[k] = dict(sleeve_top=float(fa[sl & is_top].sum() / max(fa[sl].sum(), 1e-9)), sleeve_skin=float(fa[sl & is_skin].sum() / max(fa[sl].sum(), 1e-9)),
                    hand_skin=float(fa[hd & is_skin].sum() / max(fa[hd].sum(), 1e-9)), hand_t=hand_t, n_sleeve=int(sl.sum()), n_hand=int(hd.sum()))


# ---- 影（輪かく）: 形の影と、参考の絵の影 ----
TRI = np.array([[v.co[:] for v in f.verts] for f in F])
RES = 400


def sil(view):
    # view: front（−Y から見る）・side（キャラの右 = −X から見る）・back・top
    if view == 'front': P = TRI[:, :, [0, 2]] * [1, 1]
    elif view == 'back': P = TRI[:, :, [0, 2]] * [-1, 1]
    elif view == 'side': P = np.stack([-TRI[:, :, 1], TRI[:, :, 2]], 2)   # 前（−Y）が画面の右
    elif view == 'side_l': P = np.stack([TRI[:, :, 1], TRI[:, :, 2]], 2)
    else: P = TRI[:, :, [0, 1]]
    w = np.array([[i, j, 6 - i - j] for i in range(7) for j in range(7 - i)]) / 6.0
    pts = np.einsum('kj,tjd->tkd', w, P).reshape(-1, 2)
    return pts


def raster(pts, res=RES):
    x0, y0 = pts.min(0); x1, y1 = pts.max(0)
    sc = (res - 1) / (y1 - y0)
    wpx = int((x1 - x0) * sc) + 1
    M = np.zeros((res, wpx), bool)
    M[(res - 1 - ((pts[:, 1] - y0) * sc)).astype(int), ((pts[:, 0] - x0) * sc).astype(int)] = True
    for _ in range(2):  # すき間を埋める（ふくらませて、しぼめる）
        M = M | np.roll(M, 1, 0) | np.roll(M, -1, 0) | np.roll(M, 1, 1) | np.roll(M, -1, 1)
    for _ in range(2):
        M = M & np.roll(M, 1, 0) & np.roll(M, -1, 0) & np.roll(M, 1, 1) & np.roll(M, -1, 1)
    return M


def load_mask(path, res=RES):
    im = bpy.data.images.load(path)
    w_, h_ = im.size; a_ = np.empty(w_ * h_ * 4, np.float32); im.pixels.foreach_get(a_)
    A = a_.reshape(h_, w_, 4)[::-1, :, 3] > 0.5
    ys, xs = np.nonzero(A); A = A[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    sc = (res - 1) / (A.shape[0] - 1); wpx = int((A.shape[1] - 1) * sc) + 1
    yi = (np.arange(res) / sc).round().astype(int).clip(0, A.shape[0] - 1)
    xi = (np.arange(wpx) / sc).round().astype(int).clip(0, A.shape[1] - 1)
    return A[yi][:, xi]


def save_overlay(A, B, name):
    w_ = max(A.shape[1], B.shape[1]) + 40
    def place(M):
        out = np.zeros((RES, w_), bool); cxm = int(np.nonzero(M)[1].mean()); off = w_ // 2 - cxm
        out[:, max(off, 0):max(off, 0) + M.shape[1]] = M[:, :w_ - max(off, 0)]; return out
    a_, b_ = place(A), place(B)
    im = np.ones((RES, w_, 4), np.float32)
    im[a_ & b_, :3] = 0.7; im[a_ & ~b_, :3] = (0.9, 0.1, 0.1); im[~a_ & b_, :3] = (0.1, 0.3, 0.95)
    I = bpy.data.images.new(name, w_, RES); I.pixels.foreach_set(im[::-1].ravel())
    I.filepath_raw = os.path.join(os.path.dirname(OUT), name + '.png'); I.file_format = 'PNG'; I.save()


def compare(A, B):
    # 足の裏をそろえ、左右のまん中（影の重心）をそろえて重ねる
    w_ = max(A.shape[1], B.shape[1]) + 40
    def place(M):
        out = np.zeros((RES, w_), bool); cxm = int(np.nonzero(M)[1].mean()); off = w_ // 2 - cxm
        out[:, max(off, 0):max(off, 0) + M.shape[1]] = M[:, :w_ - max(off, 0)]; return out
    a_, b_ = place(A), place(B)
    # ずれ: 相手の影から 4 画素（身長の 1%）より外に出た所だけ数える（ふちの 1〜2 画素の差は数えない）
    def dil(M, k=4):
        for _ in range(k): M = M | np.roll(M, 1, 0) | np.roll(M, -1, 0) | np.roll(M, 1, 1) | np.roll(M, -1, 1)
        return M
    miss = (a_ & ~dil(b_)) | (b_ & ~dil(a_))
    return float(miss.sum() / (a_ | b_).sum()), float((a_ & b_).sum() / (a_ | b_).sum())


def armpit_2d(M):
    # 正面の影で、手の高さから上へ、腕と胴の間の背景が終わる行（下からの割合）
    h_, w_ = M.shape; c = w_ // 2; res = {}
    for side, cols in (('L', range(c, w_)), ('R', range(c, -1, -1))):
        cols = list(cols)
        ext = [r for r in range(h_) if M[r, cols[-20:] if side == 'L' else cols[-20:]].any()]
        hand_row = max(ext) if ext else None
        top = None
        for r in range(hand_row or 0, -1, -1):
            row = M[r, cols]
            runs = np.diff(np.concatenate([[0], row.astype(int), [0]]))
            starts = np.nonzero(runs == 1)[0]
            if len(starts) < 2: top = r; break
        res[side] = None if top is None else round(1 - top / (h_ - 1), 4)
    return res


SIL = {}
if os.path.exists(REF + '-front-rgba.png'):
    mf = raster(sil('front')); rf = load_mask(REF + '-front-rgba.png')
    ms = raster(sil('side')); msl = raster(sil('side_l')); rs = load_mask(REF + '-side-rgba.png')
    mb = raster(sil('back')); rb = load_mask(REF + '-back-rgba.png')
    SIL = dict(front=compare(mf, rf), side_right=compare(ms, rs), side_if_left=compare(msl, rs), back=compare(mb, rb),
               armpit_ref=armpit_2d(rf), armpit_mesh2d=armpit_2d(mf))
    base = os.path.splitext(os.path.basename(OUT))[0]
    for nm, A_, B_ in (('front', mf, rf), ('side', ms, rs), ('back', mb, rb)): save_overlay(A_, B_, f'{base}-sil-{nm}')
    # 頭の高さ（首の高さから上）: 参考の絵は正面の影の幅が首で一番細い所
    def neck_2d(M):
        h_ = M.shape[0]; wid = M.sum(1)
        rows = [r for r in range(int(h_ * 0.25), int(h_ * 0.55))]
        r = min(rows, key=lambda r: wid[r]); return round(1 - r / (h_ - 1), 4)
    SIL['neck_ref'] = neck_2d(rf); SIL['neck_mesh2d'] = neck_2d(mf)
# 左右の対称（正面と真上の影を左右に返して重ねる）
mfr = raster(sil('front')); mt = raster(sil('top'))
sym_front = float((mfr & mfr[:, ::-1]).sum() / (mfr | mfr[:, ::-1]).sum())

# ---- 判定 ----
res = dict(src=os.path.basename(SRC), flipped_to_front=flipped, tris=len(F), nonmanifold_edges=nonmanifold,
           islands=len(islands), fragments=len(frags), crotch=crotch, legs_separate=legs_sep,
           arm={k: {kk: vv for kk, vv in a_.items() if kk != 'rows'} for k, a_ in ARM.items()},
           neck=dict(z=neck, area=neck_area, loops=neck_n, head_max=headmax, torso_top=torso_top, ratio=neck_area / headmax, prof=neck_prof),
           inner=INNER, sil=SIL, sym_front_iou=sym_front)
chk = {}
for k in 'LR':
    A = ARM[k]
    chk[f'arm{k}_separate'] = bool(A.get('found') and A.get('armpit') and not A.get('holes'))
    chk[f'arm{k}_connected_at_shoulder'] = bool(A.get('armpit') is not None)
    chk[f'arm{k}_gap'] = bool(A.get('gap_min') is not None and A['gap_min'] >= T['gap_min'])
    if SIL.get('armpit_ref') and A.get('armpit'):
        chk[f'arm{k}_armpit_vs_ref'] = bool(SIL['armpit_ref'][k] is not None and abs(A['armpit'] - SIL['armpit_ref'][k]) <= T['armpit_tol'])
    I = INNER[k]
    chk[f'arm{k}_inner_sleeve_top'] = bool(I and I['sleeve_top'] >= T['inner_top'])
    chk[f'arm{k}_inner_hand_skin'] = bool(I and I['hand_skin'] >= T['inner_skin'])
chk['legs_separate'] = bool(legs_sep and crotch)
chk['neck_narrow'] = bool(res['neck']['ratio'] <= T['neck_ratio'])
chk['no_fragments'] = len(frags) == 0
if SIL:
    chk['sil_front'] = SIL['front'][0] <= T['sil_miss']
    chk['sil_side'] = SIL['side_right'][0] <= T['sil_miss']
    chk['sil_back'] = SIL['back'][0] <= T['sil_miss']
    chk['head_height'] = abs((1 - neck) - (1 - SIL['neck_ref'])) <= T['head_tol']
chk['symmetry'] = sym_front >= T['sym_iou']
res['checks'] = chk
res['pass'] = all(chk.values())
res['thresholds'] = T


def clean(o):
    if isinstance(o, dict): return {k: clean(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)): return [clean(v) for v in o]
    if isinstance(o, (np.floating, float)): return None if math.isnan(o) else round(float(o), 4)
    if isinstance(o, (np.integer,)): return int(o)
    if isinstance(o, np.bool_): return bool(o)
    return o


json.dump(clean(res), open(OUT, 'w'), ensure_ascii=False, indent=1)
print('GATE1', 'PASS' if res['pass'] else 'FAIL', json.dumps(clean(chk)))

if os.environ.get('DUMP'):
    with open(OUT + '.slices.txt', 'w') as fo:
        for z in ZS:
            L = SL[float(z)]
            fo.write(f'{z:.3f} ' + ' | '.join(f"cx{l['cx']:+.3f} x[{l['x0']:+.3f},{l['x1']:+.3f}] a{l['area']:.5f}" for l in sorted(L, key=lambda l: l['cx'])) + '\n')

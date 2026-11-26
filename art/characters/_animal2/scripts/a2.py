# 「動物の二本足」型（ねこ・しば・くま・うさぎ・キリン）の共通の道具。段ごとの台本（stage2.py・stage3.py・pose3.py・gate.py）が読む。
# キリンの build.py（01-hoshifuru-kirin/scripts/）を写して、キャラ固有の数字を config.json に出したもの。
# 使い方: blender -b -P <段>.py -- <config.json>
import bpy, bmesh, sys, os, json
import numpy as np
from collections import defaultdict, deque

CFG_PATH = os.path.abspath(sys.argv[sys.argv.index('--') + 1])
CFG = json.load(open(CFG_PATH))
CH = os.path.dirname(CFG_PATH)                       # キャラのフォルダ
ROOT = os.path.abspath(os.path.join(CH, '..', '..', '..'))
WORK = os.path.join(CH, 'work'); os.makedirs(WORK, exist_ok=True)
GATE = os.path.join(CH, 'gate'); os.makedirs(GATE, exist_ok=True)
NAMES = CFG['segments']['names']                      # 区分けの名前（点ごとの lab の番号の順）
NI = {n: i for i, n in enumerate(NAMES)}


def wpath(name): return os.path.join(WORK, name)


def save(name): bpy.ops.wm.save_as_mainfile(filepath=wpath(name), compress=True)


def dump(obj, path):
    json.dump(obj, open(path, 'w'), indent=1, ensure_ascii=False)


def sstep(t):
    t = np.clip(t, 0.0, 1.0); return t * t * (3 - 2 * t)


def sz(u, w):  # なめらかな 0→1（幅 w、u=0 で 0.5）
    return sstep(u / w + 0.5)


def hsv(K):
    mx = K.max(-1); mn = K.min(-1); d = np.maximum(mx - mn, 1e-6)
    s = (mx - mn) / np.maximum(mx, 1e-6); r, g, b = K[..., 0], K[..., 1], K[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) / 6
    return h, s, mx


def in_class(h, s, v, c):
    m = np.ones(h.shape, bool)
    if 'h' in c:
        lo, hi = c['h']; m &= ((h >= lo) & (h <= hi)) if lo <= hi else ((h >= lo) | (h <= hi))
    if 's' in c: m &= (s >= c['s'][0]) & (s <= c['s'][1])
    if 'v' in c: m &= (v >= c['v'][0]) & (v <= c['v'][1])
    return m


def pixels(img):
    W, H = img.size; a = np.empty(W * H * 4, np.float32); img.pixels.foreach_get(a); return a.reshape(H, W, 4)


def load_png(path):
    im = bpy.data.images.load(path, check_existing=False); P = pixels(im); bpy.data.images.remove(im); return P   # 下の行から


def tex_of(ob):
    for m in ob.data.materials:
        for n in m.node_tree.nodes:
            if n.type == 'TEX_IMAGE': return n.image


def mesh_arrays(me):
    nv = len(me.vertices); nf = len(me.polygons)
    V = np.empty(nv * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3).astype(np.float64)
    NV = np.empty(nv * 3, np.float32); me.vertices.foreach_get('normal', NV); NV = NV.reshape(-1, 3)
    TRI = np.empty(nf * 3, np.int64); me.polygons.foreach_get('vertices', TRI); TRI = TRI.reshape(-1, 3)
    return V, NV, TRI


def vneighbors(me):
    E = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
    nbr = [[] for _ in range(len(me.vertices))]
    for a_, b_ in E: nbr[a_].append(b_); nbr[b_].append(a_)
    return nbr, E


def vert_colors(me, img, TRI):
    """点ごとの生成の色（まわりの面の中の 4 点の平均）"""
    P = pixels(img)[:, :, :3]; H, W = P.shape[:2]
    uv = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', uv); uv = uv.reshape(-1, 3, 2)
    pts = [uv.mean(1)] + [(uv[:, i] * 2 + uv[:, (i + 1) % 3] + uv[:, (i + 2) % 3]) / 4 for i in range(3)]
    col = np.zeros((len(TRI), 3))
    for p in pts: col += P[(np.clip(p[:, 1], 0, 1) * (H - 1)).astype(int), (np.clip(p[:, 0], 0, 1) * (W - 1)).astype(int)]
    col /= len(pts)
    nv = len(me.vertices); vcol = np.zeros((nv, 3)); vcnt = np.zeros(nv)
    for k in range(3): np.add.at(vcol, TRI[:, k], col); np.add.at(vcnt, TRI[:, k], 1)
    return vcol / np.maximum(vcnt, 1)[:, None], col


def components_v(mask, nbr):
    """点の印 mask の中で、辺でつながるかたまり（大きい順）"""
    lab = -np.ones(len(mask), int); comps = []
    for s in np.nonzero(mask)[0]:
        if lab[s] >= 0: continue
        st = [s]; lab[s] = len(comps); c = []
        while st:
            a = st.pop(); c.append(a)
            for b in nbr[a]:
                if mask[b] and lab[b] < 0: lab[b] = len(comps); st.append(b)
        comps.append(np.array(c))
    order = sorted(range(len(comps)), key=lambda i: -len(comps[i]))
    return [comps[i] for i in order]


def geodesic(nbr, V, seeds, mask):
    """mask の中で、seeds からの道のりの長さ（ダイクストラ）"""
    import heapq
    D = np.full(len(V), np.inf); hq = []
    for s in seeds: D[s] = 0.0; hq.append((0.0, int(s)))
    heapq.heapify(hq)
    while hq:
        d, a = heapq.heappop(hq)
        if d > D[a]: continue
        for b in nbr[a]:
            if not mask[b]: continue
            nd = d + float(np.linalg.norm(V[a] - V[b]))
            if nd < D[b]: D[b] = nd; heapq.heappush(hq, (nd, b))
    return D


def seg_dist(P, a, b):
    ab = b - a; t = np.clip(((P - a) @ ab) / (ab @ ab), 0, 1); return np.linalg.norm(P - (a + t[:, None] * ab), axis=1)


def min_dist(A, B, chunk=2000):
    """点の集まり A と B の一番近い距離（と、その点の番号）"""
    from mathutils.kdtree import KDTree
    kd = KDTree(len(B))
    for i, p in enumerate(B): kd.insert(p.tolist(), i)
    kd.balance()
    best = (np.inf, -1, -1)
    for i, p in enumerate(A):
        _, j, d = kd.find(p.tolist())
        if d < best[0]: best = (d, i, j)
    return best


def tri_min_dist(V, TRI, fa, fb):
    """面の集まり fa と fb の一番近い距離（面どうし。BVH の重なりと、点→面の距離で）"""
    from mathutils.bvhtree import BVHTree
    from mathutils import Vector
    Vl = [Vector(p) for p in V.tolist()]
    ta = BVHTree.FromPolygons(Vl, TRI[fa].tolist()); tb = BVHTree.FromPolygons(Vl, TRI[fb].tolist())
    if ta.overlap(tb): return 0.0
    va = np.unique(TRI[fa]); vb = np.unique(TRI[fb]); best = np.inf
    for i in va:
        r = tb.find_nearest(Vl[i])
        if r[0] is not None: best = min(best, r[3])
    for i in vb:
        r = ta.find_nearest(Vl[i])
        if r[0] is not None: best = min(best, r[3])
    return float(best)


def lab_of(me):
    lab = np.empty(len(me.vertices), int); me.attributes['lab'].data.foreach_get('value', lab); return lab

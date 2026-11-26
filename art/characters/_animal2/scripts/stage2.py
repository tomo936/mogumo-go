# 段 2: 塗り直し（「動物の二本足」型の共通の台本。キャラ固有の数字は config.json の segments・repaint・gate2）。
# 生成の形を向き・大きさをそろえ（norm.py）、点ごとに区分けし（生成の色＋場所の決まり config.segments.rules）、ならし、
# 区分けごとに元の絵の色（repaint.colors）で塗り直して、形から計算した陰（AO）を薄く乗せる。生成の色は区分けを決めるのに使うだけ。
# 目・鼻・口・まゆの点・ほほの赤みのような小さい物は、点では粗いので、絵の画素ごとに（生成の絵の色＋3D の場所で）印を作って塗る（segments.details）。
# 形は動かさない・面は減らさない（方針書 段 2）。
# 使い方: blender -b -P stage2.py -- <config.json>
#   出力: work/stage2.blend（点の区分け lab つき。段 3 が読む）・work/stage2.glb（確かめ用）・work/body-s2.png・gate/gate2.json
#   PREVIEW=1 で work/stage2-seg.glb（区分けの色だけで塗った形）も出す
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from norm import load_normalized
from mathutils.bvhtree import BVHTree
from mathutils import Vector

SG = CFG['segments']; RC = CFG['repaint']; G2 = CFG.get('gate2', {})
LOG = {}
ob, me, V, NV, TRI, vcol, info = load_normalized()
LOG['norm'] = info
nv = len(V); K = len(NAMES)
nbr, E = vneighbors(me)
h_, s_, v_ = hsv(vcol)
x, y, z = V.T; ax = np.abs(x)


def cond(c, H, S, Vv, X, Y, Z, lab=None):
    """決まり 1 つの条件（h・s・v は in_class と同じ。x は |x| の範囲、y・z は範囲。from は今の区分けの名前の一覧）"""
    m = in_class(H, S, Vv, c)
    if 'x' in c: m &= (np.abs(X) >= c['x'][0]) & (np.abs(X) <= c['x'][1])
    if 'y' in c: m &= (Y >= c['y'][0]) & (Y <= c['y'][1])
    if 'z' in c: m &= (Z >= c['z'][0]) & (Z <= c['z'][1])
    if 'from' in c and lab is not None: m &= np.isin(lab, [NI[n] for n in c['from']])
    return m


# ---------------------------------------------------------------- 点の区分け
lab = np.full(nv, NI[SG['default']]); fixed = np.zeros(nv, bool)
LOG['rules'] = []
for r in SG['rules']:
    m = cond(r, h_, s_, v_, x, y, z, lab); lab[m] = NI[r['to']]
    if r.get('fixed'): fixed |= m
    LOG['rules'].append([r['to'], int(m.sum())])
LOG['labels_raw'] = {n: int((lab == i).sum()) for i, n in enumerate(NAMES)}
keep_small = [NI[n] for n in SG.get('keep_small', [])]
for _ in range(SG['vote_iter']):
    new = lab.copy()
    for i in np.nonzero(~fixed)[0]:
        c = np.bincount(lab[nbr[i] + [i]], minlength=K)
        if c[lab[i]] * 2 < c.sum(): new[i] = c.argmax()
    lab = new


def small_islands(lab, limit):
    comp = -np.ones(nv, int); small = []
    for sidx in range(nv):
        if comp[sidx] >= 0: continue
        st = [sidx]; comp[sidx] = sidx; mem = []
        while st:
            a_ = st.pop(); mem.append(a_)
            for b_ in nbr[a_]:
                if comp[b_] < 0 and lab[b_] == lab[sidx]: comp[b_] = sidx; st.append(b_)
        if len(mem) < limit and lab[sidx] not in keep_small: small.append(mem)
    return small


for it in range(6):
    small = small_islands(lab, SG['min_island'])
    if not small: break
    for mem in small:
        ms = set(mem); c = np.zeros(K, int)
        for a_ in mem:
            for b_ in nbr[a_]:
                if b_ not in ms: c[lab[b_]] += 1
        if c.sum(): lab[mem] = c.argmax()
LOG['labels'] = {n: int((lab == i).sum()) for i, n in enumerate(NAMES)}
LOG['small_islands_left'] = len(small_islands(lab, SG['min_island']))
me.attributes.new('lab', 'INT', 'POINT').data.foreach_set('value', lab)
seg = np.array([np.bincount(lab[t], minlength=K).argmax() for t in TRI])
me.attributes.new('seg', 'INT', 'FACE').data.foreach_set('value', seg)

# ---------------------------------------------------------------- 塗るときの区分け: 画素で描く小さい物（detail_classes）の点は、まわりの区分けにする
plab = lab.copy(); dcl = [NI[n] for n in SG.get('detail_classes', [])]
for _ in range(50):
    todo = np.nonzero(np.isin(plab, dcl))[0]
    if not len(todo): break
    for i in todo:
        c = np.bincount([plab[b] for b in nbr[i] if plab[b] not in dcl], minlength=K)
        if c.sum(): plab[i] = c.argmax()
Pv = np.eye(K, dtype=np.float32)[plab]
for _ in range(RC['smooth_iter']):
    Pn = np.zeros_like(Pv)
    for i in range(nv): Pn[i] = Pv[nbr[i]].mean(0) if nbr[i] else Pv[i]
    Pv = 0.5 * Pv + 0.5 * Pn

# ---------------------------------------------------------------- 形から計算した陰（AO）
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
LOG['ao_pct_1_10_50_90'] = [round(float(np.percentile(ao, p_)), 3) for p_ in (1, 10, 50, 90)]
shade = lambda a: 1 - RC['ao_strength'] * (1 - a)


# ---------------------------------------------------------------- 絵の画素ごと
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


def soften(m, n):
    for _ in range(n): m = (m + np.roll(m, 1, 0) + np.roll(m, -1, 0) + np.roll(m, 1, 1) + np.roll(m, -1, 1)) / 5
    return m


def grow(m, n):
    for _ in range(n): m = m | np.roll(m, 1, 0) | np.roll(m, -1, 0) | np.roll(m, 1, 1) | np.roll(m, -1, 1)
    return m


img = tex_of(ob); W, H = img.size
P0 = pixels(img)[:, :, :3].copy()                                   # 生成の絵（区分けの印を作るためだけ）
LV = np.empty(len(me.loops), np.int64); me.loops.foreach_get('vertex_index', LV)
UVa = np.empty(len(me.loops) * 2, np.float32); me.uv_layers.active.data.foreach_get('uv', UVa); UVa = UVa.reshape(-1, 3, 2)
fid, bar = raster(range(len(TRI)), UVa * [W, H], W, H)
cov = fid >= 0; F = fid[cov]; Bc = bar[cov]; Bc /= np.maximum(Bc.sum(1, keepdims=True), 1e-6)
VI = TRI[F]
q = (Pv[VI] * Bc[:, :, None]).sum(1)
q = (q / np.maximum(q.max(1, keepdims=True), 1e-9)) ** RC['sharp']; q /= q.sum(1, keepdims=True)
xyz = (V[VI] * Bc[:, :, None]).sum(1)
aot = (ao[VI] * Bc).sum(1)
Cc = np.array([RC['colors'][n] for n in NAMES], np.float32) / 255.0
rgb = (q @ Cc) * shade(aot)[:, None]
img_out = np.zeros((H, W, 3), np.float32); img_out[cov] = rgb
img_out = dilate_fill(img_out, cov)
# 小さい物（画素ごと）: 生成の絵の色と 3D の場所で印を作り、ふちをやわらかくして、その色（陰つき）で塗る
X3 = np.zeros((H, W, 3), np.float32); X3[cov] = xyz
AO2 = np.ones((H, W), np.float32); AO2[cov] = aot
h0, s0, v0 = hsv(P0)
LOG['details'] = {}
for d in SG.get('details', []):
    m = cond(d, h0, s0, v0, X3[:, :, 0], X3[:, :, 1], X3[:, :, 2]) & cov
    m = grow(m, d.get('grow', 0))
    a = soften(m.astype(np.float32), d.get('soft', 1)) * d.get('alpha', 1.0)
    a *= cov
    c = np.array(RC['colors'][d['to']], np.float32) / 255.0
    img_out = img_out * (1 - a[:, :, None]) + (c[None, None] * shade(AO2)[:, :, None]) * a[:, :, None]
    LOG['details'][d['to'] + ('/' + d['name'] if 'name' in d else '')] = int(m.sum())
Pb = np.ones((H, W, 4), np.float32); Pb[:, :, :3] = np.clip(img_out, 0, 1)
img.pixels.foreach_set(Pb.ravel()); img.update()
img.filepath_raw = wpath('body-s2.png'); img.file_format = 'PNG'; img.save(); img.pack()
# 材質を作り直す（色の絵だけ。生成の材質の金属・荒さ・法線の絵は使わない）
mat = bpy.data.materials.new('body'); mat.use_nodes = True; nt = mat.node_tree
bsdf = nt.nodes['Principled BSDF']; tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = img
nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color']); bsdf.inputs['Roughness'].default_value = 1.0; bsdf.inputs['Metallic'].default_value = 0.0
me.materials.clear(); me.materials.append(mat)
for im in list(bpy.data.images):
    if im != img and im.users == 0: bpy.data.images.remove(im)
img.name = 'body'
save('stage2.blend')
glb = wpath('stage2.glb')
bpy.ops.export_scene.gltf(filepath=glb, export_format='GLB', export_apply=False, export_animations=False, export_skins=False,
                          export_image_format='WEBP', export_image_quality=84, export_attributes=False)

# ---------------------------------------------------------------- 関門 2 の数字
comp = components_v(np.ones(nv, bool), nbr)
AZ = CFG['arm_zone']
arm_f, tor_f = [], []
Tc = V[TRI].mean(1)
for s, sg in (('L', 1), ('R', -1)):
    zr = (Tc[:, 2] > AZ['gap_z'][0]) & (Tc[:, 2] < AZ['gap_z'][1])
    arm_f.append(np.nonzero(zr & (sg * Tc[:, 0] > AZ['x0']))[0]); tor_f.append(np.nonzero(zr & (sg * Tc[:, 0] < AZ['x0'] - AZ['gap_margin']) & (sg * Tc[:, 0] > 0))[0])
gaps = {s: round(tri_min_dist(V, TRI, arm_f[i], tor_f[i]), 4) for i, s in enumerate('LR')}
# 区分けごとの塗った色（陰ののった中央値）と目標の色
painted = {}
for i, n in enumerate(NAMES):
    mm = q[:, i] > 0.9
    if mm.sum() > 50: painted[n] = [int(c * 255) for c in np.median(rgb[mm], 0)]
res = dict(tris=len(TRI), verts=nv, islands=len(comp), small_islands_left=LOG['small_islands_left'],
           foot_min_z=round(float(V[:, 2].min()), 5), height=round(float(V[:, 2].max() - V[:, 2].min()), 5),
           arm_gap=gaps, glb_mb=round(os.path.getsize(glb) / 1e6, 3), tex=[W, H],
           labels=LOG['labels'], details=LOG['details'], painted_median=painted, ao=LOG['ao_pct_1_10_50_90'])
chk = {}
if 'tris' in G2: chk['tris'] = G2['tris'][0] <= res['tris'] <= G2['tris'][1]
chk['islands'] = res['islands'] == 1
chk['small_islands'] = res['small_islands_left'] == 0
chk['foot_z0'] = abs(res['foot_min_z']) < 1e-4
chk['arm_gap'] = min(gaps.values()) >= G2.get('arm_gap_min', 0.005)
chk['glb_mb'] = res['glb_mb'] <= G2.get('glb_mb_max', 2.0)
chk['tex'] = max(W, H) <= 2048
res['check'] = chk; res['pass'] = all(chk.values())
dump(dict(gate2=res, log=LOG), os.path.join(GATE, 'gate2.json'))
print('GATE2', json.dumps(res, ensure_ascii=False))

if os.environ.get('PREVIEW'):
    me.materials.clear()
    for n in NAMES:
        m_ = bpy.data.materials.new('s_' + n); m_.use_nodes = True
        m_.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = tuple((np.array(RC['seg_preview'].get(n, RC['colors'][n])) / 255.0) ** 2.2) + (1,)
        me.materials.append(m_)
    me.polygons.foreach_set('material_index', seg)
    bpy.ops.export_scene.gltf(filepath=wpath('stage2-seg.glb'), export_format='GLB', export_apply=False, export_attributes=False)

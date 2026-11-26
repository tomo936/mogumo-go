# 形の下調べ（新しいキャラの config の目印を決めるため）: 生成の形を段 2 と同じに向き・大きさをそろえ、高さごとの輪切りの輪（位置・大きさ・生成の色）を書き出す。
# 使い方: blender -b -P probe.py -- <config.json>   → work/probe.json
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from norm import load_normalized

ob, me, V, NV, TRI, vcol, info = load_normalized()
nbr, E = vneighbors(me)
h_, s_, v_ = hsv(vcol)


def loops_at(z, axis=2):
    z0, z1 = V[E[:, 0], axis], V[E[:, 1], axis]
    cross = (z0 - z) * (z1 - z) < 0
    # 面の中で輪切りをまたぐ 2 辺をつなぐ
    eid = {}
    for i, (a, b) in enumerate(E): eid[(min(a, b), max(a, b))] = i
    adj = defaultdict(list)
    Tz = V[TRI, axis]
    for f in np.nonzero((Tz.min(1) < z) & (Tz.max(1) > z))[0]:
        t = TRI[f]; es = [eid[(min(t[i], t[(i + 1) % 3]), max(t[i], t[(i + 1) % 3]))] for i in range(3)]
        es = [e for e in es if cross[e]]
        if len(es) == 2: adj[es[0]].append(es[1]); adj[es[1]].append(es[0])
    seen, out = set(), []
    for e0 in adj:
        if e0 in seen: continue
        comp, q = [], deque([e0]); seen.add(e0)
        while q:
            e = q.popleft(); comp.append(e)
            for n2 in adj[e]:
                if n2 not in seen: seen.add(n2); q.append(n2)
        ce = np.array(comp); t = (z - z0[ce]) / (z1[ce] - z0[ce])
        P = V[E[ce, 0]] + t[:, None] * (V[E[ce, 1]] - V[E[ce, 0]])
        C = vcol[E[ce, 0]] * (1 - t[:, None]) + vcol[E[ce, 1]] * t[:, None]
        out.append(dict(n=len(ce), x=[round(float(P[:, 0].min()), 3), round(float(P[:, 0].max()), 3)], y=[round(float(P[:, 1].min()), 3), round(float(P[:, 1].max()), 3)],
                        z=[round(float(P[:, 2].min()), 3), round(float(P[:, 2].max()), 3)], rgb=[int(c) for c in np.median(C, 0) * 255]))
    return [o for o in out if o['n'] >= 6]


res = dict(info=info, z={}, y={})
# しっぽのつながり（段 3 の最初の確かめ）: しっぽの途中（高さ tail_probe_z で一番後ろの点）から形の上の道のりで帯に分け、
# 上下それぞれで帯が太くなる（体に入る）所の位置と生成の色を書く。根元以外で体（頭・リュック）に入っていたら、しっぽはくっついている
TPZ = CFG.get('tail_probe_z')
if TPZ:
    x, y, z = V.T
    zz = np.abs(z - TPZ) < 0.006; seed = np.nonzero(zz & (np.abs(x) < 0.06) & (y > y[zz].max() - 0.05))[0]
    D = geodesic(nbr, V, seed, np.ones(len(V), bool))
    cls = np.full(len(V), 'other', object)
    cls[(s_ < 0.12) & (v_ > 0.45)] = 'grey'; cls[(h_ > 0.05) & (h_ < 0.17) & (s_ > 0.25) & (v_ > 0.5)] = 'tan'
    cls[((h_ < 0.04) | (h_ > 0.93)) & (s_ > 0.35)] = 'pink'; cls[(s_ < 0.12) & (v_ > 0.8)] = 'white'
    from collections import Counter
    TJ = {}
    for nm, br in (('upper', z > TPZ), ('lower', z < TPZ)):
        rows = []
        for d0 in np.arange(0.0, 0.42, 0.02):
            m = br & (D >= d0) & (D < d0 + 0.02)
            if not m.any(): continue
            rows.append(dict(d=round(float(d0), 2), xr=round(float(np.ptp(V[m, 0])), 3), y=[round(float(V[m, 1].min()), 3), round(float(V[m, 1].max()), 3)],
                             z=[round(float(V[m, 2].min()), 3), round(float(V[m, 2].max()), 3)], col=dict(Counter(cls[m]))))
        TJ[nm] = rows
    res['tail_join'] = TJ
for z in np.arange(0.01, 1.0, 0.02): res['z'][f'{z:.2f}'] = loops_at(z, 2)
for y in np.arange(0.05, 0.40, 0.025): res['y'][f'{y:.3f}'] = loops_at(y, 1)
dump(res, wpath('probe.json'))
print('PROBE saved', wpath('probe.json'), json.dumps(info))

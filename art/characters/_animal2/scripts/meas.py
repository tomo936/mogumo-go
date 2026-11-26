# 形の数字の道具（段 4 の範囲の測り直し・段 5・段 6 が使う）。pose3.py の数え方を関数にしたもの:
#   辺の伸び・縮み（基準の形に対する辺の長さの比。短すぎる辺は辺の中央値として数える）・面の折り返し（となりの面の向きが逆になった数）・
#   しっぽとお尻のつなぎ目の伸び・めりこみ（腕の先と胴・すねと太もも・左右の足・足と胴の面が交わる組。となり合う面はのぞく）・足の裏の高さ
import numpy as np
import bpy
from mathutils.bvhtree import BVHTree
from mathutils import Vector
from a2 import CFG, NI, mesh_arrays, lab_of

GROUPS = {'arm_tip': ['forearmL', 'forearmR', 'handL', 'handR', 'fingersL', 'fingersR'], 'torso': ['hips', 'chest', 'pack'],
          'shinL': ['shinL', 'footL'], 'thighL': ['thighL'], 'shinR': ['shinR', 'footR'], 'thighR': ['thighR'],
          'legL': ['thighL', 'shinL', 'footL'], 'legR': ['thighR', 'shinR', 'footR']}
PAIRS = [('arm_tip', 'torso'), ('shinL', 'thighL'), ('shinR', 'thighR'), ('legL', 'legR'), ('legL', 'torso'), ('legR', 'torso')]


class Meas:
    def __init__(self, ob):
        self.ob = ob; me = ob.data; self.nv = len(me.vertices)
        V0, _, TRI = mesh_arrays(me); self.V0 = V0; self.TRI = TRI
        E = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', E); self.E = E.reshape(-1, 2)
        names = [g.name for g in ob.vertex_groups]; Wt = np.zeros((self.nv, len(names)))
        for v in me.vertices:
            for g in v.groups: Wt[v.index, g.group] = g.weight
        self.names = names; self.Wt = Wt; dom = Wt.argmax(1); self.dn = np.array(names)[dom]
        ek = {}
        for f, t in enumerate(TRI):
            for i in range(3):
                a, b = sorted((t[i], t[(i + 1) % 3])); ek.setdefault((a, b), []).append(f)
        self.FP = np.array([fs for fs in ek.values() if len(fs) == 2])
        RG = CFG['rig']; lab = lab_of(me)
        pk = np.isin(lab, [NI[n] for n in RG['pack_labels']])
        tailv = (Wt[:, names.index(RG['tail']['bone'])] > 0.999) & ~pk
        self.tj = tailv[self.E[:, 0]] != tailv[self.E[:, 1]]
        fdom = np.array([np.bincount(dom[t], minlength=len(names)).argmax() for t in TRI]); self.fdn = np.array(names)[fdom]
        L0 = np.linalg.norm(V0[self.E[:, 0]] - V0[self.E[:, 1]], axis=1); self.MEDL = float(np.median(L0))
        footw = sum(Wt[:, names.index(b)] for b in ('footL', 'footR') if b in names)
        self.footv = {s: np.nonzero(Wt[:, names.index('foot' + s)] > 0.5)[0] for s in 'LR'}
        self.footv_any = np.nonzero(footw > 0.5)[0]

    def posed(self):
        dg = bpy.context.evaluated_depsgraph_get(); oe = self.ob.evaluated_get(dg); m2 = oe.to_mesh()
        P = np.empty(self.nv * 3, np.float32); m2.vertices.foreach_get('co', P); oe.to_mesh_clear()
        return (np.array(self.ob.matrix_world)[:3, :3] @ P.reshape(-1, 3).astype(np.float64).T).T + np.array(self.ob.matrix_world)[:3, 3]

    def fnormals(self, P):
        T = self.TRI; n = np.cross(P[T[:, 1]] - P[T[:, 0]], P[T[:, 2]] - P[T[:, 0]])
        return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)

    def overlaps(self, P, ga, gb):
        fa = np.nonzero(np.isin(self.fdn, GROUPS[ga]))[0]; fb = np.nonzero(np.isin(self.fdn, GROUPS[gb]))[0]
        if not len(fa) or not len(fb): return 0
        Vl = [Vector(p) for p in P.tolist()]; T = self.TRI
        ta = BVHTree.FromPolygons(Vl, T[fa].tolist()); tb = BVHTree.FromPolygons(Vl, T[fb].tolist())
        return sum(1 for i, j in ta.overlap(tb) if not set(T[fa[i]]) & set(T[fb[j]]))

    def stats(self, P, ref):
        """P の形を、基準の形 ref（同じ点の並び）と比べた数字"""
        E = self.E; L = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1); L0 = np.linalg.norm(ref[E[:, 0]] - ref[E[:, 1]], axis=1)
        r = 1 + (L - L0) / np.maximum(L0, self.MEDL)
        N0 = self.fnormals(ref); N = self.fnormals(P); FP = self.FP
        d0 = (N0[FP[:, 0]] * N0[FP[:, 1]]).sum(1); d1 = (N[FP[:, 0]] * N[FP[:, 1]]).sum(1); fold = (d0 > 0.3) & (d1 < -0.3)
        k = int(np.argmax(r)); dn = self.dn
        return dict(stretch_max=round(float(r.max()), 3), shrink_min=round(float(r.min()), 3),
                    stretch_at=f'{dn[E[k, 0]]}-{dn[E[k, 1]]}', folds=int(fold.sum()),
                    fold_bones=sorted({f'{self.fdn[FP[i, 0]]}/{self.fdn[FP[i, 1]]}' for i in np.nonzero(fold)[0]})[:4],
                    tail_join=[round(float(r[self.tj].min()), 3), round(float(r[self.tj].max()), 3)],
                    overlap={f'{a}/{b}': self.overlaps(P, a, b) for a, b in PAIRS})

    def sole(self, P):
        return {s: float(P[v, 2].min()) for s, v in self.footv.items()}

# 段 3 の試しの姿勢（関門 3）: 決まった姿勢（方針書 段 3: 腕 前60・後40・横90・下ろす、ひじ90、ひざ110、股 前60・後30。
# ＋しっぽとお尻のつなぎ目を見る胸のひねり）を骨に付けて GLB にし、姿勢ごとに数字を出す:
#   辺の伸び・縮み（いちばん大きい辺と、その骨）・面の折り返し（となりの面の向きが逆になった数）・しっぽとお尻のつなぎ目の伸び・
#   めりこみ（腕の先と胴・すねと太もも・左右の足の面が交わる組の数。となり合う面はのぞく）
# 使い方: blender -b -P pose3.py -- <config.json>   （work/stage3.blend を読む）
#   出力: work/gate3.glb・work/gate3-poses.json・gate/gate3.json。CAPTURE=1 で gate3img.sh も流す（並べ 1 枚＋関節の拡大 1 枚）
import os, sys, math, subprocess
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from rig import apply_pose, key_all, export, reset
from mathutils.bvhtree import BVHTree
from mathutils import Vector

bpy.ops.wm.open_mainfile(filepath=wpath('stage3.blend'))
rig = bpy.data.objects['rig']; ob = bpy.data.objects['avatar']; me = ob.data; D = math.radians
S3 = json.load(open(wpath('stage3-log.json'))); RG = CFG['rig']; G3 = CFG.get('gate3', {})
AO = (S3['landmarks']['armOpenL'] + S3['landmarks']['armOpenR']) / 2
AD = CFG.get('motion', {}).get('armDown', D(AO - G3.get('stand_open_deg', 25)))
POSES = [
    ('A ポーズ', {}, 0.0),
    ('立ち（腕を下ろす）', {}, AD),
    ('左腕 前60・右腕 後40', {'armL': D(60), 'armR': -D(40)}, AD),
    ('左腕 後40・右腕 前60・ひじ90', {'armL': -D(40), 'armR': D(60), 'elbowL': D(90), 'elbowR': D(90)}, AD),
    ('腕 横90', {}, -(D(90) - D(AO))),
    ('ひじ90（下ろした腕）', {'elbowL': D(90), 'elbowR': D(90)}, AD),
    ('左股 前60＋ひざ110・右股 後30', {'thighL': D(60), 'kneeL': D(110), 'thighR': -D(30)}, AD),
    ('左股 後30＋ひざ110・右股 前60', {'thighL': -D(30), 'kneeL': D(110), 'thighR': D(60)}, AD),
    ('胸 ひねり5・前傾5', {'chestTwist': D(5), 'chestLean': D(5)}, AD),
    ('胸 ひねり15・前傾10', {'chestTwist': D(15), 'chestLean': D(10)}, AD),
    ('立ち 腕の開き25（5 体の決まりの角度）', {}, D(AO - 25)),
]
nv = len(me.vertices)
V0, _, TRI = mesh_arrays(me)
E = np.empty(len(me.edges) * 2, np.int64); me.edges.foreach_get('vertices', E); E = E.reshape(-1, 2)
names = [g.name for g in ob.vertex_groups]; Wt = np.zeros((nv, len(names)))
for v in me.vertices:
    for g in v.groups: Wt[v.index, g.group] = g.weight
dom = Wt.argmax(1); dn = np.array(names)[dom]
# 面のとなり（辺を共有する 2 面）
ek = {}
for f, t in enumerate(TRI):
    for i in range(3):
        a, b = sorted((t[i], t[(i + 1) % 3])); ek.setdefault((a, b), []).append(f)
FP = np.array([fs for fs in ek.values() if len(fs) == 2])
tail_bone = RG['tail']['bone']; lab = lab_of(me)
pk = np.isin(lab, [NI[n] for n in RG['pack_labels']])
tailv = (Wt[:, names.index(tail_bone)] > 0.999) & ~pk     # しっぽの点（持ち物でなく、しっぽの骨に 100%）
tj = (tailv[E[:, 0]] != tailv[E[:, 1]])                   # しっぽとお尻のつなぎ目の辺
fdom = np.array([np.bincount(dom[t], minlength=len(names)).argmax() for t in TRI]); fdn = np.array(names)[fdom]
GROUPS = {'arm_tip': ['forearmL', 'forearmR', 'handL', 'handR', 'fingersL', 'fingersR'], 'torso': ['hips', 'chest', 'pack'],
          'shinL': ['shinL', 'footL'], 'thighL': ['thighL'], 'shinR': ['shinR', 'footR'], 'thighR': ['thighR'], 'legL': ['thighL', 'shinL', 'footL'], 'legR': ['thighR', 'shinR', 'footR']}
PAIRS = [('arm_tip', 'torso'), ('shinL', 'thighL'), ('shinR', 'thighR'), ('legL', 'legR'), ('legL', 'torso'), ('legR', 'torso')]


def fnormals(P):
    n = np.cross(P[TRI[:, 1]] - P[TRI[:, 0]], P[TRI[:, 2]] - P[TRI[:, 0]]); return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


N0 = fnormals(V0); dot0 = (N0[FP[:, 0]] * N0[FP[:, 1]]).sum(1); L0 = np.linalg.norm(V0[E[:, 0]] - V0[E[:, 1]], axis=1)
MEDL = float(np.median(L0)); L0f = np.maximum(L0, MEDL)   # 伸びの割合は、短すぎる辺（しわの所）を辺の長さの中央値として数える


def posed():
    dg = bpy.context.evaluated_depsgraph_get(); oe = ob.evaluated_get(dg); m2 = oe.to_mesh()
    P = np.empty(nv * 3, np.float32); m2.vertices.foreach_get('co', P); oe.to_mesh_clear(); return P.reshape(-1, 3).astype(np.float64)


def overlaps(P, ga, gb):
    fa = np.nonzero(np.isin(fdn, GROUPS[ga]))[0]; fb = np.nonzero(np.isin(fdn, GROUPS[gb]))[0]
    if not len(fa) or not len(fb): return 0
    Vl = [Vector(p) for p in P.tolist()]
    ta = BVHTree.FromPolygons(Vl, TRI[fa].tolist()); tb = BVHTree.FromPolygons(Vl, TRI[fb].tolist())
    n = 0
    for i, j in ta.overlap(tb):
        if not set(TRI[fa[i]]) & set(TRI[fb[j]]): n += 1
    return n


if os.environ.get('ARMSWEEP'):   # 立ち姿の腕の下ろし量ごとの、腕の先と胴のめりこみ（立ち姿の腕の角度を決めるため）
    sw = []
    for a_ in range(0, 50, 5):
        apply_pose(rig, {}, D(a_)); P = posed(); sw.append([a_, round(AO - a_, 1), overlaps(P, 'arm_tip', 'torso')])
    print('ARMSWEEP [下ろす度, 体からの開き度, めりこみの組]', sw); dump(sw, os.path.join(GATE, 'gate3-armsweep.json')); sys.exit(0)
rig.animation_data_create(); act = bpy.data.actions.new('gate3'); rig.animation_data.action = act
bpy.context.scene.render.fps = 30
OUT = []
base_ov = None
for i, (n, p, ad) in enumerate(POSES):
    apply_pose(rig, p, ad); key_all(rig, i)
    P = posed(); L = np.linalg.norm(P[E[:, 0]] - P[E[:, 1]], axis=1); r = 1 + (L - L0) / L0f
    N = fnormals(P); dot = (N[FP[:, 0]] * N[FP[:, 1]]).sum(1); fold = (dot0 > 0.3) & (dot < -0.3)
    top = np.argsort(-r)[:3]; low = np.argsort(r)[:2]
    ov = {f'{a}/{b}': overlaps(P, a, b) for a, b in PAIRS}
    if base_ov is None: base_ov = ov
    OUT.append(dict(pose=n, stretch_max=round(float(r.max()), 3), stretch_p999=round(float(np.percentile(r, 99.9)), 3), shrink_min=round(float(r.min()), 3),
                    stretch_top=[[round(float(r[k]), 3), f'{dn[E[k, 0]]}-{dn[E[k, 1]]}', np.round(P[E[k, 0]], 3).tolist()] for k in top],
                    shrink_top=[[round(float(r[k]), 3), f'{dn[E[k, 0]]}-{dn[E[k, 1]]}'] for k in low],
                    folds=int(fold.sum()), fold_bones=sorted({f'{fdn[FP[k, 0]]}/{fdn[FP[k, 1]]}' for k in np.nonzero(fold)[0]})[:6],
                    fold_at=sorted({tuple(np.round(V0[TRI[FP[k, 0]]].mean(0) / 0.05) * 0.05) for k in np.nonzero(fold)[0]})[:8],
                    tail_join_stretch=[round(float(r[tj].min()), 3), round(float(r[tj].max()), 3)], overlap_pairs=ov,
                    overlap_new={k: v - base_ov[k] for k, v in ov.items()}))
apply_pose(rig, POSES[-1][1], POSES[-1][2]); key_all(rig, len(POSES))
for fc_ in act.fcurves:
    for kp in fc_.keyframe_points: kp.interpolation = 'CONSTANT'
bpy.context.scene.frame_start, bpy.context.scene.frame_end = 0, len(POSES)
reset(rig)
export(wpath('gate3.glb'))
dump([n for n, _, _ in POSES], wpath('gate3-poses.json'))
lim = G3.get('stretch_max', 1.6)
summary = dict(median_edge=round(MEDL, 5), arm_down_deg=round(math.degrees(AD), 1), arm_open_deg=round(AO, 1), tail_join_edges=int(tj.sum()),
               worst_stretch=max(o['stretch_max'] for o in OUT), worst_shrink=min(o['shrink_min'] for o in OUT), folds_total=sum(o['folds'] for o in OUT),
               tail_join_worst=[min(o['tail_join_stretch'][0] for o in OUT), max(o['tail_join_stretch'][1] for o in OUT)])
chk = dict(stretch=summary['worst_stretch'] <= lim, shrink=summary['worst_shrink'] >= G3.get('shrink_min', 0.5), folds=summary['folds_total'] == 0,
           tail_join=summary['tail_join_worst'][1] <= G3.get('tail_join_max', 1.3) and summary['tail_join_worst'][0] >= G3.get('tail_join_min', 0.7))
summary['check'] = chk; summary['pass'] = all(chk.values())
dump(dict(summary=summary, poses=OUT), os.path.join(GATE, 'gate3.json'))
print('GATE3', json.dumps(summary, ensure_ascii=False))
for o in OUT: print('POSE', json.dumps({k: o[k] for k in ('pose', 'stretch_max', 'shrink_min', 'folds', 'tail_join_stretch', 'overlap_new')}, ensure_ascii=False))
if os.environ.get('CAPTURE'):
    subprocess.run(['bash', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'gate3img.sh'), os.path.relpath(CH, ROOT), str(len(POSES))], check=False)

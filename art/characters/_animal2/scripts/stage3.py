# 段 3: 骨と重み（「動物の二本足」型の共通の台本。キャラ固有の数字は config.json の arm_zone・rig）。キリンの build.py 段 3 を写して、
# 耳・しっぽの骨を「config に書いたときだけ」にしたもの（しばは無し: 耳・帽子は頭 100%、しっぽは rig.tail.bone の骨に 100%）。
# 骨（名前・親子は男の子・キリンと同じ）: hips・chest・head・upperarmL/R・forearmL/R・handL/R（手首）・fingersL/R（ミトン）・thighL/R・shinL/R・footL/R・pack
# 重み: 自動の重み → 腕の島は腕の骨だけ → 手首・ミトン → 肩の帯 → 足は腰より下だけ → 頭・持ち物・ベルト・しっぽ・足先の上書き。切る・ふたをする処理は書かない。
# 使い方: blender -b -P stage3.py -- <config.json>   （work/stage2.blend を読む）
#   出力: work/stage3.blend・work/stage3-log.json（目印）・gate/gate3-weights.json（重みの数字）
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from mathutils import Vector

LOG = {}
bpy.ops.wm.open_mainfile(filepath=wpath('stage2.blend'))
ob = bpy.data.objects['avatar']; me = ob.data
RG = CFG['rig']; AZ = CFG['arm_zone']; HC = RG['hand']
V = np.empty(len(me.vertices) * 3, np.float32); me.vertices.foreach_get('co', V); V = V.reshape(-1, 3).astype(np.float64)
lab = lab_of(me); nbr, E = vneighbors(me)
isl = lambda names: np.isin(lab, [NI[n] for n in names])
neck, ap, crotch = RG['neck'], RG['armpit'], RG['crotch']


def arm_zone(s, dx=0.0):
    sg = 1 if s == 'L' else -1
    return (sg * V[:, 0] > AZ['x0'] + dx) & (V[:, 2] > AZ['z'][0]) & (V[:, 2] < AZ['z'][1]) & (V[:, 1] > AZ['y'][0]) & (V[:, 1] < AZ['y'][1])


arm_v = {s: arm_zone(s, RG['arm_island_dx']) for s in 'LR'}
armz_all = arm_zone('L') | arm_zone('R')
# ---- 目印 ----
LM = {}; HAND = {}
for s, sg in (('L', 1), ('R', -1)):
    P = V[arm_v[s]]
    sh = np.array([sg * RG['shoulder_x'], float(np.median(P[:, 1])), RG['shoulder_z']])
    tip = P[np.linalg.norm(P - sh, axis=1).argmax()]
    tl = float(np.linalg.norm(tip - sh)); a = (tip - sh) / tl
    LM['shoulder' + s] = sh; LM['elbow' + s] = sh + (tip - sh) * RG['elbow_frac']; LM['handtip' + s] = tip
    LM['armLen' + s] = tl; LM['armOpen' + s] = float(math.degrees(math.atan2(abs(tip[0] - sh[0]), abs(tip[2] - sh[2]))))
    # 手（手首から先）: 腕の軸の上で wrist_frac より先の点。手のひらの向きは、手の点の広がりのいちばん薄い向き（体の側）
    t = (P - sh) @ a; tw = RG['wrist_frac'] * tl; hm = t > tw; Ph = P[hm]; th = t[hm]
    Q = Ph - Ph.mean(0); Q = Q - np.outer(Q @ a, a); _, _, vt = np.linalg.svd(Q)
    n = vt[2] if vt[2][0] * sg < 0 else -vt[2]
    n = n - (n @ a) * a; n /= np.linalg.norm(n)
    tk = tw + HC['knuckle_frac'] * (tl - tw)
    def cen(tc):
        k = np.abs(t - tc) < 0.006; return P[k].mean(0) if k.sum() > 3 else sh + a * tc
    Wc, Kc = cen(tw), cen(tk)
    kk = np.abs(t - tk) < 0.006; thk = float(np.ptp(P[kk] @ n)) if kk.sum() > 3 else 0.0
    Kc = Kc + n * (HC['pivot_palm'] * thk)
    HAND[s] = dict(a=a, n=n, sh=sh, tw=tw, tt=tl, tk=tk, W=Wc, K=Kc, T=Kc + a * (tl - tk))
    LOG['hand' + s] = dict(thick=round(thk, 4), tw=round(tw, 4), tk=round(tk, 4), tt=round(tl, 4), palm_normal=n.round(3).tolist(), verts=int(hm.sum()))
    leg = (V[:, 2] > RG['leg_z'][0]) & (V[:, 2] < RG['leg_z'][1]) & (sg * V[:, 0] > 0.01)
    lx = float(np.median(V[leg, 0])); ly = float((V[leg, 1].min() + V[leg, 1].max()) / 2)
    hipz = crotch + RG['hipj_up']
    LM['hipj' + s] = np.array([lx, ly, hipz]); LM['ankle' + s] = np.array([lx, ly, RG['ankle']])
    LM['knee' + s] = np.array([lx, ly, RG['ankle'] + (hipz - RG['ankle']) * RG['knee_frac']])
    ft = (V[:, 2] < RG['ankle']) & (sg * V[:, 0] > 0)
    LM['toe' + s] = np.array([lx, float(V[ft, 1].min()) + 0.01, 0.02])
pk = isl(RG['pack_labels'])
tor = (np.abs(V[:, 0]) < 0.1) & (V[:, 2] > RG['torso_z'][0]) & (V[:, 2] < RG['torso_z'][1]) & ~pk
ty = float((V[tor, 1].min() + V[tor, 1].max()) / 2)
hd = V[:, 2] > neck + 0.05; hy = float((V[hd, 1].min() + V[hd, 1].max()) / 2)
py = float(V[pk, 1].mean()); pz0, pz1 = float(V[pk, 2].min()), float(V[pk, 2].max())
waist = crotch + (neck - crotch) / 3
# しっぽ: 胴の後ろ（y > tail.y0）で、持ち物・ベルトでない点の、いちばん大きいかたまり
TLc = RG['tail']
tm = (V[:, 1] > TLc['y0']) & (np.abs(V[:, 0]) < TLc['x']) & (V[:, 2] > TLc['z'][0]) & (V[:, 2] < TLc['z'][1]) & ~pk & ~isl(['strap'])
tcs = components_v(tm, nbr); tail = np.zeros(len(V), bool)
if tcs: tail[tcs[0]] = True
LOG['tail'] = dict(verts=int(tail.sum()), y=[round(float(V[tail, 1].min()), 4), round(float(V[tail, 1].max()), 4)], z=[round(float(V[tail, 2].min()), 4), round(float(V[tail, 2].max()), 4)], parts=len(tcs))
LOG['landmarks'] = {k: (np.round(v, 4).tolist() if hasattr(v, '__len__') else round(float(v), 4)) for k, v in LM.items()}
LOG['landmarks'].update(ty=round(ty, 4), head_y=round(hy, 4), waist=round(waist, 4), pack=[round(py, 4), round(pz0, 4), round(pz1, 4)])
# ---- 骨 ----
arm = bpy.data.armatures.new('rig'); rig = bpy.data.objects.new('rig', arm); bpy.context.scene.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='EDIT')
eb = arm.edit_bones


def bone(n, h, t, par=None):
    b = eb.new(n); b.head = Vector(h); b.tail = Vector(t); b.roll = 0
    if par: b.parent = eb[par]
    b.use_connect = False
    return b


bone('hips', (0, ty, crotch + RG['hipj_up']), (0, ty, waist))
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
bone('pack', (0, py, pz1), (0, py, pz0), RG.get('pack_parent', 'chest'))
bpy.ops.object.mode_set(mode='OBJECT')
# ---- 重み ----
bpy.ops.object.select_all(action='DESELECT'); ob.select_set(True); rig.select_set(True); bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
ob.matrix_parent_inverse.identity()
names = [b.name for b in arm.bones]; NB = len(names); B = {n: i for i, n in enumerate(names)}
Wt = np.zeros((len(V), NB))
gi = {g.index: names.index(g.name) for g in ob.vertex_groups}
for v in me.vertices:
    for g in v.groups: Wt[v.index, gi[g.group]] = g.weight
LOG['auto_zero_verts'] = int((Wt.sum(1) < 1e-6).sum())
bh_ = lambda n: (np.array(arm.bones[n].head_local), np.array(arm.bones[n].tail_local))
zero = Wt.sum(1) < 1e-6
if zero.any():
    D = np.stack([seg_dist(V[zero], *bh_(n)) for n in names], 1); Wt[np.nonzero(zero)[0], D.argmin(1)] = 1
Wt[:, B['pack']] = 0
armb = {s: [B['upperarm' + s], B['forearm' + s]] for s in 'LR'}
hb = {s: [B['hand' + s], B['fingers' + s]] for s in 'LR'}
# 腕の島: 腕の骨だけ
for s in 'LR':
    m = arm_v[s]; w = Wt[m][:, armb[s]]; tot = w.sum(1); P = V[m]
    D = np.stack([seg_dist(P, *bh_(n + s)) for n in ('upperarm', 'forearm')], 1)
    fb = np.zeros_like(w); fb[np.arange(len(P)), D.argmin(1)] = 1
    w = np.where(tot[:, None] > 0.05, w / np.maximum(tot[:, None], 1e-9), fb)
    Wt[m] = 0; Wt[np.ix_(np.nonzero(m)[0], armb[s])] = w
# 手首より先は hand（手首の帯 ±wrist_band だけ前腕と混ぜる）、指の付け根（knuckle）より先は fingers（±finger_band）
for s in 'LR': Wt[:, hb[s]] = 0
for s in 'LR':
    H_ = HAND[s]; m = np.nonzero(arm_v[s])[0]; t = (V[m] - H_['sh']) @ H_['a']
    h = sstep((t - (H_['tw'] - HC['wrist_band'])) / (2 * HC['wrist_band']))
    f = sstep((t - (H_['tk'] - HC['finger_band'])) / (2 * HC['finger_band']))
    Wt[m] *= (1 - h)[:, None]; Wt[m, B['hand' + s]] = h * (1 - f); Wt[m, B['fingers' + s]] = h * f
    tot = Wt[m].sum(1); Wt[m] /= np.maximum(tot, 1e-9)[:, None]
# 肩: rig.shoulder_mode が "plane" なら、肩の関節を通り腕の軸に垂直な面の前後 ±shoulder_band だけ腕と胸を混ぜる（キリン）。
# "auto" なら自動の重みのまま。どちらも頭・持ち物・ベルト・反対側には腕の重みを付けない
band = RG['shoulder_band']; rigid_no_arm = isl(RG['head_labels'] + RG['pack_labels'] + ['strap'])
for s, sg in (('L', 1), ('R', -1)):
    hj, tj = bh_('upperarm' + s); ax_ = (tj - hj) / np.linalg.norm(tj - hj)
    f_ = sstep(((V - hj) @ ax_ + band) / (2 * band)) if RG.get('shoulder_mode', 'plane') == 'plane' else np.ones(len(V))
    f_[arm_v[s]] = 1.0; f_[rigid_no_arm] = 0.0; f_[sg * V[:, 0] < 0] = 0.0
    # わきより下の胴（腕の島より内）: 腕の重みを armpit_band でなめらかに 0 へ（キリンは帯なし＝わきで切れる）
    tb = (sg * V[:, 0] < AZ['x0']) & ~arm_v[s]
    f_[tb] *= sstep((V[tb, 2] - (ap - RG.get('armpit_band', 0.0))) / max(RG.get('armpit_band', 0.0), 1e-6)) if RG.get('armpit_band') else (V[tb, 2] >= ap)
    moved = Wt[:, armb[s] + hb[s]].sum(1) * (1 - f_)
    Wt[:, armb[s] + hb[s]] *= f_[:, None]; Wt[:, B['chest']] += moved
# 足の骨は腰より下（leg_top から leg_band でなめらかに 0）。持ち物・しっぽには付けない
legb = [B[n + s] for n in ('thigh', 'shin', 'foot') for s in 'LR']
for i in np.nonzero(V[:, 2] > RG['leg_top'] - RG['leg_band'])[0]:
    mv = Wt[i, legb].sum()
    if mv <= 0: continue
    f = 0.0 if (pk[i] or tail[i]) else sstep((RG['leg_top'] - V[i, 2]) / RG['leg_band'])
    Wt[i, legb] *= f; Wt[i, B['hips']] += mv * (1 - f)
# 頭: 首の帯（neck ± neck_band）より上は head 100%（腕・持ち物・ベルトをのぞく）。頭の区分け（帽子・目・鼻）は高さによらず head 100%
nb = RG['neck_band']
k = sstep((V[:, 2] - (neck - nb)) / (2 * nb))
k[isl(RG['head_labels'])] = 1.0; k[isl(RG['pack_labels'] + ['strap'])] = 0.0; k[armz_all] = 0.0
for i in np.nonzero(k > 0)[0]:
    Wt[i] *= (1 - k[i]); Wt[i, B['head']] += k[i]
# ベルト: chest 100%。持ち物・しっぽ: rig.tail.bone（しば: pack）100%
st_ = isl(['strap']) & ~armz_all; Wt[st_] = 0; Wt[st_, B['chest']] = 1
Wt[pk] = 0; Wt[pk, B['pack']] = 1
Wt[tail] = 0; Wt[tail, B[TLc['bone']]] = 1
# 足先: 足首の帯（ankle ± foot_band）より下は foot 100%
fb_ = RG['foot_band']
for s, sg in (('L', 1), ('R', -1)):
    for i in np.nonzero((V[:, 2] < RG['ankle'] + fb_) & (sg * V[:, 0] > 0) & ~pk & ~tail)[0]:
        f = sstep((RG['ankle'] + fb_ - V[i, 2]) / (2 * fb_))
        Wt[i] *= (1 - f); Wt[i, B['foot' + s]] += f
zero = Wt.sum(1) < 1e-6; LOG['zero_after_override'] = int(zero.sum())
if zero.any():
    cand = ['hips', 'chest']; D = np.stack([seg_dist(V[zero], *bh_(n)) for n in cand], 1)
    for j, i in enumerate(np.nonzero(zero)[0]): Wt[i, B[cand[D[j].argmin()]]] = 1
for i in range(len(Wt)):
    w = Wt[i]
    if (w > 0).sum() > 4: w[np.argsort(w)[:-4]] = 0
    sm = w.sum(); Wt[i] = w / sm if sm > 0 else w
for g in list(ob.vertex_groups): ob.vertex_groups.remove(g)
for n in names: ob.vertex_groups.new(name=n)
for j, n in enumerate(names):
    vg = ob.vertex_groups[n]
    for i in np.nonzero(Wt[:, j] > 1e-4)[0]: vg.add([int(i)], float(Wt[i, j]), 'REPLACE')
# 段 5 のための体の寸法（身長 1）
legL = float(np.linalg.norm(LM['hipjL'] - LM['kneeL']) + np.linalg.norm(LM['kneeL'] - LM['ankleL']) + RG['ankle'])
body = dict(height=1.0, crotch=crotch, hip_joint=round(crotch + RG['hipj_up'], 4), leg_len=round(legL, 4),
            hip_width=round(float(LM['hipjL'][0] - LM['hipjR'][0]), 4), arm_len=round((LM['armLenL'] + LM['armLenR']) / 2, 4),
            arm_open_deg=round((LM['armOpenL'] + LM['armOpenR']) / 2, 1), shoulder_z=RG['shoulder_z'], neck=neck, armpit=ap,
            stride_walk=round(2 * legL * math.sin(math.radians(20)), 4), stride_run=round(2 * legL * math.sin(math.radians(30)), 4),
            note='leg_len = 股の関節→ひざ→足首＋足首の高さ。歩幅の目安 = 2×leg_len×sin(股の振り)。歩き 20°・走り 30° で計算（段 5 は関門 3 の上限の 8 割で決め直す）')
LOG['body'] = body
# ---- 関門 3 の重みの数字 ----
hi = names.index('head'); pi_ = names.index(TLc['bone'])
headzone = (V[:, 2] > neck + nb) & ~isl(RG['pack_labels'] + ['strap']) & ~armz_all
footzone = [(V[:, 2] < RG['ankle'] - fb_) & (sg * V[:, 0] > 0) & ~pk & ~tail for sg in (1, -1)]
res = dict(bones=NB, bone_names=names, auto_zero_verts=LOG['auto_zero_verts'], zero_after_override=LOG['zero_after_override'],
           head_not100=int((Wt[headzone | isl(RG['head_labels']), hi] < 0.999).sum()),
           pack_not100=int((Wt[pk, names.index('pack')] < 0.999).sum()),
           tail_not100=int((Wt[tail, pi_] < 0.999).sum()), tail_verts=int(tail.sum()),
           foot_not100=int(sum((Wt[footzone[j], names.index('foot' + s)] < 0.999).sum() for j, s in enumerate('LR'))),
           strap_not100=int((Wt[st_, names.index('chest')] < 0.999).sum()),
           max_influences=int((Wt > 1e-4).sum(1).max()), sum_not1=int((np.abs(Wt.sum(1) - 1) > 1e-3).sum()),
           arm_on_torso_below_band=int(sum((Wt[np.ix_(np.nonzero((V[:, 2] < ap - RG.get('armpit_band', 0.0)) & (sg * V[:, 0] < AZ['x0']) & (sg * V[:, 0] > -0.05))[0], armb[s] + hb[s])] > 1e-4).any(1).sum() for s, sg in (('L', 1), ('R', -1)))))
chk = {k: res[k] == 0 for k in ('head_not100', 'pack_not100', 'tail_not100', 'foot_not100', 'strap_not100', 'sum_not1', 'zero_after_override', 'arm_on_torso_below_band')}
chk['max_influences'] = res['max_influences'] <= 4; chk['bones'] = NB == 18
res['check'] = chk; res['pass'] = all(chk.values())
save('stage3.blend')
dump(LOG, wpath('stage3-log.json')); dump(dict(weights=res, body=body), os.path.join(GATE, 'gate3-weights.json'))
print('GATE3W', json.dumps(res, ensure_ascii=False)); print('BODY', json.dumps(body, ensure_ascii=False)); print('TAIL', LOG['tail'])

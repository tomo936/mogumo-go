# 動ける範囲の測り直し（段 5 の前）: 立ち姿（腕の開き = config gate3.stand_open_deg）から、動きで使う小さい角度だけを関節ごとに試し、
# 立ち姿に対する 伸び・縮み・折り返し・めりこみ・しっぽのつなぎ目 を数えて、破れない上限を関節ごとに決める（config の range に試す角度）。
# 腰の揺れ（hipRoll・hipLean）は、足を元の向きに戻した形で見る（足は地面に着いたまま、腰から上だけが傾く）。
# 使い方: blender -b -P range5.py -- <config.json>   （work/stage3.blend を読む）→ gate/range5.json（姿勢ごとの数字と上限）。上限は config の limits に手で写す
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from rig import apply_pose, rot
from meas import Meas

bpy.ops.wm.open_mainfile(filepath=wpath('stage3.blend'))
rig = bpy.data.objects['rig']; ob = bpy.data.objects['avatar']; D = math.radians
S3 = json.load(open(wpath('stage3-log.json'))); RA = CFG['range']; LIM = RA['pass']
AO = (S3['landmarks']['armOpenL'] + S3['landmarks']['armOpenR']) / 2
AD = D(AO - CFG['gate3']['stand_open_deg'])
M = Meas(ob)
apply_pose(rig, {}, AD); STAND = M.posed(); st0 = M.stats(STAND, M.V0)


def pose(kind, a):
    p = {}; ad = AD; r = D(a)
    if kind == 'armFwd': p = {'armL': r, 'armR': r}
    elif kind == 'armBack': p = {'armL': -r, 'armR': -r}
    elif kind in ('armOut', 'armIn'): p = {'armOut': r}
    elif kind == 'elbow': p = {'elbowL': r, 'elbowR': r}
    elif kind == 'thighFwd': p = {'thighL': r, 'thighR': r}
    elif kind == 'thighBack': p = {'thighL': -r, 'thighR': -r}
    elif kind == 'knee': p = {'kneeL': r, 'kneeR': r}
    elif kind == 'crouch': p = {'thighL': r / 2, 'thighR': r / 2, 'kneeL': r, 'kneeR': r, 'footL': -r / 2, 'footR': -r / 2}
    apply_pose(rig, p, ad)
    if kind in ('hipRoll', 'hipLean'):
        ax = 'Y' if kind == 'hipRoll' else 'X'
        rot(rig, 'hips', (ax, r))
        for s in 'LR': rot(rig, 'thigh' + s, (ax, -r))   # 足は元の向きへ戻す
    return M.posed()


def ok(s):
    return (s['stretch_max'] <= LIM['stretch_max'] and s['shrink_min'] >= LIM['shrink_min'] and s['folds'] == 0
            and all(v == 0 for v in s['overlap'].values()) and LIM['tail_min'] <= s['tail_join'][0] and s['tail_join'][1] <= LIM['tail_max'])


OUT = {'stand': dict(arm_open_deg=CFG['gate3']['stand_open_deg'], arm_down_deg=round(math.degrees(AD), 1), vs_apose=st0), 'tests': {}, 'limits': {}}
for kind, angles in RA['tests'].items():
    rows = []; lim = 0
    for a in angles:
        P = pose(kind, a); s = M.stats(P, STAND)
        # めりこみは立ち姿で既にある組を引く
        s['overlap'] = {k: v - st0['overlap'][k] for k, v in s['overlap'].items()}
        s['ok'] = ok(s); rows.append(dict(deg=a, **s))
        if s['ok'] and (lim == 0 or abs(a) > abs(lim)) and all(r_['ok'] for r_ in rows): lim = a
        print('RANGE', kind, a, json.dumps({k: s[k] for k in ('stretch_max', 'shrink_min', 'stretch_at', 'folds', 'tail_join', 'ok')}), {k: v for k, v in s['overlap'].items() if v})
    OUT['tests'][kind] = rows; OUT['limits'][kind] = lim
dump(OUT, os.path.join(GATE, 'range5.json'))
print('LIMITS', json.dumps(OUT['limits']), 'STAND', json.dumps({k: st0[k] for k in ('stretch_max', 'shrink_min', 'stretch_at', 'folds', 'fold_bones')}, ensure_ascii=False))

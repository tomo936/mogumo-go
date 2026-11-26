# 段 5: 動き（「動物の二本足」型の共通の台本。キャラ固有の数字は config.json の motion。範囲は range5.py で測った limits の 8 割まで）。
# 足は「足首の通り道」から 2 本の骨の IK で決める（足が地面に着いている間は、足首が地面の上を一定の速さで後ろへ動く = すべらない。
# 体の高さは、着いている足が届く高さから毎コマ計算する = 浮かない・沈まない）。足の裏はいつも水平（足の骨を元の向きに戻す）。
# 腕・頭・腰の揺れは apply_pose の値（rollPow = 揺れの形: 3 は着く時に平ら、1 はなめらかな sin）。bob = ひざで沈む弾み（関数 bob）。胸はひねらない・前に倒さない。持ち物は揺らさない。
# 動き: idle（3 秒）・walk（1.0 秒）・run（0.6 秒）・joy（0.8 秒）。各動きのコマ 1 と 最後のコマは同じ姿勢（1 周でつながる）。
# 使い方: blender -b -P stage5.py -- <config.json>   （work/stage4.blend を読む）
#   出力: work/stage5.blend・work/avatar.glb（4 つの動き）・work/stage5-log.json（コマごとの角度と、伸び・折り返し・めりこみ・足の裏・すべり・つなぎ目の数字）
import os, sys, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from a2 import *
from rig import apply_pose, reset, rot, key_all, export
from meas import Meas
from mathutils import Vector, Matrix

bpy.ops.wm.open_mainfile(filepath=wpath('stage4.blend'))
rig = bpy.data.objects['rig']; ob = bpy.data.objects['avatar']; D = math.radians; TAU = 2 * math.pi
MO = CFG['motion']; S3 = json.load(open(wpath('stage3-log.json')))
AO = (S3['landmarks']['armOpenL'] + S3['landmarks']['armOpenR']) / 2
AD = D(AO - CFG['gate3']['stand_open_deg'])
M = Meas(ob); LOG = {}
reset(rig); PB = rig.pose.bones
REST = {s: dict(H=PB['thigh' + s].head.copy(), K=PB['shin' + s].head.copy(), A=PB['foot' + s].head.copy()) for s in 'LR'}
LA = (REST['L']['K'] - REST['L']['H']).length; LB = (REST['L']['A'] - REST['L']['K']).length
LS = MO['legReach'] * (LA + LB)
LOG['leg'] = dict(thigh=round(LA, 4), shin=round(LB, 4), reach=round(LS, 4))
apply_pose(rig, {}, AD); STAND = M.posed()


def herm(p0, p1, m0, m1, t):
    t2, t3 = t * t, t * t * t; return (2 * t3 - 3 * t2 + 1) * p0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * p1 + (t3 - t2) * m1


def foot_target(q, G):
    """足首の通り道（体に対する前 x・地面からの上げ z、着いているか）。G: duty・stride・lift・x0"""
    q %= 1.0; du, S = G['duty'], G['stride']
    if q < du: return G['x0'] + S / 2 - S * q / du, 0.0, True
    u = (q - du) / (1 - du); m = -S / du * (1 - du)
    return G['x0'] + herm(-S / 2, S / 2, m, m, u), G['lift'] * math.sin(math.pi * u) ** 2, False


def aim(name, d):
    pb = PB[name]; cur = (pb.tail - pb.head)
    q = cur.normalized().rotation_difference(d.normalized())
    if q.angle > 1e-7: rot(rig, name, (q.axis, q.angle))


def legs(tg):
    """tg: {L/R: (x, z)} → 足首をそこへ（届かなければまっすぐ伸ばして向ける）。足の裏は元の向き"""
    for s in 'LR':
        x, z = tg[s]; H = PB['thigh' + s].head.copy(); A0 = REST[s]['A']
        A = Vector((A0.x, A0.y - x, A0.z + z)); v = A - H; d = min(v.length, LS); u = v.normalized()
        fwd = Vector((0, -1, 0)); n = (fwd - u * fwd.dot(u)).normalized()
        al = math.acos(max(-1, min(1, (LA * LA + d * d - LB * LB) / (2 * LA * d))))
        K = H + LA * (math.cos(al) * u + math.sin(al) * n)
        aim('thigh' + s, K - H); aim('shin' + s, (H + d * u) - PB['shin' + s].head)
        fb = PB['foot' + s]; m = fb.bone.matrix_local.copy(); m.translation = fb.head.copy(); fb.matrix = m
        bpy.context.view_layer.update()


def need_y(p, tg, stance):
    """着いている足が届く体の高さ（hips の上下）。着いている足が無ければ None"""
    p = dict(p); p['y'] = 0.0; apply_pose(rig, p, AD); best = None
    for s in 'LR':
        if not stance[s]: continue
        x, z = tg[s]; H = PB['thigh' + s].head; A0 = REST[s]['A']
        A = Vector((A0.x, A0.y - x, A0.z + z)); hz = (A - H).xy.length
        y = -(H.z - A.z) + math.sqrt(max(LS * LS - hz * hz, 0)); best = y if best is None else min(best, y)
    return best


def roll(ph, R, c=0.55, pw=3):
    v = math.sin(TAU * (ph - c)); return -R * math.copysign(abs(v) ** pw, v)   # 左の足を振り出す時（0.6〜1.0）に左の腰が上がる（hipRoll は + で左が下がる）。両足が着く時（0.05・0.55）は 0 のまわりで平ら


def gait(name):
    G = MO[name]; N = G['frames']
    def f(ph):
        p = {'hipRoll': D(roll(ph, G['roll'], G['rollPhase'], G.get('rollPow', 3))), 'lean': D(G.get('lean', 0)), 'headPitch': D(G['headPitch'] + G['nod'] * math.sin(2 * TAU * (ph - 0.1))),
             'armOut': D(G['armOut'])}
        tg = {}; st = {}
        for s, o in (('L', 0.0), ('R', 0.5)):
            x, z, on = foot_target(ph + o, G); tg[s] = (x, z); st[s] = on
            c = 0.5 - 0.5 * math.cos(TAU * (ph + o - G['armLag']))   # 0 = 足が一番前の時（腕は後ろ）
            p['arm' + s] = -D(G['armBack']) * (1 - c)
            p['elbow' + s] = D(G['elbow'][0] + (G['elbow'][1] - G['elbow'][0]) * c)
        return p, tg, st
    return N, f


def joy_fn():
    G = MO['joy']; N = G['frames']
    def f(ph):
        b = math.sin(TAU * ph)
        p = {'armOut': D(G['armOut'][0] + (G['armOut'][1] - G['armOut'][0]) * (0.5 + 0.5 * b)), 'headPitch': D(G['headPitch']),
             'elbowL': D(G['elbow']), 'elbowR': D(G['elbow'])}
        return p, {'L': (G['x0'], 0.0), 'R': (G['x0'], 0.0)}, {'L': True, 'R': True}
    return N, f


def idle_fn():
    G = MO['idle']; N = G['frames']
    def f(ph):
        br = 0.5 - 0.5 * math.cos(2 * TAU * ph)   # 息（3 秒に 2 回）
        p = {'hipRoll': D(G['roll'] * math.sin(TAU * ph)), 'armOut': D(G['armOut'] * br), 'headPitch': D(G['headPitch'] * (br - 0.5)),
             'headTwist': D(G['headTwist'] * math.sin(TAU * (ph - 0.3))), 'elbowL': D(G['elbow']), 'elbowR': D(G['elbow'])}
        return p, {'L': (G['x0'], 0.0), 'R': (G['x0'], 0.0)}, {'L': True, 'R': True}
    return N, f


def bob(name, ph):
    """体の高さから引く分（ひざで沈む）。歩き・走り: 1 歩に 1 回（bobShift 0 = 両足が着く時に一番低い、0.25 = 着いている足のまん中で一番低い）。待機: 息（3 秒に 2 回）"""
    G = MO[name]; b = G.get('bob', 0.0)
    if not b: return 0.0
    if name == 'idle': return b * (0.5 - 0.5 * math.cos(2 * TAU * ph))
    return b * (0.5 + 0.5 * math.cos(2 * TAU * (ph - G['rollPhase'] - G.get('bobShift', 0.0))))


def hop(ph, G):   # うれしい: しゃがむ → 跳ぶ（放物線）→ 着く。体の高さに足す分
    t0, t1 = G['air']
    if t0 <= ph < t1: u = (ph - t0) / (t1 - t0); return G['jump'] * 4 * u * (1 - u)
    return -G['dip'] * math.sin(math.pi * ((ph - t1) % 1.0) / (1 - (t1 - t0))) ** 2


ACTS = {'idle': idle_fn(), 'walk': gait('walk'), 'run': gait('run'), 'joy': joy_fn()}
bpy.context.scene.render.fps = 30
rig.animation_data_create()
STAT = {}
for name, (N, fn) in ACTS.items():
    # 体の高さ: 着いている足が届く高さ。足が全部浮く時（走りの宙）は前後の高さを放物線でつなぎ、上げ分を足す
    ys = []; frames = []
    for i in range(N):
        p, tg, st = fn(i / N); frames.append((p, tg, st)); y_ = need_y(p, tg, st); ys.append(None if y_ is None else y_ - bob(name, i / N))
    if name == 'run':
        G = MO['run']; idx = [i for i in range(N) if ys[i] is None]
        for i in idx:
            a_ = max(j for j in range(i - N, i) if ys[j % N] is not None); b_ = min(j for j in range(i + 1, i + N) if ys[j % N] is not None)
            u = (i - a_) / (b_ - a_); ys[i] = ys[a_ % N] * (1 - u) + ys[b_ % N] * u + G['flight'] * 4 * u * (1 - u)
    if name == 'joy':
        ys = [ys[i] + hop(i / N, MO['joy']) for i in range(N)]
    act = bpy.data.actions.new(name); rig.animation_data.action = act
    rec = dict(sole=[], ang=[], slip=[], stats=[])
    prevA = None
    for i in range(N + 1):
        p, tg, st = frames[i % N]; p = dict(p); p['y'] = ys[i % N]
        apply_pose(rig, p, AD); legs(tg); key_all(rig, i + 1)
        if i == N: continue
        P = M.posed(); s_ = M.stats(P, STAND); s_['overlap'] = {k: v for k, v in s_['overlap'].items() if v}
        rec['stats'].append(s_); so = M.sole(P); rec['sole'].append([round(so['L'] * 1000, 2), round(so['R'] * 1000, 2)])
        # 関節の角度（腰に対する股の前後・ひざの曲がり）
        hz = PB['hips'].matrix.to_3x3(); ang = {}
        for s in 'LR':
            th = (PB['thigh' + s].tail - PB['thigh' + s].head).normalized(); sh = (PB['shin' + s].tail - PB['shin' + s].head).normalized()
            tl = hz.inverted() @ th; tl0 = (PB['hips'].bone.matrix_local.to_3x3().inverted() @ (REST[s]['K'] - REST[s]['H'])).normalized()
            ang['thigh' + s] = round(math.degrees(math.atan2(-tl.y, -tl.z) - math.atan2(-tl0.y, -tl0.z)), 1)
            ang['knee' + s] = round(math.degrees(th.angle(sh)), 1)
        rec['ang'].append(ang)
        A_ = {s: PB['foot' + s].head.copy() for s in 'LR'}
        if prevA is not None:
            rec['slip'].append({s: round((A_[s].y - prevA[s].y) * 1000, 2) for s in 'LR' if frames[i % N][2][s] and frames[(i - 1) % N][2][s]})
        prevA = A_
    act.use_fake_user = True; rig.animation_data.action = None
    STAT[name] = rec
# 数字のまとめ
SUM = {}
for name, rec in STAT.items():
    st = rec['stats']; so = np.array(rec['sole']); ang = rec['ang']
    stance_sole = []
    for i, (p, tg, stn) in enumerate([ACTS[name][1](k / ACTS[name][0]) for k in range(ACTS[name][0])]):
        for j, s in enumerate('LR'):
            if stn[s] and not (name == 'joy' and MO['joy']['air'][0] <= i / ACTS[name][0] < MO['joy']['air'][1]): stance_sole.append(so[i, j])
    sl = [v for d in rec['slip'] for v in d.values()]
    SUM[name] = dict(stretch_max=max(s['stretch_max'] for s in st), shrink_min=min(s['shrink_min'] for s in st), folds_max=max(s['folds'] for s in st),
                     overlap_frames=sum(1 for s in st if s['overlap']), tail_join=[min(s['tail_join'][0] for s in st), max(s['tail_join'][1] for s in st)],
                     sole_mm=[round(float(so.min()), 2), round(float(so.max()), 2)], stance_sole_mm=[round(float(min(stance_sole)), 2), round(float(max(stance_sole)), 2)],
                     slip_mm_per_frame=[round(min(sl), 2), round(max(sl), 2)] if sl else None,
                     thigh=[min(min(a['thighL'], a['thighR']) for a in ang), max(max(a['thighL'], a['thighR']) for a in ang)],
                     knee_max=max(max(a['kneeL'], a['kneeR']) for a in ang))
LOG['summary'] = SUM; LOG['frames'] = {n: dict(sole=r['sole'], ang=r['ang'], stats=r['stats']) for n, r in STAT.items()}
for n in ('walk', 'run'):
    G = MO[n]; LOG[n + '_speed'] = dict(stride_per_cycle=round(G['stride'] / G['duty'], 4), speed_per_s=round(G['stride'] / G['duty'] / (G['frames'] / 30), 4))
# 1 周のつなぎ目: コマ 1 と 最後のコマの骨の差（0 のはず）
JD = {}
for a in bpy.data.actions:
    if a.name not in ACTS: continue
    N = ACTS[a.name][0]; mx = 0.0
    for fc in a.fcurves: mx = max(mx, abs(fc.evaluate(1) - fc.evaluate(N + 1)))
    JD[a.name] = round(mx, 6)
LOG['loop_diff'] = JD
reset(rig); bpy.context.scene.frame_start = 1; bpy.context.scene.frame_set(1)
save('stage5.blend')
out = wpath('avatar.glb'); export(out)
tris = len(M.TRI)
LOG['export'] = dict(bytes=os.path.getsize(out), tris=tris, bones=len(rig.data.bones), actions=[a.name for a in bpy.data.actions])
dump(LOG, wpath('stage5-log.json'))
print('STAGE5', json.dumps(dict(summary=SUM, loop=JD, export=LOG['export'], speed={n: LOG[n + '_speed'] for n in ('walk', 'run')}), ensure_ascii=False))

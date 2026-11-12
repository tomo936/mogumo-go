# S1 点検用: boy-b-skin.glb の形を数える（閉じているか・面の向き・切り口・重み）。読むだけ。
# 実行: blender -b -P review-probe.py -- <glb>
import bpy, sys, numpy as np
from collections import Counter
src = sys.argv[sys.argv.index('--') + 1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
for o in bpy.data.objects:
    if o.type != 'MESH':
        continue
    me = o.data
    n = len(me.vertices)
    co = np.array([v.co[:] for v in me.vertices])  # Blender の Z が上
    gn = {g.index: g.name for g in o.vertex_groups}
    W = {}
    for v in me.vertices:
        d = {gn[g.group]: g.weight for g in v.groups if g.weight > 0}
        W[v.index] = d
    arm = np.array([sum(w for k, w in W[i].items() if 'arm' in k) > 0.5 for i in range(n)])
    # 同じ位置・同じ側（うで／体）の点を 1 つにまとめる（UV の継ぎ目は数えない）
    key = {}
    weld = np.zeros(n, int)
    for i in range(n):
        k = (tuple(np.round(co[i], 5)), bool(arm[i]))
        weld[i] = key.setdefault(k, len(key))
    ec = Counter()
    for p in me.polygons:
        vs = [weld[i] for i in p.vertices]
        for a, b in zip(vs, vs[1:] + vs[:1]):
            ec[(min(a, b), max(a, b))] += 1
    hist = Counter(ec.values())
    print(f'== {o.name}: verts {n} welded {len(key)} faces {len(me.polygons)} edges-by-use {dict(hist)}')
    # 向きの一致: 辺を共有する 2 面が同じ向きに回っていれば、裏返しの面がある
    dirs = Counter()
    for p in me.polygons:
        vs = [weld[i] for i in p.vertices]
        for a, b in zip(vs, vs[1:] + vs[:1]):
            dirs[(a, b)] += 1
    flipped = sum(1 for (a, b), c in dirs.items() if c > 1 or (dirs.get((a, b), 0) and dirs.get((b, a), 0) == 0 and ec[(min(a, b), max(a, b))] == 2))
    print('  inconsistent-orientation edges', flipped)
    # 穴（境目の辺）がどこにあるか
    bnd = [e for e, c in ec.items() if c == 1]
    wco = np.zeros((len(key), 3)); warm = np.zeros(len(key), bool)
    for i in range(n):
        wco[weld[i]] = co[i]; warm[weld[i]] |= arm[i]
    if bnd:
        pts = np.array([wco[a] for a, b in bnd])
        print('  boundary edges', len(bnd), 'on arm', int(sum(warm[a] for a, b in bnd)))
        for lo, hi in ((0, .15), (.15, .3), (.3, .45), (.45, .6), (.6, 1.2)):
            m = (pts[:, 2] >= lo) & (pts[:, 2] < hi)
            print(f'    z {lo:.2f}-{hi:.2f}: {m.sum()}  |x|>0.13: {(m & (abs(pts[:,0])>0.13)).sum()}')
    # 切り口の面（x = ±0.142 の平面上）
    cap = [p for p in me.polygons if all(abs(abs(co[i][0]) - 0.142) < 3e-4 for i in p.vertices)]
    if cap:
        out = sum(1 for p in cap if np.sign(p.normal.x) == np.sign(co[p.vertices[0]][0]) and not arm[p.vertices[0]])
        ins = sum(1 for p in cap if np.sign(p.normal.x) != np.sign(co[p.vertices[0]][0]) and arm[p.vertices[0]])
        area = sum(p.area for p in cap)
        print(f'  cap faces {len(cap)} (body cap facing out {out}, arm cap facing in {ins}) area {area*1e4:.1f} cm2(model units*1e4)')
        print('  cap z range', round(min(co[i][2] for p in cap for i in p.vertices), 3), round(max(co[i][2] for p in cap for i in p.vertices), 3))
    # 重み: うでの点がいくつの骨に付いているか、うでの骨 100% の点の割合
    nb = Counter(len(W[i]) for i in range(n))
    print('  bones per vertex', dict(sorted(nb.items())))
    hard = sum(1 for i in range(n) if arm[i] and max(W[i].values(), default=0) > 0.99)
    print('  arm verts', int(arm.sum()), 'single-bone(>0.99)', hard)
    # 肩の上の点: うでの骨の付け根 (±0.135, z 0.49) より上でうでに付いている点
    sh = arm & (co[:, 2] > 0.49)
    print('  arm verts above shoulder pivot z>0.49:', int(sh.sum()), 'max z', round(co[arm, 2].max(), 3))
    print('  bbox', np.round(co.min(0), 3), np.round(co.max(0), 3))

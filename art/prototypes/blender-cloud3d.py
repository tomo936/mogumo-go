# 平らな雲の絵（3種）から、ぷっくりした 3D の雲を作る。
# 絵の白い部分の形を読み取り、その中に大小の玉（メタボール）を詰めて膨らませ、下を平らに切る。
# 色は白、下へ向かってうすい水色（頂点の色）。
# 実行: blender -b -P cloud3d.py -- <image> <out_dir>
import bpy, bmesh, math, sys, os
import numpy as np
from mathutils import Vector

args = sys.argv[sys.argv.index('--') + 1:]
src, out = args[0], args[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

img = bpy.data.images.load(src)
w, h = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1]  # 上が y=0
bg = np.array([0.53, 0.78, 0.94])  # 背景の水色
diff = np.abs(px[:, :, :3] - bg).sum(axis=2)
mask = (diff > 0.35) & (px[:, :, :3].mean(axis=2) > 0.75)
mask[int(h * 0.88):] = False  # 下の文字を除く

def clouds_from_mask():
    cols = mask.any(axis=0); res = []; x = 0
    while x < w:
        if cols[x]:
            x0 = x
            while x < w and cols[x]: x += 1
            if x - x0 > 40: res.append((x0, x))
        x += 1
    return res

def build(mk, name):
    ys, xs = np.nonzero(mk)
    top, bot = ys.min(), ys.max(); left, right = xs.min(), xs.max()
    width = right - left
    S = 2.0 / width  # 幅を 2 単位にそろえる
    # 輪郭の点
    edge = mk & ~(np.roll(mk, 1, 0) & np.roll(mk, -1, 0) & np.roll(mk, 1, 1) & np.roll(mk, -1, 1))
    ey, ex = np.nonzero(edge)
    E = np.stack([ex, ey], 1).astype(np.float32)
    # 中の点に玉を置く: 輪郭までの距離＝半径。大きい玉から順に、すでに覆われた所は飛ばす
    gy, gx = np.mgrid[top:bot:6, left:right:6]
    pts = [(x, y) for x, y in zip(gx.ravel(), gy.ravel()) if mk[y, x]]
    cand = []
    for x, y in pts:
        d = np.sqrt(((E - (x, y)) ** 2).sum(1)).min()
        cand.append((d, x, y))
    cand.sort(reverse=True)
    balls = []
    for d, x, y in cand:
        if d < 8: continue
        if any((x - bx) ** 2 + (y - by) ** 2 < (0.55 * br) ** 2 for br, bx, by in balls): continue
        balls.append((d, x, y))
        if len(balls) > 90: break
    mb = bpy.data.metaballs.new(name); mb.resolution = 0.03; mb.render_resolution = 0.03; mb.threshold = 0.6
    obj = bpy.data.objects.new(name, mb); bpy.context.collection.objects.link(obj)
    import random; rr = random.Random(len(balls))
    for d, x, y in balls:
        # 奥行きにも玉を並べて、どの向きから見ても丸い雲にする（大きい玉ほど奥行きも厚い）
        for oy in (-0.55, 0.0, 0.55):
            r = d * S * (1.2 if oy == 0 else 0.95)
            e = mb.elements.new(); e.co = ((x - (left + right) / 2) * S + rr.uniform(-0.02, 0.02), oy * d * S * 1.4, (bot - y) * S - (0.0 if oy == 0 else d * S * 0.15))
            e.radius = r
    bpy.context.view_layer.objects.active = obj; obj.select_set(True)
    bpy.ops.object.convert(target='MESH')
    o = bpy.context.object; o.name = name
    # 下を平らに切る
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0.02), plane_no=(0, 0, -1), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if e.is_boundary])
    bmesh.ops.translate(bm, verts=bm.verts, vec=(0, 0, -0.02))
    # 頂点の色: 上は白、下 25% で水色へ
    zs = [v.co.z for v in bm.verts]; zmax = max(zs)
    cl = bm.loops.layers.color.new('Col')
    for f in bm.faces:
        for l in f.loops:
            t = min(1, l.vert.co.z / (zmax * 0.32))
            c = (0.8 + 0.2 * t, 0.9 + 0.1 * t, 0.985 + 0.015 * t)
            l[cl] = (c[0] ** 2.2, c[1] ** 2.2, c[2] ** 2.2, 1)
    bm.to_mesh(o.data); bm.free()
    for p in o.data.polygons: p.use_smooth = True
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree
    b = nt.nodes['Principled BSDF']; vc = nt.nodes.new('ShaderNodeVertexColor'); vc.layer_name = 'Col'
    nt.links.new(vc.outputs['Color'], b.inputs['Base Color']); b.inputs['Roughness'].default_value = 0.95
    o.data.materials.append(m)
    sm = o.modifiers.new('sm', 'SMOOTH'); sm.factor = 0.8; sm.iterations = 6
    dec = o.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.22
    return o

made = []
for i, (x0, x1) in enumerate(clouds_from_mask()):
    mk = np.zeros_like(mask); mk[:, x0:x1] = mask[:, x0:x1]
    o = build(mk, f'cloud{i + 1}'); o.location.x = (i - 1) * 2.6; made.append(o)

# 確認用の絵
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.25, 0.55, 0.85, 1)
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(45), 0, math.radians(-30))); bpy.context.object.data.energy = 2.5
bpy.ops.object.camera_add(location=(0, -9, 4.5)); cam = bpy.context.object; cam.location = (3, -8, 5.5); scene.camera = cam
cam.rotation_euler = (Vector((0, 0, 0.5)) - cam.location).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 50
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1200, 500
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = os.path.join(out, 'clouds3d.png'); bpy.ops.render.render(write_still=True)
for o in made:
    for x in bpy.data.objects: x.select_set(x == o)
    loc = o.location.copy(); o.location = (0, 0, 0)
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{o.name}.glb'), use_selection=True, export_apply=True)
    o.location = loc
dg = bpy.context.evaluated_depsgraph_get()
print('TRIS', [len(o.evaluated_get(dg).data.loop_triangles) for o in made])
print('DONE')

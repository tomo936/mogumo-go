# AI が作った 3D（色の絵つき）を「形をなめらかに → 色を少ない色に塗り直す（絵は使わない）」に直す試作。
# 使い方: blender -b -P repaint.py -- in.glb out.glb
import bpy, sys, bmesh
import numpy as np
from mathutils import Vector

src, dst = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
bpy.ops.object.select_all(action='DESELECT')
for o in objs:
    o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
if len(objs) > 1:
    bpy.ops.object.join()
o = bpy.context.object
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
me = o.data
print('faces', len(me.polygons), 'verts', len(me.vertices))

# 高さ 1・足元を原点に
co = np.array([v.co[:] for v in me.vertices])
mn, mx = co.min(0), co.max(0)
s = 1 / (mx[2] - mn[2])
c = (mn + mx) / 2
for v in me.vertices:
    v.co = Vector(((v.co.x - c[0]) * s, (v.co.y - c[1]) * s, (v.co.z - mn[2]) * s))

# 絵の色を点ごとに読む
img = next(i for i in bpy.data.images if i.size[0] > 0)
W, H = img.size
px = np.array(img.pixels[:], dtype=np.float32).reshape(H, W, 4)[:, :, :3]
uv = me.uv_layers.active.data
nv = len(me.vertices)
acc = np.zeros((nv, 3))
cnt = np.zeros(nv)
for l in me.loops:
    u, v = uv[l.index].uv
    acc[l.vertex_index] += px[min(H - 1, int((v % 1) * H)), min(W - 1, int((u % 1) * W))]
    cnt[l.vertex_index] += 1
col = acc / np.maximum(cnt, 1)[:, None]

# となりの点（つなぎ目で分かれた点も、同じ場所なら仲間にする）
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
bm.verts.ensure_lookup_table()
print('merged verts', len(bm.verts))
# 結合で点の番号が変わるので、場所で色を引き直す
from mathutils import kdtree
kd = kdtree.KDTree(nv)
for i, v in enumerate(me.vertices):
    kd.insert(v.co, i)
kd.balance()
col = np.array([np.mean([col[i] for (_, i, _) in kd.find_range(v.co, 1e-4)] or [col[kd.find(v.co)[1]]], axis=0) for v in bm.verts])
nb = [[e.other_vert(v).index for e in v.link_edges] for v in bm.verts]
# 形をなめらかに
for _ in range(6):
    bmesh.ops.smooth_vert(bm, verts=bm.verts, factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
# 色をならす
for _ in range(4):
    col = np.array([(col[i] + col[n].mean(0)) / 2 if n else col[i] for i, n in enumerate(nb)])
# 少ない色にまとめる（k-means）
K = 9
rng = np.random.default_rng(1)
cent = col[rng.choice(len(col), K, replace=False)]
for _ in range(25):
    lab = ((col[:, None, :] - cent[None]) ** 2).sum(2).argmin(1)
    cent = np.array([col[lab == k].mean(0) if (lab == k).any() else cent[k] for k in range(K)])
# まわりの多数決で、色の境目のごま塩を消す
for _ in range(6):
    new = lab.copy()
    for i, n in enumerate(nb):
        if n:
            b = np.bincount(lab[n], minlength=K)
            if b.max() > len(n) / 2:
                new[i] = b.argmax()
    lab = new
print('palette', [''.join('%02x' % int(255 * (x ** (1 / 2.2))) for x in c3) for c3 in cent])
bm.to_mesh(me)
bm.free()
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for i in range(len(me.vertices)):
    ca.data[i].color = (*cent[lab[i]], 1.0)
for p in me.polygons:
    p.use_smooth = True
me.materials.clear()
mat = bpy.data.materials.new('paint')
mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.9
vc = mat.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
mat.node_tree.links.new(vc.outputs['Color'], b.inputs['Base Color'])
me.materials.append(mat)
while me.uv_layers:
    me.uv_layers.remove(me.uv_layers[0])
print('out faces', len(me.polygons))
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True, export_normals=True, export_texcoords=False, export_vertex_color='ACTIVE')
print('saved', dst)

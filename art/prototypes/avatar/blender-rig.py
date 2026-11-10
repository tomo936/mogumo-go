# 1 つながりの 3D（AI が作った形）に、本物の骨組みを入れて、重みを自動で付ける（試作）。
# 使い方: blender -b -P blender-rig.py -- in.glb out.glb [voxel の大きさ] [三角形の目安]
# 入力は高さ 1・足元が原点・Blender の -Y が正面にそろえる（この台本の中でそろえる）。色は入力の「点の色」を近い点から写す。
import bpy, sys, bmesh
import numpy as np
from mathutils import Vector, kdtree

args = sys.argv[sys.argv.index('--') + 1:]
src, dst = args[0], args[1]
VOX = float(args[2]) if len(args) > 2 else 0.008
TARGET = int(args[3]) if len(args) > 3 else 24000
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
co = np.array([v.co[:] for v in me.vertices])
mn, mx = co.min(0), co.max(0)
s = 1 / (mx[2] - mn[2])
c = (mn + mx) / 2
for v in me.vertices:
    v.co = Vector(((v.co.x - c[0]) * s, (v.co.y - c[1]) * s, (v.co.z - mn[2]) * s))

# 元の色（点の色）を覚える
src_col = None
if me.color_attributes:
    ca = me.color_attributes[0]
    if ca.domain == 'POINT':
        src_col = [tuple(d.color) for d in ca.data]
    else:
        src_col = [None] * len(me.vertices)
        for l in me.loops:
            src_col[l.vertex_index] = tuple(ca.data[l.index].color)
kd = kdtree.KDTree(len(me.vertices))
for i, v in enumerate(me.vertices):
    kd.insert(v.co, i)
kd.balance()

# 面を作り直して（すき間・重なりの無い 1 枚の皮にする）、なめらかにして、軽くする
m = o.modifiers.new('r', 'REMESH')
m.mode = 'VOXEL'
m.voxel_size = VOX
bpy.ops.object.modifier_apply(modifier='r')
bm = bmesh.new()
bm.from_mesh(me)
bm.verts.ensure_lookup_table()
seen = set()
islands = []
for v in bm.verts:
    if v.index in seen:
        continue
    stack, isl = [v], []
    seen.add(v.index)
    while stack:
        w = stack.pop()
        isl.append(w)
        for e in w.link_edges:
            u = e.other_vert(w)
            if u.index not in seen:
                seen.add(u.index)
                stack.append(u)
    islands.append(isl)
islands.sort(key=len, reverse=True)
print('islands', [len(i) for i in islands[:6]])
bmesh.ops.delete(bm, geom=[v for isl in islands[1:] for v in isl], context='VERTS')
bm.to_mesh(me)
bm.free()
m = o.modifiers.new('s', 'SMOOTH')
m.factor = 0.5
m.iterations = 4
bpy.ops.object.modifier_apply(modifier='s')
n0 = len(me.polygons)
m = o.modifiers.new('d', 'DECIMATE')
m.ratio = min(1.0, TARGET / max(1, sum(len(p.vertices) - 2 for p in me.polygons)))
bpy.ops.object.modifier_apply(modifier='d')
print('remesh polys', n0, '-> tris', sum(len(p.vertices) - 2 for p in me.polygons), 'verts', len(me.vertices))
for p in me.polygons:
    p.use_smooth = True
while me.color_attributes:
    me.color_attributes.remove(me.color_attributes[0])
col = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
for i, v in enumerate(me.vertices):
    col.data[i].color = src_col[kd.find(v.co)[1]] if src_col else (0.8, 0.8, 0.8, 1)
me.materials.clear()
mat = bpy.data.materials.new('paint')
mat.use_nodes = True
b = mat.node_tree.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.9
vc = mat.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
mat.node_tree.links.new(vc.outputs['Color'], b.inputs['Base Color'])
me.materials.append(mat)

# 骨組み。位置は体の決まった高さ（高さ 1 に対する割合）と、その高さでの体の幅から決める
V = np.array([v.co[:] for v in me.vertices])
def span(z0, z1, xmin=None, xmax=None):
    q = V[(V[:, 2] >= z0) & (V[:, 2] <= z1)]
    if xmin is not None:
        q = q[(q[:, 0] >= xmin) & (q[:, 0] <= xmax)]
    return q
HIP, WAIST, NECK = 0.25, 0.36, 0.50
legs = span(0.05, 0.15)
legx = float(np.abs(legs[:, 0]).mean()) if len(legs) else 0.07
legy = float(legs[:, 1].mean()) if len(legs) else 0.0
torso = span(HIP, NECK, -0.12, 0.12)
ty = float(torso[:, 1].mean())
sh = span(0.40, 0.48)
shx = float(np.percentile(np.abs(sh[:, 0]), 80))
hands = span(0.20, 0.30)
hx = float(np.percentile(np.abs(hands[:, 0]), 97))
print('leg x', round(legx, 3), 'shoulder x', round(shx, 3), 'hand x', round(hx, 3), 'torso y', round(ty, 3))
bones = {
    'hips': ((0, ty, HIP), (0, ty, WAIST), None),
    'chest': ((0, ty, WAIST), (0, ty, NECK), 'hips'),
    'head': ((0, ty, NECK), (0, ty, 0.95), 'chest'),
}
for sgn, n in ((1, 'L'), (-1, 'R')):
    bones['upperarm' + n] = ((sgn * shx * 0.75, ty, 0.46), (sgn * (shx * 0.75 + hx) / 2, ty, 0.37), 'chest')
    bones['forearm' + n] = ((sgn * (shx * 0.75 + hx) / 2, ty, 0.37), (sgn * hx * 0.95, ty, 0.26), 'upperarm' + n)
    bones['thigh' + n] = ((sgn * legx, legy, HIP), (sgn * legx, legy, 0.14), 'hips')
    bones['shin' + n] = ((sgn * legx, legy, 0.14), (sgn * legx, legy, 0.02), 'thigh' + n)
arm = bpy.data.armatures.new('rig')
ao = bpy.data.objects.new('rig', arm)
bpy.context.collection.objects.link(ao)
bpy.context.view_layer.objects.active = ao
bpy.ops.object.mode_set(mode='EDIT')
for name, (h, t, parent) in bones.items():
    eb = arm.edit_bones.new(name)
    eb.head, eb.tail = h, t
    if parent:
        eb.parent = arm.edit_bones[parent]
bpy.ops.object.mode_set(mode='OBJECT')
def auto_weights():
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    ao.select_set(True)
    bpy.context.view_layer.objects.active = ao
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    return sum(1 for v in me.vertices if not v.groups)

for ob in (o, ao):
    ob.scale = (10, 10, 10)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
unw = auto_weights()
print('auto weights: unweighted verts', unw, 'of', len(me.vertices))
METHOD = 'bone heat'
if unw > len(me.vertices) * 0.2:
    # 代わりの方法: 骨までの距離で重みを付ける（うで・あし・体は場所で分ける）
    METHOD = 'distance'
    for g in list(o.vertex_groups):
        o.vertex_groups.remove(g)
    if not o.modifiers.get('Armature'):
        mod = o.modifiers.new('Armature', 'ARMATURE')
        mod.object = ao
        o.parent = ao
    segs = {n: (Vector(h) * 10, Vector(t) * 10) for n, (h, t, _) in bones.items()}
    for n in segs:
        o.vertex_groups.new(name=n)
    def dist(p, a, b):
        ab = b - a
        t = max(0.0, min(1.0, (p - a).dot(ab) / ab.length_squared))
        return (p - (a + ab * t)).length
    armx = shx * 0.86 * 10
    for v in me.vertices:
        p = v.co
        side = 'L' if p.x > 0 else 'R'
        if p.z < HIP * 10:
            cand = ['hips', 'thigh' + side, 'shin' + side]
        elif abs(p.x) > armx and p.z < 0.5 * 10:
            cand = ['upperarm' + side, 'forearm' + side, 'chest']
        else:
            cand = ['hips', 'chest', 'head', 'upperarm' + side]
        w = {n: 1 / (dist(p, *segs[n]) + 0.05) ** 4 for n in cand}
        tot = sum(w.values())
        for n, x in w.items():
            if x / tot > 0.02:
                o.vertex_groups[n].add([v.index], x / tot, 'REPLACE')
print('weights by', METHOD)
ao.scale = (0.1, 0.1, 0.1)  # 骨組み（親）ごと 10 分の 1 に戻す。形は骨組みの子なので一緒に戻る
groups = {g.index: g.name for g in o.vertex_groups}
# 首より上（頭・髪）は頭の骨だけに付ける（髪がゆがまないように）。重みの無い点は近い骨へ
hg = o.vertex_groups['head']
for v in me.vertices:
    if v.co.z > (NECK + 0.03) * 10:
        for g in list(v.groups):
            o.vertex_groups[g.group].remove([v.index])
        hg.add([v.index], 1.0, 'REPLACE')
    elif not v.groups:
        o.vertex_groups['chest'].add([v.index], 1.0, 'REPLACE')
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=False, export_normals=True, export_texcoords=False,
                          export_vertex_color='ACTIVE', export_skins=True, export_animations=False, export_yup=True)
print('saved', dst)

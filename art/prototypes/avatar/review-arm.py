# S1 点検用: うでを前後に振ったとき、体側の切り口（平らな面）がどれだけ見えるか測り、横からの絵を出す。読むだけ（模型は書き換えない）。
# 実行: blender -b -P review-arm.py -- <glb> <out.png>
import bpy, sys, math, numpy as np
from mathutils import Matrix, Vector
a = sys.argv[sys.argv.index('--') + 1:]
src, out = a[0], a[1]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
av = bpy.data.objects['avatar']
me = av.data
co = np.array([v.co[:] for v in me.vertices])
gn = {g.index: g.name for g in av.vertex_groups}
arm = np.array([sum(g.weight for g in v.groups if 'arm' in gn[g.group]) > 0.5 for v in me.vertices])
capf = [p for p in me.polygons if all(abs(abs(co[i][0]) - 0.142) < 3e-4 for i in p.vertices) and co[p.vertices[0]][0] > 0]
body_cap = [p for p in capf if not arm[p.vertices[0]]]
arm_cap = [p for p in capf if arm[p.vertices[0]]]
print('L caps body', len(body_cap), 'arm', len(arm_cap), 'body cap area', round(sum(p.area for p in body_cap), 5))

def pose(theta, elbow):
    bpy.context.view_layer.objects.active = rig
    bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones:
        pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()
    for name, ang in (('upperarmL', theta), ('forearmL', elbow)):
        pb = rig.pose.bones[name]
        h = pb.head.copy()
        pb.matrix = Matrix.Translation(h) @ Matrix.Rotation(ang, 4, 'X') @ Matrix.Translation(-h) @ pb.matrix
        bpy.context.view_layer.update()
    bpy.ops.object.mode_set(mode='OBJECT')

def exposed(theta, elbow):
    pose(theta, elbow)
    dg = bpy.context.evaluated_depsgraph_get()
    ev = av.evaluated_get(dg)
    dco = np.array([v.co[:] for v in ev.data.vertices])
    tris = [dco[list(p.vertices)][:, 1:] for p in arm_cap for _ in [0]]
    tri3 = []
    for p in arm_cap:
        vs = list(p.vertices)
        for k in range(1, len(vs) - 1):
            tri3.append(dco[[vs[0], vs[k], vs[k + 1]]][:, 1:])
    T = np.array(tri3)
    tot = cov = 0.0
    for p in body_cap:
        c = co[list(p.vertices)].mean(0)[1:]
        A, B, C = T[:, 0], T[:, 1], T[:, 2]
        def cr(P, Q, R):
            return (Q[..., 0] - P[..., 0]) * (R[..., 1] - P[..., 1]) - (Q[..., 1] - P[..., 1]) * (R[..., 0] - P[..., 0])
        d1, d2, d3 = cr(A, B, c), cr(B, C, c), cr(C, A, c)
        inside = ((d1 >= 0) & (d2 >= 0) & (d3 >= 0)) | ((d1 <= 0) & (d2 <= 0) & (d3 <= 0))
        tot += p.area
        cov += p.area * inside.any()
    return 1 - cov / tot

for lab, th, el in (('rest', 0, 0.15), ('walk max 0.45rad', 0.45, 0.35), ('run max 0.65rad', 0.648, 1.2), ('run back', -0.648, 1.2)):
    print(f'{lab}: body cut face exposed {exposed(th, el)*100:.0f}%')

# 絵: 横から、切り口を赤で。左 = 立ち、右 = 走りの最大の振り
mat = bpy.data.materials.new('cap'); mat.diffuse_color = (1, 0.1, 0.1, 1)
base = bpy.data.materials.new('base'); base.diffuse_color = (0.85, 0.85, 0.85, 1)
me.materials.clear(); me.materials.append(base); me.materials.append(mat)
for p in me.polygons:
    p.material_index = 1 if all(abs(abs(co[i][0]) - 0.142) < 3e-4 for i in p.vertices) else 0
for o in bpy.data.objects:
    if o.type == 'MESH' and o != av:
        o.hide_render = True
sc = bpy.context.scene
sc.render.engine = 'BLENDER_WORKBENCH'
sc.display.shading.color_type = 'MATERIAL'
sc.display.shading.show_backface_culling = True
sc.render.resolution_x, sc.render.resolution_y = 360, 420
cam = bpy.data.cameras.new('c'); cam.type = 'ORTHO'; cam.ortho_scale = 0.75
co_ = bpy.data.objects.new('c', cam); sc.collection.objects.link(co_); sc.camera = co_
co_.location = (2, 0, 0.42); co_.rotation_euler = (math.pi / 2, 0, math.pi / 2)
import os
tmp = []
for i, (th, el) in enumerate(((0, 0.15), (0.45, 0.35), (0.648, 1.2), (-0.648, 1.2))):
    pose(th, el)
    sc.render.filepath = out + f'.{i}.png'; bpy.ops.render.render(write_still=True); tmp.append(sc.render.filepath)
print('frames', tmp)

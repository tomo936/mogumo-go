# 組み立て式のちびキャラ（試作）。丸い部品を並べて、色は頂点の色（絵の貼り付けなし）で塗る。
# 使い方: blender -b -P build_chibi.py -- boy|girl out.glb
# 向き: Blender の -Y が正面（glTF では +Z が正面）。高さ 1.0、足元が原点。
import bpy, sys, math
from mathutils import Vector, Matrix, Euler

who, dst = sys.argv[sys.argv.index('--') + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)


def lin(c):
    c = c.lstrip('#')
    v = [int(c[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in v] + [1.0]


mat = bpy.data.materials.new('paint')
mat.use_nodes = True
bsdf = mat.node_tree.nodes['Principled BSDF']
bsdf.inputs['Roughness'].default_value = 0.9
bsdf.inputs['Metallic'].default_value = 0.0
vc = mat.node_tree.nodes.new('ShaderNodeVertexColor')
vc.layer_name = 'Col'
mat.node_tree.links.new(vc.outputs['Color'], bsdf.inputs['Base Color'])

face_mat = bpy.data.materials.new('face')
face_mat.use_nodes = True
face_mat.blend_method = 'BLEND'
fb = face_mat.node_tree.nodes['Principled BSDF']
fb.inputs['Roughness'].default_value = 0.9
img = bpy.data.images.new('face', 8, 8, alpha=True)
img.pixels = [1, 1, 1, 0] * 64
img.pack()
tex = face_mat.node_tree.nodes.new('ShaderNodeTexImage')
tex.image = img
face_mat.node_tree.links.new(tex.outputs['Color'], fb.inputs['Base Color'])
face_mat.node_tree.links.new(tex.outputs['Alpha'], fb.inputs['Alpha'])


def paint(o, color, m=mat):
    me = o.data
    ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
    c = lin(color)
    for d in ca.data:
        d.color = c
    me.materials.append(m)
    while me.uv_layers and m is mat:
        me.uv_layers.remove(me.uv_layers[0])
    for p in me.polygons:
        p.use_smooth = True
    return o


def active(o):
    bpy.ops.object.select_all(action='DESELECT')
    o.select_set(True)
    bpy.context.view_layer.objects.active = o


def bake(o):
    active(o)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return o


def ball(loc, scale, color, rot=(0, 0, 0), seg=20, rings=12):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    return paint(bake(o), color)


def soft_box(loc, size, color, rot=(0, 0, 0), level=2):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = (size[0] * 1.25, size[1] * 1.25, size[2] * 1.25)  # 丸めると縮むぶん少し大きく
    m = o.modifiers.new('s', 'SUBSURF')
    m.levels = level
    bpy.ops.object.modifier_apply(modifier='s')
    return paint(bake(o), color)


def cone(loc, r1, r2, depth, color, rot=(0, 0, 0), seg=20):
    bpy.ops.mesh.primitive_cone_add(vertices=seg, radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.bevel(offset=min(r1, r2, depth) * 0.25, segments=3)
    bpy.ops.object.mode_set(mode='OBJECT')
    return paint(bake(o), color)


def group(name, parts, pivot):
    active(parts[0])
    for p in parts:
        p.select_set(True)
    if len(parts) > 1:
        bpy.ops.object.join()
    o = bpy.context.object
    o.name = name
    o.data.transform(Matrix.Translation(-Vector(pivot)))
    o.location = pivot
    return o


def child(o, parent):
    w = o.location.copy()
    o.parent = parent
    o.location = w - parent.location if parent.parent is None else w - (parent.location + parent.parent.location)


SKIN = '#fbdcc6'
HAIR = '#7b4a2e'
PINK = '#f3a9c2'
if who == 'boy':
    TOP, BOTTOM, SHOE = '#7db3ec', '#6c98dc', '#5a7fd0'
else:
    TOP, BOTTOM, SHOE = '#f8ecd0', '#efe2cd', '#f4e4d2'

# ---- 体（腰が軸）----
body = [soft_box((0, 0, 0.42), (0.33, 0.24, 0.21), TOP)]
if who == 'boy':
    body.append(soft_box((0, 0, 0.285), (0.335, 0.245, 0.15), BOTTOM))
    body.append(ball((0, 0.10, 0.505), (0.15, 0.09, 0.06), TOP))  # フード
else:
    body.append(cone((0, 0, 0.275), 0.215, 0.14, 0.16, BOTTOM))  # スカート
    body.append(soft_box((0, -0.11, 0.42), (0.10, 0.04, 0.2), '#fff7ec'))  # 中の服
body.append(soft_box((0, 0.185, 0.39), (0.25, 0.13, 0.27), PINK))  # リュック
body.append(soft_box((0, 0.255, 0.34), (0.16, 0.04, 0.11), '#ec97b4'))  # リュックのポケット
body = group('body', body, (0, 0, 0.26))

# ---- 頭（首が軸）----
HZ = 0.715
head = [ball((0, 0, HZ), (0.27, 0.25, 0.245), SKIN, seg=28, rings=18)]
for s in (-1, 1):
    head.append(ball((s * 0.262, 0.02, HZ - 0.03), (0.045, 0.035, 0.055), SKIN, seg=12, rings=8))
# 髪: 頭より少し大きい殻。生えぎわより下の点を生えぎわの線まで引き上げて、前髪の形を作る
def hair_cap(teeth, amp, front_z, side_z, back_z):
    c = Vector((0, 0.012, HZ + 0.02))
    rad = Vector((0.292, 0.275, 0.262))
    bpy.ops.mesh.primitive_uv_sphere_add(segments=64, ring_count=28, radius=1, location=(0, 0, 0))
    o = bpy.context.object

    def line(phi):  # phi: 0 が正面、±π が真後ろ
        a = abs(phi)
        if a < 1.15:
            t = (phi + 1.15) / 2.3 * teeth
            saw = abs((t % 1) - 0.35) / 0.65 if (t % 1) > 0.35 else (0.35 - (t % 1)) / 0.35
            return front_z + amp * (saw - 0.5) + 0.03 * (a / 1.15) ** 2 * -1
        if a < 1.75:
            k = (a - 1.15) / 0.6
            k = k * k * (3 - 2 * k)
            return (front_z - 0.03) * (1 - k) + side_z * k
        k = min(1.0, (a - 1.75) / 0.5)
        k = k * k * (3 - 2 * k)
        return side_z * (1 - k) + back_z * k

    for v in o.data.vertices:
        phi = math.atan2(v.co.x, -v.co.y)
        z = c.z + rad.z * v.co.z
        zl = line(phi)
        if z < zl:
            z = zl
        nz = max(-1.0, min(1.0, (z - c.z) / rad.z))
        r = math.sqrt(max(0.0, 1 - nz * nz))
        v.co = Vector((c.x + rad.x * r * math.sin(phi), c.y - rad.y * r * math.cos(phi), z))
    active(o)
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.dissolve_degenerate(threshold=0.0005)
    bpy.ops.object.mode_set(mode='OBJECT')
    m = o.modifiers.new('t', 'SOLIDIFY')
    m.thickness = 0.022
    m.offset = 1
    bpy.ops.object.modifier_apply(modifier='t')
    return paint(o, HAIR)


if who == 'boy':
    head.append(hair_cap(5, 0.075, HZ + 0.075, HZ - 0.06, HZ - 0.17))
    for x, y, z, t in [(-0.11, -0.02, 0.265, 0.6), (0.02, 0.0, 0.285, -0.15), (0.14, 0.02, 0.25, -0.8), (-0.2, 0.05, 0.2, 1.0)]:  # てっぺんのはね
        head.append(ball((x, y, HZ + z), (0.035, 0.05, 0.06), HAIR, rot=(0.2, t, 0), seg=12, rings=8))
else:
    head.append(hair_cap(3, 0.04, HZ + 0.07, HZ - 0.1, HZ - 0.2))
    for s in (-1, 1):  # ふたつ結び ＋ いちご
        head.append(ball((s * 0.33, 0.04, HZ - 0.05), (0.08, 0.08, 0.16), HAIR, rot=(0, s * 0.3, 0), seg=14, rings=10))
        head.append(ball((s * 0.372, 0.04, HZ - 0.185), (0.055, 0.055, 0.075), HAIR, rot=(0, s * 0.75, 0), seg=12, rings=8))
        head.append(ball((s * 0.25, -0.05, HZ + 0.21), (0.052, 0.048, 0.06), '#ee4b4b', seg=12, rings=8))
        head.append(ball((s * 0.25, -0.05, HZ + 0.266), (0.042, 0.038, 0.013), '#6bbf59', seg=10, rings=6))
head = group('head', head, (0, 0, 0.5))

# ---- 顔（頭の前の面を少し浮かせた膜。絵はアプリ側で貼り替える）----
bpy.ops.mesh.primitive_uv_sphere_add(segments=28, ring_count=18, radius=1, location=(0, 0, HZ))
f = bpy.context.object
f.scale = (0.2735, 0.2535, 0.2485)
bake(f)
me = f.data
import bmesh
bm = bmesh.new()
bm.from_mesh(me)
bmesh.ops.delete(bm, geom=[p for p in bm.faces if p.normal.y > -0.25], context='FACES')
uv = bm.loops.layers.uv.verify()
for p in bm.faces:
    p.smooth = True
    for l in p.loops:
        l[uv].uv = ((l.vert.co.x + 0.21) / 0.42, (l.vert.co.z - (HZ - 0.03 - 0.21)) / 0.42)
bm.to_mesh(me)
bm.free()
me.materials.append(face_mat)
face = group('face', [f], (0, 0, 0.5))

# ---- 腕（肩が軸）・脚（股が軸）----
limbs = {}
for s, n in ((-1, 'R'), (1, 'L')):
    arm = [ball((s * 0.205, 0, 0.385), (0.058, 0.062, 0.115), TOP, rot=(0, -s * 0.22, 0), seg=14, rings=10),
           ball((s * 0.232, 0, 0.275), (0.045, 0.045, 0.045), SKIN, seg=12, rings=8)]
    limbs['arm' + n] = group('arm' + n, arm, (s * 0.175, 0, 0.47))
    leg = [ball((s * 0.082, 0, 0.14), (0.052, 0.055, 0.12), SKIN, seg=14, rings=10)]
    if who == 'girl':
        leg.append(ball((s * 0.082, 0, 0.085), (0.056, 0.058, 0.05), '#fbf3e4', seg=12, rings=8))  # くつ下
    leg.append(ball((s * 0.085, -0.025, 0.04), (0.066, 0.1, 0.042), SHOE, seg=14, rings=8))
    limbs['leg' + n] = group('leg' + n, leg, (s * 0.082, 0, 0.24))

bpy.ops.object.empty_add(location=(0, 0, 0))
root = bpy.context.object
root.name = 'avatar'
body.parent = root
for o in [head, face, *limbs.values()]:
    w = o.location.copy()
    o.parent = body
    o.location = w - body.location

bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=dst, export_format='GLB', export_apply=True, export_normals=True, export_texcoords=True,
                          export_vertex_color='ACTIVE', export_all_vertex_colors=False, export_yup=True, use_selection=False)
print('saved', dst)

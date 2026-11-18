# Blender で「かわいいラーメン屋」を組む試作。
# 実行: blender -b -P ramen.py -- <out_dir>
# ぷにっとした丸み（ベベル＋細分化）・明るい色・屋根の上の大きなどんぶりが要点
import bpy, bmesh, math, sys, os
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ── 道具 ─────────────────────────────────────
MATS = {}
LIGHT = (-0.45, -0.7, 0.75)  # 光の向き（手前左の上から）
def mat(name, color, rough=0.55, emit=0.0, emit_color=None):
    """イラスト調: 光の当たり方を2段にくっきり分け（影は少し青み）、すき間はやわらかく暗く。光の計算をせず色を直接出す"""
    if name in MATS: return MATS[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    outn = N('ShaderNodeOutputMaterial'); em = N('ShaderNodeEmission'); L(em.outputs[0], outn.inputs[0])
    base = srgb(color)
    if emit:
        em.inputs['Color'].default_value = (*srgb(emit_color or color), 1); em.inputs['Strength'].default_value = 1.0
        MATS[name] = m; return m
    geo = N('ShaderNodeNewGeometry'); dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
    l = math.sqrt(sum(c * c for c in LIGHT)); dot.inputs[1].default_value = tuple(c / l for c in LIGHT)
    L(geo.outputs['Normal'], dot.inputs[0])
    ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
    e = ramp.color_ramp.elements
    e[0].position = 0.0; e[0].color = (*[c * k for c, k in zip(base, (0.66, 0.70, 0.86))], 1)  # 影（青み）
    e[1].position = 0.28; e[1].color = (*base, 1)                                              # 光
    hi = e.new(0.82); hi.color = (*[min(1, c * 1.06 + 0.03) for c in base], 1)                  # うすいハイライト
    L(dot.outputs['Value'], ramp.inputs['Fac'])
    ao = N('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.35
    aor = N('ShaderNodeMapRange'); aor.inputs['To Min'].default_value = 0.72
    L(ao.outputs['AO'], aor.inputs['Value'])
    mul = N('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    L(ramp.outputs['Color'], mul.inputs[6])
    comb = N('ShaderNodeCombineColor'); [L(aor.outputs[0], comb.inputs[i]) for i in range(3)]
    L(comb.outputs[0], mul.inputs[7])
    L(mul.outputs[2], em.inputs['Color'])
    MATS[name] = m; return m

def srgb(hexstr):
    h = hexstr.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

def finish(obj, m, bevel=0.0, seg=3, subd=0, smooth=True, parent=None):
    obj.data.materials.clear(); obj.data.materials.append(m)
    if bevel:
        mod = obj.modifiers.new('bevel', 'BEVEL'); mod.width = bevel; mod.segments = seg; mod.limit_method = 'ANGLE'
    if subd:
        mod = obj.modifiers.new('subd', 'SUBSURF'); mod.levels = subd; mod.render_levels = subd
    if smooth:
        for p in obj.data.polygons: p.use_smooth = True
    if parent: obj.parent = parent
    return obj

def cube(name, size, loc, m, bevel=0.08, rot=(0, 0, 0), **kw):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel=bevel, **kw)

def cyl(name, r, depth, loc, m, rot=(0, 0, 0), verts=48, bevel=0.03, **kw):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = name
    return finish(o, m, bevel=bevel, **kw)

def sphere(name, r, loc, m, scale=(1, 1, 1), **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=32, ring_count=16)
    o = bpy.context.object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, **kw)

def lathe(name, profile, loc, m, steps=48, **kw):
    """profile: [(r, z), ...] を Z 軸まわりに回した形（どんぶり・ちょうちん）"""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    verts = [bm.verts.new((r, 0, z)) for r, z in profile]
    edges = [bm.edges.new((verts[i], verts[i + 1])) for i in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.location = loc
    return finish(o, m, **kw)

def text(name, body, size, loc, m, rot=(math.pi / 2, 0, 0), extrude=0.015):
    bpy.ops.object.text_add(location=loc, rotation=rot)
    o = bpy.context.object; o.name = name
    o.data.body = body; o.data.size = size; o.data.extrude = extrude
    o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'
    o.data.font = bpy.data.fonts.load('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc')
    o.data.materials.append(m)
    return o

# ── 色（明るい昼のグルメ・ポップ） ─────────────────
C = dict(
    grass=mat('grass', '#a6e6a1'), rim=mat('rim', '#fff3d6'),
    wall=mat('wall', '#fff0c9'), wood=mat('wood', '#c98c5e'), wood_d=mat('wood_d', '#9a6544'),
    roof=mat('roof', '#ff8a7a', 0.45), roof_d=mat('roof_d', '#f06a5c', 0.45),
    glass=mat('glass', '#fff2c2', 0.2, emit=1.2, emit_color='#ffd27a'),
    noren=mat('noren', '#4f7ee8', 0.8), white=mat('white', '#ffffff', 0.4),
    lantern=mat('lantern', '#ff4f45', 0.4, emit=0.6, emit_color='#ff7055'), black=mat('black', '#3a2b2b'),
    sign=mat('sign', '#fffaf0', 0.5), red=mat('red', '#e8392f', 0.5),
    soup=mat('soup', '#ffb648', 0.25), naruto=mat('naruto', '#ff7fa8', 0.4),
    yolk=mat('yolk', '#ffad1f', 0.3), egg=mat('egg', '#fffaf0', 0.3), chashu=mat('chashu', '#c7774c', 0.5),
    negi=mat('negi', '#62cf6e', 0.5), nori=mat('nori', '#2d3b38', 0.6), pot=mat('pot', '#ff9f6b'), leaf=mat('leaf', '#4fc46a'),
)

# ── 台座: 丸い芝生とクリームのふち ───────────────
cyl('base_rim', 1.9, 0.28, (0, 0, 0.14), C['rim'], bevel=0.1, seg=4)
cyl('base_grass', 1.72, 0.06, (0, 0, 0.29), C['grass'], bevel=0.03)
# ── 建物: ずんぐりした壁 ─────────────────────────
W, D, Hh = 2.0, 1.55, 1.42
z0 = 0.32
cube('wall', (W, D, Hh), (0, 0, z0 + Hh / 2), C['wall'], bevel=0.16, seg=5)
cube('skirt', (W + 0.06, D + 0.06, 0.22), (0, 0, z0 + 0.11), C['wood'], bevel=0.08, seg=4)
for x in (-W / 2 + 0.05, W / 2 - 0.05):  # 角の柱
    cube(f'post{x}', (0.14, 0.14, Hh), (x, -D / 2 + 0.05, z0 + Hh / 2), C['wood'], bevel=0.05)

# 屋根: 切妻を正面に向ける（三角の妻が手前）。厚く・丸く、前後に少しはみ出す
ry = z0 + Hh + 0.02
for side in (1, -1):
    cube(f'roof{side}', (1.3, D + 0.45, 0.24), (side * 0.52, 0, ry + 0.33), C['roof'], bevel=0.11, seg=5,
         rot=(0, side * 0.6, 0))
cyl('ridge', 0.16, D + 0.6, (0, 0, ry + 0.74), C['roof_d'], rot=(math.pi / 2, 0, 0), bevel=0.05)
for y in (-(D + 0.6) / 2, (D + 0.6) / 2):
    sphere(f'ridge_end{y}', 0.2, (0, y, ry + 0.74), C['roof_d'])
# 妻（三角の壁）を前後に
me = bpy.data.meshes.new('gable'); bm = bmesh.new()
for sy in (-1, 1):
    y = sy * (D / 2 - 0.04)
    v = [bm.verts.new((-W / 2 + 0.12, y, ry - 0.02)), bm.verts.new((W / 2 - 0.12, y, ry - 0.02)), bm.verts.new((0, y, ry + 0.62))]
    bm.faces.new(v if sy < 0 else v[::-1])
bm.to_mesh(me); bm.free()
g = bpy.data.objects.new('gable', me); bpy.context.collection.objects.link(g)
finish(g, C['wall'], smooth=False)
s = g.modifiers.new('solid', 'SOLIDIFY'); s.thickness = 0.12; s.offset = 0
# 妻の丸窓
cyl('gable_win_f', 0.15, 0.06, (0, -D / 2 - 0.08, ry + 0.25), C['wood'], rot=(math.pi / 2, 0, 0), bevel=0.02)
cyl('gable_win', 0.11, 0.07, (0, -D / 2 - 0.09, ry + 0.25), C['glass'], rot=(math.pi / 2, 0, 0), bevel=0.02)

# 入口: 木の枠・明るいガラス戸
fy = -D / 2 - 0.02
cube('door_frame', (0.86, 0.08, 0.86), (0, fy, z0 + 0.47), C['wood_d'], bevel=0.05)
cube('door', (0.72, 0.06, 0.74), (0, fy - 0.03, z0 + 0.43), C['glass'], bevel=0.04)
cube('door_bar', (0.04, 0.07, 0.74), (0, fy - 0.05, z0 + 0.43), C['wood_d'], bevel=0.01)
# しまのひさし（見本のお店のように）
for i in range(7):
    cube(f'awn{i}', (0.17, 0.42, 0.06), (-0.51 + i * 0.17, fy - 0.2, z0 + 0.98), C['red'] if i % 2 == 0 else C['white'], bevel=0.025, rot=(-0.5, 0, 0))
for i in range(7):
    sphere(f'awn_s{i}', 0.085, (-0.51 + i * 0.17, fy - 0.38, z0 + 0.86), C['red'] if i % 2 == 0 else C['white'], scale=(1, 0.5, 0.7))
# のれん（3枚・すそが丸い）＋白いどんぶりの印
cyl('noren_rod', 0.03, 0.95, (0, fy - 0.1, z0 + 0.92), C['wood_d'], rot=(0, math.pi / 2, 0), verts=16, bevel=0)
for i, x in enumerate((-0.3, 0, 0.3)):
    cube(f'noren{i}', (0.28, 0.03, 0.36), (x, fy - 0.1, z0 + 0.73), C['noren'], bevel=0.05, seg=4)
lathe('noren_bowl', [(0.0, 0.0), (0.06, 0.0), (0.09, 0.03), (0.1, 0.06), (0.0, 0.06)], (0, fy - 0.12, z0 + 0.72), C['white'], steps=24) \
    .rotation_euler = (math.pi / 2, 0, 0)
# 看板（丸い板＋赤い文字）
cube('sign', (1.15, 0.1, 0.36), (0, fy - 0.06, z0 + 1.2), C['sign'], bevel=0.12, seg=5)
cube('sign_edge', (1.22, 0.06, 0.43), (0, fy - 0.0, z0 + 1.2), C['red'], bevel=0.14, seg=5)
text('sign_text', 'ラーメン', 0.26, (0, fy - 0.125, z0 + 1.185), C['red'])
# 丸窓
for x in (-0.68, 0.68):
    cyl(f'win_frame{x}', 0.2, 0.06, (x, fy + 0.0, z0 + 0.62), C['white'], rot=(math.pi / 2, 0, 0), bevel=0.03)
    cyl(f'win{x}', 0.15, 0.07, (x, fy - 0.01, z0 + 0.62), C['glass'], rot=(math.pi / 2, 0, 0), bevel=0.02)
# 赤ちょうちん
for x in (-1.08, 1.08):
    lathe(f'lantern{x}', [(0.0, -0.22), (0.1, -0.2), (0.17, -0.1), (0.19, 0.0), (0.17, 0.1), (0.1, 0.2), (0.0, 0.22)],
          (x, fy - 0.12, z0 + 0.78), C['lantern'], subd=1)
    for dz in (-0.21, 0.21):
        cyl(f'lan_cap{x}{dz}', 0.09, 0.05, (x, fy - 0.12, z0 + 0.78 + dz), C['black'], verts=20, bevel=0.01)
# 植木鉢
for x in (-0.62, 0.62):
    cyl(f'pot{x}', 0.11, 0.16, (x * 1.0, fy - 0.35, 0.4), C['pot'], verts=24, bevel=0.03)
    sphere(f'bush{x}', 0.15, (x * 1.0, fy - 0.35, 0.56), C['leaf'], scale=(1, 1, 0.85))

# ── 屋根の上の大きなどんぶり ─────────────────────
bz = ry + 0.88
bowl_prof = [(0.0, 0.0), (0.22, 0.0), (0.24, 0.03), (0.36, 0.12), (0.47, 0.28), (0.52, 0.42), (0.5, 0.44), (0.44, 0.31), (0.32, 0.17), (0.0, 0.15)]
lathe('bowl', bowl_prof, (0, 0, bz), C['white'], subd=1)
lathe('bowl_band', [(0.505, 0.36), (0.525, 0.4), (0.53, 0.42), (0.505, 0.425)], (0, 0, bz), C['red'], subd=1)
cyl('soup', 0.47, 0.03, (0, 0, bz + 0.39), C['soup'], bevel=0.01)
cyl('naruto', 0.12, 0.04, (-0.2, 0.08, bz + 0.415), C['white'], verts=32, bevel=0.015)
bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.018, location=(-0.2, 0.08, bz + 0.437))
finish(bpy.context.object, C['naruto'])
sphere('egg', 0.12, (0.16, 0.12, bz + 0.415), C['egg'], scale=(1, 1.25, 0.45))
sphere('yolk', 0.065, (0.16, 0.12, bz + 0.44), C['yolk'], scale=(1, 1, 0.5))
cube('chashu', (0.3, 0.22, 0.04), (0.05, -0.2, bz + 0.415), C['chashu'], bevel=0.05, rot=(0, 0, 0.3))
cube('nori', (0.04, 0.26, 0.3), (-0.33, -0.15, bz + 0.5), C['nori'], bevel=0.015, rot=(0.25, -0.3, 0.4))
for i, (x, y) in enumerate([(-0.02, 0.24), (0.05, 0.28), (-0.08, 0.3), (0.3, -0.05)]):
    cyl(f'negi{i}', 0.03, 0.015, (x, y, bz + 0.41), C['negi'], verts=12, bevel=0.005)
for dy in (-0.04, 0.04):  # おはし
    cyl(f'hashi{dy}', 0.014, 0.95, (0.25, dy - 0.05, bz + 0.68), C['wood'], rot=(0.25, 0.75, 0), verts=10, bevel=0)

# ── 光とカメラ（地図を斜め55°から見る角度） ─────────
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#dff1ff'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 1.1
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), math.radians(10), math.radians(-35)))
sun = bpy.context.object; sun.data.energy = 3.2; sun.data.angle = math.radians(12); sun.data.color = srgb('#fff4e2')
cyl('ground', 60, 0.01, (0, 0, -0.005), mat('ground', '#f6f9f0'), bevel=0)
scene.render.use_freestyle = True
scene.render.line_thickness_mode = 'ABSOLUTE'; scene.render.line_thickness = 1.6
fs = bpy.context.view_layer.freestyle_settings
ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('lines')
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('line')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
ls.linestyle.color = srgb('#6b4a4a'); ls.linestyle.thickness = 1.6
bpy.data.objects['ground'].hide_render = False

yaw = math.radians(float(os.environ.get('YAW', '-30')))
pitch = math.radians(55)
dist = 12
target = Vector((0, 0, 1.15))
cam_loc = target + Vector((math.sin(yaw) * math.sin(pitch) * dist, -math.cos(yaw) * math.sin(pitch) * dist, math.cos(pitch) * dist))
bpy.ops.object.camera_add(location=cam_loc)
cam = bpy.context.object; scene.camera = cam
cam.rotation_euler = (target - cam_loc).to_track_quat('-Z', 'Y').to_euler()
cam.data.lens = 85

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'; scene.cycles.samples = int(os.environ.get('SAMPLES', '48')); scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 800
scene.view_settings.view_transform = 'Standard'; scene.view_settings.look = 'None'
scene.view_settings.exposure = 0.0
scene.render.filepath = os.path.join(out, 'ramen_illust.png')
bpy.ops.render.render(write_still=True)

# アプリ用に glb も書き出す（地面とカメラ・光は除く）
for o in bpy.data.objects: o.select_set(o.type in {'MESH', 'FONT'} and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'ramen_illust.glb'), use_selection=True, export_apply=True)
print('DONE')

# もぐもGO お店の模型 v3（作り込み版）: 2階建ての町のラーメン屋
# 実行: blender -b -P shop_v3.py -- <out_dir>
#   - 画像: イラスト調（2段の陰影＋青みの影＋すき間の暗さ＋茶色の線）
#   - glb : アプリの地図用（色だけの軽い材質。陰影と線はアプリ側の three.js で付ける）
import bpy, bmesh, math, sys, os
from mathutils import Vector

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'fonts', 'MPLUSRounded1c-ExtraBold.ttf')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = bpy.context.collection

def srgb(hexstr):
    h = hexstr.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

# ── 材質: 絵用（イラスト調）と glb 用（色だけ）を対で作る ──────────────
LIGHT = (-0.45, -0.7, 0.75)
MATS, GL = {}, {}
def mat(name, color, emit=False):
    if name in MATS: return MATS[name]
    base = srgb(color)
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    o = N('ShaderNodeOutputMaterial'); em = N('ShaderNodeEmission'); L(em.outputs[0], o.inputs[0])
    if emit:
        em.inputs['Color'].default_value = (*base, 1)
    else:
        geo = N('ShaderNodeNewGeometry'); dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        l = math.sqrt(sum(c * c for c in LIGHT)); dot.inputs[1].default_value = tuple(c / l for c in LIGHT)
        L(geo.outputs['Normal'], dot.inputs[0])
        ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'
        e = ramp.color_ramp.elements
        e[0].position = 0.0; e[0].color = (*[c * k for c, k in zip(base, (0.68, 0.72, 0.88))], 1)
        e[1].position = 0.25; e[1].color = (*base, 1)
        hi = e.new(0.85); hi.color = (*[min(1, c * 1.05 + 0.025) for c in base], 1)
        L(dot.outputs['Value'], ramp.inputs['Fac'])
        ao = N('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.3
        r = N('ShaderNodeMapRange'); r.inputs['To Min'].default_value = 0.74; L(ao.outputs['AO'], r.inputs['Value'])
        cc = N('ShaderNodeCombineColor'); [L(r.outputs[0], cc.inputs[i]) for i in range(3)]
        mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
        L(ramp.outputs['Color'], mx.inputs[6]); L(cc.outputs[0], mx.inputs[7]); L(mx.outputs[2], em.inputs['Color'])
    g = bpy.data.materials.new(name + '_gl')
    g.use_nodes = True; b = g.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = 0.8
    if emit:
        b.inputs['Emission Color'].default_value = (*base, 1); b.inputs['Emission Strength'].default_value = 1
    MATS[name] = m; GL[m.name] = g
    return m

# ── 形の道具 ──────────────────────────────
def finish(o, m, bevel=0.0, seg=3, subd=0, smooth=True):
    o.data.materials.clear(); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'
    if subd:
        s = o.modifiers.new('subd', 'SUBSURF'); s.levels = s.render_levels = subd
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o

def cube(n, size, loc, m, bevel=0.06, seg=3, rot=(0, 0, 0), **kw):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = n; o.scale = size; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel=bevel, seg=seg, **kw)

def cyl(n, r, depth, loc, m, rot=(0, 0, 0), verts=32, bevel=0.02, **kw):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    o = bpy.context.object; o.name = n
    return finish(o, m, bevel=bevel, **kw)

def sphere(n, r, loc, m, scale=(1, 1, 1), seg=24, **kw):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.object; o.name = n; o.scale = scale; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, **kw)

def lathe(n, prof, loc, m, steps=36, rot=(0, 0, 0), **kw):
    me = bpy.data.meshes.new(n); bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(n, me); col.objects.link(o); o.location = loc; o.rotation_euler = rot
    return finish(o, m, **kw)

def text(n, body, size, loc, m, extrude=0.02):
    bpy.ops.object.text_add(location=loc, rotation=(math.pi / 2, 0, 0))
    o = bpy.context.object; o.name = n
    o.data.body = body; o.data.size = size; o.data.extrude = extrude
    o.data.align_x = 'CENTER'; o.data.align_y = 'CENTER'; o.data.font = bpy.data.fonts.load(FONT)
    o.data.materials.append(m)
    bpy.ops.object.convert(target='MESH')
    return bpy.context.object

# ── 色 ────────────────────────────────────
C = {k: mat(k, v) for k, v in dict(
    walk='#fbf1dc', walk_d='#e9dcc3', grass='#a8e6a0', curb='#fffaf0',
    wall1='#fff2d2', wall2='#ffd8c6', trim='#ffffff', wood='#c98c5e', wood_d='#93603f',
    roof='#ff8676', roof_d='#ef6656', red='#f0483e', white='#ffffff', noren='#3f6fe0',
    sign='#fffaf0', lantern='#ff5446', black='#3d2e2e', flower='#ff8fb8', flower2='#ffd35c', leaf='#55c86a',
    pot='#ff9e6e', menu='#4a4a5a', soup='#ffb446', naruto='#ff7fa8', egg='#fffaf0', yolk='#ffab1f',
    chashu='#c97a4e', negi='#5fcf6c', nori='#2e3b38', bowl_in='#fff6ea', metal='#9aa3b5',
).items()}
GLOW = mat('glow', '#ffe9a8', emit=True)
GLOW_W = mat('glow_w', '#fff6d6', emit=True)

# ── 台座: 角の丸い歩道のタイル＋奥に芝生 ─────────────
cube('walk', (3.4, 3.0, 0.16), (0, 0, 0.08), C['walk'], bevel=0.12, seg=4)
for i in range(5):  # 歩道の目地（うすい線の代わりに少し濃い板）
    cube(f'joint{i}', (3.25, 0.03, 0.01), (0, -1.2 + i * 0.6, 0.165), C['walk_d'], bevel=0)
cube('grass', (3.2, 0.7, 0.06), (0, 1.1, 0.19), C['grass'], bevel=0.05)
Z = 0.16

# ── 1階: 店の顔 ──────────────────────────
W, D, H1, H2 = 2.3, 1.7, 1.15, 1.1
FY = -D / 2  # 正面の面
cube('floor1', (W, D, H1), (0, 0.15, Z + H1 / 2), C['wall1'], bevel=0.07)
cube('base_band', (W + 0.04, D + 0.04, 0.16), (0, 0.15, Z + 0.08), C['wood_d'], bevel=0.05)
# 正面の木の枠（大きな店構え）
cube('front_frame', (W - 0.25, 0.08, H1 - 0.2), (0, FY + 0.13, Z + 0.1 + (H1 - 0.2) / 2), C['wood'], bevel=0.04)
# 左: 明るいショーウインドウ（中にどんぶりの見本）
cube('show_win', (0.95, 0.06, 0.6), (-0.5, FY + 0.08, Z + 0.62), GLOW, bevel=0.03)
cube('show_sill', (1.05, 0.18, 0.06), (-0.5, FY + 0.03, Z + 0.3), C['trim'], bevel=0.02)
for i, x in enumerate((-0.78, -0.5, -0.22)):
    lathe(f'show_bowl{i}', [(0, 0), (0.06, 0), (0.1, 0.04), (0.12, 0.08), (0, 0.07)], (x, FY + 0.05, Z + 0.33), C['white'], steps=20)
for x in (-0.5,):  # 窓の桟
    cube('show_bar', (0.03, 0.065, 0.6), (x, FY + 0.06, Z + 0.62), C['wood_d'], bevel=0)
# 右: 引き戸＋のれん
cube('door', (0.62, 0.06, 0.82), (0.55, FY + 0.08, Z + 0.53), GLOW_W, bevel=0.03)
cube('door_bar', (0.03, 0.065, 0.82), (0.55, FY + 0.06, Z + 0.53), C['wood_d'], bevel=0)
cyl('noren_rod', 0.025, 0.78, (0.55, FY - 0.02, Z + 0.93), C['wood_d'], rot=(0, math.pi / 2, 0), verts=12, bevel=0)
for i, x in enumerate((0.4, 0.7)):
    cube(f'noren{i}', (0.28, 0.025, 0.34), (x, FY - 0.02, Z + 0.75), C['noren'], bevel=0.04, seg=3)
lathe('noren_mark', [(0, 0), (0.05, 0), (0.08, 0.025), (0.09, 0.05), (0, 0.05)], (0.55, FY - 0.04, Z + 0.72), C['white'], steps=20,
      rot=(math.pi / 2, 0, 0))
# しまのひさし（正面いっぱい）＋丸いすそ
n = 11; aw = (W - 0.1) / n
for i in range(n):
    x = -W / 2 + 0.05 + aw * (i + 0.5)
    cube(f'awn{i}', (aw + 0.005, 0.5, 0.05), (x, FY - 0.2, Z + H1 + 0.02), C['red'] if i % 2 == 0 else C['white'], bevel=0.02, rot=(-0.55, 0, 0))
    sphere(f'awn_s{i}', aw * 0.52, (x, FY - 0.42, Z + H1 - 0.11), C['red'] if i % 2 == 0 else C['white'], scale=(1, 0.45, 0.75), seg=16)
# 赤ちょうちん（腕木から下げる）
for x in (-W / 2 - 0.02, W / 2 + 0.02):
    cube(f'arm{x}', (0.06, 0.3, 0.05), (x, FY - 0.08, Z + H1 - 0.1), C['wood_d'], bevel=0.015)
    lathe(f'lantern{x}', [(0, -0.2), (0.09, -0.18), (0.15, -0.09), (0.17, 0), (0.15, 0.09), (0.09, 0.18), (0, 0.2)],
          (x, FY - 0.2, Z + H1 - 0.38), C['lantern'], subd=1)
    for dz in (-0.19, 0.19):
        cyl(f'lcap{x}{dz}', 0.08, 0.04, (x, FY - 0.2, Z + H1 - 0.38 + dz), C['black'], verts=16, bevel=0.01)

# ── 2階 ──────────────────────────────────
z2 = Z + H1
cube('floor2', (W - 0.1, D - 0.1, H2), (0, 0.18, z2 + H2 / 2), C['wall2'], bevel=0.07)
cube('mid_band', (W + 0.02, D + 0.02, 0.1), (0, 0.15, z2 + 0.03), C['trim'], bevel=0.04)
# 看板（大きく・丸い字）
cube('sign_back', (1.7, 0.08, 0.42), (0, FY + 0.02, z2 + 0.27), C['red'], bevel=0.12, seg=4)
cube('sign', (1.6, 0.08, 0.34), (0, FY - 0.02, z2 + 0.27), C['sign'], bevel=0.1, seg=4)
text('sign_text', 'ラーメン', 0.27, (0, FY - 0.075, z2 + 0.26), C['red'], extrude=0.015)
# 2階の窓（白い枠・青い硝子・花のプランター）
for x in (-0.62, 0.62):
    cube(f'w2_frame{x}', (0.5, 0.06, 0.4), (x, FY + 0.05, z2 + 0.8), C['trim'], bevel=0.04)
    cube(f'w2_glass{x}', (0.4, 0.07, 0.3), (x, FY + 0.04, z2 + 0.8), GLOW_W, bevel=0.02)
    cube(f'w2_bar{x}', (0.025, 0.075, 0.3), (x, FY + 0.03, z2 + 0.8), C['trim'], bevel=0)
    cube(f'box{x}', (0.52, 0.14, 0.1), (x, FY - 0.02, z2 + 0.57), C['wood'], bevel=0.03)
    for k in range(4):
        sphere(f'fl{x}{k}', 0.05, (x - 0.18 + k * 0.12, FY - 0.03, z2 + 0.65), C['flower'] if k % 2 == 0 else C['flower2'], seg=12)
# 横の窓
for y in (-0.15, 0.45):
    cube(f'side_win{y}', (0.06, 0.32, 0.3), (W / 2 - 0.02, y + 0.18, z2 + 0.6), C['trim'], bevel=0.03)
    cube(f'side_glass{y}', (0.07, 0.24, 0.22), (W / 2 - 0.015, y + 0.18, z2 + 0.6), GLOW_W, bevel=0.02)

# ── 屋根: 寄棟ふうの丸い屋根（四方に軒） ─────────────
zr = z2 + H2
me = bpy.data.meshes.new('roof'); bm = bmesh.new()
rw, rd, rh, top = W / 2 + 0.2, (D - 0.1) / 2 + 0.2, 0.42, 0.45
yc = 0.18
v = [bm.verts.new(p) for p in [(-rw, yc - rd, 0), (rw, yc - rd, 0), (rw, yc + rd, 0), (-rw, yc + rd, 0),
                                   (-top, yc, rh), (top, yc, rh)]]
for f in [(0, 1, 5, 4), (1, 2, 5), (2, 3, 4, 5), (3, 0, 4), (3, 2, 1, 0)]:
    bm.faces.new([v[i] for i in f])
bm.to_mesh(me); bm.free()
roof = bpy.data.objects.new('roof', me); col.objects.link(roof); roof.location = (0, 0, zr + 0.02)
sol = roof.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = 0.12
finish(roof, C['roof'], bevel=0.08, seg=4, smooth=True)
# 瓦の段（横の筋）
for k in range(3):
    t = (k + 1) / 4
    cube(f'tile{k}', (2 * (rw - (rw - top) * t) + 0.04, 0.06, 0.05), (0, yc - rd * (1 - t) - 0.02, zr + 0.06 + rh * t),
         C['roof_d'], bevel=0.02, rot=(-0.72, 0, 0))
cyl('ridge', 0.09, 2 * top + 0.2, (0, yc, zr + rh + 0.08), C['roof_d'], rot=(0, math.pi / 2, 0), verts=16)
# 煙突（湯気）
cube('chimney', (0.2, 0.2, 0.35), (0.62, yc + 0.25, zr + 0.45), C['wall2'], bevel=0.04)
for k, (dx, dz, r) in enumerate([(0, 0.72, 0.08), (0.05, 0.86, 0.1), (-0.02, 1.02, 0.12)]):
    sphere(f'steam{k}', r, (0.62 + dx, yc + 0.25, zr + dz), C['white'], seg=16)

# ── 屋根の上の大きなどんぶり（ジャンルの目印） ─────────────
bx, by, bz = -0.15, yc - 0.05, zr + rh + 0.1
cyl('bowl_stand', 0.2, 0.1, (bx, by, bz), C['wood_d'], verts=24)
bowl = [(0, 0.05), (0.22, 0.05), (0.25, 0.08), (0.38, 0.17), (0.5, 0.34), (0.55, 0.5), (0.52, 0.52), (0.46, 0.38),
        (0.34, 0.22), (0, 0.2)]
B = 0.0
lathe('bowl', bowl, (bx, by, bz), C['white'], subd=1, steps=40)
lathe('bowl_band', [(0.5, 0.4), (0.535, 0.45), (0.545, 0.48), (0.51, 0.49)], (bx, by, bz), C['red'], subd=1, steps=40)
cyl('soup', 0.5, 0.03, (bx, by, bz + 0.46), C['soup'], verts=40, bevel=0.01)
cyl('naruto', 0.12, 0.04, (bx - 0.22, by + 0.08, bz + 0.485), C['white'], verts=24, bevel=0.015)
bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.017, location=(bx - 0.22, by + 0.08, bz + 0.507))
finish(bpy.context.object, C['naruto'])
sphere('egg', 0.12, (bx + 0.18, by + 0.14, bz + 0.485), C['egg'], scale=(1, 1.25, 0.45))
sphere('yolk', 0.065, (bx + 0.18, by + 0.14, bz + 0.51), C['yolk'], scale=(1, 1, 0.5), seg=16)
for k, a in enumerate((0.2, 0.55)):
    cube(f'chashu{k}', (0.26, 0.2, 0.04), (bx + 0.08 - k * 0.12, by - 0.2 + k * 0.03, bz + 0.49 + k * 0.012), C['chashu'], bevel=0.05, rot=(0, 0, a))
cube('nori', (0.035, 0.26, 0.3), (bx - 0.36, by - 0.12, bz + 0.58), C['nori'], bevel=0.012, rot=(0.25, -0.3, 0.4))
for k, (x, y) in enumerate([(-0.02, 0.26), (0.06, 0.3), (-0.1, 0.31), (0.33, -0.02), (0.3, 0.08)]):
    cyl(f'negi{k}', 0.03, 0.015, (bx + x, by + y, bz + 0.48), C['negi'], verts=10, bevel=0.004)
for dy in (-0.035, 0.035):
    cyl(f'hashi{dy}', 0.013, 0.95, (bx + 0.25, by + dy - 0.05, bz + 0.75), C['wood'], rot=(0.25, 0.75, 0), verts=8, bevel=0)

# ── 小物: 立て看板・植木鉢・ベンチ ─────────────────
cube('menu_l', (0.3, 0.04, 0.42), (-1.15, FY - 0.55, Z + 0.21), C['menu'], bevel=0.02, rot=(0.18, 0, 0))
cube('menu_frame', (0.34, 0.03, 0.46), (-1.15, FY - 0.53, Z + 0.21), C['wood'], bevel=0.02, rot=(0.18, 0, 0))
for k in range(3):
    cube(f'menu_line{k}', (0.18, 0.01, 0.025), (-1.15, FY - 0.58, Z + 0.3 - k * 0.08), C['white'], bevel=0, rot=(0.18, 0, 0))
for x in (0.05, 1.05):
    cyl(f'pot{x}', 0.12, 0.18, (x, FY - 0.25, Z + 0.09), C['pot'], verts=20)
    sphere(f'bush{x}', 0.17, (x, FY - 0.25, Z + 0.28), C['leaf'], scale=(1, 1, 0.9), seg=16)
    sphere(f'bud{x}', 0.04, (x + 0.07, FY - 0.36, Z + 0.36), C['flower'], seg=10)
cube('bench', (0.6, 0.22, 0.05), (1.35, 0.2, Z + 0.25), C['wood'], bevel=0.02, rot=(0, 0, math.pi / 2))
for dy in (-0.22, 0.22):
    cube(f'bench_leg{dy}', (0.18, 0.04, 0.22), (1.35, 0.2 + dy, Z + 0.12), C['wood_d'], bevel=0.01, rot=(0, 0, math.pi / 2))
for k, x in enumerate((-1.3, 1.3)):  # 奥の木
    cyl(f'trunk{k}', 0.06, 0.4, (x, 1.15, 0.42), C['wood_d'], verts=10)
    sphere(f'tree{k}', 0.32, (x, 1.15, 0.85), C['leaf'], scale=(1, 1, 1.1), seg=20)

# ── 絵にする（イラスト調） ──────────────────────
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#f6f9f0'), 1)
cyl('ground', 60, 0.01, (0, 0, -0.005), C['grass'] if False else mat('ground', '#f4f8ee'), verts=64, bevel=0)
scene.render.use_freestyle = True
scene.render.line_thickness_mode = 'ABSOLUTE'; scene.render.line_thickness = 1.4
fs = bpy.context.view_layer.freestyle_settings
ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('lines')
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('line')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
ls.linestyle.color = srgb('#6b4a4a'); ls.linestyle.thickness = 1.4

yaw = math.radians(float(os.environ.get('YAW', '-30'))); pitch = math.radians(55); dist = 15
target = Vector((0, 0, 1.45))
cl = target + Vector((math.sin(yaw) * math.sin(pitch) * dist, -math.cos(yaw) * math.sin(pitch) * dist, math.cos(pitch) * dist))
bpy.ops.object.camera_add(location=cl); cam = bpy.context.object; scene.camera = cam
cam.rotation_euler = (target - cl).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 85
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'
scene.cycles.samples = int(os.environ.get('SAMPLES', '32')); scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 900
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = os.path.join(out, 'shop_v3.png')
if os.environ.get('NORENDER') != '1':
    bpy.ops.render.render(write_still=True)

# ── glb（アプリ用）: 材質を色だけのものに差し替え、地面とカメラは除く ─────────
for o in bpy.data.objects:
    if o.type == 'MESH':
        for slot in o.material_slots:
            if slot.material and slot.material.name in GL: slot.material = GL[slot.material.name]
for o in bpy.data.objects: o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(out, 'shop_v3.glb'), use_selection=True, export_apply=True,
                          export_yup=True, export_normals=True, export_texcoords=False)
tris = sum(len(o.evaluated_get(bpy.context.evaluated_depsgraph_get()).data.loop_triangles) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'ground')
print('TRIS', tris)
print('DONE')

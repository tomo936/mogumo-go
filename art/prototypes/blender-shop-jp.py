# もぐもGO お店の模型 v5: シロの見本 art/reference/shops/ramen.webp に合わせたラーメン屋
# 画風: 柔らかいマットな 3D（粘土のような丸み・輪郭線なし・やわらかい光）
# 実行: blender -b -P ramen_v5.py -- <out_dir>
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
KIND = os.environ.get('KIND', 'ramen')  # ramen | soba
SOBA = KIND == 'soba'
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = bpy.context.collection
import random; rnd = random.Random(3)

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

MATS = {}
def mat(color, rough=0.72, emit=0.0):
    k = (color, rough, emit)
    if k in MATS: return MATS[k]
    m = bpy.data.materials.new(color); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*srgb(color), 1); b.inputs['Roughness'].default_value = rough
    b.inputs['Specular IOR Level'].default_value = 0.2
    if emit: b.inputs['Emission Color'].default_value = (*srgb(color), 1); b.inputs['Emission Strength'].default_value = emit
    MATS[k] = m; return m

def finish(o, m, bevel=0.0, seg=2):
    o.data.materials.clear(); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'; b.harden_normals = False
    for p in o.data.polygons: p.use_smooth = True
    return o

def cube(size, loc, m, bevel=0.03, seg=2, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel, seg)

def cyl(r, h, loc, m, rot=(0, 0, 0), verts=20, bevel=0.015):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    return finish(bpy.context.object, m, bevel)

def sphere(r, loc, m, scale=(1, 1, 1), seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.object; o.scale = scale; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m)

def lathe(prof, loc, m, steps=20):
    me = bpy.data.meshes.new('l'); bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]; es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('l', me); col.objects.link(o); o.location = loc
    return finish(o, m)

def xform(objs, M):
    bpy.context.view_layer.update()
    for o in objs: o.matrix_world = M @ o.matrix_world

# ── 色（見本から） ─────────────────────────────
WOOD = ['#e8b47c', '#e0aa70', '#ecbd88']           # 壁の板（少しずつ違う色）
POST = mat('#dba068'); POST_D = mat('#c48552'); TRIM = mat('#eab884')
ROOF = mat('#97afc9'); ROOF_D = mat('#86a0bd'); GLASS = mat('#b9d2ec', 0.3)
RED = mat('#e05a4e'); WHITE = mat('#fbf1ea'); DARK = mat('#5e4433', 0.9); FLOOR_IN = mat('#b9895f')
BRICK = mat('#d0905e'); BRICK_D = mat('#bf7f52'); STEAM = mat('#d9c6ef', 0.9); METAL = mat('#4a4048')
BOARD = mat('#e4b57f')
PLASTER = mat('#f6f2f4'); BLUE = mat('#8fb6e6'); GREY = mat('#a9a9b0'); GREY_D = mat('#96969e')

# ── 板張りの壁: 横板を積む（板ごとに丸み・すき間・色の揺らぎ） ─────────────
def plank_wall(width, height, z0, M, plank=0.14, depth=0.06):
    objs = []; n = int(height / plank)
    for i in range(n):
        objs.append(cube((width, depth, plank - 0.014), (0, 0, z0 + plank * (i + 0.5)), mat(rnd.choice(WOOD)), bevel=0.022))
    xform(objs, M); return objs

def plaster_wall(width, height, z0, M, lower=0.0):
    objs = [cube((width, 0.05, height), (0, 0, z0 + height / 2), PLASTER, bevel=0.015)]
    if lower:
        n = max(3, int(width / 0.16))
        objs.append(cube((width, 0.06, lower), (0, 0.0, z0 + lower / 2), POST_D, bevel=0.01))  # 板の裏の下地
        for k in range(n):
            objs.append(cube((width / n - 0.012, 0.07, lower), (-width / 2 + width * (k + 0.5) / n, -0.01, z0 + lower / 2), mat(rnd.choice(WOOD)), bevel=0.018))
        objs.append(cube((width + 0.02, 0.08, 0.08), (0, -0.015, z0 + lower + 0.03), POST, bevel=0.022))
    objs.append(cube((width + 0.02, 0.08, 0.08), (0, -0.015, z0 + height - 0.04), POST, bevel=0.022))
    xform(objs, M); return objs

def wall(width, height, z0, M, lower=0.0):
    return plaster_wall(width, height, z0, M, lower) if SOBA else plank_wall(width, height, z0, M)

def tile_slope(width, length, M, rows=None, tw=0.3):
    """瓦の斜面: ローカルで「幅 x × 長さ y（y=0 が軒、+y が棟）」。段ごとに丸い瓦を並べる"""
    objs = [cube((width, length, 0.06), (0, length / 2, 0), ROOF, bevel=0.02)]
    rows = rows or max(2, int(length / 0.26))
    for r in range(rows):
        y = length * (r + 0.5) / rows
        n = max(2, int(width / tw)); off = (tw / 2) if r % 2 else 0
        for k in range(n):
            x = -width / 2 + tw * (k + 0.5) + off
            if x > width / 2 - tw * 0.3: continue
            o = cube((tw - 0.025, length / rows + 0.05, 0.07), (x, y - 0.02, 0.055 + r * 0.004), ROOF if (k + r) % 3 else ROOF_D, bevel=0.03, rot=(-0.08, 0, 0))
            objs.append(o)
    cyl_e = cyl(0.05, width + 0.04, (0, 0.0, 0.05), ROOF_D, rot=(0, math.pi / 2, 0), verts=12)  # 軒先の丸み
    objs.append(cyl_e)
    xform(objs, M); return objs

def M_at(x, y, z, rz=0.0, rx=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(rx, 4, 'X')

# ── 寸法 ───────────────────────────────────
W, D = 2.4, 2.0; H1 = 1.12; Z0 = 0.08
W2, D2, H2 = 1.85, 1.45, 0.78
FY = -D / 2

# 土台
cube((W + 0.16, D + 0.16, Z0), (0, 0, Z0 / 2), POST_D, bevel=0.03)
cube((W + 0.02, D + 0.02, 0.18), (0, 0, Z0 + 0.09), TRIM, bevel=0.03)

# ── 1階 ─────────────────────────────────
cube((W - 0.06, D - 0.06, H1), (0, 0, Z0 + H1 / 2), mat('#dcb382'), bevel=0.02)  # 芯
# 横と後ろの板壁
wall(D - 0.1, H1 - 0.05, 0.0, M_at(-W / 2, 0, Z0, rz=-math.pi / 2), lower=0.42)
wall(D - 0.1, H1 - 0.05, 0.0, M_at(W / 2, 0, Z0, rz=math.pi / 2), lower=0.42)
wall(W - 0.1, H1 - 0.05, 0.0, M_at(0, D / 2, Z0, rz=math.pi), lower=0.42)
# 正面: 板壁（入口の左右）
for sx in (-1, 1):
    wall(0.72, H1 - 0.05, 0.0, M_at(sx * 0.82, FY, Z0), lower=0.42)
# 柱（四隅と入口の両わき）
for x, y in [(-W / 2, FY), (W / 2, FY), (-W / 2, D / 2), (W / 2, D / 2), (-0.44, FY), (0.44, FY)]:
    cube((0.13, 0.13, H1 + 0.04), (x, y, Z0 + H1 / 2), POST, bevel=0.03)
# 入口（暗い奥）と敷居
cube((0.76, 0.1, 0.82), (0, FY + 0.03, Z0 + 0.41), DARK, bevel=0.01)
cube((0.8, 0.5, 0.04), (0, FY + 0.1, Z0 + 0.02), FLOOR_IN, bevel=0.01)
cube((0.96, 0.1, 0.1), (0, FY - 0.01, Z0 + 0.88), POST, bevel=0.025)
# アーチの窓（入口の左右・右の側面）
def arch_window(M, w=0.36, h=0.42):
    objs = [cube((w + 0.1, 0.07, h), (0, -0.02, h / 2 - 0.05), POST, bevel=0.03),
            cyl(w / 2 + 0.05, 0.07, (0, -0.02, h - 0.05), POST, rot=(math.pi / 2, 0, 0), verts=24),
            cube((w, 0.075, h - 0.05), (0, -0.03, h / 2 - 0.05), GLASS, bevel=0.01),
            cyl(w / 2, 0.075, (0, -0.03, h - 0.05), GLASS, rot=(math.pi / 2, 0, 0), verts=24, bevel=0.005),
            cube((w + 0.16, 0.12, 0.06), (0, -0.05, -0.08), POST, bevel=0.02)]
    xform(objs, M); return objs
for sx in (-1, 1): arch_window(M_at(sx * 0.82, FY - 0.04, Z0 + 0.38))
for y in (-0.35, 0.4): arch_window(M_at(W / 2 + 0.04, y, Z0 + 0.38, rz=math.pi / 2))
# のれん（赤白のたてじま・3枚）
cyl(0.022, 0.9, (0, FY - 0.12, Z0 + 0.86), POST_D, rot=(0, math.pi / 2, 0), verts=10)
for i in range(3):
    x = -0.28 + i * 0.28
    for j in range(2):
        cube((0.13 if not SOBA else 0.135, 0.025, 0.36), (x - 0.065 + j * 0.13, FY - 0.12, Z0 + 0.66), (WHITE if SOBA else (RED if (i + j) % 2 == 0 else WHITE)), bevel=0.012)
# 板のひさし（正面いっぱい）
for i in range(7):
    cube((W / 7 - 0.015, 0.55, 0.06), (-W / 2 + W / 7 * (i + 0.5), FY - 0.22, Z0 + H1 + 0.03), mat(rnd.choice(WOOD)), bevel=0.02, rot=(-0.12, 0, 0))
cube((W + 0.1, 0.08, 0.08), (0, FY - 0.47, Z0 + H1 - 0.02), POST, bevel=0.025)
# 赤ちょうちん（ひさしの下に4つ）
if SOBA:
    for x in (-1.12, -0.58, 0.58, 1.12):
        cube((0.14, 0.03, 0.24), (x, FY - 0.4, Z0 + H1 - 0.2), BLUE, bevel=0.02)
        cube((0.18, 0.04, 0.03), (x, FY - 0.4, Z0 + H1 - 0.07), POST_D, bevel=0.01)
for x in (() if SOBA else (-1.05, -0.62, 0.62, 1.05)):
    zc = Z0 + H1 - 0.3
    lathe([(0, -0.15), (0.07, -0.135), (0.115, -0.07), (0.13, 0), (0.115, 0.07), (0.07, 0.135), (0, 0.15)], (x, FY - 0.38, zc), RED)
    for dz in (-0.145, 0.145): cyl(0.06, 0.04, (x, FY - 0.38, zc + dz), METAL, verts=14, bevel=0.008)
    cyl(0.007, 0.12, (x, FY - 0.38, zc + 0.22), METAL, verts=6, bevel=0)

# ── 1階の屋根（下屋: 2階のまわりを囲む瓦） ───────────────
zr1 = Z0 + H1 + 0.04
slope = 0.42; L1 = 0.62
for side, (cx, cy, rz, wid) in {
    'back': (0, D / 2 + 0.12, math.pi, W + 0.3), 'left': (-W / 2 - 0.12, 0, -math.pi / 2, D - 0.2),
    'right': (W / 2 + 0.12, 0, math.pi / 2, D - 0.2), 'front': (0, FY + 0.12, 0, W + 0.3)}.items():
    tile_slope(wid, L1, M_at(cx, cy, zr1, rz=rz, rx=slope))

# ── 2階 ─────────────────────────────────
z2 = zr1 + 0.2
cube((W2 - 0.06, D2 - 0.06, H2), (0, 0.1, z2 + H2 / 2), mat('#dcb382'), bevel=0.02)
wall(W2 - 0.1, H2, 0.0, M_at(0, 0.1 - D2 / 2, z2))
wall(D2 - 0.1, H2, 0.0, M_at(-W2 / 2, 0.1, z2, rz=-math.pi / 2))
wall(D2 - 0.1, H2, 0.0, M_at(W2 / 2, 0.1, z2, rz=math.pi / 2))
for x, y in [(-W2 / 2, 0.1 - D2 / 2), (W2 / 2, 0.1 - D2 / 2)]:
    cube((0.12, 0.12, H2 + 0.02), (x, y, z2 + H2 / 2), POST, bevel=0.03)
cube((W2 + 0.08, 0.1, 0.1), (0, 0.1 - D2 / 2 - 0.02, z2 + 0.05), POST, bevel=0.025)
cube((W2 + 0.08, 0.1, 0.1), (0, 0.1 - D2 / 2 - 0.02, z2 + H2 - 0.03), POST, bevel=0.025)
# 十字の窓（2つ）
for x in (-0.42, 0.42):
    f = 0.1 - D2 / 2 - 0.05
    cube((0.46, 0.07, 0.4), (x, f, z2 + 0.42), POST, bevel=0.03)
    cube((0.36, 0.075, 0.3), (x, f - 0.01, z2 + 0.42), GLASS, bevel=0.01)
    cube((0.03, 0.08, 0.3), (x, f - 0.02, z2 + 0.42), POST, bevel=0.008)
    cube((0.36, 0.08, 0.03), (x, f - 0.02, z2 + 0.42), POST, bevel=0.008)
    cube((0.52, 0.12, 0.05), (x, f - 0.03, z2 + 0.2), POST, bevel=0.02)

# ── 大屋根（切妻・妻を正面へ） ────────────────────────
zr2 = z2 + H2
half = W2 / 2 + 0.28; pitch = 0.62
run = half / math.cos(pitch)
for sx in (-1, 1):
    # 斜面: ローカル y＝軒→棟。軒を外側へ向けて回す
    tile_slope(D2 + 0.55, run, M_at(sx * half, 0.1, zr2 - 0.05, rz=(math.pi / 2 if sx > 0 else -math.pi / 2), rx=pitch))
ridge_z = zr2 - 0.05 + math.tan(pitch) * half + 0.07
cyl(0.1, D2 + 0.65, (0, 0.1, ridge_z), ROOF_D, rot=(math.pi / 2, 0, 0), verts=16)
for y in (0.1 - (D2 + 0.65) / 2, 0.1 + (D2 + 0.65) / 2):
    cyl(0.12, 0.08, (0, y, ridge_z), ROOF, rot=(math.pi / 2, 0, 0), verts=20)
# 妻（三角）: たて板
gh = math.tan(pitch) * (W2 / 2)
for sy in (-1, 1):
    y = 0.1 + sy * (D2 / 2 - 0.02)
    me = bpy.data.meshes.new('gable'); bm = bmesh.new()
    v = [bm.verts.new((-W2 / 2, 0, 0)), bm.verts.new((W2 / 2, 0, 0)), bm.verts.new((0, 0, gh))]
    bm.faces.new(v if sy < 0 else v[::-1]); bm.to_mesh(me); bm.free()
    g = bpy.data.objects.new('gable', me); col.objects.link(g); g.location = (0, y, zr2)
    finish(g, PLASTER if SOBA else mat(WOOD[1])); sm = g.modifiers.new('s', 'SOLIDIFY'); sm.thickness = 0.06
    for x in (() if SOBA else (-0.55, -0.28, 0.28, 0.55)):
        h = gh * (1 - abs(x) / (W2 / 2)) - 0.04
        cube((0.05, 0.08, h), (x, y + sy * 0.0, zr2 + h / 2), mat(WOOD[0]), bevel=0.018)
    cube((0.1, 0.08, gh), (0, y + sy * 0.01, zr2 + gh / 2), POST, bevel=0.025)
    cube((W2 + 0.04, 0.08, 0.1), (0, y + sy * 0.01, zr2 + 0.02), POST, bevel=0.025)
# 破風板（屋根の前のふち）
for sx in (-1, 1):
    L = half / math.cos(pitch) + 0.05
    cube((L, 0.1, 0.1), (sx * half / 2, 0.1 - D2 / 2 - 0.3, zr2 - 0.05 + math.tan(pitch) * half / 2 + 0.07), POST, bevel=0.03,
         rot=(0, sx * pitch, 0))

# ── 看板（下屋の上・正面の中央） ─────────────────────
for k in range(3):
    cube((1.2, 0.08, 0.13), (0, FY - 0.06 + k * 0.004, zr1 + 0.14 + k * 0.14), BOARD if k != 1 else mat('#dcab73'), bevel=0.035)
for x in (-0.4, 0.4): cube((0.08, 0.1, 0.1), (x, FY - 0.08, zr1 + 0.04), POST_D, bevel=0.02)

# ── 煙突（れんが）と湯気 ──────────────────────────
cx, cy = -0.5, 0.45; cz = zr2 + 0.28
for r in range(3):
    for k in range(2):
        cube((0.13, 0.27, 0.11), (cx - 0.07 + k * 0.14, cy, cz + r * 0.12), (GREY if (r + k) % 2 else GREY_D) if SOBA else (BRICK if (r + k) % 2 else BRICK_D), bevel=0.025)
cube((0.34, 0.34, 0.1), (cx, cy, cz + 0.4), GREY if SOBA else BRICK, bevel=0.03)
cube((0.2, 0.2, 0.12), (cx, cy, cz + 0.42), DARK, bevel=0.01)
for k, (dx, dz, r) in enumerate([(0.0, 0.62, 0.09), (0.06, 0.78, 0.12), (0.02, 0.98, 0.15), (0.1, 1.2, 0.11)]):
    sphere(r, (cx + dx, cy, cz + dz), STEAM, seg=16)

# ── 光とカメラ（やわらかいマットな見え方） ──────────────────
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#eef3fb'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(48), 0, math.radians(-32)))
sun = bpy.context.object; sun.data.energy = 2.2; sun.data.angle = math.radians(25); sun.data.color = srgb('#fff2e4')
bpy.ops.object.light_add(type='AREA', location=(4, -3, 4)); fill = bpy.context.object; fill.data.energy = 250; fill.data.size = 6
fill.rotation_euler = (Vector((0, 0, 1)) - fill.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0)); gnd = bpy.context.object; gnd.name = 'ground'
gnd.is_shadow_catcher = True
scene.render.film_transparent = True

yaw = math.radians(float(os.environ.get('YAW', '-32'))); pitch_c = math.radians(58); dist = 13
target = Vector((0, 0, 1.45))
cl = target + Vector((math.sin(yaw) * math.sin(pitch_c) * dist, -math.cos(yaw) * math.sin(pitch_c) * dist, math.cos(pitch_c) * dist))
bpy.ops.object.camera_add(location=cl); cam = bpy.context.object; scene.camera = cam
cam.rotation_euler = (target - cl).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 70
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = int(os.environ.get('SAMPLES', '40'))
scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 900
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = os.path.join(out, f'{KIND}_v5.png')
bpy.ops.render.render(write_still=True)

for o in bpy.data.objects: o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{KIND}_v5.glb'), use_selection=True, export_apply=True)
dg = bpy.context.evaluated_depsgraph_get()
print('TRIS', sum(len(o.evaluated_get(dg).data.loop_triangles) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'ground'))
print('DONE')

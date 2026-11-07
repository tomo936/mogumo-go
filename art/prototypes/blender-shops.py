# もぐもGO お店の模型（ジオラマ版の見本 art/reference/shops/ に合わせる。外側は見本どおり・中は簡単に）
# 画風: 柔らかいマットな 3D（粘土のような丸み・輪郭線なし・やわらかい光）
# 実行: blender -b -P ramen_v5.py -- <out_dir>
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
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

def M_at(x, y, z, rz=0.0, rx=0.0, ry=0.0):
    return Matrix.Translation((x, y, z)) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Rotation(ry, 4, 'Y') @ Matrix.Rotation(rx, 4, 'X')

KIND = os.environ.get('KIND', 'ramen')

# ── 共通の部品 ─────────────────────────────────
def tile_slope(width, length, M, roof, roof_d, tw=0.16, th=0.1):
    """小さな瓦をびっしり並べた斜面（ローカル: 幅 x × 長さ y、y=0 が軒、+y が棟）"""
    objs = [cube((width, length, 0.05), (0, length / 2, 0), roof_d, bevel=0.01)]
    rows = max(2, int(length / th))
    for r in range(rows):
        y = length * (r + 0.5) / rows; n = int(width / tw); off = tw / 2 if r % 2 else 0
        for k in range(n):
            x = -width / 2 + tw * (k + 0.5) + off
            if x > width / 2 - tw * 0.4: continue
            objs.append(cube((tw - 0.012, length / rows + 0.03, 0.045), (x, y - 0.012, 0.045), roof if (k * 7 + r * 3) % 5 else roof_d, bevel=0.012, seg=1, rot=(-0.12, 0, 0)))
    xform(objs, M); return objs

def gable_roof(W, D, z, pitch, over_x, over_y, roof, roof_d, ridge_col):
    """切妻屋根（棟は前後方向＝三角の妻が正面）。両側の斜面＋棟"""
    half = W / 2 + over_x; run = half / math.cos(pitch)
    for sx in (-1, 1):
        tile_slope(D + 2 * over_y, run, M_at(sx * half, 0, z, rz=(math.pi / 2 if sx > 0 else -math.pi / 2), rx=pitch), roof, roof_d)
    rz = z + math.tan(pitch) * half + 0.06
    cyl(0.07, D + 2 * over_y + 0.04, (0, 0, rz), ridge_col, rot=(math.pi / 2, 0, 0), verts=14)
    return rz

def gable_wall(W, y, z, h, m, sy):
    me = bpy.data.meshes.new('gable'); bm = bmesh.new()
    v = [bm.verts.new((-W / 2, 0, 0)), bm.verts.new((W / 2, 0, 0)), bm.verts.new((0, 0, h))]
    bm.faces.new(v if sy < 0 else v[::-1]); bm.to_mesh(me); bm.free()
    g = bpy.data.objects.new('gable', me); col.objects.link(g); g.location = (0, y, z)
    finish(g, m); sm = g.modifiers.new('s', 'SOLIDIFY'); sm.thickness = 0.06
    return g

def awning(w, n, depth, tilt, c1, c2, M):
    """しまのひさし: 1枚の板をしまに塗り分け＋波のすそ"""
    me = bpy.data.meshes.new('awning'); bm = bmesh.new()
    dy, dz = -depth * math.cos(tilt), -depth * math.sin(tilt)
    back = [bm.verts.new((-w / 2 + w * i / n, 0.0, 0.0)) for i in range(n + 1)]
    front = [bm.verts.new((-w / 2 + w * i / n, dy, dz)) for i in range(n + 1)]
    for i in range(n):
        f = bm.faces.new((back[i], back[i + 1], front[i + 1], front[i])); f.material_index = i % 2
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('awning', me); col.objects.link(o); o.data.materials.append(c1); o.data.materials.append(c2)
    o.modifiers.new('s', 'SOLIDIFY').thickness = 0.03
    b = o.modifiers.new('b', 'BEVEL'); b.width = 0.008; b.segments = 2; b.limit_method = 'ANGLE'
    objs = [o]
    for i in range(n):
        x = -w / 2 + w * (i + 0.5) / n
        bpy.ops.mesh.primitive_cylinder_add(radius=w / n * 0.5, depth=0.03, vertices=16, location=(x, dy - 0.004, dz), rotation=(math.pi / 2, 0, 0))
        c = bpy.context.object; bm2 = bmesh.new(); bm2.from_mesh(c.data)
        bmesh.ops.bisect_plane(bm2, geom=bm2.verts[:] + bm2.edges[:] + bm2.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True)
        bmesh.ops.holes_fill(bm2, edges=bm2.edges[:]); bm2.to_mesh(c.data); bm2.free()
        objs.append(finish(c, c1 if i % 2 == 0 else c2, 0.006, 1))
    xform(objs, M); return objs

def lantern(x, y, z, red, black, s=1.0):
    lathe([(0, -0.12 * s), (0.06 * s, -0.11 * s), (0.1 * s, -0.06 * s), (0.11 * s, 0), (0.1 * s, 0.06 * s), (0.06 * s, 0.11 * s), (0, 0.12 * s)], (x, y, z), red)
    for k in range(-2, 3): lathe([(0.112 * s * math.cos(k * 0.45) - 0.004, -0.006), (0.112 * s * math.cos(k * 0.45) + 0.004, 0), (0.112 * s * math.cos(k * 0.45) - 0.004, 0.006)], (x, y, z + k * 0.045 * s), mat('#c8382f'), steps=16)
    for dz in (-0.12 * s, 0.12 * s): cyl(0.05 * s, 0.03, (x, y, z + dz), black, verts=12, bevel=0.005)
    cyl(0.005, 0.08, (x, y, z + 0.17 * s), black, verts=6, bevel=0)

def stool(x, y, top, leg, s=1.0):
    cyl(0.1 * s, 0.035, (x, y, 0.32 * s), top, verts=20, bevel=0.01)
    for a in range(3):
        ang = a * math.tau / 3
        cube((0.025, 0.025, 0.3 * s), (x + math.cos(ang) * 0.06 * s, y + math.sin(ang) * 0.06 * s, 0.16 * s), leg, bevel=0.006)

def half_disc(x, y, z, r, m, depth=0.02):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, vertices=24, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    c = bpy.context.object; bpy.ops.object.transform_apply(rotation=True)  # 円の面を正面（-Y）へ向けてから下半分を残す
    bm = bmesh.new(); bm.from_mesh(c.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True)
    bmesh.ops.holes_fill(bm, edges=bm.edges[:]); bm.to_mesh(c.data); bm.free()
    c.location = (x, y, z); return finish(c, m, 0.004, 1)

def bowl_icon(x, y, z, white, s=1.0):
    """看板の絵（どんぶり＋はし＋湯気）を、平たい浮き彫りで"""
    half_disc(x, y, z, 0.075 * s, white)                                         # どんぶり
    cube((0.17 * s, 0.02, 0.012 * s), (x, y, z + 0.004 * s), white, bevel=0.002)  # ふち
    cube((0.06 * s, 0.02, 0.012 * s), (x, y, z - 0.085 * s), white, bevel=0.002)  # 高台
    for dx in (-0.012, 0.012): cube((0.008 * s, 0.02, 0.13 * s), (x + 0.02 * s + dx * s, y, z + 0.07 * s), white, bevel=0.001, rot=(0, -0.35, 0))  # はし
    for k in range(3): sphere(0.01 * s, (x - 0.035 * s, y - 0.004, z + 0.035 * s + k * 0.022 * s), white, seg=8)  # 湯気

# ── ラーメン屋（見本 ramen.webp） ───────────────────
def ramen():
    WOODL = mat('#e4c391'); WOODM = mat('#d8b07a'); PLASTER = mat('#f3e7cf'); INSIDE = mat('#f6e2c2', 0.8, emit=0.25)
    ROOF = mat('#9a3a30'); ROOF_D = mat('#86302a'); RED = mat('#e1453b'); WHITE = mat('#fbf5ea'); BLACK = mat('#3a2f2f')
    SIGN = mat('#6a4a36'); GREY = mat('#8c8c90'); STONE = mat('#9c9a98'); DARK = mat('#4a3a30')
    W, D, H = 2.4, 1.8, 1.6; FY = -D / 2
    cube((W + 0.12, D + 0.12, 0.08), (0, 0, 0.04), WOODL, bevel=0.02)                         # 床板
    # 奥の店内（明るい）と左右の壁
    cube((W - 0.1, 0.06, H), (0, D / 2 - 0.05, 0.08 + H / 2), PLASTER, bevel=0.01)
    for sx in (-1, 1): cube((0.06, D, H), (sx * (W / 2 - 0.03), 0, 0.08 + H / 2), PLASTER, bevel=0.01)
    cube((W - 0.1, D - 0.5, H), (0, 0.25, 0.08 + H / 2), INSIDE, bevel=0.01)                  # 店内の奥（明るい）
    # 柱と梁
    for x in (-W / 2, -0.45, 0.28, W / 2):
        cube((0.1, 0.1, H + 0.02), (x, FY, 0.08 + H / 2), WOODL, bevel=0.02)
    for x in (-W / 2, W / 2): cube((0.1, 0.1, H + 0.02), (x, D / 2, 0.08 + H / 2), WOODL, bevel=0.02)
    cube((W + 0.06, 0.1, 0.1), (0, FY, 0.08 + H), WOODL, bevel=0.02)
    cube((W + 0.02, 0.09, 0.08), (0, FY, 0.08 + 1.08), WOODL, bevel=0.02)
    # 左の壁（しっくい＋換気口）・下の板
    cube((W / 2 - 0.45, 0.05, 1.0), (-(W / 2 + 0.45) / 2, FY + 0.02, 0.08 + 0.5), PLASTER, bevel=0.01)
    cube((0.24, 0.04, 0.14), (-0.95, FY - 0.01, 0.08 + 0.55), GREY, bevel=0.01)
    for k in range(4): cube((0.02, 0.05, 0.1), (-1.03 + k * 0.055, FY - 0.02, 0.08 + 0.55), DARK, bevel=0)
    cube((W / 2 - 0.45, 0.06, 0.2), (-(W / 2 + 0.45) / 2, FY + 0.01, 0.08 + 0.1), WOODM, bevel=0.015)
    # 入口（店内の床が見える）＋赤白ののれん
    cube((0.7, D - 0.6, 0.02), (-0.08, 0.0, 0.09), WOODM, bevel=0.005)
    cyl(0.02, 0.95, (-0.1, FY - 0.08, 0.08 + 0.98), WOODL, rot=(0, math.pi / 2, 0), verts=10, bevel=0)
    for ball_x in (-0.58, 0.38): sphere(0.03, (ball_x, FY - 0.08, 0.08 + 0.98), WOODL, seg=10)
    for i in range(3):
        x0 = -0.37 + i * 0.25
        for j in range(3):
            cube((0.079, 0.02, 0.48), (x0 - 0.08 + j * 0.08, FY - 0.09, 0.08 + 0.72), RED if j % 2 == 0 else WHITE, bevel=0.006)
    # 右: 外から見えるカウンター（腰板＋天板＋奥の棚）といす3つ
    cx0, cx1 = 0.33, W / 2 - 0.05; cw = cx1 - cx0; cxm = (cx0 + cx1) / 2
    for k in range(int(cw / 0.1)): cube((0.09, 0.05, 0.45), (cx0 + 0.05 + k * 0.1, FY + 0.03, 0.08 + 0.225), WOODM if k % 2 else WOODL, bevel=0.01)
    cube((cw + 0.04, 0.3, 0.05), (cxm, FY + 0.12, 0.08 + 0.48), WOODL, bevel=0.015)
    cube((cw - 0.1, 0.18, 0.04), (cxm, FY + 0.45, 0.08 + 0.78), WOODL, bevel=0.01)              # 奥の棚
    for k, x in enumerate((cx0 + 0.15, cx0 + 0.32, cx1 - 0.2)):                                 # 棚のどんぶり（大きいものだけ）
        lathe([(0, 0), (0.04, 0), (0.07, 0.03), (0.075, 0.06), (0, 0.05)], (x, FY + 0.45, 0.08 + 0.8), WHITE, steps=16)
    cube((cw + 0.02, 0.06, 0.04), (cxm, FY + 0.02, 0.08 + 1.0), WOODL, bevel=0.01)              # 上の格子の横木
    for k in range(5): cube((0.025, 0.05, 0.08), (cx0 + 0.1 + k * (cw - 0.2) / 4, FY + 0.02, 0.08 + 1.04), WOODL, bevel=0)
    for x in (cx0 + 0.15, cxm, cx1 - 0.15): stool(x, FY - 0.25, WOODL, WOODM, 1.1)
    # しまのひさし（正面いっぱい）＋赤ちょうちん4つ
    awning(W + 0.04, 22, 0.42, 0.35, RED, WHITE, M_at(0, FY - 0.02, 0.08 + 1.3))
    for x in (-0.9, -0.3, 0.3, 0.9): lantern(x, FY - 0.32, 0.08 + 1.0, mat('#ee4f3c', 0.6, emit=0.35), BLACK)
    # 妻（三角）: しっくい＋柱＋四角い看板（どんぶりの絵）
    zt = 0.08 + H
    pitch = math.radians(34); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.02), zt, gh, PLASTER, sy)
    for x in (-0.62, 0.62): cube((0.07, 0.07, gh * (1 - abs(x) / (W / 2))), (x, FY - 0.01, zt + gh * (1 - abs(x) / (W / 2)) / 2), WOODL, bevel=0.015)
    for k in range(3): cube((0.36, 0.05, 0.12), (0, FY - 0.03, zt + 0.2 + k * 0.12), SIGN if k != 1 else mat('#5e412f'), bevel=0.012)
    bowl_icon(0, FY - 0.06, zt + 0.31, WHITE, 1.25)
    # 破風板
    for sx in (-1, 1):
        L = (W / 2 + 0.16) / math.cos(pitch)
        cube((L, 0.08, 0.07), (sx * (W / 2 + 0.16) / 2, FY - 0.12, zt + math.tan(pitch) * (W / 2 + 0.16) / 2 - 0.04), WOODL, bevel=0.02, rot=(0, sx * pitch, 0))
    gable_roof(W, D, zt - 0.06, pitch, 0.16, 0.18, ROOF, ROOF_D, ROOF_D)
    # 煙突（石）と湯気
    cube((0.2, 0.2, 0.42), (-0.5, 0.4, zt + 0.42), STONE, bevel=0.02)
    cube((0.24, 0.24, 0.05), (-0.5, 0.4, zt + 0.64), GREY, bevel=0.01)
    for k, (dx, dz, r) in enumerate([(0, 0.78, 0.06), (0.04, 0.9, 0.08), (0.0, 1.05, 0.09), (0.06, 1.2, 0.07)]):
        sphere(r, (-0.5 + dx, 0.4, zt + dz), mat('#c9bbe8', 0.9), seg=12)
    # 黒板の立て看板（どんぶりの絵）
    o = cube((0.36, 0.03, 0.46), (-1.1, FY - 0.55, 0.08 + 0.36), BLACK, bevel=0.01, rot=(0.15, 0, 0.25))
    cube((0.4, 0.025, 0.5), (-1.1, FY - 0.53, 0.08 + 0.36), WOODL, bevel=0.01, rot=(0.15, 0, 0.25))
    for dx in (-0.14, 0.14): cube((0.03, 0.03, 0.7), (-1.1 + dx * math.cos(0.25), FY - 0.48 + dx * math.sin(0.25), 0.08 + 0.33), WOODL, bevel=0.008, rot=(0.15, 0, 0.25))
    bowl_icon(-1.1, FY - 0.585, 0.08 + 0.37, WHITE, 1.15)


# ── 寿司屋（見本 sushi.webp＝前のデザイン） ─────────────────
def lattice(x, y, z, w, h, frame, glow, nx=4, nz=4, rz=0.0):
    """格子窓: 枠＋中の明かり＋縦横の桟（正面＝-Y で作って rz で回す）"""
    objs = [cube((w + 0.08, 0.06, h + 0.08), (0, 0, 0), frame, bevel=0.015), cube((w, 0.065, h), (0, -0.005, 0), glow, bevel=0.005)]
    for i in range(1, nx): objs.append(cube((0.022, 0.075, h), (-w / 2 + w * i / nx, -0.01, 0), frame, bevel=0))
    for j in range(1, nz): objs.append(cube((w, 0.075, 0.022), (0, -0.01, -h / 2 + h * j / nz), frame, bevel=0))
    xform(objs, M_at(x, y, z, rz=rz)); return objs

def sushi():
    PL = mat('#f2f0f2'); TIM = mat('#5c3b27'); TIM_D = mat('#47301f'); ROOF = mat('#454b5e'); ROOF_D = mat('#383d4e')
    NAVY = mat('#2d3f75'); WAVE = mat('#5d77b3'); WHITE = mat('#fbf7ef'); SALMON = mat('#f08a5d'); GLOW = mat('#ffd9a8', 0.8, emit=0.6)
    SIGN = mat('#9a6b43'); STONE = mat('#6f6f74'); DARK = mat('#2a221d'); BAMBOO = mat('#7fb24a'); LEAF = mat('#5f9e3c'); BOX = mat('#7a5232')
    W, D, H1, H2 = 2.2, 1.9, 1.15, 0.95; FY = -D / 2; Z0 = 0.08
    cube((W + 0.16, D + 0.16, Z0), (0, 0, Z0 / 2), STONE, bevel=0.02)                          # 石の土台
    cube((W, D, H1 + H2), (0, 0, Z0 + (H1 + H2) / 2), PL, bevel=0.01)                          # しっくいの壁
    zt = Z0 + H1 + H2
    # 木組み: 柱・梁（正面と側面）
    for x in (-W / 2, W / 2):
        for y in (FY, D / 2): cube((0.11, 0.11, H1 + H2 + 0.02), (x, y, Z0 + (H1 + H2) / 2), TIM, bevel=0.015)
    for z in (Z0 + 0.04, Z0 + H1, zt - 0.04):
        cube((W + 0.05, 0.09, 0.09), (0, FY - 0.01, z), TIM, bevel=0.015)
        for sx in (-1, 1): cube((0.09, D + 0.05, 0.09), (sx * (W / 2 + 0.01), 0, z), TIM, bevel=0.015)
    for x in (-0.38, 0.32): cube((0.09, 0.09, H1), (x, FY - 0.01, Z0 + H1 / 2), TIM, bevel=0.015)     # 1階の柱
    for x in (0.0,): cube((0.08, 0.08, H2), (x, FY - 0.01, Z0 + H1 + H2 / 2), TIM, bevel=0.015)       # 2階の真ん中の柱
    for sx in (-1, 1): cube((0.08, 0.08, H1 + H2), (sx * (W / 2 + 0.01), 0.0, Z0 + (H1 + H2) / 2), TIM, bevel=0.015)
    # 1階の正面: 左＝下の板壁、中＝入口＋紺ののれん、右＝明るい格子窓
    for k in range(5): cube((0.13, 0.05, 0.45), (-W / 2 + 0.13 + k * 0.14, FY - 0.02, Z0 + 0.27), TIM_D if k % 2 else TIM, bevel=0.01)
    cube((0.62, 0.06, 0.85), (-0.03, FY - 0.0, Z0 + 0.45), DARK, bevel=0.01)                   # 入口の奥
    cyl(0.02, 0.8, (-0.03, FY - 0.1, Z0 + 0.92), TIM_D, rot=(0, math.pi / 2, 0), verts=10, bevel=0)
    for i in range(3):
        x = -0.27 + i * 0.24
        cube((0.22, 0.025, 0.5), (x, FY - 0.1, Z0 + 0.66), NAVY, bevel=0.01)
        for k in range(2): cube((0.22, 0.027, 0.025), (x, FY - 0.105, Z0 + 0.46 + k * 0.05), WAVE, bevel=0.004)  # すその波の柄
    cube((0.1, 0.03, 0.05), (-0.03, FY - 0.12, Z0 + 0.74), WHITE, bevel=0.012)                 # のれんのにぎりの印
    cube((0.11, 0.03, 0.025), (-0.03, FY - 0.125, Z0 + 0.775), SALMON, bevel=0.008)
    lattice(0.75, FY - 0.03, Z0 + 0.55, 0.62, 0.62, TIM_D, GLOW, 5, 5)
    # 1階のひさし（瓦）と、その下の看板
    tile_slope(W + 0.3, 0.46, M_at(0, FY - 0.42, Z0 + H1 + 0.04, rx=0.36), ROOF, ROOF_D)
    cube((W + 0.3, 0.08, 0.06), (0, FY - 0.44, Z0 + H1 + 0.02), ROOF_D, bevel=0.015)
    cube((0.6, 0.05, 0.14), (-0.03, FY - 0.05, Z0 + 1.02), SIGN, bevel=0.02)
    # 2階: 格子窓2つ
    for x in (-0.55, 0.55): lattice(x, FY - 0.03, Z0 + H1 + 0.48, 0.55, 0.45, TIM_D, mat('#f6efe2'), 5, 4)
    # 右の側面: 格子窓（上下）と下の板
    lattice(W / 2 + 0.03, 0.2, Z0 + H1 + 0.48, 0.5, 0.42, TIM_D, mat('#f6efe2'), 4, 4, rz=math.pi / 2)
    lattice(W / 2 + 0.03, 0.35, Z0 + 0.6, 0.5, 0.5, TIM_D, GLOW, 4, 4, rz=math.pi / 2)
    for k in range(7): cube((0.05, 0.13, 0.4), (W / 2 + 0.02, -0.75 + k * 0.14, Z0 + 0.25), TIM_D if k % 2 else TIM, bevel=0.01)
    # 大屋根（切妻・妻が正面）と妻の看板
    pitch = math.radians(33); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.01), zt, gh, PL, sy)
    cube((0.08, 0.06, gh), (0, FY - 0.02, zt + gh / 2), TIM, bevel=0.012)
    cube((W, 0.06, 0.08), (0, FY - 0.02, zt + 0.04), TIM, bevel=0.012)
    for k in range(3): cube((0.55, 0.05, 0.1), (0, FY - 0.06, zt + 0.22 + k * 0.1), SIGN if k != 1 else mat('#8a5e3a'), bevel=0.012)
    for x in (-0.18, 0.18): cube((0.05, 0.06, 0.06), (x, FY - 0.07, zt + 0.16), TIM_D, bevel=0.01)
    for sx in (-1, 1):
        L = (W / 2 + 0.2) / math.cos(pitch)
        cube((L, 0.08, 0.08), (sx * (W / 2 + 0.2) / 2, FY - 0.15, zt + math.tan(pitch) * (W / 2 + 0.2) / 2 - 0.04), TIM_D, bevel=0.02, rot=(0, sx * pitch, 0))
    gable_roof(W, D, zt - 0.06, pitch, 0.2, 0.2, ROOF, ROOF_D, ROOF_D)
    # 煙突は付けない（本人 2026-11-06「寿司屋は煙突なくていい」）
    # 竹の植え込み（入口の右前）
    cube((0.42, 0.18, 0.16), (0.72, FY - 0.25, Z0 + 0.08), BOX, bevel=0.015)
    for k, (dx, h) in enumerate([(-0.13, 0.55), (-0.04, 0.68), (0.06, 0.6), (0.14, 0.5)]):
        cyl(0.012, h, (0.72 + dx, FY - 0.25, Z0 + 0.16 + h / 2), BAMBOO, verts=8, bevel=0)
        for j in range(3): sphere(0.05, (0.72 + dx + (0.04 if j % 2 else -0.04), FY - 0.25, Z0 + 0.16 + h * (0.55 + 0.17 * j)), LEAF, scale=(1.4, 0.4, 0.35), seg=10)

# ── 中華料理屋（見本 chinese.webp＝前のデザイン） ───────────────
def tube(points, r, m, cap=True):
    """点の列に沿った丸い棒（瓦の筋・棟・反り返った飾り）"""
    cu = bpy.data.curves.new('tube', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    cu.use_fill_caps = cap
    sp = cu.splines.new('POLY'); sp.points.add(len(points) - 1)
    for p_, q in zip(sp.points, points): p_.co = (*q, 1)
    o = bpy.data.objects.new('tube', cu); col.objects.link(o); o.data.materials.append(m)
    return o

def curved_roof_patch(eave_a, eave_b, ridge_a, ridge_b, m, nu=14, nv=8, upturn=0.18, sag=1.6, thick=0.06):
    """軒の線と棟の線のあいだを、反りのある面で張る。軒の両はしは上に反り返る"""
    me = bpy.data.meshes.new('roof'); bm = bmesh.new(); grid = []
    for j in range(nv + 1):
        v = j / nv; row = []
        for i in range(nu + 1):
            u = i / nu
            ea = Vector(eave_a).lerp(Vector(eave_b), u); ra = Vector(ridge_a).lerp(Vector(ridge_b), u)
            p_ = ea.lerp(ra, v); p_.z = ea.z + (ra.z - ea.z) * (v ** sag) + upturn * (1 - v) ** 3 * abs(2 * u - 1) ** 6
            row.append(bm.verts.new(p_))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            a, b, c, d = grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]
            if len({a, b, c, d}) == 4: bm.faces.new((a, b, c, d))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('roof', me); col.objects.link(o); finish(o, m)
    o.modifiers.new('s', 'SOLIDIFY').thickness = thick
    def at(u, v):
        ea = Vector(eave_a).lerp(Vector(eave_b), u); ra = Vector(ridge_a).lerp(Vector(ridge_b), u)
        p_ = ea.lerp(ra, v); p_.z = ea.z + (ra.z - ea.z) * (v ** sag) + upturn * (1 - v) ** 3 * abs(2 * u - 1) ** 6
        return p_
    return o, at

def chinese():
    WALL = mat('#f2dcd3'); RED = mat('#c9463d'); RED_D = mat('#a83a33'); GREEN = mat('#8fbf98'); GREEN_D = mat('#79ab84')
    GOLD = mat('#e0b24a', 0.45); CREAM = mat('#f1e3c6'); GLASS = mat('#a9c3d6', 0.3); DARK = mat('#3a2a26'); BROWN = mat('#9a5a3c')
    W, D, H = 2.4, 1.8, 1.15; FY = -D / 2; Z0 = 0.06
    cube((W + 0.1, D + 0.1, Z0), (0, 0, Z0 / 2), mat('#d9c9b8'), bevel=0.015)
    cube((W, D, H), (0, 0, Z0 + H / 2), WALL, bevel=0.02)
    for x, y in [(-W / 2, FY), (W / 2, FY), (-W / 2, D / 2), (W / 2, D / 2), (-0.45, FY - 0.03), (0.45, FY - 0.03)]:
        cyl(0.075, H + 0.04, (x, y, Z0 + H / 2), RED, verts=20, bevel=0.01)
    cube((W + 0.08, 0.1, 0.1), (0, FY - 0.02, Z0 + H - 0.04), RED, bevel=0.02)
    for sx in (-1, 1): cube((0.1, D + 0.08, 0.1), (sx * (W / 2), 0, Z0 + H - 0.04), RED, bevel=0.02)
    # 入口（暗い奥）と赤い枠
    cube((0.78, 0.08, 0.92), (0, FY + 0.0, Z0 + 0.46), DARK, bevel=0.01)
    cube((0.05, 0.1, 0.95), (-0.39, FY - 0.02, Z0 + 0.48), RED_D, bevel=0.01); cube((0.05, 0.1, 0.95), (0.39, FY - 0.02, Z0 + 0.48), RED_D, bevel=0.01)
    # 丸窓（正面2つ・右の側面1つ）
    def porthole(x, y, z, rz=0.0):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.17, minor_radius=0.045, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
        t = finish(bpy.context.object, CREAM); g = cyl(0.16, 0.04, (0, 0.01, 0), GLASS, rot=(math.pi / 2, 0, 0), verts=24, bevel=0.005)
        xform([t, g], M_at(x, y, z, rz=rz))
    for x in (-0.85, 0.85): porthole(x, FY - 0.03, Z0 + 0.58)
    porthole(W / 2 + 0.03, 0.2, Z0 + 0.58, rz=math.pi / 2)
    # 反った屋根（入母屋ふう）: 前後の大きな面＋左右の小さな面
    hw, hd, ze = W / 2 + 0.38, D / 2 + 0.34, Z0 + H + 0.02; rl, zr = 0.55, ze + 0.75
    for sy in (-1, 1):
        o, at = curved_roof_patch((-hw, sy * hd, ze), (hw, sy * hd, ze), (-rl, 0, zr), (rl, 0, zr), GREEN)
        for k in range(1, 18):  # 丸い瓦の筋
            u = k / 18
            pts = [tuple(at(u, v / 8) + Vector((0, 0, 0.045))) for v in range(0, 9)]
            tube(pts, 0.03, GREEN_D if k % 2 else GREEN)
        tube([tuple(at(u / 10, 0) + Vector((0, -sy * 0.0, 0.03))) for u in range(0, 11)], 0.035, GREEN_D)  # 軒先
    for sx in (-1, 1):
        o, at = curved_roof_patch((sx * hw, hd, ze), (sx * hw, -hd, ze), (sx * rl, 0.0001, zr), (sx * rl, -0.0001, zr), GREEN, nu=10, nv=6)
        for k in range(2, 9, 2):
            u = k / 10; tube([tuple(at(u, v / 6) + Vector((0, 0, 0.045))) for v in range(0, 7)], 0.03, GREEN_D)
    # 降り棟（四すみ）と、反り返った先
    for sx in (-1, 1):
        for sy in (-1, 1):
            a = Vector((sx * rl, 0, zr + 0.04)); b = Vector((sx * hw, sy * hd, ze + 0.18 + 0.04))
            pts = [tuple(a.lerp(b, t / 8) + Vector((0, 0, -0.18 * math.sin(math.pi * t / 8) * 0.6))) for t in range(9)]
            tip = Vector(pts[-1]); d = (b - a).normalized(); d.z = 0; d.normalize()
            pts += [tuple(tip + d * 0.12 + Vector((0, 0, 0.12))), tuple(tip + d * 0.14 + Vector((0, 0, 0.24)))]
            tube(pts, 0.05, GREEN_D)
    # 大棟（両はしがくるりと巻く）
    curl = lambda sx: [(sx * (rl + 0.1), 0, zr + 0.12), (sx * (rl + 0.22), 0, zr + 0.26), (sx * (rl + 0.18), 0, zr + 0.4), (sx * (rl + 0.06), 0, zr + 0.42), (sx * (rl + 0.02), 0, zr + 0.32)]
    tube(list(reversed(curl(-1))) + [(-rl, 0, zr + 0.06), (rl, 0, zr + 0.06)] + curl(1), 0.07, GREEN_D)
    # 金の看板（入口の上、屋根にかかる）と飾りの渦
    cube((0.78, 0.07, 0.42), (0, FY - 0.42, Z0 + H + 0.05), GOLD, bevel=0.05, seg=3)
    cube((0.62, 0.075, 0.28), (0, FY - 0.44, Z0 + H + 0.05), mat('#efcf72', 0.45), bevel=0.03)
    for sx in (-1, 1):
        for sz in (-1, 1):
            bpy.ops.mesh.primitive_torus_add(major_radius=0.06, minor_radius=0.022, location=(sx * 0.4, FY - 0.43, Z0 + H + 0.05 + sz * 0.2), rotation=(math.pi / 2, 0, 0))
            finish(bpy.context.object, GOLD)
    # 赤いちょうちん（金の房つき）
    for x in (-W / 2 - 0.05, W / 2 + 0.05):
        lantern(x, FY - 0.22, Z0 + H - 0.38, mat('#d94a3f', 0.6, emit=0.2), mat('#c9973a'), s=1.25)
        cyl(0.035, 0.12, (x, FY - 0.22, Z0 + H - 0.62), GOLD, verts=12, bevel=0.005)
        cyl(0.006, 0.3, (x, FY - 0.22, Z0 + H - 0.08), GOLD, verts=6, bevel=0)
    # 奥の煙突（茶色）
    cube((0.2, 0.2, 0.6), (0.75, 0.55, Z0 + H + 0.55), BROWN, bevel=0.02)
    cube((0.24, 0.24, 0.05), (0.75, 0.55, Z0 + H + 0.86), mat('#8a4f34'), bevel=0.01)

# ── 焼肉屋（見本 yakiniku.webp＝前のデザイン） ───────────────
def half_tube_row(x0, x1, y, z, n, r, m, along='x', tilt=0.35, length=0.32):
    """半円の瓦（スペイン瓦ふう）を一列に並べる"""
    objs = []
    for i in range(n):
        t = (i + 0.5) / n; c = x0 + (x1 - x0) * t
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=length, vertices=16, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
        o = bpy.context.object; bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, -1), clear_outer=True)
        bmesh.ops.holes_fill(bm, edges=bm.edges[:]); bm.to_mesh(o.data); bm.free(); finish(o, m, 0.01, 1)
        o.rotation_euler = (-tilt, 0, 0)
        if along == 'x': o.location = (c, y, z)
        else: o.location = (y, c, z); o.rotation_euler = (0, tilt, math.pi / 2)
        objs.append(o)
    return objs

def yakiniku():
    WOOD = ['#c98756', '#bd7b4c', '#c4824f']; FRAME = mat('#e09a64'); TERRA = mat('#e07b5c'); TERRA_D = mat('#cf6a4d')
    BRICK = ['#d06a4f', '#c45f46', '#d8735a']; GLOW = mat('#f39a5a', 0.7, emit=0.35); RED = mat('#dd5b4e'); SIGNW = mat('#d99a63')
    COPPER = mat('#c97a45', 0.4); STEAM = mat('#ece7f2', 0.9); LEAF = mat('#6fae55'); POT = mat('#c8664a')
    W, D, H1, H2 = 2.2, 2.0, 1.0, 0.85; FY = -D / 2; Z0 = 0.0
    zt = H1 + H2
    cube((W - 0.04, D - 0.04, zt), (0, 0, zt / 2), mat(WOOD[0]), bevel=0.01)
    # 下のれんが（正面・左右）
    for face, (ax, fixed, span) in {'front': ('x', FY - 0.03, W), 'left': ('y', -W / 2 - 0.03, D), 'right': ('y', W / 2 + 0.03, D)}.items():
        for r in range(3):
            n = int(span / 0.2); off = 0.1 if r % 2 else 0
            for k in range(n):
                c = -span / 2 + 0.1 + k * 0.2 + off
                if c > span / 2 - 0.05: continue
                size = (0.19, 0.08, 0.085) if ax == 'x' else (0.08, 0.19, 0.085)
                loc = (c, fixed, 0.045 + r * 0.09) if ax == 'x' else (fixed, c, 0.045 + r * 0.09)
                cube(size, loc, mat(BRICK[(k + r) % 3]), bevel=0.02, seg=1)
    # たて板の壁（正面・左右）
    for ax, fixed, span in (('x', FY - 0.02, W), ('y', -W / 2 - 0.02, D), ('y', W / 2 + 0.02, D)):
        n = int(span / 0.17)
        for k in range(n):
            c = -span / 2 + span * (k + 0.5) / n
            size = (span / n - 0.012, 0.04, zt - 0.3) if ax == 'x' else (0.04, span / n - 0.012, zt - 0.3)
            cube(size, (c, fixed, 0.28 + (zt - 0.3) / 2) if ax == 'x' else (fixed, c, 0.28 + (zt - 0.3) / 2), mat(WOOD[k % 3]), bevel=0.01, seg=1)
    # 柱・梁（明るい木）
    for x in (-W / 2, W / 2):
        for y in (FY, D / 2): cube((0.13, 0.13, zt), (x, y, zt / 2), FRAME, bevel=0.025)
    for z in (0.28, H1):
        cube((W + 0.06, 0.12, 0.1), (0, FY - 0.03, z), FRAME, bevel=0.025)
        for sx in (-1, 1): cube((0.12, D + 0.06, 0.1), (sx * (W / 2 + 0.03), 0, z), FRAME, bevel=0.025)
    # 1階: 左の大きな明るい窓（上に半円瓦のひさし）、右に入口（赤いひさし）
    def glow_window(x, y, z, w, h, rz=0.0, split=2):
        objs = [cube((w + 0.1, 0.07, h + 0.1), (0, 0, 0), FRAME, bevel=0.02), cube((w, 0.075, h), (0, -0.005, 0), GLOW, bevel=0.01)]
        for i in range(1, split): objs.append(cube((0.04, 0.08, h), (-w / 2 + w * i / split, -0.01, 0), FRAME, bevel=0.008))
        xform(objs, M_at(x, y, z, rz=rz))
    glow_window(-0.45, FY - 0.06, 0.64, 0.95, 0.56)
    half_tube_row(-0.98, 0.08, FY - 0.25, H1 + 0.06, 6, 0.085, TERRA, length=0.38)
    cube((0.46, 0.08, 0.66), (0.62, FY - 0.05, 0.6), FRAME, bevel=0.02)
    cube((0.36, 0.085, 0.3), (0.62, FY - 0.06, 0.75), GLOW, bevel=0.01)
    cube((0.36, 0.085, 0.24), (0.62, FY - 0.06, 0.42), mat('#a8673f'), bevel=0.01)
    for i in range(4):  # 赤い布のひさし（ふくらんだ4枚）
        x = 0.62 - 0.33 + i * 0.22
        cube((0.21, 0.42, 0.06), (x, FY - 0.24, H1 - 0.02), RED, bevel=0.03, seg=3, rot=(-0.38, 0, 0))
        cyl(0.03, 0.21, (x, FY - 0.44, H1 - 0.1), RED, rot=(0, math.pi / 2, 0), verts=12, bevel=0.01)
    glow_window(W / 2 + 0.06, 0.15, 0.64, 1.1, 0.56, rz=math.pi / 2, split=2)
    # 2階: 窓（正面左・右側面）と、丸い看板（炎とお肉）
    glow_window(-0.55, FY - 0.06, H1 + 0.42, 0.7, 0.42)
    glow_window(W / 2 + 0.06, 0.25, H1 + 0.42, 0.9, 0.42, rz=math.pi / 2)
    cube((0.8, 0.08, 0.36), (0.38, FY - 0.08, H1 + 0.4), SIGNW, bevel=0.06, seg=3)
    half_disc(0.38, FY - 0.08, H1 + 0.58, 0.4, SIGNW, depth=0.08)
    o = bpy.context.object; o.rotation_euler = (0, 0, 0); o.scale = (1, 1, -0.45)
    # 看板の絵: 炎（3つの玉）と骨つき肉（大きめ・前に浮かせる）
    for k, (dx, dz, r) in enumerate([(0, 0, 0.09), (0.0, 0.1, 0.065), (0.0, 0.18, 0.04)]): sphere(r, (0.2 + dx, FY - 0.16, H1 + 0.36 + dz), mat('#f07a3a'), scale=(1, 0.35, 1.25), seg=12)
    sphere(0.05, (0.2, FY - 0.19, H1 + 0.34), mat('#ffd08a'), scale=(1, 0.35, 1.2), seg=10)
    sphere(1, (0.56, FY - 0.16, H1 + 0.4), mat('#a9583a'), scale=(0.17, 0.035, 0.11), seg=16)
    for k in range(3): cube((0.014, 0.02, 0.15), (0.5 + k * 0.06, FY - 0.195, H1 + 0.4), mat('#6e3520'), bevel=0, rot=(0, 0.6, 0))
    cube((0.035, 0.03, 0.42), (0.56, FY - 0.17, H1 + 0.4), mat('#f1d6a8'), bevel=0.006, rot=(0, math.pi / 2 - 0.25, 0))
    # 屋上: ふち（太い）・床・正面と左の半円瓦の列
    cube((W + 0.18, D + 0.18, 0.08), (0, 0, zt + 0.02), TERRA, bevel=0.02)
    for sx in (-1, 1): cube((0.14, D + 0.18, 0.16), (sx * (W / 2 + 0.02), 0, zt + 0.12), TERRA, bevel=0.03)
    for sy in (-1, 1): cube((W + 0.18, 0.14, 0.16), (0, sy * (D / 2 + 0.02), zt + 0.12), TERRA, bevel=0.03)
    half_tube_row(-W / 2 - 0.02, W / 2 + 0.02, FY - 0.08, zt + 0.06, 11, 0.1, TERRA_D, length=0.36)
    # 銅のパイプ（曲がった排気口）2本・まっすぐ1本と、れんがの煙突。湯気
    for (x, y) in ((-0.55, -0.2), (-0.15, 0.15)):
        cyl(0.07, 0.3, (x, y, zt + 0.25), COPPER, verts=16)
        bpy.ops.mesh.primitive_torus_add(major_radius=0.12, minor_radius=0.065, location=(x + 0.12, y, zt + 0.4), rotation=(math.pi / 2, 0, 0))
        o = bpy.context.object; bm = bmesh.new(); bm.from_mesh(o.data)
        bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x + 0.12 - x - 0.12, 0, 0), plane_no=(0, 0, -1), clear_outer=True)
        bm.to_mesh(o.data); bm.free(); finish(o, COPPER)
        cyl(0.07, 0.12, (x + 0.24, y, zt + 0.34), COPPER, verts=16)
        cyl(0.1, 0.05, (x, y, zt + 0.12), COPPER, verts=16)
    cyl(0.07, 0.25, (0.35, -0.25, zt + 0.22), COPPER, verts=16); cyl(0.1, 0.05, (0.35, -0.25, zt + 0.12), COPPER, verts=16)
    for k in range(3):
        for j in range(2): cube((0.13, 0.27, 0.1), (0.72 - 0.07 + j * 0.14, 0.35, zt + 0.16 + k * 0.11), mat(BRICK[(k + j) % 3]), bevel=0.02)
    for (x, y, base) in ((-0.43, -0.2, zt + 0.42), (0.35, -0.25, zt + 0.4), (0.72, 0.35, zt + 0.5)):
        for k, (dz, r) in enumerate([(0.05, 0.07), (0.16, 0.1), (0.3, 0.12)]): sphere(r, (x + 0.03 * k, y, base + dz), STEAM, seg=12)
    # 植木（とげとげの葉）
    for (x, y) in ((0.05, FY - 0.22), (W / 2 - 0.1, FY - 0.22)):
        cube((0.2, 0.16, 0.14), (x, y, 0.07), POT, bevel=0.02)
        for k in range(5):
            a = k * math.tau / 5
            bpy.ops.mesh.primitive_cone_add(radius1=0.03, depth=0.2, location=(x + 0.04 * math.cos(a), y + 0.04 * math.sin(a), 0.22), rotation=(0.35 * math.sin(a), -0.35 * math.cos(a), 0))
            finish(bpy.context.object, LEAF)

# ── 洋食・イタリアン（見本 western.webp＝前のデザイン） ───────────
def brick_face(ax, fixed, span, z0, z1, cols, bh=0.1, bw=0.2, depth=0.05, skip=None):
    """れんがを積んだ面（ax='x' は正面向き、'y' は側面向き）。skip(c, z) が真の所は積まない（窓や戸の穴）"""
    rows = int((z1 - z0) / bh)
    for r in range(rows):
        z = z0 + bh * (r + 0.5); off = bw / 2 if r % 2 else 0
        n = int(span / bw) + 1
        for k in range(n):
            c = -span / 2 + bw * (k + 0.5) - off
            lo, hi = max(c - bw / 2, -span / 2), min(c + bw / 2, span / 2)
            if hi - lo < 0.03: continue
            c = (lo + hi) / 2
            if skip and skip(c, z): continue
            size = (hi - lo - 0.012, depth, bh - 0.012) if ax == 'x' else (depth, hi - lo - 0.012, bh - 0.012)
            cube(size, (c, fixed, z) if ax == 'x' else (fixed, c, z), mat(cols[(k * 3 + r * 7) % len(cols)]), bevel=0.012, seg=1)

def arch_win(x, y, z, w, h, frame, glass, rz=0.0, door=False):
    """上が半円の窓（door=True で木の両開き戸）"""
    objs = [cube((w + 0.08, 0.07, h), (0, 0, 0), frame, bevel=0.015)]
    t = half_disc(0, 0, h / 2, w / 2 + 0.04, frame, depth=0.07); t.rotation_euler = (0, math.pi, 0); objs.append(t)
    inner = mat('#9a643c') if door else glass
    objs.append(cube((w - 0.02, 0.075, h - 0.04), (0, -0.005, 0), inner, bevel=0.008))
    t2 = half_disc(0, -0.005, h / 2 - 0.02, w / 2 - 0.01, inner, depth=0.075); t2.rotation_euler = (0, math.pi, 0); objs.append(t2)
    if door: objs.append(cube((0.02, 0.08, h + w / 2 - 0.06), (0, -0.01, w / 4 - 0.02), frame, bevel=0))
    else: objs.append(cube((w + 0.14, 0.1, 0.05), (0, -0.04, -h / 2 - 0.03), frame, bevel=0.015))
    xform(objs, M_at(x, y, z, rz=rz)); return objs

def western():
    BR = ['#dc9c8f', '#d29083', '#e3a698', '#cf8a80']; FRAME = mat('#c98b52'); GLASS = mat('#c6dcef', 0.3)
    ROOF = mat('#8fbf7f'); ROOF_D = mat('#7cad6c'); WHITE = mat('#f6f4ee'); GREEN = mat('#7db36a'); CHAIR = mat('#b9cbd6')
    CHIM = mat('#b9774f'); SIGN = mat('#cf9358'); TAB = mat('#c4d4de')
    W, D, H = 2.1, 1.9, 1.95; FY = -D / 2
    cube((W - 0.06, D - 0.06, H), (0, 0, H / 2), mat(BR[0]), bevel=0.01)
    # 窓と戸の位置（ここはれんがを積まない）
    holes_f = [(-0.55, 0.62, 0.3, 0.5), (0.55, 0.62, 0.3, 0.5), (0.0, 0.55, 0.42, 0.9), (-0.6, 1.5, 0.3, 0.45), (0.0, 1.5, 0.3, 0.45), (0.6, 1.5, 0.3, 0.45)]
    holes_s = [(0.35, 0.62, 0.3, 0.5), (-0.4, 1.5, 0.3, 0.45), (0.4, 1.5, 0.3, 0.45)]
    sk = lambda holes: (lambda c, z: any(abs(c - hx) < hw / 2 + 0.02 and hz - hh / 2 - 0.05 < z < hz + hh / 2 + hw / 2 + 0.02 for hx, hz, hw, hh in holes))
    brick_face('x', FY - 0.02, W, 0, H, BR, skip=sk(holes_f))
    brick_face('y', W / 2 + 0.02, D, 0, H, BR, skip=sk(holes_s))
    brick_face('y', -W / 2 - 0.02, D, 0, H, BR)
    cube((W + 0.08, D + 0.08, 0.09), (0, 0, 1.08), mat('#e8b3a6'), bevel=0.02)               # 階の間の帯
    for hx, hz, hw, hh in holes_f:
        arch_win(hx, FY - 0.05, hz, hw, hh, FRAME, GLASS, door=(hz < 0.6 and hw > 0.4))
    for hx, hz, hw, hh in holes_s:
        arch_win(W / 2 + 0.05, hx, hz, hw, hh, FRAME, GLASS, rz=math.pi / 2)
    # 緑と白のしまのひさし（戸の上）と看板
    awning(0.7, 6, 0.32, 0.5, GREEN, WHITE, M_at(0.0, FY - 0.06, 1.0))
    for k in range(3): cube((0.5, 0.05, 0.075), (0.0, FY - 0.07, 1.24 + k * 0.075 - 0.075), SIGN if k != 1 else mat('#c08549'), bevel=0.012, rot=(0, (k - 1) * 0.04, 0))
    # 屋根（切妻・妻が正面、板ぶき）
    zt = H; pitch = math.radians(38); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.02), zt, gh, mat(BR[1]), sy)
    half = W / 2 + 0.14; run = half / math.cos(pitch)
    for sx in (-1, 1):
        objs = [cube((D + 0.3, run, 0.08), (0, run / 2, 0), ROOF, bevel=0.03)]
        for k in range(5): objs.append(cube((D + 0.32, 0.03, 0.03), (0, run * (k + 0.5) / 5, 0.045), ROOF_D, bevel=0.01))
        xform(objs, M_at(sx * half, 0, zt - 0.04, rz=(math.pi / 2 if sx > 0 else -math.pi / 2), rx=pitch))
    rz = zt - 0.04 + math.tan(pitch) * half
    cube((0.14, D + 0.34, 0.12), (0, 0, rz + 0.02), ROOF_D, bevel=0.04)
    cube((0.35, 0.35, 0.55), (-0.5, 0.35, zt + 0.55), CHIM, bevel=0.03)
    cube((0.42, 0.42, 0.1), (-0.5, 0.35, zt + 0.85), ROOF, bevel=0.03)
    # テラス: 低いれんがの塀と、白い丸テーブル＋水色のいす
    TY0, TY1 = FY - 0.95, FY - 0.05
    brick_face('x', TY0, W + 0.1, 0, 0.3, BR, bh=0.1, depth=0.14)
    brick_face('y', -W / 2 - 0.0, 0.9, 0, 0.3, BR, bh=0.1, depth=0.14) if False else None
    for sx in (-1, 1):
        objs = []
        for r in range(3):
            for k in range(5):
                objs.append(cube((0.14, 0.17, 0.088), (0, -0.09 - k * 0.18 - (0.09 if r % 2 else 0), 0.05 + r * 0.1), mat(BR[(k + r) % 4]), bevel=0.012, seg=1))
        xform(objs, M_at(sx * (W / 2 + 0.02), FY, 0))
    cube((W + 0.1, 0.95, 0.03), (0, (TY0 + TY1) / 2, 0.015), mat('#e7d8c9'), bevel=0.005)
    for (x, y) in ((-0.65, FY - 0.5), (0.6, FY - 0.5)):
        cyl(0.17, 0.03, (x, y, 0.36), TAB, verts=24, bevel=0.01); cyl(0.02, 0.34, (x, y, 0.18), TAB, verts=8, bevel=0)
        for dx in (-0.24, 0.24):
            cube((0.14, 0.14, 0.03), (x + dx, y, 0.22), CHAIR, bevel=0.01)
            cube((0.03, 0.14, 0.2), (x + dx * 1.45, y, 0.33), CHAIR, bevel=0.01)
            for lx in (-0.05, 0.05):
                for ly in (-0.05, 0.05): cube((0.015, 0.015, 0.21), (x + dx + lx, y + ly, 0.105), CHAIR, bevel=0)

# ── スイーツの店（見本 cake.webp＝前のデザイン） ───────────────
def stripes_face(ax, fixed, span, z0, z1, c1, c2, n, depth=0.04):
    for k in range(n):
        c = -span / 2 + span * (k + 0.5) / n
        size = (span / n + 0.002, depth, z1 - z0) if ax == 'x' else (depth, span / n + 0.002, z1 - z0)
        cube(size, (c, fixed, (z0 + z1) / 2) if ax == 'x' else (fixed, c, (z0 + z1) / 2), c1 if k % 2 == 0 else c2, bevel=0.004, seg=1)

def cake():
    PINK = mat('#e8a3b4'); PINKW = mat('#f7e3e8'); TRIM = mat('#f6e9ee'); CREAM = mat('#f6e3bd'); CREAM_D = mat('#efd6a6')
    GLASS = mat('#b9c8e6', 0.3); CURT = mat('#ffffff'); WOOD = mat('#c27e64'); DOOR = mat('#cf8a74'); GLOW = mat('#fff1e2', 0.7, emit=0.4)
    STRAW = mat('#e45a63'); LEAF = mat('#6fb35a')
    W, D, H1, H2 = 2.1, 2.0, 1.0, 0.85; FY = -D / 2; zt = H1 + H2
    cube((W - 0.04, D - 0.04, zt), (0, 0, zt / 2), PINKW, bevel=0.01)
    for ax, fixed, span in (('x', FY - 0.02, W), ('y', -W / 2 - 0.02, D), ('y', W / 2 + 0.02, D)):
        stripes_face(ax, fixed, span, 0.1, zt - 0.05, PINK, PINKW, 13)
    cube((W + 0.1, D + 0.1, 0.12), (0, 0, 0.06), TRIM, bevel=0.03)                             # 足もとの帯
    cube((W + 0.1, D + 0.1, 0.09), (0, 0, H1), TRIM, bevel=0.035)                              # 階の間の帯（太く丸い）
    # 屋根: クリーム色の平らなふち＋低い四角すい。ふちの下にぎざぎざの飾り
    cube((W + 0.3, D + 0.3, 0.12), (0, 0, zt + 0.05), CREAM, bevel=0.05)
    me = bpy.data.meshes.new('pyr'); bm = bmesh.new()
    a, b = (W - 0.05) / 2, (D - 0.05) / 2
    v = [bm.verts.new(p_) for p_ in [(-a, -b, 0), (a, -b, 0), (a, b, 0), (-a, b, 0), (0, 0, 0.55)]]
    for f in [(0, 1, 4), (1, 2, 4), (2, 3, 4), (3, 0, 4), (3, 2, 1, 0)]: bm.faces.new([v[i] for i in f])
    bm.to_mesh(me); bm.free(); pyr = bpy.data.objects.new('pyr', me); col.objects.link(pyr); pyr.location = (0, 0, zt + 0.1); finish(pyr, CREAM_D, 0.04, 3)
    for ax, fixed, span in (('x', FY - 0.12, W + 0.2), ('y', -W / 2 - 0.12, D + 0.2), ('y', W / 2 + 0.12, D + 0.2)):
        n = int(span / 0.13)
        for k in range(n):
            c = -span / 2 + span * (k + 0.5) / n
            cube((0.08, 0.05, 0.08) if ax == 'x' else (0.05, 0.08, 0.08), (c, fixed, zt - 0.04) if ax == 'x' else (fixed, c, zt - 0.04), TRIM, bevel=0.02)
    # 丸い四角の窓（白い枠＋カーテン）
    def win(x, y, z, rz=0.0):
        objs = [cube((0.46, 0.1, 0.46), (0, 0, 0), TRIM, bevel=0.09, seg=3), cube((0.32, 0.105, 0.32), (0, -0.005, 0), GLASS, bevel=0.05, seg=2)]
        for sx in (-1, 1): objs.append(cube((0.09, 0.11, 0.3), (sx * 0.1, -0.01, -0.01), CURT, bevel=0.025))
        xform(objs, M_at(x, y, z, rz=rz))
    for x in (-0.6, 0.1): win(x, FY - 0.05, H1 + 0.45)
    for y in (-0.45, 0.45): win(W / 2 + 0.05, y, H1 + 0.45, rz=math.pi / 2)
    for y in (-0.25, 0.5): win(W / 2 + 0.05, y, 0.55, rz=math.pi / 2)
    # 1階の正面: ケーキのショーウインドウ（左）＋戸（右）
    cube((0.95, 0.08, 0.62), (-0.45, FY - 0.04, 0.5), WOOD, bevel=0.02)
    cube((0.85, 0.085, 0.52), (-0.45, FY - 0.05, 0.52), GLOW, bevel=0.01)
    cube((0.95, 0.16, 0.06), (-0.45, FY - 0.08, 0.2), WOOD, bevel=0.015)
    for k in range(1, 3): cube((0.025, 0.09, 0.52), (-0.45 - 0.425 + 0.85 * k / 3, FY - 0.06, 0.52), WOOD, bevel=0)
    cube((0.85, 0.12, 0.02), (-0.45, FY - 0.04, 0.5), WOOD, bevel=0.003)                       # 棚
    for i, x in enumerate((-0.75, -0.55, -0.35, -0.15)):                                          # ケーキ（大きめだけ）
        for z in (0.32, 0.53):
            cyl(0.06, 0.06, (x, FY - 0.08, z), mat('#fff3e0'), verts=16, bevel=0.01)
            sphere(0.022, (x, FY - 0.08, z + 0.05), STRAW, seg=8)
    cube((0.38, 0.07, 0.78), (0.45, FY - 0.04, 0.47), DOOR, bevel=0.02)
    cube((0.28, 0.075, 0.3), (0.45, FY - 0.05, 0.62), mat('#e4a493'), bevel=0.01)
    sphere(0.025, (0.58, FY - 0.09, 0.45), mat('#e7c36a'), seg=8)
    # ピンクのしまのひさし（ショーウインドウの上）
    awning(1.15, 9, 0.38, 0.45, PINK, PINKW, M_at(-0.4, FY - 0.06, 0.95))
    # いちごの吊り看板（戸の横）
    cube((0.035, 0.32, 0.035), (0.75, FY - 0.17, 0.92), WOOD, bevel=0.008)
    cube((0.2, 0.05, 0.2), (0.82, FY - 0.3, 0.76), mat('#f6e9dc'), bevel=0.03)
    sphere(0.055, (0.82, FY - 0.335, 0.75), STRAW, scale=(1, 0.5, 1.15), seg=12)
    sphere(0.03, (0.82, FY - 0.34, 0.81), LEAF, scale=(1.3, 0.5, 0.6), seg=8)

# ── パン屋（見本 bakery.webp＝前のデザイン） ─────────────────
def planks_face(ax, fixed, span, z0, z1, cols, ph=0.12, depth=0.05):
    rows = int((z1 - z0) / ph)
    for r in range(rows):
        z = z0 + ph * (r + 0.5)
        size = (span, depth, ph - 0.014) if ax == 'x' else (depth, span, ph - 0.014)
        cube(size, (0, fixed, z) if ax == 'x' else (fixed, 0, z), mat(cols[r % len(cols)]), bevel=0.02, seg=1)

def bakery():
    YEL = ['#f2d27e', '#ecc871', '#f5d98d']; POST = mat('#e6bd6c'); ROOF = mat('#b8683f'); ROOF_D = mat('#a65b35')
    FRAME = mat('#b9733f'); GLASS = mat('#d6e5f2', 0.3); BASE = mat('#a8653b'); BR = ['#c9824f', '#bd7646', '#d08a57']
    BROWN = mat('#a8653b'); CREAM = mat('#f4dc94'); SIGN = mat('#b5713f')
    W, D, H = 2.1, 1.9, 1.1; FY = -D / 2
    cube((W - 0.04, D - 0.04, H), (0, 0, H / 2), mat(YEL[0]), bevel=0.01)
    cube((W + 0.12, D + 0.12, 0.14), (0, 0, 0.07), BASE, bevel=0.03)
    holes_f = [(-0.6, 0.55, 0.3, 0.32), (0.0, 0.42, 0.5, 0.62), (0.58, 0.55, 0.3, 0.32)]
    planks_face('x', FY - 0.02, W, 0.14, H, YEL); planks_face('y', -W / 2 - 0.02, D, 0.14, H, YEL); planks_face('y', W / 2 + 0.02, D, 0.14, H, YEL)
    for x in (-W / 2, W / 2):
        for y in (FY, D / 2): cube((0.12, 0.12, H + 0.04), (x, y, H / 2 + 0.02), POST, bevel=0.03)
    for hx, hz, hw, hh in holes_f: arch_win(hx, FY - 0.06, hz, hw, hh, FRAME, GLASS, door=(hw > 0.4))
    for y in (-0.35, 0.4): arch_win(W / 2 + 0.06, y, 0.55, 0.28, 0.32, FRAME, GLASS, rz=math.pi / 2)
    awning(0.82, 6, 0.3, 0.55, BROWN, CREAM, M_at(0.0, FY - 0.07, 0.98))
    # 妻（三角・板張り）と看板
    zt = H; pitch = math.radians(36); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.02), zt, gh, mat(YEL[1]), sy)
    for k in range(int(gh / 0.12)):
        z = zt + 0.06 + k * 0.12; w = W * (1 - (z - zt + 0.06) / gh)
        if w > 0.15: cube((w, 0.05, 0.105), (0, FY - 0.03, z), mat(YEL[k % 3]), bevel=0.02, seg=1)
    for k in range(3): cube((0.62, 0.05, 0.085), (0, FY - 0.07, zt + 0.3 + k * 0.09), SIGN if k != 1 else mat('#a8663a'), bevel=0.015, rot=(0, (k - 1) * 0.03, 0))
    for x in (-0.24, 0.24): cube((0.05, 0.06, 0.38), (x, FY - 0.08, zt + 0.39), BROWN, bevel=0.012)
    # 板ぶきの屋根
    half = W / 2 + 0.16; run = half / math.cos(pitch)
    for sx in (-1, 1):
        objs = [cube((D + 0.32, run, 0.1), (0, run / 2, 0), ROOF, bevel=0.035)]
        for k in range(6): objs.append(cube((0.03, run, 0.03), (-(D + 0.3) / 2 + (D + 0.3) * (k + 0.5) / 6, run / 2, 0.055), ROOF_D, bevel=0.01))
        xform(objs, M_at(sx * half, 0, zt - 0.03, rz=(math.pi / 2 if sx > 0 else -math.pi / 2), rx=pitch))
    rz = zt - 0.03 + math.tan(pitch) * half
    cube((0.16, D + 0.36, 0.14), (0, 0, rz + 0.03), ROOF_D, bevel=0.05)
    # れんがの煙突（見える側の斜面）
    for k in range(4):
        for j in range(2): cube((0.17, 0.34, 0.12), (-0.5 - 0.085 + j * 0.17, 0.35, zt + 0.42 + k * 0.13), mat(BR[(k + j) % 3]), bevel=0.025)
    cube((0.42, 0.42, 0.1), (-0.5, 0.35, zt + 0.95), mat(BR[0]), bevel=0.03)
    cube((0.24, 0.24, 0.11), (-0.5, 0.35, zt + 0.96), mat('#5a3a2a'), bevel=0.01)

# ── その他（見本 shop-other-restaurant.png、2026-11-07 シロ作・オーナー承認）
# ごく普通のレストラン風: クリーム色の四角い建物・木の平屋根・赤白しまのひさし2つ・格子の窓・ガラス戸・テラス席。看板・文字なし
def mystery():
    WALL = mat('#f3e6cc'); WOOD = mat('#b8794a'); WOOD_D = mat('#9c6239'); RED = mat('#e0605a'); WHITE = mat('#f7f1e6')
    GLOW = mat('#f7dcae', 0.7, emit=0.4); STONE = mat('#d9d2c8'); POT = mat('#c4835a'); LEAF = mat('#7aa45e'); BRASS = mat('#c9a35c', 0.4)
    W, D, H = 1.9, 1.8, 1.55; FY = -D / 2; LX = -W / 2
    cube((W, D, H), (0, 0, H / 2), WALL, bevel=0.04, seg=3)
    cube((W + 0.06, D + 0.06, 0.14), (0, 0, 0.07), WOOD, bevel=0.03)                              # 足もとの木の帯
    # 平らな屋根: 上はかべと同じクリーム色、まわりだけ木のふち（見本どおり）
    for (sx, sy, lx, ly) in ((0, -1, W + 0.24, 0.14), (0, 1, W + 0.24, 0.14), (-1, 0, 0.14, D + 0.02), (1, 0, 0.14, D + 0.02)):
        cube((lx, ly, 0.13), (sx * (W / 2 + 0.05), sy * (D / 2 + 0.05), H + 0.03), WOOD, bevel=0.04, seg=3)
    def grid_window(cx, cz, w, h, nx, nz, face, sill=False):
        """木の格子窓。face='front'（-Y）/'left'（-X）"""
        objs = [cube((w + 0.1, 0.08, h + 0.1), (0, 0, 0), WOOD, bevel=0.02), cube((w, 0.085, h), (0, -0.005, 0), GLOW, bevel=0.006)]
        for k in range(1, nx): objs.append(cube((0.03, 0.09, h), (-w / 2 + w * k / nx, -0.01, 0), WOOD, bevel=0.004))
        for k in range(1, nz): objs.append(cube((w, 0.09, 0.03), (0, -0.01, -h / 2 + h * k / nz), WOOD, bevel=0.004))
        if sill: objs.append(cube((w + 0.3, 0.16, 0.06), (0, -0.07, -h / 2 - 0.08), WOOD, bevel=0.02))
        M = M_at(cx, FY - 0.02, cz) if face == 'front' else M_at(LX - 0.02, cx, cz, rz=-math.pi / 2)
        xform(objs, M); return objs
    def pot(x, y, z, succulent=False):
        lathe([(0, 0), (0.05, 0), (0.065, 0.1), (0.072, 0.11), (0, 0.11)], (x, y, z), POT, steps=14)
        for k in range(5 if succulent else 4):
            a = k * math.tau / (5 if succulent else 4)
            sphere(0.035, (x + math.cos(a) * 0.025, y + math.sin(a) * 0.025, z + 0.16 + (k % 2) * 0.03), LEAF, scale=(0.6, 0.6, 1.4) if succulent else (1, 1, 1), seg=8)
    # 左の側面: 大きな格子窓＋窓台の鉢＋しまのひさし
    grid_window(0.0, 0.85, 1.1, 0.85, 3, 3, 'left', sill=True)
    for y in (-0.42, 0.42): pot(LX - 0.1, y, 0.36, succulent=(y < 0))
    awning(1.35, 12, 0.42, 0.55, RED, WHITE, M_at(LX - 0.04, 0.0, 1.42, rz=-math.pi / 2))
    cube((0.06, 1.4, 0.06), (LX - 0.05, 0.0, 1.46), WOOD, bevel=0.015)
    # 正面: ガラスの戸（左）＋格子窓（右）＋しまのひさし
    DX = -0.45
    xform([cube((0.5, 0.08, 1.05), (0, 0, 0), WOOD, bevel=0.02), cube((0.38, 0.085, 0.92), (0, -0.005, 0.0), GLOW, bevel=0.006)]
          + [cube((0.025, 0.09, 0.92), (0, -0.01, 0), WOOD, bevel=0)]
          + [cube((0.38, 0.09, 0.025), (0, -0.01, -0.46 + 0.92 * k / 6), WOOD, bevel=0) for k in range(1, 6)], M_at(DX, FY - 0.02, 0.14 + 0.53))
    sphere(0.025, (DX + 0.17, FY - 0.09, 0.6), BRASS, seg=8)
    grid_window(0.42, 0.85, 0.55, 0.65, 2, 4, 'front')
    awning(1.7, 14, 0.42, 0.55, RED, WHITE, M_at(0.0, FY - 0.04, 1.42))
    cube((1.75, 0.06, 0.06), (0.0, FY - 0.05, 1.46), WOOD, bevel=0.015)
    # 戸の前の石の踏み段とテラス（丸テーブル＋いす2つ＋鉢）
    cube((1.5, 0.7, 0.05), (0.2, FY - 0.36, 0.025), STONE, bevel=0.01)
    TX, TY = 0.42, FY - 0.42
    cyl(0.17, 0.03, (TX, TY, 0.43), WOOD, verts=20, bevel=0.008); cyl(0.022, 0.4, (TX, TY, 0.22), WOOD_D, verts=8, bevel=0)
    cyl(0.09, 0.02, (TX, TY, 0.06), WOOD_D, verts=14, bevel=0.005)
    cyl(0.04, 0.012, (TX + 0.06, TY, 0.455), WHITE, verts=12, bevel=0.003)
    for dx in (-0.3, 0.3):
        cube((0.18, 0.18, 0.03), (TX + dx, TY, 0.27), WOOD, bevel=0.01)
        cube((0.03, 0.18, 0.28), (TX + dx * 1.35, TY, 0.42), WOOD, bevel=0.01)
        for lx in (-0.07, 0.07):
            for ly in (-0.07, 0.07): cube((0.02, 0.02, 0.26), (TX + dx + lx, TY + ly, 0.14), WOOD_D, bevel=0)
    pot(TX + 0.02, TY - 0.02, 0.445, succulent=False)
    for (x, y, s) in ((0.95, FY - 0.6, False), (0.25, FY - 0.7, True), (-0.12, FY - 0.25, False), (LX - 0.15, FY - 0.1, True)):
        lathe([(0, 0), (0.07, 0), (0.09, 0.14), (0.1, 0.155), (0, 0.155)], (x, y, 0.05), POT, steps=14)
        for k in range(5):
            a = k * math.tau / 5
            sphere(0.05, (x + math.cos(a) * 0.035, y + math.sin(a) * 0.035, 0.27 + (k % 2) * 0.04), LEAF, scale=(0.6, 0.6, 1.4) if s else (1, 1, 1), seg=8)

# ── 横長の切妻屋根（棟が左右＝長い面が正面） ─────────────────
def side_gable_roof(W, D, z, pitch, ox, oy, roof, roof_d, ridge):
    half = D / 2 + oy; run = half / math.cos(pitch)
    for sy in (-1, 1):
        tile_slope(W + 2 * ox, run, M_at(0, sy * half, z, rz=(0 if sy < 0 else math.pi), rx=pitch), roof, roof_d)
    rz = z + math.tan(pitch) * half + 0.06
    cyl(0.07, W + 2 * ox + 0.04, (0, 0, rz), ridge, rot=(0, math.pi / 2, 0), verts=14)
    for sx in (-1, 1): cyl(0.09, 0.06, (sx * (W / 2 + ox + 0.03), 0, rz), ridge, rot=(0, math.pi / 2, 0), verts=16)
    return rz

def side_gable_walls(W, D, z, pitch, m):
    gh = math.tan(pitch) * (D / 2)
    for sx in (-1, 1):
        me = bpy.data.meshes.new('g'); bm = bmesh.new()
        v = [bm.verts.new((0, -D / 2, 0)), bm.verts.new((0, D / 2, 0)), bm.verts.new((0, 0, gh))]
        bm.faces.new(v if sx > 0 else v[::-1]); bm.to_mesh(me); bm.free()
        g = bpy.data.objects.new('g', me); col.objects.link(g); g.location = (sx * (W / 2 - 0.02), 0, z); finish(g, m)
        g.modifiers.new('s', 'SOLIDIFY').thickness = 0.06
    return gh

def open_counter(x0, x1, fy, depth, H, WOOD, WOOD2, INSIDE, items=None, stools=3, back_shelf=True):
    """正面のあいた所: 明るい奥の壁・腰板・カウンター・棚・いす（中は大きいものだけ）"""
    cx = (x0 + x1) / 2; cw = x1 - x0
    cube((cw, 0.05, H), (cx, fy + depth, H / 2 + 0.06), INSIDE, bevel=0.005)
    cube((cw, depth, 0.03), (cx, fy + depth / 2, 0.075), WOOD2, bevel=0.005)
    for k in range(int(cw / 0.1)): cube((0.09, 0.05, 0.42), (x0 + 0.05 + k * 0.1, fy + 0.04, 0.27), WOOD if k % 2 else WOOD2, bevel=0.008)
    cube((cw + 0.04, 0.28, 0.05), (cx, fy + 0.12, 0.5), WOOD, bevel=0.012)
    if back_shelf:
        for z in (0.78, 1.0): cube((cw - 0.12, 0.16, 0.035), (cx, fy + depth - 0.1, z), WOOD, bevel=0.008)
    for i, (x, z, kind) in enumerate(items or []):
        if kind == 'bowl': lathe([(0, 0), (0.035, 0), (0.06, 0.025), (0.065, 0.05), (0, 0.045)], (x, fy + depth - 0.1, z + 0.02), mat('#e9e2d6'), steps=14)
        elif kind == 'jar': cyl(0.045, 0.1, (x, fy + depth - 0.1, z + 0.07), mat('#a77b59'), verts=12, bevel=0.01)
        elif kind == 'plate': cyl(0.07, 0.015, (x, fy + 0.15, 0.535), mat('#efe9df'), verts=16, bevel=0.004)
    xs = [x0 + cw * (i + 0.5) / stools for i in range(stools)]
    for x in xs:
        cyl(0.085, 0.035, (x, fy - 0.22, 0.34), WOOD, verts=18, bevel=0.01)
        for a in range(4):
            ang = a * math.tau / 4 + 0.4
            cube((0.022, 0.022, 0.32), (x + math.cos(ang) * 0.055, fy - 0.22 + math.sin(ang) * 0.055, 0.17), WOOD2, bevel=0.005)

# ── そば・うどん屋（見本 soba.webp＝ジオラマ版） ─────────────────
def soba():
    PL = mat('#f3f1ec'); TIM = mat('#6b4630'); TIM_D = mat('#553724'); ROOF = mat('#4c4f58'); ROOF_D = mat('#3f424a')
    LINEN = mat('#e9dcc4', 0.9); WOOD = mat('#c08a58'); WOOD2 = mat('#a8774a'); INSIDE = mat('#f2e6d2', 0.8, emit=0.25)
    STONE = mat('#9b9a98'); STONE_D = mat('#82817f'); SIGN = mat('#7a5136'); WHITE = mat('#f4efe6'); BASKET = mat('#c9a066')
    W, D, H = 2.8, 1.6, 1.55; FY = -D / 2; HO = 1.15  # HO: 店の開口の上端
    cube((W + 0.1, D + 0.1, 0.06), (0, 0, 0.03), mat('#cfc8bd'), bevel=0.01)
    # 壁（左の部分と奥・側面）。右の 0.15〜1.3 は店の中が見える
    cube((W, 0.06, H), (0, D / 2 - 0.03, H / 2 + 0.06), PL, bevel=0.01)
    for sx in (-1, 1): cube((0.06, D, H), (sx * (W / 2 - 0.03), 0, H / 2 + 0.06), PL, bevel=0.01)
    cube((W / 2 + 0.15, 0.06, H), (-(W / 2 - 0.15) / 2 - 0.0, FY + 0.03, H / 2 + 0.06), PL, bevel=0.01)
    cube((W / 2 - 0.15, 0.06, H - HO), ((W / 2 + 0.15) / 2, FY + 0.03, HO + (H - HO) / 2 + 0.06), PL, bevel=0.01)
    open_counter(0.18, W / 2 - 0.08, FY, D - 0.2, HO, WOOD, WOOD2, INSIDE,
                 items=[(0.35, 0.78, 'bowl'), (0.5, 0.78, 'bowl'), (0.8, 1.0, 'jar'), (1.0, 0.78, 'bowl'), (0.45, 0, 'plate'), (0.85, 0, 'plate')], stools=4)
    # 木組み（柱・梁）
    for x in (-W / 2, -0.62, -0.05, 0.15, W / 2):
        cube((0.1, 0.1, H + 0.02), (x, FY - 0.02, H / 2 + 0.06), TIM, bevel=0.015)
    for z in (0.08, HO + 0.06, H + 0.04): cube((W + 0.05, 0.1, 0.09), (0, FY - 0.02, z), TIM, bevel=0.015)
    for x in (-1.0, -0.33, 0.55, 1.0): cube((0.08, 0.08, H - HO), (x, FY - 0.02, HO + (H - HO) / 2 + 0.06), TIM, bevel=0.012)
    for sx in (-1, 1):
        for y in (-D / 2, 0, D / 2): cube((0.1, 0.1, H + 0.02), (sx * (W / 2 + 0.01), y, H / 2 + 0.06), TIM, bevel=0.015)
        for z in (0.08, 0.75, H + 0.04): cube((0.09, D + 0.05, 0.09), (sx * (W / 2 + 0.01), 0, z), TIM, bevel=0.015)
        cube((0.07, 0.07, 0.9), (sx * (W / 2 + 0.02), -0.4, 0.62 + 0.0), TIM, bevel=0.012, rot=(0.55, 0, 0))   # すじかい
    # 左の側面: 格子の小窓
    lattice(-W / 2 - 0.03, 0.4, 0.85, 0.3, 0.32, TIM_D, mat('#f4ead8'), 4, 4, rz=-math.pi / 2)
    # 入口（-0.62〜-0.05）: 戸の奥・瓦の小さなひさし・看板（そばの絵）・麻ののれん
    cube((0.5, 0.06, 0.85), (-0.34, FY + 0.06, 0.48), mat('#5a3d2a'), bevel=0.01)
    tile_slope(0.95, 0.38, M_at(-0.34, FY - 0.36, HO - 0.12, rx=0.45), ROOF, ROOF_D)
    cube((0.64, 0.06, 0.32), (-0.34, FY - 0.06, HO + 0.2), SIGN, bevel=0.04)
    bpy.ops.mesh.primitive_torus_add(major_radius=0.1, minor_radius=0.012, location=(-0.34, FY - 0.1, HO + 0.2), rotation=(math.pi / 2, 0, 0)); o = bpy.context.object; o.scale = (1.3, 1, 0.7); finish(o, WHITE)
    for k in range(4): cyl(0.006, 0.18, (-0.36 + k * 0.012, FY - 0.1, HO + 0.19 + k * 0.006), WHITE, rot=(0, math.pi / 2, 0.2), verts=6, bevel=0)
    sphere(0.025, (-0.28, FY - 0.1, HO + 0.24), mat('#7dbb5a'), scale=(1.5, 0.5, 0.7), seg=8)
    cyl(0.018, 0.62, (-0.34, FY - 0.12, HO - 0.2), TIM_D, rot=(0, math.pi / 2, 0), verts=8, bevel=0)
    for i in range(3): cube((0.18, 0.02, 0.42), (-0.53 + i * 0.19, FY - 0.12, HO - 0.43), LINEN, bevel=0.012)
    # 石臼とざる（入口の左前）
    cyl(0.17, 0.12, (-0.9, FY - 0.3, 0.12), STONE, verts=20, bevel=0.02); cyl(0.15, 0.1, (-0.9, FY - 0.3, 0.24), STONE_D, verts=20, bevel=0.02)
    cube((0.2, 0.025, 0.025), (-0.8, FY - 0.3, 0.27), mat('#9b7a55'), bevel=0.005, rot=(0, 0, 0.3))
    cyl(0.19, 0.04, (-1.22, FY - 0.25, 0.22), BASKET, rot=(1.2, 0, 0.3), verts=24, bevel=0.012)
    # 屋根と妻、石の煙突
    pitch = math.radians(32); zt = H + 0.06
    side_gable_walls(W, D, zt, pitch, PL)
    side_gable_roof(W, D, zt - 0.04, pitch, 0.16, 0.14, ROOF, ROOF_D, ROOF_D)
    for k in range(3):
        for j in range(2): cube((0.13, 0.26, 0.11), (0.65 - 0.065 + j * 0.13, 0.25, zt + 0.42 + k * 0.12), STONE if (k + j) % 2 else STONE_D, bevel=0.02)

# ── 居酒屋（見本 izakaya.webp＝ジオラマ版） ─────────────────
def izakaya():
    WD = ['#7a4a2e', '#6e4229', '#845033']; FRAME = mat('#5c3822'); ROOF = mat('#7a4632'); ROOF_D = mat('#673a29')
    NAVY = mat('#2f3f73'); GLOW = mat('#ffcf8a', 0.7, emit=0.55); WOOD = mat('#a8703f'); WOOD2 = mat('#8f5e35')
    INSIDE = mat('#f3d8a8', 0.8, emit=0.35); BOTTLE = mat('#3d5a3a', 0.3); BOARD = mat('#c99a63'); DARK = mat('#2e211a')
    W, D, H = 2.6, 1.9, 1.35; FY = -D / 2; HO = 1.0
    cube((W + 0.1, D + 0.1, 0.07), (0, 0, 0.035), mat('#6b6b6b'), bevel=0.01)
    # 板壁（たて板）: 奥・左右・正面の左。右側は開いたカウンター
    def vplanks(ax, fixed, a0, a1, z0, z1):
        n = max(1, int((a1 - a0) / 0.16))
        for k in range(n):
            c = a0 + (a1 - a0) * (k + 0.5) / n
            size = ((a1 - a0) / n - 0.012, 0.05, z1 - z0) if ax == 'x' else (0.05, (a1 - a0) / n - 0.012, z1 - z0)
            cube(size, (c, fixed, (z0 + z1) / 2) if ax == 'x' else (fixed, c, (z0 + z1) / 2), mat(WD[k % 3]), bevel=0.012, seg=1)
    cube((W - 0.06, 0.06, H), (0, D / 2 - 0.03, H / 2 + 0.07), mat(WD[0]))
    vplanks('y', -W / 2 - 0.0, -D / 2, D / 2, 0.07, H + 0.07); vplanks('y', W / 2 + 0.0, -D / 2, D / 2, 0.07, H + 0.07)
    vplanks('x', FY, -W / 2, -0.05, 0.07, H + 0.07); vplanks('x', FY, -0.05, W / 2, HO + 0.07, H + 0.07)
    open_counter(-0.02, W / 2 - 0.08, FY, D - 0.25, HO, WOOD, WOOD2, INSIDE, items=[(0.3, 0, 'plate'), (0.7, 0, 'plate'), (1.0, 0, 'plate')], stools=3)
    for k in range(9): cyl(0.03, 0.2, (0.08 + k * 0.13, FY + D - 0.35, 0.92), BOTTLE if k % 3 else mat('#e8e0d0'), verts=10, bevel=0.005)  # 奥の酒びん（大きいもの）
    for x in (-W / 2, -0.05, W / 2):
        cube((0.1, 0.1, H + 0.02), (x, FY - 0.02, H / 2 + 0.07), FRAME, bevel=0.015)
    cube((W + 0.05, 0.1, 0.09), (0, FY - 0.02, HO + 0.07), FRAME, bevel=0.015)
    # 左: 紺ののれんの入口と換気口
    cube((0.6, 0.06, 0.85), (-0.55, FY + 0.03, 0.5), DARK, bevel=0.01)
    lattice(-0.55, FY - 0.03, 0.42, 0.5, 0.5, FRAME, GLOW, 3, 1)
    cyl(0.018, 0.7, (-0.55, FY - 0.1, HO - 0.02), FRAME, rot=(0, math.pi / 2, 0), verts=8, bevel=0)
    for i in range(3): cube((0.2, 0.025, 0.42), (-0.76 + i * 0.21, FY - 0.1, HO - 0.25), NAVY, bevel=0.012)
    cube((0.3, 0.04, 0.2), (-1.05, FY - 0.04, 1.15), mat('#5a3a26'), bevel=0.01)
    for k in range(4): cube((0.26, 0.05, 0.02), (-1.05, FY - 0.06, 1.08 + k * 0.045), DARK, bevel=0)
    # 右の側面: 明るい格子窓
    lattice(W / 2 + 0.04, 0.0, 0.85, 1.2, 0.55, FRAME, GLOW, 5, 2, rz=math.pi / 2)
    # 正面の瓦のひさし＋赤ちょうちん5つ
    tile_slope(W + 0.2, 0.5, M_at(0, FY - 0.45, HO + 0.18, rx=0.38), ROOF, ROOF_D)
    for x in (-1.0, -0.5, 0.0, 0.5, 1.0): lantern(x, FY - 0.36, HO - 0.04, mat('#ee5a42', 0.6, emit=0.45), DARK, s=1.05)
    # 大屋根（妻が正面）・妻のたて板
    zt = H + 0.07; pitch = math.radians(28); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.02), zt, gh, mat(WD[1]), sy)
    for k in range(9):
        x = -W / 2 + W * (k + 0.5) / 9; h = gh * (1 - abs(x) / (W / 2)) - 0.03
        if h > 0.05: cube((W / 9 - 0.015, 0.05, h), (x, FY - 0.03, zt + h / 2), mat(WD[k % 3]), bevel=0.012, seg=1)
    gable_roof(W, D, zt - 0.05, pitch, 0.2, 0.2, ROOF, ROOF_D, ROOF_D)
    for k in range(3):
        for j in range(2): cube((0.14, 0.28, 0.12), (0.7 - 0.07 + j * 0.14, 0.3, zt + 0.4 + k * 0.13), mat(['#9a6a4a', '#8a5c3e'][(k + j) % 2]), bevel=0.02)
    # 立て看板（酒びんと焼き鳥の絵）
    cube((0.46, 0.04, 0.34), (-1.35, FY - 0.5, 0.42), BOARD, bevel=0.02, rot=(0.12, 0, 0.35))
    for dx in (-0.18, 0.18): cube((0.03, 0.03, 0.5), (-1.35 + dx * math.cos(0.35), FY - 0.46 + dx * math.sin(0.35), 0.25), WOOD2, bevel=0.006, rot=(0.12, 0, 0.35))
    cyl(0.03, 0.15, (-1.43, FY - 0.55, 0.43), mat('#4a3a2e'), rot=(math.pi / 2 - 0.12, 0, 0.35), verts=10, bevel=0.005)
    for k in range(3): sphere(0.025, (-1.27 + k * 0.015, FY - 0.53 + k * 0.005, 0.38 + k * 0.045), mat('#9a5a34'), seg=8)

# ── 和食屋（見本 washoku.webp＝ジオラマ版） ─────────────────
def square_lantern(x, y, z, frame, glow):
    cube((0.2, 0.2, 0.24), (x, y, z), glow, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1): cube((0.025, 0.025, 0.26), (x + sx * 0.1, y + sy * 0.1, z), frame, bevel=0.004)
    cube((0.24, 0.24, 0.03), (x, y, z + 0.13), frame, bevel=0.006); cube((0.24, 0.24, 0.03), (x, y, z - 0.13), frame, bevel=0.006)

def washoku():
    PL = mat('#f4f1ea'); TIM = mat('#5e3d27'); TIM_D = mat('#4a2f1e'); ROOF = mat('#56596a'); ROOF_D = mat('#474a59')
    GREEN = mat('#3f7a52'); GLOW = mat('#fff0cf', 0.7, emit=0.5); WOOD = mat('#b98454'); WOOD2 = mat('#9c6c43')
    INSIDE = mat('#f3e2c2', 0.8, emit=0.3); STONE = mat('#a3a19c'); POT = mat('#3f5a7a'); PINE = mat('#3f7a3a'); SIGN = mat('#8a5a38')
    W, D, H1, H2 = 2.3, 2.0, 1.15, 0.8; FY = -D / 2; zt = H1 + H2
    cube((W + 0.1, D + 0.1, 0.07), (0, 0, 0.035), mat('#cfc9bf'), bevel=0.01)
    # 壁: 奥・左右（2階建て）、正面の左は入口、右は1階が開いたカウンター
    cube((W - 0.06, 0.06, zt), (0, D / 2 - 0.03, zt / 2 + 0.07), PL)
    for sx in (-1, 1): cube((0.06, D, zt), (sx * (W / 2 - 0.03), 0, zt / 2 + 0.07), PL)
    cube((W - 0.06, 0.06, H2), (0, FY + 0.03, H1 + H2 / 2 + 0.07), PL)
    cube((1.1, 0.06, H1), (-0.6, FY + 0.03, H1 / 2 + 0.07), PL)
    open_counter(0.08, W / 2 - 0.06, FY, D - 0.2, H1 - 0.05, WOOD, WOOD2, INSIDE,
                 items=[(0.3, 0.78, 'bowl'), (0.55, 0.78, 'jar'), (0.8, 1.0, 'bowl'), (0.95, 0.78, 'bowl'), (0.35, 0, 'plate'), (0.75, 0, 'plate')], stools=3)
    # 木組み
    for x in (-W / 2, -1.0, -0.2, 0.06, W / 2): cube((0.1, 0.1, zt + 0.02), (x, FY - 0.02, zt / 2 + 0.07), TIM, bevel=0.015)
    for z in (0.1, H1 + 0.07, H1 + 0.45, zt + 0.06): cube((W + 0.05, 0.1, 0.09), (0, FY - 0.02, z), TIM, bevel=0.015)
    for sx in (-1, 1):
        for y in (-D / 2, 0, D / 2): cube((0.1, 0.1, zt + 0.02), (sx * (W / 2 + 0.01), y, zt / 2 + 0.07), TIM, bevel=0.015)
        for z in (0.1, H1 + 0.07, zt + 0.06): cube((0.09, D + 0.05, 0.09), (sx * (W / 2 + 0.01), 0, z), TIM, bevel=0.015)
    lattice(-1.0 + 0.4, FY - 0.03, 0.42, 0.0001, 0.0001, TIM_D, GLOW, 1, 1) if False else None
    for x in (-1.06, -0.6): lattice(x + 0.0, FY - 0.03, 0.3, 0.32, 0.36, TIM_D, PL, 3, 3) if x < -1 else None
    lattice(-1.08, FY - 0.03, 0.32, 0.3, 0.36, TIM_D, PL, 3, 3)
    # 入口: 格子の戸＋緑ののれん＋両わきの角あんどん
    cube((0.7, 0.06, 0.9), (-0.6, FY + 0.0, 0.52), mat('#6a4a32'), bevel=0.01)
    for k in range(1, 6): cube((0.02, 0.07, 0.9), (-0.95 + k * 0.117, FY - 0.01, 0.52), TIM_D, bevel=0)
    cyl(0.018, 0.78, (-0.6, FY - 0.1, H1 - 0.05), TIM_D, rot=(0, math.pi / 2, 0), verts=8, bevel=0)
    for i in range(3): cube((0.24, 0.025, 0.5), (-0.85 + i * 0.25, FY - 0.1, H1 - 0.32), GREEN, bevel=0.012)
    square_lantern(-1.15, FY - 0.25, H1 - 0.15, TIM_D, GLOW); square_lantern(-0.03, FY - 0.25, H1 - 0.15, TIM_D, GLOW)
    # 1階の正面のひさし（瓦）と看板（魚とお椀）
    tile_slope(W + 0.3, 0.55, M_at(0, FY - 0.5, H1 + 0.12, rx=0.42), ROOF, ROOF_D)
    cube((0.7, 0.06, 0.26), (-0.4, FY - 0.06, H1 + 0.5), SIGN, bevel=0.04)
    sphere(1, (-0.55, FY - 0.1, H1 + 0.5), mat('#f1e6d2'), scale=(0.1, 0.02, 0.045), seg=12)
    bpy.ops.mesh.primitive_cone_add(radius1=0.04, depth=0.06, location=(-0.43, FY - 0.1, H1 + 0.5), rotation=(0, math.pi / 2, 0)); finish(bpy.context.object, mat('#f1e6d2'))
    half_disc(-0.22, FY - 0.1, H1 + 0.5, 0.06, mat('#f1e6d2'))
    # 2階: 白い壁の間に横長の格子
    lattice(0.5, FY - 0.03, H1 + 0.62, 0.9, 0.22, TIM_D, PL, 7, 1)
    # 屋根: 大屋根（妻が正面）＋右へのびる下の屋根
    pitch = math.radians(32); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.02), zt + 0.07, gh, PL, sy)
    cube((0.08, 0.06, gh), (0, FY - 0.03, zt + 0.07 + gh / 2), TIM, bevel=0.012)
    gable_roof(W, D, zt + 0.03, pitch, 0.22, 0.22, ROOF, ROOF_D, ROOF_D)
    # 石どうろうと盆栽（入口の左前）
    cube((0.16, 0.16, 0.06), (-1.35, FY - 0.4, 0.03), STONE, bevel=0.01); cyl(0.04, 0.3, (-1.35, FY - 0.4, 0.2), STONE, verts=10)
    cube((0.2, 0.2, 0.14), (-1.35, FY - 0.4, 0.42), STONE, bevel=0.02); bpy.ops.mesh.primitive_cone_add(radius1=0.18, depth=0.12, location=(-1.35, FY - 0.4, 0.55), vertices=4, rotation=(0, 0, math.pi / 4)); finish(bpy.context.object, STONE, 0.01, 1)
    sphere(0.035, (-1.35, FY - 0.4, 0.63), STONE, seg=8)
    cyl(0.12, 0.1, (-1.05, FY - 0.42, 0.05), POT, verts=16, bevel=0.02)
    cyl(0.025, 0.22, (-1.05, FY - 0.42, 0.2), mat('#6b4a32'), rot=(0.3, 0, 0), verts=8, bevel=0)
    for (dx, dz) in ((-0.08, 0.3), (0.06, 0.34), (0.0, 0.26)): sphere(0.09, (-1.05 + dx, FY - 0.42, dz), PINE, scale=(1.4, 1.2, 0.5), seg=12)

# ── カレー屋（見本 curry.webp＝ジオラマ版・インドのお店の形） ─────────
def curry():
    WALL = mat('#f6f0e3'); ORANGE = mat('#e8843f'); GREEN = mat('#3d7a52'); CREAM = mat('#f1e3c4'); WOOD = mat('#8a5a3a')
    WARM = mat('#b9824f', 0.8, emit=0.15); FIRE = mat('#ff8a3a', 0.6, emit=1.5); SIGN = mat('#6e4a33'); WHITE = mat('#f4ecdc')
    W, D, H = 2.0, 2.0, 1.75; FY = -D / 2
    cube((W + 0.16, D + 0.16, 0.08), (0, 0, 0.04), WOOD, bevel=0.015)
    cube((W, D, H), (0, 0, 0.08 + H / 2), WALL, bevel=0.02)
    # 飾りの帯（上）と、角・ふちの細い枠
    for z, m_, t in ((0.08 + H - 0.08, ORANGE, 0.09), (0.08 + H - 0.17, GREEN, 0.05), (0.08 + H - 0.23, ORANGE, 0.03)):
        cube((W + 0.04, D + 0.04, t), (0, 0, z), m_, bevel=0.01)
    for sx in (-1, 1):
        for sy in (-1, 1): cube((0.06, 0.06, H - 0.3), (sx * (W / 2 + 0.005), sy * (D / 2 + 0.005), 0.08 + (H - 0.3) / 2 + 0.04), ORANGE, bevel=0.01)
    # 屋上のふちと、ドーム＋オレンジの玉ねぎ飾り
    for sx in (-1, 1): cube((0.12, D + 0.16, 0.14), (sx * (W / 2 + 0.02), 0, 0.08 + H + 0.06), CREAM, bevel=0.03)
    for sy in (-1, 1): cube((W + 0.16, 0.12, 0.14), (0, sy * (D / 2 + 0.02), 0.08 + H + 0.06), CREAM, bevel=0.03)
    for sx in (-1, 1): cube((0.13, D + 0.18, 0.03), (sx * (W / 2 + 0.02), 0, 0.08 + H + 0.14), ORANGE, bevel=0.01)
    for sy in (-1, 1): cube((W + 0.18, 0.13, 0.03), (0, sy * (D / 2 + 0.02), 0.08 + H + 0.14), ORANGE, bevel=0.01)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=32, ring_count=16, location=(0, 0, 0.08 + H)); dome = bpy.context.object
    dome.scale = (0.78, 0.78, 0.5); bpy.ops.object.transform_apply(scale=True)
    bm = bmesh.new(); bm.from_mesh(dome.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, -1), clear_outer=True)
    bm.to_mesh(dome.data); bm.free(); finish(dome, CREAM)
    zt = 0.08 + H + 0.5
    cube((0.3, 0.3, 0.05), (0, 0, zt), ORANGE, bevel=0.01)
    lathe([(0, 0), (0.1, 0.01), (0.14, 0.07), (0.13, 0.14), (0.07, 0.2), (0.02, 0.26), (0, 0.28)], (0, 0, zt + 0.02), ORANGE, steps=16)
    for k in range(8):
        a = k * math.tau / 8
        cube((0.02, 0.02, 0.2), (0.135 * math.cos(a), 0.135 * math.sin(a), zt + 0.11), GREEN, bevel=0.004, rot=(0, 0, a))
    cyl(0.012, 0.12, (0, 0, zt + 0.35), GREEN, verts=8, bevel=0); sphere(0.025, (0, 0, zt + 0.42), GREEN, seg=8)
    # アーチ（先がとがった形）の入口と窓。中は暖かい色＋窯の火
    def cusped(x, y, z, w, h, rz=0.0, fire=False):
        """先のとがったアーチ: 外枠（オレンジ）→ 内枠（緑）→ 暖かい店内。上はアーチ形"""
        objs = []
        for (ww, dy, m_) in ((w + 0.16, 0.0, ORANGE), (w + 0.07, -0.004, GREEN), (w, -0.008, WARM)):
            objs.append(cube((ww, 0.06, h - w / 2), (0, dy, -w / 4), m_, bevel=0.006))
            t = half_disc(0, dy, h / 2 - w / 2, ww / 2, m_, depth=0.06); t.rotation_euler = (0, math.pi, 0); t.scale = (1, 1, 1.35); objs.append(t)
            objs.append(sphere(0.03 if m_ is ORANGE else 0.022, (0, dy - 0.01, h / 2 - w / 2 + ww / 2 * 1.35 + 0.02), m_, seg=8))
        if fire:
            objs.append(sphere(0.13, (0, -0.05, -h / 2 + 0.25), FIRE, scale=(1, 0.4, 1.15), seg=12))
            objs.append(cube((0.3, 0.06, 0.06), (0.12, -0.05, -h / 2 + 0.12), WOOD, bevel=0.01))
        xform(objs, M_at(x, y, z, rz=rz))
    cusped(-0.45, FY - 0.03, 0.08 + 0.5, 0.62, 0.95, fire=True)
    cusped(0.45, FY - 0.03, 0.08 + 0.72, 0.4, 0.7)
    for y in (-0.45, 0.4): cusped(-W / 2 - 0.03, y, 0.08 + 0.72, 0.4, 0.7, rz=-math.pi / 2)
    # 看板（カレーの鍋とナン）
    cube((0.62, 0.05, 0.28), (-0.4, FY - 0.04, 0.08 + 1.3), SIGN, bevel=0.03)
    half_disc(-0.55, FY - 0.08, 0.08 + 1.32, 0.08, WHITE); cube((0.2, 0.03, 0.015), (-0.55, FY - 0.08, 0.08 + 1.33), WHITE, bevel=0.003)
    for k in range(3): sphere(0.012, (-0.58 + k * 0.03, FY - 0.08, 0.08 + 1.38 + k * 0.012), WHITE, seg=6)
    sphere(1, (-0.27, FY - 0.08, 0.08 + 1.3), mat('#f0d8a8'), scale=(0.11, 0.02, 0.07), seg=12)

# ── カフェ（見本 cafe.webp＝ジオラマ版） ─────────────────────
def cafe():
    PL = mat('#f5f3ef'); WOOD = mat('#c99a66'); WOOD_D = mat('#a87a4c'); ROOF = mat('#a8755a'); ROOF_D = mat('#946349')
    BLUE = mat('#6f93c4'); WHITE = mat('#f7f6f2'); GLOW = mat('#f6e3c3', 0.7, emit=0.35); RATTAN = mat('#cfa66a'); TAB = mat('#d9b98a')
    STONE = mat('#b7aea2'); LEAF = mat('#6aa363'); POT = mat('#c27a55'); SIGN = mat('#7a5136')
    W, D, H = 2.2, 1.8, 1.3; FY = -D / 2
    cube((W + 0.08, D + 0.08, 0.06), (0, 0, 0.03), mat('#bdb6ac'), bevel=0.01)
    cube((W, D, H), (0, 0, 0.06 + H / 2), PL, bevel=0.02)
    for x in (-W / 2, W / 2):
        for y in (FY, D / 2): cube((0.09, 0.09, H + 0.02), (x, y, 0.06 + H / 2), WOOD, bevel=0.02)
    cube((W + 0.04, 0.08, 0.07), (0, FY - 0.02, 0.06 + H - 0.05), WOOD, bevel=0.015)
    # 正面: 窓2つ（棚のびん）＋戸
    def shop_window(x, w, h):
        cube((w + 0.08, 0.07, h + 0.08), (x, FY - 0.03, 0.06 + 0.62), WOOD, bevel=0.015)
        cube((w, 0.075, h), (x, FY - 0.035, 0.06 + 0.62), GLOW, bevel=0.008)
        for k in range(1, 3): cube((0.02, 0.08, h), (x - w / 2 + w * k / 3, FY - 0.04, 0.06 + 0.62), WOOD, bevel=0)
        cube((w, 0.08, 0.02), (x, FY - 0.04, 0.06 + 0.62), WOOD, bevel=0)
        cube((w + 0.14, 0.12, 0.04), (x, FY - 0.06, 0.06 + 0.62 - h / 2 - 0.05), WOOD, bevel=0.01)
    shop_window(-0.62, 0.5, 0.5); shop_window(0.62, 0.5, 0.5)
    cube((0.38, 0.07, 0.82), (0.0, FY - 0.03, 0.06 + 0.41), WOOD_D, bevel=0.015)
    cube((0.26, 0.075, 0.3), (0.0, FY - 0.04, 0.06 + 0.6), GLOW, bevel=0.008)
    # 青と白のしまのひさし（正面いっぱい）
    awning(W - 0.1, 16, 0.4, 0.42, BLUE, WHITE, M_at(0, FY - 0.04, 0.06 + 1.05))
    # 右の側面: 丸窓
    bpy.ops.mesh.primitive_torus_add(major_radius=0.26, minor_radius=0.05, location=(0, 0, 0), rotation=(math.pi / 2, 0, 0))
    t = finish(bpy.context.object, WOOD); g = cyl(0.24, 0.05, (0, 0.0, 0), GLOW, rot=(math.pi / 2, 0, 0), verts=28, bevel=0.005)
    bars = [cube((0.48, 0.06, 0.025), (0, -0.01, 0), WOOD, bevel=0), cube((0.025, 0.06, 0.48), (0, -0.01, 0), WOOD, bevel=0)]
    xform([t, g] + bars, M_at(-W / 2 - 0.03, 0.15, 0.06 + 0.7, rz=-math.pi / 2))
    # 妻と看板（コーヒーカップ）・屋根・石の煙突
    zt = 0.06 + H; pitch = math.radians(34); gh = math.tan(pitch) * (W / 2)
    for sy in (-1, 1): gable_wall(W, sy * (D / 2 - 0.02), zt, gh, PL, sy)
    cube((0.3, 0.05, 0.3), (0, FY - 0.04, zt + 0.25), SIGN, bevel=0.03)
    cyl(0.06, 0.08, (-0.01, FY - 0.08, zt + 0.23), WHITE, rot=(math.pi / 2, 0, 0), verts=16, bevel=0.01)
    cube((0.16, 0.02, 0.02), (0, FY - 0.08, zt + 0.17), WHITE, bevel=0.004)
    for k in range(3): sphere(0.012, (-0.03 + k * 0.025, FY - 0.08, zt + 0.32 + (k % 2) * 0.02), WHITE, seg=6)
    for sx in (-1, 1):
        L = (W / 2 + 0.16) / math.cos(pitch)
        cube((L, 0.07, 0.07), (sx * (W / 2 + 0.16) / 2, FY - 0.12, zt + math.tan(pitch) * (W / 2 + 0.16) / 2 - 0.03), WOOD, bevel=0.02, rot=(0, sx * pitch, 0))
    gable_roof(W, D, zt - 0.05, pitch, 0.16, 0.16, ROOF, ROOF_D, ROOF_D)
    for k in range(3):
        for j in range(2): cube((0.14, 0.28, 0.12), (-0.55 - 0.07 + j * 0.14, 0.35, zt + 0.42 + k * 0.13), STONE if (k + j) % 2 else mat('#a39a8f'), bevel=0.03)
    # テラス: 白い低い塀・木の床・丸テーブルと籐のいす・パラソル・植木
    TY0 = FY - 1.0
    cube((W + 0.1, 1.0, 0.04), (0, FY - 0.5, 0.02), mat('#e8dcc8'), bevel=0.005)
    cube((W + 0.14, 0.12, 0.32), (0, TY0, 0.16), WHITE, bevel=0.04)
    for sx in (-1, 1): cube((0.12, 1.0, 0.32), (sx * (W / 2 + 0.01), FY - 0.5, 0.16), WHITE, bevel=0.04)
    for (x, y) in ((-0.65, FY - 0.5), (0.25, FY - 0.6)):
        cyl(0.15, 0.025, (x, y, 0.36), TAB, verts=20, bevel=0.008); cyl(0.018, 0.33, (x, y, 0.18), TAB, verts=8, bevel=0)
        for dx in (-0.22, 0.22):
            cyl(0.07, 0.03, (x + dx, y, 0.22), RATTAN, verts=14, bevel=0.008)
            cube((0.025, 0.13, 0.17), (x + dx * 1.4, y, 0.31), RATTAN, bevel=0.01)
            for lx in (-0.04, 0.04): cube((0.012, 0.012, 0.21), (x + dx + lx, y, 0.105), RATTAN, bevel=0)
    cyl(0.012, 0.85, (-0.65, FY - 0.5, 0.42), WOOD_D, verts=8, bevel=0)
    for k in range(12):  # パラソル（青白のしま）
        a0 = k * math.tau / 12
        bpy.ops.mesh.primitive_cone_add(vertices=3, radius1=0.001, depth=0.001, location=(0, 0, 0)); bpy.data.objects.remove(bpy.context.object)
        me = bpy.data.meshes.new('para'); bm = bmesh.new()
        c = bm.verts.new((-0.65, FY - 0.5, 0.95)); r = 0.4
        a = bm.verts.new((-0.65 + r * math.cos(a0), FY - 0.5 + r * math.sin(a0), 0.8)); b = bm.verts.new((-0.65 + r * math.cos(a0 + math.tau / 12), FY - 0.5 + r * math.sin(a0 + math.tau / 12), 0.8))
        bm.faces.new((c, a, b)); bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('para', me); col.objects.link(o); finish(o, BLUE if k % 2 else WHITE)
        o.modifiers.new('s', 'SOLIDIFY').thickness = 0.015
    for (x, y) in ((W / 2 - 0.15, FY - 0.15), (0.75, TY0 + 0.15)):
        cube((0.16, 0.14, 0.12), (x, y, 0.1), POT, bevel=0.02)
        for k in range(4): sphere(0.06, (x + (k - 1.5) * 0.03, y, 0.22 + (k % 2) * 0.04), LEAF, scale=(0.6, 0.6, 1.2), seg=10)

# ── ビル（同じ建物に複数のお店。見本 art/reference/shops/building-multi.png） ──────
def building():
    WALL = mat('#eedfc2'); LINE = mat('#dccaa6'); RIM = mat('#ead9b8'); FRAME = mat('#e2cfaa')
    GLOW = mat('#f9d9a2', 0.7, emit=0.65); CURT = mat('#fffaf2'); WOOD = mat('#b8794a'); WOOD_D = mat('#8f5a36')
    INSIDE = mat('#f5c27a', 0.8, emit=0.6); WHITE = mat('#f9f5ee'); RED = mat('#c95a52')
    METAL = mat('#a9b4c2', 0.5); METAL_D = mat('#8e99a8', 0.5); GLASS = mat('#fdeccb', 0.6, emit=0.25)
    W = D = 1.9; F1 = 0.95; FL = 0.92; H = F1 + 2 * FL + 0.05
    cube((W, D, H), (0, 0, H / 2), WALL, bevel=0.05, seg=3)
    # 面ごとの置き方: ローカルは「外向き = -Y、壁の面 = y=0、横 = x」
    ROT = {'front': 0.0, 'left': -math.pi / 2, 'back': math.pi, 'right': math.pi / 2}
    def face_M(face, u, z):
        a = ROT[face]; x, y = u, -D / 2
        return M_at(x * math.cos(a) - y * math.sin(a), x * math.sin(a) + y * math.cos(a), z, rz=a)
    # タイルの横の目地（2階より上、4面）
    for face in ROT:
        objs = [cube((W - 0.04, 0.03, 0.022), (0, -0.005, z), LINE, bevel=0.008, seg=1) for z in [F1 + 0.04 + k * 0.26 for k in range(7)]]
        xform(objs, face_M(face, 0, 0))
    # 窓（明かり＋カーテン）: 2・3階に各面2つ
    def window(face, u, z):
        w, h = 0.44, 0.52
        objs = [cube((w + 0.12, 0.1, h + 0.12), (0, 0, 0), FRAME, bevel=0.04, seg=3),
                cube((w, 0.105, h), (0, -0.004, 0), GLOW, bevel=0.01)]
        for sx in (-1, 1):
            objs.append(cube((0.13, 0.11, h - 0.04), (sx * (w / 2 - 0.07), -0.006, 0.0), CURT, bevel=0.03, seg=2))
        xform(objs, face_M(face, u, z))
    for face in ROT:
        for z in (F1 + FL * 0.5, F1 + FL * 1.5):
            for u in (-0.45, 0.45): window(face, u, z)
    # 1階のお店の正面: 張り出したショーケース（汎用の中身: 明かり・カウンター・小さなテーブル）＋戸＋ひさし
    def storefront(face, awn_c1, awn_c2):
        objs = []
        SX, SW, SH, SZ, DEP = 0.25, 1.0, 0.62, 0.42, 0.22   # ショーケースの中心・幅・高さ・中心の高さ・奥行き
        objs.append(cube((SW, 0.02, SH), (SX, -0.01, SZ), INSIDE, bevel=0.005))                       # 奥の明かり
        for sx in (-1, 1): objs.append(cube((0.06, DEP, SH + 0.06), (SX + sx * SW / 2, -DEP / 2, SZ), WOOD, bevel=0.02))
        objs.append(cube((SW + 0.12, DEP + 0.06, 0.08), (SX, -DEP / 2, SZ - SH / 2 - 0.04), WOOD, bevel=0.02))  # 台
        objs.append(cube((SW + 0.12, DEP + 0.04, 0.06), (SX, -DEP / 2, SZ + SH / 2 + 0.03), WOOD, bevel=0.02))  # 上の枠
        objs.append(cube((SW - 0.1, 0.12, 0.16), (SX, -0.08, SZ - SH / 2 + 0.08), WOOD_D, bevel=0.02))          # カウンター
        objs.append(cube((SW - 0.06, 0.13, 0.025), (SX, -0.08, SZ - SH / 2 + 0.17), WHITE, bevel=0.008))
        for dx in (-0.25, 0.22):                                                                         # カウンターの上の小物（丸い皿の形だけ）
            o = cyl(0.06, 0.02, (SX + dx, -0.08, SZ - SH / 2 + 0.195), CURT, verts=14, bevel=0.005); objs.append(o)
        objs.append(cyl(0.09, 0.02, (SX + 0.05, -0.16, SZ + 0.02), WOOD, verts=16, bevel=0.005))              # 小さなテーブル
        objs.append(cyl(0.015, 0.2, (SX + 0.05, -0.16, SZ - 0.08), WOOD_D, verts=8, bevel=0))
        # 戸（ガラスの明かり）
        DXu = -0.62
        objs += [cube((0.4, 0.08, 0.78), (DXu, -0.01, 0.41), WOOD_D, bevel=0.02),
                 cube((0.28, 0.085, 0.56), (DXu, -0.015, 0.47), GLASS, bevel=0.008)]
        objs.append(sphere(0.022, (DXu + 0.13, -0.06, 0.4), METAL, seg=8))
        xform(objs, face_M(face, 0, 0))
        awning(1.62, 9, 0.38, 0.5, awn_c1, awn_c2, face_M(face, -0.05, 0.9).__matmul__(M_at(0, -0.02, 0)))
    storefront('left', WHITE, WHITE)
    storefront('front', RED, RED)
    # 屋上: ふち＋貯水タンク＋室外機
    for (sx, sy, lx, ly) in ((0, -1, W + 0.04, 0.12), (0, 1, W + 0.04, 0.12), (-1, 0, 0.12, D - 0.2), (1, 0, 0.12, D - 0.2)):
        cube((lx, ly, 0.12), (sx * (W / 2 - 0.04), sy * (D / 2 - 0.04), H + 0.05), RIM, bevel=0.04, seg=3)
    TX, TY = -0.45, 0.4
    cyl(0.24, 0.34, (TX, TY, H + 0.2), METAL, verts=24, bevel=0.03)
    cyl(0.25, 0.04, (TX, TY, H + 0.38), METAL_D, verts=24, bevel=0.015)
    cyl(0.06, 0.05, (TX, TY, H + 0.42), METAL_D, verts=12, bevel=0.01)
    cyl(0.03, 0.3, (TX - 0.3, TY, H + 0.15), METAL_D, verts=8, bevel=0)
    cube((0.24, 0.05, 0.05), (TX - 0.2, TY, H + 0.29), METAL_D, bevel=0.01)
    for (x, y) in ((0.4, -0.35), (0.62, -0.35), (0.51, -0.12)):
        cube((0.2, 0.18, 0.16), (x, y, H + 0.1), METAL, bevel=0.025)
        for k in range(3): cube((0.14, 0.01, 0.015), (x, y - 0.092, H + 0.06 + k * 0.035), METAL_D, bevel=0)


{'building': building, 'ramen': ramen, 'sushi': sushi, 'chinese': chinese, 'yakiniku': yakiniku, 'western': western, 'cake': cake, 'bakery': bakery, 'mystery': mystery, 'soba': soba, 'izakaya': izakaya, 'washoku': washoku, 'curry': curry, 'cafe': cafe}[KIND]()
# 曲線（瓦の筋など）は glb に入らないので形に変えておく
for o in list(bpy.data.objects):
    if o.type == 'CURVE':
        for x in bpy.data.objects: x.select_set(False)
        o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')

# ── 軽い glb（アプリ用）: LIGHT=1 のときはレンダリングせず、形をつなげて 1 万三角形以内に減らして書く ──
if os.environ.get('LIGHT'):
    for o in list(bpy.data.objects):
        if o.type in ('MESH', 'CURVE'):  # 曲線を形に変え、モディファイアも適用する
            for x in bpy.data.objects: x.select_set(False)
            o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
    for x in bpy.data.objects: x.select_set(x.type == 'MESH')
    bpy.context.view_layer.objects.active = next(o for o in bpy.data.objects if o.type == 'MESH')
    bpy.ops.object.join()
    shop = bpy.context.object; shop.name = KIND
    shop.data.calc_loop_triangles(); n0 = len(shop.data.loop_triangles)
    target = int(os.environ.get('TARGET', '7000'))
    if n0 > target:
        dm = shop.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = target / n0
        bpy.ops.object.modifier_apply(modifier=dm.name)
    shop.data.calc_loop_triangles()
    print('TRIS', len(shop.data.loop_triangles))
    bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{KIND}.glb'), use_selection=True, export_apply=True)
    print('DONE')
    sys.exit(0)

# ── 光とカメラ（見本に合わせて、やわらかい光） ──────────────
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#eef3fb'), 1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.7
bpy.ops.object.light_add(type='SUN', rotation=(math.radians(50), 0, math.radians(-28)))
sun = bpy.context.object; sun.data.energy = 2.4; sun.data.angle = math.radians(25); sun.data.color = srgb('#fff2e4')
bpy.ops.object.light_add(type='AREA', location=(3, -4, 3)); fill = bpy.context.object; fill.data.energy = 220; fill.data.size = 6
fill.rotation_euler = (Vector((0, 0, 1)) - fill.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.mesh.primitive_plane_add(size=40); gnd = bpy.context.object; gnd.name = 'ground'; gnd.is_shadow_catcher = True
scene.render.film_transparent = True
yaw = math.radians(float(os.environ.get('YAW', '-28'))); pc = math.radians(float(os.environ.get('PITCH', '60'))); dist = 12
target = Vector((0, 0, 1.1))
cl = target + Vector((math.sin(yaw) * math.sin(pc) * dist, -math.cos(yaw) * math.sin(pc) * dist, math.cos(pc) * dist))
bpy.ops.object.camera_add(location=cl); cam = bpy.context.object; scene.camera = cam
cam.rotation_euler = (target - cl).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 70
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 40; scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 900
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = os.path.join(out, f'd_{KIND}.png'); bpy.ops.render.render(write_still=True)
for o in bpy.data.objects: o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'd_{KIND}.glb'), use_selection=True, export_apply=True)
dg = bpy.context.evaluated_depsgraph_get()
print('TRIS', sum(len(o.evaluated_get(dg).data.loop_triangles) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'ground'))
print('DONE')

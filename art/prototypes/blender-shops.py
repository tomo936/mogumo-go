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
    c = bpy.context.object; bm = bmesh.new(); bm.from_mesh(c.data)
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

{'ramen': ramen, 'sushi': sushi}[KIND]()

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

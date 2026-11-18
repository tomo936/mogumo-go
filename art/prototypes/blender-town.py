# もぐもGO お店の模型 v4: 本人の見本（パステルの四角い2階建て・太い屋上のふち・枠つきの窓・波のひさし）に寄せた
# 「お店を作る道具」。形と色を設定で変えて、ジャンルごとのお店を作る。
# 実行: KIND=ramen|cafe|bakery|sweets blender -b -P town.py -- <out_dir>
import bpy, bmesh, math, sys, os
from mathutils import Vector, Matrix

out = sys.argv[sys.argv.index('--') + 1] if '--' in sys.argv else '.'
HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, 'fonts', 'MPLUSRounded1c-ExtraBold.ttf')
KIND = os.environ.get('KIND', 'cafe')
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = bpy.context.collection

def srgb(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((x + 0.055) / 1.055) ** 2.4 if x > 0.04045 else x / 12.92 for x in c)

# ── 材質（絵用のイラスト調＋glb 用の色だけ） ─────────────────
LIGHT = (-0.3, -0.8, 0.75)  # 正面が明るく、左の側面が影になる（見本と同じ）
MATS, GL = {}, {}
def mat(key, color, emit=False):
    k = (key, color, emit)
    if k in MATS: return MATS[k]
    base = srgb(color)
    m = bpy.data.materials.new(key); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; L = nt.links.new
    o = N('ShaderNodeOutputMaterial'); em = N('ShaderNodeEmission'); L(em.outputs[0], o.inputs[0])
    if emit:
        em.inputs['Color'].default_value = (*base, 1)
    else:
        geo = N('ShaderNodeNewGeometry'); dot = N('ShaderNodeVectorMath'); dot.operation = 'DOT_PRODUCT'
        l = math.sqrt(sum(c * c for c in LIGHT)); dot.inputs[1].default_value = tuple(c / l for c in LIGHT)
        L(geo.outputs['Normal'], dot.inputs[0])
        ramp = N('ShaderNodeValToRGB'); ramp.color_ramp.interpolation = 'CONSTANT'; e = ramp.color_ramp.elements
        e[0].position = 0.0; e[0].color = (*[c * k for c, k in zip(base, (0.74, 0.77, 0.9))], 1)   # 影の面（青み）
        e[1].position = 0.3; e[1].color = (*base, 1)                                                 # 正面
        t = e.new(0.62); t.color = (*[min(1, c * 1.07 + 0.03) for c in base], 1)                    # 上の面（明るい）
        L(dot.outputs['Value'], ramp.inputs['Fac'])
        ao = N('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.18
        r = N('ShaderNodeMapRange'); r.inputs['To Min'].default_value = 0.8; L(ao.outputs['AO'], r.inputs['Value'])
        cc = N('ShaderNodeCombineColor'); [L(r.outputs[0], cc.inputs[i]) for i in range(3)]
        mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1
        L(ramp.outputs['Color'], mx.inputs[6]); L(cc.outputs[0], mx.inputs[7]); L(mx.outputs[2], em.inputs['Color'])
    g = bpy.data.materials.new(key + '_gl'); g.use_nodes = True; b = g.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Roughness'].default_value = 0.8
    if emit: b.inputs['Emission Color'].default_value = (*base, 1); b.inputs['Emission Strength'].default_value = 1
    MATS[k] = m; GL[m.name] = g
    return m

# ── 形の道具（どれも「正面＝-Y」で作り、place() で壁の面に貼る） ───────────
def finish(o, m, bevel=0.0, seg=3, smooth=True):
    o.data.materials.clear(); o.data.materials.append(m)
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = seg; b.limit_method = 'ANGLE'
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    return o

def cube(size, loc, m, bevel=0.03, seg=3, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.scale = size; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m, bevel, seg)

def cyl(r, h, loc, m, rot=(0, 0, 0), verts=24, bevel=0.015):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=verts)
    return finish(bpy.context.object, m, bevel)

def sphere(r, loc, m, scale=(1, 1, 1), seg=16):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.object; o.scale = scale; bpy.ops.object.transform_apply(scale=True)
    return finish(o, m)

def lathe(prof, loc, m, steps=24, rot=(0, 0, 0)):
    me = bpy.data.meshes.new('lathe'); bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]; es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=steps, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-4); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('lathe', me); col.objects.link(o); o.location = loc; o.rotation_euler = rot
    return finish(o, m)

def prism(poly, z0, h, m, bevel=0.04, seg=3):
    """床の形（反時計回りの多角形）を上へ伸ばした箱"""
    me = bpy.data.meshes.new('prism'); bm = bmesh.new()
    bot = [bm.verts.new((x, y, z0)) for x, y in poly]; top = [bm.verts.new((x, y, z0 + h)) for x, y in poly]
    bm.faces.new(bot[::-1]); bm.faces.new(top)
    n = len(poly)
    for i in range(n): bm.faces.new((bot[i], bot[(i + 1) % n], top[(i + 1) % n], top[i]))
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('prism', me); col.objects.link(o)
    return finish(o, m, bevel, seg, smooth=False)

def grow(poly, d):
    """多角形を外へ d だけふくらませる（凸の形用）"""
    n = len(poly); res = []
    for i in range(n):
        p0, p1, p2 = Vector(poly[i - 1]), Vector(poly[i]), Vector(poly[(i + 1) % n])
        n1 = Vector(((p1 - p0).y, -(p1 - p0).x)).normalized(); n2 = Vector(((p2 - p1).y, -(p2 - p1).x)).normalized()
        b = (n1 + n2).normalized(); res.append(tuple(p1 + b * (d / max(0.3, b.dot(n1)))))
    return res

def edges(poly):
    n = len(poly)
    for i in range(n):
        a, b = Vector(poly[i]), Vector(poly[(i + 1) % n]); dvec = b - a
        yield a, b, dvec.length, Vector((dvec.y, -dvec.x)).normalized()

def place(objs, a, b, nrm, t, z=0.0, out=0.0):
    """正面＝-Y で作った部品を、壁の辺 a→b の位置 t（0〜1）・高さ z に、外向き nrm へ向けて貼る"""
    bpy.context.view_layer.update()
    p = a + (b - a) * t + nrm * out
    ang = math.atan2(nrm.y, nrm.x) + math.pi / 2
    M = Matrix.Translation((p.x, p.y, z)) @ Matrix.Rotation(ang, 4, 'Z')
    for o in objs: o.matrix_world = M @ o.matrix_world

# ── 部品 ────────────────────────────────────────
def window(C, w=0.34, h=0.36, cross=False):
    parts = [cube((w + 0.1, 0.07, h + 0.1), (0, -0.02, 0), C['trim'], bevel=0.035),
             cube((w, 0.06, h), (0, -0.04, 0), C['glass'], bevel=0.015),
             cube((w * 0.16, 0.02, h * 0.95), (-w * 0.18, -0.075, 0), C['shine'], bevel=0.005, rot=(0, 0.5, 0)),   # 光の筋
             cube((w + 0.16, 0.12, 0.05), (0, -0.05, -h / 2 - 0.06), C['trim'], bevel=0.02)]                   # 窓台
    if cross:
        parts += [cube((0.025, 0.075, h), (0, -0.05, 0), C['trim'], bevel=0), cube((w, 0.075, 0.025), (0, -0.05, 0), C['trim'], bevel=0)]
    return parts

def awning(C, w, n, depth=0.46, tilt=0.55):
    """しまのひさし: 1枚の板をしまの色で塗り分け（線が細切れにならないように）＋波のすそ"""
    me = bpy.data.meshes.new('awning'); bm = bmesh.new()
    dy, dz = -depth * math.cos(tilt), -depth * math.sin(tilt)
    back = [bm.verts.new((-w / 2 + w * i / n, 0.0, 0.0)) for i in range(n + 1)]
    front = [bm.verts.new((-w / 2 + w * i / n, dy, dz)) for i in range(n + 1)]
    for i in range(n):
        f = bm.faces.new((back[i], back[i + 1], front[i + 1], front[i])); f.material_index = i % 2
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('awning', me); col.objects.link(o)
    o.data.materials.append(C['awn1']); o.data.materials.append(C['awn2'])
    sol = o.modifiers.new('solid', 'SOLIDIFY'); sol.thickness = 0.04
    bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = 0.012; bv.segments = 2; bv.limit_method = 'ANGLE'
    parts = [o]
    for i in range(n):  # 波のすそ（半円）
        x = -w / 2 + w * (i + 0.5) / n
        bpy.ops.mesh.primitive_cylinder_add(radius=w / n * 0.5, depth=0.035, vertices=20, location=(x, dy - 0.005, dz), rotation=(math.pi / 2, 0, 0))
        c = bpy.context.object
        bm2 = bmesh.new(); bm2.from_mesh(c.data)
        bmesh.ops.bisect_plane(bm2, geom=bm2.verts[:] + bm2.edges[:] + bm2.faces[:], plane_co=(0, 0, 0), plane_no=(0, 0, 1), clear_outer=True)
        bmesh.ops.holes_fill(bm2, edges=bm2.edges[:]); bm2.to_mesh(c.data); bm2.free()
        parts.append(finish(c, C['awn1'] if i % 2 == 0 else C['awn2'], 0.008, 2))
    parts.append(cyl(0.022, w + 0.06, (0, 0.01, 0.0), C['trim'], rot=(0, math.pi / 2, 0), verts=12))
    return parts

def shop_front(C, w, h, kind):
    """1階の店構え: 大きなショーウインドウ（中に商品）＋入口＋ひさし"""
    parts = []
    ww = w * 0.56; dw = w * 0.26
    xw = -w / 2 + 0.12 + ww / 2; xd = w / 2 - 0.12 - dw / 2
    parts += [cube((ww + 0.1, 0.07, h * 0.6 + 0.1), (xw, -0.02, h * 0.4), C['frame'], bevel=0.03),
              cube((ww, 0.06, h * 0.6), (xw, -0.03, h * 0.4), C['inside'], bevel=0.01),
              cube((0.03, 0.065, h * 0.6), (xw, -0.05, h * 0.4), C['frame'], bevel=0),
              cube((ww + 0.16, 0.16, 0.08), (xw, -0.07, h * 0.1), C['trim'], bevel=0.025)]
    parts += goods(C, kind, xw, ww, h * 0.16)
    parts += [cube((dw + 0.1, 0.07, h * 0.72 + 0.05), (xd, -0.02, h * 0.36 + 0.02), C['frame'], bevel=0.03),
              cube((dw, 0.06, h * 0.7), (xd, -0.035, h * 0.37), C['door'], bevel=0.015),
              cube((dw * 0.55, 0.02, h * 0.34), (xd, -0.07, h * 0.5), C['inside'], bevel=0.01),
              sphere(0.025, (xd + dw * 0.32, -0.08, h * 0.35), C['knob'])]
    aw = awning(C, dw + 0.34, 5, depth=0.36, tilt=0.5)
    for o in aw: o.location.x += xd; o.location.z += h * 0.8; o.location.y -= 0.04
    parts += aw
    # 入口の上の看板＋ジャンルの印
    sg = [cube((dw + 0.3, 0.07, 0.2), (xd, -0.03, h * 0.93), C['board'], bevel=0.07, seg=4)]
    ic = icon(C, kind, (0, 0, 0))
    for o in ic: o.scale = (0.75, 0.75, 0.75); o.location = Vector((xd, -0.12, h * 0.93)) + o.location * 0.75
    parts += sg + ic
    # 入口わきの植木鉢
    parts += [cyl(0.09, 0.14, (xd + dw / 2 + 0.13, -0.18, 0.07), C['pot'], verts=16), sphere(0.13, (xd + dw / 2 + 0.13, -0.18, 0.22), C['leaf'], scale=(1, 1, 0.9))]
    return parts

def goods(C, kind, xc, ww, z):
    """ショーウインドウの中身（ジャンルがひと目で分かる）"""
    p = []; n = 3
    for i in range(n):
        x = xc - ww / 2 + ww * (i + 0.5) / n
        if kind == 'sweets':
            p += [cyl(0.09, 0.08, (x, -0.06, z + 0.06), C['cake'], verts=20), cyl(0.07, 0.06, (x, -0.06, z + 0.13), C['cream'], verts=20),
                  sphere(0.03, (x, -0.06, z + 0.18), C['berry'])]
        elif kind == 'bakery':
            p += [sphere(0.1, (x, -0.06, z + 0.07), C['bread'], scale=(1.4, 0.8, 0.6))]
        elif kind == 'cafe':
            p += [cyl(0.06, 0.09, (x, -0.06, z + 0.06), C['cup'], verts=16), cyl(0.05, 0.01, (x, -0.06, z + 0.11), C['coffee'], verts=16)]
        else:  # ramen
            p += [lathe([(0, 0), (0.05, 0), (0.09, 0.04), (0.11, 0.08), (0, 0.075)], (x, -0.06, z + 0.02), C['bowl']),
                  cyl(0.1, 0.01, (x, -0.06, z + 0.095), C['soup'], verts=20)]
    return p

def hanging_sign(C, kind, text=None):
    """壁から出した腕木に下げる看板。板の上にジャンルの印"""
    p = [cube((0.05, 0.36, 0.05), (0, -0.18, 0.18), C['metal'], bevel=0.012),
         cyl(0.012, 0.12, (0, -0.33, 0.1), C['metal'], verts=8), ]
    board = cube((0.06, 0.44, 0.3), (0, -0.33, -0.08), C['board'], bevel=0.05, seg=4)
    p.append(board)
    p += icon(C, kind, (0.045, -0.33, -0.08), side=True)
    return p

def icon(C, kind, at, side=False, s=1.0):
    x, y, z = at; p = []
    if kind == 'ramen':
        o = lathe([(0, 0), (0.04, 0), (0.08, 0.035), (0.1, 0.075), (0, 0.07)], (x, y, z - 0.04), C['bowl'], rot=(0, 0, 0)); p.append(o)
        p.append(cyl(0.09, 0.012, (x, y, z + 0.035), C['soup'], verts=20))
        p += [cyl(0.008, 0.2, (x, y + dy, z + 0.1), C['wood'], rot=(0.4, 0, 0), verts=6) for dy in (-0.015, 0.015)]
    elif kind == 'cafe':
        p += [cyl(0.06, 0.1, (x, y, z - 0.01), C['cup'], verts=16), cyl(0.05, 0.01, (x, y, z + 0.04), C['coffee'], verts=16)]
        bpy.ops.mesh.primitive_torus_add(major_radius=0.03, minor_radius=0.01, location=(x, y + 0.07, z), rotation=(0, math.pi / 2, 0)); p.append(finish(bpy.context.object, C['cup']))
    elif kind == 'bakery':
        p.append(sphere(0.1, (x, y, z), C['bread'], scale=(0.6, 1.3, 0.7)))
    else:
        p += [cyl(0.08, 0.07, (x, y, z - 0.03), C['cake'], verts=20), cyl(0.065, 0.05, (x, y, z + 0.03), C['cream'], verts=20), sphere(0.028, (x, y, z + 0.08), C['berry'])]
    if side:
        for o in p: o.rotation_euler.rotate_axis('X', 0)
    return p

# ── ジャンルごとの設定 ─────────────────────────────
SPECS = {
    'cafe':   dict(wall='#b9d0f2', trim='#fff2c4', awn=('#4f86e8', '#ffffff'), roof='#c9d3ee', poly=[(-1.1, -1.0), (1.1, -1.0), (1.1, 1.0), (-1.1, 1.0)], cross=False),
    'bakery': dict(wall='#fbe7a1', trim='#c7d9c8', awn=('#d9a58c', '#fff6ea'), roof='#c8c8d8', poly=[(-1.1, -1.0), (1.1, -1.0), (1.1, 1.0), (-1.1, 1.0)], cross=True),
    'sweets': dict(wall='#f8c8d4', trim='#fbd9e2', awn=('#e9a3b9', '#fff6f8'), roof='#e6c6dc', poly=[(-1.1, -1.0), (0.55, -1.0), (1.1, -0.45), (1.1, 1.0), (-1.1, 1.0)], cross=False),
    'ramen':  dict(wall='#fff0cc', trim='#ffe39a', awn=('#ef5a4c', '#fff6ea'), roof='#e8dcc4', poly=[(-1.1, -1.0), (1.1, -1.0), (1.1, 1.0), (-1.1, 1.0)], cross=False),
}
sp = SPECS[KIND]
C = dict(
    wall=mat('wall', sp['wall']), trim=mat('trim', sp['trim']), roof=mat('roof', sp['roof']),
    awn1=mat('awn1', sp['awn'][0]), awn2=mat('awn2', sp['awn'][1]),
    glass=mat('glass', '#9fd0f5'), shine=mat('shine', '#e6f5ff'), frame=mat('frame', '#a8794f'), door=mat('door', '#b8875a'),
    inside=mat('inside', '#fff0cc', emit=True), knob=mat('knob', '#ffd257'), pot=mat('pot', '#d98e5e'), leaf=mat('leaf', '#69c77a'),
    metal=mat('metal', '#7c6a5c'), board=mat('board', '#f3d6a8'), wood=mat('wood', '#a8794f'),
    cake=mat('cake', '#fff1dc'), cream=mat('cream', '#ffd0dc'), berry=mat('berry', '#ff4d6a'), bread=mat('bread', '#e8a35a'),
    cup=mat('cup', '#ffffff'), coffee=mat('coffee', '#8a5a3a'), bowl=mat('bowl', '#ffffff'), soup=mat('soup', '#ffb446'),
    base=mat('base', '#eef0f4'),
)

# ── 建物を組む ───────────────────────────────────
poly = sp['poly']; H1, H2 = 1.05, 0.92
prism(grow(poly, 0.08), 0, 0.1, C['trim'], bevel=0.04)                           # 足もとの台
prism(poly, 0.1, H1, C['wall'], bevel=0.03)                                      # 1階
prism(grow(poly, 0.06), 0.1 + H1 - 0.02, 0.1, C['trim'], bevel=0.035)            # 階の間の帯
prism(poly, 0.1 + H1 + 0.08, H2, C['wall'], bevel=0.03)                          # 2階
zt = 0.1 + H1 + 0.08 + H2
prism(grow(poly, 0.08), zt - 0.02, 0.2, C['trim'], bevel=0.07, seg=4)           # 屋上のふち（太く丸い）
prism(grow(poly, -0.12), zt + 0.08, 0.14, C['roof'], bevel=0.0)                  # 屋上の床（ふちより少し低い）

E = list(edges(poly))
front = E[0]
# 1階: 正面に店構え、ほかの面に窓
a, b, L, n = front
place(shop_front(C, L - 0.1, H1, KIND), a, b, n, 0.5, 0.1, 0.0)
for i, (a, b, L, n) in enumerate(E):
    k2 = max(1, int(L / 0.62))
    for j in range(k2):  # 2階の窓
        place(window(C, cross=sp['cross']), a, b, n, (j + 0.5) / k2, 0.1 + H1 + 0.08 + H2 * 0.5, 0.0)
    if i != 0:
        k1 = max(1, int(L / 0.7))
        for j in range(k1):  # 1階の横の窓
            place(window(C, w=0.36, h=0.4, cross=sp['cross']), a, b, n, (j + 0.5) / k1, 0.1 + H1 * 0.55, 0.0)
# ── 絵にする ────────────────────────────────────
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (*srgb('#dcebf7'), 1)
gnd = cyl(60, 0.01, (0, 0, -0.005), mat('ground', '#dcebf7', emit=True), verts=48, bevel=0); gnd.name = 'ground'
scene.render.use_freestyle = True; scene.render.line_thickness_mode = 'ABSOLUTE'; scene.render.line_thickness = 1.5
fs = bpy.context.view_layer.freestyle_settings
ls = fs.linesets[0] if len(fs.linesets) else fs.linesets.new('lines')
if ls.linestyle is None: ls.linestyle = bpy.data.linestyles.new('line')
ls.select_by_visibility = True; ls.select_silhouette = True; ls.select_border = True; ls.select_crease = True
ls.linestyle.color = srgb('#4b4560'); ls.linestyle.thickness = 1.5
ls.select_by_collection = False
yaw = math.radians(float(os.environ.get('YAW', '38'))); pitch = math.radians(58); dist = 10.5
target = Vector((0, 0, 1.15))
cl = target + Vector((math.sin(yaw) * math.sin(pitch) * dist, -math.cos(yaw) * math.sin(pitch) * dist, math.cos(pitch) * dist))
bpy.ops.object.camera_add(location=cl); cam = bpy.context.object; scene.camera = cam
cam.rotation_euler = (target - cl).to_track_quat('-Z', 'Y').to_euler(); cam.data.lens = 70
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 24; scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = 700
scene.view_settings.view_transform = 'Standard'
scene.render.filepath = os.path.join(out, f'town_{KIND}.png')
bpy.ops.render.render(write_still=True)

for o in bpy.data.objects:
    if o.type == 'MESH':
        for s in o.material_slots:
            if s.material and s.material.name in GL: s.material = GL[s.material.name]
for o in bpy.data.objects: o.select_set(o.type == 'MESH' and o.name != 'ground')
bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'town_{KIND}.glb'), use_selection=True, export_apply=True)
dg = bpy.context.evaluated_depsgraph_get()
print('TRIS', sum(len(o.evaluated_get(dg).data.loop_triangles) for o in bpy.data.objects if o.type == 'MESH' and o.name != 'ground'))
print('DONE')

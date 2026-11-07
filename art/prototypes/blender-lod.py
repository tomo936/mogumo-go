# もぐもGO 遠く用のさらに軽いお店の模型（LOD）。blender-shops.py・blender-shop-jp.py の中から exec で読む（単独では動かない）
# 実行: LOD=1 KIND=ramen blender -b -P blender-shops.py -- src/assets/shops/lod
#   （ラーメンだけはアプリの詳しい版と同じ blender-shop-jp.py で作る）
# やること: 角の丸めを付けない（丸い形の分割も半分。元の台本の LO）→ 小さい部品から目安の数まで外す → 平らな面をまとめる
#           → それでも上限を超えるときだけふつうの間引き
#           → 材質の色を頂点の色へ移して材質を1つにする → 外形の箱が詳しい版と 2% 以内かを表示
# 環境変数: TARGET 三角形の目安（800）。LIMIT 上限（1500）。BIG これより大きい部品は外さない（2番目に長い辺、模型の単位）
target = int(os.environ.get('TARGET', '800')); limit = int(os.environ.get('LIMIT', '1500')); big = float(os.environ.get('BIG', '0.2'))
meshes = lambda: [o for o in bpy.data.objects if o.type in ('MESH', 'CURVE')]
for o in meshes():
    for m in list(o.modifiers):   # 角の丸め（bevel）は遠くでは見えないので付けない
        if m.type == 'BEVEL': o.modifiers.remove(m)
    for x in bpy.data.objects: x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.convert(target='MESH')
bpy.context.view_layer.update()
ps = [o.matrix_world @ Vector(c) for o in meshes() for c in o.bound_box]
lo = [min(p[i] for p in ps) for i in range(3)]; hi = [max(p[i] for p in ps) for i in range(3)]
full = [hi[i] - lo[i] for i in range(3)]
def on_edge(o):   # 外形の箱のふちに届いている部品（てっぺんの湯気・看板など）は、小さくても外さない
    qs = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return any(min(q[i] for q in qs) - lo[i] < 0.02 * full[i] or hi[i] - max(q[i] for q in qs) < 0.02 * full[i] for i in range(3))
tris = lambda o: sum(len(p.vertices) - 2 for p in o.data.polygons)
seen = lambda o: sorted(o.dimensions)[1]   # 見た目の大きさ: 2番目に長い辺（細い棒・目地・瓦1枚・小物は小さい）
total = n0 = sum(tris(o) for o in meshes())
# 小さい部品から順に、目安の数に収まるまで外す（形は崩さない。ふちに届く部品と BIG 以上の部品は残す）
removed = 0
for o in sorted([o for o in meshes() if not on_edge(o)], key=seen):
    if total <= target or seen(o) >= big: break
    total -= tris(o); bpy.data.objects.remove(o); removed += 1
for x in bpy.data.objects: x.select_set(x.type == 'MESH')
bpy.context.view_layer.objects.active = next(o for o in bpy.data.objects if o.type == 'MESH')
bpy.ops.object.join()
shop = bpy.context.object; shop.name = KIND
# 平らな面をまとめる（色の境目はまたがない）
dm = shop.modifiers.new('planar', 'DECIMATE'); dm.decimate_type = 'DISSOLVE'; dm.angle_limit = math.radians(5); dm.delimit = {'MATERIAL'}
bpy.ops.object.modifier_apply(modifier=dm.name)
def tris_clean():   # 三角形にし、つぶれた三角形を消して数える（書き出す数と合わせる）
    bm = bmesh.new(); bm.from_mesh(shop.data)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-5)
    bmesh.ops.triangulate(bm, faces=bm.faces)
    bm.to_mesh(shop.data); bm.free()
    return len(shop.data.polygons)
n1 = n2 = tris_clean()
# それでも上限を超えるときだけ、ふつうの間引き（Collapse）で上限まで減らす。外形の箱のふちの点は動かさない
if n2 > limit:
    vg = shop.vertex_groups.new(name='edge'); w = shop.matrix_world
    vg.add([v.index for v in shop.data.vertices if any(min((w @ v.co)[i] - lo[i], hi[i] - (w @ v.co)[i]) < 0.01 * full[i] for i in range(3))], 1.0, 'REPLACE')
    dm = shop.modifiers.new('dec', 'DECIMATE'); dm.decimate_type = 'COLLAPSE'; dm.ratio = limit / n2
    dm.vertex_group = 'edge'; dm.invert_vertex_group = True; dm.vertex_group_factor = 10
    bpy.ops.object.modifier_apply(modifier=dm.name)
    n2 = tris_clean()
# 材質の色を、面ごとに頂点の色へ移す（光る窓は少し明るく）。材質は頂点の色を使う1つだけにする
me = shop.data
ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'CORNER')
def color_of(m):
    if m is None: return (1, 1, 1, 1)
    b = m.node_tree.nodes['Principled BSDF']; c = list(b.inputs['Base Color'].default_value)[:3]
    e = b.inputs['Emission Strength'].default_value
    if e: c = [min(1.0, v * (1 + e * 0.6)) for v in c]
    return (*c, 1)
cols = [color_of(m) for m in me.materials]
for p in me.polygons:
    c = cols[p.material_index] if cols else (1, 1, 1, 1)
    for li in p.loop_indices: ca.data[li].color = c
me.color_attributes.active_color = ca
one = bpy.data.materials.new('shop'); one.use_nodes = True; nt = one.node_tree; b = nt.nodes['Principled BSDF']
b.inputs['Roughness'].default_value = 0.72; b.inputs['Specular IOR Level'].default_value = 0.2
attr = nt.nodes.new('ShaderNodeVertexColor'); attr.layer_name = 'Col'; nt.links.new(attr.outputs['Color'], b.inputs['Base Color'])
me.materials.clear(); me.materials.append(one)
for p in me.polygons: p.material_index = 0
vs = [shop.matrix_world @ v.co for v in me.vertices]; lod = [max(v[i] for v in vs) - min(v[i] for v in vs) for i in range(3)]; diff = max(abs(a - b) / b for a, b in zip(lod, full))
print(f'LOD {KIND} removed={removed} tris {n0}->{n1}->{n2} box full={[round(v, 3) for v in full]} lod={[round(v, 3) for v in lod]} diff={diff * 100:.1f}%' + (' NG(>2%)' if diff > 0.02 else ' OK'))
for x in bpy.data.objects: x.select_set(x is shop)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)   # 模型の根元を原点にそろえる（詳しい版と同じ座標）
bpy.ops.export_scene.gltf(filepath=os.path.join(out, f'{KIND}.glb'), use_selection=True, export_apply=True, export_texcoords=False)
print('DONE')
sys.exit(0)

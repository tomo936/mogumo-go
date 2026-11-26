# 生成の形を読み、向き・大きさをそろえる（段 2 と下調べが同じ形を使うため）。
# 足の裏が高さ 0・身長 1.0・前が −Y・左右のまん中は x=0・前後のまん中は足（足の裏の点の前後のまん中）。
# 色の継ぎ目で分かれた点を位置でまとめ、法線をそろえる。面は減らさない。
import bpy, bmesh
import numpy as np
from a2 import CFG, wpath, tex_of, mesh_arrays, vert_colors, hsv


def load_normalized():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=wpath(CFG['generate']['file']))
    ob = max((o for o in bpy.data.objects if o.type == 'MESH'), key=lambda o: len(o.data.polygons))
    ob.name = 'avatar'; ob.data.name = 'avatar'; me = ob.data
    me.transform(ob.matrix_world); ob.matrix_world.identity()
    for o in list(bpy.data.objects):
        if o != ob: bpy.data.objects.remove(o)
    bm = bmesh.new(); bm.from_mesh(me); n0 = len(bm.verts)
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    merged = n0 - len(bm.verts); bm.to_mesh(me); bm.free(); me.update()
    V, NV, TRI = mesh_arrays(me)
    zmin, zmax = V[:, 2].min(), V[:, 2].max(); s = 1.0 / (zmax - zmin)
    V = (V - [0, 0, zmin]) * s
    img = tex_of(ob); img.name = 'body'
    vcol, _ = vert_colors(me, img, TRI)
    # 前の向き: 目（頭の高さの、とても暗い点）が −Y 側。逆なら 180° 回す
    _, _, vv = hsv(vcol)
    eye = (V[:, 2] > 0.5) & (V[:, 2] < 0.85) & (vv < 0.22)
    flipped = bool(eye.any() and V[eye, 1].mean() > np.median(V[:, 1]))
    if flipped: V[:, :2] *= -1
    foot = V[:, 2] < 0.03
    cx = (V[:, 0].max() + V[:, 0].min()) / 2; cy = (V[foot, 1].max() + V[foot, 1].min()) / 2
    V[:, 0] -= cx; V[:, 1] -= cy
    me.vertices.foreach_set('co', V.astype(np.float32).ravel()); me.update()
    for p in me.polygons: p.use_smooth = True
    V, NV, TRI = mesh_arrays(me)
    info = dict(src=CFG['generate']['file'], merged_verts=merged, verts=len(V), tris=len(TRI), flipped=flipped, scale=round(float(s), 5),
                bbox=[[round(float(V[:, k].min()), 4), round(float(V[:, k].max()), 4)] for k in range(3)], tex=list(img.size))
    return ob, me, V, NV, TRI, vcol, info

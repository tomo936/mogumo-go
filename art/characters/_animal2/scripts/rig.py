# 骨の姿勢の道具（段 3 の試しの姿勢と段 5 の動きが使う）。キリンの build.py の reset・rot・apply_pose・export・key_all を写したもの
# （しっぽ・耳の骨は「骨があれば動かす」。しばは骨なし）。ねじり・手首の値は config の motion（無ければ 0）。
import bpy, math, os
from mathutils import Matrix, Vector, Quaternion
from a2 import CFG

MO = CFG.get('motion', {})
LEG_STAND = MO.get('legStand', 0.0); TWIST_F = MO.get('twistForearm', 0.0); TWIST_H = MO.get('twistHand', 0.0)
TWIST_U = MO.get('twistUpper', 0.0); HAND_IN = MO.get('handIn', 0.0); HAND_COMP = MO.get('handComp', 0.0)


def reset(rig):
    for pb in rig.pose.bones:
        pb.rotation_mode = 'QUATERNION'; pb.matrix_basis = Matrix()
    bpy.context.view_layer.update()


def rot(rig, name, *rots, offset=None):
    pb = rig.pose.bones.get(name)
    if pb is None: return
    h = pb.head.copy(); R = Matrix.Identity(4)
    for axis, ang in rots: R = R @ Matrix.Rotation(ang, 4, axis)
    M = Matrix.Translation(h) @ R @ Matrix.Translation(-h)
    if offset is not None: M = Matrix.Translation(offset) @ M
    pb.matrix = M @ pb.matrix
    bpy.context.view_layer.update()


def apply_pose(rig, p, armDown):
    """p: 姿勢の値（ラジアン）。armDown: A ポーズから腕を下ろす量（ラジアン、負で上げる）"""
    g = lambda k: p.get(k, 0.0)
    reset(rig)
    rot(rig, 'hips', ('Z', g('hipTwist')), ('Y', g('hipRoll')), ('X', g('lean')), offset=Vector((0, 0, g('y'))))
    rot(rig, 'chest', ('Z', g('chestTwist')), ('Y', g('chestRoll')), ('X', g('chestLean')))
    rot(rig, 'head', ('Z', g('headTwist')), ('X', g('headPitch')))
    for s_, sg_ in (('L', 1), ('R', -1)):
        if 'ear' + s_ in rig.pose.bones:
            rot(rig, 'ear' + s_, ('Z', sg_ * (g('earBack') + g('earBack' + s_))), ('Y', -sg_ * (g('earUp') + g('earUp' + s_))))
    if 'tail1' in rig.pose.bones:
        rot(rig, 'tail1', ('Z', g('tailSwing')), ('X', g('tailLift')))
        rot(rig, 'tail2', ('Z', g('tailSwing2')), ('X', g('tailLift2')))
    for s, sg in (('L', 1), ('R', -1)):
        rot(rig, 'upperarm' + s, ('X', -g('arm' + s)), ('Y', sg * (armDown - g('armOut') - g('armOut' + s))))
        if TWIST_U:
            ua_ = rig.pose.bones['upperarm' + s]; uav = (ua_.tail - ua_.head).normalized()
            rot(rig, 'upperarm' + s, (uav, sg * TWIST_U))
        fa_ = rig.pose.bones['forearm' + s]; axv = (fa_.tail - fa_.head).normalized()
        rot(rig, 'forearm' + s, ('X', -g('elbow' + s)), (axv, sg * (TWIST_F + g('twist' + s))))
        for bn, q in (('hand' + s, Quaternion((0, 1, 0), sg * (TWIST_H + g('handTwist' + s)))), ('fingers' + s, Quaternion((1, 0, 0), g('fingers' + s)))):
            pb_ = rig.pose.bones.get(bn)
            if pb_ is not None: pb_.rotation_quaternion = q
        bpy.context.view_layer.update()
        if HAND_IN: rot(rig, 'hand' + s, ('Y', sg * HAND_IN))
        if HAND_COMP: rot(rig, 'hand' + s, ('X', HAND_COMP * max(0.0, g('arm' + s) + g('elbow' + s))))
        rot(rig, 'thigh' + s, ('Y', -sg * (LEG_STAND + g('legOut'))), ('X', -g('thigh' + s)))
        rot(rig, 'shin' + s, ('X', g('knee' + s)))
        rot(rig, 'foot' + s, ('Y', sg * (LEG_STAND + g('legOut'))), ('X', g('foot' + s)))


def export(path, anim=True):
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_apply=False, export_normals=True, export_texcoords=True,
                              export_skins=True, export_animations=anim, export_animation_mode='ACTIONS', export_force_sampling=True,
                              export_yup=True, export_image_format='WEBP', export_image_quality=84, export_attributes=False, export_anim_slide_to_zero=True)


def key_all(rig, frame):
    for pb in rig.pose.bones:
        pb.keyframe_insert('rotation_quaternion', frame=frame); pb.keyframe_insert('location', frame=frame); pb.keyframe_insert('scale', frame=frame)

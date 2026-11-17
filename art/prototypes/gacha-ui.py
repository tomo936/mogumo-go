# ミシェーラのガチャ画面・引く画面の素材（art/gacha/ui/*.png）を、アプリ用の WebP にする（src/assets/gacha/ui/）。
# 使い方: blender -b -P art/prototypes/gacha-ui.py -- <リポジトリの場所>
import bpy, sys, os
root = sys.argv[sys.argv.index('--') + 1]
src = os.path.join(root, 'art/gacha/ui'); dst = os.path.join(root, 'src/assets/gacha/ui')
os.makedirs(dst, exist_ok=True)
W = {'01-bg': 1179, '02-sign': 800, '03-stage': 900, '03-light-pillar': 640, '04-ribbon': 600, '05-star': 128,
     '06-new': 240, '07-bg': 1179, '08-pot': 900, '09-lid': 900, '10-steam': 344}
sc = bpy.context.scene
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'
s = sc.render.image_settings; s.file_format = 'WEBP'; s.quality = 82
for name, w in W.items():
    img = bpy.data.images.load(os.path.join(src, name + '.png'))
    iw, ih = img.size
    if iw > w: img.scale(w, round(ih * w / iw))
    s.color_mode = 'RGB' if name.endswith('bg') else 'RGBA'
    img.save_render(os.path.join(dst, name + '.webp'), scene=sc)
    print('ok', name, img.size[0], img.size[1])

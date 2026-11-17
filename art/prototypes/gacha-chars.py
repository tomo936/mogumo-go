# ガチャのキャラの原画（art/gacha/chars/char-NN-*.webp、1600px）を、アプリ用に長辺 640px の WebP にする（src/assets/gacha/chars/NN.webp）。
# 使い方: blender -b -P art/prototypes/gacha-chars.py -- <リポジトリの場所>
import bpy, sys, os, re
root = sys.argv[sys.argv.index('--') + 1]
src = os.path.join(root, 'art/gacha/chars'); dst = os.path.join(root, 'src/assets/gacha/chars')
os.makedirs(dst, exist_ok=True)
sc = bpy.context.scene; s = sc.render.image_settings
sc.view_settings.view_transform = 'Standard'; sc.view_settings.look = 'None'  # 色をそのまま（既定の AgX だと暗くなる）
s.file_format = 'WEBP'; s.quality = 82; s.color_mode = 'RGB'
for f in sorted(os.listdir(src)):
    m = re.match(r'char-(\d\d)-.*\.webp$', f)
    if not m: continue
    img = bpy.data.images.load(os.path.join(src, f))
    w, h = img.size; k = 640 / max(w, h)
    img.scale(round(w * k), round(h * k))
    img.save_render(os.path.join(dst, m.group(1) + '.webp'), scene=sc)
    print('ok', f)

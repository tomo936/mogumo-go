# まとめのピンの台（オーナーの絵 art/pins/cluster-frame.png、2026-11-16）を、透明な余白を切って
# ピンの先が絵の下の真ん中に来る正方形にし、256px で src/assets/pins/cluster-base.png に出す。数字を入れる丸の真ん中と半径も測って出す。
# 使い方: PY=/home/otosa/tools/blender/blender-4.2.3-linux-x64/4.2/python/bin/python3.11; $PY art/prototypes/cluster-base.py
import subprocess
import numpy as np

SRC = 'art/pins/cluster-frame.png'
DST = 'src/assets/pins/cluster-base.png'
OUT = 256

w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', SRC]).decode().strip().split(','))
img = np.frombuffer(subprocess.check_output(['ffmpeg', '-v', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-']), np.uint8).reshape(h, w, 4)
ys, xs = np.where(img[:, :, 3] > 16)
x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
crop = img[y0:y1, x0:x1]
ch, cw = crop.shape[:2]
side = max(ch, cw)
sq = np.zeros((side, side, 4), np.uint8)
ox = (side - cw) // 2
sq[side - ch:, ox:ox + cw] = crop  # 下にそろえる（ピンの先が下の真ん中）
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{side}x{side}', '-i', '-', '-vf', f'scale={OUT}:{OUT}:flags=lanczos', DST], input=sq.tobytes(), check=True)
# クリーム色の丸（数字を入れる所）
rgb = sq[:, :, :3].astype(int)
cream = (rgb[:, :, 0] > 235) & (rgb[:, :, 1] > 225) & (rgb[:, :, 2] > 200) & (sq[:, :, 3] > 200)
cy_, cx_ = np.where(cream)
k = OUT / side
print('circle center', round((cx_.min() + cx_.max()) / 2 * k, 1), round((cy_.min() + cy_.max()) / 2 * k, 1), 'radius', round((cx_.max() - cx_.min()) / 2 * k, 1), round((cy_.max() - cy_.min()) / 2 * k, 1))

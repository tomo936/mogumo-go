# 図鑑・シートの種類の絵（src/assets/shops/cards/<種類>.webp）を、白い背景の元の絵から作る。
# 外側（絵の縁）につながる白っぽい所だけを透明にし（建物の中の白は残す）、絵の大きさに切り詰めて幅 360px にする。
# 使い方（numpy の入った Blender の Python で）:
#   PY=/home/otosa/tools/blender/blender-4.2.3-linux-x64/4.2/python/bin/python3.11
#   $PY art/prototypes/cards-cutout.py burger donburi ethnic okonomiyaki takoyaki
# 読み書きは ffmpeg（生の RGBA を受け渡し）。2026-11-13 図鑑の「？」が帯になる（背景ごと黒くなる）ので作った。
import subprocess, sys
import numpy as np

SRC = 'art/reference/shops/{}.webp'
DST = 'src/assets/shops/cards/{}.webp'
OUT_W = 360

def read(path):
    w, h = map(int, subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path]).decode().strip().split(','))
    raw = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', path, '-f', 'rawvideo', '-pix_fmt', 'rgba', '-'])
    return np.frombuffer(raw, np.uint8).reshape(h, w, 4).copy()

def write(img, path):
    h, w = img.shape[:2]
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', f'{w}x{h}', '-i', '-',
                    '-vf', f'scale={OUT_W}:-2:flags=lanczos', '-c:v', 'libwebp', '-lossless', '0', '-q:v', '88', '-pix_fmt', 'yuva420p', path],
                   input=img.tobytes(), check=True)

def cutout(img):
    rgb = img[:, :, :3].astype(np.int16)
    lo = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - lo
    cand = (lo >= 228) & (chroma <= 18)          # 白っぽい（背景と、建物の下のごく薄い影）
    region = np.zeros_like(cand)
    region[0, :] = cand[0, :]; region[-1, :] = cand[-1, :]; region[:, 0] = cand[:, 0]; region[:, -1] = cand[:, -1]
    while True:                                   # 縁から白っぽい所をたどって広げる
        grown = region.copy()
        grown[1:, :] |= region[:-1, :]; grown[:-1, :] |= region[1:, :]
        grown[:, 1:] |= region[:, :-1]; grown[:, :-1] |= region[:, 1:]
        grown &= cand
        if (grown == region).all():
            break
        region = grown
    alpha = np.where(region, 0, 255).astype(np.float32)
    # 縁をなめらかに: 背景のとなりの画素は白さに応じて少し透かす
    edge = np.zeros_like(region)
    edge[1:, :] |= region[:-1, :]; edge[:-1, :] |= region[1:, :]; edge[:, 1:] |= region[:, :-1]; edge[:, :-1] |= region[:, 1:]
    edge &= ~region
    soft = np.clip((255 - lo) / 40.0, 0, 1) * 255
    alpha[edge] = np.minimum(alpha[edge], soft[edge])
    out = img.copy()
    out[:, :, 3] = alpha.astype(np.uint8)
    ys, xs = np.where(alpha > 0)
    pad = 8
    y0, y1 = max(0, ys.min() - pad), min(img.shape[0], ys.max() + pad + 1)
    x0, x1 = max(0, xs.min() - pad), min(img.shape[1], xs.max() + pad + 1)
    return out[y0:y1, x0:x1]

for kind in sys.argv[1:]:
    write(cutout(read(SRC.format(kind))), DST.format(kind))
    print('ok', kind)

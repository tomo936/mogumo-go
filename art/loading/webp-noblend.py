# 連番から ffmpeg で作ったアニメ WebP は、全部のコマが「前のコマの上に重ねる（blend）」になっていて、
# iPhone では透明な所に前のコマが残り、フライパンが何重にも見えた（2026-11-16 オーナー）。
# どのコマも全面の大きさなので、コマごとの印を「重ねずに置き換える（no blend）」にする。絵の中身は変えない。
# 使い方: python3 -I art/loading/webp-noblend.py src/assets/ui/loading-pancake.webp
import struct, sys
path = sys.argv[1]
d = bytearray(open(path, 'rb').read())
i, n = 12, 0
while i < len(d):
    size = struct.unpack('<I', d[i + 4:i + 8])[0]
    if d[i:i + 4] == b'ANMF':
        d[i + 8 + 15] |= 2  # 2 = 重ねない
        n += 1
    i += 8 + size + (size & 1)
open(path, 'wb').write(d)
print(n, 'frames')

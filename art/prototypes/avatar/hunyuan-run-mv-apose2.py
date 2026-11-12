# 参考画像 3 枚（正面・横・後ろ。背景を抜いた PNG）から、形だけの 3D と色付きの 3D（GLB）を、ComfyUI＋Hunyuan3D-2mv（3 枚入力版）で作る。
# hunyuan-run.py（1 枚版）からの変更は 3 か所: ①絵を 3 枚読む ②形を作るノードを Hy3DGenerateMeshMultiView に ③モデルの名前。
# 使い方（Windows 側の Python で）: python run_ref_mv.py [seed] [ラベル] [横の絵の入れ方] [モデルのファイル名] [手数]
#   横の絵の入れ方: right（そのまま right に入れる。既定）／ left（左右を返した絵を left に入れる）／ none（横の絵を使わない）
#   例: python run_ref_mv.py 123 mv123 right
# 向きの決まり（Tencent 公式の見本画像で確認 2026-11-11）: left ＝ キャラが画面の左を向いた横顔。参考画像の横の絵は右を向いているので right。
# ComfyUI は 127.0.0.1:8188 で起動しておく（--disable-pinned-memory を付ける）。
# 入力の絵は ComfyUI/input に置く: apose2-front-rgba.png・boy-ref-side-rgba.png・boy-ref-side-mirror-rgba.png・apose2-back-rgba.png
# できる物: ComfyUI/output/mogumo/boy_<ラベル>_shape_*.glb（形だけ）・boy_<ラベル>_textured_*.glb（色付き。色は区分けの手がかりに使う）
import json, sys, time, urllib.request
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 123
tag = sys.argv[2] if len(sys.argv) > 2 else f'mv{seed}'
side = sys.argv[3] if len(sys.argv) > 3 else 'right'
model = sys.argv[4] if len(sys.argv) > 4 else 'hunyuan3d-dit-v2-mv-fp16.safetensors'
steps = int(sys.argv[5]) if len(sys.argv) > 5 else 50
image = 'apose2-front-rgba.png'
CAM = ['0, 90, 180, 270, 0, 180', '0, 0, 0, 0, 90, -90', '1, 0.1, 0.5, 0.1, 0.05, 0.05', 1.45, 1.2]
g = {
  'img': ('LoadImage', {'image': image}),
  'obj': ('InvertMask', {'mask': ['img', 1]}),
  'model': ('Hy3DModelLoader', {'model': model, 'attention_mode': 'sdpa'}),
  # --- 3 枚入力: 絵を 518x518 にして、透明の情報（どこがキャラか）を付けて渡す ---
  'imgB': ('LoadImage', {'image': 'apose2-back-rgba.png'}),
  'sF': ('ImageScale', {'image': ['img', 0], 'upscale_method': 'lanczos', 'width': 518, 'height': 518, 'crop': 'disabled'}),
  'sB': ('ImageScale', {'image': ['imgB', 0], 'upscale_method': 'lanczos', 'width': 518, 'height': 518, 'crop': 'disabled'}),
  'jF': ('JoinImageWithAlpha', {'image': ['sF', 0], 'alpha': ['img', 1]}),
  'jB': ('JoinImageWithAlpha', {'image': ['sB', 0], 'alpha': ['imgB', 1]}),
  'gen': ('Hy3DGenerateMeshMultiView', {'pipeline': ['model', 0], 'guidance_scale': 5.5, 'steps': steps, 'seed': seed, 'front': ['jF', 0], 'back': ['jB', 0]}),
  'vae': ('Hy3DVAEDecode', {'vae': ['model', 1], 'latents': ['gen', 0], 'box_v': 1.01, 'octree_resolution': 384, 'num_chunks': 32000, 'mc_level': 0.0, 'mc_algo': 'mc', 'force_offload': True}),
  'post': ('Hy3DPostprocessMesh', {'trimesh': ['vae', 0], 'remove_floaters': True, 'remove_degenerate_faces': True, 'reduce_faces': True, 'max_facenum': 30000, 'smooth_normals': False}),
  'shape_out': ('Hy3DExportMesh', {'trimesh': ['post', 0], 'filename_prefix': f'mogumo/boyT_{tag}_shape', 'file_format': 'glb', 'save_file': True}),
  'uv': ('Hy3DMeshUVWrap', {'trimesh': ['post', 0]}),
  'cam': ('Hy3DCameraConfig', dict(zip(['camera_azimuths', 'camera_elevations', 'view_weights', 'camera_distance', 'ortho_scale'], CAM))),
  'render': ('Hy3DRenderMultiView', {'trimesh': ['uv', 0], 'render_size': 1024, 'texture_size': 2048, 'camera_config': ['cam', 0], 'normal_space': 'world'}),
  'bgmask': ('SolidMask', {'value': 0.8, 'width': 1024, 'height': 1024}),
  'bg': ('MaskToImage', {'mask': ['bgmask', 0]}),
  'comp': ('ImageCompositeMasked', {'destination': ['bg', 0], 'source': ['img', 0], 'x': 0, 'y': 0, 'resize_source': False, 'mask': ['obj', 0]}),
  'dmodel': ('DownloadAndLoadHy3DDelightModel', {'model': 'hunyuan3d-delight-v2-0'}),
  'dsched': ('Hy3DDiffusersSchedulerConfig', {'pipeline': ['dmodel', 0], 'scheduler': 'Euler A', 'sigmas': 'default'}),
  'delight': ('Hy3DDelightImage', {'delight_pipe': ['dmodel', 0], 'image': ['comp', 0], 'steps': 50, 'width': 512, 'height': 512, 'cfg_image': 1.0, 'seed': 0, 'scheduler': ['dsched', 0]}),
  'pmodel': ('DownloadAndLoadHy3DPaintModel', {'model': 'hunyuan3d-paint-v2-0'}),
  'psched': ('Hy3DDiffusersSchedulerConfig', {'pipeline': ['pmodel', 0], 'scheduler': 'Euler A', 'sigmas': 'default'}),
  'mv': ('Hy3DSampleMultiView', {'pipeline': ['pmodel', 0], 'ref_image': ['delight', 0], 'normal_maps': ['render', 0], 'position_maps': ['render', 1], 'view_size': 512, 'steps': 25, 'seed': 1024, 'camera_config': ['cam', 0], 'scheduler': ['psched', 0]}),
  'bake': ('Hy3DBakeFromMultiview', {'images': ['mv', 0], 'renderer': ['render', 2], 'camera_config': ['cam', 0]}),
  'vinp': ('Hy3DMeshVerticeInpaintTexture', {'texture': ['bake', 0], 'mask': ['bake', 1], 'renderer': ['bake', 2]}),
  'cvinp': ('CV2InpaintTexture', {'texture': ['vinp', 0], 'mask': ['vinp', 1], 'inpaint_radius': 3, 'inpaint_method': 'ns'}),
  'apply': ('Hy3DApplyTexture', {'texture': ['cvinp', 0], 'renderer': ['vinp', 2]}),
  'out': ('Hy3DExportMesh', {'trimesh': ['apply', 0], 'filename_prefix': f'mogumo/boyT_{tag}_textured', 'file_format': 'glb', 'save_file': True}),
  'mvsave': ('SaveImage', {'images': ['mv', 0], 'filename_prefix': f'mogumo/boyT_{tag}_views'}),
}
if side in ('right', 'left'):
    g['imgS'] = ('LoadImage', {'image': 'apose2-side-rgba.png'})
    g['sS'] = ('ImageScale', {'image': ['imgS', 0], 'upscale_method': 'lanczos', 'width': 518, 'height': 518, 'crop': 'disabled'})
    g['jS'] = ('JoinImageWithAlpha', {'image': ['sS', 0], 'alpha': ['imgS', 1]})
    g['gen'][1][side] = ['jS', 0]
print('views: front + back' + (f' + {side}' if side in ('right', 'left') else ''), '| model', model, '| steps', steps, '| seed', seed, flush=True)
prompt = {k: {'class_type': c, 'inputs': i} for k, (c, i) in g.items()}
req = urllib.request.Request('http://127.0.0.1:8188/prompt', json.dumps({'prompt': prompt}).encode(), {'Content-Type': 'application/json'})
try:
    pid = json.load(urllib.request.urlopen(req))['prompt_id']
except urllib.error.HTTPError as e:
    print('REJECTED', e.read().decode()[:2000]); sys.exit(1)
t0 = time.time()
print('queued', pid, flush=True)
while True:
    time.sleep(5)
    h = json.load(urllib.request.urlopen(f'http://127.0.0.1:8188/history/{pid}'))
    if pid in h:
        st = h[pid]['status']
        print('DONE' if st.get('completed') else 'FAILED', st.get('status_str'), f'{time.time()-t0:.0f}s', flush=True)
        for m in st.get('messages', []):
            if m[0] == 'execution_error': print(json.dumps(m[1])[:1500])
        break

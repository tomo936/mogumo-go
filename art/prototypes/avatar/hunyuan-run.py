# 参考画像（背景を抜いた PNG）から、形だけの 3D と色付きの 3D（GLB）を ComfyUI＋Hunyuan3D-2 で作る。
# D:\\mogumo-3d\\tools\\run_boy.py（2026-11-10 に色付きまで 192 秒で成功した台本）を、画像の名前を選べるようにしただけ。
# 使い方（Windows 側の Python で）: python hunyuan-run.py <ComfyUI/input にある画像の名前> <seed> <ラベル>
#   例: python hunyuan-run.py boy-ref-front-rgba.png 123 ref123
# ComfyUI は 127.0.0.1:8188 で起動しておく（--disable-pinned-memory を付ける）。
# できる物: ComfyUI/output/mogumo/boy_<ラベル>_shape_*.glb（形だけ）・boy_<ラベル>_textured_*.glb（色付き）・boy_<ラベル>_views_*.png
import json, sys, time, urllib.request
image = sys.argv[1] if len(sys.argv) > 1 else 'boy-ref-front-rgba.png'
seed = int(sys.argv[2]) if len(sys.argv) > 2 else 123
tag = sys.argv[3] if len(sys.argv) > 3 else f'ref{seed}'
CAM = ['0, 90, 180, 270, 0, 180', '0, 0, 0, 0, 90, -90', '1, 0.1, 0.5, 0.1, 0.05, 0.05', 1.45, 1.2]
g = {
  'img': ('LoadImage', {'image': image}),
  'obj': ('InvertMask', {'mask': ['img', 1]}),
  'model': ('Hy3DModelLoader', {'model': 'hunyuan3d-dit-v2-0-fp16.safetensors', 'attention_mode': 'sdpa'}),
  'gen': ('Hy3DGenerateMesh', {'pipeline': ['model', 0], 'image': ['img', 0], 'mask': ['obj', 0], 'guidance_scale': 5.5, 'steps': 50, 'seed': seed, 'force_offload': True}),
  'vae': ('Hy3DVAEDecode', {'vae': ['model', 1], 'latents': ['gen', 0], 'box_v': 1.01, 'octree_resolution': 384, 'num_chunks': 32000, 'mc_level': 0.0, 'mc_algo': 'mc', 'force_offload': True}),
  'post': ('Hy3DPostprocessMesh', {'trimesh': ['vae', 0], 'remove_floaters': True, 'remove_degenerate_faces': True, 'reduce_faces': True, 'max_facenum': 50000, 'smooth_normals': False}),
  'shape_out': ('Hy3DExportMesh', {'trimesh': ['post', 0], 'filename_prefix': f'mogumo/boy_{tag}_shape', 'file_format': 'glb', 'save_file': True}),
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
  'out': ('Hy3DExportMesh', {'trimesh': ['apply', 0], 'filename_prefix': f'mogumo/boy_{tag}_textured', 'file_format': 'glb', 'save_file': True}),
  'mvsave': ('SaveImage', {'images': ['mv', 0], 'filename_prefix': f'mogumo/boy_{tag}_views'}),
}
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

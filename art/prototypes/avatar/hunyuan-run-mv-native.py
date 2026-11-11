# 代替（Hunyuan3D-2mv の公式ファイルが kijai のノードで読めなかったとき用）: ComfyUI 本体の 3 枚入力の機能で、形だけの GLB を作る。
# 色の工程は無い。モデルのファイルは ComfyUI/models/checkpoints/ に置く（同じ公式ファイル。名前は下の既定か、引数で渡す）。
# 使い方（Windows 側の Python で）: python run_ref_mv_native.py [seed] [ラベル] [横の絵の入れ方 right|left|none] [モデルのファイル名] [手数]
# ComfyUI の公式の説明（docs.comfy.org/tutorials/3d/hunyuan3D-2）の手順と同じつなぎ方。
# できる物: ComfyUI/output/mogumo/boy_<ラベル>_native_*.glb
import json, sys, time, urllib.request
seed = int(sys.argv[1]) if len(sys.argv) > 1 else 123
tag = sys.argv[2] if len(sys.argv) > 2 else f'mvn{seed}'
side = sys.argv[3] if len(sys.argv) > 3 else 'right'
model = sys.argv[4] if len(sys.argv) > 4 else 'hunyuan3d-dit-v2-mv.safetensors'
steps = int(sys.argv[5]) if len(sys.argv) > 5 else 30
g = {
  'ckpt': ('ImageOnlyCheckpointLoader', {'ckpt_name': model}),
  'ms': ('ModelSamplingAuraFlow', {'model': ['ckpt', 0], 'shift': 1.0}),
  'imgF': ('LoadImage', {'image': 'boy-ref-front-rgba.png'}),
  'imgB': ('LoadImage', {'image': 'boy-ref-back-rgba.png'}),
  'cF': ('CLIPVisionEncode', {'clip_vision': ['ckpt', 1], 'image': ['imgF', 0], 'crop': 'none'}),
  'cB': ('CLIPVisionEncode', {'clip_vision': ['ckpt', 1], 'image': ['imgB', 0], 'crop': 'none'}),
  'cond': ('Hunyuan3Dv2ConditioningMultiView', {'front': ['cF', 0], 'back': ['cB', 0]}),
  'lat': ('EmptyLatentHunyuan3Dv2', {'resolution': 3072, 'batch_size': 1}),
  'ks': ('KSampler', {'model': ['ms', 0], 'seed': seed, 'steps': steps, 'cfg': 5.0, 'sampler_name': 'euler', 'scheduler': 'normal', 'positive': ['cond', 0], 'negative': ['cond', 1], 'latent_image': ['lat', 0], 'denoise': 1.0}),
  'dec': ('VAEDecodeHunyuan3D', {'samples': ['ks', 0], 'vae': ['ckpt', 2], 'num_chunks': 8000, 'octree_resolution': 256}),
  'mesh': ('VoxelToMesh', {'voxel': ['dec', 0], 'algorithm': 'surface net', 'threshold': 0.6}),
  'out': ('SaveGLB', {'mesh': ['mesh', 0], 'filename_prefix': f'mogumo/boy_{tag}_native'}),
}
if side in ('right', 'left'):
    g['imgS'] = ('LoadImage', {'image': 'boy-ref-side-rgba.png' if side == 'right' else 'boy-ref-side-mirror-rgba.png'})
    g['cS'] = ('CLIPVisionEncode', {'clip_vision': ['ckpt', 1], 'image': ['imgS', 0], 'crop': 'none'})
    g['cond'][1][side] = ['cS', 0]
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

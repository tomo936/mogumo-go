// ポコタンを Live2D で描く（A5）。案内を開いたときだけ Cubism Core（public/live2d/core/）と Framework（src/vendor/）を読む。
// 動き: 呼吸のゆらゆら・物理（毛としっぽ）・まばたき。setTalking(true) の間だけ口パク。
// 参考: docs/reference/pokotan-live2d/（ぽこポケの PokoModel.js・Live2DCharacter.jsx）。
import type * as L2D from '../../vendor/live2d-framework/live2d-framework.js'

type Runtime = typeof L2D
const BASE = '/live2d/'

let corePromise: Promise<void> | null = null
function loadCore(): Promise<void> {
  if ((window as unknown as { Live2DCubismCore?: unknown }).Live2DCubismCore) return Promise.resolve()
  corePromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement('script')
    s.src = `${BASE}core/live2dcubismcore.min.js`
    s.onload = () => resolve()
    s.onerror = () => {
      corePromise = null
      reject(new Error('Live2D Core を読めない'))
    }
    document.head.appendChild(s)
  })
  return corePromise
}

let started = false
async function loadRuntime(): Promise<Runtime> {
  await loadCore()
  // Framework は読み込んだ瞬間に Core を使うので、Core の後に import する
  const rt = await import('../../vendor/live2d-framework/live2d-framework.js')
  if (!started) {
    const opt = new rt.Option()
    opt.logFunction = (m) => console.warn(m)
    opt.loggingLevel = rt.LogLevel.LogLevel_Error
    rt.CubismFramework.startUp(opt)
    rt.CubismFramework.initialize()
    started = true
  }
  return rt
}

const BLINK_MIN_S = 2
const BLINK_MAX_S = 5
const BLINK_S = 0.2
const MOUTH_HZ = 4.5 // 口パクの速さ（1 秒に開く回数）

function makeModelClass(rt: Runtime) {
  const id = (name: string) => rt.CubismFramework.getIdManager().getId(rt.CubismDefaultParameterId[name])
  return class PokoModel extends rt.CubismUserModel {
    talking = false
    private gl: WebGLRenderingContext | WebGL2RenderingContext
    private breath: L2D.CubismBreath | null = null
    private blinkLeft = BLINK_MIN_S + Math.random() * (BLINK_MAX_S - BLINK_MIN_S)
    private blinkT = -1 // まばたき中の経過（-1 = していない）
    private talkT = 0
    private eyeL = id('ParamEyeLOpen')
    private eyeR = id('ParamEyeROpen')
    private mouth = id('ParamMouthOpenY')

    constructor(gl: WebGLRenderingContext | WebGL2RenderingContext) {
      super()
      this.gl = gl
    }

    async load(dir: string, file: string, width: number, height: number) {
      const get = async (f: string) => (await fetch(`${dir}${f}`)).arrayBuffer()
      const sb = await get(file)
      const setting = new rt.CubismModelSettingJson(sb, sb.byteLength)
      this.loadModel(await get(setting.getModelFileName()))
      const phys = setting.getPhysicsFileName()
      if (phys) {
        const pb = await get(phys)
        this.loadPhysics(pb, pb.byteLength)
      }
      this.breath = rt.CubismBreath.create()
      this.breath.setParameters([
        new rt.BreathParameterData(id('ParamAngleX'), 0, 15, 6.5345, 0.5),
        new rt.BreathParameterData(id('ParamAngleY'), 0, 8, 3.5345, 0.5),
        new rt.BreathParameterData(id('ParamAngleZ'), 0, 10, 5.5345, 0.5),
        new rt.BreathParameterData(id('ParamBodyAngleX'), 0, 4, 15.5345, 0.5),
        new rt.BreathParameterData(id('ParamBreath'), 0.5, 0.5, 3.2345, 1),
      ])
      const layout = new Map<string, number>()
      setting.getLayoutMap(layout)
      this._modelMatrix.setupFromLayout(layout)

      this.createRenderer(width, height)
      const r = this.getRenderer()
      r.setIsPremultipliedAlpha(true)
      r.startUp(this.gl)
      r.loadShaders(`${BASE}shaders/`)
      const gl = this.gl
      await Promise.all(
        Array.from({ length: setting.getTextureCount() }, (_, i) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image()
            img.onload = () => {
              const tex = gl.createTexture()!
              gl.bindTexture(gl.TEXTURE_2D, tex)
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
              gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
              gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1)
              gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img)
              gl.generateMipmap(gl.TEXTURE_2D)
              gl.bindTexture(gl.TEXTURE_2D, null)
              r.bindTexture(i, tex)
              resolve()
            }
            img.onerror = () => reject(new Error('ポコタンの絵を読めない'))
            img.src = `${dir}${setting.getTextureFileName(i)}`
          }),
        ),
      )
      this._initialized = true
    }

    tick(dt: number) {
      const m = this._model
      m.loadParameters()
      this.breath?.updateParameters(m, dt)
      m.saveParameters()
      this._physics?.evaluate(m, dt)
      // まばたき（モデルの EyeBlink の組が空なので、目のパラメータを直接動かす）
      let eye = 1
      if (this.blinkT >= 0) {
        this.blinkT += dt
        const t = this.blinkT / BLINK_S
        eye = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2
        if (t >= 1) {
          this.blinkT = -1
          this.blinkLeft = BLINK_MIN_S + Math.random() * (BLINK_MAX_S - BLINK_MIN_S)
        }
      } else if ((this.blinkLeft -= dt) <= 0) this.blinkT = 0
      m.setParameterValueById(this.eyeL, Math.max(0, Math.min(1, eye)))
      m.setParameterValueById(this.eyeR, Math.max(0, Math.min(1, eye)))
      // 口パク（しゃべっている間だけ。揺れは止めない）
      if (this.talking) {
        this.talkT += dt
        m.setParameterValueById(this.mouth, Math.max(0, Math.sin(this.talkT * Math.PI * 2 * MOUTH_HZ)))
      } else {
        this.talkT = 0
        m.setParameterValueById(this.mouth, 0)
      }
      m.update()
    }

    drawWith(projection: L2D.CubismMatrix44, width: number, height: number) {
      projection.multiplyByMatrix(this._modelMatrix)
      const r = this.getRenderer()
      r.setMvpMatrix(projection)
      r.setRenderState(null, [0, 0, width, height])
      r.drawModel()
    }
  }
}

export type PokoHandle = { setTalking(on: boolean): void; dispose(): void }

// canvas にポコタンを出す。読めなければ reject（画面は静止画に切り替える）
export async function mountPoko(canvas: HTMLCanvasElement, scale = 1): Promise<PokoHandle> {
  const rt = await loadRuntime()
  const dpr = window.devicePixelRatio || 1
  const fit = () => {
    canvas.width = Math.max(1, Math.round(canvas.clientWidth * dpr))
    canvas.height = Math.max(1, Math.round(canvas.clientHeight * dpr))
  }
  fit()
  const gl = canvas.getContext('webgl2', { premultipliedAlpha: true }) ?? canvas.getContext('webgl', { premultipliedAlpha: true })
  if (!gl) throw new Error('WebGL が使えない')
  const Poko = makeModelClass(rt)
  const model = new Poko(gl)
  await model.load(`${BASE}poko/`, 'poko.model3.json', canvas.width, canvas.height)

  let alive = true
  let raf = 0
  let last = performance.now()
  const frame = (now: number) => {
    if (!alive) return
    const dt = Math.min(0.1, (now - last) / 1000)
    last = now
    if (canvas.width !== Math.round(canvas.clientWidth * dpr)) fit()
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    model.tick(dt)
    const proj = new rt.CubismMatrix44()
    proj.scale((canvas.height / canvas.width) * scale, scale) // 縦の長さに合わせる（横長・縦長どちらの箱でも形がつぶれない）
    model.drawWith(proj, canvas.width, canvas.height)
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)
  return {
    setTalking: (on) => void (model.talking = on),
    dispose: () => {
      alive = false
      cancelAnimationFrame(raf)
      model.release()
    },
  }
}

// 霧（§12）。MapLibre のカスタムレイヤーに WebGL2 で、絵本風の雲の塊を描く。
// 塊はいつも画面のほうを向き、上が白・下側に水色の影。画面の奥から手前の順に重ねる。
// お店（3D の層）より後に描き、塊の根元の奥行きでお店と比べる（雲より奥のお店は雲に隠れる）。
import { MercatorCoordinate } from 'maplibre-gl'
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { FOG_RESORT_DEG, POP_S, THIN_RADIUS_M } from '../config.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { drawOrder } from '../domain/clumps.ts'
import type { Clump } from '../domain/clumps.ts'
import type { AnimClump } from '../domain/wave.ts'

const LIFT = 0.22 // 影の帯の厚み（塊の半幅に対する割合）
const SOFT = 0.12 // 白と影の境目のぼかし

// 塊1つ = 四角1枚。四角の大きさは塊の形が収まる範囲（単位は半幅）
const VS = `#version 300 es
precision highp float;
const float POP_S = ${POP_S.toFixed(3)};
const float THIN_R = ${THIN_RADIUS_M.toFixed(1)};
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_clump; // x, y（origin からの m）, w（半幅 m）, 種
layout(location=2) in vec2 a_anim; // 変化後の半幅, 変化の始まり（秒、<0 は変化なし）
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_time;
uniform vec3 u_thin[4]; // お店の x, y（m）, 薄さ（0 なら未使用）
out vec2 v_uv;
out float v_seed;
out float v_alpha;
const vec2 LO = vec2(-1.3, -0.75);
const vec2 HI = vec2(1.3, 1.25);
vec2 px(vec4 c) { return c.xy / c.w * u_viewport * 0.5; }
void main() {
  float w = a_clump.z;
  v_alpha = 1.0;
  if (a_anim.y >= 0.0) {
    float t = clamp((u_time - a_anim.y) / POP_S, 0.0, 1.0);
    // ふくらむ（0〜0.35）→ はじけて縮む（0.35〜1）
    float swell = 1.0 + 0.22 * sin(clamp(t / 0.35, 0.0, 1.0) * 1.5708);
    float k = t < 0.35 ? 0.0 : (t - 0.35) / 0.65;
    k = k * k * (3.0 - 2.0 * k);
    w = mix(a_clump.z * swell, a_anim.x, k);
    if (a_anim.x <= 0.0) v_alpha = 1.0 - smoothstep(0.55, 1.0, t);
    if (w <= 0.01) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); v_uv = vec2(0.0); v_seed = 0.0; return; }
  }
  // お店のまわりは雲を透かす（塊の中心からの距離で決める）
  float thin = 0.0;
  for (int i = 0; i < 4; i++) {
    float f = 1.0 - smoothstep(0.0, THIN_R, length(a_clump.xy - u_thin[i].xy));
    thin = max(thin, u_thin[i].z * f);
  }
  v_alpha *= 1.0 - 0.75 * thin;
  vec4 c = u_matrix * vec4(a_clump.xy, 0.0, 1.0);
  vec4 ex = u_matrix * vec4(a_clump.xy + vec2(w, 0.0), 0.0, 1.0);
  vec4 ny = u_matrix * vec4(a_clump.xy + vec2(0.0, w), 0.0, 1.0);
  // 半幅が画面で何 px か（東と北のうち長く見える方。傾けても潰れない）
  float wpx = max(length(px(ex) - px(c)), length(px(ny) - px(c)));
  // カメラの真下より後ろの塊は、画面に映らないのに何倍も大きく計算される（地図を回すと画面を覆う）。描かない
  if (c.w <= 0.0 || ex.w <= 0.0 || ny.w <= 0.0 || wpx > u_viewport.y) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    v_uv = vec2(0.0);
    v_seed = 0.0;
    return;
  }
  vec2 uv = mix(LO, HI, a_corner * 0.5 + 0.5);
  // 奥行き（z）は塊の根元のまま。四角全体が根元と同じ奥行きになる
  gl_Position = c + vec4(uv * wpx / (u_viewport * 0.5) * c.w, 0.0, 0.0);
  v_uv = uv;
  v_seed = a_clump.w;
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_seed;
in float v_alpha;
uniform float u_lift;
uniform float u_soft;
out vec4 o;
float h(float k) { return fract(sin(v_seed * 91.7 + k * 37.3) * 43758.5453); }
float sdBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// 塊の形: 横長の胴＋上の膨らみ4つ。中は負、外は正の距離
float shape(vec2 p) {
  float d = sdBox(p - vec2(0.0, -0.3), vec2(1.0, 0.32), 0.32);
  for (int i = 0; i < 4; i++) {
    float fi = float(i);
    float x = -0.66 + fi * 0.44 + (h(fi) - 0.5) * 0.18;
    float r = 0.28 + 0.30 * (1.0 - abs(x)) + 0.10 * h(fi + 10.0);
    float y = -0.22 + r * 0.55 + 0.12 * h(fi + 20.0);
    d = min(d, length(p - vec2(x, y)) - r);
  }
  return d;
}
void main() {
  float d = shape(v_uv);
  float aa = fwidth(d) * 1.2;
  float a = 1.0 - smoothstep(-aa, 0.0, d);
  if (a <= 0.0) discard;
  // 少し下の所も塊の中なら白、外なら影（塊の下側にだけ水色の帯が出る）
  float lit = 1.0 - smoothstep(-u_soft, u_soft * 0.3, shape(v_uv - vec2(0.0, u_lift)));
  vec3 top = mix(vec3(1.0), vec3(0.94, 0.97, 1.0), 1.0 - smoothstep(-0.5, 0.6, v_uv.y));
  vec3 col = mix(vec3(0.70, 0.84, 0.96), top, lit);
  col = mix(col, vec3(0.62, 0.78, 0.93), smoothstep(-aa * 2.5, -aa, d) * 0.5); // ふちの薄い線
  a *= v_alpha;
  o = vec4(col * a, a);
}`

// 列優先の 4x4 の掛け算（倍精度で掛けてから float にする）
function mul(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16)
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      let s = 0
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]
      out[c * 4 + r] = s
    }
  }
  return out
}

function program(gl: WebGL2RenderingContext): WebGLProgram {
  const p = gl.createProgram()
  for (const [type, src] of [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]] as const) {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    gl.attachShader(p, s)
  }
  gl.linkProgram(p)
  return p
}

export type ThinSpot = { x: number; y: number; amount: number }
export type FogLayer = CustomLayerInterface & {
  setClumps(origin: LatLng, clumps: (Clump | AnimClump)[]): void
  setThin(spots: ThinSpot[]): void // 最大 4 つ。origin からの m
}

const MAX_THIN = 4
const FLOATS = 6 // 1塊あたり: x, y, w, 種, 変化後の半幅, 始まり

export function createFogLayer(): FogLayer {
  let map: MapLibreMap | null = null
  let gl: WebGL2RenderingContext | null = null
  let prog: WebGLProgram | null = null
  let vao: WebGLVertexArrayObject | null = null
  let quad: WebGLBuffer | null = null
  let inst: WebGLBuffer | null = null
  let uMatrix: WebGLUniformLocation | null = null
  let uViewport: WebGLUniformLocation | null = null
  let uLift: WebGLUniformLocation | null = null
  let uSoft: WebGLUniformLocation | null = null
  let uTime: WebGLUniformLocation | null = null
  let uThin: WebGLUniformLocation | null = null
  let origin: LatLng | null = null
  let clumps: (Clump | AnimClump)[] = []
  const thin = new Float32Array(MAX_THIN * 3)
  let animEnd = 0 // 動きがすべて終わる時刻（秒）
  let count = 0
  let sortedFor = NaN // 並べたときの地図の向き。NaN は「並べ直しが要る」

  // 重ね順は地図の向きだけで決まるので、向きが変わったときだけ並べ直して送る
  const upload = (bearing: number) => {
    if (!gl || !inst) return
    const sorted = drawOrder(clumps, bearing)
    const data = new Float32Array(sorted.length * FLOATS)
    sorted.forEach((c, n) => {
      const a = c as Partial<AnimClump>
      data.set([c.x, c.y, c.w, c.seed, a.w1 ?? c.w, a.start ?? -1], n * FLOATS)
    })
    gl.bindBuffer(gl.ARRAY_BUFFER, inst)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    count = sorted.length
    sortedFor = bearing
  }

  return {
    id: 'fog',
    type: 'custom',
    renderingMode: '3d', // お店の層と同じ奥行きの範囲を使う
    setClumps(o, cs) {
      origin = o
      clumps = cs
      animEnd = 0
      for (const c of cs) {
        const st = (c as Partial<AnimClump>).start
        if (st !== undefined && st >= 0) animEnd = Math.max(animEnd, st + POP_S)
      }
      sortedFor = NaN
      map?.triggerRepaint()
    },
    setThin(spots) {
      thin.fill(0)
      spots.slice(0, MAX_THIN).forEach((s, i) => thin.set([s.x, s.y, Math.min(1, Math.max(0, s.amount))], i * 3))
      map?.triggerRepaint()
    },
    onAdd(m, g) {
      map = m
      gl = g as WebGL2RenderingContext
      prog = program(gl)
      uMatrix = gl.getUniformLocation(prog, 'u_matrix')
      uViewport = gl.getUniformLocation(prog, 'u_viewport')
      uLift = gl.getUniformLocation(prog, 'u_lift')
      uSoft = gl.getUniformLocation(prog, 'u_soft')
      uTime = gl.getUniformLocation(prog, 'u_time')
      uThin = gl.getUniformLocation(prog, 'u_thin')
      vao = gl.createVertexArray()
      gl.bindVertexArray(vao)
      quad = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, quad)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
      inst = gl.createBuffer()
      gl.bindBuffer(gl.ARRAY_BUFFER, inst)
      gl.enableVertexAttribArray(1)
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, FLOATS * 4, 0)
      gl.vertexAttribDivisor(1, 1)
      gl.enableVertexAttribArray(2)
      gl.vertexAttribPointer(2, 2, gl.FLOAT, false, FLOATS * 4, 16)
      gl.vertexAttribDivisor(2, 1)
      gl.bindVertexArray(null)
      sortedFor = NaN
    },
    onRemove() {
      if (gl) {
        gl.deleteBuffer(quad)
        gl.deleteBuffer(inst)
        gl.deleteVertexArray(vao)
        gl.deleteProgram(prog)
      }
      map = null
      gl = null
    },
    render(_g, args) {
      if (!gl || !prog || !map || !origin) return
      const bearing = map.getBearing()
      if (!(Math.abs(bearing - sortedFor) < FOG_RESORT_DEG)) upload(bearing)
      if (count === 0) return
      // 地図の行列 × （origin へ移す・1m の大きさ・北を上に）。origin のまわりを m で描く
      const mc = MercatorCoordinate.fromLngLat([origin.lng, origin.lat], 0)
      const s = mc.meterInMercatorCoordinateUnits()
      const local = [s, 0, 0, 0, 0, -s, 0, 0, 0, 0, 1, 0, mc.x, mc.y, 0, 1]
      gl.useProgram(prog)
      gl.uniformMatrix4fv(uMatrix, false, mul(args.defaultProjectionData.mainMatrix as unknown as number[], local))
      gl.uniform2f(uViewport, gl.drawingBufferWidth, gl.drawingBufferHeight)
      gl.uniform1f(uLift, LIFT)
      gl.uniform1f(uSoft, SOFT)
      const now = performance.now() / 1000
      gl.uniform1f(uTime, now)
      gl.uniform3fv(uThin, thin)
      if (animEnd > now) map.triggerRepaint() // 動いている間だけ描き続ける
      // お店が書いた奥行きと比べるだけで、雲は奥行きを書かない（雲どうしは奥から順に重ねる）
      gl.enable(gl.DEPTH_TEST)
      gl.depthFunc(gl.LEQUAL)
      gl.depthMask(false)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.bindVertexArray(vao)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
      gl.bindVertexArray(null)
    },
  }
}

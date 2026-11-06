// 霧（§12）。MapLibre のカスタムレイヤーに WebGL2 で、絵本風の雲の塊を描く。
// 塊はいつも画面のほうを向き、上が白・下側に水色の影。画面の奥から手前の順に重ねる。
import { MercatorCoordinate } from 'maplibre-gl'
import type { CustomLayerInterface, Map as MapLibreMap } from 'maplibre-gl'
import { FOG_RESORT_DEG } from '../config.ts'
import type { LatLng } from '../../map/domain/geo.ts'
import { drawOrder } from '../domain/clumps.ts'
import type { Clump } from '../domain/clumps.ts'

const LIFT = 0.22 // 影の帯の厚み（塊の半幅に対する割合）
const SOFT = 0.12 // 白と影の境目のぼかし

// 塊1つ = 四角1枚。四角の大きさは塊の形が収まる範囲（単位は半幅）
const VS = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_corner;
layout(location=1) in vec4 a_clump; // x, y（origin からの m）, w（半幅 m）, 種
uniform mat4 u_matrix;
uniform vec2 u_viewport;
out vec2 v_uv;
out float v_seed;
const vec2 LO = vec2(-1.3, -0.75);
const vec2 HI = vec2(1.3, 1.25);
vec2 px(vec4 c) { return c.xy / c.w * u_viewport * 0.5; }
void main() {
  vec4 c = u_matrix * vec4(a_clump.xy, 0.0, 1.0);
  // 半幅が画面で何 px か（東と北のうち長く見える方。傾けても潰れない）
  float wpx = max(
    length(px(u_matrix * vec4(a_clump.xy + vec2(a_clump.z, 0.0), 0.0, 1.0)) - px(c)),
    length(px(u_matrix * vec4(a_clump.xy + vec2(0.0, a_clump.z), 0.0, 1.0)) - px(c)));
  vec2 uv = mix(LO, HI, a_corner * 0.5 + 0.5);
  gl_Position = c + vec4(uv * wpx / (u_viewport * 0.5) * c.w, 0.0, 0.0);
  v_uv = uv;
  v_seed = a_clump.w;
}`

const FS = `#version 300 es
precision highp float;
in vec2 v_uv;
in float v_seed;
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

export type FogLayer = CustomLayerInterface & { setClumps(origin: LatLng, clumps: Clump[]): void }

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
  let origin: LatLng | null = null
  let clumps: Clump[] = []
  let count = 0
  let sortedFor = NaN // 並べたときの地図の向き。NaN は「並べ直しが要る」

  // 重ね順は地図の向きだけで決まるので、向きが変わったときだけ並べ直して送る
  const upload = (bearing: number) => {
    if (!gl || !inst) return
    const sorted = drawOrder(clumps, bearing)
    const data = new Float32Array(sorted.length * 4)
    sorted.forEach((c, n) => data.set([c.x, c.y, c.w, c.seed], n * 4))
    gl.bindBuffer(gl.ARRAY_BUFFER, inst)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
    count = sorted.length
    sortedFor = bearing
  }

  return {
    id: 'fog',
    type: 'custom',
    renderingMode: '2d',
    setClumps(o, cs) {
      origin = o
      clumps = cs
      sortedFor = NaN
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
      gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 16, 0)
      gl.vertexAttribDivisor(1, 1)
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
      gl.disable(gl.DEPTH_TEST)
      gl.disable(gl.CULL_FACE)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
      gl.bindVertexArray(vao)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)
      gl.bindVertexArray(null)
    },
  }
}

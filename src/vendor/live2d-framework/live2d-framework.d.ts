// Live2D Cubism Web Framework（公式 Live2D/CubismWebFramework 5-r.5、コミット d4da0aa）を rolldown で 1 つの JS にしたもの。
// 元は enum・namespace を使う TypeScript で、このアプリの tsconfig（erasableSyntaxOnly）では型チェックできないため、
// ここにはアプリが使う分だけの型を手で書く。ライセンス: LICENSE.md（Live2D Open Software License）。
// 読み込む前に Cubism Core（public/live2d/core/）がグローバルにあること。

export type CubismIdHandle = { getString(): { s: string } | string }

export declare const LogLevel: { LogLevel_Warning: number; LogLevel_Error: number }

export declare class Option {
  logFunction: (message: string) => void
  loggingLevel: number
}

export declare class CubismFramework {
  static startUp(option?: Option): boolean
  static initialize(): void
  static getIdManager(): { getId(id: string): CubismIdHandle }
}

export declare class CubismMatrix44 {
  scale(x: number, y: number): void
  scaleRelative(x: number, y: number): void
  multiplyByMatrix(m: CubismMatrix44): void
  translateX(x: number): void
  translateY(y: number): void
}

export declare class CubismModelSettingJson {
  constructor(buffer: ArrayBuffer, size: number)
  getModelFileName(): string
  getPhysicsFileName(): string
  getTextureCount(): number
  getTextureFileName(index: number): string
  getLayoutMap(out: Map<string, number>): boolean
}

export declare const CubismDefaultParameterId: Record<string, string>

export interface CubismModel {
  setParameterValueById(id: CubismIdHandle, value: number, weight?: number): void
  addParameterValueById(id: CubismIdHandle, value: number, weight?: number): void
  getParameterValueById(id: CubismIdHandle): number
  loadParameters(): void
  saveParameters(): void
  update(): void
  getCanvasWidth(): number
  getCanvasHeight(): number
}

export interface CubismModelMatrix extends CubismMatrix44 {
  setupFromLayout(layout: Map<string, number>): void
  setWidth(w: number): void
  setHeight(h: number): void
}

export interface CubismRenderer {
  bindTexture(index: number, texture: WebGLTexture): void
  setIsPremultipliedAlpha(enable: boolean): void
  startUp(gl: WebGLRenderingContext | WebGL2RenderingContext): void
  loadShaders(path: string): void
  setMvpMatrix(m: CubismMatrix44): void
  setRenderState(fbo: WebGLFramebuffer | null, viewport: number[]): void
  drawModel(): void
}

export declare class CubismUserModel {
  protected _model: CubismModel
  protected _modelMatrix: CubismModelMatrix
  protected _physics: { evaluate(model: CubismModel, dt: number): void } | null
  protected _initialized: boolean
  loadModel(buffer: ArrayBuffer, shouldCheckMocConsistency?: boolean): void
  loadPhysics(buffer: ArrayBuffer, size: number): void
  createRenderer(width: number, height: number, maskBufferCount?: number): void
  getRenderer(): CubismRenderer
  getModel(): CubismModel
  getModelMatrix(): CubismModelMatrix
  release(): void
}

export declare class BreathParameterData {
  constructor(id: CubismIdHandle, offset: number, peak: number, cycle: number, weight: number)
}

export declare class CubismBreath {
  static create(): CubismBreath
  setParameters(list: BreathParameterData[]): void
  updateParameters(model: CubismModel, dt: number): void
}

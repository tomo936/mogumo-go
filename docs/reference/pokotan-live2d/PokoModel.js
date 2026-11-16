import { CubismModelSettingJson } from '../../live2d-framework/cubismmodelsettingjson';
import { CubismDefaultParameterId } from '../../live2d-framework/cubismdefaultparameterid';
import { CubismFramework } from '../../live2d-framework/live2dcubismframework';
import { CubismUserModel } from '../../live2d-framework/model/cubismusermodel';
import { BreathParameterData, CubismBreath } from '../../live2d-framework/effect/cubismbreath';

const BLINK_MIN_INTERVAL_S = 2;
const BLINK_MAX_INTERVAL_S = 5;
const BLINK_DURATION_S = 0.2;

// A trimmed-down version of the official CubismUserModel sample (LAppModel),
// covering only the pieces our model actually has: moc, textures, physics.
// No motions / expressions / pose / user data files exist for this model.
// Note: this model's model3.json declares an "EyeBlink" parameter group but
// leaves its Ids empty, so the framework's built-in CubismEyeBlink effect has
// nothing to drive. We blink ParamEyeLOpen/ParamEyeROpen manually instead.
export class PokoModel extends CubismUserModel {
  constructor({ freezeIdle = false } = {}) {
    super();
    this._freezeIdle = freezeIdle;
    this._modelHomeDir = '';
    this._modelSetting = null;
    this._idParamAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleX,
    );
    this._idParamAngleY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleY,
    );
    this._idParamAngleZ = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamAngleZ,
    );
    this._idParamBodyAngleX = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBodyAngleX,
    );
    this._idParamBodyAngleY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBodyAngleY,
    );
    this._idParamBreath = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamBreath,
    );
    this._idParamMouthOpenY = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamMouthOpenY,
    );
    this._idParamEyeLOpen = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamEyeLOpen,
    );
    this._idParamEyeROpen = CubismFramework.getIdManager().getId(
      CubismDefaultParameterId.ParamEyeROpen,
    );
    this._chompElapsedMs = null;
    this._chompDurationMs = 0;
    this._talkElapsedMs = null;
    this._talkDurationMs = 0;
    this._blinking = false;
    this._blinkElapsedS = 0;
    this._blinkTimerS = BLINK_MIN_INTERVAL_S + Math.random() * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S);
  }

  // Plays a mouth open/close "chomp" animation for the given duration.
  chomp(durationMs = 1400) {
    this._chompElapsedMs = 0;
    this._chompDurationMs = durationMs;
  }

  // Plays a mouth-flap "talking" animation for the given duration, holding
  // the head/body still (no idle sway) so the flapping mouth alone reads as
  // the character actually saying its reaction line, instead of just
  // standing there swaying while a speech bubble happens to appear next to it.
  talk(durationMs = 1400) {
    this._talkElapsedMs = 0;
    this._talkDurationMs = durationMs;
  }

  async loadAssets(dir, fileName) {
    this._modelHomeDir = dir;

    const settingBuffer = await (await fetch(`${dir}${fileName}`)).arrayBuffer();
    const setting = new CubismModelSettingJson(settingBuffer, settingBuffer.byteLength);
    this._modelSetting = setting;

    const modelFileName = setting.getModelFileName();
    const modelBuffer = await (await fetch(`${dir}${modelFileName}`)).arrayBuffer();
    this.loadModel(modelBuffer, false);
    this._captureRestPose();

    const physicsFileName = setting.getPhysicsFileName();
    if (physicsFileName !== '') {
      const physicsBuffer = await (await fetch(`${dir}${physicsFileName}`)).arrayBuffer();
      this.loadPhysics(physicsBuffer, physicsBuffer.byteLength);
    }

    this._breath = CubismBreath.create();
    this._breath.setParameters([
      new BreathParameterData(this._idParamAngleX, 0.0, 15.0, 6.5345, 0.5),
      new BreathParameterData(this._idParamAngleY, 0.0, 8.0, 3.5345, 0.5),
      new BreathParameterData(this._idParamAngleZ, 0.0, 10.0, 5.5345, 0.5),
      new BreathParameterData(this._idParamBodyAngleX, 0.0, 4.0, 15.5345, 0.5),
      new BreathParameterData(this._idParamBreath, 0.5, 0.5, 3.2345, 1),
    ]);

    const layout = new Map();
    setting.getLayoutMap(layout);
    this._modelMatrix.setupFromLayout(layout);

    await this._setupTextures(setting, dir);

    this._initialized = true;
  }

  _setupTextures(setting, dir) {
    const textureCount = setting.getTextureCount();
    const gl = this._gl;

    const loadOne = (index) =>
      new Promise((resolve) => {
        const fileName = setting.getTextureFileName(index);
        if (!fileName) {
          resolve();
          return;
        }
        const img = new Image();
        img.addEventListener(
          'load',
          () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.bindTexture(gl.TEXTURE_2D, null);

            this.getRenderer().bindTexture(index, tex);
            resolve();
          },
          { passive: true },
        );
        img.src = `${dir}${fileName}`;
      });

    const canvas = { width: this._canvasWidth, height: this._canvasHeight };
    this.createRenderer(canvas.width, canvas.height);
    this.getRenderer().setIsPremultipliedAlpha(true);
    this.getRenderer().startUp(gl);
    this.getRenderer().loadShaders('/live2d/shaders/');

    const jobs = [];
    for (let i = 0; i < textureCount; i++) jobs.push(loadOne(i));
    return Promise.all(jobs);
  }

  setGl(gl, width, height) {
    this._gl = gl;
    this._canvasWidth = width;
    this._canvasHeight = height;
  }

  _updateBlink(deltaTimeSeconds) {
    let eyeOpen = 1;
    if (this._blinking) {
      this._blinkElapsedS += deltaTimeSeconds;
      const t = this._blinkElapsedS / BLINK_DURATION_S;
      eyeOpen = t < 0.5 ? 1 - t * 2 : (t - 0.5) * 2;
      if (t >= 1) {
        this._blinking = false;
        this._blinkTimerS =
          BLINK_MIN_INTERVAL_S + Math.random() * (BLINK_MAX_INTERVAL_S - BLINK_MIN_INTERVAL_S);
      }
    } else {
      this._blinkTimerS -= deltaTimeSeconds;
      if (this._blinkTimerS <= 0) {
        this._blinking = true;
        this._blinkElapsedS = 0;
      }
    }
    this._model.setParameterValueById(this._idParamEyeLOpen, Math.max(0, eyeOpen));
    this._model.setParameterValueById(this._idParamEyeROpen, Math.max(0, eyeOpen));
  }

  update(deltaTimeSeconds) {
    if (!this._initialized) return;

    this._model.loadParameters();

    if (this._breath && !this._freezeIdle) {
      this._breath.updateParameters(this._model, deltaTimeSeconds);
    }

    this._model.saveParameters();

    if (this._physics) {
      this._physics.evaluate(this._model, deltaTimeSeconds);
    }

    this._updateBlink(deltaTimeSeconds);

    if (this._chompElapsedMs !== null) {
      this._chompElapsedMs += deltaTimeSeconds * 1000;
      const t = this._chompElapsedMs / this._chompDurationMs;
      if (t >= 1) {
        this._model.setParameterValueById(this._idParamMouthOpenY, 0);
        this._chompElapsedMs = null;
      } else {
        const cycles = 4;
        const mouthOpen = Math.max(0, Math.sin(t * Math.PI * cycles));
        this._model.setParameterValueById(this._idParamMouthOpenY, mouthOpen);

        // Quickly look up, hold it for most of the chomp, then ease back down.
        const rampIn = 0.15;
        const rampOut = 0.8;
        let lookUpStrength;
        if (t < rampIn) {
          lookUpStrength = t / rampIn;
        } else if (t > rampOut) {
          lookUpStrength = (1 - t) / (1 - rampOut);
        } else {
          lookUpStrength = 1;
        }

        // Freeze every idle-sway parameter breath drives, so the only
        // motion visible during the chomp is the intentional look-up +
        // tilt (to line the mouth up with where the food drops).
        this._model.setParameterValueById(this._idParamAngleX, 0);
        this._model.setParameterValueById(this._idParamAngleY, 30 * lookUpStrength);
        this._model.setParameterValueById(this._idParamAngleZ, 20 * lookUpStrength);
        this._model.setParameterValueById(this._idParamBodyAngleX, 0);
        this._model.setParameterValueById(this._idParamBodyAngleY, 10 * lookUpStrength);
        this._model.setParameterValueById(this._idParamBreath, 0.5);
      }
    }

    if (this._talkElapsedMs !== null) {
      this._talkElapsedMs += deltaTimeSeconds * 1000;
      const t = this._talkElapsedMs / this._talkDurationMs;
      if (t >= 1) {
        this._model.setParameterValueById(this._idParamMouthOpenY, 0);
        this._talkElapsedMs = null;
      } else {
        const cycles = 5;
        const mouthOpen = Math.max(0, Math.sin(t * Math.PI * cycles));
        this._model.setParameterValueById(this._idParamMouthOpenY, mouthOpen);

        // Freeze every idle-sway parameter breath drives (same as chomp),
        // but with no look-up/tilt of its own - just still, so the mouth
        // flap is the only motion, like the character is looking at you
        // and talking rather than performing an action.
        this._model.setParameterValueById(this._idParamAngleX, 0);
        this._model.setParameterValueById(this._idParamAngleY, 0);
        this._model.setParameterValueById(this._idParamAngleZ, 0);
        this._model.setParameterValueById(this._idParamBodyAngleX, 0);
        this._model.setParameterValueById(this._idParamBodyAngleY, 0);
        this._model.setParameterValueById(this._idParamBreath, 0.5);
      }
    }

    this._model.update();
  }

  // Current head/body sway, so a plain HTML overlay (e.g. a costume sticker)
  // can be nudged along with the model each frame. This is an approximation,
  // not a true attached part, since we can't edit the compiled .moc3 model.
  getHeadTransform() {
    if (!this._model) return { angleX: 0, angleY: 0, angleZ: 0, breath: 0 };
    return {
      angleX: this._model.getParameterValueById(this._idParamAngleX),
      angleY: this._model.getParameterValueById(this._idParamAngleY),
      angleZ: this._model.getParameterValueById(this._idParamAngleZ),
      breath: this._model.getParameterValueById(this._idParamBreath),
    };
  }

  // Live model-space bounding box of one drawable, recomputed from its
  // CURRENT (deformed) vertex positions - unlike a fixed anchor constant,
  // this stays correct through any pose (idle sway, chomp tilt, etc.)
  // because it re-reads the actual vertices every time it's called instead
  // of assuming the bind-pose position still applies.
  getDrawableBBox(index) {
    if (!this._model) return null;
    const positions = this._model.getDrawableVertexPositions(index);
    if (!positions || positions.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let v = 0; v < positions.length; v += 2) {
      const x = positions[v];
      const y = positions[v + 1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  // Snapshot of every drawable's vertices with all parameters at their
  // defaults (no sway, mouth closed) - the pose costumes are designed on.
  _captureRestPose() {
    this._model.update();
    this._restVertices = [];
    for (let i = 0; i < this._model.getDrawableCount(); i++) {
      this._restVertices.push(Float32Array.from(this._model.getDrawableVertexPositions(i)));
    }
  }

  // Bounding box of a drawable in the rest pose (same shape as
  // getDrawableBBox).
  getRestBBox(index) {
    const positions = this._restVertices?.[index];
    if (!positions || positions.length === 0) return null;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let v = 0; v < positions.length; v += 2) {
      minX = Math.min(minX, positions[v]);
      maxX = Math.max(maxX, positions[v]);
      minY = Math.min(minY, positions[v + 1]);
      maxY = Math.max(maxY, positions[v + 1]);
    }
    return { minX, maxX, minY, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  // How a drawable has moved since the rest pose, as the best-fit rotation +
  // uniform scale + translation (least squares over its vertices, optionally
  // only those whose rest y is at least `minRestY` - e.g. just the head part
  // of the head+neck mesh). The mesh bends rather than moving rigidly, so
  // this is what a sticker glued to it would do. Returns { angle (radians,
  // counter-clockwise in model space), scale, map(x, y) } where map takes a
  // rest-pose point to where it is now.
  getDrawablePose(index, minRestY = -Infinity) {
    const rest = this._restVertices?.[index];
    if (!this._model || !rest) return null;
    const now = this._model.getDrawableVertexPositions(index);
    if (!now || now.length !== rest.length) return null;

    let n = 0, rx = 0, ry = 0, nx = 0, ny = 0;
    for (let v = 0; v < rest.length; v += 2) {
      if (rest[v + 1] < minRestY) continue;
      n += 1;
      rx += rest[v];
      ry += rest[v + 1];
      nx += now[v];
      ny += now[v + 1];
    }
    if (n < 2) return null;
    rx /= n; ry /= n; nx /= n; ny /= n;

    let dot = 0, cross = 0, norm = 0;
    for (let v = 0; v < rest.length; v += 2) {
      if (rest[v + 1] < minRestY) continue;
      const px = rest[v] - rx, py = rest[v + 1] - ry;
      const qx = now[v] - nx, qy = now[v + 1] - ny;
      dot += px * qx + py * qy;
      cross += px * qy - py * qx;
      norm += px * px + py * py;
    }
    const angle = Math.atan2(cross, dot);
    const scale = norm > 0 ? Math.hypot(dot, cross) / norm : 1;
    const cos = Math.cos(angle) * scale;
    const sin = Math.sin(angle) * scale;
    return {
      angle,
      scale,
      map: (x, y) => ({
        x: nx + cos * (x - rx) - sin * (y - ry),
        y: ny + sin * (x - rx) + cos * (y - ry),
      }),
    };
  }

  // Live model-space bounding box across every currently-visible drawable -
  // an approximation of "where the character actually is" (used to shrink
  // the home-screen tap target down from the whole canvas box to roughly
  // the model's real silhouette). Hidden drawables (unworn costume slots
  // etc.) are skipped so they can't inflate the box past what's on screen.
  getOverallBBox() {
    if (!this._model) return null;
    const model = this._model;
    const count = model.getDrawableCount();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < count; i++) {
      if (!model.getDrawableDynamicFlagIsVisible(i)) continue;
      const positions = model.getDrawableVertexPositions(i);
      if (!positions || positions.length === 0) continue;
      for (let v = 0; v < positions.length; v += 2) {
        const x = positions[v];
        const y = positions[v + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    if (minX === Infinity) return null;
    return { minX, maxX, minY, maxY };
  }

  // focusOffsetY shifts the crop window in real, final screen-space clip
  // units (-1..1), so it must be applied AFTER the model matrix is folded
  // in, not before. Applying it earlier (as this used to) means it gets
  // scaled down by the model matrix's own (canvas-size-dependent) scale
  // factor, shrinking it to a practically invisible amount.
  draw(matrix, focusOffsetX = 0, focusOffsetY = 0) {
    if (!this._model || !this._initialized) return;
    matrix.multiplyByMatrix(this._modelMatrix);
    if (focusOffsetX !== 0) {
      matrix.translateX(focusOffsetX);
    }
    if (focusOffsetY !== 0) {
      matrix.translateY(focusOffsetY);
    }
    this.getRenderer().setMvpMatrix(matrix);
    this.getRenderer().setRenderState(null, [0, 0, this._canvasWidth, this._canvasHeight]);
    this.getRenderer().drawModel();
  }

  // Logs canvas size plus each drawable's model-space bounding box, so we
  // can figure out exactly where the head/body/feet sit without guessing.
  // Call once from the browser console or temporarily on load. Dumps a
  // single JSON blob (not console.table) so copy/paste doesn't lose
  // precision to table-rounding.
  debugLogDrawableBounds() {
    if (!this._model) return;
    const model = this._model;
    const count = model.getDrawableCount();
    const rows = [];
    let overallMinX = Infinity, overallMaxX = -Infinity, overallMinY = Infinity, overallMaxY = -Infinity;

    const r = (n) => Math.round(n * 10000) / 10000;

    const TEXTURE_PX = 1024;

    for (let i = 0; i < count; i++) {
      const id = model.getDrawableId(i);
      const positions = model.getDrawableVertexPositions(i);
      if (!positions || positions.length === 0) continue;
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let v = 0; v < positions.length; v += 2) {
        const x = positions[v];
        const y = positions[v + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      overallMinX = Math.min(overallMinX, minX);
      overallMaxX = Math.max(overallMaxX, maxX);
      overallMinY = Math.min(overallMinY, minY);
      overallMaxY = Math.max(overallMaxY, maxY);

      // UV bounding box, converted to texture pixel coordinates, so we can
      // look up exactly what this drawable's art shows in texture_00.png
      // (V=0 is the BOTTOM of the texture in Cubism/GL convention, so pixel
      // row = (1 - v) * textureSize).
      const uvs = model.getDrawableVertexUvs(i);
      let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
      if (uvs && uvs.length > 0) {
        for (let v = 0; v < uvs.length; v += 2) {
          const u = uvs[v];
          const vv = uvs[v + 1];
          if (u < minU) minU = u;
          if (u > maxU) maxU = u;
          if (vv < minV) minV = vv;
          if (vv > maxV) maxV = vv;
        }
      }

      rows.push({
        index: i,
        id: id.getString ? id.getString() : String(id),
        minX: r(minX),
        maxX: r(maxX),
        minY: r(minY),
        maxY: r(maxY),
        texturePx: {
          left: Math.round(minU * TEXTURE_PX),
          right: Math.round(maxU * TEXTURE_PX),
          top: Math.round((1 - maxV) * TEXTURE_PX),
          bottom: Math.round((1 - minV) * TEXTURE_PX),
        },
      });
    }

    rows.sort((a, b) => b.maxY - a.maxY);

    const dump = {
      canvasWidth: this._model.getCanvasWidth(),
      canvasHeight: this._model.getCanvasHeight(),
      overallBBox: { minX: r(overallMinX), maxX: r(overallMaxX), minY: r(overallMinY), maxY: r(overallMaxY) },
      drawables: rows,
    };

    console.log('POKO_MODEL_DEBUG_JSON_START');
    console.log(JSON.stringify(dump, null, 2));
    console.log('POKO_MODEL_DEBUG_JSON_END');
  }
}

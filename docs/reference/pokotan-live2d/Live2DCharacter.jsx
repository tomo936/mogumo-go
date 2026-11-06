import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import './Live2DCharacter.css';

// The Cubism Core runtime (~230KB) is only needed on screens that show
// Pokotan, so it's fetched on first use instead of blocking every page load.
let corePromise = null;
function loadCubismCore() {
  if (window.Live2DCubismCore) return Promise.resolve();
  if (!corePromise) {
    corePromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/live2d/core/live2dcubismcore.min.js';
      script.onload = resolve;
      script.onerror = () => {
        corePromise = null;
        reject(new Error('failed to load Live2D core'));
      };
      document.head.appendChild(script);
    });
  }
  return corePromise;
}

// Loads the core script, then the framework modules that depend on it.
function loadRuntime() {
  return loadCubismCore().then(() => import('./live2d/runtime'));
}

let frameworkStarted = false;
function ensureFrameworkStarted({ CubismFramework, LogLevel, Option }) {
  if (frameworkStarted) return;
  const option = new Option();
  option.logFunction = (message) => console.log(message);
  option.loggingLevel = LogLevel.LogLevel_Warning;
  CubismFramework.startUp(option);
  CubismFramework.initialize();
  frameworkStarted = true;
}

// Baby (0.6) was tuned to sit comfortably inside the home-room canvas;
// child/adult previously scaled up to 0.85/1.15, which pushed the character
// past the top and bottom edges of the room at larger sizes instead of
// just reading as "bigger". Growth should still feel noticeable, so these
// keep a real step up, but capped well short of overflowing the frame.
const STAGE_SCALE = {
  baby: 0.6,
  child: 0.72,
  adult: 0.82,
};

// Bottom of the body mesh in model units (feet). With anchorFeet, bigger
// stages are shifted up so the feet stay where the baby's are instead of
// growing past the bottom of the frame (scaling happens around the center).
const FEET_MODEL_Y = -1.01;

const STATUS_EFFECT_ICON = {
  hungry: '/icons-generated/status-hungry.png',
  happy: '/icons-generated/status-happy.png',
  tired: '/icons-generated/status-tired.png',
  sick: '/icons-generated/status-sick.png',
};

// Drawable index 5 ("ArtMesh9") is the head/face mesh - confirmed via
// PokoModel#debugLogDrawableBounds (its bounding box matches the head
// silhouette in the texture atlas exactly). Used to derive a live,
// self-updating anchor instead of a fixed bind-pose constant.
const HEAD_DRAWABLE_INDEX = 5;

// Fallback anchor for the floating status bubble if the model isn't ready
// yet (just above and to the right of the head).
const STATUS_EFFECT_ANCHOR = { x: 0.09, y: 0.16 };

// Extra forgiveness margin (as a fraction of the live silhouette box's own
// size) added around the model's live bounding box for click/tap hit
// testing - an exact per-pixel hit test isn't worth the complexity for a
// small, constantly-swaying character, but the box should still track
// roughly where the character actually is instead of the whole canvas.
const HIT_BOX_PADDING_FRACTION = 0.12;

const Live2DCharacter = forwardRef(function Live2DCharacter(
  {
    stage = 'baby',
    status = 'normal',
    freezeIdle = false,
    zoom = 1,
    focusOffsetX = 0,
    focusOffsetY = 0,
    anchorFeet = false,
    onFrameTransform,
    onClick,
  },
  ref,
) {
  const canvasRef = useRef(null);
  const scaleRef = useRef(STAGE_SCALE[stage] ?? STAGE_SCALE.baby);
  const modelRef = useRef(null);
  const statusEffectRef = useRef(null);
  const hitBoxRef = useRef(null);

  useImperativeHandle(ref, () => ({
    captureSnapshot: () =>
      new Promise((resolve) => {
        canvasRef.current.toBlob((blob) => resolve(blob), 'image/png');
      }),
    chomp: (durationMs) => modelRef.current?.chomp(durationMs),
    talk: (durationMs) => modelRef.current?.talk(durationMs),
  }));

  useEffect(() => {
    scaleRef.current = STAGE_SCALE[stage] ?? STAGE_SCALE.baby;
  }, [stage]);

  useEffect(() => {
    let destroyed = false;
    let rafId;
    let model;
    let resizeHandler;
    let resizeObserver;
    let lastTime = performance.now();

    async function setup() {
      let runtime;
      try {
        runtime = await loadRuntime();
      } catch (err) {
        console.error(err);
        return;
      }
      if (destroyed) return;
      ensureFrameworkStarted(runtime);
      const { CubismMatrix44, PokoModel } = runtime;

      const canvas = canvasRef.current;
      const parent = canvas.parentElement;
      // The canvas's CSS size (set to 100% of its container by
      // Live2DCharacter.css) is in CSS pixels, but its drawing-buffer
      // resolution needs to be in DEVICE pixels, or high-DPI screens (every
      // iPhone) stretch the lower-res bitmap to fill the same on-screen box
      // and the model looks blurry. Desktop at devicePixelRatio 1 hid this.
      const dpr = window.devicePixelRatio || 1;
      const width = Math.round(parent.clientWidth * dpr);
      const height = Math.round(parent.clientHeight * dpr);
      canvas.width = width;
      canvas.height = height;

      // preserveDrawingBuffer lets debug tooling read back the rendered
      // pixels (e.g. via drawImage into a 2D canvas) after the frame has
      // already been presented; without it the buffer may already be
      // cleared by the time anything outside the render loop reads it.
      const contextOptions = { preserveDrawingBuffer: true };
      const gl = canvas.getContext('webgl2', contextOptions) || canvas.getContext('webgl', contextOptions);
      if (!gl) {
        console.error('WebGL is not supported in this browser.');
        return;
      }

      model = new PokoModel({ freezeIdle });
      model.setGl(gl, width, height);
      await model.loadAssets('/live2d/poko/', 'poko.model3.json');
      if (destroyed) return;
      modelRef.current = model;

      if (typeof window !== 'undefined' && window.location.search.includes('l2ddebug')) {
        model.debugLogDrawableBounds();
        // Lets automated tooling drive parameters directly (e.g. force
        // ParamMouthOpenY open) to find which drawable actually moves,
        // instead of guessing from the static bind pose.
        window.__pokoModel = model;
      }

      const render = () => {
        const now = performance.now();
        const dt = (now - lastTime) / 1000;
        lastTime = now;

        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

        model.update(dt);

        // Use the canvas's live pixel size (kept in sync by resizeHandler),
        // not the width/height captured once at setup, so the aspect
        // correction below stays correct after the window/container resizes.
        const liveWidth = canvas.width;
        const liveHeight = canvas.height;

        const projection = new CubismMatrix44();
        const canvasWidth = model.getModel().getCanvasWidth();
        let aspectX;
        if (canvasWidth > 1.0 && liveWidth < liveHeight) {
          model.getModelMatrix().setWidth(2.0);
          projection.scale(1.0, liveWidth / liveHeight);
          aspectX = 1.0;
        } else {
          aspectX = liveHeight / liveWidth;
          projection.scale(aspectX, 1.0);
        }
        projection.scaleRelative(scaleRef.current, scaleRef.current);
        if (zoom !== 1) {
          projection.scaleRelative(zoom, zoom);
        }

        const zoomFactor = zoom !== 1 ? zoom : 1;
        const feetOffsetY = anchorFeet
          ? (2 / model.getModel().getCanvasHeight()) * zoomFactor * FEET_MODEL_Y * (STAGE_SCALE.baby - scaleRef.current)
          : 0;
        const offsetY = focusOffsetY + feetOffsetY;

        model.draw(projection, focusOffsetX, offsetY);

        // Converts a point in the model's own local coordinates (the same
        // space PokoModel#debugLogDrawableBounds reports) into a fraction of
        // this component's box (0,0 = top-left, 1,1 = bottom-right), matching
        // exactly what draw() just did. Lets callers (e.g. a costume overlay
        // <img>) anchor themselves to a real spot on the character instead
        // of a guessed CSS percentage.
        const combinedScale = (2 / model.getModel().getCanvasHeight()) * scaleRef.current * zoomFactor;
        const toFraction = (xRaw, yRaw) => {
          const xNdc = aspectX * combinedScale * xRaw + focusOffsetX;
          const yNdc = combinedScale * yRaw + offsetY;
          return { xFraction: (xNdc + 1) / 2, yFraction: (1 - yNdc) / 2 };
        };

        // Live bounding box of a drawable, in the same model-local space as
        // toFraction's input - re-read from the CURRENT (deformed) vertex
        // buffer every frame, so a caller tracking "drawable 9's top edge"
        // stays correct through idle sway, the chomp tilt, etc. instead of
        // drifting away from a fixed bind-pose constant.
        const getDrawableBBox = (index) => model.getDrawableBBox(index);

        const overallBox = model.getOverallBBox();
        if (overallBox) {
          const corner1 = toFraction(overallBox.minX, overallBox.maxY);
          const corner2 = toFraction(overallBox.maxX, overallBox.minY);
          const minXFraction = Math.min(corner1.xFraction, corner2.xFraction);
          const maxXFraction = Math.max(corner1.xFraction, corner2.xFraction);
          const minYFraction = Math.min(corner1.yFraction, corner2.yFraction);
          const maxYFraction = Math.max(corner1.yFraction, corner2.yFraction);
          const padX = (maxXFraction - minXFraction) * HIT_BOX_PADDING_FRACTION;
          const padY = (maxYFraction - minYFraction) * HIT_BOX_PADDING_FRACTION;
          hitBoxRef.current = {
            minXFraction: Math.max(0, minXFraction - padX),
            maxXFraction: Math.min(1, maxXFraction + padX),
            minYFraction: Math.max(0, minYFraction - padY),
            maxYFraction: Math.min(1, maxYFraction + padY),
          };
        }

        if (statusEffectRef.current) {
          const headBox = getDrawableBBox(HEAD_DRAWABLE_INDEX);
          const anchor = headBox
            ? { x: headBox.cx + 0.2, y: headBox.maxY - 0.03 }
            : STATUS_EFFECT_ANCHOR;
          const { xFraction, yFraction } = toFraction(anchor.x, anchor.y);
          statusEffectRef.current.style.left = `${xFraction * 100}%`;
          statusEffectRef.current.style.top = `${yFraction * 100}%`;
        }

        if (onFrameTransform) {
          onFrameTransform({
            ...model.getHeadTransform(),
            toFraction,
            getDrawableBBox,
            getRestBBox: (index) => model.getRestBBox(index),
            getDrawablePose: (index, minRestY) => model.getDrawablePose(index, minRestY),
          });
        }

        rafId = requestAnimationFrame(render);
      };

      rafId = requestAnimationFrame(render);

      resizeHandler = () => {
        const resizeDpr = window.devicePixelRatio || 1;
        const w = Math.round(parent.clientWidth * resizeDpr);
        const h = Math.round(parent.clientHeight * resizeDpr);
        if (w === canvas.width && h === canvas.height) return;
        canvas.width = w;
        canvas.height = h;
        model.setGl(gl, w, h);
        gl.viewport(0, 0, w, h);
      };
      window.addEventListener('resize', resizeHandler);

      // The window 'resize' event alone misses plenty of ways this
      // container's actual box size can change without the browser window
      // itself resizing: mobile Safari's address bar collapsing/expanding
      // changes 100dvh (and doesn't reliably fire 'resize' for it on every
      // iOS version), and any sibling element's height changing (a stat bar
      // row, a costume overlay, a font swap reflow) can shift this flex
      // child's box too. Any of those left the canvas's drawing-buffer
      // aspect ratio stale relative to its new CSS box - same pixel content
      // stretched into a differently-shaped box reads as the character
      // going oddly thin/wide - and only got corrected by a full remount
      // (navigating away and back). Observing the actual container
      // directly catches every case in one place instead of hunting down
      // and manually re-dispatching 'resize' after each specific cause.
      if (typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(() => resizeHandler());
        resizeObserver.observe(parent);
      }
    }

    setup();

    return () => {
      destroyed = true;
      modelRef.current = null;
      if (rafId) cancelAnimationFrame(rafId);
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      resizeObserver?.disconnect();
      model?.release();
    };
  }, []);

  const statusIconSrc = STATUS_EFFECT_ICON[status];

  function handleStageClick(e) {
    if (!onClick) return;
    const box = hitBoxRef.current;
    if (box) {
      const rect = e.currentTarget.getBoundingClientRect();
      const xFraction = (e.clientX - rect.left) / rect.width;
      const yFraction = (e.clientY - rect.top) / rect.height;
      const outside =
        xFraction < box.minXFraction ||
        xFraction > box.maxXFraction ||
        yFraction < box.minYFraction ||
        yFraction > box.maxYFraction;
      if (outside) return;
    }
    onClick(e);
  }

  return (
    <div className={`live2d-stage${onClick ? ' live2d-stage--clickable' : ''}`} onClick={handleStageClick}>
      <canvas ref={canvasRef} className="live2d-canvas" />
      {statusIconSrc && (
        <div ref={statusEffectRef} className={`status-effect status-effect--${status}`}>
          <img src={statusIconSrc} alt="" />
        </div>
      )}
    </div>
  );
});

export default Live2DCharacter;

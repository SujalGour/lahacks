import { FilesetResolver, FaceLandmarker } from '@mediapipe/tasks-vision';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { GazeSource, GazeCallback } from '@catalyst/gaze-engine';

// ── Face mesh landmark indices (478-point model) ──────────────────────────────
const L_OUTER = 33;   // left eye temporal corner
const L_INNER = 133;  // left eye nasal corner
const L_TOP   = 159;  // left eye upper-lid midpoint
const L_BOT   = 145;  // left eye lower-lid midpoint
const R_INNER = 362;  // right eye nasal corner
const R_OUTER = 263;  // right eye temporal corner
const R_TOP   = 386;  // right eye upper-lid midpoint
const R_BOT   = 374;  // right eye lower-lid midpoint
const L_IRIS  = 468;  // left iris center
const R_IRIS  = 473;  // right iris center

// Left iris contour (center + cardinal points) for a better-averaged center
const L_IRIS_RING = [468, 469, 470, 471, 472];
const R_IRIS_RING = [473, 474, 475, 476, 477];

const MIN_EYE_W = 0.01;

const WASM_URL  = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class MediaPipeGazeSource implements GazeSource {
  private landmarker: FaceLandmarker | null = null;
  private video: HTMLVideoElement | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private container: HTMLDivElement | null = null;
  private stream: MediaStream | null = null;
  private rafId: number | null = null;
  private cb: GazeCallback | null = null;

  /**
   * Last computed raw gaze vector (iris offset / eye width).
   * Read by the calibration UI on each dot click.
   */
  lastRaw: { x: number; y: number } | null = null;

  async init(statusEl?: HTMLElement | null): Promise<void> {
    const status = (msg: string) => { if (statusEl) statusEl.textContent = msg; };

    status('Loading MediaPipe WASM…');
    const vision = await FilesetResolver.forVisionTasks(WASM_URL);

    status('Downloading face-landmark model (~5 MB, once)…');
    this.landmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      numFaces: 1,
    });

    status('Opening camera…');
    this.stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' },
    });

    // Container holds the video + canvas overlay together
    this.container = document.createElement('div');
    this.container.id = 'gazeContainer';

    this.video = document.createElement('video');
    this.video.id = 'webgazerVideoFeed';
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    // Mirror so the PiP looks like a selfie view
    this.video.style.transform = 'scaleX(-1)';

    // Canvas drawn at 2× CSS size for crisp retina rendering
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'gazeOverlay';
    this.canvas.width  = 320;
    this.canvas.height = 240;

    this.container.appendChild(this.video);
    this.container.appendChild(this.canvas);
    document.body.appendChild(this.container);

    await this.video.play();
    status('');
    this.loop();
  }

  async start(cb: GazeCallback): Promise<void> { this.cb = cb; }
  stop(): void { this.cb = null; }

  shutdown(): void {
    if (this.rafId !== null) { cancelAnimationFrame(this.rafId); this.rafId = null; }
    this.cb = null;
    this.stream?.getTracks().forEach(t => t.stop());
    this.container?.remove();
    this.container = null;
    this.video = null;
    this.canvas = null;
    this.landmarker?.close();
    this.landmarker = null;
  }

  private loop(): void {
    if (!this.landmarker || !this.video) return;

    try {
      const result = this.landmarker.detectForVideo(this.video, performance.now());
      const lm = result.faceLandmarks?.[0];

      if (lm && lm.length > R_IRIS) {
        // ── Eye geometry ──────────────────────────────────────────────────
        const lCX = (lm[L_OUTER].x + lm[L_INNER].x) / 2;
        const lCY = (lm[L_TOP].y   + lm[L_BOT].y)   / 2;
        const rCX = (lm[R_OUTER].x + lm[R_INNER].x) / 2;
        const rCY = (lm[R_TOP].y   + lm[R_BOT].y)   / 2;
        const lW  = Math.abs(lm[L_OUTER].x - lm[L_INNER].x);
        const rW  = Math.abs(lm[R_OUTER].x - lm[R_INNER].x);
        const lH  = Math.abs(lm[L_TOP].y   - lm[L_BOT].y);
        const rH  = Math.abs(lm[R_TOP].y   - lm[R_BOT].y);

        if (lW < MIN_EYE_W || rW < MIN_EYE_W) {
          this.drawOverlay(null);
          this.rafId = requestAnimationFrame(() => this.loop());
          return;
        }

        // ── Eye openness → confidence (blink filtering) ───────────────────
        const aspect = ((lH / lW) + (rH / rW)) / 2;
        const confidence = Math.min(aspect / 0.25, 1.0) * 0.9;

        // ── Iris center — average contour ring for robustness ─────────────
        const avgRing = (indices: number[], axis: 'x' | 'y') =>
          indices.reduce((s, i) => s + lm[i][axis], 0) / indices.length;

        const lIrisX = avgRing(L_IRIS_RING, 'x');
        const lIrisY = avgRing(L_IRIS_RING, 'y');
        const rIrisX = avgRing(R_IRIS_RING, 'x');
        const rIrisY = avgRing(R_IRIS_RING, 'y');

        // ── Normalised iris offset ─────────────────────────────────────────
        const rawX = ((lIrisX - lCX) / lW + (rIrisX - rCX) / rW) / 2;
        const rawY = ((lIrisY - lCY) / lW + (rIrisY - rCY) / rW) / 2;

        this.lastRaw = { x: rawX, y: rawY };
        if (this.cb) this.cb({ x: rawX, y: rawY, confidence, timestamp: Date.now() });

        this.drawOverlay(lm);
      } else {
        this.drawOverlay(null);
      }
    } catch {
      // skip frame silently
    }

    this.rafId = requestAnimationFrame(() => this.loop());
  }

  // ── Overlay drawing ────────────────────────────────────────────────────────

  private drawOverlay(lm: NormalizedLandmark[] | null): void {
    if (!this.canvas) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (!lm) return;

    // Video is mirrored (scaleX(-1)), so flip x when mapping to canvas.
    const px = (x: number) => (1 - x) * W;
    const py = (y: number) => y * H;

    // ── Eye outlines ───────────────────────────────────────────────────────
    const drawEye = (outer: number, top: number, inner: number, bot: number) => {
      ctx.beginPath();
      ctx.moveTo(px(lm[outer].x), py(lm[outer].y));
      ctx.lineTo(px(lm[top].x),   py(lm[top].y));
      ctx.lineTo(px(lm[inner].x), py(lm[inner].y));
      ctx.lineTo(px(lm[bot].x),   py(lm[bot].y));
      ctx.closePath();
      ctx.strokeStyle = 'rgba(124, 111, 255, 0.75)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };
    drawEye(L_OUTER, L_TOP, L_INNER, L_BOT);
    drawEye(R_OUTER, R_TOP, R_INNER, R_BOT);

    // ── Iris rings ─────────────────────────────────────────────────────────
    const drawIris = (indices: number[]) => {
      const cx = indices.reduce((s, i) => s + px(lm[i].x), 0) / indices.length;
      const cy = indices.reduce((s, i) => s + py(lm[i].y), 0) / indices.length;

      // Estimate iris radius from contour spread
      const rx = Math.abs(px(lm[indices[1]].x) - px(lm[indices[3]].x)) / 2;
      const radius = Math.max(rx, 4);

      // Outer glow ring
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.4)';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Iris circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Pupil dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = '#4ade80';
      ctx.fill();
    };
    drawIris(L_IRIS_RING);
    drawIris(R_IRIS_RING);
  }
}

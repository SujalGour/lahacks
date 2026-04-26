import type { GazeSource, GazeCallback } from '@catalyst/gaze-engine';

// ── Minimal type declaration (no @types/webgazer available) ───────────────────

interface WebGazerAPI {
  setGazeListener(
    fn: ((data: { x: number; y: number } | null, elapsed: number) => void) | null,
  ): this;
  begin(): Promise<this>;
  end(): this;
  pause(): this;
  resume(): this;
  setRegression(type: 'ridge' | 'weightedRidge' | 'threadedRidge'): this;
  setTracker(type: 'TFFacemesh' | 'clmtrackr'): this;
  showVideo(show: boolean): this;
  showVideoPreview(show: boolean): this;
  showPredictionPoints(show: boolean): this;
  applyKalmanFilter(val: boolean): this;
  saveDataAcrossSessions(val: boolean): this;
  clearData(): this;
  params: Record<string, unknown>;
}

declare global {
  interface Window {
    webgazer: WebGazerAPI;
    saveDataAcrossSessions: boolean;
  }
}

// Safe call for optional methods that differ across WebGazer versions
function wgOpt(method: string, ...args: unknown[]): void {
  const fn = (window.webgazer as unknown as Record<string, unknown>)[method];
  if (typeof fn === 'function') {
    try { (fn as (...a: unknown[]) => void).call(window.webgazer, ...args); } catch { /* ignore */ }
  }
}

export class WebGazerGazeSource implements GazeSource {
  private cb: GazeCallback | null = null;

  async init(statusEl?: HTMLElement | null): Promise<void> {
    const status = (msg: string) => { if (statusEl) statusEl.textContent = msg; };

    if (!window.webgazer) throw new Error('WebGazer not found — check index.html script tag');

    // Fresh calibration every session
    wgOpt('saveDataAcrossSessions', false);
    window.saveDataAcrossSessions = false;

    // Ridge regression — matches the official WebGazer demo
    window.webgazer.setRegression('ridge');

    // Kalman filter smooths gaze output
    wgOpt('applyKalmanFilter', true);

    // ── Enable WebGazer's built-in visual features ────────────────────────────
    // showVideoPreview: shows webcam feed + face-mesh overlay (the green dots
    //   and eye outlines drawn on the video canvas — what the Brown demo shows)
    // showPredictionPoints: renders a live dot on screen where WebGazer predicts
    //   you're looking, so you get real-time feedback while clicking dots.
    // These are disabled in start() and replaced with our own gaze cursor.
    wgOpt('showVideoPreview',     true);
    wgOpt('showPredictionPoints', true);

    // No-op listener during calibration — real listener set in start()
    window.webgazer.setGazeListener(() => {});

    status('Loading gaze model and opening camera…');
    await window.webgazer.begin();
    // Do NOT pause — WebGazer must run continuously so every calibration
    // click is recorded as a training sample.
    status('');
  }

  /** Called after calibration — switches to real gaze callback, hides WebGazer's dot. */
  async start(cb: GazeCallback): Promise<void> {
    this.cb = cb;
    if (!window.webgazer) return;

    // Replace the built-in prediction dot with our own smooth gaze cursor
    wgOpt('showPredictionPoints', false);

    window.webgazer.setGazeListener((data) => {
      if (!data || !this.cb) return;
      // WebGazer + Kalman already outputs smoothed viewport pixel coords
      this.cb({ x: data.x, y: data.y, confidence: 0.9, timestamp: Date.now() });
    });
  }

  stop(): void {
    this.cb = null;
    try { window.webgazer?.setGazeListener(() => {}); } catch { /* ignore */ }
  }

  shutdown(): void {
    this.cb = null;
    try {
      window.webgazer?.setGazeListener(null);
      window.webgazer?.end();
    } catch { /* ignore */ }
  }

  clearTrainingData(): void {
    wgOpt('clearData');
  }
}

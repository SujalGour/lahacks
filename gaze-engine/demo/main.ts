import { GazeEngine, buildCalibrationProfile } from '@catalyst/gaze-engine';
import type { GazeSource, GazeCallback, CalibrationSample, CalibrationProfile } from '@catalyst/gaze-engine';
import { MediaPipeGazeSource } from './mediapipe-source';

// ── Letter & control tile definitions ─────────────────────────────────────────

// Frequency-ordered alphabet (ETAOIN…)
const LETTERS = ['E','T','A','O','I','N','S','R','H','L','D','C','U','M','F','P','G','W','Y','B','V','K','X','J','Q','Z'];

const CONTROLS = [
  { id: 'SPACE',  label: 'SPACE'  },
  { id: 'DELETE', label: '⌫ DEL' },
  { id: 'CLEAR',  label: 'CLEAR'  },
  { id: 'SEND',   label: 'SEND ▶' },
];

// ── ALS-focused word list for prefix prediction ───────────────────────────────

const WORD_LIST: string[] = [
  'i','im','ill','in','is','it',
  'you','your','yes',
  'no','not','now','need','needs','needed','nurse','nauseous',
  'want','wanted','wants','water','was','will','would','where','when','who','why','we','with','well','warm',
  'am','are','again','always','aching',
  'pain','painful','please','pill','pills','phone','position',
  'help','helps','hot','hungry','hurt','hurts','home','hospital','her','him','he','has','have','had','here','how',
  'feel','feels','felt','fine','food','family','fall','fix',
  'thank','thanks','thirsty','tired','today','tomorrow','toilet','try','they','think','there',
  'can','call','called','come','cold','comfortable','could',
  'doctor','dizzy','do','done','dad','different',
  'medicine','medication','more','maybe','my','me','mom',
  'bathroom','bad','bed','blanket','be','been','better','both','back',
  'good','get','go','going',
  'okay','ok',
  'stop','sorry','soon','sleep','sleepy','she','some','should','something','sometimes',
  'very','uncomfortable',
  'right','room','ready',
  'enough','exhausted',
  'left','leg','lower','like','love','later','less',
  'might','must','more',
  'up','us',
  'just','jaw',
  'keep','knee',
].filter((w, i, a) => a.indexOf(w) === i);

// ── Text composition state ────────────────────────────────────────────────────

let composedText = '';

function getLastWord(): string {
  if (composedText.endsWith(' ') || composedText === '') return '';
  const lastSpace = composedText.lastIndexOf(' ');
  return lastSpace === -1 ? composedText : composedText.slice(lastSpace + 1);
}

function applyPrediction(word: string) {
  const upper = word.toUpperCase();
  if (composedText.endsWith(' ') || composedText === '') {
    composedText += upper + ' ';
  } else {
    const lastSpace = composedText.lastIndexOf(' ');
    composedText = (lastSpace === -1 ? '' : composedText.slice(0, lastSpace + 1)) + upper + ' ';
  }
}

function updateDisplay() {
  const el = document.getElementById('text-content')!;
  el.textContent = composedText || 'Start typing…';
  el.classList.toggle('placeholder', !composedText);
}

function updatePredictions(engine: GazeEngine) {
  const prefix = getLastWord().toLowerCase();
  const preds = prefix.length < 1
    ? []
    : WORD_LIST.filter(w => w.startsWith(prefix) && w !== prefix).slice(0, 5);

  for (let i = 0; i < 5; i++) {
    const el = document.getElementById(`pred-${i}`)!;
    const word = preds[i] ?? '';
    el.dataset.word = word;
    const labelEl = el.querySelector('.pred-label') as HTMLElement;
    if (labelEl) labelEl.textContent = word.toUpperCase();
    el.classList.toggle('has-word', !!word);
  }
}

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id: string) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)!.classList.add('active');
}

// ── Calibration ───────────────────────────────────────────────────────────────

const CALIB_GRID = [
  { x: 0.1, y: 0.1 }, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.1 },
  { x: 0.1, y: 0.5 }, { x: 0.5, y: 0.5 }, { x: 0.9, y: 0.5 },
  { x: 0.1, y: 0.9 }, { x: 0.5, y: 0.9 }, { x: 0.9, y: 0.9 },
];
const HOLD_MS = 600;
const POLL_MS = 33;

function runWebcamCalibration(source: MediaPipeGazeSource): Promise<CalibrationSample[]> {
  const samples: CalibrationSample[] = [];

  return new Promise(resolve => {
    const surface    = document.getElementById('calib-surface')!;
    const nEl        = document.getElementById('calib-n')!;
    const progressEl = document.getElementById('calib-progress')!;
    surface.innerHTML = '';

    const dots = CALIB_GRID.map((pos, i) => {
      const dot = document.createElement('div');
      dot.className = 'calib-dot';
      dot.style.left = `${pos.x * 100}vw`;
      dot.style.top  = `${pos.y * 100}vh`;
      if (i !== 0) dot.style.opacity = '0.3';
      surface.appendChild(dot);
      return dot;
    });

    let current = 0;
    let capturing = false;
    dots[0].classList.add('active');
    nEl.textContent = '1';
    progressEl.textContent = 'Click the dot, then hold still';

    const advance = () => {
      capturing = false;
      dots[current].classList.remove('active', 'capturing');
      dots[current].classList.add('done');
      current++;
      if (current >= CALIB_GRID.length) {
        surface.innerHTML = '';
        resolve(samples);
        return;
      }
      nEl.textContent = String(current + 1);
      progressEl.textContent = 'Click the dot, then hold still';
      dots[current].style.opacity = '1';
      dots[current].classList.add('active');
    };

    const startCapture = (i: number) => {
      if (i !== current || capturing) return;
      capturing = true;
      const pos = CALIB_GRID[i];
      const rawBuf: Array<{ x: number; y: number }> = [];
      dots[i].classList.add('capturing');
      progressEl.textContent = 'Holding… keep your gaze steady';

      const timer = setInterval(() => {
        const raw = source.lastRaw;
        if (raw) rawBuf.push({ x: raw.x, y: raw.y });
      }, POLL_MS);

      setTimeout(() => {
        clearInterval(timer);
        if (rawBuf.length >= 3) {
          // Trim 20% outliers by Euclidean distance from centroid
          const cx = rawBuf.reduce((s, p) => s + p.x, 0) / rawBuf.length;
          const cy = rawBuf.reduce((s, p) => s + p.y, 0) / rawBuf.length;
          const sorted = [...rawBuf].sort(
            (a, b) => (a.x-cx)**2 + (a.y-cy)**2 - ((b.x-cx)**2 + (b.y-cy)**2)
          );
          const kept = sorted.slice(0, Math.max(1, Math.floor(sorted.length * 0.8)));
          samples.push({
            screenX:  pos.x * window.innerWidth,
            screenY:  pos.y * window.innerHeight,
            rawGazeX: kept.reduce((s, p) => s + p.x, 0) / kept.length,
            rawGazeY: kept.reduce((s, p) => s + p.y, 0) / kept.length,
          });
        }
        advance();
      }, HOLD_MS);
    };

    dots.forEach((dot, i) => dot.addEventListener('click', () => startCapture(i)));

    document.getElementById('btn-skip-calib')!.addEventListener('click', () => {
      surface.innerHTML = '';
      resolve(samples);
    }, { once: true });
  });
}

// ── Gaze cursor ───────────────────────────────────────────────────────────────

function moveCursor(x: number, y: number) {
  const el = document.getElementById('gaze-cursor')!;
  el.style.left = `${x}px`;
  el.style.top  = `${y}px`;
}

// ── Speech ────────────────────────────────────────────────────────────────────

let currentUtterance: SpeechSynthesisUtterance | null = null;

function speak(text: string) {
  if (!window.speechSynthesis) return;
  if (currentUtterance) window.speechSynthesis.cancel();
  currentUtterance = new SpeechSynthesisUtterance(text);
  currentUtterance.rate = 0.9;
  window.speechSynthesis.speak(currentUtterance);
}

// ── Keyboard board ────────────────────────────────────────────────────────────

const CIRC = 2 * Math.PI * 44;

function buildKeyboard(engine: GazeEngine) {
  const grid = document.getElementById('letter-grid')!;
  grid.innerHTML = '';

  // 26 letter tiles + 4 control tiles (6 columns × 5 rows = 30)
  for (const letter of LETTERS) {
    const el = document.createElement('div');
    el.className = 'tile letter-tile';
    el.id = `key-${letter}`;
    el.innerHTML = `
      <div class="tile-letter">${letter}</div>
      <svg class="progress-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-track" cx="50" cy="50" r="44"/>
        <circle class="ring-fill" cx="50" cy="50" r="44"
          stroke-dasharray="${CIRC.toFixed(2)}"
          stroke-dashoffset="${CIRC.toFixed(2)}"/>
      </svg>`;
    grid.appendChild(el);
  }

  for (const ctrl of CONTROLS) {
    const el = document.createElement('div');
    el.className = 'tile control-tile';
    el.id = `ctrl-${ctrl.id}`;
    el.innerHTML = `
      <div class="tile-label">${ctrl.label}</div>
      <svg class="progress-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-track" cx="50" cy="50" r="44"/>
        <circle class="ring-fill" cx="50" cy="50" r="44"
          stroke-dasharray="${CIRC.toFixed(2)}"
          stroke-dashoffset="${CIRC.toFixed(2)}"/>
      </svg>`;
    grid.appendChild(el);
  }

  // Prediction tiles
  const predBar = document.getElementById('prediction-bar')!;
  predBar.innerHTML = '';
  for (let i = 0; i < 5; i++) {
    const el = document.createElement('div');
    el.className = 'tile prediction-tile';
    el.id = `pred-${i}`;
    el.dataset.word = '';
    el.innerHTML = `
      <div class="pred-label"></div>
      <svg class="progress-ring" viewBox="0 0 100 100" aria-hidden="true">
        <circle class="ring-track" cx="50" cy="50" r="44"/>
        <circle class="ring-fill" cx="50" cy="50" r="44"
          stroke-dasharray="${CIRC.toFixed(2)}"
          stroke-dashoffset="${CIRC.toFixed(2)}"/>
      </svg>`;
    predBar.appendChild(el);
  }

  // Register all tiles as engine targets with 10px padding for easier dwell
  requestAnimationFrame(() => {
    const register = (id: string, label: string) => {
      const r = document.getElementById(id)!.getBoundingClientRect();
      engine.registerTarget({
        id,
        rect: { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 },
        label,
      });
    };

    for (const l of LETTERS)    register(`key-${l}`, l);
    for (const c of CONTROLS)   register(`ctrl-${c.id}`, c.label);
    for (let i = 0; i < 5; i++) register(`pred-${i}`, `prediction ${i}`);

    updateDisplay();
    updatePredictions(engine);
  });
}

// ── Tile selection handler ────────────────────────────────────────────────────

function handleTileSelect(id: string, engine: GazeEngine) {
  if (id.startsWith('key-')) {
    composedText += id.slice(4); // append the letter
    updateDisplay();
    updatePredictions(engine);

  } else if (id.startsWith('pred-')) {
    const word = (document.getElementById(id) as HTMLElement).dataset.word;
    if (!word) return;
    applyPrediction(word);
    updateDisplay();
    updatePredictions(engine);

  } else if (id === 'ctrl-SPACE') {
    composedText += ' ';
    updateDisplay();
    updatePredictions(engine);

  } else if (id === 'ctrl-DELETE') {
    composedText = composedText.slice(0, -1);
    updateDisplay();
    updatePredictions(engine);

  } else if (id === 'ctrl-CLEAR') {
    composedText = '';
    updateDisplay();
    updatePredictions(engine);

  } else if (id === 'ctrl-SEND') {
    const text = composedText.trim();
    if (!text) return;
    speak(text);
    // Optional backend call — fails silently if not available
    fetch('/phrases/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {});
    composedText = '';
    updateDisplay();
    updatePredictions(engine);
  }
}

// ── Board launcher ────────────────────────────────────────────────────────────

async function startKeyboard(source: GazeSource, calibration?: CalibrationProfile): Promise<GazeEngine> {
  composedText = '';

  const engine = new GazeEngine(
    { dwellMs: 1200, confidenceThreshold: 0.3, filterAlpha: 0.5 },
    source,
  );
  if (calibration) engine.loadCalibrationProfile(calibration);

  showScreen('screen-board');
  buildKeyboard(engine);

  const cursor = document.getElementById('gaze-cursor')!;
  cursor.style.display = 'block';
  engine.onGaze(pt => moveCursor(pt.x, pt.y));

  engine.onDwellProgress((id, progress) => {
    const el = document.getElementById(id);
    if (!el) return;
    // Skip progress ring for empty prediction tiles
    if (id.startsWith('pred-') && !el.dataset.word) return;
    const fill = el.querySelector('.ring-fill') as SVGCircleElement | null;
    if (fill) fill.style.strokeDashoffset = String(CIRC * (1 - progress));
    el.classList.toggle('dwelling', progress > 0);
  });

  engine.onSelect((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id.startsWith('pred-') && !el.dataset.word) return;
    el.classList.remove('selected');
    void el.offsetWidth;
    el.classList.add('selected');
    const fill = el.querySelector('.ring-fill') as SVGCircleElement | null;
    if (fill) fill.style.strokeDashoffset = String(CIRC);
    el.classList.remove('dwelling');
    handleTileSelect(id, engine);
  });

  window.addEventListener('resize', () => {
    engine.clearTargets();
    const reregister = (id: string, label: string) => {
      const el = document.getElementById(id);
      if (!el) return;
      const r = el.getBoundingClientRect();
      engine.registerTarget({ id, rect: { x: r.left-10, y: r.top-10, width: r.width+20, height: r.height+20 }, label });
    };
    for (const l of LETTERS)    reregister(`key-${l}`, l);
    for (const c of CONTROLS)   reregister(`ctrl-${c.id}`, c.label);
    for (let i = 0; i < 5; i++) reregister(`pred-${i}`, `prediction ${i}`);
  });

  await engine.start();
  return engine;
}

// ── Button wiring (replaces listeners to avoid duplicate handlers) ────────────

let mpSource: MediaPipeGazeSource | null = null;

function wireButtons(engine: GazeEngine, calibration: CalibrationProfile | undefined) {
  // Clone nodes to drop old listeners cleanly
  ['btn-back', 'btn-recalibrate'].forEach(btnId => {
    const old = document.getElementById(btnId)!;
    const fresh = old.cloneNode(true) as HTMLElement;
    old.parentNode!.replaceChild(fresh, old);
  });

  document.getElementById('btn-back')!.addEventListener('click', () => {
    engine.stop();
    mpSource?.shutdown();
    mpSource = null;
    document.getElementById('gaze-cursor')!.style.display = 'none';
    const btn = document.getElementById('btn-webcam') as HTMLButtonElement;
    btn.textContent = '📷 Start with Webcam →';
    btn.disabled = false;
    showScreen('screen-landing');
  });

  document.getElementById('btn-recalibrate')!.addEventListener('click', async () => {
    engine.stop();
    if (!mpSource) return;
    showScreen('screen-calibration');
    const newSamples = await runWebcamCalibration(mpSource);
    const newCal = newSamples.length >= 2 ? buildCalibrationProfile(newSamples) : calibration;
    const newEngine = await startKeyboard(mpSource, newCal);
    wireButtons(newEngine, newCal);
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

document.getElementById('btn-webcam')!.addEventListener('click', async () => {
  const btn = document.getElementById('btn-webcam') as HTMLButtonElement;
  const setStatus = (msg: string, disabled = true) => {
    btn.textContent = msg;
    btn.disabled = disabled;
  };

  setStatus('Initializing…');

  try {
    const statusEl = document.getElementById('calib-instruction');
    mpSource = new MediaPipeGazeSource();

    showScreen('screen-calibration');
    await mpSource.init(statusEl);

    const samples = await runWebcamCalibration(mpSource);
    const calibration = samples.length >= 2 ? buildCalibrationProfile(samples) : undefined;
    if (!calibration) console.warn('Too few calibration samples — gaze will be uncalibrated');

    const engine = await startKeyboard(mpSource, calibration);
    wireButtons(engine, calibration);

  } catch (err) {
    console.error('Webcam init failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`⚠ ${msg.slice(0, 55)}`, false);
    mpSource?.shutdown();
    mpSource = null;
    showScreen('screen-landing');
    setTimeout(() => setStatus('📷 Start with Webcam →', false), 4000);
  }
});

import { GazeEngine } from '@catalyst/gaze-engine';
import type { GazeSource } from '@catalyst/gaze-engine';
import { WebGazerGazeSource } from './webgazer-source';

// ── Next-word transition table ────────────────────────────────────────────────
// Key = last 1–2 words of composed text (uppercase). Value = 4 suggestions.
// Lookup: try 2-word key first, then 1-word key, then '' (sentence start).

const TRANSITIONS: Record<string, string[]> = {
  '':           ['I',        'PLEASE',    'HELP',      'YES'       ],
  'I':          ['WANT',     'NEED',      'FEEL',      'AM'        ],
  'I WANT':     ['WATER',    'FOOD',      'MEDICINE',  'BATHROOM'  ],
  'WANT':       ['WATER',    'FOOD',      'MEDICINE',  'HELP'      ],
  'I NEED':     ['HELP',     'WATER',     'MEDICINE',  'DOCTOR'    ],
  'NEED':       ['HELP',     'WATER',     'MEDICINE',  'BATHROOM'  ],
  'I FEEL':     ['PAIN',     'TIRED',     'COLD',      'HOT'       ],
  'FEEL':       ['PAIN',     'TIRED',     'COLD',      'BETTER'    ],
  'I AM':       ['IN PAIN',  'TIRED',     'COLD',      'OKAY'      ],
  'AM':         ['IN PAIN',  'TIRED',     'OKAY',      'UNCOMFORTABLE'],
  'PLEASE':     ['HELP',     'CALL',      'STOP',      'COME'      ],
  'PLEASE CALL':['DOCTOR',   'NURSE',     'FAMILY',    'EMERGENCY' ],
  'CALL':       ['DOCTOR',   'NURSE',     'FAMILY',    'EMERGENCY' ],
  'HELP':       ['ME',       'NOW',       'PLEASE',    'DOCTOR'    ],
  'YES':        ['PLEASE',   'MORE',      'THAT',      'THANK YOU' ],
  'NO':         ['THANK YOU','MORE',      'STOP',      'PLEASE'    ],
  'THANK YOU':  ['SO MUCH',  'FOR EVERYTHING', 'VERY MUCH', 'ALL'  ],
  'PAIN':       ['HERE',     'CHEST',     'BACK',      'HEAD'      ],
  'IN PAIN':    ['HERE',     'CHEST',     'PLEASE HELP','MEDICINE' ],
  'MORE':       ['WATER',    'FOOD',      'MEDICINE',  'AIR'       ],
  'CANNOT':     ['BREATHE',  'MOVE',      'SLEEP',     'EAT'       ],
  'WATER':      ['PLEASE',   'NOW',       'MORE',      'THANK YOU' ],
  'FOOD':       ['PLEASE',   'MORE',      'WARM',      'THANK YOU' ],
  'MEDICINE':   ['PLEASE',   'NOW',       'MORE',      'THANK YOU' ],
  'DOCTOR':     ['PLEASE',   'NOW',       'COME',      'HELP'      ],
  'NURSE':      ['PLEASE',   'NOW',       'COME',      'HELP'      ],
  'TIRED':      ['VERY',     'PLEASE',    'SLEEP',     'REST'      ],
  'COLD':       ['BLANKET',  'PLEASE',    'VERY',      'HELP'      ],
  'HOT':        ['WATER',    'FAN',       'PLEASE',    'HELP'      ],
  'BATHROOM':   ['PLEASE',   'NOW',       'HELP',      'URGENT'    ],
  'OKAY':       ['THANK YOU','GOOD',      'YES',       'BETTER'    ],
  'STOP':       ['PLEASE',   'NOW',       'THAT',      'PAIN'      ],
};

const DEFAULT_WORDS = TRANSITIONS[''];

function getNextWords(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    const key2 = words.slice(-2).join(' ');
    if (TRANSITIONS[key2]) return TRANSITIONS[key2];
  }
  if (words.length >= 1) {
    const key1 = words[words.length - 1];
    if (TRANSITIONS[key1]) return TRANSITIONS[key1];
  }
  return DEFAULT_WORDS;
}

// ── Text state ────────────────────────────────────────────────────────────────

let composedText = '';

function updateDisplay() {
  const el = document.getElementById('text-content')!;
  el.textContent = composedText || 'Look at a word to begin…';
  el.classList.toggle('placeholder', !composedText);
}

// ── Screen helpers ────────────────────────────────────────────────────────────

function showScreen(id: string) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id)!.classList.add('active');
}

// ── Calibration ───────────────────────────────────────────────────────────────

// 9-point grid — index 4 is center (hidden until the 8 outer points are done)
const CALIB_GRID = [
  { x: 0.05, y: 0.07 }, { x: 0.5, y: 0.07 }, { x: 0.95, y: 0.07 },
  { x: 0.05, y: 0.5  }, { x: 0.5, y: 0.5  }, { x: 0.95, y: 0.5  },
  { x: 0.05, y: 0.93 }, { x: 0.5, y: 0.93 }, { x: 0.95, y: 0.93 },
];
const CLICKS_PER_DOT = 5; // matches the official WebGazer demo

/**
 * Brown-University-style calibration:
 * - All 9 dots shown at once; user clicks them in any order.
 * - Center dot (index 4) hidden until the 8 outer dots are done.
 * - Each dot needs CLICKS_PER_DOT clicks; opacity ramps up with each click,
 *   turns accent colour when complete.
 * - WebGazer is already running (not paused), so every click is recorded
 *   as a training sample automatically.
 */
function runCalibration(): Promise<void> {
  return new Promise(resolve => {
    const surface    = document.getElementById('calib-surface')!;
    const counterEl  = document.querySelector('.calib-counter') as HTMLElement | null;
    const progressEl = document.getElementById('calib-progress')!;
    surface.innerHTML = '';

    if (counterEl) counterEl.style.display = 'none'; // counter is meaningless with all-at-once

    const calibClicks = new Array(CALIB_GRID.length).fill(0);
    let pointsDone = 0;

    progressEl.textContent = `Click each dot ${CLICKS_PER_DOT} times while looking at it`;

    const dots = CALIB_GRID.map((pos, i) => {
      const dot = document.createElement('div');
      dot.className = 'calib-dot';
      dot.style.left    = `${pos.x * 100}vw`;
      dot.style.top     = `${pos.y * 100}vh`;
      dot.style.opacity = '0.2';
      // Center dot hidden until the 8 outer dots are done
      if (i === 4) dot.style.display = 'none';
      surface.appendChild(dot);
      return dot;
    });

    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        if (calibClicks[i] >= CLICKS_PER_DOT) return; // already done
        calibClicks[i]++;

        if (calibClicks[i] >= CLICKS_PER_DOT) {
          // Dot complete — accent colour, disable further clicks
          dot.classList.remove('active', 'capturing');
          dot.classList.add('done');
          dot.style.background    = 'var(--accent)';
          dot.style.borderColor   = 'var(--accent)';
          dot.style.opacity       = '1';
          dot.style.pointerEvents = 'none';
          dot.style.boxShadow     = '0 0 20px rgba(124,111,255,0.8)';
          pointsDone++;

          if (pointsDone === 8) {
            // Reveal the center dot
            dots[4].style.display = '';
            progressEl.textContent = 'Now click the center dot 5 times';
          }

          if (pointsDone >= 9) {
            surface.innerHTML = '';
            if (counterEl) counterEl.style.display = '';
            resolve();
          }
        } else {
          // Ramp up opacity: 0.2 per click (0.2 → 0.4 → 0.6 → 0.8)
          dot.style.opacity = String(0.2 * calibClicks[i] + 0.2);
          dot.classList.add('capturing');
          progressEl.textContent =
            `${calibClicks[i]} / ${CLICKS_PER_DOT} on this dot — ${pointsDone} / 9 complete`;
        }
      });
    });

    document.getElementById('btn-skip-calib')!.addEventListener('click', () => {
      surface.innerHTML = '';
      if (counterEl) counterEl.style.display = '';
      resolve();
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

// ── Word board ────────────────────────────────────────────────────────────────

const CIRC = 2 * Math.PI * 44;

// Tile IDs: word0–word3, ctrl-UNDO, ctrl-SEND
const WORD_TILE_IDS = ['word0', 'word1', 'word2', 'word3'];
const CTRL_UNDO = 'ctrl-UNDO';
const CTRL_SEND = 'ctrl-SEND';
const ALL_TILE_IDS = [...WORD_TILE_IDS, CTRL_UNDO, CTRL_SEND];

function makeTileHTML(label: string): string {
  return `
    <div class="tile-word">${label}</div>
    <svg class="progress-ring" viewBox="0 0 100 100" aria-hidden="true">
      <circle class="ring-track" cx="50" cy="50" r="44"/>
      <circle class="ring-fill" cx="50" cy="50" r="44"
        stroke-dasharray="${CIRC.toFixed(2)}"
        stroke-dashoffset="${CIRC.toFixed(2)}"/>
    </svg>`;
}

function buildBoard(engine: GazeEngine) {
  const grid = document.getElementById('word-grid')!;
  grid.innerHTML = '';

  for (const id of WORD_TILE_IDS) {
    const el = document.createElement('div');
    el.className = 'tile word-tile';
    el.id = id;
    el.innerHTML = makeTileHTML('');
    grid.appendChild(el);
  }

  const undo = document.createElement('div');
  undo.className = 'tile ctrl-tile ctrl-undo';
  undo.id = CTRL_UNDO;
  undo.innerHTML = makeTileHTML('⌫ UNDO WORD');
  grid.appendChild(undo);

  const send = document.createElement('div');
  send.className = 'tile ctrl-tile ctrl-send';
  send.id = CTRL_SEND;
  send.innerHTML = makeTileHTML('SEND ▶');
  grid.appendChild(send);

  requestAnimationFrame(() => {
    for (const id of ALL_TILE_IDS) {
      const r = document.getElementById(id)!.getBoundingClientRect();
      engine.registerTarget({
        id,
        rect: { x: r.left - 10, y: r.top - 10, width: r.width + 20, height: r.height + 20 },
        label: id,
      });
    }
    refreshWordTiles(engine);
  });
}

function refreshWordTiles(engine: GazeEngine) {
  const words = getNextWords(composedText);
  for (let i = 0; i < WORD_TILE_IDS.length; i++) {
    const el = document.getElementById(WORD_TILE_IDS[i])!;
    const label = words[i] ?? '';
    el.dataset.word = label;
    const wordEl = el.querySelector('.tile-word') as HTMLElement;
    if (wordEl) wordEl.textContent = label;
    el.classList.toggle('empty', !label);
  }
}

function handleSelect(id: string, engine: GazeEngine) {
  if (id === CTRL_UNDO) {
    const trimmed = composedText.trimEnd();
    const lastSpace = trimmed.lastIndexOf(' ');
    composedText = lastSpace === -1 ? '' : trimmed.slice(0, lastSpace) + ' ';
    updateDisplay();
    refreshWordTiles(engine);
    return;
  }

  if (id === CTRL_SEND) {
    const text = composedText.trim();
    if (!text) return;
    speak(text);
    fetch('/phrases/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    }).catch(() => {});
    composedText = '';
    updateDisplay();
    refreshWordTiles(engine);
    return;
  }

  const el = document.getElementById(id) as HTMLElement | null;
  const word = el?.dataset.word;
  if (!word) return;
  composedText = (composedText.trimEnd() + ' ' + word + ' ').trimStart();
  updateDisplay();
  refreshWordTiles(engine);
}

// ── Board launcher ────────────────────────────────────────────────────────────

async function startBoard(source: GazeSource): Promise<GazeEngine> {
  composedText = '';

  const engine = new GazeEngine(
    { dwellMs: 1200, confidenceThreshold: 0.3, filterAlpha: 0.5 },
    source,
  );

  showScreen('screen-board');
  updateDisplay();
  buildBoard(engine);

  const cursor = document.getElementById('gaze-cursor')!;
  cursor.style.display = 'block';
  engine.onGaze(pt => moveCursor(pt.x, pt.y));

  engine.onDwellProgress((id, progress) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.word === '' && WORD_TILE_IDS.includes(id)) return;
    const fill = el.querySelector('.ring-fill') as SVGCircleElement | null;
    if (fill) fill.style.strokeDashoffset = String(CIRC * (1 - progress));
    el.classList.toggle('dwelling', progress > 0);
  });

  engine.onSelect((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (el.dataset.word === '' && WORD_TILE_IDS.includes(id)) return;
    el.classList.remove('selected');
    void el.offsetWidth;
    el.classList.add('selected');
    const fill = el.querySelector('.ring-fill') as SVGCircleElement | null;
    if (fill) fill.style.strokeDashoffset = String(CIRC);
    el.classList.remove('dwelling');
    handleSelect(id, engine);
  });

  window.addEventListener('resize', () => {
    engine.clearTargets();
    for (const id of ALL_TILE_IDS) {
      const el = document.getElementById(id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      engine.registerTarget({ id, rect: { x: r.left-10, y: r.top-10, width: r.width+20, height: r.height+20 }, label: id });
    }
  });

  await engine.start();
  return engine;
}

// ── Button wiring ─────────────────────────────────────────────────────────────

let wgSource: WebGazerGazeSource | null = null;

function wireButtons(engine: GazeEngine) {
  ['btn-back', 'btn-recalibrate'].forEach(btnId => {
    const old = document.getElementById(btnId)!;
    const fresh = old.cloneNode(true) as HTMLElement;
    old.parentNode!.replaceChild(fresh, old);
  });

  document.getElementById('btn-back')!.addEventListener('click', () => {
    engine.stop();
    wgSource?.shutdown();
    wgSource = null;
    document.getElementById('gaze-cursor')!.style.display = 'none';
    const btn = document.getElementById('btn-webcam') as HTMLButtonElement;
    btn.textContent = '📷 Start with Webcam →';
    btn.disabled = false;
    showScreen('screen-landing');
  });

  document.getElementById('btn-recalibrate')!.addEventListener('click', async () => {
    engine.stop();
    if (!wgSource) return;
    wgSource.clearTrainingData();
    showScreen('screen-calibration');
    await runCalibration();
    const newEngine = await startBoard(wgSource);
    wireButtons(newEngine);
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
    wgSource = new WebGazerGazeSource();
    showScreen('screen-calibration');
    await wgSource.init(statusEl);

    await runCalibration();

    const engine = await startBoard(wgSource);
    wireButtons(engine);

  } catch (err) {
    console.error('Webcam init failed:', err);
    const msg = err instanceof Error ? err.message : String(err);
    setStatus(`⚠ ${msg.slice(0, 55)}`, false);
    wgSource?.shutdown();
    wgSource = null;
    showScreen('screen-landing');
    setTimeout(() => setStatus('📷 Start with Webcam →', false), 4000);
  }
});

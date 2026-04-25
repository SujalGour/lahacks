import type { CalibrationProfile, CalibrationSample } from './types.js';

/**
 * Least-squares linear fit: y = scale*x + offset.
 * Used independently for X and Y axes.
 */
function fitLinear(raws: number[], screens: number[]): { scale: number; offset: number } {
  const n = raws.length;
  if (n < 2) return { scale: 1, offset: 0 };

  const sumX = raws.reduce((a, b) => a + b, 0);
  const sumY = screens.reduce((a, b) => a + b, 0);
  const sumXY = raws.reduce((acc, x, i) => acc + x * screens[i], 0);
  const sumXX = raws.reduce((acc, x) => acc + x * x, 0);

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return { scale: 1, offset: 0 };

  const scale = (n * sumXY - sumX * sumY) / denom;
  const offset = (sumY - scale * sumX) / n;
  return { scale, offset };
}

export function buildCalibrationProfile(samples: CalibrationSample[]): CalibrationProfile {
  if (samples.length === 0) {
    return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0, sampleCount: 0, createdAt: Date.now() };
  }

  const { scale: scaleX, offset: offsetX } = fitLinear(
    samples.map(s => s.rawGazeX),
    samples.map(s => s.screenX),
  );
  const { scale: scaleY, offset: offsetY } = fitLinear(
    samples.map(s => s.rawGazeY),
    samples.map(s => s.screenY),
  );

  // Store samples so applyCalibration can use IDW instead of the linear model.
  // IDW is exact at calibration points and handles edge non-linearity better.
  return {
    scaleX, scaleY, offsetX, offsetY,
    samples: [...samples],
    sampleCount: samples.length,
    createdAt: Date.now(),
  };
}

/**
 * Inverse-Distance Weighting interpolation.
 * Each calibration point contributes to the estimate weighted by 1/d².
 * This is exact at every calibration point and smoothly interpolates between them,
 * unlike the linear model which finds a single best-fit plane.
 */
function idw(rawX: number, rawY: number, samples: CalibrationSample[]): { x: number; y: number } {
  let wSum = 0, wxSum = 0, wySum = 0;

  for (const s of samples) {
    const dx = rawX - s.rawGazeX;
    const dy = rawY - s.rawGazeY;
    const d2 = dx * dx + dy * dy;

    if (d2 < 1e-12) return { x: s.screenX, y: s.screenY }; // exactly on a calibration point

    const w = 1 / (d2 * d2); // 1/d⁴ — sharper locality than standard 1/d²
    wSum  += w;
    wxSum += w * s.screenX;
    wySum += w * s.screenY;
  }

  return { x: wxSum / wSum, y: wySum / wSum };
}

export function applyCalibration(
  rawX: number,
  rawY: number,
  profile: CalibrationProfile,
): { x: number; y: number } {
  // Use IDW when samples are stored (built by buildCalibrationProfile).
  // Fall back to the linear model for profiles created without samples (tests, manual profiles).
  if (profile.samples && profile.samples.length >= 3) {
    return idw(rawX, rawY, profile.samples);
  }
  return {
    x: profile.scaleX * rawX + profile.offsetX,
    y: profile.scaleY * rawY + profile.offsetY,
  };
}

/**
 * Generate screen positions for an N×N calibration grid with 10% margin.
 * Standard 9-point calibration uses gridSize=3.
 */
export function generateCalibrationGrid(
  screenWidth: number,
  screenHeight: number,
  gridSize = 3,
): Array<{ x: number; y: number }> {
  const margin = 0.1;
  const points: Array<{ x: number; y: number }> = [];

  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const tx = gridSize === 1 ? 0.5 : col / (gridSize - 1);
      const ty = gridSize === 1 ? 0.5 : row / (gridSize - 1);
      points.push({
        x: Math.round(screenWidth * (margin + tx * (1 - 2 * margin))),
        y: Math.round(screenHeight * (margin + ty * (1 - 2 * margin))),
      });
    }
  }

  return points;
}

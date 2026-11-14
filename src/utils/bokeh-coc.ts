/**
 * Pure optical Circle-of-Confusion (CoC) & Depth-of-Field simulation utilities.
 */

export function clampValue(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes normalized thin-lens Circle-of-Confusion blur radius [0..1]
 * inversely proportional to Lens Aperture f-stop (N).
 * At wide open (f/1.4 - f/2.0), out-of-focus regions bloom smoothly;
 * stopped down (f/11 - f/16), CoC drops toward zero for deep focus.
 */
export function computeCircleOfConfusionScale(
  apertureFStop: number,
  normalizedFocusDistanceDelta: number
): number {
  const fStop = Math.max(1.2, apertureFStop);
  const delta = clampValue(Math.abs(normalizedFocusDistanceDelta), 0, 1);
  if (delta <= 0.14) return 0;

  const zoneFactor = clampValue((delta - 0.14) / (0.62 - 0.14), 0, 1);
  const smoothZone = zoneFactor * zoneFactor * (3 - 2 * zoneFactor);
  const apertureScale = clampValue(2.8 / fStop - 0.16, 0, 1.85);
  return Number(clampValue((smoothZone * apertureScale) / 1.85, 0, 1).toFixed(4));
}

export function describeApertureDof(
  apertureFStop: number
): 'Shallow DoF' | 'Balanced' | 'Deep Focus' {
  if (apertureFStop <= 2.8) return 'Shallow DoF';
  if (apertureFStop <= 6.3) return 'Balanced';
  return 'Deep Focus';
}

export function formatApertureFStop(apertureFStop: number): string {
  const rounded = apertureFStop >= 10 ? Math.round(apertureFStop) : Number(apertureFStop.toFixed(1));
  return `f/${rounded}`;
}

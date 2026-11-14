/**
 * Prismatone Spectral Curve & Physical Wavelength Math
 * Computes calibrated sensor spectral response curves, Bruton spectral-to-sRGB mapping,
 * and circular dial kinematics for skeuomorphic camera controls.
 */

import { CameraProfile } from '../profiles/camera-profiles';

export interface SpectralCurvePoint {
  wavelength: number;
  r: number;
  g: number;
  b: number;
  irCut: number;
  maxVal: number;
}

/**
 * Converts a monochromatic physical optical wavelength (380nm - 780nm) into approximate sRGB.
 * Based on Dan Bruton's color science formulation with gamma correction.
 */
export function nmToRgb(wavelengthNm: number): [number, number, number] {
  const w = Math.max(380, Math.min(780, wavelengthNm));
  let r = 0;
  let g = 0;
  let b = 0;

  if (w >= 380 && w < 440) {
    r = -(w - 440) / (440 - 380);
    g = 0.0;
    b = 1.0;
  } else if (w >= 440 && w < 490) {
    r = 0.0;
    g = (w - 440) / (490 - 440);
    b = 1.0;
  } else if (w >= 490 && w < 510) {
    r = 0.0;
    g = 1.0;
    b = -(w - 510) / (510 - 490);
  } else if (w >= 510 && w < 580) {
    r = (w - 510) / (580 - 510);
    g = 1.0;
    b = 0.0;
  } else if (w >= 580 && w < 645) {
    r = 1.0;
    g = -(w - 645) / (645 - 580);
    b = 0.0;
  } else if (w >= 645 && w <= 780) {
    r = 1.0;
    g = 0.0;
    b = 0.0;
  }

  // Vision attenuation factor at extremes of visible spectrum
  let factor = 0.0;
  if (w >= 380 && w < 420) {
    factor = 0.3 + 0.7 * (w - 380) / (420 - 380);
  } else if (w >= 420 && w <= 700) {
    factor = 1.0;
  } else if (w > 700 && w <= 780) {
    factor = 0.3 + 0.7 * (780 - w) / (780 - 700);
  }

  const gamma = 0.8;
  const cr = factor > 0 ? Math.pow(Math.max(0, r * factor), gamma) : 0;
  const cg = factor > 0 ? Math.pow(Math.max(0, g * factor), gamma) : 0;
  const cb = factor > 0 ? Math.pow(Math.max(0, b * factor), gamma) : 0;

  return [
    Math.min(1.0, Math.max(0.0, cr)),
    Math.min(1.0, Math.max(0.0, cg)),
    Math.min(1.0, Math.max(0.0, cb)),
  ];
}

export function nmToRgbCss(wavelengthNm: number, alpha = 1.0): string {
  const [r, g, b] = nmToRgb(wavelengthNm);
  const ir = Math.round(r * 255);
  const ig = Math.round(g * 255);
  const ib = Math.round(b * 255);
  return alpha >= 1.0 ? `rgb(${ir}, ${ig}, ${ib})` : `rgba(${ir}, ${ig}, ${ib}, ${alpha.toFixed(2)})`;
}

/**
 * Computes calibrated sensor spectral response curves for a camera profile
 * across the 380nm to 720nm spectrum.
 */
export function computeSensorSpectralCurves(
  camera: CameraProfile,
  startNm = 380,
  endNm = 720,
  stepNm = 2
): SpectralCurvePoint[] {
  const points: SpectralCurvePoint[] = [];
  const peakR = camera.spectralPeakNm[0];
  const peakG = camera.spectralPeakNm[1];
  const peakB = camera.spectralPeakNm[2];

  const weightR = camera.spectralWeights[0];
  const weightG = camera.spectralWeights[1];
  const weightB = camera.spectralWeights[2];

  const irCut = camera.irCutNm;
  const irRej = camera.irRejectionFactor;
  const crosstalk = camera.cfaCrosstalk ?? 0.05;

  for (let nm = startNm; nm <= endNm; nm += stepNm) {
    // Silicon bandpass quantum efficiency profiles
    const rawR = Math.exp(-Math.pow((nm - peakR) / 48.0, 2)) * weightR;
    const rawG = Math.exp(-Math.pow((nm - peakG) / 44.0, 2)) * weightG;
    const rawB = Math.exp(-Math.pow((nm - peakB) / 38.0, 2)) * weightB;

    // Optical low-pass & IR-cut filter transmission curve
    // Steep sigmoid transition at camera.irCutNm
    const irSigmoid = 1.0 / (1.0 + Math.exp(-(nm - irCut) / 5.5));
    const irTrans = Math.max(0.02, 1.0 - irRej * irSigmoid);

    // Color filter array microlens inter-pixel crosstalk
    const rWithCrosstalk = rawR * (1.0 - 2.0 * crosstalk) + (rawG + rawB) * crosstalk;
    const gWithCrosstalk = rawG * (1.0 - 2.0 * crosstalk) + (rawR + rawB) * crosstalk;
    const bWithCrosstalk = rawB * (1.0 - 2.0 * crosstalk) + (rawR + rawG) * crosstalk;

    const rFinal = Math.max(0, rWithCrosstalk * irTrans);
    const gFinal = Math.max(0, gWithCrosstalk * irTrans);
    const bFinal = Math.max(0, bWithCrosstalk * irTrans);

    points.push({
      wavelength: nm,
      r: Number(rFinal.toFixed(4)),
      g: Number(gFinal.toFixed(4)),
      b: Number(bFinal.toFixed(4)),
      irCut: Number(irTrans.toFixed(4)),
      maxVal: Number(Math.max(rFinal, gFinal, bFinal).toFixed(4)),
    });
  }

  return points;
}

/**
 * Calculates rotary angle (in degrees) for a circular dial selector with N items.
 */
export function calculateDialAngle(index: number, totalItems: number): number {
  if (totalItems <= 1) return 0;
  const step = 360 / totalItems;
  return -index * step;
}

/**
 * Converts a rotary angle (in degrees) into the nearest item index for a circular dial selector.
 */
export function calculateIndexFromDialAngle(angleDeg: number, totalItems: number): number {
  if (totalItems <= 1) return 0;
  const step = 360 / totalItems;
  const normalized = ((-angleDeg % 360) + 360) % 360;
  const idx = Math.round(normalized / step) % totalItems;
  return idx;
}

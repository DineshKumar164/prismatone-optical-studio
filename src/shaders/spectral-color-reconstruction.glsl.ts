/**
 * Prismatone Spectral-Based Color Reconstruction Shader Module (GLSL #version 300 es)
 * Reconstructs physical spectral radiant power distributions from tristimulus RGB,
 * filters through lens glass transmission curves, and integrates across
 * sensor-specific spectral quantum efficiency sensitivity curves, CFA filter crosstalk,
 * and IR-cut absorption thresholds with true black preservation and crisp chromatic separation.
 */

export const SPECTRAL_WAVELENGTH_BANDS_NM = [430, 480, 525, 560, 595, 630, 665] as const;

export const SPECTRAL_RECONSTRUCTION_GLSL_MODULE = /* glsl */ `
// 7 Spectral wavelength nodes across visible spectrum: 430nm, 480nm, 525nm, 560nm, 595nm, 630nm, 665nm
#define SPECTRAL_BANDS 7

// Reconstruct physical spectral power distribution (SPD) without gray shadow lift
void reconstructSpectralRadiance(vec3 rgb, out float spd[7]) {
  vec3 c = max(vec3(0.0), rgb);
  float achromaticBase = min(c.r, min(c.g, c.b)) * 0.14;

  // High-separation basis weights mapping RGB into 7 visible wavelength bands
  spd[0] = max(0.0, c.b * 0.98 + c.g * 0.04 - c.r * 0.03 + achromaticBase);
  spd[1] = max(0.0, c.b * 0.62 + c.g * 0.42 - c.r * 0.04 + achromaticBase);
  spd[2] = max(0.0, c.g * 0.96 + c.b * 0.06 - c.r * 0.02 + achromaticBase);
  spd[3] = max(0.0, c.g * 0.66 + c.r * 0.36 - c.b * 0.02 + achromaticBase);
  spd[4] = max(0.0, c.r * 0.78 + c.g * 0.24 - c.b * 0.03 + achromaticBase);
  spd[5] = max(0.0, c.r * 1.00 + c.g * 0.03 - c.b * 0.02 + achromaticBase);
  spd[6] = max(0.0, c.r * 1.06 + achromaticBase);
}

// Lens physical spectral transmission filtering
void filterLensSpectralTransmission(
  inout float spd[7],
  vec3 lensTransmissionRgb,
  float warmthShift
) {
  float t430 = lensTransmissionRgb.b * (1.0 - warmthShift * 0.28);
  float t480 = mix(lensTransmissionRgb.b, lensTransmissionRgb.g, 0.45);
  float t525 = lensTransmissionRgb.g;
  float t560 = mix(lensTransmissionRgb.g, lensTransmissionRgb.r, 0.48);
  float t595 = mix(lensTransmissionRgb.g, lensTransmissionRgb.r, 0.78) * (1.0 + warmthShift * 0.14);
  float t630 = lensTransmissionRgb.r * (1.0 + warmthShift * 0.20);
  float t665 = lensTransmissionRgb.r * (1.0 + warmthShift * 0.22);

  spd[0] *= max(0.01, t430);
  spd[1] *= max(0.01, t480);
  spd[2] *= max(0.01, t525);
  spd[3] *= max(0.01, t560);
  spd[4] *= max(0.01, t595);
  spd[5] *= max(0.01, t630);
  spd[6] *= max(0.01, t665);
}

// Integrates physical spectral energy against tight camera-specific QE curves with chroma clarity preservation
vec3 integrateSensorSpectralResponse(
  vec3 rawInputRgb,
  float spd[7],
  vec3 spectralPeaks,
  vec3 spectralWeights,
  float irCutNm,
  float irRejection,
  float cfaCrosstalk
) {
  float wavelengths[7] = float[7](430.0, 480.0, 525.0, 560.0, 595.0, 630.0, 665.0);

  // Narrower dichroic CFA sensitivity curves keep colors crisp & prevent gray desaturation
  float sigmaR = 33.0;
  float sigmaG = 29.0;
  float sigmaB = 27.0;

  float accumR = 0.0;
  float accumG = 0.0;
  float accumB = 0.0;
  float normR = 0.0;
  float normG = 0.0;
  float normB = 0.0;

  float effCross = cfaCrosstalk * 0.55;

  for (int k = 0; k < 7; k++) {
    float wl = wavelengths[k];
    float energy = spd[k];

    float dR = (wl - spectralPeaks.x) / sigmaR;
    float dG = (wl - spectralPeaks.y) / sigmaG;
    float dB = (wl - spectralPeaks.z) / sigmaB;

    float sR = exp(-0.5 * dR * dR);
    float sG = exp(-0.5 * dG * dG);
    float sB = exp(-0.5 * dB * dB);

    float effR = mix(sR, sG, effCross);
    float effG = mix(sG, (sR + sB) * 0.5, effCross * 0.75);
    float effB = mix(sB, sG, effCross);

    float irCutArg = (wl - irCutNm) * 0.22;
    float irTransmission = 1.0 / (1.0 + exp(irCutArg));
    irTransmission = mix(irTransmission, 1.0 - irRejection, step(irCutNm, wl) * 0.75);

    accumR += energy * effR * irTransmission;
    accumG += energy * effG * irTransmission;
    accumB += energy * effB * irTransmission;

    normR += effR * irTransmission;
    normG += effG * irTransmission;
    normB += effB * irTransmission;
  }

  vec3 sensorSignal = vec3(
    accumR / max(0.001, normR) * spectralWeights.x,
    accumG / max(0.001, normG) * spectralWeights.y,
    accumB / max(0.001, normB) * spectralWeights.z
  );

  // Restore perceptual chroma vibrancy against physical optical crosstalk
  float sLum = dot(sensorSignal, vec3(0.2126, 0.7152, 0.0722));
  sensorSignal = vec3(sLum) + (sensorSignal - vec3(sLum)) * 1.18;

  // Keep true white neutrality balanced while preserving sensor-specific hue shift
  float rawLum = dot(rawInputRgb, vec3(0.2126, 0.7152, 0.0722));
  float outLum = max(0.0001, dot(sensorSignal, vec3(0.2126, 0.7152, 0.0722)));
  sensorSignal *= mix(1.0, rawLum / outLum, 0.45);

  return max(vec3(0.0), sensorSignal);
}

// Top-level spectral color reconstruction pipeline
vec3 performSpectralColorReconstruction(
  vec3 inputRgb,
  vec3 lensTransmissionRgb,
  float lensWarmthShift,
  vec3 sensorSpectralPeaks,
  vec3 sensorSpectralWeights,
  float sensorIrCutNm,
  float sensorIrRejection,
  float cfaCrosstalk
) {
  float spd[7];
  reconstructSpectralRadiance(inputRgb, spd);
  filterLensSpectralTransmission(spd, lensTransmissionRgb, lensWarmthShift);
  return integrateSensorSpectralResponse(
    inputRgb,
    spd,
    sensorSpectralPeaks,
    sensorSpectralWeights,
    sensorIrCutNm,
    sensorIrRejection,
    cfaCrosstalk
  );
}
`;

/**
 * Pure TypeScript implementation for deterministic unit testing of spectral color reconstruction.
 */
export function performSpectralColorReconstructionCpu(
  rgb: [number, number, number],
  lensTransmissionRgb: [number, number, number],
  lensWarmthShift: number,
  sensorSpectralPeaks: [number, number, number],
  sensorSpectralWeights: [number, number, number],
  sensorIrCutNm: number,
  sensorIrRejection: number,
  cfaCrosstalk: number = 0.06
): [number, number, number] {
  const [r, g, b] = [Math.max(0, rgb[0]), Math.max(0, rgb[1]), Math.max(0, rgb[2])];
  const achromaticBase = Math.min(r, Math.min(g, b)) * 0.14;

  const spd = [
    Math.max(0, r * -0.03 + g * 0.04 + b * 0.98 + achromaticBase),
    Math.max(0, r * -0.04 + g * 0.42 + b * 0.62 + achromaticBase),
    Math.max(0, r * -0.02 + g * 0.96 + b * 0.06 + achromaticBase),
    Math.max(0, r * 0.36 + g * 0.66 + b * -0.02 + achromaticBase),
    Math.max(0, r * 0.78 + g * 0.24 + b * -0.03 + achromaticBase),
    Math.max(0, r * 1.0 + g * 0.03 + b * -0.02 + achromaticBase),
    Math.max(0, r * 1.06 + achromaticBase),
  ];

  const t430 = lensTransmissionRgb[2] * (1.0 - lensWarmthShift * 0.28);
  const t480 = lensTransmissionRgb[2] * 0.55 + lensTransmissionRgb[1] * 0.45;
  const t525 = lensTransmissionRgb[1];
  const t560 = lensTransmissionRgb[1] * 0.52 + lensTransmissionRgb[0] * 0.48;
  const t595 =
    (lensTransmissionRgb[1] * 0.22 + lensTransmissionRgb[0] * 0.78) * (1.0 + lensWarmthShift * 0.14);
  const t630 = lensTransmissionRgb[0] * (1.0 + lensWarmthShift * 0.2);
  const t665 = lensTransmissionRgb[0] * (1.0 + lensWarmthShift * 0.22);

  const tLens = [t430, t480, t525, t560, t595, t630, t665];
  for (let i = 0; i < 7; i++) {
    spd[i] *= Math.max(0.01, tLens[i]);
  }

  const wavelengths = [430.0, 480.0, 525.0, 560.0, 595.0, 630.0, 665.0];
  const sigmaR = 33.0;
  const sigmaG = 29.0;
  const sigmaB = 27.0;

  let accumR = 0;
  let accumG = 0;
  let accumB = 0;
  let normR = 0;
  let normG = 0;
  let normB = 0;
  const effCross = cfaCrosstalk * 0.55;

  for (let k = 0; k < 7; k++) {
    const wl = wavelengths[k];
    const energy = spd[k];

    const dR = (wl - sensorSpectralPeaks[0]) / sigmaR;
    const dG = (wl - sensorSpectralPeaks[1]) / sigmaG;
    const dB = (wl - sensorSpectralPeaks[2]) / sigmaB;

    const sR = Math.exp(-0.5 * dR * dR);
    const sG = Math.exp(-0.5 * dG * dG);
    const sB = Math.exp(-0.5 * dB * dB);

    const effR = sR * (1 - effCross) + sG * effCross;
    const effG = sG * (1 - effCross * 0.75) + (sR + sB) * 0.5 * (effCross * 0.75);
    const effB = sB * (1 - effCross) + sG * effCross;

    const irCutArg = (wl - sensorIrCutNm) * 0.22;
    let irTransmission = 1.0 / (1.0 + Math.exp(irCutArg));
    if (wl >= sensorIrCutNm) {
      irTransmission = irTransmission * 0.25 + (1.0 - sensorIrRejection) * 0.75;
    }

    accumR += energy * effR * irTransmission;
    accumG += energy * effG * irTransmission;
    accumB += energy * effB * irTransmission;

    normR += effR * irTransmission;
    normG += effG * irTransmission;
    normB += effB * irTransmission;
  }

  let outR = Math.max(0, (accumR / Math.max(0.001, normR)) * sensorSpectralWeights[0]);
  let outG = Math.max(0, (accumG / Math.max(0.001, normG)) * sensorSpectralWeights[1]);
  let outB = Math.max(0, (accumB / Math.max(0.001, normB)) * sensorSpectralWeights[2]);

  const sLum = 0.2126 * outR + 0.7152 * outG + 0.0722 * outB;
  outR = sLum + (outR - sLum) * 1.18;
  outG = sLum + (outG - sLum) * 1.18;
  outB = sLum + (outB - sLum) * 1.18;

  const rawLum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const outLum = Math.max(0.0001, 0.2126 * outR + 0.7152 * outG + 0.0722 * outB);
  const normScale = 1.0 * 0.55 + (rawLum / outLum) * 0.45;

  return [
    Number(Math.max(0, outR * normScale).toFixed(4)),
    Number(Math.max(0, outG * normScale).toFixed(4)),
    Number(Math.max(0, outB * normScale).toFixed(4)),
  ];
}

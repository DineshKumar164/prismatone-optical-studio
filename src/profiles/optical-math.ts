import { CameraProfile } from './camera-profiles';
import { FilmStockProfile, FILM_STOCK_PROFILES } from './film-profiles';
import { LensProfile } from './lens-profiles';
import { getLensGhostTable } from '../shaders/physically-based-lens-flare.glsl';
import { encodePrintAndHollywoodLutUniform } from './hollywood-luts';

export type AnamorphicDesqueezeMode =
  | 'optical-emulation' // Standard plate + full cylindrical anamorphic projection & oval bokeh
  | 'raw-desqueeze' // Horizontally squeezed anamorphic capture -> desqueezed widescreen projection
  | 'raw-squeezed-sensor'; // View raw un-desqueezed sensor gate (compressed 1/S horizontally)

export interface OpticalSimulationParameters {
  focalLengthMm: number;
  apertureFStop: number;
  focusDistanceM: number;
  distortionK1: number; // -0.6 .. 0.6
  distortionK2: number; // -0.4 .. 0.4
  chromaticAberration: number; // 0 .. 1
  vignettingAmount: number; // 0 .. 1
  vignettingFalloff: number; // 0.5 .. 3.0
  sharpness: number; // 0 .. 1
  cornerSoftness: number; // 0 .. 1
  bokehRadius: number; // 0 .. 1
  bokehSwirl: number; // 0 .. 1
  anamorphicSqueeze: number; // 1.0, 1.33, 1.5, 1.8, 2.0
  desqueezeMode?: AnamorphicDesqueezeMode;
  flareIntensity: number; // 0 .. 1
  flareTint: [number, number, number];
  bloomIntensity: number; // 0 .. 1
  halationIntensity: number; // 0 .. 1
  colorTemperatureShift: number; // -0.5 .. 0.5
  tintShift: number; // -0.5 .. 0.5
  contrast: number; // 0.6 .. 1.6
  saturation: number; // 0.0 .. 1.8
  highlightRolloff: number; // 0 .. 1
  sensorGainIso: number; // 100 .. 12800
  sensorGrainAmount: number; // 0 .. 1
  focusBreathing: number; // 0 .. 0.5
  focusPeaking: boolean;
  // Extended Camera + Lens + Film Interaction Parameters
  printStockId?: number; // 0=Kodak 2383, 1=ARRI REVEAL, 2=Fuji 3513, 3=Bleach Bypass, 4=500T Nocturne
  hollywoodLutId?: number; // 0=Native Pipeline, 1..8=Hollywood Show LUTs
  hollywoodLutBlend?: number; // 0..1 continuous Show LUT blend intensity
  targetAspectRatio?: number; // e.g. 2.39, 2.0, 1.85, 1.777, 1.43, 1.333 (0 = uncropped)
  gateMode?: number; // 0 = Hard Matte Black Crop, 1 = Director Frame Lines Guide
  sensorCropId?: string; // Active sensor crop mode id
  filmStockId?: string; // Active FilmStockProfile id
  exposureCompensationEv?: number; // -3.0 .. +3.0 EV
  shutterAngleDeg?: number; // 45 .. 360 deg (standard 180)
  irisBlades?: number; // 6 .. 18
  bokehRimBrightness?: number; // -0.5 .. 0.8
  onionRingIntensity?: number; // 0 .. 1
  sphericalAberration?: number; // 0 .. 1
  fieldCurvature?: number; // 0 .. 1 (Petzval parabolic focal plane curvature)
  catsEyeFactor?: number; // 0 .. 1 (Mechanical entrance pupil corner shading & cat's-eye bokeh)
  veilingGlare?: number; // 0 .. 1
  gateWeaveAmount?: number; // 0 .. 0.5
  grainSize?: number; // 0.2 .. 1.0
  // Physically Based Flare & Spectral Reconstruction Controls
  spectralReconstructionMode?: boolean; // Physical sensor spectral sensitivity curves vs legacy 3x3 matrix
  lightSourceX?: number; // 0..1 normalized light source X
  lightSourceY?: number; // 0..1 normalized light source Y
  lightSourceIntensity?: number; // 0..5 light source specular intensity
}

export interface AnamorphicDesqueezeProjection {
  nominalSqueeze: number;
  effectiveSqueezeRatio: number;
  desqueezeModeCode: number; // 0 = optical-emulation, 1 = raw-desqueeze, 2 = raw-squeezed-sensor
  sourceAspectRatio: number;
  projectedAspectRatio: number;
  uvGeometryScaleX: number;
  uvGeometryScaleY: number;
  bokehKernelAspectScaleX: number;
  bokehKernelAspectScaleY: number;
  bokehOvalHeightToWidthRatio: number;
}

export interface CameraLensInteractionReport {
  mountStatus: 'Native Mount' | 'Adapter Required (LPL → PL)' | 'Panavision / Custom Mount Adapter';
  activeCropLabel: string;
  effectiveSensorWidthMm: number;
  effectiveSensorHeightMm: number;
  effectiveSensorDiagonalMm: number;
  lensImageCircleMm: number;
  imageCircleCoveragePct: number;
  hasMechanicalImageCircleCutoff: boolean;
  imageCircleCutoffRadiusNorm: number; // Normalized UV radius where hard lens hood/barrel cutoff begins
  sensorFormatScaleFactor: number; // Relative to Super 35 (33.96mm diagonal)
  effectiveSqueezeRatio: number; // Accounts for close-focus anamorphic mumps
  combinedColorMatrix: [
    number, number, number,
    number, number, number,
    number, number, number
  ];
  effectiveReadAndShotNoise: number;
  isUsingDualNativeHighGain: boolean;
}

export interface ComputedOpticalMetrics {
  effectiveFocalLengthMm: number;
  horizontalFovDeg: number;
  verticalFovDeg: number;
  diagonalFovDeg: number;
  desqueezedAspectRatio: number;
  circleOfConfusionMm: number;
  hyperfocalDistanceM: number;
  dofNearM: number;
  dofFarM: number; // Infinity represented as 999
  totalDofM: number;
  cornerDistortionPercent: number;
  cornerIlluminationDropEv: number;
  centerMtf50LpMm: number;
  edgeMtf50LpMm: number;
  estimatedSnrDb: number;
  imageCircleCoveragePct: number;
  mountStatus: string;
  bokehOvalHeightToWidthRatio: number;
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

/**
 * Computes the exact WebGL2 / WebGPU post-processing UV projection and aspect-corrected
 * bokeh kernel scaling for anamorphic desqueeze ratios (1.0x, 1.33x, 1.5x, 1.8x, 2.0x).
 */
export function computeAnamorphicDesqueezeProjection(
  viewportWidth: number,
  viewportHeight: number,
  squeezeRatio: number,
  desqueezeMode: AnamorphicDesqueezeMode = 'optical-emulation',
  focusDistanceM = 2.4,
  anamorphicMumpsFactor = 0.15
): AnamorphicDesqueezeProjection {
  const safeW = Math.max(1, viewportWidth);
  const safeH = Math.max(1, viewportHeight);
  const viewportAspect = safeW / safeH;

  const nominalSqueeze = clamp(squeezeRatio, 1.0, 2.2);
  const focusProximity = clamp(1.0 / Math.max(0.35, focusDistanceM), 0, 2.5);
  const mumpsLoss =
    nominalSqueeze > 1.05 ? clamp(anamorphicMumpsFactor, 0, 0.4) * 0.05 * focusProximity : 0;
  const effectiveSqueezeRatio =
    nominalSqueeze > 1.05 ? Math.max(1.0, nominalSqueeze - mumpsLoss) : 1.0;

  let desqueezeModeCode = 0;
  let uvGeometryScaleX = 1.0;
  let uvGeometryScaleY = 1.0;
  let projectedAspectRatio = viewportAspect;

  if (desqueezeMode === 'raw-desqueeze') {
    desqueezeModeCode = 1;
    projectedAspectRatio = viewportAspect * effectiveSqueezeRatio;
    uvGeometryScaleX = 1.0;
    uvGeometryScaleY = effectiveSqueezeRatio;
  } else if (desqueezeMode === 'raw-squeezed-sensor') {
    desqueezeModeCode = 2;
    projectedAspectRatio = viewportAspect / effectiveSqueezeRatio;
    uvGeometryScaleX = effectiveSqueezeRatio;
    uvGeometryScaleY = 1.0;
  } else {
    desqueezeModeCode = 0;
    projectedAspectRatio = Number((viewportAspect * effectiveSqueezeRatio).toFixed(2));
    uvGeometryScaleX = 1.0;
    uvGeometryScaleY = 1.0;
  }

  const rawSensorExtraSqueeze = desqueezeMode === 'raw-squeezed-sensor' ? Math.sqrt(effectiveSqueezeRatio) : 1.0;
  const verticalElongation = Math.pow(effectiveSqueezeRatio, 0.35);
  const horizontalCompression = Math.pow(effectiveSqueezeRatio, 0.65) * rawSensorExtraSqueeze;

  const bokehKernelAspectScaleX = 1.0 / (viewportAspect * horizontalCompression);
  const bokehKernelAspectScaleY = verticalElongation;
  const bokehOvalHeightToWidthRatio = Number(
    (verticalElongation * horizontalCompression).toFixed(2)
  );

  return {
    nominalSqueeze,
    effectiveSqueezeRatio: Number(effectiveSqueezeRatio.toFixed(3)),
    desqueezeModeCode,
    sourceAspectRatio: Number(viewportAspect.toFixed(3)),
    projectedAspectRatio: Number(projectedAspectRatio.toFixed(2)),
    uvGeometryScaleX: Number(uvGeometryScaleX.toFixed(4)),
    uvGeometryScaleY: Number(uvGeometryScaleY.toFixed(4)),
    bokehKernelAspectScaleX: Number(bokehKernelAspectScaleX.toFixed(4)),
    bokehKernelAspectScaleY: Number(bokehKernelAspectScaleY.toFixed(4)),
    bokehOvalHeightToWidthRatio,
  };
}

/**
 * Resolves the physical interaction between a CameraProfile, LensProfile, FilmStockProfile,
 * and dynamic shooting parameters (Section 8: Camera-Lens Interaction Engine).
 */
export function resolveCameraLensInteraction(
  camera: CameraProfile,
  lens: LensProfile,
  params: OpticalSimulationParameters,
  filmStock?: FilmStockProfile
): CameraLensInteractionReport {
  const cropMode =
    camera.cropModes?.find((c) => c.id === params.sensorCropId) ??
    camera.cropModes?.[0] ?? {
      id: 'open-gate',
      label: 'Open Gate',
      widthMm: camera.sensorWidthMm,
      heightMm: camera.sensorHeightMm,
      cropFactor: 1.0,
    };

  const effWidthMm = cropMode.widthMm;
  const effHeightMm = cropMode.heightMm;
  const effDiagMm = Math.hypot(effWidthMm, effHeightMm);

  const lensIcMm = lens.imageCircleMm || 33.5;
  const coverageRatio = lensIcMm / Math.max(1, effDiagMm);
  const coveragePct = Math.min(150, Math.round(coverageRatio * 100));
  const hasCutoff = coverageRatio < 0.97;
  const imageCircleCutoffRadiusNorm = hasCutoff ? clamp(coverageRatio, 0.52, 1.15) : 1.45;

  let mountStatus: CameraLensInteractionReport['mountStatus'] = 'Native Mount';
  if (camera.lensMountNative !== lens.mountType) {
    if (camera.lensMountNative === 'LPL' && lens.mountType === 'PL') {
      mountStatus = 'Adapter Required (LPL → PL)';
    } else {
      mountStatus = 'Panavision / Custom Mount Adapter';
    }
  }

  const sensorFormatScaleFactor = clamp(effDiagMm / 33.96, 0.55, 1.68);

  const focusProximity = clamp(1.0 / Math.max(0.35, params.focusDistanceM), 0, 2.5);
  const mumpsLoss = (lens.anamorphicMumpsFactor ?? 0) * 0.05 * focusProximity;
  const effectiveSqueezeRatio =
    params.anamorphicSqueeze > 1.05
      ? Math.max(1.0, params.anamorphicSqueeze - mumpsLoss)
      : 1.0;

  const specR = (camera.spectralWeights?.[0] ?? 1.0) * (lens.spectralTransmissionRgb?.[0] ?? 1.0);
  const specG = (camera.spectralWeights?.[1] ?? 1.0) * (lens.spectralTransmissionRgb?.[1] ?? 1.0);
  const specB = (camera.spectralWeights?.[2] ?? 1.0) * (lens.spectralTransmissionRgb?.[2] ?? 1.0);

  const m = camera.colorMatrix;
  const combinedColorMatrix: CameraLensInteractionReport['combinedColorMatrix'] = [
    Number((m[0] * specR).toFixed(4)),
    Number((m[1] * specG).toFixed(4)),
    Number((m[2] * specB).toFixed(4)),
    Number((m[3] * specR).toFixed(4)),
    Number((m[4] * specG).toFixed(4)),
    Number((m[5] * specB).toFixed(4)),
    Number((m[6] * specR).toFixed(4)),
    Number((m[7] * specG).toFixed(4)),
    Number((m[8] * specB).toFixed(4)),
  ];

  const isUsingDualNativeHighGain =
    camera.dualNativeIso !== null && params.sensorGainIso >= camera.dualNativeIso * 0.85;
  const referenceBaseIso = isUsingDualNativeHighGain
    ? camera.dualNativeIso!
    : Math.max(100, camera.baseIso);
  const isoGainRatio = Math.max(0.25, params.sensorGainIso / referenceBaseIso);
  const filmGrainBase = filmStock ? filmStock.grainAmount : params.sensorGrainAmount;
  const effectiveReadAndShotNoise = clamp(
    filmGrainBase * 0.75 +
      (camera.readNoiseElectrons ?? 1.2) * 0.045 * Math.sqrt(isoGainRatio),
    0.0,
    1.0
  );

  return {
    mountStatus,
    activeCropLabel: cropMode.label,
    effectiveSensorWidthMm: Number(effWidthMm.toFixed(2)),
    effectiveSensorHeightMm: Number(effHeightMm.toFixed(2)),
    effectiveSensorDiagonalMm: Number(effDiagMm.toFixed(2)),
    lensImageCircleMm: lensIcMm,
    imageCircleCoveragePct: coveragePct,
    hasMechanicalImageCircleCutoff: hasCutoff,
    imageCircleCutoffRadiusNorm: Number(imageCircleCutoffRadiusNorm.toFixed(3)),
    sensorFormatScaleFactor: Number(sensorFormatScaleFactor.toFixed(3)),
    effectiveSqueezeRatio: Number(effectiveSqueezeRatio.toFixed(3)),
    combinedColorMatrix,
    effectiveReadAndShotNoise: Number(effectiveReadAndShotNoise.toFixed(3)),
    isUsingDualNativeHighGain,
  };
}

/**
 * Derives baseline OpticalSimulationParameters from a selected CameraProfile + LensProfile + FilmStockProfile,
 * with optional user parameter overrides.
 */
export function buildOpticalParametersFromRig(
  camera: CameraProfile,
  lens: LensProfile,
  overrides?: Partial<OpticalSimulationParameters>,
  filmStock: FilmStockProfile = FILM_STOCK_PROFILES[0]
): OpticalSimulationParameters {
  const aperture = overrides?.apertureFStop ?? lens.maxApertureTStop;
  const apertureFactor = clamp(2.8 / Math.max(1.0, aperture), 0.15, 1.5);

  const base: OpticalSimulationParameters = {
    focalLengthMm: lens.focalLengthMm,
    apertureFStop: lens.maxApertureTStop,
    focusDistanceM: 2.4,
    distortionK1: lens.distortionK1,
    distortionK2: lens.distortionK2,
    chromaticAberration: lens.chromaticAberration,
    vignettingAmount: lens.vignettingAmount,
    vignettingFalloff: lens.vignettingFalloff,
    sharpness: lens.centerSharpness,
    cornerSoftness: lens.cornerSoftness,
    bokehRadius: Number(clamp(0.45 * apertureFactor, 0.05, 1.0).toFixed(2)),
    bokehSwirl: lens.bokehSwirl,
    anamorphicSqueeze: lens.anamorphicSqueeze,
    desqueezeMode: 'optical-emulation',
    flareIntensity: lens.flareIntensity,
    flareTint: [...lens.flareTint],
    bloomIntensity: Number(clamp((1 - lens.centerSharpness) * 0.65 + 0.15, 0.05, 1.0).toFixed(2)),
    halationIntensity:
      filmStock.stockType === 'Digital Sensor Native'
        ? camera.defaultHalationBase
        : Number((filmStock.halationIntensity * 0.72 + camera.defaultHalationBase * 0.28).toFixed(2)),
    colorTemperatureShift: lens.colorWarmthShift,
    tintShift: 0.0,
    contrast: Number((camera.defaultContrast * filmStock.contrastGamma).toFixed(2)),
    saturation: Number((camera.defaultSaturation * filmStock.saturationResponse).toFixed(2)),
    highlightRolloff: camera.defaultHighlightRolloff,
    sensorGainIso: camera.baseIso,
    sensorGrainAmount:
      filmStock.stockType === 'Digital Sensor Native'
        ? camera.defaultGrainAmount
        : Number((filmStock.grainAmount * 0.72 + camera.defaultGrainAmount * 0.28).toFixed(2)),
    focusBreathing: lens.focusBreathingFactor,
    focusPeaking: false,
    sensorCropId: camera.cropModes?.[0]?.id ?? 'open-gate',
    filmStockId: filmStock.id,
    exposureCompensationEv: 0.0,
    shutterAngleDeg: camera.defaultShutterAngleDeg ?? 180,
    irisBlades: lens.irisBlades ?? 11,
    bokehRimBrightness: lens.bokehRimBrightness ?? 0.15,
    onionRingIntensity: lens.onionRingIntensity ?? 0.08,
    sphericalAberration: lens.sphericalAberration ?? 0.2,
    fieldCurvature: lens.fieldCurvature ?? 0.22,
    catsEyeFactor: lens.catsEyeFactor ?? 0.35,
    veilingGlare: lens.veilingGlare ?? 0.1,
    gateWeaveAmount: filmStock.defaultGateWeave ?? 0.08,
    grainSize: filmStock.grainSize ?? 0.55,
    spectralReconstructionMode: true,
    lightSourceX: 0.72,
    lightSourceY: 0.28,
    lightSourceIntensity: 1.25,
  };

  return {
    ...base,
    ...overrides,
  };
}

/**
 * Computes physical optical bench telemetry from the active camera sensor, lens, and parameters.
 */
export function computeOpticalMetrics(
  camera: CameraProfile,
  lens: LensProfile,
  params: OpticalSimulationParameters
): ComputedOpticalMetrics {
  const interaction = resolveCameraLensInteraction(camera, lens, params);
  const desqueezeProj = computeAnamorphicDesqueezeProjection(
    1920,
    1080,
    params.anamorphicSqueeze,
    params.desqueezeMode ?? 'optical-emulation',
    params.focusDistanceM,
    lens.anamorphicMumpsFactor
  );

  const focusProximity = clamp(1.0 / Math.max(0.3, params.focusDistanceM), 0, 3.0);
  const breathingShift = 1.0 - params.focusBreathing * 0.08 * focusProximity;
  const effectiveFocalMm = Math.max(8, params.focalLengthMm * breathingShift);

  const effectiveSensorWidth = interaction.effectiveSensorWidthMm * interaction.effectiveSqueezeRatio;
  const effectiveSensorHeight = interaction.effectiveSensorHeightMm;
  const sensorDiag = Math.hypot(effectiveSensorWidth, effectiveSensorHeight);

  const radToDeg = 180 / Math.PI;
  const hFov = 2 * Math.atan(effectiveSensorWidth / (2 * effectiveFocalMm)) * radToDeg;
  const vFov = 2 * Math.atan(effectiveSensorHeight / (2 * effectiveFocalMm)) * radToDeg;
  const dFov = 2 * Math.atan(sensorDiag / (2 * effectiveFocalMm)) * radToDeg;

  const rawDiagonal = interaction.effectiveSensorDiagonalMm;
  const cocMm = rawDiagonal / 1500;

  const fStop = Math.max(0.95, params.apertureFStop);
  const hyperfocalMm = (effectiveFocalMm * effectiveFocalMm) / (fStop * cocMm) + effectiveFocalMm;
  const hyperfocalM = hyperfocalMm / 1000;

  const sM = Math.max(0.2, params.focusDistanceM);
  const fM = effectiveFocalMm / 1000;
  const nearM = (hyperfocalM * sM) / (hyperfocalM + (sM - fM));
  const farM = sM >= hyperfocalM ? 999 : (hyperfocalM * sM) / Math.max(0.001, hyperfocalM - (sM - fM));
  const totalDofM = farM >= 999 ? 999 : Math.max(0, farM - nearM);

  const formatScale = interaction.sensorFormatScaleFactor;
  const cornerDistortionPct =
    (params.distortionK1 * formatScale + params.distortionK2 * formatScale * formatScale) * 100;

  const maxTStop = lens.maxApertureTStop || 2.0;
  const irisClearance = clamp(1.0 - Math.max(0, fStop - maxTStop) * 0.12, 0.35, 1.0);
  const halfDiagAngleRad = Math.atan(rawDiagonal / (2 * Math.max(12, effectiveFocalMm)));
  const naturalCos4Loss = 1.0 - Math.pow(Math.cos(halfDiagAngleRad * 0.55), 4);
  const effectiveVig = clamp(
    params.vignettingAmount * formatScale * irisClearance + naturalCos4Loss * 0.45,
    0.02,
    0.95
  );
  const cornerTransmission = clamp(
    1.0 - effectiveVig * Math.pow(0.88, 1.5 / Math.max(0.5, params.vignettingFalloff)),
    0.06,
    1.0
  );
  const cornerDropEv = Math.abs(Math.log2(cornerTransmission));

  const diffractionPenalty = fStop > 8 ? (fStop - 8) * 2.4 : 0;
  const wideOpenPenalty =
    fStop < lens.maxApertureTStop + 0.8 ? (params.sphericalAberration ?? 0.2) * 12 : 0;
  const olpfPenalty = (camera.olpfStrength ?? 0.65) * 6;
  const fieldCurvPenalty = (params.fieldCurvature ?? lens.fieldCurvature ?? 0.22) * 10;
  const centerMtf50 = clamp(
    48 + params.sharpness * 65 - diffractionPenalty - wideOpenPenalty - olpfPenalty,
    18,
    120
  );
  const edgeMtf50 = clamp(
    centerMtf50 *
      (1.0 -
        params.cornerSoftness * 0.52 * formatScale -
        Math.abs(params.chromaticAberration) * 0.16) -
      fieldCurvPenalty,
    10,
    centerMtf50
  );

  const refIso = interaction.isUsingDualNativeHighGain
    ? camera.dualNativeIso!
    : Math.max(100, camera.baseIso);
  const isoRatio = Math.max(0.25, params.sensorGainIso / refIso);
  const isoNoisePenaltyDb = Math.log2(isoRatio) * 3.0 + params.sensorGrainAmount * 6.5;
  const snrDb = clamp(camera.dynamicRangeStops * 3.1 - isoNoisePenaltyDb, 18, 62);

  return {
    effectiveFocalLengthMm: Number(effectiveFocalMm.toFixed(2)),
    horizontalFovDeg: Number(hFov.toFixed(1)),
    verticalFovDeg: Number(vFov.toFixed(1)),
    diagonalFovDeg: Number(dFov.toFixed(1)),
    desqueezedAspectRatio: Number(
      ((interaction.effectiveSensorWidthMm / interaction.effectiveSensorHeightMm) *
        interaction.effectiveSqueezeRatio).toFixed(2)
    ),
    circleOfConfusionMm: Number(cocMm.toFixed(4)),
    hyperfocalDistanceM: Number(hyperfocalM.toFixed(2)),
    dofNearM: Number(nearM.toFixed(2)),
    dofFarM: Number(Math.min(999, farM).toFixed(2)),
    totalDofM: Number(Math.min(999, totalDofM).toFixed(2)),
    cornerDistortionPercent: Number(cornerDistortionPct.toFixed(1)),
    cornerIlluminationDropEv: Number(cornerDropEv.toFixed(2)),
    centerMtf50LpMm: Math.round(centerMtf50),
    edgeMtf50LpMm: Math.round(edgeMtf50),
    estimatedSnrDb: Number(snrDb.toFixed(1)),
    imageCircleCoveragePct: interaction.imageCircleCoveragePct,
    mountStatus: interaction.mountStatus,
    bokehOvalHeightToWidthRatio: desqueezeProj.bokehOvalHeightToWidthRatio,
  };
}

/**
 * Packs optical simulation parameters, anamorphic desqueeze projection, camera-lens interaction,
 * sensor spectral sensitivity curves, and physically-based lens ghosting table into a 128-float (512-byte) Float32Array.
 */
export function packOpticalUniformBuffer(
  camera: CameraProfile,
  params: OpticalSimulationParameters,
  width: number,
  height: number,
  timeSec: number,
  splitWipeX: number, // 0..1 (0 = full simulated, 0.5 = 50% wipe, 1 = full original)
  splitEnabled: boolean,
  qualityMode: 'preview' | 'final',
  lens?: LensProfile,
  filmStock?: FilmStockProfile
): Float32Array {
  const buf = new Float32Array(128);
  const activeFilm =
    filmStock ??
    FILM_STOCK_PROFILES.find((f) => f.id === params.filmStockId) ??
    FILM_STOCK_PROFILES[0];

  const interaction = lens
    ? resolveCameraLensInteraction(camera, lens, params, activeFilm)
    : null;
  const formatScale = interaction ? interaction.sensorFormatScaleFactor : 1.0;
  const matrix = interaction ? interaction.combinedColorMatrix : camera.colorMatrix;

  const desqueezeProj = computeAnamorphicDesqueezeProjection(
    width,
    height,
    params.anamorphicSqueeze,
    params.desqueezeMode ?? 'optical-emulation',
    params.focusDistanceM,
    lens?.anamorphicMumpsFactor ?? 0.15
  );

  // Compute physical iris stop-down clearance and cos^4(theta) wide-angle illumination drop
  const maxTStop = lens?.maxApertureTStop ?? 2.0;
  const fStop = Math.max(0.95, params.apertureFStop);
  const irisClearance = clamp(1.0 - Math.max(0, fStop - maxTStop) * 0.12, 0.35, 1.0);
  const effDiagMm = interaction ? interaction.effectiveSensorDiagonalMm : 33.96;
  const halfAngleRad = Math.atan(effDiagMm / (2.0 * Math.max(12.0, params.focalLengthMm)));
  const naturalCos4Drop = 1.0 - Math.pow(Math.cos(halfAngleRad * 0.52), 4.0);
  const effectiveVignetteAmount = clamp(
    params.vignettingAmount * formatScale * irisClearance + naturalCos4Drop * 0.42,
    0.0,
    1.0
  );

  // Sensor framing scale relative to Super 35 (larger sensors capture wider field & stronger lens periphery)
  const sensorFramingScale = clamp(Math.pow(33.96 / Math.max(12.0, effDiagMm), 0.32), 0.76, 1.32);

  // vec4[0]: resolution.x, resolution.y, timeSec, splitWipeX (negative if disabled)
  buf[0] = Math.max(1, width);
  buf[1] = Math.max(1, height);
  buf[2] = timeSec;
  buf[3] = splitEnabled ? clamp(splitWipeX, 0.0, 1.0) : -1.0;

  // vec4[1]: distortionK1 (format-scaled), distortionK2, chromaticAberration, effectiveSqueezeRatio
  buf[4] = params.distortionK1 * formatScale;
  buf[5] = params.distortionK2 * formatScale * formatScale;
  buf[6] = params.chromaticAberration * Math.sqrt(formatScale);
  buf[7] = desqueezeProj.effectiveSqueezeRatio;

  // vec4[2]: vignettingAmount (iris + cos^4 aware), vignettingFalloff, sharpness, cornerSoftness
  buf[8] = effectiveVignetteAmount;
  buf[9] = params.vignettingFalloff;
  buf[10] = params.sharpness;
  buf[11] = clamp(params.cornerSoftness * formatScale, 0.0, 1.0);

  // vec4[3]: bokehRadius, bokehSwirl, focusDistanceM, apertureFStop
  buf[12] = params.bokehRadius;
  buf[13] = params.bokehSwirl;
  buf[14] = params.focusDistanceM;
  buf[15] = params.apertureFStop;

  // vec4[4]: flareIntensity, bloomIntensity, halationIntensity, focusBreathing
  buf[16] = params.flareIntensity;
  buf[17] = params.bloomIntensity;
  buf[18] = params.halationIntensity;
  buf[19] = params.focusBreathing;

  // vec4[5]: flareTint.rgb, focusPeaking + cameraCurveId * 2.0
  const cameraCurveId = Math.round(clamp(camera.cameraCurveId ?? 0, 0, 6));
  buf[20] = params.flareTint[0];
  buf[21] = params.flareTint[1];
  buf[22] = params.flareTint[2];
  buf[23] = (params.focusPeaking ? 1.0 : 0.0) + cameraCurveId * 2.0;

  // vec4[6]: colorTemperatureShift, tintShift, contrast, saturation
  buf[24] = params.colorTemperatureShift;
  buf[25] = params.tintShift;
  buf[26] = params.contrast;
  buf[27] = params.saturation;

  // vec4[7]: highlightRolloff, sensorGainIso, sensorGrainAmount, qualityMode + desqueezeMode encoded
  const qualityBit = qualityMode === 'final' ? 1.0 : 0.0;
  buf[28] = params.highlightRolloff;
  buf[29] = params.sensorGainIso;
  buf[30] = params.sensorGrainAmount;
  buf[31] = qualityBit + desqueezeProj.desqueezeModeCode * 2.0;

  // vec4[8..10]: Combined Camera+Lens 3x3 Color Matrix padded with encoded printStockId+hollywoodLut, targetAspectRatio, signed sensorFramingScale
  buf[32] = matrix[0];
  buf[33] = matrix[1];
  buf[34] = matrix[2];
  buf[35] = encodePrintAndHollywoodLutUniform(
    params.printStockId ?? 0,
    params.hollywoodLutId ?? 0,
    params.hollywoodLutBlend ?? ((params.hollywoodLutId ?? 0) > 0 ? 0.85 : 0.0)
  );

  buf[36] = matrix[3];
  buf[37] = matrix[4];
  buf[38] = matrix[5];
  buf[39] = params.targetAspectRatio ?? 0.0;

  buf[40] = matrix[6];
  buf[41] = matrix[7];
  buf[42] = matrix[8];
  const isGuideMode = (params.gateMode ?? 0) >= 0.5;
  buf[43] = isGuideMode ? -sensorFramingScale : sensorFramingScale;

  // vec4[11]: camera + film shadow tint + effective baseIso (integer) + fixedPatternNoise (fractional)
  const effectiveBaseIso =
    interaction && interaction.isUsingDualNativeHighGain
      ? camera.dualNativeIso!
      : camera.baseIso;
  const fpnEncoded = clamp((camera.fixedPatternNoise ?? 0.01) * 10.0, 0.01, 0.95);
  buf[44] = camera.defaultShadowTint[0] + activeFilm.shadowDensityTint[0];
  buf[45] = camera.defaultShadowTint[1] + activeFilm.shadowDensityTint[1];
  buf[46] = camera.defaultShadowTint[2] + activeFilm.shadowDensityTint[2];
  buf[47] = Math.round(effectiveBaseIso) + fpnEncoded;

  // vec4[12]: imageCircleCutoffRadiusNorm, irisBlades (int) + catsEyeFactor (fract), bokehRimBrightness, onionRingIntensity
  const irisBladesInt = Math.round(clamp(params.irisBlades ?? lens?.irisBlades ?? 11, 5, 18));
  const catsEyeFrac = clamp(params.catsEyeFactor ?? lens?.catsEyeFactor ?? 0.35, 0.01, 0.95);
  buf[48] = interaction ? interaction.imageCircleCutoffRadiusNorm : 1.45;
  buf[49] = irisBladesInt + catsEyeFrac;
  buf[50] = params.bokehRimBrightness ?? lens?.bokehRimBrightness ?? 0.15;
  buf[51] = params.onionRingIntensity ?? lens?.onionRingIntensity ?? 0.08;

  // vec4[13]: sphericalAberration, veilingGlare, exposureCompensationEv, gateWeaveAmount
  buf[52] = params.sphericalAberration ?? lens?.sphericalAberration ?? 0.18;
  buf[53] = params.veilingGlare ?? lens?.veilingGlare ?? 0.08;
  buf[54] = params.exposureCompensationEv ?? 0.0;
  buf[55] = params.gateWeaveAmount ?? activeFilm.defaultGateWeave ?? 0.08;

  // vec4[14]: filmToeStrength, filmShoulderCompression, grainSize, ghostCount (int) + fieldCurvature (fract)
  const ghostCountInt = Math.round(clamp(lens?.ghostCount ?? 6, 2, 12));
  const fieldCurvFrac = clamp((params.fieldCurvature ?? lens?.fieldCurvature ?? 0.22) * formatScale, 0.01, 0.95);
  buf[56] = activeFilm.toeStrength;
  buf[57] = activeFilm.shoulderCompression;
  buf[58] = params.grainSize ?? activeFilm.grainSize ?? 0.55;
  buf[59] = ghostCountInt + fieldCurvFrac;

  // vec4[15]: filmHighlightTint.rgb, olpfStrength (int * 0.01) + chromaNoiseRatio (fract)
  const olpfInt = Math.round(clamp(camera.olpfStrength ?? 0.65, 0.05, 0.95) * 100.0);
  const chromaFrac = clamp(camera.chromaNoiseRatio ?? 0.15, 0.05, 0.45);
  buf[60] = activeFilm.highlightPrintTint[0];
  buf[61] = activeFilm.highlightPrintTint[1];
  buf[62] = activeFilm.highlightPrintTint[2];
  buf[63] = olpfInt + chromaFrac;

  // vec4[16]: sensorSpectralPeaks.xyz (nm), sensorIrCutNm
  buf[64] = camera.spectralPeakNm[0];
  buf[65] = camera.spectralPeakNm[1];
  buf[66] = camera.spectralPeakNm[2];
  buf[67] = camera.irCutNm;

  // vec4[17]: sensorSpectralWeights.xyz (QE), sensorIrRejection
  buf[68] = camera.spectralWeights[0];
  buf[69] = camera.spectralWeights[1];
  buf[70] = camera.spectralWeights[2];
  buf[71] = camera.irRejectionFactor;

  // vec4[18]: lensSpectralTransmissionRgb.xyz, focalLengthMm (int) + lensWarmthShift (fract - 0.5)
  const warmthOffset = clamp(lens?.colorWarmthShift ?? 0.0, -0.49, 0.49) + 0.5;
  buf[72] = lens?.spectralTransmissionRgb?.[0] ?? 1.0;
  buf[73] = lens?.spectralTransmissionRgb?.[1] ?? 1.0;
  buf[74] = lens?.spectralTransmissionRgb?.[2] ?? 1.0;
  buf[75] = Math.round(params.focalLengthMm) + warmthOffset;

  // vec4[19]: cfaCrosstalk, lightSourceX, lightSourceY, signed lightSourceIntensity (sign encodes spectralReconstructionMode)
  const isSpectralMode = params.spectralReconstructionMode !== false;
  const lightIntensity = params.lightSourceIntensity ?? 1.25;
  buf[76] = camera.cfaCrosstalk ?? 0.05;
  buf[77] = params.lightSourceX ?? 0.72;
  buf[78] = params.lightSourceY ?? 0.28;
  buf[79] = isSpectralMode ? lightIntensity : -lightIntensity;

  // vec4[20..25]: 6 Lens Ghost Elements Geometry: axisPosition, defocusRadius, angularExpansion, reflectance
  // vec4[26..31]: 6 Lens Ghost Elements Optics: coatingTint.rgb, apertureShapeMode + cutoffAngleDeg * 10.0
  const ghostTable = getLensGhostTable(lens?.id ?? '');
  for (let i = 0; i < 6; i++) {
    const g = ghostTable.elements[i];
    if (g) {
      buf[80 + i * 4 + 0] = g.axisPosition;
      buf[80 + i * 4 + 1] = g.defocusRadius;
      buf[80 + i * 4 + 2] = g.angularExpansion;
      buf[80 + i * 4 + 3] = g.reflectance;

      buf[104 + i * 4 + 0] = g.coatingTint[0];
      buf[104 + i * 4 + 1] = g.coatingTint[1];
      buf[104 + i * 4 + 2] = g.coatingTint[2];
      buf[104 + i * 4 + 3] = g.apertureShapeMode + g.cutoffAngleDeg * 10.0;
    } else {
      buf[80 + i * 4 + 3] = 0.0; // reflectance 0 indicates inactive element
    }
  }

  return buf;
}



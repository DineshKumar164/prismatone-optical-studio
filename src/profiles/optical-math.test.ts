import test from 'node:test';
import assert from 'node:assert/strict';
import { getCameraProfileById } from './camera-profiles';
import { getFilmStockById } from './film-profiles';
import { getLensProfileById } from './lens-profiles';
import {
  buildOpticalParametersFromRig,
  computeAnamorphicDesqueezeProjection,
  computeOpticalMetrics,
  packOpticalUniformBuffer,
  resolveCameraLensInteraction,
} from './optical-math';
import { performSpectralColorReconstructionCpu } from '../shaders/spectral-color-reconstruction.glsl';
import {
  classifyLensGlareOptics,
  evaluatePhysicallyBasedFlareCpu,
  evaluatePointSpecularEmitterCpu,
  getLensGhostTable,
} from '../shaders/physically-based-lens-flare.glsl';
import {
  FLARE_QUAD_VERTEX_SHADER,
  FLARE_BRIGHT_EXTRACT_FRAGMENT_SHADER,
  FLARE_KAWASE_STREAK_FRAGMENT_SHADER,
  FLARE_ASSEMBLE_FRAGMENT_SHADER,
  computeBeerLambertStreakAttenuation,
} from '../shaders/optical-flare-multipass.glsl';

test('buildOpticalParametersFromRig merges camera, lens, and film stock defaults accurately', () => {
  const camera = getCameraProfileById('arri-alexa-35');
  const lens = getLensProfileById('cooke-anamorphic-i-sf-50');
  const film = getFilmStockById('kodak-vision3-500t-5219');
  const params = buildOpticalParametersFromRig(camera, lens, undefined, film);

  assert.equal(params.focalLengthMm, 50);
  assert.equal(params.anamorphicSqueeze, 2.0);
  assert.equal(params.distortionK1, -0.18);
  assert.equal(params.fieldCurvature, lens.fieldCurvature);
  assert.equal(params.catsEyeFactor, lens.catsEyeFactor);
  assert.equal(params.sensorGainIso, 800);
  assert.equal(params.highlightRolloff, camera.defaultHighlightRolloff);
  assert.equal(params.filmStockId, 'kodak-vision3-500t-5219');
  const expectedHalation = Number(
    (film.halationIntensity * 0.72 + camera.defaultHalationBase * 0.28).toFixed(2)
  );
  assert.equal(params.halationIntensity, expectedHalation);
});

test('computeOpticalMetrics calculates wider horizontal FOV for 2x anamorphic squeeze', () => {
  const camera = getCameraProfileById('arri-alexa-35');
  const sphericalLens = getLensProfileById('zeiss-supreme-prime-35');
  const anamorphicLens = getLensProfileById('cooke-anamorphic-i-sf-50');

  const paramsSpherical = buildOpticalParametersFromRig(camera, sphericalLens, {
    focalLengthMm: 50,
    anamorphicSqueeze: 1.0,
    focusBreathing: 0.04,
  });
  const paramsAnamorphic = buildOpticalParametersFromRig(camera, anamorphicLens, {
    focalLengthMm: 50,
    anamorphicSqueeze: 2.0,
    focusBreathing: 0.04,
  });

  const mSpherical = computeOpticalMetrics(camera, sphericalLens, paramsSpherical);
  const mAnamorphic = computeOpticalMetrics(camera, anamorphicLens, paramsAnamorphic);

  assert.ok(
    mAnamorphic.horizontalFovDeg > mSpherical.horizontalFovDeg,
    '2x Anamorphic horizontal FOV should exceed 1x spherical at equal focal length'
  );
  assert.equal(mAnamorphic.verticalFovDeg, mSpherical.verticalFovDeg);
});

test('computeAnamorphicDesqueezeProjection accurately projects 1.0x, 1.33x, 1.5x, and 2.0x desqueeze geometry and oval bokeh', () => {
  const p10 = computeAnamorphicDesqueezeProjection(1920, 1080, 1.0, 'optical-emulation', 5.0, 0.0);
  const p133 = computeAnamorphicDesqueezeProjection(1920, 1080, 1.33, 'raw-desqueeze', 5.0, 0.0);
  const p150 = computeAnamorphicDesqueezeProjection(1920, 1080, 1.5, 'raw-desqueeze', 5.0, 0.0);
  const p200 = computeAnamorphicDesqueezeProjection(1920, 1080, 2.0, 'raw-desqueeze', 5.0, 0.0);

  // Spherical 1.0x produces 1:1 circular bokeh
  assert.equal(p10.bokehOvalHeightToWidthRatio, 1.0);
  // 1.33x, 1.5x, and 2.0x produce progressively taller vertical oval bokeh
  assert.ok(p133.bokehOvalHeightToWidthRatio > 1.3);
  assert.ok(p150.bokehOvalHeightToWidthRatio > p133.bokehOvalHeightToWidthRatio);
  assert.ok(p200.bokehOvalHeightToWidthRatio > p150.bokehOvalHeightToWidthRatio);

  // Raw desqueeze mode scales vertical UV geometry to fit the wider desqueezed aspect ratio
  assert.equal(p133.desqueezeModeCode, 1);
  assert.equal(p133.uvGeometryScaleY, 1.33);
  assert.equal(p150.uvGeometryScaleY, 1.5);
  assert.equal(p200.uvGeometryScaleY, 2.0);
});

test('resolveCameraLensInteraction detects image circle cutoff when S35 lens is mounted on VistaVision Open Gate vs S35 crop', () => {
  const vvCamera = getCameraProfileById('red-v-raptor-vv');
  const s35Lens = getLensProfileById('panavision-c-series-40'); // 30.5mm image circle

  const openGateParams = buildOpticalParametersFromRig(vvCamera, s35Lens, {
    sensorCropId: 'open-gate',
  });
  const s35CropParams = buildOpticalParametersFromRig(vvCamera, s35Lens, {
    sensorCropId: '4k-s16',
  });

  const openGateReport = resolveCameraLensInteraction(vvCamera, s35Lens, openGateParams);
  const croppedReport = resolveCameraLensInteraction(vvCamera, s35Lens, s35CropParams);

  assert.equal(openGateReport.hasMechanicalImageCircleCutoff, true);
  assert.ok(openGateReport.imageCircleCoveragePct < 100);
  assert.equal(croppedReport.hasMechanicalImageCircleCutoff, false);
  assert.ok(croppedReport.imageCircleCoveragePct >= 100);
});

test('computeOpticalMetrics reflects corner softness, field curvature, and iris-dependent vignetting drop', () => {
  const camera = getCameraProfileById('sony-venice-2-8k');
  const lens = getLensProfileById('canon-k35-vintage-24');
  const wideOpenParams = buildOpticalParametersFromRig(camera, lens, {
    apertureFStop: 2.0,
    sharpness: 0.9,
    cornerSoftness: 0.8,
    fieldCurvature: 0.72,
    sensorGainIso: 6400,
    sensorGrainAmount: 0.7,
  });
  const stoppedDownParams = buildOpticalParametersFromRig(camera, lens, {
    apertureFStop: 8.0,
    sharpness: 0.9,
    cornerSoftness: 0.1,
    fieldCurvature: 0.1,
    sensorGainIso: 800,
    sensorGrainAmount: 0.1,
  });

  const mWide = computeOpticalMetrics(camera, lens, wideOpenParams);
  const mStopped = computeOpticalMetrics(camera, lens, stoppedDownParams);

  assert.ok(mStopped.edgeMtf50LpMm > mWide.edgeMtf50LpMm);
  assert.ok(mStopped.estimatedSnrDb > mWide.estimatedSnrDb);
  assert.ok(
    mWide.cornerIlluminationDropEv > mStopped.cornerIlluminationDropEv,
    'Stopping down the iris should reduce mechanical corner vignetting drop'
  );
});

test('packOpticalUniformBuffer encodes cameraCurveId, fieldCurvature, catsEyeFactor, olpfStrength, and desqueeze data', () => {
  const camera = getCameraProfileById('red-v-raptor-vv'); // cameraCurveId = 2
  const lens = getLensProfileById('panavision-c-series-40');
  const film = getFilmStockById('kodak-ektachrome-100d-7294');
  const params = buildOpticalParametersFromRig(
    camera,
    lens,
    {
      focusPeaking: true,
      exposureCompensationEv: 0.5,
      anamorphicSqueeze: 1.5,
      desqueezeMode: 'raw-desqueeze',
    },
    film
  );

  const buf = packOpticalUniformBuffer(
    camera,
    params,
    1920,
    1080,
    1.5,
    0.5,
    true,
    'final',
    lens,
    film
  );
  assert.equal(buf.length, 128);
  assert.equal(buf.byteLength, 512);
  assert.equal(buf[0], 1920);
  assert.equal(buf[1], 1080);
  assert.equal(buf[3], 0.5); // splitWipeX
  assert.equal(buf[23], 1.0 + camera.cameraCurveId * 2.0); // focusPeaking (1) + cameraCurveId (2 * 2 = 4) = 5.0
  assert.equal(buf[31], 3.0); // final quality (1) + desqueezeModeCode (1 * 2 = 2) = 3.0
  assert.equal(Math.floor(buf[49] + 0.0001), lens.irisBlades); // integer part = irisBlades
  assert.ok(Math.abs((buf[49] % 1) - lens.catsEyeFactor) < 0.01); // fractional part = catsEyeFactor
  assert.equal(buf[54], 0.5); // exposureCompensationEv in u_data[13].z
  assert.ok(Math.abs(buf[56] - film.toeStrength) < 0.001); // filmToeStrength in u_data[14].x
  assert.equal(Math.floor(buf[59] + 0.0001), lens.ghostCount); // integer part = ghostCount
  assert.ok((buf[59] % 1) > 0.1); // fractional part = format-scaled fieldCurvature

  // Spectral Sensor Uniforms: u_data[16..19]
  assert.equal(buf[64], camera.spectralPeakNm[0]); // R peak nm
  assert.equal(buf[65], camera.spectralPeakNm[1]); // G peak nm
  assert.equal(buf[66], camera.spectralPeakNm[2]); // B peak nm
  assert.equal(buf[67], camera.irCutNm);
  assert.ok(Math.abs(buf[68] - camera.spectralWeights[0]) < 0.001); // R QE weight
  assert.ok(Math.abs(buf[76] - camera.cfaCrosstalk) < 0.001); // CFA crosstalk
  assert.ok(Math.abs(buf[77] - 0.72) < 0.001); // lightSourceX
  assert.ok(Math.abs(buf[78] - 0.28) < 0.001); // lightSourceY
  assert.ok(buf[79] > 0); // signed lightSourceIntensity > 0 indicates spectralReconstructionMode active

  // Lens Ghosting LUT: u_data[20..31]
  const ghostTable = getLensGhostTable(lens.id);
  assert.ok(Math.abs(buf[80] - ghostTable.elements[0].axisPosition) < 0.001); // Element 0 axis position
  assert.ok(Math.abs(buf[83] - ghostTable.elements[0].reflectance) < 0.001); // Element 0 Fresnel reflectance
  assert.ok(Math.abs(buf[104] - ghostTable.elements[0].coatingTint[0]) < 0.001); // Element 0 coating tint R
});

test('performSpectralColorReconstructionCpu calculates physical sensor spectral response and IR-cut attenuation', () => {
  const arri = getCameraProfileById('arri-alexa-35');
  const red = getCameraProfileById('red-v-raptor-vv');
  const cooke = getLensProfileById('cooke-anamorphic-i-sf-50');

  // Pure deep crimson test input (mostly red and slight blue)
  const testRgb: [number, number, number] = [0.95, 0.15, 0.08];

  const arriResponse = performSpectralColorReconstructionCpu(
    testRgb,
    cooke.spectralTransmissionRgb,
    cooke.colorWarmthShift,
    arri.spectralPeakNm,
    arri.spectralWeights,
    arri.irCutNm,
    arri.irRejectionFactor,
    arri.cfaCrosstalk
  );

  const redResponse = performSpectralColorReconstructionCpu(
    testRgb,
    cooke.spectralTransmissionRgb,
    cooke.colorWarmthShift,
    red.spectralPeakNm,
    red.spectralWeights,
    red.irCutNm,
    red.irRejectionFactor,
    red.cfaCrosstalk
  );

  // RED V-RAPTOR has higher red spectral QE weight (1.06 vs 1.03) and 610nm vs 605nm peak
  assert.ok(arriResponse[0] > 0.65, 'ARRI red response should be strong for crimson input');
  assert.ok(redResponse[0] > 0.65, 'RED red response should be strong for crimson input');
  assert.ok(
    redResponse[0] > arriResponse[0],
    'RED V-RAPTOR higher red QE weight should produce higher red channel integration'
  );
  // Red should dominate green and blue channels
  assert.ok(arriResponse[0] > arriResponse[1]);
  assert.ok(arriResponse[1] > arriResponse[2]);
});

test('evaluatePhysicallyBasedFlareCpu computes incidence angle falloff, Henyey-Greenstein scattering, and ghost activation', () => {
  const cookeGhostTable = getLensGhostTable('cooke-anamorphic-i-sf-50');

  // Compare on-axis (5 degrees) vs off-axis (25 degrees) vs beyond cutoff (45 degrees)
  const flareOnAxis = evaluatePhysicallyBasedFlareCpu(5.0, 2.0, 50.0, cookeGhostTable, 0.15);
  const flareMidAxis = evaluatePhysicallyBasedFlareCpu(25.0, 2.0, 50.0, cookeGhostTable, 0.15);
  const flareOffAxis = evaluatePhysicallyBasedFlareCpu(45.0, 2.0, 50.0, cookeGhostTable, 0.15);

  // Cosine incidence drops as angle increases
  assert.ok(flareOnAxis.cosIncidence > flareMidAxis.cosIncidence);
  assert.ok(flareMidAxis.cosIncidence > flareOffAxis.cosIncidence);

  // Active ghost count should decrease as angle exceeds individual element cutoffs (all Cooke ghosts cut off <= 38 deg)
  assert.equal(flareOnAxis.activeGhostCount, 7);
  assert.ok(flareMidAxis.activeGhostCount <= 7);
  assert.equal(flareOffAxis.activeGhostCount, 0, 'No Cooke ghosts should be active beyond 40 deg cutoff');

  // Henyey-Greenstein forward scattering phase should be positive
  assert.ok(flareOnAxis.forwardScatterPhase > 0.01);
  assert.ok(flareOnAxis.totalGhostIntensity > flareMidAxis.totalGhostIntensity);
  assert.equal(flareOffAxis.totalGhostIntensity, 0);
});

test('classifyLensGlareOptics separates Spherical circular/starburst glare from Anamorphic cylindrical streak/oval glare', () => {
  const spherical = classifyLensGlareOptics(1.0);
  assert.equal(spherical.opticalMode, 'spherical');
  assert.equal(spherical.streakType, 'radial-starburst');
  assert.equal(spherical.haloAspectRatio, 1.0);
  assert.equal(spherical.ghostAspectRatio, 1.0);

  const anam133 = classifyLensGlareOptics(1.33);
  assert.equal(anam133.opticalMode, 'anamorphic');
  assert.equal(anam133.streakType, 'horizontal-cylindrical');
  assert.ok(anam133.haloAspectRatio > 1.5);

  const anam20 = classifyLensGlareOptics(2.0);
  assert.equal(anam20.opticalMode, 'anamorphic');
  assert.equal(anam20.anamorphicWeight, 1.0);
  assert.equal(anam20.sphericalWeight, 0);
  assert.ok(anam20.ghostAspectRatio > 1.9);
});

test('evaluatePointSpecularEmitterCpu isolates bright point lights and suppresses flat bright surfaces', () => {
  // 1. Bright isolated white bulb over dark background emits strongly
  const whiteLamp = evaluatePointSpecularEmitterCpu([1.0, 0.99, 0.96], [0.12, 0.12, 0.14], [0.10, 0.11, 0.12]);
  // 2. Warm tungsten street lantern over night backdrop also triggers cleanly
  const warmLantern = evaluatePointSpecularEmitterCpu([0.99, 0.78, 0.36], [0.16, 0.14, 0.12], [0.15, 0.13, 0.11]);
  // 3. Flat bright wall or evenly lit face (identical neighbors) is suppressed to avoid washout
  const flatBrightWall = evaluatePointSpecularEmitterCpu([0.85, 0.85, 0.85], [0.85, 0.85, 0.85], [0.85, 0.85, 0.85]);
  // 4. Midtone scene content emits zero flare
  const darkMidtone = evaluatePointSpecularEmitterCpu([0.32, 0.30, 0.28], [0.22, 0.20, 0.18], [0.24, 0.22, 0.20]);

  assert.ok(whiteLamp > 0.7, `Expected bright white point light to emit strongly, got ${whiteLamp}`);
  assert.ok(warmLantern > 0.45, `Expected warm tungsten lantern to emit cleanly, got ${warmLantern}`);
  assert.ok(
    flatBrightWall < 0.12 && flatBrightWall < whiteLamp * 0.25,
    `Expected flat bright surface to be strongly suppressed, got ${flatBrightWall} vs lamp ${whiteLamp}`
  );
  assert.equal(darkMidtone, 0, 'Midtones below specular threshold must emit zero flare');
});

test('computeBeerLambertStreakAttenuation preserves dominant coating channel and multi-pass flare shaders are valid', () => {
  const cobalt = computeBeerLambertStreakAttenuation([0.16, 0.56, 1.0], 2.0);
  assert.ok(cobalt[2] > cobalt[1] && cobalt[1] > cobalt[0], 'Cobalt blue coating must retain blue longest along streak');

  const golden = computeBeerLambertStreakAttenuation([1.0, 0.72, 0.28], 2.0);
  assert.ok(golden[0] > golden[1] && golden[1] > golden[2], 'Golden Atlas coating must retain warm amber longest');

  const wideReach = computeBeerLambertStreakAttenuation([0.16, 0.56, 1.0], 2.0);
  const mildReach = computeBeerLambertStreakAttenuation([0.16, 0.56, 1.0], 1.33);
  assert.ok(wideReach[2] > mildReach[2], '2.0x anamorphic squeeze should sweep wider than 1.33x');

  const shaders = [
    FLARE_QUAD_VERTEX_SHADER,
    FLARE_BRIGHT_EXTRACT_FRAGMENT_SHADER,
    FLARE_KAWASE_STREAK_FRAGMENT_SHADER,
    FLARE_ASSEMBLE_FRAGMENT_SHADER,
  ];
  for (const src of shaders) {
    assert.ok(src.includes('void main()'), 'Multi-pass flare shader must define void main()');
    const openBraces = (src.match(/\{/g) || []).length;
    const closeBraces = (src.match(/\}/g) || []).length;
    assert.equal(openBraces, closeBraces, 'Multi-pass flare shader braces must be balanced');
  }
});




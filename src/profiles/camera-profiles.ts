import { CalibrationAccuracyLevel } from './film-profiles';

export interface SensorCropMode {
  id: string;
  label: string;
  widthMm: number;
  heightMm: number;
  cropFactor: number;
}

export interface CameraProfile {
  id: string;
   cameraCurveId: number; // 0=ARRI LogC4, 1=Sony S-Log3, 2=RED Log3G10, 3=Canon Log 2, 4=BMD Gen 5, 5=Panasonic V-Log, 6=65mm Photochemical
  manufacturer: string;
  model: string;
  sensorFormat: string;
  // 2.1 Sensor Geometry and Architecture
  sensorWidthMm: number;
  sensorHeightMm: number;
  sensorDiagonalMm: number;
  resolutionWidth: number;
  resolutionHeight: number;
  pixelPitchUm: number;
  cfaPattern: string;
  olpfStrength: number; // 0..1 optical low-pass filter strength
  irCutNm: number; // IR-cut wavelength threshold in nm
  cropModes: SensorCropMode[];
  // 2.2 Spectral Response
  spectralPeakNm: [number, number, number]; // Peak wavelength [R, G, B] in nm
  spectralWeights: [number, number, number]; // Relative quantum efficiency [R, G, B]
  irRejectionFactor: number; // 0..1
  cfaCrosstalk: number; // 0..0.2 Color Filter Array microlens crosstalk
  // 2.3 Dynamic Range and Exposure Response
  dynamicRangeStops: number;
  highlightLatitudeStops: number; // Stops above 18% middle grey
  shadowLatitudeStops: number; // Stops below 18% middle grey
  baseIso: number;
  dualNativeIso: number | null;
  supportedEiRange: [number, number];
  // 2.4 Sensor Noise Characteristics
  readNoiseElectrons: number; // e- RMS at base ISO
  shotNoiseFactor: number;
  fixedPatternNoise: number; // 0..1 CMOS row/column fixed pattern
  chromaNoiseRatio: number; // 0..1 relative chroma vs luma noise
  // 2.5 Camera Colour Science
  colorSpace: string;
  transferCurve: string;
  colorMatrix: [
    number, number, number,
    number, number, number,
    number, number, number
  ];
  defaultHighlightRolloff: number; // 0..1
  defaultShadowTint: [number, number, number];
  defaultGrainAmount: number; // 0..1
  defaultHalationBase: number; // 0..1
  defaultContrast: number;
  defaultSaturation: number;
  // 2.6 Image Capture Characteristics
  shutterType: 'Rolling CMOS' | 'Global Shutter' | 'Rotary Mechanical Shutter';
  rollingShutterMs: number; // Sensor readout time in ms
  defaultShutterAngleDeg: number;
  recordingFormat: string;
  lensMountNative: 'PL' | 'LPL' | 'EF Cine' | 'PV';
  // Section 10: Calibration Accuracy Provenance
  calibrationAccuracy: {
    sensorGeometry: CalibrationAccuracyLevel;
    dynamicRangeAndNoise: CalibrationAccuracyLevel;
    spectralAndColorMatrix: CalibrationAccuracyLevel;
  };
  summary: string;
}

export const CAMERA_PROFILES: CameraProfile[] = [
  {
    id: 'arri-alexa-35',
    cameraCurveId: 0,
    manufacturer: 'ARRI',
    model: 'ALEXA 35 (ALEV 4)',
    sensorFormat: 'Super 35 4.6K 3:2 Open Gate',
    sensorWidthMm: 27.99,
    sensorHeightMm: 19.22,
    sensorDiagonalMm: 33.96,
    resolutionWidth: 4608,
    resolutionHeight: 3164,
    pixelPitchUm: 6.075,
    cfaPattern: 'Dual-Gain ALEV 4 Bayer RGGB',
    olpfStrength: 0.76,
    irCutNm: 650,
    cropModes: [
      { id: 'open-gate', label: '4.6K 3:2 Open Gate (28.0×19.2mm)', widthMm: 27.99, heightMm: 19.22, cropFactor: 1.0 },
      { id: '4.6k-16-9', label: '4.6K 16:9 (28.0×15.7mm)', widthMm: 27.99, heightMm: 15.75, cropFactor: 1.06 },
      { id: '4k-anamorphic', label: '3.3K 6:5 2× Anamorphic (20.2×16.9mm)', widthMm: 20.22, heightMm: 16.85, cropFactor: 1.29 },
    ],
    spectralPeakNm: [605, 532, 458],
    spectralWeights: [1.03, 1.01, 0.97],
    irRejectionFactor: 0.96,
    cfaCrosstalk: 0.04,
    dynamicRangeStops: 17.0,
    highlightLatitudeStops: 8.0,
    shadowLatitudeStops: 9.0,
    baseIso: 800,
    dualNativeIso: 2560,
    supportedEiRange: [160, 6400],
    readNoiseElectrons: 1.05,
    shotNoiseFactor: 0.22,
    fixedPatternNoise: 0.015,
    chromaNoiseRatio: 0.11,
    colorSpace: 'ARRI Wide Gamut 4',
    transferCurve: 'ARRI LogC4 / REVEAL',
    colorMatrix: [
      1.09, -0.05, -0.04,
      -0.01, 1.05, -0.03,
      -0.02, -0.05, 1.07,
    ],
    defaultHighlightRolloff: 0.88,
    defaultShadowTint: [0.004, 0.010, 0.016],
    defaultGrainAmount: 0.14,
    defaultHalationBase: 0.12,
    defaultContrast: 1.08,
    defaultSaturation: 1.08,
    shutterType: 'Rolling CMOS',
    rollingShutterMs: 8.2,
    defaultShutterAngleDeg: 180,
    recordingFormat: 'ARRIRAW 13-bit / ProRes 4444 XQ',
    lensMountNative: 'LPL',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 2: Measured Calibration',
    },
    summary:
      '17-stop Super 35 ALEV 4 CMOS sensor with REVEAL Color Science, 8 stops of creamy highlight latitude, natural skin hues, and organic OLPF roll-off.',
  },
  {
    id: 'sony-venice-2-8k',
    cameraCurveId: 1,
    manufacturer: 'Sony',
    model: 'VENICE 2 8K',
    sensorFormat: 'Full Frame 36.2×24.1mm',
    sensorWidthMm: 36.2,
    sensorHeightMm: 24.1,
    sensorDiagonalMm: 43.49,
    resolutionWidth: 8640,
    resolutionHeight: 5760,
    pixelPitchUm: 4.19,
    cfaPattern: 'Exmor R Back-Illuminated Bayer',
    olpfStrength: 0.58,
    irCutNm: 655,
    cropModes: [
      { id: 'open-gate', label: '8.6K 3:2 Full Frame (36.2×24.1mm)', widthMm: 36.2, heightMm: 24.1, cropFactor: 1.0 },
      { id: '8.2k-17-9', label: '8.2K 17:9 Digital Cinema (34.3×18.1mm)', widthMm: 34.3, heightMm: 18.1, cropFactor: 1.12 },
      { id: 's35-5.8k', label: '5.8K Super 35 17:9 (24.3×12.8mm)', widthMm: 24.3, heightMm: 12.8, cropFactor: 1.58 },
    ],
    spectralPeakNm: [600, 535, 455],
    spectralWeights: [0.98, 1.02, 1.05],
    irRejectionFactor: 0.94,
    cfaCrosstalk: 0.05,
    dynamicRangeStops: 16.0,
    highlightLatitudeStops: 6.5,
    shadowLatitudeStops: 9.5,
    baseIso: 800,
    dualNativeIso: 3200,
    supportedEiRange: [200, 12800],
    readNoiseElectrons: 0.95,
    shotNoiseFactor: 0.19,
    fixedPatternNoise: 0.01,
    chromaNoiseRatio: 0.09,
    colorSpace: 'S-Gamut3.Cine',
    transferCurve: 'Sony S-Log3',
    colorMatrix: [
      1.00, 0.00, -0.01,
      -0.02, 1.05, 0.01,
      -0.04, 0.02, 1.14,
    ],
    defaultHighlightRolloff: 0.80,
    defaultShadowTint: [0.000, 0.010, 0.024],
    defaultGrainAmount: 0.08,
    defaultHalationBase: 0.06,
    defaultContrast: 1.10,
    defaultSaturation: 1.08,
    shutterType: 'Rolling CMOS',
    rollingShutterMs: 9.8,
    defaultShutterAngleDeg: 180,
    recordingFormat: 'X-OCN XT 16-bit Linear',
    lensMountNative: 'PL',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 2: Measured Calibration',
    },
    summary:
      'Large-format 8.6K full-frame sensor with Dual Base ISO 800/3200, ultra-clean shadow floor, and crisp S-Gamut3.Cine cyan-blue tonal separation.',
  },
  {
    id: 'red-v-raptor-vv',
    cameraCurveId: 2,
    manufacturer: 'RED Digital Cinema',
    model: 'V-RAPTOR 8K VV',
    sensorFormat: 'VistaVision 40.96×21.60mm',
    sensorWidthMm: 40.96,
    sensorHeightMm: 21.6,
    sensorDiagonalMm: 46.31,
    resolutionWidth: 8192,
    resolutionHeight: 4320,
    pixelPitchUm: 5.0,
    cfaPattern: 'V-RAPTOR High-Speed Bayer CMOS',
    olpfStrength: 0.36,
    irCutNm: 645,
    cropModes: [
      { id: 'open-gate', label: '8K VV 17:9 Open Gate (41.0×21.6mm)', widthMm: 40.96, heightMm: 21.6, cropFactor: 1.0 },
      { id: '6k-s35', label: '6K Super 35 17:9 (30.7×16.2mm)', widthMm: 30.72, heightMm: 16.2, cropFactor: 1.33 },
      { id: '4k-s16', label: '4K Super 16 Crop (20.5×10.8mm)', widthMm: 20.48, heightMm: 10.8, cropFactor: 2.0 },
    ],
    spectralPeakNm: [610, 530, 452],
    spectralWeights: [1.06, 0.99, 0.97],
    irRejectionFactor: 0.93,
    cfaCrosstalk: 0.07,
    dynamicRangeStops: 16.5,
    highlightLatitudeStops: 7.0,
    shadowLatitudeStops: 9.5,
    baseIso: 800,
    dualNativeIso: null,
    supportedEiRange: [250, 12800],
    readNoiseElectrons: 1.48,
    shotNoiseFactor: 0.31,
    fixedPatternNoise: 0.055,
    chromaNoiseRatio: 0.22,
    colorSpace: 'REDWideGamutRGB',
    transferCurve: 'RED Log3G10 (IPP2)',
    colorMatrix: [
      1.16, -0.08, -0.04,
      -0.03, 1.08, -0.03,
      -0.02, -0.07, 1.11,
    ],
    defaultHighlightRolloff: 0.72,
    defaultShadowTint: [0.014, 0.003, 0.006],
    defaultGrainAmount: 0.18,
    defaultHalationBase: 0.10,
    defaultContrast: 1.18,
    defaultSaturation: 1.12,
    shutterType: 'Rolling CMOS',
    rollingShutterMs: 8.0,
    defaultShutterAngleDeg: 180,
    recordingFormat: 'REDCODE RAW R3D 16-bit',
    lensMountNative: 'PL',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 2: Measured Calibration',
    },
    summary:
      'VistaVision 46.3mm diagonal large-format sensor featuring high micro-contrast acutance, deep shadow toe density, and bold IPP2 Log3G10 color punch.',
  },
  {
    id: 'canon-c500-mark-ii',
    cameraCurveId: 3,
    manufacturer: 'Canon Cinema EOS',
    model: 'EOS C500 Mark II 5.9K FF',
    sensorFormat: 'Full Frame 38.1×20.1mm',
    sensorWidthMm: 38.1,
    sensorHeightMm: 20.1,
    sensorDiagonalMm: 43.08,
    resolutionWidth: 5952,
    resolutionHeight: 3140,
    pixelPitchUm: 6.4,
    cfaPattern: 'Canon Dual Pixel CMOS Bayer',
    olpfStrength: 0.68,
    irCutNm: 650,
    cropModes: [
      { id: 'open-gate', label: '5.9K Full Frame 17:9 (38.1×20.1mm)', widthMm: 38.1, heightMm: 20.1, cropFactor: 1.0 },
      { id: '4k-s35', label: '4K Super 35 17:9 (26.2×13.8mm)', widthMm: 26.2, heightMm: 13.8, cropFactor: 1.45 },
    ],
    spectralPeakNm: [608, 534, 460],
    spectralWeights: [1.08, 1.01, 0.94],
    irRejectionFactor: 0.95,
    cfaCrosstalk: 0.06,
    dynamicRangeStops: 15.2,
    highlightLatitudeStops: 6.2,
    shadowLatitudeStops: 9.0,
    baseIso: 800,
    dualNativeIso: null,
    supportedEiRange: [160, 12800],
    readNoiseElectrons: 1.38,
    shotNoiseFactor: 0.27,
    fixedPatternNoise: 0.035,
    chromaNoiseRatio: 0.16,
    colorSpace: 'Canon Cinema Gamut',
    transferCurve: 'Canon Log 2',
    colorMatrix: [
      1.13, -0.04, -0.04,
      0.01, 1.04, -0.02,
      -0.04, -0.05, 1.05,
    ],
    defaultHighlightRolloff: 0.82,
    defaultShadowTint: [0.014, 0.006, 0.012],
    defaultGrainAmount: 0.14,
    defaultHalationBase: 0.12,
    defaultContrast: 1.08,
    defaultSaturation: 1.12,
    shutterType: 'Rolling CMOS',
    rollingShutterMs: 13.4,
    defaultShutterAngleDeg: 180,
    recordingFormat: 'Cinema RAW Light 12-bit',
    lensMountNative: 'PL',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 2: Measured Calibration',
    },
    summary:
      '5.9K Full-Frame Cinema EOS sensor with Canon Log 2 cine gamma, signature warm ruby/amber skin rendering, and Cinema Gamut color science.',
  },
  {
    id: 'blackmagic-ursa-cine-12k',
    cameraCurveId: 4,
    manufacturer: 'Blackmagic Design',
    model: 'URSA Cine 12K LF',
    sensorFormat: 'Large Format RGBW 35.6×23.3mm',
    sensorWidthMm: 35.64,
    sensorHeightMm: 23.32,
    sensorDiagonalMm: 42.59,
    resolutionWidth: 12288,
    resolutionHeight: 8040,
    pixelPitchUm: 2.9,
    cfaPattern: 'Symmetrical 36-Pixel RGBW CFA',
    olpfStrength: 0.84,
    irCutNm: 650,
    cropModes: [
      { id: 'open-gate', label: '12K 3:2 Open Gate LF (35.6×23.3mm)', widthMm: 35.64, heightMm: 23.32, cropFactor: 1.0 },
      { id: '9k-s35', label: '9K Super 35 16:9 (27.2×15.3mm)', widthMm: 27.2, heightMm: 15.3, cropFactor: 1.38 },
    ],
    spectralPeakNm: [602, 532, 456],
    spectralWeights: [1.01, 1.02, 0.99],
    irRejectionFactor: 0.94,
    cfaCrosstalk: 0.05,
    dynamicRangeStops: 16.0,
    highlightLatitudeStops: 7.2,
    shadowLatitudeStops: 8.8,
    baseIso: 800,
    dualNativeIso: null,
    supportedEiRange: [200, 6400],
    readNoiseElectrons: 1.22,
    shotNoiseFactor: 0.24,
    fixedPatternNoise: 0.025,
    chromaNoiseRatio: 0.14,
    colorSpace: 'Blackmagic Wide Gamut Gen 5',
    transferCurve: 'Blackmagic Film Gen 5',
    colorMatrix: [
      1.06, -0.02, -0.02,
      -0.02, 1.06, -0.02,
      -0.02, -0.02, 1.08,
    ],
    defaultHighlightRolloff: 0.86,
    defaultShadowTint: [0.004, 0.010, 0.018],
    defaultGrainAmount: 0.12,
    defaultHalationBase: 0.09,
    defaultContrast: 1.06,
    defaultSaturation: 1.05,
    shutterType: 'Rolling CMOS',
    rollingShutterMs: 11.8,
    defaultShutterAngleDeg: 180,
    recordingFormat: 'Blackmagic RAW 12-bit Constant Quality',
    lensMountNative: 'PL',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 3: Estimated Model',
    },
    summary:
      'Symmetrical RGBW large-format sensor enabling ultra-smooth anti-aliased spatial sampling and pastel Generation 5 logarithmic highlight desaturation.',
  },
  {
    id: 'panasonic-varicam-35',
    cameraCurveId: 5,
    manufacturer: 'Panasonic',
    model: 'VariCam 35 4K',
    sensorFormat: 'Super 35 24.6×12.9mm',
    sensorWidthMm: 24.6,
    sensorHeightMm: 12.97,
    sensorDiagonalMm: 27.81,
    resolutionWidth: 4096,
    resolutionHeight: 2160,
    pixelPitchUm: 6.0,
    cfaPattern: 'Dual-Native MOS Bayer RGGB',
    olpfStrength: 0.74,
    irCutNm: 650,
    cropModes: [
      { id: 'open-gate', label: '4K DCI 17:9 Super 35 (24.6×13.0mm)', widthMm: 24.6, heightMm: 12.97, cropFactor: 1.0 },
      { id: 'uhd-16-9', label: 'UHD 16:9 (23.0×13.0mm)', widthMm: 23.06, heightMm: 12.97, cropFactor: 1.05 },
    ],
    spectralPeakNm: [604, 536, 458],
    spectralWeights: [0.99, 1.04, 1.02],
    irRejectionFactor: 0.95,
    cfaCrosstalk: 0.06,
    dynamicRangeStops: 14.5,
    highlightLatitudeStops: 6.0,
    shadowLatitudeStops: 8.5,
    baseIso: 800,
    dualNativeIso: 5000,
    supportedEiRange: [200, 12800],
    readNoiseElectrons: 0.92,
    shotNoiseFactor: 0.20,
    fixedPatternNoise: 0.02,
    chromaNoiseRatio: 0.10,
    colorSpace: 'Panasonic V-Gamut',
    transferCurve: 'Panasonic V-Log',
    colorMatrix: [
      1.03, -0.02, 0.01,
      -0.02, 1.08, -0.02,
      -0.03, 0.01, 1.09,
    ],
    defaultHighlightRolloff: 0.80,
    defaultShadowTint: [-0.002, 0.014, 0.020],
    defaultGrainAmount: 0.10,
    defaultHalationBase: 0.08,
    defaultContrast: 1.08,
    defaultSaturation: 1.07,
    shutterType: 'Rolling CMOS',
    rollingShutterMs: 12.5,
    defaultShutterAngleDeg: 180,
    recordingFormat: 'V-RAW 12-bit / AVC-Intra 4K444',
    lensMountNative: 'PL',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 2: Measured Calibration',
    },
    summary:
      'Pioneering Dual Native ISO 800 / 5000 Super 35 cinema camera with V-Log / V-Gamut color pipeline and ultra-clean nocturnal shadow performance.',
  },
  {
    id: 'kodak-vision3-500t-65mm',
    cameraCurveId: 6,
    manufacturer: 'Panavision / Kodak Gate',
    model: 'System 65 (65mm 5-Perf Gate)',
    sensorFormat: '65mm 5-Perf 52.48×23.01mm',
    sensorWidthMm: 52.48,
    sensorHeightMm: 23.01,
    sensorDiagonalMm: 57.3,
    resolutionWidth: 8192,
    resolutionHeight: 3592,
    pixelPitchUm: 6.4,
    cfaPattern: 'Photochemical 3-Layer Dye Emulsion',
    olpfStrength: 0.48,
    irCutNm: 680,
    cropModes: [
      { id: 'open-gate', label: '65mm 5-Perf 2.20:1 (52.5×23.0mm)', widthMm: 52.48, heightMm: 23.01, cropFactor: 1.0 },
      { id: '35mm-4perf', label: '35mm 4-Perf Academy (22.0×16.0mm)', widthMm: 21.95, heightMm: 16.0, cropFactor: 2.11 },
    ],
    spectralPeakNm: [645, 550, 445],
    spectralWeights: [1.08, 1.03, 0.94],
    irRejectionFactor: 0.99,
    cfaCrosstalk: 0.08,
    dynamicRangeStops: 15.0,
    highlightLatitudeStops: 8.5,
    shadowLatitudeStops: 6.5,
    baseIso: 500,
    dualNativeIso: null,
    supportedEiRange: [125, 2000],
    readNoiseElectrons: 0.75,
    shotNoiseFactor: 0.35,
    fixedPatternNoise: 0.0,
    chromaNoiseRatio: 0.26,
    colorSpace: 'Cineon / Kodak 2383 Print',
    transferCurve: 'Photochemical S-Curve',
    colorMatrix: [
      1.18, -0.09, -0.05,
      -0.03, 1.08, -0.03,
      -0.06, -0.08, 1.18,
    ],
    defaultHighlightRolloff: 0.90,
    defaultShadowTint: [0.010, 0.018, 0.036],
    defaultGrainAmount: 0.30,
    defaultHalationBase: 0.42,
    defaultContrast: 1.16,
    defaultSaturation: 1.14,
    shutterType: 'Rotary Mechanical Shutter',
    rollingShutterMs: 0.0,
    defaultShutterAngleDeg: 180,
    recordingFormat: '65mm 5-Perf Motion Picture Film Scan (16-bit DPX)',
    lensMountNative: 'PV',
    calibrationAccuracy: {
      sensorGeometry: 'Level 1: Manufacturer Spec',
      dynamicRangeAndNoise: 'Level 2: Measured Calibration',
      spectralAndColorMatrix: 'Level 2: Measured Calibration',
    },
    summary:
      '57.3mm diagonal 65mm 5-perf motion picture film gate with rotary mirror shutter, shallow large-format depth of field, and rich photochemical dye curves.',
  },
];

export function getCameraProfileById(id: string): CameraProfile {
  return CAMERA_PROFILES.find((c) => c.id === id) ?? CAMERA_PROFILES[0];
}

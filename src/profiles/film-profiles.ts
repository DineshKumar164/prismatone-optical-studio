export type CalibrationAccuracyLevel =
  | 'Level 1: Manufacturer Spec'
  | 'Level 2: Measured Calibration'
  | 'Level 3: Estimated Model';

export interface FilmStockProfile {
  id: string;
  manufacturer: string;
  name: string;
  code: string;
  stockType: 'Color Negative' | 'Color Reversal' | 'Digital Sensor Native';
  colorBalance: 'Daylight 5500K' | 'Tungsten 3200K' | 'Scene Linear';
  isoSensitivity: number;
  rmsGranularity: number; // Measured Kodak RMS diffuse granularity (e.g. 2.2 for 50D, 3.7 for 500T)
  grainSize: number; // 0.2 .. 1.0
  grainAmount: number; // 0.0 .. 1.0
  grainClumping: number; // 0.0 .. 1.0
  toeStrength: number; // 0.1 .. 1.0
  shoulderCompression: number; // 0.1 .. 1.0
  contrastGamma: number; // 0.85 .. 1.35
  saturationResponse: number; // 0.7 .. 1.35
  halationIntensity: number; // 0.0 .. 1.0
  halationRadius: number; // 0.2 .. 1.0
  shadowDensityTint: [number, number, number];
  highlightPrintTint: [number, number, number];
  acutanceBoost: number; // 0.0 .. 1.0
  defaultGateWeave: number; // 0.0 .. 0.5
  calibrationAccuracy: {
    sensitometry: CalibrationAccuracyLevel;
    granularity: CalibrationAccuracyLevel;
    halationScatter: CalibrationAccuracyLevel;
  };
  summary: string;
}

export const FILM_STOCK_PROFILES: FilmStockProfile[] = [
  {
    id: 'kodak-vision3-500t-5219',
    manufacturer: 'Kodak',
    name: 'Kodak Vision3 500T 5219',
    code: '5219',
    stockType: 'Color Negative',
    colorBalance: 'Tungsten 3200K',
    isoSensitivity: 500,
    rmsGranularity: 3.7,
    grainSize: 0.72,
    grainAmount: 0.34,
    grainClumping: 0.62,
    toeStrength: 0.62,
    shoulderCompression: 0.88,
    contrastGamma: 1.08,
    saturationResponse: 1.06,
    halationIntensity: 0.48,
    halationRadius: 0.75,
    shadowDensityTint: [-0.012, 0.014, 0.032],
    highlightPrintTint: [1.04, 0.99, 0.91],
    acutanceBoost: 0.52,
    defaultGateWeave: 0.12,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 2: Measured Calibration',
    },
    summary:
      'Industry-standard high-speed tungsten color negative with wide 15-stop overexposure latitude, clustered midtone silver halide grain, and red-orange anti-halation scatter.',
  },
  {
    id: 'kodak-vision3-250d-5207',
    manufacturer: 'Kodak',
    name: 'Kodak Vision3 250D 5207',
    code: '5207',
    stockType: 'Color Negative',
    colorBalance: 'Daylight 5500K',
    isoSensitivity: 250,
    rmsGranularity: 3.0,
    grainSize: 0.52,
    grainAmount: 0.24,
    grainClumping: 0.48,
    toeStrength: 0.56,
    shoulderCompression: 0.86,
    contrastGamma: 1.05,
    saturationResponse: 1.08,
    halationIntensity: 0.36,
    halationRadius: 0.62,
    shadowDensityTint: [-0.006, 0.008, 0.022],
    highlightPrintTint: [1.03, 1.0, 0.94],
    acutanceBoost: 0.64,
    defaultGateWeave: 0.1,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 2: Measured Calibration',
    },
    summary:
      'Medium-speed daylight motion picture negative offering extended highlight latitude, refined dye-layered grain, and warm natural skin-tone separation.',
  },
  {
    id: 'kodak-vision3-200t-5213',
    manufacturer: 'Kodak',
    name: 'Kodak Vision3 200T 5213',
    code: '5213',
    stockType: 'Color Negative',
    colorBalance: 'Tungsten 3200K',
    isoSensitivity: 200,
    rmsGranularity: 2.7,
    grainSize: 0.44,
    grainAmount: 0.2,
    grainClumping: 0.42,
    toeStrength: 0.58,
    shoulderCompression: 0.84,
    contrastGamma: 1.06,
    saturationResponse: 1.04,
    halationIntensity: 0.32,
    halationRadius: 0.55,
    shadowDensityTint: [-0.009, 0.011, 0.026],
    highlightPrintTint: [1.02, 0.995, 0.95],
    acutanceBoost: 0.68,
    defaultGateWeave: 0.08,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 2: Measured Calibration',
    },
    summary:
      'Fine-grain tungsten color negative engineered for controlled studio interiors and crisp optical resolution with classic Kodak toe density.',
  },
  {
    id: 'kodak-vision3-50d-5203',
    manufacturer: 'Kodak',
    name: 'Kodak Vision3 50D 5203',
    code: '5203',
    stockType: 'Color Negative',
    colorBalance: 'Daylight 5500K',
    isoSensitivity: 50,
    rmsGranularity: 2.2,
    grainSize: 0.28,
    grainAmount: 0.12,
    grainClumping: 0.26,
    toeStrength: 0.5,
    shoulderCompression: 0.82,
    contrastGamma: 1.04,
    saturationResponse: 1.1,
    halationIntensity: 0.24,
    halationRadius: 0.46,
    shadowDensityTint: [-0.004, 0.006, 0.016],
    highlightPrintTint: [1.02, 1.0, 0.96],
    acutanceBoost: 0.78,
    defaultGateWeave: 0.06,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 2: Measured Calibration',
    },
    summary:
      'Ultra-fine-grain daylight negative stock with the highest acutance in the Vision3 family, vivid subtractive color purity, and micro-fine dye clouds.',
  },
  {
    id: 'kodak-ektachrome-100d-7294',
    manufacturer: 'Kodak',
    name: 'Kodak Ektachrome 100D 7294',
    code: '7294',
    stockType: 'Color Reversal',
    colorBalance: 'Daylight 5500K',
    isoSensitivity: 100,
    rmsGranularity: 2.8,
    grainSize: 0.38,
    grainAmount: 0.18,
    grainClumping: 0.35,
    toeStrength: 0.82,
    shoulderCompression: 0.58,
    contrastGamma: 1.24,
    saturationResponse: 1.22,
    halationIntensity: 0.22,
    halationRadius: 0.4,
    shadowDensityTint: [-0.014, -0.002, 0.028],
    highlightPrintTint: [1.01, 1.01, 1.03],
    acutanceBoost: 0.82,
    defaultGateWeave: 0.1,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 3: Estimated Model',
    },
    summary:
      'Positive color reversal motion picture stock featuring steep D-max shadow contrast, electric saturated primaries, and crisp specular highlights.',
  },
  {
    id: 'fujifilm-eterna-500t-8573',
    manufacturer: 'Fujifilm',
    name: 'Fujifilm Eterna 500T 8573',
    code: '8573',
    stockType: 'Color Negative',
    colorBalance: 'Tungsten 3200K',
    isoSensitivity: 500,
    rmsGranularity: 3.5,
    grainSize: 0.64,
    grainAmount: 0.28,
    grainClumping: 0.54,
    toeStrength: 0.48,
    shoulderCompression: 0.9,
    contrastGamma: 1.02,
    saturationResponse: 0.98,
    halationIntensity: 0.38,
    halationRadius: 0.68,
    shadowDensityTint: [-0.014, 0.022, 0.018],
    highlightPrintTint: [1.01, 1.0, 0.95],
    acutanceBoost: 0.56,
    defaultGateWeave: 0.11,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 3: Estimated Model',
    },
    summary:
      'Revered Japanese motion picture tungsten negative with Super Nano-Structure Sigma grain, signature emerald-cyan shadow crossover, and gentle pastel skin tones.',
  },
  {
    id: 'digital-sensor-native',
    manufacturer: 'Digital Pipeline',
    name: 'Native Sensor Output (No Film Stock)',
    code: 'RAW',
    stockType: 'Digital Sensor Native',
    colorBalance: 'Scene Linear',
    isoSensitivity: 800,
    rmsGranularity: 0.0,
    grainSize: 0.25,
    grainAmount: 0.06,
    grainClumping: 0.1,
    toeStrength: 0.25,
    shoulderCompression: 0.85,
    contrastGamma: 1.0,
    saturationResponse: 1.0,
    halationIntensity: 0.0,
    halationRadius: 0.3,
    shadowDensityTint: [0.0, 0.0, 0.0],
    highlightPrintTint: [1.0, 1.0, 1.0],
    acutanceBoost: 0.5,
    defaultGateWeave: 0.0,
    calibrationAccuracy: {
      sensitometry: 'Level 1: Manufacturer Spec',
      granularity: 'Level 2: Measured Calibration',
      halationScatter: 'Level 1: Manufacturer Spec',
    },
    summary:
      'Pure digital cinema camera color science pipeline without photochemical negative halation or silver grain overlay.',
  },
];

export function getFilmStockById(id: string): FilmStockProfile {
  return FILM_STOCK_PROFILES.find((f) => f.id === id) ?? FILM_STOCK_PROFILES[0];
}

export interface HollywoodLutProfile {
  id: string;
  shaderId: number; // 0..8 encoded into GPU uniform buffer & LUT Camera
  name: string;
  shortName: string;
  eraStyle: string;
  description: string;
  defaultBlend: number; // 0..1
  badgeColor: 'slate' | 'amber' | 'cyan' | 'emerald' | 'rose' | 'purple';
  recommendedPrintStockId: number;
}

export const HOLLYWOOD_LUT_PROFILES: HollywoodLutProfile[] = [
  {
    id: 'native',
    shaderId: 0,
    name: 'Device Color',
    shortName: 'Device',
    eraStyle: 'Native Device Passthrough',
    description:
      'Preserves authentic native device sensor color with zero post-processing LUT override.',
    defaultBlend: 0.0,
    badgeColor: 'slate',
    recommendedPrintStockId: 0,
  },
  {
    id: 'gotham-neo-noir',
    shaderId: 2,
    name: 'Neo Noir',
    shortName: 'Neo Noir',
    eraStyle: 'High-Contrast Low-Key Chiaroscuro',
    description:
      'High-contrast low-key obsidian shadows, cool slate midtones, and piercing practical highlights.',
    defaultBlend: 0.90,
    badgeColor: 'rose',
    recommendedPrintStockId: 3,
  },
  {
    id: 'teal-orange-2383',
    shaderId: 1,
    name: 'Teal & Orange',
    shortName: 'Teal & Orange',
    eraStyle: 'Hollywood Blockbuster Split-Tone',
    description:
      'Blockbuster cyan-teal shadows & backgrounds colliding with golden-orange skin tones and warm highlights.',
    defaultBlend: 0.88,
    badgeColor: 'amber',
    recommendedPrintStockId: 0,
  },
  {
    id: 'vintage-kodak',
    shaderId: 9,
    name: 'Vintage Kodak',
    shortName: 'Vintage Kodak',
    eraStyle: 'Warm Soft 35mm Print Look',
    description:
      'Warm golden-amber tones, creamy rolled-off highlights, and soft lifted analog Kodak film shadows.',
    defaultBlend: 0.88,
    badgeColor: 'amber',
    recommendedPrintStockId: 0,
  },
  {
    id: 'blade-runner-2049',
    shaderId: 3,
    name: 'Blade Runner 2049 Neon',
    shortName: '2049 Neon',
    eraStyle: 'Deakins Atmospheric Sci-Fi',
    description:
      'Electric Prussian-cyan shadows colliding with luminous sodium-amber neon highlights and deep contrast.',
    defaultBlend: 0.88,
    badgeColor: 'cyan',
    recommendedPrintStockId: 4,
  },
  {
    id: 'dune-ochre',
    shaderId: 4,
    name: 'Arrakis Desert Ochre',
    shortName: 'Dune Ochre',
    eraStyle: 'Large-Format Bleached Epic',
    description:
      'Rich sun-baked bronze & sandstone midtones, champagne highlight glow, and deep cool-slate shadows.',
    defaultBlend: 0.85,
    badgeColor: 'amber',
    recommendedPrintStockId: 1,
  },
  {
    id: 'oppenheimer-70mm',
    shaderId: 5,
    name: 'IMAX 70mm Kodachrome',
    shortName: '70mm IMAX',
    eraStyle: 'Nolan / 15-Perf 65mm Print',
    description:
      'High micro-contrast 65mm emulsion with bold crimson-gold skin warmth and deep cobalt skies.',
    defaultBlend: 0.85,
    badgeColor: 'rose',
    recommendedPrintStockId: 0,
  },
  {
    id: 'matrix-cyber',
    shaderId: 6,
    name: 'Metropolis Emerald Noir',
    shortName: 'Cyber Noir',
    eraStyle: 'Phosphor Thriller Matrix',
    description:
      '520nm emerald midtone phosphor cast, glossy ink-black shadows, and crisp silver highlights.',
    defaultBlend: 0.86,
    badgeColor: 'emerald',
    recommendedPrintStockId: 2,
  },
  {
    id: 'bleach-bypass-noir',
    shaderId: 7,
    name: 'Sicario Steel ENR',
    shortName: 'Steel ENR',
    eraStyle: 'Fincher / Silver Retention Bypass',
    description:
      'Sharp silver-halide contrast retaining cold steel-blue shadows and steely metallic highlights.',
    defaultBlend: 0.88,
    badgeColor: 'slate',
    recommendedPrintStockId: 3,
  },
  {
    id: 'double-x-5222',
    shaderId: 8,
    name: 'Double-X 5222 B&W',
    shortName: '5222 B&W',
    eraStyle: 'Panchromatic Silver Monochrome',
    description:
      'High-acutance 35mm panchromatic B&W with deep black anchor, luminous skin, and crisp silver sparkle.',
    defaultBlend: 1.0,
    badgeColor: 'slate',
    recommendedPrintStockId: 3,
  },
];

export function getHollywoodLutById(id: string): HollywoodLutProfile {
  return (
    HOLLYWOOD_LUT_PROFILES.find((lut) => lut.id === id) ?? HOLLYWOOD_LUT_PROFILES[0]
  );
}

export function getHollywoodLutByShaderId(shaderId: number): HollywoodLutProfile {
  const rounded = Math.round(shaderId);
  return (
    HOLLYWOOD_LUT_PROFILES.find((lut) => lut.shaderId === rounded) ?? HOLLYWOOD_LUT_PROFILES[0]
  );
}

/**
 * Packs printStockId (0..9), hollywoodLutId (0..9), and hollywoodLutBlend (0..1)
 * cleanly into a single float32 uniform scalar without breaking backwards-compatibility
 * when hollywoodLutId == 0 and blend == 0 (scalar stays exact integer printStockId).
 */
export function encodePrintAndHollywoodLutUniform(
  printStockId: number,
  hollywoodLutId: number,
  hollywoodLutBlend: number
): number {
  const safePrint = Math.max(0, Math.min(9, Math.round(printStockId)));
  const safeLut = Math.max(0, Math.min(9, Math.round(hollywoodLutId)));
  const safeBlend = Math.max(0, Math.min(1, hollywoodLutBlend));
  if (safeLut === 0 || safeBlend <= 0.0001) {
    return safePrint;
  }
  return safePrint + safeLut * 10 + safeBlend * 0.99;
}

export function decodePrintAndHollywoodLutUniform(encoded: number): {
  printStockId: number;
  hollywoodLutId: number;
  hollywoodLutBlend: number;
} {
  const intPart = Math.floor(encoded + 0.0005);
  const hollywoodLutId = Math.floor(intPart * 0.1 + 0.0005);
  const printStockId = intPart - hollywoodLutId * 10;
  const hollywoodLutBlend = Math.max(0, Math.min(1, (encoded - intPart) / 0.99));
  return { printStockId, hollywoodLutId, hollywoodLutBlend };
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function luma709(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mixNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Deterministic CPU reference evaluation matching the GPU GLSL/WGSL
 * `applyHollywoodCinemaLut()` shader math for unit tests and telemetry.
 */
export function evaluateHollywoodCinemaLutCpu(
  rgb: [number, number, number],
  lutShaderId: number,
  blend: number
): [number, number, number] {
  const safeBlend = clamp01(blend);
  if (lutShaderId <= 0 || safeBlend <= 0.001) {
    return [clamp01(rgb[0]), clamp01(rgb[1]), clamp01(rgb[2])];
  }

  const r = clamp01(rgb[0]);
  const g = clamp01(rgb[1]);
  const b = clamp01(rgb[2]);
  const inLum = luma709(r, g, b);

  // Perceptual skin-tone & warm amber detection mask
  const warmChroma = smoothstep(-0.02, 0.26, r - b);
  const skinMask =
    smoothstep(0.0, 0.20, r - b) *
    smoothstep(-0.06, 0.12, g - b) *
    (1 - smoothstep(0.18, 0.44, Math.abs(r - g - 0.12))) *
    smoothstep(0.08, 0.26, inLum) *
    (1 - smoothstep(0.76, 0.98, inLum));

  // Protect pure 0 blacks from turning milky gray while giving crisp tonal zones
  const blackProtect = smoothstep(0.015, 0.12, inLum);
  const shadowMask = Math.pow(clamp01(1 - inLum * 1.45), 1.55) * blackProtect;
  const midMask = 4 * inLum * (1 - inLum);
  const hiMask = smoothstep(0.40, 0.96, inLum);

  let gr = r;
  let gg = g;
  let gb = b;

  if (lutShaderId === 1) {
    // 1: Teal & Orange (Bold 2383 cyan-teal shadows/neutrals vs fiery orange warmth)
    const cr = clamp01((r - 0.18) * 1.16 + 0.18);
    const cg = clamp01((g - 0.18) * 1.13 + 0.18);
    const cb = clamp01((b - 0.18) * 1.13 + 0.18);

    const coolZone = (1 - warmChroma * 0.78) * (0.38 + shadowMask * 0.62);
    gr = cr * (1 - 0.36 * coolZone) - 0.018 * shadowMask * (1 - warmChroma);
    gg = cg * (1 + 0.09 * coolZone) + 0.024 * coolZone;
    gb = cb * (1 + 0.34 * coolZone) + 0.078 * coolZone * (1 - skinMask * 0.65);

    const orangeZone = Math.max(warmChroma, hiMask * 0.68);
    gr += 0.115 * orangeZone * midMask + 0.092 * hiMask + 0.058 * skinMask;
    gg += 0.022 * orangeZone * midMask + 0.016 * hiMask + 0.014 * skinMask;
    gb -= 0.125 * orangeZone * midMask + 0.135 * hiMask + 0.052 * skinMask;
  } else if (lutShaderId === 2) {
    // 2: Neo Noir (High contrast / low key chiaroscuro dark grade)
    const sCrushed = Math.pow(Math.max(0.0001, inLum), 1.46) * (1.06 + hiMask * 0.16);
    const lumScale = sCrushed / Math.max(0.001, inLum);
    gr = r * lumScale;
    gg = g * lumScale;
    gb = b * lumScale;

    const trueCrimson =
      smoothstep(0.09, 0.28, r - g * 0.88) * smoothstep(0.14, 0.36, r - b);
    const satKeep = mixNum(0.24, 1.18, trueCrimson);
    const gLum = luma709(gr, gg, gb);
    gr = mixNum(gLum, gr, satKeep);
    gg = mixNum(gLum, gg, satKeep);
    gb = mixNum(gLum, gb, satKeep);

    gr = mixNum(gr * 0.86, gr, trueCrimson);
    gg = mixNum(gg * 0.94, gg, trueCrimson);
    gb = mixNum(gb * 1.09, gb, trueCrimson);

    gr += (-0.022 * shadowMask) + (0.068 * hiMask * trueCrimson) + (0.018 * hiMask);
    gg += (0.004 * shadowMask) + (0.006 * hiMask * (1 - trueCrimson * 0.5));
    gb += (0.048 * shadowMask * (1 - trueCrimson * 0.85)) - (0.035 * hiMask * trueCrimson);
  } else if (lutShaderId === 3) {
    // 3: Blade Runner 2049 Neon (Electric Prussian Cyan Shadows + Sodium Amber Highlights)
    const cr = clamp01((r - 0.18) * 1.16 + 0.18);
    const cg = clamp01((g - 0.18) * 1.14 + 0.18);
    const cb = clamp01((b - 0.18) * 1.14 + 0.18);
    gr = cr + (-0.055 * shadowMask) + (0.125 * hiMask) + (0.035 * skinMask);
    gg = cg + (0.025 * shadowMask) + (-0.012 * hiMask);
    gb = cb + (0.115 * shadowMask * (1 - skinMask * 0.65)) + (-0.135 * hiMask);
  } else if (lutShaderId === 4) {
    // 4: Arrakis Desert Ochre (Warm Bronze Sandstone + Cool Slate Shadows)
    const sl = luma709(r, g, b);
    const coolSh = shadowMask * 0.45;
    gr = mixNum(r, sl - 0.012, coolSh) + midMask * 0.085 + hiMask * 0.075;
    gg = mixNum(g, sl + 0.008, coolSh) + midMask * 0.042 + hiMask * 0.028;
    gb = mixNum(b, sl + 0.036, coolSh) - midMask * 0.072 - hiMask * 0.095;
  } else if (lutShaderId === 5) {
    // 5: IMAX 70mm Kodachrome (Punchy Micro-Contrast + Bold Crimson/Gold + Deep Cobalt)
    gr = (r - 0.18) * 1.24 + 0.18 + midMask * 0.045 + hiMask * 0.045 + 0.028 * skinMask;
    gg = (g - 0.18) * 1.20 + 0.18 + hiMask * 0.012;
    gb = (b - 0.18) * 1.22 + 0.18 + shadowMask * 0.024 - hiMask * 0.048;
  } else if (lutShaderId === 6) {
    // 6: Metropolis Emerald Noir (Matrix 520nm Phosphor + Glossy Ink Blacks)
    const cr = Math.pow(r, 1.15);
    const cg = Math.pow(g, 1.06);
    const cb = Math.pow(b, 1.14);
    gr = cr * 0.80 + cg * 0.04 - shadowMask * 0.028 + 0.038 * skinMask;
    gg = cg * 1.14 + cr * 0.04 + shadowMask * 0.038 + midMask * 0.055;
    gb = cb * 0.90 + cg * 0.05 + shadowMask * 0.012;
  } else if (lutShaderId === 7) {
    // 7: Sicario Steel ENR (High-Contrast Silver Retention + Cold Steel Shadows)
    const silverCurve = clamp01(Math.pow(inLum, 1.14) * 1.10);
    gr = mixNum(r, silverCurve, 0.56) - shadowMask * 0.024;
    gg = mixNum(g, silverCurve, 0.56) + shadowMask * 0.004;
    gb = mixNum(b, silverCurve, 0.56) + shadowMask * 0.042 + hiMask * 0.025;
  } else if (lutShaderId === 8) {
    // 8: Eastman Double-X 5222 Panchromatic B&W
    const panLuma = clamp01(0.28 * r + 0.60 * g + 0.12 * b);
    const highContrast = Math.pow(panLuma, 1.12);
    const s = highContrast * highContrast * (3 - 2 * highContrast);
    const silver = mixNum(highContrast, s, 0.62);
    gr = clamp01(silver + shadowMask * -0.006 + hiMask * 0.012);
    gg = clamp01(silver + shadowMask * -0.004 + hiMask * 0.010);
    gb = clamp01(silver + shadowMask * 0.008 + hiMask * -0.004);
  } else if (lutShaderId === 9) {
    // 9: Vintage Kodak (Warm / Soft analog 35mm aesthetic)
    const softR = (r - 0.5) * 0.90 + 0.5;
    const softG = (g - 0.5) * 0.90 + 0.5;
    const softB = (b - 0.5) * 0.88 + 0.49;

    const fadeLift = 0.038 * (1 - smoothstep(0.0, 0.52, inLum));
    gr = softR + fadeLift * 1.18 + midMask * 0.068 + hiMask * 0.052 + skinMask * 0.032;
    gg = softG + fadeLift * 0.92 + midMask * 0.026 + hiMask * 0.018 + skinMask * 0.014;
    gb = softB + fadeLift * 0.56 - midMask * 0.058 - hiMask * 0.072 - skinMask * 0.028;

    const warmLum = luma709(gr, gg, gb);
    gr = mixNum(warmLum, gr, 0.86);
    gg = mixNum(warmLum, gg, 0.86);
    gb = mixNum(warmLum, gb, 0.82);
  }

  gr = clamp01(gr);
  gg = clamp01(gg);
  gb = clamp01(gb);

  // Subtle subtractive film dye richness without dimming crisp highlights
  const gLum = luma709(gr, gg, gb);
  const satMag = Math.hypot(gr - gLum, gg - gLum, gb - gLum);
  const density = 1 - Math.min(0.11, satMag * 0.10) * (1 - hiMask * 0.65);
  gr = clamp01(gr * density);
  gg = clamp01(gg * density);
  gb = clamp01(gb * density);

  return [
    clamp01(r + (gr - r) * safeBlend),
    clamp01(g + (gg - g) * safeBlend),
    clamp01(b + (gb - b) * safeBlend),
  ];
}

/**
 * Prismatone WGSL Shader Library (WebGPU Render + Compute Pipelines)
 * Implements Anamorphic Desqueeze Geometry Projection (1.0x, 1.33x, 1.5x, 1.8x, 2.0x),
 * Aspect-Corrected Anamorphic Oval & Polygonal Cats-Eye Bokeh,
 * Camera-Lens Image Circle Coverage Cutoff, Edge-Gated 35mm Halation,
 * Cylindrical Streak Flares, and Photochemical Film Stock Emulation.
 */

export const PRISMATONE_WGSL_SHADER = /* wgsl */ `
struct OpticalUniforms {
  data: array<vec4<f32>, 32>,
};

@group(0) @binding(0) var<uniform> uniforms: OpticalUniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var sourceTex: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0)
  );
  let p = pos[vertexIndex];
  var out: VertexOutput;
  out.position = vec4<f32>(p, 0.0, 1.0);
  out.uv = vec2<f32>(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

fn hash12(p: vec2<f32>) -> f32 {
  var p3 = fract(vec3<f32>(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn luma(c: vec3<f32>) -> f32 {
  return dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
}

fn evalCapturedSpecularEnergy(col: vec3<f32>) -> f32 {
  let lin = pow(max(vec3<f32>(0.0), col), vec3<f32>(2.2));
  let linLum = luma(lin);
  let linPeak = max(lin.r, max(lin.g, lin.b));
  let incand = mix(linLum, linPeak, 0.22);
  let core = smoothstep(0.76, 0.992, incand);
  let hot = smoothstep(0.90, 0.998, linLum);
  return core * core * core * (0.45 + 0.85 * hot);
}

fn evalPointSpecularEmitter(cCore: vec3<f32>, cBgA: vec3<f32>, cBgB: vec3<f32>) -> f32 {
  let linCore = pow(max(vec3<f32>(0.0), cCore), vec3<f32>(2.2));
  let linBgA = pow(max(vec3<f32>(0.0), cBgA), vec3<f32>(2.2));
  let linBgB = pow(max(vec3<f32>(0.0), cBgB), vec3<f32>(2.2));
  let linLum = luma(linCore);
  let linPeak = max(linCore.r, max(linCore.g, linCore.b));
  if (linLum < 0.66 || linPeak < 0.76) {
    return 0.0;
  }
  let bgLum = 0.5 * (luma(linBgA) + luma(linBgB));
  let localPop = clamp((linLum - bgLum) * 2.6, 0.0, 1.0);
  let wideSuppress = 1.0 - 0.68 * smoothstep(0.54, 0.88, bgLum);
  let incand = mix(linLum, linPeak, 0.20);
  let hotCore = pow(smoothstep(0.68, 0.985, incand), 2.25);
  let clippedCore = pow(smoothstep(0.84, 0.995, linLum), 2.10);
  let isoEnergy = hotCore * (0.28 + 0.72 * localPop) * wideSuppress;
  let clipEnergy = clippedCore * mix(0.40, 1.0, wideSuppress);
  return max(isoEnergy, clipEnergy);
}

fn compositeOpticalFlare(baseCol: vec3<f32>, rawFlare: vec3<f32>) -> vec3<f32> {
  // Physically authentic linear HDR additive optical flare compositing with smooth filmic shoulder
  let baseLin = pow(max(vec3<f32>(0.0), baseCol), vec3<f32>(2.2));
  let flareLin = max(vec3<f32>(0.0), rawFlare);
  let combinedLin = baseLin + flareLin;
  let mappedLin = combinedLin / (vec3<f32>(1.0) + max(vec3<f32>(0.0), combinedLin - vec3<f32>(0.68)) * 0.65);
  return clamp(pow(max(vec3<f32>(0.0), mappedLin), vec3<f32>(1.0 / 2.2)), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn projectAnamorphicAndDistortUV(
  uv: vec2<f32>,
  k1: f32,
  k2: f32,
  squeeze: f32,
  desqueezeMode: f32,
  breathing: f32,
  focusDist: f32,
  gateWeave: f32,
  sensorFramingScale: f32,
  canvasAspect: f32,
  timeSec: f32
) -> vec2<f32> {
  let weaveOffset = vec2<f32>(
    (hash12(vec2<f32>(floor(timeSec * 24.0), 1.7)) - 0.5) * 0.0018 * gateWeave,
    (hash12(vec2<f32>(floor(timeSec * 24.0), 9.3)) - 0.5) * 0.0014 * gateWeave
  );
  let breatheScale = 1.0 - breathing * 0.038 * clamp(1.5 / max(0.4, focusDist), 0.0, 1.8);
  let formatZoom = mix(1.0, clamp(sensorFramingScale, 0.76, 1.32), 0.42);
  var centered = (uv + weaveOffset - vec2<f32>(0.5, 0.5)) * breatheScale / formatZoom;

  if (desqueezeMode > 0.5 && desqueezeMode < 1.5) {
    centered.y *= squeeze;
  } else if (desqueezeMode >= 1.5) {
    centered.x *= squeeze;
  } else if (squeeze > 1.02) {
    let horizNorm = centered.x * 2.0;
    let edgeHorizStretch = 1.0 - (squeeze - 1.0) * 0.085 * (horizNorm * horizNorm);
    centered.x *= edgeHorizStretch;
  }

  let normCoord = vec2<f32>(
    centered.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.55))) * 1.65,
    centered.y * 1.65
  );
  let r2 = dot(normCoord, normCoord);
  let r4 = r2 * r2;

  let radialDistortY = 1.0 + (k1 * 0.52) * r2 + (k2 * 0.38) * r4;
  let anamorphicCylFactor = mix(1.0, 1.28 / max(1.0, pow(squeeze, 0.45)), clamp(squeeze - 1.0, 0.0, 1.0));
  let radialDistortX = 1.0 + (k1 * 0.62 * anamorphicCylFactor) * r2 + (k2 * 0.42) * r4;

  let distorted = centered * vec2<f32>(radialDistortX, radialDistortY);
  return vec2<f32>(0.5, 0.5) + distorted;
}

fn sampleChromatic(uv: vec2<f32>, caAmount: f32, squeeze: f32, fieldCurvature: f32) -> vec3<f32> {
  let delta = uv - vec2<f32>(0.5, 0.5);
  let dist = length(delta) * 1.4142;
  let anamorphicCaBias = vec2<f32>(1.0 + (squeeze - 1.0) * 0.48, 1.0 + fieldCurvature * 0.25);
  let shift = delta * anamorphicCaBias * caAmount * 0.0052 * pow(dist, 1.35);
  let r = textureSampleLevel(sourceTex, texSampler, clamp(uv + shift, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).r;
  let g = textureSampleLevel(sourceTex, texSampler, clamp(uv, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).g;
  let b = textureSampleLevel(sourceTex, texSampler, clamp(uv - shift * 1.18, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).b;
  return vec3<f32>(r, g, b);
}

fn applyCameraSensorTransfer(x: vec3<f32>, cameraCurveId: f32, highlightRolloff: f32) -> vec3<f32> {
  var c = max(vec3<f32>(0.0), x);
  let l = luma(c);
  let blackProtect = smoothstep(0.015, 0.16, l);
  let midMask = 4.0 * l * (1.0 - l);
  let hiMask = smoothstep(0.52, 0.96, l);

  if (cameraCurveId < 0.5) {
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.40)) * 1.06 + vec3<f32>(0.40));
    let skinMask = clamp(1.0 - abs(c.r - c.g * 1.18) * 3.2, 0.0, 1.0) * smoothstep(0.12, 0.72, l);
    c += vec3<f32>(0.024, 0.008, -0.014) * skinMask;
    c += vec3<f32>(-0.008, 0.004, 0.010) * clamp(1.0 - l * 2.4, 0.0, 1.0) * blackProtect;
    let knee = pow(max(vec3<f32>(0.0001), c), vec3<f32>(0.95));
    c = mix(c, knee, hiMask * (0.28 + highlightRolloff * 0.22));
  } else if (cameraCurveId < 1.5) {
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.42)) * 1.09 + vec3<f32>(0.42));
    let coolShadow = clamp(1.0 - l * 2.0, 0.0, 1.0) * blackProtect;
    c += vec3<f32>(-0.020, 0.004, 0.030) * coolShadow;
    c.b *= 1.025;
    c.r *= 0.985;
  } else if (cameraCurveId < 2.5) {
    c = pow(max(vec3<f32>(0.0001), c), vec3<f32>(1.10));
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.40)) * 1.12 + vec3<f32>(0.40));
    c.r *= 1.06;
    c.g *= 1.00;
    c.b *= 0.94;
    c += vec3<f32>(0.018, 0.006, -0.012) * midMask;
  } else if (cameraCurveId < 3.5) {
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.40)) * 1.06 + vec3<f32>(0.40));
    c += vec3<f32>(0.032, 0.012, -0.022) * smoothstep(0.14, 0.80, l) * (1.0 - hiMask * 0.6);
    c.r *= 1.04;
    c.b *= 0.96;
  } else if (cameraCurveId < 4.5) {
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.40)) * 1.07 + vec3<f32>(0.40));
    let hiDesat = smoothstep(0.66, 0.98, l) * 0.26;
    c = mix(c, vec3<f32>(l * 0.98), hiDesat);
    c += vec3<f32>(-0.006, 0.006, 0.014) * clamp(1.0 - l * 2.2, 0.0, 1.0) * blackProtect;
  } else if (cameraCurveId < 5.5) {
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.40)) * 1.07 + vec3<f32>(0.40));
    c += vec3<f32>(-0.022, 0.024, 0.022) * clamp(1.0 - l * 2.1, 0.0, 1.0) * blackProtect;
    c += vec3<f32>(0.012, 0.008, -0.006) * hiMask;
  } else {
    c = pow(max(vec3<f32>(0.0001), c), vec3<f32>(1.08));
    c = max(vec3<f32>(0.0), (c - vec3<f32>(0.40)) * 1.12 + vec3<f32>(0.40));
    let outLum = luma(c);
    c = mix(vec3<f32>(outLum), c, 1.12);
    c += vec3<f32>(0.014, -0.004, 0.012) * hiMask;
  }
  return max(vec3<f32>(0.0), c);
}

fn filmicToneMap(x: vec3<f32>, contrast: f32, rolloff: f32, toeStrength: f32) -> vec3<f32> {
  var c = max(vec3<f32>(0.0), (x - vec3<f32>(0.40)) * contrast + vec3<f32>(0.40));
  let toe = pow(clamp(c / 0.20, vec3<f32>(0.0), vec3<f32>(1.0)), vec3<f32>(1.0 + toeStrength * 0.28)) * 0.20;
  c = mix(c, toe, step(c, vec3<f32>(0.20)));
  let shoulder = mix(0.55, 0.15, clamp(rolloff, 0.0, 1.0));
  let hiExcess = max(vec3<f32>(0.0), c - vec3<f32>(0.58));
  let mapped = min(c, vec3<f32>(0.58)) + (hiExcess / (vec3<f32>(1.0) + hiExcess * (1.15 + shoulder)));
  return clamp(mapped, vec3<f32>(0.0), vec3<f32>(1.0));
}

// WGSL Spectral Reconstruction Functions
fn reconstructSpectralColorWgsl(
  cIn: vec3<f32>,
  lensTrans: vec3<f32>,
  warmth: f32,
  peaks: vec3<f32>,
  weights: vec3<f32>,
  irCut: f32,
  irRej: f32,
  cfa: f32
) -> vec3<f32> {
  let c = max(vec3<f32>(0.0), cIn);
  let achromaticBase = min(c.r, min(c.g, c.b)) * 0.14;

  var spd = array<f32, 7>(
    max(0.0, c.b * 0.98 + c.g * 0.04 - c.r * 0.03 + achromaticBase),
    max(0.0, c.b * 0.62 + c.g * 0.42 - c.r * 0.04 + achromaticBase),
    max(0.0, c.g * 0.96 + c.b * 0.06 - c.r * 0.02 + achromaticBase),
    max(0.0, c.g * 0.66 + c.r * 0.36 - c.b * 0.02 + achromaticBase),
    max(0.0, c.r * 0.78 + c.g * 0.24 - c.b * 0.03 + achromaticBase),
    max(0.0, c.r * 1.00 + c.g * 0.03 - c.b * 0.02 + achromaticBase),
    max(0.0, c.r * 1.06 + achromaticBase)
  );

  let t430 = lensTrans.b * (1.0 - warmth * 0.28);
  let t480 = mix(lensTrans.b, lensTrans.g, 0.45);
  let t525 = lensTrans.g;
  let t560 = mix(lensTrans.g, lensTrans.r, 0.48);
  let t595 = mix(lensTrans.g, lensTrans.r, 0.78) * (1.0 + warmth * 0.14);
  let t630 = lensTrans.r * (1.0 + warmth * 0.20);
  let t665 = lensTrans.r * (1.0 + warmth * 0.22);

  spd[0] *= max(0.01, t430);
  spd[1] *= max(0.01, t480);
  spd[2] *= max(0.01, t525);
  spd[3] *= max(0.01, t560);
  spd[4] *= max(0.01, t595);
  spd[5] *= max(0.01, t630);
  spd[6] *= max(0.01, t665);

  let wavelengths = array<f32, 7>(430.0, 480.0, 525.0, 560.0, 595.0, 630.0, 665.0);
  let sigmaR = 33.0;
  let sigmaG = 29.0;
  let sigmaB = 27.0;

  var accumR = 0.0;
  var accumG = 0.0;
  var accumB = 0.0;
  var normR = 0.0;
  var normG = 0.0;
  var normB = 0.0;
  let effCross = cfa * 0.55;

  for (var k: i32 = 0; k < 7; k = k + 1) {
    let wl = wavelengths[k];
    let energy = spd[k];

    let dR = (wl - peaks.x) / sigmaR;
    let dG = (wl - peaks.y) / sigmaG;
    let dB = (wl - peaks.z) / sigmaB;

    let sR = exp(-0.5 * dR * dR);
    let sG = exp(-0.5 * dG * dG);
    let sB = exp(-0.5 * dB * dB);

    let effR = mix(sR, sG, effCross);
    let effG = mix(sG, (sR + sB) * 0.5, effCross * 0.75);
    let effB = mix(sB, sG, effCross);

    let irCutArg = (wl - irCut) * 0.22;
    var irTrans = 1.0 / (1.0 + exp(irCutArg));
    irTrans = mix(irTrans, 1.0 - irRej, select(0.0, 0.75, wl >= irCut));

    accumR += energy * effR * irTrans;
    accumG += energy * effG * irTrans;
    accumB += energy * effB * irTrans;

    normR += effR * irTrans;
    normG += effG * irTrans;
    normB += effB * irTrans;
  }

  var sensorSignal = vec3<f32>(
    accumR / max(0.001, normR) * weights.x,
    accumG / max(0.001, normG) * weights.y,
    accumB / max(0.001, normB) * weights.z
  );

  let sLum = luma(sensorSignal);
  sensorSignal = vec3<f32>(sLum) + (sensorSignal - vec3<f32>(sLum)) * 1.18;
  let rawLum = luma(c);
  let outLum = max(0.0001, luma(sensorSignal));
  sensorSignal *= mix(1.0, rawLum / outLum, 0.45);

  return max(vec3<f32>(0.0), sensorSignal);
}

// Henyey-Greenstein scattering phase function
fn henyeyGreensteinPhaseWgsl(cosTheta: f32, g: f32) -> f32 {
  let g2 = g * g;
  let denom = 1.0 + g2 - 2.0 * g * cosTheta;
  return (1.0 - g2) / (4.0 * 3.14159265 * pow(max(0.001, denom), 1.5));
}

fn applyHollywoodCinemaLutWgsl(col: vec3<f32>, lutIdF: f32, blendAmt: f32) -> vec3<f32> {
  let blend = clamp(blendAmt, 0.0, 1.0);
  let lutId = i32(floor(lutIdF + 0.5));
  if (lutId <= 0 || blend <= 0.001) {
    return col;
  }

  let c = clamp(col, vec3<f32>(0.0), vec3<f32>(1.0));
  let inLum = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
  let warmChroma = smoothstep(-0.02, 0.26, c.r - c.b);
  let skinMask =
    smoothstep(0.0, 0.20, c.r - c.b) *
    smoothstep(-0.06, 0.12, c.g - c.b) *
    (1.0 - smoothstep(0.18, 0.44, abs((c.r - c.g) - 0.12))) *
    smoothstep(0.08, 0.26, inLum) *
    (1.0 - smoothstep(0.76, 0.98, inLum));

  let blackProtect = smoothstep(0.015, 0.12, inLum);
  let shadowMask = pow(clamp(1.0 - inLum * 1.45, 0.0, 1.0), 1.55) * blackProtect;
  let midMask = 4.0 * inLum * (1.0 - inLum);
  let hiMask = smoothstep(0.40, 0.96, inLum);

  var g = c;
  if (lutId == 1) {
    let cr = clamp((c - vec3<f32>(0.18)) * vec3<f32>(1.16, 1.13, 1.13) + vec3<f32>(0.18), vec3<f32>(0.0), vec3<f32>(1.0));
    let coolZone = (1.0 - warmChroma * 0.78) * (0.38 + shadowMask * 0.62);
    g.r = cr.r * (1.0 - 0.36 * coolZone) - 0.018 * shadowMask * (1.0 - warmChroma);
    g.g = cr.g * (1.0 + 0.09 * coolZone) + 0.024 * coolZone;
    g.b = cr.b * (1.0 + 0.34 * coolZone) + 0.078 * coolZone * (1.0 - skinMask * 0.65);

    let orangeZone = max(warmChroma, hiMask * 0.68);
    g.r += 0.115 * orangeZone * midMask + 0.092 * hiMask + 0.058 * skinMask;
    g.g += 0.022 * orangeZone * midMask + 0.016 * hiMask + 0.014 * skinMask;
    g.b -= 0.125 * orangeZone * midMask + 0.135 * hiMask + 0.052 * skinMask;
  } else if (lutId == 2) {
    let sCrushed = pow(max(0.0001, inLum), 1.46) * (1.06 + hiMask * 0.16);
    let lumScale = sCrushed / max(0.001, inLum);
    g = c * lumScale;

    let trueCrimson = smoothstep(0.09, 0.28, c.r - c.g * 0.88) * smoothstep(0.14, 0.36, c.r - c.b);
    let satKeep = mix(0.24, 1.18, trueCrimson);
    let gLum2 = dot(g, vec3<f32>(0.2126, 0.7152, 0.0722));
    g = mix(vec3<f32>(gLum2), g, satKeep);

    g = mix(g * vec3<f32>(0.86, 0.94, 1.09), g, trueCrimson);
    g.r += (-0.022 * shadowMask) + (0.068 * hiMask * trueCrimson) + (0.018 * hiMask);
    g.g += (0.004 * shadowMask) + (0.006 * hiMask * (1.0 - trueCrimson * 0.5));
    g.b += (0.048 * shadowMask * (1.0 - trueCrimson * 0.85)) - (0.035 * hiMask * trueCrimson);
  } else if (lutId == 3) {
    let cr = clamp((c - vec3<f32>(0.18)) * vec3<f32>(1.16, 1.14, 1.14) + vec3<f32>(0.18), vec3<f32>(0.0), vec3<f32>(1.0));
    g.r = cr.r - 0.055 * shadowMask + 0.125 * hiMask + 0.035 * skinMask;
    g.g = cr.g + 0.025 * shadowMask - 0.012 * hiMask;
    g.b = cr.b + 0.115 * shadowMask * (1.0 - skinMask * 0.65) - 0.135 * hiMask;
  } else if (lutId == 4) {
    let coolSh = shadowMask * 0.45;
    g = mix(c, vec3<f32>(inLum) + vec3<f32>(-0.012, 0.008, 0.036), coolSh);
    g += vec3<f32>(0.085, 0.042, -0.072) * midMask;
    g += vec3<f32>(0.075, 0.028, -0.095) * hiMask;
  } else if (lutId == 5) {
    g = (c - vec3<f32>(0.18)) * vec3<f32>(1.24, 1.20, 1.22) + vec3<f32>(0.18);
    g.r += 0.045 * midMask + 0.045 * hiMask + 0.028 * skinMask;
    g.g += 0.012 * hiMask;
    g.b += 0.024 * shadowMask - 0.048 * hiMask;
  } else if (lutId == 6) {
    let cp = vec3<f32>(pow(c.r, 1.15), pow(c.g, 1.06), pow(c.b, 1.14));
    g.r = cp.r * 0.80 + cp.g * 0.04 - 0.028 * shadowMask + 0.038 * skinMask;
    g.g = cp.g * 1.14 + cp.r * 0.04 + 0.038 * shadowMask + 0.055 * midMask;
    g.b = cp.b * 0.90 + cp.g * 0.05 + 0.012 * shadowMask;
  } else if (lutId == 7) {
    let silverCurve = clamp(pow(max(0.0001, inLum), 1.14) * 1.10, 0.0, 1.0);
    g = mix(c, vec3<f32>(silverCurve), 0.56);
    g += vec3<f32>(-0.024, 0.004, 0.042) * shadowMask + vec3<f32>(0.0, 0.0, 0.025) * hiMask;
  } else if (lutId == 8) {
    let panLuma = clamp(dot(c, vec3<f32>(0.28, 0.60, 0.12)), 0.0, 1.0);
    let highContrast = pow(max(0.0001, panLuma), 1.12);
    let sCurve = highContrast * highContrast * (3.0 - 2.0 * highContrast);
    let silver = mix(highContrast, sCurve, 0.62);
    g = vec3<f32>(silver) + vec3<f32>(-0.006, -0.004, 0.008) * shadowMask + vec3<f32>(0.012, 0.010, -0.004) * hiMask;
  } else {
    let softBase = (c - vec3<f32>(0.5)) * vec3<f32>(0.90, 0.90, 0.88) + vec3<f32>(0.5, 0.5, 0.49);
    let fadeLift = 0.038 * (1.0 - smoothstep(0.0, 0.52, inLum));
    g.r = softBase.r + fadeLift * 1.18 + midMask * 0.068 + hiMask * 0.052 + skinMask * 0.032;
    g.g = softBase.g + fadeLift * 0.92 + midMask * 0.026 + hiMask * 0.018 + skinMask * 0.014;
    g.b = softBase.b + fadeLift * 0.56 - midMask * 0.058 - hiMask * 0.072 - skinMask * 0.028;

    let warmLum = dot(g, vec3<f32>(0.2126, 0.7152, 0.0722));
    g = mix(vec3<f32>(warmLum), g, vec3<f32>(0.86, 0.86, 0.82));
  }

  g = clamp(g, vec3<f32>(0.0), vec3<f32>(1.0));
  let gLum = dot(g, vec3<f32>(0.2126, 0.7152, 0.0722));
  let satMag = length(g - vec3<f32>(gLum));
  let density = 1.0 - clamp(satMag * 0.10, 0.0, 0.11) * (1.0 - hiMask * 0.65);
  g = clamp(g * density, vec3<f32>(0.0), vec3<f32>(1.0));
  return clamp(mix(c, g, blend), vec3<f32>(0.0), vec3<f32>(1.0));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let u0 = uniforms.data[0];
  let u1 = uniforms.data[1];
  let u2 = uniforms.data[2];
  let u3 = uniforms.data[3];
  let u4 = uniforms.data[4];
  let u5 = uniforms.data[5];
  let u6 = uniforms.data[6];
  let u7 = uniforms.data[7];
  let m0 = uniforms.data[8].xyz;
  let m1 = uniforms.data[9].xyz;
  let m2 = uniforms.data[10].xyz;
  let u11 = uniforms.data[11];
  let u12 = uniforms.data[12];
  let u13 = uniforms.data[13];
  let u14 = uniforms.data[14];
  let u15 = uniforms.data[15];

  let u16 = uniforms.data[16];
  let u17 = uniforms.data[17];
  let u18 = uniforms.data[18];
  let u19 = uniforms.data[19];

  let sensorSpectralPeaks = u16.xyz;
  let sensorIrCutNm = u16.w;

  let sensorSpectralWeights = u17.xyz;
  let sensorIrRejection = u17.w;

  let lensTransmissionRgb = u18.xyz;
  let focalLengthMm = max(14.0, floor(u18.w));
  let lensWarmthShift = fract(u18.w) - 0.5;

  let cfaCrosstalk = u19.x;
  let lightSourceUV = u19.yz;
  let signedLightIntensity = u19.w;
  let isSpectralReconstruction = signedLightIntensity > 0.0;
  let lightIntensity = abs(signedLightIntensity);

  let encPrintLut = uniforms.data[8].w;
  let intPrintLut = floor(encPrintLut + 0.0005);
  let hollywoodLutId = floor(intPrintLut * 0.1 + 0.0005);
  let printStockId = intPrintLut - hollywoodLutId * 10.0;
  let hollywoodLutBlend = clamp((encPrintLut - intPrintLut) / 0.99, 0.0, 1.0);
  let targetAspect = uniforms.data[9].w;
  let gateMode = select(0.0, 1.0, uniforms.data[10].w < 0.0);
  let sensorFramingScale = max(0.65, abs(uniforms.data[10].w));

  let res = u0.xy;
  let timeSec = u0.z;
  let splitWipeX = u0.w;
  let canvasAspect = res.x / max(1.0, res.y);

  let encodedMode = u7.w;
  let desqueezeMode = floor(encodedMode * 0.5 + 0.001);
  let isFinalQuality = (encodedMode - desqueezeMode * 2.0) > 0.5;

  let encodedCam = u5.w;
  let cameraCurveId = floor(encodedCam * 0.5 + 0.001);
  let focusPeaking = encodedCam - cameraCurveId * 2.0;

  var outsideGate = false;
  var onGateLine = false;
  if (targetAspect > 0.1) {
    if (targetAspect > canvasAspect + 0.02) {
      let activeHeight = canvasAspect / targetAspect;
      let barH = (1.0 - activeHeight) * 0.5;
      if (in.uv.y < barH || in.uv.y > (1.0 - barH)) {
        outsideGate = true;
      }
      if (abs(in.uv.y - barH) * res.y < 1.2 || abs(in.uv.y - (1.0 - barH)) * res.y < 1.2) {
        onGateLine = true;
      }
    } else if (targetAspect < canvasAspect - 0.02) {
      let activeWidth = targetAspect / canvasAspect;
      let barW = (1.0 - activeWidth) * 0.5;
      if (in.uv.x < barW || in.uv.x > (1.0 - barW)) {
        outsideGate = true;
      }
      if (abs(in.uv.x - barW) * res.x < 1.2 || abs(in.uv.x - (1.0 - barW)) * res.x < 1.2) {
        onGateLine = true;
      }
    }
  }

  if (outsideGate && gateMode < 0.5) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  if (splitWipeX >= 0.0) {
    let lineDist = abs(in.uv.x - splitWipeX) * res.x;
    if (lineDist < 1.5) {
      return vec4<f32>(0.96, 0.62, 0.04, 1.0);
    }
    if (in.uv.x < splitWipeX) {
      var rawCol = textureSampleLevel(sourceTex, texSampler, in.uv, 0.0).rgb;
      if (outsideGate && gateMode >= 0.5) {
        rawCol *= 0.22;
      }
      if (onGateLine && gateMode >= 0.5) {
        rawCol = mix(rawCol, vec3<f32>(0.96, 0.68, 0.15), 0.75);
      }
      return vec4<f32>(rawCol, 1.0);
    }
  }

  let k1 = u1.x;
  let k2 = u1.y;
  let caAmount = u1.z;
  let squeeze = max(1.0, u1.w);

  let vigAmount = u2.x;
  let vigFalloff = u2.y;
  let sharpness = u2.z;
  let cornerSoftness = u2.w;

  let bokehRadius = u3.x;
  let bokehSwirl = u3.y;
  let focusDist = u3.z;
  let fStop = max(1.0, u3.w);

  let flareIntensity = u4.x;
  let bloomIntensity = u4.y;
  let halationIntensity = u4.z;
  let focusBreathing = u4.w;

  let flareTint = u5.xyz;

  let tempShift = u6.x;
  let tintShift = u6.y;
  let contrast = u6.z;
  let saturation = u6.w;

  let highlightRolloff = u7.x;
  let sensorIso = u7.y;
  let grainAmount = u7.z;

  let baseIso = max(100.0, floor(u11.w + 0.0001));
  let fpnAmount = fract(u11.w) * 0.1;

  let imageCircleCutoffNorm = max(0.45, u12.x);
  let irisBlades = clamp(floor(u12.y + 0.0001), 5.0, 18.0);
  let catsEyeFactor = clamp(fract(u12.y), 0.0, 0.95);
  let bokehRimBrightness = u12.z;
  let onionRingIntensity = u12.w;

  let sphericalAberration = u13.x;
  let veilingGlare = u13.y;
  let exposureCompEv = u13.z;
  let gateWeave = u13.w;

  let filmToe = u14.x;
  let filmShoulder = u14.y;
  let grainSize = clamp(u14.z, 0.2, 1.2);
  let ghostCount = clamp(floor(u14.w + 0.0001), 2.0, 12.0);
  let fieldCurvature = clamp(fract(u14.w), 0.0, 0.95);

  let filmHighlightTint = u15.xyz;
  let olpfStrength = clamp(floor(u15.w + 0.0001) * 0.01, 0.05, 0.95);
  let chromaNoiseRatio = clamp(fract(u15.w), 0.05, 0.45);

  let distortedUV = projectAnamorphicAndDistortUV(
    in.uv,
    k1,
    k2,
    squeeze,
    desqueezeMode,
    focusBreathing,
    focusDist,
    gateWeave,
    sensorFramingScale,
    canvasAspect,
    timeSec
  );
  if (distortedUV.x < 0.0 || distortedUV.x > 1.0 || distortedUV.y < 0.0 || distortedUV.y > 1.0) {
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  }

  let centerVec = distortedUV - vec2<f32>(0.5, 0.5);
  let physicalSensorVec = vec2<f32>(centerVec.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.48))), centerVec.y);
  let radialDist = length(physicalSensorVec) * 1.48;

  let subjectCenter = vec2<f32>(0.5, clamp(0.68 - (focusDist - 1.5) * 0.06, 0.35, 0.72));
  let subjectEllipticalDist = length((distortedUV - subjectCenter) * vec2<f32>(0.85, 1.25));
  let depthDefocus = smoothstep(0.18, 0.78, subjectEllipticalDist);
  let apertureFactor = clamp((2.8 / max(1.1, fStop)) - 0.18, 0.0, 2.2);

  let petzvalDefocus = fieldCurvature * (radialDist * radialDist) * apertureFactor * 0.62;
  let dofBlur = bokehRadius * depthDefocus * apertureFactor * 0.72;
  let edgeComa = cornerSoftness * pow(radialDist, 2.0) * 0.45;
  let totalBlurRadius = clamp(dofBlur + petzvalDefocus + edgeComa, 0.0, 1.2) * 0.0112;

  let stoppedDownPolygonFactor = clamp((fStop - 2.2) / 4.5, 0.0, 0.85);
  let rawSensorExtraSqueeze = select(1.0, sqrt(squeeze), desqueezeMode >= 1.5);
  let bokehHorizSqueeze = pow(squeeze, 0.65) * rawSensorExtraSqueeze;
  let bokehVertStretch = pow(squeeze, 0.35);

  var accumColor = vec3<f32>(0.0);
  var totalWeight = 0.0;
  let sampleCount = select(16, 24, isFinalQuality);

  let radialDir = select(vec2<f32>(1.0, 0.0), normalize(physicalSensorVec), length(physicalSensorVec) > 0.001);
  let tangentDir = vec2<f32>(-radialDir.y, radialDir.x);

  for (var i: i32 = 0; i < 24; i = i + 1) {
    if (i >= sampleCount) {
      break;
    }
    let fi = f32(i);
    let r = sqrt((fi + 0.5) / f32(sampleCount));
    let theta = fi * 2.3999632 + (bokehSwirl + fieldCurvature * 0.35) * radialDist * 1.95;

    let sector = 6.2831853 / irisBlades;
    let localAngle = (theta - floor(theta / sector) * sector) - sector * 0.5;
    let polyRadius = cos(3.1415926 / irisBlades) / max(0.5, cos(localAngle));
    let shapedR = r * mix(1.0, polyRadius, stoppedDownPolygonFactor);

    let diskPt = vec2<f32>(cos(theta), sin(theta)) * shapedR;

    let radialProj = dot(diskPt, radialDir);
    let tangentProj = dot(diskPt, tangentDir);
    let catsEyeScale = 1.0 - clamp(catsEyeFactor * radialDist * 0.58 * abs(radialProj), 0.0, 0.62);
    let astigScale = 1.0 + fieldCurvature * radialDist * 0.45;
    let shapedDisk = radialDir * (radialProj * catsEyeScale) + tangentDir * (tangentProj * astigScale);

    var offset = shapedDisk * totalBlurRadius;
    offset.x = (offset.x / canvasAspect) / bokehHorizSqueeze;
    offset.y = offset.y * bokehVertStretch;

    let sampleCol = sampleChromatic(distortedUV + offset, caAmount, squeeze, fieldCurvature);
    let sampleLum = luma(sampleCol);
    let rimBoost = 1.0 + smoothstep(0.68, 0.98, r) * bokehRimBrightness;
    let onionWave = 1.0 + sin(r * 18.8495) * onionRingIntensity * 0.28;
    let bokehWeight = (1.0 + pow(max(0.0, sampleLum - 0.56), 2.2) * (7.5 * bokehRadius)) * rimBoost * onionWave;
    accumColor += sampleCol * bokehWeight;
    totalWeight += bokehWeight;
  }

  var color = accumColor / max(0.0001, totalWeight);
  let isoGainStops = clamp(log2(clamp(sensorIso / max(100.0, baseIso), 0.125, 8.0)) * 0.42, -1.2, 1.5);
  color *= exp2(clamp(exposureCompEv + isoGainStops, -3.5, 3.5));
  let centerLuma = luma(color);

  let wideOpenGlow = sphericalAberration * clamp(2.4 / fStop, 0.2, 1.35) * 0.075;
  if (wideOpenGlow > 0.01) {
    color += max(vec3<f32>(0.0), color - vec3<f32>(0.76)) * wideOpenGlow;
  }

  let texel = 1.0 / res;
  let horizMtfWeight = 1.0 / max(1.0, squeeze * 0.65);
  let n = textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>(0.0, -texel.y), 0.0).rgb;
  let s = textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>(0.0,  texel.y), 0.0).rgb;
  let e = textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>( texel.x, 0.0), 0.0).rgb;
  let w = textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>(-texel.x, 0.0), 0.0).rgb;
  let neighbors = (n + s + (e + w) * horizMtfWeight) / (2.0 + 2.0 * horizMtfWeight);

  let olpfBlend = clamp((olpfStrength - 0.55) * 0.35, -0.12, 0.18);
  color = mix(color, neighbors, max(0.0, olpfBlend));

  let sharpMaskStrength =
    (sharpness * (1.18 - olpfStrength * 0.42)) *
    (1.0 - clamp(depthDefocus * 0.8 + radialDist * (cornerSoftness + fieldCurvature * 0.35), 0.0, 0.95)) *
    0.58;
  if (sharpMaskStrength > 0.01) {
    color = color + (color - neighbors) * sharpMaskStrength;
  }

  if (bloomIntensity > 0.01 || halationIntensity > 0.01) {
    var bloomAccum = vec3<f32>(0.0);
    var halationEdgeAccum = 0.0;
    let innerR = 0.0045;
    let outerR = 0.0115;
    for (var j: i32 = 0; j < 12; j = j + 1) {
      let ang = f32(j) * 0.5235988;
      let dir = vec2<f32>(cos(ang) / canvasAspect, sin(ang));
      let c1 = textureSampleLevel(sourceTex, texSampler, clamp(distortedUV + dir * innerR, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
      let c2 = textureSampleLevel(sourceTex, texSampler, clamp(distortedUV + dir * outerR, vec2<f32>(0.001), vec2<f32>(0.999)), 0.0).rgb;
      let l1 = smoothstep(0.82, 0.99, luma(c1));
      let l2 = smoothstep(0.78, 0.98, luma(c2));
      bloomAccum += c1 * l1 + c2 * l2 * 0.55;
      let edgeContrast1 = max(0.0, l1 - centerLuma * 0.72);
      let edgeContrast2 = max(0.0, l2 - centerLuma * 0.65);
      halationEdgeAccum += edgeContrast1 * 0.65 + edgeContrast2 * 0.40;
    }
    bloomAccum = bloomAccum / 12.0;
    halationEdgeAccum = halationEdgeAccum / 12.0;
    color += bloomAccum * bloomIntensity * 0.24;
    color += vec3<f32>(1.0, 0.21, 0.035) * halationEdgeAccum * halationIntensity * 0.95;
  }

  // Spectral-Based Color Reconstruction vs Legacy Matrix
  if (isSpectralReconstruction) {
    color = reconstructSpectralColorWgsl(
      color,
      lensTransmissionRgb,
      lensWarmthShift,
      sensorSpectralPeaks,
      sensorSpectralWeights,
      sensorIrCutNm,
      sensorIrRejection,
      cfaCrosstalk
    );
  } else {
    let matrixCol = vec3<f32>(
      dot(color, m0),
      dot(color, m1),
      dot(color, m2)
    );
    color = max(vec3<f32>(0.0), matrixCol);
  }

  color.r *= (1.0 + tempShift * 0.32);
  color.b *= (1.0 - tempShift * 0.32);
  color.g *= (1.0 + tintShift * 0.22);

  color = applyCameraSensorTransfer(color, cameraCurveId, highlightRolloff);

  var effectiveContrast = contrast;
  var effectiveSat = saturation;
  var toeStrength = filmToe;
  let rolloffStrength = mix(highlightRolloff, filmShoulder, 0.5);
  var shadowTone = u11.xyz;
  var highlightTone = filmHighlightTint;

  if (printStockId < 0.5) {
    effectiveContrast *= 1.08;
    toeStrength = max(toeStrength, 0.65);
    shadowTone += vec3<f32>(-0.008, 0.010, 0.028);
    highlightTone *= vec3<f32>(1.03, 0.995, 0.92);
  } else if (printStockId < 1.5) {
    toeStrength = min(toeStrength, 0.30);
    highlightTone *= vec3<f32>(1.0, 1.0, 0.98);
  } else if (printStockId < 2.5) {
    effectiveContrast *= 1.03;
    shadowTone += vec3<f32>(-0.010, 0.018, 0.016);
    highlightTone *= vec3<f32>(1.02, 1.00, 0.95);
  } else if (printStockId < 3.5) {
    effectiveContrast *= 1.26;
    effectiveSat *= 0.52;
    toeStrength = 0.85;
    shadowTone += vec3<f32>(-0.005, 0.002, 0.008);
    highlightTone *= vec3<f32>(0.98, 0.99, 1.02);
  } else {
    effectiveContrast *= 1.12;
    toeStrength = max(toeStrength, 0.60);
    shadowTone += vec3<f32>(-0.018, 0.022, 0.042);
    highlightTone *= vec3<f32>(1.06, 0.97, 0.86);
  }

  color = filmicToneMap(color, effectiveContrast, rolloffStrength, toeStrength);

  let lumNow = luma(color);
  let blackProtectMask = smoothstep(0.012, 0.16, lumNow);
  let shadowMask = clamp(1.0 - lumNow * 2.3, 0.0, 1.0) * blackProtectMask;
  let hiMask = smoothstep(0.45, 0.95, lumNow);
  color = max(vec3<f32>(0.0), color + shadowTone * shadowMask);
  color = mix(color, color * highlightTone, hiMask);

  let postLum = luma(color);
  let chromaDiff = color - vec3<f32>(postLum);
  color = vec3<f32>(postLum) + chromaDiff * effectiveSat;
  let chromaMag = length(chromaDiff);
  color *= (1.0 - clamp(chromaMag * (effectiveSat - 0.95) * 0.16, 0.0, 0.14));

  color = applyHollywoodCinemaLutWgsl(color, hollywoodLutId, hollywoodLutBlend);

  // Post-LUT Optical Glass/Element Stage: Reworked Full-Width Anamorphic Streaks, Fraunhofer Starbursts, Dispersive Ghosts & Veiling Glare
  let anamWeight = smoothstep(1.05, 1.38, squeeze);
  let sphericalWeight = 1.0 - anamWeight;

  if (flareIntensity > 0.005 || veilingGlare > 0.005) {
    var flareAccum = vec3<f32>(0.0);
    let jitter = hash12(distortedUV * 819.73) - 0.5;
    let isDefaultAngle = length(lightSourceUV - vec2<f32>(0.72, 0.28)) < 0.015;
    let streakRad = select(atan2(lightSourceUV.y - 0.5, lightSourceUV.x - 0.5), 0.0, isDefaultAngle);

    // 1A. Continuous Gap-Free Anamorphic Cylindrical Beam (Sub-Step Jittered + Soft Vertical Gaussian)
    if (flareIntensity > 0.01 && anamWeight > 0.01) {
      var softStreak = vec3<f32>(0.0);
      let maxWing = clamp(0.22 * max(1.15, squeeze), 0.30, 0.42);
      let bgOffsetY = 0.055;
      let axisDir = vec2<f32>(cos(streakRad), sin(streakRad) * canvasAspect);
      let perpDir = normalize(vec2<f32>(-sin(streakRad) / max(0.5, canvasAspect), cos(streakRad)));
      let invSteps = 1.0 / 64.0;
      let blurY1 = 0.0085;
      let blurY2 = 0.0185;
      let normTint = flareTint / max(0.05, max(flareTint.r, max(flareTint.g, flareTint.b)));

      for (var k: i32 = -64; k <= 64; k = k + 1) {
        let t = (f32(k) + jitter) * invSteps;
        let baseUV = distortedUV + axisDir * (t * maxWing);
        if (baseUV.x < 0.003 || baseUV.x > 0.997 || baseUV.y < 0.003 || baseUV.y > 0.997) {
          continue;
        }
        let c0 = textureSampleLevel(sourceTex, texSampler, baseUV, 0.0).rgb;
        let cU1 = textureSampleLevel(sourceTex, texSampler, clamp(baseUV + perpDir * blurY1, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
        let cD1 = textureSampleLevel(sourceTex, texSampler, clamp(baseUV - perpDir * blurY1, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
        let cU2 = textureSampleLevel(sourceTex, texSampler, clamp(baseUV + perpDir * blurY2, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
        let cD2 = textureSampleLevel(sourceTex, texSampler, clamp(baseUV - perpDir * blurY2, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
        let slitCol = c0 * 0.32 + (cU1 + cD1) * 0.24 + (cU2 + cD2) * 0.10;
        if (luma(slitCol) <= 0.72) {
          continue;
        }

        let cBgU = textureSampleLevel(sourceTex, texSampler, clamp(baseUV + perpDir * bgOffsetY, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
        let cBgD = textureSampleLevel(sourceTex, texSampler, clamp(baseUV - perpDir * bgOffsetY, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
        let specVal = evalPointSpecularEmitter(slitCol, cBgU, cBgD);
        if (specVal <= 0.002) {
          continue;
        }

        let absT = abs(t);
        let tipTaper = pow(clamp(1.0 - absT, 0.0, 1.0), 1.45);
        let env = exp(-absT * 2.35) * tipTaper;
        let wingMix = smoothstep(0.04, 0.28, absT);
        let streakColor = mix(mix(slitCol, vec3<f32>(1.0), 0.35), normTint * 1.12, wingMix);
        softStreak += streakColor * (specVal * env * invSteps);
      }

      let compressedStreak = softStreak * 5.4 / (vec3<f32>(1.0) + softStreak * 3.2);
      flareAccum += compressedStreak * (flareIntensity * anamWeight);
    }

    // 1B. Spherical Fraunhofer Iris Starburst Diffraction Rays (Continuous Linear 20-tap/side)
    if (flareIntensity > 0.01 && sphericalWeight > 0.01) {
      var starAccum = vec3<f32>(0.0);
      let stoppedDown = clamp((fStop - 1.4) / 6.6, 0.20, 1.0);
      let rayLen = mix(0.085, 0.205, stoppedDown);
      let baseStarRot = streakRad + 0.26179938;
      let rayPairs = select(3, 4, (irisBlades >= 7.5 && irisBlades <= 9.5) || irisBlades >= 15.5);
      let angleStep = 3.14159265 / f32(rayPairs);
      let invStar = 1.0 / 20.0;

      for (var rIdx: i32 = 0; rIdx < 4; rIdx = rIdx + 1) {
        if (rIdx >= rayPairs) {
          break;
        }
        let rayAngle = baseStarRot + f32(rIdx) * angleStep;
        let rayDir = vec2<f32>(cos(rayAngle) / max(0.6, canvasAspect), sin(rayAngle));
        let perpDir = normalize(vec2<f32>(-rayDir.y, rayDir.x)) * 0.0018;

        for (var s: i32 = -20; s <= 20; s = s + 1) {
          if (s == 0) {
            continue;
          }
          let t = f32(s) * invStar;

          let uvG = distortedUV + rayDir * (t * rayLen);
          if (uvG.x < 0.002 || uvG.x > 0.998 || uvG.y < 0.002 || uvG.y > 0.998) {
            continue;
          }
          let sG0 = textureSampleLevel(sourceTex, texSampler, uvG, 0.0).rgb;
          if (max(sG0.r, max(sG0.g, sG0.b)) <= 0.78) {
            continue;
          }

          let uvR = clamp(distortedUV + rayDir * (t * rayLen * 1.068), vec2<f32>(0.002), vec2<f32>(0.998));
          let uvB = clamp(distortedUV + rayDir * (t * rayLen * 0.932), vec2<f32>(0.002), vec2<f32>(0.998));
          let sBgU = textureSampleLevel(sourceTex, texSampler, clamp(uvG + perpDir * 30.0, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
          let sBgD = textureSampleLevel(sourceTex, texSampler, clamp(uvG - perpDir * 30.0, vec2<f32>(0.002), vec2<f32>(0.998)), 0.0).rgb;
          let dispCol = vec3<f32>(
            textureSampleLevel(sourceTex, texSampler, uvR, 0.0).r,
            sG0.g,
            textureSampleLevel(sourceTex, texSampler, uvB, 0.0).b
          );
          let specS = evalPointSpecularEmitter(dispCol, sBgU, sBgD);
          let envS = exp(-abs(t) * 2.15) * pow(clamp(1.0 - abs(t), 0.0, 1.0), 1.30);
          let tintedS = mix(dispCol, dispCol * flareTint * 1.18, 0.30);
          starAccum += tintedS * (specS * envS * invStar);
        }
      }
      flareAccum += starAccum * (3.8 * flareIntensity * sphericalWeight * (0.58 + 0.85 * stoppedDown));
    }

    // 2. Chromatically Dispersive Conjugate Iris Ghosts & Barrel Arc
    if (flareIntensity > 0.02) {
      let center = vec2<f32>(0.5, 0.5);
      let curOffset = distortedUV - center;
      let radialCur = length(vec2<f32>(curOffset.x * canvasAspect, curOffset.y));
      let fresnelBoost = 1.0 + 1.55 * pow(clamp(radialCur, 0.0, 1.0), 2.1);
      let ovalStretchX = mix(1.0, 0.52, anamWeight);
      let ovalStretchY = mix(1.0, 1.66, anamWeight);

      for (var gi: i32 = 0; gi < 6; gi = gi + 1) {
        let geo = uniforms.data[20 + gi];
        let opt = uniforms.data[26 + gi];
        let axisPos = geo.x;
        let r0 = geo.y;
        let reflectance = geo.w;
        let shapeMode = opt.w;
        if (reflectance > 0.002) {
          let safeAxis = select(max(0.28, axisPos), min(-0.28, axisPos), axisPos < 0.0);
          let uvG = center - curOffset / safeAxis;
          if (uvG.x >= 0.015 && uvG.x <= 0.985 && uvG.y >= 0.015 && uvG.y <= 0.985) {
            let uvR = clamp(center - curOffset / (safeAxis * 0.945), vec2<f32>(0.01), vec2<f32>(0.99));
            let uvB = clamp(center - curOffset / (safeAxis * 1.055), vec2<f32>(0.01), vec2<f32>(0.99));
            let kernelR = r0 * 0.44;
            let rx = vec2<f32>((kernelR * ovalStretchX) / max(0.6, canvasAspect), 0.0);
            let ry = vec2<f32>(0.0, kernelR * ovalStretchY);

            let cCenter = vec3<f32>(
              textureSampleLevel(sourceTex, texSampler, uvR, 0.0).r,
              textureSampleLevel(sourceTex, texSampler, uvG, 0.0).g,
              textureSampleLevel(sourceTex, texSampler, uvB, 0.0).b
            );
            let r1 = textureSampleLevel(sourceTex, texSampler, clamp(uvG + rx, vec2<f32>(0.01), vec2<f32>(0.99)), 0.0).rgb;
            let r2 = textureSampleLevel(sourceTex, texSampler, clamp(uvG - rx, vec2<f32>(0.01), vec2<f32>(0.99)), 0.0).rgb;
            let r3 = textureSampleLevel(sourceTex, texSampler, clamp(uvG + ry, vec2<f32>(0.01), vec2<f32>(0.99)), 0.0).rgb;
            let r4 = textureSampleLevel(sourceTex, texSampler, clamp(uvG - ry, vec2<f32>(0.01), vec2<f32>(0.99)), 0.0).rgb;
            let ringAvg = (r1 + r2 + r3 + r4) * 0.25;

            let isAnnular = step(2.5, shapeMode);
            let ghostSrc = mix(cCenter * 0.45 + ringAvg * 0.55, ringAvg * 0.82 + cCenter * 0.18, isAnnular);
            let rimSpec = evalCapturedSpecularEnergy(ringAvg);
            let coreSpec = evalCapturedSpecularEnergy(cCenter);
            let specEnergy = mix(coreSpec * 0.55 + rimSpec * 0.45, max(rimSpec * 1.18, abs(rimSpec - coreSpec * 0.65) * 1.50), isAnnular);
            if (specEnergy >= 0.008) {
              let cutoffFade = 1.0 - smoothstep(0.62, 0.99, radialCur);
              let ghostCol = mix(ghostSrc, ghostSrc * opt.xyz * 1.45 + opt.xyz * 0.10, 0.80);
              flareAccum += ghostCol * (specEnergy * reflectance * 9.5 * fresnelBoost * cutoffFade * flareIntensity);
            }
          }
        }
      }

      if (anamWeight > 0.20) {
        let hoopMask = exp(-pow((radialCur - 0.66) * 5.6, 2.0));
        if (hoopMask > 0.02) {
          let oppUV = clamp(center - curOffset * 0.92, vec2<f32>(0.01), vec2<f32>(0.99));
          let oppR = clamp(center - curOffset * 0.87, vec2<f32>(0.01), vec2<f32>(0.99));
          let oppB = clamp(center - curOffset * 0.97, vec2<f32>(0.01), vec2<f32>(0.99));
          let oppCol = vec3<f32>(
            textureSampleLevel(sourceTex, texSampler, oppR, 0.0).r,
            textureSampleLevel(sourceTex, texSampler, oppUV, 0.0).g,
            textureSampleLevel(sourceTex, texSampler, oppB, 0.0).b
          );
          let oppSpec = evalCapturedSpecularEnergy(oppCol);
          flareAccum += (oppCol * flareTint * 1.28) * (oppSpec * hoopMask * 0.28 * flareIntensity * anamWeight);
        }
      }
    }

    // 3. Localized Henyey-Greenstein Veiling Glare & Scattering Halo
    if (veilingGlare > 0.005 || sphericalWeight > 0.2) {
      var glareAccum = vec3<f32>(0.0);
      let haloAnisotropy = vec2<f32>(mix(1.0, 1.70, anamWeight), mix(1.0, 0.62, anamWeight));
      for (var j: i32 = 0; j < 8; j = j + 1) {
        let ang = f32(j) * 0.78539816;
        let dir = vec2<f32>(cos(ang) * haloAnisotropy.x / max(0.6, canvasAspect), sin(ang) * haloAnisotropy.y);
        let uvNear = clamp(distortedUV + dir * 0.022, vec2<f32>(0.002), vec2<f32>(0.998));
        let uvMid  = clamp(distortedUV + dir * 0.058, vec2<f32>(0.002), vec2<f32>(0.998));
        let uvFar  = clamp(distortedUV + dir * 0.125, vec2<f32>(0.002), vec2<f32>(0.998));
        let cNear = textureSampleLevel(sourceTex, texSampler, uvNear, 0.0).rgb;
        let cMid  = textureSampleLevel(sourceTex, texSampler, uvMid, 0.0).rgb;
        let cFar  = textureSampleLevel(sourceTex, texSampler, uvFar, 0.0).rgb;
        let eNear = evalCapturedSpecularEnergy(cNear);
        let eMid  = evalCapturedSpecularEnergy(cMid);
        let eFar  = evalCapturedSpecularEnergy(cFar);
        glareAccum += cNear * eNear * 0.48 + cMid * eMid * 0.34 + cFar * eFar * 0.18;
      }
      let glareTint = mix(vec3<f32>(1.0), flareTint, mix(0.20, 0.50, anamWeight));
      let wideOpenBoost = clamp(2.4 / max(1.2, fStop), 0.45, 1.30);
      flareAccum += (glareAccum / 8.0) * glareTint * (veilingGlare * 0.46 * wideOpenBoost + sphericalWeight * flareIntensity * 0.08);
    }

    let lutInt = i32(floor(hollywoodLutId + 0.5));
    if ((lutInt == 8 && hollywoodLutBlend > 0.001) || effectiveSat <= 0.02) {
      let flareDesat = select(hollywoodLutBlend, 1.0, effectiveSat <= 0.02);
      flareAccum = mix(flareAccum, vec3<f32>(luma(flareAccum)), flareDesat);
    }
    color = compositeOpticalFlare(color, flareAccum);
  }

  if (effectiveSat <= 0.02) {
    let bwMask = clamp(1.0 - effectiveSat / 0.02, 0.0, 1.0);
    let bwLum = dot(color, vec3<f32>(0.28, 0.60, 0.12));
    color = mix(color, vec3<f32>(bwLum), bwMask);
  }

  let vigCoord = vec2<f32>(
    centerVec.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.42))),
    centerVec.y * 1.08
  );
  let vigR = length(vigCoord) * 1.42;
  let cosTheta = cos(clamp(vigR * 0.54, 0.0, 1.08));
  let cos4Illum = pow(cosTheta, 4.0);
  let vigCurvePower = clamp(vigFalloff * 0.92, 0.65, 2.8);
  let profileVigDrop = vigAmount * (0.68 * pow(clamp(vigR, 0.0, 1.35), vigCurvePower) + 0.32 * (1.0 - cos4Illum));

  let wideOpenIris = clamp(2.8 / max(1.1, fStop), 0.25, 1.3);
  let catsEyeCornerDrop = catsEyeFactor * wideOpenIris * smoothstep(0.56, 1.18, vigR) * 0.34;
  let vigFactor = clamp(1.0 - profileVigDrop - catsEyeCornerDrop, 0.06, 1.0);

  let circularSensorRadius = length(vec2<f32>(centerVec.x * (canvasAspect / 1.7778), centerVec.y)) * 1.4142;
  let icCutoffMask = 1.0 - smoothstep(imageCircleCutoffNorm - 0.10, imageCircleCutoffNorm + 0.03, circularSensorRadius);
  color *= vigFactor * mix(0.03, 1.0, icCutoffMask);

  let isoMultiplier = sqrt(max(0.5, sensorIso / baseIso));
  let effectiveGrain = grainAmount * 0.075 * clamp(isoMultiplier, 0.65, 3.4);
  if (effectiveGrain > 0.001 || fpnAmount > 0.002) {
    let freqScale = mix(1.35, 0.62, clamp(grainSize, 0.2, 1.0));
    let grainCoord = floor(in.uv * res * freqScale) + vec2<f32>(timeSec * 41.3, timeSec * 17.9);
    let nLuma = (hash12(grainCoord) + hash12(grainCoord * 0.5 + vec2<f32>(7.3, 19.1)) - 1.0) * 0.65;
    let nChromaR = hash12(grainCoord + vec2<f32>(13.1, 7.7)) - 0.5;
    let nChromaB = hash12(grainCoord + vec2<f32>(29.4, 19.3)) - 0.5;

    let rowNoise = (hash12(vec2<f32>(floor(in.uv.y * res.y), 3.1)) - 0.5) * fpnAmount * isoMultiplier * 0.16;
    let colNoise = (hash12(vec2<f32>(floor(in.uv.x * res.x), 8.7)) - 0.5) * fpnAmount * isoMultiplier * 0.12;
    let cmosFpn = (rowNoise + colNoise) * clamp(1.0 - postLum * 2.0, 0.0, 0.85);

    let midtoneWeight = 3.6 * postLum * (1.0 - postLum * 0.75) + 0.15;
    color += vec3<f32>(
      nLuma + nChromaR * chromaNoiseRatio * 1.4,
      nLuma,
      nLuma + nChromaB * chromaNoiseRatio * 1.4
    ) * effectiveGrain * midtoneWeight + vec3<f32>(cmosFpn);
  }

  if (focusPeaking > 0.5) {
    let cL = luma(textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>(-texel.x, 0.0), 0.0).rgb);
    let cR = luma(textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>( texel.x, 0.0), 0.0).rgb);
    let cU = luma(textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>(0.0, -texel.y), 0.0).rgb);
    let cD = luma(textureSampleLevel(sourceTex, texSampler, distortedUV + vec2<f32>(0.0,  texel.y), 0.0).rgb);
    let edgeMag = abs(cR - cL) + abs(cD - cU);
    if (edgeMag > 0.14) {
      color = mix(color, vec3<f32>(0.0, 0.98, 0.75), clamp((edgeMag - 0.14) * 3.5, 0.0, 0.9));
    }
  }

  color = clamp(color, vec3<f32>(0.0), vec3<f32>(1.0));

  if (outsideGate && gateMode >= 0.5) {
    color *= 0.22;
  }
  if (onGateLine && gateMode >= 0.5) {
    color = mix(color, vec3<f32>(0.96, 0.68, 0.15), 0.82);
  }

  return vec4<f32>(color, 1.0);
}
`;

export const PRISMATONE_COMPUTE_HISTOGRAM_WGSL = /* wgsl */ `
@group(0) @binding(0) var inputTex: texture_2d<f32>;
@group(0) @binding(1) var<storage, read_write> bins: array<atomic<u32>, 256>;

@compute @workgroup_size(8, 8)
fn cs_main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let dims = textureDimensions(inputTex);
  if (gid.x >= dims.x || gid.y >= dims.y) {
    return;
  }
  let c = textureLoad(inputTex, vec2<i32>(gid.xy), 0).rgb;
  let lum = clamp(dot(c, vec3<f32>(0.2126, 0.7152, 0.0722)), 0.0, 1.0);
  let binIdx = u32(lum * 255.0);
  atomicAdd(&bins[binIdx], 1u);
}
`;

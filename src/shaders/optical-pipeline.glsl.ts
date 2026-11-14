import { SPECTRAL_RECONSTRUCTION_GLSL_MODULE } from './spectral-color-reconstruction.glsl';
import { PHYSICALLY_BASED_FLARE_GLSL_MODULE } from './physically-based-lens-flare.glsl';
import { HOLLYWOOD_CINEMA_LUT_GLSL_MODULE } from './hollywood-luts.glsl';

/**
 * Prismatone WebGL2 Post-Processing Shader Library (GLSL #version 300 es)
 * Implements Anamorphic Desqueeze Geometry Projection (1.0x, 1.33x, 1.5x, 1.8x, 2.0x),
 * Aspect-Corrected Anamorphic Oval & Polygonal Cats-Eye Bokeh,
 * Camera-Lens Image Circle Coverage Cutoff, Edge-Gated 35mm Halation,
 * Cylindrical Streak Flares, and Photochemical Film Stock Emulation.
 */

export const PRISMATONE_WEBGL2_VERTEX_SHADER = /* glsl */ `#version 300 es
precision highp float;

out vec2 v_uv;

void main() {
  vec2 pos[6] = vec2[6](
    vec2(-1.0, -1.0),
    vec2( 1.0, -1.0),
    vec2(-1.0,  1.0),
    vec2(-1.0,  1.0),
    vec2( 1.0, -1.0),
    vec2( 1.0,  1.0)
  );
  vec2 p = pos[gl_VertexID];
  gl_Position = vec4(p, 0.0, 1.0);
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
}
`;

export const PRISMATONE_WEBGL2_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec4 u_data[32];
uniform sampler2D u_sourceTex;

${SPECTRAL_RECONSTRUCTION_GLSL_MODULE}

${PHYSICALLY_BASED_FLARE_GLSL_MODULE}

${HOLLYWOOD_CINEMA_LUT_GLSL_MODULE}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

// Anamorphic Desqueeze Post-Processing Geometry Projection + Cylindrical Brown-Conrady Distortion
vec2 projectAnamorphicAndDistortUV(
  vec2 uv,
  float k1,
  float k2,
  float squeeze,
  float desqueezeMode,
  float breathing,
  float focusDist,
  float gateWeave,
  float sensorFramingScale,
  float canvasAspect,
  float timeSec
) {
  // 24fps physical film gate weave instability
  vec2 weaveOffset = vec2(
    (hash12(vec2(floor(timeSec * 24.0), 1.7)) - 0.5) * 0.0018 * gateWeave,
    (hash12(vec2(floor(timeSec * 24.0), 9.3)) - 0.5) * 0.0014 * gateWeave
  );

  // Focus breathing magnification + sensor format framing scale (LF/65mm wider field vs S35/S16 crop)
  float breatheScale = 1.0 - breathing * 0.038 * clamp(1.5 / max(0.4, focusDist), 0.0, 1.8);
  float formatZoom = mix(1.0, clamp(sensorFramingScale, 0.76, 1.32), 0.42);
  vec2 centered = (uv + weaveOffset - vec2(0.5, 0.5)) * breatheScale / formatZoom;

  // Apply Anamorphic Desqueeze Viewport Projection (1.33x, 1.5x, 1.8x, 2.0x):
  if (desqueezeMode > 0.5 && desqueezeMode < 1.5) {
    // Raw Anamorphic Desqueeze: fit desqueezed widescreen aspect into viewport height
    centered.y *= squeeze;
  } else if (desqueezeMode >= 1.5) {
    // Raw Squeezed Sensor Gate View: show compressed horizontal sensor capture
    centered.x *= squeeze;
  } else if (squeeze > 1.02) {
    // Optical Anamorphic Projection on spherical source: cylindrical horizontal field curvature & edge compression
    float horizNorm = centered.x * 2.0;
    float edgeHorizStretch = 1.0 - (squeeze - 1.0) * 0.085 * (horizNorm * horizNorm);
    centered.x *= edgeHorizStretch;
  }

  // Aspect-normalized coordinates so r^2 reaches ~1.0 at frame edges and ~1.8 at corners
  vec2 normCoord = vec2(
    centered.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.55))) * 1.65,
    centered.y * 1.65
  );
  float r2 = dot(normCoord, normCoord);
  float r4 = r2 * r2;

  // Cylindrical Anamorphic Front-Element + Spherical Rear-Group Brown-Conrady Distortion:
  // Supports true barrel (k1 < 0), pincushion (k1 > 0), and complex moustache curvature (k1 < 0, k2 > 0)
  float radialDistortY = 1.0 + (k1 * 0.52) * r2 + (k2 * 0.38) * r4;
  float anamorphicCylFactor = mix(1.0, 1.28 / max(1.0, pow(squeeze, 0.45)), clamp(squeeze - 1.0, 0.0, 1.0));
  float radialDistortX = 1.0 + (k1 * 0.62 * anamorphicCylFactor) * r2 + (k2 * 0.42) * r4;

  vec2 distorted = centered * vec2(radialDistortX, radialDistortY);
  return vec2(0.5, 0.5) + distorted;
}

// Calibrated Lateral & Axial Chromatic Aberration (stronger horizontally on anamorphic front elements)
vec3 sampleChromatic(vec2 uv, float caAmount, float squeeze, float fieldCurvature) {
  vec2 delta = uv - vec2(0.5, 0.5);
  float dist = length(delta) * 1.4142;
  vec2 anamorphicCaBias = vec2(1.0 + (squeeze - 1.0) * 0.48, 1.0 + fieldCurvature * 0.25);
  vec2 shift = delta * anamorphicCaBias * caAmount * 0.0052 * pow(dist, 1.35);
  float r = texture(u_sourceTex, clamp(uv + shift, vec2(0.001), vec2(0.999))).r;
  float g = texture(u_sourceTex, clamp(uv, vec2(0.001), vec2(0.999))).g;
  float b = texture(u_sourceTex, clamp(uv - shift * 1.18, vec2(0.001), vec2(0.999))).b;
  return vec3(r, g, b);
}

// Camera-Specific Sensor Color Science & Signature Look Transfer (Section 2.5)
// Designed with true black anchor + crisp midtone separation so every camera displays an unmistakable look without dull gray wash.
vec3 applyCameraSensorTransfer(vec3 x, float cameraCurveId, float highlightRolloff) {
  vec3 c = max(vec3(0.0), x);
  float l = luma(c);
  float blackProtect = smoothstep(0.015, 0.16, l);
  float midMask = 4.0 * l * (1.0 - l);
  float hiMask = smoothstep(0.52, 0.96, l);

  if (cameraCurveId < 0.5) {
    // 0: ARRI ALEXA 35 (REVEAL — Organic Golden Skin, Rolled Organic Highlights, Deep Neutral Film Toe)
    c = max(vec3(0.0), (c - vec3(0.40)) * 1.06 + vec3(0.40));
    float skinMask = clamp(1.0 - abs(c.r - c.g * 1.18) * 3.2, 0.0, 1.0) * smoothstep(0.12, 0.72, l);
    c += vec3(0.024, 0.008, -0.014) * skinMask;
    c += vec3(-0.008, 0.004, 0.010) * clamp(1.0 - l * 2.4, 0.0, 1.0) * blackProtect;
    vec3 knee = pow(max(vec3(0.0001), c), vec3(0.95));
    c = mix(c, knee, hiMask * (0.28 + highlightRolloff * 0.22));
  } else if (cameraCurveId < 1.5) {
    // 1: Sony VENICE 2 8K (S-Gamut3.Cine — Surgical Crispness, Cool Sapphire Shadows, Clean Whites)
    c = max(vec3(0.0), (c - vec3(0.42)) * 1.09 + vec3(0.42));
    float coolShadow = clamp(1.0 - l * 2.0, 0.0, 1.0) * blackProtect;
    c += vec3(-0.020, 0.004, 0.030) * coolShadow;
    c.b *= 1.025;
    c.r *= 0.985;
  } else if (cameraCurveId < 2.5) {
    // 2: RED V-RAPTOR 8K VV (IPP2 — Aggressive Toe Snap, Fiery Crimson & Warm Gold Contrast)
    c = pow(max(vec3(0.0001), c), vec3(1.10));
    c = max(vec3(0.0), (c - vec3(0.40)) * 1.12 + vec3(0.40));
    c.r *= 1.06;
    c.g *= 1.00;
    c.b *= 0.94;
    c += vec3(0.018, 0.006, -0.012) * midMask;
  } else if (cameraCurveId < 3.5) {
    // 3: Canon EOS C500 Mark II (Cinema Gamut — Lush Warm Ruby/Amber Skin Glow & Creamy Midtones)
    c = max(vec3(0.0), (c - vec3(0.40)) * 1.06 + vec3(0.40));
    c += vec3(0.032, 0.012, -0.022) * smoothstep(0.14, 0.80, l) * (1.0 - hiMask * 0.6);
    c.r *= 1.04;
    c.b *= 0.96;
  } else if (cameraCurveId < 4.5) {
    // 4: Blackmagic URSA Cine 12K LF (Gen 5 — Rich Crisp Shadows with Pastel Highlight Rolloff)
    c = max(vec3(0.0), (c - vec3(0.40)) * 1.07 + vec3(0.40));
    float hiDesat = smoothstep(0.66, 0.98, l) * 0.26;
    c = mix(c, vec3(l * 0.98), hiDesat);
    c += vec3(-0.006, 0.006, 0.014) * clamp(1.0 - l * 2.2, 0.0, 1.0) * blackProtect;
  } else if (cameraCurveId < 5.5) {
    // 5: Panasonic VariCam 35 (V-Log — Deep Emerald-Teal Nocturnal Shadows + Crisp Highlight Pop)
    c = max(vec3(0.0), (c - vec3(0.40)) * 1.07 + vec3(0.40));
    c += vec3(-0.022, 0.024, 0.022) * clamp(1.0 - l * 2.1, 0.0, 1.0) * blackProtect;
    c += vec3(0.012, 0.008, -0.006) * hiMask;
  } else {
    // 6: Prismatone System 65 (65mm Photochemical — Deep Technicolor Dye Contrast & Crimson/Cobalt Richness)
    c = pow(max(vec3(0.0001), c), vec3(1.08));
    c = max(vec3(0.0), (c - vec3(0.40)) * 1.12 + vec3(0.40));
    float outLum = luma(c);
    c = mix(vec3(outLum), c, 1.12);
    c += vec3(0.014, -0.004, 0.012) * hiMask;
  }
  return max(vec3(0.0), c);
}

// Midtone-Preserving Filmic Characteristic Curve (True Shadows -> Clean Unblown Highlights)
vec3 filmicToneMap(vec3 x, float contrast, float rolloff, float toeStrength) {
  vec3 c = max(vec3(0.0), (x - vec3(0.40)) * contrast + vec3(0.40));
  vec3 toe = pow(clamp(c / 0.20, 0.0, 1.0), vec3(1.0 + toeStrength * 0.28)) * 0.20;
  c = mix(c, toe, step(c, vec3(0.20)));
  // Highlight shoulder rolloff without brightening 0.18-0.55 midtones or faces
  float shoulder = mix(0.55, 0.15, clamp(rolloff, 0.0, 1.0));
  vec3 hiExcess = max(vec3(0.0), c - vec3(0.58));
  vec3 mapped = min(c, vec3(0.58)) + (hiExcess / (vec3(1.0) + hiExcess * (1.15 + shoulder)));
  return clamp(mapped, vec3(0.0), vec3(1.0));
}

void main() {
  vec4 u0 = u_data[0];
  vec4 u1 = u_data[1];
  vec4 u2 = u_data[2];
  vec4 u3 = u_data[3];
  vec4 u4 = u_data[4];
  vec4 u5 = u_data[5];
  vec4 u6 = u_data[6];
  vec4 u7 = u_data[7];
  vec3 m0 = u_data[8].xyz;
  vec3 m1 = u_data[9].xyz;
  vec3 m2 = u_data[10].xyz;
  vec4 u11 = u_data[11];
  vec4 u12 = u_data[12];
  vec4 u13 = u_data[13];
  vec4 u14 = u_data[14];
  vec4 u15 = u_data[15];

  // Spectral Sensor & Lens Optical Uniforms (u16..u19)
  vec4 u16 = u_data[16];
  vec4 u17 = u_data[17];
  vec4 u18 = u_data[18];
  vec4 u19 = u_data[19];

  vec3 sensorSpectralPeaks = u16.xyz;
  float sensorIrCutNm = u16.w;

  vec3 sensorSpectralWeights = u17.xyz;
  float sensorIrRejection = u17.w;

  vec3 lensTransmissionRgb = u18.xyz;
  float focalLengthMm = max(14.0, floor(u18.w));
  float lensWarmthShift = fract(u18.w) - 0.5;

  float cfaCrosstalk = u19.x;
  vec2 lightSourceUV = u19.yz;
  float signedLightIntensity = u19.w;
  bool isSpectralReconstruction = signedLightIntensity > 0.0;
  float lightIntensity = abs(signedLightIntensity);

  // 6 Calibrated Lens Ghost Elements from Lookup Table (u20..u31)
  vec4 ghostGeo[6] = vec4[6](u_data[20], u_data[21], u_data[22], u_data[23], u_data[24], u_data[25]);
  vec4 ghostOpt[6] = vec4[6](u_data[26], u_data[27], u_data[28], u_data[29], u_data[30], u_data[31]);

  float encPrintLut = u_data[8].w;
  float intPrintLut = floor(encPrintLut + 0.0005);
  float hollywoodLutId = floor(intPrintLut * 0.1 + 0.0005);
  float printStockId = intPrintLut - hollywoodLutId * 10.0;
  float hollywoodLutBlend = clamp((encPrintLut - intPrintLut) / 0.99, 0.0, 1.0);
  float targetAspect = u_data[9].w;
  float gateMode = u_data[10].w < 0.0 ? 1.0 : 0.0;
  float sensorFramingScale = max(0.65, abs(u_data[10].w));

  vec2 res = u0.xy;
  float timeSec = u0.z;
  float splitWipeX = u0.w;
  float canvasAspect = res.x / max(1.0, res.y);

  // Decode qualityMode and desqueezeMode from u7.w
  float encodedMode = u7.w;
  float desqueezeMode = floor(encodedMode * 0.5 + 0.001);
  bool isFinalQuality = (encodedMode - desqueezeMode * 2.0) > 0.5;

  // Decode focusPeaking and cameraCurveId from u5.w
  float encodedCam = u5.w;
  float cameraCurveId = floor(encodedCam * 0.5 + 0.001);
  float focusPeaking = encodedCam - cameraCurveId * 2.0;

  // Compute Cinema Aspect Ratio Gate Mask
  bool outsideGate = false;
  bool onGateLine = false;
  if (targetAspect > 0.1) {
    if (targetAspect > canvasAspect + 0.02) {
      float activeHeight = canvasAspect / targetAspect;
      float barH = (1.0 - activeHeight) * 0.5;
      if (v_uv.y < barH || v_uv.y > (1.0 - barH)) {
        outsideGate = true;
      }
      if (abs(v_uv.y - barH) * res.y < 1.2 || abs(v_uv.y - (1.0 - barH)) * res.y < 1.2) {
        onGateLine = true;
      }
    } else if (targetAspect < canvasAspect - 0.02) {
      float activeWidth = targetAspect / canvasAspect;
      float barW = (1.0 - activeWidth) * 0.5;
      if (v_uv.x < barW || v_uv.x > (1.0 - barW)) {
        outsideGate = true;
      }
      if (abs(v_uv.x - barW) * res.x < 1.2 || abs(v_uv.x - (1.0 - barW)) * res.x < 1.2) {
        onGateLine = true;
      }
    }
  }

  if (outsideGate && gateMode < 0.5) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // A/B Split Wipe Comparison
  if (splitWipeX >= 0.0) {
    float lineDist = abs(v_uv.x - splitWipeX) * res.x;
    if (lineDist < 1.5) {
      fragColor = vec4(0.96, 0.62, 0.04, 1.0);
      return;
    }
    if (v_uv.x < splitWipeX) {
      vec3 rawCol = texture(u_sourceTex, v_uv).rgb;
      if (outsideGate && gateMode >= 0.5) {
        rawCol *= 0.22;
      }
      if (onGateLine && gateMode >= 0.5) {
        rawCol = mix(rawCol, vec3(0.96, 0.68, 0.15), 0.75);
      }
      fragColor = vec4(rawCol, 1.0);
      return;
    }
  }

  float k1 = u1.x;
  float k2 = u1.y;
  float caAmount = u1.z;
  float squeeze = max(1.0, u1.w);

  float vigAmount = u2.x;
  float vigFalloff = u2.y;
  float sharpness = u2.z;
  float cornerSoftness = u2.w;

  float bokehRadius = u3.x;
  float bokehSwirl = u3.y;
  float focusDist = u3.z;
  float fStop = max(1.0, u3.w);

  float flareIntensity = u4.x;
  float bloomIntensity = u4.y;
  float halationIntensity = u4.z;
  float focusBreathing = u4.w;

  vec3 flareTint = u5.xyz;

  float tempShift = u6.x;
  float tintShift = u6.y;
  float contrast = u6.z;
  float saturation = u6.w;

  float highlightRolloff = u7.x;
  float sensorIso = u7.y;
  float grainAmount = u7.z;

  float baseIso = max(100.0, floor(u11.w + 0.0001));
  float fpnAmount = fract(u11.w) * 0.1;

  float imageCircleCutoffNorm = max(0.45, u12.x);
  float irisBlades = clamp(floor(u12.y + 0.0001), 5.0, 18.0);
  float catsEyeFactor = clamp(fract(u12.y), 0.0, 0.95);
  float bokehRimBrightness = u12.z;
  float onionRingIntensity = u12.w;

  float sphericalAberration = u13.x;
  float veilingGlare = u13.y;
  float exposureCompEv = u13.z;
  float gateWeave = u13.w;

  float filmToe = u14.x;
  float filmShoulder = u14.y;
  float grainSize = clamp(u14.z, 0.2, 1.2);
  float ghostCount = clamp(floor(u14.w + 0.0001), 2.0, 12.0);
  float fieldCurvature = clamp(fract(u14.w), 0.0, 0.95);

  vec3 filmHighlightTint = u15.xyz;
  float olpfStrength = clamp(floor(u15.w + 0.0001) * 0.01, 0.05, 0.95);
  float chromaNoiseRatio = clamp(fract(u15.w), 0.05, 0.45);

  vec2 distortedUV = projectAnamorphicAndDistortUV(
    v_uv,
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
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec2 centerVec = distortedUV - vec2(0.5, 0.5);
  // Aspect-corrected radial distance in physical sensor coordinates
  vec2 physicalSensorVec = vec2(centerVec.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.48))), centerVec.y);
  float radialDist = length(physicalSensorVec) * 1.48;

  // Natural Cinema Depth Map + Petzval Parabolic Field Curvature + Edge Coma
  vec2 subjectCenter = vec2(0.5, clamp(0.68 - (focusDist - 1.5) * 0.06, 0.35, 0.72));
  float subjectEllipticalDist = length((distortedUV - subjectCenter) * vec2(0.85, 1.25));
  float depthDefocus = smoothstep(0.18, 0.78, subjectEllipticalDist);
  float apertureFactor = clamp((2.8 / max(1.1, fStop)) - 0.18, 0.0, 2.2);

  // Petzval Parabolic Field Curvature: curves focal plane inward toward corners (r^2 bowl)
  float petzvalDefocus = fieldCurvature * (radialDist * radialDist) * apertureFactor * 0.62;
  float dofBlur = bokehRadius * depthDefocus * apertureFactor * 0.72;
  float edgeComa = cornerSoftness * pow(radialDist, 2.0) * 0.45;
  float totalBlurRadius = clamp(dofBlur + petzvalDefocus + edgeComa, 0.0, 1.2) * 0.0112;

  float stoppedDownPolygonFactor = clamp((fStop - 2.2) / 4.5, 0.0, 0.85);

  // Aspect-Corrected Anamorphic Bokeh Scaling + Tangential Field-Curvature Astigmatism
  float rawSensorExtraSqueeze = desqueezeMode >= 1.5 ? sqrt(squeeze) : 1.0;
  float bokehHorizSqueeze = pow(squeeze, 0.65) * rawSensorExtraSqueeze;
  float bokehVertStretch = pow(squeeze, 0.35);

  vec3 accumColor = vec3(0.0);
  float totalWeight = 0.0;
  int sampleCount = isFinalQuality ? 24 : 16;

  // Radial unit vector for Cat's-Eye mechanical clipping & Petzval tangential astigmatism
  vec2 radialDir = length(physicalSensorVec) > 0.001 ? normalize(physicalSensorVec) : vec2(1.0, 0.0);
  vec2 tangentDir = vec2(-radialDir.y, radialDir.x);

  for (int i = 0; i < 24; i++) {
    if (i >= sampleCount) break;
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(sampleCount));
    float theta = fi * 2.3999632 + (bokehSwirl + fieldCurvature * 0.35) * radialDist * 1.95;

    // Polygonal aperture blade shaping when stopped down
    float sector = 6.2831853 / irisBlades;
    float localAngle = mod(theta, sector) - sector * 0.5;
    float polyRadius = cos(3.1415926 / irisBlades) / max(0.5, cos(localAngle));
    float shapedR = r * mix(1.0, polyRadius, stoppedDownPolygonFactor);

    vec2 diskPt = vec2(cos(theta), sin(theta)) * shapedR;

    // Tangential Petzval astigmatism & Cat's-eye entrance pupil mechanical clipping
    float radialProj = dot(diskPt, radialDir);
    float tangentProj = dot(diskPt, tangentDir);
    float catsEyeScale = 1.0 - clamp(catsEyeFactor * radialDist * 0.58 * abs(radialProj), 0.0, 0.62);
    float astigScale = 1.0 + fieldCurvature * radialDist * 0.45;
    vec2 shapedDisk = radialDir * (radialProj * catsEyeScale) + tangentDir * (tangentProj * astigScale);

    vec2 offset = shapedDisk * totalBlurRadius;
    offset.x = (offset.x / canvasAspect) / bokehHorizSqueeze;
    offset.y = offset.y * bokehVertStretch;

    vec3 sampleCol = sampleChromatic(distortedUV + offset, caAmount, squeeze, fieldCurvature);
    float sampleLum = luma(sampleCol);

    float rimBoost = 1.0 + smoothstep(0.68, 0.98, r) * bokehRimBrightness;
    float onionWave = 1.0 + sin(r * 18.8495) * onionRingIntensity * 0.28;
    float bokehWeight = (1.0 + pow(max(0.0, sampleLum - 0.56), 2.2) * (7.5 * bokehRadius)) * rimBoost * onionWave;
    accumColor += sampleCol * bokehWeight;
    totalWeight += bokehWeight;
  }

  vec3 color = accumColor / max(0.0001, totalWeight);

  // Scene-Linear Exposure Compensation (EV stops + ISO push/pull sensitivity gain)
  float isoGainStops = clamp(log2(clamp(sensorIso / max(100.0, baseIso), 0.125, 8.0)) * 0.42, -1.2, 1.5);
  color *= exp2(clamp(exposureCompEv + isoGainStops, -3.5, 3.5));
  float centerLuma = luma(color);

  // Wide-Open Spherical Aberration Halation Glow (specular highlight edges only)
  float wideOpenGlow = sphericalAberration * clamp(2.4 / fStop, 0.2, 1.35) * 0.075;
  if (wideOpenGlow > 0.01) {
    color += max(vec3(0.0), color - vec3(0.76)) * wideOpenGlow;
  }

  // Camera Optical Low-Pass Filter (OLPF) vs Fine Optical MTF Micro-Contrast
  vec2 texel = 1.0 / res;
  float horizMtfWeight = 1.0 / max(1.0, squeeze * 0.65);
  vec3 n = texture(u_sourceTex, distortedUV + vec2(0.0, -texel.y)).rgb;
  vec3 s = texture(u_sourceTex, distortedUV + vec2(0.0,  texel.y)).rgb;
  vec3 e = texture(u_sourceTex, distortedUV + vec2( texel.x, 0.0)).rgb;
  vec3 w = texture(u_sourceTex, distortedUV + vec2(-texel.x, 0.0)).rgb;
  vec3 neighbors = (n + s + (e + w) * horizMtfWeight) / (2.0 + 2.0 * horizMtfWeight);

  // Strong OLPF (ARRI / Canon / VariCam) gently rolls off pixel-level Nyquist aliasing, while weak OLPF (RED / System 65) boosts acutance
  float olpfBlend = clamp((olpfStrength - 0.55) * 0.35, -0.12, 0.18);
  color = mix(color, neighbors, max(0.0, olpfBlend));

  float sharpMaskStrength =
    (sharpness * (1.18 - olpfStrength * 0.42)) *
    (1.0 - clamp(depthDefocus * 0.8 + radialDist * (cornerSoftness + fieldCurvature * 0.35), 0.0, 0.95)) *
    0.58;
  if (sharpMaskStrength > 0.01) {
    color = color + (color - neighbors) * sharpMaskStrength;
  }

  // Edge-Gated Multi-Radius 35mm Photochemical Halation & Optical Highlight Bloom
  if (bloomIntensity > 0.01 || halationIntensity > 0.01) {
    vec3 bloomAccum = vec3(0.0);
    float halationEdgeAccum = 0.0;
    float innerR = 0.0045;
    float outerR = 0.0115;
    for (int j = 0; j < 12; j++) {
      float ang = float(j) * 0.5235988;
      vec2 dir = vec2(cos(ang) / canvasAspect, sin(ang));
      vec3 c1 = texture(u_sourceTex, clamp(distortedUV + dir * innerR, vec2(0.001), vec2(0.999))).rgb;
      vec3 c2 = texture(u_sourceTex, clamp(distortedUV + dir * outerR, vec2(0.001), vec2(0.999))).rgb;
      float l1 = smoothstep(0.82, 0.99, luma(c1));
      float l2 = smoothstep(0.78, 0.98, luma(c2));
      bloomAccum += c1 * l1 + c2 * l2 * 0.55;
      float edgeContrast1 = max(0.0, l1 - centerLuma * 0.72);
      float edgeContrast2 = max(0.0, l2 - centerLuma * 0.65);
      halationEdgeAccum += edgeContrast1 * 0.65 + edgeContrast2 * 0.40;
    }
    bloomAccum /= 12.0;
    halationEdgeAccum /= 12.0;
    color += bloomAccum * bloomIntensity * 0.24;
    color += vec3(1.0, 0.21, 0.035) * halationEdgeAccum * halationIntensity * 0.95;
  }

  // Spectral-Based Color Reconstruction vs Legacy RGB Color Matrix
  if (isSpectralReconstruction) {
    color = performSpectralColorReconstruction(
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
    // Legacy Combined Camera + Lens Color Science Matrix
    vec3 matrixCol = vec3(
      dot(color, m0),
      dot(color, m1),
      dot(color, m2)
    );
    color = max(vec3(0.0), matrixCol);
  }

  // Scene-Linear White Balance
  color.r *= (1.0 + tempShift * 0.32);
  color.b *= (1.0 - tempShift * 0.32);
  color.g *= (1.0 + tintShift * 0.22);

  // Apply Camera-Specific Sensor Transfer Curve & Color Science Identity (ARRI LogC4, Sony S-Log3, RED Log3G10, Canon Log2, BMD Gen5, VariCam V-Log, System 65)
  color = applyCameraSensorTransfer(color, cameraCurveId, highlightRolloff);

  // Signature Film Negative + Print Stock Pipeline
  float effectiveContrast = contrast;
  float effectiveSat = saturation;
  float toeStrength = filmToe;
  float rolloffStrength = mix(highlightRolloff, filmShoulder, 0.5);
  vec3 shadowTone = u11.xyz;
  vec3 highlightTone = filmHighlightTint;

  if (printStockId < 0.5) {
    effectiveContrast *= 1.08;
    toeStrength = max(toeStrength, 0.65);
    shadowTone += vec3(-0.008, 0.010, 0.028);
    highlightTone *= vec3(1.03, 0.995, 0.92);
  } else if (printStockId < 1.5) {
    toeStrength = min(toeStrength, 0.30);
    highlightTone *= vec3(1.0, 1.0, 0.98);
  } else if (printStockId < 2.5) {
    effectiveContrast *= 1.03;
    shadowTone += vec3(-0.010, 0.018, 0.016);
    highlightTone *= vec3(1.02, 1.00, 0.95);
  } else if (printStockId < 3.5) {
    effectiveContrast *= 1.26;
    effectiveSat *= 0.52;
    toeStrength = 0.85;
    shadowTone += vec3(-0.005, 0.002, 0.008);
    highlightTone *= vec3(0.98, 0.99, 1.02);
  } else {
    effectiveContrast *= 1.12;
    toeStrength = max(toeStrength, 0.60);
    shadowTone += vec3(-0.018, 0.022, 0.042);
    highlightTone *= vec3(1.06, 0.97, 0.86);
  }

  color = filmicToneMap(color, effectiveContrast, rolloffStrength, toeStrength);

  float lumNow = luma(color);
  float blackProtectMask = smoothstep(0.012, 0.16, lumNow);
  float shadowMask = clamp(1.0 - lumNow * 2.3, 0.0, 1.0) * blackProtectMask;
  float hiMask = smoothstep(0.45, 0.95, lumNow);
  color = max(vec3(0.0), color + shadowTone * shadowMask);
  color = mix(color, color * highlightTone, hiMask);

  float postLum = luma(color);
  vec3 chromaDiff = color - vec3(postLum);
  color = vec3(postLum) + chromaDiff * effectiveSat;
  float chromaMag = length(chromaDiff);
  color *= (1.0 - clamp(chromaMag * (effectiveSat - 0.95) * 0.16, 0.0, 0.14));

  // Colorimetric Hollywood Cinema Show LUT Grade + Smooth Blend Integration
  color = applyHollywoodCinemaLut(color, hollywoodLutId, hollywoodLutBlend);

  // Post-LUT Optical Glass/Element Stage: Camera-Captured Anamorphic Streaks, Spherical Starbursts, Ghosts & Veiling Glare
  // Evaluated post-tonemap so vibrant cylindrical cyan/gold streaks preserve brilliance without compressing or lifting shadows.
  if (flareIntensity > 0.005 || veilingGlare > 0.005) {
    float diffractionAngleDeg = atan(lightSourceUV.y - 0.5, lightSourceUV.x - 0.5) * 57.2957795;
    vec3 physFlare = evaluateCapturedLensFlareAndGlare(
      u_sourceTex,
      distortedUV,
      diffractionAngleDeg,
      fStop,
      irisBlades,
      squeeze,
      canvasAspect,
      flareIntensity,
      veilingGlare,
      flareTint,
      ghostGeo,
      ghostOpt
    );
    if ((int(floor(hollywoodLutId + 0.5)) == 8 && hollywoodLutBlend > 0.001) || effectiveSat <= 0.02) {
      float flareDesat = effectiveSat <= 0.02 ? 1.0 : hollywoodLutBlend;
      physFlare = mix(physFlare, vec3(luma(physFlare)), flareDesat);
    }
    color = clamp(color + physFlare * (1.0 - color * 0.35), vec3(0.0), vec3(1.0));
  }

  // Enforce clean panchromatic monochrome when B&W (saturation == 0) is active
  if (effectiveSat <= 0.02) {
    float bwMask = clamp(1.0 - effectiveSat / 0.02, 0.0, 1.0);
    float bwLum = dot(color, vec3(0.28, 0.60, 0.12));
    color = mix(color, vec3(bwLum), bwMask);
  }

  // Aspect-Corrected Elliptical + Cos^4(theta) + Mechanical Cat's-Eye Optical Vignetting Curvature
  // On spherical lenses, vignette is circular in physical sensor mm space; on anamorphic lenses, front cylindrical element shapes an elliptical entrance pupil
  vec2 vigCoord = vec2(
    centerVec.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.42))),
    centerVec.y * 1.08
  );
  float vigR = length(vigCoord) * 1.42;
  float cosTheta = cos(clamp(vigR * 0.54, 0.0, 1.08));
  float cos4Illum = pow(cosTheta, 4.0);
  float vigCurvePower = clamp(vigFalloff * 0.92, 0.65, 2.8);
  float profileVigDrop = vigAmount * (0.68 * pow(clamp(vigR, 0.0, 1.35), vigCurvePower) + 0.32 * (1.0 - cos4Illum));

  // Mechanical Cat's-Eye entrance pupil corner shading (strongest wide open, clears when stopping down iris)
  float wideOpenIris = clamp(2.8 / max(1.1, fStop), 0.25, 1.3);
  float catsEyeCornerDrop = catsEyeFactor * wideOpenIris * smoothstep(0.56, 1.18, vigR) * 0.34;
  float vigFactor = clamp(1.0 - profileVigDrop - catsEyeCornerDrop, 0.06, 1.0);

  // Physical Circular Image-Circle Barrel Cutoff (when S35 glass is mounted on LF/VV/65mm sensor)
  float circularSensorRadius = length(vec2(centerVec.x * (canvasAspect / 1.7778), centerVec.y)) * 1.4142;
  float icCutoffMask = 1.0 - smoothstep(imageCircleCutoffNorm - 0.10, imageCircleCutoffNorm + 0.03, circularSensorRadius);
  color *= vigFactor * mix(0.03, 1.0, icCutoffMask);

  // Organic Silver Halide Film Grain + Camera-Specific CMOS Read/Chroma/Fixed-Pattern Noise
  float isoMultiplier = sqrt(max(0.5, sensorIso / baseIso));
  float effectiveGrain = grainAmount * 0.075 * clamp(isoMultiplier, 0.65, 3.4);
  if (effectiveGrain > 0.001 || fpnAmount > 0.002) {
    float freqScale = mix(1.35, 0.62, clamp(grainSize, 0.2, 1.0));
    vec2 grainCoord = floor(v_uv * res * freqScale) + vec2(timeSec * 41.3, timeSec * 17.9);
    float nLuma = (hash12(grainCoord) + hash12(grainCoord * 0.5 + vec2(7.3, 19.1)) - 1.0) * 0.65;
    float nChromaR = hash12(grainCoord + vec2(13.1, 7.7)) - 0.5;
    float nChromaB = hash12(grainCoord + vec2(29.4, 19.3)) - 0.5;

    // Camera CMOS Row/Column Fixed-Pattern Noise (amplified at high EI/ISO in shadows)
    float rowNoise = (hash12(vec2(floor(v_uv.y * res.y), 3.1)) - 0.5) * fpnAmount * isoMultiplier;
    float colNoise = (hash12(vec2(floor(v_uv.x * res.x), 8.7)) - 0.5) * fpnAmount * isoMultiplier * 0.75;
    float cmosFpn = (rowNoise + colNoise) * clamp(1.2 - postLum * 1.8, 0.15, 1.0);

    float midtoneWeight = 3.6 * postLum * (1.0 - postLum * 0.75) + 0.15;
    color += vec3(
      nLuma + nChromaR * chromaNoiseRatio * 1.4,
      nLuma,
      nLuma + nChromaB * chromaNoiseRatio * 1.4
    ) * effectiveGrain * midtoneWeight + vec3(cmosFpn);
  }

  // Focus Peaking Assist Overlay
  if (focusPeaking > 0.5) {
    float cL = luma(texture(u_sourceTex, distortedUV + vec2(-texel.x, 0.0)).rgb);
    float cR = luma(texture(u_sourceTex, distortedUV + vec2( texel.x, 0.0)).rgb);
    float cU = luma(texture(u_sourceTex, distortedUV + vec2(0.0, -texel.y)).rgb);
    float cD = luma(texture(u_sourceTex, distortedUV + vec2(0.0,  texel.y)).rgb);
    float edgeMag = abs(cR - cL) + abs(cD - cU);
    if (edgeMag > 0.14) {
      color = mix(color, vec3(0.0, 0.98, 0.75), clamp((edgeMag - 0.14) * 3.5, 0.0, 0.9));
    }
  }

  color = clamp(color, vec3(0.0), vec3(1.0));

  if (outsideGate && gateMode >= 0.5) {
    color *= 0.22;
  }
  if (onGateLine && gateMode >= 0.5) {
    color = mix(color, vec3(0.96, 0.68, 0.15), 0.82);
  }

  fragColor = vec4(color, 1.0);
}
`;


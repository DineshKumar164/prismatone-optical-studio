import { HOLLYWOOD_CINEMA_LUT_GLSL_MODULE } from './hollywood-luts.glsl';

/**
 * WebGL2 (GLSL ES 3.00) Vertex & Fragment Shaders for MobileCameraStreamLut.
 * Includes:
 * - Circle-of-Confusion (CoC) Depth-of-Field Bokeh Blur controlled by u_apertureFStop + u_focusPoint
 * - Live Camera-Captured Anamorphic Specular Flare & Veiling Glare extracted from bright lights/reflections
 * - Crisp Micro-Contrast & Hollywood Cinema Show LUT grading with continuous u_lutBlend intensity control
 */

export const LUT_CAMERA_VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 POS[6] = vec2[6](
  vec2(-1.0, -1.0),
  vec2( 1.0, -1.0),
  vec2(-1.0,  1.0),
  vec2(-1.0,  1.0),
  vec2( 1.0, -1.0),
  vec2( 1.0,  1.0)
);
out vec2 v_uv;
void main() {
  vec2 p = POS[gl_VertexID];
  v_uv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

export const LUT_CAMERA_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_cameraTex;
uniform int u_lutMode;        // 0 = raw crisp sensor, 1..8 = Hollywood Show LUT ID
uniform float u_lutBlend;     // 0.0 .. 1.0 continuous LUT intensity blend
uniform int u_mirrorX;        // 1 = mirror horizontally (front selfie cam)
uniform vec2 u_videoAspect;   // (srcAspect, canvasAspect) for cover crop
uniform float u_time;
uniform float u_apertureFStop; // Lens Aperture N (1.4 .. 16.0)
uniform vec2 u_focusPoint;     // Normalized focus plane center UV (0..1)
uniform float u_anamorphicSqueeze; // 1.0 = Spherical (circular bokeh + radial glare), 2.0 = Anamorphic (oval bokeh + horizontal streak)
uniform float u_bwAmount;      // 0.0 = Color, 1.0 = Panchromatic B&W
uniform float u_isoGain;       // 100.0 .. 6400.0 ISO (800 = neutral device base)
uniform float u_contrast;      // 0.60 .. 1.60 (1.00 = neutral device contrast)
out vec4 outColor;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float evalCamSpecular(vec3 col) {
  float peak = max(col.r, max(col.g, col.b));
  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  float sig = mix(lum, peak, 0.45);
  float s = smoothstep(0.86, 0.99, sig);
  return s * s * s * (0.65 + 0.65 * peak);
}

${HOLLYWOOD_CINEMA_LUT_GLSL_MODULE}

// Maps viewport UV into cover-cropped mirrored source video UV
vec2 mapToSourceUV(vec2 screenUv) {
  vec2 uv = screenUv;
  if (u_mirrorX == 1) {
    uv.x = 1.0 - uv.x;
  }
  float srcAspect = max(0.1, u_videoAspect.x);
  float dstAspect = max(0.1, u_videoAspect.y);
  vec2 centered = uv - 0.5;
  if (srcAspect > dstAspect) {
    centered.x *= dstAspect / srcAspect;
  } else {
    centered.y *= srcAspect / dstAspect;
  }
  return clamp(centered + 0.5, vec2(0.001), vec2(0.999));
}

// Physically-inspired thin-lens Circle-of-Confusion (CoC) blur radius in screen UV units
float computeCircleOfConfusion(vec2 screenUv, float canvasAspect) {
  vec2 delta = (screenUv - u_focusPoint) * vec2(canvasAspect, 1.0);
  float planeDist = length(delta * vec2(0.88, 1.12));
  float outOfFocusZone = smoothstep(0.14, 0.62, planeDist);

  float fStop = max(1.2, u_apertureFStop);
  float apertureScale = clamp((2.8 / fStop) - 0.16, 0.0, 1.85);
  return clamp(outOfFocusZone * apertureScale * 0.014, 0.0, 0.025);
}

void main() {
  float canvasAspect = max(0.1, u_videoAspect.y);
  float cocRadius = computeCircleOfConfusion(v_uv, canvasAspect);
  float anamWeight = smoothstep(1.05, 1.45, max(1.0, u_anamorphicSqueeze));
  float sphericalWeight = 1.0 - anamWeight;

  vec3 col;
  if (cocRadius <= 0.0005) {
    col = texture(u_cameraTex, mapToSourceUV(v_uv)).rgb;
  } else {
    // 32-tap Golden-Angle Vogel Disk Bokeh Convolution (Circular 1:1 on Spherical, 2:1 Tall Oval on Anamorphic)
    vec3 accumColor = vec3(0.0);
    float totalWeight = 0.0;
    const float GOLDEN_ANGLE = 2.3999632;
    float ovalSqueezeX = mix(1.0, 1.65, anamWeight);
    float ovalStretchY = mix(1.0, 1.25, anamWeight);

    for (int i = 0; i < 32; i++) {
      float fi = float(i);
      float r = sqrt((fi + 0.5) / 32.0);
      float theta = fi * GOLDEN_ANGLE;

      vec2 diskOffset = vec2(
        cos(theta) / (canvasAspect * ovalSqueezeX),
        sin(theta) * ovalStretchY
      ) * (r * cocRadius);
      vec2 sampleScreenUv = clamp(v_uv + diskOffset, vec2(0.0), vec2(1.0));
      vec3 s = texture(u_cameraTex, mapToSourceUV(sampleScreenUv)).rgb;

      float sampleLuma = dot(s, vec3(0.2126, 0.7152, 0.0722));
      float rimWeight = 1.0 + smoothstep(0.65, 1.0, r) * 0.22;
      float specularBoost = 1.0 + pow(max(0.0, sampleLuma - 0.62), 2.0) * 6.5;
      float w = rimWeight * specularBoost;

      accumColor += s * w;
      totalWeight += w;
    }

    col = accumColor / max(0.0001, totalWeight);
  }

  // ISO Sensitivity Exposure Push/Pull (800 ISO = 1.0x native untouched device exposure)
  float isoRatio = clamp(u_isoGain / 800.0, 0.125, 8.0);
  if (abs(isoRatio - 1.0) > 0.015) {
    float expScale = pow(isoRatio, 0.36);
    vec3 pushed = col * expScale;
    // Soft highlight shoulder rollback when pushing high ISO
    col = expScale > 1.0
      ? clamp((pushed * (1.0 + 0.22)) / (vec3(1.0) + pushed * 0.22), vec3(0.0), vec3(1.0))
      : clamp(pushed, vec3(0.0), vec3(1.0));
  }

  // User Contrast Curve (1.00 = neutral untouched device contrast)
  float ctr = clamp(u_contrast, 0.5, 1.75);
  if (abs(ctr - 1.0) > 0.005) {
    col = clamp((col - vec3(0.42)) * ctr + vec3(0.42), vec3(0.0), vec3(1.0));
  }

  // Natively (u_lutMode == 0), color remains pure device color; LUTs blend cleanly when selected
  float blend = clamp(u_lutBlend, 0.0, 1.0);
  if (u_lutMode > 0 && blend > 0.001) {
    col = applyHollywoodCinemaLut(col, float(u_lutMode), blend);
  }

  // Live Camera-Captured Anamorphic Cylindrical Streak vs Spherical Starburst & Halo (Post-tonemap screen glow)
  vec3 camGlare = vec3(0.0);
  float glareJitter = hash12(v_uv * 913.7 + vec2(u_time * 0.01)) - 0.5;
  if (anamWeight > 0.02) {
    vec3 coreStreak = vec3(0.0);
    vec3 auraStreak = vec3(0.0);
    float maxWing = clamp(0.28 / max(0.65, canvasAspect), 0.22, 0.42);
    float slitY = 0.0015;
    float auraY = 0.0052;

    for (int k = -24; k <= 24; k++) {
      if (k == 0) continue;
      float nk = (float(k) + glareJitter * 0.85) / 24.0;
      float dx = nk * maxWing;
      vec2 baseUV = v_uv + vec2(dx, 0.0);
      if (baseUV.x < 0.002 || baseUV.x > 0.998 || baseUV.y < 0.002 || baseUV.y > 0.998) continue;

      vec3 cMid = texture(u_cameraTex, mapToSourceUV(baseUV)).rgb;
      vec3 cTop = texture(u_cameraTex, mapToSourceUV(clamp(baseUV + vec2(0.0, slitY), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cBot = texture(u_cameraTex, mapToSourceUV(clamp(baseUV - vec2(0.0, slitY), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cSheathU = texture(u_cameraTex, mapToSourceUV(clamp(baseUV + vec2(0.0, auraY), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cSheathD = texture(u_cameraTex, mapToSourceUV(clamp(baseUV - vec2(0.0, auraY), vec2(0.002), vec2(0.998)))).rgb;
      vec3 slitCol = cMid * 0.56 + cTop * 0.22 + cBot * 0.22;
      vec3 sheathCol = (cSheathU + cSheathD) * 0.5;

      float specCore = evalCamSpecular(slitCol);
      float specAura = evalCamSpecular(sheathCol);
      float srcPeak = max(slitCol.r, max(slitCol.g, slitCol.b));
      vec3 cyanAnam = mix(slitCol, vec3(0.18, 0.55, 1.0) * max(0.45, srcPeak * 1.25), 0.76);
      coreStreak += (cyanAnam + slitCol * 0.22) * (specCore * exp(-abs(nk) * 2.75));
      auraStreak += (sheathCol * vec3(0.22, 0.58, 1.0) * 1.08) * (specAura * exp(-abs(nk) * 1.60));
    }
    camGlare += (coreStreak * 0.042 + auraStreak * 0.018) * anamWeight;
  }

  if (sphericalWeight > 0.02) {
    vec3 starAccum = vec3(0.0);
    float stopped = clamp((u_apertureFStop - 1.4) / 6.6, 0.32, 1.0);
    float rayLen = mix(0.062, 0.125, stopped);
    for (int rIdx = 0; rIdx < 3; rIdx++) {
      float rayAng = 0.28 + float(rIdx) * 1.04719755;
      vec2 rayDir = vec2(cos(rayAng) / canvasAspect, sin(rayAng));
      vec2 perpDir = vec2(-rayDir.y, rayDir.x) * 0.0012;
      for (int s = -9; s <= 9; s++) {
        if (s == 0) continue;
        float ns = (float(s) + glareJitter * 0.75) / 9.0;
        vec2 tapUV = clamp(v_uv + rayDir * (ns * rayLen), vec2(0.002), vec2(0.998));
        vec3 s0 = texture(u_cameraTex, mapToSourceUV(tapUV)).rgb;
        vec3 s1 = texture(u_cameraTex, mapToSourceUV(clamp(tapUV + perpDir, vec2(0.002), vec2(0.998)))).rgb;
        vec3 s2 = texture(u_cameraTex, mapToSourceUV(clamp(tapUV - perpDir, vec2(0.002), vec2(0.998)))).rgb;
        vec3 sCol = s0 * 0.60 + (s1 + s2) * 0.20;
        float spec = evalCamSpecular(sCol);
        starAccum += sCol * (spec * exp(-abs(ns) * 2.40));
      }
    }
    camGlare += starAccum * (0.030 * sphericalWeight * (0.72 + 0.55 * stopped));
  }

  // Soft Captured-Highlight Veiling Halo (Circular isotropic on Spherical, Horizontally Elliptical on Anamorphic)
  vec3 haloAccum = vec3(0.0);
  vec2 haloAniso = vec2(mix(1.0, 1.52, anamWeight), mix(1.0, 0.68, anamWeight));
  for (int j = 0; j < 6; j++) {
    float ang = float(j) * 1.0471975;
    vec2 hUv = clamp(v_uv + vec2(cos(ang) * haloAniso.x / canvasAspect, sin(ang) * haloAniso.y) * 0.040, vec2(0.002), vec2(0.998));
    vec3 hCol = texture(u_cameraTex, mapToSourceUV(hUv)).rgb;
    haloAccum += hCol * evalCamSpecular(hCol);
  }
  camGlare += (haloAccum / 6.0) * mix(0.14, 0.10, anamWeight);
  camGlare = camGlare / (vec3(1.0) + camGlare * 0.90);

  float bwMix = clamp(u_bwAmount, 0.0, 1.0);
  if ((u_lutMode == 8 && blend > 0.001) || bwMix > 0.001) {
    float glareLum = dot(camGlare, vec3(0.2126, 0.7152, 0.0722));
    camGlare = mix(camGlare, vec3(glareLum), max(bwMix, u_lutMode == 8 ? blend : 0.0));
  }
  col = clamp(col + camGlare * (1.0 - col * 0.35), vec3(0.0), vec3(1.0));

  // User-controlled B&W Panchromatic Monochrome (overrides LUT chroma while keeping LUT tonal contrast)
  if (bwMix > 0.001) {
    float panLum = dot(col, vec3(0.28, 0.60, 0.12));
    col = mix(col, vec3(panLum), bwMix);
  }

  // Realistic ISO-coupled Film/Sensor Grain & Optional LUT Vignette (0 vignette when in Device mode)
  float highIsoGrain = max(0.0, sqrt(max(1.0, isoRatio)) - 1.0) * 0.030;
  float lutGrain = (u_lutMode > 0 && blend > 0.001) ? ((u_lutMode == 8 ? 0.032 : 0.018) * blend) : 0.0;
  float totalGrain = highIsoGrain + lutGrain;
  if (totalGrain > 0.001) {
    float grain = (hash12(v_uv * 850.0 + u_time * 24.0) - 0.5) * totalGrain;
    col = clamp(col + grain, vec3(0.0), vec3(1.0));
  }

  if (u_lutMode > 0 && blend > 0.001) {
    float d = length(v_uv - 0.5);
    float vigAmt = u_lutMode == 2 ? 0.28 : (u_lutMode == 9 ? 0.14 : 0.18);
    float vig = 1.0 - smoothstep(0.40, 0.92, d) * (vigAmt * blend);
    col = clamp(col * vig, vec3(0.0), vec3(1.0));
  }

  outColor = vec4(col, 1.0);
}
`;

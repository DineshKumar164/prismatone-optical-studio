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
  vec3 lin = pow(max(vec3(0.0), col), vec3(2.2));
  float linLum = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  float linPeak = max(lin.r, max(lin.g, lin.b));
  float incand = mix(linLum, linPeak, 0.22);
  float core = smoothstep(0.66, 0.985, incand);
  float hot = smoothstep(0.84, 0.995, linLum);
  return core * core * (0.45 + 0.85 * hot);
}

float evalCamPointSpecular(vec3 cCore, vec3 cBgA, vec3 cBgB) {
  vec3 linCore = pow(max(vec3(0.0), cCore), vec3(2.2));
  vec3 linBgA = pow(max(vec3(0.0), cBgA), vec3(2.2));
  vec3 linBgB = pow(max(vec3(0.0), cBgB), vec3(2.2));
  float linLum = dot(linCore, vec3(0.2126, 0.7152, 0.0722));
  float linPeak = max(linCore.r, max(linCore.g, linCore.b));
  if (linLum < 0.64 || linPeak < 0.74) return 0.0;

  float bgLum = 0.5 * (
    dot(linBgA, vec3(0.2126, 0.7152, 0.0722)) +
    dot(linBgB, vec3(0.2126, 0.7152, 0.0722))
  );
  float localPop = clamp((linLum - bgLum) * 2.6, 0.0, 1.0);
  float wideSuppress = 1.0 - 0.65 * smoothstep(0.54, 0.88, bgLum);
  float incand = mix(linLum, linPeak, 0.20);
  float hotCore = pow(smoothstep(0.66, 0.985, incand), 2.2);
  float clipCore = pow(smoothstep(0.84, 0.995, linLum), 2.1);

  return max(
    hotCore * (0.30 + 0.70 * localPop) * wideSuppress,
    clipCore * mix(0.42, 1.0, wideSuppress)
  );
}

vec3 compositeCamFlare(vec3 baseCol, vec3 rawFlare) {
  vec3 phys = max(vec3(0.0), rawFlare);
  float peak = max(phys.r, max(phys.g, phys.b));
  if (peak < 0.001) return baseCol;
  vec3 linBase = pow(max(vec3(0.0), baseCol), vec3(2.2));
  vec3 linAdded = linBase + phys;
  vec3 over = max(vec3(0.0), linAdded - vec3(0.68));
  vec3 shouldered = min(linAdded, vec3(0.68)) + (over / (vec3(1.0) + over * 0.92));
  float mask = smoothstep(0.001, 0.024, peak);
  vec3 finalLin = mix(linBase, shouldered, mask);
  return pow(clamp(finalLin, vec3(0.0), vec3(1.0)), vec3(1.0 / 2.2));
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

  // Live Camera-Captured Anamorphic Cylindrical Streak, Dispersive Ghosts & Fraunhofer Spherical Starburst
  vec3 camGlare = vec3(0.0);
  float glareJitter = hash12(v_uv * 913.7 + vec2(u_time * 0.01)) - 0.5;
  vec3 anamCoatTint = vec3(0.16, 0.54, 1.0);

  if (anamWeight > 0.02) {
    // Continuous, Jitter-Integrated, Soft Blurry Anamorphic Cylindrical Beam (zero chain dots, zero plastic edges)
    vec3 softStreak = vec3(0.0);
    float maxWing = clamp(0.44 / max(0.75, canvasAspect), 0.30, 0.44);
    float bgOffsetY = 0.135;
    const int CAM_HALF = 48;
    float invSteps = 1.0 / float(CAM_HALF);
    float blurY1 = 0.009;
    float blurY2 = 0.020;

    for (int k = -CAM_HALF; k <= CAM_HALF; k++) {
      float t = (float(k) + glareJitter) * invSteps;
      vec2 baseUV = v_uv + vec2(t * maxWing, 0.0);
      if (baseUV.x < 0.003 || baseUV.x > 0.997 || baseUV.y < 0.003 || baseUV.y > 0.997) continue;

      vec3 c0 = texture(u_cameraTex, mapToSourceUV(baseUV)).rgb;
      vec3 cU1 = texture(u_cameraTex, mapToSourceUV(clamp(baseUV + vec2(0.0, blurY1), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cD1 = texture(u_cameraTex, mapToSourceUV(clamp(baseUV - vec2(0.0, blurY1), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cU2 = texture(u_cameraTex, mapToSourceUV(clamp(baseUV + vec2(0.0, blurY2), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cD2 = texture(u_cameraTex, mapToSourceUV(clamp(baseUV - vec2(0.0, blurY2), vec2(0.002), vec2(0.998)))).rgb;
      vec3 slitCol = c0 * 0.30 + (cU1 + cD1) * 0.24 + (cU2 + cD2) * 0.11;
      if (dot(slitCol, vec3(0.2126, 0.7152, 0.0722)) <= 0.76) continue;

      vec3 cBgU = texture(u_cameraTex, mapToSourceUV(clamp(baseUV + vec2(0.0, bgOffsetY), vec2(0.002), vec2(0.998)))).rgb;
      vec3 cBgD = texture(u_cameraTex, mapToSourceUV(clamp(baseUV - vec2(0.0, bgOffsetY), vec2(0.002), vec2(0.998)))).rgb;
      float specVal = evalCamPointSpecular(slitCol, cBgU, cBgD);
      if (specVal <= 0.002) continue;

      float absT = abs(t);
      float tipTaper = pow(clamp(1.0 - absT, 0.0, 1.0), 1.45);
      float env = exp(-absT * 2.25) * tipTaper;
      float wingMix = smoothstep(0.04, 0.28, absT);
      vec3 streakColor = mix(mix(slitCol, vec3(1.0), 0.38), anamCoatTint * 1.18, wingMix);
      softStreak += streakColor * (specVal * env * invSteps);
    }

    vec3 compressedStreak = (softStreak * 6.8) / (vec3(1.0) + softStreak * 3.4);
    camGlare += compressedStreak * anamWeight;

    // Soft Blurry Out-Of-Focus Conjugate Anamorphic Ghost (9-tap bokeh blur, zero sharp cutouts)
    vec2 curOff = v_uv - vec2(0.5);
    float radCur = length(vec2(curOff.x * canvasAspect, curOff.y));
    vec2 gUvG = vec2(0.5) - curOff / 0.62;
    if (gUvG.x > 0.03 && gUvG.x < 0.97 && gUvG.y > 0.03 && gUvG.y < 0.97) {
      vec2 gBlur = vec2(0.032 / max(0.7, canvasAspect), 0.044);
      vec3 gAcc = vec3(0.0);
      float gW = 0.0;
      for (int gx = -1; gx <= 1; gx++) {
        for (int gy = -1; gy <= 1; gy++) {
          vec2 off = vec2(float(gx) * gBlur.x, float(gy) * gBlur.y);
          float w = (gx == 0 && gy == 0) ? 0.24 : ((gx == 0 || gy == 0) ? 0.12 : 0.07);
          vec2 uvR = clamp(vec2(0.5) - curOff / 0.59 + off, vec2(0.01), vec2(0.99));
          vec2 uvG = clamp(gUvG + off, vec2(0.01), vec2(0.99));
          vec2 uvB = clamp(vec2(0.5) - curOff / 0.65 + off, vec2(0.01), vec2(0.99));
          vec3 s = vec3(
            texture(u_cameraTex, mapToSourceUV(uvR)).r,
            texture(u_cameraTex, mapToSourceUV(uvG)).g,
            texture(u_cameraTex, mapToSourceUV(uvB)).b
          );
          float sp = evalCamSpecular(s);
          gAcc += s * (sp * w);
          gW += w;
        }
      }
      vec3 blurredGhost = gAcc / max(0.001, gW);
      float gFade = 1.0 - smoothstep(0.54, 0.96, radCur);
      camGlare += (blurredGhost * anamCoatTint * 1.15) * (0.16 * gFade * anamWeight);
    }
  }

  if (sphericalWeight > 0.02) {
    vec3 starAccum = vec3(0.0);
    float stopped = clamp((u_apertureFStop - 1.4) / 6.6, 0.20, 1.0);
    float rayLen = mix(0.085, 0.205, stopped);
    const int CAM_STAR = 16;
    float invStar = 1.0 / float(CAM_STAR);
    for (int rIdx = 0; rIdx < 3; rIdx++) {
      float rayAng = 0.26 + float(rIdx) * 1.04719755;
      vec2 rayDir = vec2(cos(rayAng) / max(0.55, canvasAspect), sin(rayAng));
      vec2 perpDir = normalize(vec2(-rayDir.y, rayDir.x)) * 0.0018;
      for (int s = -CAM_STAR; s <= CAM_STAR; s++) {
        if (s == 0) continue;
        float t = float(s) * invStar;
        vec2 uvG = v_uv + rayDir * (t * rayLen);
        if (uvG.x < 0.002 || uvG.x > 0.998 || uvG.y < 0.002 || uvG.y > 0.998) continue;
        vec3 sG0 = texture(u_cameraTex, mapToSourceUV(uvG)).rgb;
        if (max(sG0.r, max(sG0.g, sG0.b)) <= 0.78) continue;

        vec2 uvR = clamp(v_uv + rayDir * (t * rayLen * 1.068), vec2(0.002), vec2(0.998));
        vec2 uvB = clamp(v_uv + rayDir * (t * rayLen * 0.932), vec2(0.002), vec2(0.998));
        vec3 sBgU = texture(u_cameraTex, mapToSourceUV(clamp(uvG + perpDir * 30.0, vec2(0.002), vec2(0.998)))).rgb;
        vec3 sBgD = texture(u_cameraTex, mapToSourceUV(clamp(uvG - perpDir * 30.0, vec2(0.002), vec2(0.998)))).rgb;
        vec3 dispCol = vec3(
          texture(u_cameraTex, mapToSourceUV(uvR)).r,
          sG0.g,
          texture(u_cameraTex, mapToSourceUV(uvB)).b
        );
        float spec = evalCamPointSpecular(dispCol, sBgU, sBgD);
        float env = exp(-abs(t) * 2.15) * pow(clamp(1.0 - abs(t), 0.0, 1.0), 1.30);
        starAccum += dispCol * (spec * env * invStar);
      }
    }
    camGlare += starAccum * (3.5 * sphericalWeight * (0.58 + 0.85 * stopped));
  }

  // Soft Captured-Highlight Veiling Halo (Circular isotropic on Spherical, Horizontally Elliptical on Anamorphic)
  vec3 haloAccum = vec3(0.0);
  vec2 haloAniso = vec2(mix(1.0, 1.66, anamWeight), mix(1.0, 0.62, anamWeight));
  for (int j = 0; j < 6; j++) {
    float ang = float(j) * 1.0471975;
    vec2 hUv = clamp(v_uv + vec2(cos(ang) * haloAniso.x / max(0.55, canvasAspect), sin(ang) * haloAniso.y) * 0.042, vec2(0.002), vec2(0.998));
    vec3 hCol = texture(u_cameraTex, mapToSourceUV(hUv)).rgb;
    haloAccum += hCol * evalCamSpecular(hCol);
  }
  camGlare += (haloAccum / 6.0) * mix(vec3(1.0), anamCoatTint, anamWeight * 0.42) * mix(0.14, 0.10, anamWeight);

  float bwMix = clamp(u_bwAmount, 0.0, 1.0);
  if ((u_lutMode == 8 && blend > 0.001) || bwMix > 0.001) {
    float glareLum = dot(camGlare, vec3(0.2126, 0.7152, 0.0722));
    camGlare = mix(camGlare, vec3(glareLum), max(bwMix, u_lutMode == 8 ? blend : 0.0));
  }
  col = compositeCamFlare(col, camGlare);

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

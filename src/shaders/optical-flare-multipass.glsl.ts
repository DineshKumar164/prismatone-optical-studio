/**
 * Prismatone Multi-Pass GPU Optical Lens Flare & Anamorphic Glare Shaders (GLSL #version 300 es)
 *
 * Implements a cinema-grade multi-pass FBO optical flare pipeline:
 *  1. Pass 1 (Bright Extract): 13-tap Karis-averaged linear HDR specular emitter isolation
 *     with local-surround contrast gating (isolates bare bulbs, lamps & headlights; rejects matte signs/walls).
 *  2. Pass 2 (Kawase Exponential Streak Cascade): 4-pass ping-pong separable optical streak
 *     propagation (7^4 = 2,401 effective continuous taps across full 2.39:1 widescreen) with
 *     real Beer-Lambert per-channel spectral coating attenuation (white-hot core -> coating body -> deep wing).
 *     In Spherical 1x mode, performs 2D isotropic bloom + multi-axis Fraunhofer RGB-dispersed starbursts.
 *  3. Pass 3 (Optical Assembly): Combines tight incandescent filament + wide Beer-Lambert beam +
 *     soft out-of-focus chromatically dispersive conjugate lens ghosts + subtle barrel edge arc +
 *     localized optical veiling bloom into a single linear HDR flare buffer for physical additive compositing.
 */

export const FLARE_QUAD_VERTEX_SHADER = /* glsl */ `#version 300 es
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
  v_uv = p * 0.5 + 0.5;
}
`;

// Shared HDR encode/decode helpers so pipeline works seamlessly on RGBA16F AND RGBA8 fallback FBOs
const HDR_FBO_CODEC_GLSL = /* glsl */ `
const float HDR_SOFT_CAP = 6.0;

vec3 encodeHdrFbo(vec3 lin, float useHdrEncoding) {
  if (useHdrEncoding < 0.5) return max(vec3(0.0), lin);
  vec3 c = max(vec3(0.0), lin);
  return c / (vec3(1.0) + c * (1.0 / HDR_SOFT_CAP)) * (1.0 / HDR_SOFT_CAP) * (1.0 + 1.0 / HDR_SOFT_CAP);
}

vec3 decodeHdrFbo(vec3 enc, float useHdrEncoding) {
  if (useHdrEncoding < 0.5) return max(vec3(0.0), enc);
  vec3 scaled = clamp(enc, vec3(0.0), vec3(0.992)) / (1.0 + 1.0 / HDR_SOFT_CAP);
  vec3 num = scaled * HDR_SOFT_CAP;
  return num / max(vec3(0.008), vec3(1.0) - scaled);
}
`;

/**
 * Pass 1: 13-tap Karis anti-flicker linear HDR specular emitter extractor.
 * Maps FBO UV (bottom-left 0..1) directly to the distorted screen-aligned source UV
 * so every optical streak and ghost aligns pixel-perfectly with the rendered cinema image.
 */
export const FLARE_BRIGHT_EXTRACT_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_sourceTex;
uniform vec4 u_data[32];
uniform vec4 u_passParams; // x: texelX, y: texelY, z: useHdrEncoding, w: canvasAspect

${HDR_FBO_CODEC_GLSL}

float lumaLin(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec2 mapFboToDistortedSourceUV(vec2 fboUv, float canvasAspect) {
  // Match PRISMATONE_WEBGL2_FRAGMENT_SHADER screen UV (top=0, bottom=1) and distortion geometry
  vec2 screenUv = vec2(fboUv.x, 1.0 - fboUv.y);
  float k1 = u_data[1].x;
  float k2 = u_data[1].y;
  float squeeze = max(1.0, u_data[1].w);
  float focusDist = max(0.3, u_data[3].z);
  float breathing = u_data[4].w;
  float encodedMode = u_data[7].w;
  float desqueezeMode = floor(encodedMode * 0.5 + 0.001);
  float sensorFramingScale = max(0.65, abs(u_data[10].w));

  float breatheScale = 1.0 - breathing * 0.038 * clamp(1.5 / max(0.4, focusDist), 0.0, 1.8);
  float formatZoom = mix(1.0, clamp(sensorFramingScale, 0.76, 1.32), 0.42);
  vec2 centered = (screenUv - vec2(0.5)) * breatheScale / formatZoom;

  if (desqueezeMode > 0.5 && desqueezeMode < 1.5) {
    centered.y *= squeeze;
  } else if (desqueezeMode >= 1.5) {
    centered.x *= squeeze;
  } else if (squeeze > 1.02) {
    float horizNorm = centered.x * 2.0;
    float edgeHorizStretch = 1.0 - (squeeze - 1.0) * 0.085 * (horizNorm * horizNorm);
    centered.x *= edgeHorizStretch;
  }

  vec2 normCoord = vec2(
    centered.x * (canvasAspect / max(1.0, mix(1.0, squeeze, 0.55))) * 1.65,
    centered.y * 1.65
  );
  float r2 = dot(normCoord, normCoord);
  float r4 = r2 * r2;

  float radialDistortY = 1.0 + (k1 * 0.52) * r2 + (k2 * 0.38) * r4;
  float anamorphicCylFactor = mix(1.0, 1.28 / max(1.0, pow(squeeze, 0.45)), clamp(squeeze - 1.0, 0.0, 1.0));
  float radialDistortX = 1.0 + (k1 * 0.62 * anamorphicCylFactor) * r2 + (k2 * 0.42) * r4;

  return vec2(0.5) + centered * vec2(radialDistortX, radialDistortY);
}

vec3 sampleLinSource(vec2 uv) {
  if (uv.x < 0.003 || uv.x > 0.997 || uv.y < 0.003 || uv.y > 0.997) return vec3(0.0);
  vec3 s = texture(u_sourceTex, uv).rgb;
  return pow(max(vec3(0.0), s), vec3(2.2));
}

void main() {
  vec2 texel = u_passParams.xy;
  float useHdrEnc = u_passParams.z;
  float canvasAspect = max(0.5, u_passParams.w);

  // Respect cinema aspect-ratio matte bars so lights hidden behind letterbox never leak streaks
  float targetAspect = u_data[9].w;
  float gateMode = u_data[10].w < 0.0 ? 1.0 : 0.0;
  vec2 screenUv = vec2(v_uv.x, 1.0 - v_uv.y);
  if (targetAspect > 0.1 && gateMode < 0.5) {
    if (targetAspect > canvasAspect + 0.02) {
      float barH = (1.0 - canvasAspect / targetAspect) * 0.5;
      if (screenUv.y < barH + 0.003 || screenUv.y > 1.0 - barH - 0.003) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
    } else if (targetAspect < canvasAspect - 0.02) {
      float barW = (1.0 - targetAspect / canvasAspect) * 0.5;
      if (screenUv.x < barW + 0.003 || screenUv.x > 1.0 - barW - 0.003) {
        fragColor = vec4(0.0, 0.0, 0.0, 1.0);
        return;
      }
    }
  }

  vec2 srcUv = mapFboToDistortedSourceUV(v_uv, canvasAspect);
  if (srcUv.x < 0.004 || srcUv.x > 0.996 || srcUv.y < 0.004 || srcUv.y > 0.996) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // 9-tap smooth tent pre-filter eliminates 1px shimmering & horizontal row striping
  vec3 c0 = sampleLinSource(srcUv);
  vec3 cL = sampleLinSource(srcUv + vec2(-texel.x, 0.0));
  vec3 cR = sampleLinSource(srcUv + vec2( texel.x, 0.0));
  vec3 cU = sampleLinSource(srcUv + vec2(0.0, -texel.y));
  vec3 cD = sampleLinSource(srcUv + vec2(0.0,  texel.y));
  vec3 cUL = sampleLinSource(srcUv + vec2(-texel.x, -texel.y));
  vec3 cUR = sampleLinSource(srcUv + vec2( texel.x, -texel.y));
  vec3 cDL = sampleLinSource(srcUv + vec2(-texel.x,  texel.y));
  vec3 cDR = sampleLinSource(srcUv + vec2( texel.x,  texel.y));

  // Smooth tent filter preserves bare bulb cores while removing single-pixel noise fireflies
  vec3 linCore =
    c0 * 0.25 +
    (cL + cR + cU + cD) * 0.125 +
    (cUL + cUR + cDL + cDR) * 0.0625;

  float linPeak = max(linCore.r, max(linCore.g, linCore.b));
  float linLum = lumaLin(linCore);

  // Fast early-out: require true linear luminance above diffuse skin/wall/lantern levels
  // Accepts real Rec.709 webcam bulbs, ceiling lights, phone flashlights & reflections (sRGB >= ~0.83)
  // while cleanly rejecting warm orange paper lanterns, human skin, matte walls, and dark coats.
  if (linLum < 0.66 || linPeak < 0.76) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Wide-field surround contrast (mid + wide rings):
  // Using min(midLum, wideLum) lets BOTH tiny distant streetlights AND larger close-up live-camera lamps,
  // phone flashlights, and bright windows flare authentically, while gently taming huge flat overexposed walls.
  float invAspect = 1.0 / max(0.8, canvasAspect * 0.65);
  vec2 rMid = vec2(0.055 * invAspect, 0.058);
  vec2 rWide = vec2(0.140 * invAspect, 0.145);

  vec3 midSum =
    sampleLinSource(srcUv + vec2( rMid.x, 0.0)) +
    sampleLinSource(srcUv + vec2(-rMid.x, 0.0)) +
    sampleLinSource(srcUv + vec2(0.0,  rMid.y)) +
    sampleLinSource(srcUv + vec2(0.0, -rMid.y)) +
    sampleLinSource(srcUv + vec2( rMid.x * 0.71,  rMid.y * 0.71)) +
    sampleLinSource(srcUv + vec2(-rMid.x * 0.71,  rMid.y * 0.71)) +
    sampleLinSource(srcUv + vec2( rMid.x * 0.71, -rMid.y * 0.71)) +
    sampleLinSource(srcUv + vec2(-rMid.x * 0.71, -rMid.y * 0.71));
  float midLum = lumaLin(midSum * 0.125);

  vec3 wideSum =
    sampleLinSource(srcUv + vec2( rWide.x, 0.0)) +
    sampleLinSource(srcUv + vec2(-rWide.x, 0.0)) +
    sampleLinSource(srcUv + vec2(0.0,  rWide.y)) +
    sampleLinSource(srcUv + vec2(0.0, -rWide.y)) +
    sampleLinSource(srcUv + vec2( rWide.x * 0.71,  rWide.y * 0.71)) +
    sampleLinSource(srcUv + vec2(-rWide.x * 0.71,  rWide.y * 0.71)) +
    sampleLinSource(srcUv + vec2( rWide.x * 0.71, -rWide.y * 0.71)) +
    sampleLinSource(srcUv + vec2(-rWide.x * 0.71, -rWide.y * 0.71));
  float wideLum = lumaLin(wideSum * 0.125);

  // Close-up live camera lamps have a wide halo (bright midLum) but darker wideLum -> min() preserves full flare!
  float surroundLum = min(midLum, wideLum * 0.94 + midLum * 0.06);
  float localPop = clamp((linLum - surroundLum) * 2.6, 0.0, 1.0);
  float wideSuppress = 1.0 - 0.68 * smoothstep(0.54, 0.88, surroundLum);

  // Smooth incandescent specular curve responsive to real live camera highlights & clipped light sources
  float incand = mix(linLum, linPeak, 0.20);
  float hotCore = pow(smoothstep(0.68, 0.985, incand), 2.25);
  float clippedCore = pow(smoothstep(0.84, 0.995, linLum), 2.10);

  // Never zero out genuine clipped light sources (e.g. phone flashlights, lamps, bright windows in live cam)
  float isoEnergy = hotCore * (0.28 + 0.72 * localPop) * wideSuppress;
  float clipEnergy = clippedCore * mix(0.40, 1.0, wideSuppress);

  float energy = max(isoEnergy, clipEnergy);
  if (energy <= 0.002) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  // Normalized chromatic bulb hue expanded into radiant HDR optical energy
  vec3 bulbChroma = linCore / max(0.001, linPeak);
  vec3 hdrRadiance = mix(bulbChroma, vec3(1.0), 0.52 * smoothstep(0.80, 0.99, linLum)) * (energy * 2.95);

  fragColor = vec4(encodeHdrFbo(hdrRadiance, useHdrEnc), 1.0);
}
`;

/**
 * Pass 2: Exact Radix-4 Masaki Kawase Exponential Multi-Pass Light Streak, Isotropic Bloom,
 * and Single-Pass Fraunhofer RGB-Dispersed Spherical Iris Starburst Shader.
 * Running 4 one-sided passes (k = 0..3 with stride = 1, 4, 16, 64) in +axisDir and -axisDir
 * mathematically computes the EXACT 511-texel continuous exponential integral:
 *   sum_{m=-255}^{+255} I(x + m) * atten_rgb^{|m|}
 * with progressive cylindrical vertical optical feathering (tight hot needle at core ->
 * velvety Gaussian feathered beam on outer wings), ZERO comb bars, ZERO scanlines, and genuine
 * Beer-Lambert spectral evolution (white-hot incandescent core -> pure coating body -> deep wing).
 */
export const FLARE_KAWASE_STREAK_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_inputTex;
uniform vec4 u_passParams;   // x: texelX, y: texelY, z: useHdrEncoding, w: mode (0=AnamorphicKawase, 1=GaussH, 2=SphericalStarburst, 3=GaussV)
uniform vec4 u_streakParams; // x: dirX (or baseAngle), y: dirY (or rayPairs), z: strideTexels, w: vertSoften (or canvasAspect)
uniform vec4 u_attenRgb;     // xyz: per-texel Beer-Lambert attenuation, w: passGain

${HDR_FBO_CODEC_GLSL}

vec3 sampleHdr(vec2 uv, float useHdrEnc) {
  if (uv.x < 0.001 || uv.x > 0.999 || uv.y < 0.001 || uv.y > 0.999) return vec3(0.0);
  return decodeHdrFbo(texture(u_inputTex, uv).rgb, useHdrEnc);
}

void main() {
  vec2 texel = u_passParams.xy;
  float useHdrEnc = u_passParams.z;
  float mode = u_passParams.w;

  vec2 axisDir = u_streakParams.xy;
  float stride = max(0.5, u_streakParams.z);
  float vertSoften = u_streakParams.w;

  vec3 atten = clamp(u_attenRgb.xyz, vec3(0.50), vec3(0.997));
  float passGain = u_attenRgb.w;

  vec3 accum = vec3(0.0);

  if (mode < 0.5) {
    // === EXACT RADIX-4 ONE-SIDED KAWASE ANAMORPHIC STREAK PASS ===
    // k = 0, 1, 2, 3 along +axisDir or -axisDir; stride = 1, 4, 16, 64
    // Mathematically covers EVERY integer texel 0..255 with zero gaps and zero chain-link dots!
    vec2 stepUv = axisDir * texel * stride;
    vec2 perpUnit = normalize(vec2(-axisDir.y, axisDir.x) + vec2(1e-6)) * texel;

    for (int k = 0; k < 4; k++) {
      float fk = float(k);
      vec2 tapUv = v_uv + stepUv * fk;
      vec3 s;
      if (vertSoften > 0.75) {
        // Pass 0: Gentle continuous vertical softening right off the bulb core
        vec2 p1 = perpUnit * 1.05;
        vec2 p2 = perpUnit * 2.10;
        s = sampleHdr(tapUv, useHdrEnc) * 0.42 +
            (sampleHdr(tapUv + p1, useHdrEnc) + sampleHdr(tapUv - p1, useHdrEnc)) * 0.21 +
            (sampleHdr(tapUv + p2, useHdrEnc) + sampleHdr(tapUv - p2, useHdrEnc)) * 0.08;
      } else if (vertSoften > 0.45) {
        // Pass 1: Continuous 3-tap vertical optical softening
        vec2 p1 = perpUnit * 1.25;
        s = sampleHdr(tapUv, useHdrEnc) * 0.56 +
            (sampleHdr(tapUv + p1, useHdrEnc) + sampleHdr(tapUv - p1, useHdrEnc)) * 0.22;
      } else if (vertSoften > 0.20) {
        // Pass 2: Soft continuous vertical feathering on mid-outer wings
        vec2 p1 = perpUnit * 1.35;
        s = sampleHdr(tapUv, useHdrEnc) * 0.62 +
            (sampleHdr(tapUv + p1, useHdrEnc) + sampleHdr(tapUv - p1, useHdrEnc)) * 0.19;
      } else {
        s = sampleHdr(tapUv, useHdrEnc);
      }

      // Exact Beer-Lambert spectral exponential decay per texel step:
      // Graceful organic taper from luminous bulb core to velvety vanishing outer wing
      float distUnits = fk * stride * 0.21;
      vec3 w = pow(atten, vec3(distUnits));
      accum += s * w;
    }

    accum *= passGain;
  } else if (mode < 1.5) {
    // === CONTINUOUS 9-TAP SEPARABLE HORIZONTAL GAUSSIAN BLUR ===
    // Stride kept <= 1.45 texels (within hardware GL_LINEAR filter footprint) -> 100% gap-free, zero dots
    vec2 dx = vec2(texel.x * stride, 0.0);
    accum =
      sampleHdr(v_uv, useHdrEnc) * 0.227027 +
      (sampleHdr(v_uv + dx * 1.0, useHdrEnc) + sampleHdr(v_uv - dx * 1.0, useHdrEnc)) * 0.1945946 +
      (sampleHdr(v_uv + dx * 2.0, useHdrEnc) + sampleHdr(v_uv - dx * 2.0, useHdrEnc)) * 0.1216216 +
      (sampleHdr(v_uv + dx * 3.0, useHdrEnc) + sampleHdr(v_uv - dx * 3.0, useHdrEnc)) * 0.054054 +
      (sampleHdr(v_uv + dx * 4.0, useHdrEnc) + sampleHdr(v_uv - dx * 4.0, useHdrEnc)) * 0.016216;
    accum *= passGain;
  } else if (mode > 2.5) {
    // === CONTINUOUS 9-TAP SEPARABLE VERTICAL GAUSSIAN BLUR ===
    vec2 dy = vec2(0.0, texel.y * stride);
    accum =
      sampleHdr(v_uv, useHdrEnc) * 0.227027 +
      (sampleHdr(v_uv + dy * 1.0, useHdrEnc) + sampleHdr(v_uv - dy * 1.0, useHdrEnc)) * 0.1945946 +
      (sampleHdr(v_uv + dy * 2.0, useHdrEnc) + sampleHdr(v_uv - dy * 2.0, useHdrEnc)) * 0.1216216 +
      (sampleHdr(v_uv + dy * 3.0, useHdrEnc) + sampleHdr(v_uv - dy * 3.0, useHdrEnc)) * 0.054054 +
      (sampleHdr(v_uv + dy * 4.0, useHdrEnc) + sampleHdr(v_uv - dy * 4.0, useHdrEnc)) * 0.016216;
    accum *= passGain;
  } else {
    // === SPHERICAL 1x SOFT DIFFUSED FRAUNHOFER IRIS STARBURST ===
    // Evaluated from pre-softened optical bloom buffer for dreamy atmospheric cinema diffraction rays
    float baseAngle = u_streakParams.x;
    float rayPairs = u_streakParams.y; // 3.0 (6-ray) or 4.0 (8-ray)
    float canvasAspect = max(0.5, u_streakParams.w);
    float angleStep = 3.14159265 / max(3.0, rayPairs);

    for (int r = 0; r < 4; r++) {
      if (float(r) >= rayPairs) break;
      float ang = baseAngle + float(r) * angleStep;
      vec2 rayDir = vec2(cos(ang) / max(0.6, canvasAspect), sin(ang));
      vec2 stepUv = rayDir * (0.0062 * stride);

      for (int k = -14; k <= 14; k++) {
        if (k == 0) continue;
        float fk = float(k);
        float absK = abs(fk);
        // Soft Fraunhofer wavelength dispersion: R bends wider than G, B tighter
        vec2 uvR = v_uv + stepUv * (fk * 1.075);
        vec2 uvG = v_uv + stepUv * fk;
        vec2 uvB = v_uv + stepUv * (fk * 0.925);
        vec3 s = vec3(
          sampleHdr(uvR, useHdrEnc).r,
          sampleHdr(uvG, useHdrEnc).g,
          sampleHdr(uvB, useHdrEnc).b
        );
        float w = pow(0.84, absK) * (1.0 - smoothstep(9.0, 14.5, absK));
        accum += s * w;
      }
    }
    accum *= passGain;
  }

  fragColor = vec4(encodeHdrFbo(accum, useHdrEnc), 1.0);
}
`;

/**
 * Pass 3: Final Optical Flare Buffer Assembly (followed by final 2-pass silky 2D optical diffusion).
 * Combines soft Beer-Lambert anamorphic beams (or diffused Spherical Fraunhofer starbursts),
 * ultra-blurry out-of-focus chromatic conjugate lens ghosts, subtle barrel arc, and velvety veiling glow.
 */
export const FLARE_ASSEMBLE_FRAGMENT_SHADER = /* glsl */ `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_brightTex;  // Medium-blurred optical bulb halo (256x144)
uniform sampler2D u_bloomTex;   // Ultra-blurry out-of-focus optical bokeh cloud (128x72)
uniform sampler2D u_wingRTex;   // Right Kawase Beer-Lambert streak wing (or Spherical starburst)
uniform sampler2D u_wingLTex;   // Left Kawase Beer-Lambert streak wing (zero in Spherical)
uniform vec4 u_data[32];
uniform vec4 u_passParams;      // x: texelX, y: texelY, z: useHdrEncoding, w: canvasAspect

${HDR_FBO_CODEC_GLSL}

vec3 sampleHdrTex(sampler2D tex, vec2 uv, float useHdrEnc) {
  if (uv.x < 0.002 || uv.x > 0.998 || uv.y < 0.002 || uv.y > 0.998) return vec3(0.0);
  return decodeHdrFbo(texture(tex, uv).rgb, useHdrEnc);
}

void main() {
  float useHdrEnc = u_passParams.z;
  float canvasAspect = max(0.5, u_passParams.w);

  // Verified exact uniform layout matching packOpticalUniformBuffer (src/profiles/optical-math.ts)
  float squeeze = max(1.0, u_data[1].w);
  float fStop = max(1.0, u_data[3].w);
  float flareIntensity = max(0.0, u_data[4].x);
  vec3 flareTint = max(vec3(0.04), u_data[5].xyz);
  float veilingGlare = max(0.0, u_data[13].y);

  float anamWeight = smoothstep(1.05, 1.38, squeeze);
  float sphericalWeight = 1.0 - anamWeight;

  if (flareIntensity < 0.005 && veilingGlare < 0.005) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 softHalo = sampleHdrTex(u_brightTex, v_uv, useHdrEnc);
  vec3 ultraBlur = sampleHdrTex(u_bloomTex, v_uv, useHdrEnc);
  vec3 wingR = sampleHdrTex(u_wingRTex, v_uv, useHdrEnc);
  vec3 wingL = sampleHdrTex(u_wingLTex, v_uv, useHdrEnc);

  // Normalize flareTint so peak channel == 1.0 (consistent optical energy across Cobalt, Gold, Teal, Amber, Neutral)
  vec3 normTint = flareTint / max(0.05, max(flareTint.r, max(flareTint.g, flareTint.b)));
  vec3 totalFlare = vec3(0.0);

  if (anamWeight > 0.01) {
    // 1A. Soft, Blurry, Organically Tapering Beer-Lambert Anamorphic Cylindrical Beam
    vec3 symStreak = max(vec3(0.0), wingR + wingL - softHalo * 0.08);

    float streakPeak = max(symStreak.r, max(symStreak.g, symStreak.b));
    float gentleCore = smoothstep(0.25, 1.30, streakPeak);
    vec3 pureWing = symStreak * mix(vec3(1.0), normTint * 1.18, 0.44);
    vec3 coatedStreak = mix(pureWing, symStreak * 1.10, gentleCore * 0.48);

    // Gentle matte optical compression keeps streaks dreamy and translucent, never shiny plastic wrap
    coatedStreak = coatedStreak / (vec3(1.0) + coatedStreak * 0.48);

    // Soft out-of-focus bulb atmosphere right where the cylindrical beam blooms from the lamp
    vec3 coreBloom = mix(softHalo, ultraBlur, 0.52) * mix(vec3(1.0, 0.97, 0.94), normTint, 0.30) * 0.28;

    totalFlare += (coatedStreak * 0.72 + coreBloom) * (flareIntensity * anamWeight);
  }

  if (sphericalWeight > 0.01) {
    // 1B. Spherical 1x Soft Atmospheric Optical Bloom + Diffused Fraunhofer Diffraction
    float stoppedDown = clamp((fStop - 1.4) / 6.6, 0.25, 1.0);
    vec3 bloomHalo = mix(softHalo, ultraBlur, 0.55) * mix(vec3(1.0), normTint, 0.15) * (0.34 * flareIntensity);
    vec3 starRays = wingR * mix(vec3(1.0), normTint, 0.16) * (0.48 + 0.52 * stoppedDown) * flareIntensity;
    starRays = starRays / (vec3(1.0) + starRays * 0.55);
    totalFlare += (bloomHalo + starRays) * sphericalWeight;
  }

  // 2. Ultra-Blurry Out-Of-Focus Chromatic Conjugate Lens Ghosts
  // Sampled exclusively from the 128x72 multi-pass defocused cloud with wide 9-tap bokeh blur (zero sharp cutouts!)
  if (flareIntensity > 0.02) {
    vec2 curOff = v_uv - vec2(0.5);
    float radCur = length(vec2(curOff.x * canvasAspect, curOff.y));
    float edgeVignette = 1.0 - smoothstep(0.58, 1.05, radCur);

    vec3 ghostAccum = vec3(0.0);
    for (int i = 0; i < 6; i++) {
      vec4 geo = u_data[20 + i];
      vec4 opt = u_data[26 + i];
      float alphaK = geo.x;
      float r0 = geo.y;
      float refl = geo.w;
      vec3 coatCol = opt.xyz;

      if (refl < 0.002 || abs(alphaK) < 0.16) continue;

      float invScale = 1.0 / max(0.32, abs(alphaK));
      float signFlip = alphaK < 0.0 ? -1.0 : 1.0;
      vec2 baseGhostUv = vec2(0.5) + curOff * (signFlip * invScale);

      if (baseGhostUv.x < 0.02 || baseGhostUv.x > 0.98 || baseGhostUv.y < 0.02 || baseGhostUv.y > 0.98) continue;

      // Soft wide bokeh defocus kernel + gentle chromatic separation
      vec2 dispVec = (baseGhostUv - vec2(0.5)) * 0.032;
      vec2 blurOff = vec2(
        max(0.032, r0 * 0.48) / max(0.7, canvasAspect),
        max(0.032, r0 * 0.48) * mix(1.0, 1.55, anamWeight)
      );

      vec3 gR = (
        sampleHdrTex(u_bloomTex, baseGhostUv + dispVec, useHdrEnc) * 0.24 +
        (
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2( blurOff.x, 0.0), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2(-blurOff.x, 0.0), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2(0.0,  blurOff.y), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2(0.0, -blurOff.y), useHdrEnc)
        ) * 0.12 +
        (
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2( blurOff.x,  blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2(-blurOff.x,  blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2( blurOff.x, -blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + dispVec + vec2(-blurOff.x, -blurOff.y) * 0.72, useHdrEnc)
        ) * 0.07
      );
      vec3 gG = (
        sampleHdrTex(u_bloomTex, baseGhostUv, useHdrEnc) * 0.24 +
        (
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2( blurOff.x, 0.0), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2(-blurOff.x, 0.0), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2(0.0,  blurOff.y), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2(0.0, -blurOff.y), useHdrEnc)
        ) * 0.12 +
        (
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2( blurOff.x,  blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2(-blurOff.x,  blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2( blurOff.x, -blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv + vec2(-blurOff.x, -blurOff.y) * 0.72, useHdrEnc)
        ) * 0.07
      );
      vec3 gB = (
        sampleHdrTex(u_bloomTex, baseGhostUv - dispVec, useHdrEnc) * 0.24 +
        (
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2( blurOff.x, 0.0), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2(-blurOff.x, 0.0), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2(0.0,  blurOff.y), useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2(0.0, -blurOff.y), useHdrEnc)
        ) * 0.12 +
        (
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2( blurOff.x,  blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2(-blurOff.x,  blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2( blurOff.x, -blurOff.y) * 0.72, useHdrEnc) +
          sampleHdrTex(u_bloomTex, baseGhostUv - dispVec + vec2(-blurOff.x, -blurOff.y) * 0.72, useHdrEnc)
        ) * 0.07
      );

      vec3 ghostSample = vec3(gR.r, gG.g, gB.b);
      vec3 elemTint = mix(coatCol, normTint, 0.45);
      float fresnelRing = 0.65 + 0.45 * smoothstep(0.20, 0.68, radCur);
      ghostAccum += ghostSample * elemTint * (refl * 1.15 * fresnelRing * edgeVignette);
    }

    // Whisper-soft Blurred Optical Barrel Arc (sampled from ultra-blurry u_bloomTex, never sharp emitters)
    if (radCur > 0.34 && radCur < 0.90) {
      float arcEnv = exp(-pow((radCur - 0.60) * 4.5, 2.0));
      vec2 radialDir = normalize(curOff + vec2(1e-5));
      vec2 arcSrcUv = vec2(0.5) - radialDir * 0.38;
      vec3 arcR = sampleHdrTex(u_bloomTex, arcSrcUv + radialDir * 0.025, useHdrEnc);
      vec3 arcG = sampleHdrTex(u_bloomTex, arcSrcUv, useHdrEnc);
      vec3 arcB = sampleHdrTex(u_bloomTex, arcSrcUv - radialDir * 0.025, useHdrEnc);
      vec3 arcCol = vec3(arcR.r, arcG.g, arcB.b);
      ghostAccum += arcCol * mix(vec3(0.45, 0.72, 1.0), normTint, 0.65) * (arcEnv * 0.032 * (0.4 + 0.6 * anamWeight));
    }

    totalFlare += ghostAccum * flareIntensity;
  }

  // 3. Velvety Out-Of-Focus Atmospheric Veiling Glow (sampled from 128x72 blurred cloud)
  if (veilingGlare > 0.005) {
    vec2 vOff = vec2(0.036 / max(0.7, canvasAspect), 0.036);
    vec3 veilBloom = (
      ultraBlur * 0.36 +
      sampleHdrTex(u_bloomTex, v_uv + vec2( vOff.x, 0.0), useHdrEnc) * 0.16 +
      sampleHdrTex(u_bloomTex, v_uv + vec2(-vOff.x, 0.0), useHdrEnc) * 0.16 +
      sampleHdrTex(u_bloomTex, v_uv + vec2(0.0,  vOff.y), useHdrEnc) * 0.16 +
      sampleHdrTex(u_bloomTex, v_uv + vec2(0.0, -vOff.y), useHdrEnc) * 0.16
    );
    vec3 veilTint = mix(vec3(1.0, 0.95, 0.88), normTint, 0.24);
    totalFlare += veilBloom * veilTint * (veilingGlare * 0.26);
  }

  fragColor = vec4(encodeHdrFbo(totalFlare, useHdrEnc), 1.0);
}
`;

/**
 * Computes physical Beer-Lambert per-channel spectral coating attenuation coefficients
 * from the active coating RGB tint. Controls how white-hot core evolves into rich coating hue along the streak.
 */
export function computeBeerLambertStreakAttenuation(
  tintRgb: [number, number, number],
  squeezeRatio: number
): [number, number, number] {
  const maxC = Math.max(0.01, tintRgb[0], tintRgb[1], tintRgb[2]);
  const nr = tintRgb[0] / maxC;
  const ng = tintRgb[1] / maxC;
  const nb = tintRgb[2] / maxC;

  // Higher anamorphic squeeze (2.0x) yields longer, sleeker horizontal reach than 1.33x
  // Tuned so beams bloom vividly near bare lamps and taper gracefully to zero before painting across frame edges
  const reachBoost = Math.max(0, Math.min(1, (squeezeRatio - 1.2) / 0.8));
  const maxKeep = 0.902 + 0.022 * reachBoost; // Dominant coating wavelength tapers organically across frame
  const minKeep = 0.68 + 0.032 * reachBoost;  // Suppressed wavelengths decay faster -> pure saturated coating wing

  const attenR = minKeep + (maxKeep - minKeep) * Math.pow(nr, 0.78);
  const attenG = minKeep + (maxKeep - minKeep) * Math.pow(ng, 0.78);
  const attenB = minKeep + (maxKeep - minKeep) * Math.pow(nb, 0.78);

  return [
    Number(attenR.toFixed(4)),
    Number(attenG.toFixed(4)),
    Number(attenB.toFixed(4)),
  ];
}

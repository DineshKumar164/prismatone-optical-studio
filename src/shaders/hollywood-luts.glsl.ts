/**
 * Shared GLSL ES 3.00 Colorimetric Hollywood Cinema Show LUT Module.
 * Crisp, clear, high-contrast DI grading with true ink-black anchor,
 * protected skin tones, and seamless continuous 0..1 blending.
 *
 * LUTs:
 * 0 = Native Film Pipeline (bypass)
 * 1 = Blockbuster Teal & Orange
 * 2 = Gotham Neo-Noir Dark (Batman / Greig Fraser Chiaroscuro)
 * 3 = Blade Runner 2049 Neon
 * 4 = Arrakis Desert Ochre
 * 5 = IMAX 70mm Kodachrome
 * 6 = Metropolis Emerald Noir
 * 7 = Sicario Steel ENR
 * 8 = Eastman Double-X 5222 B&W
 */

export const HOLLYWOOD_CINEMA_LUT_GLSL_MODULE = /* glsl */ `
vec3 applyHollywoodCinemaLut(vec3 col, float lutIdF, float blendAmt) {
  float blend = clamp(blendAmt, 0.0, 1.0);
  int lutId = int(floor(lutIdF + 0.5));
  if (lutId <= 0 || blend <= 0.001) {
    return col;
  }

  vec3 c = clamp(col, vec3(0.0), vec3(1.0));
  float inLum = dot(c, vec3(0.2126, 0.7152, 0.0722));

  float warmChroma = smoothstep(-0.02, 0.26, c.r - c.b);
  float skinMask =
    smoothstep(0.0, 0.20, c.r - c.b) *
    smoothstep(-0.06, 0.12, c.g - c.b) *
    (1.0 - smoothstep(0.18, 0.44, abs((c.r - c.g) - 0.12))) *
    smoothstep(0.08, 0.26, inLum) *
    (1.0 - smoothstep(0.76, 0.98, inLum));

  // Protect pure 0 blacks from turning milky gray
  float blackProtect = smoothstep(0.015, 0.12, inLum);
  float shadowMask = pow(clamp(1.0 - inLum * 1.45, 0.0, 1.0), 1.55) * blackProtect;
  float midMask = 4.0 * inLum * (1.0 - inLum);
  float hiMask = smoothstep(0.40, 0.96, inLum);

  vec3 g = c;

  if (lutId == 1) {
    // 1: Blockbuster Teal & Orange (Bold 2383 cyan-teal shadows/neutrals vs fiery orange warmth)
    vec3 cr = clamp((c - vec3(0.18)) * vec3(1.16, 1.13, 1.13) + vec3(0.18), vec3(0.0), vec3(1.0));
    float coolZone = (1.0 - warmChroma * 0.78) * (0.38 + shadowMask * 0.62);
    g.r = cr.r * (1.0 - 0.36 * coolZone) - 0.018 * shadowMask * (1.0 - warmChroma);
    g.g = cr.g * (1.0 + 0.09 * coolZone) + 0.024 * coolZone;
    g.b = cr.b * (1.0 + 0.34 * coolZone) + 0.078 * coolZone * (1.0 - skinMask * 0.65);

    float orangeZone = max(warmChroma, hiMask * 0.68);
    g.r += 0.115 * orangeZone * midMask + 0.092 * hiMask + 0.058 * skinMask;
    g.g += 0.022 * orangeZone * midMask + 0.016 * hiMask + 0.014 * skinMask;
    g.b -= 0.125 * orangeZone * midMask + 0.135 * hiMask + 0.052 * skinMask;
  } else if (lutId == 2) {
    // 2: Gotham Neo-Noir Dark (Batman / Greig Fraser Chiaroscuro)
    // Heavy obsidian shadow crush + cold desaturated midnight slate + piercing red/crimson practicals
    float sCrushed = pow(max(0.0001, inLum), 1.46) * (1.06 + hiMask * 0.16);
    float lumScale = sCrushed / max(0.001, inLum);
    g = c * lumScale;

    float trueCrimson = smoothstep(0.09, 0.28, c.r - c.g * 0.88) * smoothstep(0.14, 0.36, c.r - c.b);
    float satKeep = mix(0.24, 1.18, trueCrimson);
    float gLum = dot(g, vec3(0.2126, 0.7152, 0.0722));
    g = mix(vec3(gLum), g, satKeep);

    // Cold midnight steel tint in non-crimson areas while letting true crimson/red glow
    g = mix(g * vec3(0.86, 0.94, 1.09), g, trueCrimson);
    g.r += (-0.022 * shadowMask) + (0.068 * hiMask * trueCrimson) + (0.018 * hiMask);
    g.g += (0.004 * shadowMask) + (0.006 * hiMask * (1.0 - trueCrimson * 0.5));
    g.b += (0.048 * shadowMask * (1.0 - trueCrimson * 0.85)) - (0.035 * hiMask * trueCrimson);
  } else if (lutId == 3) {
    // 3: Blade Runner 2049 Neon
    vec3 cr = clamp((c - vec3(0.18)) * vec3(1.16, 1.14, 1.14) + vec3(0.18), vec3(0.0), vec3(1.0));
    g.r = cr.r - 0.055 * shadowMask + 0.125 * hiMask + 0.035 * skinMask;
    g.g = cr.g + 0.025 * shadowMask - 0.012 * hiMask;
    g.b = cr.b + 0.115 * shadowMask * (1.0 - skinMask * 0.65) - 0.135 * hiMask;
  } else if (lutId == 4) {
    // 4: Arrakis Desert Ochre
    float coolSh = shadowMask * 0.45;
    g = mix(c, vec3(inLum) + vec3(-0.012, 0.008, 0.036), coolSh);
    g += vec3(0.085, 0.042, -0.072) * midMask;
    g += vec3(0.075, 0.028, -0.095) * hiMask;
  } else if (lutId == 5) {
    // 5: IMAX 70mm Kodachrome
    g = (c - vec3(0.18)) * vec3(1.24, 1.20, 1.22) + vec3(0.18);
    g.r += 0.045 * midMask + 0.045 * hiMask + 0.028 * skinMask;
    g.g += 0.012 * hiMask;
    g.b += 0.024 * shadowMask - 0.048 * hiMask;
  } else if (lutId == 6) {
    // 6: Metropolis Emerald Noir
    vec3 cp = vec3(pow(c.r, 1.15), pow(c.g, 1.06), pow(c.b, 1.14));
    g.r = cp.r * 0.80 + cp.g * 0.04 - 0.028 * shadowMask + 0.038 * skinMask;
    g.g = cp.g * 1.14 + cp.r * 0.04 + 0.038 * shadowMask + 0.055 * midMask;
    g.b = cp.b * 0.90 + cp.g * 0.05 + 0.012 * shadowMask;
  } else if (lutId == 7) {
    // 7: Sicario Steel ENR
    float silverCurve = clamp(pow(max(0.0001, inLum), 1.14) * 1.10, 0.0, 1.0);
    g = mix(c, vec3(silverCurve), 0.56);
    g += vec3(-0.024, 0.004, 0.042) * shadowMask + vec3(0.0, 0.0, 0.025) * hiMask;
  } else if (lutId == 8) {
    // 8: Eastman Double-X 5222 Panchromatic Silver B&W
    float panLuma = clamp(dot(c, vec3(0.28, 0.60, 0.12)), 0.0, 1.0);
    float highContrast = pow(max(0.0001, panLuma), 1.12);
    float sCurve = highContrast * highContrast * (3.0 - 2.0 * highContrast);
    float silver = mix(highContrast, sCurve, 0.62);
    g = vec3(silver) + vec3(-0.006, -0.004, 0.008) * shadowMask + vec3(0.012, 0.010, -0.004) * hiMask;
  } else {
    // 9: Vintage Kodak (Warm / Soft analog 35mm print look)
    vec3 softBase = (c - vec3(0.5)) * vec3(0.90, 0.90, 0.88) + vec3(0.5, 0.5, 0.49);
    float fadeLift = 0.038 * (1.0 - smoothstep(0.0, 0.52, inLum));
    g.r = softBase.r + fadeLift * 1.18 + midMask * 0.068 + hiMask * 0.052 + skinMask * 0.032;
    g.g = softBase.g + fadeLift * 0.92 + midMask * 0.026 + hiMask * 0.018 + skinMask * 0.014;
    g.b = softBase.b + fadeLift * 0.56 - midMask * 0.058 - hiMask * 0.072 - skinMask * 0.028;

    float warmLum = dot(g, vec3(0.2126, 0.7152, 0.0722));
    g = mix(vec3(warmLum), g, vec3(0.86, 0.86, 0.82));
  }

  g = clamp(g, vec3(0.0), vec3(1.0));
  float gLum = dot(g, vec3(0.2126, 0.7152, 0.0722));
  float satMag = length(g - vec3(gLum));
  float density = 1.0 - clamp(satMag * 0.10, 0.0, 0.11) * (1.0 - hiMask * 0.65);
  g = clamp(g * density, vec3(0.0), vec3(1.0));

  return clamp(mix(c, g, blend), vec3(0.0), vec3(1.0));
}
`;

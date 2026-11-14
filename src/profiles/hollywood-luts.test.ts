import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLLYWOOD_LUT_PROFILES,
  decodePrintAndHollywoodLutUniform,
  encodePrintAndHollywoodLutUniform,
  evaluateHollywoodCinemaLutCpu,
} from './hollywood-luts';

test('encodePrintAndHollywoodLutUniform preserves exact integer when Show LUT is disabled or 0% blend', () => {
  for (let printId = 0; printId <= 4; printId++) {
    const encoded = encodePrintAndHollywoodLutUniform(printId, 0, 0.85);
    assert.equal(encoded, printId);
    const decoded = decodePrintAndHollywoodLutUniform(encoded);
    assert.equal(decoded.printStockId, printId);
    assert.equal(decoded.hollywoodLutId, 0);
    assert.equal(decoded.hollywoodLutBlend, 0);
  }
});

test('encodePrintAndHollywoodLutUniform round-trips all 8 Hollywood LUTs and blend percentages accurately', () => {
  for (const lut of HOLLYWOOD_LUT_PROFILES) {
    if (lut.shaderId === 0) continue;
    for (const blend of [0.15, 0.5, 0.85, 1.0]) {
      for (const printId of [0, 1, 2, 3, 4]) {
        const encoded = encodePrintAndHollywoodLutUniform(printId, lut.shaderId, blend);
        const decoded = decodePrintAndHollywoodLutUniform(encoded);
        assert.equal(decoded.printStockId, printId);
        assert.equal(decoded.hollywoodLutId, lut.shaderId);
        assert.ok(
          Math.abs(decoded.hollywoodLutBlend - blend) < 0.002,
          `Blend mismatch for LUT ${lut.id}: expected ${blend}, got ${decoded.hollywoodLutBlend}`
        );
      }
    }
  }
});

test('Teal & Orange 2383 protects warm skin tones while shifting shadows cooler', () => {
  const shadow: [number, number, number] = [0.12, 0.12, 0.12];
  const gradedShadow = evaluateHollywoodCinemaLutCpu(shadow, 1, 1.0);
  assert.ok(gradedShadow[2] > gradedShadow[0], 'Shadows should shift toward cool cyan/teal');

  const skin: [number, number, number] = [0.72, 0.52, 0.38];
  const gradedSkin = evaluateHollywoodCinemaLutCpu(skin, 1, 1.0);
  assert.ok(
    gradedSkin[0] > gradedSkin[1] && gradedSkin[1] > gradedSkin[2],
    'Warm skin hue order R > G > B must be preserved under Teal & Orange LUT'
  );
});

test('Double-X 5222 B&W LUT produces near-monochrome panchromatic tonal scale and blends smoothly', () => {
  const sample: [number, number, number] = [0.75, 0.45, 0.25];
  const fullBw = evaluateHollywoodCinemaLutCpu(sample, 8, 1.0);
  assert.ok(Math.abs(fullBw[0] - fullBw[1]) < 0.03);
  assert.ok(Math.abs(fullBw[1] - fullBw[2]) < 0.03);

  const halfBlend = evaluateHollywoodCinemaLutCpu(sample, 8, 0.5);
  assert.ok(
    halfBlend[0] > fullBw[0] && halfBlend[0] < sample[0],
    '50% LUT blend should interpolate smoothly between source color and B&W'
  );
});

test('Neo Noir crushes dark shadows while retaining fiery warm practical highlights', () => {
  const darkCorner: [number, number, number] = [0.16, 0.16, 0.17];
  const noirShadow = evaluateHollywoodCinemaLutCpu(darkCorner, 2, 1.0);
  const shadowLum = 0.2126 * noirShadow[0] + 0.7152 * noirShadow[1] + 0.0722 * noirShadow[2];
  assert.ok(
    shadowLum < 0.12 && noirShadow[2] >= noirShadow[0],
    'Neo Noir should crush low-key shadows toward cold obsidian'
  );

  const amberPractical: [number, number, number] = [0.85, 0.35, 0.12];
  const noirAccent = evaluateHollywoodCinemaLutCpu(amberPractical, 2, 1.0);
  assert.ok(
    noirAccent[0] > noirAccent[1] * 1.4 && noirAccent[0] > noirAccent[2] * 2.5,
    'Neo Noir must retain fiery warm practical accents'
  );
});

test('Vintage Kodak produces warm golden midtones and soft lifted analog blacks', () => {
  const darkShadow: [number, number, number] = [0.06, 0.06, 0.06];
  const vintageShadow = evaluateHollywoodCinemaLutCpu(darkShadow, 9, 1.0);
  assert.ok(
    vintageShadow[0] > darkShadow[0] && vintageShadow[0] > vintageShadow[2],
    'Vintage Kodak should gently lift shadows into warm soft analog sepia'
  );

  const neutralMid: [number, number, number] = [0.5, 0.5, 0.5];
  const vintageMid = evaluateHollywoodCinemaLutCpu(neutralMid, 9, 1.0);
  assert.ok(
    vintageMid[0] > vintageMid[1] && vintageMid[1] > vintageMid[2],
    'Vintage Kodak should imbue neutral midtones with warm golden-amber hue balance'
  );

  // Device Color (shaderId 0) must preserve unmodified device pixels
  const deviceOut = evaluateHollywoodCinemaLutCpu([0.42, 0.61, 0.73], 0, 1.0);
  assert.deepEqual(deviceOut, [0.42, 0.61, 0.73]);
});


import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nmToRgb,
  nmToRgbCss,
  computeSensorSpectralCurves,
  calculateDialAngle,
  calculateIndexFromDialAngle,
} from './spectral-curve-math';
import { getCameraProfileById } from '../profiles/camera-profiles';

test('nmToRgb returns valid normalized RGB triplets for visible spectrum', () => {
  const blue = nmToRgb(460);
  assert.ok(blue[2] > blue[0], 'Blue channel dominates at 460nm');
  assert.ok(blue[2] > 0.5, 'Blue channel significant at 460nm');

  const green = nmToRgb(530);
  assert.ok(green[1] > green[0], 'Green channel dominates at 530nm');
  assert.ok(green[1] > green[2], 'Green channel dominates over blue at 530nm');

  const red = nmToRgb(650);
  assert.ok(red[0] > red[1], 'Red channel dominates at 650nm');
  assert.ok(red[0] > red[2], 'Red channel dominates over blue at 650nm');

  const css = nmToRgbCss(550);
  assert.match(css, /^rgb\(\d+,\s*\d+,\s*\d+\)$/);
});

test('computeSensorSpectralCurves produces valid spectral response and IR-cut cutoff', () => {
  const arri = getCameraProfileById('arri-alexa-35');
  const curves = computeSensorSpectralCurves(arri, 400, 700, 10);

  assert.ok(curves.length > 20, 'Generates comprehensive sample array');

  // Peak blue should be near 458nm
  const blueRegion = curves.find((p) => Math.abs(p.wavelength - 460) < 5);
  assert.ok(blueRegion && blueRegion.b > blueRegion.r, 'ALEV 4 blue response peaks near 458nm');

  // Peak green should be near 532nm
  const greenRegion = curves.find((p) => Math.abs(p.wavelength - 530) < 5);
  assert.ok(greenRegion && greenRegion.g > greenRegion.b, 'ALEV 4 green response peaks near 532nm');

  // Deep infrared cutoff at 680nm should have strong IR attenuation
  const irRegion = curves.find((p) => p.wavelength >= 680);
  assert.ok(irRegion && irRegion.irCut < 0.25, 'IR-cut filter heavily attenuates past 650nm');
});

test('calculateDialAngle and calculateIndexFromDialAngle correctly handle circular indexing', () => {
  const total = 7;
  for (let i = 0; i < total; i++) {
    const angle = calculateDialAngle(i, total);
    const recovered = calculateIndexFromDialAngle(angle, total);
    assert.equal(recovered, i, `Index ${i} accurately recovered from angle ${angle}°`);
  }

  // Check 360 wrap-around
  assert.equal(calculateIndexFromDialAngle(-360, total), 0);
  assert.equal(calculateIndexFromDialAngle(360, total), 0);
});

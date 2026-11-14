import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeCircleOfConfusionScale,
  describeApertureDof,
  formatApertureFStop,
} from './bokeh-coc';

test('computeCircleOfConfusionScale returns 0 inside focal plane and scales inversely with f-stop', () => {
  assert.equal(computeCircleOfConfusionScale(1.4, 0.05), 0);
  const wideOpenOutOfFocus = computeCircleOfConfusionScale(1.4, 0.8);
  const stoppedDownOutOfFocus = computeCircleOfConfusionScale(11.0, 0.8);
  const deepFocus = computeCircleOfConfusionScale(16.0, 0.8);

  assert.ok(wideOpenOutOfFocus > 0.9, `expected wide open CoC > 0.9, got ${wideOpenOutOfFocus}`);
  assert.ok(
    wideOpenOutOfFocus > stoppedDownOutOfFocus,
    'wide open aperture must yield larger CoC than stopped down'
  );
  assert.ok(deepFocus < 0.02, `expected f/16 deep focus CoC near 0, got ${deepFocus}`);
});

test('describeApertureDof categorizes f-stops cleanly', () => {
  assert.equal(describeApertureDof(1.8), 'Shallow DoF');
  assert.equal(describeApertureDof(4.0), 'Balanced');
  assert.equal(describeApertureDof(11.0), 'Deep Focus');
});

test('formatApertureFStop formats fractional wide stops and whole high stops cleanly', () => {
  assert.equal(formatApertureFStop(1.4), 'f/1.4');
  assert.equal(formatApertureFStop(2.8), 'f/2.8');
  assert.equal(formatApertureFStop(11), 'f/11');
});

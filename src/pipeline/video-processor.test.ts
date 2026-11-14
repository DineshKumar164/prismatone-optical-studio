import test from 'node:test';
import assert from 'node:assert/strict';
import {
  planFrameChunks,
  calculateBenchmarkReport,
  computeRgbParadeFromRgba,
} from './video-processor';

test('planFrameChunks splits frame timeline into bounded memory-safe chunks', () => {
  const chunks = planFrameChunks(100, 12);
  assert.equal(chunks.length, 9);
  assert.equal(chunks[0].startFrame, 0);
  assert.equal(chunks[0].endFrame, 11);
  assert.equal(chunks[0].frameCount, 12);
  assert.equal(chunks[8].startFrame, 96);
  assert.equal(chunks[8].endFrame, 99);
  assert.equal(chunks[8].frameCount, 4);
});

test('calculateBenchmarkReport accurately evaluates 1080p vs 4K real-time capability', () => {
  const fastGpuTimes = [3.2, 3.5, 3.1, 3.4, 3.6, 3.3];
  const reportFast = calculateBenchmarkReport(fastGpuTimes, 1920, 1080, 'preview');
  assert.equal(reportFast.canRealTime1080p24fps, true);
  assert.equal(reportFast.canRealTime4k24fps, true);

  const softwareTimes = [48.0, 52.0, 50.0, 49.0];
  const reportSlow = calculateBenchmarkReport(softwareTimes, 1920, 1080, 'final');
  assert.equal(reportSlow.canRealTime4k24fps, false);
});

test('computeRgbParadeFromRgba computes normalized 32-bin RGB and luma histograms', () => {
  const rgba = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < rgba.length; i += 4) {
    rgba[i] = 220; // R
    rgba[i + 1] = 120; // G
    rgba[i + 2] = 40; // B
    rgba[i + 3] = 255;
  }
  const scopes = computeRgbParadeFromRgba(rgba);
  assert.equal(scopes.lumaBins.length, 32);
  assert.equal(scopes.redParade.length, 32);
  assert.ok(scopes.dynamicRangeStopsMeasured >= 6.0);
});

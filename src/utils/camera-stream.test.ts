import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildCameraConstraintsCandidates,
  computeCoverCropRect,
  formatCameraAccessError,
} from './camera-stream';

test('computeCoverCropRect center-crops portrait iPhone video without stretching into 16:9', () => {
  // Portrait 1080x1920 camera into 960x540 (16:9)
  const rect = computeCoverCropRect(1080, 1920, 960, 540);
  assert.equal(rect.sx, 0);
  assert.equal(rect.sw, 1080);
  // Desired height at 16:9 for width 1080 is 607.5
  assert.equal(rect.sh, 607.5);
  assert.equal(rect.sy, (1920 - 607.5) * 0.5);
});

test('computeCoverCropRect center-crops 4:3 webcam video into 16:9', () => {
  const rect = computeCoverCropRect(640, 480, 960, 540);
  assert.equal(rect.sx, 0);
  assert.equal(rect.sw, 640);
  assert.equal(rect.sh, 360);
  assert.equal(rect.sy, 60);
});

test('buildCameraConstraintsCandidates generates progressive fallback chain ending in {video: true}', () => {
  const candidates = buildCameraConstraintsCandidates({
    preferredDeviceId: 'cam-123',
    facingMode: 'environment',
  });
  assert.equal(candidates.length, 5);
  assert.deepEqual(candidates[candidates.length - 1], { video: true, audio: false });
});

test('formatCameraAccessError provides clear actionable messages for common DOMExceptions', () => {
  const denied = new Error('denied');
  denied.name = 'NotAllowedError';
  assert.match(formatCameraAccessError(denied), /permission blocked/i);

  const busy = new Error('busy');
  busy.name = 'NotReadableError';
  assert.match(formatCameraAccessError(busy), /in use by another app/i);
});

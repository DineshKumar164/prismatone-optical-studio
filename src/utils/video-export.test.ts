import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRecordingDuration,
  isAppleDeviceUserAgent,
  resolveRecordedBlobMeta,
  selectDeviceNativeVideoFormat,
} from './video-export';

test('selectDeviceNativeVideoFormat picks native MP4 H.264 on iPhone/Safari when supported', () => {
  const iphoneUa =
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(isAppleDeviceUserAgent(iphoneUa), true);

  const fmt = selectDeviceNativeVideoFormat(iphoneUa, (mime) =>
    mime === 'video/mp4;codecs=avc1.42E01E' || mime === 'video/mp4'
  );
  assert.equal(fmt.extension, 'mp4');
  assert.equal(fmt.mimeType, 'video/mp4;codecs=avc1.42E01E');
});

test('selectDeviceNativeVideoFormat falls back to QuickTime MOV on macOS when MP4 unavailable', () => {
  const macUa =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15';
  const fmt = selectDeviceNativeVideoFormat(macUa, (mime) => mime === 'video/quicktime');
  assert.equal(fmt.extension, 'mov');
  assert.equal(fmt.mimeType, 'video/quicktime');
});

test('selectDeviceNativeVideoFormat prefers MP4 H.264 on Android/Chrome when supported, else WebM VP9', () => {
  const androidUa =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 Chrome/131.0.0.0 Mobile Safari/537.36';
  assert.equal(isAppleDeviceUserAgent(androidUa), false);

  const mp4Fmt = selectDeviceNativeVideoFormat(androidUa, (mime) =>
    mime.startsWith('video/mp4') || mime.startsWith('video/webm')
  );
  assert.equal(mp4Fmt.extension, 'mp4');

  const webmFallback = selectDeviceNativeVideoFormat(androidUa, (mime) =>
    mime === 'video/webm;codecs=vp9' || mime === 'video/webm'
  );
  assert.equal(webmFallback.extension, 'webm');
  assert.equal(webmFallback.mimeType, 'video/webm;codecs=vp9');
});

test('resolveRecordedBlobMeta respects actual recorder MIME container on Safari & Chrome', () => {
  const fallbackSpec = { mimeType: 'video/webm', extension: 'webm' as const, label: 'WebM' };
  const resolved = resolveRecordedBlobMeta('video/mp4;codecs=avc1.42E01E', fallbackSpec);
  assert.equal(resolved.extension, 'mp4');
  assert.equal(resolved.mimeType, 'video/mp4;codecs=avc1.42E01E');
});

test('formatRecordingDuration formats unlimited recording elapsed seconds accurately', () => {
  assert.equal(formatRecordingDuration(0), '00:00');
  assert.equal(formatRecordingDuration(59), '00:59');
  assert.equal(formatRecordingDuration(65), '01:05');
  assert.equal(formatRecordingDuration(3661), '01:01:01');
});

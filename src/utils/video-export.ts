export interface NativeVideoFormatSpec {
  mimeType: string;
  extension: 'mp4' | 'mov' | 'webm';
  label: string;
}

const APPLE_NATIVE_CANDIDATES: NativeVideoFormatSpec[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', label: 'MP4 (H.264)' },
  { mimeType: 'video/mp4;codecs=hvc1', extension: 'mp4', label: 'MP4 (HEVC)' },
  { mimeType: 'video/mp4;codecs=avc1', extension: 'mp4', label: 'MP4 (H.264)' },
  { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4 (Native)' },
  { mimeType: 'video/quicktime', extension: 'mov', label: 'MOV (QuickTime)' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm', label: 'WebM (VP9)' },
  { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
];

const GENERAL_NATIVE_CANDIDATES: NativeVideoFormatSpec[] = [
  { mimeType: 'video/mp4;codecs=avc1.42E01E', extension: 'mp4', label: 'MP4 (H.264)' },
  { mimeType: 'video/mp4;codecs=avc1.4d002a', extension: 'mp4', label: 'MP4 (H.264 High)' },
  { mimeType: 'video/mp4;codecs=hvc1', extension: 'mp4', label: 'MP4 (HEVC)' },
  { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4 (Native)' },
  { mimeType: 'video/webm;codecs=vp9', extension: 'webm', label: 'WebM (VP9)' },
  { mimeType: 'video/webm;codecs=vp8', extension: 'webm', label: 'WebM (VP8)' },
  { mimeType: 'video/webm', extension: 'webm', label: 'WebM' },
];

export function isAppleDeviceUserAgent(userAgent?: string): boolean {
  const ua =
    userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
  return /iPhone|iPad|iPod|Macintosh|Mac OS X/i.test(ua);
}

/**
 * Selects the best native video container + codec supported by the user's device and browser MediaRecorder.
 * Prioritizes native hardware MP4 (H.264 / HEVC) or QuickTime MOV on Apple/Android/Desktop, falling back to WebM VP9/VP8 only when MP4 recording is unsupported.
 */
export function selectDeviceNativeVideoFormat(
  userAgent?: string,
  isTypeSupportedFn?: (mime: string) => boolean
): NativeVideoFormatSpec {
  const checker =
    isTypeSupportedFn ??
    (typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function'
      ? (m: string) => MediaRecorder.isTypeSupported(m)
      : null);

  const isApple = isAppleDeviceUserAgent(userAgent);
  const candidates = isApple ? APPLE_NATIVE_CANDIDATES : GENERAL_NATIVE_CANDIDATES;

  if (checker) {
    for (const candidate of candidates) {
      try {
        if (checker(candidate.mimeType)) {
          return candidate;
        }
      } catch {
        // Continue checking remaining device-native candidates
      }
    }
  }

  return isApple
    ? { mimeType: 'video/mp4', extension: 'mp4', label: 'MP4 (Native)' }
    : { mimeType: 'video/webm', extension: 'webm', label: 'WebM' };
}

/**
 * Resolves the concrete output MIME type and file extension from an active MediaRecorder instance
 * (handles Safari returning an empty string or audio/video refined mimeType on stop).
 */
export function resolveRecordedBlobMeta(
  recorderMimeType: string | undefined | null,
  selectedSpec: NativeVideoFormatSpec
): { mimeType: string; extension: 'mp4' | 'mov' | 'webm' } {
  const clean = (recorderMimeType || selectedSpec.mimeType || '').trim();
  const baseMime = clean.split(';')[0].trim().toLowerCase();
  if (baseMime === 'video/mp4') {
    return { mimeType: clean || 'video/mp4', extension: 'mp4' };
  }
  if (baseMime === 'video/quicktime') {
    return { mimeType: clean || 'video/quicktime', extension: 'mov' };
  }
  if (baseMime === 'video/webm') {
    return { mimeType: clean || 'video/webm', extension: 'webm' };
  }
  return {
    mimeType: selectedSpec.mimeType,
    extension: selectedSpec.extension,
  };
}

export function formatRecordingDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hrs = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  if (hrs > 0) {
    return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export type CameraFacingMode = 'user' | 'environment';

export interface CoverCropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Computes a centered aspect-preserving "cover" crop rectangle from a source video
 * frame (e.g. 720x1280 portrait iPhone camera or 640x480 webcam) into a target
 * simulation buffer (e.g. 960x540 16:9).
 */
export function computeCoverCropRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number
): CoverCropRect {
  if (srcW <= 0 || srcH <= 0 || dstW <= 0 || dstH <= 0) {
    return { sx: 0, sy: 0, sw: Math.max(1, srcW), sh: Math.max(1, srcH) };
  }

  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;

  if (Math.abs(srcAspect - dstAspect) < 0.001) {
    return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  }

  if (srcAspect > dstAspect) {
    // Source is wider than target: crop left/right equally
    const sw = srcH * dstAspect;
    const sx = (srcW - sw) * 0.5;
    return { sx, sy: 0, sw, sh: srcH };
  } else {
    // Source is taller than target (e.g. portrait mobile camera): crop top/bottom equally
    const sh = srcW / dstAspect;
    const sy = (srcH - sh) * 0.5;
    return { sx: 0, sy, sw: srcW, sh };
  }
}

/**
 * Builds an ordered list of progressive getUserMedia constraints from most specific
 * to most permissive so cameras never fail silently due to OverconstrainedError.
 */
export function buildCameraConstraintsCandidates(options: {
  preferredDeviceId?: string;
  facingMode?: CameraFacingMode;
}): MediaStreamConstraints[] {
  const { preferredDeviceId, facingMode = 'user' } = options;
  const candidates: MediaStreamConstraints[] = [];

  if (preferredDeviceId) {
    candidates.push({
      video: {
        deviceId: { exact: preferredDeviceId },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: false,
    });
    candidates.push({
      video: { deviceId: { exact: preferredDeviceId } },
      audio: false,
    });
  }

  candidates.push({
    video: {
      facingMode: { ideal: facingMode },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  });

  candidates.push({
    video: { facingMode },
    audio: false,
  });

  candidates.push({
    video: true,
    audio: false,
  });

  return candidates;
}

/**
 * Maps browser MediaDevices errors into actionable diagnostics for the viewfinder HUD.
 */
export function formatCameraAccessError(err: unknown): string {
  const name = err instanceof Error ? err.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
      return 'Camera permission blocked — allow camera access in browser settings or open in a standalone tab';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No physical camera found — running 24fps Live Sensor Emulation';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Camera is currently in use by another app or tab';
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return 'Camera resolution/facing mode unsupported — falling back to default stream';
    case 'SecurityError':
      return 'Camera requires a secure HTTPS context — running Live Sensor Emulation';
    default:
      return 'Live hardware camera unavailable — running 24fps Live Sensor Emulation';
  }
}

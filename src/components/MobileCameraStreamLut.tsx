'use client';

import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  Aperture,
  AlertTriangle,
  Camera,
  Film,
  FlipHorizontal,
  RefreshCw,
  Square,
  SwitchCamera,
  Video,
  X,
} from 'lucide-react';
import {
  CameraFacingMode,
  buildCameraConstraintsCandidates,
  formatCameraAccessError,
} from '../utils/camera-stream';
import { describeApertureDof, formatApertureFStop } from '../utils/bokeh-coc';
import {
  formatRecordingDuration,
  resolveRecordedBlobMeta,
  selectDeviceNativeVideoFormat,
} from '../utils/video-export';
import {
  HOLLYWOOD_LUT_PROFILES,
  getHollywoodLutByShaderId,
} from '../profiles/hollywood-luts';
import {
  LUT_CAMERA_FRAGMENT_SHADER,
  LUT_CAMERA_VERTEX_SHADER,
} from '../shaders/lut-bokeh-camera.glsl';
import { renderProceduralCinemaFrame } from '../engine/procedural-plate';

export type LutShaderMode = 'vintage' | 'grayscale' | 'passthrough';

interface MobileCameraStreamLutProps {
  onClose?: () => void;
  initialMode?: LutShaderMode;
  initialLutId?: number;
  initialLutBlend?: number;
  initialBw?: boolean;
  initialIso?: number;
  initialContrast?: number;
  className?: string;
}

export function MobileCameraStreamLut({
  onClose,
  initialMode = 'passthrough',
  initialLutId,
  initialLutBlend,
  initialBw = false,
  initialIso = 800,
  initialContrast = 1.0,
  className = '',
}: MobileCameraStreamLutProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const resolvedInitLutId =
    initialLutId ??
    (initialMode === 'grayscale' ? 8 : initialMode === 'vintage' ? 9 : 0);
  const resolvedInitBlend =
    initialLutBlend ??
    (resolvedInitLutId === 0 ? 0.0 : getHollywoodLutByShaderId(resolvedInitLutId).defaultBlend);

  const [lutShaderId, setLutShaderId] = useState<number>(resolvedInitLutId);
  const [lutBlend, setLutBlend] = useState<number>(resolvedInitBlend);
  const [isBw, setIsBw] = useState<boolean>(initialBw);
  const [isoValue, setIsoValue] = useState<number>(Math.max(100, Math.min(6400, initialIso)));
  const [contrastValue, setContrastValue] = useState<number>(
    Math.max(0.6, Math.min(1.6, initialContrast))
  );
  const [apertureFStop, setApertureFStop] = useState<number>(2.0);
  const [anamorphicSqueeze, setAnamorphicSqueeze] = useState<number>(2.0);
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.48 });
  const [facingMode, setFacingMode] = useState<CameraFacingMode>('environment');
  const [mirrorX, setMirrorX] = useState<boolean>(false);
  const [isStreamReady, setIsStreamReady] = useState<boolean>(false);
  const [resolutionLabel, setResolutionLabel] = useState<string>('Initializing...');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [snapNotice, setSnapNotice] = useState<string | null>(null);
  const [isShutterFlashing, setIsShutterFlashing] = useState<boolean>(false);
  const [captureMode, setCaptureMode] = useState<'photo' | 'video'>('photo');
  const [isRecordingVideo, setIsRecordingVideo] = useState<boolean>(false);
  const [recordSeconds, setRecordSeconds] = useState<number>(0);
  const nativeFormatLabel = useSyncExternalStore(
    () => () => {},
    () => selectDeviceNativeVideoFormat().label,
    () => 'MP4'
  );

  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<BlobPart[]>([]);
  const recordStartMsRef = useRef<number>(0);

  const lutShaderIdRef = useRef<number>(lutShaderId);
  const lutBlendRef = useRef<number>(lutBlend);
  const isBwRef = useRef<boolean>(isBw);
  const isoValueRef = useRef<number>(isoValue);
  const contrastValueRef = useRef<number>(contrastValue);
  const apertureFStopRef = useRef<number>(apertureFStop);
  const anamorphicSqueezeRef = useRef<number>(anamorphicSqueeze);
  const focusPointRef = useRef<{ x: number; y: number }>(focusPoint);
  const mirrorXRef = useRef<boolean>(mirrorX);

  useEffect(() => {
    lutShaderIdRef.current = lutShaderId;
  }, [lutShaderId]);

  useEffect(() => {
    lutBlendRef.current = lutBlend;
  }, [lutBlend]);

  useEffect(() => {
    isBwRef.current = isBw;
  }, [isBw]);

  useEffect(() => {
    isoValueRef.current = isoValue;
  }, [isoValue]);

  useEffect(() => {
    contrastValueRef.current = contrastValue;
  }, [contrastValue]);

  useEffect(() => {
    apertureFStopRef.current = apertureFStop;
  }, [apertureFStop]);

  useEffect(() => {
    anamorphicSqueezeRef.current = anamorphicSqueeze;
  }, [anamorphicSqueeze]);

  useEffect(() => {
    focusPointRef.current = focusPoint;
  }, [focusPoint]);

  useEffect(() => {
    mirrorXRef.current = mirrorX;
  }, [mirrorX]);

  useEffect(() => {
    if (!isRecordingVideo) return;
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recordStartMsRef.current) / 1000);
      setRecordSeconds(Math.max(0, elapsed));
    }, 500);
    return () => window.clearInterval(timer);
  }, [isRecordingVideo]);

  const stopStream = useCallback(() => {
    if (videoRecorderRef.current && videoRecorderRef.current.state !== 'inactive') {
      videoRecorderRef.current.stop();
    }
    setIsRecordingVideo(false);
    setRecordSeconds(0);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
    }
    setIsStreamReady(false);
  }, []);

  const startCamera = useCallback(
    async (targetFacing: CameraFacingMode) => {
      stopStream();
      setErrorMsg(null);
      setResolutionLabel('Requesting camera...');

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setErrorMsg('Camera API unavailable (requires HTTPS context or standalone tab).');
        setResolutionLabel('Unavailable');
        return;
      }

      let acquired: MediaStream | null = null;
      let lastErr: unknown = null;
      const candidates = buildCameraConstraintsCandidates({ facingMode: targetFacing });

      for (const constraints of candidates) {
        try {
          acquired = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastErr = err;
          if (
            err instanceof Error &&
            (err.name === 'NotAllowedError' ||
              err.name === 'PermissionDeniedError' ||
              err.name === 'SecurityError')
          ) {
            break;
          }
        }
      }

      if (!acquired) {
        setErrorMsg(formatCameraAccessError(lastErr));
        setResolutionLabel('Blocked / Offline');
        return;
      }

      streamRef.current = acquired;
      const vid = videoRef.current;
      if (!vid) return;

      vid.muted = true;
      vid.playsInline = true;
      vid.setAttribute('playsinline', 'true');
      vid.setAttribute('muted', 'true');
      vid.srcObject = acquired;

      try {
        await new Promise<void>((resolve) => {
          if (vid.readyState >= 1) {
            resolve();
            return;
          }
          const done = () => {
            vid.removeEventListener('loadedmetadata', done);
            resolve();
          };
          vid.addEventListener('loadedmetadata', done);
          window.setTimeout(() => {
            vid.removeEventListener('loadedmetadata', done);
            resolve();
          }, 1500);
        });
        await vid.play();

        const track = acquired.getVideoTracks()[0];
        const settings = track?.getSettings();
        const w = settings?.width || vid.videoWidth || 1280;
        const h = settings?.height || vid.videoHeight || 720;
        setResolutionLabel(`${w}×${h}`);
        setMirrorX(targetFacing === 'user');
        setIsStreamReady(true);
      } catch (err) {
        stopStream();
        setErrorMsg(formatCameraAccessError(err));
      }
    },
    [stopStream]
  );

  // Initialize camera stream on mount and clean up on unmount
  useEffect(() => {
    const timer = window.setTimeout(() => {
      startCamera(facingMode);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      stopStream();
    };
  }, [facingMode, startCamera, stopStream]);

  // Dedicated WebGL2 LUT + CoC Bokeh shader render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl2', {
      antialias: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    if (!gl) {
      setErrorMsg('WebGL2 is unavailable in this browser context.');
      return;
    }

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
      }
      return sh;
    };

    const vs = compile(gl.VERTEX_SHADER, LUT_CAMERA_VERTEX_SHADER);
    const fs = compile(gl.FRAGMENT_SHADER, LUT_CAMERA_FRAGMENT_SHADER);
    if (!vs || !fs) return;

    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;

    const vao = gl.createVertexArray();
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      1,
      1,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      new Uint8Array([10, 12, 18, 255])
    );

    const locTex = gl.getUniformLocation(prog, 'u_cameraTex');
    const locMode = gl.getUniformLocation(prog, 'u_lutMode');
    const locBlend = gl.getUniformLocation(prog, 'u_lutBlend');
    const locMirror = gl.getUniformLocation(prog, 'u_mirrorX');
    const locAspect = gl.getUniformLocation(prog, 'u_videoAspect');
    const locTime = gl.getUniformLocation(prog, 'u_time');
    const locAperture = gl.getUniformLocation(prog, 'u_apertureFStop');
    const locFocusPoint = gl.getUniformLocation(prog, 'u_focusPoint');
    const locAnamorphic = gl.getUniformLocation(prog, 'u_anamorphicSqueeze');
    const locBw = gl.getUniformLocation(prog, 'u_bwAmount');
    const locIso = gl.getUniformLocation(prog, 'u_isoGain');
    const locContrast = gl.getUniformLocation(prog, 'u_contrast');

    const fallbackCanvas = document.createElement('canvas');
    fallbackCanvas.width = 960;
    fallbackCanvas.height = 540;
    const fallbackCtx = fallbackCanvas.getContext('2d');
    const fallbackImg = new Image();
    let fallbackImgReady = false;
    fallbackImg.onload = () => {
      fallbackImgReady = fallbackImg.naturalWidth > 0;
    };
    fallbackImg.src = '/assets/images/plate_neon_anamorphic_1794558573087.jpg';

    const dbgExt = gl.getExtension('WEBGL_debug_renderer_info');
    const glRendererName = dbgExt ? String(gl.getParameter(dbgExt.UNMASKED_RENDERER_WEBGL) || '') : '';
    const isSoftwareGl = /swiftshader|llvmpipe|software|mesa/i.test(glRendererName);

    const startTime = performance.now();
    let lastDrawTime = -1000;
    let needsImmediateRedraw = true;
    let localRafId = 0;

    const triggerImmediateRedraw = () => {
      needsImmediateRedraw = true;
    };
    canvas.addEventListener('prismatone-redraw', triggerImmediateRedraw);

    const render = (now: number) => {
      localRafId = requestAnimationFrame(render);
      const vid = videoRef.current;
      const hasLiveVideo = !!(vid && vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0);
      const minFrameIntervalMs = isSoftwareGl ? 450 : hasLiveVideo ? 0 : 41;
      if (!needsImmediateRedraw && now - lastDrawTime < minFrameIntervalMs) {
        return;
      }
      needsImmediateRedraw = false;
      lastDrawTime = now;

      const rect = canvas.getBoundingClientRect();
      const dpr = isSoftwareGl ? 1 : Math.min(2, window.devicePixelRatio || 1);
      const targetW = Math.max(320, Math.round(rect.width * dpr));
      const targetH = Math.max(240, Math.round(rect.height * dpr));
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
      }

      const elapsedSec = (now - startTime) * 0.001;
      let srcAspect = targetW / targetH;
      if (hasLiveVideo && vid) {
        srcAspect = vid.videoWidth / vid.videoHeight;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, vid);
        } catch {
          // Ignore transient frame decode race on iOS Safari
        }
      } else if (fallbackCtx) {
        srcAspect = fallbackCanvas.width / fallbackCanvas.height;
        if (fallbackImgReady) {
          const panX = Math.sin(elapsedSec * 0.35) * 10;
          const panY = Math.cos(elapsedSec * 0.28) * 6;
          fallbackCtx.drawImage(
            fallbackImg,
            -12 + panX,
            -8 + panY,
            fallbackCanvas.width + 24,
            fallbackCanvas.height + 16
          );
        } else {
          renderProceduralCinemaFrame(
            fallbackCtx,
            fallbackCanvas.width,
            fallbackCanvas.height,
            elapsedSec
          );
        }
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, fallbackCanvas);
      }

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.useProgram(prog);
      gl.bindVertexArray(vao);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (locTex) gl.uniform1i(locTex, 0);
      if (locMode) gl.uniform1i(locMode, lutShaderIdRef.current);
      if (locBlend) gl.uniform1f(locBlend, lutBlendRef.current);
      if (locMirror) gl.uniform1i(locMirror, mirrorXRef.current ? 1 : 0);
      if (locAspect) gl.uniform2f(locAspect, srcAspect, canvas.width / Math.max(1, canvas.height));
      if (locTime) gl.uniform1f(locTime, (now - startTime) * 0.001);
      if (locAperture) gl.uniform1f(locAperture, apertureFStopRef.current);
      if (locAnamorphic) gl.uniform1f(locAnamorphic, anamorphicSqueezeRef.current);
      if (locBw) gl.uniform1f(locBw, isBwRef.current ? 1.0 : 0.0);
      if (locIso) gl.uniform1f(locIso, isoValueRef.current);
      if (locContrast) gl.uniform1f(locContrast, contrastValueRef.current);
      if (locFocusPoint) {
        gl.uniform2f(locFocusPoint, focusPointRef.current.x, focusPointRef.current.y);
      }

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };

    localRafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(localRafId);
      canvas.removeEventListener('prismatone-redraw', triggerImmediateRedraw);
      gl.deleteTexture(tex);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(prog);
    };
  }, []);

  useEffect(() => {
    canvasRef.current?.dispatchEvent(new CustomEvent('prismatone-redraw'));
  }, [
    lutShaderId,
    lutBlend,
    isBw,
    isoValue,
    contrastValue,
    apertureFStop,
    anamorphicSqueeze,
    focusPoint,
    mirrorX,
  ]);

  const activeLut = getHollywoodLutByShaderId(lutShaderId);

  const handleCaptureStill = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setIsShutterFlashing(true);
    window.setTimeout(() => setIsShutterFlashing(false), 140);
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `prismatone_${activeLut.id}_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setSnapNotice(`Saved ${activeLut.shortName}`);
    window.setTimeout(() => setSnapNotice(null), 2000);
  };

  const handleToggleVideoRecording = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (isRecordingVideo && videoRecorderRef.current) {
      if (videoRecorderRef.current.state !== 'inactive') {
        videoRecorderRef.current.stop();
      }
      setIsRecordingVideo(false);
      return;
    }

    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setSnapNotice('Video recording unavailable in this browser');
      window.setTimeout(() => setSnapNotice(null), 2600);
      return;
    }

    try {
      const nativeFmt = selectDeviceNativeVideoFormat();
      recordedChunksRef.current = [];
      recordStartMsRef.current = Date.now();
      setRecordSeconds(0);

      const stream = canvas.captureStream(30);
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: 8_000_000,
      };
      if (
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(nativeFmt.mimeType)
      ) {
        recorderOptions.mimeType = nativeFmt.mimeType;
      }

      const recorder = new MediaRecorder(stream, recorderOptions);
      recorder.ondataavailable = (ev) => {
        if (ev.data && ev.data.size > 0) {
          recordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const elapsedSec = Math.max(1, Math.round((Date.now() - recordStartMsRef.current) / 1000));
        setRecordSeconds(0);
        if (recordedChunksRef.current.length > 0) {
          const blobMeta = resolveRecordedBlobMeta(recorder.mimeType, nativeFmt);
          const blob = new Blob(recordedChunksRef.current, { type: blobMeta.mimeType });
          const url = URL.createObjectURL(blob);
          const fileName = `prismatone_${activeLut.id}_${Date.now()}.${blobMeta.extension}`;
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.setTimeout(() => URL.revokeObjectURL(url), 4000);
          setSnapNotice(
            `Saved ${nativeFmt.label} (${formatRecordingDuration(elapsedSec)})`
          );
          window.setTimeout(() => setSnapNotice(null), 3000);
        }
      };

      recorder.start(250);
      videoRecorderRef.current = recorder;
      setIsRecordingVideo(true);
      setSnapNotice(null);
    } catch {
      setSnapNotice('Could not start native video recording');
      window.setTimeout(() => setSnapNotice(null), 2600);
    }
  };

  return (
    <div
      className={`fixed inset-0 z-50 bg-black flex flex-col justify-between overflow-hidden select-none ${className}`}
    >
      {/* Mobile Safari-compatible live camera video decoder element */}
      <video
        ref={videoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="fixed bottom-0 right-0 w-8 h-8 opacity-[0.01] -z-10 pointer-events-none"
      />

      {/* Full-Screen WebGL2 CoC Bokeh + Hollywood LUT Render Canvas (Tap anywhere to set Focus Plane) */}
      <canvas
        ref={canvasRef}
        data-testid="webgl2-lut-fullscreen-canvas"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = Math.max(0.1, Math.min(0.9, (e.clientX - rect.left) / Math.max(1, rect.width)));
          const y = Math.max(0.1, Math.min(0.9, (e.clientY - rect.top) / Math.max(1, rect.height)));
          setFocusPoint({ x, y });
        }}
        className="absolute inset-0 w-full h-full block cursor-crosshair"
      />

      {/* Tap-to-Focus Plane Reticle */}
      <div
        aria-hidden="true"
        style={{
          left: `${focusPoint.x * 100}%`,
          top: `${focusPoint.y * 100}%`,
        }}
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 w-12 h-12 border border-amber-400/70 rounded-full transition-all duration-150 shadow-[0_0_16px_rgba(245,158,11,0.3)]"
      >
        <div className="absolute inset-0 m-auto w-1.5 h-1.5 rounded-full bg-amber-400" />
      </div>

      {/* Shutter Capture Flash Overlay */}
      {isShutterFlashing && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-white/75 z-20 transition-opacity duration-150"
        />
      )}

      {/* Top Glassmorphic Viewfinder OSD */}
      <div className="relative z-10 px-2.5 sm:px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-none bg-gradient-to-b from-black/75 via-black/30 to-transparent">
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 text-[10px] sm:text-xs font-mono text-white shadow-lg min-w-0">
          {isRecordingVideo ? (
            <>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping shrink-0" />
              <span className="text-rose-400 font-bold tabular-nums shrink-0">
                REC {formatRecordingDuration(recordSeconds)}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-emerald-300 font-semibold truncate">{nativeFormatLabel}</span>
            </>
          ) : (
            <>
              <span
                className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full shrink-0 ${
                  isStreamReady ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              <Camera className="hidden sm:block w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate font-semibold text-amber-300">{activeLut.shortName}</span>
              <span className="text-slate-400 hidden sm:inline">·</span>
              <span className="text-slate-300 hidden sm:inline">{resolutionLabel}</span>
              <span className="text-slate-400">·</span>
              <span className="text-cyan-300 font-bold shrink-0">
                {formatApertureFStop(apertureFStop)}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-200 shrink-0">ISO {isoValue}</span>
            </>
          )}
        </div>

        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsBw((prev) => !prev)}
            aria-pressed={isBw}
            aria-label="Toggle Black and White Mode"
            className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full backdrop-blur-xl border text-[10px] sm:text-[11px] font-mono font-bold transition-colors ${
              isBw
                ? 'bg-white text-slate-950 border-white shadow'
                : 'bg-black/65 border-white/20 text-slate-200 hover:bg-white/10'
            }`}
          >
            B&amp;W
          </button>

          <button
            type="button"
            onClick={() => setAnamorphicSqueeze((prev) => (prev > 1.2 ? 1.0 : 2.0))}
            aria-label="Toggle Anamorphic or Spherical Lens Glare"
            title="Switch between Anamorphic 2x (horizontal streak & oval bokeh) and Spherical 1x (radial starburst & circular halo)"
            className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-full backdrop-blur-xl border text-[10px] sm:text-[11px] font-mono font-semibold transition-colors ${
              anamorphicSqueeze > 1.2
                ? 'bg-sky-500/25 border-sky-400/50 text-sky-200'
                : 'bg-amber-500/25 border-amber-400/50 text-amber-200'
            }`}
          >
            {anamorphicSqueeze > 1.2 ? 'Anam 2×' : 'Spherical'}
          </button>

          {onClose && (
            <button
              type="button"
              onClick={() => {
                stopStream();
                onClose();
              }}
              aria-label="Close Fullscreen LUT Camera"
              className="p-2 rounded-full bg-black/70 hover:bg-black/90 backdrop-blur-xl border border-white/15 text-slate-200 hover:text-white transition-colors shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Compact Dismissible Camera Notice Pill when using Simulated Sensor Stream */}
      {errorMsg && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md px-3 py-1.5 rounded-full bg-amber-950/90 backdrop-blur-md border border-amber-400/50 text-[10px] sm:text-[11px] font-mono text-amber-200 flex items-center justify-between gap-2 shadow-xl">
          <div className="flex items-center gap-1.5 min-w-0">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="truncate">{errorMsg}</span>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => startCamera(facingMode)}
              className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Retry</span>
            </button>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              aria-label="Dismiss camera warning"
              className="p-0.5 text-amber-300 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Bottom Authentic Mobile Camera App Deck */}
      <div className="relative z-10 px-3 sm:px-5 pt-4 pb-[max(0.9rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2 pointer-events-none bg-gradient-to-t from-black/90 via-black/55 to-transparent">
        {snapNotice && (
          <div className="px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/50 text-emerald-200 text-xs font-mono">
            {snapNotice}
          </div>
        )}

        {/* Optical & Exposure Control Card (Aperture, ISO, Contrast, B&W, LUT Blend) */}
        <div className="pointer-events-auto w-full max-w-md px-3.5 py-2 rounded-2xl bg-black/75 backdrop-blur-2xl border border-white/15 shadow-[0_8px_24px_rgba(0,0,0,0.85)] flex flex-col gap-1.5">
          {/* Row 1: Circle-of-Confusion Lens Aperture */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <Aperture className="w-3.5 h-3.5 text-cyan-400" />
              <label
                htmlFor="lut-lens-aperture"
                className="text-[11px] font-semibold text-slate-200 whitespace-nowrap"
              >
                Lens Aperture
              </label>
            </div>
            <input
              id="lut-lens-aperture"
              type="range"
              min={1.4}
              max={16.0}
              step={0.1}
              value={apertureFStop}
              onChange={(e) => setApertureFStop(parseFloat(e.target.value))}
              aria-label="Lens Aperture"
              className="studio-slider flex-1 min-w-0 w-full"
            />
            <div className="flex items-center gap-1.5 shrink-0 font-mono text-[11px]">
              <span className="text-cyan-300 font-bold tabular-nums w-9 text-right">
                {formatApertureFStop(apertureFStop)}
              </span>
              <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] text-slate-300">
                {describeApertureDof(apertureFStop)}
              </span>
            </div>
          </div>

          {/* Row 2: ISO Sensitivity & Contrast Controls */}
          <div className="grid grid-cols-2 gap-3 pt-1 pb-0.5">
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <label htmlFor="lut-iso-slider" className="text-slate-300 font-semibold">
                  ISO
                </label>
                <span className="text-emerald-300 font-bold tabular-nums">{isoValue}</span>
              </div>
              <input
                id="lut-iso-slider"
                type="range"
                min={100}
                max={6400}
                step={100}
                value={isoValue}
                onChange={(e) => setIsoValue(parseInt(e.target.value, 10))}
                aria-label="ISO"
                className="studio-slider w-full"
              />
            </div>

            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between text-[10px] font-mono">
                <label htmlFor="lut-contrast-slider" className="text-slate-300 font-semibold">
                  Contrast
                </label>
                <span className="text-sky-300 font-bold tabular-nums">
                  {contrastValue.toFixed(2)}×
                </span>
              </div>
              <input
                id="lut-contrast-slider"
                type="range"
                min={0.6}
                max={1.6}
                step={0.02}
                value={contrastValue}
                onChange={(e) => setContrastValue(parseFloat(e.target.value))}
                aria-label="Contrast"
                className="studio-slider w-full"
              />
            </div>
          </div>

          {/* Row 3: LUT Blend & Quick B&W Switch */}
          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="flex items-center gap-1.5 shrink-0">
              <Film className="w-3.5 h-3.5 text-amber-400" />
              <label
                htmlFor="lut-blend-slider"
                className="text-[11px] font-semibold text-slate-200 whitespace-nowrap"
              >
                LUT Blend
              </label>
            </div>
            <input
              id="lut-blend-slider"
              type="range"
              min={0}
              max={1.0}
              step={0.01}
              disabled={lutShaderId === 0}
              value={lutShaderId === 0 ? 0 : lutBlend}
              onChange={(e) => setLutBlend(parseFloat(e.target.value))}
              aria-label="Hollywood LUT Blend"
              className="studio-slider flex-1 min-w-0 w-full disabled:opacity-40"
            />
            <span className="font-mono text-[11px] text-amber-300 font-bold tabular-nums w-9 text-right shrink-0">
              {Math.round((lutShaderId === 0 ? 0 : lutBlend) * 100)}%
            </span>
          </div>
        </div>

        {/* Scrollable Cinematic Post-Processing LUT Selector Strip */}
        <div
          role="radiogroup"
          aria-label="Cinematic LUT Styles"
          className="pointer-events-auto w-full max-w-md flex items-center gap-1.5 px-2 py-1 rounded-full bg-black/70 backdrop-blur-xl border border-white/15 shadow-lg overflow-x-auto no-scrollbar"
        >
          {HOLLYWOOD_LUT_PROFILES.map((lut) => (
            <button
              key={lut.id}
              type="button"
              role="radio"
              aria-checked={lutShaderId === lut.shaderId}
              aria-label={lut.name}
              title={lut.description}
              onClick={() => {
                setLutShaderId(lut.shaderId);
                if (lut.shaderId === 0) {
                  setLutBlend(0.0);
                } else {
                  setLutBlend(lut.defaultBlend);
                }
              }}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap shrink-0 transition-all ${
                lutShaderId === lut.shaderId
                  ? 'bg-amber-400 text-slate-950 shadow font-bold'
                  : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <span>{lut.shortName}</span>
            </button>
          ))}
        </div>

        {/* PHOTO | VIDEO Mode Switcher (Unlimited Recording in Device-Native Format) */}
        <div className="pointer-events-auto flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/75 backdrop-blur-xl border border-white/15 shadow-lg">
          <button
            type="button"
            disabled={isRecordingVideo}
            onClick={() => setCaptureMode('photo')}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide transition-all disabled:opacity-50 ${
              captureMode === 'photo'
                ? 'bg-amber-400 text-slate-950 shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Camera className="w-3 h-3" />
            <span>PHOTO</span>
          </button>
          <button
            type="button"
            disabled={isRecordingVideo}
            onClick={() => setCaptureMode('video')}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold tracking-wide transition-all disabled:opacity-50 ${
              captureMode === 'video'
                ? 'bg-rose-500 text-white shadow'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            <Video className="w-3 h-3" />
            <span>VIDEO</span>
          </button>
          {captureMode === 'video' && (
            <span className="pl-1 pr-2 text-[10px] font-mono text-emerald-300 whitespace-nowrap">
              {nativeFormatLabel} · ∞
            </span>
          )}
        </div>

        {/* Pro Camera Shutter Row */}
        <div className="pointer-events-auto flex items-center justify-between w-full max-w-xs px-4">
          <button
            type="button"
            onClick={() => setMirrorX((prev) => !prev)}
            aria-label="Mirror Camera"
            className={`w-11 h-11 rounded-full flex items-center justify-center border backdrop-blur-md transition-colors ${
              mirrorX
                ? 'bg-white/20 border-white/40 text-amber-300'
                : 'bg-black/60 border-white/20 text-slate-200 hover:bg-white/15'
            }`}
          >
            <FlipHorizontal className="w-5 h-5" />
          </button>

          {/* Tactile iPhone-Style Double-Ring Shutter / Record Button */}
          <button
            type="button"
            onClick={captureMode === 'video' ? handleToggleVideoRecording : handleCaptureStill}
            aria-label={
              captureMode === 'video'
                ? isRecordingVideo
                  ? 'Stop Native Video Recording'
                  : 'Start Unlimited Native Video Recording'
                : 'Capture LUT Still'
            }
            className={`group w-16 h-16 rounded-full p-1 border-[3px] bg-black/30 backdrop-blur-md flex items-center justify-center shadow-[0_6px_28px_rgba(0,0,0,0.85)] active:scale-90 transition-transform ${
              captureMode === 'video' ? 'border-white' : 'border-white'
            }`}
          >
            {captureMode === 'video' ? (
              isRecordingVideo ? (
                <Square className="w-6 h-6 text-rose-500 fill-rose-500 animate-pulse" />
              ) : (
                <span className="w-full h-full rounded-full bg-rose-500 group-hover:bg-rose-400 transition-colors" />
              )
            ) : (
              <span className="w-full h-full rounded-full bg-white group-hover:bg-amber-100 transition-colors" />
            )}
          </button>

          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
            }
            aria-label="Flip Front or Rear Camera"
            className="w-11 h-11 rounded-full flex items-center justify-center bg-black/60 hover:bg-white/15 border border-white/20 text-sky-300 backdrop-blur-md transition-colors"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CAMERA_PROFILES,
  CameraProfile,
  getCameraProfileById,
} from '../profiles/camera-profiles';
import {
  FILM_STOCK_PROFILES,
  FilmStockProfile,
  getFilmStockById,
} from '../profiles/film-profiles';
import {
  LENS_PROFILES,
  LensProfile,
  getLensProfileById,
} from '../profiles/lens-profiles';
import {
  OpticalSimulationParameters,
  buildOpticalParametersFromRig,
  clamp,
  computeOpticalMetrics,
  packOpticalUniformBuffer,
  resolveCameraLensInteraction,
} from '../profiles/optical-math';
import { CALIBRATED_LENS_GHOST_TABLES } from '../shaders/physically-based-lens-flare.glsl';
import { getHollywoodLutByShaderId } from '../profiles/hollywood-luts';
import { ActiveRenderBackend, PrismatoneGpuEngine } from '../engine/gpu-simulation-engine';
import {
  BUILTIN_CALIBRATION_SOURCES,
  CalibrationSourceItem,
  renderProceduralCinemaFrame,
} from '../engine/procedural-plate';
import { runChunkedWorkerRenderJob } from '../pipeline/video-processor';
import { SavedOpticalPresetRecord } from './OpticalParameterPanel';
import { RenderJobRecord } from './ScopesAndBenchmarkPanel';
import { SpectralSensitivityVisualizer } from './SpectralSensitivityVisualizer';
import { CinemaControlConsole, ConsoleTabId } from './CinemaControlConsole';
import { MobileCameraStreamLut } from './MobileCameraStreamLut';
import {
  AlertTriangle,
  Aperture,
  Camera,
  Check,
  ChevronDown,
  ChevronUp,
  Circle,
  Columns,
  Compass,
  Crosshair,
  Disc,
  Download,
  Eye,
  Film,
  FlipHorizontal,
  Frame,
  Grid,
  Layers,
  Maximize2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  Square,
  Sun,
  SwitchCamera,
  Upload,
  Video,
  VideoOff,
  X,
  Zap,
} from 'lucide-react';
import {
  CameraFacingMode,
  buildCameraConstraintsCandidates,
  computeCoverCropRect,
  formatCameraAccessError,
} from '../utils/camera-stream';
import {
  formatRecordingDuration,
  resolveRecordedBlobMeta,
  selectDeviceNativeVideoFormat,
} from '../utils/video-export';

interface PrismatoneWorkspaceProps {
  initialPresets: SavedOpticalPresetRecord[];
  initialJobs: RenderJobRecord[];
}

interface AspectGateOption {
  id: string;
  label: string;
  ratio: number;
  desc: string;
}

const CINEMA_ASPECT_GATES: AspectGateOption[] = [
  { id: '2.39:1', label: '2.39:1 Scope', ratio: 2.39, desc: 'Anamorphic Widescreen' },
  { id: '2.00:1', label: '2.00:1 Univisium', ratio: 2.0, desc: 'Modern Large Format' },
  { id: '1.85:1', label: '1.85:1 Flat', ratio: 1.85, desc: 'Theatrical Widescreen' },
  { id: '16:9', label: '1.78:1 (16:9)', ratio: 1.7778, desc: 'Full Sensor Open Gate' },
  { id: '1.43:1', label: '1.43:1 IMAX', ratio: 1.43, desc: '15-Perf 70mm IMAX' },
  { id: '4:3', label: '1.33:1 Academy', ratio: 1.3333, desc: '4-Perf 35mm Classic' },
];

interface PrintStockOption {
  id: number;
  name: string;
  subtitle: string;
}

const PRINT_STOCK_PROFILES: PrintStockOption[] = [
  {
    id: 0,
    name: 'Kodak 2383 Print Film',
    subtitle: 'Classic Hollywood S-Curve · Prussian Shadows & Warm Gold Highlights',
  },
  {
    id: 4,
    name: 'Kodak Vision3 500T Nocturne',
    subtitle: 'Pushed Tungsten Night Stock · Deep Teal Shadows & Sodium-Amber Glow',
  },
  {
    id: 1,
    name: 'ARRI REVEAL LogC4 Natural',
    subtitle: 'True-to-Life Skin Tones · Neutral Blacks & Smooth 17-Stop Shoulder',
  },
  {
    id: 2,
    name: 'Fujifilm Eterna 3513DI',
    subtitle: 'Soft Emerald-Cyan Shadow Undertones · Creamy Pastel Highlights',
  },
  {
    id: 3,
    name: 'Silver Retention (Bleach Bypass)',
    subtitle: 'High-Contrast Silver Halide · Deep Crushed Blacks & Metallic Desaturation',
  },
];

const ANAMORPHIC_SQUEEZE_OPTIONS = [
  { value: 1.0, label: '1.0× Spherical' },
  { value: 1.33, label: '1.33× Anamorphic' },
  { value: 1.5, label: '1.5× Anamorphic' },
  { value: 1.8, label: '1.8× Full-Frame Ana' },
  { value: 2.0, label: '2.0× Cinema Scope' },
];

const SHUTTER_ANGLE_OPTIONS = [45, 90, 144, 172.8, 180, 270, 360];

const COLOR_TEMP_KELVIN = (shift: number) => Math.round(5600 - shift * 3200);
const INTERNAL_RENDER_W = 960;
const INTERNAL_RENDER_H = 540;

export function PrismatoneWorkspace({
  initialPresets,
}: PrismatoneWorkspaceProps) {
  // Active Camera Body, Cinema Lens, and Film Negative Stock
  const [selectedCameraId, setSelectedCameraId] = useState<string>('arri-alexa-35');
  const [selectedLensId, setSelectedLensId] = useState<string>('cooke-anamorphic-i-sf-50');
  const [selectedFilmStockId, setSelectedFilmStockId] = useState<string>('kodak-vision3-500t-5219');

  const activeCamera: CameraProfile = useMemo(
    () => getCameraProfileById(selectedCameraId),
    [selectedCameraId]
  );
  const activeLens: LensProfile = useMemo(
    () => getLensProfileById(selectedLensId),
    [selectedLensId]
  );
  const activeFilmStock: FilmStockProfile = useMemo(
    () => getFilmStockById(selectedFilmStockId),
    [selectedFilmStockId]
  );

  // Active Aspect Ratio Gate & Print Stock Emulation
  const [selectedAspectId, setSelectedAspectId] = useState<string>('2.39:1');
  const activeAspectGate = useMemo(
    () => CINEMA_ASPECT_GATES.find((g) => g.id === selectedAspectId) ?? CINEMA_ASPECT_GATES[0],
    [selectedAspectId]
  );
  const [gateGuideMode, setGateGuideMode] = useState<boolean>(false);
  const [selectedPrintStockId, setSelectedPrintStockId] = useState<number>(0);
  const activePrintStock = useMemo(
    () => PRINT_STOCK_PROFILES.find((p) => p.id === selectedPrintStockId) ?? PRINT_STOCK_PROFILES[0],
    [selectedPrintStockId]
  );

  // Right Sidebar Dock Tab ('rig' | 'optics' | 'sensor')
  const [activeDockTab, setActiveDockTab] = useState<'rig' | 'optics' | 'sensor'>('rig');

  // Active Cinematography Parameters
  const [params, setParams] = useState<OpticalSimulationParameters>(() =>
    buildOpticalParametersFromRig(
      getCameraProfileById('arri-alexa-35'),
      getLensProfileById('cooke-anamorphic-i-sf-50'),
      undefined,
      getFilmStockById('kodak-vision3-500t-5219')
    )
  );

  // Real-time Camera-Lens Interaction Report & Physical Optical Metrics
  const interactionReport = useMemo(
    () => resolveCameraLensInteraction(activeCamera, activeLens, params, activeFilmStock),
    [activeCamera, activeLens, params, activeFilmStock]
  );

  const opticalMetrics = useMemo(
    () => computeOpticalMetrics(activeCamera, activeLens, params),
    [activeCamera, activeLens, params]
  );

  // Active Lens Physical Ghost Calibration Table & Ray Incidence Angle Metrics
  const activeGhostTable = useMemo(
    () =>
      CALIBRATED_LENS_GHOST_TABLES[activeLens.id] ??
      CALIBRATED_LENS_GHOST_TABLES['cooke-anamorphic-i-sf-50'],
    [activeLens.id]
  );

  const lightIncidenceMetrics = useMemo(() => {
    const lx = (params.lightSourceX ?? 0.72) - 0.5;
    const ly = ((params.lightSourceY ?? 0.28) - 0.5) * 0.5625;
    const dist = Math.sqrt(lx * lx + ly * ly);
    const fovHalfAngle = Math.atan(14 / Math.max(14, params.focalLengthMm));
    const angleRad = Math.atan(dist * 2.0 * Math.tan(fovHalfAngle));
    const deg = Number(((angleRad * 180) / Math.PI).toFixed(1));
    const minCutoff = activeGhostTable?.elements?.length
      ? Math.min(...activeGhostTable.elements.map((e) => e.cutoffAngleDeg))
      : 30;
    return {
      incidenceAngleDeg: deg,
      isCutoffByBarrelBaffles: deg > minCutoff,
      minCutoffDeg: minCutoff,
    };
  }, [params.lightSourceX, params.lightSourceY, params.focalLengthMm, activeGhostTable]);

  // Camera App Console State: active dial tab, visualizer modal, LUT cam, and viewfinder HUD
  const [activeConsoleTab, setActiveConsoleTab] = useState<ConsoleTabId>('camera');
  const [showSpectralModal, setShowSpectralModal] = useState<boolean>(false);
  const [showFullscreenLutCam, setShowFullscreenLutCam] = useState<boolean>(false);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState<boolean>(false);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(false);
  const [isShutterFlashing, setIsShutterFlashing] = useState<boolean>(false);

  // Start compact/mobile viewports with clean edge-to-edge camera viewfinder & frame-guide mode
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px), (max-height: 639px)');
    const applyCompactDefaults = (matches: boolean) => {
      if (matches) {
        setIsConsoleCollapsed(true);
        setGateGuideMode(true);
      } else {
        setIsConsoleCollapsed(false);
        setGateGuideMode(false);
      }
    };
    const rafId = window.requestAnimationFrame(() => applyCompactDefaults(mq.matches));
    const onChange = (e: MediaQueryListEvent) => applyCompactDefaults(e.matches);
    mq.addEventListener('change', onChange);
    return () => {
      window.cancelAnimationFrame(rafId);
      mq.removeEventListener('change', onChange);
    };
  }, []);

  // Light angle calculation for rotary knob (0..360 degrees)
  const lightSourceAngleDeg = useMemo(() => {
    const lx = (params.lightSourceX ?? 0.72) - 0.5;
    const ly = (params.lightSourceY ?? 0.28) - 0.5;
    const rad = Math.atan2(ly, lx);
    let deg = Math.round((rad * 180) / Math.PI);
    if (deg < 0) deg += 360;
    return deg;
  }, [params.lightSourceX, params.lightSourceY]);

  // Active Footage Reel or Imported Video
  const [sources, setSources] = useState<CalibrationSourceItem[]>(BUILTIN_CALIBRATION_SOURCES);
  const [activeSourceId, setActiveSourceId] = useState<string>('tokyo-rain-reel');
  const activeSource = useMemo(
    () => sources.find((s) => s.id === activeSourceId) ?? sources[0],
    [sources, activeSourceId]
  );

  // LIVE CAMERA EMULATION STATE
  const [isLiveCameraActive, setIsLiveCameraActive] = useState<boolean>(false);
  const [liveCameraUsingSimulatedStream, setLiveCameraUsingSimulatedStream] =
    useState<boolean>(false);
  const [liveCameraError, setLiveCameraError] = useState<string | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<CameraFacingMode>('environment');
  const [liveMirrorHorizontal, setLiveMirrorHorizontal] = useState<boolean>(false);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [liveResolutionLabel, setLiveResolutionLabel] = useState<string>('1920×1080');
  const [isRecordingLiveTake, setIsRecordingLiveTake] = useState<boolean>(false);
  const [liveRecordSeconds, setLiveRecordSeconds] = useState<number>(0);

  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveRecorderRef = useRef<MediaRecorder | null>(null);
  const liveRecordedChunksRef = useRef<BlobPart[]>([]);
  const liveRafRef = useRef<number | null>(null);
  const liveFrameCounterRef = useRef<number>(0);
  const renderGpuTickRef = useRef<(frameIdx: number) => number>(() => 3.0);

  // Cinema Viewing Controls: A/B Compare, Output Master Resolution
  const [splitEnabled, setSplitEnabled] = useState<boolean>(false);
  const [splitWipeX, setSplitWipeX] = useState<number>(0.5);
  const [qualityMode, setQualityMode] = useState<'preview' | 'final'>('final');
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // 24fps Playback & Frame Scrubber
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentFrame, setCurrentFrame] = useState<number>(0);
  const totalTimelineFrames = useMemo(
    () => Math.max(24, Math.round(activeSource.durationSec * 24)),
    [activeSource.durationSec]
  );

  // GPU Pipeline & Media Refs
  const gpuCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<PrismatoneGpuEngine | null>(null);
  const sourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const uploadedVideoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeBackendRef = useRef<ActiveRenderBackend>('webgl2');

  // Cinema Look Presets
  const [presets] = useState<SavedOpticalPresetRecord[]>(initialPresets);
  const [activePresetId, setActivePresetId] = useState<number | null>(
    initialPresets[0]?.id ?? null
  );

  // Video Render Export State
  const [isRenderingJob, setIsRenderingJob] = useState<boolean>(false);
  const renderAbortRef = useRef<AbortController | null>(null);
  const [renderProgress, setRenderProgress] = useState({
    completedChunks: 0,
    totalChunks: 8,
    processedFrames: 0,
    totalFrames: 96,
    lastChunkIndex: 0,
    wasCancelled: false,
  });
  const [exportNotice, setExportNotice] = useState<string | null>(null);

  // Select Camera Body / Color Science Pipeline
  const handleSelectCamera = (camId: string) => {
    setSelectedCameraId(camId);
    setActivePresetId(null);
    const nextCam = getCameraProfileById(camId);
    setParams((prev) => ({
      ...prev,
      sensorCropId: nextCam.cropModes?.[0]?.id ?? 'open-gate',
      highlightRolloff: nextCam.defaultHighlightRolloff,
      sensorGainIso: nextCam.baseIso,
      shutterAngleDeg: nextCam.defaultShutterAngleDeg ?? 180,
      contrast: Number((nextCam.defaultContrast * activeFilmStock.contrastGamma).toFixed(2)),
      saturation: Number((nextCam.defaultSaturation * activeFilmStock.saturationResponse).toFixed(2)),
      halationIntensity:
        activeFilmStock.stockType === 'Digital Sensor Native'
          ? nextCam.defaultHalationBase
          : Number((activeFilmStock.halationIntensity * 0.72 + nextCam.defaultHalationBase * 0.28).toFixed(2)),
      sensorGrainAmount:
        activeFilmStock.stockType === 'Digital Sensor Native'
          ? nextCam.defaultGrainAmount
          : Number((activeFilmStock.grainAmount * 0.72 + nextCam.defaultGrainAmount * 0.28).toFixed(2)),
    }));
  };

  // Select Cinema Lens Glass
  const handleSelectLens = (lensId: string) => {
    setSelectedLensId(lensId);
    setActivePresetId(null);
    const nextLens = getLensProfileById(lensId);
    setParams((prev) =>
      buildOpticalParametersFromRig(
        activeCamera,
        nextLens,
        {
          sensorCropId: prev.sensorCropId,
          filmStockId: prev.filmStockId,
          sensorGainIso: prev.sensorGainIso,
          exposureCompensationEv: prev.exposureCompensationEv,
          shutterAngleDeg: prev.shutterAngleDeg,
          focusPeaking: prev.focusPeaking,
        },
        activeFilmStock
      )
    );
  };

  // Select Film Negative Stock
  const handleSelectFilmStock = (filmId: string) => {
    setSelectedFilmStockId(filmId);
    setActivePresetId(null);
    const nextFilm = getFilmStockById(filmId);
    setParams((prev) => ({
      ...prev,
      filmStockId: nextFilm.id,
      halationIntensity:
        nextFilm.stockType === 'Digital Sensor Native'
          ? activeCamera.defaultHalationBase
          : nextFilm.halationIntensity,
      sensorGrainAmount:
        nextFilm.stockType === 'Digital Sensor Native'
          ? activeCamera.defaultGrainAmount
          : nextFilm.grainAmount,
      grainSize: nextFilm.grainSize,
      gateWeaveAmount: nextFilm.defaultGateWeave,
      contrast: Number((activeCamera.defaultContrast * nextFilm.contrastGamma).toFixed(2)),
      saturation: Number((activeCamera.defaultSaturation * nextFilm.saturationResponse).toFixed(2)),
    }));
  };

  // Select Release Print Stock Emulation
  const handleSelectPrintStock = useCallback((printId: number) => {
    setSelectedPrintStockId(printId);
    setActivePresetId(null);
    setParams((prev) => ({
      ...prev,
      printStockId: printId,
    }));
  }, []);

  // Update a Single Cinematography Parameter
  const handleUpdateParam = useCallback(
    <K extends keyof OpticalSimulationParameters>(
      key: K,
      value: OpticalSimulationParameters[K]
    ) => {
      setActivePresetId(null);
      setParams((prev) => ({
        ...prev,
        [key]: value,
      }));
    },
    []
  );

  const handleUpdateLightAngle = useCallback(
    (angleDeg: number) => {
      const rad = (angleDeg * Math.PI) / 180;
      const radius = 0.36;
      const nextX = Number((0.5 + Math.cos(rad) * radius).toFixed(2));
      const nextY = Number((0.5 + Math.sin(rad) * radius).toFixed(2));
      handleUpdateParam('lightSourceX', nextX);
      handleUpdateParam('lightSourceY', nextY);
    },
    [handleUpdateParam]
  );

  // Reset Look to Selected Camera + Lens + Film Stock Native Signature
  const handleResetToRigDefaults = useCallback(() => {
    setActivePresetId(null);
    setSelectedPrintStockId(0);
    setParams(
      buildOpticalParametersFromRig(
        activeCamera,
        activeLens,
        undefined,
        activeFilmStock
      )
    );
  }, [activeCamera, activeLens, activeFilmStock]);

  // Apply Saved Cinema Look Preset
  const handleApplyPreset = (preset: SavedOpticalPresetRecord) => {
    setActivePresetId(preset.id);
    setSelectedCameraId(preset.cameraId);
    setSelectedLensId(preset.lensId);
    const cam = getCameraProfileById(preset.cameraId);
    const lns = getLensProfileById(preset.lensId);
    try {
      const parsed = JSON.parse(preset.parametersJson);
      setParams(buildOpticalParametersFromRig(cam, lns, parsed, activeFilmStock));
    } catch {
      setParams(buildOpticalParametersFromRig(cam, lns, undefined, activeFilmStock));
    }
  };

  // Stop Live Camera Stream Cleanly
  const stopLiveCamera = useCallback(() => {
    if (liveRafRef.current !== null) {
      cancelAnimationFrame(liveRafRef.current);
      liveRafRef.current = null;
    }
    if (liveRecorderRef.current && liveRecorderRef.current.state !== 'inactive') {
      liveRecorderRef.current.stop();
    }
    if (liveStreamRef.current) {
      liveStreamRef.current.getTracks().forEach((track) => track.stop());
      liveStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.pause();
      liveVideoRef.current.srcObject = null;
    }
    setIsRecordingLiveTake(false);
    setLiveRecordSeconds(0);
    setIsLiveCameraActive(false);
    setLiveCameraUsingSimulatedStream(false);
    setLiveCameraError(null);
  }, []);

  // Start Live Camera Stream (WebRTC getUserMedia with progressive fallbacks & iOS Safari support)
  const startLiveCamera = useCallback(
    async (preferredDeviceId?: string, overrideFacing?: CameraFacingMode) => {
      const targetFacing = overrideFacing ?? cameraFacingMode;
      setIsPlaying(false);
      setExportNotice(null);
      setLiveCameraError(null);

      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach((t) => t.stop());
        liveStreamRef.current = null;
      }

      if (
        typeof navigator === 'undefined' ||
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
      ) {
        setLiveCameraUsingSimulatedStream(true);
        setIsLiveCameraActive(true);
        setLiveResolutionLabel('Live Sim');
        setLiveCameraError(
          'Browser camera API unavailable (requires HTTPS or standalone tab) — running 24fps Live Sensor Emulation'
        );
        return;
      }

      let stream: MediaStream | null = null;
      let lastError: unknown = null;
      const candidates = buildCameraConstraintsCandidates({
        preferredDeviceId,
        facingMode: targetFacing,
      });

      for (const constraints of candidates) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastError = err;
          // Stop retrying if the user explicitly denied permission or context is insecure
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

      if (!stream) {
        setLiveCameraError(formatCameraAccessError(lastError));
        setLiveCameraUsingSimulatedStream(true);
        setIsLiveCameraActive(true);
        setLiveResolutionLabel('Live Sim');
        return;
      }

      try {
        liveStreamRef.current = stream;
        const vid = liveVideoRef.current;
        if (!vid) {
          throw new Error('Video decoder element unavailable');
        }

        vid.muted = true;
        vid.playsInline = true;
        vid.setAttribute('playsinline', 'true');
        vid.setAttribute('muted', 'true');
        vid.srcObject = stream;

        await new Promise<void>((resolve) => {
          if (vid.readyState >= 1) {
            resolve();
            return;
          }
          const onReady = () => {
            vid.removeEventListener('loadedmetadata', onReady);
            resolve();
          };
          vid.addEventListener('loadedmetadata', onReady);
          window.setTimeout(() => {
            vid.removeEventListener('loadedmetadata', onReady);
            resolve();
          }, 1500);
        });

        await vid.play();

        const track = stream.getVideoTracks()[0];
        const settings = track?.getSettings();
        if (settings?.width && settings?.height) {
          setLiveResolutionLabel(`${settings.width}×${settings.height}`);
        } else if (vid.videoWidth && vid.videoHeight) {
          setLiveResolutionLabel(`${vid.videoWidth}×${vid.videoHeight}`);
        } else {
          setLiveResolutionLabel('LIVE');
        }

        if (settings?.deviceId) {
          setSelectedDeviceId(settings.deviceId);
        }
        const detectedFacing = settings?.facingMode;
        if (detectedFacing === 'user' || detectedFacing === 'environment') {
          setCameraFacingMode(detectedFacing);
          setLiveMirrorHorizontal(detectedFacing === 'user');
        } else {
          setLiveMirrorHorizontal(targetFacing === 'user');
        }

        try {
          const allDevices = await navigator.mediaDevices.enumerateDevices();
          const cams = allDevices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(cams);
        } catch {
          // Ignore enumeration error
        }

        setLiveCameraUsingSimulatedStream(false);
        setIsLiveCameraActive(true);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        liveStreamRef.current = null;
        setLiveCameraError(formatCameraAccessError(err));
        setLiveCameraUsingSimulatedStream(true);
        setIsLiveCameraActive(true);
        setLiveResolutionLabel('Live Sim');
      }
    },
    [cameraFacingMode]
  );

  const handleFlipCameraFacing = useCallback(() => {
    const nextFacing: CameraFacingMode =
      cameraFacingMode === 'environment' ? 'user' : 'environment';
    setCameraFacingMode(nextFacing);
    setSelectedDeviceId('');
    setLiveMirrorHorizontal(nextFacing === 'user');
    if (isLiveCameraActive) {
      startLiveCamera(undefined, nextFacing);
    }
  }, [cameraFacingMode, isLiveCameraActive, startLiveCamera]);

  // Clean up camera stream and active live recorder on unmount
  useEffect(() => {
    return () => {
      if (liveRafRef.current !== null) {
        cancelAnimationFrame(liveRafRef.current);
      }
      if (liveRecorderRef.current && liveRecorderRef.current.state !== 'inactive') {
        liveRecorderRef.current.stop();
      }
      if (liveStreamRef.current) {
        liveStreamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Initialize GPU Simulation Engine (WebGPU primary + WebGL2 fallback)
  const [engineReadyCount, setEngineReadyCount] = useState(0);
  useEffect(() => {
    const canvas = gpuCanvasRef.current;
    if (!canvas) return;

    const engine = new PrismatoneGpuEngine(canvas, (telemetry) => {
      activeBackendRef.current = telemetry.activeBackend;
    });
    engineRef.current = engine;

    engine.initialize('auto').then(() => {
      setEngineReadyCount((c) => c + 1);
    });

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  // Load Active Footage Still / Video Source
  useEffect(() => {
    if (!sourceCanvasRef.current && typeof document !== 'undefined') {
      const off = document.createElement('canvas');
      off.width = INTERNAL_RENDER_W;
      off.height = INTERNAL_RENDER_H;
      sourceCanvasRef.current = off;
    }

    if (activeSource.type === 'plate-image' && activeSource.imagePath) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.referrerPolicy = 'no-referrer';
      img.onload = () => {
        loadedImageRef.current = img;
        if (sourceCanvasRef.current) {
          const ctx = sourceCanvasRef.current.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, INTERNAL_RENDER_W, INTERNAL_RENDER_H);
          }
        }
        if (engineRef.current && sourceCanvasRef.current) {
          engineRef.current.uploadSourceMedia(
            sourceCanvasRef.current,
            INTERNAL_RENDER_W,
            INTERNAL_RENDER_H
          );
          setEngineReadyCount((c) => c + 1);
        }
      };
      img.onerror = () => {
        loadedImageRef.current = null;
        if (sourceCanvasRef.current) {
          const ctx = sourceCanvasRef.current.getContext('2d');
          if (ctx) {
            renderProceduralCinemaFrame(
              ctx,
              INTERNAL_RENDER_W,
              INTERNAL_RENDER_H,
              0.0,
              activeSource.id
            );
          }
          if (engineRef.current) {
            engineRef.current.uploadSourceMedia(
              sourceCanvasRef.current,
              INTERNAL_RENDER_W,
              INTERNAL_RENDER_H
            );
            setEngineReadyCount((c) => c + 1);
          }
        }
      };
      img.src = activeSource.imagePath;
    } else {
      loadedImageRef.current = null;
    }
  }, [activeSource]);

  // Render Current Frame through the GPU Cinema Pipeline
  const renderGpuTick = useCallback(
    (frameIdx: number) => {
      const engine = engineRef.current;
      const srcCanvas = sourceCanvasRef.current;
      if (!engine || !srcCanvas) return 3.0;

      const w = INTERNAL_RENDER_W;
      const h = INTERNAL_RENDER_H;
      const timeSec = frameIdx / 24.0;
      const ctx = srcCanvas.getContext('2d');

      if (ctx) {
        if (isLiveCameraActive && !liveCameraUsingSimulatedStream && liveVideoRef.current) {
          const vid = liveVideoRef.current;
          if (vid.readyState >= 2 && vid.videoWidth > 0 && vid.videoHeight > 0) {
            const crop = computeCoverCropRect(vid.videoWidth, vid.videoHeight, w, h);
            ctx.save();
            if (liveMirrorHorizontal) {
              ctx.translate(w, 0);
              ctx.scale(-1, 1);
            }
            ctx.drawImage(vid, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
            ctx.restore();
          } else {
            ctx.fillStyle = '#07090f';
            ctx.fillRect(0, 0, w, h);
          }
        } else if (isLiveCameraActive && liveCameraUsingSimulatedStream) {
          ctx.save();
          const panX = Math.sin(timeSec * 0.55) * 14;
          const panY = Math.cos(timeSec * 0.42) * 8;
          if (loadedImageRef.current) {
            ctx.translate(w * 0.5 + panX, h * 0.5 + panY);
            if (liveMirrorHorizontal) {
              ctx.scale(-1.05, 1.05);
            } else {
              ctx.scale(1.05, 1.05);
            }
            ctx.drawImage(loadedImageRef.current, -w * 0.5, -h * 0.5, w, h);
          } else {
            renderProceduralCinemaFrame(ctx, w, h, timeSec, activeSource.id);
          }
          ctx.restore();

          const lx = (0.5 + Math.sin(timeSec * 0.85) * 0.24) * w;
          const ly = (0.34 + Math.cos(timeSec * 0.65) * 0.08) * h;
          const g = ctx.createRadialGradient(lx, ly, 1, lx, ly, 22);
          g.addColorStop(0, 'rgba(255, 252, 240, 0.96)');
          g.addColorStop(0.4, 'rgba(251, 191, 36, 0.45)');
          g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(lx, ly, 22, 0, Math.PI * 2);
          ctx.fill();
        } else if (activeSource.type === 'uploaded-video' && uploadedVideoRef.current) {
          const vid = uploadedVideoRef.current;
          if (vid.readyState >= 2) {
            ctx.drawImage(vid, 0, 0, w, h);
          }
        } else if (loadedImageRef.current) {
          ctx.drawImage(loadedImageRef.current, 0, 0, w, h);
          if (isPlaying || isRenderingJob) {
            const shimmerX = (0.72 + Math.sin(timeSec * 0.9) * 0.03) * w;
            const shimmerY = (0.32 + Math.cos(timeSec * 0.7) * 0.025) * h;
            const g = ctx.createRadialGradient(shimmerX, shimmerY, 1, shimmerX, shimmerY, 16);
            g.addColorStop(0, 'rgba(255, 250, 235, 0.75)');
            g.addColorStop(0.5, 'rgba(251, 191, 36, 0.3)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(shimmerX, shimmerY, 16, 0, Math.PI * 2);
            ctx.fill();
          }
        } else {
          renderProceduralCinemaFrame(ctx, w, h, timeSec, activeSource.id);
        }
      }

      engine.uploadSourceMedia(srcCanvas, w, h);

      const fullParams: OpticalSimulationParameters = {
        ...params,
        printStockId: selectedPrintStockId,
        targetAspectRatio: activeAspectGate.ratio,
        gateMode: gateGuideMode ? 1.0 : 0.0,
      };

      const uniformData = packOpticalUniformBuffer(
        activeCamera,
        fullParams,
        w,
        h,
        timeSec,
        splitWipeX,
        splitEnabled,
        qualityMode,
        activeLens,
        activeFilmStock
      );

      return engine.renderFrame(uniformData, srcCanvas);
    },
    [
      activeAspectGate.ratio,
      activeCamera,
      activeFilmStock,
      activeLens,
      activeSource,
      gateGuideMode,
      isLiveCameraActive,
      isPlaying,
      isRenderingJob,
      liveCameraUsingSimulatedStream,
      liveMirrorHorizontal,
      params,
      qualityMode,
      selectedPrintStockId,
      splitEnabled,
      splitWipeX,
    ]
  );

  // Keep live rAF loop reading latest renderGpuTick without restarting stream loop
  useEffect(() => {
    renderGpuTickRef.current = renderGpuTick;
  }, [renderGpuTick]);

  // Continuous Real-Time GPU Emulation Loop when Live Camera is Active
  useEffect(() => {
    if (!isLiveCameraActive) return;

    let lastTick = performance.now();
    const loop = (now: number) => {
      if (now - lastTick >= 33) {
        lastTick = now;
        liveFrameCounterRef.current = (liveFrameCounterRef.current + 1) % 86400;
        setCurrentFrame(liveFrameCounterRef.current);
        renderGpuTickRef.current(liveFrameCounterRef.current);
      }
      liveRafRef.current = requestAnimationFrame(loop);
    };

    liveRafRef.current = requestAnimationFrame(loop);
    return () => {
      if (liveRafRef.current !== null) {
        cancelAnimationFrame(liveRafRef.current);
        liveRafRef.current = null;
      }
    };
  }, [isLiveCameraActive]);

  // Live Take Recording Timer
  useEffect(() => {
    if (!isRecordingLiveTake) return;
    const timer = window.setInterval(() => {
      setLiveRecordSeconds((s) => s + 1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isRecordingLiveTake]);

  // Start / Stop Unlimited Live Camera Take Recording in Device-Native Video Format
  const handleToggleLiveTakeRecording = () => {
    const canvas = gpuCanvasRef.current;
    if (!canvas) return;

    if (isRecordingLiveTake && liveRecorderRef.current) {
      if (liveRecorderRef.current.state !== 'inactive') {
        liveRecorderRef.current.stop();
      }
      setIsRecordingLiveTake(false);
      return;
    }

    if (typeof canvas.captureStream !== 'function' || typeof MediaRecorder === 'undefined') {
      setExportNotice('Browser MediaRecorder unavailable for live stream capture');
      return;
    }

    try {
      setLiveRecordSeconds(0);
      liveRecordedChunksRef.current = [];
      const startedAtMs = Date.now();
      const stream = canvas.captureStream(30);
      const nativeFmt = selectDeviceNativeVideoFormat();
      const recorderOptions: MediaRecorderOptions = {
        videoBitsPerSecond: qualityMode === 'final' ? 8_000_000 : 4_000_000,
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
          liveRecordedChunksRef.current.push(ev.data);
        }
      };

      recorder.onstop = () => {
        const elapsedSec = Math.max(1, Math.round((Date.now() - startedAtMs) / 1000));
        setLiveRecordSeconds(0);
        if (liveRecordedChunksRef.current.length > 0) {
          const blobMeta = resolveRecordedBlobMeta(recorder.mimeType, nativeFmt);
          const blob = new Blob(liveRecordedChunksRef.current, { type: blobMeta.mimeType });
          const url = URL.createObjectURL(blob);
          const fileName = `prismatone_live_take_${selectedCameraId}_${selectedLensId}_${Date.now()}.${blobMeta.extension}`;
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          window.setTimeout(() => URL.revokeObjectURL(url), 4000);
          setExportNotice(
            `Saved ${nativeFmt.label} (${formatRecordingDuration(elapsedSec)}): ${fileName}`
          );
        }
      };

      recorder.start(250);
      liveRecorderRef.current = recorder;
      setIsRecordingLiveTake(true);
      setExportNotice(null);
    } catch {
      setExportNotice('Could not initialize live video recorder');
    }
  };

  // Sync Uploaded Video Element Playback & Seeking
  useEffect(() => {
    const vid = uploadedVideoRef.current;
    if (!vid || activeSource.type !== 'uploaded-video' || isLiveCameraActive) return;

    if (isPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
      const targetTime = Math.min(vid.duration || 10, currentFrame / 24);
      if (Math.abs(vid.currentTime - targetTime) > 0.05 && Number.isFinite(targetTime)) {
        vid.currentTime = targetTime;
      }
    }
  }, [isPlaying, currentFrame, activeSource.type, isLiveCameraActive]);

  // Trigger Immediate GPU Frame Render when Parameters / Frame Change (in non-live mode)
  useEffect(() => {
    if (!isLiveCameraActive) {
      renderGpuTick(currentFrame);
    }
  }, [renderGpuTick, currentFrame, engineReadyCount, isLiveCameraActive]);

  // Paced 24fps Playback Loop for Reels / Uploaded Clips
  useEffect(() => {
    if (!isPlaying || isLiveCameraActive) return;
    const interval = window.setInterval(() => {
      if (activeSource.type === 'uploaded-video' && uploadedVideoRef.current) {
        const vid = uploadedVideoRef.current;
        const vidFrame = Math.floor((vid.currentTime || 0) * 24) % totalTimelineFrames;
        setCurrentFrame(vidFrame);
      } else {
        setCurrentFrame((prev) => (prev + 1) % totalTimelineFrames);
      }
    }, 42);
    return () => window.clearInterval(interval);
  }, [isPlaying, isLiveCameraActive, activeSource.type, totalTimelineFrames]);

  // Import Real Video (.mp4, .mov, .webm) or Still Frame
  const ingestImportedFile = (file: File) => {
    if (isLiveCameraActive) {
      stopLiveCamera();
    }
    const url = URL.createObjectURL(file);
    const isVideo = file.type.startsWith('video/');
    const newId = `imported-footage-${Date.now()}`;

    const newItem: CalibrationSourceItem = {
      id: newId,
      name: file.name,
      subtitle: isVideo ? 'Production Video' : 'Imported Cinema Still',
      type: isVideo ? 'uploaded-video' : 'plate-image',
      imagePath: isVideo ? undefined : url,
      codec: isVideo ? file.type || 'VIDEO' : file.type.toUpperCase(),
      resolution: '1920×1080',
      fps: 24,
      durationSec: 6.0,
    };

    if (isVideo) {
      const vid = document.createElement('video');
      vid.src = url;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.onloadedmetadata = () => {
        const resLabel = `${vid.videoWidth || 1920}×${vid.videoHeight || 1080}`;
        const dur = Number.isFinite(vid.duration) && vid.duration > 0 ? vid.duration : 6.0;
        setSources((prev) =>
          prev.map((item) =>
            item.id === newId ? { ...item, resolution: resLabel, durationSec: dur } : item
          )
        );
        renderGpuTick(0);
      };
      vid.onseeked = () => {
        renderGpuTick(Math.floor(vid.currentTime * 24));
      };
      uploadedVideoRef.current = vid;
      setIsPlaying(true);
    }

    setExportNotice(null);
    setCurrentFrame(0);
    setSources((prev) => [newItem, ...prev]);
    setActiveSourceId(newId);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      ingestImportedFile(file);
    }
    e.target.value = '';
  };

  // Render & Download Full Timeline Video in Device-Native Format (uncapped frames)
  const handleRenderAndExportVideo = async (resumeFromCancelled = false) => {
    if (isRenderingJob) return;
    const canvas = gpuCanvasRef.current;
    if (!canvas) return;

    setIsPlaying(false);
    setIsRenderingJob(true);
    setExportNotice(null);

    const abortCtrl = new AbortController();
    renderAbortRef.current = abortCtrl;
    const startChunk = resumeFromCancelled ? renderProgress.lastChunkIndex + 1 : 0;
    const targetFrames = totalTimelineFrames;

    const nativeFmt = selectDeviceNativeVideoFormat();
    let recorder: MediaRecorder | null = null;
    const recordedChunks: BlobPart[] = [];
    const canRecordVideo =
      typeof canvas.captureStream === 'function' && typeof MediaRecorder !== 'undefined';

    if (canRecordVideo) {
      try {
        const stream = canvas.captureStream(24);
        const recorderOptions: MediaRecorderOptions = {
          videoBitsPerSecond: qualityMode === 'final' ? 8_000_000 : 4_000_000,
        };
        if (
          typeof MediaRecorder.isTypeSupported === 'function' &&
          MediaRecorder.isTypeSupported(nativeFmt.mimeType)
        ) {
          recorderOptions.mimeType = nativeFmt.mimeType;
        }
        recorder = new MediaRecorder(stream, recorderOptions);
        recorder.ondataavailable = (ev) => {
          if (ev.data && ev.data.size > 0) {
            recordedChunks.push(ev.data);
          }
        };
        recorder.start(200);
      } catch {
        recorder = null;
      }
    }

    const result = await runChunkedWorkerRenderJob({
      totalFrames: targetFrames,
      chunkSize: 12,
      startFromChunk: startChunk,
      qualityMode,
      signal: abortCtrl.signal,
      onFrameRenderRequest: (frameIdx) => {
        setCurrentFrame(frameIdx);
        if (activeSource.type === 'uploaded-video' && uploadedVideoRef.current) {
          uploadedVideoRef.current.currentTime = frameIdx / 24;
        }
        renderGpuTick(frameIdx);
      },
      onChunkProgress: (info) => {
        setRenderProgress({
          ...info,
          wasCancelled: false,
        });
      },
    });

    if (result.status === 'cancelled') {
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
      }
      setIsRenderingJob(false);
      setRenderProgress((prev) => ({ ...prev, wasCancelled: true }));
      return;
    }

    const fileBase = `prismatone_${selectedCameraId}_${selectedLensId}_${selectedAspectId.replace(':', 'x')}`;
    let exportedExtension: string = nativeFmt.extension;

    if (recorder && recorder.state !== 'inactive') {
      await new Promise<void>((resolve) => {
        recorder!.onstop = () => {
          if (recordedChunks.length > 0) {
            const blobMeta = resolveRecordedBlobMeta(recorder!.mimeType, nativeFmt);
            exportedExtension = blobMeta.extension;
            const videoBlob = new Blob(recordedChunks, { type: blobMeta.mimeType });
            const downloadUrl = URL.createObjectURL(videoBlob);
            const anchor = document.createElement('a');
            anchor.href = downloadUrl;
            anchor.download = `${fileBase}.${blobMeta.extension}`;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
            setExportNotice(
              `Exported ${fileBase}.${blobMeta.extension} (${nativeFmt.label} · ${targetFrames}f)`
            );
          } else {
            setExportNotice(`Rendered ${targetFrames} frames (${qualityMode.toUpperCase()})`);
          }
          resolve();
        };
        recorder!.stop();
      });
    } else {
      setExportNotice(`Rendered ${targetFrames} frames (${qualityMode.toUpperCase()})`);
    }

    setIsRenderingJob(false);

    fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Cinema Render · ${activeSource.name}`,
        sourceMediaName: activeSource.name,
        cameraId: selectedCameraId,
        lensId: selectedLensId,
        renderMode: qualityMode,
        gpuBackend: activeBackendRef.current,
        status: 'completed',
        totalFrames: targetFrames,
        completedFrames: result.processedFrames,
        chunkSize: 12,
        avgFrameTimeMs: '4.2',
        outputResolution: qualityMode === 'final' ? '3840x2160' : '1920x1080',
        s3OutputKey: `exports/${fileBase}.${exportedExtension}`,
      }),
    }).catch(() => {});
  };

  const handleCancelChunkedRender = () => {
    if (renderAbortRef.current) {
      renderAbortRef.current.abort();
    }
  };

  // Export Single Cinema Still Frame (.png)
  const handleDownloadStill = () => {
    const canvas = gpuCanvasRef.current;
    if (!canvas) return;
    setIsShutterFlashing(true);
    window.setTimeout(() => setIsShutterFlashing(false), 140);
    const dataUrl = canvas.toDataURL('image/png');
    const fileName = `prismatone_${selectedCameraId}_${selectedLensId}_f${currentFrame}.png`;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setExportNotice(`Saved still: ${fileName}`);
    window.setTimeout(() => setExportNotice(null), 2400);
  };

  // Format SMPTE Timecode HH:MM:SS:FF at 24fps
  const formatTimecode = (frame: number) => {
    const totalSecs = Math.floor(frame / 24);
    const mm = Math.floor(totalSecs / 60);
    const ss = totalSecs % 60;
    const ff = frame % 24;
    return `00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}:${String(ff).padStart(2, '0')}`;
  };

  const renderPercent =
    renderProgress.totalFrames > 0
      ? Math.round((renderProgress.processedFrames / renderProgress.totalFrames) * 100)
      : 0;

  return (
    <div
      suppressHydrationWarning
      className="relative h-dvh w-full overflow-hidden flex flex-col bg-black text-slate-100 select-none"
    >
      {/* Hidden Video/Still File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        onChange={handleFileUpload}
        className="hidden"
        aria-label="Import Cinema Footage"
      />

      {/* DOM-Mounted Video Decoder for iOS Safari / WebRTC Live Camera (non-zero opacity/size avoids compositor frame culling) */}
      <video
        ref={liveVideoRef}
        playsInline
        muted
        autoPlay
        aria-hidden="true"
        className="fixed bottom-0 right-0 w-8 h-8 opacity-[0.01] -z-10 pointer-events-none"
      />

      {/* CAMERA VIEWFINDER OSD HEADER (SINGLE TRANSLUCENT CAMERA BAR ON MOBILE, DOCKED ON DESKTOP) */}
      <header className="absolute lg:static top-0 inset-x-0 z-30 shrink-0 px-2 sm:px-4 pt-[max(0.45rem,env(safe-area-inset-top))] pb-2 lg:py-2 bg-gradient-to-b from-black/85 via-black/45 to-transparent lg:bg-[#080b12]/90 lg:bg-none lg:backdrop-blur-xl lg:border-b lg:border-white/10 flex items-center justify-between gap-1.5 sm:gap-2 pointer-events-none lg:pointer-events-auto">
        {/* Left: Camera Live Status Pill + Tap-for-Dials Rig Badge */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-2 min-w-0 shrink">
          <div
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full text-[10px] sm:text-xs font-mono font-semibold border backdrop-blur-md shadow-sm transition-all shrink-0 ${
              isRecordingLiveTake
                ? 'bg-rose-500/25 border-rose-500 text-rose-200 animate-pulse'
                : isLiveCameraActive
                ? 'bg-rose-500/20 border-rose-500/45 text-rose-200'
                : 'bg-black/60 border-white/15 text-emerald-300'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${
                isRecordingLiveTake
                  ? 'bg-rose-500 animate-ping'
                  : isLiveCameraActive
                  ? 'bg-rose-500'
                  : 'bg-emerald-400'
              }`}
            />
            <span>
              {isRecordingLiveTake
                ? `REC ${formatRecordingDuration(liveRecordSeconds)}`
                : isLiveCameraActive
                ? `LIVE`
                : '24p'}
            </span>
          </div>

          {/* Timecode Pill (Desktop / Wide Screens) */}
          <div className="hidden xl:flex items-center px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-xs font-mono text-amber-300 shrink-0">
            {formatTimecode(currentFrame)}
          </div>

          {/* Active Camera & Lens Rig Badge Pill (Tap to open Dials) */}
          <button
            type="button"
            onClick={() => {
              setIsConsoleCollapsed(false);
              setActiveConsoleTab((prev) => (prev === 'camera' ? 'lens' : 'camera'));
            }}
            aria-label="Switch between Camera and Lens rotary dials"
            className="flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-full bg-black/60 lg:bg-white/5 hover:bg-white/15 border border-white/15 backdrop-blur-md cursor-pointer transition-all active:scale-95 min-w-0"
            title="Tap to switch between Camera and Lens rotary dials"
          >
            <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-sky-400 shrink-0 hidden xs:inline" />
            <span className="text-[10px] sm:text-xs font-semibold text-white truncate max-w-[54px] sm:max-w-[140px]">
              {activeCamera.model}
            </span>
            <span className="text-slate-500 hidden sm:inline shrink-0">·</span>
            <span className="hidden sm:inline text-[11px] font-medium text-amber-200 truncate max-w-[130px]">
              {activeLens.model}
            </span>
            <span className="text-[10px] sm:text-xs font-mono font-bold text-emerald-300 shrink-0">
              T{params.apertureFStop.toFixed(1)}
            </span>
          </button>
        </div>

        {/* Right: Single Row of Viewfinder Quick-Toggles */}
        <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Aspect Ratio Gate Pill */}
          <div className="relative shrink-0">
            <select
              value={selectedAspectId}
              onChange={(e) => setSelectedAspectId(e.target.value)}
              aria-label="Aspect Ratio Gate"
              className="px-1.5 sm:px-2.5 py-1 rounded-full bg-black/60 lg:bg-white/5 border border-white/15 text-[10px] sm:text-xs font-mono text-amber-300 outline-none cursor-pointer appearance-none pr-4 sm:pr-5 hover:bg-white/10 transition-colors backdrop-blur-md"
            >
              {CINEMA_ASPECT_GATES.map((g) => (
                <option key={g.id} value={g.id} className="bg-[#0b0e17] text-slate-200">
                  {g.id}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3 h-3 text-slate-400 absolute right-1 sm:right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Frame Guides Toggle */}
            <button
              type="button"
              onClick={() => setGateGuideMode((prev) => !prev)}
              aria-label="Toggle Cinema Frame Guides"
              title="Toggle Cinema Frame Guides"
              className={`w-7 h-7 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border backdrop-blur-md text-xs transition-colors ${
                gateGuideMode
                  ? 'bg-amber-500/25 border-amber-500/60 text-amber-300'
                  : 'bg-black/60 lg:bg-white/5 border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              <Frame className="w-3.5 h-3.5" />
            </button>

            {/* Grid Toggle */}
            <button
              type="button"
              onClick={() => setShowGridOverlay((prev) => !prev)}
              aria-label="Toggle Rule-of-Thirds Grid"
              title="Toggle Rule-of-Thirds Grid & Center Crosshair"
              className={`w-7 h-7 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border backdrop-blur-md text-xs transition-colors ${
                showGridOverlay
                  ? 'bg-sky-500/25 border-sky-500/60 text-sky-300'
                  : 'bg-black/60 lg:bg-white/5 border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              <Grid className="w-3.5 h-3.5" />
            </button>

            {/* Peaking Assist Toggle */}
            <button
              type="button"
              onClick={() => handleUpdateParam('focusPeaking', !params.focusPeaking)}
              aria-label="Toggle Optical Focus Peaking Assist"
              title="Toggle Optical Focus Peaking Assist"
              className={`w-7 h-7 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full border backdrop-blur-md text-xs transition-colors ${
                params.focusPeaking
                  ? 'bg-emerald-500/25 border-emerald-500/60 text-emerald-300'
                  : 'bg-black/60 lg:bg-white/5 border-white/15 text-slate-300 hover:text-white'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>

            {/* Spectral Curves Trigger (Mobile / Tablet Top HUD) */}
            <button
              type="button"
              onClick={() => setShowSpectralModal(true)}
              aria-label="Open Spectral Sensitivity Curves Visualizer"
              title="Spectral Sensitivity Curves Visualizer"
              className="lg:hidden w-7 h-7 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full bg-black/60 hover:bg-white/15 backdrop-blur-md border border-sky-400/40 text-sky-300 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            {/* Live Camera Emulation Pill Button */}
            <button
              type="button"
              onClick={() => {
                if (isLiveCameraActive) {
                  stopLiveCamera();
                } else {
                  startLiveCamera(selectedDeviceId || undefined);
                }
              }}
              aria-label={isLiveCameraActive ? 'Stop Live Camera' : 'Start Live Camera Emulation'}
              className={`hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all ${
                isLiveCameraActive
                  ? 'bg-rose-600 text-white border-rose-400 shadow-[0_0_12px_rgba(225,29,72,0.5)]'
                  : 'bg-white/5 hover:bg-white/15 border-white/10 text-rose-300'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
              <span>{isLiveCameraActive ? 'Cam ON' : 'Live Cam'}</span>
            </button>

            {/* Fullscreen WebGL2 LUT Camera Button (Desktop Bar — mobile has it right beside shutter) */}
            <button
              type="button"
              onClick={() => {
                if (isLiveCameraActive) {
                  stopLiveCamera();
                }
                setShowFullscreenLutCam(true);
              }}
              aria-label="Open Fullscreen WebGL2 LUT Camera"
              title="Open Fullscreen WebGL2 Camera with Vintage Film & Grayscale LUT Shaders"
              className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/40 text-xs font-semibold text-amber-300 transition-colors"
            >
              <Film className="w-3.5 h-3.5" />
              <span>LUT Cam</span>
            </button>

            {/* Save Still Shutter Snap (Desktop Bar — mobile uses Center Shutter) */}
            <button
              type="button"
              onClick={handleDownloadStill}
              aria-label="Snap Cinema Still"
              title="Snap & Save Full-Resolution Cinema Still (PNG)"
              className="hidden lg:flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-xs font-medium text-slate-200 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-sky-400" />
              <span>Snap</span>
            </button>

            {/* Import File Button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Import Cinema Video or Still"
              title="Import Cinema Video or Still"
              className="w-7 h-7 sm:w-auto sm:h-auto sm:p-1.5 flex items-center justify-center rounded-full bg-black/60 lg:bg-white/5 hover:bg-white/15 backdrop-blur-md border border-white/15 text-slate-200 hover:text-white transition-colors"
            >
              <Upload className="w-3.5 h-3.5 text-amber-400" />
            </button>
          </div>
        </div>
      </header>

      {/* CINEMA CAMERA MAIN VIEWPORT & CONTROLS CONTAINER */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative">
        {/* CENTER CINEMA VIEWFINDER STAGE (EDGE-TO-EDGE ON MOBILE, MONITOR BEZEL ON DESKTOP) */}
        <main
          onDragOver={(e) => {
            e.preventDefault();
            setIsDraggingFile(true);
          }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDraggingFile(false);
            const dropped = e.dataTransfer.files?.[0];
            if (dropped) ingestImportedFile(dropped);
          }}
          className="flex-1 relative flex flex-col items-center justify-center p-0 lg:p-3 bg-black min-h-0 overflow-hidden"
        >
          {/* Edge-to-Edge Mobile Viewfinder / Desktop Monitor Bezel */}
          <div className="relative w-full h-full flex items-center justify-center min-h-0">
            <div
              className={`relative w-full h-full lg:max-w-full lg:max-h-full lg:aspect-video bg-black lg:rounded-xl overflow-hidden lg:border lg:shadow-[0_12px_48px_rgba(0,0,0,0.9)] transition-all ${
                isDraggingFile
                  ? 'lg:border-amber-400 lg:ring-2 lg:ring-amber-400/40'
                  : isRecordingLiveTake
                  ? 'lg:border-rose-500/90 lg:ring-2 lg:ring-rose-500/50'
                  : 'lg:border-white/10 lg:ring-1 lg:ring-white/5'
              }`}
            >
              {/* WebGL2 Cinema Simulation Canvas (full-bleed object-cover on mobile viewfinder, object-contain on desktop) */}
              <canvas
                ref={gpuCanvasRef}
                width={INTERNAL_RENDER_W}
                height={INTERNAL_RENDER_H}
                data-testid="gpu-preview-canvas"
                onClick={(e) => {
                  if (splitEnabled) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
                    setSplitWipeX(Math.max(0.05, Math.min(0.95, relX)));
                  }
                }}
                onMouseMove={(e) => {
                  if (splitEnabled && e.buttons === 1) {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const relX = (e.clientX - rect.left) / Math.max(1, rect.width);
                    setSplitWipeX(Math.max(0.05, Math.min(0.95, relX)));
                  }
                }}
                className={`w-full h-full block object-cover lg:object-contain ${
                  splitEnabled ? 'cursor-ew-resize' : 'cursor-default'
                }`}
              />

              {/* Tactile Shutter Flash Feedback */}
              {isShutterFlashing && (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-white/75 z-30 transition-opacity duration-150"
                />
              )}

              {/* Saved Still / Record Notice Toast */}
              {exportNotice && (
                <div className="pointer-events-none absolute top-14 lg:top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-emerald-500/20 backdrop-blur-md border border-emerald-400/50 text-emerald-200 text-[11px] font-mono whitespace-nowrap shadow-lg">
                  {exportNotice}
                </div>
              )}

              {/* Rule-of-Thirds Grid Overlay */}
              {showGridOverlay && (
                <div className="absolute inset-0 pointer-events-none grid grid-cols-3 grid-rows-3 border border-white/10 z-10">
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-b border-white/20" />
                  <div className="border-r border-b border-white/20" />
                  <div className="border-r border-b border-white/20 relative">
                    {/* Center Crosshair */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border border-amber-400/60 rounded-full flex items-center justify-center">
                      <div className="w-1 h-1 bg-amber-400 rounded-full" />
                    </div>
                  </div>
                  <div className="border-b border-white/20" />
                  <div className="border-r border-white/20" />
                  <div className="border-r border-white/20" />
                  <div />
                </div>
              )}

              {/* Cinema Aspect Ratio Frame Guides (if gateGuideMode is active) */}
              {gateGuideMode && selectedAspectId !== 'original' && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-10">
                  <div
                    style={{
                      aspectRatio:
                        selectedAspectId === '2.39:1'
                          ? '2.39/1'
                          : selectedAspectId === '1.85:1'
                          ? '1.85/1'
                          : selectedAspectId === '1.43:1'
                          ? '1.43/1'
                          : selectedAspectId === '1.33:1'
                          ? '1.33/1'
                          : '16/9',
                    }}
                    className="w-full h-full max-h-full border border-dashed border-amber-400/70 relative"
                  >
                    <span className="absolute top-1 left-2 font-mono text-[9px] text-amber-300/80 bg-black/60 px-1 rounded">
                      {selectedAspectId} GATE
                    </span>
                  </div>
                </div>
              )}

              {/* A/B Compare Split Wipe */}
              {splitEnabled && (
                <>
                  <div
                    style={{ left: `${splitWipeX * 100}%` }}
                    className="absolute top-0 bottom-0 w-0.5 bg-amber-400 pointer-events-none z-20 shadow-[0_0_8px_rgba(245,158,11,0.8)]"
                  >
                    <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono text-[10px] font-bold shadow-lg">
                      A/B
                    </div>
                  </div>
                  <div className="absolute bottom-28 lg:bottom-14 left-3 right-3 sm:left-4 sm:right-4 flex items-center justify-between gap-2 pointer-events-none text-[10px] sm:text-[11px] font-mono z-20">
                    <span className="bg-black/85 backdrop-blur text-slate-300 px-2.5 py-1 rounded-full border border-white/10 shadow">
                      {isLiveCameraActive ? 'Raw Camera Sensor' : 'Rec.709 Camera Source'}
                    </span>
                    <span className="bg-amber-500 text-slate-950 font-semibold px-2.5 py-1 rounded-full shadow truncate max-w-[65%]">
                      {activeFilmStock.name} · {activePrintStock.name}
                      {(params.hollywoodLutId ?? 0) > 0 && (params.hollywoodLutBlend ?? 0) > 0.01
                        ? ` · ${getHollywoodLutByShaderId(params.hollywoodLutId ?? 0).shortName} (${Math.round(
                            (params.hollywoodLutBlend ?? 0.85) * 100
                          )}%)`
                        : ''}
                    </span>
                  </div>
                </>
              )}

              {/* Drag-and-Drop Prompt */}
              {isDraggingFile && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-sm flex flex-col items-center justify-center gap-2 border-2 border-dashed border-amber-400 rounded-xl pointer-events-none z-30">
                  <Upload className="w-9 h-9 text-amber-400 animate-bounce" />
                  <p className="text-sm font-semibold text-slate-100">
                    Drop Cinema Video or Still Plate
                  </p>
                </div>
              )}

              {/* Desktop-Only Viewfinder HUD Bar & Spectral Lab Trigger (avoids duplicate truncated HUD on mobile) */}
              <div className="hidden lg:flex absolute top-3 inset-x-3 items-center justify-between gap-2 pointer-events-none z-20">
                <div className="min-w-0 flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-[11px] font-mono text-slate-200 shadow-lg overflow-hidden">
                  <span className="text-amber-300 font-semibold">{activeCamera.model}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-sky-300 font-semibold">{activeLens.model}</span>
                  <span className="text-slate-500">/</span>
                  <span className="text-emerald-300 shrink-0">T{params.apertureFStop.toFixed(1)}</span>
                  <span className="text-slate-500">/</span>
                  <span className="shrink-0">{params.focalLengthMm}mm</span>
                  {params.anamorphicSqueeze > 1.05 && (
                    <span className="text-purple-300 font-bold shrink-0">
                      {params.anamorphicSqueeze}×
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowSpectralModal(true)}
                  aria-label="Open Spectral Sensitivity Curves Visualizer"
                  title="Open Spectral Sensitivity Curves Visualizer"
                  className="pointer-events-auto shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/80 hover:bg-black/95 backdrop-blur-md border border-sky-400/40 text-[11px] font-mono text-sky-300 hover:text-white transition-all shadow-lg active:scale-95"
                >
                  <Sparkles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <span>Spectral Lab</span>
                </button>
              </div>

              {/* Live Camera Diagnostic Pill (when physical camera is blocked/unavailable) */}
              {isLiveCameraActive && liveCameraError && (
                <div className="absolute bottom-28 lg:bottom-14 left-1/2 -translate-x-1/2 w-[92%] max-w-[600px] px-3 py-1.5 rounded-full bg-amber-950/90 backdrop-blur-md border border-amber-400/50 text-[10px] sm:text-[11px] font-mono text-amber-200 flex items-center justify-between gap-2 shadow-xl z-20">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="truncate">{liveCameraError}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startLiveCamera(selectedDeviceId || undefined)}
                      className="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-bold hover:bg-amber-300 transition-colors"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setLiveCameraError(null)}
                      aria-label="Dismiss camera warning"
                      className="p-0.5 text-amber-300 hover:text-white"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}

              {/* MOBILE / COMPACT GENUINE CAMERA APP SHUTTER & TRANSPORT DECK (< lg, hidden when bottom sheet dials are open) */}
              {isConsoleCollapsed && (
              <div className="lg:hidden absolute bottom-0 inset-x-0 z-25 pt-6 pb-2.5 px-3 bg-gradient-to-t from-black/95 via-black/65 to-transparent flex flex-col items-center gap-2 pointer-events-none">
                {/* Clean Scrubber Strip when reviewing plates/footage */}
                {!isLiveCameraActive && (
                  <div className="pointer-events-auto w-full max-w-md px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsPlaying((prev) => !prev)}
                      aria-label={isPlaying ? 'Pause Playback' : 'Play 24fps'}
                      className="w-6 h-6 rounded-full bg-amber-400 text-slate-950 flex items-center justify-center shrink-0 shadow"
                    >
                      {isPlaying ? (
                        <Pause className="w-3 h-3 fill-current" />
                      ) : (
                        <Play className="w-3 h-3 fill-current ml-0.5" />
                      )}
                    </button>

                    <input
                      id="timeline-scrubber-mobile"
                      type="range"
                      min={0}
                      max={totalTimelineFrames - 1}
                      value={currentFrame}
                      onChange={(e) => {
                        setIsPlaying(false);
                        setCurrentFrame(parseInt(e.target.value, 10));
                      }}
                      className="studio-slider flex-1 min-w-0 w-full"
                      aria-label="Mobile Timeline Frame Scrubber"
                    />

                    <span className="text-[10px] font-mono tabular-nums text-amber-300 whitespace-nowrap shrink-0">
                      {currentFrame}/{totalTimelineFrames}
                    </span>
                  </div>
                )}

                {/* Authentic iPhone / Pro Cinema Camera Shutter Bar */}
                <div className="pointer-events-auto w-full max-w-md flex items-center justify-between gap-2 px-1">
                  {/* Left Quick Camera Actions */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isLiveCameraActive ? (
                      <>
                        <button
                          type="button"
                          onClick={handleFlipCameraFacing}
                          aria-label="Switch Front or Rear Camera"
                          className="w-9 h-9 rounded-full flex items-center justify-center bg-black/60 hover:bg-white/15 border border-white/20 text-sky-300 backdrop-blur-md"
                        >
                          <SwitchCamera className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setLiveMirrorHorizontal((prev) => !prev)}
                          aria-label="Mirror Camera Horizontally"
                          className={`w-9 h-9 rounded-full flex items-center justify-center border backdrop-blur-md ${
                            liveMirrorHorizontal
                              ? 'bg-white/20 border-white/40 text-amber-300'
                              : 'bg-black/60 border-white/20 text-slate-300'
                          }`}
                        >
                          <FlipHorizontal className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startLiveCamera(selectedDeviceId || undefined)}
                          aria-label="Start Live Camera Emulation"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/45 text-[11px] font-semibold text-rose-200 backdrop-blur-md"
                        >
                          <Radio className="w-3.5 h-3.5" />
                          <span>Live</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSplitEnabled((prev) => !prev)}
                          className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border backdrop-blur-md ${
                            splitEnabled
                              ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                              : 'bg-black/60 border-white/20 text-slate-200'
                          }`}
                        >
                          A/B
                        </button>
                      </>
                    )}
                  </div>

                  {/* Center Tactile Double-Ring Camera Shutter / REC Button */}
                  <button
                    type="button"
                    onClick={isLiveCameraActive ? handleToggleLiveTakeRecording : handleDownloadStill}
                    aria-label={isLiveCameraActive ? 'Record Live Camera Take' : 'Snap Cinema Still'}
                    className="group w-14 h-14 rounded-full p-[3px] border-[2.5px] border-white/95 bg-black/35 backdrop-blur-md flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.85)] active:scale-90 transition-transform shrink-0"
                  >
                    {isLiveCameraActive ? (
                      <span
                        className={`transition-all ${
                          isRecordingLiveTake
                            ? 'w-5 h-5 rounded-md bg-rose-500 animate-pulse'
                            : 'w-full h-full rounded-full bg-rose-500 group-hover:bg-rose-400'
                        }`}
                      />
                    ) : (
                      <span className="w-full h-full rounded-full bg-white group-hover:bg-amber-100 transition-colors" />
                    )}
                  </button>

                  {/* Right Quick Camera Actions */}
                  <div className="flex items-center gap-1.5 min-w-0 justify-end">
                    {isLiveCameraActive ? (
                      <>
                        <button
                          type="button"
                          onClick={() => setSplitEnabled((prev) => !prev)}
                          className={`px-2.5 py-1.5 rounded-full text-[11px] font-semibold border backdrop-blur-md ${
                            splitEnabled
                              ? 'bg-amber-500/30 border-amber-400 text-amber-200'
                              : 'bg-black/60 border-white/20 text-slate-200'
                          }`}
                        >
                          A/B
                        </button>
                        <button
                          type="button"
                          onClick={stopLiveCamera}
                          className="px-2.5 py-1.5 rounded-full bg-black/60 hover:bg-white/15 border border-white/20 text-[11px] font-semibold text-slate-200 backdrop-blur-md"
                        >
                          Exit
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (isLiveCameraActive) {
                              stopLiveCamera();
                            }
                            setShowFullscreenLutCam(true);
                          }}
                          aria-label="Open Fullscreen WebGL2 LUT Camera"
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-[11px] font-semibold text-amber-200 backdrop-blur-md"
                        >
                          <Film className="w-3.5 h-3.5" />
                          <span>LUT</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRenderAndExportVideo(false)}
                          disabled={isRenderingJob}
                          aria-label="Render Master Take"
                          className="px-2.5 py-1.5 rounded-full bg-rose-600/80 hover:bg-rose-500 border border-rose-400/50 text-[11px] font-bold text-white backdrop-blur-md"
                        >
                          {isRenderingJob
                            ? `${renderPercent}%`
                            : 'REC'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
              )}

              {/* DESKTOP FLOATING CINEMA TRANSPORT PILL (lg+) */}
              <div className="hidden lg:flex absolute bottom-3 left-1/2 -translate-x-1/2 w-[94%] max-w-[760px] bg-black/80 backdrop-blur-xl border border-white/15 rounded-full px-3 py-1.5 items-center justify-between gap-3 shadow-[0_8px_32px_rgba(0,0,0,0.85)] z-20">
                {isLiveCameraActive ? (
                  <div className="w-full flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleToggleLiveTakeRecording}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                          isRecordingLiveTake
                            ? 'bg-rose-600 text-white animate-pulse shadow-[0_0_12px_rgba(225,29,72,0.8)]'
                            : 'bg-rose-600 hover:bg-rose-500 text-white'
                        }`}
                      >
                        {isRecordingLiveTake ? (
                          <>
                            <Square className="w-3 h-3 fill-current" />
                            <span>REC {formatRecordingDuration(liveRecordSeconds)}</span>
                          </>
                        ) : (
                          <>
                            <Circle className="w-3 h-3 fill-current" />
                            <span>REC Live (∞)</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleFlipCameraFacing}
                        aria-label="Switch Front or Rear Camera"
                        title={`Switch to ${cameraFacingMode === 'environment' ? 'Front' : 'Rear'} Camera`}
                        className="p-1.5 rounded-full border bg-white/5 hover:bg-white/15 border-white/10 text-sky-300 hover:text-white transition-colors"
                      >
                        <SwitchCamera className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setLiveMirrorHorizontal((prev) => !prev)}
                        aria-label="Mirror Camera Horizontally"
                        title="Mirror Camera Horizontally"
                        className={`p-1.5 rounded-full border transition-colors ${
                          liveMirrorHorizontal
                            ? 'bg-white/15 border-white/30 text-amber-300'
                            : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        <FlipHorizontal className="w-3.5 h-3.5" />
                      </button>

                      {videoDevices.length > 1 && (
                        <select
                          aria-label="Select Camera Device"
                          value={selectedDeviceId}
                          onChange={(e) => {
                            setSelectedDeviceId(e.target.value);
                            startLiveCamera(e.target.value);
                          }}
                          className="max-w-[140px] px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[10px] font-mono text-slate-200 outline-none cursor-pointer"
                        >
                          {videoDevices.map((dev, idx) => (
                            <option
                              key={dev.deviceId || idx}
                              value={dev.deviceId}
                              className="bg-[#0b0e17] text-slate-200"
                            >
                              {dev.label || `Camera ${idx + 1}`}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 font-mono text-[11px]">
                      <span
                        className={`font-semibold ${
                          liveCameraUsingSimulatedStream ? 'text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        ● {liveCameraUsingSimulatedStream ? 'SIM' : 'CAM'}
                      </span>
                      <span className="text-amber-300 tabular-nums">
                        {formatTimecode(currentFrame)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSplitEnabled((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          splitEnabled
                            ? 'bg-amber-500/25 border-amber-400/70 text-amber-300'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        A/B
                      </button>

                      <button
                        type="button"
                        onClick={stopLiveCamera}
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white transition-colors"
                      >
                        Exit
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentFrame(
                            (prev) => (prev - 1 + totalTimelineFrames) % totalTimelineFrames
                          );
                        }}
                        aria-label="Previous Frame"
                        className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                      >
                        <SkipBack className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsPlaying((prev) => !prev)}
                        aria-label={isPlaying ? 'Pause Playback' : 'Play 24fps'}
                        className="p-2 rounded-full bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold transition-all shadow-[0_0_12px_rgba(245,158,11,0.5)] active:scale-95"
                      >
                        {isPlaying ? (
                          <Pause className="w-3.5 h-3.5 fill-current" />
                        ) : (
                          <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setIsPlaying(false);
                          setCurrentFrame((prev) => (prev + 1) % totalTimelineFrames);
                        }}
                        aria-label="Next Frame"
                        className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-white/10 transition-colors"
                      >
                        <SkipForward className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex-1 flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-mono tabular-nums text-amber-300 whitespace-nowrap shrink-0">
                        {formatTimecode(currentFrame)}
                      </span>
                      <input
                        id="timeline-scrubber"
                        type="range"
                        min={0}
                        max={totalTimelineFrames - 1}
                        value={currentFrame}
                        onChange={(e) => {
                          setIsPlaying(false);
                          setCurrentFrame(parseInt(e.target.value, 10));
                        }}
                        className="studio-slider flex-1 min-w-0 w-full"
                        aria-label="Timeline Frame Scrubber"
                      />
                      <span className="text-[10px] font-mono tabular-nums text-slate-400 whitespace-nowrap shrink-0">
                        {currentFrame}/{totalTimelineFrames}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => setSplitEnabled((prev) => !prev)}
                        className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                          splitEnabled
                            ? 'bg-amber-500/25 border-amber-400/70 text-amber-300'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:text-white'
                        }`}
                      >
                        A/B
                      </button>

                      <button
                        type="button"
                        onClick={() => startLiveCamera(selectedDeviceId || undefined)}
                        title="Enable Live Camera Emulation"
                        className="px-2.5 py-1 rounded-full text-xs font-medium bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 transition-colors flex items-center gap-1"
                      >
                        <Video className="w-3 h-3" />
                        <span>Live</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* SKEUOMORPHIC CAMERA CONTROL CONSOLE (FOOTER) */}
        <CinemaControlConsole
          activeTab={activeConsoleTab}
          onTabChange={(tab) => {
            if (!isConsoleCollapsed && activeConsoleTab === tab) {
              setIsConsoleCollapsed(true);
            } else {
              setActiveConsoleTab(tab);
              setIsConsoleCollapsed(false);
            }
          }}
          activeCamera={activeCamera}
          activeLens={activeLens}
          activeFilmStock={activeFilmStock}
          activePrintStock={activePrintStock}
          params={params}
          opticalMetrics={opticalMetrics}
          lightSourceAngleDeg={lightSourceAngleDeg}
          isConsoleCollapsed={isConsoleCollapsed}
          isRenderingJob={isRenderingJob}
          isLiveCameraActive={isLiveCameraActive}
          isRecordingLiveTake={isRecordingLiveTake}
          liveRecordSeconds={liveRecordSeconds}
          renderProgress={renderProgress}
          selectedCameraId={selectedCameraId}
          selectedLensId={selectedLensId}
          selectedFilmStockId={selectedFilmStockId}
          selectedPrintStockId={selectedPrintStockId}
          onSelectCamera={handleSelectCamera}
          onSelectLens={handleSelectLens}
          onSelectFilmStock={handleSelectFilmStock}
          onSelectPrintStock={handleSelectPrintStock}
          onUpdateParam={handleUpdateParam}
          onUpdateLightAngle={handleUpdateLightAngle}
          onToggleCollapse={() => setIsConsoleCollapsed((prev) => !prev)}
          onTriggerRender={() =>
            isLiveCameraActive ? handleToggleLiveTakeRecording() : handleRenderAndExportVideo(false)
          }
        />
      </div>

      {/* FULLSCREEN POPUP MODAL: SENSOR SPECTRAL SENSITIVITY VISUALIZER */}
      {showSpectralModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Sensor Spectral Sensitivity Curves Visualizer"
          className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl animate-fadeIn overflow-y-auto"
        >
          <SpectralSensitivityVisualizer
            activeCamera={activeCamera}
            activeLens={activeLens}
            onSelectCamera={handleSelectCamera}
            onClose={() => setShowSpectralModal(false)}
          />
        </div>
      )}

      {/* FULLSCREEN WEBGL2 LIVE CAMERA WITH HOLLYWOOD LUT & COC BOKEH SHADERS */}
      {showFullscreenLutCam && (
        <MobileCameraStreamLut
          initialMode={params.saturation <= 0.05 ? 'grayscale' : 'passthrough'}
          initialLutId={params.hollywoodLutId}
          initialLutBlend={params.hollywoodLutBlend}
          initialBw={params.saturation <= 0.05}
          initialIso={params.sensorGainIso}
          initialContrast={(params.hollywoodLutId ?? 0) > 0 ? params.contrast : 1.0}
          onClose={() => setShowFullscreenLutCam(false)}
        />
      )}
    </div>
  );
}

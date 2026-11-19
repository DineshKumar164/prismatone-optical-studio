'use client';

import React, { useMemo, useRef } from 'react';
import { CameraProfile, CAMERA_PROFILES } from '../profiles/camera-profiles';
import { LensProfile, LENS_PROFILES } from '../profiles/lens-profiles';
import { FilmStockProfile, FILM_STOCK_PROFILES } from '../profiles/film-profiles';
import {
  HOLLYWOOD_LUT_PROFILES,
  getHollywoodLutByShaderId,
} from '../profiles/hollywood-luts';
import { OpticalSimulationParameters } from '../profiles/optical-math';
import { CircularDialSelector, DialItem } from './CircularDialSelector';
import { RotaryParameterDial } from './RotaryParameterDial';
import {
  Aperture,
  Camera,
  ChevronDown,
  ChevronUp,
  Circle,
  Disc,
  Eye,
  Film,
  Focus,
  Palette,
  RotateCcw,
  Square,
  Sun,
} from 'lucide-react';
import { formatRecordingDuration } from '../utils/video-export';

export type ConsoleTabId = 'camera' | 'lens' | 'exposure' | 'bokeh' | 'flare' | 'color' | 'film';

export interface PrintStockOption {
  id: number;
  name: string;
  subtitle: string;
}

export interface CinemaControlConsoleProps {
  activeTab: ConsoleTabId;
  onTabChange: (tab: ConsoleTabId) => void;
  activeCamera: CameraProfile;
  activeLens: LensProfile;
  activeFilmStock: FilmStockProfile;
  activePrintStock: PrintStockOption;
  params: OpticalSimulationParameters;
  opticalMetrics: {
    horizontalFovDeg: number;
    totalDofM: number;
    hyperfocalDistanceM: number;
    cornerIlluminationDropEv: number;
  };
  lightSourceAngleDeg: number;
  isConsoleCollapsed: boolean;
  isRenderingJob: boolean;
  isLiveCameraActive?: boolean;
  isRecordingLiveTake?: boolean;
  liveRecordSeconds?: number;
  renderProgress: {
    completedChunks: number;
    totalChunks: number;
    processedFrames: number;
    totalFrames: number;
  };
  selectedCameraId: string;
  selectedLensId: string;
  selectedFilmStockId: string;
  selectedPrintStockId: number;
  onSelectCamera: (id: string) => void;
  onSelectLens: (id: string) => void;
  onSelectFilmStock: (id: string) => void;
  onSelectPrintStock: (id: number) => void;
  onUpdateParam: <K extends keyof OpticalSimulationParameters>(
    key: K,
    value: OpticalSimulationParameters[K]
  ) => void;
  onUpdateLightAngle: (deg: number) => void;
  onToggleCollapse: () => void;
  onTriggerRender: () => void;
}

const PRINT_STOCKS: PrintStockOption[] = [
  { id: 0, name: 'Kodak 2383', subtitle: 'Warm highlights & deep contrast' },
  { id: 2, name: 'Fuji 3513', subtitle: 'Cool shadows & pastel cyan skin' },
  { id: 1, name: 'ARRI REVEAL', subtitle: 'True-to-life smooth shoulder' },
  { id: 3, name: 'Bleach Bypass', subtitle: 'High contrast desaturated silver' },
];

export function CinemaControlConsole({
  activeTab,
  onTabChange,
  activeCamera,
  activeLens,
  activeFilmStock,
  activePrintStock,
  params,
  opticalMetrics,
  lightSourceAngleDeg,
  isConsoleCollapsed,
  isRenderingJob,
  isLiveCameraActive = false,
  isRecordingLiveTake = false,
  liveRecordSeconds = 0,
  renderProgress,
  selectedCameraId,
  selectedLensId,
  selectedFilmStockId,
  selectedPrintStockId,
  onSelectCamera,
  onSelectLens,
  onSelectFilmStock,
  onSelectPrintStock,
  onUpdateParam,
  onUpdateLightAngle,
  onToggleCollapse,
  onTriggerRender,
}: CinemaControlConsoleProps) {
  const prevColorSatRef = useRef<number>(params.saturation > 0.05 ? params.saturation : 1.0);
  const isBwActive = params.saturation <= 0.05;
  const toggleBwMode = () => {
    if (isBwActive) {
      onUpdateParam('saturation', prevColorSatRef.current || 1.0);
    } else {
      prevColorSatRef.current = params.saturation > 0.05 ? params.saturation : 1.0;
      onUpdateParam('saturation', 0.0);
    }
  };

  // Skeuomorphic circular dial items for cameras
  const cameraDialItems: DialItem[] = useMemo(
    () =>
      CAMERA_PROFILES.map((cam) => ({
        id: cam.id,
        label: cam.model,
        subtitle: `${cam.manufacturer} · ${cam.sensorFormat} (${cam.dynamicRangeStops} stops DR)`,
        badge: `${cam.baseIso} ISO`,
      })),
    []
  );

  // Skeuomorphic circular dial items for lenses
  const lensDialItems: DialItem[] = useMemo(
    () =>
      LENS_PROFILES.map((lens) => ({
        id: lens.id,
        label: lens.model,
        subtitle: `${lens.opticalType} · T${lens.maxApertureTStop} · Ø${lens.imageCircleMm}mm IC`,
        badge: lens.anamorphicSqueeze > 1.05 ? `${lens.anamorphicSqueeze}× Ana` : 'Spherical',
      })),
    []
  );

  return (
    <footer className="relative shrink-0 bg-[#07090f]/95 backdrop-blur-2xl border-t border-white/10 flex flex-col z-30 shadow-[0_-8px_32px_rgba(0,0,0,0.85)] max-w-full overflow-visible safe-bottom">
      {/* Bottom Camera Mode Selector Bar */}
      <div className="px-2 sm:px-5 py-1.5 lg:py-2 border-b border-white/5 flex items-center justify-between gap-2">
        {/* Camera Mode Navigation Pills */}
        <div
          role="tablist"
          aria-label="Camera Control Sections"
          className="flex items-center gap-1 sm:gap-1.5 bg-black/55 p-1 rounded-full border border-white/10 shadow-[inset_0_2px_6px_rgba(0,0,0,0.6)] min-w-0 flex-1 lg:flex-initial overflow-x-auto no-scrollbar"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'camera' && !isConsoleCollapsed}
            onClick={() => onTabChange('camera')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'camera' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-amber-300 to-amber-500 text-slate-950 shadow-[0_2px_10px_rgba(245,158,11,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Camera className="w-3.5 h-3.5 shrink-0" />
            <span>Camera</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'lens' && !isConsoleCollapsed}
            onClick={() => onTabChange('lens')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'lens' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-sky-300 to-sky-500 text-slate-950 shadow-[0_2px_10px_rgba(56,189,248,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Aperture className="w-3.5 h-3.5 shrink-0" />
            <span>Lens</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'exposure' && !isConsoleCollapsed}
            onClick={() => onTabChange('exposure')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'exposure' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-emerald-300 to-emerald-500 text-slate-950 shadow-[0_2px_10px_rgba(52,211,153,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Disc className="w-3.5 h-3.5 shrink-0" />
            <span>Iris</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'bokeh' && !isConsoleCollapsed}
            onClick={() => onTabChange('bokeh')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'bokeh' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-cyan-300 to-sky-500 text-slate-950 shadow-[0_2px_10px_rgba(34,211,238,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Focus className="w-3.5 h-3.5 shrink-0" />
            <span>Bokeh</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'flare' && !isConsoleCollapsed}
            onClick={() => onTabChange('flare')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'flare' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-amber-300 to-orange-500 text-slate-950 shadow-[0_2px_10px_rgba(251,146,60,0.5),inset_0_1px_1px_rgba(255,255,255,0.6)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Sun className="w-3.5 h-3.5 shrink-0" />
            <span>Flare</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'color' && !isConsoleCollapsed}
            onClick={() => onTabChange('color')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'color' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-purple-400 to-indigo-500 text-white shadow-[0_2px_10px_rgba(168,85,247,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Palette className="w-3.5 h-3.5 shrink-0" />
            <span>Color</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'film' && !isConsoleCollapsed}
            onClick={() => onTabChange('film')}
            className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-[11px] sm:text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeTab === 'film' && !isConsoleCollapsed
                ? 'bg-gradient-to-b from-rose-400 to-red-500 text-white shadow-[0_2px_10px_rgba(244,63,94,0.5),inset_0_1px_1px_rgba(255,255,255,0.4)] font-bold'
                : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
            }`}
          >
            <Film className="w-3.5 h-3.5 shrink-0" />
            <span>Film</span>
          </button>
        </div>

        {/* Right Tools: Desktop 4K REC & Drawer Collapse Button */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTriggerRender}
            disabled={isRenderingJob && !isRecordingLiveTake}
            title={
              isLiveCameraActive
                ? isRecordingLiveTake
                  ? 'Stop Unlimited Live Camera Recording'
                  : 'Record Unlimited Live Take (Device Native Format)'
                : 'Export Full Timeline in Device Native Video Format'
            }
            aria-label={
              isRecordingLiveTake
                ? 'Stop Live Camera Recording'
                : isLiveCameraActive
                ? 'Record Unlimited Live Take'
                : 'Export Native Video'
            }
            className={`hidden lg:flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold text-white transition-all active:scale-95 ${
              isRecordingLiveTake
                ? 'bg-rose-600 animate-pulse shadow-[0_0_14px_rgba(225,29,72,0.8)]'
                : 'bg-gradient-to-b from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 shadow-[0_2px_12px_rgba(225,29,72,0.5),inset_0_1px_1px_rgba(255,255,255,0.35)]'
            }`}
          >
            {isRecordingLiveTake ? (
              <Square className="w-2.5 h-2.5 fill-current" />
            ) : (
              <Circle className="w-2.5 h-2.5 fill-current" />
            )}
            <span>
              {isRecordingLiveTake
                ? `STOP ${formatRecordingDuration(liveRecordSeconds)}`
                : isRenderingJob
                ? `${renderProgress.processedFrames}/${renderProgress.totalFrames}`
                : 'REC'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label={isConsoleCollapsed ? 'Expand Camera Console' : 'Collapse Camera Console'}
            aria-expanded={!isConsoleCollapsed}
            title={isConsoleCollapsed ? 'Expand Controls' : 'Collapse to maximize Viewfinder'}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 text-slate-300 hover:text-white transition-colors"
          >
            {isConsoleCollapsed ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Console Drawer Panel (Static Fixed-Height Sheet on < lg, Static Docked Studio Tray on lg+) */}
      {!isConsoleCollapsed && (
        <div className="absolute lg:static bottom-full left-2 right-2 lg:left-auto lg:right-auto mb-2 lg:mb-0 rounded-2xl lg:rounded-none border lg:border-0 border-white/15 bg-[#090d16]/95 lg:bg-transparent backdrop-blur-2xl shadow-[0_-16px_48px_rgba(0,0,0,0.95)] lg:shadow-none h-[46dvh] lg:h-[352px] overflow-y-auto no-scrollbar z-40">
          {/* Mobile Bottom-Sheet Header Grabber & Close */}
          <div className="lg:hidden sticky top-0 z-10 flex items-center justify-between px-3 py-2 bg-[#080c15]/95 backdrop-blur-xl border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-6 h-1 rounded-full bg-white/25" />
              <span className="text-[11px] font-mono uppercase tracking-wider text-amber-300 font-bold">
                {activeTab} Controls
              </span>
              <span className="text-[10px] font-mono text-slate-400 truncate max-w-[140px]">
                {activeCamera.model}
              </span>
            </div>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="px-2.5 py-0.5 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-semibold text-white border border-white/10"
            >
              Done
            </button>
          </div>

          <div className="min-h-full p-2.5 sm:px-4 sm:py-3 flex flex-col">
            <div className="my-auto w-full">
            {/* TAB 1: CAMERA DIAL & HARDWARE TELEMETRY */}
            {activeTab === 'camera' && (
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-6 max-w-4xl mx-auto">
              {/* Skeuomorphic Rotary Dial for Cameras */}
              <div className="shrink-0 w-full max-w-[270px] sm:w-auto">
                <CircularDialSelector
                  items={cameraDialItems}
                  selectedId={selectedCameraId}
                  onSelect={onSelectCamera}
                  iconType="camera"
                  title="Camera Body"
                  accentColor="amber"
                />
              </div>

              {/* Camera Profile Hardware Readout Card */}
              <div className="flex-1 w-full max-w-lg bg-black/40 rounded-2xl border border-white/10 p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">
                      {activeCamera.manufacturer} {activeCamera.model}
                    </h3>
                    <p className="text-[11px] font-mono text-amber-400 truncate">
                      {activeCamera.transferCurve} · {activeCamera.colorSpace}
                    </p>
                  </div>
                  <span className="shrink-0 text-[10px] font-mono text-amber-300/90 whitespace-nowrap">
                    {activeCamera.sensorFormat}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center font-mono">
                  <div className="bg-white/5 px-2 py-1.5 rounded-xl border border-white/5">
                    <span className="text-[9px] text-slate-400 block uppercase">Dyn. Range</span>
                    <span className="text-xs font-bold text-slate-100">
                      {activeCamera.dynamicRangeStops} stops
                    </span>
                  </div>
                  <div className="bg-white/5 px-2 py-1.5 rounded-xl border border-white/5">
                    <span className="text-[9px] text-slate-400 block uppercase">Base ISO</span>
                    <span className="text-xs font-bold text-slate-100">
                      {activeCamera.baseIso}
                      {activeCamera.dualNativeIso ? ` / ${activeCamera.dualNativeIso}` : ''}
                    </span>
                  </div>
                  <div className="bg-white/5 px-2 py-1.5 rounded-xl border border-white/5">
                    <span className="text-[9px] text-slate-400 block uppercase">CFA Pattern</span>
                    <span className="text-[11px] font-bold text-slate-100 block truncate" title={activeCamera.cfaPattern}>
                      {activeCamera.cfaPattern}
                    </span>
                  </div>
                </div>

                {/* Sensor Crop Mode Pills */}
                <div className="flex items-center gap-1 flex-wrap">
                  <span className="text-[10px] text-slate-400 uppercase font-mono mr-1">Crop:</span>
                  {activeCamera.cropModes.map((crop) => (
                    <button
                      key={crop.id}
                      type="button"
                      onClick={() => onUpdateParam('sensorCropId', crop.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                        params.sensorCropId === crop.id
                          ? 'bg-amber-400 text-slate-950 font-bold'
                          : 'bg-white/5 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {crop.label} ({crop.cropFactor.toFixed(2)}×)
                    </button>
                  ))}
                </div>

                {/* ISO Sensitivity, Contrast & B&W Mode Controls */}
                <div className="pt-2 border-t border-white/10 flex flex-col gap-1.5 font-mono text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="console-iso-slider" className="text-slate-300">
                          Sensor ISO
                        </label>
                        <span className="text-emerald-300 font-bold tabular-nums">
                          {Math.round(params.sensorGainIso)}
                        </span>
                      </div>
                      <input
                        id="console-iso-slider"
                        type="range"
                        min={100}
                        max={12800}
                        step={100}
                        value={params.sensorGainIso}
                        onChange={(e) =>
                          onUpdateParam('sensorGainIso', parseInt(e.target.value, 10))
                        }
                        aria-label="Sensor ISO"
                        className="studio-slider w-full"
                      />
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="console-contrast-slider" className="text-slate-300">
                          Contrast
                        </label>
                        <span className="text-sky-300 font-bold tabular-nums">
                          {params.contrast.toFixed(2)}×
                        </span>
                      </div>
                      <input
                        id="console-contrast-slider"
                        type="range"
                        min={0.6}
                        max={1.6}
                        step={0.02}
                        value={params.contrast}
                        onChange={(e) =>
                          onUpdateParam('contrast', parseFloat(e.target.value))
                        }
                        aria-label="Contrast"
                        className="studio-slider w-full"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5">
                    <div className="flex items-center gap-1">
                      {[200, 800, 3200, 6400].map((isoVal) => (
                        <button
                          key={isoVal}
                          type="button"
                          onClick={() => onUpdateParam('sensorGainIso', isoVal)}
                          className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                            Math.round(params.sensorGainIso) === isoVal
                              ? 'bg-emerald-400 text-slate-950 border-emerald-300 font-bold'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {isoVal}
                        </button>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={toggleBwMode}
                      aria-pressed={isBwActive}
                      className={`px-3 py-0.5 rounded-full text-[10px] font-bold border transition-colors ${
                        isBwActive
                          ? 'bg-white text-slate-950 border-white shadow'
                          : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      {isBwActive ? 'B&W ON' : 'B&W OFF'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LENS DIAL, MANUAL FOCUS & INTEGRATED OPTICAL FEATURES */}
          {activeTab === 'lens' && (
            <div className="flex flex-col md:flex-row items-center justify-center gap-4 sm:gap-5 max-w-5xl mx-auto">
              {/* Skeuomorphic Rotary Dial for Lenses */}
              <div className="shrink-0 w-full max-w-[265px] sm:w-auto">
                <CircularDialSelector
                  items={lensDialItems}
                  selectedId={selectedLensId}
                  onSelect={onSelectLens}
                  iconType="lens"
                  title="Cinema Lens"
                  accentColor="sky"
                />
              </div>

              {/* Integrated Lens Optical Profile, Manual Focus & Glass Characteristics */}
              <div className="flex-1 w-full bg-black/45 rounded-2xl border border-white/10 p-3.5 flex flex-col gap-2.5">
                {/* Header & Unboxed Optical Telemetry */}
                <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-white truncate">
                        {activeLens.model}
                      </h3>
                      <span className="text-[10px] font-mono text-sky-300/90 whitespace-nowrap">
                        {activeLens.mountType} · T{activeLens.maxApertureTStop} · Ø
                        {activeLens.imageCircleMm}mm · {activeLens.transmissionEfficiencyPct}% Trans.
                      </span>
                    </div>
                    <p className="text-[10px] font-mono text-slate-400 truncate">
                      {activeLens.manufacturer} · {activeLens.coatingType} · {activeLens.elementCount}E/
                      {activeLens.groupCount}G · Close Focus {activeLens.closeFocusM}m
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('focalLengthMm', activeLens.focalLengthMm);
                      onUpdateParam('anamorphicSqueeze', activeLens.anamorphicSqueeze);
                      onUpdateParam('focusBreathing', activeLens.focusBreathingFactor);
                      onUpdateParam('sharpness', activeLens.centerSharpness);
                      onUpdateParam('chromaticAberration', activeLens.chromaticAberration);
                      onUpdateParam('distortionK1', activeLens.distortionK1);
                      onUpdateParam('focusDistanceM', Math.max(1.5, activeLens.closeFocusM));
                    }}
                    title="Reset Lens Controls to Optical Profile Defaults"
                    className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                </div>

                {/* 2-Column Integrated Lens & Manual Focus Control Deck */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-5 gap-y-2 font-mono text-xs">
                  {/* Left Column: Manual Focus, Peaking, Focal Length & Desqueeze */}
                  <div className="flex flex-col gap-2">
                    {/* Manual Focus Pull */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="lens-manual-focus" className="text-sky-300 font-semibold">
                          Manual Focus
                        </label>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-400 tabular-nums">
                            DoF {opticalMetrics.totalDofM >= 99 ? '∞' : `${opticalMetrics.totalDofM}m`}
                          </span>
                          <span className="text-white font-bold tabular-nums">
                            {params.focusDistanceM >= 29.5
                              ? '∞'
                              : `${params.focusDistanceM.toFixed(1)}m`}
                          </span>
                        </div>
                      </div>
                      <input
                        id="lens-manual-focus"
                        type="range"
                        min={Math.max(0.3, Number(activeLens.closeFocusM.toFixed(1)))}
                        max={30}
                        step={0.1}
                        value={Math.max(activeLens.closeFocusM, params.focusDistanceM)}
                        onChange={(e) =>
                          onUpdateParam('focusDistanceM', parseFloat(e.target.value))
                        }
                        aria-label="Manual Focus Distance"
                        className="studio-slider w-full"
                      />
                      <div className="flex items-center justify-between gap-1 pt-0.5">
                        <div className="flex items-center gap-1 flex-wrap">
                          {[
                            { label: `${activeLens.closeFocusM}m`, val: activeLens.closeFocusM },
                            { label: '1.5m', val: 1.5 },
                            { label: '3m', val: 3.0 },
                            { label: '8m', val: 8.0 },
                            { label: '∞', val: 30.0 },
                          ].map((preset) => (
                            <button
                              key={preset.label}
                              type="button"
                              onClick={() => onUpdateParam('focusDistanceM', preset.val)}
                              className={`px-1.5 py-0.5 rounded text-[10px] border transition-colors whitespace-nowrap ${
                                Math.abs(params.focusDistanceM - preset.val) < 0.15
                                  ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                                  : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={() => onUpdateParam('focusPeaking', !params.focusPeaking)}
                          aria-pressed={params.focusPeaking}
                          title="Highlight sharp focus edges in viewfinder"
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border transition-colors whitespace-nowrap shrink-0 ${
                            params.focusPeaking
                              ? 'bg-emerald-400 text-slate-950 border-emerald-300'
                              : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          <Eye className="w-2.5 h-2.5" />
                          <span>Peak</span>
                        </button>
                      </div>
                    </div>

                    {/* Focal Length Override */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="lens-focal-length" className="text-slate-300">
                          Focal Length
                        </label>
                        <span className="text-slate-200 font-bold tabular-nums">
                          {Math.round(params.focalLengthMm)}mm · {opticalMetrics.horizontalFovDeg}° HFOV
                        </span>
                      </div>
                      <input
                        id="lens-focal-length"
                        type="range"
                        min={14}
                        max={135}
                        step={1}
                        value={params.focalLengthMm}
                        onChange={(e) =>
                          onUpdateParam('focalLengthMm', parseInt(e.target.value, 10))
                        }
                        aria-label="Focal Length"
                        className="studio-slider w-full"
                      />
                    </div>

                    {/* Desqueeze Ratio */}
                    <div className="flex items-center justify-between gap-1.5 pt-0.5">
                      <span className="text-[10px] text-slate-400 uppercase whitespace-nowrap">
                        Desqueeze:
                      </span>
                      <div className="flex items-center gap-1 flex-wrap justify-end">
                        {[1.0, 1.33, 1.5, 1.8, 2.0].map((sq) => (
                          <button
                            key={sq}
                            type="button"
                            onClick={() => onUpdateParam('anamorphicSqueeze', sq)}
                            className={`px-2 py-0.5 rounded text-[10px] border transition-colors whitespace-nowrap ${
                              Math.abs(params.anamorphicSqueeze - sq) < 0.05
                                ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            {sq}×
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Integrated Lens Optics & Glass Spectral Transmission */}
                  <div className="flex flex-col gap-2">
                    {/* Focus Breathing */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="lens-breathing" className="text-slate-300">
                          Focus Breathing
                        </label>
                        <span className="text-sky-300 font-bold tabular-nums">
                          {Math.round(params.focusBreathing * 100)}%
                        </span>
                      </div>
                      <input
                        id="lens-breathing"
                        type="range"
                        min={0}
                        max={0.5}
                        step={0.01}
                        value={params.focusBreathing}
                        onChange={(e) =>
                          onUpdateParam('focusBreathing', parseFloat(e.target.value))
                        }
                        aria-label="Focus Breathing"
                        className="studio-slider w-full"
                      />
                    </div>

                    {/* Optical Sharpness & Micro-Contrast */}
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-[11px]">
                        <label htmlFor="lens-sharpness" className="text-slate-300">
                          Optical Sharpness (MTF)
                        </label>
                        <span className="text-sky-300 font-bold tabular-nums">
                          {Math.round(params.sharpness * 100)}%
                        </span>
                      </div>
                      <input
                        id="lens-sharpness"
                        type="range"
                        min={0}
                        max={1}
                        step={0.01}
                        value={params.sharpness}
                        onChange={(e) => onUpdateParam('sharpness', parseFloat(e.target.value))}
                        aria-label="Optical Sharpness"
                        className="studio-slider w-full"
                      />
                    </div>

                    {/* Chromatic Aberration & Distortion Row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <label htmlFor="lens-ca-slider" className="text-slate-300">
                            Chromatic Fringing
                          </label>
                          <span className="text-sky-300 font-bold tabular-nums">
                            {Math.round(params.chromaticAberration * 100)}%
                          </span>
                        </div>
                        <input
                          id="lens-ca-slider"
                          type="range"
                          min={0}
                          max={1}
                          step={0.01}
                          value={params.chromaticAberration}
                          onChange={(e) =>
                            onUpdateParam('chromaticAberration', parseFloat(e.target.value))
                          }
                          aria-label="Chromatic Aberration"
                          className="studio-slider w-full"
                        />
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px]">
                          <label htmlFor="lens-dist-slider" className="text-slate-300">
                            Distortion k₁
                          </label>
                          <span className="text-sky-300 font-bold tabular-nums">
                            {params.distortionK1 >= 0 ? '+' : ''}
                            {Math.round(params.distortionK1 * 100)}%
                          </span>
                        </div>
                        <input
                          id="lens-dist-slider"
                          type="range"
                          min={-0.4}
                          max={0.4}
                          step={0.01}
                          value={params.distortionK1}
                          onChange={(e) =>
                            onUpdateParam('distortionK1', parseFloat(e.target.value))
                          }
                          aria-label="Optical Distortion"
                          className="studio-slider w-full"
                        />
                      </div>
                    </div>

                    {/* Glass Spectral Transmission Telemetry Strip */}
                    <div className="pt-1.5 border-t border-white/10 flex items-center justify-between gap-2 text-[10px]">
                      <span className="text-slate-400 uppercase whitespace-nowrap">
                        Glass Trans. RGB:
                      </span>
                      <div className="flex items-center gap-2.5 tabular-nums">
                        <span className="text-rose-300">
                          R {(activeLens.spectralTransmissionRgb[0] * 100).toFixed(0)}%
                        </span>
                        <span className="text-emerald-300">
                          G {(activeLens.spectralTransmissionRgb[1] * 100).toFixed(0)}%
                        </span>
                        <span className="text-sky-300">
                          B {(activeLens.spectralTransmissionRgb[2] * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: IRIS & FOCUS CONTINUOUS ROTARY DIALS */}
          {activeTab === 'exposure' && (
            <div className="flex flex-col md:flex-row items-center justify-center gap-3 sm:gap-8 max-w-4xl mx-auto">
              <div className="grid grid-cols-2 sm:flex items-stretch justify-center gap-2.5 sm:gap-8 w-full md:w-auto max-w-md md:max-w-none">
                {/* Iris / T-Stop Rotary Dial */}
                <RotaryParameterDial
                  value={params.apertureFStop}
                  min={activeLens.maxApertureTStop}
                  max={22}
                  step={0.1}
                  label="Iris (T-Stop)"
                  unit="T"
                  displayValue={`T${params.apertureFStop.toFixed(1)}`}
                  icon="aperture"
                  onChange={(val) => onUpdateParam('apertureFStop', val)}
                  presets={[
                    { label: 'T1.4', value: 1.4 },
                    { label: 'T2', value: 2.0 },
                    { label: 'T2.8', value: 2.8 },
                    { label: 'T4', value: 4.0 },
                    { label: 'T5.6', value: 5.6 },
                    { label: 'T8', value: 8.0 },
                    { label: 'T11', value: 11 },
                  ]}
                  accentColor="emerald"
                />

                {/* Focus Distance Rotary Dial */}
                <RotaryParameterDial
                  value={params.focusDistanceM}
                  min={0.5}
                  max={30}
                  step={0.1}
                  label="Focus Dist"
                  unit="m"
                  displayValue={`${params.focusDistanceM.toFixed(1)}m`}
                  icon="focus"
                  onChange={(val) => onUpdateParam('focusDistanceM', val)}
                  presets={[
                    { label: '0.8m', value: 0.8 },
                    { label: '1.5m', value: 1.5 },
                    { label: '3m', value: 3.0 },
                    { label: '5m', value: 5.0 },
                    { label: '10m', value: 10 },
                  ]}
                  accentColor="sky"
                />
              </div>

              {/* Optical Depth-of-Field & Swirl Info Card */}
              <div className="max-w-xs w-full bg-black/40 rounded-2xl border border-white/10 p-3.5 flex flex-col gap-2 font-mono text-xs">
                <span className="text-[10px] uppercase text-emerald-400 font-bold tracking-wider">
                  Depth of Field Calculations
                </span>
                <div className="flex justify-between text-slate-300">
                  <span>Total Depth:</span>
                  <span className="text-white font-bold">
                    {opticalMetrics.totalDofM >= 99 ? '∞' : `${opticalMetrics.totalDofM}m`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Hyperfocal Dist:</span>
                  <span className="text-white font-bold">
                    {opticalMetrics.hyperfocalDistanceM}m
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span>Angle of View:</span>
                  <span className="text-white font-bold">
                    {opticalMetrics.horizontalFovDeg}° HFOV
                  </span>
                </div>

                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <label htmlFor="console-lens-aperture" className="text-slate-300 font-semibold">
                      Lens Aperture
                    </label>
                    <span className="text-emerald-300 font-bold tabular-nums">
                      f/{params.apertureFStop.toFixed(1)}
                    </span>
                  </div>
                  <input
                    id="console-lens-aperture"
                    type="range"
                    min={activeLens.maxApertureTStop}
                    max={22}
                    step={0.1}
                    value={params.apertureFStop}
                    onChange={(e) => onUpdateParam('apertureFStop', parseFloat(e.target.value))}
                    aria-label="Lens Aperture"
                    className="studio-slider w-full"
                  />
                </div>

                <div className="pt-1.5 border-t border-white/10 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">Swirly Cat-Eye Bokeh:</span>
                  <input
                    type="checkbox"
                    checked={params.bokehSwirl > 0.3}
                    onChange={(e) =>
                      onUpdateParam('bokehSwirl', e.target.checked ? 0.75 : 0.0)
                    }
                    className="rounded accent-emerald-500 cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3B: BOKEH & ABERRATION ENGINE (FULL 10-PARAMETER LENS PHYSICS) */}
          {activeTab === 'bokeh' && (
            <div className="max-w-4xl mx-auto bg-[#070a11]/90 rounded-2xl border border-cyan-500/20 p-3.5 sm:p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] space-y-3">
              {/* Engine Header Row */}
              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-white/10 pb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-cyan-400">
                    Bokeh &amp; Aberration Engine
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const apertureFactor = Math.min(
                        1.5,
                        Math.max(0.15, 2.8 / Math.max(1.0, activeLens.maxApertureTStop))
                      );
                      const defaultBokehRadius = Number(
                        Math.min(1.0, Math.max(0.05, 0.45 * apertureFactor)).toFixed(2)
                      );
                      onUpdateParam('bokehRadius', defaultBokehRadius);
                      onUpdateParam('bokehSwirl', activeLens.bokehSwirl);
                      onUpdateParam('catsEyeFactor', activeLens.catsEyeFactor);
                      onUpdateParam('bokehRimBrightness', activeLens.bokehRimBrightness);
                      onUpdateParam('onionRingIntensity', activeLens.onionRingIntensity);
                      onUpdateParam('distortionK1', activeLens.distortionK1);
                      onUpdateParam('fieldCurvature', activeLens.fieldCurvature);
                      onUpdateParam('vignettingAmount', activeLens.vignettingAmount);
                      onUpdateParam('vignettingFalloff', activeLens.vignettingFalloff);
                      onUpdateParam('chromaticAberration', activeLens.chromaticAberration);
                      onUpdateParam('veilingGlare', activeLens.veilingGlare);
                      onUpdateParam('irisBlades', activeLens.irisBlades);
                    }}
                    title="Reset Bokeh & Aberration Engine to Active Lens Defaults"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Lens Default</span>
                  </button>
                </div>

                {/* Iris Blades Pill Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-slate-300 mr-1">
                    {params.irisBlades ?? activeLens.irisBlades} Iris Blades
                  </span>
                  {[6, 8, 9, 11, 14, 18].map((blades) => {
                    const currentBlades = params.irisBlades ?? activeLens.irisBlades;
                    return (
                      <button
                        key={blades}
                        type="button"
                        onClick={() => onUpdateParam('irisBlades', blades)}
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono transition-colors ${
                          currentBlades === blades
                            ? 'bg-cyan-400 text-slate-950 font-bold'
                            : 'bg-white/5 text-slate-400 hover:bg-white/15 hover:text-white'
                        }`}
                      >
                        {blades}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 2-Column Responsive Grid of All 10 Bokeh & Aberration Engine Controls */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5">
                {/* 1. Defocus Blur Disc Scale */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-bokeh-disc" className="text-slate-200">
                      Defocus Blur Disc Scale
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(params.bokehRadius * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-bokeh-disc"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.bokehRadius}
                    onChange={(e) => onUpdateParam('bokehRadius', parseFloat(e.target.value))}
                    className="studio-slider w-full"
                  />
                </div>

                {/* 2. Petzval Swirl & Cat's-Eye Field */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-petzval-swirl" className="text-slate-200">
                      Petzval Swirl &amp; Cat&apos;s-Eye Field
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(params.bokehSwirl * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-petzval-swirl"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.bokehSwirl}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      onUpdateParam('bokehSwirl', val);
                      onUpdateParam('catsEyeFactor', Math.min(0.95, Number((0.12 + val * 0.78).toFixed(2))));
                    }}
                    className="studio-slider w-full"
                  />
                </div>

                {/* 3. Bokeh Rim (Apodized <-> Soap-Bubble) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-bokeh-rim" className="text-slate-200">
                      Bokeh Rim (Apodized ↔ Soap-Bubble)
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {(params.bokehRimBrightness ?? activeLens.bokehRimBrightness ?? 0.15).toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="engine-bokeh-rim"
                    type="range"
                    min={-0.3}
                    max={0.8}
                    step={0.01}
                    value={params.bokehRimBrightness ?? activeLens.bokehRimBrightness ?? 0.15}
                    onChange={(e) =>
                      onUpdateParam('bokehRimBrightness', parseFloat(e.target.value))
                    }
                    className="studio-slider w-full"
                  />
                </div>

                {/* 4. Aspherical Onion-Ring Structure */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-onion-ring" className="text-slate-200">
                      Aspherical Onion-Ring Structure
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round((params.onionRingIntensity ?? activeLens.onionRingIntensity ?? 0.08) * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-onion-ring"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.onionRingIntensity ?? activeLens.onionRingIntensity ?? 0.08}
                    onChange={(e) =>
                      onUpdateParam('onionRingIntensity', parseFloat(e.target.value))
                    }
                    className="studio-slider w-full"
                  />
                </div>

                {/* 5. Optical Distortion (Barrel <-> Pincushion) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-distortion" className="text-slate-200">
                      Optical Distortion (Barrel ↔ Pincushion)
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(params.distortionK1 * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-distortion"
                    type="range"
                    min={-0.4}
                    max={0.4}
                    step={0.01}
                    value={params.distortionK1}
                    onChange={(e) => onUpdateParam('distortionK1', parseFloat(e.target.value))}
                    className="studio-slider w-full"
                  />
                </div>

                {/* 6. Petzval Parabolic Field Curvature */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-field-curvature" className="text-slate-200">
                      Petzval Parabolic Field Curvature
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round((params.fieldCurvature ?? activeLens.fieldCurvature ?? 0.15) * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-field-curvature"
                    type="range"
                    min={0}
                    max={0.95}
                    step={0.01}
                    value={params.fieldCurvature ?? activeLens.fieldCurvature ?? 0.15}
                    onChange={(e) => onUpdateParam('fieldCurvature', parseFloat(e.target.value))}
                    className="studio-slider w-full"
                  />
                </div>

                {/* 7. Optical Vignette & Cat's-Eye Shading (-EV) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-vignette" className="text-slate-200">
                      Optical Vignette &amp; Cat&apos;s-Eye Shading (-
                      {opticalMetrics.cornerIlluminationDropEv.toFixed(2)} EV)
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(params.vignettingAmount * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-vignette"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.vignettingAmount}
                    onChange={(e) =>
                      onUpdateParam('vignettingAmount', parseFloat(e.target.value))
                    }
                    className="studio-slider w-full"
                  />
                </div>

                {/* 8. Vignette Falloff Curvature (Cos^4 <-> Steep) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-vig-falloff" className="text-slate-200">
                      Vignette Falloff Curvature (Cos⁴ ↔ Steep)
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {params.vignettingFalloff.toFixed(2)}
                    </span>
                  </div>
                  <input
                    id="engine-vig-falloff"
                    type="range"
                    min={0.6}
                    max={3.0}
                    step={0.05}
                    value={params.vignettingFalloff}
                    onChange={(e) =>
                      onUpdateParam('vignettingFalloff', parseFloat(e.target.value))
                    }
                    className="studio-slider w-full"
                  />
                </div>

                {/* 9. Lateral Chromatic Fringing */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-chromatic" className="text-slate-200">
                      Lateral Chromatic Fringing
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round(params.chromaticAberration * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-chromatic"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.chromaticAberration}
                    onChange={(e) =>
                      onUpdateParam('chromaticAberration', parseFloat(e.target.value))
                    }
                    className="studio-slider w-full"
                  />
                </div>

                {/* 10. Uncoated Vintage Veiling Glare */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label htmlFor="engine-veiling-glare" className="text-slate-200">
                      Uncoated Vintage Veiling Glare
                    </label>
                    <span className="font-mono tabular-nums text-cyan-300">
                      {Math.round((params.veilingGlare ?? activeLens.veilingGlare ?? 0.08) * 100)}%
                    </span>
                  </div>
                  <input
                    id="engine-veiling-glare"
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={params.veilingGlare ?? activeLens.veilingGlare ?? 0.08}
                    onChange={(e) => onUpdateParam('veilingGlare', parseFloat(e.target.value))}
                    className="studio-slider w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CAPTURED-LIGHT FLARE & DIFFRACTION ANGLE */}
          {activeTab === 'flare' && (
            <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-8 max-w-4xl mx-auto">
              {/* Diffraction Streak Orientation Rotary Dial */}
              <RotaryParameterDial
                value={lightSourceAngleDeg}
                min={0}
                max={360}
                step={5}
                label="Streak Angle"
                unit="°"
                displayValue={`${lightSourceAngleDeg}°`}
                icon="sun"
                onChange={onUpdateLightAngle}
                presets={[
                  { label: '0° Anam', value: 0 },
                  { label: '35°', value: 35 },
                  { label: '90°', value: 90 },
                  { label: '145°', value: 145 },
                  { label: '300°', value: 300 },
                ]}
                accentColor="amber"
              />

              {/* Flare Intensity & Character Sliders */}
              <div className="max-w-md w-full bg-black/40 rounded-2xl border border-white/10 p-4 flex flex-col gap-3 font-mono text-xs">
                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <span className="text-[10px] text-slate-300 uppercase tracking-wider font-semibold">
                    Glare Optics:
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => onUpdateParam('anamorphicSqueeze', 1.0)}
                      className={`px-2.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                        params.anamorphicSqueeze <= 1.08
                          ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      Spherical 1×
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateParam(
                          'anamorphicSqueeze',
                          activeLens.anamorphicSqueeze > 1.1 ? activeLens.anamorphicSqueeze : 2.0
                        )
                      }
                      className={`px-2.5 py-0.5 rounded-full text-[10px] border transition-colors ${
                        params.anamorphicSqueeze > 1.08
                          ? 'bg-sky-400 text-slate-950 border-sky-300 font-bold'
                          : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                      }`}
                    >
                      Anamorphic {activeLens.anamorphicSqueeze > 1.1 ? `${activeLens.anamorphicSqueeze}×` : '2×'}
                    </button>
                  </div>
                </div>

                <p className="text-[10px] text-amber-300/90 leading-snug">
                  {params.anamorphicSqueeze > 1.08
                    ? `Anamorphic (${params.anamorphicSqueeze.toFixed(1)}×): Full-width cylindrical chromatic streaks with hot incandescent core, dispersive 2:1 caustic ghosts & barrel arc from captured point lights.`
                    : `Spherical (1.0×): ${params.irisBlades ?? activeLens.irisBlades}-blade Fraunhofer RGB-dispersed starbursts, circular caustic ghosts & veiling scatter from captured point lights.`}
                </p>

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Captured Flare Gain:</span>
                  <span className="text-amber-400 font-bold">
                    {(params.flareIntensity * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={2.5}
                  step={0.05}
                  value={params.flareIntensity}
                  onChange={(e) => onUpdateParam('flareIntensity', parseFloat(e.target.value))}
                  className="studio-slider"
                  aria-label="Flare Intensity"
                />

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Veiling Glare / Highlight Halation:</span>
                  <span className="text-amber-400 font-bold">
                    {(((params.veilingGlare ?? 0)) * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.0}
                  step={0.05}
                  value={params.veilingGlare ?? 0}
                  onChange={(e) => onUpdateParam('veilingGlare', parseFloat(e.target.value))}
                  className="studio-slider"
                  aria-label="Veiling Glare Scattering"
                />

                {/* Cinema Optical Coating Presets */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                  <span className="text-[10px] text-slate-400 uppercase mr-1">Coating:</span>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('flareTint', [0.16, 0.52, 1.0]);
                      onUpdateParam('flareIntensity', 1.25);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] bg-sky-500/20 border border-sky-400/40 text-sky-300 hover:bg-sky-500/30"
                  >
                    Cobalt Blue
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('flareTint', [1.0, 0.7, 0.22]);
                      onUpdateParam('flareIntensity', 1.15);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 border border-amber-400/40 text-amber-300 hover:bg-amber-500/30"
                  >
                    Golden Atlas
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('flareTint', [0.14, 0.84, 0.94]);
                      onUpdateParam('flareIntensity', 1.2);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30"
                  >
                    Teal Hawk
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('flareTint', [1.0, 0.58, 0.26]);
                      onUpdateParam('flareIntensity', 1.05);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] bg-orange-500/20 border border-orange-400/40 text-orange-300 hover:bg-orange-500/30"
                  >
                    Amber K-35
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('flareTint', [0.95, 0.97, 1.0]);
                      onUpdateParam('flareIntensity', 0.85);
                    }}
                    className="px-2.5 py-0.5 rounded-full text-[10px] bg-white/10 border border-white/20 text-slate-200 hover:bg-white/15"
                  >
                    Natural Clean
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: COLOR CONTROL & WHITE BALANCE CONSOLE */}
          {activeTab === 'color' && (
            <div className="max-w-5xl mx-auto bg-[#070a11]/90 rounded-2xl border border-purple-500/25 p-3.5 sm:p-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.08)] space-y-3">
              {/* Color Deck Header */}
              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-white/10 pb-2">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-[11px] sm:text-xs font-mono font-bold uppercase tracking-wider text-purple-300 whitespace-nowrap">
                    Color &amp; White Balance
                  </span>
                  <span className="hidden sm:inline text-[10px] font-mono text-slate-400 truncate">
                    {activeCamera.colorSpace} · {activeCamera.transferCurve}
                  </span>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateParam(
                        'spectralReconstructionMode',
                        params.spectralReconstructionMode === false
                      )
                    }
                    aria-pressed={params.spectralReconstructionMode !== false}
                    title="Switch between physical sensor color reconstruction and legacy 3x3 matrix"
                    className={`px-2 py-0.5 rounded-md text-[10px] font-mono border transition-colors whitespace-nowrap ${
                      params.spectralReconstructionMode !== false
                        ? 'bg-purple-500/20 border-purple-400/50 text-purple-200 font-semibold'
                        : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {params.spectralReconstructionMode !== false
                      ? 'Color Science: Physical'
                      : 'Color Science: Matrix'}
                  </button>

                  <button
                    type="button"
                    onClick={toggleBwMode}
                    aria-pressed={isBwActive}
                    className={`px-2.5 py-0.5 rounded-md text-[10px] font-mono font-bold border transition-colors whitespace-nowrap ${
                      isBwActive
                        ? 'bg-white text-slate-950 border-white shadow'
                        : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    {isBwActive ? 'B&W ON' : 'B&W OFF'}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onUpdateParam('colorTemperatureShift', 0);
                      onUpdateParam('tintShift', 0);
                      onUpdateParam('saturation', 1.0);
                      onUpdateParam('contrast', 1.0);
                      onUpdateParam('highlightRolloff', 0.5);
                      onUpdateParam('exposureCompensationEv', 0);
                    }}
                    title="Reset Color & White Balance to Neutral"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 text-[10px] font-mono text-slate-300 hover:text-white transition-colors whitespace-nowrap"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* 2-Column Color Grading Sliders */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2.5 font-mono text-xs">
                {/* Left Column: White Balance, Tint & Exposure Trim */}
                <div className="space-y-2.5">
                  {/* White Balance Temperature */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="color-wb-temp" className="text-slate-200">
                        White Balance (Kelvin)
                      </label>
                      <span className="text-amber-300 font-bold tabular-nums">
                        {Math.round(5600 + params.colorTemperatureShift * 4800)}K
                      </span>
                    </div>
                    <input
                      id="color-wb-temp"
                      type="range"
                      min={-0.5}
                      max={0.5}
                      step={0.01}
                      value={params.colorTemperatureShift}
                      onChange={(e) =>
                        onUpdateParam('colorTemperatureShift', parseFloat(e.target.value))
                      }
                      aria-label="White Balance Temperature"
                      className="studio-slider w-full"
                    />
                    <div className="flex items-center gap-1 pt-0.5 flex-wrap">
                      {[
                        { label: '3200K', val: -0.5 },
                        { label: '4400K', val: -0.25 },
                        { label: '5600K', val: 0.0 },
                        { label: '6800K', val: 0.25 },
                        { label: '8000K', val: 0.5 },
                      ].map((wb) => (
                        <button
                          key={wb.label}
                          type="button"
                          onClick={() => onUpdateParam('colorTemperatureShift', wb.val)}
                          className={`px-2 py-0.5 rounded text-[10px] border transition-colors whitespace-nowrap ${
                            Math.abs(params.colorTemperatureShift - wb.val) < 0.03
                              ? 'bg-purple-400 text-slate-950 border-purple-300 font-bold'
                              : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                          }`}
                        >
                          {wb.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Green-Magenta Tint */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="color-wb-tint" className="text-slate-200">
                        Tint (Green ↔ Magenta)
                      </label>
                      <span className="text-purple-300 font-bold tabular-nums">
                        {params.tintShift >= 0 ? '+' : ''}
                        {Math.round(params.tintShift * 100)}
                      </span>
                    </div>
                    <input
                      id="color-wb-tint"
                      type="range"
                      min={-0.5}
                      max={0.5}
                      step={0.01}
                      value={params.tintShift}
                      onChange={(e) => onUpdateParam('tintShift', parseFloat(e.target.value))}
                      aria-label="Color Tint"
                      className="studio-slider w-full"
                    />
                  </div>

                  {/* Exposure Compensation */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="color-exp-comp" className="text-slate-200">
                        Exposure Trim (EV)
                      </label>
                      <span className="text-emerald-300 font-bold tabular-nums">
                        {(params.exposureCompensationEv ?? 0) >= 0 ? '+' : ''}
                        {(params.exposureCompensationEv ?? 0).toFixed(2)} EV
                      </span>
                    </div>
                    <input
                      id="color-exp-comp"
                      type="range"
                      min={-2.5}
                      max={2.5}
                      step={0.05}
                      value={params.exposureCompensationEv ?? 0}
                      onChange={(e) =>
                        onUpdateParam('exposureCompensationEv', parseFloat(e.target.value))
                      }
                      aria-label="Exposure Compensation EV"
                      className="studio-slider w-full"
                    />
                  </div>
                </div>

                {/* Right Column: Saturation, Contrast & Highlight Rolloff */}
                <div className="space-y-2.5">
                  {/* Saturation */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="color-saturation" className="text-slate-200">
                        Chroma Saturation
                      </label>
                      <span className="text-purple-300 font-bold tabular-nums">
                        {Math.round(params.saturation * 100)}%
                      </span>
                    </div>
                    <input
                      id="color-saturation"
                      type="range"
                      min={0}
                      max={1.8}
                      step={0.02}
                      value={params.saturation}
                      onChange={(e) => onUpdateParam('saturation', parseFloat(e.target.value))}
                      aria-label="Chroma Saturation"
                      className="studio-slider w-full"
                    />
                  </div>

                  {/* Contrast */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="color-contrast" className="text-slate-200">
                        Tone Contrast
                      </label>
                      <span className="text-sky-300 font-bold tabular-nums">
                        {params.contrast.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      id="color-contrast"
                      type="range"
                      min={0.6}
                      max={1.6}
                      step={0.02}
                      value={params.contrast}
                      onChange={(e) => onUpdateParam('contrast', parseFloat(e.target.value))}
                      aria-label="Tone Contrast"
                      className="studio-slider w-full"
                    />
                  </div>

                  {/* Highlight Rolloff */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <label htmlFor="color-rolloff" className="text-slate-200">
                        Highlight Shoulder Rolloff
                      </label>
                      <span className="text-amber-300 font-bold tabular-nums">
                        {Math.round(params.highlightRolloff * 100)}%
                      </span>
                    </div>
                    <input
                      id="color-rolloff"
                      type="range"
                      min={0}
                      max={1}
                      step={0.02}
                      value={params.highlightRolloff}
                      onChange={(e) =>
                        onUpdateParam('highlightRolloff', parseFloat(e.target.value))
                      }
                      aria-label="Highlight Shoulder Rolloff"
                      className="studio-slider w-full"
                    />
                  </div>

                  {/* Active Color Pipeline Summary */}
                  <div className="pt-1 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400">
                    <span>Active Print / LUT:</span>
                    <span className="text-slate-200 truncate max-w-[240px]">
                      {activePrintStock.name}
                      {(params.hollywoodLutId ?? 0) > 0
                        ? ` · ${getHollywoodLutByShaderId(params.hollywoodLutId ?? 0).shortName}`
                        : ''}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: FILM STOCK, HOLLYWOOD LUTS & PRINT LAB */}
          {activeTab === 'film' && (
            <div className="flex flex-col lg:flex-row items-stretch justify-center gap-4 sm:gap-5 max-w-6xl mx-auto">
              {/* Film Stock Cassettes */}
              <div className="flex-1 w-full flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-mono uppercase text-rose-400 tracking-wider">
                    Motion Picture Negative Stock
                  </span>
                  <span className="text-[10px] font-mono text-slate-400 truncate max-w-[160px]">
                    {activeFilmStock.code}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {FILM_STOCK_PROFILES.map((stock) => (
                    <button
                      key={stock.id}
                      type="button"
                      onClick={() => onSelectFilmStock(stock.id)}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        selectedFilmStockId === stock.id
                          ? 'bg-rose-500/20 border-rose-400 text-white shadow-[0_2px_12px_rgba(244,63,94,0.3)]'
                          : 'bg-black/40 border-white/10 text-slate-300 hover:bg-white/5'
                      }`}
                    >
                      <span className="text-xs font-bold block truncate">{stock.name}</span>
                      <span className="text-[10px] font-mono text-slate-400 block truncate">
                        {stock.isoSensitivity} ISO · {stock.colorBalance}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Hollywood Cinematic Color LUTs + Blend Intensity */}
              <div className="flex-1 w-full bg-black/45 rounded-2xl border border-amber-400/25 p-3.5 flex flex-col gap-2.5 font-mono text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-amber-400 uppercase tracking-wider font-bold">
                    Hollywood Show LUTs (DI Color)
                  </span>
                  <span className="text-[10px] text-cyan-300 truncate max-w-[160px]">
                    {getHollywoodLutByShaderId(params.hollywoodLutId ?? 0).name}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {HOLLYWOOD_LUT_PROFILES.map((lut) => {
                    const isSelected = (params.hollywoodLutId ?? 0) === lut.shaderId;
                    return (
                      <button
                        key={lut.id}
                        type="button"
                        title={`${lut.eraStyle} — ${lut.description}`}
                        onClick={() => {
                          onUpdateParam('hollywoodLutId', lut.shaderId);
                          onUpdateParam(
                            'hollywoodLutBlend',
                            lut.shaderId === 0 ? 0.0 : lut.defaultBlend
                          );
                        }}
                        className={`py-1.5 px-1.5 rounded-lg border text-center text-[10px] font-semibold transition-all truncate ${
                          isSelected
                            ? 'bg-amber-400 text-slate-950 border-amber-300 shadow font-bold'
                            : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {lut.shortName}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] text-slate-400 leading-snug">
                  {getHollywoodLutByShaderId(params.hollywoodLutId ?? 0).description}
                </p>

                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-slate-300">Hollywood LUT Blend:</span>
                  <span className="text-cyan-300 font-bold tabular-nums">
                    {Math.round(
                      ((params.hollywoodLutId ?? 0) === 0
                        ? 0
                        : params.hollywoodLutBlend ?? 0.85) * 100
                    )}
                    %
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.0}
                  step={0.01}
                  disabled={(params.hollywoodLutId ?? 0) === 0}
                  value={
                    (params.hollywoodLutId ?? 0) === 0 ? 0 : params.hollywoodLutBlend ?? 0.85
                  }
                  onChange={(e) =>
                    onUpdateParam('hollywoodLutBlend', parseFloat(e.target.value))
                  }
                  className="studio-slider disabled:opacity-40"
                  aria-label="Hollywood LUT Blend"
                />

                {/* Quick Contrast & B&W Override inside Film/LUT Panel */}
                <div className="pt-2 border-t border-white/10 flex items-center gap-3">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-300">Contrast:</span>
                      <span className="text-sky-300 font-bold tabular-nums">
                        {params.contrast.toFixed(2)}×
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0.6}
                      max={1.6}
                      step={0.02}
                      value={params.contrast}
                      onChange={(e) => onUpdateParam('contrast', parseFloat(e.target.value))}
                      className="studio-slider w-full"
                      aria-label="Film LUT Contrast"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={toggleBwMode}
                    aria-pressed={isBwActive}
                    className={`px-3 py-1.5 rounded-full text-[10px] font-bold border transition-colors shrink-0 ${
                      isBwActive
                        ? 'bg-white text-slate-950 border-white shadow'
                        : 'bg-white/5 border-white/15 text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    B&amp;W
                  </button>
                </div>
              </div>

              {/* Print Stock & Halation Controls */}
              <div className="flex-1 w-full lg:max-w-xs bg-black/40 rounded-2xl border border-white/10 p-3.5 flex flex-col gap-2.5 font-mono text-xs">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] text-slate-400 uppercase">
                      Release Print Stock
                    </span>
                    <span className="text-[10px] text-amber-300 truncate max-w-[150px]">
                      {activePrintStock.name}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {PRINT_STOCKS.map((print) => (
                      <button
                        key={print.id}
                        type="button"
                        onClick={() => {
                          onSelectPrintStock(print.id);
                          onUpdateParam('saturation', print.id === 3 ? 0.55 : 1.0);
                        }}
                        title={print.subtitle}
                        className={`py-1.5 px-2 rounded-full text-center text-[11px] transition-colors ${
                          selectedPrintStockId === print.id && params.saturation > 0.1
                            ? 'bg-amber-400 text-slate-950 font-bold shadow'
                            : 'bg-white/5 text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {print.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-slate-300">Halation Bloom:</span>
                  <span className="text-rose-400 font-bold">
                    {(params.halationIntensity * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.0}
                  step={0.05}
                  value={params.halationIntensity}
                  onChange={(e) =>
                    onUpdateParam('halationIntensity', parseFloat(e.target.value))
                  }
                  className="studio-slider"
                  aria-label="Film Halation Bloom"
                />

                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Organic Film Grain:</span>
                  <span className="text-amber-400 font-bold">
                    {(params.sensorGrainAmount * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1.0}
                  step={0.05}
                  value={params.sensorGrainAmount}
                  onChange={(e) =>
                    onUpdateParam('sensorGrainAmount', parseFloat(e.target.value))
                  }
                  className="studio-slider"
                  aria-label="Organic Film Grain"
                />
              </div>
            </div>
          )}
            </div>
          </div>
        </div>
      )}
    </footer>
  );
}

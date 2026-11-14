'use client';

import React, { useMemo, useState } from 'react';
import { CameraProfile, CAMERA_PROFILES } from '../profiles/camera-profiles';
import { LensProfile } from '../profiles/lens-profiles';
import {
  computeSensorSpectralCurves,
  nmToRgbCss,
  SpectralCurvePoint,
} from '../utils/spectral-curve-math';
import { Camera, Check, Sparkles, X } from 'lucide-react';

interface SpectralSensitivityVisualizerProps {
  activeCamera: CameraProfile;
  activeLens: LensProfile;
  onSelectCamera: (cameraId: string) => void;
  onClose?: () => void;
}

const SVG_WIDTH = 680;
const SVG_HEIGHT = 240;
const PADDING_LEFT = 45;
const PADDING_RIGHT = 20;
const PADDING_TOP = 25;
const PADDING_BOTTOM = 35;
const CHART_WIDTH = SVG_WIDTH - PADDING_LEFT - PADDING_RIGHT;
const CHART_HEIGHT = SVG_HEIGHT - PADDING_TOP - PADDING_BOTTOM;
const MIN_NM = 380;
const MAX_NM = 720;

const getX = (nm: number) =>
  PADDING_LEFT + ((nm - MIN_NM) / (MAX_NM - MIN_NM)) * CHART_WIDTH;
const getY = (val: number) =>
  PADDING_TOP + CHART_HEIGHT - Math.min(1.15, Math.max(0, val)) * CHART_HEIGHT;

export function SpectralSensitivityVisualizer({
  activeCamera,
  onSelectCamera,
  onClose,
}: SpectralSensitivityVisualizerProps) {
  const [hoveredWavelength, setHoveredWavelength] = useState<number | null>(532);

  // Compute curve points for the active camera across 380nm - 720nm
  const points: SpectralCurvePoint[] = useMemo(
    () => computeSensorSpectralCurves(activeCamera, MIN_NM, MAX_NM, 2),
    [activeCamera]
  );

  // Build SVG Paths for Red, Green, Blue, and IR-Cut
  const { pathR, pathG, pathB, fillR, fillG, fillB, pathIr } = useMemo(() => {
    let dR = '';
    let dG = '';
    let dB = '';
    let dIr = '';

    points.forEach((pt, idx) => {
      const x = getX(pt.wavelength);
      const yr = getY(pt.r);
      const yg = getY(pt.g);
      const yb = getY(pt.b);
      const yIr = getY(pt.irCut);

      if (idx === 0) {
        dR += `M ${x} ${yr}`;
        dG += `M ${x} ${yg}`;
        dB += `M ${x} ${yb}`;
        dIr += `M ${x} ${yIr}`;
      } else {
        dR += ` L ${x} ${yr}`;
        dG += ` L ${x} ${yg}`;
        dB += ` L ${x} ${yb}`;
        dIr += ` L ${x} ${yIr}`;
      }
    });

    const bottomY = getY(0);
    const startX = getX(MIN_NM);
    const endX = getX(MAX_NM);

    const fR = `${dR} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
    const fG = `${dG} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;
    const fB = `${dB} L ${endX} ${bottomY} L ${startX} ${bottomY} Z`;

    return { pathR: dR, pathG: dG, pathB: dB, fillR: fR, fillG: fG, fillB: fB, pathIr: dIr };
  }, [points]);

  // Current hovered point data
  const activeHoverData = useMemo(() => {
    if (hoveredWavelength === null) return null;
    const pt = points.find((p) => Math.abs(p.wavelength - hoveredWavelength) < 1.5) ?? points[0];
    return {
      wavelength: pt.wavelength,
      rPct: Math.round(pt.r * 100),
      gPct: Math.round(pt.g * 100),
      bPct: Math.round(pt.b * 100),
      irPct: Math.round(pt.irCut * 100),
      colorHex: nmToRgbCss(pt.wavelength),
    };
  }, [hoveredWavelength, points]);

  // Handle pointer scrub over SVG
  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const scaleX = SVG_WIDTH / Math.max(1, rect.width);
    const svgX = (e.clientX - rect.left) * scaleX;
    const ratio = Math.max(0, Math.min(1, (svgX - PADDING_LEFT) / CHART_WIDTH));
    const nm = Math.round(MIN_NM + ratio * (MAX_NM - MIN_NM));
    setHoveredWavelength(nm);
  };

  const irCutX = getX(activeCamera.irCutNm);

  return (
    <div className="relative rounded-2xl bg-[#0c0f17]/95 backdrop-blur-xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.8),inset_0_1px_1px_rgba(255,255,255,0.15)] p-3 sm:p-4 text-slate-200 space-y-3 max-w-3xl w-full mx-auto">
      {/* Header Pill Bar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-sky-500/20 to-indigo-500/30 border border-sky-400/30 flex items-center justify-center shadow-[0_0_15px_rgba(56,189,248,0.2)]">
            <Sparkles className="w-4 h-4 text-sky-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold tracking-wide text-white">
                Sensor Spectral Sensitivity Curves
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/20 border border-sky-500/40 text-sky-300">
                7-Band SPD
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Measured silicon quantum efficiency, IR-cut barrier, and CFA inter-pixel crosstalk
            </p>
          </div>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
            title="Close visualizer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Camera Sensor Switcher Pills */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span className="font-medium uppercase tracking-wider text-[10px]">
            Select Camera Sensor Profile
          </span>
          <span className="font-mono text-sky-400 text-[10px]">
            Active: {activeCamera.manufacturer} {activeCamera.model}
          </span>
        </div>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 studio-scrollbar">
          {CAMERA_PROFILES.map((cam) => {
            const isSelected = cam.id === activeCamera.id;
            return (
              <button
                key={cam.id}
                type="button"
                onClick={() => onSelectCamera(cam.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-all ${
                  isSelected
                    ? 'bg-sky-500 text-white shadow-[0_0_16px_rgba(56,189,248,0.45)] border border-sky-300 font-semibold scale-[1.02]'
                    : 'bg-[#151924]/80 hover:bg-[#1f2638] text-slate-300 border border-white/10 hover:border-white/20'
                }`}
              >
                <Camera className="w-3 h-3 shrink-0" />
                <span>{cam.model}</span>
                {isSelected && <Check className="w-3 h-3 ml-0.5 shrink-0" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative rounded-xl bg-[#07090f] border border-white/10 p-2 overflow-hidden shadow-inner">
        {/* Non-overlapping Wavelength Inspector Header Strip */}
        <div className="flex items-center justify-between flex-wrap gap-1.5 px-2 pb-1.5 mb-1 border-b border-white/5 text-[10px] font-mono">
          <span className="text-slate-400 uppercase tracking-wider">
            Quantum Efficiency (QE %)
          </span>
          {activeHoverData ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span
                className="w-2.5 h-2.5 rounded-full border border-white/30 shrink-0"
                style={{ backgroundColor: activeHoverData.colorHex }}
              />
              <span className="text-white font-semibold">{activeHoverData.wavelength} nm</span>
              <span className="text-slate-600">|</span>
              <span className="text-red-400">R:{activeHoverData.rPct}%</span>
              <span className="text-emerald-400">G:{activeHoverData.gPct}%</span>
              <span className="text-blue-400">B:{activeHoverData.bPct}%</span>
              <span className="text-amber-300">IR:{activeHoverData.irPct}%</span>
            </div>
          ) : (
            <span className="text-slate-500">Scrub chart to inspect wavelength</span>
          )}
        </div>

        <div className="relative">
          {/* Visible Rainbow Spectrum Bar underneath the curves */}
          <div
            className="absolute inset-x-[6.6%] bottom-[14.5%] h-2 rounded-sm opacity-60 pointer-events-none"
            style={{
              background:
                'linear-gradient(to right, #4b0082 0%, #0000ff 18%, #00ffff 35%, #00ff00 52%, #ffff00 68%, #ff7f00 82%, #ff0000 95%, #8b0000 100%)',
            }}
          />

        <svg
          viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
          className="w-full h-auto cursor-crosshair select-none"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoveredWavelength(null)}
        >
          <defs>
            {/* Gradients for R, G, B Curve Fills */}
            <linearGradient id="gradR" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#ef4444" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#ef4444" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="gradB" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1.0].map((val) => (
            <g key={val}>
              <line
                x1={PADDING_LEFT}
                y1={getY(val)}
                x2={SVG_WIDTH - PADDING_RIGHT}
                y2={getY(val)}
                stroke="#1f293d"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <text
                x={PADDING_LEFT - 6}
                y={getY(val) + 3}
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="end"
              >
                {Math.round(val * 100)}%
              </text>
            </g>
          ))}

          {/* Wavelength Vertical Grid Lines */}
          {[400, 450, 500, 550, 600, 650, 700].map((nm) => (
            <g key={nm}>
              <line
                x1={getX(nm)}
                y1={PADDING_TOP}
                x2={getX(nm)}
                y2={PADDING_TOP + CHART_HEIGHT}
                stroke="#172033"
                strokeWidth="1"
              />
              <text
                x={getX(nm)}
                y={PADDING_TOP + CHART_HEIGHT + 14}
                fill="#64748b"
                fontSize="9"
                fontFamily="monospace"
                textAnchor="middle"
              >
                {nm}
              </text>
            </g>
          ))}

          {/* IR-Cut Barrier Shaded Zone */}
          <rect
            x={irCutX}
            y={PADDING_TOP}
            width={SVG_WIDTH - PADDING_RIGHT - irCutX}
            height={CHART_HEIGHT}
            fill="#7f1d1d"
            fillOpacity="0.18"
          />
          <line
            x1={irCutX}
            y1={PADDING_TOP}
            x2={irCutX}
            y2={PADDING_TOP + CHART_HEIGHT}
            stroke="#ef4444"
            strokeWidth="1.5"
            strokeDasharray="4 2"
          />
          <text
            x={irCutX + 4}
            y={PADDING_TOP + 12}
            fill="#f87171"
            fontSize="8"
            fontFamily="monospace"
          >
            IR-Cut λ {activeCamera.irCutNm}nm
          </text>

          {/* CFA Crosstalk Leakage Floor */}
          <line
            x1={PADDING_LEFT}
            y1={getY(activeCamera.cfaCrosstalk ?? 0.05)}
            x2={SVG_WIDTH - PADDING_RIGHT}
            y2={getY(activeCamera.cfaCrosstalk ?? 0.05)}
            stroke="#38bdf8"
            strokeDasharray="2 4"
            strokeWidth="1"
            strokeOpacity="0.4"
          />

          {/* Filled Curve Paths */}
          <path d={fillB} fill="url(#gradB)" />
          <path d={fillG} fill="url(#gradG)" />
          <path d={fillR} fill="url(#gradR)" />

          {/* Outlined Curves */}
          <path d={pathB} fill="none" stroke="#3b82f6" strokeWidth="2.2" strokeLinecap="round" />
          <path d={pathG} fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" />
          <path d={pathR} fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" />

          {/* Optional IR-Cut Transmission curve */}
          <path
            d={pathIr}
            fill="none"
            stroke="#fbbf24"
            strokeWidth="1.2"
            strokeDasharray="3 3"
            strokeOpacity="0.75"
          />

          {/* Peak Indicators */}
          <circle
            cx={getX(activeCamera.spectralPeakNm[0])}
            cy={getY(activeCamera.spectralWeights[0])}
            r="4"
            fill="#ef4444"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <circle
            cx={getX(activeCamera.spectralPeakNm[1])}
            cy={getY(activeCamera.spectralWeights[1])}
            r="4"
            fill="#10b981"
            stroke="#ffffff"
            strokeWidth="1.5"
          />
          <circle
            cx={getX(activeCamera.spectralPeakNm[2])}
            cy={getY(activeCamera.spectralWeights[2])}
            r="4"
            fill="#3b82f6"
            stroke="#ffffff"
            strokeWidth="1.5"
          />

          {/* Interactive Scrub Cursor */}
          {hoveredWavelength !== null && (
            <g>
              <line
                x1={getX(hoveredWavelength)}
                y1={PADDING_TOP}
                x2={getX(hoveredWavelength)}
                y2={PADDING_TOP + CHART_HEIGHT}
                stroke="#ffffff"
                strokeWidth="1.5"
                strokeDasharray="2 2"
              />
              <circle
                cx={getX(hoveredWavelength)}
                cy={PADDING_TOP + CHART_HEIGHT}
                r="3.5"
                fill="#ffffff"
              />
            </g>
          )}
        </svg>
        </div>
      </div>

      {/* Sensor Architecture & Physical Calibration Provenance */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] font-mono">
        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
          <div className="text-slate-400 text-[10px] uppercase">Sensor Architecture</div>
          <div className="text-white font-semibold truncate">{activeCamera.sensorFormat}</div>
          <div className="text-sky-300 text-[10px]">{activeCamera.cfaPattern}</div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
          <div className="text-slate-400 text-[10px] uppercase">Dynamic Range</div>
          <div className="text-emerald-300 font-semibold">{activeCamera.dynamicRangeStops} Stops</div>
          <div className="text-slate-400 text-[10px]">
            +{activeCamera.highlightLatitudeStops} / -{activeCamera.shadowLatitudeStops} EV
          </div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
          <div className="text-slate-400 text-[10px] uppercase">CFA Crosstalk</div>
          <div className="text-sky-300 font-semibold">
            {((activeCamera.cfaCrosstalk ?? 0.05) * 100).toFixed(1)}% Leakage
          </div>
          <div className="text-slate-400 text-[10px]">Inter-Pixel Floor</div>
        </div>

        <div className="p-2.5 rounded-xl bg-white/5 border border-white/10 space-y-0.5">
          <div className="text-slate-400 text-[10px] uppercase">IR-Cut Suppression</div>
          <div className="text-amber-300 font-semibold">
            λ {activeCamera.irCutNm} nm
          </div>
          <div className="text-slate-400 text-[10px]">
            {Math.round(activeCamera.irRejectionFactor * 100)}% Rejection
          </div>
        </div>
      </div>
    </div>
  );
}

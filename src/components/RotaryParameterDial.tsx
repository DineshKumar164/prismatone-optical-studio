'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Aperture, Compass, Crosshair, Sun } from 'lucide-react';

interface RotaryParameterDialProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  displayValue?: string;
  onChange: (val: number) => void;
  icon?: 'aperture' | 'focus' | 'sun' | 'angle';
  presets?: { label: string; value: number }[];
  accentColor?: 'sky' | 'amber' | 'emerald';
}

export function RotaryParameterDial({
  label,
  value,
  min,
  max,
  step,
  unit = '',
  displayValue,
  onChange,
  icon = 'aperture',
  presets,
  accentColor = 'amber',
}: RotaryParameterDialProps) {
  const dialRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startYRef = useRef<number>(0);
  const startValRef = useRef<number>(value);

  const range = max - min;
  const normalized = Math.max(0, Math.min(1, (value - min) / Math.max(0.001, range)));
  // Map normalized (0..1) to rotation angle (-135deg .. +135deg)
  const rotationDeg = -135 + normalized * 270;

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(true);
    startYRef.current = e.clientY;
    startValRef.current = value;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    const deltaY = startYRef.current - e.clientY;
    const deltaVal = (deltaY / 120) * range;
    const rawVal = startValRef.current + deltaVal;
    const snapped = Math.round(rawVal / step) * step;
    const clamped = Math.max(min, Math.min(max, snapped));
    onChange(Number(clamped.toFixed(2)));
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore
    }
  };

  const IconComponent = {
    aperture: Aperture,
    focus: Crosshair,
    sun: Sun,
    angle: Compass,
  }[icon];

  const accentStyles = {
    sky: 'text-sky-300 border-sky-400/40 shadow-[0_0_12px_rgba(56,189,248,0.3)]',
    amber: 'text-amber-300 border-amber-400/40 shadow-[0_0_12px_rgba(251,191,36,0.3)]',
    emerald: 'text-emerald-300 border-emerald-400/40 shadow-[0_0_12px_rgba(16,185,129,0.3)]',
  }[accentColor];

  return (
    <div className="flex flex-col items-center p-2.5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md select-none">
      <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-slate-400 mb-1">
        <IconComponent className="w-3.5 h-3.5 text-slate-300" />
        <span>{label}</span>
      </div>

      {/* Rotary Knob */}
      <div
        ref={dialRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-gradient-to-b from-[#252c3d] via-[#141822] to-[#0a0d14] border border-white/20 flex items-center justify-center shadow-[inset_0_2px_2px_rgba(255,255,255,0.2),0_8px_20px_rgba(0,0,0,0.8)] cursor-ns-resize touch-none"
      >
        {/* Outer Arc Scale */}
        <div
          style={{ transform: `rotate(${rotationDeg}deg)` }}
          className="absolute inset-1 rounded-full border border-white/10 flex items-start justify-center transition-transform duration-75"
        >
          {/* Knob Notch Pip */}
          <div className={`w-1.5 h-3 rounded-full bg-white shadow-[0_0_8px_white] -mt-0.5`} />
        </div>

        {/* Center Metal Cap */}
        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-tr from-[#0e121a] to-[#202838] border border-white/15 flex flex-col items-center justify-center shadow-inner pointer-events-none">
          <span className="text-[11px] sm:text-xs font-mono font-bold text-white tracking-tight">
            {displayValue ?? `${value}${unit}`}
          </span>
        </div>
      </div>

      {/* Quick Value Presets */}
      {presets && presets.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-1 mt-2">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange(p.value)}
              className={`px-2 py-0.5 sm:px-1.5 rounded text-[10px] sm:text-[9px] font-mono border transition-all ${
                Math.abs(value - p.value) < step * 0.5
                  ? `${accentStyles} bg-white/15 font-semibold`
                  : 'bg-white/5 hover:bg-white/10 border-white/10 text-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

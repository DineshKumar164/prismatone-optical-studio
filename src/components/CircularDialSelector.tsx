'use client';

import React, { useCallback, useRef, useState } from 'react';
import { Camera, Disc, ChevronLeft, ChevronRight } from 'lucide-react';

export interface DialItem {
  id: string;
  label: string;
  subtitle?: string;
  badge?: string;
  icon?: React.ReactNode;
}

interface CircularDialSelectorProps {
  items: DialItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  iconType: 'camera' | 'lens';
  title: string;
  accentColor?: 'sky' | 'amber' | 'emerald';
}

export function CircularDialSelector({
  items,
  selectedId,
  onSelect,
  iconType,
  title,
  accentColor = 'sky',
}: CircularDialSelectorProps) {
  const currentIndex = Math.max(
    0,
    items.findIndex((item) => item.id === selectedId)
  );
  const activeItem = items[currentIndex] ?? items[0];

  const [isDragging, setIsDragging] = useState(false);
  const dialRef = useRef<HTMLDivElement | null>(null);
  const startAngleRef = useRef<number>(0);
  const currentRotationRef = useRef<number>(0);

  const totalItems = items.length;
  const anglePerItem = 360 / Math.max(1, totalItems);

  // Rotation angle so current item is positioned at the top 12 o'clock (or aligned with notch)
  const dialRotationDeg = -currentIndex * anglePerItem;

  const handleStep = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = (currentIndex + direction + totalItems) % totalItems;
      onSelect(items[nextIndex].id);
    },
    [currentIndex, items, onSelect, totalItems]
  );

  // Touch / mouse rotary drag support
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dialRef.current) return;
    setIsDragging(true);
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    startAngleRef.current = (rad * 180) / Math.PI;
    currentRotationRef.current = dialRotationDeg;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || !dialRef.current) return;
    const rect = dialRef.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rad = Math.atan2(e.clientY - centerY, e.clientX - centerX);
    const currentAngle = (rad * 180) / Math.PI;
    const delta = currentAngle - startAngleRef.current;

    // Estimate step delta
    if (Math.abs(delta) >= anglePerItem * 0.45) {
      const step = delta > 0 ? 1 : -1;
      handleStep(step);
      startAngleRef.current = currentAngle;
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignore pointer capture release if not held
    }
  };

  const accentStyles = {
    sky: {
      ring: 'border-sky-500/40 shadow-[0_0_25px_rgba(56,189,248,0.25)]',
      glow: 'bg-sky-400 shadow-[0_0_12px_rgba(56,189,248,0.9)]',
      text: 'text-sky-300',
      activePip: 'bg-sky-400 border-sky-300 shadow-[0_0_8px_rgba(56,189,248,0.8)]',
      notch: 'border-b-sky-400',
    },
    amber: {
      ring: 'border-amber-500/40 shadow-[0_0_25px_rgba(251,191,36,0.25)]',
      glow: 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)]',
      text: 'text-amber-300',
      activePip: 'bg-amber-400 border-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.8)]',
      notch: 'border-b-amber-400',
    },
    emerald: {
      ring: 'border-emerald-500/40 shadow-[0_0_25px_rgba(16,185,129,0.25)]',
      glow: 'bg-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.9)]',
      text: 'text-emerald-300',
      activePip: 'bg-emerald-400 border-emerald-300 shadow-[0_0_8px_rgba(16,185,129,0.8)]',
      notch: 'border-b-emerald-400',
    },
  }[accentColor];

  return (
    <div className="relative rounded-2xl bg-[#0c1018]/90 backdrop-blur-xl border border-white/10 p-3 sm:p-4 text-slate-200 flex flex-col items-center shadow-[0_12px_36px_rgba(0,0,0,0.7),inset_0_1px_1px_rgba(255,255,255,0.1)] select-none">
      {/* Title & Step Controls Header */}
      <div className="w-full flex items-center justify-between gap-2 mb-2">
        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
          <span className={`w-1.5 h-1.5 rounded-full ${accentStyles.glow}`} />
          {title}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => handleStep(-1)}
            aria-label={`Previous ${title}`}
            className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] font-mono text-slate-400 px-1">
            {currentIndex + 1} / {totalItems}
          </span>
          <button
            type="button"
            onClick={() => handleStep(1)}
            aria-label={`Next ${title}`}
            className="w-6 h-6 rounded-full bg-white/5 hover:bg-white/15 border border-white/10 flex items-center justify-center text-slate-300 hover:text-white transition-all active:scale-95"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Tactile Skeuomorphic Circular Dial */}
      <div className="relative flex items-center justify-center my-1">
        {/* Top Reference Notch Indicator (12 o'clock optical alignment) */}
        <div className="absolute -top-1.5 z-20 flex flex-col items-center pointer-events-none">
          <div
            className={`w-0 h-0 border-x-4 border-x-transparent border-t-[7px] ${accentStyles.notch.replace('border-b-', 'border-t-')}`}
          />
          <div className={`w-1.5 h-1.5 rounded-full ${accentStyles.glow} -mt-0.5`} />
        </div>

        {/* Circular Knurled Rotary Wheel */}
        <div
          ref={dialRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className={`relative w-32 h-32 sm:w-36 sm:h-36 [--dial-r:55px] sm:[--dial-r:63px] rounded-full bg-gradient-to-b from-[#1c2230] via-[#10141e] to-[#090b11] border-2 ${accentStyles.ring} flex items-center justify-center shadow-[inset_0_2px_4px_rgba(255,255,255,0.15),0_10px_25px_rgba(0,0,0,0.85)] cursor-grab active:cursor-grabbing transition-transform duration-200 touch-none`}
        >
          {/* Laser-Engraved Dial Ticks */}
          {items.map((item, idx) => {
            const tickAngle = idx * anglePerItem + dialRotationDeg;
            const isItemActive = idx === currentIndex;
            return (
              <div
                key={item.id}
                style={{
                  transform: `rotate(${tickAngle}deg) translateY(calc(-1 * var(--dial-r)))`,
                }}
                className="absolute flex flex-col items-center transition-transform duration-300"
              >
                <div
                  className={`w-1 transition-all ${
                    isItemActive
                      ? `h-3.5 ${accentStyles.activePip}`
                      : 'h-2 bg-slate-600/80 rounded-full'
                  }`}
                />
              </div>
            );
          })}

          {/* Knurled Outer Bevel Ring */}
          <div className="absolute inset-2 rounded-full border border-white/10 bg-radial from-[#1e2535] to-[#0c0f17] flex items-center justify-center shadow-inner pointer-events-none">
            {/* Skeuomorphic Center Hub with Camera or Lens Icon */}
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-gradient-to-tr from-[#0a0d14] via-[#161c28] to-[#252f44] border border-white/20 flex flex-col items-center justify-center shadow-[0_4px_16px_rgba(0,0,0,0.9),inset_0_1px_1px_rgba(255,255,255,0.25)]">
              {iconType === 'camera' ? (
                <Camera className={`w-5 h-5 sm:w-6 sm:h-6 ${accentStyles.text} transition-transform active:scale-90`} />
              ) : (
                <Disc className={`w-5 h-5 sm:w-6 sm:h-6 ${accentStyles.text} transition-transform active:scale-90 animate-spin-slow`} />
              )}
              <span className="text-[8px] font-mono tracking-widest text-slate-400 uppercase mt-0.5">
                {iconType}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Pill-Shaped Active Selection Readout Card */}
      <div className="w-full mt-2.5 p-2 rounded-xl bg-white/5 border border-white/10 backdrop-blur-md text-center space-y-0.5">
        <div className="flex items-center justify-center gap-1.5">
          <span className="text-xs sm:text-sm font-semibold tracking-wide text-white truncate max-w-[210px]">
            {activeItem.label}
          </span>
          {activeItem.badge && (
            <span
              className={`text-[9px] font-mono px-1.5 py-0.2 rounded-full bg-white/10 ${accentStyles.text} border border-white/15 shrink-0`}
            >
              {activeItem.badge}
            </span>
          )}
        </div>
        {activeItem.subtitle && (
          <p className="text-[10px] text-slate-400 truncate">{activeItem.subtitle}</p>
        )}
      </div>

      {/* Quick Radial Option Strip for Fast Click Switching */}
      <div className="w-full mt-2 flex items-center justify-center gap-1 overflow-x-auto py-0.5 studio-scrollbar">
        {items.map((item, idx) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            title={item.label}
            className={`w-6 h-6 rounded-full text-[10px] font-mono border transition-all flex items-center justify-center shrink-0 ${
              idx === currentIndex
                ? `${accentStyles.activePip} text-slate-900 font-bold scale-110`
                : 'bg-white/5 hover:bg-white/15 border-white/10 text-slate-400'
            }`}
          >
            {idx + 1}
          </button>
        ))}
      </div>
    </div>
  );
}

'use client';

import React from 'react';
import { ComputedOpticalMetrics } from '../profiles/optical-math';
import { BenchmarkReport, RgbScopeData } from '../pipeline/video-processor';
import { Button } from './ui/button';
import {
  Activity,
  Download,
  Gauge,
  HardDrive,
  Play,
  RotateCw,
  Square,
} from 'lucide-react';

export interface RenderJobRecord {
  id: number;
  projectTitle: string;
  sourceName: string;
  cameraId: string;
  lensId: string;
  qualityMode: string;
  renderBackend: string;
  resolution: string;
  totalFrames: number;
  processedFrames: number;
  avgFrameMs: string;
  status: string;
  s3ExportKey: string | null;
}

interface ScopesAndBenchmarkPanelProps {
  metrics: ComputedOpticalMetrics;
  scopes: RgbScopeData;
  benchmark: BenchmarkReport;
  onRunBenchmark: () => void;
  isBenchmarking: boolean;
  qualityMode: 'preview' | 'final';
  onQualityModeChange: (mode: 'preview' | 'final') => void;
  // Chunked Video Render Queue State
  isRenderingJob: boolean;
  renderProgress: {
    completedChunks: number;
    totalChunks: number;
    processedFrames: number;
    totalFrames: number;
    lastChunkIndex: number;
    wasCancelled: boolean;
  };
  onStartChunkedRender: (resumeFromCancelled?: boolean) => void;
  onCancelChunkedRender: () => void;
  onExportCurrentFrameToS3: () => void;
  s3ExportStatus: string | null;
  renderJobs: RenderJobRecord[];
}

export function ScopesAndBenchmarkPanel({
  metrics,
  scopes,
  benchmark,
  onRunBenchmark,
  isBenchmarking,
  qualityMode,
  onQualityModeChange,
  isRenderingJob,
  renderProgress,
  onStartChunkedRender,
  onCancelChunkedRender,
  onExportCurrentFrameToS3,
  s3ExportStatus,
  renderJobs,
}: ScopesAndBenchmarkPanelProps) {
  const pct =
    renderProgress.totalFrames > 0
      ? Math.round((renderProgress.processedFrames / renderProgress.totalFrames) * 100)
      : 0;

  return (
    <section className="bg-[#0e1017] border-t border-slate-800/90 p-4 space-y-4">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        {/* ZONE 1: COMPUTED OPTICAL BENCH TELEMETRY (4 cols) */}
        <div className="xl:col-span-4 bg-[#12151f] border border-slate-800/90 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200">
              Optical Bench Physical Telemetry
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-amber-300">
              {metrics.effectiveFocalLengthMm}mm Eff · {metrics.desqueezedAspectRatio}:1
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="bg-[#0b0d13] border border-slate-800/80 rounded p-2">
              <div className="text-[10px] text-slate-400">Horiz / Vert FOV</div>
              <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                {metrics.horizontalFovDeg}° / {metrics.verticalFovDeg}°
              </div>
            </div>

            <div className="bg-[#0b0d13] border border-slate-800/80 rounded p-2">
              <div className="text-[10px] text-slate-400">Hyperfocal Dist</div>
              <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                {metrics.hyperfocalDistanceM} m
              </div>
            </div>

            <div className="bg-[#0b0d13] border border-slate-800/80 rounded p-2">
              <div className="text-[10px] text-slate-400">DoF Near – Far</div>
              <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                {metrics.dofNearM}m – {metrics.dofFarM >= 999 ? '∞' : `${metrics.dofFarM}m`}
              </div>
            </div>

            <div className="bg-[#0b0d13] border border-slate-800/80 rounded p-2">
              <div className="text-[10px] text-slate-400">Center / Edge MTF50</div>
              <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                {metrics.centerMtf50LpMm} / {metrics.edgeMtf50LpMm} lp/mm
              </div>
            </div>

            <div className="bg-[#0b0d13] border border-slate-800/80 rounded p-2">
              <div className="text-[10px] text-slate-400">Corner Distortion</div>
              <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                {metrics.cornerDistortionPercent > 0 ? '+' : ''}
                {metrics.cornerDistortionPercent}%
              </div>
            </div>

            <div className="bg-[#0b0d13] border border-slate-800/80 rounded p-2">
              <div className="text-[10px] text-slate-400">Vignette / SNR</div>
              <div className="font-mono tabular-nums font-semibold text-slate-100 mt-0.5">
                -{metrics.cornerIlluminationDropEv} EV · {metrics.estimatedSnrDb}dB
              </div>
            </div>
          </div>
        </div>

        {/* ZONE 2: RGB PARADE & LUMINANCE WAVEFORM SCOPES (4 cols) */}
        <div className="xl:col-span-4 bg-[#12151f] border border-slate-800/90 rounded-lg p-3.5 flex flex-col justify-between space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-sky-400" />
              <span>RGB Parade & Luminance Scope</span>
            </h3>
            <span className="text-[11px] font-mono tabular-nums text-slate-400">
              Active DR: {scopes.dynamicRangeStopsMeasured} Stops
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 h-24 bg-[#090b10] border border-slate-800/80 rounded p-2 items-end">
            {/* Red Channel Parade */}
            <div className="flex items-end gap-[1px] h-full" aria-label="Red channel parade">
              {scopes.redParade.slice(0, 24).map((val, idx) => (
                <div
                  key={`r-${idx}`}
                  className="flex-1 bg-rose-500/75 rounded-t-[1px]"
                  style={{ height: `${Math.max(6, val)}%` }}
                />
              ))}
            </div>
            {/* Green Channel Parade */}
            <div className="flex items-end gap-[1px] h-full" aria-label="Green channel parade">
              {scopes.greenParade.slice(0, 24).map((val, idx) => (
                <div
                  key={`g-${idx}`}
                  className="flex-1 bg-emerald-500/75 rounded-t-[1px]"
                  style={{ height: `${Math.max(6, val)}%` }}
                />
              ))}
            </div>
            {/* Blue Channel Parade */}
            <div className="flex items-end gap-[1px] h-full" aria-label="Blue channel parade">
              {scopes.blueParade.slice(0, 24).map((val, idx) => (
                <div
                  key={`b-${idx}`}
                  className="flex-1 bg-sky-500/75 rounded-t-[1px]"
                  style={{ height: `${Math.max(6, val)}%` }}
                />
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-400">
            <span>0 IRE Black Floor</span>
            <span>18% Gray Pivot</span>
            <span>100 IRE Highlight Shoulder</span>
          </div>
        </div>

        {/* ZONE 3: CHUNKED VIDEO PROCESSING PIPELINE, BENCHMARK & S3 EXPORT (4 cols) */}
        <div className="xl:col-span-4 bg-[#12151f] border border-slate-800/90 rounded-lg p-3.5 flex flex-col justify-between space-y-2.5 overflow-hidden">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-slate-200 whitespace-nowrap">
                Frame Pipeline
              </h3>

              {/* Preview vs Final Mastering Mode Toggle */}
              <div className="flex items-center bg-[#090b10] p-0.5 rounded border border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={() => onQualityModeChange('preview')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    qualityMode === 'preview'
                      ? 'bg-slate-800 text-amber-300'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => onQualityModeChange('final')}
                  className={`px-2 py-0.5 text-[11px] font-medium rounded transition-colors whitespace-nowrap shrink-0 ${
                    qualityMode === 'final'
                      ? 'bg-amber-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Final Master
                </button>
              </div>
            </div>
            <p className="text-[11px] text-slate-400 font-mono tabular-nums whitespace-nowrap truncate">
              1080p: {benchmark.estimated1080pFps} fps · 4K: {benchmark.estimated4kFps} fps · Mem:{' '}
              {benchmark.memoryFootprintMb} MB
            </p>
          </div>

          {/* Chunked Progress Bar */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-300">
              <span>
                Chunk {renderProgress.completedChunks}/{renderProgress.totalChunks} (
                {renderProgress.processedFrames}/{renderProgress.totalFrames} frames)
              </span>
              <span>{pct}%</span>
            </div>
            <div className="w-full h-2 bg-[#090b10] rounded-full overflow-hidden border border-slate-800">
              <div
                className="h-full bg-amber-500 transition-all duration-150"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>

          {/* Pipeline Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {!isRenderingJob ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => onStartChunkedRender(false)}
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Render 96-Frame Sequence</span>
                </Button>

                {renderProgress.wasCancelled && renderProgress.processedFrames > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => onStartChunkedRender(true)}
                  >
                    <RotateCw className="w-3.5 h-3.5 text-amber-400" />
                    <span>Resume Chunk {renderProgress.lastChunkIndex + 1}</span>
                  </Button>
                )}
              </>
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={onCancelChunkedRender}
              >
                <Square className="w-3.5 h-3.5" />
                <span>Cancel Render Job</span>
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onExportCurrentFrameToS3}
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export Frame & S3 Key</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRunBenchmark}
              disabled={isBenchmarking}
            >
              <Gauge className="w-3.5 h-3.5" />
              <span>{isBenchmarking ? 'Benchmarking...' : 'Run 4K Benchmark'}</span>
            </Button>
          </div>

          {s3ExportStatus && (
            <div className="text-[11px] font-mono text-emerald-300 bg-emerald-950/30 border border-emerald-800/60 rounded px-2.5 py-1 truncate">
              {s3ExportStatus}
            </div>
          )}
        </div>
      </div>

      {/* RECENT RENDER JOBS & S3 STORAGE MANIFEST TABLE */}
      <div className="bg-[#12151f] border border-slate-800/90 rounded-lg overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-200">
              PostgreSQL Render Queue & S3 Object Storage Manifest
            </h3>
          </div>
          <div className="text-[11px] text-slate-400">
            <span>Roadmapped features: </span>
            <span className="text-slate-300 font-medium">
              Multi-Node Distributed Cloud Farm (Planned) · ACES 2.0 AMF Sidecar XML (Planned)
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-800/80 text-[11px] text-slate-400 bg-[#0d1017]">
                <th className="py-2 px-3 font-medium">Job Title & Source</th>
                <th className="py-2 px-3 font-medium">Optical Rig</th>
                <th className="py-2 px-3 font-medium">Backend & Mode</th>
                <th className="py-2 px-3 font-medium text-right">Frames</th>
                <th className="py-2 px-3 font-medium text-right">Avg Frame</th>
                <th className="py-2 px-3 font-medium">S3 Storage Key</th>
                <th className="py-2 px-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono tabular-nums text-[11px]">
              {renderJobs.slice(0, 5).map((job) => (
                <tr key={job.id} className="hover:bg-slate-800/25 transition-colors">
                  <td className="py-2 px-3 font-sans">
                    <span className="font-medium text-slate-200">{job.projectTitle}</span>
                    <span className="text-slate-500 mx-1.5">·</span>
                    <span className="text-slate-400">{job.sourceName}</span>
                  </td>
                  <td className="py-2 px-3 text-slate-300">
                    {job.cameraId} / {job.lensId}
                  </td>
                  <td className="py-2 px-3 text-slate-300 uppercase">
                    {job.renderBackend} · {job.qualityMode} ({job.resolution})
                  </td>
                  <td className="py-2 px-3 text-right text-slate-300">
                    {job.processedFrames}/{job.totalFrames}
                  </td>
                  <td className="py-2 px-3 text-right text-amber-300">{job.avgFrameMs} ms</td>
                  <td className="py-2 px-3 text-slate-400 truncate max-w-[200px]">
                    {job.s3ExportKey || 's3://prismatone-media-vault/pending'}
                  </td>
                  <td className="py-2 px-3 font-sans">
                    <span
                      className={
                        job.status === 'completed'
                          ? 'text-emerald-400 font-medium'
                          : job.status === 'cancelled'
                          ? 'text-amber-400 font-medium'
                          : 'text-sky-400 font-medium'
                      }
                    >
                      {job.status === 'completed' ? 'Completed' : job.status === 'cancelled' ? 'Cancelled (Recoverable)' : job.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

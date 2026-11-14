import React from 'react';
import { PrismatoneWorkspace } from '../src/components/PrismatoneWorkspace';
import { SavedOpticalPresetRecord } from '../src/components/OpticalParameterPanel';
import { RenderJobRecord } from '../src/components/ScopesAndBenchmarkPanel';
import { listOpticalPresets, listRenderJobs } from '../src/db/users';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  let initialPresets: SavedOpticalPresetRecord[] = [];
  let initialJobs: RenderJobRecord[] = [];

  try {
    const [presets, jobs] = await Promise.all([listOpticalPresets(), listRenderJobs()]);
    initialPresets = presets.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      cameraId: p.cameraId,
      lensId: p.lensId,
      parametersJson: p.parametersJson,
      isSystem: p.isSystem,
    }));
    initialJobs = jobs.map((j) => ({
      id: j.id,
      projectTitle: j.projectTitle,
      sourceName: j.sourceName,
      cameraId: j.cameraId,
      lensId: j.lensId,
      qualityMode: j.qualityMode,
      renderBackend: j.renderBackend,
      resolution: j.resolution,
      totalFrames: j.totalFrames,
      processedFrames: j.processedFrames,
      avgFrameMs: j.avgFrameMs,
      status: j.status,
      s3ExportKey: j.s3ExportKey,
    }));
  } catch (error) {
    console.error('Fallback initial workspace state:', error);
  }

  return (
    <PrismatoneWorkspace
      initialPresets={initialPresets}
      initialJobs={initialJobs}
    />
  );
}

'use server';

import {
  listOpticalPresets,
  createOpticalPreset,
  deleteOpticalPresetById,
  listRenderJobs,
  createRenderJobRecord,
  listMediaAssets,
} from '../../src/db/users';

export async function fetchWorkspaceDataAction() {
  try {
    const [presets, jobs, assets] = await Promise.all([
      listOpticalPresets(),
      listRenderJobs(),
      listMediaAssets(),
    ]);
    return {
      ok: true,
      presets,
      jobs,
      assets,
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unable to fetch workspace records';
    return {
      ok: false,
      error: msg,
      presets: [],
      jobs: [],
      assets: [],
    };
  }
}

export async function saveOpticalPresetServerAction(payload: {
  userUid?: string | null;
  name: string;
  description: string;
  cameraId: string;
  lensId: string;
  parametersJson: string;
}) {
  try {
    const preset = await createOpticalPreset({
      userUid: payload.userUid ?? null,
      name: payload.name,
      description: payload.description,
      cameraId: payload.cameraId,
      lensId: payload.lensId,
      parametersJson: payload.parametersJson,
      isSystem: false,
    });
    return { ok: true, preset };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save optical preset';
    return { ok: false, error: msg };
  }
}

export async function deleteOpticalPresetServerAction(id: number) {
  try {
    await deleteOpticalPresetById(id);
    return { ok: true, id };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete preset';
    return { ok: false, error: msg };
  }
}

export async function recordRenderJobServerAction(payload: {
  userUid?: string | null;
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
  s3ExportKey?: string | null;
}) {
  try {
    const job = await createRenderJobRecord(payload);
    return { ok: true, job };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to record render job';
    return { ok: false, error: msg };
  }
}

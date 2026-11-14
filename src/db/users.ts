import { db } from './index';
import { users, opticalPresets, mediaAssets, renderJobs } from './schema';
import { desc, eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, displayName?: string | null) {
  try {
    const result = await db
      .insert(users)
      .values({
        uid,
        email,
        displayName: displayName ?? null,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email,
          displayName: displayName ?? null,
        },
      })
      .returning();

    return result[0];
  } catch (error) {
    console.error('Database user upsert failed:', error);
    throw new Error('Failed to synchronize user profile.', { cause: error });
  }
}

export async function listOpticalPresets() {
  try {
    return await db.select().from(opticalPresets).orderBy(desc(opticalPresets.createdAt));
  } catch (error) {
    console.error('Database query failed (listOpticalPresets):', error);
    throw new Error('Could not load optical presets from database.', { cause: error });
  }
}

export async function createOpticalPreset(data: {
  userUid?: string | null;
  name: string;
  description: string;
  cameraId: string;
  lensId: string;
  parametersJson: string;
  isSystem?: boolean;
}) {
  try {
    const result = await db
      .insert(opticalPresets)
      .values({
        userUid: data.userUid ?? null,
        name: data.name,
        description: data.description,
        cameraId: data.cameraId,
        lensId: data.lensId,
        parametersJson: data.parametersJson,
        isSystem: data.isSystem ?? false,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database insert failed (createOpticalPreset):', error);
    throw new Error('Could not save optical preset.', { cause: error });
  }
}

export async function deleteOpticalPresetById(id: number) {
  try {
    await db.delete(opticalPresets).where(eq(opticalPresets.id, id));
    return { deletedId: id };
  } catch (error) {
    console.error('Database delete failed (deleteOpticalPresetById):', error);
    throw new Error('Could not delete optical preset.', { cause: error });
  }
}

export async function listMediaAssets() {
  try {
    return await db.select().from(mediaAssets).orderBy(desc(mediaAssets.createdAt));
  } catch (error) {
    console.error('Database query failed (listMediaAssets):', error);
    throw new Error('Could not load media assets.', { cause: error });
  }
}

export async function createMediaAssetRecord(data: {
  userUid?: string | null;
  name: string;
  mediaType: string;
  codec: string;
  width: number;
  height: number;
  fps: number;
  durationSec: string;
  s3Key: string;
  storageBucket: string;
  fileSizeBytes: number;
}) {
  try {
    const result = await db
      .insert(mediaAssets)
      .values({
        userUid: data.userUid ?? null,
        name: data.name,
        mediaType: data.mediaType,
        codec: data.codec,
        width: data.width,
        height: data.height,
        fps: data.fps,
        durationSec: data.durationSec,
        s3Key: data.s3Key,
        storageBucket: data.storageBucket,
        fileSizeBytes: data.fileSizeBytes,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database insert failed (createMediaAssetRecord):', error);
    throw new Error('Could not record media asset.', { cause: error });
  }
}

export async function listRenderJobs() {
  try {
    return await db.select().from(renderJobs).orderBy(desc(renderJobs.createdAt));
  } catch (error) {
    console.error('Database query failed (listRenderJobs):', error);
    throw new Error('Could not load render jobs.', { cause: error });
  }
}

export async function createRenderJobRecord(data: {
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
    const result = await db
      .insert(renderJobs)
      .values({
        userUid: data.userUid ?? null,
        projectTitle: data.projectTitle,
        sourceName: data.sourceName,
        cameraId: data.cameraId,
        lensId: data.lensId,
        qualityMode: data.qualityMode,
        renderBackend: data.renderBackend,
        resolution: data.resolution,
        totalFrames: data.totalFrames,
        processedFrames: data.processedFrames,
        avgFrameMs: data.avgFrameMs,
        status: data.status,
        s3ExportKey: data.s3ExportKey ?? null,
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database insert failed (createRenderJobRecord):', error);
    throw new Error('Could not save render job.', { cause: error });
  }
}

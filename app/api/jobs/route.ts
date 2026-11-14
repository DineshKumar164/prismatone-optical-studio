import { NextRequest, NextResponse } from 'next/server';
import {
  listRenderJobs,
  createRenderJobRecord,
  listMediaAssets,
  createMediaAssetRecord,
} from '../../../src/db/users';
import { verifyBearerToken } from '../../../src/lib/firebase-admin';

export async function GET() {
  try {
    const [jobs, assets] = await Promise.all([listRenderJobs(), listMediaAssets()]);
    return NextResponse.json({ jobs, assets });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load render queue';
    return NextResponse.json({ error: msg, jobs: [], assets: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyBearerToken(req.headers.get('authorization'));
    const body = await req.json();

    if (body.kind === 'media-asset') {
      const asset = await createMediaAssetRecord({
        userUid: decoded?.uid ?? null,
        name: String(body.name || 'Untitled_Media.mp4'),
        mediaType: String(body.mediaType || 'video'),
        codec: String(body.codec || 'WebCodecs / H.264'),
        width: Number(body.width || 1920),
        height: Number(body.height || 1080),
        fps: Number(body.fps || 24),
        durationSec: String(body.durationSec || '10.0'),
        s3Key: String(body.s3Key || `uploads/${Date.now()}_media.mp4`),
        storageBucket: String(body.storageBucket || process.env.S3_BUCKET || 'prismatone-media-vault'),
        fileSizeBytes: Number(body.fileSizeBytes || 10485760),
      });
      return NextResponse.json({ asset }, { status: 201 });
    }

    const job = await createRenderJobRecord({
      userUid: decoded?.uid ?? null,
      projectTitle: String(body.projectTitle || 'Optical Simulation Export'),
      sourceName: String(body.sourceName || 'Tokyo_Rain_Anamorphic_Plate.mp4'),
      cameraId: String(body.cameraId || 'arri-alexa-35'),
      lensId: String(body.lensId || 'cooke-anamorphic-i-sf-50'),
      qualityMode: String(body.qualityMode || 'final'),
      renderBackend: String(body.renderBackend || 'webgpu'),
      resolution: String(body.resolution || '3840x2160'),
      totalFrames: Number(body.totalFrames || 96),
      processedFrames: Number(body.processedFrames || 96),
      avgFrameMs: String(body.avgFrameMs || '8.4'),
      status: String(body.status || 'completed'),
      s3ExportKey: body.s3ExportKey ? String(body.s3ExportKey) : null,
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to record render job';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

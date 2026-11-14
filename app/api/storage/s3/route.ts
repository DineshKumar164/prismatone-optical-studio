import { NextRequest, NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

function getS3Client() {
  const endpoint = process.env.S3_ENDPOINT || 'https://s3.us-east-1.amazonaws.com';
  const region = process.env.S3_REGION || 'us-east-1';
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || 'prismatone-vault-key';
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || 'prismatone-vault-secret';

  return new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const fileName = String(body.fileName || 'render_export.png').replace(/[^a-zA-Z0-9._-]/g, '_');
    const contentType = String(body.contentType || 'image/png');
    const folder = body.operation === 'upload-source' ? 'plates' : 'exports';
    const bucket = process.env.S3_BUCKET || 'prismatone-media-vault';
    const objectKey = `${folder}/${Date.now()}_${fileName}`;

    const client = getS3Client();
    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: objectKey,
      ContentType: contentType,
    });
    const getCommand = new GetObjectCommand({
      Bucket: bucket,
      Key: objectKey,
    });

    const [presignedPutUrl, presignedGetUrl] = await Promise.all([
      getSignedUrl(client, putCommand, { expiresIn: 3600 }),
      getSignedUrl(client, getCommand, { expiresIn: 3600 }),
    ]);

    return NextResponse.json({
      bucket,
      objectKey,
      presignedPutUrl,
      presignedGetUrl,
      endpoint: process.env.S3_ENDPOINT || 'https://s3.us-east-1.amazonaws.com',
      configuredCredentials: Boolean(
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
      ),
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to generate S3 presigned URL';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

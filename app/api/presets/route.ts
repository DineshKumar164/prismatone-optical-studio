import { NextRequest, NextResponse } from 'next/server';
import {
  listOpticalPresets,
  createOpticalPreset,
  deleteOpticalPresetById,
} from '../../../src/db/users';
import { verifyBearerToken } from '../../../src/lib/firebase-admin';

export async function GET() {
  try {
    const presets = await listOpticalPresets();
    return NextResponse.json({ presets });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to load optical presets';
    return NextResponse.json({ error: msg, presets: [] }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyBearerToken(req.headers.get('authorization'));
    const body = await req.json();

    const name = String(body.name || '').trim();
    const description = String(body.description || 'Custom optical rig configuration').trim();
    const cameraId = String(body.cameraId || '').trim();
    const lensId = String(body.lensId || '').trim();
    const parametersJson =
      typeof body.parameters === 'string'
        ? body.parameters
        : JSON.stringify(body.parameters || {});

    if (!name || !cameraId || !lensId) {
      return NextResponse.json(
        { error: 'Preset name, camera profile, and lens profile are required.' },
        { status: 400 }
      );
    }

    const created = await createOpticalPreset({
      userUid: decoded?.uid ?? null,
      name,
      description,
      cameraId,
      lensId,
      parametersJson,
      isSystem: false,
    });

    return NextResponse.json({ preset: created }, { status: 201 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to save optical preset';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = Number(searchParams.get('id'));
    if (!id || Number.isNaN(id)) {
      return NextResponse.json({ error: 'Valid preset id is required' }, { status: 400 });
    }
    const result = await deleteOpticalPresetById(id);
    return NextResponse.json(result);
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to delete preset';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

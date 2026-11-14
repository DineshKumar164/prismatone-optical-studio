import { NextRequest, NextResponse } from 'next/server';
import { verifyBearerToken } from '../../../../src/lib/firebase-admin';
import { getOrCreateUser } from '../../../../src/db/users';

export async function POST(req: NextRequest) {
  try {
    const decoded = await verifyBearerToken(req.headers.get('authorization'));
    if (!decoded) {
      return NextResponse.json({ error: 'Unauthorized: Missing or invalid token' }, { status: 401 });
    }

    const user = await getOrCreateUser(
      decoded.uid,
      decoded.email || 'user@prismatone.studio',
      decoded.name || null
    );
    return NextResponse.json({ user });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to synchronize user';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

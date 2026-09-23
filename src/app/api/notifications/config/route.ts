import { NextResponse } from 'next/server';
import { env, hasWebPush } from '@/lib/env';

export async function GET() {
  return NextResponse.json({
    success: true,
    enabled: hasWebPush,
    publicKey: hasWebPush ? env.vapidPublicKey : null,
  });
}

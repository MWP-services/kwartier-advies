import { NextResponse } from 'next/server';

export function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ error }, { status });
}

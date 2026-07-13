import { NextRequest, NextResponse } from 'next/server';

const STRATTON_API_URL = process.env.STRATTON_API_URL || 'http://localhost:8000';

export async function GET(req: NextRequest, { params }: { params: { ticker: string } }) {
  try {
    const symbol = params.ticker;
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || '1mo';

    const res = await fetch(`${STRATTON_API_URL}/api/history/${encodeURIComponent(symbol)}?period=${period}`, {
      method: 'GET',
    });
    
    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: errText }, { status: res.status });
    }
    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 503 });
  }
}

import { NextResponse } from 'next/server';

export async function GET() {
  const start = new Date('2024-01-01T00:00:00Z');
  const rows = ['timestamp,consumption_kwh,export_kwh,pv_kwh'];

  for (let i = 0; i < 96 * 14; i += 1) {
    const ts = new Date(start.getTime() + i * 15 * 60 * 1000);
    const hour = ts.getUTCHours();
    const baseKw = hour >= 8 && hour <= 18 ? 420 : 280;
    const peak = hour >= 11 && hour <= 14 ? 180 : 0;
    const noise = (Math.sin(i / 6) + 1) * 15;
    const consumptionKw = baseKw + peak + noise;
    const consumptionKwh = consumptionKw * 0.25;
    rows.push(`${ts.toISOString()},${consumptionKwh.toFixed(3)},0,0`);
  }

  return new NextResponse(rows.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="sample_peak_data.csv"'
    }
  });
}

import { NextResponse } from 'next/server';
import { buildDataQualityReport, computeSizing, groupPeakEvents, processIntervals } from '@/lib/calculations';
import { simulateAllScenarios } from '@/lib/simulation';

export async function POST(request: Request) {
  const body = await request.json();
  const intervals = processIntervals(body.rows, body.contractedPowerKw);
  const events = groupPeakEvents(intervals);
  const sizing = computeSizing({
    intervals,
    events,
    method: body.method,
    compliance: body.compliance,
    safetyFactor: body.safetyFactor,
    efficiency: body.efficiency
  });
  const scenarios = simulateAllScenarios(intervals, sizing.kWNeeded, sizing.recommendedProduct.capacityKwh);
  const quality = buildDataQualityReport(body.rows);

  return NextResponse.json({ intervals, events, sizing, scenarios, quality });
}

'use client';

import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { PvAdviceChartsData, PvStorageFormulaAdviceResult } from '@/lib/calculations';
import { formatTimestamp } from '@/lib/datetime';

interface PvAdviceChartsProps {
  charts: PvAdviceChartsData;
  advice: PvStorageFormulaAdviceResult;
}

function formatKwh(value: unknown): string {
  return `${Number(value ?? 0).toFixed(1)} kWh`;
}

function formatPercent(value: unknown): string {
  return `${Number(value ?? 0).toFixed(1)}%`;
}

function formatEur(value: unknown): string {
  return `EUR ${Number(value ?? 0).toFixed(2)}`;
}

export function PvAdviceCharts({ charts, advice }: PvAdviceChartsProps) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="wx-card">
          <h3 className="wx-title">Dagelijkse opslagbehoefte</h3>
          <p className="mb-3 text-sm text-slate-600">
            Deze grafiek laat per dag zien hoeveel zonne-overschot later op de dag of nacht nuttig gebruikt kan worden.
            De P50-, P75- en P90-lijnen vormen de basis voor het conservatieve, aanbevolen en ruime batterijadvies.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.dailyStorageChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  minTickGap={24}
                  label={{ value: 'Datum', position: 'insideBottom', offset: -5 }}
                />
                <YAxis
                  tickFormatter={(value) => `${value}`}
                  label={{ value: 'Opslagbehoefte (kWh)', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip formatter={(value) => formatKwh(value)} />
                <Legend />
                <Bar dataKey="dailyStorageNeedKwh" fill="#0ea5e9" name="Opslagbehoefte" />
                <ReferenceLine y={advice.percentiles.p50StorageNeedKwh} stroke="#64748b" strokeDasharray="4 4" label="P50" />
                <ReferenceLine y={advice.percentiles.p75StorageNeedKwh} stroke="#16a34a" strokeDasharray="4 4" label="P75" />
                <ReferenceLine y={advice.percentiles.p90StorageNeedKwh} stroke="#f97316" strokeDasharray="4 4" label="P90" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: datum per dag. Y-as: nuttige opslagbehoefte in kWh per dag.</p>
        </div>

        <div className="wx-card">
          <h3 className="wx-title">Verdeling van opslagbehoefte</h3>
          <p className="mb-3 text-sm text-slate-600">
            Deze grafiek voorkomt dat het advies wordt gebaseerd op een extreme dag. Het advies wordt gebaseerd op representatieve
            percentielen.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.storageDistributionChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" label={{ value: 'Opslagbehoefte-bucket (kWh)', position: 'insideBottom', offset: -5 }} />
                <YAxis allowDecimals={false} label={{ value: 'Aantal dagen', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => `${Number(value)} dagen`} />
                <Bar dataKey="count" fill="#3b82f6" name="Aantal dagen" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: bandbreedte van dagelijkse opslagbehoefte. Y-as: aantal dagen in die bandbreedte.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="wx-card">
          <h3 className="wx-title">Teruglevering versus avond/nachtverbruik</h3>
          <p className="mb-3 text-sm text-slate-600">
            Een batterij hoeft niet groter te zijn dan de hoeveelheid zonne-overschot die beschikbaar is, maar ook niet groter
            dan wat later op de dag of nacht nog zelf gebruikt kan worden.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.exportVsNightImportChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" minTickGap={24} label={{ value: 'Datum', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Energie per dag (kWh)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatKwh(value)} />
                <Legend />
                <Bar dataKey="dailyExportKwh" fill="#f59e0b" name="Teruglevering" />
                <Bar dataKey="eveningNightImportKwh" fill="#22c55e" name="Avond/nacht-import" />
                <Line type="monotone" dataKey="dailyStorageNeedKwh" stroke="#2563eb" dot={false} name="Opslagbehoefte" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: datum per dag. Y-as: dagelijkse teruglevering, avond/nacht-import en opslagbehoefte in kWh.</p>
        </div>

        <div className="wx-card">
          <h3 className="wx-title">Batterijadvies: conservatief, aanbevolen en ruim</h3>
          <p className="mb-3 text-sm text-slate-600">
            Het aanbevolen advies is gebaseerd op P75 van de dagelijkse opslagbehoefte, inclusief veiligheidsfactor en correctie
            voor bruikbare batterijcapaciteit.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.adviceComparisonChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" label={{ value: 'Adviesniveau', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Batterijcapaciteit (kWh)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatKwh(value)} />
                <Bar dataKey="capacityKwh" name="Capaciteit">
                  {charts.adviceComparisonChart.map((entry) => (
                    <Cell key={entry.label} fill={entry.emphasis ? '#16a34a' : '#94a3b8'} />
                  ))}
                </Bar>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: conservatief, aanbevolen en ruim advies. Y-as: geadviseerde batterijcapaciteit in kWh.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="wx-card">
          <h3 className="wx-title">Meeropbrengst per extra kWh batterijcapaciteit</h3>
          <p className="mb-3 text-sm text-slate-600">
            Deze grafiek laat zien hoeveel extra nuttig gebruik ontstaat bij een grotere batterij. Zodra de meeropbrengst
            afvlakt, is een grotere batterij minder logisch.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.marginalGainChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="capacityKwh" label={{ value: 'Batterijcapaciteit (kWh)', position: 'insideBottom', offset: -5 }} />
                <YAxis yAxisId="left" label={{ value: 'Gedekte opslag (kWh/jaar)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'Meeropbrengst per extra kWh', angle: 90, position: 'insideRight' }} />
                <Tooltip formatter={(value, name) => (name?.toString().includes('Dekking') ? formatPercent(value) : formatKwh(value))} />
                <Legend />
                <Bar yAxisId="left" dataKey="coveredStorageKwhPerYear" fill="#0ea5e9" name="Gedekte opslag per jaar" />
                <Line yAxisId="right" type="monotone" dataKey="marginalGainPerAddedKwh" stroke="#f97316" name="Meeropbrengst per extra kWh" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: batterijgrootte in kWh. Linker Y-as: totaal afgedekte opslagbehoefte per jaar. Rechter Y-as: extra opbrengst per extra kWh capaciteit.</p>
        </div>

        <div className="wx-card">
          <h3 className="wx-title">Dekking per batterijgrootte</h3>
          <p className="mb-3 text-sm text-slate-600">
            Deze grafiek laat zien welk deel van de dagelijkse opslagbehoefte door verschillende batterijgroottes wordt
            afgedekt.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.coverageByCapacityChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="capacityKwh" label={{ value: 'Batterijcapaciteit (kWh)', position: 'insideBottom', offset: -5 }} />
                <YAxis domain={[0, 100]} tickFormatter={(value) => `${value}%`} label={{ value: 'Dekking (%)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatPercent(value)} />
                <Legend />
                <Bar dataKey="fullyCoveredDaysPercentage" fill="#22c55e" name="Volledig gedekte dagen" />
                <Line type="monotone" dataKey="averageCoveragePercentage" stroke="#2563eb" name="Gemiddelde dekking" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: batterijgrootte in kWh. Y-as: percentage dagen of gemiddelde opslagbehoefte dat wordt afgedekt.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="wx-card">
          <h3 className="wx-title">Maandelijkse teruglevering en benutbare opslag</h3>
          <p className="mb-3 text-sm text-slate-600">
            Deze grafiek laat zien in welke maanden de meeste zonne-overschotten ontstaan en hoeveel daarvan praktisch nuttig
            opgeslagen kan worden.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.monthlyStorageChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" label={{ value: 'Maand', position: 'insideBottom', offset: -5 }} />
                <YAxis label={{ value: 'Energie per maand (kWh)', angle: -90, position: 'insideLeft' }} />
                <Tooltip formatter={(value) => formatKwh(value)} />
                <Legend />
                <Bar dataKey="monthlyExportKwh" stackId="a" fill="#f59e0b" name="Maandelijkse teruglevering" />
                <Bar dataKey="monthlyEveningNightImportKwh" stackId="a" fill="#22c55e" name="Maandelijkse avond/nacht-import" />
                <Line type="monotone" dataKey="monthlyUsefulStorageNeedKwh" stroke="#2563eb" name="Benutbare opslag" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: maand. Y-as: teruglevering, avond/nacht-import en benutbare opslag in kWh per maand.</p>
        </div>

        <div className="wx-card">
          <h3 className="wx-title">Voorbeelddag: laden en ontladen</h3>
          <p className="mb-3 text-sm text-slate-600">
            Deze grafiek laat zien hoe de aanbevolen batterij overdag zonne-overschot opslaat en later eigen verbruik
            ondersteunt.
          </p>
          <div className="h-72">
            <ResponsiveContainer>
              <ComposedChart data={charts.exampleDayChart}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="timestamp"
                  tickFormatter={(value) => formatTimestamp(value).slice(11)}
                  minTickGap={24}
                  label={{ value: 'Tijdstip binnen de dag', position: 'insideBottom', offset: -5 }}
                />
                <YAxis yAxisId="left" label={{ value: 'Import/export (kWh per kwartier)', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'Batterij-SOC (kWh)', angle: 90, position: 'insideRight' }} />
                <Tooltip
                  labelFormatter={(value) => formatTimestamp(String(value))}
                  formatter={(value) => formatKwh(value)}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="exportKwh" fill="#f59e0b" name="Export" />
                <Bar yAxisId="left" dataKey="importKwh" fill="#22c55e" name="Import" />
                <Area yAxisId="right" type="monotone" dataKey="batterySocKwh" fill="#93c5fd" stroke="#2563eb" name="Batterij-SOC" />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-slate-500">X-as: kwartiermomenten binnen een representatieve dag. Linker Y-as: import en export in kWh per kwartier. Rechter Y-as: batterijlading in kWh.</p>
        </div>
      </div>

      {charts.annualValueByCapacityChart.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="wx-card">
            <h3 className="wx-title">Jaarlijkse waarde per batterijgrootte</h3>
            <p className="mb-3 text-sm text-slate-600">
              Deze grafiek laat zien welke jaarlijkse financiële waarde elke batterijoptie oplevert op basis van de gekozen prijsmodus.
            </p>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={charts.annualValueByCapacityChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="capacityKwh" label={{ value: 'Batterijcapaciteit (kWh)', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'Jaarlijkse waarde (EUR)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => formatEur(value)} />
                  <Bar dataKey="annualValueEur" fill="#2563eb" name="Jaarlijkse waarde" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate-500">X-as: batterijgrootte in kWh. Y-as: jaarlijkse waarde in euro.</p>
          </div>

          <div className="wx-card">
            <h3 className="wx-title">Import/export kosten voor en na batterij</h3>
            <p className="mb-3 text-sm text-slate-600">
              Deze grafiek vergelijkt de energiekosten zonder batterij met de kosten na inzet van de aanbevolen batterij.
            </p>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={charts.importExportCostChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" label={{ value: 'Kostenvergelijking', position: 'insideBottom', offset: -5 }} />
                  <YAxis label={{ value: 'Waarde (EUR)', angle: -90, position: 'insideLeft' }} />
                  <Tooltip formatter={(value) => formatEur(value)} />
                  <Bar dataKey="costEur" fill="#16a34a" name="Waarde / kosten" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate-500">X-as: kosten zonder batterij, met batterij en netto waarde. Y-as: euro.</p>
          </div>
        </div>
      )}

      {charts.monthlyValueChart.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="wx-card">
            <h3 className="wx-title">Waarde per maand</h3>
            <p className="mb-3 text-sm text-slate-600">
              Deze grafiek laat zien in welke maanden de batterij financieel het meeste effect heeft.
            </p>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={charts.monthlyValueChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" label={{ value: 'Maand', position: 'insideBottom', offset: -5 }} />
                  <YAxis yAxisId="left" label={{ value: 'Kosten (EUR)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Netto waarde (EUR)', angle: 90, position: 'insideRight' }} />
                  <Tooltip formatter={(value) => formatEur(value)} />
                  <Legend />
                  <Bar yAxisId="left" dataKey="baselineCostEur" fill="#94a3b8" name="Kosten zonder batterij" />
                  <Bar yAxisId="left" dataKey="batteryCostEur" fill="#16a34a" name="Kosten met batterij" />
                  <Line yAxisId="right" type="monotone" dataKey="valueEur" stroke="#2563eb" name="Netto waarde" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate-500">X-as: maand. Linker Y-as: energiekosten in euro. Rechter Y-as: netto waarde in euro.</p>
          </div>

          <div className="wx-card">
            <h3 className="wx-title">Voorbeelddag: prijs en batterij-SOC</h3>
            <p className="mb-3 text-sm text-slate-600">
              Deze grafiek laat zien hoe de batterijlading zich verhoudt tot import- en exportprijzen op een representatieve dag.
            </p>
            <div className="h-72">
              <ResponsiveContainer>
                <ComposedChart data={charts.exampleDayChart}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="timestamp"
                    tickFormatter={(value) => formatTimestamp(value).slice(11)}
                    minTickGap={24}
                    label={{ value: 'Tijdstip binnen de dag', position: 'insideBottom', offset: -5 }}
                  />
                  <YAxis yAxisId="left" label={{ value: 'Prijs (EUR/kWh)', angle: -90, position: 'insideLeft' }} />
                  <YAxis yAxisId="right" orientation="right" label={{ value: 'Batterij-SOC (kWh)', angle: 90, position: 'insideRight' }} />
                  <Tooltip
                    labelFormatter={(value) => formatTimestamp(String(value))}
                    formatter={(value, name) => (name?.toString().includes('prijs') ? formatEur(value) : formatKwh(value))}
                  />
                  <Legend />
                  <Line yAxisId="left" type="monotone" dataKey="importPriceEurPerKwh" stroke="#dc2626" dot={false} name="Importprijs" />
                  <Line yAxisId="left" type="monotone" dataKey="exportPriceEurPerKwh" stroke="#f59e0b" dot={false} name="Exportprijs" />
                  <Area yAxisId="right" type="monotone" dataKey="batterySocKwh" fill="#93c5fd" stroke="#2563eb" name="Batterij-SOC" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <p className="mt-2 text-xs text-slate-500">X-as: kwartiermomenten binnen een representatieve dag. Linker Y-as: prijs in EUR/kWh. Rechter Y-as: batterijlading in kWh.</p>
          </div>
        </div>
      )}

      {charts.warnings.length > 0 && (
        <div className="wx-card text-sm text-amber-700">
          {charts.warnings.map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}
    </div>
  );
}

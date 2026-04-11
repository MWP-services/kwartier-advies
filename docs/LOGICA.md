# LOGICA van de applicatie (in simpele taal)

## 1) Overzicht in 1 minuut
Deze app helpt je bepalen welke batterij-oplossing het beste past om pieken in elektriciteitsverbruik af te vlakken (peak shaving). Je uploadt kwartierdata, de app rekent uit waar je boven je contractvermogen zit, simuleert meerdere batterijscenario's (laden en ontladen), vergelijkt de resultaten en geeft daarna een advies met een aanbevolen en alternatieve batterij-optie.

Bronnen:
- `app/page.tsx::runAnalysis`
- `lib/calculations.ts::processIntervals`, `lib/calculations.ts::computeSizing`
- `lib/simulation.ts::simulateAllScenarios`, `lib/simulation.ts::simulateSingleScenario`

---

## 2) Input: welke data verwacht de app?
De app verwacht tijdreeksdata met minimaal:
- `timestamp`
- `consumptionKwh`

Optioneel:
- `exportKwh`
- `pvKwh`

Bestandsformaten:
- CSV
- XLSX

Tijdstap en eenheden:
- Interval is bedoeld als 15 minuten (`0.25 uur`)
- Energie per interval: `kWh`
- Vermogen: `kW`

Belangrijke instellingen van de gebruiker:
- gecontracteerd vermogen (`contractedPowerKw`)
- rekenmethode (`MAX_PEAK`, `P95`, `FULL_COVERAGE`)
- compliance-target
- safety factor
- efficiency

Bronnen:
- `lib/parsing.ts::parseCsv`, `lib/parsing.ts::parseXlsx`, `lib/parsing.ts::mapRows`
- `lib/analysis.ts::AnalysisSettings`
- `app/page.tsx` (formulier + analyze-flow)

---

## 3) Preprocessing
### 3.1 Normalisatie van ruwe rijen
Ruwe rijen worden eerst opgeschoond:
- timestamp wordt geparsed en naar ISO gezet
- ongeldige rijen vallen weg
- de app kan data interpreteren als:
  - intervalwaarden (`INTERVAL`)
  - cumulatieve meterstanden (`CUMULATIVE_DELTA`, dan wordt per stap een delta genomen)
- negatieve deltas en outliers worden afgehandeld volgens regels

Bron:
- `lib/normalization.ts::normalizeConsumptionSeries`

### 3.2 Opbouw van `ProcessedInterval`
Daarna maakt de app per rij een `ProcessedInterval`:
- `consumptionKw = consumptionKwh / 0.25`
- `excessKw = max(0, consumptionKw - contractedPowerKw)`
- `excessKwh = excessKw * 0.25`

Aanname:
- 15 minuten = 0.25 uur

Bron:
- `lib/calculations.ts::processIntervals`

---

## 4) Contract / limiet
Er zijn 2 plekken waar de contractgrens terugkomt:

1. In preprocessing (direct van gebruiker):
- `contractedPowerKw` wordt gebruikt voor `excessKw`.

2. In simulatie (afgeleid uit data):
- `contractKw = max(consumptionKw - excessKw)` over alle intervallen.
- Dit is in praktijk de effectieve contractlijn die de simulatie gebruikt.

Headroom (ruimte om te laden) per interval:
- `headroomKw = max(0, contractKw - consumptionKw)`

Bron:
- `lib/calculations.ts::processIntervals`
- `lib/simulation.ts::simulateSingleScenario`

---

## 5) Scenario-simulatie (laden/ontladen)
Per scenario (batterijcapaciteit) loopt de app door alle intervallen.

### 5.1 Beginwaarden
- `soc` (state of charge) start op `batteryCapacityKwh * initialSocRatio`
- `chargeEfficiency = 0.95`
- ontlaadlimiet gebruikt `powerCapKw` (zoals geconfigureerd)
- laadlimiet gebruikt aparte mapping via `getMaxChargeKw(capacityKwh)`

Bron:
- `lib/simulation.ts::simulateSingleScenario`
- `lib/simulation.ts::getMaxChargeKw`

### 5.2 Volgorde binnen 1 interval
1. Eerst laden (met headroom onder contract)
2. Daarna, als er excess is, ontladen om die excess te reduceren

### 5.3 Laden (15 min)
Formules:
- `headroomKw = max(0, contractKw - consumptionKw)`
- `maxChargeKw = getMaxChargeKw(batteryCapacityKwh)`
- `actualChargeKw = min(headroomKw, maxChargeKw)`
- `chargeKwh = actualChargeKw * 0.25 * 0.95`
- `soc = min(capacityKwh, soc + chargeKwh)`

### 5.4 Ontladen (15 min)
Alleen als `excessKw > 0`:
- `dischargeNeedKwh = min(excessKw, powerCapKw) * 0.25`
- `deliveredKwh = min(dischargeNeedKwh, soc)`
- `soc = soc - deliveredKwh`
- `shavedKw = deliveredKwh / 0.25`
- `remainingExcessKw = excessKw - shavedKw`

SOC-grenzen:
- nooit onder 0 (door `min(..., soc)` bij ontladen)
- nooit boven capaciteit (door `min(capacity, soc + chargeKwh)` bij laden)

Bron:
- `lib/simulation.ts::simulateSingleScenario`

---

## 6) Metrics / tabelwaarden
De tabel “Multi-battery scenario comparison” en grafiekwaarden komen uit `ScenarioResult`.

### Voor kWh (`exceedanceEnergyKwhBefore`)
Totale overschrijdingsenergie vóór batterij:
- som van `excessKwh` over intervallen met excess

### Na kWh (`exceedanceEnergyKwhAfter`)
Totale overschrijdingsenergie na batterij:
- som van `remainingExcessKw * 0.25`

### Dataset compliance (`achievedComplianceDataset`)
- als `before == 0` -> `1`
- anders: `1 - (after / before)`

### Dagelijkse gemiddelde naleving (`achievedComplianceDailyAverage`)
- per dag: `1 - (afterDay / beforeDay)` (of 1 als `beforeDay == 0`)
- daarna gemiddelde over alle dagen

### Max remaining excess kW (`maxRemainingExcessKw`)
- hoogste resterende overschrijding na batterij over alle intervallen

Bronnen:
- `lib/simulation.ts::simulateSingleScenario`
- `components/ScenarioTable.tsx`
- `components/ScenarioCharts.tsx`

---

## 7) Hoe scenario-opties worden gegenereerd
De app maakt een compacte, relevante lijst van scenario’s:

1. Fixed opties:
- 64, 96, 261, 2090, 5015 kWh

2. Modulaire opties rond target (`targetKwh`):
- per basisgrootte (64/96/261) worden veelvouden dicht bij target gemaakt
- dichtheid op basis van afstand `|capacity - target|`

3. Deduplicatie:
- dubbele `capacityKwh` wordt verwijderd

4. Compact maken (ongeveer 8-12):
- relevantste opties blijven
- 2090 en 5015 blijven altijd in beeld

Bronnen:
- `lib/simulation.ts::generateNearbyModularOptions`
- `lib/simulation.ts::generateScenarioOptions`
- `lib/simulation.ts::simulateAllScenarios`

---

## 8) Adviesselectie (“beste” optie)
Belangrijk: in deze app zijn er 2 verschillende “selecties”:

### 8.1 Sizing-advies (wat als “Recommended” wordt getoond)
De aanbevolen batterij in de Recommendation-sectie komt uit `computeSizing`.

Stap 1: benodigde energie/vermogen bepalen (afhankelijk van methode):
- `MAX_PEAK`: zwaarste piekevent
- `P95`: 95e percentiel (of fallback naar max bij weinig events)
- `FULL_COVERAGE`: zwaarste dag

Stap 2: compliance toepassen:
- `kWhNeededRaw *= compliance`
- `kWNeededRaw *= compliance`

Stap 3: safety/efficiency:
- `kWhNeeded = (kWhNeededRaw / efficiency) * safetyFactor`
- `kWNeeded = kWNeededRaw * safetyFactor`

Stap 4: productkeuze met kostenselectie:
- `selectMinimumCostBatteryOptions(kWhNeeded)`
- sorteert op:
  1. laagste prijs
  2. laagste overcapaciteit
  3. laagste totale capaciteit
- 1e = `recommendedProduct`, 2e = `alternativeProduct`

Bronnen:
- `lib/calculations.ts::computeSizing`
- `lib/calculations.ts::selectMinimumCostBatteryOptions`
- `app/page.tsx` (Recommendation-blok)

### 8.2 Scenario-highlight in tabel/grafieken
De scenario-tabel markeert rijen op `scenario.capacityKwh === recommendedCapacityKwh`.
Dat is dus een koppeling op capaciteit met het sizing-advies, niet een aparte “beste op compliance”-optimalisatie.

Bron:
- `components/ScenarioTable.tsx`

---

## 9) Edge cases
### Geen overschrijding
- `exceedanceEnergyKwhBefore = 0`
- compliance wordt `1` (100%)
- batterij heeft dan in praktijk weinig te doen

### SOC leeg
- ontladen wordt begrensd op beschikbare SOC
- resterende excess blijft staan

### Headroom = 0
- er wordt niet geladen in dat interval

### Ongeldige/ruisdata
- ongeldige rijen vallen weg
- outliers kunnen worden uitgesloten
- negatieve cumulatieve deltas kunnen op 0 gezet worden

Bronnen:
- `lib/simulation.ts::simulateSingleScenario`
- `lib/normalization.ts::normalizeConsumptionSeries`

---

## 10) Bronverwijzing naar code (samenvatting)
Belangrijkste codepaden voor het advies:
- Input/parsing:
  - `lib/parsing.ts::parseCsv`, `parseXlsx`, `mapRows`
- Normalisatie:
  - `lib/normalization.ts::normalizeConsumptionSeries`
- Verbruik/excess/events/sizing:
  - `lib/calculations.ts::processIntervals`
  - `lib/calculations.ts::groupPeakEvents`
  - `lib/calculations.ts::computeSizing`
  - `lib/calculations.ts::selectMinimumCostBatteryOptions`
- Scenario-simulatie:
  - `lib/simulation.ts::generateScenarioOptions`
  - `lib/simulation.ts::simulateAllScenarios`
  - `lib/simulation.ts::simulateSingleScenario`
  - `lib/simulation.ts::getMaxChargeKw`
- UI-opbouw + eindadvies:
  - `app/page.tsx::runAnalysis`
  - `components/KpiCards.tsx`
  - `components/ScenarioTable.tsx`
  - `components/ScenarioCharts.tsx`
  - `components/Charts.tsx`

Let op over bestandsnaam:
- In deze codebase staat de scenario-logica in `lib/simulation.ts` (niet in `lib/scenarios.ts`).

---

## Hoe te verifiëren
1. Start de app en ga naar de hoofdpagina (`app/page.tsx`, via `npm run dev`).
2. Upload een kwartierdataset (CSV/XLSX) met duidelijke pieken boven contractvermogen.
3. Zet contractvermogen bijvoorbeeld op 500 kW en klik **Analyze**.
4. Controleer:
- KPI’s (`kWh needed`, `kW needed`, `Recommended`)
- Scenario-tabel:
  - `Before kWh`, `After kWh`
  - `Dataset compliance`, `Daily avg compliance`
  - `Remaining max kW`
- Grafieken:
  - “Exceedance energy before/after” met scenario-labels
  - “Highest peak day overlay” met Original vs Shaved en contractlijn
5. Verwachting:
- `After kWh <= Before kWh`
- compliance tussen 0% en 100%
- aanbevolen optie in Recommendation komt overeen met sizing-logica (kostenselectie op benodigde kWh)

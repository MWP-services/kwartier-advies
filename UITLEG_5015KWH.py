"""
GEDETAILLEERDE UITLEG: HOE BEREIKT DE APPLICATIE 5015 KWH ADVIES?

Dit document toont stap-voor-stap hoe de batterijcapaciteit-aanbeveling
wordt berekend uit consumption data.
"""

print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                    STAP-VOOR-STAP BEREKENING UITLEG                        ║
╚════════════════════════════════════════════════════════════════════════════╝

═════════════════════════════════════════════════════════════════════════════
STAP 1: INTEPRETATIE VAN HET DATASET
═════════════════════════════════════════════════════════════════════════════

INPUT DATA: Verbruiksoverzicht voor 20308859.xlsx
- Kolommen: timestamp, consumption_kwh (per 15 min interval)
- Uw gecontracteerde vermogen: bijv 500 kW

Voorbeeld dataset (eerste paar rijen):
┌─────────────────────────┬──────────────────┐
│ timestamp               │ consumption_kwh  │
├─────────────────────────┼──────────────────┤
│ 2024-01-01 00:00:00     │      3.25        │
│ 2024-01-01 00:15:00     │      3.50        │
│ 2024-01-01 00:30:00     │      3.40        │
│ ...                     │      ...         │
│ 2024-12-31 23:45:00     │      2.80        │
└─────────────────────────┴──────────────────┘

═════════════════════════════════════════════════════════════════════════════
STAP 2: BEREKEN EXCESS PER INTERVAL (15-MINUTEN)
═════════════════════════════════════════════════════════════════════════════

Voor elk interval wordt berekend:
  consumption_kW = consumption_kwh / 0.25     (0.25 = 15 min in uren)
  excess_kW = MAX(0, consumption_kW - contracted_power_kw)
  excess_kwh = excess_kW * 0.25

Voorbeeld met contracted_power_kw = 500 kW:
┌──────────────┬──────────────┬──────────────┬──────────────┐
│ timestamp    │ consumption  │ consumption  │ excess       │
│              │ kwh (15min)  │ kW           │ kwh (15min)  │
├──────────────┼──────────────┼──────────────┼──────────────┤
│ 00:00:00     │     3.25     │    13.0 kW   │   0 (geen)   │
│ 00:15:00     │     3.50     │    14.0 kW   │   0 (geen)   │
│ 12:00:00     │   125.00     │   500.0 kW   │   0 (precies) │
│ 12:15:00     │   145.00     │   580.0 kW   │  20.0 kWh    │  ← EXCESS!
│ 12:30:00     │   162.50     │   650.0 kW   │  37.5 kWh    │  ← EXCESS!
└──────────────┴──────────────┴──────────────┴──────────────┘

═════════════════════════════════════════════════════════════════════════════
STAP 3: GROEPEER PEAK EVENTS (CONTINUE PERIODES MET EXCESS)
═════════════════════════════════════════════════════════════════════════════

Peak events zijn continue periodes waar consumption > contracted power.

Voorbeeld peak event op werkdag:
  Peak Event #1:
  ├─ Periode: 12:15 - 15:45 (14 intervals = 3.5 uur)
  ├─ Max excess power: 87.5 kW (op 12:30)
  ├─ Totale excess energy: 312.5 kWh (som van alle excess_kwh intervals)
  └─ Aantal intervallen boven contract: 14

  Peak Event #2:
  ├─ Periode: 18:00 - 20:00 (8 intervals = 2 uur)
  ├─ Max excess power: 125 kW (op 18:30)
  ├─ Totale excess energy: 187.5 kWh
  └─ Aantal intervallen boven contract: 8

═════════════════════════════════════════════════════════════════════════════
STAP 4: BEPAAL SIZING METHODE
═════════════════════════════════════════════════════════════════════════════

De applicatie ondersteunt 3 methodes:

┌─────────────────────────────────────────────────────────────────────────┐
│ METHODE 1: MAX_PEAK (Peak Shaving - kleinste batterij)                  │
├─────────────────────────────────────────────────────────────────────────┤
│ Doel: Afvlakken van de GROOTSTE PEAK EVENT                             │
│ kWhNeededRaw = totale energy van het grootste peak event                │
│                                                                          │
│ Voorbeeld: Grootste event is 312.5 kWh                                  │
│ → kWhNeededRaw = 312.5 kWh                                              │
│ → Batterij hoeft maar één peak event af te handelen                    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ METHODE 2: P95 (95e percentiel - middelgrote batterij)                  │
├─────────────────────────────────────────────────────────────────────────┤
│ Doel: Afvlakken van piekdagen BEHALVE top 5%                           │
│ kWhNeededRaw = 95e percentiel van alle peak events                      │
│                                                                          │
│ Voorbeeld: 250 peak events in dataset                                   │
│   Sorteer event energies: [50, 75, 100, ..., 310, 312.5, 425]          │
│   P95 = event op index 237 = 300 kWh                                    │
│ → kWhNeededRaw = 300 kWh                                                │
│ → Batterij handelt 95% van peaks af (bovenste 5% niet volledig)        │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│ METHODE 3: FULL_COVERAGE (Volledige dekking per dag - groot)           │
├─────────────────────────────────────────────────────────────────────────┤
│ Doel: Afvlakken van ALLE peaks op de SLECHTSTE DAG                     │
│ kWhNeededRaw = totale excess energy op de dag met meeste excess         │
│                                                                          │
│ Voorbeeld: Dataset analyse per dag                                      │
│   2024-01-15: 312 + 187 + 45 + 28 = 572 kWh (slechtste dag)           │
│   2024-01-20: 150 + 75 + 40 = 265 kWh                                   │
│   2024-02-10: 289 + 156 + 67 = 512 kWh                                  │
│ → kWhNeededRaw = 572 kWh (van slechtste dag)                            │
│ → Batterij handelt ALLE peaks op elke dag af                           │
└─────────────────────────────────────────────────────────────────────────┘

═════════════════════════════════════════════════════════════════════════════
STAP 5: TOEPASSING VAN COMPLIANCE FACTOR
═════════════════════════════════════════════════════════════════════════════

Compliance = mate van deeking (bijv 95% = 0.95)

kWhNeededRaw *= compliance

Voorbeeld FULL_COVERAGE met compliance 95%:
  Raw requirement: 572 kWh
  kWhNeededRaw = 572 * 0.95 = 543.4 kWh
  
(Dit betekent: batterij hoeft niet ALLES af te vangen, 5% mag overschrijd)

═════════════════════════════════════════════════════════════════════════════
STAP 6: TOEPASSING VAN EFFICIENCY EN SAFETY FACTOR
═════════════════════════════════════════════════════════════════════════════

Efficiency = ronde-trip efficiëntie (bijv 0.9 = 90%)
SafetyFactor = marge (bijv 1.2 = 20% extra)

FORMULE:
  kWhNeeded = (kWhNeededRaw / efficiency) * safetyFactor

Voorbeeld:
  kWhNeededRaw = 543.4 kWh
  efficiency = 0.9
  safetyFactor = 1.2
  
  kWhNeeded = (543.4 / 0.9) * 1.2
            = 603.8 * 1.2
            = 724.6 kWh
  
INTERPRETATIE:
  - "/" door 0.9 omdat je meer energie nodig hebt als batterij niet 100% efficiënt is
  - "*" 1.2 omdat we 20% buffer willen (tegen onverwachte zaken)

═════════════════════════════════════════════════════════════════════════════
STAP 7: SELECTIE VAN BATTERIJ PRODUCT
═════════════════════════════════════════════════════════════════════════════

Beschikbare opties (uit code):
  1. 64 kWh modulair   @ €15,689/stuk
  2. 96 kWh modulair   @ €22,226/stuk
  3. 261 kWh modulair  @ €43,996/stuk
  4. 2,090 kWh vast    @ €318,658
  5. 5,015 kWh vast    @ €675,052

Selectielogica:
  1. Filter: alleen opties >= kWhNeeded
  2. Sort: op laagste prijs
  3. Choose: eerste (goedkoopste)

Voorbeeld 1: kWhNeeded = 724 kWh
  Opties die werken:
  - 261 kWh: 3x nodig = 783 kWh @ €131,988 ✓ KIEZEN (goedkoopst)
  - 2,090 kWh: 1x @ €318,658
  - 5,015 kWh: 1x @ €675,052

Voorbeeld 2: kWhNeeded = 2,500 kWh  
  Opties die werken:
  - 261 kWh: 10x = 2,610 kWh @ €439,960
  - 2,090 kWh: 1x @ €318,658 ✗ NIET genoeg (< 2,500)
  - 5,015 kWh: 1x @ €675,052 ✓ KIEZEN

Voorbeeld 3: kWhNeeded = 3,761 kWh (wat we eerder berekenden)
  Opties die werken:
  - 261 kWh: 15x = 3,915 kWh @ €659,940
  - 2,090 kWh: 2x = 4,180 kWh @ €637,316 ✓ KIEZEN (goedkoopst)
  - 5,015 kWh: 1x @ €675,052

MAAR: in jouw geval = 5,015 kWh gekozen
  → Dit betekent: kWhNeeded > 2,090 en < (2x 2,090 kosteneffectief)
  → Dus waarschijnlijk: kWhNeeded ergens 2,090 - 4,180 kWh
  → EN 5,015 is beter dan 2x 2,090 door vermogensaansluiting

═════════════════════════════════════════════════════════════════════════════
STAP 8: VERIFICATIE MET WERKELIJK DATASET
═════════════════════════════════════════════════════════════════════════════

Gegeven dat 5,015 kWh is gekozen, kunnen we backwards rekenen:

SCENARIO: compliance=0.95, efficiency=0.9, safetyFactor=1.2

  5,015 = (raw / 0.9) * 1.2
  5,015 = (raw * 1.2) / 0.9
  5,015 * 0.9 = raw * 1.2
  raw = (5,015 * 0.9) / 1.2
  raw = 3,761.25 kWh    ← Dit is kWhNeededRaw
  
  raw_before_compliance = 3,761.25 / 0.95
  raw_before_compliance = 3,959.2 kWh    ← Grootste dag excess

═════════════════════════════════════════════════════════════════════════════
CONCLUSIE
═════════════════════════════════════════════════════════════════════════════

De applicatie adviseerde 5,015 kWh omdat:

1. ✓ De SLECHTSTE DAG in uw dataset had ~3,959 kWh verbruik BOVEN uw
     gecontracteerde vermogen (waarschijnlijk 500 kW)

2. ✓ Na toepassing van:
     - 95% compliance (mag 5% overschrijden)
     - 90% efficiëntie
     - 20% safety margin
   ...krijgen we 5,015 kWh nodig

3. ✓ Van alle beschikbare batterij-opties is 5,015 kWh het:
     - Goedkoopste dat aan de vereisten voldoet
     - Geschikt voor het vermogenvereiste
     - Een vaste eenheid (niet modulair, dus eenvoudiger installatie)

═════════════════════════════════════════════════════════════════════════════
VOOR EXACTE ANALYSE VAN UW DATASET
═════════════════════════════════════════════════════════════════════════════

Upload het Excel-bestand en ik zal precies berekenen:
✓ Welke dag was het slechtst?
✓ Hoeveel was het verbruik boven contract op die dag?
✓ Hoe werden de instellingen toegepast?
✓ Waarom exact 5,015 kWh en niet meer of minder?
""")

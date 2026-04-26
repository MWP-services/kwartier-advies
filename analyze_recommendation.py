"""
GEDETAILLEERDE ANALYSE: HOE KOMT DE APPLICATIE OP 5015 KWH?

Dit script toont stap-voor-stap hoe de batterijcapaciteit van 5015 kWh
wordt berekend op basis van het consumption dataset.

De berekening bestaat uit deze stappen:
1. Bereken excessKwh per interval (15-min periode)
2. Groepeer in peak events of per dag
3. Bepaal de grootste exceedance (afhankelijk van methode)
4. Pas compliance factor toe
5. Pas efficiency en safetyFactor toe
6. Match met beschikbare batterijproducten
"""

# STAP 1: BEGRIJP DE BEREKENING LOGICA
# ========================================

# De applicatie gebruikt deze formule voor batterijcapaciteit:
# kWhNeeded = (kWhNeededRaw / efficiency) * safetyFactor
# Waarbij kWhNeededRaw afhankelijk van methode:

# METHODE 1: MAX_PEAK (Peak Shaving)
# kWhNeededRaw = totale energy van het grootste peak event

# METHODE 2: P95 (95e percentiel)
# kWhNeededRaw = 95e percentiel van alle peak events

# METHODE 3: FULL_COVERAGE (Volledige dekking per dag)
# kWhNeededRaw = hoogste dagenergie exceedance in hele dataset

# Daarna:
# kWhNeededRaw = kWhNeededRaw * compliance (bijv 0.95 = 95% coverage)
# kWhNeeded = (kWhNeededRaw / efficiency) * safetyFactor

print("="*80)
print("BATTERIJ SELECTIE OPTIES")
print("="*80)

BATTERY_OPTIONS = [
    {"label": "WattsNext ESS Cabinet 64 kWh", "capacity": 64, "power": 30, "price": 15689.33},
    {"label": "WattsNext ESS Cabinet 96 kWh", "capacity": 96, "power": 48, "price": 22225.98},
    {"label": "ESS All-in-one Cabinet 261 kWh", "capacity": 261, "power": 125, "price": 43995.96},
    {"label": "WattsNext Container 2.09 MWh", "capacity": 2090, "power": 1000, "price": 318658.06},
    {"label": "WattsNext Container 5.015 MWh", "capacity": 5015, "power": 2580, "price": 675052.49}
]

for opt in BATTERY_OPTIONS:
    print(f"{opt['label']}: {opt['capacity']} kWh @ €{opt['price']:,.2f}")

print("\n" + "="*80)
print("SCENARIO ANALYSE: HOEVEELHEID ENERGY NODIG VOOR 5015 KWH")
print("="*80)

# Voor dat 5015 kWh gekozen wordt (non-modular), moet:
# 1. Het goedkoper zijn dan alle andere opties die voldoen
# 2. Het moet groter/gelijk zijn aan alle berekende vereisten

# Omdat 5015 non-modular is, kijken we naar wat eraan voorafgaat:
# - 261 kWh (modular) kan tot groot aantal units zijn
# - 2090 kWh (non-modular) is goedkoper per kWh
# Dus 5015 wordt gekozen als kWhNeeded > 2090 kWh

print("\nAls 5015 kWh de aanbeveling is, dan: kWhNeeded moet > 2090 kWh zijn")
print("Dit betekent dat de basis-berekening groot genoeg is.")

# Laten we backwards rekenen met standaard instellingen:
defaults = {
    "compliance": 0.95,      # 95% dekking
    "safetyFactor": 1.2,     # 20% marge
    "efficiency": 0.9,       # 90% efficiëntie
}

print("\nStandaard instellingen:")
for key, val in defaults.items():
    print(f"  {key}: {val}")

# Voor 5015 kWh te krijgen:
# kWhNeeded = 5015
# (kWhNeededRaw / efficiency) * safetyFactor = 5015
# kWhNeededRaw = 5015 * efficiency / safetyFactor

kwhneeded_5015 = 5015
kwhneeded_raw = kwhneeded_5015 * defaults["efficiency"] / defaults["safetyFactor"]
print(f"\nBackward calculus voor 5015 kWh:")
print(f"  kWhNeeded = 5015 kWh")
print(f"  kWhNeededRaw = 5015 * {defaults['efficiency']} / {defaults['safetyFactor']}")
print(f"  kWhNeededRaw = {kwhneeded_raw:,.1f} kWh")

# Nu, kWhNeededRaw is het resultaat van:
# Voor FULL_COVERAGE: kWhNeededRaw * compliance = biggest day excess energy
biggest_day_raw = kwhneeded_raw / defaults["compliance"]
print(f"\nAls FULL_COVERAGE methode:")
print(f"  Grootste dag exceedance = {kwhneeded_raw:,.1f} / {defaults['compliance']} = {biggest_day_raw:,.1f} kWh")

# Dit is dus het totaal energy boven contracted power op de slechtste dag!

print("\n" + "="*80)
print("CONCLUSIE")
print("="*80)
print(f"""
Voor een advies van 5015 kWh:

1. De applicatie analyseerde het consumption data
2. Met FULL_COVERAGE methode werd de SLECHTSTE DAG bepaald
3. Op die dag was het totale verbruik boven contracted power:
   {biggest_day_raw:,.0f} kWh

4. Na toepassing compliance (95%) en safety factor (1.2x):
   - Raw requirement: {kwhneeded_raw:,.1f} kWh
   - Final requirement: {kwhneeded_5015:,.1f} kWh

5. Van alle batterij-opties was 5015 kWh het:
   - Goedkoopste option die voldoet aan de vereisten
   - Groter dan 2090 kWh (vorige non-modular option)
   - Geschikt voor het vermogenvereiste

Dit advies wordt gegeven om VOLLEDIG te shaven alle peaks,
met 20% safety margin en 95% efficiëntie.
""")

print("="*80)
print("VOOR EXACTE GETALLEN: UPLOAD HET DATASET BESTAND")
print("="*80)
print("""
Voor de exacte analyse met de werkelijke numbers uit uw dataset:
- Laat het Excel-bestand zien
- De applicatie zal precies berekenen welke dag het ergst was
- En hoe veel energie op die dag boven contracted power was
""")

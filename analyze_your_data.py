"""
FORENSIC ANALYSIS SCRIPT
Voer dit uit met jouw Excel-bestand om EXACT te zien waarom 5015 kWh wordt adviseerd.

GEBRUIK:
  python analyze_your_data.py "pad/naar/jouw/Verbruiksoverzicht voor 20308859.xlsx"
"""

import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime

try:
    import openpyxl
except ImportError:
    print("Error: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)


def analyze_consumption_data(excel_path, contracted_power_kw=500):
    """Analyze consumption data and show exact 5015 kWh calculation"""
    
    print("="*80)
    print("FORENSIC ANALYSIS: WAAROM 5015 KWH?")
    print("="*80)
    
    # Load Excel file
    print(f"\n📂 Laad bestand: {excel_path}")
    try:
        wb = openpyxl.load_workbook(excel_path, data_only=True)
        ws = wb.active
        print(f"   Sheet: {ws.title}")
    except Exception as e:
        print(f"Error: {e}")
        return
    
    # Read data
    rows = list(ws.iter_rows(values_only=True))
    
    if not rows or len(rows) < 2:
        print("Error: Bestand bevat geen data")
        return
    
    headers = rows[0]
    print(f"   Kolommen: {headers}")
    
    # Find timestamp and consumption columns
    timestamp_col = None
    consumption_col = None
    
    for i, header in enumerate(headers):
        if header and any(x in str(header).lower() for x in ['timestamp', 'time', 'datum', 'date']):
            timestamp_col = i
        if header and any(x in str(header).lower() for x in ['consumption', 'verbruik', 'kwh']):
            consumption_col = i
    
    if timestamp_col is None or consumption_col is None:
        print("Error: Kan timestamp of consumption kolom niet vinden")
        print(f"  Headers gevonden: {headers}")
        return
    
    print(f"   Timestamp kolom: {headers[timestamp_col]}")
    print(f"   Consumption kolom: {headers[consumption_col]}")
    
    # Process intervals
    print("\n" + "="*80)
    print("📊 DATA PROCESSING")
    print("="*80)
    
    intervals = []
    days_excess = defaultdict(float)  # per dag
    peak_events = []
    current_event = None
    
    for row_idx, row in enumerate(rows[1:], start=2):
        try:
            timestamp_val = row[timestamp_col]
            consumption_kwh = float(row[consumption_col])
            
            if not timestamp_val:
                continue
            
            # Parse timestamp
            if isinstance(timestamp_val, datetime):
                ts = timestamp_val
            else:
                ts = datetime.fromisoformat(str(timestamp_val).strip())
            
            # Calculate values
            consumption_kw = consumption_kwh / 0.25  # 15 min = 0.25 hours
            excess_kw = max(0, consumption_kw - contracted_power_kw)
            excess_kwh = excess_kw * 0.25
            
            day_key = ts.date()
            days_excess[day_key] += excess_kwh
            
            # Track peak events
            if excess_kw > 0:
                if current_event is None or \
                   (current_event[-1] - ts).total_seconds() > 900:  # > 15 min gap
                    if current_event:
                        peak_events.append(current_event)
                    current_event = {
                        'start': ts,
                        'end': ts,
                        'max_kw': excess_kw,
                        'total_kwh': excess_kwh,
                        'intervals': 1
                    }
                else:
                    current_event['end'] = ts
                    current_event['max_kw'] = max(current_event['max_kw'], excess_kw)
                    current_event['total_kwh'] += excess_kwh
                    current_event['intervals'] += 1
            
            intervals.append({
                'timestamp': ts,
                'consumption_kwh': consumption_kwh,
                'consumption_kw': consumption_kw,
                'excess_kwh': excess_kwh,
                'excess_kw': excess_kw
            })
            
        except Exception as e:
            print(f"  ⚠️  Rij {row_idx}: Kan niet parseren - {e}")
            continue
    
    if current_event:
        peak_events.append(current_event)
    
    # Summary
    print(f"\n✓ {len(intervals)} intervals gelezen")
    print(f"✓ {len(peak_events)} peak events gevonden")
    print(f"✓ {len(days_excess)} unieke dagen")
    
    # Find worst day
    print("\n" + "="*80)
    print("📈 ANALYSE: SLECHTSTE DAG")
    print("="*80)
    
    worst_day = max(days_excess.items(), key=lambda x: x[1])
    worst_day_date, worst_day_excess = worst_day
    
    print(f"\nSlechtste dag: {worst_day_date}")
    print(f"Totale excess op die dag: {worst_day_excess:,.1f} kWh")
    
    # Show top 5 days
    print("\nTop 5 slechtste dagen:")
    for i, (day, excess) in enumerate(sorted(days_excess.items(), 
                                              key=lambda x: x[1], 
                                              reverse=True)[:5], 1):
        print(f"  {i}. {day}: {excess:,.1f} kWh")
    
    # Show top 5 peak events
    print("\nTop 5 grootste peak events:")
    for i, event in enumerate(sorted(peak_events, 
                                      key=lambda x: x['total_kwh'], 
                                      reverse=True)[:5], 1):
        print(f"  {i}. {event['start']} -> {event['end']}")
        print(f"     Duration: {event['intervals']} intervals = {event['intervals']*0.25:.2f} uur")
        print(f"     Max power: {event['max_kw']:.1f} kW")
        print(f"     Total energy: {event['total_kwh']:.1f} kWh")
    
    # Calculate sizing
    print("\n" + "="*80)
    print("🔋 BATTERIJ SIZING BEREKENING")
    print("="*80)
    
    # Assuming FULL_COVERAGE method with standard settings
    compliance = 0.95
    efficiency = 0.9
    safety_factor = 1.2
    
    print(f"\nInstellingen:")
    print(f"  Method: FULL_COVERAGE")
    print(f"  Compliance: {compliance*100:.0f}%")
    print(f"  Efficiency: {efficiency*100:.0f}%")
    print(f"  Safety Factor: {safety_factor:.1f}x")
    
    kwh_raw = worst_day_excess * compliance
    kwh_needed = (kwh_raw / efficiency) * safety_factor
    
    print(f"\nBerekening:")
    print(f"  1. Grootste dag excess: {worst_day_excess:,.1f} kWh")
    print(f"  2. × Compliance ({compliance}): {kwh_raw:,.1f} kWh")
    print(f"  3. ÷ Efficiency ({efficiency}): {kwh_raw/efficiency:,.1f} kWh")
    print(f"  4. × Safety Factor ({safety_factor}): {kwh_needed:,.1f} kWh")
    print(f"\n  ➜ TOTAAL NODIG: {kwh_needed:,.1f} kWh")
    
    # Match with available batteries
    print("\n" + "="*80)
    print("🏭 BATTERIJ SELECTIE")
    print("="*80)
    
    batteries = [
        (64, 30, 15689.33),
        (96, 48, 22225.98),
        (261, 125, 43995.96),
        (2090, 1000, 318658.06),
        (5015, 2580, 675052.49)
    ]
    
    print(f"\nVereiste capaciteit: {kwh_needed:,.1f} kWh")
    print("\nBeschikbare opties:")
    
    suitable = []
    for capacity, power, price in batteries:
        if capacity >= kwh_needed:
            suitable.append((capacity, power, price))
            status = "✓"
        else:
            status = "✗"
        print(f"  {status} {capacity:5.0f} kWh @ €{price:>10,.2f}")
    
    if suitable:
        best = min(suitable, key=lambda x: x[2])
        print(f"\n✅ AANBEVELING: {best[0]:,.0f} kWh @ €{best[2]:,.2f}")
        if best[0] == 5015:
            print("   Dit is exact wat uw applicatie adviseerde!")
    
    print("\n" + "="*80)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("GEBRUIK:")
        print("  python analyze_your_data.py <pad/naar/excel-bestand.xlsx> [contracted_power_kw]")
        print("\nVoorbeeld:")
        print("  python analyze_your_data.py 'Verbruiksoverzicht voor 20308859.xlsx' 500")
        sys.exit(1)
    
    excel_file = sys.argv[1]
    contracted_power = float(sys.argv[2]) if len(sys.argv) > 2 else 500
    
    if not Path(excel_file).exists():
        print(f"Error: Bestand niet gevonden: {excel_file}")
        sys.exit(1)
    
    analyze_consumption_data(excel_file, contracted_power)

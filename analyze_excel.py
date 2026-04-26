#!/usr/bin/env python3
import openpyxl
import sys
from pathlib import Path

# Read the Excel file
excel_path = r"c:\Users\Micha\AppData\Roaming\Microsoft\Windows\Recent Items\Verbruiksoverzicht voor 20308859.xlsx"

try:
    wb = openpyxl.load_workbook(excel_path)
    ws = wb.active
    
    print("="*80)
    print("EXCEL FILE ANALYSIS")
    print("="*80)
    print(f"Sheet name: {ws.title}")
    print(f"Dimensions: {ws.dimensions}")
    
    # Get all data
    rows = []
    for row in ws.iter_rows(values_only=True):
        rows.append(row)
    
    print(f"\nTotal rows: {len(rows)}")
    if rows:
        print(f"Columns: {rows[0]}")
        print("\n" + "="*80)
        print("First 15 rows:")
        print("="*80)
        for i, row in enumerate(rows[:15]):
            print(f"Row {i}: {row}")
    
    # Analyze numeric columns
    if len(rows) > 1:
        print("\n" + "="*80)
        print("Data Analysis:")
        print("="*80)
        
        # Try to find consumption columns
        headers = rows[0]
        for col_idx, header in enumerate(headers if headers else []):
            if header:
                print(f"\nColumn {col_idx}: {header}")
                values = []
                for row in rows[1:]:
                    if col_idx < len(row) and row[col_idx] is not None:
                        try:
                            val = float(row[col_idx])
                            values.append(val)
                        except:
                            pass
                if values:
                    print(f"  Count: {len(values)}")
                    print(f"  Min: {min(values):.2f}")
                    print(f"  Max: {max(values):.2f}")
                    print(f"  Sum: {sum(values):.2f}")
                    print(f"  Avg: {sum(values)/len(values):.2f}")

except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)

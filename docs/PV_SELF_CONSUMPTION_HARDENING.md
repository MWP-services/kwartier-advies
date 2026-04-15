# PV Self-Consumption Hardening

## What was wrong

- PV datasets with only `export_kwh` were treated as if total PV generation was known.
- Normalization only focused on `consumption_kwh`, so cumulative `pv_kwh` and `export_kwh` could be misread.
- PV sizing used a rough shortcut that could diverge from the actual scenario simulation.
- UI and report output could show misleading self-consumption metrics when `pv_kwh` was absent.

## What changed

- Added explicit PV analysis modes:
  - `FULL_PV`: `consumption_kwh` + `pv_kwh` required, optional `export_kwh`
  - `EXPORT_ONLY`: `consumption_kwh` + `export_kwh` required
- Introduced shared PV simulation helpers in `lib/pvSimulation.ts` so sizing and scenarios now use the same 15-minute physical battery logic.
- Reworked normalization to interpret `consumption_kwh`, `pv_kwh`, and `export_kwh` per series, including cumulative delta handling.
- Expanded column autodetection for Dutch/English header variants and more tolerant numeric parsing.
- Updated UI/reporting to show limited KPIs and warnings in `EXPORT_ONLY` mode instead of fabricating full-PV metrics.

## Assumptions

- Input data is intended for 15-minute intervals.
- In `EXPORT_ONLY` mode, `export_kwh` is treated as measured surplus available to charge the battery.
- Default PV optimization still uses all usable battery capacity; trading reserves are only configuration hooks for later work.

## Remaining limitations

- `EXPORT_ONLY` mode still cannot infer total PV production or direct PV self-consumption.
- Recommendation logic is simulation-based and conservative, but it is still a heuristic rather than a market-optimized dispatch strategy.

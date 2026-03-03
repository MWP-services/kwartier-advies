'use client';

interface ComplianceSliderProps {
  compliance: number;
  onChange: (value: number) => void;
}

export function ComplianceSlider({ compliance, onChange }: ComplianceSliderProps) {
  return (
    <div className="wx-card">
      <div className="flex items-center justify-between">
        <label className="wx-title !mb-0">Compliance target</label>
        <span className="rounded-md bg-lime-50 px-2 py-1 text-sm font-semibold text-lime-800">
          {Math.round(compliance * 100)}%
        </span>
      </div>
      <input
        className="mt-3 w-full accent-lime-700"
        type="range"
        min={70}
        max={100}
        step={1}
        value={Math.round(compliance * 100)}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <p className="mt-2 text-xs text-slate-600">
        Compliance = target percentage of peak exceedance to shave.
      </p>
    </div>
  );
}

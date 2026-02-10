'use client';

interface ComplianceSliderProps {
  compliance: number;
  onChange: (value: number) => void;
}

export function ComplianceSlider({ compliance, onChange }: ComplianceSliderProps) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <label className="font-semibold">Compliance target</label>
        <span className="text-sm">{Math.round(compliance * 100)}%</span>
      </div>
      <input
        className="mt-3 w-full"
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

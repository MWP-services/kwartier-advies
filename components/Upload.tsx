'use client';

interface UploadProps {
  onFile: (file: File) => void;
}

export function Upload({ onFile }: UploadProps) {
  return (
    <div className="wx-card">
      <label className="wx-title mb-2 block text-sm font-medium">Upload CSV or XLSX</label>
      <input
        className="wx-input"
        type="file"
        accept=".csv,.xlsx"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onFile(file);
        }}
      />
    </div>
  );
}

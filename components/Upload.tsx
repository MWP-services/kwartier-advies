'use client';

interface UploadProps {
  onFile: (file: File) => void;
}

export function Upload({ onFile }: UploadProps) {
  return (
    <div className="rounded-lg border bg-white p-4 shadow-sm">
      <label className="mb-2 block text-sm font-medium">Upload CSV or XLSX</label>
      <input
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

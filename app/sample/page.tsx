'use client';

import { useState } from 'react';

export default function SamplePage() {
  const [url, setUrl] = useState<string>('');

  const generate = async () => {
    const res = await fetch('/api/sample');
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
  };

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">Sample dataset generator</h1>
      <button className="mt-4 rounded bg-blue-600 px-4 py-2 text-white" onClick={generate}>
        Generate sample CSV
      </button>
      {url && (
        <a className="ml-4 text-blue-700 underline" href={url} download="sample_peak_data.csv">
          Download sample_peak_data.csv
        </a>
      )}
    </main>
  );
}

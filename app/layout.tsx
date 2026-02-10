import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Peak Shaving Advisor MVP',
  description: 'Generate peak shaving report and battery recommendation'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

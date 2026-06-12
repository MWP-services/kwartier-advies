import type { ReactNode } from 'react';

interface ScreenProps {
  children: ReactNode;
  className?: string;
}

export function Screen({ children, className = '' }: ScreenProps) {
  return <main className={`wx-shell ${className}`.trim()}>{children}</main>;
}


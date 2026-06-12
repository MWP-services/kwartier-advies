import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  interactive?: boolean;
}

export function Card({ children, className = '', interactive = false, ...props }: CardProps) {
  return (
    <div className={`wx-card ${interactive ? 'wx-card-interactive' : ''} ${className}`.trim()} {...props}>
      {children}
    </div>
  );
}


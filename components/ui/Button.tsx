import type { ButtonHTMLAttributes, ReactNode } from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: 'wx-btn-primary',
  secondary: 'wx-btn-secondary',
  ghost: 'wx-btn-ghost',
  danger: 'wx-btn-danger'
};

export function Button({ children, variant = 'primary', loading = false, disabled, className = '', ...props }: ButtonProps) {
  return (
    <button className={`${variantClass[variant]} ${className}`.trim()} disabled={disabled || loading} {...props}>
      {loading ? 'Laden...' : children}
    </button>
  );
}


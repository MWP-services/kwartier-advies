import type { InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  errorText?: string;
}

export function Input({ label, helperText, errorText, className = '', ...props }: InputProps) {
  return (
    <label className="block text-sm text-slate-700">
      {label ? <span>{label}</span> : null}
      <input className={`wx-input ${errorText ? 'border-red-300' : ''} ${className}`.trim()} {...props} />
      {errorText ? <span className="mt-1 block text-xs text-red-700">{errorText}</span> : null}
      {!errorText && helperText ? <span className="mt-1 block text-xs text-slate-500">{helperText}</span> : null}
    </label>
  );
}


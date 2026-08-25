import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export function Input({ label, error, className = '', id, ...props }: InputProps) {
  return (
    <div className="auth-input-group flex flex-col gap-1.5">
      {label && <label htmlFor={id} className="auth-input-label text-sm font-medium text-gray-300">{label}</label>}
      <input
        id={id}
        {...props}
        className={`auth-input-field w-full px-4 py-2.5 bg-dark-800 border border-dark-600 rounded-lg text-gray-100 placeholder-gray-500 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-colors ${className}`}
      />
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

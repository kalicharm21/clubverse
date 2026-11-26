import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

export const Card: React.FC<CardProps> = ({children, className = ''}) => {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>
      {children}
    </div>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({label, error, hint, id, className = '', ...rest}, ref) => {
    const inputId = id || `input-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
          {label}
        </label>
        <input
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors ${
            error
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-200 focus:border-blue-600'
          } ${className}`}
          {...rest}
        />
        {error ? (
          <p className="text-xs font-medium text-red-600">{error}</p>
        ) : hint ? (
          <p className="text-xs text-slate-500">{hint}</p>
        ) : null}
      </div>
    );
  },
);
Input.displayName = 'Input';

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({label, error, id, className = '', ...rest}, ref) => {
    const inputId = id || `textarea-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
          {label}
        </label>
        <textarea
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 placeholder:text-slate-400 transition-colors ${
            error
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-200 focus:border-blue-600'
          } ${className}`}
          {...rest}
        />
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      </div>
    );
  },
);
Textarea.displayName = 'Textarea';

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  options: Array<{label: string; value: string}>;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({label, error, options, id, className = '', ...rest}, ref) => {
    const inputId = id || `select-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    return (
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="block text-sm font-medium text-slate-800">
          {label}
        </label>
        <select
          ref={ref}
          id={inputId}
          className={`block w-full rounded-lg border bg-white px-3.5 py-2 text-sm text-slate-900 transition-colors ${
            error
              ? 'border-red-400 focus:border-red-500'
              : 'border-slate-200 focus:border-blue-600'
          } ${className}`}
          {...rest}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs font-medium text-red-600">{error}</p>}
      </div>
    );
  },
);
Select.displayName = 'Select';

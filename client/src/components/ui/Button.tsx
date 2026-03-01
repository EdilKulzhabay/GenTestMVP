import React from 'react';

const variants: Record<'primary' | 'secondary' | 'ghost' | 'outline', string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700',
  secondary: 'bg-slate-200 text-slate-900 hover:bg-slate-300',
  ghost: 'bg-transparent text-slate-700 hover:bg-slate-100',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
};

const sizes: Record<'default' | 'lg', string> = {
  default: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base'
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'outline';
  size?: 'default' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'default',
  isLoading = false,
  className = '',
  disabled,
  children,
  ...props
}) => {
  const isDisabled = disabled || isLoading;

  return (
    <button
      {...props}
      disabled={isDisabled}
      className={`inline-flex items-center justify-center rounded-lg font-medium transition ${
        variants[variant]
      } ${sizes[size]} ${isDisabled ? 'opacity-60 cursor-not-allowed' : ''} ${className}`}
    >
      {isLoading ? 'Загрузка...' : children}
    </button>
  );
};

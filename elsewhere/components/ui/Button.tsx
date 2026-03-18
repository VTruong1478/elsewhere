'use client';

import { forwardRef } from 'react';

type ButtonVariant = 'primary' | 'secondary';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-text-inverse',
  secondary:
    'border-2 border-primary bg-transparent text-primary shadow-none',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button({ variant = 'primary', disabled, className = '', children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={`
          group relative inline-flex min-w-[44px] cursor-pointer items-center justify-center rounded-radius-md px-24 py-8 text-ui-label-l
          ${variantStyles[variant]}
          ${disabled ? 'opacity-50' : ''}
          ${className}
        `.trim()}
        {...props}
      >
        {!disabled && (
          <span
            className="pointer-events-none absolute inset-0 rounded-radius-md bg-white/15 opacity-0 group-hover:opacity-100"
            aria-hidden
          />
        )}
        <span className="relative">{children}</span>
      </button>
    );
  }
);

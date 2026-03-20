"use client";

import { forwardRef } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "secondarySurface"
  | "secondaryIcon";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  children: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", disabled, className = "", children, ...props },
    ref,
  ) {
    const isIcon = variant === "secondaryIcon";
    const sizeLayout = isIcon
      ? "h-10 w-10 min-h-10 min-w-10 max-h-10 max-w-10 p-0 box-border rounded-radius-md"
      : "min-w-[44px] px-24 py-8 text-ui-label-l";

    const variantTone =
      variant === "primary"
        ? "bg-primary text-text-inverse"
        : variant === "secondary"
          ? "border-2 border-primary bg-transparent text-primary shadow-none"
          : variant === "secondarySurface"
            ? "border-2 border-primary bg-surface text-primary"
            : "border-2 border-primary bg-surface text-primary";

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={`
          inline-flex cursor-pointer items-center justify-center
          ${isIcon ? "" : "rounded-radius-md"}
          ${sizeLayout}
          ${variantTone}
          ${className}
        `.trim()}
        {...props}
      >
        <span className="relative inline-flex items-center justify-center">
          {children}
        </span>
      </button>
    );
  },
);

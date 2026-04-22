"use client";

import { forwardRef } from "react";
import type { ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "secondarySurface"
  | "secondaryIcon"
  /** Two stacked icon hits (e.g. map zoom +/−); height of two {@link secondaryIcon} rows with a divider. */
  | "secondaryZoomStack";

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
    const iconSizeLayout =
      "h-10 w-10 min-h-10 min-w-10 max-h-10 max-w-10 p-0 box-border rounded-radius-md";

    const variantTone =
      variant === "primary"
        ? "bg-primary text-text-inverse"
        : variant === "secondary"
          ? "border-2 border-primary bg-transparent text-primary shadow-none"
          : variant === "secondarySurface"
            ? "border-2 border-primary bg-surface text-primary"
            : "border-2 border-primary bg-surface text-primary";

    if (variant === "secondaryZoomStack") {
      return (
        <div
          className={`
            inline-flex w-10 min-w-10 max-w-10 flex-col overflow-hidden rounded-radius-md
            border-2 border-primary bg-surface text-primary box-border
            ${className}
          `.trim()}
        >
          {children}
        </div>
      );
    }

    return (
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        className={`
          inline-flex cursor-pointer items-center justify-center
          ${isIcon ? "" : "rounded-radius-md"}
          ${variantTone}
          ${isIcon ? `${iconSizeLayout} ${className}` : `min-w-[44px] max-h-[36px] text-ui-label-l ${className} px-24 py-8`}
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

const zoomStackHit =
  "flex h-10 w-full shrink-0 cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-primary hover:bg-surface-alt disabled:cursor-not-allowed disabled:opacity-40";

type SecondaryZoomStackButtonProps = {
  onZoomIn: () => void;
  onZoomOut: () => void;
  zoomInDisabled?: boolean;
  zoomOutDisabled?: boolean;
  zoomInLabel?: string;
  zoomOutLabel?: string;
  className?: string;
  /** Lucide-style icons (e.g. `<Plus />`, `<Minus />`). */
  zoomInIcon: ReactNode;
  zoomOutIcon: ReactNode;
};

/**
 * Two stacked controls matching secondary icon width, with a horizontal rule between
 * (Google Maps–style manual zoom).
 */
export function SecondaryZoomStackButton({
  onZoomIn,
  onZoomOut,
  zoomInDisabled,
  zoomOutDisabled,
  zoomInLabel = "Zoom in",
  zoomOutLabel = "Zoom out",
  className = "",
  zoomInIcon,
  zoomOutIcon,
}: SecondaryZoomStackButtonProps) {
  return (
    <Button variant="secondaryZoomStack" className={className}>
      <button
        type="button"
        className={zoomStackHit}
        onClick={onZoomIn}
        disabled={zoomInDisabled}
        aria-label={zoomInLabel}
        title={zoomInLabel}
      >
        {zoomInIcon}
      </button>
      <div
        className="h-0 w-full shrink-0 border-t-2 border-primary"
        aria-hidden
      />
      <button
        type="button"
        className={zoomStackHit}
        onClick={onZoomOut}
        disabled={zoomOutDisabled}
        aria-label={zoomOutLabel}
        title={zoomOutLabel}
      >
        {zoomOutIcon}
      </button>
    </Button>
  );
}

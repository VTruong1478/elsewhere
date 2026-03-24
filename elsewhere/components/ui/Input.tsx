import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Search } from "lucide-react";

/** Shared field chrome (search bar + multiline notes). */
const fieldChrome =
  "w-full border border-surface-alt bg-surface text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent";

type SearchFieldProps = {
  variant?: "search" | undefined;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

type MultilineFieldProps = {
  variant: "multiline";
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

export type InputProps = SearchFieldProps | MultilineFieldProps;

export function Input(props: InputProps) {
  if (props.variant === "multiline") {
    const { variant, className = "", ...rest } = props;
    void variant;
    return (
      <textarea
        className={`${fieldChrome} resize-y rounded-radius-md px-12 py-12 ${className}`.trim()}
        {...rest}
      />
    );
  }

  const { className = "", ...rest } = props;
  return (
    <div className={`relative flex w-full items-center ${className}`}>
      <Search
        size={20}
        className="pointer-events-none absolute left-12 shrink-0 text-text-tertiary"
        aria-hidden
      />
      <input
        type="search"
        className={`h-[44px] ${fieldChrome} rounded-radius-sm pl-40 pr-12`}
        {...rest}
      />
    </div>
  );
}

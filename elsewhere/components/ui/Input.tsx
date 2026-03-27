import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";
import { ChevronDown, Search } from "lucide-react";

/** Shared field chrome (search bar + multiline notes). */
const fieldChrome =
  "w-full bg-surface text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent";

type SearchFieldProps = {
  variant?: "search" | undefined;
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

type FieldProps = {
  variant: "field";
  className?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "className">;

type MultilineFieldProps = {
  variant: "multiline";
  className?: string;
} & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">;

type SelectFieldProps = {
  variant: "select";
  className?: string;
  children: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "className" | "children">;

export type InputProps =
  | SearchFieldProps
  | FieldProps
  | MultilineFieldProps
  | SelectFieldProps;

export function Input(props: InputProps) {
  if (props.variant === "multiline") {
    const { variant, className = "", ...rest } = props;
    void variant;
    return (
      <textarea
        className={`${fieldChrome} resize-y rounded-radius-md border border-surface-alt px-12 py-12 ${className}`.trim()}
        {...rest}
      />
    );
  }

  if (props.variant === "field") {
    const { variant, className = "", ...rest } = props;
    void variant;
    return (
      <input
        className={`h-[44px] ${fieldChrome} rounded-radius-md border border-surface-alt px-12 ${className}`.trim()}
        {...rest}
      />
    );
  }

  if (props.variant === "select") {
    const { variant, className = "", children, ...rest } = props;
    void variant;
    return (
      <div className={`relative flex w-full items-center ${className}`.trim()}>
        <select
          className={`h-[44px] w-full cursor-pointer ${fieldChrome} appearance-none rounded-radius-md border border-surface-alt py-0 pl-12 pr-40 disabled:cursor-not-allowed`.trim()}
          {...rest}
        >
          {children}
        </select>
        <ChevronDown
          size={20}
          className="pointer-events-none absolute right-12 top-1/2 -translate-y-1/2 shrink-0 text-text-tertiary"
          aria-hidden
        />
      </div>
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

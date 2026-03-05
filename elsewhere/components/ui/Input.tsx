import { Search } from 'lucide-react';

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'className'> {
  className?: string;
}

export function Input({ className = '', ...props }: InputProps) {
  return (
    <div className={`relative flex w-full items-center ${className}`}>
      <Search
        size={20}
        className="absolute left-12 text-text-tertiary pointer-events-none shrink-0"
        aria-hidden
      />
      <input
        type="search"
        className="h-[44px] w-full rounded-radius-sm border border-surface-alt bg-surface pl-40 pr-12 text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent"
        {...props}
      />
    </div>
  );
}

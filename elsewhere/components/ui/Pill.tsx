interface PillProps {
  children: React.ReactNode;
  className?: string;
}

export function Pill({ children, className = '' }: PillProps) {
  return (
    <span
      className={`inline-flex items-center rounded-radius-sm bg-surface-chip px-8 py-4 text-ui-caption text-text ${className}`}
    >
      {children}
    </span>
  );
}

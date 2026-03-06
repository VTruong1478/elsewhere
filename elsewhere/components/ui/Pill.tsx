type PillVariant = 'default' | 'cost' | 'placeType';

interface PillProps {
  children: React.ReactNode;
  variant?: PillVariant;
  className?: string;
}

const variantStyles: Record<PillVariant, string> = {
  default:
    'inline-flex items-center rounded-radius-sm bg-surface-chip px-8 py-4 text-ui-caption text-text',
  cost:
    'inline-flex h-24 items-center justify-center gap-4 rounded-radius-sm bg-accent px-12 py-4 text-ui-label-m font-medium text-text-inverse',
  placeType:
    'inline-flex items-center justify-center gap-4 whitespace-nowrap rounded-radius-md bg-surface px-16 py-8 text-ui-label-m font-medium text-text',
};

export function Pill({
  children,
  variant = 'default',
  className = '',
}: PillProps) {
  return (
    <span className={`${variantStyles[variant]} ${className}`.trim()}>
      {children}
    </span>
  );
}

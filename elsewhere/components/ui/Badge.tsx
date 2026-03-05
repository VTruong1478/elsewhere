type BadgeVariant = 'free' | 'library' | 'cafe';

interface BadgeProps {
  variant: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

const variantStyles: Record<BadgeVariant, string> = {
  free: 'bg-primary text-text-inverse',
  library: 'bg-surface-chip text-text',
  cafe: 'bg-surface-chip text-text',
};

export function Badge({ variant, children, className = '' }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-radius-sm px-8 py-4 text-ui-label-s ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}

type Status = 'open' | 'closing-soon' | 'closed';

interface StatusDotProps {
  status: Status;
  label: string;
  subLabel?: string;
}

const dotColors: Record<Status, string> = {
  open: 'bg-status-high',
  'closing-soon': 'bg-status-medium',
  closed: 'bg-status-low',
};

export function StatusDot({ status, label, subLabel }: StatusDotProps) {
  return (
    <span className="inline-flex items-center gap-8">
      <span
        className={`h-8 w-8 shrink-0 rounded-full ${dotColors[status]}`}
        aria-hidden
      />
      <span className="flex items-center gap-8">
        <span className="text-body-s text-text">{label}</span>
        {subLabel && (
          <span className="text-body-s text-text-tertiary">{subLabel}</span>
        )}
      </span>
    </span>
  );
}

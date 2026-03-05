import {
  VolumeX,
  Volume1,
  Volume2,
  Zap,
  Plug,
  BatteryMedium,
} from 'lucide-react';

type MetricType = 'noise' | 'tables' | 'outlets';

interface MetricTileProps {
  type: MetricType;
  value: string | null;
}

const LOW_DATA = 'Not enough data';

const NOISE_LABELS: Record<string, string> = {
  Silent: 'SILENT',
  Quiet: 'QUIET',
  Vibrant: 'VIBRANT',
};

const TABLES_LABELS: Record<string, string> = {
  Limited: 'LIMITED',
  Mixed: 'MIXED',
  Ideal: 'IDEAL',
};

const OUTLETS_LABELS: Record<string, string> = {
  None: 'NONE',
  Limited: 'LIMITED',
  Ample: 'AMPLE',
};

const TYPE_OVERLINE: Record<MetricType, string> = {
  noise: 'NOISE',
  tables: 'TABLES',
  outlets: 'OUTLETS',
};

function NoiseContent({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <span className="text-ui-caption text-text-tertiary">{LOW_DATA}</span>
    );
  }
  const Icon =
    value === 'Silent'
      ? VolumeX
      : value === 'Quiet'
        ? Volume1
        : value === 'Vibrant'
          ? Volume2
          : null;
  const label = NOISE_LABELS[value] ?? value.toUpperCase();
  return (
    <>
      {Icon && <Icon size={20} className="text-text shrink-0" aria-hidden />}
      <span className="text-ui-label-s text-text">{label}</span>
    </>
  );
}

function TablesContent({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <span className="text-ui-caption text-text-tertiary">{LOW_DATA}</span>
    );
  }
  const filled =
    value === 'Limited' ? 1 : value === 'Mixed' ? 3 : value === 'Ideal' ? 5 : 0;
  const label = TABLES_LABELS[value] ?? value.toUpperCase();
  return (
    <>
      {filled > 0 && (
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`rounded-full ${i <= filled ? 'bg-text' : 'bg-surface-alt'}`}
              style={{ width: '6px', height: '6px' }}
            />
          ))}
        </span>
      )}
      <span className="text-ui-label-s text-text">{label}</span>
    </>
  );
}

function OutletsContent({ value }: { value: string | null }) {
  if (value === null) {
    return (
      <span className="text-ui-caption text-text-tertiary">{LOW_DATA}</span>
    );
  }
  const Icon =
    value === 'Ample'
      ? Zap
      : value === 'Limited'
        ? BatteryMedium
        : value === 'None'
          ? Plug
          : null;
  const label = OUTLETS_LABELS[value] ?? value.toUpperCase();
  return (
    <>
      {Icon && <Icon size={20} className="text-text shrink-0" aria-hidden />}
      <span className="text-ui-label-s text-text">{label}</span>
    </>
  );
}

export function MetricTile({ type, value }: MetricTileProps) {
  return (
    <div className="flex min-w-fit flex-col gap-4 rounded-radius-sm bg-surface-chip px-12 py-8">
      <span className="text-ui-overline text-text-tertiary">
        {TYPE_OVERLINE[type]}
      </span>
      <div className="flex flex-col items-start gap-4">
        {type === 'noise' && <NoiseContent value={value} />}
        {type === 'tables' && <TablesContent value={value} />}
        {type === 'outlets' && <OutletsContent value={value} />}
      </div>
    </div>
  );
}

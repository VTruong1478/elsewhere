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
  /** Optional class for icon/dots (e.g. text-accent for dark navy) */
  iconClassName?: string;
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

type TileContent = {
  middle: React.ReactNode;
  bottomText: string;
  lowData: boolean;
};

function getNoiseContent(
  value: string | null,
  iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
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
  return {
    middle: Icon ? (
      <Icon
        size={20}
        className={`shrink-0 ${iconClassName}`}
        aria-hidden
      />
    ) : null,
    bottomText: label,
    lowData: false,
  };
}

function getTablesContent(
  value: string | null,
  iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
  }
  const filled =
    value === 'Limited' ? 1 : value === 'Mixed' ? 3 : value === 'Ideal' ? 5 : 0;
  const label = TABLES_LABELS[value] ?? value.toUpperCase();
  const filledClass = iconClassName === 'text-accent' ? 'bg-accent' : 'bg-text';
  return {
    middle:
      filled > 0 ? (
        <span className="flex gap-0.5" aria-hidden>
          {[1, 2, 3, 4, 5].map((i) => (
            <span
              key={i}
              className={`rounded-full ${i <= filled ? filledClass : 'bg-surface-alt'}`}
              style={{ width: '6px', height: '6px' }}
            />
          ))}
        </span>
      ) : null,
    bottomText: label,
    lowData: false,
  };
}

function getOutletsContent(
  value: string | null,
  iconClassName: string,
): TileContent {
  if (value === null) {
    return { middle: null, bottomText: LOW_DATA, lowData: true };
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
  return {
    middle: Icon ? (
      <Icon
        size={20}
        className={`shrink-0 ${iconClassName}`}
        aria-hidden
      />
    ) : null,
    bottomText: label,
    lowData: false,
  };
}

export function MetricTile({
  type,
  value,
  iconClassName = 'text-text',
}: MetricTileProps) {
  const content =
    type === 'noise'
      ? getNoiseContent(value, iconClassName)
      : type === 'tables'
        ? getTablesContent(value, iconClassName)
        : getOutletsContent(value, iconClassName);

  return (
    <div className="flex min-w-fit flex-col items-center gap-4 rounded-radius-sm bg-surface-chip px-12 py-8 text-center">
      <span className="text-ui-overline text-text-tertiary uppercase">
        {TYPE_OVERLINE[type]}
      </span>
      <div className="flex min-h-[20px] items-center justify-center">
        {content.middle}
      </div>
      <span
        className={
          content.lowData
            ? 'text-ui-label-s font-bold uppercase text-text-tertiary'
            : 'text-ui-label-s font-bold uppercase text-text'
        }
      >
        {content.bottomText}
      </span>
    </div>
  );
}

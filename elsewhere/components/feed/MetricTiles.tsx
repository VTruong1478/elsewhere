import type { NoiseLabel, OutletsLabel, TablesLabel } from '@/types/feed';

interface MetricTilesProps {
  noise: NoiseLabel | null;
  tables: TablesLabel | null;
  outlets: OutletsLabel | null;
}

const LOW_DATA_LABEL = 'Not enough data';

function TablesDots({ level }: { level: TablesLabel | null }) {
  if (!level) return <span className="text-ui-caption text-text-tertiary">{LOW_DATA_LABEL}</span>;
  const filled =
    level === 'limited' ? 1 : level === 'mixed' ? 3 : 5;
  return (
    <span className="flex items-center gap-1">
      <span className="flex gap-0.5" aria-hidden>
        {[1, 2, 3, 4, 5].map((i) => (
          <span
            key={i}
            className={`h-1.5 w-1.5 rounded-full ${i <= filled ? 'bg-text' : 'bg-surface-alt'}`}
          />
        ))}
      </span>
      <span className="text-ui-caption text-text">{level}</span>
    </span>
  );
}

export function MetricTiles({ noise, tables, outlets }: MetricTilesProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <div className="flex items-center gap-1 rounded-radius-sm border border-surface-alt bg-surface px-2 py-1">
        <span className="text-ui-label-s text-text-secondary">Noise</span>
        <span className="text-ui-caption text-text">
          {noise ?? LOW_DATA_LABEL}
        </span>
      </div>
      <div className="flex items-center gap-1 rounded-radius-sm border border-surface-alt bg-surface px-2 py-1">
        <span className="text-ui-label-s text-text-secondary">Tables</span>
        <TablesDots level={tables} />
      </div>
      <div className="flex items-center gap-1 rounded-radius-sm border border-surface-alt bg-surface px-2 py-1">
        <span className="text-ui-label-s text-text-secondary">Outlets</span>
        <span className="text-ui-caption text-text">
          {outlets ?? LOW_DATA_LABEL}
        </span>
      </div>
    </div>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FEED_FILTER_OPTIONS, type FeedFilter } from '@/types/feed';

export function FilterChips() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = (searchParams.get('filter') ?? '') as FeedFilter;

  function selectFilter(value: FeedFilter) {
    const next = new URLSearchParams(searchParams.toString());
    if (value) {
      next.set('filter', value);
    } else {
      next.delete('filter');
    }
    router.push(`/feed?${next.toString()}`);
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FEED_FILTER_OPTIONS.map(({ value, label }) => {
        const isSelected = current === value;
        return (
          <button
            key={value || 'all'}
            type="button"
            onClick={() => selectFilter(value)}
            className={`relative rounded-radius-sm px-4 py-2 text-ui-label-m focus:outline-none focus:ring-2 focus:ring-accent ${
              isSelected ? 'bg-surface-chip' : 'bg-surface-chip'
            }`}
            style={{
              backgroundColor: isSelected ? undefined : undefined,
            }}
          >
            {isSelected && (
              <span
                className="pointer-events-none absolute inset-0 rounded-radius-sm"
                style={{ backgroundColor: 'rgba(255, 255, 255, 0.15)' }}
                aria-hidden
              />
            )}
            <span className="relative text-text">{label}</span>
          </button>
        );
      })}
    </div>
  );
}

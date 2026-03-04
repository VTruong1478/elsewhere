import { MapPin } from 'lucide-react';

export function FeedEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <MapPin className="text-text-tertiary mb-4" size={48} strokeWidth={1.5} aria-hidden />
      <p className="font-lora text-heading-m text-text mb-2">No places found</p>
      <p className="text-body-m text-text-secondary max-w-sm">
        Try adjusting your search or filters, or explore a different area.
      </p>
    </div>
  );
}

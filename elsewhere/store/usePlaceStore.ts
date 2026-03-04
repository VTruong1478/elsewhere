import { create } from 'zustand';

interface PlaceStore {
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  setSelectedPlaceId: (id: string | null) => void;
  setHoveredPlaceId: (id: string | null) => void;
}

export const usePlaceStore = create<PlaceStore>((set) => ({
  selectedPlaceId: null,
  hoveredPlaceId: null,
  setSelectedPlaceId: (id) => set({ selectedPlaceId: id }),
  setHoveredPlaceId: (id) => set({ hoveredPlaceId: id }),
}));

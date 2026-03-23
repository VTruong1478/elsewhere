import { create } from "zustand";
import { normalizePlaceId } from "@/lib/placeId";

interface PlaceStore {
  selectedPlaceId: string | null;
  hoveredPlaceId: string | null;
  setSelectedPlaceId: (id: string | null) => void;
  setHoveredPlaceId: (id: string | null) => void;
}

export const usePlaceStore = create<PlaceStore>((set) => ({
  selectedPlaceId: null,
  hoveredPlaceId: null,
  setSelectedPlaceId: (id) =>
    set({ selectedPlaceId: normalizePlaceId(id) }),
  setHoveredPlaceId: (id) =>
    set({ hoveredPlaceId: normalizePlaceId(id) }),
}));

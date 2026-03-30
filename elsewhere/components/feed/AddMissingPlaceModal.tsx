"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { createClient } from "@/lib/supabase/client";

const PLACE_TYPE_OPTIONS = [
  { value: "cafe", label: "Cafe" },
  { value: "library", label: "Library" },
  { value: "bookstore", label: "Bookstore" },
  { value: "coworking", label: "Coworking" },
  { value: "diner", label: "Diner" },
  { value: "restaurant", label: "Restaurant" },
  { value: "bar", label: "Bar" },
  { value: "park", label: "Park" },
  { value: "other", label: "Other" },
] as const;

export function AddMissingPlaceModal({
  open,
  onClose,
  submittedFromSearch,
}: {
  open: boolean;
  onClose: () => void;
  submittedFromSearch?: string;
}) {
  const [mounted, setMounted] = useState(false);
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [placeType, setPlaceType] = useState("");
  const [loading, setLoading] = useState(false);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose, loading]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || !mounted) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = placeName.trim();
    const addr = address.trim();
    if (!name || !addr || !placeType) return;

    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError) {
        console.error("[AddMissingPlaceModal] getUser", userError);
        return;
      }
      if (!user) {
        console.error("[AddMissingPlaceModal] No authenticated user");
        return;
      }

      const { error } = await supabase.from("place_submissions").insert({
        user_id: user.id,
        place_name: name,
        address_or_location: addr,
        place_type: placeType,
        submitted_from_search: submittedFromSearch ?? null,
      });

      if (error) {
        console.error("[AddMissingPlaceModal] insert", error);
        return;
      }

      setPlaceName("");
      setAddress("");
      setPlaceType("");
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-16">
      <div
        className="absolute inset-0 modal-overlay"
        aria-hidden
        onClick={loading ? undefined : onClose}
      />
      <div
        className="relative z-10 flex max-h-[min(90dvh,640px)] w-full max-w-md flex-col overflow-y-auto rounded-radius-md bg-surface p-16"
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-place-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-16 flex items-start justify-between gap-16">
          <h2
            id="add-place-title"
            className="font-lora text-heading-l text-text"
          >
            Add a missing place
          </h2>
          <Button
            type="button"
            variant="secondaryIcon"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </Button>
        </div>

        <form className="flex flex-col gap-16" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-8">
            <label
              htmlFor="add-place-name"
              className="text-ui-label-m text-text-secondary"
            >
              Place name
            </label>
            <Input
              variant="field"
              id="add-place-name"
              name="placeName"
              type="text"
              required
              autoComplete="off"
              placeholder="Place name"
              value={placeName}
              onChange={(e) => setPlaceName(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-8">
            <label
              htmlFor="add-place-address"
              className="text-ui-label-m text-text-secondary"
            >
              Address or location description
            </label>
            <Input
              variant="multiline"
              id="add-place-address"
              name="address"
              required
              rows={4}
              className="min-h-[120px]"
              placeholder="Street address or how to find it"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={loading}
            />
          </div>

          <div className="flex flex-col gap-8">
            <label
              htmlFor="add-place-type"
              className="text-ui-label-m text-text-secondary"
            >
              Place type
            </label>
            <Input
              variant="select"
              id="add-place-type"
              name="placeType"
              required
              value={placeType}
              onChange={(e) => setPlaceType(e.target.value)}
              disabled={loading}
            >
              <option value="" disabled>
                Select place type
              </option>
              {PLACE_TYPE_OPTIONS.map(({ value, label }) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Input>
          </div>

          <Button
            type="submit"
            disabled={loading}
            className="mt-8 h-44 w-full text-ui-button"
          >
            {loading ? "Submitting..." : "Submit"}
          </Button>
        </form>
      </div>
    </div>,
    document.body,
  );
}

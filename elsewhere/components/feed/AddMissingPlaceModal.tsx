"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";

const PLACE_TYPE_OPTIONS = [
  { value: "cafe", label: "Cafe" },
  { value: "tea_shop", label: "Tea shop" },
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
  const [placeName, setPlaceName] = useState("");
  const [address, setAddress] = useState("");
  const [placeType, setPlaceType] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) {
      setSubmitted(false);
      setPlaceName("");
      setAddress("");
      setPlaceType("");
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = placeName.trim();
    const addr = address.trim();
    if (!name || !addr || !placeType) return;

    setLoading(true);
    try {
      const res = await fetch("/api/place-submissions", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          place_name: name,
          address_or_location: addr,
          place_type: placeType,
          submitted_from_search: submittedFromSearch ?? null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error(
          "[AddMissingPlaceModal] submit",
          (body as { error?: string }).error ?? "Failed to submit place",
        );
        return;
      }

      setSubmitted(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="add-place-title"
      closeOnOverlayClick={!loading}
      closeOnEscape={!loading}
    >
      <div className="mb-16 flex items-start justify-between gap-16">
        <h2
          id="add-place-title"
          className={`font-lora text-heading-l text-text ${submitted ? "w-full text-center" : ""}`}
        >
          {submitted
            ? "Thanks for submitting a new place!"
            : "Add a missing place"}
        </h2>
        {!submitted ? (
          <Button
            type="button"
            variant="secondaryIcon"
            onClick={onClose}
            disabled={loading}
            aria-label="Close"
          >
            <X size={20} strokeWidth={2} aria-hidden />
          </Button>
        ) : null}
      </div>

      {submitted ? (
        <div className="flex flex-col items-center gap-16 text-center">
          <p className="text-body-m text-text-secondary">
            We&apos;ll review it shortly.
          </p>
          <Button
            type="button"
            onClick={onClose}
            className="mt-8 h-44 w-full text-ui-button"
          >
            Got it
          </Button>
        </div>
      ) : (
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
              className="min-h-[120px] resize-none"
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
      )}
    </Modal>
  );
}

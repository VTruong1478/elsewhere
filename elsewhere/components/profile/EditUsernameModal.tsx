// NEW COMPONENT
"use client";

import { useState, useEffect, useRef } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";

type AvailabilityState = "idle" | "checking" | "available" | "taken";

type EditUsernameModalProps = {
  open: boolean;
  onClose: () => void;
  currentUsername: string | null;
  userId: string;
  onSave: (newUsername: string) => void;
};

function sanitize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
}

export function EditUsernameModal({
  open,
  onClose,
  currentUsername,
  userId,
  onSave,
}: EditUsernameModalProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(currentUsername ?? "");
  const [availability, setAvailability] = useState<AvailabilityState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset local state when modal opens
  useEffect(() => {
    if (open) {
      setValue(currentUsername ?? "");
      setAvailability("idle");
      setError(null);
    }
  }, [open, currentUsername]);

  // Debounced availability check
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    const isUnchanged = trimmed === (currentUsername ?? "");

    if (!trimmed || isUnchanged) {
      setAvailability("idle");
      return;
    }

    setAvailability("checking");

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/username/check?username=${encodeURIComponent(trimmed)}`,
          { credentials: "same-origin" },
        );
        const body = await res.json();
        if (!res.ok || !body?.data) {
          setAvailability("idle");
          return;
        }
        setAvailability(body.data.available ? "available" : "taken");
      } catch {
        setAvailability("idle");
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, currentUsername]);

  const trimmed = value.trim();
  const isUnchanged = trimmed === (currentUsername ?? "");
  const saveDisabled =
    isSaving ||
    !trimmed ||
    isUnchanged ||
    availability === "checking" ||
    availability === "taken";

  async function handleSave() {
    if (saveDisabled) return;
    setIsSaving(true);
    setError(null);

    const supabase = createClient();
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ username: trimmed })
      .eq("id", userId);

    setIsSaving(false);

    if (updateError) {
      setError(updateError.message ?? "Failed to update username");
      return;
    }

    onSave(trimmed);
    queryClient.invalidateQueries({ queryKey: ["profile-ratings", userId] });
    onClose();
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const sanitized = sanitize(e.target.value);
    setValue(sanitized);
    setError(null);
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-username-title">
      <div className="flex items-center justify-between gap-12 pb-12">
        <h2 id="edit-username-title" className="font-lora text-heading-m text-text">
          Edit username
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="flex h-32 w-32 items-center justify-center rounded-radius-sm text-text-secondary"
          aria-label="Close"
        >
          <X size={20} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-12">
        {/* Input with @ prefix */}
        <div className="flex h-[44px] items-center overflow-hidden rounded-radius-md border border-surface-alt bg-surface">
          <span className="shrink-0 px-12 text-body-m text-text-tertiary" aria-hidden>
            @
          </span>
          <input
            type="text"
            value={value}
            onChange={handleChange}
            placeholder="yourname"
            maxLength={20}
            aria-label="Username"
            autoFocus
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            className="h-full flex-1 bg-transparent pr-12 text-body-m text-text placeholder:text-text-tertiary focus:outline-none"
          />
        </div>

        {/* Availability status */}
        {trimmed && !isUnchanged && (
          <p
            className={`text-body-s ${
              availability === "available"
                ? "text-status-high"
                : availability === "taken"
                  ? "text-status-low"
                  : "text-text-tertiary"
            }`}
          >
            {availability === "checking" && "checking…"}
            {availability === "available" && "✓ available"}
            {availability === "taken" && "✗ already taken"}
          </p>
        )}

        {error && (
          <p className="text-body-s text-status-low">{error}</p>
        )}

        <Button
          variant="primary"
          onClick={handleSave}
          disabled={saveDisabled}
          className="w-full"
        >
          {isSaving ? "Saving…" : "Save"}
        </Button>
      </div>
    </Modal>
  );
}

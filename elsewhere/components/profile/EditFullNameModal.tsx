// NEW COMPONENT
"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FULL_NAME_MAX_LENGTH } from "@/lib/constants/profile";

type EditFullNameModalProps = {
  open: boolean;
  onClose: () => void;
  currentFullName: string;
  userId: string;
  onSave: (newName: string) => void;
};

export function EditFullNameModal({
  open,
  onClose,
  currentFullName,
  userId,
  onSave,
}: EditFullNameModalProps) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(currentFullName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const trimmed = value.trim();
  const isUnchanged = trimmed === currentFullName.trim();
  const saveDisabled = isSaving || !trimmed || isUnchanged;

  async function handleSave() {
    if (saveDisabled) return;
    setIsSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: trimmed }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string | null;
      };

      if (!res.ok) {
        setError(json.error ?? "Failed to update name");
        return;
      }

      onSave(trimmed);
      // The name is denormalized into feeds and follower lists, so all four
      // caches go stale together.
      queryClient.invalidateQueries({ queryKey: ["profile-ratings", userId] });
      queryClient.invalidateQueries({ queryKey: ["social-feed"] });
      queryClient.invalidateQueries({ queryKey: ["profile-followers"] });
      queryClient.invalidateQueries({ queryKey: ["profile-following"] });
      onClose();
    } catch {
      setError("Couldn't reach the server. Check your connection.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} labelledBy="edit-full-name-title">
      <div className="flex items-center justify-between gap-12 pb-12">
        <h2 id="edit-full-name-title" className="font-lora text-heading-m text-text">
          Edit full name
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
        <Input
          variant="field"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="Your name"
          maxLength={FULL_NAME_MAX_LENGTH}
          aria-label="Full name"
          autoFocus
        />

        {error && (
          <p role="alert" className="text-body-s text-status-low">
            {error}
          </p>
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

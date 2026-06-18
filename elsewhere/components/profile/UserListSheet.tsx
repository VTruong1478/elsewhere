// NEW COMPONENT
"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";

type UserListItem = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  username: string | null;
};

type UserListSheetProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  users: UserListItem[];
  isLoading: boolean;
};

export function UserListSheet({
  open,
  onClose,
  title,
  users,
  isLoading,
}: UserListSheetProps) {
  // Escape key to close
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Body scroll lock
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-60">
      {/* Overlay */}
      <div
        className="absolute inset-0 modal-overlay"
        onClick={onClose}
        aria-hidden
      />

      {/* Sheet panel */}
      <div className="fixed inset-x-0 bottom-0 z-60 flex max-h-[75dvh] flex-col rounded-t-radius-md bg-surface">
        {/* Header */}
        <div className="sticky top-0 flex items-center justify-between border-b border-surface-alt bg-surface px-16 py-12">
          <h2 className="font-lora text-heading-m text-text">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-32 w-32 items-center justify-center rounded-radius-sm text-text-secondary"
            aria-label="Close"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="scrollbar-hide overflow-y-auto px-16 py-8">
          {isLoading ? (
            <div className="space-y-12 py-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-12" aria-hidden>
                  <div className="h-40 w-40 shrink-0 animate-pulse rounded-full bg-surface-alt" />
                  <div className="h-8 w-32 animate-pulse rounded-radius-sm bg-surface-alt" />
                </div>
              ))}
            </div>
          ) : users.length === 0 ? (
            <p className="py-16 text-center text-body-m text-text-secondary">
              No users yet
            </p>
          ) : (
            <ul className="space-y-4 py-8">
              {users.map((user) => (
                <li key={user.id}>
                  <Link
                    href={`/profile/${user.id}`}
                    onClick={onClose}
                    className="flex items-center gap-12 rounded-radius-sm px-4 py-8 hover:bg-surface-alt"
                  >
                    <div className="flex h-40 w-40 shrink-0 items-center justify-center overflow-hidden rounded-full bg-surface-alt">
                      {user.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={user.avatar_url}
                          alt=""
                          className="h-full w-full rounded-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <span className="text-ui-label-m font-medium text-text-secondary">
                          {(user.username ?? user.full_name ?? "?").charAt(0).toUpperCase()}
                        </span>
                      )}
                    </div>
                    <span className="text-body-m text-accent text-link">
                      {user.username ? `@${user.username}` : (user.full_name ?? "Anonymous")}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

"use client";

import { Search, X } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./SearchBar.module.css";

const DEBOUNCE_MS = 300;

export type SearchBarProps = {
  /**
   * Map screen: controlled input without syncing `q` to the URL (no query params / navigation).
   * Feed: omit for URL-backed search behavior.
   */
  value?: string;
  onValueChange?: (value: string) => void;
};

export function SearchBar({
  value: controlledValue,
  onValueChange,
}: SearchBarProps = {}) {
  const isControlled = onValueChange != null;
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const urlQ = searchParams.get("q") ?? "";
  const [value, setValue] = useState(urlQ);

  const basePath = pathname?.startsWith("/map") ? "/map" : "/feed";

  const skipNextUrlSyncRef = useRef(false);
  const debounceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateQuery = useCallback(
    (q: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (q.trim()) {
        next.set("q", q.trim());
      } else {
        next.delete("q");
      }
      const qs = next.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    },
    [router, searchParams, basePath],
  );

  const displayValue = isControlled ? (controlledValue ?? "") : value;
  const setDisplayValue = isControlled ? onValueChange! : setValue;

  // Sync input when `q` changes from outside this field (e.g. back/forward, nav).
  // Skip one sync after our own debounced `router.push` so in-progress typing isn't overwritten.
  useEffect(() => {
    if (isControlled) return;
    if (skipNextUrlSyncRef.current) {
      skipNextUrlSyncRef.current = false;
      return;
    }
    setValue(urlQ);
  }, [urlQ, isControlled]);

  // Debounce URL updates so the feed TanStack Query refetches via the existing `q` param.
  useEffect(() => {
    if (isControlled) return;
    const trimmed = value.trim();
    const urlTrimmed = urlQ.trim();
    if (trimmed === urlTrimmed) {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
      return;
    }

    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    debounceTimeoutRef.current = setTimeout(() => {
      debounceTimeoutRef.current = null;
      skipNextUrlSyncRef.current = true;
      updateQuery(value);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
        debounceTimeoutRef.current = null;
      }
    };
  }, [value, urlQ, updateQuery, isControlled]);

  const clearSearch = useCallback(() => {
    if (isControlled) {
      onValueChange!("");
      return;
    }
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
      debounceTimeoutRef.current = null;
    }
    skipNextUrlSyncRef.current = true;
    setValue("");
    updateQuery("");
  }, [isControlled, onValueChange, updateQuery]);

  const showClear = displayValue.trim().length > 0;

  return (
    <form
      className="flex items-center gap-2 rounded-radius-md  bg-surface outline-none"
      onSubmit={(e) => {
        e.preventDefault();
        if (isControlled) return;
        if (debounceTimeoutRef.current) {
          clearTimeout(debounceTimeoutRef.current);
          debounceTimeoutRef.current = null;
        }
        skipNextUrlSyncRef.current = true;
        updateQuery(value);
      }}
    >
      <Search
        className="ml-3 shrink-0 text-text-tertiary"
        size={20}
        aria-hidden
      />
      <input
        type="search"
        value={displayValue}
        onChange={(e) => setDisplayValue(e.target.value)}
        placeholder="Search places to work"
        className={`${styles.searchInput} min-w-0 flex-1 bg-transparent py-12 text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-0 ${showClear ? "pr-8" : "pr-16"}`}
        aria-label="Search places"
      />
      {showClear ? (
        <button
          type="button"
          onClick={clearSearch}
          className="shrink-0 rounded-radius-sm p-12 text-text-tertiary transition-colors hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-0"
          aria-label="Clear search"
        >
          <X size={20} aria-hidden />
        </button>
      ) : null}
    </form>
  );
}

"use client";

import { Search } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import styles from "./SearchBar.module.css";

export function SearchBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [value, setValue] = useState(searchParams.get("q") ?? "");

  const basePath = pathname?.startsWith("/map") ? "/map" : "/feed";

  const updateQuery = useCallback(
    (q: string) => {
      const next = new URLSearchParams(searchParams.toString());
      if (q.trim()) {
        next.set("q", q.trim());
      } else {
        next.delete("q");
      }
      router.push(`${basePath}?${next.toString()}`);
    },
    [router, searchParams, basePath],
  );

  return (
    <form
      className="flex items-center gap-2 rounded-radius-md  bg-surface outline-none"
      onSubmit={(e) => {
        e.preventDefault();
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
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search places to work"
        className={`${styles.searchInput} min-w-0 flex-1 bg-transparent py-12 pr-4 text-body-m text-text placeholder:text-text-tertiary focus:outline-none focus:ring-0`}
        aria-label="Search places"
      />
    </form>
  );
}

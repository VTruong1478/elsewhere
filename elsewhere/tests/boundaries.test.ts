import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const APP_DIR = path.resolve(__dirname, "..", "app");
const APP_GROUP = path.join(APP_DIR, "(app)");

/**
 * Every route segment under app/(app)/ must carry its own loading.tsx and
 * error.tsx. Discovering the segments from disk (rather than hardcoding them)
 * means a new tab added without boundaries fails here instead of silently
 * falling back to the root app/error.tsx, which unmounts the whole app shell.
 */
function findPageSegments(dir: string): string[] {
  const found: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const child = path.join(dir, entry.name);
    if (fs.existsSync(path.join(child, "page.tsx"))) found.push(child);
    found.push(...findPageSegments(child));
  }
  return found;
}

describe("route boundaries", () => {
  const segments = findPageSegments(APP_GROUP);

  it("finds the app segments", () => {
    expect(segments.length).toBeGreaterThanOrEqual(8);
  });

  it.each(segments.map((s) => [path.relative(APP_DIR, s), s]))(
    "%s has loading.tsx and error.tsx",
    (_label, segment) => {
      expect(fs.existsSync(path.join(segment, "loading.tsx"))).toBe(true);
      expect(fs.existsSync(path.join(segment, "error.tsx"))).toBe(true);
    },
  );

  it("has a group-level error boundary that keeps the app shell mounted", () => {
    expect(fs.existsSync(path.join(APP_GROUP, "error.tsx"))).toBe(true);
    expect(fs.existsSync(path.join(APP_GROUP, "layout.tsx"))).toBe(true);
  });

  it("has root-level and global fallbacks", () => {
    for (const file of [
      "error.tsx",
      "loading.tsx",
      "not-found.tsx",
      "global-error.tsx",
    ]) {
      expect(fs.existsSync(path.join(APP_DIR, file))).toBe(true);
    }
  });

  it("renders its own html/body in global-error, which replaces the document", () => {
    const source = fs.readFileSync(
      path.join(APP_DIR, "global-error.tsx"),
      "utf8",
    );
    expect(source).toContain("<html");
    expect(source).toContain("<body");
  });
});

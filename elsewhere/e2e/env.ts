import fs from "node:fs";
import path from "node:path";

/**
 * Minimal .env.local reader. Playwright does not load Next's env files, and we
 * only need two optional keys, so this avoids adding a dotenv dependency.
 */
function readEnvLocal(): Record<string, string> {
  const file = path.resolve(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) return {};

  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (key) out[key] = value;
  }
  return out;
}

const fileEnv = readEnvLocal();

export const DEV_AUTH_EMAIL =
  process.env.DEV_AUTH_EMAIL?.trim() || fileEnv.DEV_AUTH_EMAIL || "";
export const DEV_AUTH_PASSWORD =
  process.env.DEV_AUTH_PASSWORD?.trim() || fileEnv.DEV_AUTH_PASSWORD || "";

/** Authenticated specs are skipped until these are set in .env.local. */
export const HAS_DEV_AUTH = Boolean(DEV_AUTH_EMAIL && DEV_AUTH_PASSWORD);

export const STORAGE_STATE = path.resolve(__dirname, ".auth", "user.json");

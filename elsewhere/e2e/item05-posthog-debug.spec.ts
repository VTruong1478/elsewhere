import { test, expect } from "@playwright/test";

/**
 * Item 5 — two debug events (`test_event`, `manual_test_event`) and unconditional
 * console.logs fired on every page load in production. Verified two ways:
 * no debug console output, and no debug event on the wire.
 */
test("no PostHog debug events or logs on page load", async ({ page }) => {
  const logs: string[] = [];
  page.on("console", (msg) => logs.push(msg.text()));

  const debugCaptures: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (!/posthog|\/e\/|\/i\/v0\//.test(url)) return;
    const body = req.postData() ?? "";
    if (/test_event|manual_test_event|posthog_debug/.test(body + url)) {
      debugCaptures.push(url);
    }
  });

  await page.goto("/feed");
  await page.waitForTimeout(2500);

  expect(logs.filter((l) => l.includes("[PostHog] env (client)"))).toHaveLength(0);
  expect(logs.filter((l) => l.includes("[PostHog] loaded"))).toHaveLength(0);
  expect(debugCaptures).toHaveLength(0);
});

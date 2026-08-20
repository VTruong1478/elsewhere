import { test, expect } from "@playwright/test";

/**
 * The Toast provider gated its portal on `typeof document`, which differs
 * between the server and the client's first render, so every page failed
 * hydration. /map additionally seeded state from matchMedia in a useState
 * initializer. Both are fixed at the source rather than suppressed.
 */
const ROUTES = ["/terms", "/privacy", "/login", "/signup", "/feed", "/map"];

for (const route of ROUTES) {
  test(`no hydration mismatch on ${route}`, async ({ page }) => {
    const hydration: string[] = [];
    page.on("pageerror", (e) => {
      if (/hydrat|didn't match|server rendered/i.test(e.message)) {
        hydration.push(e.message.slice(0, 200));
      }
    });
    page.on("console", (m) => {
      if (m.type() === "error" && /hydrat|didn't match/i.test(m.text())) {
        hydration.push(m.text().slice(0, 200));
      }
    });

    await page.goto(route);
    await page.waitForTimeout(5000);

    expect(hydration, `hydration warnings on ${route}`).toEqual([]);
  });
}

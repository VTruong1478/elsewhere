import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";

requireDevAuth();

/** Authenticated routes: profile and place detail. */
test("no hydration mismatch on profile and place detail", async ({ page, request }) => {
  const res = await request.get("/api/feed?lat=38.8304&lng=-77.1941&radius_miles=25");
  const placeId = (await res.json())?.data?.[0]?.id;

  const routes = ["/profile", "/saved", ...(placeId ? [`/places/${placeId}`] : [])];
  const failures: string[] = [];

  for (const route of routes) {
    const hydration: string[] = [];
    const onErr = (e: Error) => {
      if (/hydrat|didn't match|server rendered/i.test(e.message)) hydration.push(route);
    };
    page.on("pageerror", onErr);
    await page.goto(route);
    await page.waitForTimeout(5000);
    page.off("pageerror", onErr);
    if (hydration.length) failures.push(`${route} (${hydration.length})`);
  }

  console.log(`[hydration] checked ${routes.join(", ")}`);
  expect(failures, "routes with hydration mismatches").toEqual([]);
});

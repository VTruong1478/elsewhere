import { test, expect } from "@playwright/test";
import { requireDevAuth } from "./guards";

requireDevAuth();

/** Item 3 — server-side username validation that the client used to skip. */
const cases: Array<{ name: string; username: string; expect: RegExp }> = [
  { name: "too short", username: "ab", expect: /at least 3 characters/i },
  { name: "reserved word", username: "admin", expect: /isn't available/i },
  { name: "illegal characters", username: "no spaces!", expect: /letters, numbers/i },
];

for (const c of cases) {
  test(`rejects ${c.name}`, async ({ request }) => {
    const res = await request.patch("/api/user/profile", {
      data: { username: c.username },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(c.expect);
  });
}

test("rejects an over-long full name", async ({ request }) => {
  const res = await request.patch("/api/user/profile", {
    data: { full_name: "x".repeat(200) },
  });
  expect(res.status()).toBe(400);
});

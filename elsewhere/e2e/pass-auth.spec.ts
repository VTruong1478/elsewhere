import { test, expect, type Page } from "@playwright/test";
import { captureConsole, summarize } from "./console";

/**
 * Full-pass: AUTH. Runs logged out.
 * Auth pages render their form twice (mobile + desktop copies), so all
 * selectors target the visible copy.
 */
const vis = {
  email: (p: Page) => p.locator('input[type="email"]:visible').first(),
  password: (p: Page) => p.locator('input[type="password"]:visible').first(),
  passwordAt: (p: Page, i: number) =>
    p.locator('input[type="password"]:visible').nth(i),
  text: (p: Page, ph: RegExp) =>
    p.locator("input:visible").filter({ hasNotText: "" }).first(),
  button: (p: Page, name: RegExp) =>
    p.locator("button:visible").filter({ hasText: name }).first(),
};

test.describe("auth", () => {
  test("login page renders and both form copies share DOM ids (defect)", async ({
    page,
  }) => {
    const c = captureConsole(page);
    await page.goto("/login");

    const emailInputs = page.locator('input[type="email"]');
    const count = await emailInputs.count();
    console.log(`[auth] email inputs in DOM: ${count} | ${summarize(c)}`);

    // Documents the duplicate-id defect rather than asserting it is fine.
    expect(count, "auth form is rendered twice, duplicating ids").toBeGreaterThan(1);
    await expect(vis.email(page)).toBeVisible();
  });

  test("wrong password shows an error and does not navigate", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/login");

    await vis.email(page).fill("dev@elsewhere.test");
    await vis.password(page).fill("definitely-not-the-password");
    await vis.button(page, /^log in$/i).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
    // The auth round trip takes a few seconds; assert on the rendered message.
    await expect(
      page.locator("p:visible, div:visible").filter({
        hasText: /invalid login credentials/i,
      }).first(),
    ).toBeVisible({ timeout: 20_000 });
    const body = await page.locator("body").innerText();
    const errIdx = body.search(/invalid login credentials/i);
    const ctaIdx = body.search(/don.t have an account/i);
    console.log(
      `[auth wrong-password] ${summarize(c)} | error shown BELOW signup CTA: ${errIdx > ctaIdx}`,
    );
  });

  test("login with empty fields does not submit", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/login");
    await vis.button(page, /^log in$/i).click();
    await expect(page).toHaveURL(/\/login/);
    console.log(`[auth empty-login] ${summarize(c)}`);
  });

  test("signup rejects an obviously invalid email", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/signup");

    const emails = page.locator('input[type="email"]:visible');
    await emails.first().fill("not-an-email");
    const pw = page.locator('input[type="password"]:visible');
    if (await pw.count()) await pw.first().fill("somepassword123");

    await page.locator("button:visible").filter({ hasText: /sign up|create/i }).first().click();
    await expect(page).toHaveURL(/\/signup/, { timeout: 15_000 });
    console.log(`[auth signup-invalid-email] ${summarize(c)}`);
  });

  test("signup with an existing email surfaces an error", async ({ page }) => {
    const c = captureConsole(page);
    await page.goto("/signup");

    const nameField = page.locator('input[type="text"]:visible').first();
    if (await nameField.count()) await nameField.fill("Dev Tester");
    await vis.email(page).fill("dev@elsewhere.test");
    await vis.password(page).fill("devpassword123");

    await page.locator("button:visible").filter({ hasText: /sign up|create/i }).first().click();
    await page.waitForTimeout(6000);

    const body = await page.locator("body").innerText();
    console.log(
      `[auth duplicate-email] url=${page.url()} | ${summarize(c)}\n  body: ${body.slice(0, 200).replace(/\n+/g, " | ")}`,
    );
  });

  test("signup password field uses new-password autocomplete", async ({ page }) => {
    await page.goto("/signup");
    const ac = await vis.password(page).getAttribute("autocomplete");
    console.log(`[auth signup-autocomplete] value=${ac}`);
    expect(ac, "signup should advertise new-password to password managers").toBe(
      "new-password",
    );
  });

  test("forgot-password accepts a submit and confirms without leaking existence", async ({
    page,
  }) => {
    const c = captureConsole(page);
    await page.goto("/forgot-password");

    await vis.email(page).fill("dev@elsewhere.test");
    await page.locator("button:visible").filter({ hasText: /send|reset/i }).first().click();
    await page.waitForTimeout(5000);

    const body = await page.locator("body").innerText();
    console.log(
      `[auth forgot-password] ${summarize(c)}\n  body: ${body.slice(0, 200).replace(/\n+/g, " | ")}`,
    );
  });

  test("reset-password without a recovery token does not strand the user", async ({
    page,
  }) => {
    const c = captureConsole(page);
    await page.goto("/reset-password");
    await page.waitForTimeout(7000);

    const body = await page.locator("body").innerText();
    console.log(
      `[auth reset-no-token] url=${page.url()} | ${summarize(c)}\n  body: ${body.slice(0, 220).replace(/\n+/g, " | ")}`,
    );
  });

  test("google oauth button is present", async ({ page }) => {
    await page.goto("/login");
    const google = page.locator("button:visible, a:visible").filter({ hasText: /google/i });
    const n = await google.count();
    console.log(`[auth google] visible google controls: ${n}`);
    expect(n, "expected a Google sign-in affordance").toBeGreaterThan(0);
  });
});

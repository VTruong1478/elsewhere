import type { Page, ConsoleMessage } from "@playwright/test";

export type ConsoleCapture = {
  errors: string[];
  warnings: string[];
  pageErrors: string[];
  failedRequests: string[];
};

/**
 * Records console errors/warnings, uncaught exceptions and failed requests for
 * a page, so a flow can be judged on more than what is visible on screen.
 *
 * Known-noisy entries are filtered: they are environmental, not app defects.
 */
export function captureConsole(page: Page): ConsoleCapture {
  const capture: ConsoleCapture = {
    errors: [],
    warnings: [],
    pageErrors: [],
    failedRequests: [],
  };

  const IGNORE = [
    /Download the React DevTools/i,
    /browserslist/i,
    /Fast Refresh/i,
    /\[Fast Refresh\]/i,
    /middleware.*deprecated/i, // pre-existing Next 16 notice
  ];

  const ignored = (text: string) => IGNORE.some((re) => re.test(text));

  page.on("console", (msg: ConsoleMessage) => {
    const text = msg.text();
    if (ignored(text)) return;
    if (msg.type() === "error") capture.errors.push(text);
    if (msg.type() === "warning") capture.warnings.push(text);
  });

  page.on("pageerror", (err) => capture.pageErrors.push(err.message));

  page.on("requestfailed", (req) => {
    const failure = req.failure()?.errorText ?? "";
    // Aborted requests are usually deliberate route interception in tests.
    if (/ERR_ABORTED/.test(failure)) return;
    capture.failedRequests.push(`${req.method()} ${req.url()} — ${failure}`);
  });

  return capture;
}

/** Compact one-line summary for reporting. */
export function summarize(c: ConsoleCapture): string {
  return [
    `console.error=${c.errors.length}`,
    `console.warn=${c.warnings.length}`,
    `uncaught=${c.pageErrors.length}`,
    `failedRequests=${c.failedRequests.length}`,
  ].join(" ");
}

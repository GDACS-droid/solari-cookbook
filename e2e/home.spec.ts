import { expect, test } from "@playwright/test";

// Next's dev server rejects the HMR socket when the browser origin is 127.0.0.1.
// Keep browser-driven interaction tests on the same localhost origin as dev.
test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL?.replace("127.0.0.1", "localhost") ?? "http://localhost:3107" });

test("shows the daily queue and a property-first evidence brief", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What changed in Southwest Florida property distress today?" })).toBeVisible();
  await expect(page.getByText("5 registrations source-opened Aug 31")).toBeVisible();
  await expect(page.getByText("1447 SE 17th Ter").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence ledger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source readiness, at a glance" })).toBeVisible();
});

test("has an accessible live-investigation action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Investigate live" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Investigate this property live" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Run live with Solari" })).toBeChecked();
  await expect(page.getByRole("heading", { name: "Watch the evidence come together" })).toBeVisible();
  await expect(page.getByText(/Live mode is locked to one approved official-data investigation/)).toBeVisible();
});

test("queue action lands on truthful live progress", async ({ page }) => {
  await page.route("**/api/investigations", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify({ stage: "queued", message: "Live official-data run started." })}\n\n` }));
  await page.goto("/");
  const action = page.getByRole("button", { name: "Investigate this property live" });
  await action.click();
  await expect(page.locator("#live-run")).toBeInViewport();
  await expect(page.getByRole("heading", { name: "Watch the evidence come together" })).toBeFocused();
});

test("replays the verified investigation without claiming it is live", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("checkbox", { name: "Run live with Solari" }).uncheck();
  await page.getByRole("button", { name: "Investigate live" }).click();
  await expect(page.getByText("Verified sample replay finished. It does not claim a live Solari session.")).toBeVisible();
  await expect(page.getByText("Verified sample replay complete. Refresh with Live investigation when an authorized Solari run is configured.")).toBeVisible();
  await expect(page.getByLabel("Investigation result")).toContainText("VERIFIED REPLAY RESULT");
});

test("labels an actual live terminal result as verified without claiming the event is fresh", async ({ page }) => {
  const terminal = {
    stage: "complete",
    message: "Live official-data investigation complete.",
    graph: {
      property: { siteAddress: "1447 SE 17TH TER, CAPE CORAL, FL 33990" },
      events: [{ eventId: "event-1", eventType: "FORECLOSURE_REGISTRATION_OPENED", eventDate: "2026-08-31T17:42:42.000Z", confidence: "HIGH", match: "EXACT" }],
      evidence: [
        { evidenceId: "evidence-1", sourceId: "cape_coral_open_data_code_cases", sourceUrl: "https://example.test/code", retrievedAt: "2026-09-01T15:11:48.000Z", confidence: "HIGH" },
        { evidenceId: "evidence-2", sourceId: "florida_dor_property_tax_data", sourceUrl: "https://example.test/dor", retrievedAt: "2026-09-01T15:11:48.000Z", confidence: "HIGH" },
      ],
    },
    score: { score: 32, confidence: "HIGH", reasons: [{ points: 18, label: "Source-dated registration within 7 days" }, { points: 14, label: "Vacant-property foreclosure registration signal" }], unknown: ["Court filing unavailable"], disclaimer: "Decision support only." },
  };
  await page.route("**/api/investigations", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify(terminal)}\n\n` }));
  await page.goto("/");
  await page.getByRole("button", { name: "Investigate live" }).click();
  await expect(page.getByLabel("Investigation result")).toContainText("LIVE VERIFIED RESULT");
  await expect(page.getByLabel("Investigation result")).not.toContainText("FRESH LIVE RESULT");
});

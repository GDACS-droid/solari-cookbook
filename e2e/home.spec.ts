import { expect, test } from "@playwright/test";

// Next's dev server rejects the HMR socket when the browser origin is 127.0.0.1.
// Keep browser-driven interaction tests on the same localhost origin as dev.
test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL?.replace("127.0.0.1", "localhost") ?? "http://localhost:3000" });

test("shows the daily queue and a property-first evidence brief", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What changed in Southwest Florida property distress today?" })).toBeVisible();
  await expect(page.getByText("Verified public-record sample")).toBeVisible();
  await expect(page.getByText("3302 E 3rd St").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Evidence ledger" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Source readiness, at a glance" })).toBeVisible();
});

test("has an accessible live-investigation action", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Investigate" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Use authorized live Solari run" }).check();
  await expect(page.getByLabel("Demo access token")).toBeVisible();
  await page.getByLabel("Demo access token").fill("e2e-demo-token");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(page.getByRole("button", { name: "Investigate" })).toBeVisible();
  await expect(page.getByText("Solari Browser").first()).toBeVisible();
  await expect(page.getByText("Solari Sandbox")).toBeVisible();
});

test("replays the verified investigation without claiming it is live", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Investigate" }).click();
  await expect(page.getByText("Verified sample replay finished. It does not claim a live Solari session.")).toBeVisible();
  await expect(page.getByText("Verified sample replay complete. Refresh with Live investigation when an authorized Solari run is configured.")).toBeVisible();
  await expect(page.getByLabel("Investigation result")).toContainText("VERIFIED REPLAY RESULT");
});

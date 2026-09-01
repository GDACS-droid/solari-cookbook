import { expect, test } from "@playwright/test";

test.use({ baseURL: process.env.PLAYWRIGHT_BASE_URL?.replace("127.0.0.1", "localhost") ?? "http://localhost:3107" });

test("publishes a source-backed Cape Coral monitor without a continuously-live claim", async ({ page }) => {
  await page.goto("/florida/cape-coral/property-distress");

  await expect(page.getByRole("heading", { name: "Cape Coral Property Distress Monitor" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What changed in Cape Coral property distress?" })).toBeVisible();
  await expect(page.getByText("five municipal foreclosure-registration records")).toBeVisible();
  await expect(page.getByText(/not a complete current market count/)).toBeVisible();
  await expect(page.getByText(/not court filings, judgments, auctions/)).toBeVisible();
  await expect(page.getByRole("link", { name: /City of Cape Coral Code Enforcement Open Data/ })).toHaveAttribute("href", /capeims\.capecoral\.gov/);
  await expect(page.getByRole("link", { name: /Florida DOR Property Tax Data Portal/ })).toHaveAttribute("href", /floridarevenue\.com/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://acrebrief.com/florida/cape-coral/property-distress");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary");
  await expect(page.getByRole("link", { name: /founding pilot|discuss a founding pilot/i })).toHaveCount(0);
});

test("renders honest article and breadcrumb structured data", async ({ page }) => {
  await page.goto("/florida/cape-coral/property-distress");

  const records = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) =>
    scripts.map((script) => JSON.parse(script.textContent ?? "{}") as { "@type"?: string }),
  );

  expect(records.map((record) => record["@type"])).toEqual(
    expect.arrayContaining(["Organization", "Article", "BreadcrumbList"]),
  );
  expect(records.map((record) => record["@type"])).not.toContain("SoftwareApplication");
});

test("exposes crawler instructions and a sitemap containing only real public routes", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(robots.ok()).toBe(true);
  const robotsText = await robots.text();
  expect(robotsText).toContain("User-Agent: OAI-SearchBot");
  expect(robotsText).toContain("User-Agent: PerplexityBot");
  expect(robotsText).toContain("Disallow: /api/");
  expect(robotsText).toContain("Sitemap: https://acrebrief.com/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.ok()).toBe(true);
  const sitemapText = await sitemap.text();
  expect(sitemapText).toContain("https://acrebrief.com/");
  expect(sitemapText).toContain("https://acrebrief.com/florida/cape-coral/property-distress");
  expect(sitemapText).not.toContain("charlotte-county");
  expect(sitemapText).not.toContain("collier-county");
});

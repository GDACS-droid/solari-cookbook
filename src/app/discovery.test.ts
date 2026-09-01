import { describe, expect, it } from "vitest";
import robots from "./robots";
import sitemap from "./sitemap";

describe("public discovery metadata", () => {
  it("allows named search crawlers to index public pages without crawling APIs", () => {
    const rules = robots().rules;
    expect(Array.isArray(rules)).toBe(true);
    expect(rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userAgent: "Googlebot", allow: "/", disallow: "/api/" }),
        expect.objectContaining({ userAgent: "Bingbot", allow: "/", disallow: "/api/" }),
        expect.objectContaining({ userAgent: "OAI-SearchBot", allow: "/", disallow: "/api/" }),
        expect.objectContaining({ userAgent: "PerplexityBot", allow: "/", disallow: "/api/" }),
      ]),
    );
  });

  it("publishes only routes that exist and carry substantive content", () => {
    expect(sitemap().map(({ url }) => url)).toEqual([
      "https://acrebrief.com/",
      "https://acrebrief.com/florida/cape-coral/property-distress",
    ]);
  });
});

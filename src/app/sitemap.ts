import type { MetadataRoute } from "next";

const lastVerified = new Date("2026-09-01T00:00:00.000Z");

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://acrebrief.com/",
      lastModified: lastVerified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: "https://acrebrief.com/florida/cape-coral/property-distress",
      lastModified: lastVerified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}

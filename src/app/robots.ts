import type { MetadataRoute } from "next";

const publicSearchBots = ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: "/api/" },
      ...publicSearchBots.map((userAgent) => ({ userAgent, allow: "/", disallow: "/api/" })),
    ],
    sitemap: "https://acrebrief.com/sitemap.xml",
    host: "https://acrebrief.com",
  };
}

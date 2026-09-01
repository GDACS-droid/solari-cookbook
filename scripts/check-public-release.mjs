import { execFileSync } from "node:child_process";

const publicRoutes = [
  { url: "https://acrebrief.com/", marker: "What changed in Southwest Florida property distress today?" },
  { url: "https://acrebrief.com/florida/cape-coral/property-distress", marker: "Cape Coral Property Distress Monitor" },
  { url: "https://acrebrief.com/robots.txt", marker: "User-Agent: OAI-SearchBot" },
  { url: "https://acrebrief.com/sitemap.xml", marker: "https://acrebrief.com/florida/cape-coral/property-distress" },
];
const searchBots = ["Googlebot", "Bingbot", "OAI-SearchBot", "PerplexityBot"];

async function readPublic(url, init) {
  const response = await fetch(url, { ...init, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return body;
}

const localSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const branchResponse = await fetch("https://api.github.com/repos/GDACS-droid/solari-cookbook/commits/main", {
  headers: { Accept: "application/vnd.github+json", "User-Agent": "AcreBrief-release-check" },
  signal: AbortSignal.timeout(15_000),
});
if (!branchResponse.ok) throw new Error(`GitHub main lookup returned HTTP ${branchResponse.status}`);
const branch = await branchResponse.json();
if (branch.sha !== localSha) throw new Error(`Public main ${branch.sha.slice(0, 12)} does not match local release ${localSha.slice(0, 12)}`);

for (const route of publicRoutes) {
  const body = await readPublic(route.url);
  if (!body.includes(route.marker)) throw new Error(`${route.url} did not contain its release marker`);
}

for (const userAgent of searchBots) {
  const body = await readPublic("https://acrebrief.com/", { headers: { "User-Agent": userAgent } });
  if (!body.includes("AcreBrief")) throw new Error(`Homepage response to ${userAgent} did not contain the AcreBrief marker`);
}

console.log(`public release verified at ${localSha.slice(0, 12)}: GitHub, four routes, and four crawler user agents`);

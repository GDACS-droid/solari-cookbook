import { readFile } from "node:fs/promises"

const tracePath = new URL("../.next/server/app/api/investigations/route.js.nft.json", import.meta.url)
const trace = JSON.parse(await readFile(tracePath, "utf8"))
const files = Array.isArray(trace.files) ? trace.files : []

if (!files.some((file) => file.endsWith("node_modules/patchright-core/browsers.json"))) {
  throw new Error("investigations function trace is missing patchright-core/browsers.json")
}

if (files.some((file) => /node_modules\/@solarisdk\/(browser|sdk)-[a-f0-9]+$/.test(file))) {
  throw new Error("Solari clients must be bundled instead of emitted as hashed external-package symlinks")
}

console.log("validated investigations function trace: Solari clients bundled; Patchright manifest included")

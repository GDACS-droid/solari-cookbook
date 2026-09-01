import { chromium } from "@playwright/test"
import { mkdir, rename, unlink } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
const recordLive = process.env.ACREBRIEF_RECORD_LIVE === "true"
const outputDirectory = "assets/demo"
const run = promisify(execFile)
await mkdir(outputDirectory, { recursive: true })

const browser = await chromium.launch({ channel: "chrome" })
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  recordVideo: { dir: outputDirectory, size: { width: 1280, height: 720 } },
  colorScheme: "light",
})
const page = await context.newPage()
const video = page.video()

const pause = (milliseconds) => page.waitForTimeout(milliseconds)
const show = async (selector, milliseconds) => {
  await page.locator(selector).scrollIntoViewIfNeeded()
  await pause(900)
  await pause(milliseconds)
}

await page.goto(baseURL, { waitUntil: "networkidle" })
page.setDefaultTimeout(180_000)
await pause(4_000)
await show("#today", 4_000)
await show(".property-card", 4_000)
if (recordLive) {
  await page.getByRole("button", { name: "Investigate this property live" }).click()
} else {
  await show("#investigate", 4_000)
  await page.getByRole("checkbox", { name: "Run live with Solari" }).uncheck()
  await page.getByRole("button", { name: "Investigate live" }).click()
}
await page.getByLabel("Investigation result").waitFor({ state: "visible" })
await show(".live-run", 6_000)
await show("#operations", 4_000)
await show("#pilot", 4_000)
await page.locator("#top").scrollIntoViewIfNeeded()
await pause(3_000)

await context.close()
await browser.close()
const recordedPath = await video.path()
const intermediatePath = `${outputDirectory}/acrebrief-demo.webm`
const finalPath = `${outputDirectory}/acrebrief-demo.mp4`
await rename(recordedPath, intermediatePath)
// The real DOR archive download is intentionally visible but can spend tens of
// seconds without a new frame. Compress the walkthrough to the challenge's
// 60–90 second window without cutting or fabricating any source transition.
await run("ffmpeg", ["-y", "-i", intermediatePath, "-vf", "setpts=PTS/1.4,tpad=stop_mode=clone:stop_duration=2", "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", finalPath])
await unlink(intermediatePath)

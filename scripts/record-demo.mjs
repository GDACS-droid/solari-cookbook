import { chromium } from "@playwright/test"
import { mkdir, rename, unlink } from "node:fs/promises"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"
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
await pause(7_000)
await show("#today", 7_000)
await show(".property-card", 7_000)
await show("#investigate", 8_000)
await page.getByRole("button", { name: "Investigate" }).click()
await page.getByLabel("Investigation result").waitFor({ state: "visible" })
await show(".live-run", 10_000)
await show("#operations", 7_000)
await show("#pilot", 7_000)
await page.locator("#top").scrollIntoViewIfNeeded()
await pause(5_000)

await context.close()
await browser.close()
const recordedPath = await video.path()
const intermediatePath = `${outputDirectory}/acrebrief-demo.webm`
const finalPath = `${outputDirectory}/acrebrief-demo.mp4`
await rename(recordedPath, intermediatePath)
await run("ffmpeg", ["-y", "-i", intermediatePath, "-c:v", "libx264", "-preset", "medium", "-crf", "28", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", finalPath])
await unlink(intermediatePath)

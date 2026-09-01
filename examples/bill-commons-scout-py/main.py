"""Bill Commons Scout's bounded, evidence-first Solari example.

``python main.py`` is a free deterministic contract test. ``--live`` opens the
Florida Senate's bill-category page in one recorded Solari browser session, uses
browser interactions to inspect amendment and analysis tabs, and releases the
remote session on every path. The command emits no secret, session identifier,
browser capability URL, cookie, or replay URL.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import html
import json
import os
import re
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Protocol
from urllib.parse import urljoin, urlsplit, urlunsplit

OFFICIAL_HOSTS = frozenset({"flsenate.gov", "www.flsenate.gov"})
TARGET = "https://www.flsenate.gov/Session/Bill/2026/625/ByCategory"
MAX_DOCUMENT_BYTES = 256 * 1024
MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
MAX_PAGES = 1
MAX_ACTIONS = 3
MAX_ROUTED_REQUESTS = 32
WALL_SECONDS = 45
ACTION_SECONDS = 10
CLEANUP_SECONDS = 10
LOCAL_ENV_PATH = Path(__file__).with_name(".env.local")
ARTIFACT_PATH = Path(__file__).parent / "artifacts/live/florida-senate-hb625.png"


def admit_official_url(value: str) -> str:
    """Canonicalize a single public Florida Senate HTTPS URL, or reject it."""
    parsed = urlsplit(value)
    host = (parsed.hostname or "").rstrip(".").lower()
    if (
        parsed.scheme != "https"
        or host not in OFFICIAL_HOSTS
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        raise ValueError("source_not_admitted")
    return urlunsplit(("https", host, parsed.path or "/", parsed.query, ""))


def load_local_env_value(path: Path, key: str) -> str | None:
    """Read one literal dotenv value; never execute or expand a local env file."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return None
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        name, raw_value = stripped.split("=", 1)
        if name.strip() != key:
            continue
        value = raw_value.strip()
        if len(value) >= 2 and value[:1] == value[-1:] and value[:1] in {"'", '"'}:
            value = value[1:-1]
        if not value or "\x00" in value or "\n" in value or "\r" in value:
            return None
        return value
    return None


def solari_api_key() -> str | None:
    return os.environ.get("SOLARI_API_KEY") or load_local_env_value(
        LOCAL_ENV_PATH, "SOLARI_API_KEY"
    )


def clean_text(value: str) -> str:
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(html.unescape(value).split())


def table_cells(row: str) -> list[str]:
    return [clean_text(cell) for cell in re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.I | re.S)]


@dataclass(frozen=True)
class OfficialArtifact:
    kind: str
    identifier: str
    title: str
    source_url: str
    detail: str
    published_at: str


@dataclass(frozen=True)
class Capture:
    url: str
    title: str
    sha256: str
    mechanism: str
    artifacts: tuple[OfficialArtifact, ...]
    elapsed_ms: int = 0
    pages: int = 0
    actions: int = 0
    routed_requests: int = 0
    session_fingerprint: str | None = None
    replay_available: bool = False
    cleanup_confirmed: bool = False
    screenshot: str | None = None


@dataclass(frozen=True)
class CleanupOutcome:
    confirmed: bool
    replay_available: bool
    errors: tuple[str, ...]


def extract_official_artifacts(page_html: str, base_url: str) -> tuple[OfficialArtifact, ...]:
    """Extract only explicit first-party amendment and analysis links from the page."""
    base = admit_official_url(base_url)
    artifacts: list[OfficialArtifact] = []
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", page_html, re.I | re.S):
        cells = table_cells(row)
        hrefs = re.findall(r"href\s*=\s*[\"']?([^\"'\s>]+)", row, re.I)
        for href in hrefs:
            candidate = urljoin(base, html.unescape(href))
            candidate_path = urlsplit(candidate).path
            amendment = re.search(r"/Amendment/(\d+)/HTML$", candidate_path, re.I)
            if amendment and cells:
                absolute = admit_official_url(candidate)
                identifier = amendment.group(1)
                artifacts.append(
                    OfficialArtifact(
                        kind="amendment",
                        identifier=identifier,
                        title=f"Amendment {identifier}",
                        source_url=absolute,
                        detail=cells[0],
                        published_at=cells[2] if len(cells) > 2 else "",
                    )
                )
                break
            analysis = re.search(r"/Analyses/([^/]+\.PDF)$", candidate_path, re.I)
            if analysis and len(cells) >= 4:
                absolute = admit_official_url(candidate)
                identifier = analysis.group(1)
                artifacts.append(
                    OfficialArtifact(
                        kind="bill_analysis",
                        identifier=identifier,
                        title=f"Bill analysis — {cells[2]}",
                        source_url=absolute,
                        detail=cells[1],
                        published_at=cells[3],
                    )
                )
                break
    deduped: dict[tuple[str, str], OfficialArtifact] = {
        (artifact.kind, artifact.identifier): artifact for artifact in artifacts
    }
    return tuple(deduped.values())


def make_capture(
    url: str,
    page_html: str,
    *,
    title: str,
    mechanism: str,
    elapsed_ms: int = 0,
    pages: int = 0,
    actions: int = 0,
    routed_requests: int = 0,
    session_fingerprint: str | None = None,
    replay_available: bool = False,
    cleanup_confirmed: bool = False,
    screenshot: str | None = None,
) -> Capture:
    encoded = page_html.encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise ValueError("source_too_large")
    artifacts = extract_official_artifacts(page_html, url)
    if not any(item.kind == "amendment" and item.identifier == "154926" for item in artifacts):
        raise RuntimeError("expected_amendment_not_found")
    if not any(item.kind == "bill_analysis" for item in artifacts):
        raise RuntimeError("expected_analysis_not_found")
    return Capture(
        url=admit_official_url(url),
        title=" ".join(title.split())[:160],
        sha256=hashlib.sha256(encoded).hexdigest(),
        mechanism=mechanism,
        artifacts=artifacts,
        elapsed_ms=elapsed_ms,
        pages=pages,
        actions=actions,
        routed_requests=routed_requests,
        session_fingerprint=session_fingerprint,
        replay_available=replay_available,
        cleanup_confirmed=cleanup_confirmed,
        screenshot=screenshot,
    )


FIXTURE_HTML = """
<main><h1>Fixture only: Florida Senate bill-category page shape</h1>
<table><tr><td>154926 - Amendment<br>Delete lines 27 - 28 and insert:</td>
<td>Bradley</td><td>3/4/2026 7:25 PM</td><td>House: Concur</td>
<td><a href=/Session/Bill/2026/625/Amendment/154926/HTML>Web Page</a></td></tr></table>
<table><tr><td>Bill Analysis</td><td>H 625</td><td>Judiciary Committee (Post-Meeting)</td>
<td>2/3/2026 3:02 PM</td><td><a href=/Session/Bill/2026/625/Analyses/h0625c.JDC.PDF>PDF</a></td></tr></table>
</main>
"""


class ResearchBrowserProvider(Protocol):
    async def capture(self, url: str) -> Capture: ...


class FixtureResearchBrowserProvider:
    """Free, deterministic path for CI and contributor onboarding."""

    async def capture(self, url: str) -> Capture:
        return make_capture(
            url,
            FIXTURE_HTML,
            title="Fixture only — Florida Senate bill-category page shape",
            mechanism="fixture",
        )


async def cleanup_live_resources(*, solari, browser, playwright, session_id: str | None) -> CleanupOutcome:
    """Close local and remote resources in order, without short-circuiting cleanup."""
    errors: list[str] = []
    released = replay_available = False
    if browser is not None:
        try:
            await asyncio.wait_for(browser.close(), CLEANUP_SECONDS)
        except Exception:
            errors.append("browser_close_failed")
    if playwright is not None:
        try:
            await asyncio.wait_for(playwright.stop(), CLEANUP_SECONDS)
        except Exception:
            errors.append("playwright_stop_failed")
    if session_id is not None:
        try:
            await asyncio.wait_for(solari.sessions.release_and_wait(session_id), CLEANUP_SECONDS)
            released = True
        except Exception:
            errors.append("remote_release_failed")
        if released:
            deadline = time.monotonic() + CLEANUP_SECONDS - 1
            while time.monotonic() < deadline:
                try:
                    await asyncio.wait_for(solari.sessions.get_replay_url(session_id), timeout=1)
                    replay_available = True
                    break
                except Exception:
                    await asyncio.sleep(0.5)
    try:
        await asyncio.wait_for(solari.close(), CLEANUP_SECONDS)
    except Exception:
        errors.append("client_close_failed")
    return CleanupOutcome(
        confirmed=session_id is None or released,
        replay_available=replay_available,
        errors=tuple(errors),
    )


class SolariResearchBrowserProvider:
    """One-session, recorded browser fallback for the official Florida portal."""

    async def capture(self, url: str) -> Capture:
        api_key = solari_api_key()
        if not api_key:
            raise RuntimeError("missing_solari_api_key")
        canonical = admit_official_url(url)
        try:
            from patchright.async_api import async_playwright
            from solari_browser import Solari
        except ImportError as exc:
            raise RuntimeError("missing_live_dependencies") from exc

        started = time.monotonic()
        solari = Solari(api_key=api_key, timeout_ms=WALL_SECONDS * 1000)
        session_id: str | None = None
        playwright = browser = page = None
        page_html = ""
        page_title = "Florida Senate bill-category page"
        pages = actions = routed_requests = 0
        replay_available = cleanup_confirmed = False
        screenshot: str | None = None
        try:
            async with asyncio.timeout(WALL_SECONDS):
                session = await solari.sessions.create(recording=True)
                session_id = str(session.id)  # used privately for cleanup/fingerprint only
                playwright = await async_playwright().start()
                browser = await playwright.chromium.connect(session.ws_endpoint)
                page = await browser.new_page()
                pages = 1
                page.set_default_timeout(ACTION_SECONDS * 1000)

                async def admit_route(route) -> None:
                    nonlocal routed_requests
                    routed_requests += 1
                    if routed_requests > MAX_ROUTED_REQUESTS:
                        await route.abort()
                        return
                    try:
                        admit_official_url(route.request.url)
                    except (TypeError, ValueError):
                        await route.abort()
                    else:
                        await route.continue_()

                await page.route("**/*", admit_route)
                await page.goto(canonical, timeout=ACTION_SECONDS * 1000, wait_until="domcontentloaded")
                await page.wait_for_selector("#optionAmendments")
                await page.locator("#optionAmendments").click()
                actions += 1
                await page.wait_for_selector("#FloorAmendment:visible")
                await page.locator("#optionAnalyses").click()
                actions += 1
                await page.wait_for_selector("#tabBodyAnalyses:visible")
                if actions > MAX_ACTIONS or pages > MAX_PAGES:
                    raise RuntimeError("browser_budget_exceeded")
                page_title = await page.title()
                page_html = await page.content()
                if len(page_html.encode("utf-8")) > MAX_DOCUMENT_BYTES:
                    raise RuntimeError("source_too_large")
                ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(ARTIFACT_PATH), full_page=False)
                if ARTIFACT_PATH.stat().st_size > MAX_SCREENSHOT_BYTES:
                    raise RuntimeError("screenshot_too_large")
                screenshot = str(ARTIFACT_PATH.relative_to(Path(__file__).parent))
                admit_official_url(page.url)
        finally:
            cleanup = await cleanup_live_resources(
                solari=solari, browser=browser, playwright=playwright, session_id=session_id
            )
            cleanup_confirmed = cleanup.confirmed
            replay_available = cleanup.replay_available
        if cleanup.errors or not cleanup_confirmed:
            raise RuntimeError("remote_cleanup_failed")

        return make_capture(
            canonical,
            page_html,
            title=page_title,
            mechanism="solari_browser",
            elapsed_ms=int((time.monotonic() - started) * 1000),
            pages=pages,
            actions=actions,
            routed_requests=routed_requests,
            session_fingerprint=hashlib.sha256(session_id.encode()).hexdigest()[:12],
            replay_available=replay_available,
            cleanup_confirmed=cleanup_confirmed,
            screenshot=screenshot,
        )


def public_error_code(error: Exception) -> str:
    """Avoid surfacing SDK/network error text, which may include capabilities."""
    known = {
        "missing_solari_api_key", "missing_live_dependencies", "source_not_admitted",
        "source_too_large", "screenshot_too_large", "browser_budget_exceeded",
        "expected_amendment_not_found", "expected_analysis_not_found", "remote_cleanup_failed",
    }
    return str(error) if str(error) in known else "live_browser_failed"


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="use one recorded Solari browser session")
    args = parser.parse_args()
    provider: ResearchBrowserProvider = SolariResearchBrowserProvider() if args.live else FixtureResearchBrowserProvider()
    try:
        result = await provider.capture(TARGET)
    except Exception as error:
        print(json.dumps({"ok": False, "error": public_error_code(error)}))
        return 1
    print(json.dumps({"ok": True, "capture": asdict(result)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

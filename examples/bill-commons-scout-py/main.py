"""Bill Commons Scout: evidence-first government research with Solari fallback.

The fixture path is deterministic and free. ``--live`` is an explicit one-session
smoke against an allowlisted public government homepage; it records and releases
the session and never prints the API key.
"""
from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import os
import time
from dataclasses import asdict, dataclass
from html.parser import HTMLParser
from typing import Protocol
from urllib.parse import urlsplit, urlunsplit

OFFICIAL_HOSTS = frozenset({
    "flsenate.gov",
    "www.flsenate.gov",
    "leg.state.fl.us",
    "www.leg.state.fl.us",
})
TARGET = "https://www.leg.state.fl.us/robots.txt"
MAX_HTML_BYTES = 256 * 1024
WALL_SECONDS = 45
CLEANUP_SECONDS = 10


def admit_official_url(value: str) -> str:
    parsed = urlsplit(value)
    host = (parsed.hostname or "").rstrip(".").lower()
    if (
        parsed.scheme != "https"
        or host not in OFFICIAL_HOSTS
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or parsed.fragment
    ):
        raise ValueError("source_not_admitted")
    return urlunsplit(("https", host, parsed.path or "/", parsed.query, ""))


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.parts: list[str] = []

    def handle_data(self, data: str) -> None:
        text = " ".join(data.split())
        if text:
            self.parts.append(text)


@dataclass(frozen=True)
class Capture:
    url: str
    title: str
    excerpt: str
    sha256: str
    mechanism: str
    session_ref: str | None = None
    replay_available: bool = False
    elapsed_ms: int = 0


class ResearchBrowserProvider(Protocol):
    async def capture(self, url: str) -> Capture: ...


def evidence(url: str, body: bytes, *, mechanism: str, session_ref: str | None = None,
             replay_available: bool = False, elapsed_ms: int = 0) -> Capture:
    if len(body) > MAX_HTML_BYTES:
        raise ValueError("source_too_large")
    parser = TextExtractor()
    parser.feed(body.decode("utf-8", errors="replace"))
    text = " ".join(parser.parts)
    return Capture(
        url=admit_official_url(url),
        title="Florida Online Sunshine official robots policy",
        excerpt=text[:240],
        sha256=hashlib.sha256(body).hexdigest(),
        mechanism=mechanism,
        session_ref=session_ref,
        replay_available=replay_available,
        elapsed_ms=elapsed_ms,
    )


class FixtureResearchBrowserProvider:
    async def capture(self, url: str) -> Capture:
        body = b"<main><h1>Florida Senate</h1><p>Deterministic public demo fixture.</p></main>"
        return evidence(url, body, mechanism="fixture")


class SolariResearchBrowserProvider:
    async def capture(self, url: str) -> Capture:
        api_key = os.environ.get("SOLARI_API_KEY")
        if not api_key:
            raise RuntimeError("SOLARI_API_KEY is required only for --live")
        canonical = admit_official_url(url)
        try:
            from solari_browser import Solari
        except ImportError as exc:
            raise RuntimeError("Install requirements.txt before --live") from exc

        from patchright.async_api import async_playwright

        started = time.monotonic()
        solari = Solari(api_key=api_key, timeout_ms=WALL_SECONDS * 1000)
        session_id = None
        playwright = None
        browser = None
        body = b""
        replay_available = False
        try:
            # Drive work is bounded separately from cleanup so timeout
            # cancellation cannot consume the release budget.
            async with asyncio.timeout(WALL_SECONDS):
                session = await solari.sessions.create(recording=True)
                session_id = str(session.id)  # retain privately before connect
                playwright = await async_playwright().start()
                browser = await playwright.chromium.connect(session.ws_endpoint)
                page = await browser.new_page()

                async def admit_route(route) -> None:
                    try:
                        admit_official_url(route.request.url)
                    except (TypeError, ValueError):
                        await route.abort()
                    else:
                        await route.continue_()

                await page.route("**/*", admit_route)
                await page.goto(
                    canonical,
                    timeout=WALL_SECONDS * 1000,
                    wait_until="domcontentloaded",
                )
                body = (await page.content()).encode()
        finally:
            if browser is not None:
                try:
                    await asyncio.wait_for(browser.close(), CLEANUP_SECONDS)
                except Exception:
                    pass
            if playwright is not None:
                try:
                    await asyncio.wait_for(playwright.stop(), CLEANUP_SECONDS)
                except Exception:
                    pass
            if session_id is not None:
                # This is the authoritative remote cleanup even if connection
                # or navigation failed; 404 is idempotent success in the SDK.
                await asyncio.wait_for(
                    solari.sessions.release_and_wait(session_id), CLEANUP_SECONDS
                )
                deadline = time.monotonic() + CLEANUP_SECONDS - 1
                while time.monotonic() < deadline:
                    try:
                        await asyncio.wait_for(
                            solari.sessions.get_replay_url(session_id), timeout=1
                        )
                        replay_available = True
                        break
                    except Exception:
                        await asyncio.sleep(0.5)
            await asyncio.wait_for(solari.close(), CLEANUP_SECONDS)

        if b"User-agent" not in body:
            raise RuntimeError("unexpected_official_content")

        return evidence(
            canonical,
            body,
            mechanism="solari_browser",
            session_ref=hashlib.sha256(session_id.encode()).hexdigest()[:12],
            replay_available=replay_available,
            elapsed_ms=int((time.monotonic() - started) * 1000),
        )


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="spend one recorded Solari session")
    args = parser.parse_args()
    provider: ResearchBrowserProvider = (
        SolariResearchBrowserProvider() if args.live else FixtureResearchBrowserProvider()
    )
    result = await provider.capture(TARGET)
    print(json.dumps(asdict(result), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

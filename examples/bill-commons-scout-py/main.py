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

OFFICIAL_HOSTS = frozenset({"flsenate.gov", "www.flsenate.gov"})
TARGET = "https://www.flsenate.gov/"
MAX_HTML_BYTES = 256 * 1024
WALL_SECONDS = 45


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
    session_id: str | None = None
    replay_url: str | None = None
    elapsed_ms: int = 0


class ResearchBrowserProvider(Protocol):
    async def capture(self, url: str) -> Capture: ...


def evidence(url: str, body: bytes, *, mechanism: str, session_id: str | None = None,
             replay_url: str | None = None, elapsed_ms: int = 0) -> Capture:
    if len(body) > MAX_HTML_BYTES:
        raise ValueError("source_too_large")
    parser = TextExtractor()
    parser.feed(body.decode("utf-8", errors="replace"))
    text = " ".join(parser.parts)
    return Capture(
        url=admit_official_url(url),
        title="Florida Senate official homepage",
        excerpt=text[:240],
        sha256=hashlib.sha256(body).hexdigest(),
        mechanism=mechanism,
        session_id=session_id,
        replay_url=replay_url,
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

        started = time.monotonic()
        async with asyncio.timeout(WALL_SECONDS):
            async with Solari(api_key=api_key, timeout_ms=WALL_SECONDS * 1000) as solari:
                browser = await solari.launch(recording=True)
                session_id = str(browser.id)
                body = b""
                replay_url = None
                try:
                    page = await browser.new_page()

                    async def admit_route(route) -> None:
                        try:
                            admit_official_url(route.request.url)
                        except (TypeError, ValueError):
                            await route.abort()
                        else:
                            await route.continue_()

                    await page.route("**/*", admit_route)
                    await page.goto(canonical, timeout=WALL_SECONDS * 1000)
                    body = (await page.content()).encode()
                finally:
                    # BrowserSession.close releases the remote session. Cleanup
                    # remains in finally even if navigation or extraction fails.
                    await browser.close()

                # Replay upload is asynchronous after release. It is useful audit
                # material, never the source of record, so polling is bounded.
                for _ in range(10):
                    try:
                        replay = await asyncio.wait_for(
                            solari.sessions.get_replay_url(session_id), timeout=1
                        )
                        replay_url = str(getattr(replay, "url", replay))
                        break
                    except Exception:
                        await asyncio.sleep(1)

        return evidence(
            canonical,
            body,
            mechanism="solari_browser",
            session_id=session_id,
            replay_url=replay_url,
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

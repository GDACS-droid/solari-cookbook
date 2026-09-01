"""Bill Commons Scout's bounded, evidence-first Solari example.

``python main.py`` is a free deterministic contract test. ``--live`` opens the
Florida Legislature's Online Sunshine statute portal in one recorded Solari
browser session, navigates from chapter 43 to section 43.16, verifies current-law
language and its chapter-law history, and releases every identified remote session.
The command emits no secret, session identifier, browser capability URL, cookie,
or replay URL.
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
from html.parser import HTMLParser
from pathlib import Path
from typing import Protocol
from urllib.parse import parse_qs, urlsplit, urlunsplit

OFFICIAL_HOSTS = frozenset({"leg.state.fl.us", "www.leg.state.fl.us"})
TARGET = (
    "https://www.leg.state.fl.us/statutes/index.cfm?"
    "App_mode=Display_Statute&URL=0000-0099%2F0043%2F0043ContentsIndex.html"
)
SECTION_URL = (
    "https://www.leg.state.fl.us/statutes/index.cfm?"
    "App_mode=Display_Statute&URL=0000-0099%2F0043%2FSections%2F0043.16.html"
)
MAX_DOCUMENT_BYTES = 256 * 1024
MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024
MAX_PAGES = 1
MAX_ACTIONS = 2
MAX_ROUTED_REQUESTS = 48
WALL_SECONDS = 45
ACTION_SECONDS = 10
CLEANUP_SECONDS = 10
LOCAL_ENV_PATH = Path(__file__).with_name(".env.local")
ARTIFACT_PATH = Path(__file__).parent / "artifacts/live/florida-statute-43-16.png"
NAVIGATION_ARTIFACT_PATH = (
    Path(__file__).parent / "artifacts/live/florida-statutes-chapter-43.png"
)


def admit_official_url(value: str) -> str:
    """Canonicalize a single public Florida Legislature HTTPS URL, or reject it."""
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


def admit_section_url(value: str) -> str:
    """Require the exact Online Sunshine route for current section 43.16."""
    canonical = admit_official_url(value)
    parsed = urlsplit(canonical)
    if parsed.path.casefold() != "/statutes/index.cfm":
        raise ValueError("unexpected_final_url")
    query = parse_qs(parsed.query, keep_blank_values=True)
    if query.get("App_mode") != ["Display_Statute"] or query.get("URL") != [
        "0000-0099/0043/Sections/0043.16.html"
    ]:
        raise ValueError("unexpected_final_url")
    if set(query) - {"App_mode", "Search_String", "URL"}:
        raise ValueError("unexpected_final_url")
    return canonical


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
    replay_available: bool = False
    cleanup_confirmed: bool = False
    navigation_screenshot: str | None = None
    screenshot: str | None = None


@dataclass(frozen=True)
class CleanupOutcome:
    confirmed: bool
    replay_available: bool
    errors: tuple[str, ...]


class LiveBrowserError(RuntimeError):
    """Fixed-shape public diagnostic; never retains SDK exception text."""

    def __init__(self, phase: str, reason: str, *, cleanup_confirmed: bool) -> None:
        self.phase = phase if phase in {"create", "connect", "navigate", "interact", "extract"} else "unknown"
        self.reason = reason if reason in {
            "timeout", "connection_reset", "dns", "browser_closed", "net_failed", "unexpected"
        } else "unexpected"
        self.cleanup_confirmed = cleanup_confirmed
        super().__init__(f"live_browser_{self.phase}_{self.reason}")


def live_failure_reason(error: BaseException) -> str:
    """Map transport text to our enum without returning the original text."""
    if isinstance(error, (asyncio.TimeoutError, TimeoutError)):
        return "timeout"
    message = str(error)
    markers = (
        ("ERR_CONNECTION_RESET", "connection_reset"),
        ("ERR_NAME_NOT_RESOLVED", "dns"),
        ("Target page, context or browser has been closed", "browser_closed"),
        ("ERR_FAILED", "net_failed"),
    )
    return next((reason for marker, reason in markers if marker in message), "unexpected")


@dataclass(frozen=True)
class _ParsedSection:
    number: str
    catchline: str
    paragraphs: tuple[str, ...]
    history: str


class _StatuteSectionParser(HTMLParser):
    """Bind fields to each actual ``div.Section`` instead of page-wide text."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.depth = 0
        self.section_depth: int | None = None
        self.captures: list[tuple[str, int, list[str]]] = []
        self.number = ""
        self.catchline = ""
        self.paragraphs: list[str] = []
        self.history = ""
        self.sections: list[_ParsedSection] = []

    @staticmethod
    def _classes(attrs: list[tuple[str, str | None]]) -> set[str]:
        return {
            value
            for name, raw in attrs
            if name.casefold() == "class" and raw
            for value in raw.split()
        }

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.depth += 1
        classes = self._classes(attrs)
        if tag.casefold() == "div" and "Section" in classes and self.section_depth is None:
            self.section_depth = self.depth
            self.number = self.catchline = self.history = ""
            self.paragraphs = []
            self.captures = []
            return
        if self.section_depth is None:
            return
        for _, _, values in self.captures:
            values.append(" ")
        kind = next(
            (
                value
                for value, marker in (
                    ("number", "SectionNumber"),
                    ("catchline", "CatchlineText"),
                    ("paragraph", "Paragraph"),
                    ("history", "HistoryText"),
                )
                if marker in classes
            ),
            None,
        )
        if kind:
            self.captures.append((kind, self.depth, []))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_data(self, data: str) -> None:
        for _, _, values in self.captures:
            values.append(data)

    def handle_endtag(self, tag: str) -> None:
        finishing = [capture for capture in self.captures if capture[1] == self.depth]
        for kind, _, values in finishing:
            value = " ".join("".join(values).split())
            if kind == "number":
                self.number = value
            elif kind == "catchline":
                self.catchline = value
            elif kind == "paragraph":
                self.paragraphs.append(value)
            elif kind == "history":
                self.history = value
            self.captures.remove((kind, self.depth, values))
        if self.section_depth == self.depth:
            self.sections.append(
                _ParsedSection(
                    number=self.number,
                    catchline=self.catchline,
                    paragraphs=tuple(self.paragraphs),
                    history=self.history,
                )
            )
            self.section_depth = None
            self.captures = []
        self.depth = max(0, self.depth - 1)


def extract_official_artifacts(page_html: str, source_url: str) -> tuple[OfficialArtifact, ...]:
    """Extract exact current-law evidence from one scoped section 43.16 record."""
    try:
        canonical = admit_section_url(source_url)
    except ValueError:
        return ()
    parser = _StatuteSectionParser()
    try:
        parser.feed(page_html)
        parser.close()
    except Exception:
        return ()
    matches = [section for section in parser.sections if section.number == "43.16"]
    if len(matches) != 1:
        return ()
    section = matches[0]
    detail = next(
        (
            paragraph
            for paragraph in section.paragraphs
            if "One judge, or senior judge serving on a court" in paragraph
        ),
        "",
    )
    if (
        "Justice Administrative Commission" not in section.catchline
        or not detail
        or "2026-141" not in section.history
    ):
        return ()
    return (
        OfficialArtifact(
            kind="statute_section",
            identifier="43.16",
            title=section.catchline,
            source_url=canonical,
            detail=detail,
            published_at="s. 1, ch. 2026-141",
        ),
    )


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
    replay_available: bool = False,
    cleanup_confirmed: bool = False,
    navigation_screenshot: str | None = None,
    screenshot: str | None = None,
) -> Capture:
    encoded = page_html.encode("utf-8")
    if len(encoded) > MAX_DOCUMENT_BYTES:
        raise ValueError("source_too_large")
    artifacts = extract_official_artifacts(page_html, url)
    if not any(item.kind == "statute_section" and item.identifier == "43.16" for item in artifacts):
        raise RuntimeError("expected_statute_evidence_not_found")
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
        replay_available=replay_available,
        cleanup_confirmed=cleanup_confirmed,
        navigation_screenshot=navigation_screenshot,
        screenshot=screenshot,
    )


FIXTURE_HTML = """
<main><div class="Section">
<span class="SectionNumber">43.16&#x2003;</span>
<span class="Catchline"><span class="CatchlineText">Justice Administrative Commission; membership, powers and duties.</span></span>
<div class="Paragraph"><span class="Number">(d)</span><span class="Text">One judge, or senior judge serving on a court, to be appointed by the Chief Justice of the Supreme Court.</span></div>
<div class="History"><span class="HistoryText">ss. 1-6, ch. 65-328; s. 1, ch. 2026-141.</span></div>
</div></main>
"""


class ResearchBrowserProvider(Protocol):
    async def capture(self, url: str) -> Capture: ...


class FixtureResearchBrowserProvider:
    """Free, deterministic path for CI and contributor onboarding."""

    async def capture(self, url: str) -> Capture:
        return make_capture(
            SECTION_URL,
            FIXTURE_HTML,
            title="Fixture only — Florida Statutes section 43.16",
            mechanism="fixture",
        )


async def cleanup_live_resources(
    *,
    solari,
    browser,
    playwright,
    session_id: str | None,
    create_outcome_ambiguous: bool = False,
) -> CleanupOutcome:
    """Release paid capacity first, within one total cleanup deadline."""
    errors: list[str] = []
    released = replay_available = False
    deadline = time.monotonic() + CLEANUP_SECONDS

    async def bounded(awaitable, error_code: str) -> bool:
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            close = getattr(awaitable, "close", None)
            if close is not None:
                close()
            errors.append(error_code)
            return False
        try:
            await asyncio.wait_for(awaitable, remaining)
            return True
        except Exception:
            errors.append(error_code)
            return False

    # Remote release is the spend boundary. Local teardown must not consume
    # its deadline or leave the billable session open after a close hang.
    if session_id is not None:
        released = await bounded(
            solari.sessions.release_and_wait(session_id), "remote_release_failed"
        )
    if browser is not None:
        await bounded(browser.close(), "browser_close_failed")
    if playwright is not None:
        await bounded(playwright.stop(), "playwright_stop_failed")
    if session_id is not None:
        if released:
            while time.monotonic() < deadline - 0.25:
                try:
                    await asyncio.wait_for(
                        solari.sessions.get_replay_url(session_id),
                        timeout=min(1, max(0.1, deadline - time.monotonic())),
                    )
                    replay_available = True
                    break
                except Exception:
                    await asyncio.sleep(min(0.5, max(0, deadline - time.monotonic())))
    await bounded(solari.close(), "client_close_failed")
    return CleanupOutcome(
        confirmed=released if session_id is not None else not create_outcome_ambiguous,
        replay_available=replay_available,
        errors=tuple(errors),
    )


def make_solari_client(factory, api_key: str):
    """Disable non-idempotent create retries; the SDK has no idempotency key."""
    return factory(
        api_key=api_key,
        max_attempts=1,
        timeout_ms=WALL_SECONDS * 1000,
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
        solari = make_solari_client(Solari, api_key)
        session_id: str | None = None
        create_attempted = False
        playwright = browser = page = None
        page_html = ""
        page_title = "Florida Statutes section 43.16"
        pages = actions = routed_requests = 0
        replay_available = cleanup_confirmed = False
        navigation_screenshot = screenshot = None
        phase = "create"
        drive_error: BaseException | None = None
        cancelled_error: asyncio.CancelledError | None = None
        try:
            async with asyncio.timeout(WALL_SECONDS):
                create_attempted = True
                session = await solari.sessions.create(recording=True)
                session_id = str(session.id)  # used privately for cleanup only
                phase = "connect"
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
                phase = "navigate"
                await page.goto(canonical, timeout=ACTION_SECONDS * 1000, wait_until="commit")
                actions += 1
                phase = "interact"
                section_link = page.get_by_role("link", name="43.16", exact=True)
                await section_link.wait_for(state="visible")
                NAVIGATION_ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(NAVIGATION_ARTIFACT_PATH), full_page=False)
                if NAVIGATION_ARTIFACT_PATH.stat().st_size > MAX_SCREENSHOT_BYTES:
                    raise RuntimeError("screenshot_too_large")
                navigation_screenshot = str(
                    NAVIGATION_ARTIFACT_PATH.relative_to(Path(__file__).parent)
                )
                async with page.expect_navigation(
                    wait_until="commit", timeout=ACTION_SECONDS * 1000
                ):
                    await section_link.click()
                actions += 1
                await page.locator(".CatchlineText").wait_for(state="visible")
                if actions > MAX_ACTIONS or pages > MAX_PAGES:
                    raise RuntimeError("browser_budget_exceeded")
                phase = "extract"
                page_title = await page.title()
                page_html = await page.content()
                if len(page_html.encode("utf-8")) > MAX_DOCUMENT_BYTES:
                    raise RuntimeError("source_too_large")
                ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
                await page.screenshot(path=str(ARTIFACT_PATH), full_page=False)
                if ARTIFACT_PATH.stat().st_size > MAX_SCREENSHOT_BYTES:
                    raise RuntimeError("screenshot_too_large")
                screenshot = str(ARTIFACT_PATH.relative_to(Path(__file__).parent))
                final_url = admit_section_url(page.url)
        except asyncio.CancelledError as error:
            cancelled_error = error
        except Exception as error:
            drive_error = error
        finally:
            cleanup = await cleanup_live_resources(
                solari=solari,
                browser=browser,
                playwright=playwright,
                session_id=session_id,
                create_outcome_ambiguous=create_attempted and session_id is None,
            )
            cleanup_confirmed = cleanup.confirmed
            replay_available = cleanup.replay_available
        if cancelled_error is not None:
            raise cancelled_error
        if drive_error is not None:
            raise LiveBrowserError(
                phase, live_failure_reason(drive_error), cleanup_confirmed=cleanup_confirmed
            ) from None
        if cleanup.errors or not cleanup_confirmed:
            raise RuntimeError("remote_cleanup_failed")

        return make_capture(
            final_url,
            page_html,
            title=page_title,
            mechanism="solari_browser",
            elapsed_ms=int((time.monotonic() - started) * 1000),
            pages=pages,
            actions=actions,
            routed_requests=routed_requests,
            replay_available=replay_available,
            cleanup_confirmed=cleanup_confirmed,
            navigation_screenshot=navigation_screenshot,
            screenshot=screenshot,
        )


def public_error_code(error: Exception) -> str:
    """Avoid surfacing SDK/network error text, which may include capabilities."""
    known = {
        "missing_solari_api_key", "missing_live_dependencies", "source_not_admitted",
        "source_too_large", "screenshot_too_large", "browser_budget_exceeded",
        "expected_statute_evidence_not_found", "remote_cleanup_failed",
    }
    if isinstance(error, LiveBrowserError):
        return str(error)
    return str(error) if str(error) in known else "live_browser_failed"


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--live", action="store_true", help="use one recorded Solari browser session")
    args = parser.parse_args()
    provider: ResearchBrowserProvider = SolariResearchBrowserProvider() if args.live else FixtureResearchBrowserProvider()
    try:
        result = await provider.capture(TARGET)
    except Exception as error:
        payload = {"ok": False, "error": public_error_code(error)}
        if isinstance(error, LiveBrowserError):
            payload["cleanup_confirmed"] = error.cleanup_confirmed
        print(json.dumps(payload))
        return 1
    print(json.dumps({"ok": True, "capture": asdict(result)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))

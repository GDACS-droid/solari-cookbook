import asyncio
import importlib.util
import json
import sys
import tempfile
import types
import unittest
from pathlib import Path
from unittest.mock import patch


MODULE_PATH = Path(__file__).parents[1] / "main.py"
SPEC = importlib.util.spec_from_file_location("scout_example", MODULE_PATH)
assert SPEC and SPEC.loader
scout = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = scout
SPEC.loader.exec_module(scout)


class ScoutExampleTests(unittest.TestCase):
    def test_cleanup_releases_remote_session_after_local_close_failures(self) -> None:
        events: list[str] = []

        class BrokenBrowser:
            async def close(self) -> None:
                events.append("browser")
                raise RuntimeError("local close failed")

        class Playwright:
            async def stop(self) -> None:
                events.append("playwright")

        class Sessions:
            async def release_and_wait(self, session_id: str) -> None:
                self.session_id = session_id
                events.append("release")

            async def get_replay_url(self, session_id: str) -> str:
                events.append("replay")
                return "private-capability-not-emitted"

        class Solari:
            def __init__(self) -> None:
                self.sessions = Sessions()

            async def close(self) -> None:
                events.append("client")

        outcome = asyncio.run(
            scout.cleanup_live_resources(
                solari=Solari(), browser=BrokenBrowser(), playwright=Playwright(), session_id="private"
            )
        )
        self.assertTrue(outcome.confirmed)
        self.assertTrue(outcome.replay_available)
        self.assertIn("browser_close_failed", outcome.errors)
        self.assertEqual(events, ["release", "browser", "playwright", "replay", "client"])

    def test_fixture_path_is_free_and_has_expected_evidence(self) -> None:
        capture = asyncio.run(scout.FixtureResearchBrowserProvider().capture(scout.TARGET))
        self.assertEqual(capture.mechanism, "fixture")
        self.assertEqual(capture.url, scout.SECTION_URL)
        self.assertIsNone(capture.navigation_screenshot)
        self.assertTrue(capture.sha256)
        artifact = capture.artifacts[0]
        self.assertEqual(artifact.identifier, "43.16")
        self.assertEqual(artifact.kind, "statute_section")
        self.assertIn("One judge", artifact.detail)
        self.assertEqual(artifact.published_at, "s. 1, ch. 2026-141")

    def test_url_admission_rejects_non_official_and_private_inputs(self) -> None:
        self.assertEqual(scout.admit_official_url(scout.TARGET + "#fragment"), scout.TARGET)
        for value in (
            "http://www.leg.state.fl.us/statutes/",
            "https://127.0.0.1/",
            "https://www.leg.state.fl.us@evil.example/",
            "file:///etc/passwd",
            "https://www.leg.state.fl.us:444/",
        ):
            with self.assertRaises(ValueError):
                scout.admit_official_url(value)

    def test_section_url_admission_requires_the_exact_statute_route(self) -> None:
        self.assertEqual(scout.admit_section_url(scout.SECTION_URL), scout.SECTION_URL)
        final = scout.SECTION_URL.replace("URL=", "Search_String=&URL=").replace("%2F", "/")
        self.assertEqual(scout.admit_section_url(final), final)
        for value in (
            scout.TARGET,
            scout.SECTION_URL.replace("0043.16.html", "0043.17.html"),
            scout.SECTION_URL + "&next=https://example.test",
        ):
            with self.assertRaises(ValueError):
                scout.admit_section_url(value)

    def test_local_dotenv_is_literal_data_not_shell_input(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".env.local"
            path.write_text("OTHER=value\nSOLARI_API_KEY='safe-value'\n", encoding="utf-8")
            self.assertEqual(scout.load_local_env_value(path, "SOLARI_API_KEY"), "safe-value")
            path.write_text("SOLARI_API_KEY=$(do-not-run)\n", encoding="utf-8")
            self.assertEqual(scout.load_local_env_value(path, "SOLARI_API_KEY"), "$(do-not-run)")

    def test_artifact_parser_uses_only_admitted_primary_links(self) -> None:
        artifacts = scout.extract_official_artifacts(scout.FIXTURE_HTML, scout.SECTION_URL)
        self.assertEqual(len(artifacts), 1)
        statute = artifacts[0]
        self.assertEqual(statute.source_url, scout.SECTION_URL)
        self.assertIn("Justice Administrative Commission", statute.title)

    def test_artifact_parser_rejects_incomplete_or_unrelated_statute_text(self) -> None:
        for value in (
            scout.FIXTURE_HTML.replace("2026-141", "2025-1"),
            scout.FIXTURE_HTML.replace("One judge", "One member"),
            scout.FIXTURE_HTML.replace("43.16", "43.17"),
        ):
            self.assertEqual(scout.extract_official_artifacts(value, scout.SECTION_URL), ())

    def test_artifact_parser_does_not_mix_fields_across_sections(self) -> None:
        first = scout.FIXTURE_HTML.replace(
            '<div class="History"><span class="HistoryText">ss. 1-6, ch. 65-328; s. 1, ch. 2026-141.</span></div>',
            '<div class="History"><span class="HistoryText">s. 1, ch. 2025-1.</span></div>',
        )
        second = scout.FIXTURE_HTML.replace("43.16", "43.17")
        self.assertEqual(
            scout.extract_official_artifacts(first + second, scout.SECTION_URL), ()
        )

    def test_ambiguous_create_is_not_cleanup_confirmed_and_is_not_retried(self) -> None:
        state: dict[str, object] = {"creates": 0, "closed": False}

        class Sessions:
            async def create(self, **_kwargs):
                state["creates"] = int(state["creates"]) + 1
                raise TimeoutError("private transport detail")

        class Solari:
            def __init__(self, **kwargs):
                state["max_attempts"] = kwargs.get("max_attempts")
                self.sessions = Sessions()

            async def close(self):
                state["closed"] = True

        fake_solari = types.SimpleNamespace(Solari=Solari)
        fake_patchright = types.SimpleNamespace(async_playwright=lambda: None)
        with (
            patch.object(scout, "solari_api_key", return_value="not-a-real-key"),
            patch.dict(sys.modules, {"solari_browser": fake_solari, "patchright.async_api": fake_patchright}),
        ):
            with self.assertRaises(scout.LiveBrowserError) as raised:
                asyncio.run(scout.SolariResearchBrowserProvider().capture(scout.TARGET))
        self.assertEqual(state["creates"], 1)
        self.assertEqual(state["max_attempts"], 1)
        self.assertTrue(state["closed"])
        self.assertFalse(raised.exception.cleanup_confirmed)

    def test_cancellation_propagates_after_client_cleanup(self) -> None:
        state = {"closed": False}

        class Sessions:
            async def create(self, **_kwargs):
                raise asyncio.CancelledError()

        class Solari:
            def __init__(self, **_kwargs):
                self.sessions = Sessions()

            async def close(self):
                state["closed"] = True

        fake_solari = types.SimpleNamespace(Solari=Solari)
        fake_patchright = types.SimpleNamespace(async_playwright=lambda: None)
        with (
            patch.object(scout, "solari_api_key", return_value="not-a-real-key"),
            patch.dict(sys.modules, {"solari_browser": fake_solari, "patchright.async_api": fake_patchright}),
        ):
            with self.assertRaises(asyncio.CancelledError):
                asyncio.run(scout.SolariResearchBrowserProvider().capture(scout.TARGET))
        self.assertTrue(state["closed"])

    def test_sanitized_error_codes_do_not_echo_exception_details(self) -> None:
        self.assertEqual(scout.public_error_code(RuntimeError("session ws://secret")), "live_browser_failed")
        self.assertEqual(scout.public_error_code(RuntimeError("missing_solari_api_key")), "missing_solari_api_key")
        error = scout.LiveBrowserError("navigate", "connection_reset", cleanup_confirmed=True)
        self.assertEqual(scout.public_error_code(error), "live_browser_navigate_connection_reset")
        self.assertNotIn("ws://", str(error))

    def test_serialized_capture_contains_no_key_material(self) -> None:
        capture = asyncio.run(scout.FixtureResearchBrowserProvider().capture(scout.TARGET))
        rendered = json.dumps({"capture": scout.asdict(capture)})
        self.assertNotIn("SOLARI_API_KEY", rendered)
        self.assertNotIn("ws://", rendered)


if __name__ == "__main__":
    unittest.main()

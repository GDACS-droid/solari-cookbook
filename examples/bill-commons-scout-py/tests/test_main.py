import asyncio
import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


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
        self.assertEqual(events, ["browser", "playwright", "release", "replay", "client"])

    def test_fixture_path_is_free_and_has_expected_evidence(self) -> None:
        capture = asyncio.run(scout.FixtureResearchBrowserProvider().capture(scout.TARGET))
        self.assertEqual(capture.mechanism, "fixture")
        self.assertEqual(capture.url, scout.TARGET)
        self.assertTrue(capture.sha256)
        self.assertTrue(any(item.identifier == "154926" for item in capture.artifacts))
        self.assertTrue(any(item.kind == "bill_analysis" for item in capture.artifacts))

    def test_url_admission_rejects_non_official_and_private_inputs(self) -> None:
        self.assertEqual(scout.admit_official_url(scout.TARGET + "#fragment"), scout.TARGET)
        for value in (
            "http://www.flsenate.gov/Session/Bill/2026/625/ByCategory",
            "https://127.0.0.1/",
            "https://www.flsenate.gov@evil.example/",
            "file:///etc/passwd",
            "https://www.flsenate.gov:444/",
        ):
            with self.assertRaises(ValueError):
                scout.admit_official_url(value)

    def test_local_dotenv_is_literal_data_not_shell_input(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            path = Path(temporary) / ".env.local"
            path.write_text("OTHER=value\nSOLARI_API_KEY='safe-value'\n", encoding="utf-8")
            self.assertEqual(scout.load_local_env_value(path, "SOLARI_API_KEY"), "safe-value")
            path.write_text("SOLARI_API_KEY=$(do-not-run)\n", encoding="utf-8")
            self.assertEqual(scout.load_local_env_value(path, "SOLARI_API_KEY"), "$(do-not-run)")

    def test_artifact_parser_uses_only_admitted_primary_links(self) -> None:
        artifacts = scout.extract_official_artifacts(scout.FIXTURE_HTML, scout.TARGET)
        amendment = next(item for item in artifacts if item.identifier == "154926")
        self.assertEqual(amendment.source_url, "https://www.flsenate.gov/Session/Bill/2026/625/Amendment/154926/HTML")
        analysis = next(item for item in artifacts if item.kind == "bill_analysis")
        self.assertIn("Judiciary Committee", analysis.title)
        self.assertTrue(analysis.source_url.endswith("h0625c.JDC.PDF"))

    def test_sanitized_error_codes_do_not_echo_exception_details(self) -> None:
        self.assertEqual(scout.public_error_code(RuntimeError("session ws://secret")), "live_browser_failed")
        self.assertEqual(scout.public_error_code(RuntimeError("missing_solari_api_key")), "missing_solari_api_key")

    def test_serialized_capture_contains_no_key_material(self) -> None:
        capture = asyncio.run(scout.FixtureResearchBrowserProvider().capture(scout.TARGET))
        rendered = json.dumps({"capture": scout.asdict(capture)})
        self.assertNotIn("SOLARI_API_KEY", rendered)
        self.assertNotIn("ws://", rendered)


if __name__ == "__main__":
    unittest.main()

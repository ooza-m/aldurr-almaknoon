import json
import pathlib
import unittest

PLAN = pathlib.Path(__file__).parent / "fixtures" / "surah_insan_recording_plan.json"

class RecordingPlanTests(unittest.TestCase):
    def test_cases_are_plans_not_fake_recordings(self):
        data = json.loads(PLAN.read_text(encoding="utf-8"))
        self.assertEqual(data["surah"], 76)
        self.assertGreaterEqual(len(data["cases"]), 8)
        self.assertFalse(data["recording_protocol"]["recordings_in_repository"])
        ids = [case["id"] for case in data["cases"]]
        self.assertEqual(len(ids), len(set(ids)))
        for case in data["cases"]:
            self.assertIn(case["expected_error"], (True, False))
            self.assertNotIn("hypothesis", case)
            self.assertNotIn("alerted", case)
            self.assertNotIn("latency_ms", case)

if __name__ == "__main__":
    unittest.main()

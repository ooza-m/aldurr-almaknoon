"""Offline regression tests for the read-only Quran ASR health checker.
Run: python -m unittest discover -s quran-asr-service -p 'test_check_live.py'
No model downloads, network requests, or paid APIs.
"""
import contextlib
import importlib.util
import io
import json
import pathlib
import unittest
from unittest.mock import patch

SCRIPT = pathlib.Path(__file__).with_name("check_live.py")
spec = importlib.util.spec_from_file_location("check_live", SCRIPT)
checker = importlib.util.module_from_spec(spec)
with patch("sys.argv", ["check_live.py"]):
    spec.loader.exec_module(checker)

class LiveContractTests(unittest.TestCase):
    def run_check(self, responses):
        with patch.object(checker, "get", side_effect=lambda path: responses[path]):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                code = checker.main()
        return code, json.loads(output.getvalue())

    def test_healthy_loaded_model(self):
        code, report = self.run_check({
            "/health": (200, {"ok": True, "quran_specialized": True, "engine_loaded": True, "backend": "quran-zipformer-ctc", "model": "Quran-Lab/zipformer_p-arabic-v3"}),
            "/model-info": (200, {"model": "Quran-Lab/zipformer_p-arabic-v3", "backend": "quran-zipformer-ctc", "engine_loaded": True}),
            "/ready": (200, {"engine_loaded": True}),
        })
        self.assertEqual(code, 0)
        self.assertTrue(all(test["passed"] for test in report["tests"]))

    def test_health_ok_but_model_unready(self):
        code, report = self.run_check({
            "/health": (200, {"ok": True, "quran_specialized": True, "engine_loaded": False, "backend": "quran-zipformer-ctc", "model": "Quran-Lab/zipformer_p-arabic-v3"}),
            "/model-info": (200, {"model": "Quran-Lab/zipformer_p-arabic-v3", "engine_loaded": False}),
            "/ready": (503, {"detail": "Quran ASR model is not ready"}),
        })
        self.assertEqual(code, 1)
        self.assertFalse(report["tests"][-1]["passed"])

    def test_failed_health_is_not_success(self):
        code, report = self.run_check({
            "/health": (503, {"detail": "unavailable"}),
            "/model-info": (200, {"model": "quran"}),
            "/ready": (503, {}),
        })
        self.assertEqual(code, 1)
        self.assertFalse(report["tests"][0]["passed"])

    def test_model_mismatch_is_failure(self):
        code, report = self.run_check({
            "/health": (200, {"ok": True, "quran_specialized": True, "engine_loaded": True, "backend": "quran-zipformer-ctc", "model": "Quran-Lab/zipformer_p-arabic-v3"}),
            "/model-info": (200, {"model": "unexpected-model", "backend": "quran-zipformer-ctc", "engine_loaded": True}),
            "/ready": (200, {"engine_loaded": True}),
        })
        self.assertEqual(code, 1)
        self.assertIn("mismatch", report["tests"][1]["reason"])

    def test_connection_error_is_explicit(self):
        with patch.object(checker, "get", side_effect=TimeoutError()):
            with contextlib.redirect_stdout(io.StringIO()) as output:
                code = checker.main()
        report = json.loads(output.getvalue())
        self.assertEqual(code, 1)
        self.assertEqual(len(report["tests"]), 3)
        self.assertTrue(all(item["status"] == "connection-error" for item in report["tests"]))

if __name__ == "__main__":
    unittest.main()

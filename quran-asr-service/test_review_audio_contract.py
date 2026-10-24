"""Static API contract tests, no model downloads and no audio upload."""
import pathlib
import unittest

SOURCE = pathlib.Path(__file__).with_name("app.py").read_text(encoding="utf-8")

class ReviewAudioContract(unittest.TestCase):
    def test_review_endpoint_kept_separate(self):
        start = SOURCE.index('@app.post("/review-audio")')
        end = SOURCE.index('@app.post("/transcribe")', start)
        body = SOURCE[start:end]
        self.assertIn('not req.final', body)
        self.assertIn('16000 * 5', body)
        self.assertIn('"independent_observation": False', body)
        self.assertIn('"can_confirm_error": False', body)
        self.assertNotIn('_sessions[', body)
        self.assertNotIn('_transcribe_sherpa(', body)

if __name__ == "__main__":
    unittest.main()

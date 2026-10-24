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
        self.assertIn('QASR_ENABLE_REVIEW', body)
        self.assertIn('isolated review disabled', body)
        self.assertIn('16000 * 5', body)
        self.assertIn('"independent_observation": False', body)
        self.assertIn('"can_confirm_error": False', body)
        self.assertNotIn('_sessions[', body)
        self.assertNotIn('_transcribe_sherpa(', body)

    def test_review_is_disabled_before_decode(self):
        import ast
        tree = ast.parse(SOURCE)
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "review_audio")
        statements = fn.body
        self.assertTrue(any(isinstance(n, ast.If) and 'QASR_ENABLE_REVIEW' in ast.get_source_segment(SOURCE,n) for n in statements[:2]))

if __name__ == "__main__":
    unittest.main()

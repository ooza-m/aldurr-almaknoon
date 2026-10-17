"""Safety and interface contract tests for Quran G2P candidate generation."""
import ast
import unittest
from pathlib import Path

FILE = Path(__file__).resolve().parents[1] / "quran-asr-service" / "app.py"
SOURCE = FILE.read_text(encoding="utf-8")

class TestG2PContract(unittest.TestCase):
    def test_backend_compiles(self):
        ast.parse(SOURCE)

    def test_candidates_do_not_enable_automatic_grading(self):
        self.assertIn('"can_grade": False', SOURCE)
        self.assertIn('matching_context and upstream_tokens == joined', SOURCE)

    def test_g2p_word_reference(self):
        self.assertIn('f"{surah}:{ayah}:{word}"', SOURCE)

    def test_both_vocabulary_and_context_checks_present(self):
        self.assertIn('"context_exact": matching_context', SOURCE)
        self.assertIn('"model_vocabulary_exact": matching_model', SOURCE)

if __name__ == "__main__":
    unittest.main()

"""Static regression tests for the Zipformer streaming route (no model download)."""
import ast
from pathlib import Path
import unittest

SOURCE = Path(__file__).resolve().parents[1] / "quran-asr-service" / "app.py"

class TestZipformerRouting(unittest.TestCase):
    def test_source_compiles(self):
        ast.parse(SOURCE.read_text(encoding="utf-8"))

    def test_transcribe_uses_streaming_decoder(self):
        tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "transcribe")
        source = ast.get_source_segment(SOURCE.read_text(encoding="utf-8"), fn)
        self.assertIn('BACKEND in {"sherpa-fastconformer", "quran-zipformer-ctc"}', source)
        self.assertIn("_transcribe_sherpa(", source)
        self.assertIn('"transcript_format": "phonemes"', source)

if __name__ == "__main__":
    unittest.main()

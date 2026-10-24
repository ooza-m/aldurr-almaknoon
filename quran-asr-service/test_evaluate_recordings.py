import unittest
from evaluate_recordings import evaluate, distance

class EvaluationTests(unittest.TestCase):
    def test_distance(self):
        self.assertEqual(distance(["هل","أتى"],["هل","ذهب"]),1)
    def test_excludes_phonemes_from_word_error(self):
        data=evaluate([{"transcript_format":"phonemes","reference":"هل أتى","hypothesis":"h a l",
          "ground_truth_error":False,"alerted":True,"latency_ms":220}])
        self.assertIsNone(data["wer"])
        self.assertEqual(data["phoneme_excluded"],1)
        self.assertEqual(data["false_alerts"],1)
    def test_word_error_rate(self):
        data=evaluate([{"transcript_format":"words","reference":"هل أتى على","hypothesis":"هل على"}])
        self.assertAlmostEqual(data["wer"],1/3)
if __name__=="__main__":
    unittest.main()

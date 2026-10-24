import tempfile
import unittest
import wave
from pathlib import Path
from run_recording_benchmark import validate_endpoint, read_audio

class RunnerTests(unittest.TestCase):
    def test_blocks_live_railway(self):
        with self.assertRaises(ValueError):
            validate_endpoint("https://quran-asr-production-3419.up.railway.app")
    def test_rejects_insecure_remote(self):
        with self.assertRaises(ValueError):
            validate_endpoint("http://example.com")
    def test_accepts_local_test_server(self):
        self.assertEqual(validate_endpoint("http://127.0.0.1:8000"),"http://127.0.0.1:8000")
    def test_wav_format_and_duration(self):
        with tempfile.TemporaryDirectory() as tmp:
            file=Path(tmp)/"sample.wav"
            with wave.open(str(file),"wb") as w:
                w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000)
                w.writeframes(bytes(1600))
            self.assertEqual(len(read_audio(file)),1600)

if __name__=="__main__":
    unittest.main()

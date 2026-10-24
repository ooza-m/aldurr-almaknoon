"""Isolated endpoint tests with a fake recognizer; no model downloads."""
import base64
import os
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
import app

class FakeStream:
    def accept_waveform(self, rate, pcm): self.count = len(pcm)
    def input_finished(self): pass

class FakeRecognizer:
    def create_stream(self): return FakeStream()
    def is_ready(self, stream): return False
    def get_result(self, stream): return {"text": "test phonemes"}

class ReviewRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.client=TestClient(app.app)
        self.audio=base64.b64encode(bytes(6400)).decode("ascii")
        self.payload={"audio_b64":self.audio,"sample_rate":16000,"final":True}

    def test_disabled_returns_404_without_loading_model(self):
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"0"}), patch.object(app,"_load_engine",side_effect=AssertionError("model used")):
            self.assertEqual(self.client.post("/review-audio",json=self.payload).status_code,404)

    def test_enabled_fake_recognizer_returns_advisory_result(self):
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"1"}), patch.object(app,"_load_engine",return_value=FakeRecognizer()):
            response=self.client.post("/review-audio",json=self.payload)
        self.assertEqual(response.status_code,200,response.text)
        body=response.json()
        self.assertFalse(body["independent_observation"])
        self.assertFalse(body["can_confirm_error"])
        self.assertTrue(body["replayed_audio"])

    def test_invalid_live_session_is_rejected(self):
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"1"}), patch.object(app,"_load_engine",side_effect=AssertionError("model used")):
            self.assertEqual(self.client.post("/review-audio",json={**self.payload,"session_id":"live"}).status_code,400)

    def test_more_than_five_seconds_is_rejected(self):
        long_audio=base64.b64encode(bytes(160002)).decode("ascii")
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"1"}), patch.object(app,"_load_engine",side_effect=AssertionError("model used")):
            self.assertEqual(self.client.post("/review-audio",json={**self.payload,"audio_b64":long_audio}).status_code,400)

    def test_non_final_request_rejected_before_loading_model(self):
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"1"}), patch.object(app,"_load_engine",side_effect=AssertionError("model used")):
            response=self.client.post("/review-audio",json={**self.payload,"final":False})
        self.assertEqual(response.status_code,400)

    def test_unsupported_backend_rejected_before_loading_model(self):
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"1"}), patch.object(app,"BACKEND","tarteel-whisper"), patch.object(app,"_load_engine",side_effect=AssertionError("model used")):
            response=self.client.post("/review-audio",json=self.payload)
        self.assertEqual(response.status_code,501)

    def test_empty_audio_rejected_before_loading_model(self):
        with patch.dict(os.environ,{"QASR_ENABLE_REVIEW":"1"}), patch.object(app,"_load_engine",side_effect=AssertionError("model used")):
            response=self.client.post("/review-audio",json={**self.payload,"audio_b64":""})
        self.assertEqual(response.status_code,400)

if __name__=="__main__": unittest.main()

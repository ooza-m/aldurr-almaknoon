"""Protocol regression tests; no model download and no personal recordings."""
import base64
import os
from types import SimpleNamespace

os.environ['QASR_PRELOAD'] = '0'
import numpy as np
import pytest
from fastapi.testclient import TestClient
import app as service
from evaluate import norm


class Stream:
    def __init__(self):
        self.chunks = []
        self.finished = False
    def accept_waveform(self, rate, audio):
        self.chunks.append(audio.copy())
    def input_finished(self):
        self.finished = True


class Recognizer:
    def __init__(self):
        self.streams = []
        self.text = 'الحمد لله رب العالمين'
    def create_stream(self):
        stream = Stream()
        self.streams.append(stream)
        return stream
    def is_ready(self, stream):
        return False
    def get_result(self, stream):
        return SimpleNamespace(text=self.text)


@pytest.fixture
def api(monkeypatch):
    recognizer = Recognizer()
    monkeypatch.setattr(service, '_engine', recognizer)
    monkeypatch.setattr(service, 'BACKEND', 'sherpa-fastconformer')
    service._sessions.clear()
    with TestClient(service.app) as client:
        yield client, recognizer
    service._sessions.clear()


def payload(seq=0, final=False, samples=1600):
    return {'session_id': 'regression', 'seq': seq, 'final': final,
            'audio_b64': base64.b64encode((np.ones(samples, dtype='<i2') * 1000).tobytes()).decode()}


def test_retries_do_not_feed_audio_twice(api):
    client, rec = api
    body = payload()
    first = client.post('/transcribe', json=body)
    assert first.status_code == 200
    assert client.post('/transcribe', json=body).json() == first.json()
    assert len(rec.streams) == 1
    assert len(rec.streams[0].chunks) == 1
    assert client.post('/transcribe', json=payload(samples=800)).status_code == 409


def test_muno_streaming_uses_stable_deltas_and_idempotent_final(monkeypatch):
    calls = []
    class MunoFakeStream:
        def accept(self, audio, final=False):
            calls.append((audio.size, final))
            return 'الحمد لله رب العالمين' if final else 'الحمد لله'
    monkeypatch.setattr(service, 'BACKEND', 'muno-streaming-ctc')
    monkeypatch.setattr(service, 'ALLOW_EXPERIMENTAL', True)
    monkeypatch.setattr(service, '_engine', SimpleNamespace(create_stream=MunoFakeStream))
    service._sessions.clear()
    with TestClient(service.app) as client:
        first = client.post('/transcribe', json=payload()).json()
        assert first['streaming'] and first['transcript_delta'] == ''
        body = payload(seq=1, final=True, samples=120)
        final = client.post('/transcribe', json=body).json()
        assert final['transcript_delta'] == 'الحمد لله رب العالمين'
        assert client.post('/transcribe', json=body).json() == final
        assert calls == [(1600, False), (120, True)]
    service._sessions.clear()


def test_muno_remains_disabled_without_explicit_experimental_enable(monkeypatch):
    monkeypatch.setattr(service, 'BACKEND', 'muno-streaming-ctc')
    monkeypatch.setattr(service, 'ALLOW_EXPERIMENTAL', False)
    monkeypatch.setattr(service, '_engine', object())
    with TestClient(service.app) as client:
        assert client.get('/ready').status_code == 503
        assert client.post('/transcribe', json=payload()).status_code == 503
        assert not client.get('/health').json()['enabled']


def test_rejects_sequence_gap_without_losing_stream(api):
    client, rec = api
    assert client.post('/transcribe', json=payload(seq=1)).status_code == 409
    assert not rec.streams
    assert client.post('/transcribe', json=payload()).status_code == 200
    assert client.post('/transcribe', json=payload(seq=2)).status_code == 409
    assert len(rec.streams[0].chunks) == 1
    assert client.post('/transcribe', json=payload(seq=1)).status_code == 200


def test_short_final_tail_and_final_retry(api):
    client, rec = api
    assert client.post('/transcribe', json=payload()).status_code == 200
    final = client.post('/transcribe', json=payload(seq=1, final=True, samples=120))
    assert final.status_code == 200
    assert rec.streams[0].chunks[1].size == 120  # Must not discard a short final syllable.
    assert rec.streams[0].finished
    assert client.post('/transcribe', json=payload(seq=1, final=True, samples=120)).json() == final.json()
    assert len(rec.streams) == 1
    assert client.post('/transcribe', json=payload(seq=2)).status_code == 409


def test_stable_words_and_empty_delta(api):
    client, rec = api
    first = client.post('/transcribe', json=payload()).json()
    assert first['transcript_delta'] == ''
    second = client.post('/transcribe', json=payload(seq=1)).json()
    assert second['transcript_delta'] == 'الحمد لله رب'
    assert client.post('/transcribe', json=payload(seq=2)).json()['transcript_delta'] == ''
    final = client.post('/transcribe', json=payload(seq=3, final=True, samples=0)).json()
    assert final['transcript_delta'] == 'العالمين'


def test_revised_hypothesis_does_not_replay_committed_words(api):
    client, rec = api
    client.post('/transcribe', json=payload())
    client.post('/transcribe', json=payload(seq=1))
    rec.text = 'الرحمن الرحيم'
    revised = client.post('/transcribe', json=payload(seq=2)).json()
    assert revised['transcript_revised']
    assert revised['transcript_delta'] == ''


@pytest.mark.parametrize('changes,status', [
    ({'sample_rate': 8000}, 400),
    ({'audio_b64': 'not base64'}, 400),
    ({'audio_b64': base64.b64encode(b'x').decode()}, 400),
    ({'audio_b64': base64.b64encode(b'x' * 480002).decode()}, 422),
    ({'session_id': '../invalid'}, 422),
])
def test_invalid_audio_is_not_sent_to_recognizer(api, changes, status):
    client, rec = api
    body = payload(); body.update(changes)
    assert client.post('/transcribe', json=body).status_code == status
    assert not rec.streams


def test_vocalized_reference_keeps_word_boundaries():
    assert norm('ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَـٰلَمِينَ') == norm('الحمد لله رب العلمين')
    assert len(norm('الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ').split()) == 4


def test_readiness_requires_a_loaded_model(api, monkeypatch):
    client, _ = api
    assert client.get('/ready').status_code == 200
    monkeypatch.setattr(service, '_engine', None)
    assert client.get('/health').status_code == 200
    assert client.get('/ready').status_code == 503


def test_offline_encoder_is_rejected_before_native_runtime(monkeypatch):
    import sys
    class Options:
        pass
    class OfflineGraph:
        def __init__(self, *args, **kwargs):
            pass
        def get_inputs(self):
            return [SimpleNamespace(name='audio_signal'), SimpleNamespace(name='length')]
        def get_outputs(self):
            return [SimpleNamespace(name='outputs'), SimpleNamespace(name='encoded_lengths')]
    monkeypatch.setitem(sys.modules, 'onnxruntime', SimpleNamespace(SessionOptions=Options, InferenceSession=OfflineGraph))
    with pytest.raises(service.IncompatibleModelError, match='encoder'):
        service._validate_sherpa_bundle('encoder', 'decoder', 'joiner')


def test_failed_model_readiness_keeps_health_available(api, monkeypatch):
    client, _ = api
    def incompatible():
        raise service.IncompatibleModelError('invalid export')
    monkeypatch.setattr(service, '_engine', None)
    monkeypatch.setattr(service, '_engine_error', 'incompatible_model_export')
    monkeypatch.setattr(service, '_load_engine', incompatible)
    assert client.post('/warmup').status_code == 503
    result = client.get('/health').json()
    assert result['ok'] is True
    assert result['engine_loaded'] is False
    assert result['model_error'] == 'incompatible_model_export'


def test_chunked_ctc_is_idempotent_and_never_replays_previous_segment(api, monkeypatch):
    client, recognizer = api
    monkeypatch.setattr(service, 'BACKEND', 'sherpa-offline-ctc')
    monkeypatch.setattr(service, 'ALLOW_EXPERIMENTAL', True)
    recognizer.calls = 0
    def decode(stream):
        recognizer.calls += 1
        stream.result = SimpleNamespace(text='الحمد لله' if recognizer.calls == 1 else 'رب العالمين')
    recognizer.decode_stream = decode
    first = client.post('/transcribe', json=payload()).json()
    assert first['streaming'] is False
    assert first['transcript_delta'] == 'الحمد لله'
    assert client.post('/transcribe', json=payload()).json() == first
    second = client.post('/transcribe', json=payload(seq=1)).json()
    assert second['transcript_delta'] == 'رب العالمين'
    assert second['transcript'] == 'الحمد لله رب العالمين'
    final = client.post('/transcribe', json=payload(seq=2, final=True, samples=0)).json()
    assert final['transcript_delta'] == ''
    assert final['transcript'] == second['transcript']
    assert recognizer.calls == 2


def test_silence_does_not_reach_offline_model(api, monkeypatch):
    client, recognizer = api
    monkeypatch.setattr(service, 'BACKEND', 'sherpa-offline-ctc')
    monkeypatch.setattr(service, 'ALLOW_EXPERIMENTAL', True)
    body = payload(); body['audio_b64'] = base64.b64encode(np.zeros(32000, dtype='<i2').tobytes()).decode()
    result = client.post('/transcribe', json=body).json()
    assert result['transcript_delta'] == ''
    assert result['confidence_calibrated'] is False
    assert not recognizer.streams


def test_failed_quality_candidate_cannot_be_activated_by_url_alone(api, monkeypatch):
    client, recognizer = api
    monkeypatch.setattr(service, 'BACKEND', 'sherpa-offline-ctc')
    monkeypatch.setattr(service, 'ALLOW_EXPERIMENTAL', False)
    info = client.get('/health').json()
    assert info['engine_loaded'] is True
    assert info['enabled'] is False
    assert info['experimental'] is True
    assert client.get('/ready').status_code == 503
    assert client.post('/warmup').status_code == 503
    assert client.post('/transcribe', json=payload()).status_code == 503
    assert not recognizer.streams

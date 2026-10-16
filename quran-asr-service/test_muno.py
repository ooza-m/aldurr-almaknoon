from types import SimpleNamespace

import numpy as np
import pytest

from muno_streaming import MelStream, MunoStream, FILTERS, WINDOW


def features(audio, packets):
    stream = MelStream()
    rows = []
    pos = 0
    for size in packets:
        rows.append(stream.accept(audio[pos:pos + size]))
        pos += size
    rows.append(stream.accept(audio[pos:], final=True))
    return np.concatenate(rows, axis=1), stream


@pytest.mark.parametrize("length", [2, 100, 256, 257, 1599, 16000, 32123])
def test_packet_boundaries_do_not_change_features(length):
    audio = np.random.default_rng(42).normal(0, .1, length).astype(np.float32)
    whole, _ = features(audio, [])
    packetized, _ = features(audio, [min(length, 31), max(0, min(length - 31, 113)), max(0, min(length - 144, 1600))])
    np.testing.assert_allclose(packetized, whole, atol=2e-5, rtol=2e-5)
    assert whole.shape == (80, length // 160 + 1)


def test_long_stream_keeps_only_bounded_waveform_context():
    stream = MelStream()
    for _ in range(100):
        stream.accept(np.ones(16000, np.float32))
        assert stream.buffer.size < 1600
    stream.accept(np.zeros(0, np.float32), final=True)
    with pytest.raises(ValueError):
        stream.accept(np.zeros(100, np.float32))


def test_mel_geometry_and_finite_silence():
    assert FILTERS.shape == (80, 257) and WINDOW.shape == (512,)
    assert np.all(FILTERS >= 0) and np.all(FILTERS.max(axis=1) > 0)
    mel = MelStream().accept(np.zeros(16000, np.float32), final=True)
    np.testing.assert_allclose(mel, np.log(2 ** -24), atol=1e-5)


def fake_engine(predictions):
    predictions = iter(predictions)
    def run(_, inputs):
        token = next(predictions)
        logits = np.full((1, 1, 1025), -100, np.float32)
        logits[0, 0, token] = 0
        return [logits, np.array([1]), inputs["cache_last_channel"], inputs["cache_last_time"], inputs["cache_last_channel_len"]]
    return SimpleNamespace(mean=np.zeros(80), std=np.ones(80), session=SimpleNamespace(run=run),
                           tokenizer=SimpleNamespace(decode=lambda ids: " ".join(map(str, ids))))


def test_ctc_previous_token_survives_native_chunk_seams():
    stream = MunoStream(fake_engine([4, 4, 1024, 4]))
    result = stream.accept(np.ones(60000, np.float32) * .1, final=True)
    assert result == "4 4" and stream.ids == [4, 4]


def test_silence_and_empty_final_do_not_enter_native_decoder():
    stream = MunoStream(fake_engine([]))
    assert stream.accept(np.zeros(16000, np.float32)) == ""
    assert stream.accept(np.zeros(0, np.float32), final=True) == ""


def test_stream_state_is_not_shared_between_sessions():
    engine = fake_engine([4, 7])
    a, b = MunoStream(engine), MunoStream(engine)
    assert a.accept(np.ones(16000, np.float32), final=True) == "4"
    assert b.accept(np.ones(16000, np.float32), final=True) == "7"
    assert not np.shares_memory(a.channel, b.channel)


def test_numpy_features_match_granted_torchaudio_contract():
    torch = pytest.importorskip('torch')
    torchaudio = pytest.importorskip('torchaudio')
    audio = np.random.default_rng(71).normal(0, .1, 32123).astype(np.float32)
    wav = torch.tensor(audio)
    wav = torch.cat([wav[:1], wav[1:] - .97 * wav[:-1]])
    transform = torchaudio.transforms.MelSpectrogram(sample_rate=16000, n_fft=512,
        win_length=400, hop_length=160, n_mels=80, power=2.0,
        window_fn=torch.hann_window, norm='slaney', mel_scale='slaney')
    reference = torch.log(transform(wav) + 2 ** -24).numpy()
    actual = MelStream().accept(audio, final=True)
    np.testing.assert_allclose(actual, reference, atol=1e-4, rtol=1e-5)

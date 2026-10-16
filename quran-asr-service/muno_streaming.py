"""Experimental CPU adapter for Muno's pinned cache-aware CTC graph.

Feature contract follows the granted upstream example, not canonical-ayah
retrieval. Model-related adaptations are provided under NPL-1.1; see
MODEL_LICENSE_NPL-1.1.txt. No pronunciation correctness is inferred here.
"""
import hashlib
from pathlib import Path

import numpy as np

REPO = "Muno459/fastconformer-quran-streaming"
REVISION = "75799adac5d2a9bc0230d4c4b410dd68319560e4"
CHECKSUMS = {
    "model.q8.onnx": "41b3757505f9f5bb85d8fb6e478c1ab9f64d6454203ea5f032ce99a1e955f099",
    "streaming_global_cmvn.npz": "e5083c4cdefc16d574eef9c16094b03bf8876ae70b40975a3c66caf995558d2e",
    "tokenizer.model": "1fcfa104fa448c979cc2537788947c6516827f403ecdc55c4895b77d28630ba4",
}


def mel_filters():
    # Slaney's linear-below-1kHz / logarithmic-above-1kHz frequency scale.
    top = 15 + np.log(8.0) / (np.log(6.4) / 27)
    mel = np.linspace(0, top, 82, dtype=np.float32)
    hz = mel * np.float32(200 / 3)
    mask = mel >= 15
    hz[mask] = 1000 * np.exp((mel[mask] - 15) * (np.log(6.4) / 27))
    frequency = np.linspace(0, 8000, 257, dtype=np.float32)
    down = (frequency[None, :] - hz[:-2, None]) / (hz[1:-1] - hz[:-2])[:, None]
    up = (hz[2:, None] - frequency[None, :]) / (hz[2:] - hz[1:-1])[:, None]
    return (np.maximum(0, np.minimum(down, up)) * (2 / (hz[2:] - hz[:-2]))[:, None]).astype(np.float32)


FILTERS = mel_filters()
WINDOW = np.pad(np.hanning(401)[:-1].astype(np.float32), (56, 56))


class MelStream:
    """Packet-independent centered STFT with a bounded waveform tail.

    Non-final frames wait for 256 future samples. Only finalization reflects
    the right edge; packet boundaries never introduce artificial reflection.
    """
    def __init__(self):
        self.buffer = np.zeros(0, np.float32)
        self.base = self.total = self.frame = 0
        self.previous = None
        self.finished = False

    def accept(self, audio, final=False):
        if self.finished:
            raise ValueError("Features already finalized")
        raw = np.asarray(audio, dtype=np.float32).reshape(-1)
        if not np.isfinite(raw).all():
            raise ValueError("Non-finite audio")
        if raw.size:
            emphasized = raw.copy()
            emphasized[0] -= 0 if self.previous is None else np.float32(.97) * self.previous
            emphasized[1:] -= np.float32(.97) * raw[:-1]
            self.previous = raw[-1]
            self.buffer = np.concatenate((self.buffer, emphasized))
            self.total += raw.size
        stop = (self.total // 160 + 1 if final else max(0, (self.total - 257) // 160 + 1))
        count = max(0, stop - self.frame) if self.total > 1 else 0
        if not count:
            self.finished = final
            return np.zeros((80, 0), np.float32)
        indexes = np.arange(self.frame, stop)[:, None] * 160 + np.arange(512)[None, :] - 256
        # General reflection also handles clips shorter than the FFT padding.
        period = 2 * (self.total - 1)
        indexes %= period
        indexes = np.where(indexes < self.total, indexes, period - indexes)
        frames = self.buffer[indexes - self.base] * WINDOW
        spectrum = np.fft.rfft(frames, axis=-1)
        power = (spectrum.real ** 2 + spectrum.imag ** 2).astype(np.float32)
        mel = np.log(FILTERS @ power.T + np.float32(2 ** -24)).astype(np.float32)
        self.frame = stop
        keep = max(0, self.frame * 160 - 512)
        # Keep enough final context even when the final center is past the end.
        keep = min(keep, max(0, self.total - 1024))
        self.buffer = self.buffer[keep - self.base:]
        self.base = keep
        self.finished = final
        return mel


class MunoStream:
    def __init__(self, engine):
        self.engine = engine
        self.features = MelStream()
        self.pending = np.zeros((80, 0), np.float32)
        self.channel = np.zeros((1, 17, 70, 512), np.float32)
        self.time = np.zeros((1, 17, 512, 8), np.float32)
        self.cache_length = np.zeros(1, np.int64)
        self.ids = []
        self.previous_token = -1
        self.started = self.finished = False

    def accept(self, audio, final=False):
        if self.finished:
            raise ValueError("Stream already finalized")
        if not self.started:
            # Leading silence is not sent through the CTC decoder. This is an
            # energy gate, not a speech classifier or confidence estimate.
            if not audio.size or float(np.sqrt(np.mean(audio * audio))) < .0001:
                self.finished = final
                return ""
            self.started = True
        mel = self.features.accept(audio, final)
        mel = ((mel - self.engine.mean[:, None]) / (self.engine.std[:, None] + 1e-5)).astype(np.float32)
        self.pending = np.concatenate((self.pending, mel), axis=1)
        while self.pending.shape[1] >= 112 or (final and self.pending.shape[1]):
            size = min(112, self.pending.shape[1])
            chunk, self.pending = self.pending[:, :size], self.pending[:, size:]
            # The granted Q8 graph crashes on a 1-frame final input after
            # subsampling (ConvInteger receives a zero time axis). Always use
            # its proven 112-frame physical window; only finalization pads.
            # The right context is normalized silence, not artificial speech.
            if size < 112:
                silence = (np.float32(np.log(2 ** -24)) - self.engine.mean) / (self.engine.std + 1e-5)
                chunk = np.concatenate((chunk, np.repeat(silence[:, None], 112 - size, axis=1)), axis=1).astype(np.float32)
            values = self.engine.session.run(None, {
                "audio_signal": chunk[None], "length": np.array([112], np.int64),
                "cache_last_channel": self.channel, "cache_last_time": self.time,
                "cache_last_channel_len": self.cache_length,
            })
            logp, lengths, self.channel, self.time, self.cache_length = values
            usable = min(int(lengths[0]), (size + 7) // 8)
            if usable < 0 or usable > logp.shape[1] or not np.isfinite(logp).all():
                raise ValueError("Invalid model output")
            for token in logp[0, :usable].argmax(-1):
                token = int(token)
                if token != self.previous_token and token != 1024:
                    self.ids.append(token)
                self.previous_token = token
        self.finished = final
        return self.engine.tokenizer.decode(self.ids).strip()


class MunoEngine:
    def __init__(self, token, threads=2):
        from huggingface_hub import hf_hub_download
        import onnxruntime as ort
        import sentencepiece as spm

        paths = {}
        for name, expected in CHECKSUMS.items():
            path = hf_hub_download(REPO, name, revision=REVISION, token=token)
            digest = hashlib.sha256()
            with open(path, "rb") as source:
                for block in iter(lambda: source.read(1024 * 1024), b""):
                    digest.update(block)
            if digest.hexdigest() != expected:
                raise ValueError("Pinned model artifact checksum mismatch")
            paths[name] = path
        options = ort.SessionOptions()
        options.intra_op_num_threads = threads
        options.inter_op_num_threads = 1
        self.session = ort.InferenceSession(paths["model.q8.onnx"], options, providers=["CPUExecutionProvider"])
        self.tokenizer = spm.SentencePieceProcessor(model_file=paths["tokenizer.model"])
        if self.tokenizer.get_piece_size() != 1024:
            raise ValueError("Unexpected tokenizer vocabulary")
        with np.load(paths["streaming_global_cmvn.npz"], allow_pickle=False) as stats:
            self.mean = stats["tlog_mean"].astype(np.float32)
            self.std = stats["tlog_std"].astype(np.float32)
        if self.mean.shape != (80,) or self.std.shape != (80,) or not np.isfinite(self.mean).all() or not np.isfinite(self.std).all() or np.any(self.std <= 0):
            raise ValueError("Invalid fixed-global CMVN")
        # A real native forward must work before the service becomes ready.
        self.create_stream().accept(np.ones(18000, np.float32) * .001, final=True)

    def create_stream(self):
        return MunoStream(self)

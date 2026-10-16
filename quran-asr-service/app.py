import base64
import hashlib
import os
import threading
import time
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "Durr Quran ASR"
BACKEND = os.getenv("QASR_BACKEND", "sherpa-offline-ctc").strip().lower()
MODEL_ID = os.getenv(
    "QASR_MODEL", {
        "muno-streaming-ctc": "Muno459/fastconformer-quran-streaming",
        "sherpa-offline-ctc": "TheGreatQuran/QuranKarim-SpeechToText-onnxModel",
        "sherpa-fastconformer": "mohammed/fastconformer-quran-ar-onnx-int8",
        "tarteel-whisper": "tarteel-ai/whisper-base-ar-quran",
        "nemo-fastconformer": "mohammed/fastconformer-quran-ar",
    }.get(BACKEND, "")
).strip()
MODEL_REVISION = os.getenv("QASR_MODEL_REVISION") or (
    "76eab42481554dfe2fd837596802af243482a894"
    if MODEL_ID == "TheGreatQuran/QuranKarim-SpeechToText-onnxModel" else
    "75799adac5d2a9bc0230d4c4b410dd68319560e4" if BACKEND == "muno-streaming-ctc" else None
)
MODEL_FILE = os.getenv("QASR_MODEL_FILE", "qurankarim-fastconformer-mixed.onnx")
HF_TOKEN = os.getenv("HF_TOKEN") or None
SESSION_TTL = int(os.getenv("QASR_SESSION_TTL", "1200"))
MAX_SESSIONS = max(1, int(os.getenv("QASR_MAX_SESSIONS", "32")))
MAX_PCM_BYTES = 16000 * 2 * 15
NUM_THREADS = max(1, int(os.getenv("QASR_THREADS", "4")))
PRELOAD = os.getenv("QASR_PRELOAD", "1") not in {"0", "false", "False"}
ALLOW_EXPERIMENTAL = os.getenv("QASR_ALLOW_EXPERIMENTAL", "0") in {"1", "true", "True"}

app = FastAPI(title=APP_NAME, version="2.1.0")

origins = [
    x.strip()
    for x in os.getenv(
        "CORS_ORIGINS",
        "https://ooza-m.github.io,http://localhost:8000,http://localhost:5173",
    ).split(",")
    if x.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=False,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

_engine = None
_engine_error = None
_engine_lock = threading.Lock()
_sessions = {}
_sessions_lock = threading.Lock()


class TranscribeRequest(BaseModel):
    audio_b64: str = Field(default="", max_length=640000)
    sample_rate: int = Field(default=16000, ge=8000, le=48000)
    page: Optional[int] = Field(default=None, ge=1, le=604)
    position: Optional[int] = Field(default=None, ge=0)
    session_id: Optional[str] = Field(default=None, max_length=120, pattern=r"^[A-Za-z0-9_-]+$")
    seq: int = Field(default=0, ge=0)
    final: bool = False


def _device_name() -> str:
    if BACKEND in {"sherpa-fastconformer", "sherpa-offline-ctc", "muno-streaming-ctc"}:
        return "cpu"
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _decode_pcm(req: TranscribeRequest) -> np.ndarray:
    if req.sample_rate != 16000:
        raise HTTPException(status_code=400, detail="sample_rate must be 16000")
    if not req.audio_b64:
        if req.final:
            return np.zeros(0, dtype=np.float32)
        raise HTTPException(status_code=400, detail="audio_b64 is required")

    try:
        raw = base64.b64decode(req.audio_b64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid audio_b64") from exc

    if len(raw) > MAX_PCM_BYTES:
        raise HTTPException(status_code=413, detail="audio chunk exceeds 15 seconds")
    if len(raw) % 2:
        raise HTTPException(status_code=400, detail="PCM16 requires complete samples")
    if not raw and not req.final:
        raise HTTPException(status_code=400, detail="empty audio chunk")

    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    return audio


def _load_sherpa():
    from huggingface_hub import hf_hub_download
    import sherpa_onnx

    encoder = hf_hub_download(
        MODEL_ID, "encoder.int8.onnx", token=HF_TOKEN
    )
    decoder = hf_hub_download(
        MODEL_ID, "decoder.int8.onnx", token=HF_TOKEN
    )
    joiner = hf_hub_download(
        MODEL_ID, "joiner.int8.onnx", token=HF_TOKEN
    )
    tokens = hf_hub_download(MODEL_ID, "tokens.txt", token=HF_TOKEN)

    _validate_sherpa_bundle(encoder, decoder, joiner)

    return sherpa_onnx.OnlineRecognizer.from_transducer(
        encoder=encoder,
        decoder=decoder,
        joiner=joiner,
        tokens=tokens,
        sample_rate=16000,
        feature_dim=80,
        num_threads=NUM_THREADS,
        decoding_method="greedy_search",
    )


def _load_offline_ctc():
    from huggingface_hub import hf_hub_download
    import sherpa_onnx

    model = hf_hub_download(MODEL_ID, MODEL_FILE, revision=MODEL_REVISION, token=HF_TOKEN)
    tokens = hf_hub_download(MODEL_ID, "tokens.txt", revision=MODEL_REVISION, token=HF_TOKEN)
    return sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
        model=model, tokens=tokens, num_threads=NUM_THREADS,
    )


class IncompatibleModelError(RuntimeError):
    pass


def _validate_sherpa_bundle(encoder: str, decoder: str, joiner: str):
    """Reject incompatible exports before passing them to the native runtime.

    The selected NeMo streaming implementation requires a cache-aware encoder,
    a separate prediction network, and a separate two-input joint network.
    Mislabelled offline/combined exports can otherwise crash C++ inference.
    """
    import onnxruntime as ort

    options = ort.SessionOptions()
    options.intra_op_num_threads = 1
    options.inter_op_num_threads = 1
    for path, kind in ((encoder, "encoder"), (decoder, "decoder"), (joiner, "joiner")):
        session = ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])
        inputs = {item.name for item in session.get_inputs()}
        outputs = session.get_outputs()
        valid = {
            "encoder": len(inputs) >= 5 and len(outputs) >= 5 and {
                "cache_last_channel", "cache_last_time", "cache_last_channel_len"
            }.issubset(inputs),
            "decoder": len(inputs) == 3 and "encoder_outputs" not in inputs,
            "joiner": len(inputs) == 2 and len(outputs) == 1,
        }[kind]
        del session
        if not valid:
            raise IncompatibleModelError(f"{kind} is not a compatible sherpa streaming NeMo export")


def _load_whisper():
    from transformers import pipeline
    import torch

    return pipeline(
        "automatic-speech-recognition",
        model=MODEL_ID,
        token=HF_TOKEN,
        device=0 if torch.cuda.is_available() else -1,
    )


def _load_nemo():
    import nemo.collections.asr as nemo_asr
    import torch

    model = nemo_asr.models.ASRModel.from_pretrained(
        model_name=MODEL_ID,
        map_location="cuda" if torch.cuda.is_available() else "cpu",
    )
    model.eval()
    return model


def _load_engine():
    global _engine, _engine_error
    if _engine is not None:
        return _engine

    with _engine_lock:
        if _engine is not None:
            return _engine

        if _engine_error == "incompatible_model_export":
            raise IncompatibleModelError("Configured model export is incompatible")

        try:
            if BACKEND == "muno-streaming-ctc":
                from muno_streaming import MunoEngine, REPO, REVISION
                if MODEL_ID != REPO or MODEL_REVISION != REVISION:
                    raise IncompatibleModelError("Muno adapter requires its validated revision")
                _engine = MunoEngine(HF_TOKEN, NUM_THREADS)
            elif BACKEND == "sherpa-offline-ctc":
                _engine = _load_offline_ctc()
            elif BACKEND == "sherpa-fastconformer":
                _engine = _load_sherpa()
            elif BACKEND == "tarteel-whisper":
                _engine = _load_whisper()
            elif BACKEND == "nemo-fastconformer":
                _engine = _load_nemo()
            else:
                raise RuntimeError(f"Unsupported QASR_BACKEND: {BACKEND}")
            _engine_error = None
        except IncompatibleModelError:
            _engine_error = "incompatible_model_export"
            raise
        except Exception:
            _engine_error = "model_load_failed"
            raise

    return _engine


def _cleanup_sessions():
    now = time.time()
    with _sessions_lock:
        stale = [
            sid
            for sid, state in _sessions.items()
            if now - state.get("updated_at", now) > (60 if state.get("finished") else SESSION_TTL)
        ]
        for sid in stale:
            _sessions.pop(sid, None)


def _stable_delta(state: dict, text: str, final: bool) -> tuple[str, bool]:
    """Emit only stable whole words; never replay a revised cumulative hypothesis."""
    current = text.split()
    committed = state.get("committed_words", [])
    previous = state.get("previous_words", [])
    state["previous_words"] = current
    if current[:len(committed)] != committed:
        return "", True
    end = len(current)
    if not final:
        end = 0
        for a, b in zip(previous, current):
            if a != b:
                break
            end += 1
        # The final token may still be an unfinished Arabic word.
        end = min(end, max(0, len(current) - 1))
    end = max(len(committed), end)
    delta = " ".join(current[len(committed):end])
    state["committed_words"] = current[:end]
    return delta, False


def _result_text(result) -> str:
    if result is None:
        return ""
    text = getattr(result, "text", None)
    if text is not None:
        return str(text).strip()
    if isinstance(result, dict):
        return str(result.get("text") or "").strip()
    return str(result).strip()


def _transcribe_sherpa(
    audio: np.ndarray, session_id: str, final: bool, seq: Optional[int] = None
) -> tuple[str, str, bool]:
    recognizer = _load_engine()
    _cleanup_sessions()
    sid = session_id or f"oneshot-{time.time_ns()}"

    with _sessions_lock:
        state = _sessions.get(sid)
        if state is None:
            if seq not in (None, 0):
                raise HTTPException(status_code=409, detail="session expired or chunk out of order")
            if len(_sessions) >= MAX_SESSIONS:
                raise HTTPException(status_code=503, detail="session capacity reached")
            state = {
                "stream": recognizer.create_stream() if BACKEND in {"sherpa-fastconformer", "muno-streaming-ctc"} else None,
                "lock": threading.Lock(),
                "next_seq": 0,
                "responses": {},
                "updated_at": time.time(),
            }
            _sessions[sid] = state
    fingerprint = hashlib.sha256(audio.tobytes() + bytes([final])).digest()
    with state["lock"]:
        if seq is not None:
            cached = state["responses"].get(seq)
            if cached:
                if cached[0] != fingerprint:
                    raise HTTPException(status_code=409, detail="chunk sequence reused with different audio")
                return cached[1]
            if seq != state["next_seq"] or state.get("finished"):
                raise HTTPException(status_code=409, detail="chunk out of order")
        if BACKEND == "sherpa-offline-ctc":
            # Each browser segment is decoded independently; no canonical ayah
            # retrieval or language-model correction is used here.
            delta = _decode_offline_ctc(recognizer, audio)
            text = (state.get("text", "") + " " + delta).strip()
            state["text"] = text
            revised = False
        elif BACKEND == "muno-streaming-ctc":
            text = state["stream"].accept(audio, final=final)
            delta, revised = _stable_delta(state, text, final)
        else:
            stream = state.get("stream")
            if stream is None:
                raise HTTPException(status_code=409, detail="session already finalized")
            if audio.size:
                stream.accept_waveform(16000, audio)
            if final:
                # Allow the encoder's last partial window to produce its tokens.
                stream.accept_waveform(16000, np.zeros(4800, dtype=np.float32))
                stream.input_finished()
            while recognizer.is_ready(stream):
                recognizer.decode_stream(stream)
            text = _result_text(recognizer.get_result(stream))
            delta, revised = _stable_delta(state, text, final)
        result = (text, delta, revised)
        state["updated_at"] = time.time()
        if seq is not None:
            state["responses"][seq] = (fingerprint, result)
            state["next_seq"] += 1
            # A lost response can be retried without feeding audio twice.
            for old_seq in list(state["responses"]):
                if old_seq < seq - 2:
                    del state["responses"][old_seq]
        if final:
            state["finished"] = True
            state.pop("stream", None)
    if seq is None:
        with _sessions_lock:
            _sessions.pop(sid, None)
    return result


def _decode_offline_ctc(recognizer, audio: np.ndarray) -> str:
    # An energy gate prevents silence-only hallucinations. It is NOT a speech
    # classifier or calibrated acoustic confidence; noisy input can still pass.
    if not audio.size or float(np.sqrt(np.mean(audio * audio))) < 0.0001:
        return ""
    stream = recognizer.create_stream()
    stream.accept_waveform(16000, audio)
    recognizer.decode_stream(stream)
    return _result_text(stream.result)


def _transcribe_whisper(audio: np.ndarray) -> str:
    if not audio.size:
        return ""
    result = _load_engine()({"array": audio, "sampling_rate": 16000})
    return _result_text(result)


def _transcribe_nemo(audio: np.ndarray) -> str:
    if not audio.size:
        return ""

    import soundfile as sf
    import tempfile

    model = _load_engine()
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as f:
        sf.write(f.name, audio, 16000, subtype="PCM_16")
        out = model.transcribe([f.name])

    return _result_text(out[0] if out else "")


@app.on_event("startup")
def _startup():
    if PRELOAD and (BACKEND not in {"sherpa-offline-ctc", "muno-streaming-ctc"} or ALLOW_EXPERIMENTAL):
        threading.Thread(target=lambda: _safe_preload(), daemon=True).start()


def _safe_preload():
    try:
        _load_engine()
    except Exception:
        # Health remains available even if model loading fails.
        pass


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": APP_NAME,
        "backend": BACKEND,
        "model": MODEL_ID,
        "revision": MODEL_REVISION,
        "recitation_mode": "streaming" if BACKEND in {"sherpa-fastconformer", "muno-streaming-ctc"} else "chunked",
        "device": _device_name(),
        "quran_specialized": True,
        "streaming": BACKEND in {"sherpa-fastconformer", "muno-streaming-ctc"},
        "engine_loaded": _engine is not None,
        "experimental": BACKEND in {"sherpa-offline-ctc", "muno-streaming-ctc"},
        "enabled": BACKEND not in {"sherpa-offline-ctc", "muno-streaming-ctc"} or ALLOW_EXPERIMENTAL,
        "model_error": _engine_error,
        "license_note": (
            "CC-BY-4.0 model; attribution required"
            if MODEL_ID.startswith(("mohammed/", "TheGreatQuran/"))
            else "NPL-1.1; no-profit use only; experimental" if BACKEND == "muno-streaming-ctc"
            else "review upstream model license"
        ),
    }


@app.get("/model-info")
def model_info():
    return {
        "backend": BACKEND,
        "model": MODEL_ID,
        "revision": MODEL_REVISION,
        "quran_specialized": True,
        "streaming": BACKEND in {"sherpa-fastconformer", "muno-streaming-ctc"},
        "sample_rate": 16000,
        "threads": NUM_THREADS,
        "session_ttl": SESSION_TTL,
        "engine_loaded": _engine is not None,
        "model_error": _engine_error,
        "attribution": (
            "TheGreatQuran export / Mohammed Quran fine-tune / NVIDIA FastConformer (CC-BY-4.0)"
            if MODEL_ID.startswith("TheGreatQuran/")
            else MODEL_ID + " (CC-BY-4.0)" if MODEL_ID.startswith("mohammed/")
            else MODEL_ID
        ),
    }


@app.get("/ready")
def ready():
    if BACKEND in {"sherpa-offline-ctc", "muno-streaming-ctc"} and not ALLOW_EXPERIMENTAL:
        raise HTTPException(status_code=503, detail="Experimental backend is not enabled")
    if _engine is None:
        raise HTTPException(status_code=503, detail="Quran ASR model is not ready")
    return {"ok": True, "engine_loaded": True, "backend": BACKEND, "model": MODEL_ID}


@app.post("/warmup")
def warmup():
    if BACKEND in {"sherpa-offline-ctc", "muno-streaming-ctc"} and not ALLOW_EXPERIMENTAL:
        raise HTTPException(status_code=503, detail="Experimental backend is not enabled")
    try:
        _load_engine()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Quran ASR warmup failed") from exc
    return {
        "ok": True,
        "backend": BACKEND,
        "model": MODEL_ID,
        "device": _device_name(),
    }


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    if BACKEND in {"sherpa-offline-ctc", "muno-streaming-ctc"} and not ALLOW_EXPERIMENTAL:
        raise HTTPException(status_code=503, detail="Experimental backend is not enabled")
    audio = _decode_pcm(req)

    try:
        if BACKEND in {"sherpa-fastconformer", "sherpa-offline-ctc", "muno-streaming-ctc"}:
            text, delta, revised = _transcribe_sherpa(
                audio, req.session_id or "", req.final, req.seq
            )
        elif BACKEND == "nemo-fastconformer":
            text = _transcribe_nemo(audio)
            delta = text
            revised = False
        else:
            text = _transcribe_whisper(audio)
            delta = text
            revised = False
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Quran ASR unavailable") from exc

    return {
        "transcript": text,
        "transcript_delta": delta,
        "transcript_revised": revised,
        "backend": BACKEND,
        "model": MODEL_ID,
        "quran_specialized": True,
        "streaming": BACKEND in {"sherpa-fastconformer", "muno-streaming-ctc"},
        "seq": req.seq,
        "final": req.final,
        "confidence": None,
        "confidence_calibrated": False,
    }


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    with _sessions_lock:
        existed = _sessions.pop(session_id, None) is not None
    return {"ok": True, "removed": existed}

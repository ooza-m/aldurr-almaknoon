import base64
import os
import threading
import time
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "Durr Quran ASR"
BACKEND = os.getenv("QASR_BACKEND", "sherpa-fastconformer").strip().lower()
MODEL_ID = os.getenv(
    "QASR_MODEL", "mohammed/fastconformer-quran-ar-onnx-int8"
).strip()
HF_TOKEN = os.getenv("HF_TOKEN") or None
SESSION_TTL = int(os.getenv("QASR_SESSION_TTL", "1200"))
NUM_THREADS = max(1, int(os.getenv("QASR_THREADS", "4")))
PRELOAD = os.getenv("QASR_PRELOAD", "1") not in {"0", "false", "False"}

app = FastAPI(title=APP_NAME, version="2.0.0")

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
_engine_lock = threading.Lock()
_sessions = {}
_sessions_lock = threading.Lock()


class TranscribeRequest(BaseModel):
    audio_b64: str = ""
    sample_rate: int = Field(default=16000, ge=8000, le=48000)
    page: Optional[int] = Field(default=None, ge=1, le=604)
    position: Optional[int] = Field(default=None, ge=0)
    session_id: Optional[str] = None
    seq: int = Field(default=0, ge=0)
    final: bool = False


def _device_name() -> str:
    if BACKEND == "sherpa-fastconformer":
        return "cpu"
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def _decode_pcm(req: TranscribeRequest) -> np.ndarray:
    if not req.audio_b64:
        if req.final:
            return np.zeros(0, dtype=np.float32)
        raise HTTPException(status_code=400, detail="audio_b64 is required")

    try:
        raw = base64.b64decode(req.audio_b64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid audio_b64") from exc

    if len(raw) < 800:
        if req.final:
            return np.zeros(0, dtype=np.float32)
        raise HTTPException(status_code=400, detail="audio chunk too short")
    if len(raw) % 2:
        raw = raw[:-1]

    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if req.sample_rate != 16000:
        raise HTTPException(status_code=400, detail="sample_rate must be 16000")
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
    global _engine
    if _engine is not None:
        return _engine

    with _engine_lock:
        if _engine is not None:
            return _engine

        if BACKEND == "sherpa-fastconformer":
            _engine = _load_sherpa()
        elif BACKEND == "tarteel-whisper":
            _engine = _load_whisper()
        elif BACKEND == "nemo-fastconformer":
            _engine = _load_nemo()
        else:
            raise RuntimeError(f"Unsupported QASR_BACKEND: {BACKEND}")

    return _engine


def _cleanup_sessions():
    now = time.time()
    with _sessions_lock:
        stale = [
            sid
            for sid, state in _sessions.items()
            if now - state.get("updated_at", now) > SESSION_TTL
        ]
        for sid in stale:
            _sessions.pop(sid, None)


def _delta_text(previous: str, current: str) -> str:
    previous = (previous or "").strip()
    current = (current or "").strip()
    if not previous:
        return current
    if current.startswith(previous):
        return current[len(previous) :].strip()

    prev = previous.split()
    cur = current.split()
    best = 0
    for n in range(1, min(len(prev), len(cur), 12) + 1):
        if prev[-n:] == cur[:n]:
            best = n
    return " ".join(cur[best:]).strip()


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
    audio: np.ndarray, session_id: str, final: bool
) -> tuple[str, str]:
    recognizer = _load_engine()
    _cleanup_sessions()
    sid = session_id or f"oneshot-{time.time_ns()}"

    with _sessions_lock:
        state = _sessions.get(sid)
        if state is None:
            state = {
                "stream": recognizer.create_stream(),
                "last_text": "",
                "updated_at": time.time(),
            }
            _sessions[sid] = state
        stream = state["stream"]

    if audio.size:
        stream.accept_waveform(16000, audio)
    if final:
        stream.input_finished()

    while recognizer.is_ready(stream):
        recognizer.decode_stream(stream)

    text = _result_text(recognizer.get_result(stream))
    with _sessions_lock:
        old = state.get("last_text", "")
        delta = _delta_text(old, text)
        state["last_text"] = text
        state["updated_at"] = time.time()
        if final:
            _sessions.pop(sid, None)

    return text, delta


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
    if PRELOAD:
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
        "device": _device_name(),
        "quran_specialized": True,
        "streaming": BACKEND == "sherpa-fastconformer",
        "engine_loaded": _engine is not None,
        "license_note": (
            "CC-BY-4.0 model; attribution required"
            if MODEL_ID.startswith("mohammed/")
            else "review upstream model license"
        ),
    }


@app.get("/model-info")
def model_info():
    return {
        "backend": BACKEND,
        "model": MODEL_ID,
        "quran_specialized": True,
        "streaming": BACKEND == "sherpa-fastconformer",
        "sample_rate": 16000,
        "threads": NUM_THREADS,
        "session_ttl": SESSION_TTL,
        "engine_loaded": _engine is not None,
        "attribution": (
            "mohammed/fastconformer-quran-ar-onnx-int8 (CC-BY-4.0)"
            if MODEL_ID.startswith("mohammed/")
            else MODEL_ID
        ),
    }


@app.post("/warmup")
def warmup():
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
    audio = _decode_pcm(req)

    try:
        if BACKEND == "sherpa-fastconformer":
            text, delta = _transcribe_sherpa(
                audio, req.session_id or "", req.final
            )
        elif BACKEND == "nemo-fastconformer":
            text = _transcribe_nemo(audio)
            delta = text
        else:
            text = _transcribe_whisper(audio)
            delta = text
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Quran ASR unavailable") from exc

    return {
        "transcript": text,
        "transcript_delta": delta,
        "backend": BACKEND,
        "model": MODEL_ID,
        "quran_specialized": True,
        "streaming": BACKEND == "sherpa-fastconformer",
        "seq": req.seq,
        "final": req.final,
        "confidence": None,
    }


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    with _sessions_lock:
        existed = _sessions.pop(session_id, None) is not None
    return {"ok": True, "removed": existed}

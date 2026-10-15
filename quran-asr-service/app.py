import base64
import io
import os
import threading
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "Durr Quran ASR"
BACKEND = os.getenv("QASR_BACKEND", "tarteel-whisper").strip().lower()
MODEL_ID = os.getenv("QASR_MODEL", "tarteel-ai/whisper-base-ar-quran").strip()
HF_TOKEN = os.getenv("HF_TOKEN") or None

app = FastAPI(title=APP_NAME, version="1.0.0")

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
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

_model = None
_model_lock = threading.Lock()


class TranscribeRequest(BaseModel):
    audio_b64: str = Field(min_length=16)
    sample_rate: int = Field(default=16000, ge=8000, le=48000)
    page: Optional[int] = Field(default=None, ge=1, le=604)
    position: Optional[int] = Field(default=None, ge=0)
    session_id: Optional[str] = None


def _decode_pcm(req: TranscribeRequest) -> np.ndarray:
    try:
        raw = base64.b64decode(req.audio_b64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="invalid audio_b64") from exc

    if len(raw) < 1600:
        raise HTTPException(status_code=400, detail="audio chunk too short")
    if len(raw) % 2:
        raw = raw[:-1]

    audio = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    if req.sample_rate != 16000:
        # The web client currently sends 16 kHz. Reject other rates rather than
        # silently resampling with a low-quality algorithm.
        raise HTTPException(status_code=400, detail="sample_rate must be 16000")
    return audio


def _load_model():
    global _model
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        if BACKEND == "tarteel-whisper":
            from transformers import pipeline

            device = 0 if torch.cuda.is_available() else -1
            _model = pipeline(
                "automatic-speech-recognition",
                model=MODEL_ID,
                token=HF_TOKEN,
                device=device,
            )
        elif BACKEND == "nemo-fastconformer":
            try:
                import nemo.collections.asr as nemo_asr
            except Exception as exc:
                raise RuntimeError(
                    "NeMo backend requested but nemo_toolkit[asr] is not installed"
                ) from exc

            _model = nemo_asr.models.ASRModel.from_pretrained(
                model_name=MODEL_ID,
                map_location="cuda" if torch.cuda.is_available() else "cpu",
            )
            _model.eval()
        else:
            raise RuntimeError(f"Unsupported QASR_BACKEND: {BACKEND}")

    return _model


def _transcribe_whisper(audio: np.ndarray) -> str:
    model = _load_model()
    result = model({"array": audio, "sampling_rate": 16000})
    if isinstance(result, dict):
        return str(result.get("text") or "").strip()
    return str(result or "").strip()


def _transcribe_nemo(audio: np.ndarray) -> str:
    model = _load_model()
    buf = io.BytesIO()
    sf.write(buf, audio, 16000, format="WAV", subtype="PCM_16")
    buf.seek(0)

    # NeMo's transcribe path is file-oriented. A temporary file keeps this
    # adapter compatible with the public checkpoint and can be swapped for a
    # streaming/ONNX implementation later without changing the web client.
    import tempfile

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=True) as f:
        f.write(buf.read())
        f.flush()
        out = model.transcribe([f.name])

    if not out:
        return ""
    first = out[0]
    return str(getattr(first, "text", first) or "").strip()


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": APP_NAME,
        "backend": BACKEND,
        "model": MODEL_ID,
        "device": "cuda" if torch.cuda.is_available() else "cpu",
        "quran_specialized": True,
    }


@app.post("/transcribe")
def transcribe(req: TranscribeRequest):
    audio = _decode_pcm(req)

    try:
        if BACKEND == "nemo-fastconformer":
            text = _transcribe_nemo(audio)
        else:
            text = _transcribe_whisper(audio)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Quran ASR unavailable") from exc

    return {
        "transcript": text,
        "backend": BACKEND,
        "model": MODEL_ID,
        "quran_specialized": True,
        # The application intentionally aligns this transcript against its
        # canonical Quran text. The model does not decide whether a recitation
        # error is confirmed.
        "confidence": None,
    }

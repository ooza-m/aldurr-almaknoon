import base64
import hashlib
import json
import os
import threading
import time
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

APP_NAME = "Durr Quran ASR"
BACKEND = os.getenv("QASR_BACKEND", "quran-zipformer-ctc").strip().lower()
MODEL_ID = os.getenv(
    "QASR_MODEL", "Quran-Lab/zipformer_p-arabic-v3"
).strip()
HF_TOKEN = os.getenv("HF_TOKEN") or None
SESSION_TTL = int(os.getenv("QASR_SESSION_TTL", "1200"))
MAX_SESSIONS = max(1, int(os.getenv("QASR_MAX_SESSIONS", "32")))
MAX_PCM_BYTES = 16000 * 2 * 15
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
    if BACKEND in {"sherpa-fastconformer", "quran-zipformer-ctc"}:
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


def _load_zipformer_ctc():
    from huggingface_hub import hf_hub_download
    import sherpa_onnx

    model = hf_hub_download(MODEL_ID, "zipformer_p_arabic_v3.int8.onnx", token=HF_TOKEN)
    tokens = hf_hub_download(MODEL_ID, "tokens.txt", token=HF_TOKEN)
    return sherpa_onnx.OnlineRecognizer.from_zipformer2_ctc(
        model=model, tokens=tokens, sample_rate=16000,
        feature_dim=80, num_threads=NUM_THREADS,
        decoding_method="greedy_search",
        enable_endpoint_detection=False,
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
    global _engine, _engine_error
    if _engine is not None:
        return _engine

    with _engine_lock:
        if _engine is not None:
            return _engine

        if _engine_error == "incompatible_model_export":
            raise IncompatibleModelError("Configured model export is incompatible")

        try:
            if BACKEND == "quran-zipformer-ctc":
                _engine = _load_zipformer_ctc()
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
                "stream": recognizer.create_stream(),
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
        "streaming": BACKEND in {"sherpa-fastconformer", "quran-zipformer-ctc"},
        "engine_loaded": _engine is not None,
        "model_error": _engine_error,
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
        "streaming": BACKEND in {"sherpa-fastconformer", "quran-zipformer-ctc"},
        "sample_rate": 16000,
        "threads": NUM_THREADS,
        "session_ttl": SESSION_TTL,
        "engine_loaded": _engine is not None,
        "model_error": _engine_error,
        "attribution": (
            "mohammed/fastconformer-quran-ar-onnx-int8 (CC-BY-4.0)"
            if MODEL_ID.startswith("mohammed/")
            else MODEL_ID
        ),
    }


@app.get("/ready")
def ready():
    if _engine is None:
        raise HTTPException(status_code=503, detail="Quran ASR model is not ready")
    return {"ok": True, "engine_loaded": True, "backend": BACKEND, "model": MODEL_ID}


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
        if BACKEND in {"sherpa-fastconformer", "quran-zipformer-ctc"}:
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
        "transcript_format": "phonemes" if BACKEND == "quran-zipformer-ctc" else "words",
        "transcript_delta": delta,
        "transcript_revised": revised,
        "backend": BACKEND,
        "model": MODEL_ID,
        "quran_specialized": True,
        "streaming": BACKEND == "sherpa-fastconformer",
        "seq": req.seq,
        "final": req.final,
        "confidence": None,
        "confidence_calibrated": False,
    }


_reference_cache = None
_reference_lock = threading.Lock()


def _reference_data():
    """Load the upstream licensed reference inside the private ASR service."""
    global _reference_cache
    if _reference_cache is not None:
        return _reference_cache
    with _reference_lock:
        if _reference_cache is None:
            from huggingface_hub import hf_hub_download
            path = hf_hub_download(
                MODEL_ID, "ordered_quran_phonemes.json", token=HF_TOKEN
            )
            with open(path, encoding="utf-8") as stream:
                data = json.load(stream)
            if not isinstance(data, (dict, list)):
                raise ValueError("Unexpected Quran phoneme reference")
            _reference_cache = data
    return _reference_cache


@app.get("/phoneme-reference/schema")
def phoneme_reference_schema():
    """Return a minimal, non-sensitive structural probe, never token or model files."""
    try:
        data = _reference_data()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Reference unavailable") from exc
    def describe(value):
        if isinstance(value, dict):
            keys = list(value.keys())
            return {"kind": "object", "count": len(keys),
                    "sample_keys": keys[:4],
                    "sample_value": describe(value[keys[0]]) if keys else None}
        if isinstance(value, list):
            return {"kind": "array", "count": len(value),
                    "sample_value": describe(value[0]) if value else None}
        return {"kind": type(value).__name__,
                "preview": str(value)[:80] if isinstance(value, (str, int, float)) else None}
    structure = describe(data)
    print("QASR_REFERENCE_SCHEMA " + json.dumps(structure, ensure_ascii=False), flush=True)
    return {"model": MODEL_ID, "reference": "ordered_quran_phonemes.json",
            "schema": structure}


def _verified_word_units(value):
    """Only accept source records with explicit boundaries for each word."""
    if isinstance(value, dict):
        value = value.get("words", value.get("word_phonemes"))
    if not isinstance(value, list) or not value:
        return None
    units = []
    for item in value:
        if not isinstance(item, dict):
            return None
        phonemes = item.get("phonemes")
        if not isinstance(phonemes, list) or not phonemes or not all(
            isinstance(p, str) and p.strip() for p in phonemes
        ):
            return None
        units.append(phonemes)
    return units


@app.get("/phoneme-reference/verse/{surah}/{ayah}")
def phoneme_reference_verse(surah: int, ayah: int):
    """Never invent word boundaries from a whole-ayah phoneme string."""
    if not (1 <= surah <= 114 and 1 <= ayah <= 286):
        raise HTTPException(status_code=400, detail="Invalid verse location")
    try:
        data = _reference_data()
    except Exception as exc:
        raise HTTPException(status_code=503, detail="Reference unavailable") from exc
    if not isinstance(data, dict):
        raise HTTPException(status_code=422, detail="Verse-keyed reference not supported")
    value = data.get(f"{surah}:{ayah}")
    if value is None:
        value = data.get(str(surah), {})
        if isinstance(value, dict):
            value = value.get(str(ayah))
    if value is None:
        raise HTTPException(status_code=404, detail="Verse not present in reference")
    words = _verified_word_units(value)
    if words is None:
        raise HTTPException(
            status_code=422,
            detail="Reference has no verified word-level phoneme boundaries"
        )
    return {"verse": f"{surah}:{ayah}", "word_phonemes": words,
            "verified_word_boundaries": True}


@app.delete("/session/{session_id}")
def delete_session(session_id: str):
    with _sessions_lock:
        existed = _sessions.pop(session_id, None) is not None
    return {"ok": True, "removed": existed}

"""Private preflight only. Never exposes a usable transcription endpoint.

The model is downloaded using the service's existing sealed HF_TOKEN. Upstream
Python is inspected as text, never imported or executed. No credentials appear
in logs or reports. /ready refers to this preflight, not ASR acceptance.
"""
import hashlib
import json
import os
import re
import threading
from pathlib import Path

from fastapi import FastAPI, HTTPException

REPO = "Muno459/fastconformer-quran-streaming"
FILES = ("LICENSE", "config.json", "streaming_inference_example.py",
         "streaming_global_cmvn.npz", "tokenizer.model", "model.q8.onnx")
INPUTS = {"audio_signal", "length", "cache_last_channel", "cache_last_time", "cache_last_channel_len"}
app = FastAPI(title="Durr private model preflight", version="82.0")
report = {"test_mode": True, "asr_ready": False, "probe_ready": False,
          "engine_loaded": False, "enabled": False, "model": REPO}


def safe_text(value):
    text = str(value)
    token = os.environ.get("HF_TOKEN")
    if token:
        text = text.replace(token, "[REDACTED]")
    return re.sub(r"hf_[A-Za-z0-9]+", "[REDACTED]", text)


def inspect_files(paths, session_factory):
    import numpy as np

    metadata = {}
    for name, path in paths.items():
        digest = hashlib.sha256()
        with open(path, "rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        metadata[name] = {"bytes": Path(path).stat().st_size, "sha256": digest.hexdigest()}
    session = session_factory(paths["model.q8.onnx"])
    inputs = [{"name": x.name, "shape": x.shape, "type": x.type} for x in session.get_inputs()]
    outputs = [{"name": x.name, "shape": x.shape, "type": x.type} for x in session.get_outputs()]
    if {x["name"] for x in inputs} != INPUTS or len(outputs) < 5:
        raise ValueError("Unexpected cache-aware ONNX interface")
    with np.load(paths["streaming_global_cmvn.npz"], allow_pickle=False) as stats:
        cmvn = {key: {"shape": list(stats[key].shape), "finite": bool(np.isfinite(stats[key]).all())}
                for key in stats.files}
    if not all(x["finite"] for x in cmvn.values()):
        raise ValueError("Invalid CMVN")
    config = json.loads(Path(paths["config.json"]).read_text())
    reference = Path(paths["streaming_inference_example.py"]).read_text()
    license_text = Path(paths["LICENSE"]).read_text()
    return {"files": metadata, "inputs": inputs, "outputs": outputs, "cmvn": cmvn,
            "config": config, "reference_source": reference[:20000], "license_text": license_text[:12000],
            "access_verified": True, "graph_loaded": True}


def run_probe():
    global report
    phase = "credentials"
    try:
        token = os.environ.get("HF_TOKEN")
        if not token:
            raise RuntimeError("Missing HF_TOKEN")
        from huggingface_hub import HfApi, hf_hub_download
        import onnxruntime as ort

        phase = "repository"
        revision = HfApi(token=token).model_info(REPO, revision=os.getenv("QASR_PROBE_REVISION") or "main").sha
        if not re.fullmatch(r"[a-f0-9]{40}", revision or ""):
            raise ValueError("Unpinned upstream revision")
        paths = {}
        for name in FILES:
            phase = "download:" + name
            paths[name] = hf_hub_download(REPO, name, revision=revision, token=token)
        phase = "graph-inspection"
        def session_factory(path):
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.inter_op_num_threads = 1
            return ort.InferenceSession(path, options, providers=["CPUExecutionProvider"])
        details = inspect_files(paths, session_factory)
        report = {**report, **details, "revision": revision, "probe_ready": True}
        print("DURR_PROBE_RESULT " + safe_text(json.dumps(report, ensure_ascii=True)), flush=True)
    except Exception as error:
        response = getattr(error, "response", None)
        report = {**report, "phase": phase, "error_type": type(error).__name__,
                  "http_status": getattr(response, "status_code", None), "probe_ready": False}
        print("DURR_PROBE_ERROR " + safe_text(json.dumps(report)), flush=True)


@app.on_event("startup")
def startup():
    threading.Thread(target=run_probe, daemon=True).start()


@app.get("/ready")
def ready():
    if not report["probe_ready"]:
        raise HTTPException(503, "Private model preflight is not ready")
    return {"probe_ready": True, "test_mode": True, "asr_ready": False}


@app.get("/health")
def health():
    return {key: value for key, value in report.items()
            if key not in {"reference_source", "license_text", "config"}}


@app.get("/report")
def get_report():
    return report


@app.post("/transcribe")
def transcribe():
    raise HTTPException(503, "Preflight only; transcription is disabled")

"""Bounded loopback HTTP smoke checks on public recitation, never user audio.

Used only on the explicitly approved experimental deployment. It cannot enable
the website. Results are diagnostics, not an accuracy benchmark or acceptance.
"""
import base64
import json
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

import numpy as np

BASE = "http://127.0.0.1:" + os.getenv("PORT", "8000")
CASES = [
    ("Alafasy_128kbps", "001002", "الحمد لله رب العالمين"),
    ("Alafasy_128kbps", "001003", "الرحمن الرحيم"),
    ("Alafasy_128kbps", "001004", "مالك يوم الدين"),
    ("Alafasy_128kbps", "002006", "إن الذين كفروا سواء عليهم أأنذرتهم أم لم تنذرهم لا يؤمنون"),
    ("Husary_128kbps", "001002", "الحمد لله رب العالمين"),
    ("Minshawy_Murattal_128kbps", "001002", "الحمد لله رب العالمين"),
]


def request(path, payload=None, method=None):
    body = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(BASE + path, data=body, method=method,
                                 headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=90) as response:
        return json.load(response)


def run_pcm(raw, sid, retry=False):
    final_body = None
    deltas, snapshots, milliseconds = [], [], []
    chunks = [raw[i:i + 32000] for i in range(0, len(raw), 32000)] + [b""]
    for seq, chunk in enumerate(chunks):
        body = {"session_id": sid, "seq": seq, "sample_rate": 16000,
                "audio_b64": base64.b64encode(chunk).decode(), "final": seq == len(chunks) - 1}
        started = time.perf_counter()
        response = request("/transcribe", body)
        milliseconds.append(round((time.perf_counter() - started) * 1000, 1))
        if retry and seq == 0:
            if request("/transcribe", body) != response:
                raise ValueError("Non-idempotent retry")
        deltas.append(response["transcript_delta"])
        snapshots.append(response["transcript"])
        final_body = body
    if retry and request("/transcribe", final_body) != response:
        raise ValueError("Non-idempotent final retry")
    request("/session/" + sid, method="DELETE")
    return {"transcript": snapshots[-1], "deltas": deltas, "snapshots": snapshots,
            "request_ms": milliseconds, "streaming": response["streaming"]}


def main():
    if os.getenv("QASR_RUN_SMOKE") != "1":
        return
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        try:
            ready = request("/ready")
            if ready.get("engine_loaded"):
                break
        except Exception:
            time.sleep(2)
    else:
        raise TimeoutError("Model readiness timed out")
    health = request("/health")
    if health.get("backend") != "muno-streaming-ctc" or not health.get("experimental"):
        raise ValueError("Wrong smoke-test backend")
    silence = run_pcm(bytes(64000), "smoke_silence", retry=True)
    if silence["transcript"]:
        raise ValueError("Silence hallucination")
    rows = []
    with tempfile.TemporaryDirectory(prefix="durr-public-smoke-") as folder:
        for i, (reader, verse, reference) in enumerate(CASES):
            url = "https://everyayah.com/data/" + reader + "/" + verse + ".mp3"
            with urllib.request.urlopen(url, timeout=30) as response:
                audio = response.read(4 * 1024 * 1024 + 1)
            if len(audio) > 4 * 1024 * 1024:
                raise ValueError("Fixture too large")
            path = Path(folder) / (str(i) + ".mp3")
            path.write_bytes(audio)
            decoded = subprocess.run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "-ac", "1", "-ar", "16000", "pipe:1"],
                                     capture_output=True, check=True, timeout=30).stdout
            result = run_pcm(decoded, "smoke_" + str(i), retry=i == 0)
            row = {"reader": reader, "verse": verse, "reference": reference,
                   "audio_seconds": round(len(decoded) / 32000, 3), **result}
            rows.append(row)
            print("DURR_SMOKE_CASE " + json.dumps(row, ensure_ascii=True), flush=True)
    print("DURR_SMOKE_DONE " + json.dumps({"runtime_verified": True, "accuracy_verified": False,
          "silence_passed": True, "http_retry_passed": True, "cases": len(rows),
          "revision": health["revision"]}), flush=True)


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Never print HTTP bodies, exception URLs, headers, or credentials.
        print("DURR_SMOKE_ERROR " + json.dumps({"error_type": type(error).__name__,
              "http_status": getattr(error, "code", None)}), flush=True)

"""Run real model inference in a child process before enabling an ASR backend.

This is a compatibility/smoke check, never a recognition-accuracy benchmark.
Downloaded models and recordings remain outside the repository.
"""
import argparse
import json
import subprocess
import sys
import time
import wave
from pathlib import Path

import numpy as np


def read_audio(path):
    with wave.open(str(path), "rb") as wav:
        if (wav.getframerate(), wav.getnchannels(), wav.getsampwidth()) != (16000, 1, 2):
            raise ValueError("Expected mono PCM16 WAV at 16000 Hz")
        return np.frombuffer(wav.readframes(wav.getnframes()), dtype="<i2").astype(np.float32) / 32768


def child(args):
    import sherpa_onnx
    from huggingface_hub import hf_hub_download
    from evaluate import norm

    model = hf_hub_download(args.repo, args.model_file, revision=args.revision)
    tokens = hf_hub_download(args.repo, "tokens.txt", revision=args.revision)
    started = time.perf_counter()
    recognizer = sherpa_onnx.OfflineRecognizer.from_nemo_ctc(
        model=model, tokens=tokens, num_threads=args.threads,
    )
    result = {"repo": args.repo, "revision": args.revision,
              "model_file": args.model_file, "mode": "offline-ctc",
              "load_seconds": round(time.perf_counter() - started, 3), "runs": []}
    clips = [("silence", np.zeros(32000, dtype=np.float32), None)]
    clips += [(str(Path(path).name), read_audio(path), args.reference[i] if args.reference else None)
              for i, path in enumerate(args.wav)]
    for name, audio, reference in clips:
        # Repeated independent streams detect state leakage and native crashes.
        for repeat in range(2):
            stream = recognizer.create_stream()
            stream.accept_waveform(16000, audio)
            started = time.perf_counter()
            recognizer.decode_stream(stream)
            row = {"clip": name, "repeat": repeat,
                "audio_seconds": round(len(audio) / 16000, 3),
                "decode_seconds": round(time.perf_counter() - started, 3),
                "transcript": stream.result.text}
            if reference is not None:
                row.update(reference=reference, normalized_match=norm(reference) == norm(stream.result.text))
            result["runs"].append(row)
    print(json.dumps(result, ensure_ascii=False), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True)
    parser.add_argument("--revision", required=True, help="Pin an upstream commit SHA")
    parser.add_argument("--model-file", required=True)
    parser.add_argument("--wav", action="append", default=[])
    parser.add_argument("--reference", action="append", default=[],
                        help="Actually spoken text, one per --wav; mismatches fail the smoke check")
    parser.add_argument("--threads", type=int, default=2)
    parser.add_argument("--timeout", type=int, default=180)
    parser.add_argument("--out", help="Optional local JSON report")
    parser.add_argument("--child", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if args.reference and len(args.reference) != len(args.wav):
        parser.error("Supply one --reference per --wav, or omit references entirely")
    if args.child:
        child(args)
        return
    try:
        completed = subprocess.run([sys.executable, str(Path(__file__).resolve()),
            *sys.argv[1:], "--child"], capture_output=True, text=True, timeout=args.timeout)
    except subprocess.TimeoutExpired:
        parser.exit(1, "Runtime probe timed out. Backend remains unverified.\n")
    if completed.returncode:
        # A negative code identifies native-process termination (e.g. SIGSEGV).
        print(completed.stderr[-4000:], file=sys.stderr)
        parser.exit(1, f"Runtime probe failed (child exit {completed.returncode}). Backend remains unverified.\n")
    report = json.loads(completed.stdout.strip().splitlines()[-1])
    report["runtime_verified"] = True
    report["accuracy_verified"] = False
    matches = [row["normalized_match"] for row in report["runs"] if "normalized_match" in row]
    report["smoke_transcripts_match"] = all(matches) if matches else None
    output = json.dumps(report, ensure_ascii=False, indent=2)
    if args.out:
        Path(args.out).write_text(output + "\n", encoding="utf-8")
    print(output)
    if matches and not all(matches):
        parser.exit(2, "Model ran but failed supplied transcription smoke references. Do not approve it for release.\n")


if __name__ == "__main__":
    main()

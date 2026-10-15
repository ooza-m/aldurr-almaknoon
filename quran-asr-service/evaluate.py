import argparse
import json
import re
import wave
from pathlib import Path
from typing import List

import numpy as np

from app import (
    BACKEND,
    MODEL_ID,
    _load_engine,
    _transcribe_nemo,
    _transcribe_sherpa,
    _transcribe_whisper,
)

ARABIC = re.compile(r"[^\u0621-\u064A\s]")


def norm(text: str) -> str:
    # Strip combining marks before filtering: replacing them with spaces splits words.
    text = re.sub(r"[\u064B-\u065F\u0670\u06D6-\u06ED\u0640]", "", text or "")
    text = text.replace("ٱ", "ا")
    text = ARABIC.sub(" ", text)
    text = (
        text.replace("أ", "ا")
        .replace("إ", "ا")
        .replace("آ", "ا")
        .replace("ى", "ي")
        .replace("ؤ", "و")
        .replace("ئ", "ي")
    )
    return re.sub(r"\s+", " ", text).strip()


def edit_distance(ref: List[str], hyp: List[str]) -> int:
    prev = list(range(len(hyp) + 1))
    for i, r in enumerate(ref, 1):
        cur = [i]
        for j, h in enumerate(hyp, 1):
            cur.append(min(cur[-1] + 1, prev[j] + 1, prev[j - 1] + (r != h)))
        prev = cur
    return prev[-1]


def read_wav(path: Path) -> np.ndarray:
    with wave.open(str(path), "rb") as f:
        if f.getnchannels() != 1 or f.getsampwidth() != 2 or f.getframerate() != 16000:
            raise ValueError(f"{path}: expected mono PCM16 16kHz WAV")
        raw = f.readframes(f.getnframes())
    return np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0


def transcribe(audio: np.ndarray, sid: str) -> str:
    if BACKEND == "sherpa-fastconformer":
        text, _, _ = _transcribe_sherpa(audio, sid, True)
        return text
    if BACKEND == "nemo-fastconformer":
        return _transcribe_nemo(audio)
    return _transcribe_whisper(audio)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("manifest", help="JSONL: audio, reference, optional category")
    ap.add_argument("--out", default="eval-results.json")
    args = ap.parse_args()

    _load_engine()
    total_edits = total_words = 0
    rows = []
    by_category = {}

    for n, line in enumerate(Path(args.manifest).read_text(encoding="utf-8").splitlines()):
        if not line.strip():
            continue
        item = json.loads(line)
        audio_path = Path(item["audio"])
        if not audio_path.is_absolute():
            audio_path = Path(args.manifest).resolve().parent / audio_path
        audio = read_wav(audio_path)
        hyp = transcribe(audio, f"eval-{n}")
        ref_words, hyp_words = norm(item["reference"]).split(), norm(hyp).split()
        edits = edit_distance(ref_words, hyp_words)
        words = max(1, len(ref_words))
        wer = edits / words
        cat = item.get("category", "general")
        rows.append(
            {
                "audio": str(audio_path),
                "category": cat,
                "reference": item["reference"],
                "hypothesis": hyp,
                "edits": edits,
                "words": words,
                "wer": round(wer, 4),
            }
        )
        total_edits += edits
        total_words += words
        agg = by_category.setdefault(cat, {"edits": 0, "words": 0, "files": 0})
        agg["edits"] += edits
        agg["words"] += words
        agg["files"] += 1

    categories = {
        k: {
            "files": v["files"],
            "wer": round(v["edits"] / max(1, v["words"]), 4),
        }
        for k, v in by_category.items()
    }
    result = {
        "backend": BACKEND,
        "model": MODEL_ID,
        "files": len(rows),
        "wer": round(total_edits / max(1, total_words), 4),
        "categories": categories,
        "rows": rows,
    }
    Path(args.out).write_text(
        json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps({k: v for k, v in result.items() if k != "rows"}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

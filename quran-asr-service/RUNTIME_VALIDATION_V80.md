# Quran model validation — v80

Date: 2026-10-16. Runtime checks on CPU, sherpa-onnx 1.13.8. The model source is `TheGreatQuran/QuranKarim-SpeechToText-onnxModel`, revision `76eab42481554dfe2fd837596802af243482a894`, based on Mohammed's Quran FastConformer fine-tune. This is offline CTC, not cache-aware streaming.

## Actual tests

Three public, correctly recited recordings of Al-Fatihah (1:2, 1:3, 1:4), Mishary Alafasy, downloaded from EveryAyah, converted to mono PCM16/16 kHz. The same recognizer decoded independent streams repeatedly in a child process. No user recording was used, and no audio is committed. Outputs and timings are preserved in `runtime-smoke-v80.json`.

| Export | Runtime | Speech observations | Release decision |
| --- | --- | --- | --- |
| Mixed INT4/INT8 | Runs without crashing | Correct on 1:2; malformed 1:3 and 1:4 | Rejected |
| Q8 | Runs without crashing | Correct on 1:3 and 1:4; transcribed العالمين as العمين | Rejected |
| FP32 | Runs without crashing | Same word loss on العالمين despite full precision | Rejected |

The observations are from three clips from one reciter. They are sufficient to reject the present candidate against the desired product behavior; they cannot establish an overall WER or Tarteel parity. Timings varied from roughly 0.1 to 0.9 seconds for these short clips in this environment; they do not predict hosting or phone latency.

The unfiltered models also emit a character on pure silence. The service's low-energy gate removes that silence-only input before model inference. The gate is not a calibrated speech classifier and cannot establish recitation correctness.

The real service HTTP path was tested for warmup, readiness, actual audio transcription, retry idempotency, an empty final tail, and filtered silence. These are protocol/runtime results, not acceptance of transcription quality. Unit tests additionally check segment boundaries and that an unapproved candidate cannot become ready solely by setting its URL.

## Changes retained

- A CPU Quran-CTC adapter exists for **explicit developer experiments**.
- It is disabled by default: `QASR_ALLOW_EXPERIMENTAL=1` is needed to experiment. Without that setting, `/ready` and `/transcribe` return 503, and the browser refuses it even if the model is initialized.
- The browser recognizes server capability and distinguishes live streaming from experimental segment-based analysis. It bounds segments, waits for pauses, and avoids silence-only requests.
- `probe_runtime.py` isolates native model execution and optionally checks supplied actually-spoken references. A native failure exits 1; transcription mismatch exits 2. `accuracy_verified` remains false in all smoke reports.
- `config.js` still has **no service URL**. No new model was enabled for the public app.

## Next model access

The upstream `Muno459/fastconformer-quran-streaming` provides a cache-aware ONNX CTC graph, tokenizer, fixed-global CMVN statistics and a streaming inference example. Unlike the rejected export, its documented interface explicitly carries caches. The upstream Hugging Face repository has manual gated access. The account holder must request access and accept its contact-sharing and usage conditions; the integration must then be tested on the granted files, not assumed to work from the card.

A phoneme-based candidate such as `Quran-Lab/zipformer_p-arabic-v3` has a separate output contract and also requires gated access. It cannot be plugged into the current word-text aligner as if its output were ordinary Arabic. Its own documented limitations include errors on incorrectly performed tajweed; no automatic tajweed correctness claim is approved.

Sources:
- https://huggingface.co/TheGreatQuran/QuranKarim-SpeechToText-onnxModel
- https://huggingface.co/Muno459/fastconformer-quran-streaming
- https://huggingface.co/Quran-Lab/zipformer_p-arabic-v3

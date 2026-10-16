# Quran ASR service — v80

Quran-specific acoustic transcription for **الدُّرّ المكنون**. The service returns what the model heard; it does not retrieve the nearest canonical ayah. The browser aligns that hypothesis to its Quran text. Automatic findings stay provisional until confidence has been calibrated.

## Experimental candidate: chunked Quran CTC (not approved)

- Backend: `sherpa-offline-ctc` (CPU, sherpa-onnx).
- Model: `TheGreatQuran/QuranKarim-SpeechToText-onnxModel`.
- File: `qurankarim-fastconformer-mixed.onnx`.
- Pinned upstream revision: `76eab42481554dfe2fd837596802af243482a894`.
- Base model: `mohammed/fastconformer-quran-ar`, fine-tuned on Quran recitation.
- Mode: **independent audio segments, not cache-aware live streaming**.

All three tested precisions made errors on clean short recitation. **This candidate is not approved for the app and is disabled by default.** `QASR_ALLOW_EXPERIMENTAL=1` is required for explicit developer experiments; otherwise `/ready` and `/transcribe` return HTTP 503 even when the model is loaded. Do not set the public app URL to this candidate.

The browser checks the service's actual capabilities before opening the audio processor. For this backend it collects a segment until a pause (at least 2 seconds of audio and 650 ms of low energy), or 12 seconds maximum. Results arrive after the segment is submitted. This is an experimental recitation mode, not a claim of Tarteel-equivalent latency or accuracy. A bounded low-energy gate discards silence-only buffers. Background noise and quiet voices still require device testing.

The previous `sherpa-fastconformer` streaming bundle remains an optional path but its selected export failed native inference. See `RUNTIME_VALIDATION.md`. Do not reactivate that bundle without replacing and revalidating its graph interface.

## Run

```bash
cd quran-asr-service
python -m pip install -r requirements.txt
# Developer experiments only:
QASR_ALLOW_EXPERIMENTAL=1 uvicorn app:app --host 0.0.0.0 --port 8000 --workers 1
```

The model preloads by default. Set `QASR_PRELOAD=0` only for tests or explicit manual warmup. `QASR_THREADS` defaults to 4; the container uses 2. One service replica and one worker are required because session ordering/retry state is in memory.

```bash
docker build -t durr-quran-asr .
docker run --rm -e QASR_ALLOW_EXPERIMENTAL=1 -p 8000:8000 durr-quran-asr
```

The container respects `PORT` (default `8000`). Public model files download at first boot; no Hugging Face token is required for the pinned default. Never commit credentials or put them in `config.js`.

## Endpoints

- `GET /health`: process liveness, model load state, mode, revision and load errors.
- `GET /ready`: HTTP 200 only after model initialization; otherwise HTTP 503.
- `POST /warmup`: load the selected model.
- `GET /model-info`: model metadata and attribution.
- `POST /transcribe`: mono PCM16 16 kHz, at most 15 seconds per request.
- `DELETE /session/{session_id}`: release ordering/retry state.

Request:

```json
{"session_id":"rs_example","seq":0,"sample_rate":16000,"audio_b64":"<base64 PCM16>","final":false}
```

Response includes `transcript`, `transcript_delta`, `streaming`, `seq`, `final`, `confidence: null`, and `confidence_calibrated: false`. In chunked mode only the current segment is returned in the delta; cumulative text is for diagnostics. Send the final tail with `final: true`, including an empty final request when there is no remaining audio. Sequences start at zero per microphone run. Exact retries reuse a cached response; conflicting or out-of-order requests return HTTP 409. Final retry state is retained for 60 seconds. Session capacity is controlled by `QASR_MAX_SESSIONS`.

The browser waits for the final response before saving, and labels missing analysis incomplete. Recall attempts never earn complete-face credit or change full-face scheduling. The browser fallback also drains its last final recognition event before saving.

## Verification

```bash
python -m pip install -r quran-asr-service/requirements-test.txt
python -m pytest -q quran-asr-service/test_service.py
node --test tests/recitation.test.cjs
```

These tests simulate recognizers; they do not measure Quran recognition accuracy. To isolate a real native model from the service process:

```bash
python quran-asr-service/probe_runtime.py \
  --repo TheGreatQuran/QuranKarim-SpeechToText-onnxModel \
  --revision 76eab42481554dfe2fd837596802af243482a894 \
  --model-file qurankarim-fastconformer-mixed.onnx \
  --wav /absolute/path/recitation-16k-mono.wav
```

The probe tests repeated streams in a child process and reports native crashes/timeouts. Runtime compatibility is separate from recognition accuracy. The unfiltered model emits a spurious character on pure silence; the service therefore gates silence before inference. See `RUNTIME_VALIDATION_V80.md` for measured smoke results.

## Accuracy evaluation

Use local PCM16/16 kHz/mono WAV files and the example JSONL manifest:

```bash
python quran-asr-service/evaluate.py /absolute/path/manifest.jsonl --out /absolute/path/results.json
```

References must record **what was actually spoken**, including deliberate omissions and substitutions. Using the correct ayah as the reference for an incorrect recitation would reward a recognizer for hiding the mistake. Manifest audio paths resolve relative to the manifest. WER measures transcription; it does not measure the precision or recall of the browser's mistake detector. Test correct and deliberately mistaken recitation, repetitions, pauses, mutashabihat, phone microphones and background noise separately. Do not promote model-card benchmarks to app accuracy claims.

## Railway

Use repository `ooza-m/aldurr-almaknoon`, service root `/quran-asr-service`, Dockerfile `Dockerfile`, one replica, and `/ready` as the health check. The configuration file lives at `/quran-asr-service/railway.json`. Set `CORS_ORIGINS` to the actual web app origin. Do not replace `/ready` with `/health` to hide load failures. A staged service is not a live deployment.

Only after a replacement has passed quality evaluation, deployment, real HTTP/audio verification and public-domain checks should its URL be set in `config.js`. The current URL remains empty until then.

## Attribution and optional backends

The selected export is distributed under CC-BY-4.0. Credit TheGreatQuran, Mohammed's Quran FastConformer fine-tune, NVIDIA's original FastConformer, and Tarteel's EveryAyah training data. Preserve the upstream model attribution:

- https://huggingface.co/TheGreatQuran/QuranKarim-SpeechToText-onnxModel
- https://huggingface.co/mohammed/fastconformer-quran-ar

Optional `tarteel-whisper` and `nemo-fastconformer` backends remain supported when their own dependencies and model IDs are configured. They are not the tested deployment default. New gated models require the account holder's own access grant and must pass runtime and recitation evaluation before activation.

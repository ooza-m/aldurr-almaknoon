# Quran ASR service

Backend for the recitation engine in **الدُّرّ المكنون**.

The architecture is deliberately Quran-specific:

```
microphone
  -> Quran ASR
  -> canonical Quran alignment in the app
  -> confirmed / uncertain / mutashabihat findings
  -> active recall and review scheduling
```

The ASR model only estimates what was recited. It is **not** allowed to decide Quran correctness by itself.

## Configured streaming backend — blocked by a verified export incompatibility

**v79 runtime finding:** the configured ONNX bundle loads but crashes sherpa-onnx on real decoding. Inspection shows an offline encoder without streaming cache inputs and combined decoder/joiner graphs. It is not a usable sherpa streaming bundle. See [RUNTIME_VALIDATION.md](RUNTIME_VALIDATION.md). The service now rejects that export before entering native inference; `/ready` returns 503. **Do not publish this model as a working recitation engine.** A compatible replacement must pass an actual multi-chunk probe and then real-recitation evaluation.

The existing experimental configuration is:

- `sherpa-fastconformer`
- `mohammed/fastconformer-quran-ar-onnx-int8`
- streaming FastConformer / transducer
- 16 kHz mono PCM
- CC-BY-4.0 upstream license; keep model attribution

This checkpoint is Quran-specific and advertised as a streaming INT8 ONNX bundle for sherpa-onnx, but our runtime check found that its graphs do not implement that interface. Its own model card notes that on-device WER verification is still pending, so accuracy must be validated on our recitation test set before claiming parity with Tarteel.

Environment:

```
QASR_BACKEND=sherpa-fastconformer
QASR_MODEL=mohammed/fastconformer-quran-ar-onnx-int8
QASR_PRELOAD=1
QASR_THREADS=4
```

## Why the streaming path was introduced

`tarteel-ai/whisper-base-ar-quran` remains supported as a fallback, but the web product needs a low-latency Quran-specific streaming path. The sherpa FastConformer service keeps a recognizer stream per recitation session and returns only the new transcript delta for each chunk.

The app then performs constrained Quran alignment. Uncertain positions remain review candidates; they are not silently promoted to confirmed errors.

## Optional backends

### Quran Whisper fallback

Install the optional dependencies:

```
pip install torch transformers accelerate soundfile
```

Then:

```
QASR_BACKEND=tarteel-whisper
QASR_MODEL=tarteel-ai/whisper-base-ar-quran
```

### Full NeMo FastConformer

```
pip install -r requirements-fastconformer.txt
QASR_BACKEND=nemo-fastconformer
QASR_MODEL=mohammed/fastconformer-quran-ar
```

This is heavier than the ONNX path and normally needs a larger container / GPU.

## Local run

```
cd quran-asr-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Health:

```
curl http://localhost:8000/health
```

Warm model before a live session:

```
curl -X POST http://localhost:8000/warmup
```

## Docker

```
docker build -t durr-quran-asr .
docker run --rm -p 8000:8000 durr-quran-asr
```

The first boot downloads the model files from Hugging Face unless they are already in the cache.

## Browser configuration

The public app reads `/config.js`. Put only the public service URL there:

```js
window.DURR_CONFIG = {
  quranAsr: {
    url: "https://YOUR-QURAN-ASR.example.com",
    mode: "quran-specialized-streaming",
    model: "mohammed/fastconformer-quran-ar-onnx-int8"
  }
};
```

Never put provider keys, Hugging Face tokens, or other secrets in `config.js`.

## Streaming protocol

`POST /transcribe`

```json
{
  "audio_b64": "<base64 signed 16-bit PCM>",
  "sample_rate": 16000,
  "page": 2,
  "position": 14,
  "session_id": "rs_...",
  "seq": 3,
  "final": false
}
```

The service preserves the streaming recognizer state by `session_id` and returns both cumulative and delta text:

```json
{
  "transcript": "...",
  "transcript_delta": "...",
  "backend": "sherpa-fastconformer",
  "model": "mohammed/fastconformer-quran-ar-onnx-int8",
  "quran_specialized": true,
  "streaming": true,
  "seq": 3,
  "final": false
}
```

Send the last chunk with `"final": true` so the recognizer can flush and release its stream. A small retry receipt remains for 60 seconds.

## Accuracy rule

Do not market a model-card WER as the app's effective error-detection accuracy. We need our own held-out recordings with:

- correct Hafs recitation
- deliberate omissions
- substitutions
- repetitions
- pauses and restarts
- common mutashabihat jumps
- phone microphones and background noise

The application should stay conservative: low-confidence findings go to active recall instead of becoming confirmed errors.


## Local accuracy evaluation

Do not tune thresholds from the model card alone. Put private/local WAV files in `quran-asr-service/samples/` (do not commit recordings unless you intend to), create a JSONL manifest based on `eval-manifest.example.jsonl`, then run:

```
python evaluate.py eval-manifest.jsonl --out eval-results.json
```

The evaluator reports overall WER and WER by category. Keep categories separate for clean correct recitation, deliberate omission, substitution, repetition, mutashabihat jump, and phone/noise. Those numbers are the basis for calibrating the application's confirmed-error thresholds.

## v79: reliable stream completion and conservative assessment

- The browser waits for the final chunk and pending similarity analysis before saving a session.
- Each microphone run has its own stream ID; pause/resume never reuses a finalized stream.
- `seq` starts at zero and increases by one per stream. Retrying the same sequence and audio returns the cached response without feeding audio twice. Changed audio or skipped sequences return HTTP 409. Retry information survives finalization for 60 seconds; idle live streams expire after `QASR_SESSION_TTL`.
- A cumulative hypothesis is provisional. `transcript_delta` contains only newly committed whole words; an empty delta must remain empty. A revision of already committed words returns `transcript_revised: true` and does not replay them.
- Final PCM shorter than 400 samples is preserved. Invalid odd-length PCM is rejected.
- Alignment similarity is not calibrated acoustic confidence. The service currently returns `confidence: null` and `confidence_calibrated: false`. Automatic findings therefore remain candidates for verification; manual confirmation remains available. Candidate positions do not subtract grade points.
- Network failure, an out-of-order response, or an unreconciled transcript revision marks the analysis incomplete and prevents complete-face credit for the current face.
- Recall is restricted to its requested ayah. It never completes a face or updates face-review scheduling, including when importing an old client's recall result.
- The microphone buffer is released on stop; the client no longer retains an unused recording of the entire session.

### Regression checks

From the repository root, without downloading any model:

```
python -m pip install -r quran-asr-service/requirements-test.txt
python -m pytest -q quran-asr-service/test_service.py
node --test tests/recitation.test.cjs
```

These verify the HTTP and browser protocol with simulated model responses. They **do not measure Quran recognition accuracy** and do not replace real-microphone testing on iPhone/Safari.

### Evaluation reference rule

`reference` must be a human-verified transcript of **what was actually spoken**, including deliberate mistakes. For an omission or substitution recording, using the correct canonical ayah as the reference would reward an ASR model for silently correcting the speaker. Use a separate canonical Quran reference when assessing mistake detection. The present evaluator measures transcription WER only, not error-detector precision or recall.

Paths in a manifest resolve relative to that manifest. Private recordings, local manifests, and evaluation results are excluded from Git by default.

### Deployment boundary

The recognizer keeps live streams in process memory. Run **one Uvicorn worker and one service replica**; do not deploy this service as stateless per-request functions. Horizontal scaling needs stream affinity or a redesigned state layer.

`/health` is liveness, not model readiness. `/ready` returns HTTP 503 until the model is loaded, then HTTP 200; use it as the deployment readiness check. Check its `engine_loaded` field and successfully call `/warmup` before connecting a deployed endpoint in `config.js`. A production claim requires an actual model runtime test and held-out recordings; the ONNX model card still reports pending sherpa/on-device verification.

The repository's web app can be updated independently. Until a service is deployed and its URL configured, recitation remains in the explicitly labelled browser-limited mode.


### Container hosting setup

Use `quran-asr-service` as the service root and its Dockerfile to build. The container accepts the platform's `PORT` environment variable (default `8000`) and explicitly runs one Uvicorn worker. Keep one replica for streaming state. Set `CORS_ORIGINS` to the app origin, and retain `QASR_PRELOAD=1`. Do not configure the public app URL until `/ready` succeeds and a real audio request has been checked.

The browser fallback also waits for its final recognition event before saving; a stop timeout marks the result incomplete. Retired recognizers cannot update a later session.

### Prepared Railway deployment

This repository includes a deployment configuration, not a live deployment. Use source `ooza-m/aldurr-almaknoon`, root directory `/quran-asr-service`, and config-file path `/quran-asr-service/railway.json`. The Docker command respects `PORT` and runs one worker; the config keeps one replica. Its `/ready` health check intentionally fails until a compatible model successfully loads. Do not change it to `/health` to conceal an incompatible model.

A Railway account connection and a validated model are still required. No hosting plan, paid resource, or public speech endpoint has been created by this update.

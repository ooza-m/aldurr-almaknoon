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

## Production default

The default backend is now:

- `sherpa-fastconformer`
- `mohammed/fastconformer-quran-ar-onnx-int8`
- streaming FastConformer / transducer
- 16 kHz mono PCM
- CC-BY-4.0 upstream license; keep model attribution

This checkpoint is Quran-specific and distributed as a streaming INT8 ONNX bundle for sherpa-onnx. Its own model card notes that on-device WER verification is still pending, so accuracy must be validated on our recitation test set before claiming parity with Tarteel.

Environment:

```
QASR_BACKEND=sherpa-fastconformer
QASR_MODEL=mohammed/fastconformer-quran-ar-onnx-int8
QASR_PRELOAD=1
QASR_THREADS=4
```

## Why this replaced the default Whisper path

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

Send the last chunk with `"final": true` so the recognizer can flush and the server can release session state.

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

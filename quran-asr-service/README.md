# Quran ASR service

Backend for the recitation engine in **الدُّرّ المكنون**.

The browser does **not** decide Quran correctness from generic speech recognition. The service only transcribes recitation with a Quran-specialized ASR model. The web app then aligns the transcript against its canonical Quran text and classifies omissions, substitutions, repetitions, uncertain positions, and possible mutashabihat jumps.

## Default model

The default backend uses:

- `tarteel-ai/whisper-base-ar-quran`
- Quran-specialized Arabic ASR
- Apache-2.0 model license at the time this integration was designed

Environment:

```
QASR_BACKEND=tarteel-whisper
QASR_MODEL=tarteel-ai/whisper-base-ar-quran
```

## Optional stronger FastConformer backend

The adapter also supports NeMo models:

```
pip install -r requirements-fastconformer.txt

QASR_BACKEND=nemo-fastconformer
QASR_MODEL=Muno459/fastconformer-quran
HF_TOKEN=...
```

Important: the currently distributed `Muno459/fastconformer-quran` is gated and its current public license must be reviewed/accepted before use. Do not assume a previous license still applies.

## Local run

```
cd quran-asr-service
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 8000
```

Then test:

```
curl http://localhost:8000/health
```

## Docker

```
docker build -t durr-quran-asr .
docker run --rm -p 8000:8000 durr-quran-asr
```

For GPU hosting, use a CUDA/PyTorch base image instead of the slim CPU image.

## Browser configuration

The public web app reads `/config.js`. Set only the public service URL:

```js
window.DURR_CONFIG = {
  quranAsr: {
    url: "https://YOUR-QURAN-ASR.example.com",
    mode: "quran-specialized",
    model: "tarteel-ai/whisper-base-ar-quran"
  }
};
```

Never put provider keys, Hugging Face tokens, OpenAI keys, or other secrets in `config.js`.

## API

### GET /health

Returns active backend/model.

### POST /transcribe

JSON body:

```json
{
  "audio_b64": "<base64 signed 16-bit PCM>",
  "sample_rate": 16000,
  "page": 2,
  "position": 14,
  "session_id": "rs_..."
}
```

Response:

```json
{
  "transcript": "...",
  "backend": "tarteel-whisper",
  "model": "tarteel-ai/whisper-base-ar-quran",
  "quran_specialized": true,
  "confidence": null
}
```

The service intentionally does not label a Quran word as “wrong”. Error confirmation belongs to the constrained Quran aligner in the application.

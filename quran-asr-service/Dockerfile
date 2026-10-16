FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    QASR_BACKEND=sherpa-offline-ctc \
    QASR_MODEL=TheGreatQuran/QuranKarim-SpeechToText-onnxModel \
    QASR_MODEL_REVISION=76eab42481554dfe2fd837596802af243482a894 \
    QASR_PRELOAD=1 \
    QASR_THREADS=2

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY app.py .
COPY probe_app.py .

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]

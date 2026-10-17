FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    QASR_BACKEND=quran-zipformer-ctc \
    QASR_MODEL=Quran-Lab/zipformer_p-arabic-v3 \
    QASR_PRELOAD=1 \
    QASR_THREADS=4

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt

RUN python -c "from quranic_phonemizer import Phonemizer; p=Phonemizer(); a=p.analyse('1:1'); w=p.analyse('1:1:1'); assert a.phonemes() and w.phonemes(); group=a.phonemes(by='word'); assert len(group)==4; print('Hafs G2P contextual word grouping passed')"

COPY app.py .

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]

# Gated streaming-model experiment — v82

Model: `Muno459/fastconformer-quran-streaming`, pinned revision
`75799adac5d2a9bc0230d4c4b410dd68319560e4`. Non-profit experimental use only;
the granted NPL-1.1 license is retained in `MODEL_LICENSE_NPL-1.1.txt`.

## Verified preflight, 2026-10-16

Railway deployment `ac9abd85-64bc-4874-b9d0-9c414cd17ce5` reached SUCCESS.
Its private preflight downloaded all six required artifacts through the user's
existing sealed `HF_TOKEN`, inspected the upstream reference **without executing
it**, and loaded the Q8 graph on CPU. Q8 is 131,957,764 bytes, SHA-256
`41b3757505f9f5bb85d8fb6e478c1ab9f64d6454203ea5f032ce99a1e955f099`.
The real graph interface and CMVN dimensions match the documented cache-aware
contract. This preflight does not establish successful audio inference.

## Adapter verification

- Bounded, packet-independent NumPy STFT/mel extraction follows the granted
  16-kHz / 512-FFT / 400-periodic-Hann / 160-hop / 80-Slaney-mel / preemphasis
  contract. An independent test compares it with the reference Torchaudio
  computation (`atol=1e-4`, `rtol=1e-5`) and passes locally.
- CMVN uses the supplied `tlog_mean/std` for phone audio. No per-clip normalization.
- Each session owns its waveform tail, pending mel, encoder caches and CTC
  previous-token state; CTC state survives graph-chunk boundaries.
- Artifact revision and SHA-256 checks prevent silently switching weights.
- The service must perform an actual native forward before readiness. This new
  backend remains disabled unless `QASR_ALLOW_EXPERIMENTAL=1` is explicitly set.
- Existing HTTP sequence/retry, final-tail and stable-word-delta protections
  also apply to this backend. Confidence remains null and uncalibrated.

## Real-audio validation status

The first adapter deployment (`670cfd0c-1d9d-44dc-b661-caf2773dd561`) exposed
an actual Q8 export failure on the one-frame final tail: ConvInteger received
a zero time axis. Readiness correctly stayed 503. The adapter now pads only
the final native window to the proven 112-frame size with normalized silence
and discards outputs beyond the real frame count (8x subsampling). A regression
test ensures padding tokens cannot leak into the transcript. This repair still
requires an observed successful native run.

`selftest_runner.py` performs bounded
loopback HTTP requests using only public EveryAyah recordings (six clips,
three reciters), silence, exact retries and an empty final tail. Results must
be observed in `DURR_SMOKE_CASE` / `DURR_SMOKE_DONE` logs before claiming runtime
success. They are smoke checks, **not** an overall accuracy benchmark or proof
of detecting incorrectly recited Quran. No user audio is downloaded or committed.

No frontend URL, live website or `main` branch has been changed for this experiment.

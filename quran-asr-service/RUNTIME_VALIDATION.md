# Quran ASR runtime validation — v79

Date: 2026-10-16. This is a runtime compatibility report, not an accuracy benchmark.

## Selected bundle

`mohammed/fastconformer-quran-ar-onnx-int8`, downloaded from the upstream Hugging Face repository. Runtime: sherpa-onnx 1.13.8, CPU, Python 3.12.

## Observed result

The recognizer initialized successfully. Feeding sequential one-second PCM16 silence chunks then caused process exit 139 (segmentation fault) on the second request. No recognition accuracy claim can be made from this bundle.

ONNX Runtime graph inspection found:

| Component | Actual graph | Required by the selected sherpa NeMo streaming implementation |
| --- | --- | --- |
| Encoder | Two inputs: `audio_signal`, `length`; two outputs | Cache-aware encoder with channel/time/length cache inputs and corresponding outputs |
| Decoder | Five inputs, including `encoder_outputs`; four outputs | Separate prediction network with token and LSTM-state inputs |
| Joiner | Same combined decoder/joint signature, five inputs | Separate two-input joint network |

The bundle's metadata advertises streaming cache dimensions, but metadata does not add missing graph inputs. Editing metadata alone cannot repair this export.

## v79 action and verification

- Added graph-interface validation before constructing the native recognizer.
- Re-ran the real loader against the downloaded bundle. It now raises `IncompatibleModelError` safely instead of passing that bundle into native decoding.
- `/health` stays available with `engine_loaded: false` and `model_error: incompatible_model_export`.
- `/ready` and `/warmup` do not report a usable engine.
- The app retains browser-limited mode while `config.js` has no service URL.

Protocol regression tests use a fake recognizer; passing them verifies buffering, retries, finalization, and assessment rules. It does not validate a replacement acoustic model.

## Required next validation

Obtain a correctly exported cache-aware Quran model, or separately test a supported Quran-specific backend. Verify multiple sequential chunks and finalization in a subprocess before deployment. Then evaluate human-transcribed clean and deliberately mistaken recitations, including phone microphones and pauses. Use the actually spoken transcript for ASR WER; evaluate Quran mistake detection separately.

Upstream references:

- https://huggingface.co/mohammed/fastconformer-quran-ar-onnx-int8
- https://github.com/k2-fsa/sherpa-onnx/blob/master/sherpa-onnx/csrc/online-transducer-nemo-model.cc

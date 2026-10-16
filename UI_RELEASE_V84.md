# Listening and recitation follow-up — v84

## Diagnosis

The production ASR URL is empty. The default phone path therefore uses browser
speech recognition, previously with `interimResults=false`; it could wait for a
long finalized utterance before revealing any text. A saved custom service URL
can override that default on an individual device. No phone latency measurement
has been obtained and no specialist-ASR accuracy claim is made.

Each reader ayah previously replaced the HTML audio element's network source.
Short touches on revealed recitation words also toggled an error immediately.
Unconfirmed recognition findings could enter the dashboard review queue.

## Changes

- Browser interim results now show reversible, visibly lighter word previews.
  They do not commit coverage, progress, findings or errors. Final results are
  consumed once; recognizer restarts reset their result-index bookkeeping.
- Specialist streaming packets are collected every 0.4 s instead of 1.9 s when
  that path is configured. This reduces client batching only; it does not claim
  end-to-end recognition latency or activate the test server.
- No recognition finding automatically becomes a confirmed error, even if a
  service claims high confidence. A long touch plus explicit confirmation adds
  a manual error. A quick touch does nothing. New payloads carry the explicitly
  confirmed word keys; dashboard ingestion rejects other word errors and
  unconfirmed review-queue candidates. Existing history is not deleted.
- Multi-ayah playback downloads its audio before starting. For Alafasy, Husary,
  Minshawi (murattal), Abdul Basit (murattal), Sudais and Shatri, it downloads one
  chapter MP3 and uses timestamps from that same recording. At adjacent ayah
  boundaries the source is unchanged and playback is not restarted. Ayah
  highlighting and page following continue independently of the audio clock.
- Maher/Hudhaify, or unavailable chapter metadata, use a fallback that downloads
  all selected ayah files first (four requests concurrently); it makes no new
  network request at each ayah boundary. This fallback does not claim a single
  gapless recording or elimination of MP3 decoder padding.
- Download progress, cancellation, retry, pause/speed controls and cleanup are
  included. Compressed audio is bounded to 180 MiB per declared file and 220 MiB
  per range; Quran audio is not expanded into a chapter-sized PCM buffer. A
  prepared range is reusable until replaced or closed. No complete-listening
  credit is awarded for skipped/seeking intervals.

## Verification

57 Node tests pass, covering downloads and continuous source identity, range
boundaries, stale work, full-listening credit, fallback preparation, recognizer
interim/final/restart behavior, manual confirmation and dashboard ingestion.
The existing reader/player/tafsir DOM regression suite also passes.

Public Quran API chapter metadata was checked for all six chapter-reader IDs
above for Al-Fatiha, with the expected recording paths and seven timestamps.
Alafasy Al-Baqarah was also checked: 286 timestamps, final key `2:286`, reported
compressed size 120,888,301 bytes. The chapter host's audio response advertises
cross-origin access. Metadata and audio come from:

- https://api.quran.com/api/v4/chapter_recitations/7/1?segments=true
- https://api.qurancdn.com/api/qdc/audio/reciters?locale=ar
- https://api-docs.quran.foundation/docs/content_apis_versioned/4.0.0/chapter-reciter-audio-file/

Automated audio tests use controlled audio objects and network fixtures. Real
Safari buffering, permission/autoplay prompts, background/range stopping and
phone microphone accuracy remain device acceptance items. This release improves
visible responsiveness and error handling; it does not establish Tarteel-level
recognition or validated automatic Quran mistake detection. The next ASR step
is controlled phone testing on the isolated specialist service before enabling
it for production.

Quran page data, fonts, memorization storage, live ASR settings and Railway's
pinned experimental deployment are not changed. Static asset/service-worker
versions advance to v84 without clearing progress.

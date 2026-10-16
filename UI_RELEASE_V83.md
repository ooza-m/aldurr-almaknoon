# Mushaf and navigation release — v83

This UI-only release is based on the current live `main` (v79), not the private
ASR experiment. It promotes the reviewed v81 reader rebuild with fresh v83 asset
and service-worker versions. No model URL, Railway configuration, backend code,
Quran page data, font files or user-data schema is changed.

## Included

- Both navigation bars: Home, Today, distinctive central Mushaf, Calendar, More.
- Map moves to More and retains its existing page/task links.
- Reader controls, dialogs, index, page jump, ayah actions and listening dock
  follow the app's cream/rose visual system without replacing Madani line/glyph
  rendering or its QCF fonts.
- Eight reciters, six playback speeds, persistent current-ayah highlighting,
  pause/resume, and queue following across pages.
- Separate Saadi and Muyassar resource/cache identities for whole-page and
  single-ayah tafsir, including stale-response protection and retry behavior.
- Native selection/callout suppression during long touch; flow-based controls,
  safe-area padding and visual-viewport sizing to address the supplied iPhone
  screenshots' status-bar overlap and bottom-gap symptoms.
- Fresh asset URLs and service-worker cache namespace update old installs
  without clearing localStorage or memorization progress.

## Verification

`npm test`: 39 tests pass (state-machine, DOM and recitation regression tests).
`git diff --quiet main -- data font config.js quran-asr-service`: passes before
release, confirming those sources are untouched. Scripts compile and
`git diff --check` passes. Original screenshots IMG_5193/5194/5195/5197/5198 were
inspected to compare reported symptoms with the new layout rules.

DOM tests mock external media/tafsir APIs. Real iPhone/Safari rendering,
background audio and permissions still require device acceptance; they are not
represented as verified by these automated checks. See `tests/README.md`.

Deployment verification must observe GitHub Pages' successful workflow and the
published v83 files, rather than treating a branch push as a live release.

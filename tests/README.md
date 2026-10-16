# Reader v83 UI release verification

Run `npm ci --ignore-scripts` and `npm test` (Node 24+). Tests cover the player state machine, per-book tafsir cache, actual DOM button wiring, long touch, cross-page following, sharing/export, and existing recitation regressions. Remote tafsir and media APIs are mocked in DOM tests; these are not acoustic or visual browser tests.

The existing `pageHTML` glyph renderer, `fitPane` sizing algorithm, `data/` Quran files, and `font/` files are unchanged. The font loader now tries the repository's real `font/` directory before its older fallbacks. No ASR deployment or model activation is part of v81.

## Device acceptance checklist (not yet verified)

- iPhone Safari and installed PWA: portrait, landscape, browser bars expanded/collapsed; top buttons clear the safe area and footer has no phantom gap.
- Normal, focus, audio, and recitation modes: exactly one reserved navigation/safe-area space; all 15 printed lines remain visible.
- Long press opens ayah details without selection handles; swipe both ways, change direction, and cancel a gesture.
- Play real audio for each of the eight reciters. Pause/resume, all six speeds, change voice, skip, close/reopen, and allow a queue to cross a page boundary. Check background/lock-screen interruptions and autoplay permission prompts.
- Switch Saadi/Muyassar quickly in full-face and ayah views. Verify source/content agreement, loading errors/retry, cached access offline, and long passages scrolling normally.
- Native share, clipboard and text download on iOS; return from settings, search and index; preserve existing highlights/progress.
- Service-worker upgrade from v80 without clearing personal progress. Browser/device acceptance remains pending; automated DOM and unit checks pass.

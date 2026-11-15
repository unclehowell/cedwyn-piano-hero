# cedwyn-piano-hero — Piano Hero (webapp 58 of 59)

**Live:** https://bucklerfamily.estate/piano-hero/ — served from this repo's `main/public/` by the Cloudflare Worker `bfe-piano-hero`. The worker reads the current `main` build and edge-caches it briefly.

## Current experience · v0.8.0

Piano Hero is a horizontal chronological score with one institution or activity-party lane for each of the 88 named parties:

- **Institution keys:** the left-hand piano rail keeps the names in fixed vertical rows. The rows use an 88-note piano pitch sequence; selecting a key opens its mapped institutional forensic assessment report(s).
- **Chronology:** years run oldest at the left to newest at the right. The 1500s are one column; there is one column per year from 1600, then quarters from 1988-Q1 to 2025-Q4, then months from January 2026. The app is viewport-height, has no vertical page or score scrolling, and scales all 88 rows to the measured score viewport below the injected site header, and sizes the left key rail to the same 88-row height on resize and orientation changes.
- **Sounding keys:** every party active in the current playback column expands vertically and highlights in its own colour. Active names are enlarged without changing the rail width; simultaneous keys share the exact available height and silent lanes compact into thin strips. Long labels use readable short forms on-key, while the full institution name remains in the tooltip and accessible label. The layout is sized for the 48-party October 2026 peak; pausing or reaching an empty column restores equal-height keys.
- **Playback:** one Play/Pause button moves the year ruler, columns, event markers and connector lines right-to-left in unison towards a fixed sounding line. An event sounds on its institution's piano key as its column reaches that line. The ×2 control, event filter and backing-sound toggle remain available.
- **Event details:** the left panel shows the current record's date, description, institution, type/reference and corresponding image. The bottom strip contains institution names only. Selecting Open record displays the corresponding catalogue or source page.
- **Forensic graph:** each institution has its own colour. Solid lines connect its timeline events to its mapped assessment report; dotted lines distinguish related-body report mappings; dashed lines connect a report to catalogue IDs explicitly named in the assessment text where those records also appear on the activity timeline.
- **Report detail:** selecting an institution key opens its direct and related forensic reports in the modal. The full report page is embedded there. The All 64 Reports control also exposes the 13 published assessments not assigned to an institution lane.
- **Disclosure cutoff:** activity after 31 December 2025 is excluded unless the item is actual disclosure material: released documents, FOI/EIR/SAR responses, search results or records supplied. Acknowledgements, requests, chasers, clarifications and unrelated pursuit activity are omitted.

The central catalogue remains authoritative. Piano Hero's activity data supplies the timeline summaries and image thumbnails; its forensic relationship file stores the report mapping and cited IDs, not duplicate report text or record transcripts.

## Data files

- `public/data/activity.json` is built by `tools/build_data.py`. It contains 88 parties, 556 chronological rows and 625 occupied event cells (one party active on one day in a cell, with source overlap deduplicated). Inputs include received institutional correspondence, dated catalogue records, ERP replies, the forensic activity journal, WhatDoTheyKnow responses, watchtower changes and Williams-family chronology activity.
- `public/data/thumbs.json` contains local WebP thumbnails as data URIs for catalogue items. `public/data/curated-events.json` carries the explicit 25 July 2025 GHF-E113 online-publication milestone and its YouTube preview; uploader attribution remains unverified.
- `public/data/forensic-links.json` is a reviewed cross-reference built from `unclehowell/cedwyn-forensic/data.json` and the published assessment pages. It carries 64 report records; direct and related-body institutional mappings are labelled separately. It maps 51 distinct reports through 52 report-to-key associations across 42 institution rows and retains 13 otherwise unassigned reports in the all-reports directory. Its citation IDs are only those explicitly found in the assessment-page text extraction; a report-to-event connector is drawn only when that catalogue ID is present in the timeline data.

## Source and layout

- `public/index.html` contains the webapp shell, selected-record detail panel, year ruler, fixed institutional key rail, Next control and detail dialogs.
- `public/assets/ph.js` builds the 88 piano keys, chronological columns, event markers and report graph; it handles yearly pauses, one-record-at-a-time review, post-2025 disclosure filtering, playback, sound and the record/report modals.
- `public/assets/ph.css` defines the light/dark themes, fixed rail, responsive score and modal layouts.
- The app surface uses buttons for event previews, institution keys and modal actions. It does not turn event titles or subtitles into hyperlinks.

— Sion's Tab agent

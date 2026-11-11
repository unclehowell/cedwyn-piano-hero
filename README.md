# cedwyn-piano-hero — Piano Hero (webapp 58 of 59)

**Live:** https://bucklerfamily.estate/piano-hero/ — served from this repo's `main`, folder `public/`, by the Cloudflare Worker
`bfe-piano-hero` (source `worker/bfe-piano-hero.js`; GitHub raw, edge-cached 5 minutes, so a push to `main` is live within about 5 minutes).

Every party in the Cedwyn record is a piano key, the least active on the far left and the most active on the far right (v0.3.0); the rows run from a
four-year count-in before the 1500s (one row), then a row a year from 1600, every quarter from 1988 and every month from January 2026; a note sits wherever that party was active.
Press play and the table slides down like a rhythm game; each note sounds as it reaches the centre line, on a steady beat (an empty stretch takes at most two beats).
A filter plays All notes, only press coverage, later citation and interpretation, or only verbatim source records and transcripts; each note's label shows the record's picture or a placeholder tile with its catalogue ID.

## Data (v0.3.0; see the tools/build_data.py docstring for the rows, the filter classes and the label facts)
`public/data/activity.json` is built by `tools/build_data.py`
(`python3 tools/build_data.py --unmatched`, optionally `--gmail <mail manifest>`; without it the catalogue's email records are used):
- emails RECEIVED from institutions (replies, acknowledgements, releases); emails sent to them are not counted;
- dated records in the central catalogue (`https://cedwyn.bucklerfamily.estate/api/catalogue`), not email records and not
  correspondence-thread summaries (those are dated at the opening request);
- first replies in the ERP flows data (`unclehowell/cedwyn-erp` `public/data/flows.json`);
- "Received" and "Website" entries of the forensic activity journal (`unclehowell/cedwyn-forensic`);
- WhatDoTheyKnow responses on the case requests (`tools/inputs/wdtk-responses.json`);
- watchtower website changes (`unclehowell/cedwyn-watchtower` `public/data/changes.json`, and `watch-events.json` released / altered / removed);
- the Williams family: days on which a received reply, a dated catalogue record or a dated chronology event
  (`unclehowell/cedwyn-wayback` `wayback/chronology/chronology.json`) names the family.

A count is **one party active on one day** (the same day in several sources counts once); a cell holds that party's active days in
the quarter (to 2025-Q4) or the month (from 2026-01). Names are folded into one canonical list in the script. A piano has 88 keys, so the
least active are left out and named in `left_out`. **Key order (v0.3.0):** by active days, rising to the right: the least active party on the far left key, the most active on the
far right (v0.2.0 was centre out). Keys are numbered 1..88 from left to right.

## Layout
- `public/index.html` page shell (shared header, footer, theme and N-of-59 nav come from `/_cedwyn/ghf/ghf-boot.js` with `window.__cedwynLP="/piano-hero/"`).
- `public/assets/ph.js` keyboard geometry (N consecutive keys of a real piano, A0..C8, first and last white), grid, WebAudio piano, playback.
- `public/assets/ph.css` light and night themes (`html[data-ghf-mode=night]`).
- No `<a>` elements inside the app (`#ph`).

— Sion's Tab agent

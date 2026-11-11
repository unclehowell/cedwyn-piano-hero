# cedwyn-piano-hero — Piano Hero (webapp 58 of 59)

**Live:** https://bucklerfamily.estate/piano-hero/ — served from this repo's `main`, folder `public/`, by the Cloudflare Worker
`bfe-piano-hero` (source `worker/bfe-piano-hero.js`; GitHub raw, edge-cached 5 minutes, so a push to `main` is live within about 5 minutes).

Every party in the Cedwyn record is a piano key, the most active in the middle and the least active at the two ends; every quarter from 1988 to 2025 is a row, then every month from January 2026; a note sits wherever that party was active.
Press play and the table slides down onto the keys like a rhythm game; each row sounds as it reaches the line.

## Data (v0.2.0)
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
least active are left out and named in `left_out`. **Key order:** by active days, centre out: the most active party takes the key nearest
the middle of the keyboard (on 88 keys the middle falls between E4 and F4, so the top two parties sit on those two keys), the next ones
alternate either side, the least active sit at the two ends. Keys are numbered 1..88 from left to right.

## Layout
- `public/index.html` page shell (shared header, footer, theme and N-of-59 nav come from `/_cedwyn/ghf/ghf-boot.js` with `window.__cedwynLP="/piano-hero/"`).
- `public/assets/ph.js` keyboard geometry (N consecutive keys of a real piano, A0..C8, first and last white), grid, WebAudio piano, playback.
- `public/assets/ph.css` light and night themes (`html[data-ghf-mode=night]`).
- No `<a>` elements inside the app (`#ph`).

— Sion's Tab agent

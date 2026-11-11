# cedwyn-piano-hero — Piano Hero (webapp 57 of 59)

**Live:** https://bucklerfamily.estate/piano-hero/ — served from this repo's `main`, folder `public/`, by the Cloudflare Worker
`bfe-piano-hero` (source `worker/bfe-piano-hero.js`; GitHub raw, edge-cached 5 minutes, so a push to `main` is live within about 5 minutes).

Every institution in the Cedwyn record is a piano key; every quarter since 1988 is a row; a note sits wherever that body was active.
Press play and the table slides down onto the keys like a rhythm game; each row sounds as it reaches the line.

## Data
`public/data/activity.json` is built by `tools/build_data.py` (re-run it any time: `python3 tools/build_data.py --unmatched`):
- the central catalogue (`https://cedwyn.bucklerfamily.estate/api/catalogue`): each record's `date_sort` with its email institutions or holder;
- the ERP flows data (`unclehowell/cedwyn-erp` `public/data/flows.json`): each request's opened / first reply / last message / check dates;
- the forensic activity journal (`unclehowell/cedwyn-forensic` `journal/<body>/index.html`): each dated entry.

A count is **one institution active on one day** (the same day in two sources counts once); a cell holds that body's active days in the
quarter. Names are folded into one canonical list in the script (sub-units into their parent body). Only institutions and organisations
are kept: anything else (the family's own archive, websites, social media, private people) is left out. A piano has 88 keys, so when more
bodies are active the least active are left out and named in `left_out`. Keys are ordered by first quarter of activity, then by total.

## Layout
- `public/index.html` page shell (shared header, footer, theme and N-of-59 nav come from `/_cedwyn/ghf/ghf-boot.js` with `window.__cedwynLP="/piano-hero/"`).
- `public/assets/ph.js` keyboard geometry (N consecutive keys of a real piano, A0..C8, first and last white), grid, WebAudio piano, playback.
- `public/assets/ph.css` light and night themes (`html[data-ghf-mode=night]`).
- No `<a>` elements inside the app (`#ph`).

— Sion's Tab agent

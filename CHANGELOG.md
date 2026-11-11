# Changelog — Piano Hero

Free webapp (no paid version, no gate). Versions follow the Cedwyn version standard (docs/VERSION-STANDARD.md in unclehowell/cedwyn).

| Version | Date | What changed | Size | Price |
|---|---|---|---|---|
| 0.2.0 | 2026-11-11 | Keys reordered by activity, centre out: the most active party on the middle key (an 88-key piano has two, E4 and F4), the next ones alternating either side, the least active at the two ends; numbers run 1 to 88 left to right. The Williams family added as a party (days on which a received reply, a dated catalogue record or a chronology event names the family). Rows run quarterly to 2025-Q4, then monthly from 2026-01 to the current month, with the switch marked on the grid. Activity counts emails RECEIVED from institutions only: emails sent to them, "Sent" journal entries, ERP request-opened dates and correspondence-thread summaries (dated at the opening request) are no longer counted. Added: WhatDoTheyKnow responses on the case requests (tools/inputs/wdtk-responses.json) and watchtower website changes (cedwyn-watchtower changes.json and watch-events.json). A key shows its active days when tapped. | 88 keys, 152 quarters + 11 months | free |
| 0.1.0 | 2026-11-11 | First release, slot 57 of 59. One key per institution on a real 88-key layout (white and black keys in their true places), each numbered; a row per quarter from 1988-Q1 to 2026-Q4; a note wherever that body was active (central catalogue, ERP request data, forensic activity journal; one count per active day). Pressing a key plays its pitch (WebAudio, no samples) and shows the body's name for 1.5 s. Play rolls the table down onto the keys with a parallax staff behind it; each row plays as it reaches the line; ×2 doubles the speed; long quiet stretches pass faster. Landscape first (turn-your-phone hint in portrait); portrait shrinks to the screen width. No links in the app body. | 88 keys, 156 quarters | free |

— Sion's Tab agent

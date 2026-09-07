# Handoff: TimeTrack — mobile billing timesheet PWA

## Overview

TimeTrack is a personal billing timesheet app for a single freelancer/contractor logging
hours for a client. It runs as an installed PWA on a phone homescreen (React + FastAPI).
This bundle covers the **UI design only**: five screens (Login, Today, Calendar, Day detail,
Export), a persistent bottom nav, and the loading / empty / error / generating / offline
states for each.

The design is built around two hurried moments — clocking in at the start of the day and
clocking out at the end — so the primary action sits in the bottom third of the screen where
a thumb lands. Calendar and Export are calmer and denser.

## About the design files

The files in this bundle are **design references created in HTML**. `TimeTrack.dc.html` is a
runnable prototype demonstrating intended look and behaviour; it is not production code to
copy. The task is to **recreate these designs in the target codebase** (React here) using its
own established patterns, component library, routing and state approach. Nothing about the
HTML structure, the class-free inline styling, or the prototype's fake data is prescriptive —
only the visual result and the interaction behaviour are.

Open `TimeTrack.dc.html` in a browser to interact with it. The right-hand column is a
**state inspector** that exists only in the prototype — it is a design aid for reviewing
states, not part of the product. Ignore it when implementing. The left-hand column documents
tokens; also not part of the product.

## Fidelity

**High-fidelity.** Colours, typography, spacing, radii and interaction behaviour are final and
should be matched closely. Exact values are in Design tokens below. The one deliberate gap:
icons in the prototype are placeholder squares — substitute real icons (see Assets).

## Frame and safe areas

- Design viewport: **390 × 844** (iPhone 14/15 logical size), portrait only. No landscape.
- Layout is a vertical flex column: status-bar spacer → optional offline banner → scrollable
  content → fixed action area / bottom nav.
- **Installed-PWA chrome:** there is no browser UI. The app draws its own header per screen.
- Safe-area insets must be honoured:
  - Top: content starts below a **52px** status-bar zone (`env(safe-area-inset-top)`, min 52px).
  - Bottom: the nav bar reserves **22px** below its touch row for the home indicator
    (`env(safe-area-inset-bottom)`, min 22px). Nothing interactive inside that band.
- Every tappable element is **≥44px** in its smallest dimension. Verified across all screens:
  buttons 44–64px tall, calendar cells ~48px square at 390px width, nav items 56px, list rows
  `min-height: 44px`.
- Mobile-first: this is not a shrunk desktop layout. If a tablet/desktop view is ever needed,
  centre the 390px column rather than reflowing.

## Theme

Dark is the **default** theme. Light is fully specified and should be reachable via
`prefers-color-scheme` and/or an explicit setting. Both themes use the same semantic day
colours with different tints for contrast — see Design tokens.

## Screens / Views

### 1. Login

**Purpose:** sign in. Nothing else competes for attention on this screen.

**Layout:** single centred column, `padding: 0 28px 60px`, vertically centred with
`gap: 28px`. No bottom nav on this screen.

**Components (top to bottom):**

| Element | Spec |
| --- | --- |
| App mark | 44×44, `border-radius: 13px`, background `#C6E82F`, centred text "TT" — JetBrains Mono 700 18px, `#16181C` |
| Title | "Sign in" — Space Grotesk 700 32px / 1.1, `letter-spacing: -.02em`, `#F2F3EE` |
| Username field | 54px tall, `border-radius: 15px`, bg `#1B1E23`, border `1.5px solid #2C313A`, `padding: 0 16px`, Space Grotesk 500 16px, text `#F2F3EE`, placeholder `#6B7079`, placeholder "Username" |
| Password field | same as above, `type="password"`, placeholder "Password" |
| Error row | Only when invalid. `!` glyph JetBrains Mono 700 13px `#FF6B4A` + message Space Grotesk 500 13px `#FF8A6B`: "That password doesn't match. Try again." Field border becomes `1.5px solid #FF6B4A` |
| Submit | 56px tall, `border-radius: 16px`, bg `#C6E82F`, label "Sign in" Space Grotesk 700 17px `#16181C` |

Field group gap 12px; the two fields sit in one group with the error directly beneath.

**Validation:** the prototype accepts any password of 4+ characters and shows the error
otherwise; real validation comes from the auth endpoint. The error clears on the next
keystroke in the password field.

### 2. Today (home)

**Purpose:** the fastest screen. Clock in, clock out, keep a to-do list, mark the day off.

**Layout:** scrollable content (`padding: 8px 20px 0`, `gap: 16px`) above a fixed action area
(`padding: 16px 20px 8px`, with a `linear-gradient(to top, #101215 55%, transparent)` scrim so
content scrolls under it), then the bottom nav.

**Header:** "Today" Space Grotesk 700 28px `letter-spacing:-.02em` `#F2F3EE`, baseline-aligned
with the date at right — JetBrains Mono 500 12px, `letter-spacing:.06em`, `#6B7079`,
uppercase, e.g. "MON 7 SEP".

**State A — not clocked in**
- Status card: bg `#1B1E23`, `1px solid #2C313A`, `border-radius: 22px`, `padding: 20px`.
  Eyebrow "NOT STARTED" JetBrains Mono 500 11px `letter-spacing:.14em` `#6B7079`; body
  "No hours logged yet today." Space Grotesk 700 15px/1.45 `#C9CCD2`.
- To-do group: label row "TO-DO LIST" (as eyebrow) with "Optional" at right, Space Grotesk
  400 11px `#6B7079` — the optionality is stated, never enforced. Textarea `min-height: 88px`,
  `border-radius: 16px`, bg `#1B1E23`, border `1.5px solid #2C313A`, `padding: 14px`,
  Space Grotesk 400 15px/1.5, `resize: none`. Placeholder: "What's on for today? Skip it if
  you'd rather just start."
- Primary action: **Clock In** — 64px tall, `border-radius: 20px`, bg `#C6E82F`, Space Grotesk
  700 19px `letter-spacing:-.01em`, `#16181C`.
- Secondary row below it: two equal buttons, 46px tall, `border-radius: 14px`,
  `1.5px solid #2C313A`, transparent fill, Space Grotesk 500 14px `#9A9FA8` — "Time off" and
  "Holiday". Deliberately quieter than the primary.

**State B — clocked in (may last all day; reads as "in progress", not urgent)**
- Timer card: same card treatment, `padding: 22px`. Eyebrow row = 8px `#FF7A3D` dot
  (`animation: pulse 2.4s ease-in-out infinite`, opacity .35→1) + "IN PROGRESS" JetBrains Mono
  500 11px `letter-spacing:.14em` `#FF7A3D`. Elapsed time JetBrains Mono 700 **48px**/1,
  `letter-spacing:-.03em`, `#F2F3EE`, format `HH:MM:SS`, ticking every second. Sub-line
  "Clocked in at 09:02" Space Grotesk 400 13px `#9A9FA8`.
- To-do textarea remains visible and editable, `min-height: 96px`.
- Primary action: **Clock Out**, identical treatment to Clock In. No secondary row.

**State C — summary generating** (after Clock Out; the LLM call takes ~2s)
- Card with a 16px spinner (`2px` ring, `#2C313A` track, `#C6E82F` head,
  `animation: spin .9s linear infinite`) + "WRITING YOUR SUMMARY" eyebrow in `#C6E82F`.
- Three skeleton lines: 13px tall, `border-radius: 7px`, bg `#23272E`, widths 92% / 78% / 56%,
  staggered pulse (0s / .2s / .4s).
- Footnote: "{hours} h logged. This takes a couple of seconds — you can leave the screen."
  Space Grotesk 400 13px/1.45 `#6B7079`. The user is explicitly not blocked.
- No primary action button in this state.

**State D — day complete**
- Summary card, bg `#1B1E23`, `1px solid #2C313A`, `border-radius: 22px`, overflow hidden.
  Top region `padding: 20px`, `gap: 14px`:
  - Row: 8px `#C6E82F` square (`border-radius: 2px`) + "DAY COMPLETE" eyebrow `#C6E82F`;
    right-aligned hours JetBrains Mono 700 22px `#F2F3EE`, e.g. "8.5 h".
  - Generated description, Space Grotesk 400 15px/1.55 `#C9CCD2`.
  - Meta row, JetBrains Mono 400 12px `#6B7079`, `gap: 26px`: "09:02 → 17:34" and project name.
  - Footer strip: 52px tall, `border-top: 1px solid #2C313A`, centred "Edit this day"
    Space Grotesk 600 15px `#C6E82F` → opens Day detail for today.
- Below the card: "Reopen the day", 44px, outlined `1.5px solid #2C313A`, `#9A9FA8`.
- No primary action button in this state.

### 3. Calendar

**Purpose:** scan the month at a glance; jump into any day.

**Layout:** scrollable, `padding: 8px 16px 20px`, `gap: 16px`. Bottom nav present.

**Header block** (`padding: 0 4px`, `gap: 14px`):
- Row 1: "Calendar" Space Grotesk 700 28px `#F2F3EE`; right side two 44×44 buttons,
  `border-radius: 13px`, `1.5px solid #2C313A`, glyphs ‹ › Space Grotesk 500 17px `#C9CCD2`.
  Horizontal swipe on the grid should also page months.
- Row 2, above a `1px solid #2C313A` rule: month label Space Grotesk 600 16px `#C9CCD2`
  ("September 2026"); right side the running month total — JetBrains Mono 700 24px `#C6E82F`
  followed by "HOURS" JetBrains Mono 500 12px `#6B7079`. **The total must be visible without
  scrolling.**

**Grid:** 7 columns, `gap: 6px`. Weekday header row M T W T F S S — JetBrains Mono 500 10px,
`letter-spacing:.1em`, `#6B7079`, centred. Week starts **Monday**; leading blanks are empty
cells. Each day cell: `aspect-ratio: 1`, `border-radius: 11px`, `padding: 5px 6px`, day number
top-left (JetBrains Mono 500 11px) and hours/tag bottom-left (JetBrains Mono 700 11px). Cell
treatment by state:

| State | Fill | Number | Tag | Tag text |
| --- | --- | --- | --- | --- |
| Worked | `#C6E82F` | `rgba(22,24,28,.6)` | `#16181C` | hours, 1dp ("8.0") |
| In progress | none, `2px dashed #FF7A3D` | `#FF7A3D` | `#FF7A3D` | hours so far ("4.2") |
| Time off | `#4A8BFF` | `rgba(11,16,32,.65)` | `#0B1020` | "OFF" |
| Holiday | `#B07CFF` | `rgba(26,15,46,.65)` | `#1A0F2E` | "HOL" |
| Weekend | `#15181C` | `#3D444E` | — | — |
| Empty weekday / future | `#1B1E23` | `#6B7079` | — | — |

In-progress is the **only outlined** cell, so the four semantic states remain separable by
treatment as well as hue (colour-blind safety).

**Legend** below the grid (`padding: 12px 4px 0`, `gap: 12px`, wraps): 10px swatch + label,
Space Grotesk 500 11px `#9A9FA8` — Worked / In progress / Time off / Holiday.

**Loading:** 35 skeleton cells, `aspect-ratio: 1`, `border-radius: 11px`, bg `#1B1E23`,
`animation: pulse 1.6s ease-in-out infinite`. Header (month label, arrows) stays live.

**Empty month:** centred block, `padding: 52px 24px`, `gap: 12px` — 52×52 `2px dashed #2C313A`
rounded square, then "Nothing logged in {Month Year}" Space Grotesk 600 17px `#C9CCD2`, then
"Tap any day to add hours by hand, or clock in from Today." Space Grotesk 400 14px/1.5
`#6B7079`, `max-width: 230px`.

### 4. Day detail

**Purpose:** correct anything about one day. Opened by tapping a calendar cell, or "Edit this
day" on Today.

**Layout:** scrollable, `padding: 8px 20px 20px`, `gap: 18px`. Bottom nav present (Calendar
stays highlighted).

- **Header:** 44×44 back chevron (`margin-left: -10px` for optical alignment, Space Grotesk
  500 20px `#C9CCD2`) + title block: date "Fri 4 Sep" Space Grotesk 700 22px `#F2F3EE` (weekday
  derived from the real date) and a state eyebrow — "WORKED DAY" `#C6E82F` or "TIME OFF"
  `#4A8BFF`, JetBrains Mono 500 11px `letter-spacing:.1em`.
- **Hours:** eyebrow "HOURS". Input 110px wide × 54px, `border-radius: 15px`, bg `#1B1E23`,
  `1.5px solid #2C313A`, JetBrains Mono 700 20px `#F2F3EE`. To its right, explanatory text
  Space Grotesk 400 12px/1.45 `#6B7079`: "Derived from 09:02 → 17:34. / Typing here overrides
  it." Once overridden, a line appears below: "Overridden — the clock times are kept for
  reference." Space Grotesk 500 12px `#FF9E6B`.
- **Project / Task:** two equal-width selects side by side (`gap: 10px`), each 50px tall,
  `border-radius: 15px`, bg `#1B1E23`, `1.5px solid #2C313A`, `padding: 0 14px`, value
  Space Grotesk 500 14px `#F2F3EE`, ▾ chevron `#6B7079`. Use the platform picker/sheet; the
  prototype just cycles values on tap.
- **Summary:** label row "SUMMARY" with, when applicable, "Edited by hand" Space Grotesk 500
  11px `#FF9E6B` at right. Textarea `min-height: 132px`, `border-radius: 16px`, bg `#1B1E23`,
  `1.5px solid #2C313A`, `padding: 16px`, Space Grotesk 400 15px/1.55 `#F2F3EE`, `resize: none`.
  - **Generating state** replaces the textarea with a same-sized box: 14px spinner +
    "GENERATING" eyebrow `#C6E82F`, then two skeleton lines (12px tall, `#23272E`, 90% / 70%).
  - Below: "Regenerate summary", 48px, `border-radius: 15px`, `1.5px solid #2C313A`,
    Space Grotesk 600 14px `#C6E82F`.
  - **Regenerate guard:** if the summary has been hand-edited since it was generated, tapping
    Regenerate opens the confirmation sheet (below) instead of regenerating. If it has not been
    edited, it regenerates immediately with no dialog.
- **Convert row:** `border-top: 1px solid #2C313A`, `padding-top: 16px`, `min-height: 44px`,
  space-between — label Space Grotesk 500 15px `#C9CCD2` ("Convert to time off or holiday" /
  "Convert back to a worked day") and a › chevron `#6B7079`.
- **Reason field** (only when the day is time off/holiday): eyebrow "REASON" + 50px input,
  same field treatment, placeholder "Public holiday, sick, annual leave…".

**Confirmation sheet — "Overwrite your edits?"**
Bottom sheet over a `rgba(8,9,11,.72)` scrim covering the whole 390×844 frame,
`padding: 20px`, sheet bg `#1B1E23`, `1px solid #2C313A`, `border-radius: 24px`,
`padding: 22px`, `gap: 12px`:
- Title "Overwrite your edits?" Space Grotesk 700 19px/1.25 `#F2F3EE`.
- Body "You've changed this summary by hand since it was generated. Regenerating replaces what
  you wrote." Space Grotesk 400 14px/1.5 `#9A9FA8`.
- "Regenerate anyway" — 52px, `border-radius: 16px`, bg `#C6E82F`, 700 16px `#16181C`.
- "Keep my version" — 52px, outlined `1.5px solid #2C313A`, 500 16px `#C9CCD2`.

The sheet must be dismissed by any navigation away from the screen (see State management).

### 5. Export

**Purpose:** produce the file that goes to the client, with a sanity check first.

**Layout:** scrollable, `padding: 8px 20px 20px`, `gap: 20px`. Title "Export" Space Grotesk 700
28px `#F2F3EE`. Bottom nav present.

- **RANGE:** three stacked option rows (`gap: 8px`), each `min-height: 52px`,
  `border-radius: 15px`, `padding: 0 16px`, space-between: label Space Grotesk 600 15px, and a
  secondary range hint JetBrains Mono 400 12px. Options: "This month", "Last month",
  "Custom range" (hint "Pick dates" → opens a date-range picker).
  - Unselected: bg `#1B1E23`, `1.5px solid #2C313A`, label `#F2F3EE`, hint `#6B7079`.
  - Selected: bg `#C6E82F`, border `#C6E82F`, label `#16181C`, hint `rgba(22,24,28,.6)`.
- **FORMAT:** two equal buttons (`gap: 8px`), 52px, `border-radius: 15px`, Space Grotesk 600
  15px — "Excel" and "CSV", same selected/unselected treatment as the range rows.
- **Preview card — "BEFORE YOU SEND":** bg `#1B1E23`, `1px solid #2C313A`,
  `border-radius: 20px`, `padding: 18px`, `gap: 14px`. Two stats side by side (`gap: 26px`):
  count of days (JetBrains Mono 700 26px `#F2F3EE`) over "days in range", and total hours
  (JetBrains Mono 700 26px `#C6E82F`) over "total hours" — labels Space Grotesk 400 12px
  `#9A9FA8`. Footnote Space Grotesk 400 12px/1.45 `#6B7079`: "{Range}, as {Format}. Days marked
  time off or holiday are listed with zero hours."
- **Download:** `min-height: 60px`, `border-radius: 18px`, bg `#C6E82F`, Space Grotesk 700 17px
  `#16181C`, label "Download Excel" / "Download CSV". While working: bg dims to `#8FA820`,
  label "Building the file…", 16px spinner at left, taps ignored.
- **Error state:** card above the button — bg `#2A1A18`, `1px solid #5A2A22`,
  `border-radius: 16px`, `padding: 14px 16px`: "Couldn't build the file" Space Grotesk 600 13px
  `#FF8A6B` and "The server didn't respond. Your hours are safe — try again in a moment."
  Space Grotesk 400 13px/1.45 `#D8A79A`.

### Bottom navigation (all screens except Login)

Fixed, 80px tall total: `padding: 0 12px 22px` (the 22px is the home-indicator band),
`border-top: 1px solid #1E2228`, bg `#101215`. Three equal-flex items, each 56px tall,
`border-radius: 16px`, centred column with `gap: 5px`: an 18×18 icon and a label Space Grotesk
600 11px. Active `#C6E82F` (icon filled), inactive `#6B7079` (icon outline only). Items:
Today / Calendar / Export. Day detail keeps **Calendar** active. All three reachable
one-handed; nothing else lives in this bar.

### Offline banner

Appears directly under the status bar on any screen, above the content:
`margin: 0 16px 8px`, `padding: 10px 14px`, `border-radius: 12px`, bg `#2A2118`,
`1px solid #5A3D18`, 8px `#FF7A3D` dot + text Space Grotesk 500 12px/1.35 `#F0C79A`:
"Offline. Times are saved on this phone and will sync when you reconnect."

Behaviour: driven by real connectivity (`navigator.onLine` + failed requests). The app must
remain usable offline — clock in/out writes locally and syncs later. Never show stale data
without the banner, and never show a broken/empty screen in place of an explanation.

## Interactions & behaviour

- **Sign in** → Today (not clocked in). Invalid password shows the inline error; clears on edit.
- **Clock In** → clocked-in state, timer starts from 00:00:00 and ticks each second.
- **Clock Out** → generating state (~2s, real duration = LLM call) → day complete.
- **Reopen the day** → back to not-clocked-in, timer reset.
- **Edit this day** → Day detail for today.
- **Calendar** month arrows / horizontal swipe page the month; the total updates with it.
- **Tap any calendar cell** → Day detail for that date, prefilled from that day's record.
- **Regenerate** → generating (~2s) → new summary, "edited by hand" flag cleared. If the flag
  is set, the confirmation sheet intercepts first.
- **Export download** → 1.5–2s working state → file download; on failure, the error card.
- **Transitions:** screen changes are instant in the prototype. If the codebase has a
  navigation transition, use it (a 200–250ms horizontal push for Calendar → Day detail, a
  bottom-sheet slide-up for the confirm dialog). Only two continuous animations matter and both
  should be implemented: the in-progress dot pulse (2.4s ease-in-out, opacity .35→1) and
  spinners/skeletons (spin .9s linear; skeleton pulse 1.6s ease-in-out, staggered .2s).

## State management

Prototype state, as a guide to what the real implementation needs:

| State | Type | Notes |
| --- | --- | --- |
| `screen` | `login \| today \| cal \| day \| export` | replace with real routing |
| `pwErr` | bool | cleared on password edit |
| `todayState` | `idle \| running \| generating \| done` | server-derived; survives app restart |
| `elapsed` | seconds | derive from the stored clock-in timestamp, **not** an in-memory counter — the app can be closed and reopened mid-day |
| `todo` | string | free text, optional, persisted per day |
| `offline` | bool | from connectivity, not user-set |
| `monthOffset` | int | calendar paging |
| `calMode` | `ready \| loading \| empty` | derived from the fetch |
| `selDay` | date | selected day for Day detail |
| `dayHours` / `hoursOverridden` | string / bool | override flag persists with the record |
| `project` / `task` | string | from the project list |
| `summary` / `summaryEdited` | string / bool | `summaryEdited` set on any manual keystroke, cleared on (re)generate; it is what gates the confirm sheet |
| `dayGenerating` | bool | in-flight LLM call for that day |
| `dayOff` / `reason` | bool / string | time-off conversion |
| `preset` / `format` | string | export options |
| `downloading` / `exportErr` | bool | export request lifecycle |

**Important transition rule (bug fixed in the prototype):** navigating to any other screen must
clear the confirmation sheet and any in-flight-generating UI flag, or the sheet leaks over the
next screen. In a real router, tie both to the Day-detail route's lifetime.

**Data fetching:** month records for Calendar (per month, cache by month), a day record for
Day detail, the LLM summary generation and regeneration, and an export preview (day count +
total hours) before the download request. The export preview must be a real query, not a local
estimate — it is the sanity check before a file goes to a client.

## Design tokens

**Dark theme (default)**

| Token | Value | Use |
| --- | --- | --- |
| bg | `#101215` | app background |
| surface | `#1B1E23` | cards, fields |
| surface-raised | `#23272E` | skeletons, selected list rows |
| surface-sunken | `#15181C` | weekend calendar cells |
| border | `#2C313A` | all 1–1.5px borders |
| border-subtle | `#1E2228` | nav top border |
| ink | `#F2F3EE` | primary text |
| ink-muted | `#C9CCD2` | secondary text |
| ink-dim | `#9A9FA8` | tertiary text |
| ink-faint | `#6B7079` | eyebrows, hints, inactive nav |
| primary | `#C6E82F` | primary actions, accents |
| primary-pressed | `#8FA820` | primary in a working state |
| on-primary | `#16181C` | text on primary |

**Light theme**

| Token | Value |
| --- | --- |
| bg | `#FBFBF3` |
| surface | `#FFFFFF` |
| surface-raised | `#EFEFE4` |
| border | `#DEDDD0` |
| ink | `#16181C` |
| ink-muted | `#4A4F58` |
| ink-faint | `#6B7079` |
| primary | `#C6E82F` (fills) / `#16181C` (buttons, with `#C6E82F` label) |

In light theme the Clock In/Out button inverts: dark `#16181C` fill with a `#C6E82F` label, so
the citron stays an accent rather than a large low-contrast field.

**Semantic day colours**

| Meaning | Dark | Light | Treatment |
| --- | --- | --- | --- |
| Worked | `#C6E82F` | `#8CA800` | solid fill, dark text |
| In progress | `#FF7A3D` | `#C2500F` | 2px dashed outline, no fill |
| Time off | `#4A8BFF` | `#2C63D6` | solid fill |
| Holiday | `#B07CFF` | `#7B45D6` | solid fill |

Support colours: error text `#FF8A6B`, error border `#FF6B4A`, error surface `#2A1A18` /
border `#5A2A22`; warning/offline surface `#2A2118` / border `#5A3D18` / text `#F0C79A`;
"edited by hand" `#FF9E6B`.

**Typography** — two families, both Google Fonts.
- **Space Grotesk** (400/500/600/700): all UI text. Headings 28px/700 with
  `letter-spacing:-.02em`; card titles 19–22px/700; body 15px/1.55; secondary 13–14px;
  button labels 14–19px/600–700.
- **JetBrains Mono** (400/500/700): numbers and eyebrows only — the elapsed timer (48px/700,
  `letter-spacing:-.03em`), hour figures (11–26px/700), dates and eyebrow labels
  (10–12px/500, `letter-spacing:.1–.18em`, uppercase).
- Minimum text size in the app is 11px, and only for uppercase mono eyebrows.

**Spacing** — 4px base; used steps 4 / 5 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 22 / 26 / 28.
Screen gutter 20px (16px on Calendar to give the grid room).

**Radii** — 2 (tiny swatch) / 7 / 11 (calendar cell) / 12 / 13 / 14 / 15 (field) / 16 / 18 /
20 / 22 (card) / 24 (sheet) / 44 (device frame, prototype only) / 50% (dots).

**Borders** — `1px` on cards and rules, `1.5px` on interactive outlines and fields,
`2px dashed` for in-progress cells.

**Shadows** — none in-app. The prototype's `0 30px 80px rgba(0,0,0,.5)` is board presentation
only.

## Assets

- **Fonts:** Space Grotesk and JetBrains Mono, loaded from Google Fonts in the prototype.
  Self-host in production. Weights needed: Space Grotesk 400/500/600/700, JetBrains Mono
  400/500/700.
- **Icons:** none real. The nav uses 18×18 placeholder rounded squares, and chevrons/arrows are
  text glyphs (‹ › ▾ !). Substitute a proper icon set (e.g. Lucide/Phosphor at 18–20px,
  1.5–2px stroke) for: today/clock, calendar, export/download, back, chevron, warning, offline.
- **Images:** none.
- **App mark:** the "TT" tile is a placeholder for the real app/PWA icon.

## Files

| File | What it is |
| --- | --- |
| `TimeTrack.dc.html` | The full interactive prototype: all five screens, all states, the state inspector, and the token/semantics documentation column. Open in a browser. |
| `palette-a-citron-night.dc.html` | The chosen palette exploration (Citron Night), light and dark side by side. |
| `palette-b-terracotta-studio.dc.html` | Rejected palette exploration, kept for context. |
| `palette-c-signal-mint.dc.html` | Rejected palette exploration, kept for context. |
| `claude_design_handoff.md` | The original design brief this was built from. |
| `support.js` | Runtime needed to open the `.dc.html` prototypes in a browser. Not part of the product. |

Out of scope for this design pass, per the brief: backend architecture, data model,
authentication logic, and the exact export file format.

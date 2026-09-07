# Design Handoff — TimeTrack

## What this is

A personal billing timesheet app. One freelancer/contractor uses it to log hours for a
client. It's a **PWA added to the phone homescreen** — it should feel like a real app, not
a website. The build is React + FastAPI; you're designing the UI only, not the data model
or backend.

## Who uses it, and when

One person, on their phone, almost always in one of two hurried moments: starting work
(wants to tap Clock In and get on with the day) or ending work (wants to log what they did
and move on to dinner). A few times a week they'll open the calendar to check hours, and
maybe once a month they'll export a date range for billing. Design for speed and thumb reach
first; the calendar and export screens can be calmer and more information-dense.

## Non-negotiables

- **Mobile-first, portrait.** This is a phone app. Don't design a desktop layout and shrink it.
- **Thumb-reachable primary actions.** Clock In / Clock Out are the two most-tapped things
  in the app — put them where a thumb naturally lands, not tucked in a top corner.
- **Installed-PWA chrome.** No browser UI once installed — design your own header/nav.
  Respect safe-area insets (notches, home indicators) so nothing sits under the iOS status
  bar or gets clipped by the home-swipe bar.
- **A creative, distinctive colour palette.** Not a default-framework grey/blue. This is a
  small personal tool — it can have personality. Define a complete **light and dark** theme.
  The calendar leans on colour to be scannable at a glance, so define clear semantic colours
  for: **worked day**, **time off**, **holiday**, and **incomplete/in-progress day** (clocked
  in but not out yet). These four need to stay visually distinct in both themes and to
  colour-blind-safe contrast.
- **Touch targets ≥44px.** Every tappable element, no exceptions.

## Screens

### 1. Login
Username + password, single field group, clear error state for a wrong password. Nothing
else on this screen — it should not compete with itself.

### 2. Today (home screen)
The screen that has to be fastest. Three distinct states:

- **Not clocked in:** one large, unmissable "Clock In" action. Below or alongside it, an
  optional short free-text field for the day's to-do list — clearly optional, not a blocker.
- **Clocked in:** a running elapsed-time display, the to-do list still visible/editable, and
  a large "Clock Out" action. This state may last all day, so it should read as "in
  progress," not urgent.
- **Day complete:** a summary card showing the day's generated description, hours, and an
  obvious way to edit it.

Also on this screen: a secondary, less prominent action to mark the day as time off/holiday
instead of clocking in.

### 3. Calendar
Month grid, each day cell colour-coded by the semantic states above, with hours shown per
day and a running month total visible without scrolling. Needs a clear way to move between
months (swipe or arrows) and to tap into any day.

### 4. Day detail
Opens from tapping a calendar day. Shows and allows editing of: hours (with a way to
override the derived value), project, task, and the LLM-generated summary as an editable
text field. Include a "regenerate" action, and if the summary has been hand-edited since it
was generated, regenerating should visibly warn before overwriting. Also a way to convert
the day to/from time off, with a reason field.

### 5. Export
A date-range picker with fast presets (this month, last month, custom range), a
format choice (Excel / CSV), and a download action. Before downloading, show a small
preview: how many days are in range and the total hours — a sanity check before the file
that goes to the client.

## Also needed

- A persistent way to move between Today / Calendar / Export (bottom nav bar or equivalent)
  that works one-handed.
- Loading, empty, and error states for each screen.
- An explicit "summary is generating" state on the Today/Day-detail screens (the LLM call
  takes a couple of seconds).
- An offline state/banner — the app can be opened with no connection and should say so
  plainly rather than show stale or broken data.

## Out of scope for this design pass

Backend architecture, the data model, authentication logic, and the exact export file
format — all already decided separately. Design the screens and interactions only.

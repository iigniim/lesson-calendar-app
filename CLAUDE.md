# CLAUDE.md

Personal lesson-scheduling app for a freelance fitness trainer. Single user, phone-first, installed as a PWA.
The owner is learning to code (HTML/CSS basics, moving toward backend/AI engineering), so keep the code plain and readable, and explain changes briefly in Korean.

## Stack and constraints

- No build step, no framework, no npm dependencies. Plain HTML/CSS/JS in `index.html`. Keep it that way unless the owner asks otherwise.
- Installable PWA: `manifest.webmanifest`, `sw.js`, `icons/`. Must work offline.
- Data lives in `localStorage` under the key `lesson-calendar-v1` as an array of events. The JSON backup/restore in the "백업·복원" sheet is the only safety net, so never break its format.
- Do not add a backend or accounts unless asked. If cross-device sync is requested later, propose Supabase and confirm first.

## Data model

```
{ id, title, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", memo, status: "scheduled" | "done" | "cancelled" }
```

`title` is the member's name. Dates are local-time strings; never use `toISOString()` for dates.
When adding fields, make them optional and keep old events valid (validEvent() only requires id/title/date/start/end).

## Service worker

Bump `CACHE` in `sw.js` on every deploy that changes app files, or installed phones keep the old version.

## UI conventions

- UI text is Korean. Code, comments and identifiers are English.
- Colors are CSS tokens on `:root` with a dark-mode override. Never hard-code a color in a component rule.
- Inputs use `font-size: 16px` so iOS does not zoom. Tap targets are at least 40px.
- User text is always inserted through `esc()` (or `textContent`).

## Planned next (in order)

1. Per-member lesson count (e.g. "3/10회차") and a member list.
2. Sign sheet (사인지): the owner will provide the base form later. Fill member, date and time from the schedule, allow adjusting date/time, and print or export as PDF. Ask for the form image before designing it.
3. Optional: start-time reminders.

## Test

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

`file://` does not run the service worker, so always test through a server.

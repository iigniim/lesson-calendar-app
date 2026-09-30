# CLAUDE.md

Personal lesson-scheduling app for a freelance fitness trainer. Single user, phone-first, installed as a PWA.
The owner is learning to code (HTML/CSS basics, moving toward backend/AI engineering), so keep the code plain and readable, and explain changes briefly in Korean.

## Stack and constraints

- No build step, no framework, no npm dependencies. Plain HTML/CSS/JS in `index.html`. Keep it that way unless the owner asks otherwise.
- Installable PWA: `manifest.webmanifest`, `sw.js`, `icons/`. Must work offline.
- All data lives in `localStorage` on the device. The JSON backup/restore in the "설정·백업" sheet is the only safety net, so never break its format (see below).
- Do not add a backend or accounts unless asked. If cross-device sync is requested later, propose Supabase and confirm first.
- The data contains real people's names, apartment units and phone numbers. Never put sample or real member data into the repo, and never log it.

## Screens

- **달력 tab**: month grid + the selected day's lessons. Adding a lesson opens the same form as 신청서 등록 (weekday of the selected day pre-checked), so the member gets a 신청서 and its lessons in one step (same 동+호+month shares one 신청서, the first registered name stays on the form and each person's lessons are events titled with their own name); editing a single lesson uses the lesson bottom sheet. Changing a lesson's date or time here is how sign-sheet dates get adjusted.
- **신청·출력 tab**: the month's enrollment forms (신청서), sorted by 동 then 호수. Add/edit an enrollment, copy last month's, preview and print.
- **Print preview** (`#preview`): renders A4 pages as HTML (`.paper.land` for 신청서+사인지, `.paper.port` for 강습신청 현황) and calls `window.print()`. Paper is always black on white, in both themes.

## Data model (localStorage)

| Key | Content |
| --- | --- |
| `lesson-calendar-v1` | events: `{ id, title, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", memo, status: "scheduled" \| "done" \| "cancelled", enrollmentId? }` |
| `lesson-calendar-enroll-v1` | enrollments: `{ id, month: "YYYY-MM", name, dong, ho, phone, periodStart, periodEnd, days: [0-6], count, start, end, fee, appliedOn }` |
| `lesson-calendar-settings-v1` | `{ instructor, label }` (printed on forms; defaults 김민기 / 오전헬스) |

- `title` of an event is the member's name. Dates are local-time strings; never use `toISOString()` for dates.
- An enrollment is one member's 신청서 for one month. Its calendar lessons are events with `enrollmentId`. If an event has no `enrollmentId`, it still counts for the sign sheet when `title === enrollment.name` and the date is in `enrollment.month` (see `lessonsFor`).
- Sign-sheet rows come from `signedLessons(enr)` (only signed lessons, sorted by date/time), 11 rows per sheet, extra sheets are added automatically.
- 강습신청 현황 rows come from `enrOfMonth(key)`: sorted by 동 (A, B, C, ...) then 호수 numerically ascending (`cmpEnr`). 15 rows per page with a 소계 per page, plus 합계 on the last page when there is more than one page.
- Count and fee are computed, not typed: count = the enrollment's lessons that the member signed (`status: "done"`, `enrCount`), fee = the sum over those lessons of 30,000 (30 min) or 50,000 (50 min) by each calendar lesson's own start/end (`unitFee`, `enrFee`). Lesson length is picked with the 수업 시간 buttons, which set `end`. The stored `count`/`fee` fields are legacy and ignored.
- Backup file: `{ app: "lesson-calendar", version: 2, events, enrollments, settings }`. Import also accepts the old version 1 (events only) and merges by `id`. Keep new fields optional so old backups stay valid.

## The paper forms

The two forms come from the owner's workplace (Acrovista Sports Community): 신청서 + 선생님 보관용 on one landscape A4, and the monthly 종목별 입주민 강습신청 현황 on portrait A4. The original scans are photos, so the layouts are redrawn in HTML/CSS. If the owner changes a form, edit `signLeft`, `signRight`, `summaryPages` and the `.paper` CSS, then check the result as a PDF (Playwright `page.pdf` with `prefer_css_page_size`) to confirm the page count.
The 회원 column of the 선생님 보관용 table shows the member's signature. Marking a lesson done is done by the member signing on the phone (event field `sign`, an SVG path string in a 300x100 box, optional); there is no plain done button. The left form (`signLeft`) follows the owner's original `신청서.pdf`: uniform ~10mm line pitch, continuation lines indented.

## Service worker

Bump `CACHE` in `sw.js` on every deploy that changes app files, or installed phones keep the old version.

## UI conventions

- UI text is Korean. Code, comments and identifiers are English.
- Colors are CSS tokens on `:root` with a dark-mode override. Never hard-code a color in a component rule (the `.paper` print styles are the one exception).
- Inputs use `font-size: 16px` so iOS does not zoom. Tap targets are at least 40px.
- User text is always inserted through `esc()` (or `textContent`).

## Planned next

1. Optional: start-time reminders.
2. Optional: 소그룹 lessons (the 신청서 and 현황 forms have a section for them).
3. Optional: cross-device sync (Supabase), only if asked.

## Test

```bash
python3 -m http.server 8080   # then open http://localhost:8080
```

`file://` does not run the service worker, so always test through a server.

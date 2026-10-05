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

- **달력 tab**: month grid + the selected day's lessons. Adding a lesson opens the same form as 신청서 등록 (weekday of the selected day pre-checked), so the member gets a 신청서 and its lessons in one step (same 동+호+month shares one 신청서, the first registered name stays on the form and each person's lessons are events titled with their own name); editing a single lesson uses the lesson bottom sheet. Each enrollment row has a "사인 받기 / 사인 완료 ✓ / 변경됨 · 다시 사인" button (same sign pad, "강습 확인 사인" mode) whose signature prints in the 입주민 강습확인 column of the 강습신청 현황. Deleting a lesson always shows three choices (a choice that would only delete this lesson is disabled): this lesson only, this and later unsigned lessons on the same weekday, or this and all later unsigned lessons (signed lessons are never removed by the latter two). "Same member" is `sameMember`: same name and the same enrollment, the same 동+호, or a lesson without an enrollment. Changing its start/end asks (popup) whether to apply it to later unsigned lessons on the same weekday too, and then updates the 신청서 `slots`/`start`/`end` to match. Editing a 신청서's days/time/period redoes that person's unsigned lessons from today on (signed ones stay). Changing a lesson's date or time here is how sign-sheet dates get adjusted.
- **신청·출력 tab**: the month's enrollment forms (신청서), sorted by 동 then 호수. Add/edit an enrollment, "선택" turns the list into selection mode (bottom bar: 전체 선택 / N건 선택 / 삭제) for deleting several 신청서 at once; `planDelete`/`applyDelete` remove the 신청서 and their unsigned lessons (signed ones stay) in one save, and a 10-second "되돌리기" bar restores them from memory. Copy last month's (opens a picker: last month's households checked, households that rested up to 12 months unchecked; the newest 신청서 of each is the source), preview and print.
- **Print preview** (`#preview`): renders A4 pages as HTML (`.paper.land` for 신청서+사인지, `.paper.port` for 강습신청 현황) and calls `window.print()`. Paper is always black on white, in both themes.

## Data model (localStorage)

| Key | Content |
| --- | --- |
| `lesson-calendar-v1` | events: `{ id, title, date: "YYYY-MM-DD", start: "HH:MM", end: "HH:MM", memo, status: "scheduled" \| "done" \| "cancelled", enrollmentId? }` |
| `lesson-calendar-enroll-v1` | enrollments: `{ id, month: "YYYY-MM", name, dong, ho, phone, periodStart, periodEnd, days: [0-6], count, start, end, fee, appliedOn, slots?, confirm?, confirmCount?, confirmFee? }` |
| `lesson-calendar-members-v1` | members: `[{ id, name }]`. The one place a person's name lives. Events and enrollments carry `memberId`; `title`/`name` are a derived copy rewritten from the member (`Members.applyNames`, called in `render`). Logic in `members.js` (tested by `node members.test.js`). |
| `lesson-calendar-settings-v1` | `{ instructor, label }` (printed on forms; defaults 김민기 / 오전헬스) |

- Colors belong to the household (동+호, or the name when there is none), not the member. `PALETTE` has 18 fixed colors; `settings.colors` (optional) maps household key to palette index, assigned once by `assignColors` (lowest index not held by an active household) and never changed afterwards. Stored in settings, so it is part of the backup and cloud payload.
- `title` of an event is the member's name (derived from its `memberId`; renaming a member changes only the member record). Renaming happens by editing the 성명 of an existing 신청서; a name another member already has offers a merge (5-second undo = full snapshot). Dates are local-time strings; never use `toISOString()` for dates.
- An enrollment is one member's 신청서 for one month. Its calendar lessons are events with `enrollmentId`. If an event has no `enrollmentId`, it still counts for the sign sheet when `title === enrollment.name` and the date is in `enrollment.month` (see `lessonsFor`).
- Sign-sheet rows come from `signedLessons(enr)` (only signed lessons, sorted by date/time), 11 rows per sheet, extra sheets are added automatically.
- 강습신청 현황 rows come from `enrOfMonth(key)`: sorted by 동 (A, B, C, ...) then 호수 numerically ascending (`cmpEnr`). 15 rows per page with a 소계 per page, plus 합계 on the last page when there is more than one page.
- Count and fee are computed, not typed: count = the enrollment's lessons that the member signed (`status: "done"`, `enrCount`), fee = the sum over those lessons of 30,000 (30 min) or 50,000 (50 min) by each calendar lesson's own start/end (`unitFee`, `enrFee`). Lesson length is picked with the 수업 시간 buttons, which set `end`. The stored `count`/`fee` fields are legacy and ignored.
- `confirm` (optional on an enrollment): the resident's signature for the month, an SVG path string like a lesson `sign`, with `confirmCount`/`confirmFee` = the signed-lesson count and fee shown when signing. If they no longer match `enrCount`/`enrFee` the list shows "변경됨 · 다시 사인". Not copied by 지난달 복사, never touched by the calendar sync.
- Backup file: `{ app: "lesson-calendar", version: 3, events, enrollments, members, settings }`. Import also accepts version 2 and the old version 1 (events only) and merges by `id`; data without `memberId` gets members assigned by `Members.migrate` (idempotent). The first migration copies the raw old data to `<key>__backup_before_member_id_migration` (never overwritten; not part of the backup file). Keep new fields optional so old backups stay valid.
- `slots` (optional on an enrollment): `{ "2": { start, end }, "3": { start, end } }`, keyed by weekday number. A weekday with a slot uses that time, every other weekday uses the enrollment's `start`/`end` (`slotOf`, `timeText`). Used when generating calendar lessons, redoing lessons on edit, copying last month and the printed 신청서/사인지. Missing `slots` = old data, everything uses `start`/`end`.

- The calendar is the source of truth for an enrollment's `days`, `start`/`end`, `slots` and `periodStart`/`periodEnd`: `syncEnrFromLessons` recomputes them from the enrollment's lessons after every lesson edit, time change, delete, sign/un-sign and enrollment save (upcoming unsigned lessons win for days/times; the period spans the first and last lesson of the month). Deleting the last lesson asks whether to delete the 신청서 too. `syncAllEnrollments` also runs for every enrollment at app start, after a backup import and after a cloud pull (one save, idempotent, toast when something changed); the first automatic change keeps a copy of the enrollments in localStorage under `lesson-calendar-enroll-backup-pre-sync` (not part of the backup file or cloud payload). Unlinked lessons (no `enrollmentId`) count only when exactly one enrollment of that month has the member's name.
- The printed 신청서 shows one representative weekday and time (`repDay`: the weekday with most lessons, its most common time); the sign sheet still lists every real lesson.

## The paper forms

Paper text is forced to `#000` (`.paper, .paper * { color: #000 !important }`); app CSS classes must not reuse paper class names (the sign card once used `.srow` and turned the 현황 header gray in dark mode, so it is `.crow` now).
The two forms come from the owner's workplace (Acrovista Sports Community): 신청서 + 선생님 보관용 on one landscape A4, and the monthly 종목별 입주민 강습신청 현황 on portrait A4. The original scans are photos, so the layouts are redrawn in HTML/CSS. If the owner changes a form, edit `signLeft`, `signRight`, `summaryPages` and the `.paper` CSS, then check the result as a PDF (Playwright `page.pdf` with `prefer_css_page_size`) to confirm the page count.
The sign screens (lesson and 강습 확인) use large type for elderly residents (22px name, 18-32px summary card, 56px buttons, a 2:1 pad on phones whose strokes are fitted into the 300x100 box on save).
The 회원 column of the 선생님 보관용 table shows the member's signature. Marking a lesson done is done by the member signing on the phone (event field `sign`, an SVG path string in a 300x100 box, optional); there is no plain done button. The left form (`signLeft`) follows the owner's original `신청서.pdf`: uniform ~10mm line pitch, continuation lines indented.

## Workflow (deploy on every change)

1. Before pushing: run `node --check` on the extracted inline script and the headless test for the touched feature if one exists. If anything fails, fix it or stop. Never push a failing build. If the Playwright setup hangs, skip it, say so, and give the owner a short manual test checklist in Korean.
2. Bump `CACHE` in `sw.js` when app files changed.
3. `git add` only the files changed for this task. Never `git add .`. Never stage member data, backup `*.json`, `.env` or secrets.
4. One commit per request with a short imperative message, then `git push origin main`.
5. Finish in Korean: 2-3 lines on what changed, the commit hash, and "앱을 완전히 닫았다 다시 열면 새 버전이에요".
6. If a change touches the data model, backup format or sync, tell the owner to export a backup first and ask for confirmation before pushing.
7. If the owner says "푸시하지 마" or "테스트만", do not commit or push.
8. To undo a bad deploy use `git revert <hash>` and push. Never force-push.

## Service worker

Bump `CACHE` in `sw.js` on every deploy that changes app files, or installed phones keep the old version.
The worker installs with `cache: 'reload'`, navigations use `cache: 'no-store'` (network first, cache only offline), and `skipWaiting()`/`clients.claim()` are on. When a new worker takes over, the page shows a "새 버전이 있어요" bar with a reload button (never reloads by itself). The 설정·백업 sheet shows `버전 vNN`, read from the cache name, so `CACHE` is the only place the version lives.

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

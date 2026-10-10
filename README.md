# SYCU Timetable

A small, dependency-free web viewer **and editor** for the SYCU course
timetable. Students open the site and read the schedule; the administrator
signs in, edits in place, and the change goes **live for every visitor
immediately**. No build step, no framework — and the site still works offline
or from a plain static host (edits fall back to the device).

```
sycuv2_timetable/
├── index.html          # page shell (single file, no framework)
├── styles.css          # dark/light themes, grid + list, admin UI, print CSS
├── app.js              # data store + remote sync, rendering, search, live status
├── admin.js            # admin sign-in, timetable manager, publishing
├── api/                # Vercel serverless functions (the live-publishing backend)
│   ├── _lib.js         #   auth tokens, Blob storage (fs fallback for local dev)
│   ├── login.js        #   POST /api/login    → signed 8h token
│   ├── timetable.js    #   GET/PUT /api/timetable → read / publish
│   └── reset.js        #   POST /api/reset    → unpublish
├── vercel.json         # function limits + cache headers
└── data/
    └── timetable.js    # window.SYCU_DATA — the shipped timetable data
```

## Run it

**Just open it** (works offline — admin edits then stay on the device):

```
open index.html
```

**Serve it** (enables the API when running under Vercel's dev server):

```
vercel dev
```

## For students

- **Semester tabs** — 2026 Autumn (4-block schedule), 2026 Spring and 2025
  Autumn (8-session schedule). Counts shown per semester.
- **Program list** with search — filters by program name, Chinese name, course
  or room. Press Enter to jump to the first matching program.
- **Two views** (remembered in `localStorage`):
  - **Grid** — week × session timetable. Days with no classes are omitted;
    empty slots stay blank.
  - **List** — classes grouped by day, ordered by session.
- **Live updates** — the published timetable is re-fetched when the tab gains
  focus and every minute while visible, so timetable changes appear on open
  screens (classrooms, kiosks, phones) within a minute — no refresh needed.
- **Live status** — from the local clock in `Asia/Shanghai`: current class is
  marked `● Now`, the next one `↑ Next`. Re-checks every 30 s.
- **Course colours** — each course gets a stable accent colour (hashed from
  the course name), consistent across legend, cards and list.
- **Dark / light theme**, sticky header, mobile responsive layout, and
  **print-friendly CSS** (printing gives a clean white timetable).

## For the administrator

Click the **lock icon** in the header (or "Manage timetable" once signed in).

```
email:    sycu@admin.com
password: sycu#timetableweb
```

Once signed in you get an **admin bar**:

| Button | What it does |
| --- | --- |
| **Manage timetable** | Opens the editor: *Semesters* (name, Chinese name, time-slot format, delete), *Programs & classes* (add/rename/delete programs, add/edit/delete each class row: day, session, course, room), *Rooms* (codes, building, room, campus). Nothing changes until you press **Save changes**. |
| **Export** | Downloads a ready-to-use `timetable.js` (backup or manual publish). |
| **Import** | Replaces the timetable from a `timetable.js` or raw JSON file. |
| **Reset** | Unpublishes everything and restores the built-in data for everyone. |
| **Sign out** | Ends the admin session on this device. |

While signed in, every class card and list row shows a small **✎** that opens
that program's schedule editor directly.

Editing notes:

- **Save changes publishes.** The new timetable is stored server-side and every
  visitor sees it immediately (open tabs pick it up within a minute). The toast
  confirms "Published — live for everyone".
- If the server is unreachable (offline, `file://`, static hosting), saving
  falls back to the device: the toast says "saved on this device only", and
  **Export** remains the publishing path.
- Rooms referenced by a class are created automatically if the code is new;
  renaming a room code in the *Rooms* tab updates every class that uses it.
- Rows that clash with another class of the same program in the same day and
  session are highlighted amber — allowed, but flagged.
- The time-slot format decides the session rows: `standard8` = 8 single
  sessions (e.g. `5`), `block4` = 4 double blocks (e.g. `"5-6"`).

## How data flows

```
teacher edits ──PUT /api/timetable──▶ Vercel Blob (published copy)
                                          │
students  ◀──GET /api/timetable───────────┘   (+ per-browser cache for offline)
```

The site renders from the first of: unpublished device edits → published
copy (cached) → the bundled `data/timetable.js`. That ordering keeps it
working offline, from `file://`, or on any static host, while the deployed
Vercel version stays live.

## Deploying to Vercel

```
vercel link                     # once — links this folder to the project
vercel blob create-store sycu-timetable-data
# copy the Read_Write token from the output, then:
vercel env add BLOB_READ_WRITE_TOKEN production   # paste token
vercel env add ADMIN_EMAIL production             # sycu@admin.com
vercel env add ADMIN_PASSWORD production          # sycu#timetableweb
vercel env add ADMIN_SECRET production            # openssl rand -hex 32
vercel deploy --prod
```

Environment variables (server-side only, never sent to the browser):

| Var | Purpose |
| --- | --- |
| `BLOB_READ_WRITE_TOKEN` | Storage for the published timetable |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | Checked by `/api/login` |
| `ADMIN_SECRET` | Signs the 8-hour admin tokens (HMAC-SHA256) |

Redeploying the static files does **not** touch the published timetable — it
lives in Blob storage, so `vercel deploy` is safe at any time. **Reset** in
the admin bar clears the published copy and returns everyone to the bundled
data.

## Updating the shipped data by hand

`data/timetable.js` is the fallback used before anything is published (and
offline). Keep the same shape:

- `timeSlotFormats` — named slot layouts; semesters reference one via
  `timeSlotFormat`.
- `semesters[].programs[].schedule[]` — `{ day, session, course, location }`.
  `session` matches a slot's `session` value (`5` for standard8, `"5-6"` for
  block4).
- `locations` — room metadata (`building`, `room`, `campus`).

An exported `timetable.js` is already in the right shape — edit it, or import
it from the admin bar.

## Notes

- Data source: `2026-2027-1 专业课表` (3 semesters, 15 programs, 73 classes).
- Vanilla ES5-ish JS on purpose — runs anywhere, no bundler.
- Security model: the browser checks the password offline (so admin works
  without a server), but **publishing always requires a server-signed token**
  from `/api/login`, and writes are rejected without it (verified by tests).
  Passwords are never stored or shipped — the server holds the credentials in
  env vars; the client holds only a salted SHA-256 digest for offline checks.
- `styles.css` honours `prefers-reduced-motion` and includes print styles.

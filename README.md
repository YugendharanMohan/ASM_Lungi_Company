# ASM Lungi Works

Production, wages and dispatch tracking for a lungi manufacturing mill.

React + TypeScript + Vite + Tailwind + shadcn/ui · FastAPI · PostgreSQL · Firebase Auth

---

## What it does

| Area | Detail |
|---|---|
| **Daily entry** | Date, shift, **pick** (88x96 / 88x92 / 88x80), worker, loom, metres, rate. Total is calculated. Any worker can be booked to any loom. Entries can be edited or deleted. One entry per worker + loom + date + shift, enforced by a database constraint. |
| **Workers** | Name, phone, shed, rate per metre, active flag. Searchable list. Workers are **not** tied to a loom — that is recorded per entry. |
| **Sheds** | Add, edit, delete, with search and an all / with-looms / empty filter. |
| **Looms** | Belong to one shed. Change the shed to move a loom. Numbers are plain (1, 2, 3) and unique within a shed; displayed everywhere as `Shed - Loom`, e.g. `AA - 3`. |
| **Salary** | Any **from / to** period, plus this-week and this-month presets. Per-worker **PDF receipt** with a day × loom grid and a rate-by-rate breakdown, always on one A4 sheet. CSV export. |
| **Dispatch** | Company, date, remarks, and **bundles per pick**. Cloth goes out in bundles of 24, so bundles are what gets typed and the piece count is derived. |
| **Overview** | Today's production, active workers, active looms, weekly salary, weekly dispatch, 7-day chart. |
| **User access** | Admin-only. There is no public sign-up. |

### Picks and rates

Three picks are woven — `88x96`, `88x92`, `88x80` — and each carries its own
piece rate. The rate is typed in per entry rather than looked up, because it
moves with the market and with the customer.

The salary receipt therefore never shows a single blended rate. Metres are
grouped by the rate they were paid at and each band gets its own line:

```
PICK     RATE   METERS     AMOUNT
88x80    8.50    358.9   3,050.82
88x92    9.00    298.5   2,686.41
88x96    9.50    523.9   4,977.34
TOTAL           1181.3  10,714.57
```

Those lines sum to the amount due, so the person being paid can check it.

Dispatch counts picks separately too, with one extra: **88x96 Kambam**. It is
its own line on the delivery note but is woven on the same setting, so the loom
floor never sees it — which is why dispatch and production have separate pick
lists rather than one shared enum.

### Bundles

Cloth leaves the mill in bundles of **24**, never as loose pieces. Bundles per
pick are what gets typed; the piece count is derived and stored so the
dashboard can still sum it in SQL. That total is written in exactly one place
in the dispatch route, which is what keeps it from drifting away from the lines
it summarises.

---

## Run it locally

Two terminals. **It works with no Firebase and no Postgres** — the backend
falls back to a local SQLite file and an auth bypass, so you can click through
everything before setting up any accounts.

### 1. Backend

```bash
cd "backend" && python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt && cp .env.example .env
```

Open `backend/.env` and set `AUTH_DEV_BYPASS=true` for local work. Then:

```bash
cd "backend" && ./.venv/bin/python seed.py
```

```bash
cd "backend" && ./.venv/bin/uvicorn app.main:app --reload --port 8000
```

API docs: <http://localhost:8000/docs> · Health: <http://localhost:8000/api/health>

### 2. Frontend

```bash
cd "frontend" && npm install && cp .env.example .env && npm run dev
```

Open <http://localhost:5173>. A red banner shows while auth is disabled.

---

## Going live

### Step 1 — Firebase

1. Create a project at <https://console.firebase.google.com>.
2. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
3. **Authentication → Settings → User actions**: leave *Enable create (sign-up)*
   **off**. This is what disables public registration.
4. **Project settings → General → Your apps → Web app**: copy the config values
   into `frontend/.env` as the `VITE_FIREBASE_*` variables.
5. **Project settings → Service accounts → Generate new private key**: this
   downloads a JSON file. For local use, put the path in
   `backend/.env` as `FIREBASE_CREDENTIALS_FILE`. For Render, paste the whole
   file contents on one line as `FIREBASE_CREDENTIALS_JSON`.

   > Keep that JSON out of git. `.gitignore` already excludes
   > `*serviceAccount*.json` and `firebase-adminsdk*.json`.

6. Set `AUTH_DEV_BYPASS=false` in `backend/.env`.

### Step 2 — Your first admin

Nobody can create the first user, because creating users requires being an
admin. To break the loop, put your own address in `BOOTSTRAP_ADMIN_EMAILS`
(comma separated) in `backend/.env`. The first time that address signs in with
a verified email, it is provisioned as an admin automatically.

After that, add everyone else from **User Access** in the app, and create their
credentials under **Firebase Console → Authentication → Users**.

### Step 3 — Database

Local Postgres:

```bash
createdb asm_lungi
```

Set `DATABASE_URL=postgresql+psycopg://localhost:5432/asm_lungi` in
`backend/.env`, then:

```bash
cd "backend" && ./.venv/bin/alembic upgrade head
```

### Step 4 — Deploy

**Backend → Render.** `render.yaml` provisions the web service and a Postgres
instance. Set these in the dashboard (they are deliberately not in the file):
`FIREBASE_PROJECT_ID`, `FIREBASE_CREDENTIALS_JSON`, `BOOTSTRAP_ADMIN_EMAILS`,
and `CORS_ORIGINS` (your Vercel URL).

**Frontend → Vercel.** Root directory `frontend`. Set `VITE_API_BASE_URL` to
the Render URL, plus the six `VITE_FIREBASE_*` variables. `vercel.json` already
rewrites all paths to `index.html` so client-side routes survive a refresh.

Deploy the backend first — you need its URL for `VITE_API_BASE_URL`, and it
needs your Vercel URL for `CORS_ORIGINS`.

---

## How access control works

Three checks run on **every** authenticated request, server-side in
`backend/app/core/deps.py`:

1. The bearer token is a valid, unrevoked Firebase ID token.
2. `email_verified` is true. **Unverified users are rejected**, with no
   override.
3. The email has a row in `users` and that row is active.

Check 3 is what makes registration admin-only. Even if someone creates a
Firebase account, without a row in `users` they get a 403 and can read nothing.

The frontend mirrors these rules to show useful screens — "verify your email"
versus "ask an admin for access" — but the client checks are cosmetic. The
server decides.

`AUTH_DEV_BYPASS=true` skips all of it and treats every caller as an admin. It
logs a warning on every request and paints a red banner in the UI. **Never set
it on a deployed environment.**

---

## Layout

```
backend/
  app/
    core/       config, Firebase Admin, auth dependencies, period maths
    db/         SQLAlchemy engine and session
    models/     users, sheds, looms, workers, production_entries, dispatches
    schemas/    Pydantic request/response models
    api/routes/ one module per resource
    main.py     app assembly, CORS, health check
  alembic/      migrations
  seed.py       demo data

frontend/
  src/
    components/ AppShell — sidebar on desktop, tab bar on phones
    contexts/   AuthContext — the sign-in state machine
    hooks/      useApi
    lib/        api client, firebase init, formatters, types
    pages/      one per screen
    ui/         the design system (see below)
```

## Design system

Apple-inspired restraint applied to a working tool: `#F5F5F7` / `#0A0A0A`
grounds, one blue for every action, SF Pro on Apple hardware and Inter
everywhere else. All tokens live at the top of `src/index.css`.

Components in `src/ui/` are built from scratch — no component library.
`Button`, `Card`, `StatCard`, `DataTable` (sticky header, search, sort,
pagination), `Field` / `SelectField` / `DateField` (floating labels, inline
validation, icons inside the control), `SearchInput`, `SegmentedControl`,
`Switch`, `Modal` (bottom sheet on phones), `Feedback` (skeletons, empty and
error states). Motion comes from Framer Motion through one shared vocabulary in
`src/ui/motion.ts`, and everything honours `prefers-reduced-motion`.

Two decisions worth knowing:

- **The dark accent is `#0A84FF`, not `#0071E3`.** On `#0A0A0A` the light-mode
  blue reaches only ~3.5:1; the lighter one clears 4.5:1. This is the pair
  Apple ships.
- **Selects and date fields are native controls, restyled.** A custom listbox
  would animate more prettily, but the native ones give the iOS wheel picker
  and Android sheet for free, plus keyboard type-ahead and screen-reader
  support. Only the chrome is ours.

## Decisions worth knowing

- **Money is `Numeric`, never `float`.** 12.35 has no exact binary form and the
  drift lands in someone's wages.
- **The rate is copied onto each production entry.** Raising a worker's rate
  must not retroactively rewrite what they were already owed.
- **Receipts are rendered server-side** (reportlab), so the slip a worker is
  handed is identical whoever prints it rather than depending on a browser's
  print dialog.
- **The receipt fits one A4 sheet by measuring, not by guessing.** It is laid
  out at the largest of five type scales that measures small enough to fit, so
  a week prints large and a month prints smaller instead of spilling onto a
  second page. (Note for anyone touching it: reportlab keeps a table cell's
  leading at 12pt unless `LEADING` is set alongside `FONTSIZE`, so shrinking
  the font alone does nothing to row height.)
- **Duplicate entries are blocked by a unique constraint**, not a check-then-
  insert in the route — two simultaneous submissions would both pass a check.
- **Deleting a worker or loom that has production history is refused** (409).
  Deactivate instead, so wage records survive.
- **The week runs Monday–Sunday**, matching ISO and the week people say aloud.
- **Dates are handled as calendar days.** `toISODate` shifts by the local
  offset before slicing, because `toISOString()` rolls the date backwards every
  evening in IST.

## Known limitations

- **No automated tests.** Everything here was verified by hand.
- **The API is not rate-limited.** Firebase throttles sign-in attempts, but the
  API itself will answer as fast as it is asked.
- **No audit trail.** Rows record `created_at`, but edits and deletions are not
  logged against a user.
- **`seed.py` writes demo data.** Run it against a real database only if you
  want twelve fictional workers in your records.
- **Render's free tier sleeps.** The first request after idle takes ~30s.

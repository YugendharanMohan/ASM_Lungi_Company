# Going live: Firebase auth + Postgres

Two things to set up. Do the database first — Firebase is easier to verify
once the app can actually store a user row.

After each step run the checker; it tells you exactly what is still missing:

```bash
cd backend && ./.venv/bin/python check_setup.py
```

---

## 1. Database

**Use Postgres, not Firestore.** Firebase handles who you are; Postgres holds
what you record. Wages need exact decimals, unique constraints and `SUM ... 
GROUP BY` over date ranges — Firestore has none of those, and the backend is
already built on SQLAlchemy against Postgres.

### Supabase

1. Sign up at <https://supabase.com>, create a project, and save the database
   password it gives you — it is shown once.
2. **Project settings → Database → Connection string**. You will see three
   options, and the difference matters:

   | Mode | Port | Use for |
   |---|---|---|
   | Direct connection | 5432 | Nothing here — IPv6-only on new projects, so IPv4-only hosts (including Render's free tier) cannot reach it. |
   | **Session pooler** | 5432 | **Migrations** |
   | **Transaction pooler** | 6543 | **The app** |

3. Put both in `backend/.env` — same string, different ports:

   ```
   DATABASE_URL=postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres
   DATABASE_MIGRATION_URL=postgresql://postgres.PROJECT:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
   ```

   Paste them exactly as the dashboard gives them; the `postgresql://` prefix
   is rewritten onto the psycopg v3 driver automatically.

   Why two: Alembic needs session state and advisory locks that the transaction
   pooler does not provide, so migrations would hang or half-apply. The app
   wants the transaction pooler because it scales to more concurrent requests.
   The app connection also disables prepared statements automatically — psycopg
   promotes a query to a prepared statement after five runs, and behind a
   transaction pooler the PREPARE and EXECUTE land on different backends, so
   common queries start failing only once the app has been up a while.

4. Create the schema:

   ```bash
   cd backend && ./.venv/bin/alembic upgrade head
   ```

#### The migration that closes Supabase's REST API

Supabase runs **PostgREST** over the `public` schema and grants the `anon` role
access to tables created there. The anon key is published in client code by
design. On an untouched project that means worker names, phone numbers and wage
rates are readable — and writable — by anyone who has it.

This app never uses PostgREST; it connects as `postgres` and authenticates
through Firebase. Migration `9a1c7f3d5e20` shuts that door: row-level security
on with no policies, and the `anon`/`authenticated` grants revoked, including
default privileges so later tables start locked too. The app is unaffected
because it connects as the table owner, which bypasses RLS.

`check_setup.py` verifies this, so you can confirm it on your own project:

```
[  ok  ] Tables closed to the REST API   RLS on, no anon/authenticated grants.
```

If you ever add tables outside Alembic, re-run the checker — it lists any table
left without RLS.

> Do **not** run `seed.py` against the real database unless you want twelve
> fictional workers in your records.

---

## 2. Firebase

### 2a. Create the project

1. <https://console.firebase.google.com> → **Add project**.
2. Google Analytics is not needed; turn it off.

### 2b. Turn on the two sign-in methods

**Authentication → Get started → Sign-in method**

- Enable **Email/Password**.
- Enable **Google**, and set a support email.

### 2c. Close public registration

**Authentication → Settings → User actions**

- Untick **Enable create (sign-up)**.

This is what stops strangers making themselves an account. Even with it left
on, the backend's third gate still refuses anyone without a `users` row — but
turn it off anyway.

### 2d. Frontend config

**Project settings → General → Your apps → Web app** (create one if there is
none — the `</>` icon). Copy the config values into `frontend/.env`:

```
VITE_FIREBASE_API_KEY=AIza...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abc123
```

These are public by design — they identify the project, they do not authorise
anything. Access control is entirely server-side.

### 2e. Backend service account

**Project settings → Service accounts → Generate new private key.** This
downloads a JSON file. Unlike the values above, **this one is a secret** — it
can mint tokens for any user in your project.

**Save it outside the repo**, e.g. `~/asm-firebase-key.json`, then in
`backend/.env`:

```
FIREBASE_CREDENTIALS_FILE=/Users/you/asm-firebase-key.json
```

`.gitignore` already covers `*serviceAccount*.json` and
`firebase-adminsdk*.json`, but a file with any other name would be committed.
Keeping it outside the project removes the question.

### 2f. Turn authentication on

In `backend/.env`:

```
AUTH_DEV_BYPASS=false
BOOTSTRAP_ADMIN_EMAILS=you@example.com
```

`BOOTSTRAP_ADMIN_EMAILS` solves the chicken-and-egg problem: creating users
requires being an admin, and there are no users yet. The first time that
address signs in **with a verified email**, it is provisioned as an admin.
Clear the variable once you are in.

### 2g. Create your login

**Authentication → Users → Add user.** Enter the same email as
`BOOTSTRAP_ADMIN_EMAILS` and a password.

The console does not send a verification email, and the backend rejects
unverified addresses with no override. So: sign in to the app once, it will
show the "verify your email" screen, click **Resend verification email**, open
the link, then continue. Signing in with Google instead skips this — Google
addresses arrive already verified.

---

## 3. Check it

```bash
cd backend && ./.venv/bin/python check_setup.py
```

Everything should read `ok`. Then restart both servers — `.env` is read once at
startup, so changes need a restart:

```bash
cd backend && ./.venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend && npm run dev
```

The red "development mode" banner should be gone and a login screen should
appear. Sign in, and add everyone else from **User Access** in the app.

### If something is wrong

| Symptom | Cause |
|---|---|
| Still no login screen | `frontend/.env` values missing, or Vite not restarted. Vite reads env at startup only. |
| "Authentication is not configured" (503) | Backend cannot read the service account file. Check the path. |
| "Not been granted access" (403) | Signed in successfully, but no `users` row. Check `BOOTSTRAP_ADMIN_EMAILS` matches the address exactly. |
| "Email address is not verified" (403) | Working as intended. Open the verification link. |
| Login works, then every request fails | Frontend and backend are on different Firebase projects. The checker catches this. |
| `prepared statement "..." already exists` | App is on the transaction pooler without prepared statements disabled. Confirm `DATABASE_URL` really ends in `:6543` — detection keys off the port. |
| Migrations hang or half-apply | Alembic is running against the transaction pooler. Set `DATABASE_MIGRATION_URL` to the session pooler (port 5432). |
| Cannot connect from Render | Using Supabase's direct connection, which is IPv6-only. Switch to a pooler URL. |

---

## 4. Deploying

Set the same values as environment variables in the host's dashboard rather
than in a file. On Render, paste the service account JSON on **one line** into
`FIREBASE_CREDENTIALS_JSON` (keep the `\n` escapes inside `private_key` exactly
as they appear).

Also set `CORS_ORIGINS` to your frontend URL — without it the browser blocks
every request, which looks like a broken login rather than a config problem.

The API refuses to start if `AUTH_DEV_BYPASS=true` on a hosted platform, so
that setting cannot leak into production by accident.

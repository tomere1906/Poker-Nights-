# Security check before the full release (step 11)

Date: 2026-11-10 · Branch: `multiplayer` · Status: **in progress** (items marked ⏳ need the owner)

How the app is protected, in one paragraph: the app talks to Supabase with a
**public** key that anyone can read from the site, so the app itself is not a
wall. Every rule (who sees a table, who may add a buy-in, who closes a game) is
enforced **inside the database** with Row Level Security (RLS) policies, triggers
and column grants. The checks below attack exactly that: the database directly.

## 1. Database rules (RLS tests + Supabase Advisors)

| Check | Result |
|---|---|
| `supabase/tests/rls_test.sql`: 329 cases that try to break every rule as manager, co-manager, player, stranger and signed-out visitor | **329 / 329 passed ✅** (2026-11-10, after both name migrations). The first run after `clean_names` found 5 failures, all from that migration turning blank names into "שחקן" / "no name" instead of rejecting them; fixed by `20261110130000_clean_names_keep_blank_checks.sql` (tests 432, 440, 441). |
| Supabase **Security Advisor** | ⏳ |
| Supabase **Performance Advisor** | ⏳ |

## 2. Outside attack test (bypassing the app)

`supabase/tests/attack_test.mjs` uses only the publishable key, like an attacker
would (`node supabase/tests/attack_test.mjs`).

**Part A, no account: 22 / 22 blocked ✅** (2026-11-10)
- None of the 8 tables or 3 stats views can be read; nothing can be written.
- `end_game` / `swap_seats` can't be called; the `private` schema and `auth.users` (emails) aren't reachable.
- Only Google sign-in is enabled: no email/password, phone or anonymous sign-up that could create accounts around Google.
- The API description (OpenAPI) and GraphQL list no tables to a visitor; no storage buckets.

**Part B, two real accounts** (A owns a fresh test table, B is an outsider, then
a plain member): ⏳ needs two short-lived session tokens in `.attack-tokens.json`
(git-ignored). Covers: B can't read, change, take over, delete or end A's table;
can't seat himself or guests, add/change/delete buy-ins, record cash or write the
log; can't join with a wrong code or as co-manager; can't hide games for A;
B's live (Realtime) subscription gets nothing from A's table; with the real
invite B becomes a plain member who still can't manage anything; A can't hand the
table to B. Every "change" writes the value already there, and the test table is
deleted at the end, so even a hole would change nothing.

## 3. Secrets in the git history

All 50 commits on all branches searched for secret files and patterns
(Supabase secret/publishable keys, JWTs, `service_role`, Google API keys and
OAuth client secrets, GitHub tokens, private keys, database URLs with passwords,
`password=`): **nothing found ✅**.
- `.env.local` was never committed; `.env.example` holds placeholders only.
- The built site contains the publishable key only (that's by design).
- Every commit author is the GitHub noreply address.
- The project URL (`emkzkgpqaupqudzgewxa.supabase.co`) is public by design.
- Found and fixed: the owner's personal Gmail had been written into `CLAUDE.md`
  in commit `1dfad40` (docs). Removed from the file; it remains in that one
  commit's history. It's also shown on Google's consent screen as the support
  email, so rewriting history wouldn't hide it; left as is.

## 4. Libraries

- `npm audit`: 3 issues (2 critical, 1 moderate), all in **Vitest**, the test
  runner (`tinypool` prototype pollution → code execution; `@vitest/mocker` path
  traversal / code injection). Dev-only: never shipped to users
  (`npm audit --omit=dev`: 0).
- **Fixed ✅**: Vitest 3.2 → 4.1.12 (released 2026-10-15; 5.1.0 also fixes it but
  was only 8 days old, too fresh to trust), plus patch updates (supabase-js
  2.119.0, vite 6.4.6, tailwind 4.3.5). Now `npm audit`: **0 vulnerabilities**; 133
  unit tests and the build pass; `npm ci` (as in the deploy) installs cleanly.
- Note: npm 10's resolver crashes on this tree (`edgesOut`); the install was done
  with `--legacy-peer-deps`. The lockfile is complete (all peers are direct
  dependencies).

## 5. The app: names, invite codes, links

| Check | Result |
|---|---|
| HTML/script in names, table names, log | Safe ✅: React shows them as text; the share image draws them on a canvas. The only raw HTML is the QR code, generated from the invite link, not from names. |
| Hidden characters in names (invisible spaces, right-to-left overrides: "Tomer" that looks like the real Tomer, text that flips) | **Fixed** in the database: migration `20261110120000_clean_names.sql` strips them from profile names (including the name from Google), per-table names and table names; plus `20261110130000_clean_names_keep_blank_checks.sql` so a blank name is still rejected rather than replaced. Tests 430–441. Emoji joiners are kept. Applied ✅ |
| Guessable invite codes | Safe ✅: 32 random hex characters from `gen_random_uuid()` (~10^36), valid only together with the table id, and only until the game ends. |
| Tampered invite links | **Fixed**: a link whose table id or code isn't in the right format is rejected in the app before reaching the database (`isValidInvite`, unit-tested). The database checks the real code anyway. |
| Text injected through the sign-in error in the address bar (`?error_description=…`) | **Fixed**: the app shows only its own fixed message ("ההתחברות בוטלה" / "משהו השתבש, נסו שוב"), never the URL's text (unit-tested). |
| Open redirect after sign-in | Safe ✅: the return address is the app's own, and Supabase only accepts addresses on its allow-list. |
| `?table=<id>` of someone else's table | Safe ✅: the database returns nothing; the app shows "השולחן לא זמין". |

Known gaps (accepted for now, not holes):
- No "new invite link" button: a leaked link works until the game ends. The
  database already lets the manager change the code; a button can come later.
- A user may pick a display name identical to someone else's. Colors and the
  per-table name set by the manager tell them apart.
- Account deletion is by email request (privacy policy). A guest-less seat in
  someone else's table needs a name when the account is removed, so it's done by
  hand, carefully.

## 6. Settings to clean before going live ⏳

| Where | What |
|---|---|
| Supabase → Authentication → URL Configuration → **Site URL** | Must be `https://tomere1906.github.io/Poker-Nights-/` |
| Same page → **Redirect URLs** | Remove every `*.nip.io` address (phone testing on the home Wi-Fi). Keep `https://tomere1906.github.io/Poker-Nights-/**`. `http://localhost:5173/**` only while still developing (it can only be used from this computer). |
| Google Cloud → Clients → the OAuth client → **Authorized JavaScript origins** | Remove `localhost` / `nip.io` entries if any. |
| Same → **Authorized redirect URIs** | Only `https://emkzkgpqaupqudzgewxa.supabase.co/auth/v1/callback`. |
| Google Auth Platform → Audience → **Test users** | No longer used (app is in production); can be cleared. |
| Supabase → Authentication → Sign In / Providers | Only Google on (verified by the attack test). |
| Supabase → Database → Extensions → `pg_graphql` | Optional: the app doesn't use GraphQL; turning it off removes an unused door (it shows nothing anyway). |
| GitHub → repo Settings → Security | Turn on Dependabot alerts and secret scanning (free for public repos). |
| `.attack-tokens.json` | Delete after the attack test; sign out in both windows to end those sessions. |
| `vite.config.js` nip.io hosts | Dev server only; no effect on the live site. Nothing to do. |

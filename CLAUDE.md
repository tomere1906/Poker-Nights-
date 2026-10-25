# Poker Night App

A cute, mobile-first web app for running a home poker night: seat players at a table, track buy-ins, and at the end of the game calculate who pays whom, in whole shekels only.

The user plays on their phone at the table. Everything must be quick, simple, and work with one hand.

## Stack
- React + Vite + Tailwind
- Vitest for tests
- PWA (installable to home screen)
- State saved in localStorage so a refresh never loses the game

## Commands
- `npm install` – install dependencies
- `npm run dev` – run locally
- `npm test` – run the tests
- `npm run build` – production build
- `npx vite preview` – serve the build at `/Poker-Nights-/`, like GitHub Pages

## Branches (protect the live site)
- `main` is the live site: every push to it deploys to GitHub Pages. It must stay untouched.
- **Never push to `main` or merge into `main` unless the user explicitly says so in that moment.** No exceptions for "small" fixes.
- All new work happens on the `multiplayer` branch. Before committing, check `git branch --show-current`.
- The user tests changes locally with `npm run dev`; there is no preview deploy of the branch.
- Phone testing: Supabase Auth refuses to redirect to bare IPs, so the phone opens `http://<ip-with-dashes>.nip.io:5173` (e.g. `http://192-168-1-6.nip.io:5173`). `vite.config.js` allows only this machine's own nip.io names. Each such address must also be in Supabase → Authentication → URL Configuration → Redirect URLs.
- Tag `v1` marks the live version from before multiplayer work (a safe point to return to).

## Deployment
- GitHub Pages via `.github/workflows/deploy.yml`: every push to `main` runs the tests, builds, and deploys.
- The app lives at `/Poker-Nights-/` (Vite `base`). Keep manifest, icon and service-worker paths relative (or `%BASE_URL%` in `index.html`) so the PWA works under that path.
- Bump `CACHE` in `public/sw.js` when its caching logic changes.
- Commits use the GitHub noreply email, never the personal Gmail.

## Language & RTL (always)
- All UI text is in Hebrew: buttons, titles, warnings, empty states, copied WhatsApp text.
- `dir="rtl"` on the whole app. Layouts, icons and arrows must be mirrored correctly.
- Font: Rubik or Heebo (Google Fonts).
- Currency: number then ₪ (e.g. `150 ₪`).
- Player names may be typed in Hebrew and must display correctly.
- Code, comments, file names and commit messages stay in English.

## Features
1. **Start screen**: the app always opens here, with two clearly separate sections:
   - "🌐 שולחן אונליין עם חברים" (requires Google sign-in): back to the latest open online table, or open a new one.
   - "📱 שולחן מקומי (בלי התחברות)": the phone-only table, exactly as before (stored in localStorage).
   Tapping the logo in a table returns here.
   - Online tables reuse the same table UI (`TableScreen`) as the local one; `src/lib/onlineTable.js` loads a table into the local state shape (`toView`) and writes changes to Supabase. Managers/co-managers get the edit controls; players see the table read-only (and in "כל אחד את שלו" mode can add buy-ins to their own seat). Header buttons: 📜 log and ⚙️ table management (buy-in mode, co-managers, delete table).
2. **Table settings**: the table manager sets the initial buy-in and 2–4 quick re-buy amounts ("סכום אחר" is always available too). Stored per table in the game state and as the defaults for the next table (`poker-nights-settings` in localStorage). Adding a player preselects the initial buy-in; re-buy buttons use the chosen amounts.
3. **Table view**: oval green felt table with a wood rim, up to 9 players. Before "המשחק התחיל": 9 fixed seats, each empty one with a "+" that seats a player there; "הוסף שחקן" fills the next free seat. After it starts: empty seats disappear, players spread evenly; latecomers are placed via "+" slots between players. Drag a player onto another seat to move/swap. Tap a player for re-buys, undo, remove, and the buy-in history (amount + time of each buy-in).
4. **List view** (not built yet): toggle from the table view. Each player's name, number of buy-ins and total in, with the pot at the bottom.
5. **End game**: enter each player's result as profit/loss (+/−, default) or final chips. One-tap "מאוזן" and "הפסיד הכל". Each card shows how much the player put in. If the totals don't balance, warn and allow continuing.
6. **Settlement**: list of `X → Y: amount ₪`, "copy to WhatsApp", and "new game" (back to the start screen).

## Settlement algorithm rules (do not break these)
- All amounts are whole shekels. Never show 2.5 or any fraction.
- Round each player's net to a whole number. If totals don't balance after rounding (or because of a counting mistake), absorb the difference into the biggest winner so everything balances exactly.
- Minimize the number of transfers.
- No transfer under 20 ₪. If matching leaves a small leftover, re-arrange which loser pays which winner until every transfer is ≥ 20 ₪. Only fall back to a small transfer if there is truly no other option.
- The algorithm lives in its own file (`src/lib/settlement.js`), separate from the UI, as a pure function.
- Run `npm test` after any change to the algorithm.

### Reference test case
Input: Ido +130, Or −500, Fouad −65, Ben −70, Shaked +152.5, Asaf −175, As +200, Yuri +325

Expected: whole-number transfers only, none under 20 ₪, totals balance. One valid answer:
- Or → Yuri 325
- Or → As 135
- Or → Ido 40
- Asaf → Shaked 155
- Asaf → Ido 20
- Ben → Ido 70
- Fouad → As 65

Tests should assert these properties (integers, all transfers ≥ 20 ₪, each player's net is fully settled, transfer count is minimal), not this exact list — other valid answers exist.

## Design
Cute and playful: soft shadows, rounded corners, chip and card icons, confetti on "End game". Dark mode by default. Large tap targets for phone use.

## Roadmap (multiplayer branch)
Build in steps and stop for the user's confirmation after each step.
1. **Table settings, no backend** (done): start screen, table setup, settings used throughout the game.
2. **Supabase + Google login + shared tables + stats** (in progress), in steps:
   1. Connect: client in `src/lib/supabase.js`, env vars (done).
   2. Schema, grants, RLS as migrations + SQL tests that try to break the rules (done, 55 tests, Advisor clean).
   3. Google sign-in (done: desktop and the iPhone home-screen app).
   4. **Display names + colors**: pick a name (prefilled with the Google first name) and a color on first login; profile screen to change both; per-table nickname and color override set by the manager; guests get a manager-chosen color. Migration + RLS + tests.
   - **Decided before step 5:** co-managers + a per-table buy-in mode + a change log (see Roles). Built in step 5's first migration.
   5. Create a table online + manager controls: settings (incl. buy-in mode), seating flow, buy-ins/undo, co-managers, change log view, all in Supabase (done).
   6. **Invites** (in progress): "הזמן חברים" (Web Share, wa.me fallback, QR); opening the link → sign-in → auto-join → **the player picks their own free seat**. The manager can still move anyone and seat guests. Tested with Google Cloud test users until step 10.
      - RLS + tests: a member may insert only their own seat (`user_id = auth.uid()`), only once per table, only in a free seat, only before the game ends, with no nickname/color override and no results. They can't move others or themselves afterwards (only managers move). Seats are unique per table (`unique (table_id, seat)`, deferrable; managers swap two players atomically via `public.swap_seats`, a SECURITY INVOKER function so RLS still applies).
      - Also: palette grows to 12 colors (indexes 0-11); new players get a color not yet taken at the table.
   7. Live table for players: Realtime, read-only.
   8. End game online: results entry (+/−, מאוזן, הפסיד הכל), whole-shekel settlement, close the table, store `final_net`.
   9. Personal stats + "החבר'ה שלי" (numbers only from games the viewer attended).
   10. **Google branding + publishing**, right before inviting all friends: simple Hebrew privacy policy and terms pages on the site; guide the user through Google Auth Platform → Branding (name, support email, home page, privacy/terms links, authorized domain) and publishing the app (basic scopes only: openid, email, profile), so the consent screen looks trustworthy and friends can sign in.
       - **No logo for now**: uploading one triggers Google's manual brand verification (days to weeks). Add it later only if needed.
       - The pages must be reachable at public URLs, i.e. on the live site (`main`). Pushing them to `main` needs the user's explicit OK at that moment.
       - The consent screen will still name `emkzkgpqaupqudzgewxa.supabase.co` unless a Supabase custom domain (paid) is used.
   11. Final security pass: Advisor, all SQL tests, docs; merging to `main` only when the user says so.
3. **Share as image** (after the Supabase work): replace "העתק לוואטסאפ" with "שתף כתמונה": render the settlement card to PNG and open the share sheet (iPhone).

## Names & colors (rules)
- Colors follow the same logic as names: `profiles.color` is the user's own pick (a palette of 12 clear, distinct colors, stored as an index 0-11; append only, never reorder). The manager may override it per table (`table_players.color`, null = use the profile color); guests always get a manager-chosen color. Users change only their own profile color; only the table's manager writes per-table colors.
- The page background/theme color is `#0b1120` on every screen. Never let a colored element sit flush against the bottom edge of the viewport (iOS Safari tints its toolbar from it), and remove full-screen overlays (confetti) when they finish.

### Names
- `profiles.display_name` is the name everyone sees: tables, "החבר'ה שלי", stats. **Never show an email address to other users**; emails live only in `auth.users`.
- A user may change only their own `display_name` (column-level grant + RLS). Google data sets it only on first sign-in; later sign-ins update the avatar only, never a chosen name.
- Per-table name: `table_players.nickname`, written only by that table's manager or co-managers. Shown name = nickname, else the profile's display name. Guests: nickname is their name.
- Everything links by `user_id` (never by name), so renames never break history or stats. "החבר'ה שלי" groups by `user_id` and shows the profile name.

## Supabase setup
- Project ref `emkzkgpqaupqudzgewxa` (Frankfurt). App URL `https://emkzkgpqaupqudzgewxa.supabase.co`.
- Only the public **publishable** key is used (`VITE_SUPABASE_PUBLISHABLE_KEY`). **Never** use or ask for the service_role/secret key or the DB password.
- Local dev: `.env.local` (git-ignored; see `.env.example`). CI: GitHub Actions variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, passed to `npm run build` in `deploy.yml`. Never hard-code them.
- Migrations live in `supabase/migrations/`. The user applies each file by pasting it into the dashboard SQL Editor and sends back the output; hand over one file at a time with clear instructions.
- The project has "automatically expose new tables" **off** and automatic RLS **on**: every table needs explicit `grant`s to the Data API roles **and** RLS policies.

## Database (supabase/migrations)
| Table | Holds | Read | Write |
|---|---|---|---|
| `profiles` | display name, color (0-11), avatar, `name_confirmed_at` (email stays only in `auth.users`) | self + people who share a table | the user: only own `display_name`, `color`, `name_confirmed_at` (column grant); trigger: created on first sign-in, later only the avatar |
| `poker_tables` | manager, invite code, status (seating/playing/ended), settings, `buy_in_mode` (`managers` / `self_add`), end mode | manager + members | insert: any signed-in user as manager; update: manager + co-managers (trigger `guard_table_update`: only the manager ends/reopens, changes `buy_in_mode` or the invite code; nobody changes `manager_id`); delete: manager |
| `table_members` | users who joined via invite; `is_co_manager` | people in the table | insert: yourself, as a plain member, with a valid invite code of a not-ended table; update (`is_co_manager` only): manager; delete: manager, or co-managers for plain members |
| `table_players` | seats: `user_id` (account) or null (guest, linkable later), per-table `nickname`/`color` (null = profile values; required for guests), results | people in the table | manager + co-managers; may seat only guests or members |
| `buy_ins` | amount, time, `created_by` (pinned to the writer); FK `(player_id, table_id)` keeps it on the same table | people in the table | manager + co-managers; in `self_add` mode a player may also **insert** for their own seat while the game isn't ended (never update/delete) |
| `table_log` | who did what and when (`actor_id`, `action`, `details` jsonb) | people in the table | **nobody** directly; only triggers (`private.log_*`) write it |

## Roles & security rules (never weaken)
- **Manager** (`poker_tables.manager_id`): everything in their table. Also plays. **Only the manager** appoints/removes co-managers, ends (or reopens) the game, changes the buy-in mode, changes the invite code and deletes the table.
- **Co-manager** (`table_members.is_co_manager`, set only by the manager): everything else the manager does in that table: buy-ins (add/change/delete), seating, per-table names/colors, results, starting the game, amounts.
- **Buy-in mode** (table setting, chosen when opening, changeable by the manager): `managers` "רק מנהלים" (default): only manager + co-managers write. `self_add` "כל אחד את שלו": additionally each player may **add** buy-ins for **their own seat only**; no changes, no deletes, nothing for others. Corrections stay with the managers.
- **Change log** (`table_log`): every add/change/remove of buy-ins, seats, names/colors, results, members, co-managers, game start/end and settings, with who and when. Visible to everyone at the table, written only by triggers, so it can't be forged, edited or deleted.
- **Member/player**: otherwise passive. Reads the live table (seats, buy-ins, pot), the log and their own stats. Other writes: own buy-ins in `self_add` mode, and (from step 6) taking their own free seat once after joining.
- **Stranger**: sees nothing. **anon**: has no grants at all.
- **Stats** come only from rows the viewer can read, i.e. tables they were part of. Never compute stats with elevated privileges.
- Policy helpers are `SECURITY DEFINER` with `search_path = ''` in the `private` schema (not exposed by the API). Never put SECURITY DEFINER functions in `public`.
- Every new table: enable RLS, add policies, add explicit grants (never to `anon` unless truly public), index foreign keys, and extend `supabase/tests/rls_test.sql`.
- `supabase/tests/rls_test.sql` must pass (124+ cases) after every schema change. It runs as one DO block and rolls itself back by raising at the end; the error text is the report.

Design rules so phase 1 code carries over:
- The game state is one **table**: `settings`, `players`, `started`, `finals`, `endMode`. Later this maps onto Supabase rows: `tables` (settings, status, manager), `table_players` (seat, optional user id, guest name), `buy_ins` (amount, time, status: pending/approved), `results`.
- Keep all game rules in pure functions in `src/lib/` (reducer, settlement). The UI dispatches actions; a backend will later persist the same actions, not replace the logic.
- Buy-ins are already stored with their time; add a status (approved/pending) when shared tables arrive.
- Until phase 2 is requested: no backend, no accounts, no new libraries.

## How to work on this project
- Build in small steps and show each one working before moving on: table view and players → list view → end game and settlement.
- Prefer simple solutions. Don't add a backend, accounts, or extra libraries unless asked (see Roadmap).
- Keep components small and in `src/components/`.

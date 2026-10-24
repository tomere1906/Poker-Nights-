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
1. **Start screen**: the app always opens here. "פתח שולחן" when no table is open; "חזרה לשולחן" (with player count and pot) plus "פתח שולחן חדש" (tap twice, discards the current table) when one is. Tapping the logo in the game returns here.
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
   2. Schema, grants, RLS as migrations + SQL tests that try to break the rules.
   3. Google sign-in (also from the iPhone home-screen app).
   4. Shared live tables: manager-only writes, guests by name, Realtime for players.
   5. Invites: "הזמן חברים" (Web Share, wa.me fallback, QR), auto-join after sign-in.
   6. Personal stats + "החבר'ה שלי" (numbers only from games the viewer attended).
   7. Security Advisor check, docs.
3. **Share as image** (after the Supabase work): replace "העתק לוואטסאפ" with "שתף כתמונה": render the settlement card to PNG and open the share sheet (iPhone).

## Supabase setup
- Project ref `emkzkgpqaupqudzgewxa` (Frankfurt). App URL `https://emkzkgpqaupqudzgewxa.supabase.co`.
- Only the public **publishable** key is used (`VITE_SUPABASE_PUBLISHABLE_KEY`). **Never** use or ask for the service_role/secret key or the DB password.
- Local dev: `.env.local` (git-ignored; see `.env.example`). CI: GitHub Actions variables `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY`, passed to `npm run build` in `deploy.yml`. Never hard-code them.
- Migrations live in `supabase/migrations/`. The user applies each file by pasting it into the dashboard SQL Editor and sends back the output; hand over one file at a time with clear instructions.
- The project has "automatically expose new tables" **off** and automatic RLS **on**: every table needs explicit `grant`s to the Data API roles **and** RLS policies.

## Database (supabase/migrations)
| Table | Holds | Read | Write |
|---|---|---|---|
| `profiles` | display name + avatar from Google (email stays only in `auth.users`) | self + people who share a table | trigger only (`private.sync_profile` on `auth.users`) |
| `poker_tables` | manager, invite code, status (seating/playing/ended), settings, end mode | manager + members | insert: any signed-in user as manager; update/delete: manager |
| `table_members` | users who joined via invite (read-only viewers) | people in the table | insert: yourself, with a valid invite code of a not-ended table; delete: manager |
| `table_players` | seats: `user_id` (account) or null (guest by name, linkable later), results | people in the table | manager only; may seat only guests or members |
| `buy_ins` | amount + time; FK `(player_id, table_id)` keeps it on the same table | people in the table | manager only |

## Roles & security rules (never weaken)
- **Manager** (`poker_tables.manager_id`): the only writer of game data (players, buy-ins, results, settings, ending). Also plays.
- **Member/player**: fully passive. Reads the live table (seats, buy-ins, pot) and their own stats. No requests, no writes.
- **Stranger**: sees nothing. **anon**: has no grants at all.
- **Stats** come only from rows the viewer can read, i.e. tables they were part of. Never compute stats with elevated privileges.
- Policy helpers are `SECURITY DEFINER` with `search_path = ''` in the `private` schema (not exposed by the API). Never put SECURITY DEFINER functions in `public`.
- Every new table: enable RLS, add policies, add explicit grants (never to `anon` unless truly public), index foreign keys, and extend `supabase/tests/rls_test.sql`.
- `supabase/tests/rls_test.sql` must pass (55+ cases) after every schema change. It runs as one DO block and rolls itself back by raising at the end; the error text is the report.

Design rules so phase 1 code carries over:
- The game state is one **table**: `settings`, `players`, `started`, `finals`, `endMode`. Later this maps onto Supabase rows: `tables` (settings, status, manager), `table_players` (seat, optional user id, guest name), `buy_ins` (amount, time, status: pending/approved), `results`.
- Keep all game rules in pure functions in `src/lib/` (reducer, settlement). The UI dispatches actions; a backend will later persist the same actions, not replace the logic.
- Buy-ins are already stored with their time; add a status (approved/pending) when shared tables arrive.
- Until phase 2 is requested: no backend, no accounts, no new libraries.

## How to work on this project
- Build in small steps and show each one working before moving on: table view and players → list view → end game and settlement.
- Prefer simple solutions. Don't add a backend, accounts, or extra libraries unless asked (see Roadmap).
- Keep components small and in `src/components/`.

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
Build one phase at a time, and only when the user asks for it.
1. **Table settings, no backend** (done): start screen, table setup, settings used throughout the game.
2. **Accounts with Supabase**: sign-in, a user profile (display name). Players can still be added as guests without an account.
3. **Shared tables**: the manager creates a table and invites players with a link/code. Everyone sees the same table live. Players *request* buy-ins from their phone; the manager approves or rejects them. Only the manager edits settings, seats and final results.
4. **Personal statistics**: per-user history across tables: games played, total profit/loss, biggest win, buy-ins per night.

Design rules so phase 1 code carries over:
- The game state is one **table**: `settings`, `players`, `started`, `finals`, `endMode`. Later this maps onto Supabase rows: `tables` (settings, status, manager), `table_players` (seat, optional user id, guest name), `buy_ins` (amount, time, status: pending/approved), `results`.
- Keep all game rules in pure functions in `src/lib/` (reducer, settlement). The UI dispatches actions; a backend will later persist the same actions, not replace the logic.
- Buy-ins are already stored with their time; add a status (approved/pending) when shared tables arrive.
- Until phase 2 is requested: no backend, no accounts, no new libraries.

## How to work on this project
- Build in small steps and show each one working before moving on: table view and players → list view → end game and settlement.
- Prefer simple solutions. Don't add a backend, accounts, or extra libraries unless asked (see Roadmap).
- Keep components small and in `src/components/`.

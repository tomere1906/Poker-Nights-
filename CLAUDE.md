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
1. **Table view (main screen)**: oval green felt table with a wood rim, up to 9 players. No empty seats: players are always spread evenly so the table looks full. A side "+" button adds a player: tap it, then tap one of the "+" slots between two players to choose where they sit, then enter name + initial buy-in. Drag a player onto another to swap seats. Each seat shows avatar with initials, name and total buy-in. Tap a player to add a re-buy (+50, +100, +200, custom) or remove them.
2. **List view**: toggle from the table view. Shows each player's name, number of buy-ins, and total amount in, with the total pot at the bottom.
3. **End game**: enter how much each player leaves with (final chips). The app computes net = final − total buy-in. The user never calculates anything. If the sum of finals ≠ total buy-ins, show the difference as a warning and allow continuing.
4. **Settlement**: list of `X → Y: amount ₪`, a "copy to WhatsApp" button, and a "new game" button.

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

## How to work on this project
- Build in small steps and show each one working before moving on: table view and players → list view → end game and settlement.
- Prefer simple solutions. Don't add a backend, accounts, or extra libraries unless asked.
- Keep components small and in `src/components/`.

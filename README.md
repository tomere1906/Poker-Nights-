# Poker Nights 🃏

**Run a home poker night from your phone, and settle up in seconds.**
*הקלפים עליכם, החשבון עלינו* ("the cards are on you, the math is on us")

**Live app:** https://tomere1906.github.io/Poker-Nights-/ (Hebrew, mobile first, installable to the home screen)

<p align="center">
  <img src="docs/images/demo.gif" width="300" alt="A buy-in arrives live from a friend's phone, the game ends, and the app shows who pays whom">
</p>

<p align="center"><sub>All screenshots use made-up demo players.</sub></p>

## The problem

It's 3 a.m., the game is over, and someone opens the calculator. Who bought in how many times? Who left early with chips? Someone already paid 200 in cash, so what do they still owe? Amounts like 152.5 don't split nicely, and nobody wants to make eight separate bank transfers. Settling up takes longer than the last hand and usually ends with "I'll trust you".

Poker Nights keeps track of the money during the night and does the math at the end: who pays whom, in round amounts, with as few transfers as possible.

## Features

<table>
  <tr>
    <td align="center"><img src="docs/images/02-table.png" width="230"><br><sub>The live table</sub></td>
    <td align="center"><img src="docs/images/06-settle.png" width="230"><br><sub>Who pays whom</sub></td>
    <td align="center"><img src="docs/images/08-stats.png" width="230"><br><sub>Personal stats</sub></td>
  </tr>
  <tr>
    <td align="center"><img src="docs/images/03-invite.png" width="230"><br><sub>Invite by WhatsApp or QR</sub></td>
    <td align="center"><img src="docs/images/05-endgame.png" width="230"><br><sub>End of the night</sub></td>
    <td align="center"><img src="docs/images/07-share-image.png" width="230"><br><sub>Shared as an image</sub></td>
  </tr>
</table>

- **Online tables with live updates.** Everyone sees the same table on their own phone; a buy-in added by the manager appears on all phones within a second.
- **Invites by WhatsApp or QR.** One link: the friend signs in with Google, joins, and picks a free seat.
- **Roles.** The manager runs the table and can appoint co-managers (buy-ins, seating, results). Players see everything and, if the manager allows it, add buy-ins for themselves only. Every change is written to a log that nobody can edit.
- **Leaving mid-game.** A player who leaves keeps their seat with how they left ("lost it all", "even", or an amount).
- **Cash payments.** Losers often pay part in cash on the spot. Each bill is recorded as a whole unit, never more than the player's loss, and the settlement only transfers what's still owed.
- **Absent players.** Cash is handed only to people who are still there; a winner who left early gets a bank transfer instead.
- **Rounding** to 1 / 5 / 10 / 50 ₪, so nobody transfers 37 ₪.
- **Chip value.** If a chip is worth 0.5 ₪, enter chip counts and the app converts them; buy-ins stay in shekels.
- **Settlement in round amounts with few transfers**, cash included, shared as an image straight to the WhatsApp group.
- **After the game: "paid ✓" and Bit.** Each transfer can be marked as paid by the payer, the receiver or a manager, live for everyone. If the receiver saved a phone number, the payer gets a button that copies it and opens Bit. The number is shown only to people who have to transfer money to that person, enforced in the database.
- **Personal stats.** Games, total, best and worst night, a chart, streaks, and "my crew": your results against everyone you've played with. Only you see your stats.
- **Local mode without sign-in.** The whole game on one phone, stored only on that phone.
- **Hebrew, right to left**, dark theme, big buttons for one-handed use at the table, works offline.

## How the settlement works

1. **Each player's result** = what they left with − what they put in.
2. **Rounding.** Every result is rounded to the table's unit (say 10 ₪). If the rounded results don't add up to exactly zero, the difference goes to the biggest winner, so the books always balance.
3. **Cash first.** Each cash bill goes *whole* to one winner who is still owed at least that much and is still at the table. A 200 note is never split in half; two 50s can go to two different people.
4. **Fewest transfers.** For what's left, the app searches for the plan with the fewest bank transfers. For up to 9 players it tries the possible pairings rather than taking a greedy shortcut, and it avoids tiny transfers under 20 ₪ unless there's truly no other way.
5. **One line per pair.** "Noa → Daniel 180 ₪ (100 cash · 80 transfer)": cash and transfer between the same two people are shown as one row.

The algorithm is a pure function in [`src/lib/settlement.js`](src/lib/settlement.js), covered by unit tests (including a real night's numbers and randomized games).

## Security

The app talks to the database directly from the browser with a *public* key, so the app itself can't be the wall. Every rule is enforced **inside the database** (PostgreSQL row-level security, triggers and column-level grants): who can see a table, who can add a buy-in, who can close the game, that results add up to zero, and that an ended game is locked.

- **451 database security tests** ([`supabase/tests/rls_test.sql`](supabase/tests/rls_test.sql)) try to break every rule as manager, co-manager, player, stranger and signed-out visitor.
- **58 outside attack checks** ([`supabase/tests/attack_test.mjs`](supabase/tests/attack_test.mjs)) hit the real database directly, bypassing the app, with only the public key: without an account, and with two real accounts trying to read, change, take over or listen in on each other's tables. All blocked.
- Emails are never shown to other users; stats are visible only to their owner; names are cleaned of hidden direction-control characters; sign-in is Google only.
- No secrets in the code or its git history; dependencies audited.

Full report: [SECURITY.md](SECURITY.md).

## How it was built

I'm not a programmer. I built Poker Nights with [Claude Code](https://claude.com/claude-code), Anthropic's AI coding agent. Claude Code wrote the code, the tests and the database migrations. My part was the product: deciding what it should do and how it should feel, setting the rules (how cash is split, what rounding means, who may do what), reviewing every step on my phone, and testing it with friends at real poker nights. Several features, like cash bills, absent players and chip value, came straight from problems we hit at the table.

## Tech stack

- **Frontend:** React 18, Vite, Tailwind CSS, a small service worker (PWA, offline)
- **Backend:** Supabase: PostgreSQL with row-level security, Google sign-in, Realtime for live updates
- **Tests:** Vitest (game logic, settlement, stats), SQL security tests, an outside attack script
- **Hosting:** GitHub Pages, deployed by GitHub Actions on every push to `main` (tests must pass first)

## Run locally

```bash
npm install
cp .env.example .env.local   # add your Supabase project URL and publishable key
npm run dev                  # http://localhost:5173
npm test                     # unit tests
npm run build                # production build
```

Without a Supabase project the app still runs, in local mode only.

To set up your own database: run the files in [`supabase/migrations/`](supabase/migrations/) in order in the Supabase SQL editor, then [`supabase/tests/rls_test.sql`](supabase/tests/rls_test.sql). It should end with "ALL 451 TESTS PASSED". Enable Google as the only sign-in provider.

## Roadmap

- A list view of the table (names, buy-ins, totals) next to the oval table
- Import your personal game history from another app or a CSV file (your own stats only)
- A "new invite link" button, so a leaked link can be cancelled mid-game
- Self-service account deletion (today it's done on request)

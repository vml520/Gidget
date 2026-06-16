# Gidget

A sunny, daily spending tracker that always shows your cash on hand. Runs entirely in
your browser — no build step, no accounts, no server — and you can back it up or export
it whenever you like.

**Cash on hand is the truth.** Each week: starting balance + income − bills − spending
− money set aside = cash on hand, carried into the next week. Money you set aside for a
goal leaves your spendable balance immediately and builds that goal's reserve.

## Files

| File | Purpose |
|------|---------|
| `index.html` | The interface — page shell, styles, fonts |
| `gidget.js` | All the logic: weekly math, goals, save, and export |
| `LICENSE` | MIT |

`gidget.js` is a plain script, so the app still works by double-clicking `index.html`
locally — no server required.

## How it works

- **Spending is the main section.** Log purchases as they happen; each entry is stamped
  with the day you added it and sorted by day, so you can see your week unfold.
- **Real calendar weeks.** The header shows the week's date range (e.g. *Jun 15 – 21*),
  not a generic number.
- **Recurring vs. one-off.** When you add income or a bill, you can mark it **recurring**.
  Recurring items carry into each new week; one-off items don't. Spending is never
  recurring.
- **Each new week starts clean.** A new week is blank except for: your carried cash on
  hand, your goals, and your recurring items. You just log the week's spending.
- **Automatic weekly roll-over.** If you use Gidget regularly, opening it at the start of a
  new week creates that week for you automatically.
- **Missed a week? Start fresh.** If a week (or more) goes by unopened, Gidget won't carry
  a stale balance — it shows a *Start fresh* prompt (also in the menu) so you can re-anchor
  to today and set your real current balance.
- **Savings goals** with a target and optional deadline, a progress bar, and an
  on-track / short-by projection. **Set-aside** contributions build a goal's reserve and
  lower cash on hand; recording a spend from a goal draws its reserve down without touching
  cash on hand.

## Save & export

Open **Save & export** from the Budget tab.

- **Save backup (.json)** / **Restore from backup** — keep a copy or move Gidget between
  devices. (Data also auto-saves to the browser as you go.)
- **Export CSV** — a flat ledger (Week of, Section, Item, Date, Amount).
- **Export Excel (.xlsx)** — a real, multi-sheet workbook (Ledger, Weekly Summary, Goals),
  written without any library.
- **Numbers and Google Sheets** open the CSV or Excel file directly — double-click in
  Numbers, or use *File → Import* in Google Sheets. A native Apple `.numbers` file can't be
  generated from a web page, and pushing straight into a Google Sheet needs account
  sign-in, so the export route covers both cleanly.

## Host it on GitHub Pages

1. Put `index.html` and `gidget.js` in the repository root.
2. **Settings → Pages → Source: Deploy from a branch**, choose your branch and `/ (root)`.
3. Gidget goes live at `https://<username>.github.io/<repo>/` within a minute or two.

## Design

Warm and retro-sunny: a blush background, a rose header with a soft sun-glow, bright
pastel section colors, a Pacifico script wordmark, and rounded Nunito type. The display
fonts load from Google Fonts; if they're unavailable the app still works and falls back to
the system font.

## Data and privacy

Everything is stored locally in your browser. Nothing is collected, transmitted, or
shared. Exports are generated on your device.

## License

MIT — see [LICENSE](LICENSE). Replace `[Your Name]` in that file with your name before
publishing.

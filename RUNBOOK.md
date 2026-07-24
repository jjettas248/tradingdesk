# RUNBOOK — Apex Morning Trading Desk

This is the operating manual a **scheduled Claude Code session** (a "Routine") reads
and follows to run the desk. It is also a fine manual checklist for a human.

The desk runs on **Eastern Time**. It is **decision-support only** — it never
places, modifies, or cancels a broker order. You execute manually in IBKR Mobile.

---

## The two processes

The system is operated by two independent processes that share one database:

1. **Persistent web deployment** (Next.js) — always-on. Hosts:
   - `POST /api/telegram/webhook` — receives your button taps and `/fill` `/exit`.
   - `POST /api/cron/poll` — the continuous fast loop (see below).
   - the read-only dashboard (`/`, `/journal`, `/scores`, `/playbook`).
2. **Ephemeral Routine sessions** (this runbook) — spun up on a schedule to run
   the heavier, LLM-inclusive pipeline via the CLI, then exit.

Plus a **real cron** (host cron / Vercel Cron / an external ping service) hitting
`/api/cron/poll` every few minutes during market hours. That loop is deterministic
and **never calls the LLM** — it ingests news/flow, watches open positions, and
*flags* candidates for the next pipeline pass.

---

## Prerequisites (every session)

- Env vars set (see `.env.example`). At minimum `DATABASE_URL`. Without
  `ANTHROPIC_API_KEY` the desk runs on a deterministic **stub LLM**; without
  `TELEGRAM_BOT_TOKEN` it runs in **dry-run** (messages logged, not sent).
- From the repo root:
  ```
  git pull
  npm ci
  npx prisma migrate deploy   # idempotent
  ```

---

## Hourly sequence (weekdays, market hours ~09:30–16:00 ET)

`create_trigger`'s minimum interval is hourly, so this is as close to continuous
as a Routine gets. Run, in order:

```
git pull
npm ci
npx prisma migrate deploy
npm run desk -- status            # ABORT if it reports a RISK HALT (exit code 1)
npm run desk -- expire-tickets
npm run desk -- morning-scan      # add --scenario <name> only for demos/tests
npm run desk -- send-tickets
npm run desk -- status
```

- `morning-scan` runs the full 6-stage pipeline (Scanner → Catalyst/Flow → Quant →
  Trade Architect → Risk Manager → Chief Trader), persists every candidate with its
  full evidence trail, creates a ticket per armed candidate, and **generates the
  immutable "why this trade" explanation before the ticket is ever sent**.
- The first firing of the day does a full scan; later firings also pick up any
  `FLAGGED` candidates the fast loop surfaced.
- `send-tickets` pushes armed tickets to Telegram (or logs them in dry-run).

## Evening sequence (weekdays ~18:00 ET)

```
git pull
npm ci
npx prisma migrate deploy
npm run desk -- run-reviews
```

`run-reviews` generates the delayed post-trade review for every fully-closed
position that doesn't have one, updates both score tracks, and delivers the review.

---

## Ad-hoc / operator commands

```
npm run desk -- status                       # read-only orientation + halt check
npm run desk -- update-equity <value> [note] # record account equity (drives drawdown throttle)
npm run desk -- resolve-halt <note>          # clear a risk halt after investigating (human only)
npm run desk -- log-exit <id> <price> [reason] [portion%]  # CLI exit (supports partials/runners)
npm run desk -- poll                         # run one fast-loop cycle by hand
```

---

## DO NOT

- **Never hand-write, edit, or regenerate** an explanation or review. Explanation
  prose is generated exactly once, before send, by `morning-scan`; review prose by
  `run-reviews`. Both are insert-only and content-hashed. Fabricating one after the
  fact defeats the entire point of the desk.
- **Never exceed the daily caps** (`MAX_DAILY_TICKETS`, `MAX_DAILY_ENTRIES`) by
  calling internal pipeline functions directly to route around Chief Trader / the
  webhook guard.
- **Never attempt to place a broker order.** There is no broker integration in this
  repo — no code path exists, and none should be added here.
- **Never re-run `morning-scan` for a day that's already scanned** without an
  understood `--force` (it clears only *un-decided* candidates for that day).
- **The fast loop (`poll` / `/api/cron/poll`) must never call the LLM or send a
  ticket.** Only the hourly `morning-scan`/`send-tickets` pass does either.
- **A risk halt requires a human `resolve-halt`.** Never auto-resolve it from a
  Routine session. If `status` shows a halt, stop — do not scan.

---

## Operational notes

- **DST**: `create_trigger` cron is UTC-only with no DST awareness. Nudge the
  morning/evening/poll schedules by one hour around the March/November US
  transitions.
- **Cron frequency**: true 1–5 minute polling depends on the host's cron tier
  (Vercel Hobby is daily-only; per-minute needs Pro or an external pinger). The
  route and schema are identical regardless of what triggers them.
- **Provider swap**: v1 uses a deterministic mock provider. A real feed (e.g.
  Alpaca) is a drop-in behind the `MarketDataProvider` interface — set
  `MARKET_DATA_PROVIDER` and implement the provider; nothing else changes.

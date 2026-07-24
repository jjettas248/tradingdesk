# Apex Morning Trading Desk

An AI-augmented, **decision-support** trading desk for a solo trader with a day job.
It watches a narrow, liquid universe all day, proposes a small number of
high-quality trade setups, sends a terse mobile ticket you can act on in ~15
seconds, and then **teaches you why the trade qualified — with an explanation that
is generated and cryptographically timestamped _before_ the alert is sent, and
revealed only _after_ you've made your own decision.** That ordering is the whole
point: the AI can never construct a hindsight-biased rationale.

This system **never places broker orders and never touches real money.** You
execute manually in IBKR Mobile; the desk is informational leverage + journaling +
deliberate skill-building.

## Design principle: the LLM never decides

Every gate in the pipeline — setup qualification, catalyst freshness, position
sizing, correlation, portfolio heat, drawdown throttling, ranking — is
**deterministic, auditable TypeScript** evaluating explicit thresholds. The LLM is
used for exactly two things that genuinely need language understanding, and neither
one *decides* anything:

1. **Catalyst materiality** — is a news item significant? It returns a *scored*
   judgment (`{isMaterial, confidence, reasoning}`); a deterministic threshold on
   `confidence` is the actual gate.
2. **Prose** — the "why this trade" explanation and the post-trade review, composed
   _from_ the structured evidence the deterministic pipeline already produced (never
   from price outcomes, for the pre-trade explanation).

There is one materiality call per candidate and one prose call per ticket — no panel
of agents voting, so there's no false consensus to manufacture.

## The two authorized setups

1. **Catalyst Continuation Pullback** (liquid equities) — fresh material catalyst,
   significant gap, abnormal relative volume, sector confirmation, anchored-VWAP
   reclaim, controlled first pullback, favorable reward/risk. Entry on the pullback,
   not the initial move.
2. **Index Trend Pullback** (MES/MNQ micro futures) — higher-timeframe context,
   supportive breadth, related-market confirmation, VWAP pullback, no imminent major
   economic release.

Everything else is research only.

## Pipeline

`Scanner → Catalyst/Flow → Quant → Trade Architect → Risk Manager → Chief Trader`

Risk Manager sizes with correlation-adjusted, shrunk **fractional Kelly** (quarter-
Kelly start, 2% hard cap), a portfolio-heat cap, and a drawdown throttle
(−5% → ×0.75, −10% → ×0.50, −15% → **halt**, human-resolved). Chief Trader ranks
deterministically and caps the day at 2–3 tickets.

## Continuous monitoring

A real cron hits `/api/cron/poll` every few minutes. Deterministic, **zero LLM**:
it ingests news/flow incrementally, watches every open position against its
stop/targets (immediate exception alerts), and *flags* qualifying symbols for the
next hourly pipeline pass. The hourly, LLM-inclusive pass is a scheduled Claude Code
session following [`RUNBOOK.md`](./RUNBOOK.md).

## Stack

Next.js (App Router) + TypeScript · Prisma + **PostgreSQL** (Railway in prod) ·
Anthropic SDK (structured output) · Telegram bot (mobile tickets + buttons) ·
Vitest.

## Quick start

```bash
npm install
cp .env.example .env            # set DATABASE_URL to your Postgres (Railway or local)
npx prisma migrate dev          # applies the migration + seeds
npm test                        # unit + integration tests

# Run the desk end-to-end in dry-run (stub LLM, logged Telegram):
npm run desk -- morning-scan --scenario goldenSetup1
npm run desk -- send-tickets     # logs a ticket with inline-button labels
npm run desk -- status

# Dashboard:
npm run dev                      # http://localhost:3000
```

With no `ANTHROPIC_API_KEY` the desk uses a deterministic **stub LLM**; with no
`TELEGRAM_BOT_TOKEN` it runs in **dry-run** (messages logged). Set both (plus your
Railway `DATABASE_URL`, `CRON_SECRET`, `TELEGRAM_WEBHOOK_SECRET`, and dashboard
basic auth) to go live. On Railway, use `npm run start:prod` as the start command —
it runs `prisma migrate deploy` before booting. **Never put secrets in source or
chat** — use Railway's env config.

## CLI

`morning-scan` · `send-tickets` · `expire-tickets` · `status` · `run-reviews` ·
`update-equity` · `resolve-halt` · `log-exit` · `poll` — see `RUNBOOK.md`.

## What's deliberately out of scope (v1)

Live broker execution (deferred until after a 30-day shadow-validation period),
real market data (mock provider ships; the interface is built for a drop-in swap),
Telegram registration (runs in dry-run until a bot token is set), and
skill-progression Stages 2–4 (the data model supports them; only Stage 1 has a
working flow).

## Status

Foundation, fully working end-to-end against mock data with tests green and a clean
production build. Activating it (deploy, real feed, Telegram bot registration, live
Routines) is documented in `RUNBOOK.md` and gated on secrets you supply securely.

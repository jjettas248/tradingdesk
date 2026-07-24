import { prisma } from "@/server/db/client";
import { evaluateDrawdown } from "@/server/risk/drawdown-throttle";
import { etDateKey } from "@/lib/time";
import { getEnv } from "@/server/config/env";

export const dynamic = "force-dynamic";

export default async function SlatePage() {
  const dateKey = etDateKey();
  const env = getEnv();

  const [day, equitySnaps, halt, openPositions] = await Promise.all([
    prisma.tradingDay.findUnique({ where: { dateKey } }),
    prisma.equitySnapshot.findMany({ orderBy: { asOf: "asc" } }),
    prisma.riskHaltState.findFirst({ where: { active: true } }),
    prisma.position.findMany({ where: { status: { in: ["AWAITING_FILL", "OPEN"] } }, orderBy: { shortCode: "asc" } }),
  ]);

  const dd = evaluateDrawdown(equitySnaps.length ? equitySnaps.map((e) => e.equityValue) : [env.STARTING_EQUITY]);

  const candidates = day
    ? await prisma.candidate.findMany({
        where: { tradingDayId: day.id, status: { in: ["ARMED", "SENT", "FLAGGED", "EXPIRED"] } },
        include: { ticket: { include: { decision: true } } },
        orderBy: [{ rank: "asc" }, { symbol: "asc" }],
      })
    : [];

  return (
    <>
      <h1>Morning Slate — {dateKey} (ET)</h1>

      {halt && (
        <div className="halt">
          🛑 RISK HALT ACTIVE — drawdown {halt.triggerDrawdownPercent.toFixed(1)}%. No new trades until resolved.
        </div>
      )}

      <div className="panel">
        <strong>Account</strong> · Equity ${dd.currentEquity.toFixed(0)} · Peak ${dd.peakEquity.toFixed(0)} ·
        Drawdown {dd.drawdownPercent.toFixed(1)}% · Risk size ×{dd.multiplier} ({dd.tierLabel})
        <br />
        <span className="muted">
          Scan {day?.scanStatus ?? "PENDING"} · Send {day?.sendStatus ?? "PENDING"} · Armed {day?.ticketsArmed ?? 0} ·
          Entries {day?.entriesLogged ?? 0} · Provider {env.MARKET_DATA_PROVIDER} · LLM {env.ANTHROPIC_API_KEY ? "live" : "stub"} ·
          Telegram {env.TELEGRAM_BOT_TOKEN ? "live" : "dry-run"}
        </span>
      </div>

      <h2>Today&apos;s candidates</h2>
      {candidates.length === 0 ? (
        <p className="muted">No armed candidates yet. Run a morning scan.</p>
      ) : (
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Dir</th>
                <th>Status</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>T1 / T2</th>
                <th>Size</th>
                <th>Max loss</th>
                <th>Decision</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => (
                <tr key={c.id}>
                  <td>{c.rank ?? "—"}</td>
                  <td>{c.symbol}</td>
                  <td>{c.direction}</td>
                  <td><span className={`badge ${c.status.toLowerCase()}`}>{c.status}</span></td>
                  <td>{c.ticket ? `$${c.ticket.entryLow.toFixed(2)}–${c.ticket.entryHigh.toFixed(2)}` : "—"}</td>
                  <td>{c.ticket ? `$${c.ticket.stopPrice.toFixed(2)}` : "—"}</td>
                  <td>{c.ticket ? `$${c.ticket.target1Price.toFixed(2)} / $${c.ticket.target2Price.toFixed(2)}` : "—"}</td>
                  <td>{c.ticket ? `${c.ticket.positionSize} ${c.ticket.sizeUnit === "CONTRACTS" ? "ct" : "sh"}` : "—"}</td>
                  <td>{c.ticket ? `$${c.ticket.maxDollarLoss.toFixed(0)}` : "—"}</td>
                  <td>{c.ticket?.decision?.decisionType ?? <span className="muted">pending</span>}</td>
                  <td><a href={`/journal/${c.id}`}>view</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2>Open positions</h2>
      {openPositions.length === 0 ? (
        <p className="muted">No open positions.</p>
      ) : (
        <div className="panel tablewrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Symbol</th>
                <th>Dir</th>
                <th>Status</th>
                <th>Entry</th>
                <th>Stop</th>
                <th>T1 / T2</th>
              </tr>
            </thead>
            <tbody>
              {openPositions.map((p) => (
                <tr key={p.id}>
                  <td>#{p.shortCode}</td>
                  <td>{p.symbol}</td>
                  <td>{p.direction}</td>
                  <td>{p.status}</td>
                  <td>{p.actualEntryPrice ? `$${p.actualEntryPrice.toFixed(2)}` : "awaiting"}</td>
                  <td>${p.stopPrice.toFixed(2)}</td>
                  <td>${p.target1Price.toFixed(2)} / ${p.target2Price.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
